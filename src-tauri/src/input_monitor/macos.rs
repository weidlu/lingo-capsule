use std::{
    ffi::c_void,
    path::Path,
    process::Command,
    ptr,
    sync::atomic::{AtomicBool, Ordering},
    sync::mpsc,
    thread,
    time::Duration,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

type CFAllocatorRef = *const c_void;
type CFMachPortRef = *mut c_void;
type CFRunLoopRef = *mut c_void;
type CFRunLoopSourceRef = *mut c_void;
type CFStringRef = *const c_void;
type Boolean = u8;
type CGEventFlags = u64;
type CGEventMask = u64;
type CGEventRef = *mut c_void;
type CGEventTapLocation = u32;
type CGEventTapOptions = u32;
type CGEventTapPlacement = u32;
type CGEventType = u32;
type CGEventField = u32;
type CGEventTapProxy = *mut c_void;
type UniChar = u16;

const K_CG_HID_EVENT_TAP: CGEventTapLocation = 0;
const K_CG_HEAD_INSERT_EVENT_TAP: CGEventTapPlacement = 0;
const K_CG_EVENT_TAP_OPTION_LISTEN_ONLY: CGEventTapOptions = 1;
const K_CG_EVENT_KEY_DOWN: CGEventType = 10;
const K_CG_KEYBOARD_EVENT_KEYCODE: CGEventField = 9;
const K_CG_EVENT_TARGET_UNIX_PROCESS_ID: CGEventField = 40;
const MAX_UNICODE_CHARS: usize = 8;
const PROC_PIDPATHINFO_MAXSIZE: usize = 4096;

static INPUT_MONITOR_STARTED: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InputKeyPayload {
    text: String,
    key_code: i64,
    flags: u64,
    active_app: Option<String>,
    target_pid: Option<i64>,
}

struct MonitorContext {
    app: AppHandle,
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn CGEventTapCreate(
        tap: CGEventTapLocation,
        place: CGEventTapPlacement,
        options: CGEventTapOptions,
        events_of_interest: CGEventMask,
        callback: extern "C" fn(
            proxy: CGEventTapProxy,
            event_type: CGEventType,
            event: CGEventRef,
            user_info: *mut c_void,
        ) -> CGEventRef,
        user_info: *mut c_void,
    ) -> CFMachPortRef;
    fn CGEventKeyboardGetUnicodeString(
        event: CGEventRef,
        max_string_length: usize,
        actual_string_length: *mut usize,
        unicode_string: *mut UniChar,
    );
    fn CGEventGetIntegerValueField(event: CGEventRef, field: CGEventField) -> i64;
    fn CGEventGetFlags(event: CGEventRef) -> CGEventFlags;
    fn CGEventTapEnable(tap: CFMachPortRef, enable: Boolean);
    fn CGPreflightListenEventAccess() -> Boolean;
}

extern "C" {
    fn proc_pidpath(pid: i32, buffer: *mut c_void, buffersize: u32) -> i32;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    static kCFRunLoopCommonModes: CFStringRef;

    fn CFMachPortCreateRunLoopSource(
        allocator: CFAllocatorRef,
        port: CFMachPortRef,
        order: isize,
    ) -> CFRunLoopSourceRef;
    fn CFRunLoopAddSource(rl: CFRunLoopRef, source: CFRunLoopSourceRef, mode: CFStringRef);
    fn CFRunLoopGetCurrent() -> CFRunLoopRef;
    fn CFRunLoopRun();
}

pub fn start(app: AppHandle) -> Result<(), String> {
    if INPUT_MONITOR_STARTED.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    if unsafe { CGPreflightListenEventAccess() } == 0 {
        INPUT_MONITOR_STARTED.store(false, Ordering::SeqCst);
        return Err(
            "input_monitor_permission_missing_grant_input_monitoring_to_lingocapsule".to_string(),
        );
    }

    let (tx, rx) = mpsc::channel();

    thread::spawn(move || {
        let context = Box::new(MonitorContext { app });
        let user_info = Box::into_raw(context) as *mut c_void;
        let key_down_mask = 1_u64 << K_CG_EVENT_KEY_DOWN;

        let event_tap = unsafe {
            CGEventTapCreate(
                K_CG_HID_EVENT_TAP,
                K_CG_HEAD_INSERT_EVENT_TAP,
                K_CG_EVENT_TAP_OPTION_LISTEN_ONLY,
                key_down_mask,
                keyboard_callback,
                user_info,
            )
        };

        if event_tap.is_null() {
            INPUT_MONITOR_STARTED.store(false, Ordering::SeqCst);
            let _ = unsafe { Box::from_raw(user_info as *mut MonitorContext) };
            let _ = tx.send(Err(
                "input_monitor_event_tap_unavailable_or_permission_missing".to_string(),
            ));
            return;
        }

        let run_loop_source = unsafe { CFMachPortCreateRunLoopSource(ptr::null(), event_tap, 0) };

        if run_loop_source.is_null() {
            INPUT_MONITOR_STARTED.store(false, Ordering::SeqCst);
            let _ = tx.send(Err("input_monitor_run_loop_source_unavailable".to_string()));
            return;
        }

        unsafe {
            CFRunLoopAddSource(
                CFRunLoopGetCurrent(),
                run_loop_source,
                kCFRunLoopCommonModes,
            );
            CGEventTapEnable(event_tap, 1);
        }

        let _ = tx.send(Ok(()));
        unsafe { CFRunLoopRun() };
    });

    rx.recv_timeout(Duration::from_millis(700))
        .map_err(|_| "input_monitor_start_timeout".to_string())?
}

pub fn open_settings() -> Result<(), String> {
    let status = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent")
        .status()
        .map_err(|error| format!("failed_to_open_input_monitoring_settings:{error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "open_input_monitoring_settings_exit_status:{}",
            status.code().unwrap_or_default()
        ))
    }
}

