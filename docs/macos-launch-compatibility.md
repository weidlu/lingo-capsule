# macOS Launch Compatibility Matrix

Related: `YB-99`

## Validation Scope

This matrix validates the MVP launch promise by surface family, not by claiming universal support across every macOS app. The current adapter has one generic macOS path:

1. try Accessibility text capture or replacement during automatic polling,
2. use configured trigger symbols or a configured hotkey for rich editors that hide draft text,
3. use clipboard copy or paste only for explicit user actions,
4. mark the event unsupported when neither path works.

Validation date: `2026-05-01`.

Local validation host:

- macOS `15.7.3` (`24G419`)
- Apple Silicon (`arm64`)
- installed representative apps found: `Google Chrome`, `WeChat`, `ChatGPT`, `Claude`, `Codex`
- installed representative apps not found: `Arc`, `Slack`

Founder direction on `2026-05-01`: close `YB-99` against a focused `Google Chrome` textarea pass first. `Arc`, `Slack`, and `WeChat` stay in the matrix as documented surface families, but they are follow-up compatibility coverage rather than blockers for this issue.

## Compatibility Tiers

| Tier | Launch meaning | Capture path | Replace path | User-facing promise |
| --- | --- | --- | --- | --- |
| `Tier A` | Native Accessibility path works. | `AXSelectedText` or `AXValue` returns usable text. | `AXSelectedText` or `AXValue` is settable. | Best MVP experience: direct capture/apply with no clipboard dependency. |
| `Tier B` | Fallback path works. | A configured typing trigger, explicit clipboard capture, or explicit fallback copy returns usable text. | Clipboard paste applies the rewrite only when explicitly requested; keyboard-buffer trigger captures copy the rewrite instead of pasting. | Launchable with caveats: requires a trigger, focus/selection, or manual copy. |
| `Tier C` | Unsupported in the current MVP. | Accessibility and clipboard capture both fail, or the field is intentionally protected. | Accessibility and clipboard replacement both fail. | Do not promise support; show the event as a compatibility failure. |

Tier is recorded per adapter event, not permanently per app. The same app can produce `Tier A` in a standard text area, `Tier B` in a richer composer, and `Tier C` in secure or blocked fields.

## Launch Surface Matrix

| Surface family | Representative target | Current validation route | Launch gate | Notes |
| --- | --- | --- | --- | --- |
| `Browser webapps` | ChatGPT or Claude in Chrome or Arc | `Google Chrome` is installed locally; classifier coverage includes Chrome, Arc, Safari, Firefox, Edge, Brave, Opera, and Orion. | Current `YB-99` launch gate: one successful capture/apply loop at `Tier A` or `Tier B` in a focused Chrome web text area. | Browser page title is not used for classification; the active macOS app process is the browser. Rich editors may fall back from Accessibility to clipboard. |
| `Electron chat apps` | Codex app, Slack Desktop | Codex is installed locally and classifier coverage includes Codex plus Slack and common Electron-style chat/work apps. | Codex is supported by the MVP adapter path when its focused composer exposes text through Accessibility, or through configured trigger capture / manual clipboard capture when it does not. Slack remains deferred follow-up validation. | Automatic polling must not synthesize `Command+C` in Codex. Rich composers that hide `AXValue` should use `~~`, `～～`, the configured hotkey, or explicit clipboard capture. Keyboard shortcut interception, missing Input Monitoring permission, or rich composer focus loss can produce `Tier C`. |
| `Messaging desktop apps` | WeChat Desktop | `WeChat` is installed locally and classifier coverage maps it to this family. | Deferred follow-up validation; not required to close the current Chrome-first pass. | IME composition, secure fields, stickers, file inputs, and non-text message regions are explicitly outside the MVP promise. |
| `Other desktop apps` | TextEdit, Mail, unknown apps | Classified separately from launch surfaces. | Not a launch gate for MVP readiness. | Useful for opportunistic feedback and failure logging, but not part of the founder launch promise. |

## Manual QA Script

Run this once in the current launch-gate surface before calling `YB-99` green. Today that means a normal Chrome textarea:

1. Open the packaged Tauri app and grant Accessibility permission if prompted.
2. Focus a normal editable text field in the representative app.
3. Enter `I am agree we should discuss about this later.`
4. Select the sentence and run the explicit capture action in LingoCapsule.
5. Confirm the compatibility event records the expected surface family and `Tier A` or `Tier B`.
6. Choose a rewrite and run `Apply rewrite`.
7. Confirm the original field is updated and the replace event records `Tier A` or `Tier B`.
8. If the result is `Tier C`, copy the event failure modes into the compatibility notes before changing code.

## Codex Trigger QA Script

Codex currently exposes the app process to Accessibility, but its composer may not expose the draft text as `AXValue`. The preferred safe route is therefore explicit trigger capture:

1. Open the packaged Tauri app.
2. Confirm the popover has trigger mode enabled and default symbols include `~~` or `～～`.
3. In Codex, type `I am agree we should discuss about this later.~~`
4. Confirm LingoCapsule opens suggestions using the trigger path.
5. Click `Copy` on the suggested rewrite, then paste manually into Codex if desired.

If Input Monitoring permission is unavailable or the trigger monitor fails to start, use the explicit clipboard fallback:

1. In Codex, type `I am agree we should discuss about this later.`
2. Select only that sentence and copy it yourself.
3. Open the LingoCapsule popover and click `Analyze clipboard`.
4. Confirm the popover shows suggestions and records a `Tier B` / `clipboardRead` event.
5. Click `Copy` on the suggested rewrite, then paste manually into Codex if desired.

Safety invariant: automatic polling must continue calling `captureFocusedText({ allowClipboardFallback: false })`. Do not add an app-specific background clipboard fallback for Codex or other rich composers. Trigger symbols and the hotkey are explicit user gestures backed by a local in-memory typing buffer; if macOS blocks the event monitor, grant Input Monitoring permission and reopen LingoCapsule.

## Chrome Validation Record

| Surface | Status | Required evidence | Owner/action |
| --- | --- | --- | --- |
| `Google Chrome` normal web textarea | Pending manual pass | Capture tier, apply tier, final field text, and any failure mode if either event is `Tier C`. | CTO/QA runs the manual QA script above and records the result here before closing `YB-99`. |

## Chrome Validation Attempt Log

- `2026-05-02`: focused code checks passed: `cargo test --manifest-path src-tauri/Cargo.toml classifies_launch_surfaces_from_app_name` and `pnpm build`.
- `2026-05-02`: attempted an automated Chrome textarea fallback probe using `osascript` + `System Events` to copy and paste inside a temporary Chrome textarea. macOS blocked the runner with `osascript is not allowed assistive access (-1719)`, so the physical Chrome capture/apply loop still needs an operator-run manual pass or Accessibility permission for the automation runner.

## Current Readiness Call

- `Browser webapps`: current launch gate for `YB-99`; validate in `Google Chrome`.
- `Electron chat apps`: Codex app is now in the supported target set through Accessibility when available and manual clipboard capture otherwise; Slack remains deferred from the first validation close-out.
- `Messaging desktop apps`: documented, but intentionally deferred from the first validation close-out.
- `Tier A/B/C` semantics are documented and match the adapter event model used by the UI.

The current `YB-99` launch bar is: one successful `Tier A` or `Tier B` capture/apply loop in a Chrome web textarea, with any `Tier C` failures recorded as known limitations rather than hidden bugs. Broader surface-family validation remains follow-up compatibility work.
