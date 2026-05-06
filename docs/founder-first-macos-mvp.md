# Founder-First macOS MVP Brief

Related: `YB-89`, `YB-91`, `YB-96`, `YB-97`, `YB-98`, `YB-99`

## Objective

Build the smallest useful macOS version of LingoCapsule for the founder as the first daily user.

The MVP should prove one loop end to end:

1. detect or capture English text in a normal app,
2. analyze it through a BYOK model,
3. show a calm capsule with concise guidance,
4. apply a rewrite back into the original input,
5. save the event locally for later review.

## Founder Workflow

Primary founder workflow:

1. Write English in a real app such as a browser textarea, Slack Desktop, or WeChat Desktop.
2. Pause typing or trigger manual capture if auto-capture is not reliable.
3. See capsule state change to `Native`, `1 Tip`, or `2 Tips`.
4. Open the capsule to view one explanation plus two rewrites: casual and professional.
5. Ignore, copy, or apply the rewrite.
6. Revisit accepted and rejected suggestions in local history.

This is a sidecar utility, not a replacement editor.

## Product Boundaries

In scope:

- macOS first
- local-first storage
- BYOK with OpenAI-compatible providers
- floating capsule instead of inline red underlines
- whole-selection or whole-phrase replacement
- support-tier tracking by app family

Out of scope for MVP:

- Grammarly-style inline underlines inside arbitrary apps
- universal rich-text editing parity
- cloud sync or hosted inference
- cross-platform launch
- promise of working in every macOS app on day one

## Technical Architecture

Recommended stack:

- `Tauri 2 + React` for the resident desktop shell and UI surfaces
- Rust native layer for macOS accessibility, clipboard fallback, and window lifecycle
- SQLite for local settings and correction history
- OpenAI-compatible HTTP client for `base URL`, `API key`, and `model`

Core components:

1. `App shell`
   - tray app
   - hidden background runtime
   - capsule window
   - settings window
   - review/history window

2. `Correction pipeline`
   - debounce orchestration
   - strict JSON prompt contract
   - failure-safe parsing
   - secure-input filtering

3. `macOS adapter`
   - Accessibility-based text capture
   - Accessibility-based replace when supported
   - clipboard-assisted fallback when replace support is weak

4. `Data layer`
   - provider settings
   - correction log
   - accepted suggestion tracking
   - compatibility notes per surface

## Privacy and Data Assumptions

- Default to local-only persistence.
- Never send secure or password-like fields to providers.
- Keep provider credentials on-device.
- Make per-app allow or deny controls part of the product direction, even if the first shell lands before the full policy UI.
- Log compatibility failures locally so support tiers can be improved without guessing.

## Launch Matrix

Launch is macOS-first, but validation is by surface family rather than by one hard-coded app list.

Initial surface families:

- `Browser webapps`
  - Representative apps: ChatGPT or Claude in Chrome or Arc
- `Electron chat apps`
  - Representative app: Slack Desktop
- `Messaging desktop apps`
  - Representative app: WeChat Desktop

Support tiers:

- `Tier A`: generic Accessibility adapter works
- `Tier B`: fallback path works
- `Tier C`: unsupported in current MVP

The working compatibility source of truth is `docs/macos-launch-compatibility.md`. It defines the exact tier entry criteria, validation script, current local environment gaps, and Chrome-first launch gate for `YB-99`. Slack, Arc, and WeChat remain documented follow-up surfaces, but they do not block the current issue close-out.

## Milestones

### Milestone 0: Clickable shell

Goal: prove the app can live on macOS and hold the product shape.

Exit:

- tray app launches and stays resident
- capsule renders
- settings persist locally
- SQLite schema exists

Owner queue:

- `YB-96` Build macOS app shell for lingo-capsule MVP

### Milestone 1: Usable founder loop

Goal: founder can run the full correction loop in a normal Google Chrome input first, with the broader launch surface matrix documented as follow-up compatibility coverage.

Exit:

- input string becomes structured correction output
- capsule can show the result safely
- Chrome input capture and replace work through native or fallback path
- accepted suggestion is stored locally
- Chrome input validation records `Tier A` or `Tier B`; other launch surfaces keep documented tier criteria and known gaps

Owner queue:

- `YB-97` Implement correction pipeline and local history
- `YB-98` Build macOS text capture and replace adapter with fallback paths
- `YB-99` Validate macOS launch matrix and document compatibility tiers

## Canonical Execution Queue

The active child issue set is:

- `YB-96` app shell
- `YB-97` correction pipeline
- `YB-98` macOS capture and replace adapter
- `YB-99` launch matrix validation

This is the canonical queue for implementation. Any earlier duplicate task set should stay cancelled.

## Board-Level Tradeoffs

1. We are optimizing for founder utility, not universal compatibility marketing.
2. We are choosing a capsule UX because it is buildable and calm; inline underlines are deferred because they are the wrong cost center for MVP.
3. We are accepting launch-surface validation as an explicit engineering step instead of pretending all desktop text inputs behave the same.
4. We are choosing local-first BYOK to keep infra cost and privacy risk low.

## Next Action

With `YB-96`, `YB-97`, and `YB-98` complete, close `YB-99` by running one manual Google Chrome input capture/apply pass and recording the resulting tier. Slack, Arc, and WeChat remain follow-up compatibility coverage rather than blockers for the current MVP validation gate.
