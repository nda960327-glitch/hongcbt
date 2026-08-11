package com.uroong.cbt;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * FCM 수신 — 전화 푸시만 가로채고 나머지는 그대로 흘려보낸다.
 *
 * 왜 플러그인 클래스를 상속하나.
 *  Capacitor 푸시 플러그인도 MESSAGING_EVENT 를 노리는 서비스를 하나 갖고 있다.
 *  같은 인텐트를 노리는 서비스가 둘이면 어느 쪽이 받을지 기기마다 달라진다 —
 *  운에 맡길 수 없다. 그래서 플러그인 서비스는 매니페스트에서 떼어내고(tools:node="remove"),
 *  그 클래스를 상속한 이 서비스 하나만 남겼다.
 *  super 를 그대로 부르므로 기존 웹 JS 의 알림 이벤트·토큰 갱신은 손대지 않아도 산다.
 *
 * 전화 푸시는 본문(notification) 없이 data 만 온다. 본문을 실으면 안드로이드가
 *  시스템 트레이 알림으로 대신 그려버려서, 앱이 가로챌 기회 자체가 없다.
 *  data-only 라야 앱이 꺼져 있어도 이 함수가 깨어난다(우선순위 high).
 */
public class CallMessagingService extends MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        try {
            Map<String, String> d = remoteMessage.getData();
            if (d != null && "call".equals(d.get("act"))) {
                String kind = d.get("kind");
                String callId = d.get("callId");
                if ("cancel".equals(kind)) {
                    // 발신자가 끊었다 — 울리는 폰을 멈춰야 한다.
                    //  callId 가 없으면(옛 서버) 울리던 것 전부를 내린다.
                    CallNotificationPlugin.cancelCall(getApplicationContext(), callId == null ? "" : callId);
                } else if (callId != null && !callId.isEmpty()) {
                    // 벨을 울리기 전에 두 가지를 본다.
                    //  ① 로그아웃한 기기인가 — 서버에서 구독을 지우는 게 1차 방어지만,
                    //    그 요청은 네트워크가 없으면 못 나가고 앱을 지웠다 깐 토큰은
                    //    아무도 지워주지 않는다. 넘겨준 폰에서 남의 상담 전화가 울리는
                    //    사고의 마지막 안전망이 이 도장이다(도장이 없는 폰은 예전처럼 울린다).
                    //  ② 앱이 이미 눈앞에 떠 있는가 — 웹 수신화면이 이미 뜨므로
                    //    알림까지 띄우면 같은 전화가 두 번 울리는 꼴이 된다.
                    if (CallNotificationPlugin.isSignedIn(getApplicationContext())
                        && !CallNotificationPlugin.isForeground()) {
                        CallNotificationPlugin.showIncoming(getApplicationContext(), callId, d.get("peer"));
                    }
                }
            }
        } catch (Exception ignored) {
            // 알림 하나 못 띄운다고 푸시 경로 전체를 죽이지는 않는다
        }
        // 웹 JS 쪽 리스너(pushNotificationReceived)는 그대로 받아야 한다 —
        //  앱이 떠 있을 때는 그 쪽이 서버에 다시 물어 수신화면을 띄운다.
        super.onMessageReceived(remoteMessage);
    }
}
