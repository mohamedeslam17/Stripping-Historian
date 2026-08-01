# TASK — Round 4: one-character fix

Round 3 is verified — harness 22/0, `npm test` green, the fix is correct. See
`audit/NOTES.md`. One edge case remains.

## The defect

The disposition-override comparison in `pieceStatusFor` is strict `>`, so an engineering
review recorded in the **same minute** as the extraction is ignored:

```
extraction 2026-03-01T18:00 + Hold at 18:00  → "Cleared"        ← wrong
extraction 2026-03-01T18:00 + Hold at 18:01  → "→ Engineering"  ← right
```

Event datetimes are minute-granular (`datetime-local`, sliced to 16 characters). Pulling a
part and dispositioning it within the same minute is ordinary on a shop floor, and the
part then reads `Cleared` with an open review against it — the same failure round 3 fixed,
just inside a one-minute window.

## The fix

In `pieceStatusFor`:

```js
const engAfterDip = latestEng && lastDipEnded && latestEng.datetime > lastDipEnded;
```

becomes `>=`.

A disposition always refers to a dip that has already happened, so `>=` cannot misfire.
The "disposition before a later re-strip" case compares against the **last** dip's `outDT`,
which this does not change — the existing regression test covers it and must stay green.

## Constraints

- Only `index.html` and `tests/domain.test.mjs` may change.
- One character in `index.html`. Nothing else in that file.
- Do not touch `audit/harness.mjs`, `audit/NOTES.md`, or this file.

## Verify

1. `node audit/harness.mjs` → 22 pass, 0 fail.
2. `npm test` → green. The four round 3 regression tests must still pass, especially
   "disposition before re-strip does not override later Cleared".
3. Add one regression test: extraction and `Hold` at the **identical** timestamp →
   status `→ Engineering`.

## Report

**Overwrite** `audit/RESULTS.tsv` — delete what is there, do not append. That file only.

```
FIX	<one line>
HARNESS	pass=<n>	fail=<n>
NPMTEST	pass|fail
TESTS	<name of the regression test added>
NOTES	<anything you had to decide, or "none">
```

Then commit and push to `claude/cloudflare-pages-hosting-tajgyw`.
