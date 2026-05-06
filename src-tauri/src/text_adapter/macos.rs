use std::{
    ffi::c_void,
    io::Write,
    process::{Command, Stdio},
    ptr, thread,
    time::Duration,
};

use core_foundation::{
    base::{CFTypeRef, TCFType},
    string::{CFString, CFStringRef},
};
use uuid::Uuid;

use super::{
    classify_surface, AdapterEvent, AdapterFailure, AdapterOperation, AdapterPath, CaptureRequest,
    CaptureResult, ClipboardCaptureRequest, ElementFrame, ReplaceRequest, ReplaceResult,
    SupportTier,
};

type AXError = i32;
type AXUIElementRef = *const c_void;
type AXValueRef = *const c_void;
type AXValueType = i32;
type Boolean = u8;
type CFTypeID = usize;
type Pid = i32;

const AX_ERROR_SUCCESS: AXError = 0;
const AX_FOCUSED_UI_ELEMENT: &str = "AXFocusedUIElement";
const AX_SELECTED_TEXT: &str = "AXSelectedText";
const AX_VALUE: &str = "AXValue";
const AX_ROLE: &str = "AXRole";
const AX_TITLE: &str = "AXTitle";
const AX_DESCRIPTION: &str = "AXDescription";
const AX_POSITION: &str = "AXPosition";
const AX_SIZE: &str = "AXSize";
const K_AX_VALUE_CGPOINT_TYPE: AXValueType = 1;
const K_AX_VALUE_CGSIZE_TYPE: AXValueType = 2;

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct CGPoint {
    x: f64,
    y: f64,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct CGSize {
    width: f64,
    height: f64,
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> Boolean;
    fn AXUIElementCreateSystemWide() -> AXUIElementRef;
    fn AXUIElementCreateApplication(pid: Pid) -> AXUIElementRef;
    fn AXUIElementCopyAttributeValue(
        element: AXUIElementRef,
        attribute: CFStringRef,
        value: *mut CFTypeRef,
    ) -> AXError;
    fn AXUIElementSetAttributeValue(
        element: AXUIElementRef,
        attribute: CFStringRef,
        value: CFTypeRef,
    ) -> AXError;
    fn AXUIElementIsAttributeSettable(
        element: AXUIElementRef,
        attribute: CFStringRef,
        settable: *mut Boolean,
    ) -> AXError;
    fn AXValueGetType(value: AXValueRef) -> AXValueType;
    fn AXValueGetValue(
        value: AXValueRef,
        value_type: AXValueType,
        out_value: *mut c_void,
    ) -> Boolean;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFGetTypeID(cf: CFTypeRef) -> CFTypeID;
    fn CFRelease(cf: CFTypeRef);
    fn CFStringGetTypeID() -> CFTypeID;
}

struct FocusedElement(AXUIElementRef);

impl Drop for FocusedElement {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CFRelease(self.0 as CFTypeRef) };
        }
    }
}

#[derive(Clone, Debug)]
struct FrontmostApp {
    name: Option<String>,
    pid: Option<Pid>,
}

