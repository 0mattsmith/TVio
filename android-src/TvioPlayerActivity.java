package app.tvio.mobile;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageButton;

import androidx.annotation.OptIn;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.TrackSelectionDialogBuilder;

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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep the screen awake and go edge to edge.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        immersive();

        Intent intent = getIntent();
        String url = intent.getStringExtra("url");
        String title = intent.getStringExtra("title");
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

        addAudioTrackButton();
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
     * Media3's PlayerView ships a subtitle button but not an audio one, so we
     * add a small button that opens the track picker for audio — the whole point
     * of the native player for dual-audio releases.
     */
    private void addAudioTrackButton() {
        ImageButton button = new ImageButton(this);
        button.setImageResource(android.R.drawable.ic_lock_silent_mode_off);
        button.setBackgroundColor(0x66000000);
        button.setColorFilter(0xFFFFFFFF);
        int size = (int) (48 * getResources().getDisplayMetrics().density);
        android.widget.FrameLayout.LayoutParams lp =
                new android.widget.FrameLayout.LayoutParams(size, size, android.view.Gravity.TOP | android.view.Gravity.END);
        int margin = (int) (16 * getResources().getDisplayMetrics().density);
        lp.setMargins(0, margin, margin, 0);
        button.setLayoutParams(lp);
        button.setOnClickListener(v -> showAudioTracks());
        if (playerView.getOverlayFrameLayout() != null) {
            playerView.getOverlayFrameLayout().addView(button);
        }
    }

    private void showAudioTracks() {
        if (player == null) return;
        new TrackSelectionDialogBuilder(
                this, "Audio", player, C.TRACK_TYPE_AUDIO)
                .setAllowAdaptiveSelections(false)
                .build()
                .show();
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
