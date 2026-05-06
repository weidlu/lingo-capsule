# LingoCapsule User Intent and UX Thesis

Source: `spark.md`

## One-Line Thesis

LingoCapsule should be a quiet desktop companion that turns real English writing into deliberate practice without interrupting the user's actual conversation or work.

## User Intent

The user is not asking for another writing editor. They are trying to switch their daily work mode into English and use high-frequency AI/work chats as real output practice.

Their core concern is the gap between input volume and input quality: writing more English increases exposure, but repeated uncorrected mistakes can become habits. The product needs to create a feedback loop inside normal communication rather than moving the user into a separate study app.

The explicit jobs-to-be-done are:

- When I type English in my normal apps, help me notice what sounds wrong or unnatural.
- When my sentence is understandable but not native, show me a more idiomatic alternative.
- When I keep making the same mistakes, summarize the pattern so I can practice deliberately.
- When I am focused on a conversation, do not interrupt, shame, or hijack my flow.

## Target User

Primary audience: bilingual professionals, AI power users, founders, operators, engineers, and students who are already willing to write in English but feel stuck at “communicable, not native.”

They are motivated by work fluency, professional credibility, and immersion. They do not need beginner lessons first; they need contextual correction on language they actually use.

## Product Point of View

LingoCapsule should behave like a peripheral coach, not a red-pen teacher.

The winning experience is not inline underlines everywhere. The winning experience is a tiny, trustworthy signal beside the user's workflow: “your meaning is clear, and here are two better ways to say it if you want them.”

This makes the floating capsule the right first product shape because it preserves three things users care about:

- Focus: the primary app remains the center of attention.
- Agency: the user decides whether to open, ignore, copy, or replace.
- Confidence: feedback feels like support, not public correction.

## UX Principles

1. Preserve the primary task. The user came to chat, work, or think; correction is secondary.
2. Stay peripheral until invited. Use compact status changes, glow, count, or short labels before showing detail.
3. Correct intent, not just grammar. Suggestions must preserve what the user meant while improving naturalness.
4. Offer small, actionable choices. Two strong rewrites are better than a long essay of feedback.
5. Teach the pattern after the moment. Real-time tips are for flow; weekly review is for learning.
6. Avoid shame mechanics. No grades, red-heavy error states, or classroom punishment aesthetics.
7. Earn trust through locality. History, corrections, and API configuration should feel private and user-owned.

## Core Experience Loop

1. The user writes English in a normal app such as an AI chat, Slack, email, or work messenger.
2. LingoCapsule detects a pause or receives a shortcut-triggered text capture.
3. The capsule gives an ambient status: `Native`, `1 Tip`, or `2 Tips`.
4. On hover or click, a compact panel explains the issue in Chinese and offers native rewrites.
5. The user can ignore, copy, or apply a suggestion.
6. The correction and outcome are logged locally for periodic review.
7. A review view turns repeated mistakes into personal learning targets.

## MVP UX Scope

The first usable version should prioritize one excellent loop over broad coverage:

- A floating capsule that can sit near the active text area or screen edge.
- A manual shortcut fallback for capture if automatic accessibility capture is not reliable yet.
- A compact suggestion card with one explanation and two rewrites: casual and professional.
- A simple history/review table showing original text, diagnosis, selected suggestion, and timestamp.
- Local-first settings for API base URL, API key, and model choice.

Do not spend the first version on heavy dashboards, gamification, social features, or a full editor surface. Those risk turning the product back into a separate study environment.

## Visual Direction

The capsule should feel calm, precise, and companion-like: closer to an ambient system utility than a classroom app.

Recommended direction:

- Form: pill/capsule geometry with soft depth, subtle glow, and clear state labels.
- Motion: gentle pulse for available tips, quick fade for “Native,” no bouncing or attention-grabbing animation.
- Color: neutral base with supportive green for clear/native and warm amber for improvement tips; avoid alarm-red unless text truly failed.
- Typography: compact, highly legible UI text; Chinese explanations should scan faster than they read.
- Tone: “Here is a more native version” rather than “You made a mistake.”

The visual metaphor is a signal light for language confidence, not a grammar police siren.

## Product Boundaries

LingoCapsule should not:

- Auto-replace text without explicit consent.
- Judge the user's intelligence or overall English level.
- Force every sentence into formal business English.
- Create noisy overlays inside every input field in v1.
- Treat perfect grammar as the only goal; naturalness and intent matter more.

## Success Criteria

The UX is working if:

- Users keep it running in the background without noticing performance drag.
- Users open suggestions voluntarily because the capsule feels useful, not intrusive.
- Suggestions preserve the user's original meaning while making the sentence more natural.
- Weekly review reveals repeated personal patterns, not generic grammar trivia.
- The user writes more English because feedback feels safe and immediate.

## Open Questions

- Should the capsule position itself near the active input or stay anchored to a screen corner for predictability?
- How much Chinese explanation is helpful before it slows the user down?
- Should “Native” appear often as positive reinforcement, or only when the user asks for confirmation?
- What is the default capture path for v1: automatic accessibility APIs, manual shortcut, or both?

## Recommendation

Proceed with the floating capsule thesis as the product's north star. Make the first version feel like an always-available sidecar for real English work, then use the logged corrections to build the deeper learning loop.

From a visual and UX standpoint, the product should win by being restrained: small surface area, high trust, fast feedback, and a calm coaching tone.