pub fn capture_focused_text(request: CaptureRequest) -> Result<CaptureResult, AdapterFailure> {
    let frontmost_app = frontmost_app();
    let active_app = frontmost_app.name.clone();
    let mut failure_modes = Vec::new();

    if !is_accessibility_trusted() {
        failure_modes.push("accessibility_permission_missing".to_string());
        if !request.allow_clipboard_fallback {
            return Err(capture_failure(
                "Accessibility permission is required to read focused text while you type."
                    .to_string(),
                active_app,
                SupportTier::TierC,
                AdapterPath::Unsupported,
                failure_modes,
            ));
        }
        return capture_with_clipboard(active_app, None, None, None, failure_modes);
    }

    let focused = match focused_element(frontmost_app.pid, &mut failure_modes) {
        Ok(focused) => focused,
        Err(error) => {
            failure_modes.push(error);
            if !request.allow_clipboard_fallback {
                return Err(capture_failure(
                    "Could not find the focused input element.".to_string(),
                    active_app,
                    SupportTier::TierC,
                    AdapterPath::Unsupported,
                    failure_modes,
                ));
            }
            return capture_with_clipboard(active_app, None, None, None, failure_modes);
        }
    };

    let focused_role = read_string_attribute(focused.0, AX_ROLE, &mut failure_modes);
    let focused_title = read_string_attribute(focused.0, AX_TITLE, &mut failure_modes)
        .or_else(|| read_string_attribute(focused.0, AX_DESCRIPTION, &mut failure_modes));
    let focused_frame = read_focused_frame(focused.0, &mut failure_modes);
    let selected_text = read_string_attribute(focused.0, AX_SELECTED_TEXT, &mut failure_modes)
        .filter(|value| !value.is_empty());
    let field_value = read_string_attribute(focused.0, AX_VALUE, &mut failure_modes)
        .filter(|value| !value.is_empty());
    let can_replace_selection = is_attribute_settable(focused.0, AX_SELECTED_TEXT)
        .map_err(|error| failure_modes.push(error))
        .unwrap_or(false);
    let can_replace_value = is_attribute_settable(focused.0, AX_VALUE)
        .map_err(|error| failure_modes.push(error))
        .unwrap_or(false);

    if let Some(text) = selected_text.clone() {
        return Ok(capture_result(
            active_app,
            focused_role,
            focused_title,
            focused_frame.clone(),
            text,
            selected_text,
            AdapterPath::AccessibilitySelection,
            SupportTier::TierA,
            can_replace_selection,
            failure_modes,
        ));
    }

    if let Some(text) = field_value {
        return Ok(capture_result(
            active_app,
            focused_role,
            focused_title,
            focused_frame.clone(),
            text,
            None,
            AdapterPath::AccessibilityValue,
            SupportTier::TierA,
            can_replace_value,
            failure_modes,
        ));
    }

    failure_modes.push("accessibility_text_attributes_empty".to_string());
    if !request.allow_clipboard_fallback {
        return Err(capture_failure(
            "The focused input did not expose readable text.".to_string(),
            active_app,
            SupportTier::TierC,
            AdapterPath::Unsupported,
            failure_modes,
        ));
    }
    capture_with_clipboard(
        active_app,
        focused_role,
        focused_title,
        focused_frame,
        failure_modes,
    )
}

pub fn capture_clipboard_text(
    request: ClipboardCaptureRequest,
) -> Result<CaptureResult, AdapterFailure> {
    let active_app = Some("Manual clipboard".to_string());
    let max_chars = request.max_chars.unwrap_or(1200).clamp(1, 4000);
    let mut failure_modes = vec!["manual_clipboard_capture_user_initiated".to_string()];

    match read_clipboard_text() {
        Ok(text) => {
            let trimmed = text.trim().to_string();
            let char_count = trimmed.chars().count();

            if trimmed.is_empty() {
                failure_modes.push("clipboard_read_produced_empty_text".to_string());
                return Err(capture_failure(
                    "Clipboard text is empty.".to_string(),
                    active_app,
                    SupportTier::TierC,
                    AdapterPath::Unsupported,
                    failure_modes,
                ));
            }

            if char_count > max_chars {
                failure_modes.push(format!(
                    "clipboard_read_too_large_for_manual_capture:{char_count}>{max_chars}"
                ));
                return Err(capture_failure(
                    "Clipboard text is too large for manual capture.".to_string(),
                    active_app,
                    SupportTier::TierC,
                    AdapterPath::Unsupported,
                    failure_modes,
                ));
            }

            Ok(capture_result(
                active_app,
                None,
                Some("Clipboard".to_string()),
                None,
                trimmed.clone(),
                Some(trimmed),
                AdapterPath::ClipboardRead,
                SupportTier::TierB,
                false,
                failure_modes,
            ))
        }
        Err(error) => {
            failure_modes.push(format!("clipboard_read_failed:{error}"));
            Err(capture_failure(
                "Could not read clipboard text.".to_string(),
                active_app,
                SupportTier::TierC,
                AdapterPath::Unsupported,
                failure_modes,
            ))
        }
    }
}

