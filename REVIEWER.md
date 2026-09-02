# Reviewer notes — junior developer screening assessment (C# · SQL · AI)

For the hiring engineer. **The app never loads or links to this file.** Do not put it anywhere the
candidate can reach (do not copy it next to `index.html` on a shared drive or a web root).

Files: `index.html`, `styles.css`, `app.js` — open `index.html` directly, no server, no build step.

---

## 1. How a candidate uses it

1. They open `index.html`, enter name + email, press Start. The 45-minute clock starts there and
   never pauses.
2. Ten questions, one per screen, across three sections in this order: **C# and algorithms**
   (questions 1–4, `q1`–`q4`), **SQL** (questions 5–7, `sql1`–`sql3`) and **AI** (questions 8–10,
   `ai1`–`ai3`). Three are multiple choice, two are tick-box grids and five are free text — the types
   are mixed *within* sections, so do not read "section" as "type".
   Back/Next/skip allowed, no feedback at any point.
3. Review screen (answered / not answered only), confirm, submit.
4. A file `assessment_<lastname>_<YYYY-MM-DD-HHmm>.json` downloads to their machine and they email it
   to the address in `RECRUITER_EMAIL` (top of `app.js`, currently the placeholder
   `recruiting@example.com` — **change it before use**).

If time runs out the app submits from wherever they are and sets `"timedOut": true`.

The paper is estimated at about 40 minutes of answering against the 45-minute limit, so there is very
little slack: a candidate who answered everything was working steadily throughout.

## 2. Reading the results file

`"schemaVersion": 2`. Version 1 files came from the earlier five-question, 30-minute paper: same
field names, different meanings for `autoScore.outOf` and `timeLimitSeconds`, and no `section`. Check
the version before comparing two submissions. `assessment` is
`{ id: "junior-dev-screen", version: "2.0.0", questionCount: 10, sections: [...] }`, with `sections`
in bank order.

* `autoScore` — `{ correct, outOf }` over the **auto-graded** questions, which now means multiple
  choice **and** grid, not multiple choice alone. `outOf` is 5 for the current bank (3 MCQ + 2
  grids); it is derived from the bank, so it follows the bank if you edit it. Free text never
  contributes to it.
* `answers[]` — one entry per question in bank order, skipped ones included. Every entry carries
  `section`, so you can read the file section by section without consulting the bank:
  * MCQ: `given` (their option key or `null`), `expected`, `correct`.
  * Grid: `given` and `expected` are **row-keyed maps** of row key → array of column keys
    (`{ "regression": ["sup","num"], ... }`), plus `rowsCorrect` and `rowsOutOf`. `expected` is
    always the full key and `rowsOutOf` always the row count, whether or not they ticked anything.
  * Free text: `given` (verbatim, or `null` if they left it blank/whitespace), `correct: null`, and
    `review: { score: null, notes: "", outOf: <max> }`. `outOf` is that question's maximum, so the
    ceiling for each rubric is in the file itself — you fill in `score` and `notes` by hand.
* `durationSeconds` — whole seconds, clamped to `timeLimitSeconds` (2700).
* `startedAt` / `submittedAt` — local time with UTC offset, so you can see when and where they sat it.

**A grid scores all or nothing.** Every row has to match for `correct` to be true, so two rows right
out of three counts zero towards `autoScore`. `rowsCorrect` is how you spot that near miss — a
`correct: false` with `rowsCorrect: 2` is a different candidate from one with `rowsCorrect: 0`, and
the headline number cannot tell them apart. Read it whenever `correct` is false.

A grid the candidate only part-filled reads "Not answered" on their review screen (every row must
have a selection to count as answered), but the file still exports exactly the rows they ticked. A
grid with nothing ticked at all exports `given: null`, the same as any other skipped question.

Free-text answers are stored exactly as typed, including indentation and any typos.

## 3. Answer key (auto-graded questions)

### Multiple choice

