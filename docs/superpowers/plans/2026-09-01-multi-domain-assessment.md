# Multi-Domain Assessment (C# + SQL + AI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-domain junior .NET screening app into a three-section screen (C#/algorithms, SQL, AI) with a new auto-graded `grid` question type, a 45-minute limit, and a schema-2 results file.

**Architecture:** All logic stays in the one IIFE in `app.js`. A new `grid` question type handles both the tick-all-that-apply matrix and the one-per-row matrix through a single renderer and a single grading path, driven entirely by data in the `QUESTIONS` array. A new `section` string on each question drives grouping in the UI and in the results file. Nothing below the `QUESTIONS` array reads a question index, a question count, or a hard-coded list of sections.

**Tech Stack:** Vanilla ES5 JavaScript, HTML, CSS. No dependencies, no build step, no test runner. Node.js is used only for a throwaway test harness that lives outside the repo.

**Spec:** [docs/superpowers/specs/2026-09-01-multi-domain-assessment-design.md](../specs/2026-09-01-multi-domain-assessment-design.md)

## Global Constraints

Copied verbatim from `assessment-app-prompt.md`. Every task's requirements implicitly include these.

- **Exactly three app files, side by side, no subfolders:** `index.html`, `styles.css`, `app.js`. Plus one non-app file, `REVIEWER.md`, which the app never references. **Do not create new app files and do not split `app.js`** — it will reach roughly 1,900 lines and that is accepted.
- Vanilla HTML/CSS/JS. No frameworks, no bundler, no build or transpile step, no npm, no TypeScript.
- **Zero network requests at runtime:** no CDN, no web fonts, no analytics, no `fetch`/XHR/WebSocket/beacon. System font stack only.
- Must work when `index.html` is opened directly over `file://`. Classic `<script src="app.js">` at the end of `<body>` — **not** `type="module"`. No dynamic `import`.
- Results file download stays `Blob` + `URL.createObjectURL` + a temporary `<a download>` + `revokeObjectURL`.
- **ES5 syntax only**, matching the existing file: `var`, function declarations, string concatenation for multi-line listings. No `const`/`let`, no arrow functions, no template literals in code. `Array.isArray`, `Array.prototype.indexOf` and `Object.create` are ES5 and allowed.
- No globals beyond the single IIFE. No `eval`.
- **Never `innerHTML`** with any bank-derived or candidate-derived string. Use `makeEl` / `clearChildren` / `textContent`.
- **No correctness feedback anywhere** — not in the UI, not on Next, not in the DOM, not in `console`.
- Grading rubrics go in `REVIEWER.md` only. Anything in `app.js` is visible to the candidate.
- CSS: custom properties for the palette, system font stack, honours `prefers-reduced-motion`, readable under `prefers-color-scheme: dark`, responsive from 360px up, visible focus ring on every interactive element, text contrast at least 4.5:1.
- Exact config values for this change: `TIME_LIMIT_SECONDS = 45 * 60`, `SCHEMA_VERSION = 2`, `ASSESSMENT = { id: 'junior-dev-screen', version: '2.0.0' }`.
- **No test runner may be added to the repo.** The Node harness in Task 1 lives in the scratchpad directory and is throwaway.
- **This repository has no commits yet** and all five existing files are untracked. Before the first `git commit` step, ask the user how they want the initial commit scoped. Do not commit unasked.

### Verification model — read this before starting

There is no test runner and none is being added, so "run the tests" means one of two things depending on the task:

- **Pure-logic tasks (1, 2):** a Node harness in the scratchpad extracts two marked regions out of `app.js` and asserts against the real functions. This is a genuine red/green cycle.
- **DOM, CSS and content tasks (3–8):** manual browser checks with exact, observable expectations. Every such step states precisely what to click and what you must see.

Throughout, `$SCRATCH` means:

```
C:\Users\I4B61~1.ALI\AppData\Local\Temp\claude\c--Users-i-alimpertis-source-repos-Minerva-Mail-Merge-CodingAssessment\73102811-30dc-400f-8548-e9526316a2a4\scratchpad
```

Open the app with `Start-Process index.html`. Clear state between manual runs by deleting the `assessment.v1.session` and `assessment.v1.lastSubmitted` localStorage keys (devtools → Application → Local Storage).

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `app.js` | Question bank, all logic, all rendering | Modify — new helpers, new `grid` renderer, schema-2 grading, section grouping, bank content |
| `index.html` | Static shell for the four screens | Modify — section eyebrow element, `<ul>`→`<div>` for two lists, intro copy spans |
| `styles.css` | Palette tokens and all styling | Modify — grid and section rules on the existing tokens |
| `REVIEWER.md` | Hiring engineer's key and rubrics. Never referenced by the app | Modify — grid keys, four new rubrics, `q5` rubric removed, schema 2 |
| `assessment-app-prompt.md` | The spec of record | Modify — bank section rewritten by domain/type, `grid` and `section` specified, DoD updated |
| `CLAUDE.md` | Guidance for future Claude Code sessions | Modify — types, limit, schema, `SQL_SCHEMA` |
| `$SCRATCH/grid-logic.test.js` | Throwaway Node assertions for the pure functions | Create — never committed, never in the repo |

---

### Task 1: Pure grid logic, test-first

Adds every pure function the grid type needs, plus the two extraction markers that make them testable. `app.js` still renders only the existing five questions after this task — the new helpers are present and proven but not yet wired in.

**Files:**
- Modify: `app.js` — Configuration section (around line 220) and the "Small pure helpers" / "Grading" sections (around lines 339–590)
- Test: `$SCRATCH/grid-logic.test.js` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, all inside the `test-extract:pure` region of `app.js`:
  - `uniqueKeys(list) -> Array` — de-duplicated copy
  - `sameKeySet(a, b) -> Boolean` — order- and duplicate-insensitive set equality
  - `gridHasColumn(grid, key) -> Boolean`
  - `sanitiseGridValue(question, value) -> Object` — `{ rowKey: [colKey, ...] }`, empty rows dropped
  - `gradeGrid(question, cleanValue) -> { correct: Boolean, rowsCorrect: Number, rowsOutOf: Number }`
  - `gridExpected(question) -> Object` — `{ rowKey: [colKey, ...] }`
  - `isAutoGraded(question) -> Boolean`
  - `countAutoGraded(bank) -> Number`
  - `sectionsOf(bank) -> Array` of distinct section labels in bank order
  - `restoreAnswers(bank, savedAnswers) -> Object` — the sanitised answers map used by both `hydrate` and `offerResume`

- [ ] **Step 1: Add the two extraction markers to `app.js`**

These are plain comments. They let the Node harness evaluate the real source instead of a copy, so the tests can never drift from the code.

Immediately **after** the `* Configuration` banner's closing `* ======= */` line and before `var RECRUITER_EMAIL`, insert:

```js
  /* --- test-extract:config:start --- */
```

Immediately **after** the last line of the Configuration section (`var URGENT_MS = 60 * 1000;`) and before the `* State` banner, insert:

```js
  /* --- test-extract:config:end --- */
```

Immediately **after** the `* Small pure helpers` banner's closing `* ======= */` line and before `function pad2(n)`, insert:

```js
  /* --- test-extract:pure:start --- */
```

Immediately **after** the closing brace of `buildPayload` and before the `* Download` banner, insert:

```js
  /* --- test-extract:pure:end --- */
```

- [ ] **Step 2: Write the failing test harness**

Create `$SCRATCH/grid-logic.test.js`:

```js
'use strict';

// Throwaway harness. Extracts the marked regions from app.js and asserts
// against the real functions, so this file can never drift from the source.
// Run: node grid-logic.test.js "<path to app.js>"

var fs = require('fs');
var assert = require('assert');

function region(src, name) {
  var open = '/* --- test-extract:' + name + ':start --- */';
  var close = '/* --- test-extract:' + name + ':end --- */';
  var a = src.indexOf(open);
  var b = src.indexOf(close);
  assert.ok(a !== -1, 'marker not found: ' + open);
  assert.ok(b > a, 'marker not found or out of order: ' + close);
  return src.slice(a + open.length, b);
}

var src = fs.readFileSync(process.argv[2], 'utf8');

var H = new Function(
  region(src, 'config') + '\n' +
  region(src, 'pure') + '\n' +
  'return {' +
  '  uniqueKeys: uniqueKeys, sameKeySet: sameKeySet, gridHasColumn: gridHasColumn,' +
  '  sanitiseGridValue: sanitiseGridValue, gradeGrid: gradeGrid, gridExpected: gridExpected,' +
  '  isAutoGraded: isAutoGraded, countAutoGraded: countAutoGraded, sectionsOf: sectionsOf,' +
  '  restoreAnswers: restoreAnswers, isAnswered: isAnswered, answeredCount: answeredCount,' +
  '  gradeAnswers: gradeAnswers, buildPayload: buildPayload, buildFilename: buildFilename,' +
  '  SCHEMA_VERSION: SCHEMA_VERSION, TIME_LIMIT_SECONDS: TIME_LIMIT_SECONDS' +
  '};'
)();

// ---------------------------------------------------------------- fixtures

var MULTI = {
  id: 'g1', type: 'grid', section: 'AI', topic: 'props', points: 3,
  grid: {
    select: 'multiple',
    columns: [
      { key: 'sup', text: 'Supervised' },
      { key: 'unsup', text: 'Unsupervised' },
      { key: 'label', text: 'Label' },
      { key: 'num', text: 'Number' },
      { key: 'sim', text: 'Similarity' }
    ],
    rows: [
      { key: 'reg', text: 'Regression', answerKey: ['sup', 'num'] },
      { key: 'cls', text: 'Classification', answerKey: ['sup', 'label'] },
      { key: 'clu', text: 'Clustering', answerKey: ['unsup', 'sim'] }
    ]
  }
};

var SINGLE = {
  id: 'g2', type: 'grid', section: 'AI', topic: 'pick', points: 3,
  grid: {
    select: 'single',
    columns: [{ key: 'R', text: 'R' }, { key: 'C', text: 'C' }, { key: 'Cl', text: 'Cl' }],
    rows: [
      { key: 'fuel', text: 'Fuel', answerKey: ['R'] },
      { key: 'pump', text: 'Pump', answerKey: ['C'] }
    ]
  }
};

var MCQ = {
  id: 'm1', type: 'multiple-choice', section: 'C#', topic: 'strings', points: 1,
  options: [{ key: 'a', text: 'a' }, { key: 'b', text: 'b' }], answerKey: 'b', grid: null
};

var TEXT = {
  id: 't1', type: 'free-text', section: 'SQL', topic: 'sql-keys', points: 4,
  options: [], answerKey: null, grid: null
};

var tests = 0;
function check(name, fn) { fn(); tests++; }

// ---------------------------------------------------------------- sameKeySet

check('sameKeySet ignores order', function () {
  assert.strictEqual(H.sameKeySet(['a', 'b'], ['b', 'a']), true);
});
check('sameKeySet ignores duplicates', function () {
  assert.strictEqual(H.sameKeySet(['a', 'a', 'b'], ['b', 'a']), true);
});
check('sameKeySet rejects a missing key', function () {
  assert.strictEqual(H.sameKeySet(['a'], ['a', 'b']), false);
});
check('sameKeySet rejects an extra key', function () {
  assert.strictEqual(H.sameKeySet(['a', 'b'], ['a']), false);
});
check('sameKeySet treats two empties as equal', function () {
  assert.strictEqual(H.sameKeySet([], []), true);
});
check('sameKeySet survives null', function () {
  assert.strictEqual(H.sameKeySet(null, []), true);
  assert.strictEqual(H.sameKeySet(null, ['a']), false);
});
check('sameKeySet is not fooled by prototype keys', function () {
  assert.strictEqual(H.sameKeySet(['constructor'], []), false);
  assert.strictEqual(H.sameKeySet([], ['toString']), false);
});

// ---------------------------------------------------------- sanitiseGridValue

check('sanitiseGridValue rejects non-objects', function () {
  assert.deepStrictEqual(H.sanitiseGridValue(MULTI, null), {});
  assert.deepStrictEqual(H.sanitiseGridValue(MULTI, undefined), {});
  assert.deepStrictEqual(H.sanitiseGridValue(MULTI, 'b'), {});
  assert.deepStrictEqual(H.sanitiseGridValue(MULTI, 42), {});
});
check('sanitiseGridValue keeps known rows and columns', function () {
  assert.deepStrictEqual(
    H.sanitiseGridValue(MULTI, { reg: ['sup', 'num'] }),
    { reg: ['sup', 'num'] }
  );
});
check('sanitiseGridValue drops an unknown row key', function () {
  assert.deepStrictEqual(H.sanitiseGridValue(MULTI, { nope: ['sup'] }), {});
});
check('sanitiseGridValue drops an unknown column key', function () {
  assert.deepStrictEqual(H.sanitiseGridValue(MULTI, { reg: ['sup', 'gone'] }), { reg: ['sup'] });
});
check('sanitiseGridValue drops a row left empty', function () {
  assert.deepStrictEqual(H.sanitiseGridValue(MULTI, { reg: [] }), {});
  assert.deepStrictEqual(H.sanitiseGridValue(MULTI, { reg: ['gone'] }), {});
});
check('sanitiseGridValue de-duplicates', function () {
  assert.deepStrictEqual(H.sanitiseGridValue(MULTI, { reg: ['sup', 'sup'] }), { reg: ['sup'] });
});
check('sanitiseGridValue caps a single-select row at one key', function () {
  assert.deepStrictEqual(H.sanitiseGridValue(SINGLE, { fuel: ['R', 'C'] }), { fuel: ['R'] });
});
check('sanitiseGridValue rejects a non-array row value', function () {
  assert.deepStrictEqual(H.sanitiseGridValue(MULTI, { reg: 'sup' }), {});
  assert.deepStrictEqual(H.sanitiseGridValue(MULTI, { reg: { sup: true } }), {});
});
check('sanitiseGridValue returns a fresh object', function () {
  var input = { reg: ['sup'] };
  var out = H.sanitiseGridValue(MULTI, input);
  out.reg.push('num');
  assert.deepStrictEqual(input, { reg: ['sup'] });
});

// ----------------------------------------------------------------- gradeGrid

check('gradeGrid marks a fully correct grid correct', function () {
  var value = { reg: ['sup', 'num'], cls: ['sup', 'label'], clu: ['unsup', 'sim'] };
  assert.deepStrictEqual(H.gradeGrid(MULTI, value),
    { correct: true, rowsCorrect: 3, rowsOutOf: 3 });
});
check('gradeGrid reports a near miss as incorrect', function () {
  var value = { reg: ['sup', 'num'], cls: ['sup'], clu: ['unsup', 'sim'] };
  assert.deepStrictEqual(H.gradeGrid(MULTI, value),
    { correct: false, rowsCorrect: 2, rowsOutOf: 3 });
});
check('gradeGrid counts an over-ticked row as wrong', function () {
  var value = { reg: ['sup', 'num', 'label'], cls: ['sup', 'label'], clu: ['unsup', 'sim'] };
  assert.deepStrictEqual(H.gradeGrid(MULTI, value),
    { correct: false, rowsCorrect: 2, rowsOutOf: 3 });
});
check('gradeGrid scores an empty grid zero', function () {
  assert.deepStrictEqual(H.gradeGrid(MULTI, {}),
    { correct: false, rowsCorrect: 0, rowsOutOf: 3 });
});
check('gradeGrid ignores row order in the answer key', function () {
  var value = { reg: ['num', 'sup'], cls: ['label', 'sup'], clu: ['sim', 'unsup'] };
  assert.strictEqual(H.gradeGrid(MULTI, value).correct, true);
});

// -------------------------------------------------------------- gridExpected

check('gridExpected mirrors the answer keys', function () {
  assert.deepStrictEqual(H.gridExpected(MULTI), {
    reg: ['sup', 'num'], cls: ['sup', 'label'], clu: ['unsup', 'sim']
  });
});
check('gridExpected copies, it does not alias the bank', function () {
  H.gridExpected(MULTI).reg.push('mutated');
  assert.deepStrictEqual(MULTI.grid.rows[0].answerKey, ['sup', 'num']);
});

// ------------------------------------------------- isAutoGraded / countAutoGraded

check('isAutoGraded covers multiple-choice and grid only', function () {
  assert.strictEqual(H.isAutoGraded(MCQ), true);
  assert.strictEqual(H.isAutoGraded(MULTI), true);
  assert.strictEqual(H.isAutoGraded(TEXT), false);
});
check('countAutoGraded counts them', function () {
  assert.strictEqual(H.countAutoGraded([MCQ, MULTI, SINGLE, TEXT]), 3);
  assert.strictEqual(H.countAutoGraded([TEXT]), 0);
  assert.strictEqual(H.countAutoGraded([]), 0);
});

// ----------------------------------------------------------------- sectionsOf

check('sectionsOf returns distinct labels in bank order', function () {
  assert.deepStrictEqual(H.sectionsOf([MCQ, TEXT, MULTI, SINGLE]), ['C#', 'SQL', 'AI']);
});
check('sectionsOf de-duplicates and skips blanks', function () {
  assert.deepStrictEqual(H.sectionsOf([MCQ, MCQ]), ['C#']);
  assert.deepStrictEqual(H.sectionsOf([{ section: '' }, { section: null }]), []);
});

// ------------------------------------------------------------------ isAnswered

check('isAnswered: grid needs every row ticked', function () {
  assert.strictEqual(H.isAnswered(MULTI, { reg: ['sup'], cls: ['sup'], clu: ['sim'] }), true);
  assert.strictEqual(H.isAnswered(MULTI, { reg: ['sup'], cls: ['sup'] }), false);
  assert.strictEqual(H.isAnswered(MULTI, {}), false);
  assert.strictEqual(H.isAnswered(MULTI, null), false);
  assert.strictEqual(H.isAnswered(MULTI, 'b'), false);
});
check('isAnswered: existing types are unchanged', function () {
  assert.strictEqual(H.isAnswered(MCQ, 'b'), true);
  assert.strictEqual(H.isAnswered(MCQ, 'zz'), false);
  assert.strictEqual(H.isAnswered(TEXT, '  '), false);
  assert.strictEqual(H.isAnswered(TEXT, 'x'), true);
});

// --------------------------------------------------------------- restoreAnswers

check('restoreAnswers keeps strings and sanitised grids', function () {
  var out = H.restoreAnswers([MCQ, MULTI, TEXT], {
    m1: 'b',
    g1: { reg: ['sup', 'gone'], nope: ['sup'] },
    t1: 'some text',
    unknown: 'dropped'
  });
  assert.deepStrictEqual(out, { m1: 'b', g1: { reg: ['sup'] }, t1: 'some text' });
});
check('restoreAnswers drops a grid value stored as a string', function () {
  assert.deepStrictEqual(H.restoreAnswers([MULTI], { g1: 'b' }), {});
});
check('restoreAnswers survives a missing map', function () {
  assert.deepStrictEqual(H.restoreAnswers([MCQ], null), {});
});

// ---------------------------------------------------------------- gradeAnswers

check('gradeAnswers shapes every entry type', function () {
  var bank = [MCQ, MULTI, TEXT];
  var graded = H.gradeAnswers(bank, {
    m1: 'b',
    g1: { reg: ['sup', 'num'], cls: ['sup'], clu: ['unsup', 'sim'] },
    t1: 'an answer'
  });

  assert.strictEqual(graded.outOf, 2);
  assert.strictEqual(graded.correct, 1);

  assert.deepStrictEqual(graded.entries[0], {
    id: 'm1', type: 'multiple-choice', section: 'C#', topic: 'strings',
    given: 'b', expected: 'b', correct: true
  });
  assert.deepStrictEqual(graded.entries[1], {
    id: 'g1', type: 'grid', section: 'AI', topic: 'props',
    given: { reg: ['sup', 'num'], cls: ['sup'], clu: ['unsup', 'sim'] },
    expected: { reg: ['sup', 'num'], cls: ['sup', 'label'], clu: ['unsup', 'sim'] },
    correct: false, rowsCorrect: 2, rowsOutOf: 3
  });
  assert.deepStrictEqual(graded.entries[2], {
    id: 't1', type: 'free-text', section: 'SQL', topic: 'sql-keys',
    given: 'an answer', correct: null,
    review: { score: null, notes: '', outOf: 4 }
  });
});

check('gradeAnswers applies the skipped rules per type', function () {
  var graded = H.gradeAnswers([MCQ, MULTI, TEXT], { t1: '   ' });
  assert.strictEqual(graded.correct, 0);
  assert.strictEqual(graded.outOf, 2);
  assert.strictEqual(graded.entries[0].given, null);
  assert.strictEqual(graded.entries[0].correct, false);
  assert.strictEqual(graded.entries[1].given, null);
  assert.strictEqual(graded.entries[1].correct, false);
  assert.strictEqual(graded.entries[1].rowsCorrect, 0);
  assert.strictEqual(graded.entries[1].rowsOutOf, 3);
  assert.strictEqual(graded.entries[2].given, null);
  assert.strictEqual(graded.entries[2].correct, null);
});

check('gradeAnswers exports a partly ticked grid as an object', function () {
  var graded = H.gradeAnswers([MULTI], { g1: { reg: ['sup'] } });
  assert.deepStrictEqual(graded.entries[0].given, { reg: ['sup'] });
  assert.strictEqual(graded.entries[0].correct, false);
});

check('gradeAnswers gives a perfect grid its point', function () {
  var graded = H.gradeAnswers([MULTI, SINGLE], {
    g1: { reg: ['sup', 'num'], cls: ['sup', 'label'], clu: ['unsup', 'sim'] },
    g2: { fuel: ['R'], pump: ['C'] }
  });
  assert.strictEqual(graded.correct, 2);
  assert.strictEqual(graded.outOf, 2);
});

// ----------------------------------------------------------------- buildPayload

check('buildPayload emits the schema 2 envelope', function () {
  var bank = [MCQ, MULTI, TEXT];
  var startedAt = new Date('2026-09-01T09:00:00Z').getTime();
  var submittedAt = new Date(startedAt + 125000);
  var payload = H.buildPayload(bank, {
    candidate: { name: '  Ada Lovelace ', email: ' ada@example.com ' },
    startedAt: startedAt,
    answers: { m1: 'b' }
  }, submittedAt, false);

  assert.strictEqual(payload.schemaVersion, 2);
  assert.strictEqual(payload.assessment.id, 'junior-dev-screen');
  assert.strictEqual(payload.assessment.version, '2.0.0');
  assert.strictEqual(payload.assessment.questionCount, 3);
  assert.deepStrictEqual(payload.assessment.sections, ['C#', 'AI', 'SQL']);
  assert.strictEqual(payload.candidate.name, 'Ada Lovelace');
  assert.strictEqual(payload.candidate.email, 'ada@example.com');
  assert.strictEqual(payload.durationSeconds, 125);
  assert.strictEqual(payload.timeLimitSeconds, 2700);
  assert.strictEqual(payload.timedOut, false);
  assert.deepStrictEqual(payload.autoScore, { correct: 1, outOf: 2 });
  assert.strictEqual(payload.answers.length, 3);
});

check('buildPayload clamps duration to the limit', function () {
  var startedAt = new Date('2026-09-01T09:00:00Z').getTime();
  var payload = H.buildPayload([MCQ], {
    candidate: { name: 'X Y', email: 'x@y.z' }, startedAt: startedAt, answers: {}
  }, new Date(startedAt + 9999999), true);
  assert.strictEqual(payload.durationSeconds, H.TIME_LIMIT_SECONDS);
  assert.strictEqual(payload.timedOut, true);
});

// --------------------------------------------------------------------- filename

check('buildFilename is unchanged by this work', function () {
  var when = new Date(2026, 8, 1, 14, 5);
  assert.strictEqual(H.buildFilename('Ada Lovelace', when),
    'assessment_lovelace_2026-09-01-1405.json');
  assert.strictEqual(H.buildFilename('   ', when),
    'assessment_candidate_2026-09-01-1405.json');
});

console.log('OK - ' + tests + ' checks passed');
```