pub fn replace_focused_text(request: ReplaceRequest) -> Result<ReplaceResult, AdapterFailure> {
    let replacement_text = request.replacement_text.trim_end().to_string();
    let preferred_path = request.preferred_path;
    let char_count = replacement_text.chars().count();
    let frontmost_app = frontmost_app();
    let active_app = frontmost_app.name.clone();
    let mut failure_modes = Vec::new();

    if replacement_text.is_empty() {
        failure_modes.push("replacement_text_empty".to_string());
        return Err(replace_failure(
            "Replacement text cannot be empty.".to_string(),
            active_app,
            SupportTier::TierC,
            AdapterPath::Unsupported,
            char_count,
            failure_modes,
        ));
    }

    if is_accessibility_trusted() {
        match focused_element(frontmost_app.pid, &mut failure_modes) {
            Ok(focused) => {
                let preferred_paths = match preferred_path {
                    Some(AdapterPath::AccessibilityValue) => [
                        AdapterPath::AccessibilityValue,
                        AdapterPath::AccessibilitySelection,
                    ],
                    _ => [
                        AdapterPath::AccessibilitySelection,
                        AdapterPath::AccessibilityValue,
                    ],
                };

                for path in preferred_paths {
                    if let Some(result) = try_accessibility_replace(
                        focused.0,
                        path,
                        &replacement_text,
                        active_app.clone(),
                        char_count,
                        &mut failure_modes,
                    ) {
                        return Ok(result);
                    }
                }
            }
            Err(error) => failure_modes.push(error),
        }
    } else {
        failure_modes.push("accessibility_permission_missing".to_string());
    }

    match clipboard_paste_text(&replacement_text, &mut failure_modes) {
        Ok(()) => Ok(replace_result(
            active_app,
            SupportTier::TierB,
            AdapterPath::ClipboardPaste,
            char_count,
            failure_modes,
        )),
        Err(error) => {
            failure_modes.push(error);
            Err(replace_failure(
                "Could not replace focused text with Accessibility or clipboard fallback."
                    .to_string(),
                active_app,
                SupportTier::TierC,
                AdapterPath::Unsupported,
                char_count,
                failure_modes,
            ))
        }
    }
}

fn try_accessibility_replace(
    focused: AXUIElementRef,
    path: AdapterPath,
    replacement_text: &str,
    active_app: Option<String>,
    char_count: usize,
    failure_modes: &mut Vec<String>,
) -> Option<ReplaceResult> {
    let attribute = match path {
        AdapterPath::AccessibilitySelection => AX_SELECTED_TEXT,
        AdapterPath::AccessibilityValue => AX_VALUE,
        _ => return None,
    };

    match is_attribute_settable(focused, attribute) {
        Ok(true) => match set_string_attribute(focused, attribute, replacement_text) {
            Ok(()) => Some(replace_result(
                active_app,
                SupportTier::TierA,
                path,
                char_count,
                failure_modes.clone(),
            )),
            Err(error) => {
                failure_modes.push(error);
                None
            }
        },
        Ok(false) => {
            failure_modes.push(format!("{attribute}_not_settable"));
            None
        }
        Err(error) => {
            failure_modes.push(error);
            None
        }
    }
}

pub fn has_accessibility_permission() -> bool {
    is_accessibility_trusted()
}

pub fn open_accessibility_settings() -> Result<(), String> {
    let status = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .status()
        .map_err(|error| format!("failed_to_open_accessibility_settings:{error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "open_accessibility_settings_exit_status:{}",
            status.code().unwrap_or_default()
        ))
    }
}

pub fn frontmost_app_name() -> Option<String> {
    frontmost_app().name
}

fn capture_with_clipboard(
    active_app: Option<String>,
    focused_role: Option<String>,
    focused_title: Option<String>,
    focused_frame: Option<ElementFrame>,
    mut failure_modes: Vec<String>,
) -> Result<CaptureResult, AdapterFailure> {
    match clipboard_copy_selected_text(&mut failure_modes) {
        Ok(text) => Ok(capture_result(
            active_app,
            focused_role,
            focused_title,
            focused_frame,
            text.clone(),
            Some(text),
            AdapterPath::ClipboardCopy,
            SupportTier::TierB,
            false,
            failure_modes,
        )),
        Err(error) => {
            failure_modes.push(error);
            Err(capture_failure(
                "Could not capture focused text with Accessibility or clipboard fallback."
                    .to_string(),
                active_app,
                SupportTier::TierC,
                AdapterPath::Unsupported,
                failure_modes,
            ))
        }
    }
}

