# Grammarly Interaction Research

This note summarizes a black-box product and DOM study of Grammarly's browser
extension behavior. It does not rely on copied, decompiled, or reverse-engineered
source code. The goal is to translate useful interaction patterns into an
independent LingoCapsule design.

## Research Boundary

- We observed runtime DOM, Shadow DOM hosts, accessibility labels, element
  geometry, and visible product behavior.
- We did not copy private source, decode bundled logic, or depend on Grammarly's
  implementation details.
- The useful lesson is the architecture pattern: field adapters, a mirror layout
  model, an overlay renderer, and a suggestion state machine.

## Runtime Architecture Observed

Grammarly does not draw directly inside the user's input field. It builds a
parallel rendering system beside the real field:

```text
Real input field
  -> field adapter reads text, selection, scroll, style, and geometry
Hidden mirror layer
  -> maps text offsets to pixel rectangles
Highlight overlay layer
  -> draws underline/background marks over the field
Button and badge layer
  -> anchors Grammarly actions near the field corner
Assistant popup layer
  -> shows suggestion cards and applies edits through the field adapter
```

Runtime hosts observed on a normal page included:

```text
GRAMMARLY-EXTENSION
GRAMMARLY-MIRROR
GRAMMARLY-POPUPS
GRAMMARLY-EXTENSION-VBARS
GRAMMARLY-EXTENSION-VBAR-CARD
GRAMMARLY-DESKTOP-INTEGRATION
```

These hosts use Shadow DOM. That keeps Grammarly UI styles isolated from the
page and gives the extension predictable styling even on hostile or unusual web
apps.

## Text Field Model

The extension appears to create a field model for each supported editor:

- field kind: `input`, `textarea`, `contenteditable`, rich editor
- current text
- selection or caret position
- scroll offset
- bounding rectangle
- computed text styles
- replacement capability
- active/inactive state

The extension can track multiple fields, but visible controls focus on the
active field. In the observed page, changing focus from a textarea to a
contenteditable editor moved the button, badge, and highlights to the new field.

## Mirror Layout

For `textarea`, Grammarly cannot ask the browser for per-character DOM ranges
because the text is not represented as child text nodes. It creates a hidden
mirror element instead.

Observed mirror attributes copied from a textarea included:

```text
width
height
padding
font
line-height
direction
text-align
letter-spacing
word-break
overflow-wrap
word-spacing
writing-mode
white-space
```

The mirror is hidden and non-interactive:

```text
position: fixed
top: 0
left: 0
color: transparent
visibility: hidden
pointer-events: none
z-index: very low
```

Because the mirror has the same text and text styles as the real textarea, the
browser lays out the mirror text in the same way. Grammarly can then map a text
offset such as the word `happend` to a pixel rectangle.

## Highlight Rendering

Highlights are rendered in a separate overlay layer, not as text decorations in
the original field.

Observed highlight elements included:

```text
data-grammarly-part="highlights"
data-grammarly-part="highlight"
data-highlight-format="underlineAndBackground"
data-highlight-color-name="red"
```

Each highlight is an absolutely positioned rectangle:

```text
top: <line-relative y>
left: <range-relative x>
width: <range width>
height: <line height fragment>
```

The visible underline is drawn inside that rectangle, often as a small strip at
the bottom. This lets the extension show marks without changing the input
field's actual content.

## Contenteditable Differences

Contenteditable and rich editors expose real DOM nodes. Grammarly can combine
field adapters with DOM range geometry rather than relying only on textarea
mirrors.

When a contenteditable test field changed from one line to two lines, observed
highlight rectangles moved from the first-line y position to a second-line y
position. That indicates the system maps text ranges to actual rendered line
boxes.

This is the key implementation split:

- `textarea/input`: mirror-based range measurement
- `contenteditable`: DOM Range measurement when reliable
- rich editors such as ProseMirror: editor-specific adapter plus range geometry

## Button and Badge Layer

Grammarly anchors a compact button group near the field corner. Observed parts:

```text
data-grammarly-part="button"
data-grammarly-part="cheetah-ideate-button"
data-grammarly-part="gbutton"
data-grammarly-part="gb-error-count"
```

