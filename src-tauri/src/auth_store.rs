//! Durable copy of the auth session.
//!
//! The server rotates the refresh token on every refresh, so losing the newest
//! one logs the user out. WebView localStorage flushes to disk lazily, and a
//! phone that kills the app in the background drops that pending write, so the
//! session is also written here, synchronously and atomically.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

const FILE_NAME: &str = "auth-session.json";

/// Serializes access so a read never sees a half-renamed file and writes keep their order.
#[derive(Default)]
pub struct AuthStoreLock(Mutex<()>);

fn session_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(FILE_NAME))
}

fn write_atomic(path: &Path, value: &str) -> std::io::Result<()> {
    let tmp = path.with_extension("json.tmp");
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&tmp)?;
    file.write_all(value.as_bytes())?;
    file.sync_all()?;
    fs::rename(&tmp, path)
}

#[tauri::command]
pub fn auth_session_read(app: AppHandle, lock: State<'_, AuthStoreLock>) -> Result<Option<String>, String> {
    let _guard = lock.0.lock().unwrap();
    match fs::read_to_string(session_path(&app)?) {
        Ok(value) => Ok(Some(value)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

/// `None` removes the file, on logout or a rejected refresh.
#[tauri::command]
pub fn auth_session_write(app: AppHandle, lock: State<'_, AuthStoreLock>, value: Option<String>) -> Result<(), String> {
    let _guard = lock.0.lock().unwrap();
    let path = session_path(&app)?;
    match value {
        Some(value) => write_atomic(&path, &value).map_err(|e| e.to_string()),
        None => match fs::remove_file(&path) {
            Err(err) if err.kind() != std::io::ErrorKind::NotFound => Err(err.to_string()),
            _ => Ok(()),
        },
    }
}
