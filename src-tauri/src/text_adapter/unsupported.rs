use super::{
    AdapterEvent, AdapterFailure, AdapterOperation, AdapterPath, CaptureRequest, CaptureResult,
    ClipboardCaptureRequest, ElementFrame, LaunchSurface, ReplaceRequest, ReplaceResult,
    SupportTier,
};

pub fn capture_focused_text(_request: CaptureRequest) -> Result<CaptureResult, AdapterFailure> {
    let failure_modes = vec![
        "native_focused_text_adapter_unavailable_on_this_platform".to_string(),
        "use_browser_extension_or_manual_clipboard_capture".to_string(),
    ];
    Err(AdapterFailure {
        message: "Focused text capture is not available on this platform yet. Use the browser extension for Chrome/Edge inputs, or the manual clipboard capture path.".to_string(),
        event: AdapterEvent::new(
            AdapterOperation::Capture,
            false,
            frontmost_app_name(),
            SupportTier::TierC,
            AdapterPath::Unsupported,
            0,
            failure_modes,
        ),
    })
}

pub fn capture_clipboard_text(
    request: ClipboardCaptureRequest,
) -> Result<CaptureResult, AdapterFailure> {
    let active_app = frontmost_app_name();
    let mut clipboard = arboard::Clipboard::new().map_err(|error| {
        let failure_modes = vec!["clipboard_unavailable".to_string()];
        AdapterFailure {
            message: format!("Clipboard capture is unavailable: {error}"),
            event: AdapterEvent::new(
                AdapterOperation::Capture,
                false,
                active_app.clone(),
                SupportTier::TierC,
                AdapterPath::ClipboardRead,
                0,
                failure_modes,
            ),
        }
    })?;

    let mut text = clipboard.get_text().map_err(|error| {
        let failure_modes = vec!["clipboard_text_read_failed".to_string()];
        AdapterFailure {
            message: format!("Clipboard text could not be read: {error}"),
            event: AdapterEvent::new(
                AdapterOperation::Capture,
                false,
                active_app.clone(),
                SupportTier::TierC,
                AdapterPath::ClipboardRead,
                0,
                failure_modes,
            ),
        }
    })?;

    if let Some(max_chars) = request.max_chars {
        text = text.chars().take(max_chars).collect();
    }

    let failure_modes = vec!["manual_clipboard_capture_user_initiated".to_string()];
    let event = AdapterEvent::new(
        AdapterOperation::Capture,
        true,
        active_app.clone(),
        SupportTier::TierB,
        AdapterPath::ClipboardRead,
        text.chars().count(),
        failure_modes.clone(),
    );

    Ok(CaptureResult {
        text: text.clone(),
        selected_text: Some(text),
        active_app,
        focused_role: None,
        focused_title: Some("Clipboard".to_string()),
        focused_frame: None::<ElementFrame>,
        surface: LaunchSurface::OtherDesktopApps,
        support_tier: SupportTier::TierB,
        path: AdapterPath::ClipboardRead,
        can_replace_with_accessibility: false,
        failure_modes,
        event,
    })
}

pub fn replace_focused_text(request: ReplaceRequest) -> Result<ReplaceResult, AdapterFailure> {
    let active_app = frontmost_app_name();
    let char_count = request.replacement_text.chars().count();
    let mut clipboard = arboard::Clipboard::new().map_err(|error| {
        let failure_modes = vec!["clipboard_unavailable".to_string()];
        AdapterFailure {
            message: format!("Clipboard replacement fallback is unavailable: {error}"),
            event: AdapterEvent::new(
                AdapterOperation::Replace,
                false,
                active_app.clone(),
                SupportTier::TierC,
                AdapterPath::ClipboardCopy,
                char_count,
                failure_modes,
            ),
        }
    })?;

    clipboard
        .set_text(request.replacement_text)
        .map_err(|error| {
            let failure_modes = vec!["clipboard_text_write_failed".to_string()];
            AdapterFailure {
                message: format!("Replacement text could not be copied: {error}"),
                event: AdapterEvent::new(
                    AdapterOperation::Replace,
                    false,
                    active_app.clone(),
                    SupportTier::TierC,
                    AdapterPath::ClipboardCopy,
                    char_count,
                    failure_modes,
                ),
            }
        })?;

    let failure_modes = vec![
        "manual_clipboard_replacement_user_initiated".to_string(),
        "native_focused_text_adapter_unavailable_on_this_platform".to_string(),
    ];
    let event = AdapterEvent::new(
        AdapterOperation::Replace,
        true,
        active_app.clone(),
        SupportTier::TierB,
        AdapterPath::ClipboardCopy,
        char_count,
        failure_modes.clone(),
    );

    Ok(ReplaceResult {
        active_app,
        surface: LaunchSurface::OtherDesktopApps,
        support_tier: SupportTier::TierB,
        path: AdapterPath::ClipboardCopy,
        replaced_char_count: char_count,
        failure_modes,
        event,
    })
}

pub fn has_accessibility_permission() -> bool {
    true
}

pub fn open_accessibility_settings() -> Result<(), String> {
    Err("Native accessibility settings are available on macOS only. On Windows, use the Chrome/Edge extension or manual clipboard capture.".to_string())
}

pub fn frontmost_app_name() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        return Some("Windows desktop".to_string());
    }

    #[cfg(not(target_os = "windows"))]
    {
        Some("Desktop preview".to_string())
    }
}

#[allow(dead_code)]
fn _surface_marker() -> LaunchSurface {
    LaunchSurface::OtherDesktopApps
}
