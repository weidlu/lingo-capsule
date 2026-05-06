# Lingo Design System

## North Star

Lingo makes English output feel safe, playful, and worth repeating.

The product is a cozy language buddy, not a teacher, examiner, grammar police,
or classroom tool. The interface should make users want to write one more
sentence or say one more thought. Correction is framed as support for output,
not judgment on mistakes.

## Product Matrix

Lingo should grow as one brand with multiple learning surfaces:

- `Lingo Capsule`: a quiet writing companion that lives near real input fields.
- `Lingo Voice`: a spoken practice companion for focused conversation sessions.
- `Lingo Review`: a shared habit notebook for recurring writing and speaking
  patterns.

These surfaces should share the same learner profile, character world, visual
tokens, and review language. They should not all live inside one crowded app
window. Capsule stays light and ambient. Voice can become a full foreground
practice room.

## Personality

Lingo should feel like:

- a relaxed friend who helps you phrase things naturally;
- a small companion who notices patterns without making a scene;
- a patient practice partner who rewards attempts;
- a notebook that remembers what you are working on.

Lingo should never feel like:

- a strict teacher with a pointer;
- a classroom, exam, or blackboard metaphor;
- a red-pen correction system;
- a productivity dashboard with grammar bolted on;
- a toy that damages trust when the user is doing serious work.

## Creative Direction: Cozy Language Buddy

The visual language is based on soft companion objects rather than school
objects. Good motifs include stickers, soft tabs, tiny notebooks, rounded
speech bubbles, gentle pencil marks, small stars, progress stamps, warm desk
lighting, headphones, and a relaxed character avatar.

Avoid blackboards, teacher pointers, report cards, red marks, harsh warning
colors, trophy pressure, and gamified streak anxiety.

The character can become a small buddy or pet-like avatar later. The character
should be expressive but not noisy. It can look, nod, hold a pencil, sit beside
a note, or celebrate gently. It should not lecture, scold, point, or dominate
the writing surface.

## Visual Tokens

### Color

The palette should feel warm, soft, and readable on macOS glass surfaces.

- Ink: `#19211F` for primary text.
- Moss: `#42675D` for calm UI text and active companion states.
- Mint: `#9EDFCC` for accepted or more natural phrasing.
- Butter: `#F5D27A` for gentle tips and attention.
- Peach: `#F4B6A6` for soft friction and recoverable issues.
- Paper: `#FFFDF7` for cards and content surfaces.
- Milk: `#F5F1E8` for ambient panels.
- Pencil: `#7C7067` for source text and annotations.

Do not use saturated red for language mistakes. Error color is reserved for
system failure, privacy, or missing permissions.

### Typography

Use a warm rounded sans for titles and status. Use a clear system-like sans for
body text.

- Display/status: Manrope or Nunito Sans, 700-800 weight.
- Body: Inter or system UI, 500-650 weight depending on size.
- Monospace only for diagnostics, technical paths, or event logs.

The interface should not use viewport-scaled type. Text must fit inside its
container on desktop and compact windows.

### Shape

Use soft but controlled geometry.

- Capsule/avatar surfaces can be fully rounded.
- Coach cards use 10-12px radius.
- Repeated correction cards use 8-10px radius.
- Settings controls use 7-8px radius.
- Do not nest cards inside cards.

### Texture

Use subtle paper, sticker, or milk-glass effects. The texture should be quiet
enough for daily use and should never reduce legibility.

Allowed:

- very soft paper tint;
- faint dotted or sticker-edge accents;
- low-opacity pencil underline;
- soft shadow used as lift, not decoration.

Avoid:

- decorative gradient blobs;
- purple-blue SaaS gradients;
- chalkboard surfaces;
- busy illustration backgrounds;
- heavy skeuomorphic paper.

## Component Language

### Capsule

Capsule is the companion's ambient presence. It should eventually become
avatar-first rather than status-pill-first.

Required behavior:

- shows status in one short phrase;
- never blocks input when idle;
- expands into Coach, not Settings;
- settings only live behind an explicit low-frequency control.

Visual direction:

- small avatar or buddy mark on the left;
- soft status chip to the right;
- motion limited to state changes;
- no generic plus icon as the final brand mark.

### Coach

Coach is the primary daily screen. It should contain only learning content.

Required content:

- the user's original text;
- a calm diagnosis in Chinese;
- one to three focused nudges;
- a natural rewrite;
- copy/apply action.

