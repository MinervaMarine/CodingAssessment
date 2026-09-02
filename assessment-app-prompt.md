# Prompt: build a self-contained algorithmic assessment web app

## CONTEXT
Internal screening tool for a .NET/C# team. Audience: junior developer candidates.
Consumer of the output: a hiring engineer who opens the downloaded JSON by hand.

## HARD CONSTRAINTS (violating any of these fails the task)
- Exactly three app files, side by side, no subfolders: `index.html`, `styles.css`, `app.js`.
  Plus one non-app file, `REVIEWER.md`, which the app never makes reachable: no `href`, no `src`, no
  fetch, no `window.open`. Naming it in a source comment to point a maintainer at the rubric is fine —
  a comment is invisible in the app and leaks no rubric content.
- Vanilla HTML/CSS/JS. No frameworks, no bundler, no build or transpile step, no npm, no TypeScript.
- Zero network requests at runtime: no CDN, no web fonts, no analytics, no `fetch`/XHR/WebSocket/beacon.
  System font stack only.
- Must work when `index.html` is opened directly from disk over `file://`. Therefore a classic
  `<script src="app.js"></script>` at the end of `<body>` — **not** `type="module"` (ES modules are
  blocked by CORS on `file://`). No dynamic `import`, no fetching a local JSON file.
- For the results file: `Blob` + `URL.createObjectURL` + a temporary `<a download>` + `revokeObjectURL`.
  Do **not** use `showSaveFilePicker` / the File System Access API (absent in Firefox and Safari,
  unreliable from `file://`). Do not invent filesystem APIs and do not imply the app can write to a
  server path.

## FLOW
One page, four screen states swapped in the DOM — no URL routing (history is fragile on `file://`):
START -> QUESTION(1..N) -> REVIEW -> RECEIPT.

**1. START**
- Full name (required, at least 2 non-space characters) and email (required, must contain a single `@`
  with something on each side — do not attempt RFC-perfect validation).
- Short instructions: 10 questions across three sections, 45-minute global limit, the timer starts on
  Start and never pauses, Back/Next allowed, skipping allowed, no feedback during the test, results
  download as a file at the end which the candidate must email to `<RECRUITER_EMAIL>`.
- Start stays disabled until both fields validate. Inline error text wired up with `aria-describedby`.
- If a resumable session exists in localStorage, offer "Resume as [name]" and "Start over" explicitly.
  Never silently resume, and never resume into a different candidate's answers.

**2. QUESTIONS — one per screen**
- The bank spans three sections: C# and algorithms, SQL, and AI. Auto-graded types
  (multiple-choice, grid) and human-graded types (free-text) are mixed within sections.
  Which is which lives in each question's `type`, and its section in its `section` — never
  derive either from a question's position, and never assume a section is contiguous with a
  type. Free-text answers are stored for manual review and never auto-graded.
- Bank order is C# and algorithms (questions 1-4), then SQL (questions 5-7), then AI
  (questions 8-10). That is a content decision, not something any code may rely on: SQL in the middle
  puts the longest section where a candidate still has the time for it, and the two quick AI grids
  last means mistiming SQL costs a few marks rather than a whole section. Changing the order must
  stay a data-only edit to the bank.
- A section eyebrow above the question heading names the section the current question belongs to.
  It is hidden when the bank holds only one distinct section, so a single-domain bank looks exactly
  as it did before sections existed.
- MCQ: a `<fieldset>` with the question as `<legend>`, real `<input type="radio">` plus `<label>`.
  Arrow-key navigation works natively — do not reimplement it.
- Grid: an outer `<fieldset>` whose `<legend>` is the prompt, holding one inner `<fieldset>` per row
  whose `<legend>` is the row text. `select: "multiple"` renders checkboxes; `select: "single"`
  renders radios named per row, so each row is its own radio group and native arrow keys stay inside
  it. Nested fieldsets give every group a real accessible name with no ARIA. The cells are a CSS grid
  with `repeat(auto-fit, minmax(11rem, 1fr))` so a five-column matrix collapses to one per line at
  360px with no media query. A grid counts as answered only when **every** row has a selection.
- Free text: `<textarea>`, monospace, minimum 10 rows, `spellcheck="false"`, autocapitalize and
  autocorrect off. Tab moves focus — accessibility beats code indentation, so do not trap Tab.
  Paste is allowed; do not try to block it.