extern "C" fn keyboard_callback(
    _proxy: CGEventTapProxy,
    event_type: CGEventType,
    event: CGEventRef,
    user_info: *mut c_void,
) -> CGEventRef {
    if event_type != K_CG_EVENT_KEY_DOWN || event.is_null() || user_info.is_null() {
        return event;
    }

    let mut actual_length = 0usize;
    let mut buffer = [0_u16; MAX_UNICODE_CHARS];
    unsafe {
        CGEventKeyboardGetUnicodeString(
            event,
            MAX_UNICODE_CHARS,
            &mut actual_length,
            buffer.as_mut_ptr(),
        );
    }

    let text = if actual_length > 0 {
        String::from_utf16_lossy(&buffer[..actual_length.min(MAX_UNICODE_CHARS)])
    } else {
        String::new()
    };

    let target_pid =
        unsafe { CGEventGetIntegerValueField(event, K_CG_EVENT_TARGET_UNIX_PROCESS_ID) };
    let active_app = app_name_for_pid(target_pid);
    let payload = InputKeyPayload {
        text,
        key_code: unsafe { CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_KEYCODE) },
        flags: unsafe { CGEventGetFlags(event) },
        active_app,
        target_pid: (target_pid > 0).then_some(target_pid),
    };

    let context = unsafe { &*(user_info as *const MonitorContext) };
    let _ = context.app.emit("lingo://input-key", payload);

    event
}

fn app_name_for_pid(pid: i64) -> Option<String> {
    if pid <= 0 || pid > i32::MAX as i64 {
        return None;
    }

    let mut buffer = [0_u8; PROC_PIDPATHINFO_MAXSIZE];
    let length = unsafe {
        proc_pidpath(
            pid as i32,
            buffer.as_mut_ptr() as *mut c_void,
            PROC_PIDPATHINFO_MAXSIZE as u32,
        )
    };

    if length <= 0 {
        return None;
    }

    let path = String::from_utf8_lossy(&buffer[..length as usize]);
    let app_component = Path::new(path.as_ref())
        .components()
        .filter_map(|component| component.as_os_str().to_str())
        .find(|component| component.ends_with(".app"));

    app_component
        .map(|component| component.trim_end_matches(".app").to_string())
        .or_else(|| {
            Path::new(path.as_ref())
                .file_stem()
                .and_then(|value| value.to_str())
                .map(ToString::to_string)
        })
        .filter(|value| !value.trim().is_empty())
}