Tone rules:

- say "Try this" more often than "Wrong";
- explain one pattern at a time;
- reward the attempt before suggesting a change;
- make the rewrite feel immediately usable.

Visual direction:

- source sentence as a soft note;
- suggestions as friendly phrase swaps;
- improvement cards as warm buddy notes, not alert panels;
- the rewrite as the most confident block on the page.

### Settings

Settings is a low-frequency utility page. It must stay separate from Coach.

Required content:

- auto mode settings;
- trigger symbols and hotkey;
- excluded apps;
- daily review time;
- adapter events for debugging.

Visual direction:

- quiet, compact, scannable;
- less personality than Coach;
- no learning nudges inside settings.

### Review

Review is a habit notebook, not an analytics dashboard.

Required content:

- today's repeated patterns;
- accepted suggestions;
- one focus area for tomorrow;
- examples from real writing history.

Visual direction:

- notebook/sticker metaphor;
- progress as gentle momentum;
- avoid scoring that makes users feel judged.

## Motion

Motion is personality, not spectacle.

State map:

- Idle: companion rests or breathes lightly.
- Listening: companion leans in or blinks.
- Checking: note flips, pencil moves, or dots pulse.
- Tips: companion perks up and highlights one nudge.
- Native: tiny satisfied nod or soft stamp.
- Private/blocked: companion quietly closes the note.
- Review ready: notebook tab wiggles once.

Motion should be short, under 500ms for UI transitions and under 1200ms for
character moments. It should not loop aggressively.

## Voice And Copy

The product voice should be supportive, concise, and specific.

Good:

- "This is clear. We can make it sound more natural."
- "Tiny tense fix here."
- "Try: I agree this happened today."
- "You keep using 'discuss about'. Let's practice 'discuss + topic'."

Avoid:

- "Incorrect grammar."
- "You made an error."
- "Score: 52/80."
- "You failed to use the correct tense."

## Voice Product Extension

`Lingo Voice` should share the buddy and learner profile, but it should be a
separate foreground product surface.

Capsule is ambient and low-attention. Voice is immersive and high-attention.
Trying to force both into the same floating window would make Capsule heavy and
Voice cramped.

Shared primitives:

- learner profile;
- recurring habit summaries;
- character states;
- "try again safely" copy style;
- daily review notebook.

Different primitives:

- Voice needs microphone state, turn-taking, transcript, playback, and session
  goals.
- Capsule needs capture source, compact suggestions, copy/apply, and low
  interruption behavior.

## Implementation Principles

1. Coach first. The most-used page carries the brand.
2. Character second. Do not add a mascot until the UI language can support it.
3. Settings separate. No low-frequency controls inside Coach.
4. Soft correction. Language issues are nudges, not failures.
5. Real context. Design around Codex/browser inputs and macOS window behavior.
6. Small motion. Personality should help the user continue, not steal focus.

## First Implementation Slice

The first visual implementation should update only:

- the capsule shell;
- the Coach page;
- the theme tokens used by those surfaces.

Do not redesign Settings, Review, or Voice in the first slice beyond making
their navigation compatible with the new design language.

## Stitch Artifacts

Project:

- `15996375326382372244` - LingoCapsule Floating Assistant UI Prototype

Current design exploration:

- `projects/15996375326382372244/screens/b91c0f9bf87b4f218c36a11fec494843`
  - title: LingoCapsule Visual Variants Comparison
  - variants: Buddy Note, Soft Desk, Pocket Companion

Recommended path:

- Use `Soft Desk` as the layout foundation because it fits a macOS floating
  assistant: compact, layered, calm, and useful beside real input fields.
- Borrow `Buddy Note` color and texture language for warmth: paper tint,
  butter highlights, moss text, and gentle notebook-like suggestion blocks.
- Keep `Pocket Companion` only for future character/avatar moments. Do not let
  it push the main UI into childish or noisy territory.

Generated design system asset:

- `assets/e7b7cb81e12649e897ee90a5a099e66b`
  - display name: Buddy Note
  - useful tokens: warm paper, moss green, mint, butter, soft peach, Manrope,
    highly rounded speech-bubble surfaces

Stitch API note:

- Direct `create_design_system` and `update_design_system` calls returned
  `Request contains an invalid argument` for both full markdown and simplified
  text payloads. `generate_screen_from_text` succeeded and produced the design
  system asset above.