| Q | Topic | Correct | Why the distractors are there |
|---|-------|---------|-------------------------------|
| q1 | Strings | **b — `Hello`** | `a (HeLLo)` is the standard misconception that `string.Replace` mutates in place; strings are immutable and the return value is discarded. `d` tempts people who think an ignored return value is an error. |
| q2 | Recursion | **c — `8`** | Standard Fibonacci with `F(0)=0`. `a (5)` is `Calculate(5)` — an off-by-one in the trace. `d (13)` is `Calculate(7)`. `b (6)` is "it just returns n". |
| q3 | Big-O | **d — `O(n^2)`** | `c (O(n log n))` is the common wrong inference from the inner loop starting at `i + 1` ("it halves, so log n"); halving the constant does not change the class. `b` is "one loop per element". |

A junior who is comfortable in C# should get all three. Two of three is a pass signal; one or zero
alongside weak free-text answers is the clearest negative signal this test produces.

### Grid questions (auto-graded, all or nothing)

**ai1 — supervised/unsupervised and what each technique predicts.** Two boxes per row:

| Technique (row key) | Correct boxes (column keys) |
|---------------------|-----------------------------|
| Regression (`regression`) | Supervised + Predicts a continuous number (`sup`, `num`) |
| Classification (`classification`) | Supervised + Predicts a predefined category or label (`sup`, `label`) |
| Clustering (`clustering`) | Unsupervised + Groups by similarity, with no labels (`unsup`, `sim`) |

**ai2 — choosing a technique.** One per row: fuel consumption (`fuel`) → Regression (`R`);
labelled pump readings (`pump`) → Classification (`C`); vessel groupings with no categories
(`profile`) → Clustering (`Cl`).

The `pump` row states that the historical readings are **already labelled** "normal" or "failed".
That clause is load-bearing: without it, anomaly detection would be an equally defensible answer
(spot readings unlike anything seen before, no labels needed), and a question with two defensible
answers cannot be auto-graded. Having labelled history pins it to classification. If a candidate
writes to you separately arguing for anomaly detection, they have understood the material — but the
grid can only score what it scores.

`rowsCorrect` is the number to read when `correct` is false. 2 of 3 on `ai1` usually means the
candidate has the supervised/unsupervised axis right and has muddled what each one predicts; 0 of 3
means they were guessing. On `ai2`, 2 of 3 is nearly always the `pump` row going to Clustering or
Regression.

## 4. Rubrics — the five free-text questions (manual, 24 points total)

In bank order: `q4` 6 · `sql1` 4 · `sql2` 4 · `sql3` 6 · `ai3` 4 — 24 in total.

Score each part, put the question's total in `review.score` (its maximum is in `review.outOf`) and
anything worth quoting in `review.notes`. Grade the reasoning, not the syntax: there is no compiler
and no database in the app, so treat missing semicolons, `using` lines, wrong function names and
dialect slips as noise. Any SQL dialect is fine; the T-SQL forms below are just the ones you will see
most often.

### q4 — `IEnumerable<string>`, LINQ and deferred execution (6)

Expected behaviour of the snippet: line 1 prints `Ada, Linus` and line 2 prints `2`.

| Part | Points | What earns them |
|------|--------|-----------------|
| (a) | 0–2 | 2: says the method returns a lazy query/iterator over the list, not a materialised collection, and that `Where`/`Select` run only while something enumerates it (`foreach`, `string.Join`, `Count()`). 1: "it returns IEnumerable, not a List" without the deferred part. 0: thinks the filtering already happened inside the method. |
| (b) | 0–2 | 2: `Ada, Linus` then `2`, *because* the query holds a reference to the same `List<User>` and both statements enumerate it after `Linus` was added. 1: right output, hand-wavy reason — or right reason, wrong output. 0: `Ada` / `1`. |
| (c) | 0–2 | 2: a fix that materialises at the right moment (`return users.Where(...).Select(...).ToList();`, or `ToList()`/`ToArray()` at the call site, or returning `IReadOnlyList<string>`) **plus** a real trade-off — an extra allocation/copy, work done even if the caller never enumerates, losing laziness and streaming. 1: correct fix, no trade-off. 0: `.AsEnumerable()`, `yield return` with no materialisation, or "make it a List<User> parameter". |

Bonus notes worth recording (do not add points): mentions the query is enumerated twice so the work
runs twice; mentions that mutating a collection *during* enumeration throws
`InvalidOperationException`, and correctly notes that is not what happens here.

### sql1 — choosing a primary key (4)

Part (a) is the key, part (b) is what would break it. No SQL is required; sentences are fine.

