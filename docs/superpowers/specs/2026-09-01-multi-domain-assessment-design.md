# Design: multi-domain junior developer screen (C# + SQL + AI)

Date: 2026-09-01
Status: approved. Implementation plan: [../plans/2026-09-01-multi-domain-assessment.md](../plans/2026-09-01-multi-domain-assessment.md)

## 1. Goal

Extend the existing single-domain junior .NET screening app into a three-section screen covering
C#/algorithms, SQL and AI fundamentals, without breaking any of the app's standing constraints
(three files, vanilla JS, zero network, works over `file://`).

Decisions taken during brainstorming, recorded here so they are not re-litigated:

| Decision | Choice |
|----------|--------|
| Deliverable | Spec (`assessment-app-prompt.md`) **and** working app (`app.js`, `styles.css`, `index.html`, `REVIEWER.md`) |
| Time limit | 45 minutes, with the C# section trimmed to make room |
| Which C# question is dropped | `q5` (value vs reference types, null). `q4` (deferred execution) is kept |
| Q2a / Q2b format | One new `grid` question type, auto-graded |
| Q2a / Q2b rendering | One `<fieldset>` per grid row, not a literal HTML table |
| Structure | New `section` field, grouped in the UI and exported in the results file |

## 2. Resulting question bank

10 questions: 3 multiple-choice, 2 grid, 5 free-text. Auto-graded total is 5.

| id | section | type | topic | points | est. min |
|----|---------|------|-------|--------|----------|
| `q1` | C# and algorithms | multiple-choice | strings | 1 | 2 |
| `q2` | C# and algorithms | multiple-choice | recursion | 1 | 2 |
| `q3` | C# and algorithms | multiple-choice | big-o | 1 | 2 |
| `q4` | C# and algorithms | free-text | csharp-linq | 6 | 9 |
| `sql1` | SQL | free-text | sql-keys | 4 | 3 |
| `sql2` | SQL | free-text | sql-joins | 4 | 6 |
| `sql3` | SQL | free-text | sql-aggregates | 6 | 8 |
| `ai1` | AI | grid (`multiple`) | ai-technique-properties | 3 | 3 |
| `ai2` | AI | grid (`single`) | ai-technique-selection | 3 | 2 |
| `ai3` | AI | free-text | ai-how-it-works | 4 | 3 |

Estimated answering time 40 minutes against a 45-minute limit. Human-graded points total 24.

`q5` is deleted outright rather than commented out — a commented-out question is still visible in
view-source and invites confusion about whether it is live.

## 3. The shared SQL schema

All three SQL questions need the same three tables in front of the candidate on their own screen.
The listing is defined once as a `var SQL_SCHEMA` string immediately above `QUESTIONS` and
referenced from each SQL question's `code` field. It stays above all logic, so the rule "the bank
is the only thing you edit" holds.

```
Seafarers                                   -- one row per employee
    SeamanCode   varchar(10)   not null     -- unique staff identifier
    Name         nvarchar(100) not null
    DateOfBirth  date          not null
    RankCode     varchar(10)   not null     -- the seafarer's CURRENT rank

Ranks                                       -- lookup
    RankCode         varchar(10)  not null  -- e.g. 'CAP'
    RankDescription  nvarchar(50) not null  -- e.g. 'Captain'

SeamanTransactions                          -- one row per voyage
    SeamanCode   varchar(10)  not null
    RankCode     varchar(10)  not null      -- the rank held on THAT voyage
    SignOnDate   date         not null
    SignOffDate  date         null          -- null while still on board
    Vessel       nvarchar(50) not null
    Port         nvarchar(50) not null
```

Two deliberate details:

- The comments distinguish `Seafarers.RankCode` (current rank) from `SeamanTransactions.RankCode`
  (rank held on that voyage). This is the ambiguity flagged during brainstorming; naming it in the
  schema lets `sql3` state which one it means instead of leaving the candidate to guess.
- `SignOffDate` is nullable. Realistic, and noticing it is a bonus in the `sql3` rubric, but `sql3`
  defines a voyage as "any row" so counting is never ambiguous.

## 4. New question content

### 4.1 `sql1` — primary key choice (free-text, 4 points)

> We want to guarantee that `SeamanTransactions` can never contain two rows for the same voyage.
> Which column or columns would you choose as the primary key, and why? Mention anything about the
> data that would make your choice unsafe.

Rubric lives in `REVIEWER.md`. Outline: `(SeamanCode, SignOnDate)` is the strongest natural key —
one person cannot sign on twice on the same day. `(SeamanCode, Vessel, SignOnDate)` earns full
credit with reasoning. Zero for `SeamanCode` alone, or for putting `RankCode` or `Port` in the key.
Full credit also for arguing a surrogate identity PK plus a `UNIQUE` constraint on the natural key,
which is what most teams actually do. Bonus for naming a condition that breaks the choice:
`SignOnDate` carrying a time component, or a same-day sign-on after an early sign-off.

