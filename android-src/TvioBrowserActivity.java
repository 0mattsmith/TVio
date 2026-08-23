package app.tvio.mobile;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.ByteArrayInputStream;

/**
 * A remote-friendly, full-screen web browser (the "globe" feature).
 *
 * It's a plain WebView with a native top bar you can drive with a D-pad —
 * back/forward/reload, an address bar, and a "Play" button — plus two touches
 * that make it pleasant on a TV: it blocks the bulk of ads and pop-ups, and it
 * can hand a page's playing video to TVio's own Media3 player (the same idea as
 * a browser's picture-in-picture / cast), which the standard WebView controls
 * are hopeless to operate with a remote. Pressing the remote's Play key does the
 * same thing.
 *
 * It is content-neutral: it plays whatever page you navigate to, nothing is
 * pre-loaded, and no site is targeted or scraped.
 */
public class TvioBrowserActivity extends Activity {

    private WebView webView;
    private EditText urlBar;
    private ProgressBar progress;
    private FrameLayout customViewContainer;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private volatile String lastMediaUrl = null;

    private static final int MATCH = ViewGroup.LayoutParams.MATCH_PARENT;
    private static final int WRAP = ViewGroup.LayoutParams.WRAP_CONTENT;
    private static final int ACCENT = 0xFF14B8A6;

    // Common ad / tracker / pop-under hosts. Not exhaustive, but it removes the
    // bulk of the ads and pop-ups that make TV web browsing miserable.
    private static final String[] AD_HOSTS = {
        "doubleclick.net", "googlesyndication.com", "google-analytics.com",
        "googleadservices.com", "googletagmanager.com", "googletagservices.com",
        "adservice.google", "2mdn.net", "moatads.com", "scorecardresearch.com",
        "adnxs.com", "adsrvr.org", "taboola.com", "outbrain.com", "criteo.com",
        "criteo.net", "amazon-adsystem.com", "pubmatic.com", "rubiconproject.com",
        "openx.net", "casalemedia.com", "quantserve.com", "zedo.com",
        "popads.net", "popcash.net", "propellerads.com", "propellerclick.com",
        "onclickalgo.com", "onclickmax.com", "exoclick.com", "exosrv.com",
        "juicyads.com", "adsterra.com", "hilltopads.com", "trafficjunky.net",
        "hotjar.com", "connect.facebook.net", "ads.yahoo.com", "adroll.com"
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.BLACK);
        root.setLayoutParams(new ViewGroup.LayoutParams(MATCH, MATCH));
        root.addView(buildTopBar());

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setLayoutParams(new LinearLayout.LayoutParams(MATCH, px(3)));
        root.addView(progress);

        webView = new WebView(this);
        webView.setLayoutParams(new LinearLayout.LayoutParams(MATCH, 0, 1f));
        configureWebView();
        root.addView(webView);

        // A full-screen host for HTML5 <video> that asks to go fullscreen.
        customViewContainer = new FrameLayout(this);
        customViewContainer.setBackgroundColor(Color.BLACK);
        customViewContainer.setVisibility(View.GONE);

        FrameLayout outer = new FrameLayout(this);
        outer.addView(root);
        outer.addView(customViewContainer, new FrameLayout.LayoutParams(MATCH, MATCH));
        setContentView(outer);