| Part | Points | What earns them |
|------|--------|-----------------|
| (a) | 0–2 | 2: a key that actually prevents two rows for the same voyage, **with** the reason. `(SeamanCode, SignOnDate)` is the strongest natural key — one person cannot sign on twice on the same day. `(SeamanCode, Vessel, SignOnDate)` earns full credit where the reasoning is there. Full credit too for a surrogate `IDENTITY` PK **plus** a `UNIQUE` constraint on the natural key, which is what most teams actually do — but the unique constraint has to be there: a bare surrogate key prevents nothing and scores 0. 1: a defensible composite named with no reasoning at all, or "a composite key" without saying which columns. 0: `SeamanCode` alone (a seafarer has many voyages); anything including `RankCode` or `Port` (they describe a voyage, they do not identify it — two rows for the same voyage differing only in `Port` would both be legal); anything including `SignOffDate`, which is nullable and so cannot be part of a primary key at all. |
| (b) | 0–2 | 2: a concrete condition that would really break their choice. The two that apply to these tables: `SignOnDate` is declared `date`, so if it ever became a `datetime` two rows on the same day would be legal again; and a genuine same-day second voyage — signing off in the morning and on again that afternoon — which their key would wrongly reject. Full credit also for `SeamanCode` turning out to be reused between employees, or, for the surrogate answer, for noting that the PK alone enforces nothing. 1: the right instinct in vague terms ("if the data changed", "if there were nulls") without naming a condition that applies here. 0: nothing offered, or asserts the choice can never break. |

Bonus notes (no points): that the natural key doubles as a useful clustered index; that a surrogate
key is easier for foreign keys to point at.

### sql2 — joining a lookup table, and working out an age (4)

Two independent halves: the query shape, and the age. The age is the discriminator.

| Part | Points | What earns them |
|------|--------|-----------------|
| Join and filter | 0–2 | 2: joins `Seafarers` to `Ranks` on `RankCode`, filters to `'CAP'`, and returns the four requested columns and no more. Filtering `Ranks.RankDescription = 'Captain'` instead of the code returns the same rows — full credit, worth a note. 1: join and filter present but the projection is wrong (`SELECT *`, `RankCode` returned in place of `RankDescription`, a column missing), or the join condition is absent so it is an accidental cross join. 0: no join to `Ranks` at all, so no `RankDescription`; or the filter applied to `SeamanTransactions.RankCode`, which answers a different question — everyone who has *ever sailed* as a captain, rather than everyone whose *current* rank is captain. The schema comments distinguish the two columns, so put that one in `notes`. |
| Age | 0–2 | **2, exact:** `DATEDIFF(YEAR, DateOfBirth, GETDATE())` with a birthday `CASE` adjustment subtracting 1 where this year's birthday has not happened yet; or the `DATEADD` comparison (`DATEADD(YEAR, n, DateOfBirth) <= GETDATE()`). Equivalents in any other dialect count. **2, good but not exact:** `FLOOR(DATEDIFF(DAY, DateOfBirth, GETDATE()) / 365.25)` — the intent is right and the error is a day rather than a year, so it keeps both points, but do not file it as an exact answer: note in `review.notes` that it is approximate, and give real credit to a candidate who reaches for it *and* says so themselves. **1:** the naive `DATEDIFF(YEAR, ...)` where they explicitly flag it as approximate, or say it can be a year out around a birthday. **0:** the naive form presented as exact; `YEAR(GETDATE()) - YEAR(DateOfBirth)` (the same bug); `(GETDATE() - DateOfBirth) / 365`; or returning `DateOfBirth` and labelling it `Age`. |

**`DATEDIFF(YEAR, DateOfBirth, GETDATE())` is wrong**, and it is the answer most candidates give. It
counts calendar-year boundaries crossed, not birthdays: someone born 2000-12-31 reads as 26 on
2026-01-01, when they are in fact 25. If you are unsure whether an answer carries the bug, run that
date through it.

The `365.25` form is much closer but is not exact either, so do not present it to a candidate as the
right answer. It reads a day early whenever the leap days actually crossed number fewer than
years / 4: someone born 1980-03-01, evaluated on 2026-03-01, has 16801 days elapsed, and
16801 / 365.25 = 45.997, so `FLOOR` returns **45** on the morning of their 46th birthday. Out by a
day, not by a year — which is why it still earns the 2.