### 4.2 `sql2` — join and age (free-text, 4 points)

> Write a query returning `SeamanCode`, `Name`, `RankDescription` and `Age` for every seafarer
> whose `RankCode` is `'CAP'`. `Age` must be their actual age in years today, not their date of
> birth.

The discriminator is the age calculation, and the rubric says so explicitly.
`DATEDIFF(YEAR, DateOfBirth, GETDATE())` is **wrong** — it counts calendar-year boundaries, so
someone born 2000-12-31 reads as 26 on 2026-01-01. Accepted: `DATEDIFF` with a birthday `CASE`
adjustment or the `DATEADD` comparison. `FLOOR(DATEDIFF(DAY, dob, GETDATE()) / 365.25)` is worth
the same credit but is NOT exact — it reads a day early whenever the leap days crossed number fewer
than years/4 (born 1980-03-01, evaluated 2026-03-01: 16801/365.25 = 45.997 -> 45, true age 46), so
the rubric must record it as good-but-approximate rather than exact. Partial credit for a correct
join and filter with the naive age.

### 4.3 `sql3` — aggregate with a subquery (free-text, 6 points)

> Return the Captains who have completed more voyages than the average number of voyages completed
> by all Captains. Treat a Captain as a seafarer whose current rank (`Seafarers.RankCode`) is
> `'CAP'`, and count a voyage as any row in `SeamanTransactions` for that seafarer.

Rubric outline: `GROUP BY` with `HAVING COUNT(*) >` a scalar subquery holding the average of
per-captain counts. Common failures: `HAVING COUNT(*) > AVG(COUNT(*))` (not valid), or averaging
over all seafarers rather than captains only. Bonus for noticing that captains with zero voyages
drop out of an inner join and asking whether they belong in the average — that judgment is the real
discriminator — and for remarking on the two `RankCode` columns and stating which was used.

### 4.4 `ai1` — technique properties (grid, `select: 'multiple'`, 3 points)

Prompt: "For each technique, tick every box that applies. A technique may have more than one box
ticked."

Columns: `sup` Supervised · `unsup` Unsupervised · `label` Predefined category/label · `num`
Continuous number · `sim` Groups by similarity (no labels)

| row key | row text | answerKey |
|---------|----------|-----------|
| `regression` | Regression | `['sup', 'num']` |
| `classification` | Classification | `['sup', 'label']` |
| `clustering` | Clustering | `['unsup', 'sim']` |

Every row has exactly two correct ticks, and no cell is defensible in two ways.

### 4.5 `ai2` — technique selection (grid, `select: 'single'`, 3 points)

Prompt: "Choose the technique that fits each problem."

Columns: `R` Regression · `C` Classification · `Cl` Clustering

| row key | row text | answerKey |
|---------|----------|-----------|
| `fuel` | Predict next month's bunker fuel consumption | `['R']` |
| `pump` | You have three years of pump readings, each already labelled "normal" or "failed". Flag whether a new reading looks normal or like a likely failure. | `['C']` |
| `profile` | Find natural groupings of vessels by operating profile, with no categories defined in advance | `['Cl']` |