- [ ] **Step 3: Run the harness to verify it fails**

```powershell
node "$SCRATCH\grid-logic.test.js" "c:\Users\i.alimpertis\source\repos\Minerva Mail Merge\CodingAssessment\app.js"
```

Expected: `ReferenceError: uniqueKeys is not defined` (thrown while building the return object). If instead you see "marker not found", Step 1 was not applied correctly.

- [ ] **Step 4: Add the new pure helpers**

In `app.js`, inside the "Small pure helpers" section, immediately **after** `function clamp(...)` and before `function topicLabel(...)`, insert:

```js
  /** De-duplicated copy of a list of option keys. Order of first appearance. */
  function uniqueKeys(list) {
    var out = [];
    var source = list || [];
    for (var i = 0; i < source.length; i++) {
      if (out.indexOf(source[i]) === -1) out.push(source[i]);
    }
    return out;
  }

  /**
   * Do these two lists of option keys hold the same set?
   * Order-insensitive and duplicate-insensitive. Arrays are used rather than an
   * object-as-set on purpose: the lists are never longer than a handful of
   * keys, and a plain object would treat a key like "constructor" as present.
   */
  function sameKeySet(a, b) {
    var left = uniqueKeys(a);
    var right = uniqueKeys(b);
    if (left.length !== right.length) return false;
    for (var i = 0; i < left.length; i++) {
      if (right.indexOf(left[i]) === -1) return false;
    }
    return true;
  }

  function gridHasColumn(grid, key) {
    var columns = (grid && grid.columns) || [];
    for (var i = 0; i < columns.length; i++) {
      if (columns[i].key === key) return true;
    }
    return false;
  }

  /**
   * Clean a stored grid value against the question's current grid definition.
   *
   * Input : question (a grid question), value (whatever came out of storage or
   *         state - may be anything at all)
   * Output: a FRESH object { rowKey: [colKey, ...] } containing only row and
   *         column keys that still exist in the bank. A row left with nothing
   *         is dropped, so an untouched grid normalises to {}.
   *
   * Edge cases handled
   *   - null / undefined / a string / a number: a session saved when this id
   *     was a different question type -> {}
   *   - a row or column removed from the bank since the session was saved ->
   *     silently dropped rather than half-restored
   *   - select: 'single' carrying several keys -> only the first survives
   *   - duplicate keys -> de-duplicated
   *   - a row value that is not an array -> dropped
   */
  function sanitiseGridValue(question, value) {
    var out = {};
    var grid = question.grid;
    if (!grid || !value || typeof value !== 'object') return out;

    var rows = grid.rows || [];
    var single = (grid.select === 'single');

    for (var i = 0; i < rows.length; i++) {
      var rowKey = rows[i].key;
      var stored = value[rowKey];
      if (!Array.isArray(stored)) continue;

      var kept = [];
      for (var j = 0; j < stored.length; j++) {
        var colKey = stored[j];
        if (gridHasColumn(grid, colKey) && kept.indexOf(colKey) === -1) {
          kept.push(colKey);
          if (single) break;
        }
      }
      if (kept.length) out[rowKey] = kept;
    }

    return out;
  }

  /**
   * Grade one grid answer.
   *
   * Input : question (a grid question), value (already sanitised)
   * Output: { correct, rowsCorrect, rowsOutOf }
   *
   * A grid is correct only when EVERY row matches its answer key exactly, so
   * two rows right out of three scores nothing for the question. rowsCorrect is
   * what lets the reviewer see it was a near miss - see REVIEWER.md.
   * A grid with no rows can never be correct.
   */
  function gradeGrid(question, value) {
    var rows = (question.grid && question.grid.rows) || [];
    var rowsCorrect = 0;

    for (var i = 0; i < rows.length; i++) {
      if (sameKeySet(value[rows[i].key] || [], rows[i].answerKey || [])) rowsCorrect++;
    }

    return {
      correct: rows.length > 0 && rowsCorrect === rows.length,
      rowsCorrect: rowsCorrect,
      rowsOutOf: rows.length
    };
  }

  /** The `expected` map exported next to a grid answer. Copies, never aliases. */
  function gridExpected(question) {
    var rows = (question.grid && question.grid.rows) || [];
    var out = {};
    for (var i = 0; i < rows.length; i++) {
      out[rows[i].key] = (rows[i].answerKey || []).slice();
    }
    return out;
  }

  /**
   * Types the app grades on its own. autoScore counts these, so adding a
   * multiple-choice or grid question to the bank moves outOf with no other
   * edit - it is never a literal.
   */
  function isAutoGraded(question) {
    return question.type === 'multiple-choice' || question.type === 'grid';
  }

  function countAutoGraded(bank) {
    var n = 0;
    for (var i = 0; i < bank.length; i++) {
      if (isAutoGraded(bank[i])) n++;
    }
    return n;
  }

  /** Distinct section labels, in bank order. Blank sections are ignored. */
  function sectionsOf(bank) {
    var out = [];
    for (var i = 0; i < bank.length; i++) {
      var label = bank[i].section || '';
      if (label && out.indexOf(label) === -1) out.push(label);
    }
    return out;
  }

  /**
   * Copy a saved answers map into a clean one, keeping only ids still in the
   * bank and only values of the right shape for each question's type. Shared by
   * hydrate() and offerResume() so the resume panel's count can never disagree
   * with what actually gets restored.
   */
  function restoreAnswers(bank, savedAnswers) {
    var out = {};
    var source = (savedAnswers && typeof savedAnswers === 'object') ? savedAnswers : {};

    for (var i = 0; i < bank.length; i++) {
      var question = bank[i];
      var value = source[question.id];

      if (question.type === 'grid') {
        var clean = sanitiseGridValue(question, value);
        for (var key in clean) {
          if (Object.prototype.hasOwnProperty.call(clean, key)) { out[question.id] = clean; break; }
        }
      } else if (typeof value === 'string') {
        out[question.id] = value;
      }
    }

    return out;
  }
```

- [ ] **Step 5: Add the grid branch to `isAnswered`**

Replace the whole existing `isAnswered` function, including its doc comment, with:

```js
  /**
   * Does this raw value count as an answer for this question?
   *  - free-text: any non-whitespace character
   *  - multiple-choice: the value must still match one of the question's option
   *    keys (guards against a stale value left by an edited bank)
   *  - grid: EVERY row must carry at least one surviving selection. A
   *    part-filled grid therefore reads "Not answered", which is the safer
   *    nudge on the review screen; the results file still exports whatever was
   *    ticked.
   *  - anything else (unknown type): non-empty string
   */
  function isAnswered(question, value) {
    if (question.type === 'grid') {
      var clean = sanitiseGridValue(question, value);
      var rows = (question.grid && question.grid.rows) || [];
      if (!rows.length) return false;
      for (var r = 0; r < rows.length; r++) {
        if (!clean[rows[r].key]) return false;
      }
      return true;
    }

    if (value === null || value === undefined) return false;
    var text = String(value);
    if (question.type === 'free-text') return text.trim().length > 0;
    if (question.type === 'multiple-choice') {
      var options = question.options || [];
      for (var i = 0; i < options.length; i++) {
        if (options[i].key === text) return true;
      }
      return false;
    }
    return text.length > 0;
  }
```

- [ ] **Step 6: Run the harness — the `sameKeySet`, `sanitiseGridValue`, `gradeGrid`, `gridExpected`, `isAutoGraded`, `countAutoGraded`, `sectionsOf`, `isAnswered` and `restoreAnswers` groups must pass**

