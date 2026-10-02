package com.uroong.cbt;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;

/**
 * 다른 앱에서 '공유'로 넘어온 것 받기.
 *
 * 카카오톡에서 "대화 내용 내보내기 → 텍스트 메시지만 저장"을 누르면 공유 목록이 뜬다.
 * 그 목록에 이 앱이 없으면 사용자는 파일을 메일이나 드라이브에 보냈다가 다시 찾아 올려야 한다 —
 * 보통 사람은 거기서 포기한다(2026-10-03 실제로 그랬다).
 * 그래서 이 앱이 목록에 뜨게 하고(AndroidManifest 의 SEND 필터), 받은 글·사진을 웹 화면에 넘긴다.
 *
 *  · 글 파일(.txt)·글 → 대화 분석 화면에 바로 들어간다 (js/sharein.js → js/talkcheck.js)
 *  · 사진(캡처) → 글자 읽기로 간다 (js/imgtext.js)
 *
 * 받은 내용은 메모리에만 잠깐 들고 있다가 웹이 가져가면(take) 지운다. 파일로 남기지 않는다.
 */
@CapacitorPlugin(name = "ShareIn")
public class ShareInPlugin extends Plugin {
    private static final int MAX_BYTES = 4 * 1024 * 1024;   // 한 개에 4MB 까지
    private static final int MAX_ITEMS = 5;
    private static JSArray pending = null;
    private static ShareInPlugin instance = null;

    @Override
    public void load() {
        instance = this;
    }

    /** 액티비티가 받은 인텐트를 본다 — 공유로 온 것이면 내용을 읽어 둔다. */
    public static void handleIntent(Activity act, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;
        JSArray items = new JSArray();
        try {
            ArrayList<Uri> uris = new ArrayList<>();
            if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (list != null) uris.addAll(list);
            } else {
                Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (u != null) uris.add(u);
            }
            ContentResolver cr = act.getContentResolver();
            for (Uri u : uris) {
                if (items.length() >= MAX_ITEMS) break;
                String mime = cr.getType(u);
                if (mime == null) mime = intent.getType() == null ? "" : intent.getType();
                String name = nameOf(cr, u);
                byte[] data = read(cr, u);
                if (data == null) continue;
                JSObject o = new JSObject();
                o.put("name", name);
                o.put("mime", mime);
                boolean isText = mime.startsWith("text/") || name.toLowerCase().endsWith(".txt");
                if (isText) {
                    o.put("kind", "text");
                    o.put("text", new String(data, StandardCharsets.UTF_8));
                } else if (mime.startsWith("image/")) {
                    o.put("kind", "image");
                    o.put("data", Base64.encodeToString(data, Base64.NO_WRAP));
                } else continue;
                items.put(o);
            }
            // 파일 없이 글만 공유한 경우(메시지 길게 눌러 공유 등)
            if (items.length() == 0) {
                CharSequence t = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
                if (t != null && t.length() > 0) {
                    JSObject o = new JSObject();
                    o.put("kind", "text");
                    o.put("name", "");
                    o.put("mime", "text/plain");
                    o.put("text", t.toString());
                    items.put(o);
                }
            }
        } catch (Exception ignored) {}
        // 같은 인텐트를 화면 회전·재시작 때 또 읽지 않게 한다
        intent.setAction(Intent.ACTION_MAIN);
        intent.removeExtra(Intent.EXTRA_STREAM);
        intent.removeExtra(Intent.EXTRA_TEXT);
        if (items.length() == 0) return;
        pending = items;
        // 앱이 이미 떠 있으면 웹에 '왔다'고 알린다. 처음 켜지는 중이면 웹이 뜨면서 take 로 가져간다.
        if (instance != null) {
            try { instance.notifyListeners("share", new JSObject(), true); } catch (Exception ignored) {}
        }
    }

    private static String nameOf(ContentResolver cr, Uri u) {
        String name = "";
        try (Cursor c = cr.query(u, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (i >= 0) name = c.getString(i);
            }
        } catch (Exception ignored) {}
        if (name == null || name.isEmpty()) {
            String p = u.getLastPathSegment();
            name = p == null ? "" : p;
        }
        return name;
    }

    private static byte[] read(ContentResolver cr, Uri u) {
        try (InputStream in = cr.openInputStream(u)) {
            if (in == null) return null;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16 * 1024];
            int n, total = 0;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > MAX_BYTES) break;       // 너무 크면 앞부분까지만(대화 파일은 보통 훨씬 작다)
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        } catch (Exception e) {
            return null;
        }
    }

    /** 받아 둔 것을 웹에 넘기고 지운다. 없으면 빈 목록. */
    @PluginMethod
    public void take(PluginCall call) {
        JSObject r = new JSObject();
        r.put("items", pending == null ? new JSArray() : pending);
        pending = null;
        call.resolve(r);
    }
}
