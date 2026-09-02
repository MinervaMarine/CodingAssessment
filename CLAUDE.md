# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A self-contained, offline screening assessment for junior developer candidates: 10 questions across
three sections in bank order — C# and algorithms (questions 1–4, `q1`–`q4`), SQL (questions 5–7,
`sql1`–`sql3`), AI (questions 8–10, `ai1`–`ai3`) — of which 5 are auto-graded (3 multiple-choice + 2
grid) and 5 are human-graded free text. A global 45-minute timer, and a `schemaVersion: 2` JSON
results file the candidate downloads and emails to a recruiter.

Four files, no subfolders:

- [index.html](index.html), [styles.css](styles.css), [app.js](app.js) — the app. These three must stay side by side.
- [REVIEWER.md](REVIEWER.md) — hiring-engineer notes: answer key (multiple-choice plus both grids'
  per-row keys), rubrics for the five free-text questions, known limitations.
  **The app must never make this file reachable** — no `href`, `src`, fetch or `window.open`; it
  holds the answer key. Naming it in a source comment to point a maintainer at the rubric is fine
  and is the established convention (four such comments in [app.js](app.js)); a comment is invisible
  in the app and leaks no rubric content.

[assessment-app-prompt.md](assessment-app-prompt.md) is the original spec, kept in step with the app.
It is the authority on requirements and carries the 14-item "Definition of Done" checklist; re-read it
before any non-trivial change.

## Build, run, test

There is no build step, no bundler, no npm, no test runner, and no dependencies — by design.

Run it by opening the file directly (the app must work over `file://`):

```powershell
Start-Process index.html
```

The regression suite is the "DEFINITION OF DONE" list at the bottom of
[assessment-app-prompt.md](assessment-app-prompt.md); run through the relevant items after changing
behaviour. Two that need setup:

- **Timeout path**: set `TIME_LIMIT_SECONDS` to `30` in [app.js](app.js), run through, confirm
  auto-submit mid-question and `"timedOut": true` in the JSON, then restore `45 * 60`.
- **Storage-disabled path**: block site data / use a private window. The assessment must remain
  completable, falling back to in-memory state.

### The `test-extract` markers, and what is actually verified

[app.js](app.js) carries six comment markers in three pairs:

```
/* --- test-extract:bank:start --- */   ... /* --- test-extract:bank:end --- */
/* --- test-extract:config:start --- */ ... /* --- test-extract:config:end --- */
/* --- test-extract:pure:start --- */   ... /* --- test-extract:pure:end --- */
```

They delimit regions that a throwaway Node harness slices out of `app.js` by string search and
evaluates with `new Function`, so the pure functions and the real question bank can be asserted
without a test runner — npm and any build step are forbidden here, and adding a devDependency to
ship three static files is not worth it. Because the harness reads the shipped source rather than a
copy, it cannot drift from it. **The harness lives outside the repo, in a scratchpad directory, and
is deliberately not shipped** — it is a development aid, not a deliverable. Do not add it, a
`package.json`, or a `test/` folder.

Two rules if you move code around:

- `test-extract:bank:start` must stay **above** `SQL_SCHEMA`, not just above `QUESTIONS`. The bank
  region is evaluated in isolation (`region + 'return QUESTIONS;'`), so every identifier the array
  references has to be inside the region or the evaluation throws.
- `config` and `pure` are evaluated together, so a pure function may use a config constant
  (`SCHEMA_VERSION`, `TIME_LIMIT_SECONDS`) but nothing in either region may touch `document`,
  `window`, `state` or `dom`. Keeping those regions DOM-free is what makes them testable at all.

**What is verified, and what is not.** Be honest about the split — a green harness is not full
coverage:

- *Covered by the harness*: `sameKeySet`, `sanitiseGridValue`, `gradeGrid`, `gridExpected`,
  `isAutoGraded` / `countAutoGraded`, `sectionsOf`, `isAnswered`, `answeredCount`, `restoreAnswers`,
  `gradeAnswers`, `buildPayload`, `buildFilename`; the bank's shape (ids unique, types known, grid
  row keys resolving to real column keys, free-text `points` present); and grading the *real* bank
  end to end, so a question added to `QUESTIONS` is checked with no edit to the harness.
- *Not covered at all*: the DOM renderers (`buildGrid`, `groupedListInto`, `renderStartIntro`, the
  section eyebrow, review/receipt grouping), anything in [index.html](index.html), and anything in
  [styles.css](styles.css) — layout, focus rings, dark mode, the 360px grid collapse. Those rest
  entirely on manual browser checks against the Definition of Done. Change a renderer or the CSS and
  the harness will still pass while the app is broken.

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

A header comment block at the top records 15 numbered assumptions taken where the spec left room.
When an ambiguity comes up, check there first, and add to the list rather than deciding silently.

### The bank drives everything

`QUESTIONS` sits at the very top, above all logic, with `SQL_SCHEMA` immediately above it — one
string holding the three-table listing, referenced from each SQL question's `code` field so the
tables render next to whichever SQL question is on screen. Editing it changes all three at once.

