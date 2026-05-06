import { InteractionSettings, ProviderSettings } from '../domain/correction';

const providerSettingsKey = 'lingo-capsule.provider-settings.v1';
const interactionSettingsKey = 'lingo-capsule.interaction-settings.v1';
const legacyDefaultExcludedApps = 'Terminal, iTerm, Warp, Ghostty, WezTerm, Stable';

export const defaultProviderSettings: ProviderSettings = {
  baseUrl: 'https://sub.slnt.dev',
  apiKey: '',
  model: 'gpt-5.4-mini',
  wireApi: 'responses',
};

export const defaultInteractionSettings: InteractionSettings = {
  autoModeEnabled: true,
  autoDebounceMs: 900,
  autoMinChars: 4,
  triggerModeEnabled: true,
  triggerTokens: '~~, ～～',
  triggerMaxChars: 900,
  manualHotkey: 'Cmd+Shift+L',
  excludedApps: 'Terminal, iTerm, Warp, Ghostty, WezTerm',
  dailyReviewEnabled: true,
  dailyReviewTime: '22:30',
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.max(min, Math.min(max, value)))
    : fallback;
}

export function loadProviderSettings(): ProviderSettings {
  try {
    return {
      ...defaultProviderSettings,
      ...(JSON.parse(window.localStorage.getItem(providerSettingsKey) || '{}') as Partial<ProviderSettings>),
    };
  } catch {
    return defaultProviderSettings;
  }
}

export function saveProviderSettings(settings: ProviderSettings) {
  window.localStorage.setItem(providerSettingsKey, JSON.stringify(settings));
}

export function loadInteractionSettings(): InteractionSettings {
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(interactionSettingsKey) || '{}',
    ) as Partial<InteractionSettings>;

    return normalizeInteractionSettings(stored);
  } catch {
    return defaultInteractionSettings;
  }
}

export function saveInteractionSettings(settings: InteractionSettings) {
  window.localStorage.setItem(
    interactionSettingsKey,
    JSON.stringify(normalizeInteractionSettings(settings)),
  );
}

export function normalizeInteractionSettings(
  settings: Partial<InteractionSettings>,
): InteractionSettings {
  const merged = {
    ...defaultInteractionSettings,
    ...settings,
  };
  const excludedApps =
    merged.excludedApps === legacyDefaultExcludedApps
      ? defaultInteractionSettings.excludedApps
      : merged.excludedApps;

  return {
    ...merged,
    excludedApps,
    autoDebounceMs: clampNumber(
      merged.autoDebounceMs,
      defaultInteractionSettings.autoDebounceMs,
      300,
      4000,
    ),
    autoMinChars: clampNumber(
      merged.autoMinChars,
      defaultInteractionSettings.autoMinChars,
      1,
      80,
    ),
    triggerMaxChars: clampNumber(
      merged.triggerMaxChars,
      defaultInteractionSettings.triggerMaxChars,
      80,
      4000,
    ),
  };
}
