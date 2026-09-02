/* ============================================================================
 * Screening assessment - all application logic.
 *
 * Vanilla ES5+/ES2015 in one IIFE. No frameworks, no build step, no modules
 * (ES modules are blocked by CORS over file://), zero network requests.
 *
 * ---------------------------------------------------------------------------
 * ASSUMPTIONS taken where the spec left room (recorded here rather than asked):
 *
 *  1. RECRUITER_EMAIL below is a placeholder for the spec's <RECRUITER_EMAIL>.
 *     Change that one constant before handing this to candidates; it is the
 *     only place the address appears.
 *  2. "Exactly three app files, side by side" is read as index.html, styles.css
 *     and app.js in the same folder, opened directly as index.html.
 *  3. Expired saved session found at page load: the spec says "do not let them
 *     continue - submit what was saved". This runs the normal submit path
 *     immediately and lands on RECEIPT. Browsers may refuse a download that
 *     was not started by a click, which is exactly what the RECEIPT fallback
 *     (Copy JSON / Download again) is for, and the receipt says so.
 *  4. A saved session whose bank signature no longer matches QUESTIONS (the
 *     bank was edited between sessions) is discarded rather than half-restored:
 *     the stored answers no longer map onto the questions.
 *  5. Free-text answers are exported exactly as typed (indentation preserved).
 *     Only whitespace-only text counts as skipped -> given: null.
 *  6. `points` does not feed autoScore, which is a count of auto-graded
 *     questions only ({correct, outOf}). For free-text, `points` is the
 *     maximum a human reviewer can award and is exported as review.outOf so
 *     the reviewer sees the maximum without opening REVIEWER.md.
 *  7. `timedOut` is true when the submit was triggered by the timer, and also
 *     if the wall clock is already past the deadline at submit time (clock
 *     skew, throttled tab, sleeping laptop).
 *  8. The REVIEW confirmation step is an inline panel, not window.confirm():
 *     confirm() is blockable, unstyleable and poor for screen readers.
 *  9. Answers are held in memory keyed by question id, so reordering the bank
 *     between sessions cannot silently move an answer to another question.
 * 10. The candidate's browser locale/clock is trusted for the local timestamp
 *     in the filename; the JSON carries the UTC offset so the reviewer can
 *     always recover the absolute time.
 * 11. "Nothing in the UI reveals a correct answer or the score" and "the
 *     RECEIPT shows a textarea holding the exact JSON" cannot both be fully
 *     satisfied: the required payload contains `expected` and `autoScore`. No
 *     screen, label or console message states a score or marks an answer right
 *     or wrong; the JSON fallback shows the payload as-is, which is the same
 *     information the candidate already has in the downloaded file and in
 *     view-source. See the limitations section in REVIEWER.md.
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
 * ========================================================================== */

