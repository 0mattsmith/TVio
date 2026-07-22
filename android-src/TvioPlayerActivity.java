package app.tvio.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
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

        player = new ExoPlayer.Builder(this).build();
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

        // When the episode ends, close automatically and report the final
        // position — the web layer then advances Continue Watching and offers
        // the next episode, rather than the user staring at a paused end frame.
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED && !isFinishing()) {
                    reportAndFinish();
                }
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
        overlayControls.addView(iconButton(android.R.drawable.ic_menu_preferences, v -> showSettingsMenu()));
        overlay.addView(overlayControls);

        // Hide/show the row in lockstep with the player controls.
        playerView.setControllerVisibilityListener(
                (PlayerView.ControllerVisibilityListener) visibility ->
                        overlayControls.setVisibility(visibility));
    }

    private ImageButton iconButton(int icon, View.OnClickListener onClick) {
        ImageButton b = new ImageButton(this);
        b.setImageResource(icon);
        b.setBackgroundColor(0x66000000);
        b.setColorFilter(0xFFFFFFFF);
        int s = px(48);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(s, s);
        lp.setMarginStart(px(8));
        b.setLayoutParams(lp);
        b.setOnClickListener(onClick);
        return b;
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
                .build()
                .show();
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

    /** Hand the current position back so the web UI can store progress. */
    private void reportAndFinish() {
        Intent data = new Intent();
        if (player != null) {
            data.putExtra("positionMs", player.getCurrentPosition());
            data.putExtra("durationMs", player.getDuration());
        }
        setResult(Activity.RESULT_OK, data);
        finish();
    }

    @Override
    public void onBackPressed() {
        reportAndFinish();
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
            reportAndFinish();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (player != null) {
            player.release();
            player = null;
        }
    }
}
