//! Native playback sidecar.
//!
//! The desktop app renders video in a WebView, which can't decode MKV, HEVC or
//! AC3. Rather than embedding a native player (which would sit as an opaque
//! surface over our UI), we run ffmpeg as a sidecar: it converts the stream into
//! HLS that the existing <video> + hls.js can play, so the whole TVio player UI
//! is preserved.
//!
//! Strategy is remux-first — if the video is already web-friendly we copy it
//! (near-free); only genuinely undecodable video is re-encoded, preferring
//! hardware encoders. Audio is converted to AAC when needed (cheap).
//!
//! ffmpeg is downloaded on first use (an LGPL build) so the installer stays small.

use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

/// LGPL Windows build — no x264/GPL components. Encoding uses hardware
/// encoders or OpenH264, which keeps our licensing obligations light.
const FFMPEG_ZIP: &str =
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip";

/// Video codecs a WebView can decode directly (so we can stream-copy them).
const WEB_VIDEO: [&str; 4] = ["h264", "vp8", "vp9", "av1"];
/// Audio codecs a WebView can decode directly.
const WEB_AUDIO: [&str; 4] = ["aac", "mp3", "opus", "vorbis"];

pub struct Playback(pub Mutex<Inner>);

#[derive(Default)]
pub struct Inner {
    pub child: Option<Child>,
    pub port: u16,
    pub root: Option<PathBuf>,
}

#[derive(Serialize)]
pub struct StreamHandle {
    /// Local URL for the generated HLS playlist.
    pub url: String,
    /// "copy" when we remuxed, "transcode" when we had to re-encode.
    pub mode: String,
}

fn bin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("ffmpeg");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn exe(dir: &PathBuf, name: &str) -> PathBuf {
    dir.join(format!("{name}.exe"))
}

/// Is ffmpeg already downloaded? (Cheap check — never downloads.)
#[tauri::command]
pub fn ffmpeg_ready(app: AppHandle) -> Result<bool, String> {
    let dir = bin_dir(&app)?;
    Ok(exe(&dir, "ffmpeg").exists() && exe(&dir, "ffprobe").exists())
}

/// Downloads + extracts ffmpeg/ffprobe if they aren't present yet, emitting
/// `ffmpeg-progress` (0-100) so the UI can show a quiet prefetch toast.
#[tauri::command]
pub async fn ensure_ffmpeg(app: AppHandle) -> Result<bool, String> {
    let dir = bin_dir(&app)?;
    if exe(&dir, "ffmpeg").exists() && exe(&dir, "ffprobe").exists() {
        return Ok(true);
    }

    let progress_app = app.clone();
    // Blocking download + unzip on a worker thread.
    tauri::async_runtime::spawn_blocking(move || -> Result<bool, String> {
        let res = ureq::get(FFMPEG_ZIP)
            .call()
            .map_err(|e| format!("Couldn't download ffmpeg: {e}"))?;

        let total: u64 = res
            .header("Content-Length")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);

        let mut reader = res.into_reader();
        let mut buf: Vec<u8> = Vec::with_capacity(total as usize);
        let mut chunk = [0u8; 64 * 1024];
        let mut got: u64 = 0;
        let mut last_pct: u8 = 0;

        loop {
            let n = reader.read(&mut chunk).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            buf.extend_from_slice(&chunk[..n]);
            got += n as u64;
            if total > 0 {
                let pct = ((got * 100 / total) as u8).min(99);
                if pct != last_pct {
                    last_pct = pct;
                    let _ = progress_app.emit("ffmpeg-progress", pct);
                }
            }
        }

        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(buf))
            .map_err(|e| format!("Bad ffmpeg archive: {e}"))?;

        for i in 0..zip.len() {
            let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
            let name = entry.name().rsplit('/').next().unwrap_or("").to_string();
            if name == "ffmpeg.exe" || name == "ffprobe.exe" {
                let mut out = fs::File::create(dir.join(&name)).map_err(|e| e.to_string())?;
                std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
            }
        }

        let _ = progress_app.emit("ffmpeg-progress", 100u8);
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Asks ffprobe what's actually inside the stream.
fn probe(dir: &PathBuf, url: &str) -> (String, String) {
    let out = Command::new(exe(dir, "ffprobe"))
        .args([
            "-v", "quiet", "-print_format", "json", "-show_streams", "-analyzeduration", "3000000",
            "-probesize", "3000000", url,
        ])
        .output();

    let mut video = String::new();
    let mut audio = String::new();
    if let Ok(o) = out {
        if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&o.stdout) {
            if let Some(streams) = json["streams"].as_array() {
                for s in streams {
                    let kind = s["codec_type"].as_str().unwrap_or("");
                    let name = s["codec_name"].as_str().unwrap_or("").to_string();
                    if kind == "video" && video.is_empty() {
                        video = name;
                    } else if kind == "audio" && audio.is_empty() {
                        audio = name;
                    }
                }
            }
        }
    }
    (video, audio)
}

