//! Diagnostic dump export and folder shortcuts from the settings screens.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// Last file the user exported, so "show in folder" highlights it.
#[derive(Default)]
pub struct ExportState(Mutex<Option<PathBuf>>);

#[derive(Deserialize)]
pub struct SaveDumpInput {
    filename: String,
    content: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SaveDumpResult {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    canceled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tauri::command]
pub async fn save_dump(app: AppHandle, state: State<'_, ExportState>, input: SaveDumpInput) -> Result<SaveDumpResult, ()> {
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(&input.filename)
        .add_filter("JSON", &["json"]);
    if let Ok(downloads) = app.path().download_dir() {
        dialog = dialog.set_directory(downloads);
    }
    // mobile pickers are system activities with no parent window
    #[cfg(desktop)]
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }

    let Some(path) = dialog.blocking_save_file().and_then(|p| p.into_path().ok()) else {
        return Ok(SaveDumpResult { canceled: Some(true), ..Default::default() });
    };
    match tokio::fs::write(&path, input.content).await {
        Ok(()) => {
            *state.0.lock().unwrap() = Some(path.clone());
            Ok(SaveDumpResult { success: true, file_path: Some(path.to_string_lossy().into()), ..Default::default() })
        }
        Err(err) => Ok(SaveDumpResult { error: Some(err.to_string()), ..Default::default() }),
    }
}

/// Reveals the exported file when it still exists, else its folder, else Downloads.
#[tauri::command]
pub fn open_export_folder(app: AppHandle, state: State<'_, ExportState>, custom_path: Option<String>) -> bool {
    let target = custom_path
        .filter(|p| !p.is_empty())
        .map(PathBuf::from)
        .or_else(|| state.0.lock().unwrap().clone());
    let opener = app.opener();

    if let Some(target) = target {
        if target.is_file() {
            return opener.reveal_item_in_dir(&target).is_ok();
        }
        if let Some(dir) = target.parent().filter(|d| d.is_dir()) {
            return opener.open_path(dir.to_string_lossy(), None::<&str>).is_ok();
        }
    }
    match app.path().download_dir() {
        Ok(dir) => opener.open_path(dir.to_string_lossy(), None::<&str>).is_ok(),
        Err(_) => false,
    }
}

#[tauri::command]
pub fn open_cache_folder(app: AppHandle) -> bool {
    let Ok(dir) = app.path().app_cache_dir() else {
        return false;
    };
    let _ = std::fs::create_dir_all(&dir);
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).is_ok()
}
