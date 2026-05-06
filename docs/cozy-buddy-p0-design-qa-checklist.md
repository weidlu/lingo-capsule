# Cozy Buddy P0 Design QA Checklist

Issue: YB-111
Parent: YB-105
Date: 2026-05-05

## Review Stance

P0 should feel like a useful language companion beside real work, not a cute
skin on a grammar checker. The approved direction is `Soft Desk` for layout and
window behavior, with `Buddy Note` warmth for tokens, paper surfaces, moss text,
butter highlights, mint accepted-state accents, and soft peach recoverable
friction. `Pocket Companion` is reserved for future avatar moments.

Use this checklist for the P0 capsule shell and Coach implementation before
ship. Any blocker item should be fixed before release.

## Capsule Shell

- [ ] Blocker: Collapsed capsule fits the compact macOS target of roughly
  292x76 without clipped labels, oversized controls, or visible layout jitter.
- [ ] Blocker: The capsule reads as an ambient companion surface, not a generic
  command launcher or settings pill.
- [ ] Blocker: Status copy is one short phrase plus one supporting detail, and
  stays legible with long app names or source labels.
- [ ] Blocker: Idle, listening, checking, tips, native, private, and failed
  states are visually distinct without relying on saturated red.
- [ ] Blocker: Clicking the capsule expands to Coach by default.
- [ ] Blocker: The capsule never blocks the user's active input while idle.
- [ ] Advisory: The leading mark may be abstract for P0, but should leave room
  for a future buddy/avatar. Do not make a plus icon, alert icon, or settings
  gear the brand signal.
- [ ] Advisory: Motion is limited to state change feedback and should finish
  quickly. Avoid constant loops that compete with typing.

## Coach Surface

- [ ] Blocker: Coach is the default expanded view and contains only learning
  content plus the minimum controls required to close, copy, or apply.
- [ ] Blocker: The hierarchy is clear at a glance: original text, Chinese
  diagnosis, one to three nudges, natural rewrite, copy/apply action.
- [ ] Blocker: The natural rewrite is the most confident block on the page and
  is safe to copy without extra interpretation.
- [ ] Blocker: Nudges explain one pattern at a time and never look like alert
  banners, report cards, or validation errors.
- [ ] Blocker: Source text is presented as a soft note, not as a redlined
  document.
- [ ] Blocker: Coach states for private text, permission failure, checking, no
  issue, and needs-improvement are all understandable without sending the user
  into Settings first.
- [ ] Advisory: Use warm note-like grouping for suggestions. Keep repeated
  correction cards at controlled radii around 8-10px.
- [ ] Advisory: Preserve density. This is a floating assistant for active work,
  not a landing page or decorative full-screen learning app.

## Visual Tokens

- [ ] Blocker: Primary text uses dark ink or equivalent contrast against paper
  and milk surfaces.
- [ ] Blocker: Calm UI and active companion text uses moss green or a close
  semantic equivalent.
- [ ] Blocker: Accepted/native states use mint or restrained green accents.
- [ ] Blocker: Gentle attention uses butter, and recoverable friction uses soft
  peach or warm brown. Saturated red is reserved for system failure, privacy, or
  missing permissions only.
- [ ] Blocker: Paper and milk surfaces stay readable on macOS glass; texture
  must not reduce contrast.
- [ ] Blocker: No decorative gradient blobs, purple-blue SaaS gradients,
  blackboards, chalk textures, trophy visuals, or heavy skeuomorphic paper.
- [ ] Blocker: Cards are not nested inside cards. Page sections are unframed or
  full-width within the popover; cards are only for discrete notes or repeated
  suggestions.
- [ ] Advisory: Titles/status can use Manrope or Nunito Sans; body should stay
  system-like and crisp. Do not use viewport-scaled typography.

## Copy Tone

- [ ] Blocker: Chinese diagnosis is calm, specific, and useful for a founder
  writing real English.
- [ ] Blocker: Copy frames correction as support for output, not judgment of
  mistakes.
- [ ] Blocker: Avoid "incorrect", "failed", scores, grades, streak pressure,
  and classroom language.
- [ ] Blocker: Use phrasing closer to "Try this", "Tiny tense fix", or "This is
  clear; we can make it sound more natural."
- [ ] Advisory: Reward the attempt before suggesting a change when space allows.

## Settings Separation

- [ ] Blocker: Settings remains reachable but is not the default expanded
  surface.
- [ ] Blocker: Settings controls do not appear inside Coach content.
- [ ] Blocker: Coach does not include auto-mode, trigger symbol, hotkey,
  excluded-app, provider, daily review time, or adapter event controls.
- [ ] Advisory: The route to Settings can be a deliberate header/menu action,
  app menu entry, or first-run affordance. It should be discoverable without
  interrupting rewrite review.

## Compact macOS Behavior

- [ ] Blocker: Expanded popover fits the P0 target of roughly 520x680 and works
  when placed beside Codex, browser inputs, and other writing contexts.
- [ ] Blocker: All text fits inside its container with Chinese and English copy;
  no button label, chip, diagnosis, or rewrite overlaps neighboring content.
- [ ] Blocker: Header controls, source chip, close control, and primary actions
  remain usable at compact sizes.
- [ ] Blocker: Scroll behavior preserves the rewrite and action area without
  trapping the user.
- [ ] Blocker: Hover, focus-visible, disabled, loading, private, blocked, and
  failed states are visually coherent.
- [ ] Advisory: Shadows and glass should lift the assistant off the desktop
  without turning it into a modal dialog.

## P0 Ship Review

Ship only if every blocker above passes and the implementation supports this
daily-use loop:

1. Founder triggers Lingo from real writing.
2. Capsule expands into Coach.
3. Coach shows original text, Chinese diagnosis, focused nudges, and a natural
   rewrite.
4. Founder copies or applies one better sentence without switching context.
5. The experience feels warm, calm, and serious enough to use beside real work.

## Reject In Review

Reject any P0 implementation that introduces:

- classroom, exam, blackboard, report-card, red-pen, or strict teacher
  metaphors;
- mascot-first UI, large character art, or noisy avatar behavior;
- trophies, streak pressure, scores, or gamified shame;
- nested cards, oversized marketing-style panels, or decorative backgrounds;
- Settings controls inside Coach;
- saturated red for normal language mistakes;
- broad visual exploration beyond Soft Desk plus Buddy Note.
