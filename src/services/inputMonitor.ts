import { invoke } from '@tauri-apps/api/core';
import { canUseTauriCommands } from './tauriRuntime';

export interface InputKeyPayload {
  text: string;
  keyCode: number;
  flags: number;
  activeApp?: string | null;
  targetPid?: number | null;
}

export async function startInputMonitor(): Promise<void> {
  if (!canUseTauriCommands()) {
    return;
  }

  await invoke('start_input_monitor');
}

export async function openInputMonitoringSettings(): Promise<void> {
  if (canUseTauriCommands()) {
    await invoke('open_input_monitoring_settings');
  }
}