```powershell
node "$SCRATCH\grid-logic.test.js" "c:\Users\i.alimpertis\source\repos\Minerva Mail Merge\CodingAssessment\app.js"
```

Expected: it now fails later, inside the `gradeAnswers` group, with an assertion about the entry shape (`section` missing, or `review.outOf` missing). Everything before that is green. That failure is Task 2's job — do not fix it here.

- [ ] **Step 7: Confirm the app still runs**

```powershell
Start-Process index.html
```

Expected: the start screen appears, the five existing questions still work, submitting still downloads a file. Nothing visible has changed. Devtools console must be clean.

- [ ] **Step 8: Commit**

Check Global Constraints first — this repo has no commits and the user must scope the initial one.

```bash
git add app.js
git commit -m "feat: add pure grid grading and section helpers"
```

---

### Task 2: Schema 2 grading, payload and configuration

Rewires grading and the results file to schema 2, deletes `q5`, moves the limit to 45 minutes, and puts `section` on the four surviving questions. After this task the app is a working four-question C# screen emitting a schema-2 file.

**Files:**
- Modify: `app.js` — assumptions header (lines 1–48), Configuration, `QUESTIONS`, `gradeAnswers`, `buildPayload`, `hydrate`, `offerResume`, `renderStartIntro` call site
- Test: `$SCRATCH/grid-logic.test.js` (already written, no changes)

**Interfaces:**
- Consumes from Task 1: `isAutoGraded`, `countAutoGraded`, `sectionsOf`, `sanitiseGridValue`, `gradeGrid`, `gridExpected`, `restoreAnswers`, `isAnswered`.
- Produces:
  - `gradeAnswers(bank, answers) -> { correct, outOf, entries }` where each entry carries `section`, grid entries carry `rowsCorrect`/`rowsOutOf`, and free-text entries carry `review: { score, notes, outOf }`
  - `gridGivenForExport(cleanValue) -> Object|null` — `null` when nothing was ticked
  - `buildPayload(bank, session, submittedAt, timedOut) -> Object` — the schema-2 envelope including `assessment.sections`
  - `restoreAnswers` becomes the single path into `state.answers` — `hydrate` and `offerResume` both call it

- [ ] **Step 1: Run the harness to see the current failure**

```powershell
node "$SCRATCH\grid-logic.test.js" "c:\Users\i.alimpertis\source\repos\Minerva Mail Merge\CodingAssessment\app.js"
```

Expected: FAIL inside `gradeAnswers shapes every entry type`, because entries have no `section` and free-text has no `review.outOf`.

- [ ] **Step 2: Update the configuration**

In the Configuration section, replace these lines:

```js
  var ASSESSMENT = { id: 'junior-dotnet-screen', version: '1.0.0' };

  var SCHEMA_VERSION = 1;
  var TIME_LIMIT_SECONDS = 30 * 60;          // set to 30 to test the timeout path
```

with:

```js
  var ASSESSMENT = { id: 'junior-dev-screen', version: '2.0.0' };

  var SCHEMA_VERSION = 2;
  var TIME_LIMIT_SECONDS = 45 * 60;          // set to 30 to test the timeout path
```

- [ ] **Step 3: Replace `countMultipleChoice` usage and remove the function**

Delete the whole `countMultipleChoice` function and its doc comment from the "Small pure helpers" section — `countAutoGraded` from Task 1 replaces it. Then in `renderStartIntro`, replace:

```js
    dom.introMcqCount.textContent = String(countMultipleChoice(QUESTIONS));
```

with:

```js
    dom.introMcqCount.textContent = String(countAutoGraded(QUESTIONS));
```

(The element id stays `intro-mcq-count` for now; Task 5 rewrites that copy properly.)

- [ ] **Step 4: Rewrite `gradeAnswers`**

Replace the whole function, keeping and extending its doc comment:

```js
  /**
   * Grade one submission and produce the `answers` array for the results file.
   *
   * Inputs
   *   bank    - the QUESTIONS array (or any array of the same shape)
   *   answers - map of question id -> raw stored value. A string for
   *             multiple-choice and free-text, an object for grid.
   *
   * Output
   *   { correct, outOf, entries }
   *   correct - auto-graded questions answered correctly
   *   outOf   - auto-graded questions in the bank (multiple-choice + grid),
   *             derived, never a literal
   *   entries - one object per bank question, in bank order, shaped per type
   *
   * Edge cases handled
   *   - a skipped question: given null; multiple-choice and grid correct false,
   *     free-text correct null
   *   - whitespace-only free text counts as skipped
   *   - a grid with nothing ticked exports given null; a part-ticked grid
   *     exports only the rows that were ticked
   *   - a stale stored value left by an edited bank is sanitised away before
   *     grading, so it can never score
   *   - an unknown `type` is treated like free-text: stored, never scored
   */
  function gradeAnswers(bank, answers) {
    var entries = [];
    var correct = 0;
    var outOf = 0;
    var source = answers || {};

    for (var i = 0; i < bank.length; i++) {
      var question = bank[i];
      var raw = source[question.id];
      var answered = isAnswered(question, raw);

      if (question.type === 'multiple-choice') {
        outOf++;
        var given = answered ? String(raw) : null;
        var isCorrect = given !== null && given === question.answerKey;
        if (isCorrect) correct++;
        entries.push({
          id: question.id,
          type: question.type,
          section: question.section || '',
          topic: question.topic,
          given: given,
          expected: question.answerKey,
          correct: isCorrect
        });

      } else if (question.type === 'grid') {
        outOf++;
        var clean = sanitiseGridValue(question, raw);
        var result = gradeGrid(question, clean);
        if (result.correct) correct++;
        entries.push({
          id: question.id,
          type: question.type,
          section: question.section || '',
          topic: question.topic,
          given: gridGivenForExport(clean),
          expected: gridExpected(question),
          correct: result.correct,
          rowsCorrect: result.rowsCorrect,
          rowsOutOf: result.rowsOutOf
        });

      } else {
        entries.push({
          id: question.id,
          type: question.type,
          section: question.section || '',
          topic: question.topic,
          given: answered ? String(raw) : null,
          correct: null,
          review: { score: null, notes: '', outOf: question.points || 0 }
        });
      }
    }

    return { correct: correct, outOf: outOf, entries: entries };
  }
```

Then add this small helper immediately **above** `gradeAnswers`, still inside the `test-extract:pure` region:

```js
  /**
   * A grid with nothing ticked exports as null, not {}, so the "skipped means
   * given: null" rule in the results file reads the same for every type.
   */
  function gridGivenForExport(cleanValue) {
    for (var key in cleanValue) {
      if (Object.prototype.hasOwnProperty.call(cleanValue, key)) return cleanValue;
    }
    return null;
  }
```

- [ ] **Step 5: Add `assessment.sections` to `buildPayload`**

In `buildPayload`, replace this block:

```js
      assessment: {
        id: ASSESSMENT.id,
        version: ASSESSMENT.version,
        questionCount: bank.length
      },
```

with:

```js
      assessment: {
        id: ASSESSMENT.id,
        version: ASSESSMENT.version,
        questionCount: bank.length,
        sections: sectionsOf(bank)
      },
```

- [ ] **Step 6: Run the harness — everything must now pass**

```powershell
node "$SCRATCH\grid-logic.test.js" "c:\Users\i.alimpertis\source\repos\Minerva Mail Merge\CodingAssessment\app.js"
```

Expected: `OK - 37 checks passed` (the exact count may differ if you added checks; what matters is zero failures).

- [ ] **Step 7: Point `hydrate` and `offerResume` at `restoreAnswers`**

In `hydrate`, replace:

```js
    var answers = {};
    var savedAnswers = (saved.answers && typeof saved.answers === 'object') ? saved.answers : {};
    for (var i = 0; i < QUESTIONS.length; i++) {
      var id = QUESTIONS[i].id;
      var value = savedAnswers[id];
      if (typeof value === 'string') answers[id] = value;
    }
```

with:

```js
    var answers = restoreAnswers(QUESTIONS, saved.answers);
```

In `offerResume`, replace:

```js
    var answered = answeredCount(QUESTIONS, (function () {
      var map = {};
      var src = saved.answers || {};
      for (var i = 0; i < QUESTIONS.length; i++) {
        if (typeof src[QUESTIONS[i].id] === 'string') map[QUESTIONS[i].id] = src[QUESTIONS[i].id];
      }
      return map;
    })());
```

with:

```js
    var answered = answeredCount(QUESTIONS, restoreAnswers(QUESTIONS, saved.answers));
```

- [ ] **Step 8: Record the new assumptions in the header block**

The header comment block at the top of `app.js` is where ambiguities are recorded rather than asked. Add four entries after the existing item 11, keeping the same numbering and wrapping style:

```js
 * 12. Grid answers are stored as an object mapping row key -> array of column
 *     keys, so the stored value for a question is no longer always a string.
 *     Every read of a stored answer therefore branches on the question type.
 * 13. schemaVersion moves 1 -> 2. `given` can now be an object, entries carry
 *     `section`, grid entries carry rowsCorrect/rowsOutOf, free-text `review`
 *     carries `outOf`, and autoScore.outOf changes meaning from "number of
 *     multiple-choice questions" to "number of auto-graded questions". A reader
 *     written against v1 would misreport a v2 file, so the version has to move.
 * 14. A part-filled grid counts as NOT answered: every row must carry at least
 *     one selection. The alternative - "answered" as soon as one box is ticked -
 *     would tell a candidate on the review screen that they had finished a
 *     question they had barely started. What they did tick is still exported.
 * 15. Two questions were reworded from the source material to remove a second
 *     defensible answer, which the spec forbids for anything auto-graded. The
 *     ai2 "pump" row now states that the historical readings are already
 *     labelled, so classification is the only fit and anomaly detection is not.
 *     sql3 now states that a Captain means Seafarers.RankCode = 'CAP' and that
 *     a voyage means any SeamanTransactions row, because the schema carries a
 *     RankCode on both tables and the two readings give different answers.
```

- [ ] **Step 9: Delete `q5` and add `section` to the remaining questions**

In `QUESTIONS`, delete the entire `q5` object (the `csharp-types` entry) including the comma that separated it from `q4`. Then add two fields to each of `q1`, `q2`, `q3`, `q4` — `section` immediately after `type`, and `grid: null` immediately after `answerKey`:

```js
      id: 'q1',
      type: 'multiple-choice',
      section: 'C# and algorithms',
```

```js
      answerKey: 'b',
      grid: null,
      points: 1,
```

Do the same for `q2` (`answerKey: 'c'`), `q3` (`answerKey: 'd'`) and `q4` (`answerKey: null`).