The button layer is mostly `pointer-events: none`, while the actual buttons use
`pointer-events: auto`. This lets the overlay avoid blocking normal typing while
keeping its controls clickable.

The badge communicates status and count:

- idle/checking
- number of suggestions
- alert state
- entry point to the assistant popup

## Assistant Popup

The popup lives in a separate top-level host:

```text
GRAMMARLY-POPUPS
data-grammarly-part="assistant-draggable-wrapper"
role="dialog"
z-index: 2147483647
```

The popup is independent from the input field. It is positioned by viewport
geometry and anchored near the field or badge, not inserted into the editor.

The assistant can display:

- suggestion count
- category filters
- current suggestion card
- diff-style preview
- actions
- navigation between suggestions
- settings/close controls

## Suggestion Interaction Model

Observed suggestion actions:

- `Accept`: apply the edit and advance to the next suggestion.
- `Dismiss`: ignore the suggestion and advance.
- `Add to dictionary`: available for spelling suggestions such as unknown words.
- `More Actions`: report an incorrect or offensive suggestion.
- `Turn off on this website`: disable the extension for the current site.
- `Leave feedback`: send product feedback.

Observed category filters:

```text
Correctness
Clarity
Engagement
Delivery
```

This suggests a state model like:

```text
Suggestion
  id
  category
  type
  rangeStart
  rangeEnd
  originalText
  replacementText
  explanation
  accepted
  dismissed
  dictionaryCandidate
```

## Replacement Model

The popup does not mutate overlay text. On `Accept`, it routes the action back to
the field adapter for the active editor.

Likely replacement strategies by field type:

- `input/textarea`: set value slices by range, preserve selection, dispatch
  input/change events.
- `contenteditable`: use DOM Range replacement, preserve selection, dispatch
  input events.
- rich editors: use editor-compatible events or command paths where needed.

The important product lesson is that replacement must be adapter-based. A single
`element.textContent = ...` path will break rich editors and undo stacks.

## Lessons For LingoCapsule

LingoCapsule should evolve from trigger-only checking to an editor-aware loop:

```text
detect field
  -> debounce text changes
  -> analyze text
  -> map suggestion ranges to rectangles
  -> draw badge/highlights
  -> show suggestion cards
  -> accept/dismiss/dictionary/site preferences
```

Recommended modules:

```text
FieldRegistry
  discovers inputs, textareas, contenteditable, and known rich editors

FieldAdapter
  reads text, selection, style, rect, scroll, and performs replacement

AnalysisEngine
  debounces text and calls demo/provider correction

LayoutMirror
  maps textarea/input offsets to rectangles

RangeGeometry
  maps contenteditable text ranges to DOM rectangles

OverlayController
  owns Shadow DOM, badge, highlights, and popup

SuggestionStore
  tracks accepted, dismissed, dictionary, and per-site preferences
```

## Suggested Product Phases

### Phase 1: Grammarly-Lite Auto Check

- Stop requiring `~~`.
- Detect active editable fields.
- Debounce after typing.
- Show a badge with suggestion count.
- Open a small suggestion card near the field.
- Keep whole-sentence rewrite as the first replacement path.

### Phase 2: Accept, Dismiss, Dictionary

- Add `Accept` and `Dismiss` on every suggestion.
- Add `Add to dictionary` for spelling suggestions.
- Store dictionary and dismissed suggestions locally.
- Add disable-on-site preferences.

### Phase 3: Underline Overlay

- Implement textarea mirror measurement first.
- Draw underline rectangles in Shadow DOM.
- Keep pointer events off except on controls.
- Recompute on input, scroll, resize, zoom, and font changes.

### Phase 4: Rich Editor Adapters

- Add contenteditable range geometry.
- Add ProseMirror-specific handling for ChatGPT and similar editors.
- Preserve undo stack and selection during replacements.
- Fall back to copy/rewrite when safe replacement is not available.

## Implementation Guardrails

- Do not modify page content just to display suggestions.
- Do not block typing.
- Keep overlays in Shadow DOM.
- Store API keys, dictionary entries, dismissed suggestions, and disabled sites
  locally.
- Avoid analyzing password, token, and secure-looking fields.
- Preserve the user's selection and undo stack whenever possible.
- Make every action reversible or at least non-destructive.
