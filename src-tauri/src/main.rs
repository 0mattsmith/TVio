// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// TVio desktop shell. The web app detects the native runtime via
// `window.__TAURI__` (withGlobalTauri = true), which unlocks all-format
// playback and the companion-receiver capabilities.
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .run(tauri::generate_context!())
        .expect("error while running TVio");
}