- [ ] **Step 10: Manual check — the app is a working four-question screen on schema 2**

```powershell
Start-Process index.html
```

Clear localStorage first. Then:

1. Start screen must say **4 questions** and **45 minutes**.
2. The timer must read `45:00` on the first question.
3. Answer q1 correctly (`Hello`), skip the rest, submit.
4. Open the downloaded JSON. It must show:
   - `"schemaVersion": 2`
   - `"id": "junior-dev-screen"`, `"version": "2.0.0"`, `"questionCount": 4`
   - `"sections": ["C# and algorithms"]`
   - `"timeLimitSeconds": 2700`
   - `"autoScore": { "correct": 1, "outOf": 3 }`
   - every entry carrying `"section": "C# and algorithms"`
   - the `q4` entry carrying `"review": { "score": null, "notes": "", "outOf": 6 }`
5. Devtools console clean, Network tab empty.

- [ ] **Step 11: Commit**

```bash
git add app.js
git commit -m "feat: emit schema 2 results, 45 minute limit, trim q5"
```

---

### Task 3: The grid renderer, its CSS, and the first grid question

Adds `buildGrid`, the builder dispatch, the grid CSS, and `ai1`. This is the first task with something new on screen.

**Files:**
- Modify: `app.js` — `QUESTIONS` (append `ai1`), QUESTION screen section (add `buildGrid` and helpers, replace the `renderQuestion` ternary)
- Modify: `styles.css` — append grid rules

**Interfaces:**
- Consumes from Tasks 1–2: `sanitiseGridValue`, `setAnswer`, `makeEl`, `appendDescription`, `state.answers`.
- Produces:
  - `buildGrid(question) -> HTMLFieldSetElement`
  - `gridIsChecked(question, rowKey, columnKey) -> Boolean`
  - `makeGridHandler(question, rowKey, columnKey, single) -> Function`
  - `BUILDERS` — map of question type to builder function

- [ ] **Step 1: Append `ai1` to `QUESTIONS`**

After the `q4` object, add a comma and then:

```js
    {
      id: 'ai1',
      type: 'grid',
      section: 'AI',
      topic: 'ai-technique-properties',
      topicLabel: 'Supervised, unsupervised, and what each technique predicts',
      prompt: 'For each technique, tick every box that applies. A technique may have more than one box ticked.',
      code: null,
      parts: null,
      hint: null,
      options: [],
      answerKey: null,
      grid: {
        select: 'multiple',
        columns: [
          { key: 'sup',   text: 'Supervised' },
          { key: 'unsup', text: 'Unsupervised' },
          { key: 'label', text: 'Predicts a predefined category or label' },
          { key: 'num',   text: 'Predicts a continuous number' },
          { key: 'sim',   text: 'Groups by similarity, with no labels' }
        ],
        rows: [
          { key: 'regression',     text: 'Regression',     answerKey: ['sup', 'num'] },
          { key: 'classification', text: 'Classification', answerKey: ['sup', 'label'] },
          { key: 'clustering',     text: 'Clustering',     answerKey: ['unsup', 'sim'] }
        ]
      },
      points: 3,
      rows: 0
    }
```

Note `hint: null`. Do not add a hint saying how many boxes belong to each row — that is a hint at the answer, which the bank's field comment forbids.

**Then document the two new fields in the bank's own field-list comment**, which currently ends at `rows`. Insert `section` after `id` and `grid` after `answerKey`, matching the existing column alignment:

```js
   *   section    string   which part of the test this question belongs to.
   *                       Questions sharing a section are grouped in the UI
   *                       and in the results file, in bank order. The grouping
   *                       is derived from this string, so there is no separate
   *                       list of sections to keep in step.
```

```js
   *   grid       object   grid only: { select, columns, rows }.
   *                         select  "multiple" -> checkboxes, "single" -> radios
   *                         columns [{key, text}] - choices offered per row
   *                         rows    [{key, text, answerKey}] - one sub-question
   *                                 each. answerKey is ALWAYS an array of
   *                                 column keys, holding exactly one entry
   *                                 when select is "single".
   *                       Graded all or nothing: every row must match for the
   *                       question to count. NOTE the grid's own rows live at
   *                       grid.rows, NOT at the question's top-level `rows`
   *                       below, which is the textarea height.
```

While in this comment, correct one pre-existing inaccuracy: the `code` field's description says the listing is "Written flush-left in a template literal", but template literals are banned by the ES5 constraint and the file actually uses string concatenation. Change that phrase to "Written flush-left with explicit \n because the indentation is part of the content."

**Finally, fix the now-stale assumption 6 in the header block.** It currently claims autoScore is "a count of multiple-choice questions" and that `points` "does not feed autoScore" — Task 2 made the first false (it counts auto-graded questions, grids included) and the second misleading (`points` now feeds `review.outOf` in the results file). Replace assumption 6's body with:

```js
 *  6. `points` does not feed autoScore, which is a count of auto-graded
 *     questions only ({correct, outOf}). For free-text, `points` is the
 *     maximum a human reviewer can award and is exported as review.outOf so
 *     the reviewer sees the maximum without opening REVIEWER.md.
```

Leave assumptions 1-5 and 7-15 alone.

- [ ] **Step 2: Add `buildGrid` and its two helpers**

In the QUESTION screen section, immediately **after** `buildFreeText` and before `renderQuestion`, insert:

```js
  /**
   * Grid: one outer <fieldset> for the question, one inner <fieldset> per row.
   *
   * Nested fieldsets are valid HTML and give every row's group of controls a
   * real accessible name from its own <legend>, so no ARIA is needed here.
   * For select: 'single' the controls are radios sharing a per-row name, which
   * is what makes the browser's own arrow-key navigation work inside a row -
   * nothing is reimplemented. .q-grid-cells is a CSS grid with auto-fit
   * columns, so a five-column question collapses to one control per line on a
   * narrow screen with no media query and no second DOM structure.
   */
  function buildGrid(question) {
    var grid = question.grid || { select: 'single', columns: [], rows: [] };
    var single = (grid.select === 'single');
    var columns = grid.columns || [];
    var rows = grid.rows || [];

    var outer = makeEl('fieldset', 'q-grid');
    outer.appendChild(makeEl('legend', 'q-prompt', question.prompt));

    var describedBy = appendDescription(outer, question, 'q-' + question.id);
    if (describedBy.length) outer.setAttribute('aria-describedby', describedBy.join(' '));

    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      var rowSet = makeEl('fieldset', 'q-grid-row');
      rowSet.appendChild(makeEl('legend', 'q-grid-rowlabel', row.text));

      var cells = makeEl('div', 'q-grid-cells');

      for (var c = 0; c < columns.length; c++) {
        var column = columns[c];
        var inputId = 'grid-' + question.id + '-' + row.key + '-' + column.key;

        var cell = makeEl('div', 'q-option');
        var input = document.createElement('input');
        input.type = single ? 'radio' : 'checkbox';
        if (single) input.name = 'grid-' + question.id + '-' + row.key;
        input.id = inputId;
        input.value = column.key;
        input.checked = gridIsChecked(question, row.key, column.key);
        input.addEventListener('change', makeGridHandler(question, row.key, column.key, single));

        var label = makeEl('label', null, column.text);
        label.setAttribute('for', inputId);

        cell.appendChild(input);
        cell.appendChild(label);
        cells.appendChild(cell);
      }

      rowSet.appendChild(cells);
      outer.appendChild(rowSet);
    }

    return outer;
  }

  function gridIsChecked(question, rowKey, columnKey) {
    var current = sanitiseGridValue(question, state.answers[question.id]);
    return (current[rowKey] || []).indexOf(columnKey) !== -1;
  }

  /**
   * Change handler for one cell. Built by a factory so the closure captures
   * this cell's keys rather than the enclosing loop variables. Always reads the
   * current value back out of state and writes a fresh object, so a stale
   * value from an edited bank cannot survive a click.
   */
  function makeGridHandler(question, rowKey, columnKey, single) {
    return function (event) {
      var current = sanitiseGridValue(question, state.answers[question.id]);
      var selected = single ? [] : (current[rowKey] || []).slice();

      if (event.target.checked) {
        if (selected.indexOf(columnKey) === -1) selected.push(columnKey);
      } else {
        var at = selected.indexOf(columnKey);
        if (at !== -1) selected.splice(at, 1);
      }

      if (selected.length) current[rowKey] = selected;
      else delete current[rowKey];

      setAnswer(question.id, current);
    };
  }
```

- [ ] **Step 3: Replace the builder ternary with a dispatch map**

Immediately **above** `renderQuestion`, insert:

```js
  /**
   * Question type -> builder. An unknown type falls back to free-text, which
   * matches gradeAnswers: it is stored verbatim and never scored.
   */
  var BUILDERS = {
    'multiple-choice': buildMultipleChoice,
    'free-text': buildFreeText,
    'grid': buildGrid
  };
```

Then in `renderQuestion`, replace:

```js
    dom.questionBody.appendChild(
      question.type === 'multiple-choice' ? buildMultipleChoice(question) : buildFreeText(question)
    );
```

with:

```js
    var build = BUILDERS[question.type] || buildFreeText;
    dom.questionBody.appendChild(build(question));
```

- [ ] **Step 4: Add the grid CSS**

Append to `styles.css`, immediately after the existing `.q-option` rules:

```css
/* --------------------------------------------------------------------------
   Grid questions - one fieldset per row, auto-fit columns inside it
   -------------------------------------------------------------------------- */

.q-grid {
  border: 0;
  margin: 0;
  padding: 0;
}

.q-grid-row {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin: 0 0 0.75rem;
  padding: 0.75rem 0.9rem 0.9rem;
  background: var(--surface-alt);
}

.q-grid-row:last-child {
  margin-bottom: 0;
}

.q-grid-rowlabel {
  padding: 0 0.35rem;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
}

.q-grid-cells {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: 0.4rem 1rem;
  margin-top: 0.5rem;
}

.q-grid-cells .q-option {
  margin: 0;
}
```

- [ ] **Step 5: Manual check — the checkbox grid works end to end**

Clear localStorage, then `Start-Process index.html`.

1. Start screen says **5 questions**. Navigate to question 5.
2. The prompt appears once, above three bordered blocks headed Regression, Classification, Clustering — each with five checkboxes.
3. **Marker:** with nothing ticked, the header says "Not answered". Tick one box in Regression only — it still says **"Not answered"** (a part-filled grid is not answered). Tick one box in each of the other two rows — it now says **"Answered"**.
4. **Multi-select:** two boxes can be ticked in the same row at once.
5. **Keyboard only:** Tab reaches every checkbox, Space toggles it, the focus ring is clearly visible on each.
6. **Persistence:** with some boxes ticked, press F5. The same boxes are still ticked and the timer shows *less* than 45:00.
7. **360px:** in devtools set the viewport to 360×640. The checkboxes stack one per line, no horizontal page scroll.
8. **Dark mode:** switch the OS or devtools to `prefers-color-scheme: dark`. Row borders and labels stay legible.
9. Devtools console clean, Network tab empty.

