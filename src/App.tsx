import {
  LogicalPosition,
  LogicalSize,
  getCurrentWindow,
} from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CorrectionIssue,
  CorrectionPipelineState,
  CorrectionResult,
  CorrectionSuggestion,
  HistoryEntry,
  InteractionSettings,
  ProviderSettings,
  isSecureText,
} from "./domain/correction";
import { analyzeTextWithProvider } from "./services/openaiClient";
import {
  acceptHistorySuggestion,
  insertHistoryEntry,
  listHistoryEntries,
} from "./services/historyStore";
import {
  InputKeyPayload,
  openInputMonitoringSettings,
  startInputMonitor,
} from "./services/inputMonitor";
import {
  loadInteractionSettings,
  loadProviderSettings,
  normalizeInteractionSettings,
  saveInteractionSettings,
} from "./services/settingsStore";
import { canUseTauriCommands } from "./services/tauriRuntime";
import {
  AdapterEvent,
  CaptureResult,
  ElementFrame,
  captureClipboardText,
  captureFocusedText,
  frontmostAppName,
  hasAccessibilityPermission,
  listTextAdapterEvents,
  openAccessibilitySettings,
  replaceFocusedText,
} from "./services/textAdapter";
import "./App.css";

const exampleText = "I am agree we should discuss about this later.";
const collapsedSize = { width: 292, height: 76 };
const expandedSize = { width: 520, height: 680 };
const pollIntervalMs = 900;
const appNamePattern = /lingo[-\s]?capsule/i;
const autoOnlyDevelopmentAppPattern =
  /codex|chatgpt|cursor|visual studio code|vscode|windsurf|zed|xcode|stable/i;
const editableRolePattern = /AX(TextArea|TextField|ComboBox|SearchField)/i;
const nonEditableRolePattern =
  /AX(WebArea|Button|Link|StaticText|Image|Group|Table|Row|Cell|ScrollArea|List|Heading)/i;
const inputLikeFrameMaxHeight = 420;
const manualClipboardMaxChars = 1200;
const backspaceKeyCode = 51;
const deleteKeyCode = 117;
const enterKeyCodes = new Set([36, 76]);
const escapeKeyCode = 53;
const commandFlagMask = 1 << 20;
const shiftFlagMask = 1 << 17;
const controlFlagMask = 1 << 18;
const optionFlagMask = 1 << 19;
const keyboardBufferIdleResetMs = 120_000;
const dailyReviewStateKey = "lingo-capsule.daily-review-state.v1";
const macKeyCodeLabels: Record<number, string> = {
  0: "a",
  1: "s",
  2: "d",
  3: "f",
  4: "h",
  5: "g",
  6: "z",
  7: "x",
  8: "c",
  9: "v",
  11: "b",
  12: "q",
  13: "w",
  14: "e",
  15: "r",
  16: "y",
  17: "t",
  18: "1",
  19: "2",
  20: "3",
  21: "4",
  22: "6",
  23: "5",
  24: "=",
  25: "9",
  26: "7",
  27: "-",
  28: "8",
  29: "0",
  30: "]",
  31: "o",
  32: "u",
  33: "[",
  34: "i",
  35: "p",
  37: "l",
  38: "j",
  39: "'",
  40: "k",
  41: ";",
  42: "\\",
  43: ",",
  44: "/",
  45: "n",
  46: "m",
  47: ".",
  50: "`",
};

type AssistantMode = "capsule" | "popover";
type PanelView = "coach" | "settings" | "review";
type CaptureOrigin = "auto" | "manualClipboard" | "symbolTrigger" | "hotkey";

interface DailyReview {
  date: string;
  summary: string;
  focus: string[];
  checkedCount: number;
  needsImprovementCount: number;
  acceptedCount: number;
}

interface DailyReviewState {
  lastRunDate?: string;
  review?: DailyReview;
}

function emptyState(): CorrectionPipelineState {
  return {
    phase: "idle",
    message: "Start typing and pause for a moment.",
  };
}

function getNudgeCount(result?: CorrectionResult): number {
  if (!result || result.status !== "needs_improvement") {
    return 0;
  }

  return Math.max(
    1,
    Math.min(3, result.issues.length || result.suggestions.length),
  );
}

function capsuleDisplay(state: CorrectionPipelineState) {
  if (state.phase === "debouncing") {
    return {
      tone: "busy",
      label: "Listening",
      detail: "Waiting for pause",
    };
  }

  if (state.phase === "checking") {
    return {
      tone: "busy",
      label: "Checking",
      detail: "Reading tone",
    };
  }

  if (state.phase === "blocked") {
    return {
      tone: "blocked",
      label: "Private",
      detail: "Skipped safely",
    };
  }

  if (state.phase === "failed") {
    return {
      tone: "failed",
      label: "Need Access",
      detail: "Enable macOS",
    };
  }

  if (state.result?.status === "native") {
    return {
      tone: "native",
      label: "All clear",
      detail: "Meaning clear",
    };
  }

  if (state.result?.status === "needs_improvement") {
    const count = getNudgeCount(state.result);
    return {
      tone: "tips",
      label: `${count} Nudge${count === 1 ? "" : "s"}`,
      detail: "Meaning clear",
    };
  }

  return {
    tone: "idle",
    label: "Ready",
    detail: "Watching input",
  };
}

function getDiagnosisText(state: CorrectionPipelineState) {
  return state.error || state.result?.summaryZh || state.message;
}

function getSelectedSuggestion(
  state: CorrectionPipelineState,
): CorrectionSuggestion | undefined {
  const acceptedSuggestionId = state.historyEntry?.acceptedSuggestionId;

  return (
    state.result?.suggestions.find(
      (suggestion) => suggestion.id === acceptedSuggestionId,
    ) ?? state.result?.suggestions[0]
  );
}

function inferReplacement(issue: CorrectionIssue, rewrite: string): string {
  const excerpt = issue.excerpt?.trim();

  if (!excerpt) {
    return "see rewrite";
  }

  const normalized = excerpt.toLowerCase();

  if (normalized.includes("i am agree") && /\bi agree\b/i.test(rewrite)) {
    return "I agree";
  }

  if (normalized.includes("discuss about") && /\bdiscuss\b/i.test(rewrite)) {
    return "discuss";
  }

  if (normalized.includes("happend") && /\bhappened\b/i.test(rewrite)) {
    return "happened";
  }

  if (normalized.includes("your thought")) {
    const match = rewrite.match(/what you think|your thoughts/i);
    return match?.[0] ?? "your thoughts";
  }

  return rewrite ? "see rewrite" : "natural phrasing";
}

