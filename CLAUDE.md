# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A self-contained, offline screening assessment for junior .NET/C# candidates: 5 questions
(3 auto-graded MCQ + 2 human-graded free text), a global 30-minute timer, and a JSON results
file the candidate downloads and emails to a recruiter.

Four files, no subfolders:

- [index.html](index.html), [styles.css](styles.css), [app.js](app.js) — the app. These three must stay side by side.
- [REVIEWER.md](REVIEWER.md) — hiring-engineer notes: answer key, Q4/Q5 rubrics, known limitations.
  **The app must never load, link to, or mention this file** — it holds the answer key.

[assessment-app-prompt.md](assessment-app-prompt.md) is the original spec. It is the authority
on requirements and carries the 8-item "Definition of Done" checklist; re-read it before any
non-trivial change.

## Build, run, test

There is no build step, no bundler, no npm, no test runner, and no dependencies — by design.

Run it by opening the file directly (the app must work over `file://`):

```powershell
Start-Process index.html
```

Verification is manual in a browser. The regression suite is the "DEFINITION OF DONE" list at the
bottom of [assessment-app-prompt.md](assessment-app-prompt.md); run through the relevant items after
changing behaviour. Two that need setup:

- **Timeout path**: set `TIME_LIMIT_SECONDS` to `30` in [app.js](app.js), run through, confirm
  auto-submit mid-question and `"timedOut": true` in the JSON, then restore `30 * 60`.
- **Storage-disabled path**: block site data / use a private window. The assessment must remain
  completable, falling back to in-memory state.

Clear state between runs by deleting the `assessment.v1.session` and `assessment.v1.lastSubmitted`
localStorage keys.

## Hard constraints (breaking any of these breaks the deliverable)

- **Zero network requests at runtime.** No CDN, no web fonts, no `fetch`/XHR/WebSocket/beacon, no
  analytics. System font stack only. Devtools Network must record nothing.
- **`file://` compatible.** Classic `<script src="app.js">` at the end of `<body>` — never
  `type="module"`, no dynamic `import`, no fetching a local JSON file.
- Download is `Blob` + `URL.createObjectURL` + temporary `<a download>` + `revokeObjectURL`.
  Never the File System Access API.
- Vanilla HTML/CSS/JS only. No framework, no TypeScript, no transpile step.

## app.js architecture

One IIFE, no globals. Read top to bottom; the section banners are the map:

`QUESTION BANK` → `Configuration` → `State` → `DOM references` → `Small pure helpers` →
`Grading` → `Download` → `Storage` → `Screen plumbing` → `START` / `QUESTION` / `REVIEW` /
`TIMER` / `SUBMIT` / `RECEIPT` → `Flow` → `Wiring` → `Init`

A header comment block at the top records 11 numbered assumptions taken where the spec left room.
When an ambiguity comes up, check there first, and add to the list rather than deciding silently.

### The bank drives everything

`QUESTIONS` sits at the very top, above all logic. **No code below the array may read a question
index or a hard-coded count.** Question count, MCQ count, intro copy, progress bar and
`autoScore.outOf` are all derived — `countMultipleChoice(bank)` is why `outOf` is never the literal
`3`. Behaviour keys off `type` (`"multiple-choice"` | `"free-text"`), never off position. Adding a
fourth MCQ and changing nothing else must just work.

`bankSignature()` fingerprints `id:type` pairs and is stored with each session, so a session saved
against an edited bank is discarded rather than restored onto the wrong questions.

### Screens

Four `<section class="screen">` elements in [index.html](index.html), swapped by toggling `hidden`
in `showScreen(name)` — no URL routing (history is fragile on `file://`). Every screen change moves
focus to that screen's `tabindex="-1"` heading.

### Timer

Always `remaining = deadline - Date.now()`, where `deadline = startedAt + TIME_LIMIT_MS` is stored.
**Never decrement a counter** — background tabs throttle timers. Ticks ~4x/sec. The ticking display
is `aria-hidden`; a separate polite live region announces only at 10, 5, 1 minutes and zero. At zero,
auto-submit goes through `submitAssessment(true)` — the same single path as the manual submit button.

### Persistence

`assessment.v1.session` while in progress (debounced ~300ms). On submit the payload moves to
`assessment.v1.lastSubmitted` and the in-progress key is deleted, so RECEIPT can re-download but no
resumable session is left behind. Every read and write is wrapped in try/catch and flips
`storageWorks` to false on the first throw. Resume is always explicit ("Resume as [name]" /
"Start over") — never silent, never into another candidate's answers.

### Pure functions to keep pure and hand-testable

`gradeAnswers(bank, answers)`, `buildPayload(...)`, `buildFilename(rawName, date)`,
`buildLastNameSlug(...)`, `toIsoWithOffset(date)`. Each carries a doc comment listing inputs,
outputs and the edge cases it handles; keep those comments in sync. The results-file schema is
specified field-by-field in [assessment-app-prompt.md](assessment-app-prompt.md) and read by hand by
a hiring engineer — field names and shape are contractual.

## Conventions

- **ES5 syntax throughout**: `var`, function declarations, string concatenation for multi-line C#
  listings. No `const`/`let`, no arrow functions, no template literals in code. Match it.
- **Never `innerHTML`** with any bank-derived or candidate-derived string. Build nodes
  (`makeEl`, `clearChildren`) or set `textContent`.
- **No correctness feedback anywhere** — not in the UI, not on Next, not in the DOM, not in
  `console`. No screen states a score or marks an answer right or wrong.
- Rubrics and grading rationale live in [REVIEWER.md](REVIEWER.md) only. Anything in
  [app.js](app.js) is visible to the candidate.
- CSS uses custom properties for the palette (light + `prefers-color-scheme: dark`), honours
  `prefers-reduced-motion`, is responsive from 360px, keeps text contrast ≥ 4.5:1, and never
  removes a focus ring without a replacement. Signal timer state with text/icon as well as colour.
- Accessibility beats convenience: don't trap Tab in the textarea, don't reimplement radio-group
  arrow keys, don't block paste.

## Do not add

The answer key in [app.js](app.js) and `expected` in the JSON are visible to anyone who opens
devtools. This is accepted and documented. Do not add obfuscation, minification, answer hashing, or
anti-devtools tricks — they buy nothing and were deliberately excluded. Likewise deliberately absent
and not to be implemented: proctoring, tab-switch/blur/focus tracking, paste detection, identity
verification, per-question timing. The "smallest real fix" (server-side bank and grading behind an
ASP.NET Core minimal API) is an outline in [REVIEWER.md](REVIEWER.md) — outline only, not built.

## Before handing to candidates

`RECRUITER_EMAIL` in [app.js](app.js) is still the placeholder `recruiting@example.com`.