- Progress: "Question 3 of 10" plus a bar, and an answered/unanswered marker.
- Back is disabled on the first question. Next on the last question goes to REVIEW. Never block Next
  on an unanswered question.
- No correctness feedback, ever — not on Next, not in the DOM, not in the console.
- On every screen change move focus to the question heading (`tabindex="-1"` + `.focus()`) so keyboard
  and screen-reader users land in the right place.

**3. TIMER — 45 minutes, global, always visible**
- Derive remaining time from a wall-clock deadline: store `startedAt` (epoch ms) and
  `deadline = startedAt + 45*60*1000`, then compute `remaining = deadline - Date.now()` on each tick.
  **Never decrement a counter** — background tabs throttle timers and the count drifts.
- Tick roughly 4x/second, render `mm:ss`.
- States: normal, warning at <= 5:00, urgent at <= 1:00. Signal each with text or an icon as well as
  colour, never colour alone.
- Accessibility: the ticking display is `aria-hidden="true"`. Announce through a separate polite live
  region only at 10, 5 and 1 minutes and at zero — do not make a live region that fires every second.
- At zero: auto-submit immediately from wherever the candidate is, mid-question included, through the
  same code path as a manual submit.
- On resume after a refresh: recompute from the stored deadline. If it has already passed, do not let
  them continue — submit what was saved and set `"timedOut": true`.

**4. REVIEW (before submit)**
- Every question listed as "Answered" or "Not answered" only. No answers echoed, no correctness,
  no score.
- Each row links back to its question.
- "Submit assessment" with a confirmation step that names how many questions are unanswered.
  After submitting there is no way back.

**5. RECEIPT (after submit)**
- Confirms the filename that was downloaded and which questions were answered or skipped.
- Never shows the score, the answer key, or per-question correctness.
- Fallback for a blocked or lost download: a read-only `<textarea>` holding the exact JSON, a
  "Copy JSON" button (`navigator.clipboard` with a `document.execCommand('copy')` fallback for
  `file://`), and a "Download again" button. Render that JSON with `textContent`, never `innerHTML`.

## PERSISTENCE
- Mirror answers to localStorage on every change, debounced ~300ms, under one namespaced key such as
  `assessment.v1.session`: schema version, candidate, startedAt, deadline, current index, answers,
  submitted flag.
- After a successful submit, move the payload to `assessment.v1.lastSubmitted` and delete the
  in-progress key — so a candidate who loses the file can still re-download from RECEIPT, while no
  resumable session is left behind.
- Wrap every localStorage read and write in try/catch and fall back to in-memory state. The test must
  remain completable with storage disabled (private mode, blocked site data).
- `beforeunload` warning while a session is in progress and not yet submitted.

## QUESTION BANK
- One `const QUESTIONS = [...]` array at the very top of `app.js`, above all logic, preceded by a
  comment explaining how to edit it.
- Every field the logic reads lives in the data: `id`, `type` (`"multiple-choice"` | `"grid"` |
  `"free-text"`), `section`, `topic`, `prompt`, `options: [{key, text}]`, `answerKey`, `grid`,
  `points`. Adding, removing or reordering questions — or changing the multiple-choice / grid /
  free-text mix — must require no edit below the array. The two fields added for the multi-domain
  bank, described in the same style as the rest of the field list:

  ```
  section    string   which part of the test this belongs to. Questions sharing
                      a section are grouped in the UI and in the results file,
                      in bank order. Grouping is derived from this string, so
                      there is no separate list of sections to keep in step.
  grid       object   grid only: { select, columns, rows }.
                        select  "multiple" -> checkboxes, "single" -> radios
                        columns [{key, text}] - the choices offered per row
                        rows    [{key, text, answerKey}] - one sub-question
                                each. answerKey is ALWAYS an array of column
                                keys, holding exactly one entry when select is
                                "single". Graded all-or-nothing: every row must
                                match for the question to count.
                      NOTE the grid's rows live at grid.rows, not at the
                      question's top-level `rows`, which is the textarea height.
  ```

  In particular `autoScore.outOf` is computed from the number of auto-graded questions —
  multiple-choice plus grid — and is never a literal.