- [ ] **Step 6: Manual check — grid grading lands in the JSON**

1. Tick Regression = Supervised + Predicts a continuous number, Classification = Supervised only, Clustering = Unsupervised + Groups by similarity. Submit.
2. In the JSON, the `ai1` entry must read `"correct": false`, `"rowsCorrect": 2`, `"rowsOutOf": 3`, with `given` holding the three rows you ticked and `expected` holding all three answer keys.
3. `"autoScore"` must show `"outOf": 4` — three MCQs plus one grid, derived.
4. Run again ticking all six correct boxes: `"correct": true`, `"rowsCorrect": 3`, and `autoScore.correct` rises by one.
5. Run again touching nothing on question 5: the `ai1` entry has `"given": null`, `"correct": false`, `"rowsCorrect": 0`, `"rowsOutOf": 3`.

- [ ] **Step 7: Commit**

```bash
git add app.js styles.css
git commit -m "feat: add grid question type and the AI properties question"
```

---

### Task 4: The single-select grid and the AI free-text question

Completes the AI section. No new machinery — this exercises the `select: 'single'` path already built.

**Files:**
- Modify: `app.js` — `QUESTIONS` (append `ai2`, `ai3`)

**Interfaces:**
- Consumes from Task 3: `buildGrid` with `grid.select === 'single'`.
- Produces: no new functions.

- [ ] **Step 1: Append `ai2` and `ai3` to `QUESTIONS`**

After the `ai1` object, add a comma and then:

```js
    {
      id: 'ai2',
      type: 'grid',
      section: 'AI',
      topic: 'ai-technique-selection',
      topicLabel: 'Choosing a technique for a problem',
      prompt: 'Choose the one technique that fits each problem.',
      code: null,
      parts: null,
      hint: null,
      options: [],
      answerKey: null,
      grid: {
        select: 'single',
        columns: [
          { key: 'R',  text: 'Regression' },
          { key: 'C',  text: 'Classification' },
          { key: 'Cl', text: 'Clustering' }
        ],
        rows: [
          { key: 'fuel',
            text: 'Predict next month\'s bunker fuel consumption.',
            answerKey: ['R'] },
          { key: 'pump',
            text: 'You have three years of pump readings, each already labelled "normal" or ' +
                  '"failed". Flag whether a new reading looks normal or like a likely failure.',
            answerKey: ['C'] },
          { key: 'profile',
            text: 'Find natural groupings of vessels by operating profile, with no categories ' +
                  'defined in advance.',
            answerKey: ['Cl'] }
        ]
      },
      points: 3,
      rows: 0
    },
    {
      id: 'ai3',
      type: 'free-text',
      section: 'AI',
      topic: 'ai-how-it-works',
      topicLabel: 'How one of these techniques actually works',
      prompt: 'Pick any one of regression, classification or clustering, then answer (a) and (b) in the box.',
      code: null,
      parts: [
        'Name the technique you have chosen.',
        'In two or three sentences, how is that kind of problem actually solved? Say what the algorithm is given to work with, and what it produces at the end.'
      ],
      hint: 'Two or three sentences is genuinely enough, and no maths is expected.',
      options: [],
      answerKey: null,
      grid: null,
      points: 4,
      rows: 10
    }
```

- [ ] **Step 2: Manual check — the radio grid enforces one per row**

Clear localStorage, then `Start-Process index.html`. Navigate to question 6.

1. Three bordered blocks, each with three radios: Regression, Classification, Clustering.
2. **One per row:** pick Regression in the fuel row, then pick Classification in the same row — the first selection clears. Selections in *other* rows are unaffected.
3. **Keyboard:** Tab into the fuel row, then press Down/Right — the selection moves between that row's three radios and does **not** jump into another row. This is the browser's native behaviour via the shared per-row `name`; if focus escapes the row, the `name` attribute is wrong.
4. The marker reads "Answered" only once all three rows have a selection.
5. Question 7 is the AI free-text question with a 10-row monospace textarea and sub-parts (a) and (b).
6. 360px: radios stack, no horizontal scroll. Console clean.

- [ ] **Step 3: Manual check — both grids score**

Answer question 6 correctly (fuel = Regression, pump = Classification, profile = Clustering) and submit.

1. The `ai2` entry reads `"correct": true`, `"rowsCorrect": 3`, `"rowsOutOf": 3`, with `given` = `{"fuel":["R"],"pump":["C"],"profile":["Cl"]}`.
2. `"autoScore"` now shows `"outOf": 5`.
3. `"questionCount": 7`, and `"sections": ["C# and algorithms", "AI"]`.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: add AI technique-selection grid and explanation question"
```

---

### Task 5: Section UI

Makes sections visible: an eyebrow above the question heading, subheadings on the review and receipt lists, and start-screen copy derived from the bank instead of hard-coded.

**Files:**
- Modify: `index.html` — `#screen-question` heading area, `#review-list`, `#receipt-list`, the intro `<li>`
- Modify: `app.js` — `dom` map, `renderQuestion`, `renderReview`, `renderReceipt`, `renderStartIntro`
- Modify: `styles.css` — `.q-section`, `.review-group` rules

**Interfaces:**
- Consumes from Task 1: `sectionsOf`, `countAutoGraded`.
- Produces:
  - `groupedListInto(container, items, makeRow)` — appends one `<h3>` + `<ul>` per section, omitting the `<h3>` when there is a single section. `items` is any array whose elements carry a `section` string: `QUESTIONS` on the review screen, the payload's answer entries on the receipt
  - `joinWithAnd(list) -> String`
  - `dom.questionSection`, `dom.introSections`, `dom.introFreeTextCount`

- [ ] **Step 1: Add the section eyebrow to `index.html`**

In `#screen-question`, immediately **above** the `<h2 id="question-heading" ...>` line, insert:

```html
    <p id="question-section" class="q-section" hidden></p>
```

- [ ] **Step 2: Turn the two lists into containers**

Replace:

```html
    <ul id="review-list" class="review-list"></ul>
```

with:

```html
    <div id="review-list" class="review-list"></div>
```

and replace:

```html
      <ul id="receipt-list" class="review-list"></ul>
```

with:

```html
      <div id="receipt-list" class="review-list"></div>
```

- [ ] **Step 3: Rewrite the intro bullet**

Replace the entire list item that begins:

```html
        <li><strong><span id="intro-question-count">5</span> questions.</strong> The first
```

up to and including its closing `</li>`, with:

```html
        <li><strong><span id="intro-question-count">10</span> questions</strong> across
          <span id="intro-sections">several sections</span>.
          <span id="intro-mcq-count">5</span> are multiple choice or tick-box;
          <span id="intro-freetext-count">5</span> ask for a short written answer or a few lines
          of code. You can move back and forth and you can skip anything.</li>
```

- [ ] **Step 4: Register the new elements**

In the `dom` map, after `introMcqCount: el('intro-mcq-count'),` add:

```js
    introSections: el('intro-sections'),
    introFreeTextCount: el('intro-freetext-count'),
    questionSection: el('question-section'),
```

- [ ] **Step 5: Derive the intro copy**

Replace `renderStartIntro` with:

```js
  function renderStartIntro() {
    var sections = sectionsOf(QUESTIONS);
    var autoGraded = countAutoGraded(QUESTIONS);

    dom.introQuestionCount.textContent = String(QUESTIONS.length);
    dom.introSections.textContent = joinWithAnd(sections);
    dom.introMcqCount.textContent = String(autoGraded);
    dom.introFreeTextCount.textContent = String(QUESTIONS.length - autoGraded);
    dom.introTimeLimit.textContent = timeLimitLabel();
    dom.introRecruiter.textContent = RECRUITER_EMAIL;
    dom.receiptRecruiter.textContent = RECRUITER_EMAIL;
  }
```

Add this helper to the "Small pure helpers" section, inside the `test-extract:pure` region, immediately after `sectionsOf`:

```js
  /** ['a'] -> 'a'; ['a','b'] -> 'a and b'; ['a','b','c'] -> 'a, b and c'. */
  function joinWithAnd(list) {
    if (!list.length) return '';
    if (list.length === 1) return list[0];
    return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
  }
```

- [ ] **Step 6: Set the eyebrow in `renderQuestion`**

In `renderQuestion`, immediately **after** the `dom.headings.question.textContent = ...` assignment, insert:

```js
    // Only worth showing when the bank actually spans more than one section.
    var multiSection = sectionsOf(QUESTIONS).length > 1;
    dom.questionSection.textContent = question.section || '';
    dom.questionSection.hidden = !(multiSection && question.section);
```

- [ ] **Step 7: Add the grouping helper and use it in both lists**

In the REVIEW screen section, immediately **after** `buildReviewRow`, insert:

```js
  /**
   * Append one <h3> + <ul> per section to `container`, walking `items` in order
   * and starting a new group whenever the section label changes. The <h3> is
   * omitted when there is only one section, so a single-domain bank looks
   * exactly as it did before sections existed.
   *
   * `items` is anything carrying a `section` string - the QUESTIONS array on
   * the review screen, the payload's answer entries on the receipt.
   * makeRow(item, index) must return an <li>.
   */
  function groupedListInto(container, items, makeRow) {
    var showHeadings = sectionsOf(items).length > 1;
    var currentSection = null;
    var list = null;

    for (var i = 0; i < items.length; i++) {
      var section = items[i].section || '';
      if (list === null || section !== currentSection) {
        var group = makeEl('div', 'review-group');
        if (showHeadings && section) group.appendChild(makeEl('h3', 'review-group-title', section));
        list = makeEl('ul', 'review-rows');
        group.appendChild(list);
        container.appendChild(group);
        currentSection = section;
      }
      list.appendChild(makeRow(items[i], i));
    }
  }
```

In `renderReview`, replace:

```js
    clearChildren(dom.reviewList);
    for (var i = 0; i < QUESTIONS.length; i++) {
      dom.reviewList.appendChild(buildReviewRow(QUESTIONS[i], i, true));
    }
```

with:

```js
    clearChildren(dom.reviewList);
    groupedListInto(dom.reviewList, QUESTIONS, function (question, index) {
      return buildReviewRow(question, index, true);
    });
```

- [ ] **Step 8: Group the receipt list**

