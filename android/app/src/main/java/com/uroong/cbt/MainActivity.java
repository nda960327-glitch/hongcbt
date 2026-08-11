package com.uroong.cbt;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 플러그인 등록은 반드시 super.onCreate 앞 — 웹뷰가 뜨기 전에 다리를 놔야 한다
        registerPlugin(AudioRoutePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