- Write the ten actual questions, in bank order. Junior-appropriate, unambiguous, exactly one
  defensible answer per auto-graded question, distractors drawn from real misconceptions, no trick
  questions or riddles.
  - **C# and algorithms (4).** Three multiple-choice: string or array manipulation, loops or basic
    recursion, and simple Big-O reasoning. One free-text on `List<T>` vs `IEnumerable<T>` and
    deferred execution, asking for a short explanation and/or roughly 10-20 lines of C#, answerable
    in 8-10 minutes.
  - **SQL (3), all free-text.** Choosing a primary key that prevents duplicate rows; a join to a
    lookup table plus an age calculated from a date of birth that must be right all year; and an
    aggregate compared against an average of that same aggregate, which needs a subquery. All three
    read the same three-table schema, defined once as a string constant immediately above the bank
    and referenced from each question's `code`, so the tables sit on screen next to whichever
    question the candidate is on. Any SQL dialect is acceptable; there is no database here, so
    grade the reasoning.
  - **AI (3).** Two grids — one `select: "multiple"` on the properties of regression,
    classification and clustering, one `select: "single"` matching a technique to a problem — plus
    one free-text asking the candidate to pick one of the three and explain what the algorithm is
    given and what it produces. Because the grids are auto-graded, each row must have exactly one
    defensible answer: word the problems so that no second technique fits.
- Grading rubrics for every free-text question go in `REVIEWER.md`, **not** in `app.js` or the DOM —
  anything in `app.js` is visible to the candidate. Free-text questions keep `answerKey: null`;
  never park a model answer anywhere in `app.js`, where view-source will show it.

## RESULTS FILE
On submit, build this object and download it as `assessment_<lastname>_<YYYY-MM-DD-HHmm>.json`.

Filename rules: `<lastname>` is the last whitespace-separated token of the trimmed name, lowercased,
non-ASCII stripped or transliterated, anything outside `[a-z0-9-]` removed, truncated to 32 characters,
falling back to `candidate` when empty. Date and time are **local** time, zero-padded, 24-hour.

```json
{
  "schemaVersion": 2,
  "assessment": {
    "id": "junior-dev-screen",
    "version": "2.0.0",
    "questionCount": 10,
    "sections": ["C# and algorithms", "SQL", "AI"]
  },
  "candidate": { "name": "", "email": "" },
  "startedAt": "<ISO-8601 with offset>",
  "submittedAt": "<ISO-8601 with offset>",
  "durationSeconds": 0,
  "timeLimitSeconds": 2700,
  "timedOut": false,
  "autoScore": { "correct": 0, "outOf": 5 },
  "answers": [
    { "id": "q1", "type": "multiple-choice", "section": "C# and algorithms", "topic": "strings",
      "given": "b", "expected": "b", "correct": true },

    { "id": "sql2", "type": "free-text", "section": "SQL", "topic": "sql-joins",
      "given": "SELECT ...", "correct": null,
      "review": { "score": null, "notes": "", "outOf": 4 } },

    { "id": "ai1", "type": "grid", "section": "AI", "topic": "ai-technique-properties",
      "given":    { "regression": ["sup","num"], "classification": ["sup"], "clustering": ["unsup","sim"] },
      "expected": { "regression": ["sup","num"], "classification": ["sup","label"], "clustering": ["unsup","sim"] },
      "correct": false, "rowsCorrect": 2, "rowsOutOf": 3 }
  ]
}
```

`schemaVersion` is 2, not 1: `given` can now be an object, entries carry `section`, grid entries carry
`rowsCorrect`/`rowsOutOf`, free-text `review` carries `outOf`, and `autoScore.outOf` changes meaning.
A reader written against v1 would silently misreport a v2 file. `assessment.sections` lists the
distinct sections in bank order.

Payload rules:
- Field names exactly as shown. Every entry carries `section`.
- `answers` holds one entry per question in bank order, skipped ones included. Skipped: `given: null`,
  multiple-choice and grid `correct: false`, free-text `correct: null`. Whitespace-only free text
  counts as skipped.
- Grid entries: `given` and `expected` are maps of row key → array of column keys. `expected` is
  always the full key and `rowsOutOf` always the row count, whether or not anything was ticked. A
  grid with nothing ticked exports `given: null`, so the "skipped means `given: null`" rule reads the
  same for every type; a part-ticked grid exports only the rows that were ticked and `correct: false`.
