package com.uroong.cbt;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 걸려온 전화 알림 — 카카오톡·전화 앱처럼 잠긴 화면을 뚫고 벨이 울리게.
 *
 * 왜 필요한가.
 *  이 앱은 원격 주소(neurumind.com)를 통째로 띄우는 웹뷰다. 웹은 화면이 꺼지면
 *  얼어붙고, 알림 하나 띄우지 못한다. 폴링은 주머니 속에서 죽는다.
 *  전화가 왔다는 사실을 사용자에게 '들리게' 만들 수 있는 건 네이티브뿐이다.
 *
 * 여기서 하는 일은 셋이다.
 *  1) 전화벨이 울리는 전체화면 알림을 띄운다 (잠금화면 위로 뜬다).
 *  2) 받기/거절을 누른 결과를 웹 JS 가 가져갈 수 있게 보관한다 —
 *     실제 통화 연결·종료(/rtc/end)는 웹 쪽 코드가 해야 하기 때문이다.
 *  3) 배터리 최적화 예외를 요청한다. 이게 꺼져 있으면 도즈(잠자기) 상태에서
 *     푸시가 몇 분씩 늦게 도착한다 — 전화의 유통기한은 60초다.
 *
 * 상태를 static 으로 두는 이유: 알림을 띄우는 쪽(CallMessagingService)과
 *  결과를 받는 쪽(MainActivity → 웹뷰)이 서로 다른 컴포넌트라, 프로세스 하나에
 *  공유되는 자리가 필요하다.
 */
@CapacitorPlugin(name = "CallNotification")
public class CallNotificationPlugin extends Plugin {

    static final String CHANNEL_ID = "calls";
    static final String EXTRA_ACTION = "call_action";   // accept | decline | incoming
    static final String EXTRA_CALL_ID = "call_id";

    /** 60초면 접는다 — 서버(rtc.js RING_TIMEOUT)와 같은 시계를 쓴다 */
    private static final long RING_TIMEOUT_MS = 60_000L;

    // 알림 액션으로 앱이 열렸을 때 웹 JS 가 가져갈 결과 (한 번 주면 지운다)
    private static volatile String pendingAction = "";
    private static volatile String pendingCallId = "";

    // 앱이 눈앞에 떠 있으면 알림을 띄우지 않는다 — 웹 수신화면이 이미 뜬다
    private static volatile boolean foreground = false;

    // callId → 알림 번호. 취소할 때 같은 번호를 찾아야 한다
    private static final Map<String, Integer> IDS = new ConcurrentHashMap<>();
    private static final Map<String, Runnable> TIMERS = new ConcurrentHashMap<>();
    private static final Handler H = new Handler(Looper.getMainLooper());

    // ── MainActivity 가 부르는 자리 ────────────────────────────────────

    /** 알림에서 열린 인텐트인가 — 맞으면 결과를 보관하고 그 알림을 지운다 */
    static void handleIntent(Context ctx, Intent intent) {
        if (intent == null) return;
        String act = intent.getStringExtra(EXTRA_ACTION);
        if (act == null || act.isEmpty()) return;
        String id = intent.getStringExtra(EXTRA_CALL_ID);
        pendingAction = act;
        pendingCallId = id == null ? "" : id;
        // 눌린 순간 벨부터 멈춘다. 웹이 뜨는 데 1~2초가 걸리는데
        //  그동안 계속 울리면 사용자는 '안 눌렸다'고 생각하고 또 누른다.
        cancelCall(ctx, pendingCallId);
        // 같은 인텐트를 액티비티가 다시 살아날 때 또 읽지 않도록 지운다
        intent.removeExtra(EXTRA_ACTION);
        intent.removeExtra(EXTRA_CALL_ID);
    }

    static void setForeground(boolean v) { foreground = v; }
    static boolean isForeground() { return foreground; }

    // ── 알림 띄우기 / 지우기 ───────────────────────────────────────────

