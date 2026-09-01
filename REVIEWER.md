# Reviewer notes — junior .NET screening assessment

For the hiring engineer. **The app never loads or links to this file.** Do not put it anywhere the
candidate can reach (do not copy it next to `index.html` on a shared drive or a web root).

Files: `index.html`, `styles.css`, `app.js` — open `index.html` directly, no server, no build step.

---

## 1. How a candidate uses it

1. They open `index.html`, enter name + email, press Start. The 30-minute clock starts there and
   never pauses.
2. Five questions, one per screen. Q1–Q3 multiple choice, Q4–Q5 free text. Back/Next/skip allowed,
   no feedback at any point.
3. Review screen (answered / not answered only), confirm, submit.
4. A file `assessment_<lastname>_<YYYY-MM-DD-HHmm>.json` downloads to their machine and they email it
   to the address in `RECRUITER_EMAIL` (top of `app.js`, currently the placeholder
   `recruiting@example.com` — **change it before use**).

If time runs out the app submits from wherever they are and sets `"timedOut": true`.

## 2. Reading the results file

* `autoScore` — `{ correct, outOf }`, multiple choice only. `outOf` is the number of MCQs in the
  bank, so it follows the bank if you edit it.
* `answers[]` — one entry per question in bank order, skipped ones included:
  * MCQ: `given` (their option key or `null`), `expected`, `correct`.
  * Free text: `given` (verbatim, or `null` if they left it blank/whitespace), `correct: null`, and
    `review: { score: null, notes: "" }` for you to fill in by hand.
* `durationSeconds` — whole seconds, clamped to `timeLimitSeconds` (1800).
* `startedAt` / `submittedAt` — local time with UTC offset, so you can see when and where they sat it.

Free-text answers are stored exactly as typed, including indentation and any typos.

## 3. Answer key (multiple choice)

| Q | Topic | Correct | Why the distractors are there |
|---|-------|---------|-------------------------------|
| q1 | Strings | **b — `Hello`** | `a (HeLLo)` is the standard misconception that `string.Replace` mutates in place; strings are immutable and the return value is discarded. `d` tempts people who think an ignored return value is an error. |
| q2 | Recursion | **c — `8`** | Standard Fibonacci with `F(0)=0`. `a (5)` is `Calculate(5)` — an off-by-one in the trace. `d (13)` is `Calculate(7)`. `b (6)` is "it just returns n". |
| q3 | Big-O | **d — `O(n^2)`** | `c (O(n log n))` is the common wrong inference from the inner loop starting at `i + 1` ("it halves, so log n"); halving the constant does not change the class. `b` is "one loop per element". |

A junior who is comfortable in C# should get all three. Two of three is a pass signal; one or zero
alongside weak free-text answers is the clearest negative signal this test produces.

## 4. Rubrics — Q4 and Q5 (manual, 6 points each)

Score each part, put the total in `review.score` and anything worth quoting in `review.notes`.
Grade the reasoning, not the syntax: there is no compiler in the app, so treat missing semicolons,
`using` lines and wrong method names as noise.

### Q4 — `IEnumerable<string>`, LINQ and deferred execution (6)

Expected behaviour of the snippet: line 1 prints `Ada, Linus` and line 2 prints `2`.

| Part | Points | What earns them |
|------|--------|-----------------|
| (a) | 0–2 | 2: says the method returns a lazy query/iterator over the list, not a materialised collection, and that `Where`/`Select` run only while something enumerates it (`foreach`, `string.Join`, `Count()`). 1: "it returns IEnumerable, not a List" without the deferred part. 0: thinks the filtering already happened inside the method. |
| (b) | 0–2 | 2: `Ada, Linus` then `2`, *because* the query holds a reference to the same `List<User>` and both statements enumerate it after `Linus` was added. 1: right output, hand-wavy reason — or right reason, wrong output. 0: `Ada` / `1`. |
| (c) | 0–2 | 2: a fix that materialises at the right moment (`return users.Where(...).Select(...).ToList();`, or `ToList()`/`ToArray()` at the call site, or returning `IReadOnlyList<string>`) **plus** a real trade-off — an extra allocation/copy, work done even if the caller never enumerates, losing laziness and streaming. 1: correct fix, no trade-off. 0: `.AsEnumerable()`, `yield return` with no materialisation, or "make it a List<User> parameter". |

