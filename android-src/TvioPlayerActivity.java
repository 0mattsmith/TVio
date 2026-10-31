package app.tvio.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;

import androidx.annotation.OptIn;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.TrackNameProvider;
import androidx.media3.ui.TrackSelectionDialogBuilder;

import java.util.Locale;

import java.util.ArrayList;
import java.util.List;

/**
 * Full-screen native player, backed by Media3 ExoPlayer.
 *
 * The whole reason this exists: the WebView uses Chromium's bundled codecs,
 * which have no AC3/E-AC3/DTS audio decoder and no HEVC/MKV support — so a huge
 * share of real sources played as silent video or not at all. ExoPlayer hands
 * decoding to Android's own MediaCodec, and TV hardware is almost always
 * Dolby-licensed, so those formats decode natively.
 *
 * Launched by the NativePlayer Capacitor plugin with a URL, an optional start
 * position and optional subtitle tracks. On exit it returns the final position
 * so the web UI can save "continue watching".
 */
@OptIn(markerClass = UnstableApi.class)
public class TvioPlayerActivity extends Activity {

    private ExoPlayer player;
    private PlayerView playerView;
    private long startMs;
    private LinearLayout overlayControls;
    private ImageButton settingsButton;
    private boolean controlsStyled = false;
    private boolean confirmingExit = false;
    private String sourceTitle;
    private String sourceFilename;
    private long sourceSize;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep the screen awake and go edge to edge.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        immersive();

        Intent intent = getIntent();
        String url = intent.getStringExtra("url");
        String title = intent.getStringExtra("title");
        sourceTitle = title;
        sourceFilename = intent.getStringExtra("filename");
        sourceSize = intent.getLongExtra("sizeBytes", 0L);
        startMs = intent.getLongExtra("startMs", 0L);

        if (url == null || url.isEmpty()) {
            finish();
            return;
        }

        playerView = new PlayerView(this);
        playerView.setKeepContentOnPlayerReset(true);
        playerView.setShowSubtitleButton(true);
        playerView.setLayoutParams(new android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(playerView);

        // Decoder fallback: if the primary (hardware) decoder rejects a stream,
        // try the next one (often a software decoder) instead of just failing —
        // which lets odd/older codecs (MPEG-1/2, VC-1, etc.) play where the device
        // supports them. Prefer bundled extension decoders when present.
        androidx.media3.exoplayer.DefaultRenderersFactory rf =
                new androidx.media3.exoplayer.DefaultRenderersFactory(this)
                        .setEnableDecoderFallback(true)
                        .setExtensionRendererMode(
                                androidx.media3.exoplayer.DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER);
        player = new ExoPlayer.Builder(this, rf).build();
        playerView.setPlayer(player);

        // Pick a sensible default audio track. Without this, ExoPlayer can land
        // on a commentary track, a foreign-language dub, or nothing at all
        // ("None") when the container's default flag is missing. Preferring the
        // user's language (English unless changed) selects the main track.
        String audioLang = intent.getStringExtra("audioLang");
        if (audioLang == null || audioLang.isEmpty()) audioLang = "en";
        player.setTrackSelectionParameters(
                player.getTrackSelectionParameters()
                        .buildUpon()
                        .setPreferredAudioLanguage(audioLang)
                        // Prefer the main programme audio over commentary/description tracks.
                        .setPreferredAudioRoleFlags(C.ROLE_FLAG_MAIN)
                        .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, false)
                        .build());

        MediaItem.Builder mediaBuilder = new MediaItem.Builder().setUri(Uri.parse(url));
        if (title != null) {
            mediaBuilder.setMediaMetadata(
                    new androidx.media3.common.MediaMetadata.Builder().setTitle(title).build());
        }

        List<MediaItem.SubtitleConfiguration> subs = readSubtitles(intent);
        if (!subs.isEmpty()) {
            mediaBuilder.setSubtitleConfigurations(subs);
        }

        player.setMediaItem(mediaBuilder.build());
        if (startMs > 0) {
            player.seekTo(startMs);
        }
        player.setPlayWhenReady(true);
        player.prepare();

