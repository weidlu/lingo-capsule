# Windows Browser MVP

LingoCapsule supports Windows first through Chrome and Edge browser inputs.
The Windows desktop shell can be packaged by Tauri, while the browser extension
handles the practical input capture path for `input`, `textarea`, and common
`contenteditable` editors.

## What works now

- Chrome and Edge extension content script watches editable fields.
- Type `~~` or `～～` at the end of an English draft to trigger feedback.
- The extension removes the trigger token, checks the recent draft, and shows a
  small in-page coach popover.
- The popover can replace the field content or copy the suggested rewrite.
- Without an API key, the extension uses the same deterministic demo correction
  patterns as the web preview.
- With an OpenAI-compatible API key in the extension options page, the extension
  calls `/chat/completions` directly from the browser extension service worker.
- The Windows Tauri build keeps the local history/settings shell available and
  uses clipboard capture/copy as the non-macOS fallback.

## Current boundary

The macOS Accessibility adapter is still macOS-only. Windows system-wide
focused-text capture is intentionally deferred. The next native Windows adapter
should use Windows UI Automation for focused text controls, with a clipboard
fallback for protected or rich editors.

## GitHub download flow

The `Build installers` workflow creates two downloadable artifact groups:

- `LingoCapsule-Windows`: Windows `.exe`/`.msi` installer bundle from Tauri.
- `LingoCapsule-Browser-Extension`: Chrome/Edge extension zip.

Manual test flow:

1. Open GitHub Actions.
2. Open the latest `Build installers` run from `main`, or run it manually.
3. Download the `LingoCapsule-Windows` artifact on Windows and install it.
4. Download and unzip `LingoCapsule-Browser-Extension`.
5. In Chrome or Edge, open `extensions`, enable developer mode, and choose
   `Load unpacked` with the unzipped extension folder.
6. Open any browser text box and type:

```text
I am agree this happend today~~
```

The extension should remove the trigger and show feedback with a corrected
rewrite.

For release downloads, push a tag such as `v0.1.1`; the same workflow attaches
the Windows installer and extension zip to the GitHub Release.
