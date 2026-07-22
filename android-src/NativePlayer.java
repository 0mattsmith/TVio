package app.tvio.mobile;

import android.content.Intent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Bridge between the web UI and the native ExoPlayer activity.
 *
 *   isAvailable() → lets the web app unlock native playback (and stop hiding
 *                   MKV/HEVC/AC3 sources) only when this plugin is really here.
 *   play()        → launches the full-screen player and, when it closes,
 *                   resolves with the final position for "continue watching".
 */
@CapacitorPlugin(name = "NativePlayer")
public class NativePlayer extends Plugin {

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("A stream url is required.");
            return;
        }

        Intent intent = new Intent(getContext(), TvioPlayerActivity.class);
        intent.putExtra("url", url);
        intent.putExtra("title", call.getString("title", ""));
        // getDouble avoids the int overflow a long runtime in ms could hit.
        intent.putExtra("startMs", (long) (double) call.getDouble("startMs", 0.0));
        intent.putExtra("audioLang", call.getString("audioLang", "en"));
        intent.putExtra("filename", call.getString("filename", ""));
        intent.putExtra("sizeBytes", (long) (double) call.getDouble("sizeBytes", 0.0));

        // Subtitles arrive as [{ url, lang, label }]; flatten to parallel arrays
        // the Activity can read back out of the Intent.
        JSArray subs = call.getArray("subtitles", null);
        if (subs != null) {
            List<String> urls = new ArrayList<>();
            List<String> langs = new ArrayList<>();
            List<String> labels = new ArrayList<>();
            try {
                for (Object o : subs.toList()) {
                    JSONObject s = (JSONObject) o;
                    urls.add(s.optString("url", ""));
                    langs.add(s.optString("lang", ""));
                    labels.add(s.optString("label", s.optString("lang", "")));
                }
            } catch (Exception ignored) {
                // Malformed subtitle list — play without external subs rather than fail.
            }
            intent.putExtra("subUrls", urls.toArray(new String[0]));
            intent.putExtra("subLangs", langs.toArray(new String[0]));
            intent.putExtra("subLabels", labels.toArray(new String[0]));
        }

        startActivityForResult(call, intent, "onPlayerClosed");
    }

    @ActivityCallback
    private void onPlayerClosed(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        long positionMs = 0;
        long durationMs = 0;
        boolean stalled = false;
        if (result != null && result.getData() != null) {
            positionMs = result.getData().getLongExtra("positionMs", 0);
            durationMs = result.getData().getLongExtra("durationMs", 0);
            stalled = result.getData().getBooleanExtra("stalled", false);
        }
        ret.put("positionMs", positionMs);
        ret.put("durationMs", durationMs);
        ret.put("stalled", stalled);
        call.resolve(ret);
    }
}