In `renderReceipt`, replace the whole `clearChildren(dom.receiptList); ... dom.receiptList.appendChild(row); }` block with:

```js
    // Answered/skipped list, rebuilt from the payload so it matches the file
    // exactly, and grouped by section like the review screen. Driven off the
    // payload's entries rather than the bank, so reopening an older results
    // file still lists the questions that file actually contains. The entries
    // carry their own `section`, which is all groupedListInto needs.
    clearChildren(dom.receiptList);
    var answers = (lastResult.payload && lastResult.payload.answers) || [];

    groupedListInto(dom.receiptList, answers, function (entry, index) {
      var question = null;
      for (var j = 0; j < QUESTIONS.length; j++) {
        if (QUESTIONS[j].id === entry.id) { question = QUESTIONS[j]; break; }
      }

      var row = makeEl('li', 'review-row');
      var labelWrap = makeEl('div');
      labelWrap.appendChild(makeEl('span', 'review-label', 'Question ' + (index + 1)));
      labelWrap.appendChild(makeEl('span', 'review-topic',
        question ? topicLabel(question) : String(entry.topic || '')));
      row.appendChild(labelWrap);

      var given = entry.given !== null && entry.given !== undefined;
      var status = makeEl('span', 'review-status ' +
        (given ? 'review-status--answered' : 'review-status--skipped'));
      status.appendChild(makeEl('span', null, given ? '✓' : '○'));
      status.appendChild(makeEl('span', null, given ? 'Answered' : 'Skipped'));
      row.appendChild(status);
      return row;
    });
```

- [ ] **Step 9: Add the section CSS**

Append to `styles.css`:

```css
/* --------------------------------------------------------------------------
   Section labels
   -------------------------------------------------------------------------- */

.q-section {
  margin: 0 0 0.15rem;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.review-group + .review-group {
  margin-top: 1.25rem;
}

.review-group-title {
  margin: 0 0 0.5rem;
  font-size: 0.95rem;
  color: var(--text-muted);
}

.review-rows {
  margin: 0;
  padding: 0;
  list-style: none;
}
```

- [ ] **Step 10: Manual check — sections appear**

Clear localStorage, then `Start-Process index.html`.

1. Start screen reads: **7 questions** across **C# and algorithms and AI**, **5** multiple choice or tick-box, **2** written.
2. Questions 1–4 show the eyebrow `C# AND ALGORITHMS`; questions 5–7 show `AI`.
3. The review screen lists two subheadings — C# and algorithms with four rows, AI with three — in bank order.
4. Submit. The receipt list carries the same two subheadings and the same answered/skipped marks.
5. **Single-section fallback:** temporarily comment out the `ai1`, `ai2`, `ai3` entries. Reload — the eyebrow is gone and the review list shows no subheadings. Restore the three entries.
6. 360px: eyebrow and subheadings wrap without horizontal scroll. Console clean.

- [ ] **Step 11: Commit**

```bash
git add app.js index.html styles.css
git commit -m "feat: group questions into sections in the UI and the results file"
```

---

### Task 6: The SQL section

Pure data. All three questions are free-text, so the existing renderer handles them; the only new mechanism is the shared schema listing.

**Files:**
- Modify: `app.js` — new `SQL_SCHEMA` constant above `QUESTIONS`, three entries appended

**Interfaces:**
- Consumes: `buildFreeText`, `appendDescription`.
- Produces: `SQL_SCHEMA` — the string rendered into each SQL question's `code` field.

- [ ] **Step 1: Add `SQL_SCHEMA` immediately above `QUESTIONS`**

Insert between the bank's field-list comment and `var QUESTIONS = [`:

```js
  /**
   * Shared by every SQL question so the tables are on screen next to whichever
   * one the candidate is looking at. Written flush-left with explicit newlines
   * because the indentation is part of the content.
   */
  var SQL_SCHEMA =
'Seafarers                                   -- one row per employee\n' +
'    SeamanCode   varchar(10)   not null     -- unique staff identifier\n' +
'    Name         nvarchar(100) not null\n' +
'    DateOfBirth  date          not null\n' +
'    RankCode     varchar(10)   not null     -- the seafarer\'s CURRENT rank\n' +
'\n' +
'Ranks                                       -- lookup table\n' +
'    RankCode         varchar(10)  not null  -- e.g. \'CAP\'\n' +
'    RankDescription  nvarchar(50) not null  -- e.g. \'Captain\'\n' +
'\n' +
'SeamanTransactions                          -- one row per voyage\n' +
'    SeamanCode   varchar(10)  not null\n' +
'    RankCode     varchar(10)  not null      -- the rank held on THAT voyage\n' +
'    SignOnDate   date         not null\n' +
'    SignOffDate  date         null          -- null while still on board\n' +
'    Vessel       nvarchar(50) not null\n' +
'    Port         nvarchar(50) not null';
```

- [ ] **Step 2: Append the three SQL questions**

After the `ai3` object, add a comma and then:

```js
    {
      id: 'sql1',
      type: 'free-text',
      section: 'SQL',
      topic: 'sql-keys',
      topicLabel: 'Choosing a primary key',
      prompt: 'Read the three tables below, then answer (a) and (b) in the box.',
      code: SQL_SCHEMA,
      parts: [
        'We want to guarantee that SeamanTransactions can never contain two rows for the same voyage. Which column or columns would you choose as the primary key, and why?',
        'What would have to be true about the data for your choice to stop working?'
      ],
      hint: 'No SQL needed for this one - a sentence or two per part is plenty.',
      options: [],
      answerKey: null,
      grid: null,
      points: 4,
      rows: 10
    },
    {
      id: 'sql2',
      type: 'free-text',
      section: 'SQL',
      topic: 'sql-joins',
      topicLabel: 'Joining a lookup table, and working out an age',
      prompt: 'Write one query against the tables below. Any SQL dialect is fine - say which one you are writing if it matters.',
      code: SQL_SCHEMA,
      parts: [
        'Return SeamanCode, Name, RankDescription and Age for every seafarer whose RankCode is \'CAP\'.',
        'Age must be the seafarer\'s actual age in whole years as of today - not their date of birth, and not a figure that is wrong for part of the year.'
      ],
      hint: 'There is no database here, so readable SQL matters more than exact syntax.',
      options: [],
      answerKey: null,
      grid: null,
      points: 4,
      rows: 12
    },
    {
      id: 'sql3',
      type: 'free-text',
      section: 'SQL',
      topic: 'sql-aggregates',
      topicLabel: 'Grouping, aggregates and subqueries',
      prompt: 'Write one query against the tables below. Any SQL dialect is fine.',
      code: SQL_SCHEMA,
      parts: [
        'Return the Captains who have completed more voyages than the average number of voyages completed by all Captains.',
        'Treat a Captain as a seafarer whose current rank (Seafarers.RankCode) is \'CAP\', and count a voyage as any row in SeamanTransactions for that seafarer.',
        'If any part of this strikes you as ambiguous, say how you chose to read it and carry on.'
      ],
      hint: 'There is no database here, so readable SQL matters more than exact syntax.',
      options: [],
      answerKey: null,
      grid: null,
      points: 6,
      rows: 14
    }
```

- [ ] **Step 3: Manual check — the SQL section reads correctly**

Clear localStorage, then `Start-Process index.html`.

1. Start screen: **10 questions** across **C# and algorithms, AI and SQL**, **5** auto-checked, **5** written.
2. Questions 8, 9 and 10 show the eyebrow `SQL`, each with the three-table listing in a monospace block above the sub-parts.
3. The schema block must show the `-- the seafarer's CURRENT rank` and `-- the rank held on THAT voyage` comments, and the apostrophe in "seafarer's" must render as an apostrophe, not an escape.
4. The textarea in each is at least 10 rows, monospace, and Tab moves focus out of it rather than inserting a tab.
5. Review screen shows three subheadings in bank order: C# and algorithms (4), AI (3), SQL (3).
6. Submit with all ten answered. `"questionCount": 10`, `"sections": ["C# and algorithms", "AI", "SQL"]`, `"autoScore": {"correct": ..., "outOf": 5}`, and the three `sql*` entries carry `review.outOf` of 4, 4 and 6.
7. 360px: the schema block scrolls horizontally *inside its own box* — the page itself must not scroll sideways.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: add the SQL section and its shared schema listing"
```

---

### Task 7: Documentation — reviewer notes, spec, and CLAUDE.md

No behaviour change. `REVIEWER.md` gains the two grid keys and four new rubrics; the spec document is brought back in line with the app; `CLAUDE.md` is refreshed.

**Files:**
- Modify: `REVIEWER.md`
- Modify: `assessment-app-prompt.md`
- Modify: `CLAUDE.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Update `REVIEWER.md` — flow and results-file sections**

- Section 1: five questions becomes ten across three sections; 30 minutes becomes 45.
- Section 2: document schema 2 — `autoScore.outOf` is now the number of **auto-graded** questions (multiple choice **and** grid), not just MCQs; every entry carries `section`; grid entries carry `given`/`expected` as row-keyed maps plus `rowsCorrect`/`rowsOutOf`; free-text `review` now carries `outOf` so the maximum is in the file. State plainly that a grid scores all-or-nothing and `rowsCorrect` is how to spot a near miss.

- [ ] **Step 2: Add the grid answer keys to `REVIEWER.md` section 3**

Add below the existing MCQ table:

```markdown
### Grid questions (auto-graded, all or nothing)

**ai1 — supervised/unsupervised and what each technique predicts.** Two boxes per row:

| Technique | Correct boxes |
|-----------|---------------|
| Regression | Supervised + Predicts a continuous number |
| Classification | Supervised + Predicts a predefined category or label |
| Clustering | Unsupervised + Groups by similarity, with no labels |

**ai2 — choosing a technique.** One per row: fuel consumption → Regression;
labelled pump readings → Classification; vessel groupings with no categories → Clustering.

The `pump` row states that the historical readings are already labelled, which is what makes
Classification the only defensible answer — without that, anomaly detection would be an equally
good answer and the question would not be auto-gradable.

`rowsCorrect` is the number to read when `correct` is false. 2 of 3 on `ai1` usually means the
candidate has the supervised/unsupervised axis right and has muddled what each one predicts;
0 of 3 means they were guessing.
```

- [ ] **Step 3: Replace the `q5` rubric with the four new ones**

Delete the "Q5 — value types, reference types and null" rubric entirely. Keep the Q4 rubric, relabelling it `q4`. Then add rubrics for `sql1` (4), `sql2` (4), `sql3` (6) and `ai3` (4) covering:

