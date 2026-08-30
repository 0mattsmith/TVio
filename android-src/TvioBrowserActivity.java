package app.tvio.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
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

    private LinearLayout topBar;
    private boolean autoPromptDone = false;
    private boolean firstLoad = true;
    private long lastBackAt = 0;
    private Runnable pendingSingleBack;
    private final Handler uiHandler = new Handler(Looper.getMainLooper());
    private static final long DOUBLE_BACK_MS = 500;

    // D-pad cursor (BrowseHere-style). Active while the WebView holds focus;
    // driving it up to the top hands control back to the toolbar.
    private FrameLayout outer;
    private View cursorView;
    private float cursorX, cursorY;
    private boolean cursorMode = false;
    private boolean cursorInit = false;

    // "Player only": strip a single-player page down to just its player.
    private boolean isolate = false;
    private static final String ISOLATE_JS =
        "(function(){try{" +
        "function ar(e){var r=e.getBoundingClientRect();return r.width*r.height;}" +
        "function big(e){var r=e.getBoundingClientRect();return r.width>120&&r.height>80;}" +
        "var v=[].slice.call(document.querySelectorAll('video')).filter(big);var t=null;" +
        "if(v.length){v.sort(function(a,b){return ar(b)-ar(a);});t=v[0];}" +
        "else{var f=[].slice.call(document.querySelectorAll('iframe')).filter(big);if(f.length){f.sort(function(a,b){return ar(b)-ar(a);});t=f[0];}}" +
        "if(!t)return 'none';" +
        "if(!document.getElementById('tvio-iso-style')){var s=document.createElement('style');s.id='tvio-iso-style';s.textContent='html,body{margin:0!important;padding:0!important;background:#000!important;overflow:hidden!important;height:100%!important;width:100%!important;}';(document.head||document.documentElement).appendChild(s);}" +
        "var n=t;while(n&&n.parentElement){var p=n.parentElement;var k=p.children;for(var i=0;i<k.length;i++){var c=k[i];if(c!==n&&c.id!=='tvio-iso-style'&&!c.contains(t)){c.style.setProperty('display','none','important');}}if(p===document.body||p===document.documentElement)break;p.style.setProperty('display','block','important');p.style.setProperty('position','static','important');p.style.setProperty('width','100%','important');p.style.setProperty('height','100%','important');p.style.setProperty('max-width','none','important');p.style.setProperty('max-height','none','important');p.style.setProperty('margin','0','important');p.style.setProperty('padding','0','important');n=p;}" +
        // Keep the player in place (so its controls survive) and just make it fill.
        "t.style.setProperty('width','100%','important');t.style.setProperty('height','100vh','important');t.style.setProperty('max-width','none','important');t.style.setProperty('max-height','none','important');t.style.setProperty('margin','0','important');" +
        "if(t.tagName==='VIDEO'){t.style.setProperty('object-fit','contain','important');t.style.setProperty('background','#000','important');}" +
        "return 'ok';}catch(e){return 'err';}})();";

    // Address bar edits only after you press OK on it; a held direction glides
    // the cursor with an accelerating (steep) ramp.
    private boolean urlEditing = false;
    private int heldKey = 0;
    private long heldStart = 0;
    private final Runnable cursorTick = new Runnable() {
        @Override
        public void run() {
            if (heldKey == 0 || !cursorMode) return;
            stepCursor(heldKey, cursorSpeed(SystemClock.uptimeMillis() - heldStart));
            uiHandler.postDelayed(this, 16);
        }
    };

    // "Hide banners & navbars" (lighter than isolate), and a D-pad "TV navigation"
    // mode that turns the page's links/buttons into remote-navigable targets.
    private boolean hideChrome = false;
    private boolean tvNavMode = false;
    private boolean prefTvNav = false;   // which page mode the user last chose
    private boolean tvNavInjected = false;
    private Runnable okLong;
    private boolean okConsumedLong = false;

    private static final String HIDE_CHROME_JS =
        "(function(){try{" +
        "var s='header,nav,[role=banner],[role=navigation],.navbar,.nav-bar,.site-header,.masthead,.banner,[class*=cookie],[id*=cookie],[class*=consent],[id*=consent],[class*=advert],[id*=advert],[class*=newsletter]';" +
        "document.querySelectorAll(s).forEach(function(e){if(!e.querySelector('video'))e.style.setProperty('display','none','important');});" +
        "Array.prototype.forEach.call(document.querySelectorAll('body *'),function(e){var c=getComputedStyle(e);if((c.position==='fixed'||c.position==='sticky')&&!e.querySelector('video')){var r=e.getBoundingClientRect();if(r.height>0&&r.height<window.innerHeight*0.35&&(r.top<=2||Math.abs(r.bottom-window.innerHeight)<=2))e.style.setProperty('display','none','important');}});" +
        "return 'ok';}catch(e){return 'err';}})();";

    private static final String TVNAV_JS =
        "(function(){if(window.__tvnav){window.__tvnav.enable();return 'on';}" +
        "var C='a[href],button,input,select,textarea,[role=button],[onclick],[tabindex],video';var cur=null;" +
        "function vis(e){var r=e.getBoundingClientRect();if(r.width<8||r.height<8)return false;var c=getComputedStyle(e);return !(c.visibility==='hidden'||c.display==='none'||c.opacity==='0');}" +
        "function cands(){return Array.prototype.slice.call(document.querySelectorAll(C)).filter(vis);}" +
        "function hi(e){if(cur){cur.style.outline='';cur.style.outlineOffset='';}cur=e;if(cur){cur.style.outline='3px solid #14b8a6';cur.style.outlineOffset='2px';cur.scrollIntoView({block:'center',inline:'center',behavior:'smooth'});}}" +
        "function first(){var c=cands();if(!c.length)return null;c.sort(function(a,b){var x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return (x.top-y.top)||(x.left-y.left);});return c[0];}" +
        "function move(d){var c=cands();if(!c.length)return;if(!cur||c.indexOf(cur)<0){hi(first());return;}var cr=cur.getBoundingClientRect();var ax=cr.left+cr.width/2,ay=cr.top+cr.height/2;var best=null,bs=1e12;c.forEach(function(e){if(e===cur)return;var r=e.getBoundingClientRect();var ex=r.left+r.width/2,ey=r.top+r.height/2;var dx=ex-ax,dy=ey-ay;var ok=false,al=0,ac=0;if(d==='right'){ok=dx>4;al=dx;ac=Math.abs(dy);}else if(d==='left'){ok=dx<-4;al=-dx;ac=Math.abs(dy);}else if(d==='down'){ok=dy>4;al=dy;ac=Math.abs(dx);}else{ok=dy<-4;al=-dy;ac=Math.abs(dx);}if(!ok)return;var sc=al+ac*2;if(sc<bs){bs=sc;best=e;}});if(best)hi(best);}" +
        "function click(){if(!cur)return;if(cur.tagName==='VIDEO'){if(cur.paused)cur.play();else cur.pause();return;}if(cur.focus)cur.focus();cur.click();}" +
        "window.__tvnav={enable:function(){if(!cur||cands().indexOf(cur)<0)hi(first());},disable:function(){if(cur){cur.style.outline='';}cur=null;},move:move,click:click};" +
        "window.__tvnav.enable();return 'on';})();";

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

    // When opened as a Live TV web channel, its name replaces the address bar.
    private String channelName;

    // Element-picker ("Customise"): load the page, let the user tick blocks to
    // hide, and hand the chosen CSS selectors back to the web app. hideSpec is a
    // newline-joined selector list re-applied on a normal open of a channel.
    private boolean pickMode = false;
    private String hideSpec = null;
    private LinearLayout pickList;
    private final java.util.LinkedHashSet<String> pickChosen = new java.util.LinkedHashSet<>();

    // Enumerate the "chrome-ish" blocks worth offering to hide: structural
    // regions, common banner/cookie/ad/sidebar class names, and anything pinned
    // (fixed/sticky). Each becomes { sel: <stable CSS path>, label: <readable> }.
    private static final String PICK_ENUM_JS =
        "(function(){try{" +
        "function esc(s){return (window.CSS&&CSS.escape)?CSS.escape(s):s;}" +
        "function vis(e){var r=e.getBoundingClientRect();if(r.width<40||r.height<16)return false;var c=getComputedStyle(e);return c.visibility!=='hidden'&&c.display!=='none';}" +
        "function path(e){if(e.id&&document.querySelectorAll('#'+esc(e.id)).length===1)return '#'+esc(e.id);" +
        "var parts=[];var n=e;var depth=0;" +
        "while(n&&n.nodeType===1&&n.tagName.toLowerCase()!=='html'&&depth<6){var t=n.tagName.toLowerCase();" +
        "if(n.id){parts.unshift('#'+esc(n.id));break;}" +
        "var p=n.parentElement;if(!p){parts.unshift(t);break;}" +
        "var same=[].slice.call(p.children).filter(function(c){return c.tagName===n.tagName;});" +
        "parts.unshift(same.length>1?(t+':nth-of-type('+(same.indexOf(n)+1)+')'):t);" +
        "n=p;depth++;}return parts.join(' > ');}" +
        "function label(e){var t=e.tagName.toLowerCase();var id=e.id?('#'+e.id):'';" +
        "var cl=(typeof e.className==='string'&&e.className.trim())?('.'+e.className.trim().split(/\\s+/).slice(0,2).join('.')):'';" +
        "var txt=(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,42);" +
        "var tag='<'+t+id+cl+'>';return txt?(tag+' — '+txt):tag;}" +
        "var out=[];var seen=new Set();" +
        "function add(e){if(!e||seen.has(e)||!vis(e))return;seen.add(e);var s=path(e);if(s)out.push({sel:s,label:label(e)});}" +
        // Named regions, common ad/widget/comment/modal/media containers, and
        // media embeds — the obvious things to hide.
        "var sels='header,nav,footer,aside,section,article,form,dialog,figure,iframe,embed,object,video,canvas,ins,[role=banner],[role=navigation],[role=complementary],[role=contentinfo],[role=dialog],[role=alertdialog],.navbar,.nav-bar,.site-header,.masthead,.banner,.sidebar,.side-bar,.widget,.social,.share,.newsletter,.subscribe,.related,.recommended,.comments,.comment,.modal,.overlay,.paywall,.chat,[class*=cookie],[id*=cookie],[class*=consent],[id*=consent],[class*=advert],[id*=advert],[class*=promo],[id*=promo],[class*=popup],[id*=popup],[class*=sponsor],[class*=ads],[id*=ads],[class*=widget],[class*=related],[class*=recommend],[class*=comment],[class*=footer],[id*=footer],[class*=subscribe],[class*=signup],[class*=newsletter],[class*=paywall],[class*=notif],[class*=overlay],[class*=modal],[id*=modal]';" +
        "[].slice.call(document.querySelectorAll(sels)).forEach(add);" +
        // Anything pinned (fixed/sticky) — floating bars, sticky headers, chat bubbles.
        "[].slice.call(document.querySelectorAll('body *')).forEach(function(e){var c=getComputedStyle(e);if(c.position==='fixed'||c.position==='sticky'){var r=e.getBoundingClientRect();if(r.width>40&&r.height>12)add(e);}});" +
        // Every reasonably large block (5%-90% of the screen), so the user can hide
        // whole content sections too — this is where the extra choices come from.
        "var vw=window.innerWidth,vh=window.innerHeight,area=vw*vh;" +
        "[].slice.call(document.querySelectorAll('main,section,article,aside,div,ul,ol,form,figure')).forEach(function(e){var r=e.getBoundingClientRect();var a=r.width*r.height;if(a>=area*0.05&&a<=area*0.9&&r.height>=40&&r.width>=100)add(e);});" +
        "return out.slice(0,80);}catch(e){return [];}})();";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        channelName = getIntent().getStringExtra("channelName");
        pickMode = getIntent().getBooleanExtra("pickMode", false);
        hideSpec = getIntent().getStringExtra("hide");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.BLACK);
        root.setLayoutParams(new ViewGroup.LayoutParams(MATCH, MATCH));
        root.addView(pickMode ? buildPickBar() : buildTopBar());

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

        outer = new FrameLayout(this);
        outer.addView(root);
        outer.addView(customViewContainer, new FrameLayout.LayoutParams(MATCH, MATCH));
        setContentView(outer);

        createCursor();
        if (pickMode) addPickPanel();
        // Cursor is shown exactly while the page (WebView) has focus — but not in
        // the element picker, where the native checklist owns the D-pad.
        webView.setOnFocusChangeListener((v, hasFocus) -> {
            if (pickMode) return;
            if (hasFocus) enterPageMode();
            else exitPageModes();
        });

        isolate = getIntent().getBooleanExtra("isolate", false);
        hideChrome = getIntent().getBooleanExtra("hideChrome", false);
        String url = getIntent().getStringExtra("url");
        if (url == null || url.isEmpty()) url = "https://duckduckgo.com";
        if (urlBar != null) urlBar.setText(url);
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

        if (channelName != null && !channelName.isEmpty()) {
            // Opened as a Live TV web channel — no address bar, just its name.
            android.widget.TextView label = new android.widget.TextView(this);
            label.setText(channelName);
            label.setTextColor(Color.WHITE);
            label.setTextSize(15);
            label.setSingleLine(true);
            label.setEllipsize(android.text.TextUtils.TruncateAt.END);
            label.setPadding(px(12), px(10), px(12), px(10));
            LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(0, WRAP, 1f);
            llp.setMargins(px(6), 0, px(6), 0);
            label.setLayoutParams(llp);
            bar.addView(label);
        } else {
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
            urlBar.setCursorVisible(false);
            urlBar.setShowSoftInputOnFocus(false); // no keyboard merely from D-pad focus
            urlBar.setOnFocusChangeListener((v, hasFocus) -> { if (!hasFocus && urlEditing) exitUrlEdit(); });
            LinearLayout.LayoutParams ulp = new LinearLayout.LayoutParams(0, WRAP, 1f);
            ulp.setMargins(px(6), 0, px(6), 0);
            urlBar.setLayoutParams(ulp);
            urlBar.setOnEditorActionListener((v, actionId, event) -> {
                navigateFromBar();
                return true;
            });
            bar.addView(urlBar);
            bar.addView(barButton("Go", v -> navigateFromBar()));
        }
        Button play = barButton("▶ Play", v -> manualCheck());
        play.setTextColor(ACCENT);
        bar.addView(play);
        bar.addView(barButton("✕", v -> confirmQuit()));
        topBar = bar;
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
        if (q.matches("(?i)^(https?|file|content)://.*") || q.startsWith("data:")) return q;
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
        // Allow opening a user-picked local page (file:// / content://).
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);

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
                autoPromptDone = false;
                if (urlBar != null && !urlBar.hasFocus()) urlBar.setText(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (urlBar != null && !urlBar.hasFocus()) urlBar.setText(url);
                // Element picker: build the checklist from the loaded page, then stop
                // (no auto-play / isolate / nav helpers in this mode).
                if (pickMode) {
                    uiHandler.postDelayed(() -> populatePickList(), 500);
                    return;
                }
                // Re-apply this channel's saved "hidden elements" (from Customise…),
                // twice, to catch blocks that mount a beat after load.
                if (hideSpec != null && !hideSpec.isEmpty()) {
                    uiHandler.postDelayed(() -> applyHiddenSelectors(), 500);
                    uiHandler.postDelayed(() -> applyHiddenSelectors(), 2000);
                }
                // Start the user in the page content, not stuck in the toolbar.
                if (firstLoad) { firstLoad = false; webView.requestFocus(); }
                // Give a late-loading player a moment, then offer to play, once.
                uiHandler.postDelayed(() -> maybeAutoPrompt(), 1500);
                // "Player only" channels: strip the page to its player (twice, to
                // catch a player that mounts a beat after load).
                if (isolate) {
                    uiHandler.postDelayed(() -> applyIsolate(), 800);
                    uiHandler.postDelayed(() -> applyIsolate(), 2500);
                }
                if (hideChrome) {
                    uiHandler.postDelayed(() -> applyHideChrome(), 600);
                    uiHandler.postDelayed(() -> applyHideChrome(), 2000);
                }
                if (tvNavMode) {
                    tvNavInjected = false; // fresh page — re-install the nav helper
                    uiHandler.postDelayed(() -> {
                        if (tvNavMode && webView != null) { webView.evaluateJavascript(TVNAV_JS, null); tvNavInjected = true; }
                    }, 700);
                }
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

    /** Resolve the page's playable video URL (JS currentSrc, else sniffed media), or null. */
    private void resolveVideo(android.webkit.ValueCallback<String> cb) {
        if (webView == null) { cb.onReceiveValue(null); return; }
        webView.evaluateJavascript(
            "(function(){var v=document.querySelector('video');return v?(v.currentSrc||v.src||''):'';})()",
            value -> {
                String src = unquote(value);
                String target = (src != null && src.startsWith("http")) ? src : lastMediaUrl;
                cb.onReceiveValue(target != null && !target.isEmpty() ? target : null);
            });
    }

    /** Toolbar "Play" / remote Play key: check the page for a video and offer it. */
    private void manualCheck() {
        resolveVideo(target -> {
            if (target == null) Toast.makeText(this, "No playable video detected on this page.", Toast.LENGTH_SHORT).show();
            else promptPlay(target);
        });
    }

    /** On page load: if a video is present, offer once to play it in our player. */
    private void maybeAutoPrompt() {
        if (autoPromptDone || isFinishing()) return;
        resolveVideo(target -> {
            if (target == null || autoPromptDone || isFinishing()) return;
            autoPromptDone = true;
            promptPlay(target);
        });
    }

    private void promptPlay(String target) {
        new AlertDialog.Builder(this)
            .setTitle("Play in TVio?")
            .setMessage("A video was found on this page. Play it in the TVio player?")
            .setPositiveButton("OK", (d, w) -> playTarget(target))
            .setNegativeButton("Cancel", null)
            .show();
    }

    private void playTarget(String target) {
        Intent i = new Intent(this, TvioPlayerActivity.class);
        i.putExtra("url", target);
        i.putExtra("title", webView != null && webView.getTitle() != null ? webView.getTitle() : "");
        i.putExtra("audioLang", "en");
        startActivity(i);
    }

    /** "Player only": collapse a single-player page down to just its player. */
    private void applyIsolate() {
        if (isolate && webView != null) webView.evaluateJavascript(ISOLATE_JS, null);
    }

    private void applyHideChrome() {
        if (hideChrome && webView != null) webView.evaluateJavascript(HIDE_CHROME_JS, null);
    }

    // --- page interaction modes (cursor vs TV navigation) --------------------

    private void enterPageMode() {
        if (prefTvNav) enterTvNav();
        else enterCursor();
    }

    private void enterCursor() {
        tvNavMode = false;
        if (tvNavInjected && webView != null) webView.evaluateJavascript("window.__tvnav&&window.__tvnav.disable()", null);
        enterCursorMode();
    }

    private void enterTvNav() {
        cursorMode = false;
        stopCursorHold();
        if (cursorView != null) cursorView.setVisibility(View.GONE);
        tvNavMode = true;
        if (webView != null) { webView.evaluateJavascript(TVNAV_JS, null); tvNavInjected = true; }
    }

    private void exitPageModes() {
        tvNavMode = false;
        if (tvNavInjected && webView != null) webView.evaluateJavascript("window.__tvnav&&window.__tvnav.disable()", null);
        exitCursorMode();
    }

    private void togglePageMode() {
        prefTvNav = !prefTvNav;
        enterPageMode();
        Toast.makeText(this, prefTvNav ? "TV navigation" : "Cursor", Toast.LENGTH_SHORT).show();
    }

    private void okShortClick() {
        if (tvNavMode) {
            if (webView != null) webView.evaluateJavascript("window.__tvnav&&window.__tvnav.click()", null);
        } else if (cursorMode) {
            clickAtCursor();
        }
    }

    private void jsNav(String dir) {
        if (webView != null) webView.evaluateJavascript("window.__tvnav&&window.__tvnav.move('" + dir + "')", null);
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
        int k = event.getKeyCode();
        boolean down = event.getAction() == KeyEvent.ACTION_DOWN;

        // Element picker: let native focus walk the checklist and toggle boxes.
        if (pickMode) return super.dispatchKeyEvent(event);

        if (down && (k == KeyEvent.KEYCODE_MEDIA_PLAY || k == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)) {
            manualCheck();
            return true;
        }

        // While typing an address, Back leaves edit mode (not the browser);
        // everything else goes to the field as normal.
        if (urlEditing) {
            if (k == KeyEvent.KEYCODE_BACK) { if (down) exitUrlEdit(); return true; }
            return super.dispatchKeyEvent(event);
        }

        // The address bar is highlightable like a button until you click into it:
        // Left/Right hop between toolbar items, OK starts editing, Down drops into
        // the page. Never let a mere focus move the caret or raise the keyboard.
        if (urlBar != null && urlBar.hasFocus()) {
            if (k == KeyEvent.KEYCODE_DPAD_CENTER || k == KeyEvent.KEYCODE_ENTER) {
                if (down) enterUrlEdit();
                return true;
            }
            if (isDpad(k)) {
                if (down) {
                    if (k == KeyEvent.KEYCODE_DPAD_DOWN) focusContent();
                    else if (k == KeyEvent.KEYCODE_DPAD_LEFT) moveFocus(View.FOCUS_LEFT);
                    else if (k == KeyEvent.KEYCODE_DPAD_RIGHT) moveFocus(View.FOCUS_RIGHT);
                    // Up: stay on the address bar.
                }
                return true;
            }
        }

        // From the toolbar, Down drops back into the page and its cursor.
        if (down && k == KeyEvent.KEYCODE_DPAD_DOWN && isToolbarFocused()) {
            focusContent();
            return true;
        }

        boolean pageFocused = cursorMode || tvNavMode;

        // OK: a tap acts in the current mode; a long press toggles cursor ↔ TV
        // navigation (so you can switch if one gets stuck on an awkward page).
        if (pageFocused && (k == KeyEvent.KEYCODE_DPAD_CENTER || k == KeyEvent.KEYCODE_ENTER)) {
            if (down) {
                if (event.getRepeatCount() == 0) {
                    okConsumedLong = false;
                    okLong = () -> { okConsumedLong = true; togglePageMode(); };
                    uiHandler.postDelayed(okLong, 600);
                }
            } else {
                if (okLong != null) uiHandler.removeCallbacks(okLong);
                if (!okConsumedLong) okShortClick();
                okConsumedLong = false;
            }
            return true;
        }

        // Cursor mode: hold a direction to glide (accelerating).
        if (cursorMode && isDpad(k)) {
            if (down) {
                if (heldKey != k) {
                    heldKey = k;
                    heldStart = SystemClock.uptimeMillis();
                    stepCursor(k, px(14)); // a tiny nudge, so a tap barely moves
                    uiHandler.removeCallbacks(cursorTick);
                    uiHandler.postDelayed(cursorTick, 350); // glide kicks in when held
                }
            } else if (heldKey == k) {
                stopCursorHold();
            }
            return true;
        }

        // TV navigation mode: the D-pad walks between the page's links/buttons.
        if (tvNavMode && isDpad(k)) {
            if (down) {
                if (k == KeyEvent.KEYCODE_DPAD_UP) jsNav("up");
                else if (k == KeyEvent.KEYCODE_DPAD_DOWN) jsNav("down");
                else if (k == KeyEvent.KEYCODE_DPAD_LEFT) jsNav("left");
                else jsNav("right");
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    private boolean isDpad(int k) {
        return k == KeyEvent.KEYCODE_DPAD_UP || k == KeyEvent.KEYCODE_DPAD_DOWN
                || k == KeyEvent.KEYCODE_DPAD_LEFT || k == KeyEvent.KEYCODE_DPAD_RIGHT;
    }

    private void moveFocus(int direction) {
        if (urlBar == null) return;
        View next = urlBar.focusSearch(direction);
        if (next != null) next.requestFocus();
    }

    private void stopCursorHold() {
        heldKey = 0;
        uiHandler.removeCallbacks(cursorTick);
    }

    /** Pixels-per-frame for the cursor: small at first, then a steep ramp. */
    private float cursorSpeed(long heldMs) {
        float t = Math.max(0f, (heldMs - 350) / 1000f); // seconds held beyond the tap
        // Cubic ramp: very gentle at first (fine control), then climbs steeply.
        return Math.min(px(44), px(3) + px(120) * t * t * t);
    }

    private void enterUrlEdit() {
        urlEditing = true;
        urlBar.setCursorVisible(true);
        urlBar.selectAll();
        InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (imm != null) imm.showSoftInput(urlBar, InputMethodManager.SHOW_IMPLICIT);
    }

    private void exitUrlEdit() {
        urlEditing = false;
        if (urlBar != null) {
            urlBar.setCursorVisible(false);
            urlBar.setSelection(0);
            InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
            if (imm != null) imm.hideSoftInputFromWindow(urlBar.getWindowToken(), 0);
        }
    }

    private void createCursor() {
        cursorView = new View(this);
        int size = px(22);
        GradientDrawable dot = new GradientDrawable();
        dot.setShape(GradientDrawable.OVAL);
        dot.setColor(0xFFFFFFFF);
        dot.setStroke(px(2), ACCENT);
        cursorView.setBackground(dot);
        cursorView.setElevation(px(8));
        cursorView.setLayoutParams(new FrameLayout.LayoutParams(size, size));
        cursorView.setVisibility(View.GONE);
        outer.addView(cursorView);
    }

    private void enterCursorMode() {
        cursorMode = true;
        if (cursorView == null) return;
        if (!cursorInit && webView.getWidth() > 0) {
            cursorX = webView.getWidth() / 2f;
            cursorY = webView.getHeight() / 2f;
            cursorInit = true;
        }
        cursorView.setVisibility(View.VISIBLE);
        positionCursor();
    }

    private void exitCursorMode() {
        cursorMode = false;
        stopCursorHold();
        if (cursorView != null) cursorView.setVisibility(View.GONE);
    }

    private void stepCursor(int k, float speed) {
        if (webView == null) return;
        int w = webView.getWidth(), h = webView.getHeight();
        if (k == KeyEvent.KEYCODE_DPAD_LEFT) {
            cursorX = Math.max(0, cursorX - speed);
        } else if (k == KeyEvent.KEYCODE_DPAD_RIGHT) {
            cursorX = Math.min(w, cursorX + speed);
        } else if (k == KeyEvent.KEYCODE_DPAD_DOWN) {
            cursorY += speed;
            if (cursorY > h) { cursorY = h; webView.scrollBy(0, (int) speed); }
        } else if (k == KeyEvent.KEYCODE_DPAD_UP) {
            cursorY -= speed;
            if (cursorY <= 0) {
                cursorY = 0;
                if (webView.getScrollY() > 0) {
                    webView.scrollBy(0, -(int) speed); // more page above — scroll up
                } else {
                    stopCursorHold();
                    focusToolbar(); // at the very top → hand off to the address bar
                    return;
                }
            }
        }
        positionCursor();
    }

    private void positionCursor() {
        if (cursorView == null || webView == null) return;
        cursorView.setX(cursorX - cursorView.getWidth() / 2f);
        cursorView.setY(webView.getTop() + cursorY - cursorView.getHeight() / 2f);
    }

    private void clickAtCursor() {
        if (webView == null) return;
        long t = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, cursorX, cursorY, 0);
        MotionEvent up = MotionEvent.obtain(t, t + 60, MotionEvent.ACTION_UP, cursorX, cursorY, 0);
        webView.dispatchTouchEvent(down);
        webView.dispatchTouchEvent(up);
        down.recycle();
        up.recycle();
    }

    // Back is a focus/exit control here (web history lives on the ‹ › buttons):
    //   single Back        → drop focus into the page content (never stuck in a
    //                        site's own nav or the toolbar)
    //   double Back        → step up a level: content → toolbar, toolbar → quit
    // A fullscreen HTML5 video collapses first, before any of this.
    @Override
    public void onBackPressed() {
        if (customView != null) { hideCustomView(); return; }
        if (pickMode) { finishPick(false); return; }
        long now = System.currentTimeMillis();
        if (now - lastBackAt < DOUBLE_BACK_MS) {
            lastBackAt = 0;
            if (pendingSingleBack != null) { uiHandler.removeCallbacks(pendingSingleBack); pendingSingleBack = null; }
            handleDoubleBack();
            return;
        }
        lastBackAt = now;
        pendingSingleBack = () -> { pendingSingleBack = null; focusContent(); };
        uiHandler.postDelayed(pendingSingleBack, DOUBLE_BACK_MS);
    }

    private void handleDoubleBack() {
        if (isToolbarFocused()) confirmQuit();
        else focusToolbar();
    }

    private boolean isToolbarFocused() {
        return topBar != null && topBar.findFocus() != null;
    }

    private void focusContent() {
        if (webView != null) webView.requestFocus();
    }

    private void focusToolbar() {
        if (topBar != null && topBar.getChildCount() > 0) topBar.getChildAt(0).requestFocus();
    }

    private void confirmQuit() {
        new AlertDialog.Builder(this)
            .setTitle("Close the browser?")
            .setMessage("Return to TVio?")
            .setPositiveButton("Close", (d, w) -> finish())
            .setNegativeButton("Keep browsing", (d, w) -> focusContent())
            .show();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
    }

    // --- element picker ("Customise…") --------------------------------------

    private LinearLayout buildPickBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setBackgroundColor(0xFF14161A);
        bar.setPadding(px(8), px(6), px(8), px(6));
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setLayoutParams(new LinearLayout.LayoutParams(MATCH, WRAP));

        android.widget.TextView t = new android.widget.TextView(this);
        t.setText("Tick anything to hide");
        t.setTextColor(Color.WHITE);
        t.setTextSize(15);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(0, WRAP, 1f);
        tp.setMargins(px(6), 0, px(6), 0);
        t.setLayoutParams(tp);
        bar.addView(t);

        Button done = barButton("Done", v -> finishPick(true));
        done.setTextColor(ACCENT);
        bar.addView(done);
        bar.addView(barButton("Cancel", v -> finishPick(false)));
        topBar = bar;
        return bar;
    }

    /** The right-hand checklist panel, overlaid on the live page preview. */
    private void addPickPanel() {
        android.widget.ScrollView sv = new android.widget.ScrollView(this);
        int w = (int) (getResources().getDisplayMetrics().widthPixels * 0.42f);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, MATCH);
        lp.gravity = Gravity.END;
        sv.setLayoutParams(lp);
        sv.setBackgroundColor(0xF00E0F12);
        sv.setPadding(px(10), px(10), px(10), px(10));
        pickList = new LinearLayout(this);
        pickList.setOrientation(LinearLayout.VERTICAL);
        pickList.setLayoutParams(new FrameLayout.LayoutParams(MATCH, WRAP));
        android.widget.TextView hint = new android.widget.TextView(this);
        hint.setText("Loading page…");
        hint.setTextColor(0xFFBBBBBB);
        hint.setPadding(px(6), px(8), px(6), px(8));
        pickList.addView(hint);
        sv.addView(pickList);
        outer.addView(sv);
    }

    private void populatePickList() {
        if (webView == null || pickList == null) return;
        webView.evaluateJavascript(PICK_ENUM_JS, value -> {
            pickList.removeAllViews();
            java.util.List<String[]> items = parsePickItems(value);
            if (items.isEmpty()) {
                android.widget.TextView e = new android.widget.TextView(this);
                e.setText("Nothing obvious to hide here.");
                e.setTextColor(0xFFBBBBBB);
                e.setPadding(px(6), px(10), px(6), px(10));
                pickList.addView(e);
                return;
            }
            for (String[] it : items) addPickRow(it[0], it[1]);
            if (pickList.getChildCount() > 0) pickList.getChildAt(0).requestFocus();
        });
    }

    private void addPickRow(String sel, String label) {
        android.widget.CheckBox cb = new android.widget.CheckBox(this);
        cb.setText(label);
        cb.setTextColor(Color.WHITE);
        cb.setTextSize(14);
        cb.setPadding(px(8), px(10), px(6), px(10));
        cb.setButtonTintList(android.content.res.ColorStateList.valueOf(ACCENT));
        cb.setChecked(pickChosen.contains(sel));
        cb.setOnFocusChangeListener((v, f) -> { if (f) highlightSel(sel); });
        cb.setOnCheckedChangeListener((v, checked) -> {
            if (checked) pickChosen.add(sel); else pickChosen.remove(sel);
            setSelHidden(sel, checked);
        });
        cb.setLayoutParams(new LinearLayout.LayoutParams(MATCH, WRAP));
        pickList.addView(cb);
    }

    /** Outline the focused row's element(s) on the page so the user sees them. */
    private void highlightSel(String sel) {
        if (webView == null) return;
        String js = "(function(){try{" +
            "if(window.__tvHi){window.__tvHi.forEach(function(e){e.style.outline='';e.style.outlineOffset='';});}" +
            "window.__tvHi=[];document.querySelectorAll(" + jsStr(sel) + ").forEach(function(e){" +
            "e.style.setProperty('outline','3px solid #14b8a6','important');e.style.setProperty('outline-offset','2px','important');window.__tvHi.push(e);});" +
            "if(window.__tvHi[0])window.__tvHi[0].scrollIntoView({block:'center',behavior:'smooth'});" +
            "}catch(e){}})();";
        webView.evaluateJavascript(js, null);
    }

    private void setSelHidden(String sel, boolean hide) {
        if (webView == null) return;
        String js = "(function(){try{document.querySelectorAll(" + jsStr(sel) + ").forEach(function(e){" +
            (hide ? "e.style.setProperty('display','none','important');" : "e.style.removeProperty('display');") +
            "});}catch(e){}})();";
        webView.evaluateJavascript(js, null);
    }

    /** Re-apply a channel's saved hidden selectors on a normal open. */
    private void applyHiddenSelectors() {
        if (hideSpec == null || hideSpec.isEmpty() || webView == null) return;
        String js = "(function(){try{" + jsStr(hideSpec) + ".split('\\n').forEach(function(sel){sel=sel.trim();if(!sel)return;" +
            "try{document.querySelectorAll(sel).forEach(function(e){e.style.setProperty('display','none','important');});}catch(e){}});" +
            "}catch(e){}})();";
        webView.evaluateJavascript(js, null);
    }

    private void finishPick(boolean ok) {
        Intent data = new Intent();
        if (ok) {
            StringBuilder sb = new StringBuilder();
            for (String s : pickChosen) { if (sb.length() > 0) sb.append('\n'); sb.append(s); }
            data.putExtra("selectors", sb.toString());
            setResult(Activity.RESULT_OK, data);
        } else {
            setResult(Activity.RESULT_CANCELED);
        }
        finish();
    }

    private java.util.List<String[]> parsePickItems(String value) {
        java.util.List<String[]> out = new java.util.ArrayList<>();
        if (value == null || value.equals("null")) return out;
        String json = value;
        try {
            if (json.startsWith("\"")) json = new org.json.JSONTokener(json).nextValue().toString();
            org.json.JSONArray arr = new org.json.JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                org.json.JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                String sel = o.optString("sel", "");
                String label = o.optString("label", sel);
                if (!sel.isEmpty()) out.add(new String[]{sel, label});
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    /** A safe JS string literal for a value we inject into evaluateJavascript. */
    private String jsStr(String s) {
        return org.json.JSONObject.quote(s == null ? "" : s);
    }

    private int px(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density);
    }
}