/// Picks a hardware encoder when available, else OpenH264 (both LGPL-safe).
fn pick_encoder(dir: &PathBuf) -> String {
    let out = Command::new(exe(dir, "ffmpeg")).args(["-hide_banner", "-encoders"]).output();
    let list = out.map(|o| String::from_utf8_lossy(&o.stdout).to_string()).unwrap_or_default();
    for enc in ["h264_nvenc", "h264_qsv", "h264_amf", "libopenh264"] {
        if list.contains(enc) {
            return enc.to_string();
        }
    }
    "libopenh264".to_string()
}

/// Starts converting `url` into HLS the WebView can play. Returns its local URL.
#[tauri::command]
pub async fn start_stream(
    app: AppHandle,
    state: State<'_, Playback>,
    url: String,
    seek: Option<f64>,
) -> Result<StreamHandle, String> {
    ensure_ffmpeg(app.clone()).await?;
    let dir = bin_dir(&app)?;

    // Tear down anything already running.
    stop_stream(state.clone()).await.ok();

    let (port, root) = {
        let inner = state.0.lock().map_err(|e| e.to_string())?;
        (inner.port, inner.root.clone().ok_or("Playback server not started")?)
    };

    // Fresh working directory per session.
    let id = format!("s{}", std::process::id() as u64 + rand_suffix());
    let out_dir = root.join(&id);
    fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    let (v, a) = probe(&dir, &url);
    let copy_video = WEB_VIDEO.contains(&v.as_str());
    let copy_audio = WEB_AUDIO.contains(&a.as_str());
    let encoder = if copy_video { String::new() } else { pick_encoder(&dir) };

    let mut cmd = Command::new(exe(&dir, "ffmpeg"));
    cmd.args(["-hide_banner", "-loglevel", "error"]);
    if let Some(s) = seek {
        if s > 0.0 {
            cmd.args(["-ss", &s.to_string()]); // seek before input = fast
        }
    }
    cmd.args(["-i", &url]);

    if copy_video {
        cmd.args(["-c:v", "copy"]);
    } else {
        cmd.args(["-c:v", &encoder, "-b:v", "6M", "-g", "96"]);
    }
    if copy_audio {
        cmd.args(["-c:a", "copy"]);
    } else {
        cmd.args(["-c:a", "aac", "-b:a", "192k", "-ac", "2"]);
    }

    cmd.args([
        "-f", "hls",
        "-hls_time", "4",
        "-hls_list_size", "0",
        "-hls_flags", "independent_segments+append_list",
        "-hls_segment_filename",
    ])
    .arg(out_dir.join("seg%05d.ts"))
    .arg(out_dir.join("index.m3u8"))
    .stdout(Stdio::null())
    .stderr(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    let child = cmd.spawn().map_err(|e| format!("Couldn't start ffmpeg: {e}"))?;
    state.0.lock().map_err(|e| e.to_string())?.child = Some(child);

    Ok(StreamHandle {
        url: format!("http://127.0.0.1:{port}/{id}/index.m3u8"),
        mode: if copy_video { "copy".into() } else { "transcode".into() },
    })
}

#[tauri::command]
pub async fn stop_stream(state: State<'_, Playback>) -> Result<(), String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut c) = inner.child.take() {
        let _ = c.kill();
        let _ = c.wait();
    }
    Ok(())
}

fn rand_suffix() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64 % 100_000).unwrap_or(0)
}

/// Serves the HLS working directory over loopback so the WebView can fetch it.
pub fn start_file_server(root: PathBuf) -> std::io::Result<u16> {
    let server = tiny_http::Server::http("127.0.0.1:0")
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
    let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);

    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let rel = request.url().trim_start_matches('/').to_string();
            // Keep it strictly inside the working directory.
            if rel.contains("..") {
                let _ = request.respond(tiny_http::Response::empty(403));
                continue;
            }
            let path = root.join(&rel);
            match fs::File::open(&path) {
                Ok(file) => {
                    let ctype = if rel.ends_with(".m3u8") {
                        "application/vnd.apple.mpegurl"
                    } else {
                        "video/mp2t"
                    };
                    let mut res = tiny_http::Response::from_file(file);
                    if let Ok(h) = tiny_http::Header::from_bytes(&b"Content-Type"[..], ctype.as_bytes()) {
                        res.add_header(h);
                    }
                    if let Ok(h) = tiny_http::Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]) {
                        res.add_header(h);
                    }
                    let _ = request.respond(res);
                }
                Err(_) => {
                    let _ = request.respond(tiny_http::Response::empty(404));
                }
            }
        }
    });

    Ok(port)
}
