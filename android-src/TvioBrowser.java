package app.tvio.mobile;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge between the web UI and the native TV web browser (TvioBrowserActivity).
 *
 *   open({ url }) → launches the full-screen WebView browser at that URL. It has
 *                   a remote-friendly address bar, ad/tracker blocking, and a
 *                   "Play in TVio" hand-off that plays a page's video in the
 *                   native Media3 player.
 */
@CapacitorPlugin(name = "TvioBrowser")
public class TvioBrowser extends Plugin {

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("A url is required.");
            return;
        }
        Intent intent = new Intent(getContext(), TvioBrowserActivity.class);
        intent.putExtra("url", url);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }
}