(function () {
  'use strict';

  /* ==========================================================================
   * QUESTION BANK - the only thing you normally need to edit.
   *
   * Add, remove or reorder entries freely; change the multiple-choice /
   * free-text / grid mix freely. No code below this array reads a question
   * index or a hard-coded count: the number of questions, the number of
   * auto-graded questions (autoScore.outOf) and every label are derived
   * from this data.
   *
   * Fields:
   *   id         string   stable, unique, appears in the results JSON. Do not
   *                       reuse an id for a different question.
   *   type       string   "multiple-choice" and "grid" are auto-graded;
   *                       "free-text" is stored verbatim for a human and
   *                       never auto-graded.
   *   section    string   which part of the test this question belongs to.
   *                       Questions sharing a section are grouped in the UI
   *                       and in the results file, in bank order. The grouping
   *                       is derived from this string, so there is no separate
   *                       list of sections to keep in step.
   *   topic      string   slug that appears in the results JSON.
   *   topicLabel string   optional human label for the UI. Defaults to the
   *                       topic slug with dashes turned into spaces.
   *   prompt     string   the question itself. Becomes the <legend> of the
   *                       multiple-choice fieldset / the <label> of the
   *                       textarea, so keep it to one sentence or two.
   *   code       string   optional code listing shown below the prompt in a
   *                       <pre>. Written flush-left with explicit \n because
   *                       the indentation is part of the content.
   *   parts      array    optional list of sub-questions (a, b, c ...).
   *   hints      array    optional list of notes (never a hint at the answer).
   *   options    array    multiple-choice only: [{key, text}]. `key` is what
   *                       gets stored and exported; keep it short and stable.
   *   answerKey  string   multiple-choice only: the `key` of the one correct
   *                       option. null for free-text.
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
   *   points     number   multiple-choice: 1. Grid: a point value like
   *                       multiple-choice, graded all or nothing. Free-text:
   *                       the maximum score a human reviewer can award
   *                       (rubric in REVIEWER.md).
   *   rows       number   free-text only: textarea rows. Minimum 10 enforced.
   *
   * Keep exactly one defensible answer per multiple-choice question.
   * ======================================================================== */

  /* --- test-extract:bank:start --- */

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

  var QUESTIONS = [
    {
      id: 'q1',
      type: 'multiple-choice',
      section: 'C# and algorithms',
      topic: 'strings',
      topicLabel: 'Strings and arrays',
      prompt: 'What does this program print to the console?',
      code:
        'string greeting = "Hello";\n' +
        'greeting.Replace(\'l\', \'L\');\n' +
        'Console.WriteLine(greeting);',
      parts: null,
      hints: null,
      options: [
        { key: 'a', text: 'HeLLo' },
        { key: 'b', text: 'Hello' },
        { key: 'c', text: 'HELLO' },
        { key: 'd', text: 'Nothing - the program does not compile' }
      ],
      answerKey: 'b',
      grid: null,
      points: 1,
      rows: 0
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      section: 'C# and algorithms',
      topic: 'recursion',
      topicLabel: 'Loops and recursion',
      prompt: 'What value does Calculate(6) return?',
      code:
'static int Calculate(int n)\n' +
'{\n' +
'    if (n <= 1) return n;\n' +
'    return Calculate(n - 1) + Calculate(n - 2);\n' +
'}',
      parts: null,
      hints: [ 'Working it out on paper is quicker than it looks.' ],
      options: [
        { key: 'a', text: '5' },
        { key: 'b', text: '6' },
        { key: 'c', text: '8' },
        { key: 'd', text: '13' }
      ],
      answerKey: 'c',
      grid: null,
      points: 1,
      rows: 0
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      section: 'C# and algorithms',
      topic: 'big-o',
      topicLabel: 'Big-O reasoning',
      prompt: 'In the worst case, how does the running time of HasDuplicate grow as the number of items n gets larger?',
      code:
'static bool HasDuplicate(int[] numbers)\n' +
'{\n' +
'    for (int i = 0; i < numbers.Length; i++)\n' +
'    {\n' +
'        for (int j = i + 1; j < numbers.Length; j++)\n' +
'        {\n' +
'            if (numbers[i] == numbers[j]) return true;\n' +
'        }\n' +
'    }\n' +
'\n' +
'    return false;\n' +
'}',
      parts: null,
      hints: null,
      options: [
        { key: 'a', text: 'O(1)' },
        { key: 'b', text: 'O(n)' },
        { key: 'c', text: 'O(n log n)' },
        { key: 'd', text: 'O(n^2)' }
      ],
      answerKey: 'd',
      grid: null,
      points: 1,
      rows: 0
    },
    {
      id: 'q4',
      type: 'free-text',
      section: 'C# and algorithms',
      topic: 'csharp-linq',
      topicLabel: 'IEnumerable, LINQ and deferred execution',
      prompt: 'The method below is meant to return the names of the active users. Read the code, then answer (a), (b) and (c) in the box.',
      code:
'public IEnumerable<string> GetActiveNames(List<User> users)\n' +
'{\n' +
'    return users.Where(u => u.IsActive).Select(u => u.Name);\n' +
'}\n' +
'\n' +
'// ... elsewhere:\n' +
'var users = new List<User>\n' +
'{\n' +
'    new User { Name = "Ada",   IsActive = true },\n' +
'    new User { Name = "Grace", IsActive = false }\n' +
'};\n' +
'\n' +
'var names = GetActiveNames(users);\n' +
'users.Add(new User { Name = "Linus", IsActive = true });\n' +
'\n' +
'Console.WriteLine(string.Join(", ", names));   // line 1\n' +
'Console.WriteLine(names.Count());              // line 2',
      parts: [
        'What does GetActiveNames actually return, and at what moment does the filtering work run?',
        'What do line 1 and line 2 print? The author expected only "Ada" and 1 - explain what really happens and why.',
        'Change GetActiveNames (or the calling code) so the result matches what the author expected, and say what the trade-off of your change is.'
      ],
      hints: ['Around 10-20 lines of explanation and/or C# is plenty. There is no compiler here, so readable C# matters more than exact syntax. Tab moves to the next control - use spaces to indent.'],
      options: [],
      answerKey: null,
      grid: null,
      points: 6,
      rows: 16
    },
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
      hints: ['No SQL needed for this one - a sentence or two per part is plenty.'],
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
        'Return SeamanCode, Name, RankDescription and Age for every seafarer whose RankCode is \'CAP\'. '
      ],
      hints: [
        'Age must be the seafarer\'s actual age in whole years as of today - ( not their date of birth ), and not a figure that is wrong for part of the year.',
        'There is no database here, so readable SQL matters more than exact syntax.'
      ],
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
      ],
      hints: [
        'Treat a Captain as a seafarer whose current rank (Seafarers.RankCode) is \'CAP\', and count a voyage as any row in SeamanTransactions for that seafarer.',
        'If any part of this strikes you as ambiguous, say how you chose to read it and carry on.',
        'There is no database here, so readable SQL matters more than exact syntax.'
      ],
      options: [],
      answerKey: null,
      grid: null,
      points: 6,
      rows: 14
    },
    {
      id: 'ai1',
      type: 'grid',
      section: 'AI',
      topic: 'ai-technique-properties',
      topicLabel: 'Supervised, unsupervised, and what each technique predicts',
      prompt: 'For each technique, tick every box that applies. A technique may have more than one box ticked.',
      code: null,
      parts: null,
      hints: null,
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
    },
    {
      id: 'ai2',
      type: 'grid',
      section: 'AI',
      topic: 'ai-technique-selection',
      topicLabel: 'Choosing a technique for a problem',
      prompt: 'Choose the one technique that fits each problem.',
      code: null,
      parts: null,
      hints: null,
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
      hints: [ 'Two or three sentences is genuinely enough, and no maths is expected.' ],
      options: [],
      answerKey: null,
      grid: null,
      points: 4,
      rows: 10
    }
  ];

  /* --- test-extract:bank:end --- */

  /* ==========================================================================
   * Configuration
   * ======================================================================== */

  /* --- test-extract:config:start --- */

  // Placeholder - see assumption 1 at the top of this file.
  var RECRUITER_EMAIL = 'itadmin@minervamarine.com';

  var ASSESSMENT = { id: 'junior-dev-screen', version: '2.0.0' };

  var SCHEMA_VERSION = 2;
  var TIME_LIMIT_SECONDS = 45 * 60;          // set to 30 to test the timeout path
  var TIME_LIMIT_MS = TIME_LIMIT_SECONDS * 1000;

  var SESSION_KEY = 'assessment.v1.session';
  var SUBMITTED_KEY = 'assessment.v1.lastSubmitted';

  var SAVE_DEBOUNCE_MS = 300;
  var TICK_MS = 250;                          // ~4 ticks per second
  var MIN_TEXTAREA_ROWS = 10;

  // Announce only at these remaining-time marks, through a polite live region.
  var ANNOUNCE_MARKS_MS = [10 * 60 * 1000, 5 * 60 * 1000, 60 * 1000, 0];

  var WARNING_MS = 5 * 60 * 1000;
  var URGENT_MS = 60 * 1000;

  /* --- test-extract:config:end --- */

  /* ==========================================================================
   * State (single object; nothing leaks to window)
   * ======================================================================== */

  var state = {
    candidate: { name: '', email: '' },
    startedAt: 0,          // epoch ms
    deadline: 0,           // epoch ms == startedAt + TIME_LIMIT_MS
    currentIndex: 0,
    answers: {},           // question id -> raw string value
    started: false,
    submitted: false
  };

  var lastResult = null;   // { json, filename, payload } for the RECEIPT screen
  var timerId = null;
  var saveTimerId = null;
  var announcedMarks = [];
  var storageWorks = true; // flipped to false the first time localStorage throws
  var touched = { name: false, email: false };

  /* ==========================================================================
   * DOM references
   * ======================================================================== */

  function el(id) { return document.getElementById(id); }

  var dom = {
    screens: {
      start: el('screen-start'),
      question: el('screen-question'),
      review: el('screen-review'),
      receipt: el('screen-receipt')
    },
    headings: {
      start: el('start-heading'),
      question: el('question-heading'),
      review: el('review-heading'),
      receipt: el('receipt-heading')
    },
    timer: el('timer'),
    timerDisplay: el('timer-display'),
    timerState: el('timer-state'),
    timerIcon: el('timer-icon'),
    announcer: el('timer-announcer'),

    resumePanel: el('resume-panel'),
    resumeDetail: el('resume-detail'),
    btnResume: el('btn-resume'),
    btnStartOver: el('btn-start-over'),
    lastPanel: el('last-submitted-panel'),
    lastDetail: el('last-submitted-detail'),
    btnViewLast: el('btn-view-last'),

    startForm: el('start-form'),
    inputName: el('input-name'),
    inputEmail: el('input-email'),
    nameError: el('name-error'),
    emailError: el('email-error'),
    btnStart: el('btn-start'),
    introQuestionCount: el('intro-question-count'),
    introMcqCount: el('intro-mcq-count'),
    introSections: el('intro-sections'),
    introFreeTextCount: el('intro-freetext-count'),
    questionSection: el('question-section'),
    introTimeLimit: el('intro-time-limit'),
    introRecruiter: el('intro-recruiter'),

    progressFill: el('progress-fill'),
    answerState: el('answer-state'),
    answerStateIcon: el('answer-state-icon'),
    answerStateText: el('answer-state-text'),
    questionBody: el('question-body'),
    btnBack: el('btn-back'),
    btnNext: el('btn-next'),

    reviewList: el('review-list'),
    reviewSummary: el('review-summary'),
    btnOpenConfirm: el('btn-open-confirm'),
    confirmPanel: el('confirm-panel'),
    confirmDetail: el('confirm-detail'),
    btnConfirmSubmit: el('btn-confirm-submit'),
    btnCancelSubmit: el('btn-cancel-submit'),

    receiptLede: el('receipt-lede'),
    receiptFilename: el('receipt-filename'),
    receiptFilename2: el('receipt-filename-2'),
    receiptRecruiter: el('receipt-recruiter'),
    receiptDownloadNote: el('receipt-download-note'),
    receiptList: el('receipt-list'),
    jsonBox: el('json-box'),
    btnDownloadAgain: el('btn-download-again'),
    btnCopyJson: el('btn-copy-json'),
    copyStatus: el('copy-status')
  };

  /* ==========================================================================
   * Small pure helpers
   * ======================================================================== */

  /* --- test-extract:pure:start --- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function clamp(n, min, max) { return n < min ? min : (n > max ? max : n); }

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

  /** ['a'] -> 'a'; ['a','b'] -> 'a and b'; ['a','b','c'] -> 'a, b and c'. */
  function joinWithAnd(list) {
    if (!list.length) return '';
    if (list.length === 1) return list[0];
    return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
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

  function topicLabel(question) {
    if (question.topicLabel) return question.topicLabel;
    return String(question.topic || '').replace(/-/g, ' ');
  }

  /**
   * Fingerprint of the bank's shape. Stored with a session so a session saved
   * against a different bank is discarded instead of restored onto the wrong
   * questions (assumption 4).
   */
  function bankSignature(bank) {
    var parts = [];
    for (var i = 0; i < bank.length; i++) {
      parts.push(bank[i].id + ':' + bank[i].type);
    }
    return parts.join('|');
  }

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

  function answeredCount(bank, answers) {
    var n = 0;
    for (var i = 0; i < bank.length; i++) {
      if (isAnswered(bank[i], answers[bank[i].id])) n++;
    }
    return n;
  }

  /**
   * The time limit as prose ("30 minutes"), for the intro and the receipt.
   * Keeps every visible mention of the limit derived from TIME_LIMIT_SECONDS,
   * so lowering it to 30 for a test does not leave the UI claiming 30 minutes.
   */
  function timeLimitLabel() {
    if (TIME_LIMIT_SECONDS % 60 === 0) {
      var minutes = TIME_LIMIT_SECONDS / 60;
      return minutes + (minutes === 1 ? ' minute' : ' minutes');
    }
    return TIME_LIMIT_SECONDS + (TIME_LIMIT_SECONDS === 1 ? ' second' : ' seconds');
  }

  /** mm:ss for a remaining-milliseconds value. Never negative. */
  function formatClock(ms) {
    var totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    return pad2(minutes) + ':' + pad2(seconds);
  }

  /**
   * ISO-8601 in *local* time with the UTC offset, e.g.
   * 2026-09-01T14:32:07+03:00. Date#toISOString() is not used because it
   * converts to UTC and loses the candidate's offset.
   */
  function toIsoWithOffset(date) {
    var offsetMinutes = -date.getTimezoneOffset();     // e.g. +180 for UTC+3
    var sign = offsetMinutes < 0 ? '-' : '+';
    var abs = Math.abs(offsetMinutes);
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
      'T' + pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ':' + pad2(date.getSeconds()) +
      sign + pad2(Math.floor(abs / 60)) + ':' + pad2(abs % 60);
  }

  /**
   * Filename-safe last name.
   * Input:  the candidate's raw name, however they typed it.
   * Output: lowercase [a-z0-9-], at most 32 chars, or 'candidate'.
   * Edge cases: trailing/leading/multiple spaces; a single-word name (that word
   * is the last token); accents (decomposed, marks dropped: "Müller" -> muller);
   * non-Latin scripts (nothing survives -> 'candidate'); punctuation-only
   * tokens ("O'Brien" -> obrien, "---" -> 'candidate'); very long names.
   */
  function buildLastNameSlug(rawName) {
    var trimmed = String(rawName == null ? '' : rawName).trim();
    var tokens = trimmed.length ? trimmed.split(/\s+/) : [];
    var lastToken = tokens.length ? tokens[tokens.length - 1] : '';

    var ascii = lastToken;
    if (typeof ''.normalize === 'function') {
      // Split accented letters into letter + combining mark, then drop the
      // marks (U+0300-U+036F): "Muller" with an umlaut becomes "muller".
      ascii = lastToken.normalize('NFD').replace(/[̀-ͯ]/g, '');
    }

    var slug = ascii.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
    return slug.length ? slug : 'candidate';
  }

  /** YYYY-MM-DD-HHmm in local time, zero padded, 24-hour. */
  function formatStamp(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
      '-' + pad2(date.getHours()) + pad2(date.getMinutes());
  }

  /** assessment_<lastname>_<YYYY-MM-DD-HHmm>.json */
  function buildFilename(rawName, date) {
    return 'assessment_' + buildLastNameSlug(rawName) + '_' + formatStamp(date) + '.json';
  }

  /* ==========================================================================
   * Grading
   * ======================================================================== */

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

  /**
   * Build the results object exactly as the reviewer expects to read it.
   *
   * Inputs
   *   bank        - QUESTIONS
   *   session     - { candidate, startedAt, deadline, answers }
   *   submittedAt - Date of the submit
   *   timedOut    - boolean; true when the timer fired the submit
   *
   * Output: a plain object, JSON.stringify-able, field names and order as in
   * the spec. No answer text is transformed except whitespace-only -> null.
   *
   * Edge cases handled
   *   - durationSeconds is whole seconds, floored, clamped to
   *     [0, timeLimitSeconds] - a backwards clock or a long-sleeping laptop
   *     can otherwise produce negative or absurd durations
   *   - questionCount and autoScore.outOf both come from the bank
   *   - a candidate name/email is emitted trimmed but otherwise untouched
   */
  function buildPayload(bank, session, submittedAt, timedOut) {
    var graded = gradeAnswers(bank, session.answers);
    var elapsedSeconds = Math.floor((submittedAt.getTime() - session.startedAt) / 1000);

    return {
      schemaVersion: SCHEMA_VERSION,
      assessment: {
        id: ASSESSMENT.id,
        version: ASSESSMENT.version,
        questionCount: bank.length,
        sections: sectionsOf(bank)
      },
      candidate: {
        name: String(session.candidate.name || '').trim(),
        email: String(session.candidate.email || '').trim()
      },
      startedAt: toIsoWithOffset(new Date(session.startedAt)),
      submittedAt: toIsoWithOffset(submittedAt),
      durationSeconds: clamp(elapsedSeconds, 0, TIME_LIMIT_SECONDS),
      timeLimitSeconds: TIME_LIMIT_SECONDS,
      timedOut: !!timedOut,
      autoScore: { correct: graded.correct, outOf: graded.outOf },
      answers: graded.entries
    };
  }

  /* --- test-extract:pure:end --- */

  /* ==========================================================================
   * Download
   * ======================================================================== */

  /**
   * Hand the results file to the browser's download machinery.
   *
   * Inputs : json (string, already stringified), filename (string)
   * Output : true if the click was dispatched, false if anything threw.
   *          "true" does not prove a file reached the disk - the browser may
   *          still block or discard it - so the RECEIPT screen always offers
   *          Copy JSON and Download again as a fallback.
   *
   * Blob + createObjectURL + a temporary <a download> is used deliberately:
   * showSaveFilePicker() does not exist in Firefox or Safari and is unreliable
   * over file://. Nothing is uploaded anywhere; there is no server.
   *
   * Edge cases handled
   *   - Blob/URL/appendChild throwing (locked-down or ancient browser) -> false
   *   - the object URL is always revoked, but on a timeout rather than
   *     immediately: revoking in the same tick can cancel the download in some
   *     browsers
   *   - the anchor is removed from the DOM whatever happens, so repeated
   *     downloads cannot pile up stray nodes
   */
  function downloadJson(json, filename) {
    var url = null;
    var anchor = null;
    try {
      var blob = new Blob([json], { type: 'application/json' });
      url = URL.createObjectURL(blob);

      anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = 'noopener';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      return true;
    } catch (err) {
      return false;
    } finally {
      if (anchor && anchor.parentNode) anchor.parentNode.removeChild(anchor);
      if (url) {
        window.setTimeout(function () {
          try { URL.revokeObjectURL(url); } catch (err2) { /* nothing to do */ }
        }, 1000);
      }
    }
  }

  /* ==========================================================================
   * Storage - every access wrapped; the assessment stays completable without it
   * ======================================================================== */

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      storageWorks = false;
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (err) {
      storageWorks = false;
      return false;
    }
  }

  function storageRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      storageWorks = false;
    }
  }

  function sessionSnapshot() {
    return {
      schemaVersion: SCHEMA_VERSION,
      assessmentId: ASSESSMENT.id,
      bankSignature: bankSignature(QUESTIONS),
      candidate: { name: state.candidate.name, email: state.candidate.email },
      startedAt: state.startedAt,
      deadline: state.deadline,
      currentIndex: state.currentIndex,
      answers: state.answers,
      submitted: state.submitted
    };
  }

  function saveSessionNow() {
    if (!state.started || state.submitted) return;
    try {
      storageSet(SESSION_KEY, JSON.stringify(sessionSnapshot()));
    } catch (err) {
      storageWorks = false;
    }
  }

  /** Debounced ~300ms so typing in a textarea does not hammer localStorage. */
  function saveSessionDebounced() {
    if (saveTimerId !== null) window.clearTimeout(saveTimerId);
    saveTimerId = window.setTimeout(function () {
      saveTimerId = null;
      saveSessionNow();
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * Read a resumable session, or null. Deletes anything unusable so a bad
   * record cannot block the candidate twice.
   */
  function readSession() {
    var raw = storageGet(SESSION_KEY);
    if (!raw) return null;

    var saved = null;
    try {
      saved = JSON.parse(raw);
    } catch (err) {
      storageRemove(SESSION_KEY);
      return null;
    }

    var valid = saved && typeof saved === 'object' &&
      saved.schemaVersion === SCHEMA_VERSION &&
      saved.assessmentId === ASSESSMENT.id &&
      saved.bankSignature === bankSignature(QUESTIONS) &&
      saved.candidate && typeof saved.candidate.name === 'string' &&
      isFinite(saved.startedAt) && isFinite(saved.deadline) &&
      saved.deadline > saved.startedAt &&
      saved.submitted !== true;

    if (!valid) {
      storageRemove(SESSION_KEY);
      return null;
    }
    return saved;
  }

  function readLastSubmitted() {
    var raw = storageGet(SUBMITTED_KEY);
    if (!raw) return null;
    try {
      var record = JSON.parse(raw);
      if (record && typeof record.json === 'string' && typeof record.filename === 'string') {
        return record;
      }
    } catch (err) { /* fall through */ }
    storageRemove(SUBMITTED_KEY);
    return null;
  }

  /* ==========================================================================
   * Screen plumbing
   * ======================================================================== */

  /**
   * Swap the visible screen. Focus moves to that screen's heading (which
   * carries tabindex="-1") so keyboard and screen-reader users land at the top
   * of the new content instead of wherever the old button was.
   *
   * moveFocus is false only for the very first paint: nothing has changed yet
   * from the candidate's point of view, so stealing focus - and painting a
   * focus ring around the page title - would be noise.
   */
  function showScreen(name, moveFocus) {
    var keys = ['start', 'question', 'review', 'receipt'];
    for (var i = 0; i < keys.length; i++) {
      dom.screens[keys[i]].hidden = (keys[i] !== name);
    }
    // The clock is only meaningful while the assessment is running.
    dom.timer.hidden = !(state.started && !state.submitted &&
      (name === 'question' || name === 'review'));

    var heading = dom.headings[name];
    if (moveFocus !== false && heading && typeof heading.focus === 'function') heading.focus();
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function makeEl(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  /* ==========================================================================
   * START screen
   * ======================================================================== */

  function nameIsValid(value) {
    return String(value).replace(/\s/g, '').length >= 2;
  }

  /** One '@', something on each side, no whitespace. Deliberately not RFC-perfect. */
  function emailIsValid(value) {
    var text = String(value).trim();
    if (/\s/.test(text)) return false;
    var parts = text.split('@');
    return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
  }

  function refreshStartForm() {
    var okName = nameIsValid(dom.inputName.value);
    var okEmail = emailIsValid(dom.inputEmail.value);

    dom.nameError.textContent = (touched.name && !okName)
      ? 'Enter your full name (at least 2 letters).' : '';
    dom.emailError.textContent = (touched.email && !okEmail)
      ? 'Enter an email address in the form name@example.com.' : '';

    dom.inputName.setAttribute('aria-invalid', String(touched.name && !okName));
    dom.inputEmail.setAttribute('aria-invalid', String(touched.email && !okEmail));
    dom.btnStart.disabled = !(okName && okEmail);
  }

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

  /* ==========================================================================
   * QUESTION screen
   * ======================================================================== */

  function setAnswer(questionId, value) {
    state.answers[questionId] = value;
    renderAnswerMarker();
    saveSessionDebounced();
  }

  function renderAnswerMarker() {
    var question = QUESTIONS[state.currentIndex];
    var answered = isAnswered(question, state.answers[question.id]);
    dom.answerStateIcon.textContent = answered ? '✓' : '○';
    dom.answerStateText.textContent = answered ? 'Answered' : 'Not answered';
    dom.answerState.className = 'answer-state' + (answered ? ' answer-state--answered' : '');
  }

  /** Shared description block: code listing, sub-question list, practical hints. */
  function appendDescription(container, question, idPrefix) {
    var describedBy = [];

    if (question.code) {
      var pre = makeEl('pre', 'q-code');
      pre.id = idPrefix + '-code';
      var code = makeEl('code', null, question.code);
      pre.appendChild(code);
      container.appendChild(pre);
      describedBy.push(pre.id);
    }

    if (question.parts && question.parts.length) {
      var list = makeEl('ol', 'q-parts');
      list.id = idPrefix + '-parts';
      list.type = 'A';
      for (var i = 0; i < question.parts.length; i++) {
        list.appendChild(makeEl('li', null, question.parts[i]));
      }
      container.appendChild(list);
      describedBy.push(list.id);
    }

    if (question.hints && question.hints.length) {
      var hintList = makeEl('ul', 'q-hint');
      hintList.id = idPrefix + '-hint';
      for (var i = 0; i < question.hints.length; i++) {
        hintList.appendChild(makeEl('li', null, question.hints[i]));
      }
      container.appendChild(hintList);
      describedBy.push(hintList.id);
    }

    return describedBy;
  }

  /**
   * Real radios in a real fieldset: arrow-key navigation, roving tabindex and
   * label clicking all come from the browser. Nothing is reimplemented here.
   */
  function buildMultipleChoice(question) {
    var fieldset = makeEl('fieldset', 'q-fieldset');
    fieldset.appendChild(makeEl('legend', 'q-prompt', question.prompt));

    var describedBy = appendDescription(fieldset, question, 'q-' + question.id);
    if (describedBy.length) fieldset.setAttribute('aria-describedby', describedBy.join(' '));

    var wrap = makeEl('div', 'q-options');
    var groupName = 'answer-' + question.id;
    var current = state.answers[question.id];
    var options = question.options || [];

    for (var i = 0; i < options.length; i++) {
      var option = options[i];
      var inputId = 'opt-' + question.id + '-' + option.key;

      var row = makeEl('div', 'q-option');
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = groupName;
      input.id = inputId;
      input.value = option.key;
      if (current === option.key) input.checked = true;
      input.addEventListener('change', (function (key) {
        return function () { setAnswer(question.id, key); };
      })(option.key));

      var label = makeEl('label', null, option.text);
      label.setAttribute('for', inputId);

      row.appendChild(input);
      row.appendChild(label);
      wrap.appendChild(row);
    }

    fieldset.appendChild(wrap);
    return fieldset;
  }

  /**
   * Free text: a plain textarea. Tab is NOT trapped - keyboard users must be
   * able to leave the field, so indentation is done with spaces. Paste is not
   * blocked and spellcheck/autocorrect/autocapitalise are off because the
   * content is code.
   */
  function buildFreeText(question) {
    var wrap = makeEl('div', 'q-freetext');
    var textareaId = 'answer-' + question.id;

    var label = makeEl('label', 'q-prompt', question.prompt);
    label.setAttribute('for', textareaId);
    wrap.appendChild(label);

    var describedBy = appendDescription(wrap, question, 'q-' + question.id);

    var textarea = document.createElement('textarea');
    textarea.id = textareaId;
    textarea.className = 'q-answer';
    textarea.rows = Math.max(MIN_TEXTAREA_ROWS, question.rows || 0);
    textarea.spellcheck = false;
    textarea.setAttribute('spellcheck', 'false');
    textarea.setAttribute('autocapitalize', 'off');
    textarea.setAttribute('autocorrect', 'off');
    textarea.setAttribute('autocomplete', 'off');
    textarea.value = state.answers[question.id] || '';
    if (describedBy.length) textarea.setAttribute('aria-describedby', describedBy.join(' '));

    textarea.addEventListener('input', function () {
      setAnswer(question.id, textarea.value);
    });

    wrap.appendChild(textarea);
    return wrap;
  }

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

  /**
   * Question type -> builder. An unknown type falls back to free-text, which
   * matches gradeAnswers: it is stored verbatim and never scored.
   */
  var BUILDERS = {
    'multiple-choice': buildMultipleChoice,
    'free-text': buildFreeText,
    'grid': buildGrid
  };

  function renderQuestion() {
    var question = QUESTIONS[state.currentIndex];
    var human = state.currentIndex + 1;

    dom.headings.question.textContent =
      'Question ' + human + ' of ' + QUESTIONS.length + ' · ' + topicLabel(question);

    // Only worth showing when the bank actually spans more than one section.
    var multiSection = sectionsOf(QUESTIONS).length > 1;
    dom.questionSection.textContent = question.section || '';
    dom.questionSection.hidden = !(multiSection && question.section);

    dom.progressFill.style.width = (human / QUESTIONS.length * 100) + '%';

    clearChildren(dom.questionBody);
    var build = BUILDERS[question.type] || buildFreeText;
    dom.questionBody.appendChild(build(question));

    renderAnswerMarker();
    dom.btnBack.disabled = (state.currentIndex === 0);
    dom.btnNext.textContent =
      (state.currentIndex === QUESTIONS.length - 1) ? 'Review answers' : 'Next';
  }

  function goToQuestion(index) {
    state.currentIndex = clamp(index, 0, QUESTIONS.length - 1);
    saveSessionDebounced();
    renderQuestion();
    showScreen('question');
  }

  /* ==========================================================================
   * REVIEW screen
   * ======================================================================== */

  /** One row per question: answered or not, and a way back. Never an answer. */
  function buildReviewRow(question, index, withJump) {
    var answered = isAnswered(question, state.answers[question.id]);
    var row = makeEl('li', 'review-row');

    var labelWrap = makeEl('div');
    labelWrap.appendChild(makeEl('span', 'review-label', 'Question ' + (index + 1)));
    labelWrap.appendChild(makeEl('span', 'review-topic', topicLabel(question)));
    row.appendChild(labelWrap);

    var right = makeEl('div', 'button-row');
    var status = makeEl('span', 'review-status ' +
      (answered ? 'review-status--answered' : 'review-status--skipped'));
    status.appendChild(makeEl('span', null, answered ? '✓' : '○'));
    status.appendChild(makeEl('span', null, answered ? 'Answered' : 'Not answered'));
    right.appendChild(status);

    if (withJump) {
      var jump = makeEl('button', 'review-jump', 'Go to question ' + (index + 1));
      jump.type = 'button';
      jump.addEventListener('click', function () { goToQuestion(index); });
      right.appendChild(jump);
    }

    row.appendChild(right);
    return row;
  }

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

  function renderReview() {
    clearChildren(dom.reviewList);
    groupedListInto(dom.reviewList, QUESTIONS, function (question, index) {
      return buildReviewRow(question, index, true);
    });

    var answered = answeredCount(QUESTIONS, state.answers);
    var missing = QUESTIONS.length - answered;
    dom.reviewSummary.textContent = missing === 0
      ? 'All ' + QUESTIONS.length + ' questions have an answer.'
      : answered + ' of ' + QUESTIONS.length + ' questions answered - ' + missing +
        (missing === 1 ? ' is still unanswered.' : ' are still unanswered.');

    dom.confirmPanel.hidden = true;
  }

  function openConfirm() {
    var missing = QUESTIONS.length - answeredCount(QUESTIONS, state.answers);
    dom.confirmDetail.textContent = missing === 0
      ? 'All ' + QUESTIONS.length + ' questions have an answer.'
      : 'You are about to submit with ' + missing +
        (missing === 1 ? ' unanswered question.' : ' unanswered questions.');
    dom.confirmPanel.hidden = false;
    dom.btnConfirmSubmit.focus();
  }

  /* ==========================================================================
   * TIMER - always derived from the stored deadline, never decremented
   * ======================================================================== */

  function timerClass(remaining) {
    if (remaining <= URGENT_MS) return 'urgent';
    if (remaining <= WARNING_MS) return 'warning';
    return 'normal';
  }

  function renderTimer(remaining) {
    var kind = timerClass(remaining);
    dom.timerDisplay.textContent = formatClock(remaining);
    dom.timer.className = 'timer timer--' + kind;

    // Text and icon carry the state as well as the colour.
    if (remaining <= 0) {
      dom.timerState.textContent = 'Time is up';
      dom.timerIcon.textContent = '⏰';
    } else if (kind === 'urgent') {
      dom.timerState.textContent = 'Under 1 min';
      dom.timerIcon.textContent = '⏰';
    } else if (kind === 'warning') {
      dom.timerState.textContent = 'Under 5 min';
      dom.timerIcon.textContent = '⚠';
    } else {
      dom.timerState.textContent = 'Time left';
      dom.timerIcon.textContent = '⏱';
    }
  }

  /** Polite announcement when a mark is crossed. Marks already passed when the
   *  timer starts (a resume) are seeded as announced, so nothing fires late. */
  function maybeAnnounce(remaining) {
    for (var i = 0; i < ANNOUNCE_MARKS_MS.length; i++) {
      var mark = ANNOUNCE_MARKS_MS[i];
      if (remaining > mark || announcedMarks.indexOf(mark) !== -1) continue;
      announcedMarks.push(mark);
      if (mark === 0) {
        dom.announcer.textContent = 'Time is up. Your answers are being submitted now.';
      } else if (mark === 60 * 1000) {
        dom.announcer.textContent = 'One minute remaining.';
      } else {
        dom.announcer.textContent = (mark / 60000) + ' minutes remaining.';
      }
    }
  }

  function tick() {
    var remaining = state.deadline - Date.now();
    renderTimer(remaining);
    maybeAnnounce(remaining);
    if (remaining <= 0) {
      stopTimer();
      submitAssessment(true);
    }
  }

  function startTimer() {
    stopTimer();
    // Seed marks that are already behind us so a resume does not shout stale
    // warnings; only genuine crossings from here on are announced.
    var remaining = state.deadline - Date.now();
    announcedMarks = [];
    for (var i = 0; i < ANNOUNCE_MARKS_MS.length; i++) {
      if (remaining <= ANNOUNCE_MARKS_MS[i] && ANNOUNCE_MARKS_MS[i] !== 0) {
        announcedMarks.push(ANNOUNCE_MARKS_MS[i]);
      }
    }
    tick();
    if (!state.submitted) timerId = window.setInterval(tick, TICK_MS);
  }

  function stopTimer() {
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
  }

  /* ==========================================================================
   * SUBMIT - the one and only path, used by the button and by the timer
   * ======================================================================== */

  function submitAssessment(timedOutTrigger) {
    if (state.submitted || !state.started) return;
    state.submitted = true;
    stopTimer();
    if (saveTimerId !== null) {
      window.clearTimeout(saveTimerId);
      saveTimerId = null;
    }

    var submittedAt = new Date();
    var timedOut = !!timedOutTrigger || submittedAt.getTime() >= state.deadline;
    var payload = buildPayload(QUESTIONS, state, submittedAt, timedOut);
    var json = JSON.stringify(payload, null, 2);
    var filename = buildFilename(state.candidate.name, submittedAt);

    lastResult = { json: json, filename: filename, payload: payload };

    // Move the payload out of the in-progress key: the candidate can still
    // re-download from RECEIPT, but no resumable session is left behind.
    storageSet(SUBMITTED_KEY, JSON.stringify({
      filename: filename,
      submittedAt: payload.submittedAt,
      candidateName: payload.candidate.name,
      json: json
    }));
    storageRemove(SESSION_KEY);

    var downloaded = downloadJson(json, filename);
    renderReceipt(timedOut, downloaded, false);
    showScreen('receipt');
  }

  /* ==========================================================================
   * RECEIPT screen
   * ======================================================================== */

  /**
   * Shows the filename, which questions had an answer, and the raw JSON as a
   * fallback. Never the score, the answer key or per-question correctness.
   */
  function renderReceipt(timedOut, downloaded, isReopen) {
    dom.receiptLede.textContent = isReopen
      ? 'This is the results file from your completed assessment. It was not re-sent anywhere - it is stored only in this browser.'
      : (timedOut
        ? 'Your ' + timeLimitLabel() + ' ran out, so the assessment was submitted automatically with the answers you had given.'
        : 'Thank you. Your answers have been recorded in a file on this device.');

    dom.receiptFilename.textContent = lastResult.filename;
    dom.receiptFilename2.textContent = lastResult.filename;
    dom.receiptRecruiter.textContent = RECRUITER_EMAIL;

    dom.receiptDownloadNote.textContent = downloaded
      ? 'Check your browser downloads if you cannot see it.'
      : 'This browser did not accept the automatic download. Use the buttons below to get the file.';

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

    // textContent, never innerHTML. `value` is set too so the box still shows
    // the text if the browser has already marked the field dirty.
    dom.jsonBox.textContent = lastResult.json;
    dom.jsonBox.value = lastResult.json;
    dom.copyStatus.textContent = '';
  }

  function copyJsonToClipboard() {
    if (!lastResult) return;

    function ok() { dom.copyStatus.textContent = 'Copied.'; }
    function fallback() {
      // execCommand is deprecated but it is the only thing that works in a
      // file:// page where the async clipboard API is unavailable or refused.
      try {
        dom.jsonBox.focus();
        dom.jsonBox.select();
        var copied = document.execCommand('copy');
        dom.copyStatus.textContent = copied
          ? 'Copied.'
          : 'Could not copy automatically - select the text and copy it manually.';
      } catch (err) {
        dom.copyStatus.textContent = 'Could not copy automatically - select the text and copy it manually.';
      }
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        navigator.clipboard.writeText(lastResult.json).then(ok, fallback);
        return;
      } catch (err) { /* fall through */ }
    }
    fallback();
  }

  /* ==========================================================================
   * Flow
   * ======================================================================== */

  function beginAssessment(name, email) {
    state.candidate = { name: String(name).trim(), email: String(email).trim() };
    state.startedAt = Date.now();
    state.deadline = state.startedAt + TIME_LIMIT_MS;
    state.currentIndex = 0;
    state.answers = {};
    state.started = true;
    state.submitted = false;

    storageRemove(SESSION_KEY);
    saveSessionNow();
    startTimer();
    renderQuestion();
    showScreen('question');
  }

  /** Copy a validated saved session into state, keeping only known answers. */
  function hydrate(saved) {
    var answers = restoreAnswers(QUESTIONS, saved.answers);

    state.candidate = {
      name: String(saved.candidate.name || ''),
      email: String((saved.candidate && saved.candidate.email) || '')
    };
    state.startedAt = saved.startedAt;
    state.deadline = saved.deadline;
    state.currentIndex = clamp(Number(saved.currentIndex) || 0, 0, QUESTIONS.length - 1);
    state.answers = answers;
    state.started = true;
    state.submitted = false;
  }

  function resumeSession(saved) {
    hydrate(saved);
    if (Date.now() >= state.deadline) {
      // Belt and braces: the deadline can pass between offering Resume and the
      // click. Same rule as at load - submit what was saved.
      submitAssessment(true);
      return;
    }
    startTimer();
    renderQuestion();
    showScreen('question');
  }

  function offerResume(saved) {
    var remaining = saved.deadline - Date.now();
    var answered = answeredCount(QUESTIONS, restoreAnswers(QUESTIONS, saved.answers));

    dom.resumeDetail.textContent = 'Saved for ' + saved.candidate.name + ' - ' + answered +
      ' of ' + QUESTIONS.length + ' questions answered, ' + formatClock(remaining) +
      ' left on the clock. The clock has been running since the assessment was started.';
    dom.btnResume.textContent = 'Resume as ' + saved.candidate.name;
    dom.resumePanel.hidden = false;

    dom.btnResume.onclick = function () {
      dom.resumePanel.hidden = true;
      resumeSession(saved);
    };
    dom.btnStartOver.onclick = function () {
      storageRemove(SESSION_KEY);
      dom.resumePanel.hidden = true;
      dom.inputName.value = '';
      dom.inputEmail.value = '';
      touched.name = false;
      touched.email = false;
      refreshStartForm();
      dom.inputName.focus();
    };
  }

  function offerLastSubmitted(record) {
    dom.lastDetail.textContent = 'A results file for ' +
      (record.candidateName || 'a previous candidate') + ' (' + record.filename +
      ') is still stored in this browser. Starting a new assessment replaces it.';
    dom.lastPanel.hidden = false;
    dom.btnViewLast.onclick = function () {
      var payload = null;
      try { payload = JSON.parse(record.json); } catch (err) { payload = null; }
      lastResult = { json: record.json, filename: record.filename, payload: payload };
      renderReceipt(payload ? !!payload.timedOut : false, true, true);
      showScreen('receipt');
    };
  }

  /* ==========================================================================
   * Wiring
   * ======================================================================== */

  function wireEvents() {
    dom.inputName.addEventListener('input', refreshStartForm);
    dom.inputEmail.addEventListener('input', refreshStartForm);
    dom.inputName.addEventListener('blur', function () { touched.name = true; refreshStartForm(); });
    dom.inputEmail.addEventListener('blur', function () { touched.email = true; refreshStartForm(); });

    dom.startForm.addEventListener('submit', function (event) {
      event.preventDefault();
      touched.name = true;
      touched.email = true;
      refreshStartForm();
      if (!nameIsValid(dom.inputName.value) || !emailIsValid(dom.inputEmail.value)) {
        (nameIsValid(dom.inputName.value) ? dom.inputEmail : dom.inputName).focus();
        return;
      }
      dom.resumePanel.hidden = true;
      dom.lastPanel.hidden = true;
      beginAssessment(dom.inputName.value, dom.inputEmail.value);
    });

    dom.btnBack.addEventListener('click', function () {
      if (state.currentIndex > 0) goToQuestion(state.currentIndex - 1);
    });

    // Next never checks whether the question was answered.
    dom.btnNext.addEventListener('click', function () {
      if (state.currentIndex < QUESTIONS.length - 1) {
        goToQuestion(state.currentIndex + 1);
      } else {
        renderReview();
        showScreen('review');
      }
    });

    dom.btnOpenConfirm.addEventListener('click', openConfirm);
    dom.btnCancelSubmit.addEventListener('click', function () {
      dom.confirmPanel.hidden = true;
      dom.btnOpenConfirm.focus();
    });
    dom.btnConfirmSubmit.addEventListener('click', function () {
      submitAssessment(false);
    });

    dom.btnDownloadAgain.addEventListener('click', function () {
      if (!lastResult) return;
      var okDownload = downloadJson(lastResult.json, lastResult.filename);
      dom.copyStatus.textContent = okDownload
        ? 'Download started again.'
        : 'The browser refused the download - copy the JSON instead.';
    });
    dom.btnCopyJson.addEventListener('click', copyJsonToClipboard);

    // Warn only while there is something to lose.
    window.addEventListener('beforeunload', function (event) {
      if (!state.started || state.submitted) return undefined;
      saveSessionNow();
      event.preventDefault();
      event.returnValue = '';
      return '';
    });

    // A tab coming back from the background may have missed many ticks.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && state.started && !state.submitted) tick();
    });
  }

  /* ==========================================================================
   * Init
   * ======================================================================== */

  function init() {
    renderStartIntro();
    wireEvents();
    refreshStartForm();

    var saved = readSession();
    if (saved && Date.now() >= saved.deadline) {
      // Time already gone: no continuing. Submit what was saved (assumption 3).
      hydrate(saved);
      submitAssessment(true);
      return;
    }

    if (saved) offerResume(saved);

    var lastSubmitted = readLastSubmitted();
    if (lastSubmitted) offerLastSubmitted(lastSubmitted);

    showScreen('start', false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