The `pump` row is reworded from the original. As first written ("flag whether a pump's readings look
normal or like a likely failure") anomaly detection was an equally defensible answer, which the spec
forbids for an auto-graded question. Stating that labelled history exists pins it to classification.

### 4.6 `ai3` — how it works (free-text, 4 points)

> Pick any one of regression, classification or clustering and explain in two or three sentences how
> that kind of problem is actually solved — what the algorithm is given, and what it produces.

The rubric covers all three choices, since the candidate picks.

## 5. The `grid` question type

`ai1` and `ai2` are the same shape: a matrix whose rows each take one or more column selections. One
type, one renderer, one grading path.

```js
{
  id: 'ai1',
  type: 'grid',
  section: 'AI',
  topic: 'ai-technique-properties',
  topicLabel: 'Supervised, unsupervised and what each technique predicts',
  prompt: 'For each technique, tick every box that applies...',
  code: null,
  parts: null,
  hint: null,
  options: [],
  answerKey: null,              // grids key per row, inside grid.rows
  grid: {
    select: 'multiple',         // 'multiple' -> checkboxes, 'single' -> radios
    columns: [ { key: 'sup', text: 'Supervised' } /* , ... */ ],
    rows: [ { key: 'regression', text: 'Regression', answerKey: ['sup', 'num'] } /* , ... */ ]
  },
  points: 3,
  rows: 0
}
```

`answerKey` on a row is **always an array** of column keys — exactly one element when
`select: 'single'`. That uniformity is what lets one comparison function grade both variants.

**Field-name collision:** the grid's rows must live at `grid.rows`. The question object's top-level
`rows` is already the free-text textarea height. Putting grid rows there breaks the GRID, not
`buildFreeText` — `BUILDERS` routes `type: 'grid'` to `buildGrid`, so `buildFreeText` never runs for
one; the damage is that `gradeGrid`'s `rows.length > 0` guard can then never be satisfied.

### 5.1 Stored answer value

`state.answers[id]` currently holds a raw string. For a grid it holds an object mapping row key to
an array of selected column keys, with empty rows omitted:

```js
{ regression: ['sup', 'num'], classification: ['sup'] }
```

This is the change that ripples: everything that assumed a string needs a type branch.

### 5.2 Answered / not answered

A grid counts as answered only when **every** row has at least one selection. A partly filled grid
therefore shows "Not answered" on the question screen and the review list, which is the safer nudge,
while the results file still exports exactly what was ticked. `isAnswered` stays boolean — no third
UI state is introduced.

### 5.3 Grading

A grid is correct only when every row's selected set exactly equals that row's `answerKey` set,
compared order-independently. It contributes 1 to `autoScore.correct`, all or nothing. Per-row counts
are exported so the reviewer can see a near-miss without partial credit blurring the headline number.

`rowsOutOf` is always `grid.rows.length`, whether or not the candidate ticked anything, so the
reviewer can read `rowsCorrect / rowsOutOf` without cross-referencing the bank. `expected` is always
the full expected map, likewise. An entirely unticked grid stores `{}` in memory but exports
`given: null`, so the "skipped means `given: null`" rule reads the same for every question type.

`autoScore.outOf` becomes the count of **auto-gradable** questions via a derived
`isAutoGraded(question)` helper (`type === 'multiple-choice' || type === 'grid'`). It remains
computed, never a literal.

### 5.4 Rendering

An outer `<fieldset>` whose `<legend>` is the prompt, containing one inner `<fieldset>` per row whose
`<legend>` is the row text. Nested fieldsets are valid HTML and give each group of checkboxes a real
accessible name without any ARIA.

```
<fieldset class="q-grid">
  <legend class="q-prompt">For each technique, tick every box that applies...</legend>
  <fieldset class="q-grid-row">
    <legend>Regression</legend>
    <div class="q-grid-cells">
      <div class="q-option">
        <input type="checkbox" id="..." value="sup"><label for="...">Supervised</label>
      </div>
      ...
    </div>
  </fieldset>
  ...
</fieldset>
```

- `select: 'single'` renders `type="radio"` with `name="grid-<questionId>-<rowKey>"`, so each row is
  its own radio group and native arrow-key navigation works within a row. Checkboxes get no shared
  `name`.
- `.q-grid-cells` is `display: grid` with `repeat(auto-fit, minmax(11rem, 1fr))`, so five columns on
  a desktop collapse to one per line at 360px with no media query and no DOM restructuring.

Rejected alternative: a real `<table>` with `<th scope>`. Correct semantics, but making a 5-column
matrix usable at 360px needs either responsive-table CSS tricks or a second DOM structure behind a
media query — a lot of machinery for a form three rows tall.

## 6. Sections

A `section` string on every question (`'C# and algorithms'`, `'SQL'`, `'AI'`). Grouping is derived by
walking the bank in order and starting a new group whenever the value changes; no separate section
registry, so reordering the bank cannot desynchronise anything.

- **Question screen:** a section eyebrow above the heading. New element in `index.html`:
  `<p id="question-section" class="q-section"></p>`. Hidden when the bank has only one distinct
  section, so a single-domain bank looks exactly as it does today.
- **Review and receipt lists:** `#review-list` and `#receipt-list` change from `<ul>` to `<div>`
  containers. Each section emits an `<h3>` plus its own `<ul>`; `buildReviewRow` is unchanged. The
  `<h3>` is omitted when there is only one section.
- **Results file:** each answer entry carries `section`, and `assessment.sections` lists them in bank
  order.

## 7. Results file — `schemaVersion` 2

The change is incompatible, so the version moves from 1 to 2: `given` can now be an object, entries
gain `section`, grid entries gain `rowsCorrect`/`rowsOutOf`, free-text `review` gains `outOf`, and
`autoScore.outOf` changes meaning. A reader written against v1 would silently misreport a v2 file.

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

`assessment.id` moves from `junior-dotnet-screen` to `junior-dev-screen`: the test is no longer only
about .NET. Version moves to `2.0.0`.

Skipped-answer rules, extending the existing ones:

| type | nothing entered | partially entered |
|------|-----------------|-------------------|
| multiple-choice | `given: null`, `correct: false` | n/a |
| free-text (incl. whitespace only) | `given: null`, `correct: null` | n/a |
| grid | `given: null`, `correct: false`, `rowsCorrect: 0` | `given` holds the ticked rows only, `correct: false` |

## 8. Code changes

### `app.js`

| Area | Change |
|------|--------|
| Assumptions header | New numbered entries for the grid answer shape, the schema 2 bump, the partly-filled-grid rule, and the `pump`/`sql3` rewordings |
| `SQL_SCHEMA` | New string constant above `QUESTIONS` |
| `QUESTIONS` | Delete `q5`; add `section` to all; add `sql1`–`sql3`, `ai1`–`ai2`, `ai3` |
| Config | `TIME_LIMIT_SECONDS = 45 * 60`; `SCHEMA_VERSION = 2`; `ASSESSMENT` id and version |
| Helpers | New `isAutoGraded`, `sectionsOf(bank)`, `sameKeySet(a, b)`, `sanitiseGridValue(question, value)` |
| `isAnswered` | New `grid` branch (all rows must have a selection) |
| `countMultipleChoice` | Becomes `countAutoGraded`, used for `autoScore.outOf` |
| `bankSignature` | Unchanged (`id:type` pairs still detect a changed bank) |
| `gradeAnswers` | Per-type branch; grid comparison and `rowsCorrect`; `section` on every entry; `review.outOf` from `points` |
| `buildPayload` | `assessment.sections`; schema 2 shape |
| `buildGrid` | New renderer per §5.4 |
| `renderQuestion` | Ternary replaced with a `BUILDERS` map; unknown type still degrades to free-text; sets the section eyebrow |
| `hydrate` | Sanitise grid values (drop unknown row and column keys, cap `single` rows at one) |
| `renderReview`, `renderReceipt` | Section grouping |
| `renderStartIntro` | Derived copy: question count, section list, auto-graded count, free-text count |

### `index.html`

Add `#question-section`; change `#review-list` and `#receipt-list` from `<ul>` to `<div>`; rework the
intro `<li>` that currently hard-codes "the first 3 are multiple choice".

### `styles.css`

New `.q-section`, `.q-grid`, `.q-grid-row`, `.q-grid-cells`, `.review-group` rules on the existing
custom properties. Dark-mode tokens reused, focus rings inherited from the global input rule.

### `REVIEWER.md`

Answer keys for both grids; rubrics for `sql1`, `sql2`, `sql3`, `ai3`; `q5` rubric removed; schema 2
and the new `autoScore.outOf` meaning documented; the totals guidance rewritten for 24 human-graded
points across three sections.

### `assessment-app-prompt.md`

Rewrite the QUESTION BANK section in terms of domain and type rather than "Q1–Q3 / Q4–Q5" — the
existing wording contradicts the document's own rule that behaviour must never derive from a
question's index, and with three sections it stops working entirely. Add the `grid` type and
`section` field, the 45-minute limit, schema 2, and the new payload example.

Definition-of-Done edits:

- Item 5: `autoScore` for an all-skipped submission becomes `{correct: 0, outOf: 5}`, and grid `given`
  is `null`.
- Item 7: "add a fourth MCQ and `outOf` becomes 4" becomes "add any auto-graded question (MCQ or
  grid), change nothing else, and `outOf` increases by one".
- New items: a partly ticked grid reads "Not answered" but still exports its ticks; a one-tick
  near-miss gives `correct: false` with `rowsCorrect` showing the near-miss; both grid variants are
  completable by keyboard alone; the grid is usable at 360px; a refresh mid-grid restores the ticks;
  a bank reduced to one section hides the eyebrow and the review subheadings.

### `CLAUDE.md`

Question types list gains `grid`; time limit, schema version and assessment id updated; the
`SQL_SCHEMA` shared constant noted; the "nothing below the array reads an index" invariant extended
to cover section grouping and the auto-graded count.

## 9. Verification

No test runner exists and none is being added. Verification is the manual Definition-of-Done checklist
in `assessment-app-prompt.md`, extended with the six new items above. The timeout path is still
exercised by temporarily setting `TIME_LIMIT_SECONDS` to `30`.

## 10. Out of scope

Unchanged from the existing spec and not revisited here: no proctoring, no paste or tab-switch
detection, no identity verification, no per-question timing, and no attempt to hide the answer key —
which now includes the two grid keys — from view-source. The "smallest real fix" outline in
`REVIEWER.md` still applies and gains no new work beyond serving grid questions without their row
`answerKey`s.
