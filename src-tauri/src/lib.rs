mod app_icon;
mod auth_store;
mod files;
#[cfg(desktop)]
mod legacy_data;
mod netdiag;

use tauri::{Manager, WindowEvent};

/// Hyprland tiles windows itself, so the renderer hides the minimize button there.
#[tauri::command]
fn is_hyprland() -> bool {
    let has = |key: &str| std::env::var(key).map(|v| v.to_lowercase().contains("hyprland")).unwrap_or(false);
    std::env::var_os("HYPRLAND_INSTANCE_SIGNATURE").is_some() || has("XDG_CURRENT_DESKTOP") || has("XDG_SESSION_DESKTOP")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(desktop)]
    legacy_data::move_legacy_dirs();
    let builder = tauri::Builder::default();
    // must be registered first so a second launch exits before touching anything;
    // mobile systems keep a single instance on their own
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build());

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(files::ExportState::default())
        .manage(auth_store::AuthStoreLock::default())
        .setup(|app| {
            // macOS reads the scheme from Info.plist; elsewhere it has to be registered at runtime
            #[cfg(any(target_os = "linux", windows))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(err) = app.deep_link().register_all() {
                    eprintln!("deep link registration failed: {err}");
                }
            }
            let _ = app;
            Ok(())
        })
        .on_window_event(|window, event| {
            // the overlay must not keep the process alive once the player is gone
            if window.label() == "main" && matches!(event, WindowEvent::Destroyed) {
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            is_hyprland,
            netdiag::diagnose_network,
            files::save_dump,
            files::open_export_folder,
            files::open_cache_folder,
            app_icon::set_app_icon,
            auth_store::auth_session_read,
            auth_store::auth_session_write,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
