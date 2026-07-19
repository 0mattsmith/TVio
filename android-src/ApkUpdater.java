package app.tvio.mobile;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Sideloaded APK self-update for TVio (Android + Android TV).
 *
 * Android never allows a non-system app to install silently, so the flow is:
 *   downloadAndInstall() → downloads to app-private storage (no permissions),
 *   exposes it via FileProvider, then fires the install intent. The OS shows
 *   its "install unknown apps" toggle once, then its install confirmation.
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdater extends Plugin {

    /** Has the user allowed TVio to install APKs? (Always true below Android 8.) */
    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean allowed = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            allowed = getContext().getPackageManager().canRequestPackageInstalls();
        }
        JSObject ret = new JSObject();
        ret.put("allowed", allowed);
        call.resolve(ret);
    }

    /** Sends the user to the one-time "install unknown apps" setting for TVio. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent i = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    /** Downloads the APK (emitting progress) and hands it to the system installer. */
    @PluginMethod
    public void downloadAndInstall(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("A 'url' is required");
            return;
        }

        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection conn = null;
                try {
                    File out = new File(getContext().getExternalFilesDir(null), "tvio-update.apk");
                    if (out.exists() && !out.delete()) {
                        call.reject("Couldn't clear the previous download");
                        return;
                    }

                    conn = (HttpURLConnection) new URL(url).openConnection();
                    conn.setInstanceFollowRedirects(true);
                    conn.setConnectTimeout(20000);
                    conn.setReadTimeout(60000);
                    conn.connect();

                    int total = conn.getContentLength();
                    InputStream in = conn.getInputStream();
                    FileOutputStream fos = new FileOutputStream(out);

                    byte[] buf = new byte[8192];
                    long done = 0;
                    int read;
                    int lastPct = -1;
                    while ((read = in.read(buf)) != -1) {
                        fos.write(buf, 0, read);
                        done += read;
                        if (total > 0) {
                            int pct = (int) (done * 100L / total);
                            if (pct != lastPct) {
                                lastPct = pct;
                                JSObject p = new JSObject();
                                p.put("progress", pct);
                                notifyListeners("downloadProgress", p);
                            }
                        }
                    }
                    fos.flush();
                    fos.close();
                    in.close();

                    Uri uri = FileProvider.getUriForFile(
                            getContext(),
                            getContext().getPackageName() + ".fileprovider",
                            out);

                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setDataAndType(uri, "application/vnd.android.package-archive");
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);

                    call.resolve();
                } catch (Exception e) {
                    call.reject("Update failed: " + e.getMessage());
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }
        }).start();
    }
}
