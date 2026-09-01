# Prompt: build a self-contained algorithmic assessment web app

## CONTEXT
Internal screening tool for a .NET/C# team. Audience: junior developer candidates.
Consumer of the output: a hiring engineer who opens the downloaded JSON by hand.

## HARD CONSTRAINTS (violating any of these fails the task)
- Exactly three app files, side by side, no subfolders: `index.html`, `styles.css`, `app.js`.
  Plus one non-app file, `REVIEWER.md`, which the app never references.
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
- Short instructions: 5 questions, 30-minute global limit, the timer starts on Start and never pauses,
  Back/Next allowed, skipping allowed, no feedback during the test, results download as a file at the
  end which the candidate must email to `<RECRUITER_EMAIL>`.
- Start stays disabled until both fields validate. Inline error text wired up with `aria-describedby`.
- If a resumable session exists in localStorage, offer "Resume as [name]" and "Start over" explicitly.
  Never silently resume, and never resume into a different candidate's answers.

**2. QUESTIONS — one per screen**
- Q1-Q3: algorithmic, multiple-choice, auto-graded. Q4-Q5: C#-specific, free-text, stored for manual
  review, never auto-graded. This mapping lives in the bank data — do not derive behaviour from the
  question's index.
- MCQ: a `<fieldset>` with the question as `<legend>`, real `<input type="radio">` plus `<label>`.
  Arrow-key navigation works natively — do not reimplement it.
- Free text: `<textarea>`, monospace, minimum 10 rows, `spellcheck="false"`, autocapitalize and
  autocorrect off. Tab moves focus — accessibility beats code indentation, so do not trap Tab.
  Paste is allowed; do not try to block it.
- Progress: "Question 3 of 5" plus a bar, and an answered/unanswered marker.
- Back is disabled on Q1. Next on the last question goes to REVIEW. Never block Next on an unanswered
  question.
- No correctness feedback, ever — not on Next, not in the DOM, not in the console.
- On every screen change move focus to the question heading (`tabindex="-1"` + `.focus()`) so keyboard
  and screen-reader users land in the right place.

**3. TIMER — 30 minutes, global, always visible**
- Derive remaining time from a wall-clock deadline: store `startedAt` (epoch ms) and
  `deadline = startedAt + 30*60*1000`, then compute `remaining = deadline - Date.now()` on each tick.
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
- Every field the logic reads lives in the data: `id`, `type` (`"multiple-choice"` | `"free-text"`),
  `topic`, `prompt`, `options: [{key, text}]`, `answerKey`, `points`. Adding, removing or reordering
  questions — or changing the multiple-choice/free-text mix — must require no edit below the array.
  In particular `autoScore.outOf` is computed from the number of multiple-choice questions and is
  never the literal `3`.
- Write the five actual questions. Junior-appropriate, unambiguous, exactly one defensible answer per
  MCQ, distractors drawn from real misconceptions, no trick questions or riddles. Q1-Q3 across array
  or string manipulation, loops or basic recursion, and simple Big-O reasoning. Q4-Q5 from value vs
  reference types, `List<T>` vs `IEnumerable<T>` and deferred execution, LINQ, async/await basics,
  null handling. Free-text prompts ask for a short explanation and/or roughly 10-20 lines of C#,
  answerable in 8-10 minutes each.
- Grading rubrics for Q4-Q5 go in `REVIEWER.md`, **not** in `app.js` or the DOM — anything in `app.js`
  is visible to the candidate.

## RESULTS FILE
On submit, build this object and download it as `assessment_<lastname>_<YYYY-MM-DD-HHmm>.json`.

Filename rules: `<lastname>` is the last whitespace-separated token of the trimmed name, lowercased,
non-ASCII stripped or transliterated, anything outside `[a-z0-9-]` removed, truncated to 32 characters,
falling back to `candidate` when empty. Date and time are **local** time, zero-padded, 24-hour.

```json
{
  "schemaVersion": 1,
  "assessment": { "id": "junior-dotnet-screen", "version": "1.0.0", "questionCount": 5 },
  "candidate": { "name": "", "email": "" },
  "startedAt": "<ISO-8601 with offset>",
  "submittedAt": "<ISO-8601 with offset>",
  "durationSeconds": 0,
  "timeLimitSeconds": 1800,
  "timedOut": false,
  "autoScore": { "correct": 0, "outOf": 3 },
  "answers": [
    { "id": "q1", "type": "multiple-choice", "topic": "arrays",
      "given": "b", "expected": "c", "correct": false },
    { "id": "q4", "type": "free-text", "topic": "csharp-linq",
      "given": "...", "correct": null, "review": { "score": null, "notes": "" } }
  ]
}
```

Payload rules:
- Field names exactly as shown.
- `answers` holds one entry per question in bank order, skipped ones included. Skipped: `given: null`,
  MCQ `correct: false`, free-text `correct: null`. Whitespace-only free text counts as skipped.
- `durationSeconds`: whole seconds from `startedAt` to `submittedAt`, clamped to `timeLimitSeconds`.
- `autoScore.outOf` is the number of MCQs in the bank; `correct` counts MCQs only.
- The `review` placeholder on free-text entries is for the hiring engineer to fill in by hand.

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
2. Happy path: start, answer all five, review, submit; the file downloads with the right name and shape.
3. Refresh mid-test: answers are restored and the remaining time is *lower*, not reset.
4. Temporarily set the limit to 30s: at zero it auto-submits from mid-question and the JSON carries
   `"timedOut": true`.
5. Submit with everything skipped: valid JSON, `autoScore` `{correct: 0, outOf: 3}`, every
   `given: null`.
6. Keyboard only, no mouse: start, pick MCQ options, type in a textarea, navigate, submit.
7. Add a fourth MCQ to the bank and change nothing else: `outOf` becomes 4 and the app still works.
8. Nothing anywhere in the UI reveals a correct answer or the score.

If something here is ambiguous or turns out impossible, take the most defensible reading, record the
assumption in a comment at the top of `app.js`, and continue — do not stop to ask, and do not silently
drop the requirement.