    /**
     * 전화벨 알림. 전체화면 인텐트라 화면이 꺼져 있으면 그대로 켜지고,
     * 켜져 있으면 위에서 내려오는 헤드업 알림이 된다.
     */
    static void showIncoming(Context ctx, String callId, String peer) {
        if (callId == null || callId.isEmpty()) return;
        ensureChannel(ctx);
        String who = (peer == null || peer.trim().isEmpty()) ? "상담 전화" : peer.trim();
        int id = idOf(callId);

        PendingIntent full = intentFor(ctx, callId, "incoming", id * 4);
        PendingIntent accept = intentFor(ctx, callId, "accept", id * 4 + 1);
        PendingIntent decline = intentFor(ctx, callId, "decline", id * 4 + 2);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_call_notif)
            .setContentTitle(who)
            .setContentText("음성 상담 전화가 왔어요")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)          // 밀어서 지울 수 없게 — 전화는 받거나 끊거나 둘 중 하나다
            .setAutoCancel(true)
            .setOnlyAlertOnce(false)
            .setColor(0xFF4F8A6B)
            .setColorized(true)
            .setContentIntent(full)
            .setFullScreenIntent(full, true)
            .addAction(new NotificationCompat.Action(
                R.drawable.ic_call_decline, tint("거절", 0xFFEA3323), decline))
            .addAction(new NotificationCompat.Action(
                R.drawable.ic_call_notif, tint("받기", 0xFF2E7D4F), accept));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // 프로세스가 죽어 우리 타이머가 사라져도 시스템이 알아서 걷어간다
            b.setTimeoutAfter(RING_TIMEOUT_MS);
        }

        Notification n = b.build();
        // 벨이 한 번 '띵' 하고 끝나면 전화가 아니다. INSISTENT 를 켜면
        //  알림이 취소될 때까지 시스템이 벨소리·진동을 반복한다.
        n.flags |= Notification.FLAG_INSISTENT;

        try {
            NotificationManagerCompat.from(ctx).notify(id, n);
        } catch (Exception ignored) {
            // 안드로이드 13+ 에서 알림 권한이 없으면 여기로 온다 — 앱을 죽이지는 않는다
            return;
        }

        // 발신자가 포기하고 사라진 경우(취소 푸시가 못 온 경우)의 마지막 방어선
        cancelTimer(callId);
        Runnable t = () -> cancelCall(ctx, callId);
        TIMERS.put(callId, t);
        H.postDelayed(t, RING_TIMEOUT_MS);
    }

    /** 알림을 내리고 벨을 멈춘다 (INSISTENT 벨은 알림이 사라져야 그친다) */
    static void cancelCall(Context ctx, String callId) {
        try {
            NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
            if (callId == null || callId.isEmpty()) {
                for (Integer v : IDS.values()) nm.cancel(v);
                IDS.clear();
            } else {
                Integer v = IDS.remove(callId);
                nm.cancel(v == null ? idOf(callId) : v);
            }
        } catch (Exception ignored) {}
        cancelTimer(callId);
    }

    private static void cancelTimer(String callId) {
        if (callId == null || callId.isEmpty()) {
            for (Runnable r : TIMERS.values()) H.removeCallbacks(r);
            TIMERS.clear();
            return;
        }
        Runnable r = TIMERS.remove(callId);
        if (r != null) H.removeCallbacks(r);
    }

    private static int idOf(String callId) {
        Integer v = IDS.get(callId);
        if (v != null) return v;
        // 양수로 고정 — 음수 알림 id 는 일부 기기에서 취소가 어긋난다
        int id = 100_000 + (Math.abs(callId.hashCode()) % 800_000);
        IDS.put(callId, id);
        return id;
    }

    /**
     * 받기·거절 모두 액티비티를 연다.
     *  거절을 브로드캐스트로 조용히 처리하고 싶지만, 서버에 '거절했다'를
     *  알리는 길(/rtc/end)이 웹 JS 안에 있다 — 원격 웹뷰 구조의 대가다.
     *  대신 액티비티가 뜨자마자 웹은 아무 화면도 그리지 않고 끊기만 한다.
     */
    private static PendingIntent intentFor(Context ctx, String callId, String action, int req) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setAction("com.uroong.cbt.CALL_" + action + "_" + callId);  // 인텐트가 뭉개지지 않게
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        i.putExtra(EXTRA_ACTION, action);
        i.putExtra(EXTRA_CALL_ID, callId);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(ctx, req, i, flags);
    }

    /** 액션 글자에 색을 입힌다 — 초록 '받기', 빨강 '거절'. 안 먹는 기기는 그냥 검정 글자 */
    private static CharSequence tint(String label, int color) {
        try {
            SpannableString s = new SpannableString(label);
            s.setSpan(new ForegroundColorSpan(color), 0, s.length(), Spanned.SPAN_INCLUSIVE_INCLUSIVE);
            return s;
        } catch (Exception e) { return label; }
    }

    /**
     * 'calls' 채널 — 일반 알림과 반드시 갈라놔야 한다.
     *  광고 알림이 싫어서 알림을 통째로 끄면 전화도 같이 죽는다.
     *  채널이 따로 있으면 사용자가 '전화만' 남겨둘 수 있다.
     */
    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "전화 수신", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("상담 전화가 걸려올 때 울리는 벨");
        Uri ring = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (ring != null) {
            // USAGE_NOTIFICATION_RINGTONE 이어야 '벨소리 볼륨'을 따라간다.
            //  기본값(알림 볼륨)으로 두면 벨소리를 크게 해둔 사람도 못 듣는다.
            AudioAttributes aa = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .build();
            ch.setSound(ring, aa);
        }
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 700, 600, 700, 600});
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.enableLights(true);
        ch.setShowBadge(true);
        try { nm.createNotificationChannel(ch); } catch (Exception ignored) {}
    }

    // ── 웹 JS 가 부르는 자리 ───────────────────────────────────────────

    /** 알림 액션으로 열렸는지 묻는다. 한 번 가져가면 사라진다(두 번 처리 금지) */
    @PluginMethod
    public void getPendingAction(PluginCall call) {
        JSObject r = new JSObject();
        r.put("action", pendingAction);
        r.put("callId", pendingCallId);
        pendingAction = "";
        pendingCallId = "";
        call.resolve(r);
    }

    /** 통화를 받았거나 상대가 끊었다 — 울리던 알림을 내린다 */
    @PluginMethod
    public void stopRinging(PluginCall call) {
        String id = call.getString("callId", "");
        cancelCall(getContext(), id == null ? "" : id);
        call.resolve();
    }

    /** 지금 배터리 최적화에서 빠져 있나 (빠져 있어야 도즈에서도 푸시가 제때 온다) */
    @PluginMethod
    public void isBatteryExempt(PluginCall call) {
        JSObject r = new JSObject();
        r.put("exempt", exempt());
        call.resolve(r);
    }

    /**
     * 배터리 최적화 예외 요청.
     *  거부해도 앱은 그대로 돈다 — 다만 폰이 깊이 잠들면 전화 알림이 늦는다.
     *  그래서 '한 번만' 묻고 다시 조르지 않는다(조르는 쪽은 웹 JS 가 기억한다).
     */
    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        JSObject r = new JSObject();
        if (exempt()) { r.put("exempt", true); r.put("asked", false); call.resolve(r); return; }
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            r.put("asked", true);
        } catch (Exception e) {
            // 이 화면이 없는 기기(일부 중국 롬)도 있다 — 앱 정보 화면으로라도 보낸다
            try {
                Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                i.setData(Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                r.put("asked", true);
            } catch (Exception e2) { r.put("asked", false); }
        }
        r.put("exempt", false);
        call.resolve(r);
    }

    private boolean exempt() {
        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        } catch (Exception e) { return false; }
    }
}
