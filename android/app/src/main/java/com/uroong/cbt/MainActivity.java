package com.uroong.cbt;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 플러그인 등록은 반드시 super.onCreate 앞 — 웹뷰가 뜨기 전에 다리를 놔야 한다
        registerPlugin(AudioRoutePlugin.class);
        // 알림을 한 번 거부한 사람을 설정 화면까지 데려다주는 문
        registerPlugin(AppSettingsPlugin.class);
        // 걸려온 전화 알림(받기·거절)의 결과를 웹 JS 로 넘겨주는 다리
        registerPlugin(CallNotificationPlugin.class);
        super.onCreate(savedInstanceState);
        // 채널은 첫 전화가 오기 전에 만들어 둔다. 알림이 도착한 뒤에 만들면
        //  그 첫 알림만 기본 채널 설정(작은 소리)으로 뜨는 기기가 있다.
        CallNotificationPlugin.ensureChannel(this);
        onCallIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // launchMode=singleTask 라 앱이 살아 있으면 새 액티비티가 아니라 여기로 온다
        onCallIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        // 앱이 눈앞에 있는 동안에는 알림을 띄우지 않는다 — 웹 수신화면이 그 일을 한다
        CallNotificationPlugin.setForeground(true);
    }

    @Override
    public void onPause() {
        CallNotificationPlugin.setForeground(false);
        super.onPause();
    }

    /**
     * 전화 알림에서 열렸는가.
     *  맞으면 잠금화면 위로 이 화면을 띄우고 화면을 켠다 — 전화 앱이 하는 그것이다.
     *  평소 실행에서는 반드시 꺼둔다. 켜둔 채로 두면 잠긴 폰을 주운 사람에게
     *  상담 내용이 그대로 보인다.
     */
    private void onCallIntent(Intent intent) {
        boolean isCall = intent != null && intent.getStringExtra(CallNotificationPlugin.EXTRA_ACTION) != null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            try {
                setShowWhenLocked(isCall);
                setTurnScreenOn(isCall);
            } catch (Exception ignored) {}
        }
        if (isCall) CallNotificationPlugin.handleIntent(this, intent);
    }
}