- Grids are graded all-or-nothing: `correct` is true only when every row matches, and the question
  contributes 1 to `autoScore.correct`. `rowsCorrect` exists so a reviewer can see a near miss
  without partial credit blurring the headline number.
- `durationSeconds`: whole seconds from `startedAt` to `submittedAt`, clamped to `timeLimitSeconds`.
- `autoScore.outOf` is the number of auto-graded questions in the bank — multiple-choice plus grid;
  `correct` counts those only. Free text never contributes.
- The `review` placeholder on free-text entries is for the hiring engineer to fill in by hand;
  `review.outOf` is that question's `points`, so the maximum is in the file.

## KNOWN LIMITATIONS — do not paper over these
Everything runs on the candidate's machine, so the answer key in `app.js` and the `expected` values in
the JSON are visible to anyone who opens devtools or view-source. Client-side auto-grading cannot be
made tamper-proof: the score is a screening signal, not evidence. Do not add obfuscation,
minification, answer hashing or anti-devtools tricks that pretend otherwise — they add complexity and
buy nothing.

Instead, `REVIEWER.md` states this plainly and adds a "smallest real fix" section of no more than 15
lines: one POST endpoint behind static hosting (ASP.NET Core minimal API — the team's stack), question
bank and grading moved server-side, one write to a table or blob store. Outline only — do not build it.

`REVIEWER.md` also states what is deliberately *not* attempted: no proctoring, no tab-switch or paste
detection, no identity verification, no per-question timing. Do not implement any of these.

## CODE QUALITY
- No globals beyond a single namespace or IIFE. No `eval`. No `innerHTML` with any candidate-derived or
  bank-derived string — build nodes or use `textContent`.
- Comment the grading function and the JSON-export/download function: inputs, outputs, and the edge
  cases each handles.
- Grading, filename building and payload building are small named pure functions, readable and
  testable by hand.
- CSS: custom properties for the palette, system font stack, honours `prefers-reduced-motion` and stays
  readable under `prefers-color-scheme: dark`. Responsive from 360px up; the whole test usable on a
  phone. A visible focus ring on every interactive element — never `outline: none` without a
  replacement. Text contrast at least 4.5:1.

## DEFINITION OF DONE — self-check before reporting completion
1. Opened over `file://`, the devtools Network tab records zero requests.
2. Happy path: start, answer all ten, review, submit; the file downloads with the right name and shape.
3. Refresh mid-test: answers are restored and the remaining time is *lower*, not reset.
4. Temporarily set the limit to 30s: at zero it auto-submits from mid-question and the JSON carries
   `"timedOut": true`.
5. Submit with everything skipped: valid JSON, `autoScore` `{correct: 0, outOf: 5}`, every
   `given: null` — grids included, which export `null` rather than `{}`.
6. Keyboard only, no mouse: start, pick MCQ options, type in a textarea, navigate, submit.
7. Add any auto-graded question (multiple-choice or grid) to the bank, change nothing else, and
   `outOf` increases by one; the app still works.
8. Nothing anywhere in the UI reveals a correct answer or the score.
9. A part-ticked grid — some rows filled, at least one empty — reads "Not answered" on the question
   screen and in the review list, but the results file still exports the rows that were ticked.
10. A one-tick near miss on a grid gives `correct: false` with `rowsCorrect` showing how close it
    was (2 of 3, not 0 of 3).
11. Both grid variants are completable by keyboard alone: Tab reaches every cell, Space toggles a
    checkbox, and in a `select: "single"` grid the arrow keys move within one row's radio group and
    never jump to another row.
12. The grid is usable at 360px wide: the cells stack one per line, nothing overflows horizontally,
    and every label is still tied to its input.
13. A refresh part-way through a grid restores exactly the ticks that were there.
14. Reduce the bank to a single section and change nothing else: the section eyebrow is hidden and
    the review and receipt lists show no section subheadings — the screens look as they did before
    sections existed.

If something here is ambiguous or turns out impossible, take the most defensible reading, record the
assumption in a comment at the top of `app.js`, and continue — do not stop to ask, and do not silently
drop the requirement.