function buildNudgeRows(
  result: CorrectionResult | undefined,
  selectedSuggestion: CorrectionSuggestion | undefined,
) {
  if (!result || result.status !== "needs_improvement") {
    return [];
  }

  const rewrite =
    selectedSuggestion?.rewrite ?? result.suggestions[0]?.rewrite ?? "";

  return result.issues.slice(0, 3).map((issue) => ({
    before: issue.excerpt?.trim() || issue.title,
    after: inferReplacement(issue, rewrite),
    note: issue.explanationZh,
    title: issue.title,
  }));
}

function labelForCapture(capture: CaptureResult | null): string {
  if (capture?.path === "clipboardRead") {
    return "Manual clipboard";
  }

  if (capture?.path === "keyboardBuffer") {
    return capture.activeApp || "Typing trigger";
  }

  return capture?.activeApp || capture?.focusedTitle || "Active input";
}

function parseCommaList(value: string): string[] {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shouldSkipProviderAnalysis(
  sourceContext: string,
  interactionSettings: InteractionSettings,
): boolean {
  const excludedApps = parseCommaList(interactionSettings.excludedApps);

  if (excludedApps.length === 0) {
    return false;
  }

  return new RegExp(excludedApps.map(escapeRegExp).join("|"), "i").test(
    sourceContext,
  );
}

function shouldSkipAutoCapture(
  capture: CaptureResult,
  interactionSettings: InteractionSettings,
): boolean {
  const sourceLabel = labelForCapture(capture);

  return (
    appNamePattern.test(sourceLabel) ||
    shouldSkipProviderAnalysis(sourceLabel, interactionSettings) ||
    autoOnlyDevelopmentAppPattern.test(sourceLabel)
  );
}

function triggerTokens(settings: InteractionSettings): string[] {
  return parseCommaList(settings.triggerTokens).filter(
    (token, index, tokens) => token && tokens.indexOf(token) === index,
  );
}

function stripConfiguredTrigger(
  value: string,
  settings: InteractionSettings,
): { text: string; token: string } | null {
  const tokens = triggerTokens(settings).sort((a, b) => b.length - a.length);
  const trimmedEnd = value.trimEnd();
  const token = tokens.find((candidate) => trimmedEnd.endsWith(candidate));

  if (!token) {
    return null;
  }

  return {
    text: trimmedEnd.slice(0, -token.length),
    token,
  };
}

function recentSegment(value: string, maxChars: number): string {
  const afterLineBreak = value.split(/\n+/).pop() ?? value;
  const normalized = afterLineBreak.trim();
  const chars = Array.from(normalized);

  return chars.slice(Math.max(0, chars.length - maxChars)).join("").trim();
}

function recentSegmentBeforeTrigger(
  value: string,
  token: string,
  maxChars: number,
): string {
  const withoutTrigger = value.trimEnd().endsWith(token)
    ? value.trimEnd().slice(0, -token.length)
    : value;
  const previousTriggerIndex = withoutTrigger.lastIndexOf(token);
  const afterPreviousTrigger =
    previousTriggerIndex >= 0
      ? withoutTrigger.slice(previousTriggerIndex + token.length)
      : withoutTrigger;
  const afterLineBreak = afterPreviousTrigger.split(/\n+/).pop() ?? afterPreviousTrigger;
  const normalized = afterLineBreak.trim();
  const chars = Array.from(normalized);

  return chars.slice(Math.max(0, chars.length - maxChars)).join("").trim();
}

function createSyntheticCapture(
  text: string,
  origin: Extract<CaptureOrigin, "symbolTrigger" | "hotkey">,
  activeApp?: string | null,
): CaptureResult {
  const path = "keyboardBuffer";
  const sourceApp =
    activeApp || (origin === "hotkey" ? "Hotkey trigger" : "Typing trigger");
  const event: AdapterEvent = {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestampMs: Date.now(),
    operation: "capture",
    success: true,
    activeApp: sourceApp,
    surface: "Electron chat apps",
    supportTier: "Tier B",
    path,
    charCount: text.length,
    failureModes: [`${origin}_user_initiated_keyboard_buffer`],
  };

  return {
    text,
    selectedText: text,
    activeApp: sourceApp,
    focusedRole: null,
    focusedTitle: origin === "hotkey" ? "Configured hotkey" : "Configured trigger",
    focusedFrame: null,
    surface: event.surface,
    supportTier: event.supportTier,
    path,
    canReplaceWithAccessibility: false,
    failureModes: event.failureModes,
    event,
  };
}

function parseShortcut(shortcut: string) {
  const parts = shortcut
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const key = parts.find(
    (part) => !["cmd", "command", "shift", "ctrl", "control", "option", "alt"].includes(part),
  );

  return {
    key,
    command: parts.some((part) => part === "cmd" || part === "command"),
    shift: parts.includes("shift"),
    control: parts.some((part) => part === "ctrl" || part === "control"),
    option: parts.some((part) => part === "option" || part === "alt"),
  };
}

function shortcutMatches(payload: InputKeyPayload, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);
  const payloadKey =
    payload.text.trim().toLowerCase() ||
    macKeyCodeLabels[payload.keyCode]?.toLowerCase() ||
    "";

  if (!parsed.key || payloadKey !== parsed.key.toLowerCase()) {
    return false;
  }

  const hasCommand = (payload.flags & commandFlagMask) !== 0;
  const hasShift = (payload.flags & shiftFlagMask) !== 0;
  const hasControl = (payload.flags & controlFlagMask) !== 0;
  const hasOption = (payload.flags & optionFlagMask) !== 0;

  return (
    hasCommand === parsed.command &&
    hasShift === parsed.shift &&
    hasControl === parsed.control &&
    hasOption === parsed.option
  );
}

function appendKeyToBuffer(buffer: string, payload: InputKeyPayload, maxChars: number): string {
  if (payload.keyCode === backspaceKeyCode || payload.keyCode === deleteKeyCode) {
    return Array.from(buffer).slice(0, -1).join("");
  }

  if (payload.keyCode === escapeKeyCode || enterKeyCodes.has(payload.keyCode)) {
    return "";
  }

  if (!payload.text || /[\u0000-\u001f\u007f]/.test(payload.text)) {
    return buffer;
  }

  const next = `${buffer}${payload.text}`;
  const chars = Array.from(next);

  return chars.slice(Math.max(0, chars.length - maxChars)).join("");
}

function todayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

function minutesFromTime(value: string): number {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return 22 * 60 + 30;
  }

  const hours = Math.max(0, Math.min(23, Number(match[1])));
  const minutes = Math.max(0, Math.min(59, Number(match[2])));

  return hours * 60 + minutes;
}

