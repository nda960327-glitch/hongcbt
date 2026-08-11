package com.uroong.cbt;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 알림 설정 화면 열기.
 *
 * 안드로이드 13부터 알림 권한은 사용자가 팝업에서 직접 눌러야 한다.
 * 앱이 대신 켜줄 방법은 없다 — OS 가 막는다.
 * 그런데 한 번 '거부'를 누르면 그 팝업은 다시 뜨지 않는다.
 * 그때부터 사용자는 설정 앱을 뒤져야 하는데, 그 길을 아는 사람은 거의 없다.
 * 그래서 앱 안의 버튼 하나로 그 화면까지 데려다준다 — 거기서 스위치만 켜면 된다.
 *
 * 전화가 안 울리는 상담사와, 답장이 안 오는 내담자를 만드는 건
 * 대개 이 한 번의 '거부'다.
 */
@CapacitorPlugin(name = "AppSettings")
public class AppSettingsPlugin extends Plugin {

    /** 이 앱의 알림 설정 화면을 연다. 안 되면 앱 정보 화면으로라도 보낸다. */
    @PluginMethod
    public void openNotifications(PluginCall call) {
        JSObject r = new JSObject();
        try {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            r.put("ok", true);
            call.resolve(r);
            return;
        } catch (Exception ignored) {}
        // 기기에 따라 위 화면이 없을 수 있다 — 앱 정보로 가면 거기에도 '알림'이 있다
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            r.put("ok", true);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    /** 안드로이드 13+ 인가 — 13부터 알림이 '런타임 권한'이 됐다 */
    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject();
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("runtimeNotifPermission", Build.VERSION.SDK_INT >= 33);
        call.resolve(r);
    }
}
