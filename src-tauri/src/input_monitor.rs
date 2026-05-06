#[cfg(target_os = "macos")]
mod macos;

#[cfg(not(target_os = "macos"))]
mod unsupported;

#[cfg(target_os = "macos")]
use macos as platform;

#[cfg(not(target_os = "macos"))]
use unsupported as platform;

pub fn start(app: tauri::AppHandle) -> Result<(), String> {
    platform::start(app)
}

pub fn open_settings() -> Result<(), String> {
    platform::open_settings()
}