function minutesNow(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function loadDailyReviewState(): DailyReviewState {
  try {
    return JSON.parse(
      window.localStorage.getItem(dailyReviewStateKey) || "{}",
    ) as DailyReviewState;
  } catch {
    return {};
  }
}

function saveDailyReviewState(state: DailyReviewState) {
  window.localStorage.setItem(dailyReviewStateKey, JSON.stringify(state));
}

function buildDailyReview(entries: HistoryEntry[]): DailyReview {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todaysEntries = entries.filter(
    (entry) => entry.createdAt >= startOfToday.getTime(),
  );
  const needsImprovement = todaysEntries.filter(
    (entry) => entry.status === "needs_improvement",
  );
  const acceptedCount = todaysEntries.filter((entry) => entry.acceptedAt).length;
  const issueCounts = new Map<string, { count: number; excerpt?: string }>();

  for (const entry of needsImprovement) {
    for (const issue of entry.issues) {
      const key = issue.title || "表达可以更自然";
      const current = issueCounts.get(key) ?? { count: 0, excerpt: issue.excerpt };
      issueCounts.set(key, {
        count: current.count + 1,
        excerpt: current.excerpt || issue.excerpt,
      });
    }
  }

  const focus = [...issueCounts.entries()]
    .sort((left, right) => right[1].count - left[1].count)
    .slice(0, 3)
    .map(([title, detail]) =>
      detail.excerpt
        ? `${title}: 留意 “${detail.excerpt}”`
        : title,
    );

  const summary =
    todaysEntries.length === 0
      ? "今天还没有记录到英文纠正。明天先用一两句真实输入喂给 Lingo。"
      : `今天检查了 ${todaysEntries.length} 次英文，${needsImprovement.length} 次需要调整，接受了 ${acceptedCount} 个建议。`;

  return {
    date: todayKey(),
    summary,
    focus:
      focus.length > 0
        ? focus
        : ["今天没有明显重复错误，继续观察真实输入。"],
    checkedCount: todaysEntries.length,
    needsImprovementCount: needsImprovement.length,
    acceptedCount,
  };
}

function isEditableCapture(capture: CaptureResult): boolean {
  if (capture.canReplaceWithAccessibility) {
    return true;
  }

  const focusedRole = capture.focusedRole ?? "";

  if (editableRolePattern.test(focusedRole)) {
    return true;
  }

  if (focusedRole && nonEditableRolePattern.test(focusedRole)) {
    return false;
  }

  const frame = capture.focusedFrame;
  return (
    capture.path === "accessibilityValue" &&
    !!frame &&
    frame.height > 16 &&
    frame.height <= inputLikeFrameMaxHeight
  );
}

function positionForFrame(
  frame: ElementFrame | null | undefined,
  size: { width: number; height: number },
): { x: number; y: number } {
  const gutter = 12;
  const maxX = Math.max(gutter, window.screen.availWidth - size.width - gutter);
  const maxY = Math.max(gutter, window.screen.availHeight - size.height - gutter);

  if (!frame) {
    const isExpanded = size.height > collapsedSize.height;

    return {
      x: Math.min(
        maxX,
        Math.max(gutter, window.screen.availWidth - size.width - 24),
      ),
      y: isExpanded
        ? Math.min(maxY, Math.max(gutter, 72))
        : Math.min(
            maxY,
            Math.max(gutter, window.screen.availHeight - size.height - 72),
          ),
    };
  }

  const x = Math.min(
    maxX,
    Math.max(gutter, frame.x + frame.width - size.width - gutter),
  );
  const yAbove = frame.y - size.height - gutter;
  const y = yAbove > gutter ? yAbove : frame.y + frame.height + gutter;

  return {
    x,
    y: Math.min(maxY, Math.max(gutter, y)),
  };
}

function formatEventTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatFailureModes(event: AdapterEvent): string {
  return event.failureModes.length > 0 ? event.failureModes.join(", ") : "ok";
}

async function syncNativeWindow(
  mode: AssistantMode,
  frame: ElementFrame | null | undefined,
) {
  if (!canUseTauriCommands()) {
    return;
  }

  const size = mode === "capsule" ? collapsedSize : expandedSize;
  const currentWindow = getCurrentWindow();
  await currentWindow.setFocusable(true).catch(() => undefined);
  await currentWindow.setIgnoreCursorEvents(false).catch(() => undefined);
  await currentWindow.setSize(new LogicalSize(size.width, size.height));

  const position = positionForFrame(frame, size);
  await currentWindow.setPosition(new LogicalPosition(position.x, position.y));

  await currentWindow.show();
}

async function parkNativeWindow() {
  if (!canUseTauriCommands()) {
    return;
  }

  const currentWindow = getCurrentWindow();
  await currentWindow.setFocusable(false).catch(() => undefined);
  await currentWindow.setIgnoreCursorEvents(false).catch(() => undefined);
  await currentWindow
    .setSize(new LogicalSize(collapsedSize.width, collapsedSize.height))
    .catch(() => undefined);
  const position = positionForFrame(null, collapsedSize);
  await currentWindow.setPosition(new LogicalPosition(position.x, position.y));
  await currentWindow.show();
}

async function startNativeDrag() {
  if (!canUseTauriCommands()) {
    return;
  }

  await getCurrentWindow().startDragging();
}

function App() {
  const [capturedText, setCapturedText] = useState(
    canUseTauriCommands() ? "" : exampleText,
  );
  const [sourceContext, setSourceContext] = useState(
    canUseTauriCommands() ? "Active input" : "Browser preview",
  );
  const [latestCapture, setLatestCapture] = useState<CaptureResult | null>(
    null,
  );
  const [settings] = useState<ProviderSettings>(() => loadProviderSettings());
  const [interactionSettings, setInteractionSettings] =
    useState<InteractionSettings>(() => loadInteractionSettings());
  const [pipelineState, setPipelineState] =
    useState<CorrectionPipelineState>(emptyState);
  const [mode, setMode] = useState<AssistantMode>("capsule");
  const [panelView, setPanelView] = useState<PanelView>("coach");
  const [adapterBusy, setAdapterBusy] = useState(false);
  const [manualVisible, setManualVisible] = useState(canUseTauriCommands());
  const [captureOrigin, setCaptureOrigin] = useState<CaptureOrigin>("auto");
  const [adapterEvents, setAdapterEvents] = useState<AdapterEvent[]>([]);
  const [dailyReview, setDailyReview] = useState<DailyReview | undefined>(
    () => loadDailyReviewState().review,
  );
  const requestId = useRef(0);
  const lastCapturedText = useRef("");
  const keyboardBuffer = useRef("");
  const keyboardBufferApp = useRef<string | null>(null);
  const keyboardBufferPid = useRef<number | null>(null);
  const lastKeyboardEventAt = useRef(0);
  const suppressedText = useRef<string | null>(null);
  const modeRef = useRef<AssistantMode>("capsule");
  const explicitCaptureActive = useRef(false);
  const captureMutationEpoch = useRef(0);

  const bumpCaptureEpoch = () => {
    captureMutationEpoch.current += 1;
    return captureMutationEpoch.current;
  };

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const refreshAdapterEvents = async () => {
    try {
      setAdapterEvents(await listTextAdapterEvents(8));
    } catch {
      setAdapterEvents([]);
    }
  };

  const generateDailyReview = async (openReview = false) => {
    const review = buildDailyReview(await listHistoryEntries(200));
    const state = {
      lastRunDate: review.date,
      review,
    };
    saveDailyReviewState(state);
    setDailyReview(review);

    if (openReview) {
      explicitCaptureActive.current = true;
      modeRef.current = "popover";
      bumpCaptureEpoch();
      setPanelView("review");
      setManualVisible(true);
      setMode("popover");
      await syncNativeWindow("popover", null).catch(() => undefined);
    }
  };

  const updateInteractionSettings = (
    patch: Partial<InteractionSettings>,
  ) => {
    setInteractionSettings((current) => {
      const next = normalizeInteractionSettings({
        ...current,
        ...patch,
      });
      saveInteractionSettings(next);
      return next;
    });
  };

  const acceptCapture = async (
    capture: CaptureResult,
    origin: CaptureOrigin,
  ) => {
    const nextText = capture.text.trim();

    if (nextText.length < interactionSettings.autoMinChars) {
      clearCapturedInput();
      return;
    }

    explicitCaptureActive.current = origin !== "auto";
    modeRef.current = "popover";
    bumpCaptureEpoch();
    setPanelView("coach");
    setManualVisible(true);
    setCaptureOrigin(origin);
    setLatestCapture(capture);
    setSourceContext(labelForCapture(capture));
    lastCapturedText.current = nextText;
    setCapturedText(capture.text);
    await syncNativeWindow("popover", capture.focusedFrame).catch(
      () => undefined,
    );
    setMode("popover");

    if (capture.path === "keyboardBuffer") {
      setAdapterEvents((events) => [
        capture.event,
        ...events.filter((event) => event.id !== capture.event.id),
      ].slice(0, 8));
    } else {
      void refreshAdapterEvents();
    }
  };

  const acceptTriggeredText = async (
    typedText: string,
    origin: Extract<CaptureOrigin, "symbolTrigger" | "hotkey">,
    token?: string,
    contextApp?: string | null,
  ) => {
    explicitCaptureActive.current = true;
    bumpCaptureEpoch();

    const activeApp =
      contextApp || (await frontmostAppName().catch(() => null));
    const sourceLabel =
      activeApp || (origin === "hotkey" ? "Hotkey trigger" : "Typing trigger");

    if (
      appNamePattern.test(sourceLabel) ||
      shouldSkipProviderAnalysis(sourceLabel, interactionSettings)
    ) {
      setManualVisible(true);
      setCaptureOrigin(origin);
      setSourceContext(sourceLabel);
      setPanelView("coach");
      setPipelineState({
        phase: "blocked",
        message:
          "LingoCapsule skipped this surface according to your excluded app settings.",
      });
      modeRef.current = "popover";
      await syncNativeWindow("popover", null).catch(() => undefined);
      setMode("popover");
      return;
    }

    const fallbackText = token
      ? recentSegmentBeforeTrigger(
          typedText,
          token,
          interactionSettings.triggerMaxChars,
        )
      : recentSegment(typedText, interactionSettings.triggerMaxChars);

    try {
      const focused = await captureFocusedText({
        allowClipboardFallback: false,
      });
      const focusedText = token
        ? recentSegmentBeforeTrigger(
            focused.text,
            token,
            interactionSettings.triggerMaxChars,
          )
        : recentSegment(focused.text, interactionSettings.triggerMaxChars);

      if (focusedText.trim()) {
        await acceptCapture(
          {
            ...focused,
            text: focusedText,
            selectedText: focusedText,
          },
          origin,
        );
        return;
      }
    } catch {
      // Rich editors such as Codex often hide draft text. The keyboard buffer
      // is explicit-trigger only, so this fallback stays user initiated.
    }

    if (fallbackText.length < interactionSettings.autoMinChars) {
      setManualVisible(true);
      setCaptureOrigin(origin);
      setSourceContext(sourceLabel);
      setPanelView("coach");
      setPipelineState({
        phase: "blocked",
        message:
          "LingoCapsule did not catch recent text for this trigger. Copy the text and use clipboard capture, or type a few words before triggering again.",
      });
      modeRef.current = "popover";
      await syncNativeWindow("popover", null).catch(() => undefined);
      setMode("popover");
      return;
    }

    await acceptCapture(createSyntheticCapture(fallbackText, origin, activeApp), origin);
  };

  const clearCapturedInput = () => {
    explicitCaptureActive.current = false;
    bumpCaptureEpoch();
    lastCapturedText.current = "";
    suppressedText.current = null;
    setCapturedText("");
    setLatestCapture(null);
    setSourceContext("Active input");
    setPipelineState(emptyState());
  };

  useEffect(() => {
    if (!canUseTauriCommands()) {
      return;
    }

    if (!interactionSettings.triggerModeEnabled) {
      return;
    }

    void startInputMonitor().catch((error) => {
      setPipelineState({
        phase: "failed",
        message:
          "Typing trigger monitoring could not start. macOS may need Input Monitoring permission.",
        error: error instanceof Error ? error.message : String(error),
      });
      setManualVisible(true);
      void syncNativeWindow("capsule", null).catch(() => undefined);
    });
  }, [interactionSettings.triggerModeEnabled]);

  useEffect(() => {
    if (!canUseTauriCommands() || !interactionSettings.triggerModeEnabled) {
      return;
    }

    let unlisten: (() => void) | undefined;
    let disposed = false;

    void listen<InputKeyPayload>("lingo://input-key", (event) => {
      if (disposed) {
        return;
      }

      const payload = event.payload;
      const now = Date.now();
      const payloadApp = payload.activeApp?.trim() || null;
      const payloadPid =
        typeof payload.targetPid === "number" && payload.targetPid > 0
          ? payload.targetPid
          : null;
      const appChangedByPid =
        payloadPid !== null &&
        keyboardBufferPid.current !== null &&
        payloadPid !== keyboardBufferPid.current;
      const appChangedByName =
        payloadPid === null &&
        payloadApp !== null &&
        keyboardBufferApp.current !== null &&
        payloadApp !== keyboardBufferApp.current;

      if (appChangedByPid || appChangedByName) {
        keyboardBuffer.current = "";
      }

      if (payloadApp) {
        keyboardBufferApp.current = payloadApp;
      }

      if (payloadPid !== null) {
        keyboardBufferPid.current = payloadPid;
      }

      if (payloadApp && appNamePattern.test(payloadApp)) {
        keyboardBuffer.current = "";
        return;
      }

      if (now - lastKeyboardEventAt.current > keyboardBufferIdleResetMs) {
        keyboardBuffer.current = "";
      }
      lastKeyboardEventAt.current = now;

      if (shortcutMatches(payload, interactionSettings.manualHotkey)) {
        const text = keyboardBuffer.current.trim();
        keyboardBuffer.current = "";
        void acceptTriggeredText(
          text,
          "hotkey",
          undefined,
          payloadApp || keyboardBufferApp.current,
        );
        return;
      }

      if ((payload.flags & commandFlagMask) !== 0) {
        return;
      }

      keyboardBuffer.current = appendKeyToBuffer(
        keyboardBuffer.current,
        payload,
        interactionSettings.triggerMaxChars + 32,
      );

      const trigger = stripConfiguredTrigger(
        keyboardBuffer.current,
        interactionSettings,
      );

      if (!trigger) {
        return;
      }

      const text = recentSegmentBeforeTrigger(
        keyboardBuffer.current,
        trigger.token,
        interactionSettings.triggerMaxChars,
      );

      if (text.length < interactionSettings.autoMinChars) {
        return;
      }

      keyboardBuffer.current = "";
      void acceptTriggeredText(
        `${text}${trigger.token}`,
        "symbolTrigger",
        trigger.token,
        payloadApp || keyboardBufferApp.current,
      );
    }).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [interactionSettings, mode]);

  useEffect(() => {
    if (!interactionSettings.dailyReviewEnabled) {
      return;
    }

    let stopped = false;

    async function maybeRunDailyReview(openReview = false) {
      const state = loadDailyReviewState();
      const today = todayKey();

      if (
        state.lastRunDate === today ||
        minutesNow() < minutesFromTime(interactionSettings.dailyReviewTime)
      ) {
        if (state.review) {
          setDailyReview(state.review);
        }
        return;
      }

      if (!stopped) {
        await generateDailyReview(openReview);
      }
    }

    void maybeRunDailyReview(false);
    const interval = window.setInterval(
      () => void maybeRunDailyReview(true),
      60_000,
    );

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [
    interactionSettings.dailyReviewEnabled,
    interactionSettings.dailyReviewTime,
  ]);

  useEffect(() => {
    if (!canUseTauriCommands()) {
      return;
    }

    void hasAccessibilityPermission()
      .then((allowed) => {
        if (!allowed) {
          setPipelineState({
            phase: "failed",
            message:
              "LingoCapsule needs macOS Accessibility access before it can read the focused input.",
            error: "Click to enable Accessibility access.",
          });
          void syncNativeWindow("capsule", null).catch(() => undefined);
          return;
        }

        if (manualVisible) {
          const visibleMode = modeRef.current;
          void syncNativeWindow(
            visibleMode,
            visibleMode === "popover" ? latestCapture?.focusedFrame : null,
          ).catch(() => undefined);
        } else {
          void parkNativeWindow().catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, [latestCapture?.focusedFrame, manualVisible]);

  useEffect(() => {
    if (!canUseTauriCommands() || !manualVisible) {
      return;
    }

    void syncNativeWindow(mode, latestCapture?.focusedFrame).catch(
      () => undefined,
    );
    void refreshAdapterEvents();
  }, []);

  useEffect(() => {
    let stopped = false;

    async function pollFocusedInput() {
      if (
        !canUseTauriCommands() ||
        modeRef.current !== "capsule" ||
        !interactionSettings.autoModeEnabled ||
        explicitCaptureActive.current
      ) {
        return;
      }

      const pollEpoch = captureMutationEpoch.current;
      const abortAutoPollMutation = () =>
        stopped ||
        pollEpoch !== captureMutationEpoch.current ||
        modeRef.current !== "capsule" ||
        explicitCaptureActive.current;

      try {
        const allowed = await hasAccessibilityPermission();
        if (abortAutoPollMutation()) {
          return;
        }

        if (!allowed) {
          setPipelineState({
            phase: "failed",
            message:
              "LingoCapsule needs macOS Accessibility access before it can read the focused input.",
            error: "Click to enable Accessibility access.",
          });
          await syncNativeWindow("capsule", null).catch(() => undefined);
          return;
        }

        const activeApp = await frontmostAppName().catch(() => null);
        if (abortAutoPollMutation()) {
          return;
        }

        if (
          activeApp &&
          (appNamePattern.test(activeApp) ||
            shouldSkipProviderAnalysis(activeApp, interactionSettings) ||
            autoOnlyDevelopmentAppPattern.test(activeApp))
        ) {
          return;
        }

        const rawCapture = await captureFocusedText({
          allowClipboardFallback: false,
        });
        if (abortAutoPollMutation()) {
          return;
        }

        const capture =
          rawCapture.path === "accessibilityValue"
            ? {
                ...rawCapture,
                text: recentSegment(
                  rawCapture.text,
                  interactionSettings.triggerMaxChars,
                ),
            }
            : rawCapture;

        if (
          abortAutoPollMutation() ||
          appNamePattern.test(capture.activeApp ?? "")
        ) {
          return;
        }

        if (!isEditableCapture(capture)) {
          if (abortAutoPollMutation()) {
            return;
          }
          clearCapturedInput();
          await parkNativeWindow().catch(() => undefined);
          return;
        }

        const nextText = capture.text.trim();

        if (nextText.length < interactionSettings.autoMinChars) {
          if (abortAutoPollMutation()) {
            return;
          }
          clearCapturedInput();
          await parkNativeWindow().catch(() => undefined);
          return;
        }

        if (shouldSkipAutoCapture(capture, interactionSettings)) {
          if (abortAutoPollMutation()) {
            return;
          }
          clearCapturedInput();
          await parkNativeWindow().catch(() => undefined);
          return;
        }

        const configuredTrigger = interactionSettings.triggerModeEnabled
          ? stripConfiguredTrigger(nextText, interactionSettings)
          : null;

        if (configuredTrigger) {
          const triggeredText = recentSegmentBeforeTrigger(
            nextText,
            configuredTrigger.token,
            interactionSettings.triggerMaxChars,
          );

          if (triggeredText.length >= interactionSettings.autoMinChars) {
            if (abortAutoPollMutation()) {
              return;
            }
            await acceptCapture(
              {
                ...capture,
                text: triggeredText,
                selectedText: triggeredText,
              },
              "symbolTrigger",
            );
          }
          return;
        }

        if (abortAutoPollMutation()) {
          return;
        }

        if (suppressedText.current === nextText) {
          return;
        }

        bumpCaptureEpoch();
        setManualVisible(true);
        setCaptureOrigin("auto");
        setLatestCapture(capture);
        setSourceContext(labelForCapture(capture));
        await syncNativeWindow("capsule", capture.focusedFrame).catch(
          () => undefined,
        );

        if (nextText !== lastCapturedText.current) {
          lastCapturedText.current = nextText;
          setCapturedText(nextText);
        }
      } catch {
        if (abortAutoPollMutation()) {
          return;
        }

        clearCapturedInput();
        await parkNativeWindow().catch(() => undefined);
      }
    }

    void pollFocusedInput();
    const interval = window.setInterval(
      () => void pollFocusedInput(),
      pollIntervalMs,
    );

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [capturedText, interactionSettings, mode]);

  useEffect(() => {
    const hasVisibleCapsuleReason =
      manualVisible ||
      capturedText.trim().length >= interactionSettings.autoMinChars ||
      pipelineState.phase === "failed";

    if (mode === "capsule" && !hasVisibleCapsuleReason) {
      void parkNativeWindow().catch(() => undefined);
      return;
    }

    void syncNativeWindow(mode, latestCapture?.focusedFrame).catch(
      () => undefined,
    );
  }, [
    capturedText,
    interactionSettings.autoMinChars,
    latestCapture?.focusedFrame,
    mode,
    pipelineState.phase,
  ]);

  useEffect(() => {
    const trimmed = capturedText.trim();
    requestId.current += 1;
    const currentRequest = requestId.current;

    if (trimmed.length < interactionSettings.autoMinChars) {
      setPipelineState(emptyState());
      return;
    }

    if (isSecureText(trimmed, sourceContext)) {
      setPipelineState({
        phase: "blocked",
        message:
          "This looks like a password, token, verification code, or secure field. LingoCapsule kept it local and skipped analysis.",
      });
      return;
    }

    if (shouldSkipProviderAnalysis(sourceContext, interactionSettings)) {
      setPipelineState({
        phase: "blocked",
        message:
          "LingoCapsule skipped this development surface and kept the text local.",
      });
      return;
    }

    setPipelineState({
      phase: "debouncing",
      message: "Waiting for a pause before analyzing.",
    });

    const controller = new AbortController();
    const debounceTimer = window.setTimeout(async () => {
      setPipelineState({
        phase: "checking",
        message: "Analyzing with the configured correction provider.",
      });

      try {
        const result = await analyzeTextWithProvider(
          trimmed,
          settings,
          controller.signal,
        );
        const historyEntry = await insertHistoryEntry({
          originalText: trimmed,
          sourceApp: sourceContext,
          status: result.status,
          summaryZh: result.summaryZh,
          issues: result.issues,
          suggestions: result.suggestions,
        });

        if (currentRequest !== requestId.current) {
          return;
        }

        setPipelineState({
          phase: "ready",
          message:
            result.status === "native"
              ? "This text reads naturally."
              : "Suggestions are ready.",
          result,
          historyEntry,
        });
      } catch (error) {
        if (controller.signal.aborted || currentRequest !== requestId.current) {
          return;
        }

        setPipelineState({
          phase: "failed",
          message: "The capsule stayed alive, but analysis did not complete.",
          error:
            error instanceof Error ? error.message : "Unknown correction error.",
        });
      }
    }, captureOrigin === "auto" ? interactionSettings.autoDebounceMs : 120);

    return () => {
      window.clearTimeout(debounceTimer);
      controller.abort();
    };
  }, [
    capturedText,
    captureOrigin,
    interactionSettings,
    settings,
    sourceContext,
  ]);

  const closeAssistant = async () => {
    explicitCaptureActive.current = false;
    modeRef.current = "capsule";
    bumpCaptureEpoch();
    suppressedText.current = capturedText.trim() || null;
    setPanelView("coach");
    setManualVisible(false);
    setMode("capsule");

    try {
      await parkNativeWindow();
    } catch {
      // Browser preview has no Tauri window; the visible no-op is intentional.
    }
  };

  const expandAssistant = () => {
    explicitCaptureActive.current = true;
    modeRef.current = "popover";
    bumpCaptureEpoch();
    setPanelView("coach");
    setManualVisible(true);
    setMode("popover");
    void syncNativeWindow("popover", latestCapture?.focusedFrame).catch(
      () => undefined,
    );
    void refreshAdapterEvents();
  };

  const dragAssistant = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void startNativeDrag().catch(() => undefined);
  };

  const openMacPermissions = async () => {
    try {
      if (pipelineState.error?.includes("input_monitor")) {
        await openInputMonitoringSettings();
      } else {
        await openAccessibilitySettings();
      }
    } catch {
      // Browser preview cannot open macOS System Settings.
    }
  };

  const acceptSuggestion = async (suggestion: CorrectionSuggestion) => {
    if (!pipelineState.historyEntry) {
      return;
    }

    try {
      const updated = await acceptHistorySuggestion(
        pipelineState.historyEntry.id,
        suggestion.id,
      );
      setPipelineState((current) => ({
        ...current,
        historyEntry: updated,
      }));
    } catch {
      // Keep the popup responsive even if local history cannot be updated.
    }
  };

  const captureManualClipboard = async () => {
    explicitCaptureActive.current = true;
    bumpCaptureEpoch();
    setAdapterBusy(true);

    try {
      const capture = await captureClipboardText({
        maxChars: manualClipboardMaxChars,
      });
      await acceptCapture(capture, "manualClipboard");
    } catch (error) {
      setManualVisible(true);
      modeRef.current = "popover";
      setPanelView("coach");
      setMode("popover");
      setPipelineState({
        phase: "failed",
        message: "Manual clipboard capture did not complete.",
        error: error instanceof Error ? error.message : "Clipboard unavailable.",
      });
      void syncNativeWindow("popover", null).catch(() => undefined);
      void refreshAdapterEvents();
    } finally {
      setAdapterBusy(false);
    }
  };

  const applySuggestion = async (suggestion: CorrectionSuggestion) => {
    setAdapterBusy(true);
    try {
      if (captureOrigin !== "auto" || !latestCapture?.canReplaceWithAccessibility) {
        await navigator.clipboard?.writeText(suggestion.rewrite);
        await acceptSuggestion(suggestion);
        return;
      }

      await replaceFocusedText(suggestion.rewrite, latestCapture.path);
      await acceptSuggestion(suggestion);
      await closeAssistant();
    } finally {
      setAdapterBusy(false);
    }
  };

  const display = capsuleDisplay(pipelineState);
  const selectedSuggestion = getSelectedSuggestion(pipelineState);
  const acceptedSuggestionId = pipelineState.historyEntry?.acceptedSuggestionId;
  const showManualPanel = !pipelineState.result;
  const nudgeRows = useMemo(
    () => buildNudgeRows(pipelineState.result, selectedSuggestion),
    [pipelineState.result, selectedSuggestion],
  );
  const capturedPreview = capturedText.trim();
  const rewriteText = selectedSuggestion?.rewrite.trim();
  const copyText = rewriteText || capturedText;
  const isManualClipboard = captureOrigin === "manualClipboard";
  const requiresManualPaste = captureOrigin !== "auto";
  const isParked = false;
  const popoverTitle =
    panelView === "settings"
      ? "Settings"
      : panelView === "review"
        ? "Daily review"
        : "Coach";
  const popoverContext =
    panelView === "settings"
      ? "Low frequency"
      : panelView === "review"
        ? dailyReview?.date || "Today"
        : sourceContext;

  return (
    <main
      className={`app-shell ${mode}${isParked ? " parked" : ""}`}
      aria-live="polite"
    >
      {mode === "capsule" ? (
        <button
          className={`assistant-capsule ${display.tone}`}
          type="button"
          aria-label={`LingoCapsule ${display.label}`}
          onClick={
            pipelineState.phase === "failed"
              ? () => void openMacPermissions()
              : expandAssistant
          }
        >
          <span className="capsule-icon" aria-hidden="true" />
          <span className="capsule-copy">
            <strong>{display.label}</strong>
            <small>{display.detail}</small>
          </span>
          <span className="capsule-source">{sourceContext}</span>
          <span
            className="capsule-grip"
            aria-hidden="true"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={dragAssistant}
          />
        </button>
      ) : (
        <article
          className={`assistant-popover ${display.tone}`}
          aria-label="LingoCapsule suggestion popover"
        >
          <header
            className="assistant-header"
            data-tauri-drag-region
            onMouseDown={dragAssistant}
          >
            <span className="status-dot" aria-hidden="true" />
            <strong id="popover-title">{popoverTitle}</strong>
            <span className="source-chip">{popoverContext}</span>
            {panelView !== "coach" && (
              <button
                className="header-link"
                type="button"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => setPanelView("coach")}
              >
                Coach
              </button>
            )}
            {dailyReview && panelView !== "review" && (
              <button
                className="header-link"
                type="button"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => setPanelView("review")}
              >
                Review
              </button>
            )}
            {panelView !== "settings" && (
              <button
                className="header-menu"
                type="button"
                aria-label="Open settings"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => {
                  setPanelView("settings");
                  void refreshAdapterEvents();
                  void syncNativeWindow("popover", null).catch(() => undefined);
                }}
              />
            )}
            <button
              className="assistant-close"
              type="button"
              aria-label="Close suggestions"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => void closeAssistant()}
            />
          </header>

          <div className="assistant-body">
            {panelView === "settings" ? (
              <section className="settings-page" aria-label="Lingo settings">
                <section
                  className="settings-panel"
                  aria-label="Interaction settings"
                >
                  <div className="settings-head">
                    <strong>Interaction</strong>
                    <span>auto + trigger</span>
                  </div>

                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={interactionSettings.autoModeEnabled}
                      onChange={(event) =>
                        updateInteractionSettings({
                          autoModeEnabled: event.currentTarget.checked,
                        })
                      }
                    />
                    <span>
                      <strong>Readable inputs</strong>
                      <small>Use Accessibility after a typing pause</small>
                    </span>
                  </label>

                  <div className="settings-grid">
                    <label>
                      <span>Pause</span>
                      <input
                        type="number"
                        min="300"
                        max="4000"
                        step="100"
                        value={interactionSettings.autoDebounceMs}
                        onChange={(event) =>
                          updateInteractionSettings({
                            autoDebounceMs: Number(event.currentTarget.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>Min chars</span>
                      <input
                        type="number"
                        min="1"
                        max="80"
                        value={interactionSettings.autoMinChars}
                        onChange={(event) =>
                          updateInteractionSettings({
                            autoMinChars: Number(event.currentTarget.value),
                          })
                        }
                      />
                    </label>
                  </div>

                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={interactionSettings.triggerModeEnabled}
                      onChange={(event) =>
                        updateInteractionSettings({
                          triggerModeEnabled: event.currentTarget.checked,
                        })
                      }
                    />
                    <span>
                      <strong>Rich editors</strong>
                      <small>Use symbols or a hotkey when text is hidden</small>
                    </span>
                  </label>

                  <div className="settings-grid wide">
                    <label>
                      <span>Symbols</span>
                      <input
                        value={interactionSettings.triggerTokens}
                        onChange={(event) =>
                          updateInteractionSettings({
                            triggerTokens: event.currentTarget.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>Hotkey</span>
                      <input
                        value={interactionSettings.manualHotkey}
                        onChange={(event) =>
                          updateInteractionSettings({
                            manualHotkey: event.currentTarget.value,
                          })
                        }
                      />
                    </label>
                  </div>

                  <div className="settings-grid wide">
                    <label>
                      <span>Trigger max</span>
                      <input
                        type="number"
                        min="80"
                        max="4000"
                        step="50"
                        value={interactionSettings.triggerMaxChars}
                        onChange={(event) =>
                          updateInteractionSettings({
                            triggerMaxChars: Number(event.currentTarget.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>Excluded</span>
                      <input
                        value={interactionSettings.excludedApps}
                        onChange={(event) =>
                          updateInteractionSettings({
                            excludedApps: event.currentTarget.value,
                          })
                        }
                      />
                    </label>
                  </div>

                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={interactionSettings.dailyReviewEnabled}
                      onChange={(event) =>
                        updateInteractionSettings({
                          dailyReviewEnabled: event.currentTarget.checked,
                        })
                      }
                    />
                    <span>
                      <strong>Daily review</strong>
                      <small>Summarize today&apos;s repeated patterns</small>
                    </span>
                  </label>

                  <div className="settings-grid">
                    <label>
                      <span>Review time</span>
                      <input
                        type="time"
                        value={interactionSettings.dailyReviewTime}
                        onChange={(event) =>
                          updateInteractionSettings({
                            dailyReviewTime: event.currentTarget.value,
                          })
                        }
                      />
                    </label>
                    <button
                      className="review-now"
                      type="button"
                      onClick={() => void generateDailyReview(true)}
                    >
                      Review now
                    </button>
                  </div>
                </section>

                {adapterEvents.length > 0 && (
                  <section className="event-panel" aria-label="Adapter events">
                    <div className="event-panel-head">
                      <span>Events</span>
                      <button
                        type="button"
                        onClick={() => void refreshAdapterEvents()}
                      >
                        Refresh
                      </button>
                    </div>
                    <div className="event-list">
                      {adapterEvents.slice(0, 5).map((event) => (
                        <div
                          className={`event-row ${
                            event.success ? "ok" : "fail"
                          }`}
                          key={event.id}
                        >
                          <span>{formatEventTime(event.timestampMs)}</span>
                          <strong>{event.activeApp || "Unknown"}</strong>
                          <em>{event.supportTier}</em>
                          <code>{event.path}</code>
                          <small title={formatFailureModes(event)}>
                            {formatFailureModes(event)}
                          </small>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </section>
            ) : panelView === "review" ? (
              <section className="review-page" aria-label="Daily review">
                {dailyReview ? (
                  <section className="daily-review-card">
                    <div className="daily-review-head">
                      <span>Today</span>
                      <strong>
                        {dailyReview.needsImprovementCount}/
                        {dailyReview.checkedCount}
                      </strong>
                    </div>
                    <p>{dailyReview.summary}</p>
                    <ul>
                      {dailyReview.focus.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                ) : (
                  <section
                    className="manual-panel"
                    aria-label="Create daily review"
                  >
                    <div>
                      <strong>No review yet</strong>
                      <span>Generate one from today&apos;s writing history</span>
                    </div>
                    <button
                      type="button"
                      disabled={adapterBusy}
                      onClick={() => void generateDailyReview(true)}
                    >
                      Review now
                    </button>
                  </section>
                )}
              </section>
            ) : (
              <>
                <section className="coach-hero" aria-label="Writing diagnosis">
                  <p className="diagnosis-line">
                    {getDiagnosisText(pipelineState)}
                  </p>
                  {capturedPreview && (
                    <div className="source-note">
                      <span>原句</span>
                      <p className="source-strip">{capturedPreview}</p>
                    </div>
                  )}
                </section>

                {showManualPanel && (
                  <section className="manual-panel" aria-label="Manual capture">
                    <div>
                      <strong>{sourceContext}</strong>
                      <span>
                        {latestCapture?.path === "keyboardBuffer"
                          ? "trigger captured"
                          : isManualClipboard
                            ? "clipboard ready"
                            : "safe manual path"}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={adapterBusy}
                      onClick={() => void captureManualClipboard()}
                    >
                      {adapterBusy ? "Reading" : "Analyze clipboard"}
                    </button>
                  </section>
                )}

                {nudgeRows.length > 0 ? (
                  <div className="nudge-list" aria-label="Language nudges">
                    {nudgeRows.map((row) => (
                      <section
                        className="nudge-row"
                        key={`${row.title}-${row.before}`}
                      >
                        <div className="change-line">
                          <span className="phrase-chip before">
                            {row.before}
                          </span>
                          <span className="arrow" aria-hidden="true">
                            -&gt;
                          </span>
                          <span className="phrase-chip after">{row.after}</span>
                        </div>
                        <strong>{row.title}</strong>
                        <p>{row.note}</p>
                      </section>
                    ))}
                  </div>
                ) : (
                  <p className="quiet-state">
                    {pipelineState.result?.status === "native"
                      ? "No rewrite needed."
                      : display.detail}
                  </p>
                )}

                {rewriteText && (
                  <>
                    <div className="soft-rule" />
                    <section
                      className="rewrite-card"
                      aria-label="Suggested expression"
                    >
                      <div className="rewrite-head">
                        <span>建议表达</span>
                        {pipelineState.result &&
                          pipelineState.result.suggestions.length > 1 && (
                            <div
                              className="rewrite-tabs"
                              aria-label="Rewrite tone"
                            >
                              {pipelineState.result.suggestions.map(
                                (suggestion) => (
                                  <button
                                    key={suggestion.id}
                                    type="button"
                                    className={
                                      acceptedSuggestionId === suggestion.id ||
                                      (!acceptedSuggestionId &&
                                        selectedSuggestion?.id === suggestion.id)
                                        ? "active"
                                        : ""
                                    }
                                    onClick={() =>
                                      void acceptSuggestion(suggestion)
                                    }
                                  >
                                    {suggestion.label}
                                  </button>
                                ),
                              )}
                            </div>
                          )}
                      </div>
                      <p>{rewriteText}</p>
                    </section>
                  </>
                )}
              </>
            )}
          </div>

          <footer className="assistant-footer">
            {panelView === "coach" ? (
              <>
                <button
                  className="ghost-action"
                  type="button"
                  onClick={() => void closeAssistant()}
                >
                  Ignore
                </button>
                <div className="footer-actions">
                  <button
                    className="copy-action"
                    type="button"
                    aria-label="Copy suggestion"
                    onClick={() =>
                      void (async () => {
                        await navigator.clipboard?.writeText(copyText);
                        if (selectedSuggestion) {
                          await acceptSuggestion(selectedSuggestion);
                        }
                      })()
                    }
                  />
                  <button
                    className="apply-action"
                    type="button"
                    disabled={!selectedSuggestion || adapterBusy}
                    onClick={() =>
                      selectedSuggestion && void applySuggestion(selectedSuggestion)
                    }
                  >
                    {adapterBusy
                      ? requiresManualPaste
                        ? "Copying"
                        : "Applying"
                      : requiresManualPaste
                        ? "Copy"
                        : "Apply"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  className="ghost-action"
                  type="button"
                  onClick={() => setPanelView("coach")}
                >
                  Coach
                </button>
                <button
                  className="apply-action"
                  type="button"
                  onClick={() => void closeAssistant()}
                >
                  Done
                </button>
              </>
            )}
          </footer>
        </article>
      )}
    </main>
  );
}

export default App;
