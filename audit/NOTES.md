# Reviewer notes

## Round 1 — reviewed

Haiku pushed `audit.mjs` to `claude/execute-this-9qmuo9` (no results file). Re-run here.

**Coverage:** 55 of ~300 cases implemented.

**44 reported failures. Most were harness bugs, not app bugs:**

| Cause | Cases | Detail |
|---|---|---|
| Bath age contamination | F6–F16, F24, G10, H8, I1, I5, I10 | Baths filled `2026-03-01`, `NOW = 2026-04-01`, `maxBathAge: 30` → an extra age flag on nearly every bath. Raising `maxBathAge` made all 13 pass with no code change. |
| Wrong argument order | I14, I15 | `deriveSuggestions(events, nowDT, CONFIG)`; the real signature is `(events, config, nowDT)`. Both threw. |
| Wrong fixture signature | I13, I17, I22 | `fill(dt, bath, null, {fePpm:150})` against `fill(dt, bath, x = {})` — chemistry silently dropped, bath looked healthy. |
| Expectation ≠ fixture built | G7, L5, L17, E19, E16, F37, B33, D22 | e.g. G7 asserted 40% from 6 dips (33% correct); L5 asserted 1.5 from cycles of 2 and 3 (2.5 correct); L17 asserted 2 cycles from 3 loads; E19 asserted a 24 h breach from 22 h. |

**One real defect, and it explained the rest.**

`pieceStatusFor` tested `recs.some(r => r.result === "Cleared")` — *any* historical clear —
before every other branch. So a piece that cleared and was later scrapped still read
`Cleared`, and one that cleared and was re-loaded read `Cleared` while sitting in a bath.

Cascaded into: E7–E11, E20, E25, E26, E27, G20, H13, H14, H15, I13, I26.

**Status: fixed on `main`** (commit `d7090c9`). `cleared` is now scoped to the latest dip,
and `Scrap` / `Return to vendor` take precedence over it. `npm test` green on `main`
(domain + smoke). Group M in `TASK.md` regression-tests this so it cannot return quietly.

## Round 2 — open

Auditing current `main`, merged into this branch. Note `idleParts` no longer exists, so
round 1's hardcoded `EXPORTS` list throws on load — `TASK.md` has Haiku derive it from the
file instead. ~245 cases from the original list were never implemented; they run this round.
