import { invoke } from '@tauri-apps/api/core';
import { canUseTauriCommands } from './tauriRuntime';

export type SupportTier = 'Tier A' | 'Tier B' | 'Tier C';

export interface AdapterEvent {
  id: string;
  timestampMs: number;
  operation: 'capture' | 'replace';
  success: boolean;
  activeApp: string | null;
  surface: string;
  supportTier: SupportTier;
  path: string;
  charCount: number;
  failureModes: string[];
}

export interface ElementFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureResult {
  text: string;
  selectedText: string | null;
  activeApp: string | null;
  focusedRole: string | null;
  focusedTitle: string | null;
  focusedFrame: ElementFrame | null;
  surface: string;
  supportTier: SupportTier;
  path: string;
  canReplaceWithAccessibility: boolean;
  failureModes: string[];
  event: AdapterEvent;
}

export interface ReplaceResult {
  activeApp: string | null;
  surface: string;
  supportTier: SupportTier;
  path: string;
  replacedCharCount: number;
  failureModes: string[];
  event: AdapterEvent;
}

export interface CaptureOptions {
  allowClipboardFallback?: boolean;
}

export interface ClipboardCaptureOptions {
  maxChars?: number;
}

const previewText =
  'I am agree we should discuss about this later. Let me know your thought.';
const previewEvents: AdapterEvent[] = [];

function createPreviewEvent(
  operation: AdapterEvent['operation'],
  charCount: number,
  success = true,
): AdapterEvent {
  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestampMs: Date.now(),
    operation,
    success,
    activeApp: 'Browser preview',
    surface: 'Browser webapps',
    supportTier: 'Tier C',
    path: 'previewFallback',
    charCount,
    failureModes: ['Native macOS adapter is only available inside the Tauri app.'],
  };
}

function rememberPreviewEvent(event: AdapterEvent) {
  previewEvents.unshift(event);
  previewEvents.splice(20);
}

export async function captureFocusedText(options: CaptureOptions = {}): Promise<CaptureResult> {
  if (canUseTauriCommands()) {
    return invoke<CaptureResult>('capture_focused_text', {
      request: {
        allowClipboardFallback: options.allowClipboardFallback ?? true,
      },
    });
  }

  const event = createPreviewEvent('capture', previewText.length);
  rememberPreviewEvent(event);

  return {
    text: previewText,
    selectedText: previewText,
    activeApp: event.activeApp,
    focusedRole: 'AXTextArea',
    focusedTitle: 'Preview fallback',
    focusedFrame: {
      x: 720,
      y: 580,
      width: 760,
      height: 74,
    },
    surface: event.surface,
    supportTier: event.supportTier,
    path: event.path,
    canReplaceWithAccessibility: false,
    failureModes: event.failureModes,
    event,
  };
}

export async function captureClipboardText(options: ClipboardCaptureOptions = {}): Promise<CaptureResult> {
  if (canUseTauriCommands()) {
    return invoke<CaptureResult>('capture_clipboard_text', {
      request: {
        maxChars: options.maxChars ?? 1200,
      },
    });
  }

  const text = navigator.clipboard
    ? (await navigator.clipboard.readText().catch(() => '')) || previewText
    : previewText;
  const event = createPreviewEvent('capture', text.length);
  rememberPreviewEvent(event);

  return {
    text,
    selectedText: text,
    activeApp: 'Manual clipboard',
    focusedRole: null,
    focusedTitle: 'Clipboard',
    focusedFrame: null,
    surface: 'Other desktop apps',
    supportTier: 'Tier B',
    path: 'clipboardRead',
    canReplaceWithAccessibility: false,
    failureModes: ['manual_clipboard_capture_user_initiated'],
    event: {
      ...event,
      activeApp: 'Manual clipboard',
      surface: 'Other desktop apps',
      supportTier: 'Tier B',
      path: 'clipboardRead',
      failureModes: ['manual_clipboard_capture_user_initiated'],
    },
  };
}

export async function replaceFocusedText(
  replacementText: string,
  preferredPath?: string | null,
): Promise<ReplaceResult> {
  if (canUseTauriCommands()) {
    return invoke<ReplaceResult>('replace_focused_text', {
      request: { replacementText, preferredPath },
    });
  }

  await navigator.clipboard?.writeText(replacementText).catch(() => undefined);
  const event = createPreviewEvent('replace', replacementText.length);
  rememberPreviewEvent(event);

  return {
    activeApp: event.activeApp,
    surface: event.surface,
    supportTier: event.supportTier,
    path: event.path,
    replacedCharCount: replacementText.length,
    failureModes: event.failureModes,
    event,
  };
}

export async function listTextAdapterEvents(limit = 100): Promise<AdapterEvent[]> {
  if (canUseTauriCommands()) {
    return invoke<AdapterEvent[]>('list_text_adapter_events', { limit });
  }

  return previewEvents;
}

export async function openAccessibilitySettings(): Promise<void> {
  if (canUseTauriCommands()) {
    return invoke('open_accessibility_settings');
  }

  throw new Error('Open the packaged Tauri app to manage macOS Accessibility permissions.');
}

export async function hasAccessibilityPermission(): Promise<boolean> {
  if (canUseTauriCommands()) {
    return invoke<boolean>('has_accessibility_permission');
  }

  return true;
}

export async function frontmostAppName(): Promise<string | null> {
  if (canUseTauriCommands()) {
    return invoke<string | null>('frontmost_app_name');
  }

  return 'Browser preview';
}
