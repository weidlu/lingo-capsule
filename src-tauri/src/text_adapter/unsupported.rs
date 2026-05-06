use super::{
    AdapterEvent, AdapterFailure, AdapterOperation, AdapterPath, CaptureRequest, CaptureResult,
    ClipboardCaptureRequest, LaunchSurface, ReplaceRequest, ReplaceResult, SupportTier,
};

pub fn capture_focused_text(_request: CaptureRequest) -> Result<CaptureResult, AdapterFailure> {
    let failure_modes = vec!["macos_adapter_unavailable_on_this_platform".to_string()];
    Err(AdapterFailure {
        message: "The focused text adapter is currently implemented for macOS only.".to_string(),
        event: AdapterEvent::new(
            AdapterOperation::Capture,
            false,
            None,
            SupportTier::TierC,
            AdapterPath::Unsupported,
            0,
            failure_modes,
        ),
    })
}

pub fn capture_clipboard_text(
    _request: ClipboardCaptureRequest,
) -> Result<CaptureResult, AdapterFailure> {
    let failure_modes = vec!["macos_adapter_unavailable_on_this_platform".to_string()];
    Err(AdapterFailure {
        message: "The clipboard capture adapter is currently implemented for macOS only."
            .to_string(),
        event: AdapterEvent::new(
            AdapterOperation::Capture,
            false,
            None,
            SupportTier::TierC,
            AdapterPath::Unsupported,
            0,
            failure_modes,
        ),
    })
}

pub fn replace_focused_text(request: ReplaceRequest) -> Result<ReplaceResult, AdapterFailure> {
    let failure_modes = vec!["macos_adapter_unavailable_on_this_platform".to_string()];
    Err(AdapterFailure {
        message: "The focused text adapter is currently implemented for macOS only.".to_string(),
        event: AdapterEvent::new(
            AdapterOperation::Replace,
            false,
            None,
            SupportTier::TierC,
            AdapterPath::Unsupported,
            request.replacement_text.chars().count(),
            failure_modes,
        ),
    })
}

pub fn has_accessibility_permission() -> bool {
    false
}

pub fn open_accessibility_settings() -> Result<(), String> {
    Err("Accessibility settings deep link is available on macOS only.".to_string())
}

pub fn frontmost_app_name() -> Option<String> {
    None
}

#[allow(dead_code)]
fn _surface_marker() -> LaunchSurface {
    LaunchSurface::OtherDesktopApps
}
