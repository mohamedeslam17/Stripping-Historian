# TASK — Round 3: fix one defect

Round 2 is reviewed. See `audit/NOTES.md` for the full analysis. Short version: of 96
non-passing lines, **one was a real defect**. The other 95 were harness bugs or stale
expectations — I verified each cluster directly against `main` before discarding it.

So this round is not an audit. It is one small, precise fix.

## The defect

`pieceStatusFor` in `index.html` checks `cleared` **before** `engEvents.length`, so an
engineering disposition recorded *after* a part cleared is swallowed:

```
cleared-then-Hold  → status "Cleared",       job card eng count 0
restrip-then-Hold  → status "→ Engineering", job card eng count 1
```

Engineering flags a cleared part for review, and the board still reads `Cleared`, the job
card shows zero parts at engineering, and no red suggestion is raised. `Scrap` and
`Return to vendor` already override correctly — they were moved above `cleared` in
commit `d7090c9`. `Accepted` and the generic "has a review" branch were left below it.

## Reproduce first

```bash
node audit/harness.mjs
```

Expect exactly three failures — `M3`, `M4`, `M14` — and 19 passes. **If you see any other
failure, stop and report it; do not start fixing.** The harness is reviewer-authored and
verified; its fixtures are correct. Do not edit it.

## The fix

In `pieceStatusFor`, an engineering disposition dated **after the last dip ended** should
govern the status, whatever that dip's result was. A disposition dated *before* the last
dip must not — a part reviewed, then re-stripped and cleared, is `Cleared`.

Suggested shape (adapt to the surrounding style):

- Find the latest engineering event and the last closed dip's `outDT`.
- If the disposition is later than that `outDT`, let the disposition branches run first —
  `Accepted`, `Scrap`, `Return to vendor`, otherwise `→ Engineering`.
- Otherwise keep the current order, with `cleared` winning.

Keep `Scrap` / `Return to vendor` overriding unconditionally, as they do now.

## Constraints

- **Only `index.html` and `tests/domain.test.mjs` may change.** Nothing else.
- Minimal edit. Do not reformat, refactor, or restructure `pieceStatusFor` beyond the
  ordering change. A reviewer must read the diff in one screen.
- Keep the function pure — no DOM, no storage, no `Date.now()`.
- Do not touch `audit/harness.mjs`, `audit/NOTES.md`, or this file.

## Verify

1. `node audit/harness.mjs` → **22 pass, 0 fail**.
2. `npm test` → domain and smoke suites both green. If an existing test now fails, that
   test encoded the old behaviour — say so in your report rather than silently editing it.
3. Add regression tests to `tests/domain.test.mjs` covering: cleared-then-`Hold`,
   cleared-then-`Accepted`, cleared-then-`Scrap`, and review-then-re-strip-then-cleared
   (which must stay `Cleared`).

## Report

Overwrite `audit/RESULTS.tsv` — that file only:

```
FIX	<what you changed, one line>
HARNESS	pass=<n>	fail=<n>
NPMTEST	pass|fail
TESTS	<names of regression tests added>
NOTES	<anything you had to decide, or "none">
```

Then commit and push to `claude/cloudflare-pages-hosting-tajgyw`.
