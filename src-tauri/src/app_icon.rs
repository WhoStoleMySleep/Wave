//! Runtime app icon swap driven by the now-playing cover.

use base64::Engine;
use tauri::AppHandle;
#[cfg(desktop)]
use tauri::Manager;

fn decode_data_url(data_url: &str) -> Option<Vec<u8>> {
    let (_, payload) = data_url.split_once(";base64,")?;
    base64::engine::general_purpose::STANDARD.decode(payload).ok()
}

#[tauri::command]
pub fn set_app_icon(app: AppHandle, data_url: String) {
    let Some(png) = decode_data_url(&data_url) else {
        return;
    };
    #[cfg(mobile)]
    let _ = (app, png);

    #[cfg(target_os = "macos")]
    {
        // window icons are ignored on macOS, only the dock tile is visible
        let bytes = png.clone();
        let _ = app.run_on_main_thread(move || set_dock_icon(&bytes));
    }

    // mobile launchers take the icon from the package only
    #[cfg(desktop)]
    if let (Some(window), Ok(image)) = (app.get_webview_window("main"), tauri::image::Image::from_bytes(&png)) {
        let _ = window.set_icon(image);
    }
}

#[cfg(target_os = "macos")]
fn set_dock_icon(png: &[u8]) {
    use objc2::AllocAnyThread;
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSData;

    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let data = NSData::with_bytes(png);
    if let Some(image) = NSImage::initWithData(NSImage::alloc(), &data) {
        let app = NSApplication::sharedApplication(mtm);
        unsafe { app.setApplicationIconImage(Some(&image)) };
    }
}
