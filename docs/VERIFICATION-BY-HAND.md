# Checks that were not machine-verified

For whoever hands this assessment to a candidate. Nine checks below were **not** verified
automatically, and this document exists so that is stated rather than glossed over.

## Why these are here

The app's defining constraint is that `index.html` works when opened **directly from disk**, over
`file://`, with no server. Every automation sandbox used to build and verify this work **blocks
`file://`**, so all browser verification was driven over a local `http://127.0.0.1` server instead.

For most behaviour that substitution is harmless. For a handful it genuinely is not — the Blob
download, the clipboard fallback, and `localStorage` availability all behave differently when a page
is opened from the filesystem. Those are exactly the checks below.

Separately, the test harness used during development (56 assertions) covers the pure functions, the
question bank's shape, and grading the real bank end to end. It covers **none** of the DOM renderers,
nothing in `index.html`, and nothing in `styles.css`. Layout, focus rings, dark mode and keyboard
behaviour rest entirely on human observation.

## The checks

Run these with `index.html` opened directly from disk — not through a server.

- [ ] **1. Zero network requests.** Open devtools on the Network tab, tick "Disable cache", then open
  `index.html` from disk and complete a full run. The request list must stay empty apart from the
  three local files. Any fourth entry is a defect.

- [ ] **2. The download actually happens.** Complete the assessment and submit. A file named
  `assessment_<lastname>_<YYYY-MM-DD-HHmm>.json` must download, with local date and time. Some
  browsers restrict Blob downloads from `file://` — if it does not appear, the receipt screen's
  "Download again" and "Copy JSON" buttons are the intended fallback, and they need checking too.

- [ ] **3. The receipt fallbacks.** On the receipt screen, press **Copy JSON** and paste somewhere to
  confirm the full payload arrived. The code deliberately falls back from `navigator.clipboard` to
  `document.execCommand('copy')` because the former is often unavailable on `file://` — this check
  is the only way to know which path your browser takes. Then press **Download again**.

- [ ] **4. Resume after a refresh, with grid answers.** Answer some questions including the two grid
  questions (8 and 9), then press F5. Choose "Resume as \<name\>". Confirm the grid ticks come back,
  the free-text comes back, the clock shows **less** time than before, and the resume panel's
  "N of M answered" count matches what you actually answered.

- [ ] **5. Keyboard only, no mouse.** Tab and Enter to start; arrow keys to pick multiple-choice
  options; **Space** to toggle question 8's checkboxes; **arrow keys within one row** of question 9,
  which must not jump into the next row; Tab into and out of every textarea without being trapped.
  A focus ring must be visible at every stop.

- [ ] **6. 360px.** Set the viewport to 360×640 and walk all ten questions. The page must never scroll
  sideways. Code listings and the SQL schema block should scroll **inside their own boxes**; both
  grids should stack one control per line. (This one had a real bug — questions 2 and 3 overflowed
  the page until `min-width: 0` was added to `.q-fieldset`. Worth re-checking on your own browser.)

- [ ] **7. Dark mode.** Repeat a run with the OS or devtools set to `prefers-color-scheme: dark`.
  Grid row borders, legends, section labels and focus rings must all stay legible.

- [ ] **8. The timeout path.** Set `TIME_LIMIT_SECONDS = 30` in `app.js`, reload, start, and sit on a
  question without answering. At zero it must submit by itself from where you are, the receipt must
  say the time ran out, and the JSON must carry `"timedOut": true`. **Then restore `45 * 60`.**

- [ ] **9. Storage disabled.** Open in a private window with site data blocked. The whole assessment
  must remain completable with no uncaught errors, and the receipt must still offer Copy JSON and
  Download again. (During development this was exercised by stubbing `localStorage` to throw, not by
  a genuinely blocked browser.)

## One thing to change before use

`RECRUITER_EMAIL` in `app.js` is still the placeholder `recruiting@example.com`. It is the only place
the address appears, and it is what the candidate is told to email their results file to.

## What *was* verified automatically

So the list above is read in proportion:

- 56 harness assertions over the pure functions — set comparison, stored-value sanitisation, grid
  grading, the skipped rules, filename building, and the schema-2 payload envelope.
- The real question bank's integrity: unique ids, valid types, non-empty sections, every grid row's
  answer keys resolving to real column keys, single-select rows carrying exactly one key, positive
  point values, `parts` and `rows` shapes.
- Grading the real bank end to end, so a question added to `QUESTIONS` is checked with no edit to the
  harness.
- Everything in checks 1-9 above **except** the `file://` protocol itself was also exercised in a real
  Chromium over `http://127.0.0.1`, including a genuine submit-and-download round trip, arrow-key
  containment inside a grid row measured with real key presses, and page-width measurements at 360px
  in both themes.