        // End → close and report so the web layer can advance Continue Watching
        // and offer the next episode. Prolonged buffering → treat as stuck and
        // hand back a "stalled" flag so the web layer offers another source.
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED && !isFinishing()) {
                    reportAndFinish(false);
                } else if (state == Player.STATE_BUFFERING) {
                    stallHandler.postDelayed(stallRunnable, STALL_MS);
                } else {
                    stallHandler.removeCallbacks(stallRunnable);
                }
            }

            // A decode/extractor/network failure. Surface WHY (error code name +
            // message) so a file that won't play isn't just a frozen black screen,
            // then close back to the app rather than hanging.
            @Override
            public void onPlayerError(androidx.media3.common.PlaybackException error) {
                stallHandler.removeCallbacks(stallRunnable);
                String msg = error.getErrorCodeName();
                if (error.getMessage() != null) msg += " — " + error.getMessage();
                android.widget.Toast.makeText(
                        TvioPlayerActivity.this, "Can't play this file: " + msg, android.widget.Toast.LENGTH_LONG).show();
                if (!isFinishing()) reportAndFinish(false);
            }
        });

        addOverlayControls();
    }

    /** Parallel string arrays from the plugin: subUrls / subLangs / subLabels. */
    private List<MediaItem.SubtitleConfiguration> readSubtitles(Intent intent) {
        List<MediaItem.SubtitleConfiguration> out = new ArrayList<>();
        String[] urls = intent.getStringArrayExtra("subUrls");
        String[] langs = intent.getStringArrayExtra("subLangs");
        String[] labels = intent.getStringArrayExtra("subLabels");
        if (urls == null) return out;

        for (int i = 0; i < urls.length; i++) {
            if (urls[i] == null || urls[i].isEmpty()) continue;
            String lang = langs != null && i < langs.length ? langs[i] : null;
            String label = labels != null && i < labels.length ? labels[i] : lang;
            out.add(new MediaItem.SubtitleConfiguration.Builder(Uri.parse(urls[i]))
                    .setMimeType(guessSubtitleMime(urls[i]))
                    .setLanguage(lang)
                    .setLabel(label)
                    .setSelectionFlags(0)
                    .build());
        }
        return out;
    }

    private String guessSubtitleMime(String url) {
        String lower = url.toLowerCase();
        if (lower.endsWith(".vtt")) return MimeTypes.TEXT_VTT;
        if (lower.endsWith(".ass") || lower.endsWith(".ssa")) return MimeTypes.TEXT_SSA;
        if (lower.endsWith(".ttml") || lower.endsWith(".xml")) return MimeTypes.APPLICATION_TTML;
        return MimeTypes.APPLICATION_SUBRIP; // .srt and anything unknown
    }

    /**
     * Media3's PlayerView ships a subtitle button but not an audio one or an
     * info one, so we add a small top-right control row. It's parented to the
     * controller-visibility listener below so it hides with the rest of the UI
     * rather than staying on screen after the controls fade.
     */
    private void addOverlayControls() {
        FrameLayout overlay = playerView.getOverlayFrameLayout();
        if (overlay == null) return;

        overlayControls = new LinearLayout(this);
        overlayControls.setOrientation(LinearLayout.HORIZONTAL);
        int margin = px(16);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP | Gravity.END);
        lp.setMargins(0, margin, margin, 0);
        overlayControls.setLayoutParams(lp);

        // One settings gear rather than a row of icons — it opens a menu with
        // Speed, Audio and Info, which is where players usually put these.
        settingsButton = iconButton(android.R.drawable.ic_menu_preferences, v -> showSettingsMenu());
        overlayControls.addView(settingsButton);
        overlay.addView(overlayControls);

        // Hide/show the row in lockstep with the player controls, and the first
        // time the controls appear, restyle them (see styleControls).
        playerView.setControllerVisibilityListener(
                (PlayerView.ControllerVisibilityListener) visibility -> {
                    overlayControls.setVisibility(visibility);
                    if (visibility == View.VISIBLE) styleControls();
                });
        // Controls auto-show on start, so try once straight away too.
        playerView.post(this::styleControls);
    }

    private ImageButton iconButton(int icon, View.OnClickListener onClick) {
        ImageButton b = new ImageButton(this);
        b.setImageResource(icon);
        // A soft rounded plate (not a hard square) so the gear stays legible over
        // bright scenes; focus is shown by the teal tint, not a box.
        GradientDrawable plate = new GradientDrawable();
        plate.setColor(0x66000000);
        plate.setCornerRadius(px(24));
        b.setBackground(plate);
        b.setImageTintList(tealFocus());
        int s = px(48);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(s, s);
        lp.setMarginStart(px(8));
        b.setLayoutParams(lp);
        b.setOnClickListener(onClick);
        return b;
    }

    /**
     * Teal when focused/pressed/selected, white otherwise — so a focused control
     * reads as a teal icon rather than the platform's square focus box.
     */
    private ColorStateList tealFocus() {
        int teal = 0xFF14B8A6, white = 0xFFFFFFFF;
        int[][] states = {
                new int[]{android.R.attr.state_focused},
                new int[]{android.R.attr.state_pressed},
                new int[]{android.R.attr.state_selected},
                new int[]{}
        };
        int[] colors = {teal, teal, teal, white};
        return new ColorStateList(states, colors);
    }

    /**
     * Media3's default control buttons draw a square selectable background that
     * shows as a box on a TV when focused. Strip it off every control button and
     * let the teal tint be the only focus cue. Runs once, after Media3 inflates
     * its controller (the settings gear keeps its own rounded plate).
     */
    private void styleControls() {
        if (controlsStyled || playerView == null) return;
        styleButtonsIn(playerView);
        controlsStyled = true;
    }

    private void styleButtonsIn(View v) {
        if (v == settingsButton) return;
        if (v instanceof ImageButton) {
            ImageButton b = (ImageButton) v;
            b.setBackground(null);
            b.setImageTintList(tealFocus());
            return;
        }
        if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) styleButtonsIn(g.getChildAt(i));
        }
    }

    private int px(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density);
    }

    /** The gear menu: Speed, Audio, Info. */
    private void showSettingsMenu() {
        if (player == null) return;
        String[] items = {"Playback speed", "Audio track", "Stream info"};
        new AlertDialog.Builder(this)
                .setItems(items, (dialog, which) -> {
                    if (which == 0) showSpeedMenu();
                    else if (which == 1) showAudioTracks();
                    else showStreamInfo();
                })
                .show();
    }

    private static final float[] SPEEDS = {0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 2.0f};

    private void showSpeedMenu() {
        if (player == null) return;
        String[] labels = {"0.5x", "0.75x", "Normal", "1.25x", "1.5x", "2x"};
        float current = player.getPlaybackParameters().speed;
        int checked = 2; // Normal
        for (int i = 0; i < SPEEDS.length; i++) {
            if (Math.abs(SPEEDS[i] - current) < 0.01f) checked = i;
        }
        new AlertDialog.Builder(this)
                .setTitle("Playback speed")
                .setSingleChoiceItems(labels, checked, (dialog, which) -> {
                    player.setPlaybackParameters(new PlaybackParameters(SPEEDS[which]));
                    dialog.dismiss();
                })
                .show();
    }

    private void showAudioTracks() {
        if (player == null) return;
        new TrackSelectionDialogBuilder(this, "Audio", player, C.TRACK_TYPE_AUDIO)
                .setAllowAdaptiveSelections(false)
                .setTrackNameProvider(this::audioTrackName)
                .build()
                .show();
    }

    /**
     * A distinct, informative label per audio track. Media3's default names come
     * from the container's metadata, so tracks with no language/label collapse to
     * the same generic name — this adds language, role (main vs commentary),
     * channels, codec and bitrate so each is identifiable.
     */
    private String audioTrackName(Format f) {
        StringBuilder sb = new StringBuilder();
        if (f.language != null && !f.language.isEmpty() && !f.language.equals("und")) {
            sb.append(f.language.toUpperCase(Locale.US));
        } else {
            sb.append("Audio");
        }
        if ((f.roleFlags & C.ROLE_FLAG_COMMENTARY) != 0) sb.append(" · Commentary");
        else if ((f.roleFlags & C.ROLE_FLAG_MAIN) != 0) sb.append(" · Main");
        if (f.channelCount > 0) sb.append(" · ").append(channelDesc(f.channelCount));
        if (f.sampleMimeType != null) sb.append(" · ").append(f.sampleMimeType.replace("audio/", "").toUpperCase(Locale.US));
        int b = bitrate(f);
        if (b > 0) sb.append(" · ").append(b / 1000).append(" kbps");
        if (f.label != null && !f.label.isEmpty()) sb.append(" (").append(f.label).append(")");
        return sb.toString();
    }

    private String channelDesc(int ch) {
        switch (ch) {
            case 1: return "Mono";
            case 2: return "Stereo";
            case 6: return "5.1";
            case 8: return "7.1";
            default: return ch + "ch";
        }
    }

    /** Everything we can tell the user about what's actually playing. */
    private void showStreamInfo() {
        if (player == null) return;
        StringBuilder sb = new StringBuilder();
        if (sourceTitle != null && !sourceTitle.isEmpty()) sb.append(sourceTitle).append("\n\n");
        if (sourceFilename != null && !sourceFilename.isEmpty()) sb.append("File: ").append(sourceFilename).append("\n");
        if (sourceSize > 0) sb.append("Size: ").append(humanSize(sourceSize)).append("\n");

        Format v = player.getVideoFormat();
        if (v != null) {
            sb.append("\nVideo: ");
            if (v.width > 0 && v.height > 0) sb.append(v.width).append("x").append(v.height);
            if (v.frameRate > 0) sb.append("  ").append(Math.round(v.frameRate)).append("fps");
            if (v.codecs != null) sb.append("  ").append(v.codecs);
            int vb = bitrate(v);
            if (vb > 0) sb.append("  ").append(vb / 1000).append(" kbps");
            sb.append("\n");
        }

        Format a = player.getAudioFormat();
        if (a != null) {
            sb.append("Audio: ");
            if (a.language != null) sb.append(a.language).append("  ");
            if (a.sampleMimeType != null) sb.append(a.sampleMimeType.replace("audio/", "")).append("  ");
            if (a.channelCount > 0) sb.append(a.channelCount).append("ch  ");
            int ab = bitrate(a);
            if (ab > 0) sb.append(ab / 1000).append(" kbps");
            sb.append("\n");
        }

        new AlertDialog.Builder(this)
                .setTitle("Stream info")
                .setMessage(sb.toString().trim())
                .setPositiveButton("Close", null)
                .show();
    }

    private int bitrate(Format f) {
        if (f.peakBitrate != Format.NO_VALUE) return f.peakBitrate;
        return f.averageBitrate != Format.NO_VALUE ? f.averageBitrate : 0;
    }

    private String humanSize(long bytes) {
        if (bytes >= 1_000_000_000L) return String.format(Locale.US, "%.1f GB", bytes / 1e9);
        return String.format(Locale.US, "%.0f MB", bytes / 1e6);
    }

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    private static final long STALL_MS = 25000;
    private final Handler stallHandler = new Handler(Looper.getMainLooper());
    private final Runnable stallRunnable = () -> {
        if (!isFinishing()) reportAndFinish(true);
    };

    /** Hand the current position (and whether it stalled) back to the web UI. */
    private void reportAndFinish(boolean stalled) {
        stallHandler.removeCallbacks(stallRunnable);
        Intent data = new Intent();
        if (player != null) {
            data.putExtra("positionMs", player.getCurrentPosition());
            data.putExtra("durationMs", player.getDuration());
        }
        data.putExtra("stalled", stalled);
        setResult(Activity.RESULT_OK, data);
        finish();
    }

    @Override
    public void onBackPressed() {
        // Controls visible → just hide them; a stray Back mustn't dump the user
        // out of the stream.
        if (playerView != null && playerView.isControllerFullyVisible()) {
            playerView.hideController();
            return;
        }
        // Controls already hidden → pause and confirm before leaving, so it
        // takes a deliberate second Back (then Exit) to quit.
        if (confirmingExit) return;
        confirmingExit = true;
        if (player != null) player.setPlayWhenReady(false);
        new AlertDialog.Builder(this)
                .setTitle("Stop watching?")
                .setMessage("Are you sure you want to exit the player?")
                .setPositiveButton("Exit", (d, w) -> reportAndFinish(false))
                .setNegativeButton("Keep watching", (d, w) -> resumeFromConfirm())
                .setOnCancelListener(d -> resumeFromConfirm())
                .show();
    }

    private void resumeFromConfirm() {
        confirmingExit = false;
        if (player != null) player.setPlayWhenReady(true);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (player != null) {
            player.setPlayWhenReady(false);
        }
    }

    @Override
    protected void onStop() {
        super.onStop();
        // Leaving the activity by any route reports progress and tears down.
        if (player != null && !isFinishing()) {
            reportAndFinish(false);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        stallHandler.removeCallbacks(stallRunnable);
        if (player != null) {
            player.release();
            player = null;
        }
    }
}
