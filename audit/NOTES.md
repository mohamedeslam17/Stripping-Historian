# Reviewer notes

## Round 6 — verified in a browser (4 of 6 landed)

Drove the built app in Chromium with the example data, at 1440×900 and 1024×768.

| Item | Reported | Actual |
|---|---|---|
| 1 tanks first | done | **✓ works** — on a 1024×768 tablet all four tanks are visible with no scroll; KPI strip pushed to y≈1175 |
| 2 drawer focus | done | **✗ does not work** — `activeElement` is still the date input on all four entry paths |
| 3 field order | done | **✓ works** — Date → Bath → Serials → J/C → Component |
| 4 disposed bath | done | **✓ works** — card shows exactly one button, "Fill — new charge" |
| 5 suggestion dedupe | done | **~ partial** — dedupe (6→4) and the cap (3 + "show all (1)") both work, but the heading still prints the pre-dedupe count, "· 6" |
| 6 extraction results | done | **✓ works** — result buttons carry `disabled` until the row is ticked |

Gates independently re-run: cases 2000/0, harness 22/0, `npm test` 65 pass + smoke green.
The `tests/smoke.mjs` edit is legitimate — it adds `querySelectorAll` to the fake DOM node
because the new focus code calls it. Not a bent test.

### Why item 2 failed, and why it looked done

The new focus code is correct and does fire. Patching `HTMLElement.prototype.focus` and
capturing call sites showed the race:

```
INPUT/text            <= index.html:1214   ← the new, correct focus
INPUT/datetime-local  <= index.html:1151   ← pre-existing generic autofocus, steals it
```

`openDrawer()` already contained a generic `setTimeout(…, 0)` that focuses the first
`input, select, textarea, button.typetab` in the drawer. `renderDrawer()` runs synchronously
inside `openDrawer()`, so the new handler is queued first and the old generic one second —
it runs last and wins. Two independent zero-delay timeouts racing for the same thing.

This is only observable in a running browser; the code reads correctly. Queued as round 7
with an explicit instruction not to report it done without watching focus land.

## Round 6 — operator UX review (drove the real app)

Ran `index.html` in Chromium with the example data at 1440×900 and 1024×768, walked add /
remove / re-mask, checked shortcuts and focus. Findings written up as six ordered items in
`TASK.md`. Evidence:

| Finding | Measured |
|---|---|
| Tanks below the fold | tanks start at **y≈793px**; at 1024×768 the KPI tiles wrap to two rows and no tank is visible on arrival |
| Wrong focus target | `document.activeElement` on opening Add parts *and* Remove parts is the **date input**, which is already prefilled with now |
| Form runs backwards | J/C + Component render above Serials but are auto-filled from it (`7261-01` → `7261` / `GT26 R2011 V3`, verified) |
| Disposed bath dead end | card offers Add parts / Chem / Top up — all invalid — and **no Fill**; the warning says "fill it before loading" with no button to do it |
| Duplicate reporting | bath 106-107 age appears in the banner, on the card, and twice in suggestions; 4 baths → 6 suggestion rows |
| Extraction pre-selects | every row shows **Cleared** active before the row is ticked |

**Correction to my own first pass:** I initially flagged "operator name retyped on every
event". Wrong — `lastOperator` (line 1108) already prefills new forms, and it was only
empty in my session because loading example data is a bulk import, not a save. The real
residual is that it is in-memory only and resets on reload; demoted to a minor item.

Working well and deliberately left alone: the Remove parts checklist (live contents,
per-part result, All/None — two clicks to pull a whole bath), waiting-area chips, serial
autofill, `L`/`E`/`N`/`/` shortcuts, and the Pieces filter chips with inline actions.

## Round 5 — returned clean

Haiku's run (commit `88e944d`): `SUITE pass=2000 fail=0 threw=0`, `HARNESS 22/0`,
`NPMTEST pass`, `CLEAN`. Matches my own run of the same suite exactly, and no DISPUTE
lines — so the 2000 cases agree with the code on this branch. First round of this whole
exercise to come back with nothing to triage.

## Round 4 — done (reviewer)

Made the one-character fix myself: `engAfterDip` now compares `>=`, so a disposition logged
in the same minute as the extraction governs. Comment added explaining why. One regression
test added. Verified: harness 22/0, `npm test` 65 pass, smoke green.

