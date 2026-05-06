# CEO Review: Lingo Cozy Buddy UI/UX Direction

Issue: YB-105
Date: 2026-05-05

## Decision

Continue with `Cozy Language Buddy` as the product direction for personal founder use.

The reason is simple: the product needs to increase English output volume, not
optimize for classroom correctness. A relaxed companion lowers the activation
energy to write one more sentence or say one more thought. That is the core
value for a founder using English in real work.

Guardrail: cozy cannot become childish. The product should feel warm, calm, and
useful beside serious work in Codex, browser inputs, and macOS workflows.

## Brand And Product Matrix

Keep `Lingo Capsule`, `Lingo Voice`, and `Lingo Review` as one Lingo product
matrix, not separate products.

They should share:

- one learner profile;
- one recurring-mistake memory;
- one visual and copy system;
- one review language;
- one companion identity.

They should not share one crowded window. Capsule is ambient. Voice is a
foreground practice room. Review is the habit notebook. The brand is one system,
with distinct surfaces for distinct attention modes.

## Next Implementation Slice

### P0

Ship the smallest daily-use loop:

- update the capsule shell using the Soft Desk layout foundation;
- apply Buddy Note warmth through tokens, paper surfaces, moss text, butter
  highlights, mint accepted-state accents, and soft peach friction states;
- make Coach the default expansion from the capsule;
- show original text, Chinese diagnosis, one to three nudges, a natural rewrite,
  and copy/apply action;
- keep Settings reachable but out of the Coach content path;
- verify the slice against real Codex/browser input behavior and compact macOS
  window constraints.

Success test: tomorrow morning, the founder can trigger Lingo on real writing,
copy or apply one better sentence, and see one repeated pattern captured for
review.

### P1

Make the loop stick:

- add a simple "today's pattern" Review notebook entry generated from accepted
  suggestions;
- improve empty, private, blocked, and native-language states;
- add first-run discoverability for where Settings lives without putting
  settings controls inside Coach;
- add gentle state motion only where it clarifies status.

### P2

Explore expansion:

- Pocket Companion character/avatar moments;
- Lingo Voice foreground practice room;
- richer Review history;
- optional habit reminders.

## Explicit Non-Goals

Do not include these in the first implementation slice:

- full Settings redesign;
- full Review redesign;
- Lingo Voice implementation;
- mascot-first UI;
- scoring, streak pressure, trophies, exams, classrooms, blackboards, red-pen
  correction, or report-card metaphors;
- broad backend/model rewrites unless required to make the P0 loop work;
- visual exploration beyond Soft Desk plus Buddy Note.

## Coach Vs. Settings

Coach is high-frequency. Settings is low-frequency. Separate them by default
task, not by hiding Settings.

Coach should be reached by clicking the capsule or using the trigger/hotkey.
Settings should be one deliberate action away through a gear/menu in the capsule
header, the app menu, and first-run guidance. It should never be the default
expanded surface and should never contain learning nudges.

Discoverability rule: users should know Settings exists, but they should not
see settings controls while deciding whether to use a rewrite.

## What Makes It Useful Tomorrow Morning

The product becomes useful when it helps with a real sentence in the user's
current workflow.

Minimum useful experience:

- trigger Lingo from a real text field or selected text;
- get a calm Chinese diagnosis that explains one pattern;
- see a rewrite that is safe to paste immediately;
- copy or apply the rewrite without switching context;
- save the pattern into Review so repeated mistakes compound into learning.

The product is not useful yet if it only looks warmer. The next slice must prove
that the companion helps the founder produce more English with less pressure.

## Notes

Stitch MCP inspection of
`projects/15996375326382372244/screens/b91c0f9bf87b4f218c36a11fec494843`
returned `Auth required` in this runtime. This review is therefore grounded in
`DESIGN.md`, which already records the Stitch variants and recommended path:
Soft Desk as layout foundation, Buddy Note for warmth, Pocket Companion as
future avatar exploration.

## Delegated Execution

- [YB-110](/YB/issues/YB-110): CTO owns P0 implementation of the Cozy Buddy
  capsule shell and Coach UI slice.
- [YB-111](/YB/issues/YB-111): Visual Director owns the P0 design QA checklist.