fn capture_result(
    active_app: Option<String>,
    focused_role: Option<String>,
    focused_title: Option<String>,
    focused_frame: Option<ElementFrame>,
    text: String,
    selected_text: Option<String>,
    path: AdapterPath,
    support_tier: SupportTier,
    can_replace_with_accessibility: bool,
    failure_modes: Vec<String>,
) -> CaptureResult {
    let char_count = text.chars().count();
    let surface = classify_surface(active_app.as_deref());
    let event = AdapterEvent::new(
        AdapterOperation::Capture,
        true,
        active_app.clone(),
        support_tier,
        path,
        char_count,
        failure_modes.clone(),
    );

    CaptureResult {
        text,
        selected_text,
        active_app,
        focused_role,
        focused_title,
        focused_frame,
        surface,
        support_tier,
        path,
        can_replace_with_accessibility,
        failure_modes,
        event,
    }
}

fn replace_result(
    active_app: Option<String>,
    support_tier: SupportTier,
    path: AdapterPath,
    replaced_char_count: usize,
    failure_modes: Vec<String>,
) -> ReplaceResult {
    let surface = classify_surface(active_app.as_deref());
    let event = AdapterEvent::new(
        AdapterOperation::Replace,
        true,
        active_app.clone(),
        support_tier,
        path,
        replaced_char_count,
        failure_modes.clone(),
    );

    ReplaceResult {
        active_app,
        surface,
        support_tier,
        path,
        replaced_char_count,
        failure_modes,
        event,
    }
}

fn capture_failure(
    message: String,
    active_app: Option<String>,
    support_tier: SupportTier,
    path: AdapterPath,
    failure_modes: Vec<String>,
) -> AdapterFailure {
    AdapterFailure {
        message,
        event: AdapterEvent::new(
            AdapterOperation::Capture,
            false,
            active_app,
            support_tier,
            path,
            0,
            failure_modes,
        ),
    }
}

fn replace_failure(
    message: String,
    active_app: Option<String>,
    support_tier: SupportTier,
    path: AdapterPath,
    char_count: usize,
    failure_modes: Vec<String>,
) -> AdapterFailure {
    AdapterFailure {
        message,
        event: AdapterEvent::new(
            AdapterOperation::Replace,
            false,
            active_app,
            support_tier,
            path,
            char_count,
            failure_modes,
        ),
    }
}

fn is_accessibility_trusted() -> bool {
    unsafe { AXIsProcessTrusted() != 0 }
}

fn focused_element(
    frontmost_pid: Option<Pid>,
    failure_modes: &mut Vec<String>,
) -> Result<FocusedElement, String> {
    if let Some(pid) = frontmost_pid {
        match focused_element_for_application(pid) {
            Ok(focused) => return Ok(focused),
            Err(error) => failure_modes.push(error),
        }
    } else {
        failure_modes.push("frontmost_app_pid_unavailable".to_string());
    }

    focused_element_system_wide()
}

fn focused_element_for_application(pid: Pid) -> Result<FocusedElement, String> {
    unsafe {
        let app = AXUIElementCreateApplication(pid);
        if app.is_null() {
            return Err("AXUIElementCreateApplication_returned_null".to_string());
        }

        let result = copy_attribute_raw(app, AX_FOCUSED_UI_ELEMENT)
            .map(|value| FocusedElement(value as AXUIElementRef))
            .map_err(|error| format!("application_{error}"));
        CFRelease(app as CFTypeRef);
        result
    }
}

fn focused_element_system_wide() -> Result<FocusedElement, String> {
    unsafe {
        let system_wide = AXUIElementCreateSystemWide();
        if system_wide.is_null() {
            return Err("AXUIElementCreateSystemWide_returned_null".to_string());
        }

        let result = copy_attribute_raw(system_wide, AX_FOCUSED_UI_ELEMENT)
            .map(|value| FocusedElement(value as AXUIElementRef))
            .map_err(|error| format!("system_wide_{error}"));
        CFRelease(system_wide as CFTypeRef);
        result
    }
}

fn read_string_attribute(
    element: AXUIElementRef,
    attribute: &str,
    failure_modes: &mut Vec<String>,
) -> Option<String> {
    match copy_string_attribute(element, attribute) {
        Ok(value) => value,
        Err(error) => {
            failure_modes.push(error);
            None
        }
    }
}

fn copy_string_attribute(
    element: AXUIElementRef,
    attribute: &str,
) -> Result<Option<String>, String> {
    unsafe {
        let value = copy_attribute_raw(element, attribute)?;
        if CFGetTypeID(value) != CFStringGetTypeID() {
            CFRelease(value);
            return Ok(None);
        }

        Ok(Some(
            CFString::wrap_under_create_rule(value as CFStringRef).to_string(),
        ))
    }
}