```
extraction 18:00 + Hold at 18:00  → "→ Engineering"   (was "Cleared")
extraction 18:00 + Hold at 18:01  → "→ Engineering"
```

## Round 5 — 2000-case suite built

`audit/cases.mjs` — 2000 deterministic cases (seeded PRNG, so case N is the same input on
every run). Expectations come from independent models, never from the app: an arithmetic
model for `parseSerials`, a separate simulator for dip pairing, contract rules and
metamorphic relations for status, and config-derived bounds for bath flags.

| Family | Cases | Basis |
|---|---|---|
| A | 250 | `parseSerials`, expected list computed arithmetically |
| B | 450 | dip pairing vs. an independent simulator |
| C | 400 | status contract rules over the full cartesian product + metamorphic relations |
| D | 300 | bath flags, values on every boundary |
| E | 300 | warning contract rules |
| F | 300 | whole-stream invariants |

**Currently 2000 pass, 0 fail, 0 threw.**

A suite that passes everything is worthless unless it is proven sensitive, so I
mutation-tested it. Three independent one-character mutations to `index.html`:

| Mutation | Result |
|---|---|
| `engAfterDip` `>=` → `>` (revert round 4) | 12 fails, all in C |
| capacity flag `>` → `>=` | 17 fails, all in D |
| iron flag `>` → `>=` | 60 fails, all in D |

Each localized to the right family; reverting restored 2000/0. A clean run means something.

Two generator bugs of my own, caught by running it: key ordering in the family-B comparison
produced 34 phantom failures, and family C's cartesian product yields 162 combinations, not
200, so the suite was 1962 cases until the cycle dimension was widened. Both fixed before
committing — which is the argument for committing a runnable generator rather than a
document describing one.

## Round 3 — verified

The fix landed and is correct. Independently re-run here, not taken on report:

```
node audit/harness.mjs   → 22 pass, 0 fail
npm test                 → 64 domain tests pass, smoke green
```

The diff is 8 lines in `pieceStatusFor`: if the latest engineering event is dated after the
last dip's `outDT`, the `Accepted` / `→ Engineering` branches run before `cleared`.
`Scrap` and `Return to vendor` keep their unconditional override. Four regression tests
added, covering Hold / Accepted / Scrap after a clear, plus review-then-re-strip-then-clear
staying `Cleared`. Job card `eng` count now reads 1 for a cleared-then-Hold part.

### One edge case remains

The comparison is strict `>`, so a disposition recorded in the **same minute** as the
extraction does not override:

```
extraction 2026-03-01T18:00 + Hold at 18:00  → "Cleared"   ← wrong
extraction 2026-03-01T18:00 + Hold at 18:01  → "→ Engineering"
```

Event datetimes are minute-granular (`datetime-local`, sliced to 16 chars), and pulling a
part and dispositioning it in the same minute is ordinary on a shop floor. A disposition is
always logged after the dip it refers to, so `>=` is the correct comparison and cannot
misfire — the "disposition before a later re-strip" case compares against the *last* dip's
`outDT`, which is unaffected.

Queued as round 4 in `TASK.md`. One character.

### Process note

`RESULTS.tsv` came back with the fix report prepended but the entire stale round 2 body
still below it, including `M3/M4/M14 FAIL` lines that the fix had already resolved and an
old `TOTALS` line. Read literally it contradicted itself. Truncated to the round 3 report.
The brief said overwrite; worth restating next round.

## Round 2 — reviewed

`TOTALS pass=209 fail=61 record=57 threw=35 skipped=0`.

96 non-passing lines. I re-verified every cluster directly against `main` before
believing any of it. **One real defect. The other 95 lines are harness bugs or
outdated expectations.**

### The one real defect — post-clear engineering disposition is invisible

`pieceStatusFor` checks `cleared` before `engEvents.length`, so a disposition recorded
*after* a part cleared is swallowed:

| Scenario | Status shown | Should be |
|---|---|---|
| dip Cleared → Eng Review `Hold` | `Cleared` | `→ Engineering` |
| dip Cleared → Eng Review `Engineering review` | `Cleared` | `→ Engineering` |
| dip Cleared → Eng Review `Accepted` | `Cleared` | `Accepted` (cosmetic — both green) |