Bonus notes (no points): saying which dialect they wrote; noting the age changes between runs so it
should not be cached; casting `GETDATE()` to `date`.

### sql3 — grouping, aggregates and subqueries (6)

An average of an aggregate. The prompt already defines a Captain as `Seafarers.RankCode = 'CAP'` and
a voyage as any `SeamanTransactions` row, so neither is left to the candidate to guess.

| Part | Points | What earns them |
|------|--------|-----------------|
| Shape | 0–3 | 3: a `GROUP BY` per captain with `HAVING COUNT(*) >` a **scalar subquery** that counts per captain first and then averages those counts — normally a derived table or CTE, e.g. `HAVING COUNT(*) > (SELECT AVG(c) FROM (SELECT COUNT(*) AS c FROM ... GROUP BY SeamanCode) x)`. Total voyages divided by the number of distinct captains with voyages is the same number and also earns 3. A window function earns 3 **only when the windowed average is materialised where it is legal** — computed as `AVG(COUNT(*)) OVER ()` in the select list of a derived table or CTE that groups per captain, then compared in the outer query's `WHERE`. 2: the right shape with a slip that does not change the meaning — a missing derived-table alias, a name pulled into the select list without adding it to the `GROUP BY`. 1: per-captain counts and the average computed as two separate queries, or compared in application code — the reasoning is there, the aggregate-of-an-aggregate step is not. 0: **`HAVING COUNT(*) > AVG(COUNT(*))`**, which is not valid SQL — one aggregate cannot be nested directly inside another — and is the single most common attempt; **0 likewise for `HAVING COUNT(*) > AVG(COUNT(*)) OVER ()`**, which is the same error wearing a window function: `HAVING` is evaluated before window functions are, so no `OVER` clause may appear in it and the query will not parse. Also 0 for `COUNT(*)` in a `WHERE` clause, or for no aggregate at all. |
| Population of the average | 0–2 | 2: the average is over captains and only captains — the subquery carries the same `'CAP'` restriction as the outer query. 1: they state which population they mean but the query does not implement it (usually the outer query filters captains while the inner one averages over every seafarer). 0: averages over all seafarers, or over some other denominator (per vessel, per port), with no comment. |
| Zero-voyage judgment | 0–1 | 1: notices that a captain with no rows in `SeamanTransactions` drops out of an inner join, and asks whether those zeros belong in the average — ideally observing that including them lowers the average and so lets more captains through. A `LEFT JOIN` with `COUNT(t.SeamanCode)`, or a line of prose ("I assumed captains with no voyages are excluded"), both earn it. 0: not raised — and do not deduct anywhere else for it. |

The zero-voyage point is the strongest signal this question produces. It is the one place a candidate
can show they thought about what the data means rather than what the syntax is, and the prompt
explicitly invites it ("if any part strikes you as ambiguous, say how you chose to read it"). Quote
their wording into `review.notes` verbatim and follow it up at interview, whether or not the SQL was
right.

Bonus notes worth recording (no points): remarking on the two `RankCode` columns and stating which
one they used; noticing `SignOffDate` is nullable and asking whether an in-progress voyage counts as
"completed" (the prompt says any row, so this is a bonus, not a requirement); using a CTE for
readability; noting that `AVG` over an `int` count truncates in T-SQL.

### ai3 — how one of these techniques actually works (4)

The candidate picks the technique in part (a) and explains it in part (b), so grade (b) against the
technique **they** named, not the one you would have picked. All three choices are gradeable.

| Part | Points | What earns them |
|------|--------|-----------------|
| (a) | 0–1 | 1: names exactly one of regression, classification or clustering. Read this generously — if (a) is blank but (b) is unmistakably about one technique, award it. 0: no technique named and (b) sweeps across all three, leaving nothing to grade against. |
| (b) | 0–3 | One point each for **given**, **produces** and **mechanism**, per the table below. 0 for restating the definition with no mechanism ("classification puts things into classes"), for describing a technique other than the one named in (a), or for a general account of neural networks or ChatGPT with no connection to the named technique. |

What (b) has to contain — one point for each column, for whichever row they chose:

| Named technique | Given (1) | Produces (1) | Mechanism (1) |
|-----------------|-----------|--------------|---------------|
| Regression | labelled examples: input features plus a known **number** for each | a model that maps a new, unseen input to a number | fitting: adjusting the model to reduce its error against the known answers; "train on some data, check it on data it has not seen" |
| Classification | labelled examples: input features plus a known **category** for each | a model that assigns a new input to one of a fixed set of categories | as above — learning from error on the labels, splitting on features, minimising a loss |
| Clustering | unlabelled data **plus** a notion of similarity or distance between items, usually with a target number of groups | groups of similar items covering the data it was given — nothing more is required | iteratively moving group centres, or merging the nearest items, until the grouping stops changing |

Answers you will actually see: "you tell it how many clusters, so clustering is supervised" — `k` is a
setting, not a label; withhold the *given* point and keep the other two. "Logistic regression outputs
a number, so it is regression" — if they go on to say that number is a probability thresholded into a
class, that is the mechanism point, not an error. "You give it data and it learns" is the definition
restated: 0 for mechanism.

Bonus notes worth recording (no points): naming a real algorithm (linear regression, decision tree,
k-means) and staying consistent with it; mentioning a train/test split, overfitting, or that
clustering has no ground truth to check against. Also a bonus, **not** a requirement: saying how a
new item would be assigned to a cluster. That follows from k-means, where a point goes to the nearest
centre, but agglomerative clustering and DBSCAN produce a grouping of the data they were given and no
general assignment rule at all — so do not withhold the *produces* point from a candidate who
describes only the grouping.

**Rough reading of the totals.** There are two separate numbers here, on two different scales, and
they do not add up into anything:

* **Human-graded: 0–24 points** — the sum of the five `review.score` values you fill in
  (`q4` 6, `sql1` 4, `sql2` 4, `sql3` 6, `ai3` 4).
* **Auto-graded: 0–5 questions** — `autoScore.correct` out of `autoScore.outOf`. That is a count of
  questions, not a score: three multiple-choice and two grids, worth one each, the grids all or
  nothing.

**Do not add the two together, and do not add the grids' `points` into anything.** `ai1` and `ai2`
each carry `points: 3` in the bank, but `points` is read for exactly one purpose: populating
`review.outOf` on the **human-graded** entries. Nothing reads `points` for an auto-graded question,
no field in the results file totals it, and there is no combined score out of 30 or 33 anywhere in
this test. Each grid is worth one auto-graded question and nothing else.

Bands on the human-graded total. Every possible total falls in exactly one:

| Human-graded (of 24) | Reading |
|----------------------|---------|
| 18–24 | Strong for a junior. |
| 12–17 | Workable — take the weakest section to interview. |
| 10–11 | Borderline. The free-text answers decide it, not the number; re-read them before choosing. |
| 0–9 | A clear no. |

Read the auto-graded count as a separate check rather than folding it in: 4 or 5 of 5 is what a
comfortable junior gets, 3 is unremarkable, and 2 or fewer is a negative signal strong enough to
outweigh a mid-band written total — three multiple-choice questions and two grids are the floor of
this test. A strong written total sitting next to 2 or fewer auto-graded correct is worth a second
look before you conclude anything: check `rowsCorrect` on both grids, because a rushed near miss and
a genuine misunderstanding score the same.

Read the sections, not only the total. Twenty points spread evenly across C#, SQL and AI means
something different from twenty concentrated in one section and nothing in another; `section` on
every answer entry is there so you can see that at a glance. Weigh `ai3`'s mechanism point heavily —
AI is the section where a confident-sounding empty answer is easiest to produce.

An empty free-text box alongside correct auto-graded questions usually means they ran out of time.
Check `durationSeconds` and `timedOut` before reading anything into it. AI sits last in the paper,
but it is also the quickest section — two grids and a short written answer — so a candidate who
mistimed the SQL section in the middle can usually still finish; a blank `ai3` next to two completed
grids is more likely a gap in knowledge than a gap in time.

## 5. Editing the question bank

Everything is in the `QUESTIONS` array at the top of `app.js`, above all logic, with a comment
listing every field. Add, remove, reorder or change the multiple-choice / grid / free-text mix and
nothing below the array needs touching: the question count, the section grouping, the intro text, the
progress bar and `autoScore.outOf` are all derived from the data. Keep `id`s stable and unique — they
are what the results file keys on.

