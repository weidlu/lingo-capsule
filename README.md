# lingo-capsule

LingoCapsule is a desktop and browser companion that gives quiet English writing feedback without taking over the user's primary app.

## Current Shell

This repo now contains a Tauri 2 + React MVP shell:

- floating capsule-style window with custom macOS chrome
- live correction panel with Chinese diagnosis and casual/professional rewrites
- local review/history surface
- local-first provider settings for OpenAI-compatible APIs
- macOS text-adapter status events with safe browser-preview fallbacks
- interaction settings for automatic pause timing, trigger symbols, hotkey, minimum text length, and excluded apps
- explicit trigger capture for rich apps such as Codex that do not expose draft text through Accessibility
- manual clipboard capture for rich apps when the user explicitly chooses that fallback
- daily local review card that summarizes today's repeated correction patterns
- bundled app icon assets
- documented macOS launch compatibility tiers, Chrome-first launch gate, and deferred surface-family matrix
- Windows packaging through GitHub Actions, with Chrome/Edge extension support for browser input fields
- Chrome/Edge extension options for provider base URL, API type, model, API key, prompt, trigger symbols, and trigger buffer length

## Commands

```bash
pnpm install
pnpm dev
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
pnpm tauri build --debug
pnpm extension:package
```

## Real Provider Test

Without a provider API key, the app intentionally uses the local demo checker in
`src/domain/correction.ts`. That path is deterministic and only recognizes a
small set of grammar patterns.

To test real model calls in the packaged macOS app:

```bash
pnpm provider:configure
pnpm tauri:install
```

The configure command writes a local-only provider file at:

```text
~/Library/Application Support/com.lingocapsule.desktop/provider-settings.json
```

It defaults to the user's Codex-compatible endpoint `https://sub.slnt.dev`,
the Responses API, and model `gpt-5.4-mini`. You can override them with:

```bash
LINGO_CAPSULE_PROVIDER_BASE_URL=https://sub.slnt.dev \
LINGO_CAPSULE_PROVIDER_WIRE_API=responses \
LINGO_CAPSULE_PROVIDER_MODEL=gpt-5.4-mini \
pnpm provider:configure
```

Once configured, focused input text is sent to the configured provider for
analysis unless the local secure-text guard classifies it as a password, token,
verification code, or similar secret.

## Interaction Modes

LingoCapsule uses two capture paths:

- Readable inputs: if the focused macOS text field exposes text through
  Accessibility, Lingo waits for the configured pause duration and analyzes the
  text automatically.
- Rich editors: if an editor hides draft text from Accessibility, type a
  configured trigger such as `~~` or `～～`, or use the configured hotkey. Lingo
  analyzes the recent in-memory typing buffer and copies the rewrite instead of
  forcing a paste.

Open the capsule popover to change the pause delay, minimum text length, trigger
symbols, hotkey, trigger buffer length, daily review time, and excluded app list.

Trigger symbols and the hotkey use a macOS event monitor. If the monitor cannot
start, grant LingoCapsule Input Monitoring permission in System Settings and
reopen the app.

Daily review runs while the app is open. It reads local correction history,
summarizes today's repeated patterns, and never sends extra data beyond the
correction history already created by normal checks.

## Windows Browser Support

Windows support starts with browser inputs. Install the Windows desktop bundle
from the GitHub `Build installers` workflow, then load the Chrome/Edge extension
artifact from the same workflow. Configure the extension from its Options page:

- Provider base URL, API type, model, API key, and prompt
- Trigger symbols and the maximum text length sent for analysis

In a browser text box, type a configured trigger such as `~~` or `～～` after a draft:

```text
I am agree this happend today~~
```

The extension removes the trigger token, analyzes the recent draft, and shows an
in-page coach popover with a rewrite. See
`docs/windows-browser-mvp.md` for the full download and test flow.

`pnpm tauri build --debug` currently produces the debug `.app` bundle at:

```text
src-tauri/target/debug/bundle/macos/LingoCapsule.app
```

## Project Notes

- `docs/user-intent-ux-thesis.md` — user-intent and UX thesis distilled from `spark.md`.
- `docs/founder-first-macos-mvp.md` — macOS-first MVP scope, architecture, launch matrix, and canonical execution queue.
- `docs/macos-launch-compatibility.md` — `YB-99` compatibility tiers, Chrome-first launch gate, and manual QA script.
- `docs/grammarly-interaction-research.md` — black-box Grammarly interaction research and the Grammarly-lite architecture direction.