        String url = getIntent().getStringExtra("url");
        if (url == null || url.isEmpty()) url = "https://duckduckgo.com";
        urlBar.setText(url);
        webView.loadUrl(url);
    }

    private LinearLayout buildTopBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setBackgroundColor(0xFF14161A);
        bar.setPadding(px(6), px(6), px(6), px(6));
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setLayoutParams(new LinearLayout.LayoutParams(MATCH, WRAP));

        bar.addView(barButton("‹", v -> { if (webView.canGoBack()) webView.goBack(); }));
        bar.addView(barButton("›", v -> { if (webView.canGoForward()) webView.goForward(); }));
        bar.addView(barButton("⟳", v -> webView.reload()));

        urlBar = new EditText(this);
        urlBar.setSingleLine(true);
        urlBar.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        urlBar.setImeOptions(EditorInfo.IME_ACTION_GO);
        urlBar.setTextColor(Color.WHITE);
        urlBar.setHintTextColor(0xFF888888);
        urlBar.setHint("Search or enter address");
        urlBar.setTextSize(14);
        urlBar.setBackgroundColor(0xFF23262B);
        urlBar.setPadding(px(12), px(10), px(12), px(10));
        LinearLayout.LayoutParams ulp = new LinearLayout.LayoutParams(0, WRAP, 1f);
        ulp.setMargins(px(6), 0, px(6), 0);
        urlBar.setLayoutParams(ulp);
        urlBar.setOnEditorActionListener((v, actionId, event) -> {
            navigateFromBar();
            return true;
        });
        bar.addView(urlBar);

        bar.addView(barButton("Go", v -> navigateFromBar()));
        Button play = barButton("▶ Play", v -> playDetectedVideo());
        play.setTextColor(ACCENT);
        bar.addView(play);
        bar.addView(barButton("✕", v -> finish()));
        return bar;
    }

    private Button barButton(String label, View.OnClickListener onClick) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setBackgroundColor(0xFF2A2E34);
        b.setPadding(px(10), px(6), px(10), px(6));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(WRAP, WRAP);
        lp.setMargins(px(3), 0, px(3), 0);
        b.setLayoutParams(lp);
        b.setOnClickListener(onClick);
        b.setFocusable(true);
        return b;
    }

    private void navigateFromBar() {
        String text = urlBar.getText().toString().trim();
        if (text.isEmpty()) return;
        webView.loadUrl(toUrl(text));
        webView.requestFocus();
    }

    /** Mirror of the web toUrl(): an address → https, else a DuckDuckGo search. */
    private String toUrl(String q) {
        if (q.matches("(?i)^https?://.*")) return q;
        if (q.matches("^[^\\s]+\\.[^\\s]{2,}(/.*)?$")) return "https://" + q;
        return "https://duckduckgo.com/?q=" + android.net.Uri.encode(q);
    }

    private void configureWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);
        // Block pop-ups / pop-unders — a big source of streaming-site ads.
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                rememberIfMedia(url);
                if (isAd(url)) {
                    return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
                }
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                // Keep normal web navigation inside the WebView; ignore attempts
                // to fire other apps (intent:, market:, tel:…), which ads abuse.
                return !(url.startsWith("http://") || url.startsWith("https://"));
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                lastMediaUrl = null;
                if (urlBar != null && !urlBar.hasFocus()) urlBar.setText(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (urlBar != null && !urlBar.hasFocus()) urlBar.setText(url);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (progress != null) {
                    progress.setProgress(newProgress);
                    progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
                }
            }

            @Override
            public void onShowCustomView(View v, CustomViewCallback callback) {
                showCustomView(v, callback);
            }

            @Override
            public void onHideCustomView() {
                hideCustomView();
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
                return false; // no pop-ups
            }
        });
    }

    private boolean isAd(String url) {
        String u = url.toLowerCase();
        for (String h : AD_HOSTS) if (u.contains(h)) return true;
        return false;
    }

    /** Remember the last real media URL the page fetched (playlist/file, not a segment). */
    private void rememberIfMedia(String url) {
        String u = url.toLowerCase();
        int q = u.indexOf('?');
        String path = q >= 0 ? u.substring(0, q) : u;
        if (path.endsWith(".m3u8") || path.endsWith(".mpd") || path.endsWith(".mp4") || u.contains(".m3u8")) {
            lastMediaUrl = url;
        }
    }

    /** Detect the page's playing video and hand it to the native TVio player. */
    private void playDetectedVideo() {
        if (webView == null) return;
        webView.evaluateJavascript(
            "(function(){var v=document.querySelector('video');return v?(v.currentSrc||v.src||''):'';})()",
            value -> {
                String src = unquote(value);
                String target = (src != null && src.startsWith("http")) ? src : lastMediaUrl;
                if (target == null || target.isEmpty()) {
                    Toast.makeText(this, "No playable video detected on this page.", Toast.LENGTH_SHORT).show();
                    return;
                }
                Intent i = new Intent(this, TvioPlayerActivity.class);
                i.putExtra("url", target);
                i.putExtra("title", webView.getTitle() != null ? webView.getTitle() : "");
                i.putExtra("audioLang", "en");
                startActivity(i);
            });
    }

    private String unquote(String jsonString) {
        if (jsonString == null || jsonString.equals("null")) return null;
        String s = jsonString;
        if (s.length() >= 2 && s.startsWith("\"") && s.endsWith("\"")) {
            s = s.substring(1, s.length() - 1);
        }
        return s.replace("\\/", "/").replace("\\\"", "\"");
    }

    private void showCustomView(View v, WebChromeClient.CustomViewCallback cb) {
        if (customView != null) { cb.onCustomViewHidden(); return; }
        customView = v;
        customViewCallback = cb;
        customViewContainer.addView(v, new FrameLayout.LayoutParams(MATCH, MATCH));
        customViewContainer.setVisibility(View.VISIBLE);
    }

    private void hideCustomView() {
        if (customView == null) return;
        customViewContainer.removeView(customView);
        customViewContainer.setVisibility(View.GONE);
        customView = null;
        if (customViewCallback != null) customViewCallback.onCustomViewHidden();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            int k = event.getKeyCode();
            if (k == KeyEvent.KEYCODE_MEDIA_PLAY || k == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
                playDetectedVideo();
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onBackPressed() {
        if (customView != null) { hideCustomView(); return; }
        if (webView != null && webView.canGoBack()) { webView.goBack(); return; }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
    }

    private int px(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density);
    }
}