fn read_focused_frame(
    element: AXUIElementRef,
    failure_modes: &mut Vec<String>,
) -> Option<ElementFrame> {
    let position = match copy_cg_point_attribute(element, AX_POSITION) {
        Ok(Some(position)) => position,
        Ok(None) => return None,
        Err(error) => {
            failure_modes.push(error);
            return None;
        }
    };

    let size = match copy_cg_size_attribute(element, AX_SIZE) {
        Ok(Some(size)) => size,
        Ok(None) => return None,
        Err(error) => {
            failure_modes.push(error);
            return None;
        }
    };

    if size.width <= 0.0 || size.height <= 0.0 {
        failure_modes.push("focused_frame_empty".to_string());
        return None;
    }

    Some(ElementFrame {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    })
}

fn copy_cg_point_attribute(
    element: AXUIElementRef,
    attribute: &str,
) -> Result<Option<CGPoint>, String> {
    unsafe {
        let value = copy_attribute_raw(element, attribute)?;

        if AXValueGetType(value as AXValueRef) != K_AX_VALUE_CGPOINT_TYPE {
            CFRelease(value);
            return Ok(None);
        }

        let mut point = CGPoint::default();
        let success = AXValueGetValue(
            value as AXValueRef,
            K_AX_VALUE_CGPOINT_TYPE,
            &mut point as *mut CGPoint as *mut c_void,
        );
        CFRelease(value);

        if success != 0 {
            Ok(Some(point))
        } else {
            Err(format!("{attribute}:AXValueGetValue_failed"))
        }
    }
}

fn copy_cg_size_attribute(
    element: AXUIElementRef,
    attribute: &str,
) -> Result<Option<CGSize>, String> {
    unsafe {
        let value = copy_attribute_raw(element, attribute)?;

        if AXValueGetType(value as AXValueRef) != K_AX_VALUE_CGSIZE_TYPE {
            CFRelease(value);
            return Ok(None);
        }

        let mut size = CGSize::default();
        let success = AXValueGetValue(
            value as AXValueRef,
            K_AX_VALUE_CGSIZE_TYPE,
            &mut size as *mut CGSize as *mut c_void,
        );
        CFRelease(value);

        if success != 0 {
            Ok(Some(size))
        } else {
            Err(format!("{attribute}:AXValueGetValue_failed"))
        }
    }
}

fn copy_attribute_raw(element: AXUIElementRef, attribute: &str) -> Result<CFTypeRef, String> {
    unsafe {
        let attribute_name = CFString::new(attribute);
        let mut value: CFTypeRef = ptr::null();
        let error = AXUIElementCopyAttributeValue(
            element,
            attribute_name.as_concrete_TypeRef(),
            &mut value,
        );

        if error == AX_ERROR_SUCCESS && !value.is_null() {
            Ok(value)
        } else {
            Err(format!("{attribute}:{}", ax_error_label(error)))
        }
    }
}

fn set_string_attribute(
    element: AXUIElementRef,
    attribute: &str,
    value: &str,
) -> Result<(), String> {
    unsafe {
        let attribute_name = CFString::new(attribute);
        let value = CFString::new(value);
        let error = AXUIElementSetAttributeValue(
            element,
            attribute_name.as_concrete_TypeRef(),
            value.as_concrete_TypeRef() as CFTypeRef,
        );

        if error == AX_ERROR_SUCCESS {
            Ok(())
        } else {
            Err(format!("{attribute}:{}", ax_error_label(error)))
        }
    }
}

fn is_attribute_settable(element: AXUIElementRef, attribute: &str) -> Result<bool, String> {
    unsafe {
        let attribute_name = CFString::new(attribute);
        let mut settable: Boolean = 0;
        let error = AXUIElementIsAttributeSettable(
            element,
            attribute_name.as_concrete_TypeRef(),
            &mut settable,
        );

        if error == AX_ERROR_SUCCESS {
            Ok(settable != 0)
        } else {
            Err(format!("{attribute}:{}", ax_error_label(error)))
        }
    }
}