Bonus notes worth recording (do not add points): mentions the query is enumerated twice so the work
runs twice; mentions that mutating a collection *during* enumeration throws
`InvalidOperationException`, and correctly notes that is not what happens here.

### Q5 — value types, reference types and null (6)

| Part | Points | What earns them |
|------|--------|-----------------|
| (a) | 0–2 | 2: value types hold the data (`struct`, `int`, `bool`, `DateTime`) and are copied on assignment and on being passed; reference types (`class`, arrays, `string`) hold a reference, so the callee sees the same object. Ideally mentions stack/heap *without* leaning on it as the whole explanation, or mentions `ref`/`out` as the way to make a value type behave differently. 1: the right idea in vaguer terms. 0: "structs are faster", or has it backwards. |
| (b) | 0–2 | 2: compiling-shaped C# with both types, plus the correct output — the `Point` still prints `0` (the method mutated a copy), the `Box` prints `99`. 1: code fine, output wrong or unexplained. 0: predicts both `99` or both `0`. |
| (c) | 0–2 | 2: `NullReferenceException` at run time (not a compile error), plus a genuine mitigation — nullable reference types / `#nullable enable` and heeding the warnings, `?.` with a fallback, `ArgumentNullException.ThrowIfNull` guard clauses, not returning `null` from your own APIs, `is null` checks at the boundary. 1: names the exception, mitigation vague ("check for null"). 0: says it compiles to `0`, or calls it a compile-time error. |

**Rough reading of the totals** (Q4 + Q5, out of 12): 9+ strong for a junior; 6–8 workable, probe the
weak part at interview; below 6 with 0–1 MCQs correct is a clear no. An empty free-text box with the
MCQs correct usually means they ran out of time — check `durationSeconds` and `timedOut` before
reading anything into it.

## 5. Editing the question bank

Everything is in the `QUESTIONS` array at the top of `app.js`, above all logic, with a comment
listing every field. Add, remove, reorder or change the MCQ/free-text mix and nothing below the array
needs touching: the question count, the intro text, the progress bar and `autoScore.outOf` are all
derived from the data. Keep `id`s stable and unique — they are what the results file keys on.

Changing the bank invalidates any session already saved in a candidate's browser (it is discarded
rather than restored onto the wrong questions), which only matters if you edit mid-sitting.

To test the timeout path, set `TIME_LIMIT_SECONDS` to `30` in `app.js`, run through it, then put it
back to `30 * 60`.

## 6. Known limitation: this cannot be tamper-proof

Everything runs on the candidate's machine. The answer key is in `app.js` and the `expected` values
are in the JSON they email you, so anyone who opens devtools or view-source can read the key — and
anyone who edits the JSON before sending it can put whatever they like in `autoScore`.

There is no fix for that on the client. Obfuscation, minification, hashing the answers and
anti-devtools tricks were all deliberately left out: they add code, break debuggability, and buy
nothing against a candidate who is willing to look. **Treat `autoScore` as a screening signal, not as
evidence.** The free-text answers are the part of this test that carries real information, and they
are graded by a human anyway.

### Smallest real fix (outline only — not built)

1. Keep the same three static files, hosted (Static Web Apps / any web server) rather than emailed.
2. Add one ASP.NET Core minimal API next to it: `app.MapPost("/api/submissions", ...)`.
3. Move `QUESTIONS` server-side, and serve each question **without** its `answerKey`.
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
  event stream that starts to look like surveillance for a 30-minute screen.
* **No accessibility opt-outs** — Tab is not trapped in the textarea and arrow keys in the radio
  groups are the browser's own, so keyboard-only candidates are not disadvantaged.
