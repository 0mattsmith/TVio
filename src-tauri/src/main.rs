// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod playback;

use std::sync::Mutex;
use tauri::Manager;

// TVio desktop shell. The web app detects the native runtime via
// `window.__TAURI__` (withGlobalTauri = true) for branding, and
// `window.__TVIO_NATIVE_PLAYER__` — set below — to know that the ffmpeg sidecar
// is available, which unlocks MKV/HEVC/AC3 sources the WebView can't decode.
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(playback::Playback(Mutex::new(playback::Inner::default())))
        .setup(|app| {
            // Working directory for the HLS output, wiped on each launch.
            let root = app.path().app_cache_dir()?.join("stream");
            let _ = std::fs::remove_dir_all(&root);
            std::fs::create_dir_all(&root)?;

            let port = playback::start_file_server(root.clone())?;
            {
                let state: tauri::State<playback::Playback> = app.state();
                let mut inner = state.0.lock().unwrap();
                inner.port = port;
                inner.root = Some(root);
            }

            // Tell the frontend a real player backend exists.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval("window.__TVIO_NATIVE_PLAYER__ = true;");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            playback::ensure_ffmpeg,
            playback::start_stream,
            playback::stop_stream
        ])
        .run(tauri::generate_context!())
        .expect("error while running TVio");
}
