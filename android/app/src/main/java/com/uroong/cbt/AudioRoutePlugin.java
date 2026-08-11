package com.uroong.cbt;

import android.content.Context;
import android.media.AudioManager;
import android.os.PowerManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 통화 오디오 라우팅 — 웹으로는 절대 안 되던 것.
 *
 * 브라우저에서는 WebRTC 소리가 무조건 스피커로 나간다. 조용한 곳이 아니면
 * 상담 내용이 주변에 다 들리고, 귀에 대고 통화할 수가 없었다.
 * 네이티브에서는 AudioManager 로 통화 모드를 잡고 수화기/스피커를 고를 수 있다.
 *
 * 또 하나: 통화 중 귀에 대면 화면이 꺼져야 볼로 버튼이 눌리지 않는다(근접 센서).
 */
@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin {

    private PowerManager.WakeLock proximityLock;
    private int savedMode = AudioManager.MODE_NORMAL;

    private AudioManager audio() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    /** 통화 시작 — 통화 모드로 바꾸고 기본은 수화기(귀에 대고)로 보낸다. */
    @PluginMethod
    public void startCall(PluginCall call) {
        AudioManager am = audio();
        if (am == null) { call.reject("no-audio-manager"); return; }
        try {
            savedMode = am.getMode();
            // MODE_IN_COMMUNICATION 이어야 에코 제거가 통화용으로 돌고,
            //  볼륨 키가 '통화 볼륨'을 조절한다 (미디어 볼륨이 아니라).
            am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            boolean speaker = Boolean.TRUE.equals(call.getBoolean("speaker", false));
            am.setSpeakerphoneOn(speaker);
            setProximity(true);
            JSObject r = new JSObject();
            r.put("ok", true);
            r.put("speaker", speaker);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    /** 통화 중 스피커 ↔ 수화기 전환 */
    @PluginMethod
    public void setSpeaker(PluginCall call) {
        AudioManager am = audio();
        if (am == null) { call.reject("no-audio-manager"); return; }
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        try {
            if (am.getMode() != AudioManager.MODE_IN_COMMUNICATION) {
                am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            }
            am.setSpeakerphoneOn(on);
            // 스피커를 켜면 얼굴에서 떼고 쓰는 것이니 화면은 살려둔다
            setProximity(!on);
            JSObject r = new JSObject();
            r.put("on", am.isSpeakerphoneOn());
            call.resolve(r);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    /** 통화 종료 — 원래 오디오 상태로 되돌린다. 안 되돌리면 음악·알림이 이상해진다. */
    @PluginMethod
    public void endCall(PluginCall call) {
        AudioManager am = audio();
        try {
            setProximity(false);
            if (am != null) {
                am.setSpeakerphoneOn(false);
                am.setMode(savedMode);
            }
        } catch (Exception ignored) {}
        call.resolve();
    }

    /** 지금 스피커인지 */
    @PluginMethod
    public void isSpeakerOn(PluginCall call) {
        AudioManager am = audio();
        JSObject r = new JSObject();
        r.put("on", am != null && am.isSpeakerphoneOn());
        call.resolve(r);
    }

    // 근접 센서로 화면 끄기 — 귀에 댔을 때 뺨으로 버튼이 눌리는 것을 막는다
    private void setProximity(boolean on) {
        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            if (on) {
                if (proximityLock == null) {
                    if (!pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) return;
                    proximityLock = pm.newWakeLock(
                        PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "uroong:call");
                    proximityLock.setReferenceCounted(false);
                }
                if (!proximityLock.isHeld()) proximityLock.acquire(60 * 60 * 1000L); // 최대 1시간
            } else if (proximityLock != null && proximityLock.isHeld()) {
                proximityLock.release();
            }
        } catch (Exception ignored) {}
    }

    @Override
    protected void handleOnDestroy() {
        // 앱이 죽어도 오디오 모드가 통화 상태로 남지 않게
        try {
            setProximity(false);
            AudioManager am = audio();
            if (am != null && am.getMode() == AudioManager.MODE_IN_COMMUNICATION) {
                am.setSpeakerphoneOn(false);
                am.setMode(AudioManager.MODE_NORMAL);
            }
        } catch (Exception ignored) {}
        super.handleOnDestroy();
    }
}