- **sql1 (4):** 2 for a key that actually prevents duplicate voyages — `(SeamanCode, SignOnDate)` is the strongest natural key, `(SeamanCode, Vessel, SignOnDate)` also full credit with reasoning. Full credit too for a surrogate identity PK plus a `UNIQUE` constraint on the natural key, which is what most teams really do. 0 for `SeamanCode` alone, or for putting `RankCode` or `Port` in the key. 2 for part (b) naming a condition that breaks it: `SignOnDate` carrying a time component, or a same-day sign-on after an early sign-off.
- **sql2 (4):** 2 for the join to `Ranks` plus the `'CAP'` filter and the four requested columns. 2 for a correct age. **`DATEDIFF(YEAR, DateOfBirth, GETDATE())` is wrong** — it counts calendar-year boundaries, so someone born 2000-12-31 reads as 26 on 2026-01-01. Award the 2 for `DATEDIFF` with a birthday `CASE` adjustment or the `DATEADD` comparison, and the same 2 for `FLOOR(DATEDIFF(DAY, dob, GETDATE()) / 365.25)` while noting it is approximate — it reads a day early when leap days crossed < years/4 (born 1980-03-01 on 2026-03-01 gives 45, not 46); 1 for the naive `DATEDIFF` where they flag it as approximate; 0 where they present it as exact.
- **sql3 (6):** 3 for `GROUP BY` with `HAVING COUNT(*) >` a scalar subquery averaging the per-captain counts. 0 for `HAVING COUNT(*) > AVG(COUNT(*))`, which is not valid, or for averaging over all seafarers rather than captains. 2 for the average being over captains only. 1 for noticing that captains with zero voyages fall out of an inner join and asking whether they belong in the average — that judgment is the strongest signal this question produces. Record as a bonus, without points, any remark on the two `RankCode` columns and which was used.
- **ai3 (4):** 1 for naming the technique. 3 for an explanation that says what the algorithm is given and what it produces: for regression or classification, labelled examples in and a model that maps new inputs to a number or a category out, with some mention of fitting or learning from error; for clustering, unlabelled data plus a notion of similarity or distance in, and groupings out. 0 for restating the definition without any mechanism.

Also update the "rough reading of the totals" guidance: human-graded points are now **24** (q4 6, sql1 4, sql2 4, sql3 6, ai3 4) and auto-graded is 5.

- [ ] **Step 4: Update `REVIEWER.md` sections 5 and 6**

- Section 5: mention that `SQL_SCHEMA` sits above `QUESTIONS` and is shared by the SQL questions; note that adding a grid or multiple-choice question moves `autoScore.outOf` on its own.
- Section 6: the answer key now also includes both grids' row answer keys. The stance is unchanged.
- Change the timeout-test instruction to say `TIME_LIMIT_SECONDS` goes back to `45 * 60`.

- [ ] **Step 5: Update `assessment-app-prompt.md`**

- **FLOW / QUESTIONS:** replace the line "Q1-Q3: algorithmic, multiple-choice, auto-graded. Q4-Q5: C#-specific, free-text, stored for manual review, never auto-graded. This mapping lives in the bank data — do not derive behaviour from the question's index." with:

  ```
  - The bank spans three sections: C# and algorithms, SQL, and AI. Auto-graded types
    (multiple-choice, grid) and human-graded types (free-text) are mixed within sections.
    Which is which lives in each question's `type`, and its section in its `section` — never
    derive either from a question's position, and never assume a section is contiguous with a
    type. Free-text answers are stored for manual review and never auto-graded.
  ```
- **TIMER:** 30 minutes becomes 45 throughout, including `deadline = startedAt + 45*60*1000`.
- **QUESTION BANK:** add `section` and `grid` to the field list. Add these two field descriptions to the field list, in the same style as the existing ones:

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

  Then replace "In particular `autoScore.outOf` is computed from the number of multiple-choice questions and is never the literal `3`." with "In particular `autoScore.outOf` is computed from the number of auto-graded questions — multiple-choice plus grid — and is never a literal." Finally, replace the paragraph beginning "Write the five actual questions" with a description of all ten by section and type.
- **RESULTS FILE:** replace the payload example with the schema-2 one from the spec (§7), including `assessment.sections`, `section` on every entry, the grid entry with `rowsCorrect`/`rowsOutOf`, and `review.outOf`. `timeLimitSeconds` is 2700.
- **DEFINITION OF DONE:** item 5's `autoScore` becomes `{correct: 0, outOf: 5}` and notes grid `given: null`. Item 7 becomes "add any auto-graded question (multiple-choice or grid), change nothing else, and `outOf` increases by one". Add six items: a part-ticked grid reads "Not answered" but still exports its ticks; a one-tick near miss gives `correct: false` with `rowsCorrect` showing it; both grid variants are completable by keyboard alone, with arrow keys staying inside a single-select row; the grid is usable at 360px; a refresh mid-grid restores the ticks; a bank reduced to one section hides the eyebrow and the review subheadings.

- [ ] **Step 6: Update `CLAUDE.md`**

- "What this is": ten questions across three sections, 45-minute limit.
- Run/test section: `TIME_LIMIT_SECONDS` restores to `45 * 60`.
- Architecture: add `grid` to the type list with its `grid.select` variants and the `grid.rows` naming trap; note `SQL_SCHEMA`; note that `autoScore.outOf` counts auto-graded questions via `isAutoGraded`; note `restoreAnswers` is shared by `hydrate` and `offerResume`; note the two `test-extract` marker comments and what they are for.
- Pure-functions list: add `sameKeySet`, `sanitiseGridValue`, `gradeGrid`, `gridExpected`, `sectionsOf`, `restoreAnswers`.
- Conventions: extend the "nothing below the array reads an index" invariant to cover section grouping and the auto-graded count.

- [ ] **Step 7: Verify the app never loads or links `REVIEWER.md`**

The constraint is that the app must never make the reviewer notes *reachable* — no `href`, no `src`, no fetch, no `window.open`. Naming the file in a source comment is not a violation: comments are invisible to a candidate using the app, they leak no rubric content, and `app.js` has documented its rubric location this way since it was written.

So the check is for an actual reference, not for the word:

```powershell
Select-String -Path index.html,app.js,styles.css -Pattern "(href|src|fetch|XMLHttpRequest|window\.open)[^\r\n]*REVIEWER"
```

Expected: no output. If anything matches, remove that reference — it would make the answer key reachable from the app.

Do **not** delete the doc comments that mention `REVIEWER.md` (currently four, in `app.js`: three in the header block, one on `gradeGrid`). They are the established convention for pointing a maintainer at the rubric, and removing them loses real information.

- [ ] **Step 8: Commit**

```bash
git add REVIEWER.md assessment-app-prompt.md CLAUDE.md
git commit -m "docs: reviewer rubrics, spec and guidance for the three-section screen"
```

---

### Task 8: Full Definition-of-Done pass

The release gate. Every item from `assessment-app-prompt.md` plus the six new ones, on the finished app.

**Files:** none modified unless a check fails.

- [ ] **Step 1: Zero network requests**

Open devtools on the Network tab with "Disable cache" on, then `Start-Process index.html` and complete a full run. Expected: the request list stays empty apart from the three local files. Any third entry is a failure.

- [ ] **Step 2: Happy path**

Clear localStorage. Start as `Ada Lovelace / ada@example.com`, answer all ten, review, submit. Expected: `assessment_lovelace_<YYYY-MM-DD-HHmm>.json` downloads, with local date and time and 10 entries in bank order.

- [ ] **Step 3: Refresh mid-test restores answers and does not reset the clock**

Answer questions 1–5 including both grids, note the clock, press F5, choose "Resume as Ada Lovelace". Expected: the resume panel's answered count matches what you actually answered (including grids — this is what `restoreAnswers` fixed), all answers are restored, ticks included, and the clock is **lower** than before.

- [ ] **Step 4: Timeout auto-submits from mid-question**

Set `TIME_LIMIT_SECONDS = 30`, reload, start, sit on question 9 without answering. Expected: at zero it submits by itself from where you are, the receipt says the time ran out, and the JSON carries `"timedOut": true`. **Restore `TIME_LIMIT_SECONDS = 45 * 60`.**

- [ ] **Step 5: Everything skipped**

Clear localStorage, start, press Next through all ten, submit and confirm. Expected: valid JSON, `"autoScore": {"correct": 0, "outOf": 5}`, every entry `"given": null` — both grids included — and the grid entries reading `"rowsCorrect": 0`.

- [ ] **Step 6: Keyboard only, no mouse**

Unplug or ignore the mouse. Expected: Tab and Enter start the assessment; arrow keys move between MCQ options; Space toggles grid checkboxes; arrow keys move within a single-select grid row and do **not** escape into the next row; Tab enters and leaves every textarea; review links and the submit confirmation are all reachable; a focus ring is visible at every stop.

- [ ] **Step 7: The bank stays the only thing you edit**

Temporarily add a fourth row to `ai2`'s `grid.rows` — `{ key: 'eta', text: 'Predict a vessel\'s arrival time', answerKey: ['R'] }` — and change nothing else. Expected: the question renders four rows, the marker needs all four before it says "Answered", `expected` in the JSON gains the row, and `rowsOutOf` becomes 4. Then temporarily add a fourth MCQ to the C# section: expected `autoScore.outOf` becomes 6 and the start screen counts update. **Revert both.**

- [ ] **Step 8: Nothing reveals an answer or a score**

Walk all four screens including the receipt. Expected: no screen, label, marker or console message states a score or marks an answer right or wrong. The receipt's JSON box does contain `expected` and `autoScore` — that is the documented, unavoidable exception, since it is the same file the candidate already has.

- [ ] **Step 9: Storage disabled**

Open in a private window with site data blocked. Expected: the whole assessment is completable, no uncaught errors, and the receipt still offers Copy JSON and Download again.

- [ ] **Step 10: 360px and dark mode**

Set the viewport to 360×640 and complete a run, then repeat with `prefers-color-scheme: dark`. Expected: no horizontal page scrolling anywhere (the SQL schema block scrolls inside its own box), both grids stack one control per line, and every label, border and focus ring stays legible in both themes.

- [ ] **Step 11: Re-run the pure-logic harness one final time**

```powershell
node "$SCRATCH\grid-logic.test.js" "c:\Users\i.alimpertis\source\repos\Minerva Mail Merge\CodingAssessment\app.js"
```

Expected: all checks pass against the final `app.js`.

- [ ] **Step 12: Set the recruiter address, or flag it**

`RECRUITER_EMAIL` is still `itadmin@minervamarine.com`. Either set the real address or tell the user it is still a placeholder. Do not invent an address.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "test: full definition-of-done pass for the three-section screen"
```
