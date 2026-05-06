type TauriWindow = Window & {
  __TAURI_INTERNALS__?: {
    invoke?: unknown;
  };
};

export function canUseTauriCommands(): boolean {
  const tauriInternals = (window as TauriWindow).__TAURI_INTERNALS__;
  return Boolean(
    tauriInternals &&
      typeof tauriInternals === 'object' &&
      typeof tauriInternals.invoke === 'function',
  );
}