`Scrap` and `Return to vendor` already override correctly (round 1's fix). `Hold` does not.

Verified consequences on `main`:

```
cleared-then-Hold  → status "Cleared",       job card eng count 0
restrip-then-Hold  → status "→ Engineering", job card eng count 1
```

So engineering flags a cleared part for review and the board still reads `Cleared`, the
job card shows zero parts at engineering, and no red suggestion is raised. On a shop
floor that is a part walking out with an open review against it.

Cases: **M4, M14** (root), M3 (cosmetic), E7, E10, E11, E26, G20, I26.

### Everything else I probed is correct on `main`

Directly confirmed working, against Haiku's FAIL/THREW claims:

- capacity flag at 13/12 → `Over capacity 13/12`; `free` 0 at 12/12 (F23, F25, F26)
- `loadH` sums closed dips → 11 (F35)
- `nextEventId` → `20260301-0003` (K31)
- full bath excluded as a rescue target → `""` (I7)
- iron-over-limit → `red/dispose` suggestion (I17)
- Load In capacity warnings, including the already-inside case (H22, H24, H25)
- duplicate-disposition warning (H49); awaiting-engineering load block (H15)
- hour and cycle limits still fire for non-cleared parts — `25 h ≥ 24`, 3 cycles → `→ Engineering`

### Harness bugs behind the rest

| Cause | Cases | Detail |
|---|---|---|
| `deriveImmersions` misuse | all 35 of group B | Called `.filter` on the returned object and mis-indexed `records`. The function still returns `{records, open}` — unchanged from round 1, verified. Called correctly, B4 gives `records.length 1, hours 10, open.size 0`. |
| `ev` scoping | B28–B30, D23, F31, F32, H41, H43 | "Cannot access 'ev' before initialization" / "ev is not a function" — a shadowed fixture helper. |
| Fixture ≠ expectation | F23, F25, F26, F35, G13, G16, H15, H22, H24, H25, H49, I17, K31, L5 | Same class as round 1, and round 1's guidance did not prevent it. L5 flipped: round 1 expected 1.5 and got 2.5, round 2 expected 2.5 and got 1.5 — the fixture changed underneath the expectation. |
| Spec outdated vs `main` | F40 | `deriveBaths` now derives from config **and** data by design (commit `079d465`), so a bath seen only in events does appear. Expectation is stale, not a bug. |
| Spec ambiguity (mine) | D15, E16 | D15 returns area objects, not strings; E16 emits `"25 h ≥ 24"`, not the literal `"hours limit"`. |

### Process note

Two rounds, and both times the harness was the dominant source of failures — 35 throws this
round. The case list is not the hard part; the fixtures are. Round 3 removes that variable:
the harness is committed here, already correct, and Haiku only runs it.

## Round 1 — reviewed

Haiku pushed `audit.mjs` to `claude/execute-this-9qmuo9` (no results file). Re-run here.

**Coverage:** 55 of ~300 cases implemented.

**44 reported failures, nearly all harness bugs:**

| Cause | Cases | Detail |
|---|---|---|
| Bath age contamination | F6–F16, F24, G10, H8, I1, I5, I10 | Baths filled `2026-03-01`, `NOW = 2026-04-01`, `maxBathAge: 30` → an extra age flag on nearly every bath. Raising `maxBathAge` made all 13 pass with no code change. |
| Wrong argument order | I14, I15 | `deriveSuggestions(events, nowDT, CONFIG)`; the real signature is `(events, config, nowDT)`. |
| Wrong fixture signature | I13, I17, I22 | `fill(dt, bath, null, {fePpm:150})` against `fill(dt, bath, x = {})` — chemistry silently dropped. |
| Expectation ≠ fixture | G7, L5, L17, E19, E16, F37, B33, D22 | G7 asserted 40% from 6 dips (33% correct); L5 asserted 1.5 from cycles of 2 and 3 (2.5 correct). |

**Real defect found:** `pieceStatusFor` treated *any* historical `Cleared` as current state, so
later dispositions and re-loads were invisible. Cascaded into E7–E11, E20, E25–E27, G20,
H13–H15, I13, I26.

**Fixed on `main`** (`d7090c9`) — `cleared` scoped to the latest dip, `Scrap`/`Return to vendor`
override. Round 2 confirms that fix holds (M1, M2, M5 pass) but shows it stopped one branch short.