fn clipboard_copy_selected_text(failure_modes: &mut Vec<String>) -> Result<String, String> {
    let marker = format!("__LINGO_CAPSULE_COPY_PROBE_{}__", Uuid::new_v4());
    let original_clipboard = read_clipboard_text()
        .map_err(|error| format!("clipboard_read_before_copy_failed:{error}"))?;

    write_clipboard_text(&marker)
        .map_err(|error| format!("clipboard_marker_write_failed:{error}"))?;
    if let Err(error) = send_command_keystroke("c") {
        let _ = write_clipboard_text(&original_clipboard);
        return Err(format!("clipboard_copy_shortcut_failed:{error}"));
    }

    thread::sleep(Duration::from_millis(140));
    let copied_text = read_clipboard_text()
        .map_err(|error| format!("clipboard_read_after_copy_failed:{error}"))?;

    if let Err(error) = write_clipboard_text(&original_clipboard) {
        failure_modes.push(format!("clipboard_restore_failed:{error}"));
    }

    if copied_text == marker {
        Err("clipboard_copy_produced_no_selection".to_string())
    } else if copied_text.trim().is_empty() {
        Err("clipboard_copy_produced_empty_text".to_string())
    } else {
        Ok(copied_text)
    }
}

fn clipboard_paste_text(text: &str, failure_modes: &mut Vec<String>) -> Result<(), String> {
    let original_clipboard = read_clipboard_text()
        .map_err(|error| format!("clipboard_read_before_paste_failed:{error}"))?;

    failure_modes.push("clipboard_fallback_restores_plain_text_only".to_string());
    write_clipboard_text(text).map_err(|error| format!("clipboard_write_failed:{error}"))?;

    let paste_result = send_command_keystroke("v");
    thread::sleep(Duration::from_millis(140));

    if let Err(error) = write_clipboard_text(&original_clipboard) {
        failure_modes.push(format!("clipboard_restore_failed:{error}"));
    }

    paste_result.map_err(|error| format!("clipboard_paste_shortcut_failed:{error}"))
}

fn read_clipboard_text() -> Result<String, String> {
    let output = Command::new("pbpaste")
        .output()
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn write_clipboard_text(text: &str) -> Result<(), String> {
    let mut child = Command::new("pbcopy")
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    let stdin = child
        .stdin
        .as_mut()
        .ok_or_else(|| "pbcopy_stdin_unavailable".to_string())?;
    stdin
        .write_all(text.as_bytes())
        .map_err(|error| error.to_string())?;

    let status = child.wait().map_err(|error| error.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "pbcopy_exit_status:{}",
            status.code().unwrap_or_default()
        ))
    }
}

fn send_command_keystroke(key: &str) -> Result<(), String> {
    let script =
        format!("tell application \"System Events\" to keystroke \"{key}\" using command down");
    run_osascript(&script).map(|_| ())
}

fn frontmost_app() -> FrontmostApp {
    let script = r#"
tell application "System Events"
    tell first application process whose frontmost is true
        return (name as text) & linefeed & (unix id as text)
    end tell
end tell
"#;

    let Ok(output) = run_osascript(script) else {
        return FrontmostApp {
            name: None,
            pid: None,
        };
    };

    let mut lines = output.lines();
    let name = lines
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);
    let pid = lines
        .next()
        .map(str::trim)
        .and_then(|value| value.parse::<Pid>().ok());

    FrontmostApp { name, pid }
}

fn run_osascript(script: &str) -> Result<String, String> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|error| error.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn ax_error_label(error: AXError) -> String {
    match error {
        0 => "success".to_string(),
        -25200 => "failure".to_string(),
        -25201 => "illegal_argument".to_string(),
        -25202 => "invalid_ui_element".to_string(),
        -25203 => "invalid_ui_element_observer".to_string(),
        -25204 => "cannot_complete".to_string(),
        -25205 => "attribute_unsupported".to_string(),
        -25206 => "action_unsupported".to_string(),
        -25207 => "notification_unsupported".to_string(),
        -25208 => "not_implemented".to_string(),
        -25209 => "notification_already_registered".to_string(),
        -25210 => "notification_not_registered".to_string(),
        -25211 => "api_disabled".to_string(),
        -25212 => "no_value".to_string(),
        -25213 => "parameterized_attribute_unsupported".to_string(),
        -25214 => "not_enough_precision".to_string(),
        other => format!("unknown_ax_error_{other}"),
    }
}
