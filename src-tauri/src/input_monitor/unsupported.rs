pub fn start(_app: tauri::AppHandle) -> Result<(), String> {
    Err("Input trigger monitoring is currently implemented for macOS only.".to_string())
}

pub fn open_settings() -> Result<(), String> {
    Err("Input Monitoring settings deep link is available on macOS only.".to_string())
}