**No code below the array may read a question index or a hard-coded count.** Question count,
auto-graded count, section grouping, intro copy, progress bar and `autoScore.outOf` are all derived —
`countAutoGraded(bank)`, over `isAutoGraded(q)` (`type === 'multiple-choice' || type === 'grid'`), is
why `outOf` is never a literal. Adding a grid question moves `outOf` exactly as adding an MCQ does.

Behaviour keys off `type` (`"multiple-choice"` | `"grid"` | `"free-text"`), never off position, via
the `BUILDERS` map; an unknown type degrades to free-text, matching `gradeAnswers`, which stores it
and never scores it.

- **`grid`** is auto-graded all-or-nothing: every row must match its `answerKey` for the question to
  count 1. `grid.select` is `"multiple"` (checkboxes, several ticks per row) or `"single"` (radios
  named per row, one tick). A row `answerKey` is **always an array**, holding exactly one entry when
  `select` is `"single"` — that uniformity is what lets `sameKeySet` grade both variants.
- **Naming trap:** the grid's own rows live at `grid.rows`. The question's top-level `rows` is the
  free-text textarea height. Putting grid rows there breaks **the grid**, silently and completely:
  `BUILDERS` still routes `type: 'grid'` to `buildGrid` (so `buildFreeText` never runs), but
  `buildGrid` finds no rows to render and `gradeGrid`'s `rows.length > 0` guard means the question
  can never be marked correct.
- A grid answer in `state.answers` is an **object** (`{ rowKey: [colKey, ...] }`, empty rows
  omitted), not a string, so every read of a stored answer branches on the question's type.

`section` is a plain string on every question; `sectionsOf(bank)` derives the distinct labels by
walking the bank in order, so there is no section registry to desynchronise — but the questions of
one section must sit together in the array or that section renders twice. The section eyebrow and the
review/receipt `<h3>`s are hidden when the bank has one distinct section, so a single-domain bank
looks exactly as it did before sections existed.

`bankSignature()` fingerprints `id:type` pairs and is stored with each session, so a session saved
against an edited bank is discarded rather than restored onto the wrong questions.

`restoreAnswers(bank, savedAnswers)` is the single path from a saved session back into state — it
keeps only ids still in the bank and only values of the right shape per type, sanitising grid values
through `sanitiseGridValue`. It is shared by `hydrate()` and `offerResume()` on purpose: the count on
the resume panel can then never disagree with what actually gets restored.

> **Never put a model answer in [app.js](app.js).** Free-text questions keep `answerKey: null`, and
> grid questions keep their top-level `answerKey: null` (a grid keys per row, inside `grid.rows`).
> Nothing enforces this — the free-text grading branch never reads `answerKey`, and the test harness
> asserts the multiple-choice keys but has no assertion that a free-text `answerKey` is null — so an
> `answerKey` added to a free-text question would have no runtime effect while sitting in
> view-source for the candidate to read. Rubrics, expected answers and grading rationale live in
> [REVIEWER.md](REVIEWER.md) only.

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
`buildLastNameSlug(...)`, `toIsoWithOffset(date)`, `sameKeySet(a, b)`,
`sanitiseGridValue(question, value)`, `gradeGrid(question, value)`, `gridExpected(question)`,
`sectionsOf(bank)`, `restoreAnswers(bank, savedAnswers)`. Each carries a doc comment listing inputs,
outputs and the edge cases it handles; keep those comments in sync. All of them sit inside the
`test-extract:pure` region and are what the Node harness asserts, so keep them free of `document`,
`window`, `state` and `dom`. The results-file schema is specified field-by-field in
[assessment-app-prompt.md](assessment-app-prompt.md) and read by hand by a hiring engineer — field
names and shape are contractual, and `schemaVersion` moves when a meaning changes (1 → 2 when
`autoScore.outOf` went from "MCQs" to "auto-graded questions").

## Conventions

- **The bank is the only thing you edit.** Nothing below `QUESTIONS` may read a question index or a
  hard-coded count — and that now covers three derived things, not one: the auto-graded count behind
  `autoScore.outOf`, the section grouping on the question, review and receipt screens, and every
  count in the intro copy. If a change would make you write `QUESTIONS[3]`, a literal `10`, a literal
  `5`, or a hard-coded list of sections anywhere below the array, it is the wrong change.
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
  arrow keys (including inside a `select: 'single'` grid row, where the per-row `name` is what keeps
  native arrow keys within one row), don't block paste. The grid's accessible names come from nested
  `<fieldset>`/`<legend>` rather than ARIA — keep it that way.

## Do not add

The answer key in [app.js](app.js) — the multiple-choice `answerKey`s and both grids' per-row keys —
and `expected` in the JSON are visible to anyone who opens devtools. This is accepted and documented.
Also deliberate: no partial credit on a grid, only `rowsCorrect` in the results file so a reviewer can
see a near miss. Do not add obfuscation, minification, answer hashing, or
anti-devtools tricks — they buy nothing and were deliberately excluded. Likewise deliberately absent
and not to be implemented: proctoring, tab-switch/blur/focus tracking, paste detection, identity
verification, per-question timing. The "smallest real fix" (server-side bank and grading behind an
ASP.NET Core minimal API) is an outline in [REVIEWER.md](REVIEWER.md) — outline only, not built.

## Before handing to candidates

`RECRUITER_EMAIL` in [app.js](app.js) is still the placeholder `recruiting@example.com`.
