use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[cfg(target_os = "macos")]
mod macos;

#[cfg(not(target_os = "macos"))]
mod unsupported;

#[cfg(target_os = "macos")]
use macos as platform;

#[cfg(not(target_os = "macos"))]
use unsupported as platform;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureRequest {
    pub allow_clipboard_fallback: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardCaptureRequest {
    pub max_chars: Option<usize>,
}

impl Default for CaptureRequest {
    fn default() -> Self {
        Self {
            allow_clipboard_fallback: true,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceRequest {
    pub replacement_text: String,
    pub preferred_path: Option<AdapterPath>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementFrame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureResult {
    pub text: String,
    pub selected_text: Option<String>,
    pub active_app: Option<String>,
    pub focused_role: Option<String>,
    pub focused_title: Option<String>,
    pub focused_frame: Option<ElementFrame>,
    pub surface: LaunchSurface,
    pub support_tier: SupportTier,
    pub path: AdapterPath,
    pub can_replace_with_accessibility: bool,
    pub failure_modes: Vec<String>,
    pub event: AdapterEvent,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceResult {
    pub active_app: Option<String>,
    pub surface: LaunchSurface,
    pub support_tier: SupportTier,
    pub path: AdapterPath,
    pub replaced_char_count: usize,
    pub failure_modes: Vec<String>,
    pub event: AdapterEvent,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterEvent {
    pub id: String,
    pub timestamp_ms: u128,
    pub operation: AdapterOperation,
    pub success: bool,
    pub active_app: Option<String>,
    pub surface: LaunchSurface,
    pub support_tier: SupportTier,
    pub path: AdapterPath,
    pub char_count: usize,
    pub failure_modes: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AdapterOperation {
    Capture,
    Replace,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub enum SupportTier {
    #[serde(rename = "Tier A")]
    TierA,
    #[serde(rename = "Tier B")]
    TierB,
    #[serde(rename = "Tier C")]
    TierC,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub enum LaunchSurface {
    #[serde(rename = "Browser webapps")]
    BrowserWebapps,
    #[serde(rename = "Electron chat apps")]
    ElectronChatApps,
    #[serde(rename = "Messaging desktop apps")]
    MessagingDesktopApps,
    #[serde(rename = "Other desktop apps")]
    OtherDesktopApps,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub enum AdapterPath {
    #[serde(rename = "accessibilitySelection")]
    AccessibilitySelection,
    #[serde(rename = "accessibilityValue")]
    AccessibilityValue,
    #[serde(rename = "clipboardRead")]
    ClipboardRead,
    #[serde(rename = "clipboardCopy")]
    ClipboardCopy,
    #[serde(rename = "clipboardPaste")]
    ClipboardPaste,
    #[serde(rename = "unsupported")]
    Unsupported,
}

pub struct AdapterFailure {
    pub message: String,
    pub event: AdapterEvent,
}

impl AdapterEvent {
    pub fn new(
        operation: AdapterOperation,
        success: bool,
        active_app: Option<String>,
        support_tier: SupportTier,
        path: AdapterPath,
        char_count: usize,
        failure_modes: Vec<String>,
    ) -> Self {
        let surface = classify_surface(active_app.as_deref());

        Self {
            id: Uuid::new_v4().to_string(),
            timestamp_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_millis())
                .unwrap_or_default(),
            operation,
            success,
            active_app,
            surface,
            support_tier,
            path,
            char_count,
            failure_modes,
        }
    }
}

pub fn capture_focused_text(request: CaptureRequest) -> Result<CaptureResult, AdapterFailure> {
    platform::capture_focused_text(request)
}

pub fn capture_clipboard_text(
    request: ClipboardCaptureRequest,
) -> Result<CaptureResult, AdapterFailure> {
    platform::capture_clipboard_text(request)
}

pub fn replace_focused_text(request: ReplaceRequest) -> Result<ReplaceResult, AdapterFailure> {
    platform::replace_focused_text(request)
}

pub fn has_accessibility_permission() -> bool {
    platform::has_accessibility_permission()
}

pub fn open_accessibility_settings() -> Result<(), String> {
    platform::open_accessibility_settings()
}

pub fn frontmost_app_name() -> Option<String> {
    platform::frontmost_app_name()
}

pub fn classify_surface(app_name: Option<&str>) -> LaunchSurface {
    let Some(app_name) = app_name else {
        return LaunchSurface::OtherDesktopApps;
    };
    let app_name = app_name.to_ascii_lowercase();

    if contains_any(
        &app_name,
        &[
            "arc", "brave", "chrome", "edge", "firefox", "opera", "orion", "safari",
        ],
    ) {
        return LaunchSurface::BrowserWebapps;
    }

    if contains_any(
        &app_name,
        &[
            "chatgpt",
            "codex",
            "cursor",
            "discord",
            "notion",
            "slack",
            "teams",
            "visual studio code",
            "zoom",
        ],
    ) {
        return LaunchSurface::ElectronChatApps;
    }

    if contains_any(
        &app_name,
        &[
            "dingtalk", "feishu", "lark", "line", "messages", "signal", "telegram", "wechat",
            "whatsapp",
        ],
    ) {
        return LaunchSurface::MessagingDesktopApps;
    }

    LaunchSurface::OtherDesktopApps
}

fn contains_any(value: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| value.contains(needle))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_launch_surfaces_from_app_name() {
        assert!(matches!(
            classify_surface(Some("Google Chrome")),
            LaunchSurface::BrowserWebapps
        ));
        assert!(matches!(
            classify_surface(Some("Slack")),
            LaunchSurface::ElectronChatApps
        ));
        assert!(matches!(
            classify_surface(Some("Codex")),
            LaunchSurface::ElectronChatApps
        ));
        assert!(matches!(
            classify_surface(Some("WeChat")),
            LaunchSurface::MessagingDesktopApps
        ));
        assert!(matches!(
            classify_surface(Some("TextEdit")),
            LaunchSurface::OtherDesktopApps
        ));
    }

    #[test]
    fn serializes_manual_clipboard_path() {
        let path = serde_json::to_string(&AdapterPath::ClipboardRead)
            .expect("serialize clipboard read path");

        assert_eq!(path, "\"clipboardRead\"");
    }
}