`SQL_SCHEMA` sits just above `QUESTIONS`: one string holding the three-table listing, referenced from
each SQL question's `code` field so the tables appear next to whichever SQL question is on screen.
Edit it once and all three change together. It is still above all logic, so "the bank is the only
thing you edit" holds.

Adding a **grid or multiple-choice** question moves `autoScore.outOf` by itself, with no other edit —
`outOf` counts auto-graded questions, so a new grid changes the denominator exactly as a new MCQ
does. Adding a free-text question does not touch it. Sections work the same way: the grouping is
derived by walking the bank and starting a new group whenever `section` changes, so there is no list
of sections to keep in step, but it does mean the questions of one section must sit together in the
array or that section will appear twice.

A grid's own rows live at `grid.rows`. The question's top-level `rows` is the textarea height for
free-text questions — putting grid rows there breaks the grid silently.

> **Never put a model answer in `app.js`.** Free-text questions must keep `answerKey: null`, and grid
> questions keep their top-level `answerKey: null` too (a grid keys per row, inside `grid.rows`).
> Nothing in the code or the test harness stops you adding an `answerKey` string to a free-text
> question — the free-text grading branch simply never reads it, so it would have no effect at
> runtime — but `app.js` is view-source visible to the candidate, so the string would sit there for
> anyone who looks. That is a model-answer leak with no upside. Rubrics, expected answers and
> reasoning belong in this file only.

Changing the bank invalidates any session already saved in a candidate's browser (it is discarded
rather than restored onto the wrong questions), which only matters if you edit mid-sitting.

To test the timeout path, set `TIME_LIMIT_SECONDS` to `30` in `app.js`, run through it, then put it
back to `45 * 60`.

## 6. Known limitation: this cannot be tamper-proof

Everything runs on the candidate's machine. The answer key is in `app.js` — the multiple-choice
`answerKey`s and both grids' per-row keys — and the `expected` values are in the JSON they email you,
so anyone who opens devtools or view-source can read the key, and anyone who edits the JSON before
sending it can put whatever they like in `autoScore`.

There is no fix for that on the client. Obfuscation, minification, hashing the answers and
anti-devtools tricks were all deliberately left out: they add code, break debuggability, and buy
nothing against a candidate who is willing to look. **Treat `autoScore` as a screening signal, not as
evidence.** The free-text answers are the part of this test that carries real information, and they
are graded by a human anyway.

### Smallest real fix (outline only — not built)

1. Keep the same three static files, hosted (Static Web Apps / any web server) rather than emailed.
2. Add one ASP.NET Core minimal API next to it: `app.MapPost("/api/submissions", ...)`.
3. Move `QUESTIONS` server-side, and serve each question **without** its `answerKey` — including the
   per-row `answerKey`s inside `grid.rows`, which are just as readable as the MCQ keys.
4. The client posts `{ candidate, startedAt, answers[] }` — option keys and free text only, no score.
5. The server grades against its own copy of the key and computes `durationSeconds` from its own
   clock, ignoring anything the client claims about timing.
6. One write per submission to a table or blob (`Azure.Data.Tables` / `BlobClient.UploadAsync`), keyed
   by a server-generated submission id.
7. Reviewers read submissions from there instead of an email attachment.

That removes the visible key and client-side scoring — roughly a day's work. It still does not prove
who was sitting at the keyboard, and no amount of server code will.

## 7. Deliberately not attempted

Not implemented, and not oversights:

* **No proctoring** — no webcam, no screen recording, no lockdown.
* **No tab-switch, blur or focus tracking.**
* **No paste detection or paste blocking.** A junior looking something up is normal; the free-text
  answers are where you find out whether they understand what they pasted.
* **No identity verification** — the name and email are self-declared.
* **No per-question timing**, only the global duration. Per-question timing would need the kind of
  event stream that starts to look like surveillance for a 45-minute screen.
* **No accessibility opt-outs** — Tab is not trapped in the textarea, and arrow keys in the radio
  groups (including inside each row of the single-select grid) are the browser's own, so
  keyboard-only candidates are not disadvantaged.
* **No partial credit on the grids.** A grid is one auto-graded question, right or wrong, with
  `rowsCorrect` exported so you can see a near miss. Splitting a grid into fractional points would
  make `autoScore` look more precise than a screening signal deserves.
