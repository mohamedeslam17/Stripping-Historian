# AUDIT ROUND 2 — corrected harness, full coverage

**READ-ONLY. Do not edit `index.html`. Do not commit. Do not push.** Report only.

Round 1 implemented 55 of ~300 cases and its harness had four bugs that produced
false failures. Fix those first, then run the complete set.

## Step 0 — work against current `main`

The code has moved since round 1. `git fetch origin && git checkout origin/main`.
`idleParts` no longer exists — do **not** copy round 1's `EXPORTS` list. Instead, derive it:
read the DOMAIN block, list every `function <name>` and top-level `const <NAME>` it declares,
and export exactly those. If a name in your list is not defined, the harness throws on load and
every case is lost — verify the harness loads before writing any cases.

## Step 1 — fix these four harness bugs from round 1

1. **Bath age contaminated every bath case.** Round 1 filled baths at `2026-03-01` with
   `NOW = 2026-04-01` — 31 days, past `maxBathAge: 30` — so nearly every bath carried an extra
   "Age" flag and 13 cases failed for that reason alone. Fix: fill baths at `2026-03-25T08:00`
   unless the case is specifically about age. When a case asserts a flag count, assert **which**
   flags are present, not just `.length`.
2. **Argument order.** `deriveSuggestions(events, config, nowDT)`. Round 1 called
   `deriveSuggestions(events, "2026-04-01T06:00", CONFIG)` in I14/I15 and got a throw. Check the
   real signature of every function in the DOMAIN block before calling it.
3. **Fixture signature.** `fill(dt, bath, x = {})` takes **three** args. Round 1 wrote
   `fill(dt, bath, null, {fePpm:150})` in I13/I17/I22 — the chemistry was silently dropped and
   the bath looked healthy. Chemistry belongs on a `chem()` event, not on `fill()`.
4. **Expectations that didn't match the fixture built.** G7 asserted 40% from 6 dips (33% is
   correct), L5 asserted 1.5 from cycles of 2 and 3 (2.5 is correct), L17 asserted 2 cycles from
   3 loads, E19 asserted a 24 h breach from 22 h of dips, E16 matched the literal string
   `"hours limit"` when the code emits `"25 h ≥ 24"`, F37 asserted 1 h against an open dip.
   **Before recording a FAIL, re-read your own fixture and confirm the expectation matches what
   you actually built.** If they disagree, that is a harness bug — fix it and re-run, don't report it.

## Step 2 — run the complete case list

Use the case list from the round 1 task file, groups **A through L, all ~300 cases**. Round 1
stopped at 55. Every ID must appear in the output exactly once. Where a case references a
function that no longer exists on `main`, output `<ID>\tSKIPPED\tfunction removed` — do not
silently drop it.

Add one new group:

## Group M — regressions on the round 1 root cause

Round 1's real finding was that `pieceStatusFor` treated **any historical** `Cleared` result as
the piece's current state, so a later disposition or a re-load was invisible. `main` now scopes
`cleared` to the latest dip and lets `Scrap`/`Return to vendor` override. Verify that holds:

| ID | Setup | Ask | Expected |
|---|---|---|---|
| M1 | dip Cleared → Engineering Review `Scrap` | status.s | `"Scrap"` |
| M2 | dip Cleared → Engineering Review `Return to vendor` | status.s | `"Returned"` |
| M3 | dip Cleared → Engineering Review `Accepted` | status.s | `"Accepted"` |
| M4 | dip Cleared → Engineering Review `Hold` | status.s | `"→ Engineering"` |
| M5 | dip Cleared → loaded again (open) | status.s | `"In bath"` |
| M6 | M5 | inBath | `true` |
| M7 | dip Cleared → re-loaded → extracted Re-strip | status.s | `"Awaiting re-strip"` |
| M8 | dip Re-strip → dip Cleared | status.s | `"Cleared"` |
| M9 | dip Cleared, wax failure on that same extraction | status.s | RECORD |
| M10 | M9 | needsRemask | RECORD |
| M11 | Scrap disposition, then loaded again | status.s | RECORD |
| M12 | orphan extraction (never loaded) + one real dip | cycles | RECORD |
| M13 | M1 | does a red warning fire on a new Load In of that serial? | `true` |
| M14 | M4 | job card `eng` count | `1` |
| M15 | dip Cleared → `Scrap` | is a red suggestion raised? | RECORD |


# THE CASES

## A. parseSerials — serial text → list

| ID | Input | Kind | Expected |
|---|---|---|---|
| A1 | `"7261-01..06"` | EXPECT | length 6, first `7261-01`, last `7261-06` |
| A2 | `"7261-01..7261-06"` | EXPECT | length 6 |
| A3 | `"7261-01, 7261-02"` | EXPECT | length 2 |
| A4 | `"7261-01 7261-02"` (space) | EXPECT | length 2 |
| A5 | `"7261-01;7261-02"` (semicolon) | EXPECT | length 2 |
| A6 | `"7261-01\n7261-02"` (newline) | EXPECT | length 2 |
| A7 | `""` | EXPECT | length 0 |
| A8 | `null` | EXPECT | length 0 |
| A9 | `"7261-01, 7261-01"` (dupe) | EXPECT | length 1 |
| A10 | `"7261-01..01"` | EXPECT | length 1 |
| A11 | `"7261-06..01"` (reversed) | RECORD | the array |
| A12 | `"7261-001..003"` (width 3) | EXPECT | `7261-001`,`7261-002`,`7261-003` |
| A13 | `"7261-1..3"` (width 1) | EXPECT | `7261-1`,`7261-2`,`7261-3` |
| A14 | `"7261-01..20000"` (huge range) | RECORD | length |
| A15 | `"ABC..XYZ"` (no digits) | RECORD | the array |
| A16 | `"..05"` | RECORD | the array |
| A17 | `"7261-01.."` | RECORD | the array |
| A18 | `'"7261-01"'` (quoted) | EXPECT | `["7261-01"]` |
| A19 | `"  7261-01  "` (padding) | EXPECT | `["7261-01"]` |
| A20 | `"7261-01..03, 7262-01"` | EXPECT | length 4 |
| A21 | `"7261-01..03, 7261-02"` (overlap) | EXPECT | length 3 |
| A22 | `"A1B2..B5"` | RECORD | the array |
| A23 | `"7261-01..0006"` (width mismatch) | RECORD | the array |
| A24 | `"0..3"` (bare numbers) | RECORD | the array |
| A25 | `"7261-98..102"` (rollover past width) | RECORD | the array |

## B. deriveImmersions — load/extract pairing

Unless stated, use bath `B1` and `NOW`.

| ID | Setup | Ask | Kind | Expected |
|---|---|---|---|---|
| B1 | load d1 [S1] | records.length | EXPECT | 1 |
| B2 | load d1 [S1] | records[0].open | EXPECT | true |
| B3 | load d1 [S1] | open.size | EXPECT | 1 |
| B4 | load `2026-03-01T08:00` [S1] + extract `2026-03-01T18:00` [S1/Cleared] | records[0].hours | EXPECT | 10 |
| B5 | same as B4 | records[0].open | EXPECT | false |
| B6 | same as B4 | open.size | EXPECT | 0 |
| B7 | same as B4 | records[0].result | EXPECT | `"Cleared"` |
| B8 | load [S1,S2,S3] then extract only [S2] | open.size | EXPECT | 2 |
| B9 | B8 | the serials still open | EXPECT | `["S1","S3"]` |
| B10 | B8 | records.length | EXPECT | 3 |
| B11 | load [S1] → extract [S1/Re-strip] → load [S1] | records.length | EXPECT | 2 |
| B12 | B11 | records[1].cycle | EXPECT | 2 |
| B13 | B11 → extract → load again (3rd) | records[2].cycle | EXPECT | 3 |
| B14 | extract [S1] with NO prior load | records[0].anomaly | EXPECT | `"extracted but was not in bath"` |
| B15 | B14 | records[0].inDT | EXPECT | null |
| B16 | B14 | records[0].cycle | RECORD | value |
| B17 | load [S1] then load [S1] again (no extract) | records[1].anomaly | EXPECT | contains `"was already in"` |
| B18 | B17 | records[0].anomaly | EXPECT | contains `"no extraction logged"` |
| B19 | B17 | records[1].cycle | RECORD | value |
| B20 | B17 | open.size | EXPECT | 1 |
| B21 | load `T08:00` + extract `T06:00` (out BEFORE in) | records[0].hours | RECORD | value |
| B22 | load d1, now = d1 + 5h, still open | records[0].elapsedH | EXPECT | 5 |
| B23 | load d1, extract d1 (identical timestamp) | records[0].hours | EXPECT | 0 |
| B24 | load spanning 3 days (72h) | records[0].hours | EXPECT | 72 |
| B25 | events supplied out of chronological order | pairing still correct (hours) | EXPECT | correct pairing |
| B26 | two loads same serial different baths, one extract | records[1].bath | RECORD | value |
| B27 | load [S1] bath B1, extract [S1] from bath **B2** | records[0].outDT set? | RECORD | value |
| B28 | legacy `Immersion` event (serial, timeIn `08:00`, timeOut `16:00`) | records[0].hours | EXPECT | 8 |
| B29 | legacy Immersion timeIn `22:00` timeOut `02:00` (overnight) | records[0].hours | EXPECT | 4 |
| B30 | legacy Immersion with no serial | records.length | EXPECT | 0 |
| B31 | load with `serials: []` | records.length | EXPECT | 0 |
| B32 | load with `serials` undefined | records.length | EXPECT | 0 |
| B33 | extract with `items: []` | records.length | EXPECT | 0 |
| B34 | load [S1], extract item with no `result` | records[0].result | RECORD | value |
| B35 | load carries jc/component | records[0].jc, .component | EXPECT | propagated |

## C. bathContents

| ID | Setup | Ask | Kind | Expected |
|---|---|---|---|---|
| C1 | load B1 [S1,S2] | bathContents(B1).length | EXPECT | 2 |
| C2 | C1 | bathContents(B2).length | EXPECT | 0 |
| C3 | C1 | bathContents(no bath arg).length | EXPECT | 2 |
| C4 | load B1 [S1], load B2 [S2] | bathContents(B1) serials | EXPECT | `["S1"]` |
| C5 | load B1 [S1,S2], extract [S1] | bathContents(B1) serials | EXPECT | `["S2"]` |
| C6 | loads at different times | contents sorted by inDT ascending | EXPECT | ascending |
| C7 | load then dispose bath (no extraction) | bathContents(B1).length | RECORD | value |
| C8 | load with future datetime (after NOW) | bathContents(B1).length | RECORD | value |

## D. Wax failure & re-masking

Areas used: `"Cooling holes"`, `"Part body"`.

| ID | Setup | Ask | Kind | Expected |
|---|---|---|---|---|
| D1 | extract item wax `["Cooling holes"]` | waxAreasOf(item) | EXPECT | `["Cooling holes"]` |
| D2 | item wax `[{area:"Part body"}]` (old shape) | waxAreasOf | EXPECT | `["Part body"]` |
| D3 | item `{waxFailure:"Partial mask loss"}` (legacy) | waxAreasOf | EXPECT | length 1 |
| D4 | item `{waxFailure:"None"}` | waxAreasOf | EXPECT | `[]` |
| D5 | item with no wax key | waxAreasOf | EXPECT | `[]` |
| D6 | item wax `[]` | waxAreasOf | EXPECT | `[]` |
| D7 | item wax `["A","B"]` | waxAreasOf length | EXPECT | 2 |
| D8 | item wax `[null,"A"]` | waxAreasOf | EXPECT | `["A"]` |
| D9 | load+extract S1 wax `["Cooling holes"]` | waxFailures(S1).length | EXPECT | 1 |
| D10 | D9 | unresolvedWaxAreas(S1).length | EXPECT | 1 |
| D11 | D9 + standalone Re-Masking `["Cooling holes"]` later | unresolvedWaxAreas(S1).length | EXPECT | 0 |
| D12 | D9 + Re-Masking with `areas:null` (covers all) later | unresolvedWaxAreas(S1).length | EXPECT | 0 |
| D13 | D9 + Re-Masking `["Part body"]` (wrong area) later | unresolvedWaxAreas(S1).length | EXPECT | 1 |
| D14 | extract wax `["Cooling holes","Part body"]`, re-mask only `["Cooling holes"]` | unresolvedWaxAreas length | EXPECT | 1 |
| D15 | D14 | the remaining area | EXPECT | `["Part body"]` |
| D16 | D14 then re-mask `["Part body"]` too | unresolvedWaxAreas length | EXPECT | 0 |
| D17 | re-mask dated **before** the failure | unresolvedWaxAreas length | EXPECT | 1 (does not resolve) |
| D18 | re-mask at the **exact same** timestamp as the failure | unresolvedWaxAreas length | RECORD | value |
| D19 | wax fail → re-mask → wax fail again (same area) | unresolvedWaxAreas length | EXPECT | 1 |
| D20 | re-mask recorded on the next **Load In** via `remask:[{serial:"S1",areas:["Cooling holes"]}]` | unresolvedWaxAreas length | EXPECT | 0 |
| D21 | Load In `remask:[{serial:"S1",areas:[]}]` (empty = all) | unresolvedWaxAreas length | EXPECT | 0 |
| D22 | Load In `remask` for a **different** serial | unresolvedWaxAreas(S1) length | EXPECT | 1 |
| D23 | standalone legacy `Wax Failure` event | waxFailures(S1).length | EXPECT | 1 |
| D24 | no wax anywhere | unresolvedWaxAreas(S1) | EXPECT | `[]` |
| D25 | D14 | lastUnresolvedWax(S1).area | RECORD | value |
| D26 | two failures different dates same area | waxFailures length | EXPECT | 2 |
| D27 | D26 | unresolvedWaxAreas length (latest only) | EXPECT | 1 |
| D28 | waxFailures sorted ascending by datetime | order | EXPECT | ascending |
| D29 | re-mask on Load In **and** standalone for same area | unresolvedWaxAreas length | EXPECT | 0 |
| D30 | extract wax on S1, ask unresolvedWaxAreas(**S2**) | length | EXPECT | 0 |

## E. Piece status & derivePieces

| ID | Setup | Ask | Kind | Expected |
|---|---|---|---|---|
| E1 | load [S1], no extract | status.s | EXPECT | `"In bath"` |
| E2 | load+extract Cleared | status.s | EXPECT | `"Cleared"` |
| E3 | load+extract Re-strip | status.s | EXPECT | `"Awaiting re-strip"` |
| E4 | load+extract Hold | status.s | RECORD | value |
| E5 | extract Re-strip **with** unresolved wax | status.s | EXPECT | `"Needs re-mask"` |
| E6 | E5 after re-masking | status.s | EXPECT | `"Awaiting re-strip"` |
| E7 | Engineering Review `Accepted` | status.s | EXPECT | `"Accepted"` |
| E8 | Engineering Review `Scrap` | status.s | EXPECT | `"Scrap"` |
| E9 | Engineering Review `Return to vendor` | status.s | EXPECT | `"Returned"` |
| E10 | Engineering Review `Hold` | status.s | EXPECT | `"→ Engineering"` |
| E11 | Engineering Review `Engineering review` | status.s | EXPECT | `"→ Engineering"` |
| E12 | 3 completed cycles (maxCycles 3), all Re-strip | status.s | EXPECT | `"→ Engineering"` |
| E13 | E12 | status.reason | EXPECT | mentions `3 cycles ≥ 3` |
| E14 | 2 cycles only | status.s | EXPECT | `"Awaiting re-strip"` |
| E15 | one closed dip of 25 h (maxHours 24) | status.s | EXPECT | `"→ Engineering"` |
| E16 | E15 | status.reason | EXPECT | mentions hours limit |
| E17 | one closed dip of exactly 24 h | status.s | EXPECT | `"→ Engineering"` (>= is the limit) |
| E18 | one closed dip of 23.9 h | status.s | EXPECT | `"Awaiting re-strip"` |
| E19 | two dips 12 h + 13 h = 25 h total | status.s | EXPECT | `"→ Engineering"` |
| E20 | **cleared in cycle 1, then loaded again** (now in bath) | status.s | RECORD | value |
| E21 | E20 | inBath | RECORD | value |
| E22 | part currently in bath 30 h (over maxHours), still open | status.s | RECORD | value |
| E23 | E22 | status.totalH | RECORD | value |
| E24 | E22 | status.hours | RECORD | value |
| E25 | scrapped, then loaded again | status.s | RECORD | value |
| E26 | 2 eng reviews, last = Accepted, first = Hold | status.s | EXPECT | `"Accepted"` |
| E27 | 2 eng reviews, last = Hold, first = Accepted | status.s | RECORD | value |
| E28 | serial appearing ONLY on an Engineering Review (never dipped) | row exists? status.s | RECORD | value |
| E29 | derivePieces | rows sorted by jc then serial | EXPECT | sorted |
| E30 | first dip Cleared | firstPass | EXPECT | true |
| E31 | first dip Re-strip, second Cleared | firstPass | EXPECT | false |
| E32 | 2 re-strips | reStrips | EXPECT | 2 |
| E33 | one dip with 2 wax areas | `wax` count | EXPECT | 2 |
| E34 | in bath B2 | currentBath | EXPECT | `"B2"` |
| E35 | out of bath, last dip in B2 | lastBath | EXPECT | `"B2"` |
| E36 | out of bath | currentBath | EXPECT | `""` |
| E37 | jc only on the load event | row.jc | EXPECT | propagated |
| E38 | jc differs between cycle 1 and cycle 2 | row.jc | RECORD | value |
| E39 | no events at all | derivePieces length | EXPECT | 0 |
| E40 | `cycles` for a part with 1 load + 1 unmatched extract | value | RECORD | value |

## F. deriveBath — charge window, flags, capacity

| ID | Setup | Ask | Kind | Expected |
|---|---|---|---|---|
| F1 | fill only | active | EXPECT | true |
| F2 | no fill | active | EXPECT | false |
| F3 | fill then dispose | active | EXPECT | false |
| F4 | fill → dispose → fill | active | EXPECT | true |
| F5 | F4 | disposal | EXPECT | null (new charge) |
| F6 | fill, chem fePpm 150 (feMax 100) | flags | EXPECT | 1 iron flag |
| F7 | fill, chem fePpm exactly 100 | flags | EXPECT | none (`>` not `>=`) |
| F8 | fill, chem hclPct 10 (band 16–22) | flags | EXPECT | HCl flag |
| F9 | fill, chem hclPct 25 | flags | EXPECT | HCl flag |
| F10 | fill, chem hclPct exactly 16 | flags | EXPECT | none |
| F11 | fill, chem hclPct exactly 22 | flags | EXPECT | none |
| F12 | fill, chem temp 95 (90±3) | flags | EXPECT | temp flag |
| F13 | fill, chem temp exactly 93 | flags | EXPECT | none |
| F14 | fill, chem temp 86 | flags | EXPECT | temp flag |
| F15 | two chems, older bad, newer good | flags | EXPECT | none (last wins) |
| F16 | two chems, older good, newer bad | flags | EXPECT | flagged |
| F17 | chem dated **before** the fill | lastChem | EXPECT | null (outside charge) |
| F18 | chem dated **after** NOW (future) | lastChem | RECORD | value |
| F19 | fill 40 days ago (maxBathAge 30) | flags | EXPECT | age flag |
| F20 | fill exactly 30 days ago | flags | EXPECT | age flag (`>=`) |
| F21 | fill 29 days ago | flags | EXPECT | no age flag |
| F22 | disposed bath 40 days old | age flag present? | EXPECT | no (only when active) |
| F23 | 13 parts loaded, capacity 12 | flags | EXPECT | over-capacity flag |
| F24 | exactly 12 parts, capacity 12 | flags | EXPECT | none |
| F25 | F24 | `free` | EXPECT | 0 |
| F26 | 5 parts, capacity 12 | `free` | EXPECT | 7 |
| F27 | capacity 0 / unset | `free` | EXPECT | null |
| F28 | 13 parts but bath NOT active (no fill) | over-capacity flag? | RECORD | value |
| F29 | disposed bath still holding 2 parts | flags | EXPECT | "still recorded as inside a disposed bath" |
| F30 | fill, 2 HCl top-ups of 20 L | hclAdded | RECORD | value (does the fill's own 100 L count?) |
| F31 | fill, water top-up 50 L | waterAdded | RECORD | value |
| F32 | top-up dated before the fill | hclAdded | EXPECT | excluded |
| F33 | 3 distinct serials dipped | `parts` | EXPECT | 3 |
| F34 | same serial dipped twice | `parts` | EXPECT | 1 |
| F35 | 2 closed dips 5 h + 6 h | loadH | EXPECT | 11 |
| F36 | 1 open dip, 4 h elapsed | loadH | EXPECT | 4 |
| F37 | dips from a PREVIOUS charge (before last fill) | recs excluded? loadH | EXPECT | excluded |
| F38 | chem on a bath with no fill at all | lastChem | RECORD | value |
| F39 | deriveBaths | length | EXPECT | 3 (one per configured bath) |
| F40 | bath in events but NOT in config.baths | appears in deriveBaths? | EXPECT | no |

## G. KPIs & job cards

| ID | Setup | Ask | Kind | Expected |
|---|---|---|---|---|
| G1 | 4 pieces, 2 cleared | kpis.cleared | EXPECT | 2 |
| G2 | G1 | kpis.total | EXPECT | 4 |
| G3 | 4 pieces, 1 first-pass | kpis.fpy | EXPECT | 25 |
| G4 | no pieces | kpis.fpy | EXPECT | 0 (no divide-by-zero) |
| G5 | no events | deriveKpis | EXPECT | does not throw |
| G6 | 3 parts in bath | kpis.inBath | EXPECT | 3 |
| G7 | 5 dips, 2 re-strips | kpis.reStripRate | EXPECT | 40 |
| G8 | one dip with **2** wax areas | kpis.wax | RECORD | value (areas or dips?) |
| G9 | G8 | derivePieces row `wax` | RECORD | value (compare with G8) |
| G10 | 2 active baths, 1 flagged | kpis.bathsOver | EXPECT | 1 |
| G11 | G10 | kpis.activeBaths | EXPECT | 2 |
| G12 | disposed bath with a flag | counted in bathsOver? | EXPECT | no |
| G13 | 2 cleared pieces, 2 and 4 cycles | kpis.avgCycles | EXPECT | 3 |
| G14 | no cleared pieces | kpis.avgCycles | EXPECT | 0 |
| G15 | pieces awaiting re-strip | kpis.awaiting | EXPECT | correct count |
| G16 | jobcards: 2 pieces same jc, 1 first-pass | fpy | EXPECT | 50 |
| G17 | piece with NO jc | job card key | EXPECT | `"(none)"` |
| G18 | job cards sorted by jc | order | EXPECT | sorted |
| G19 | 3 jcs | deriveJobCards length | EXPECT | 3 |
| G20 | jobcard `eng` count with 1 → Engineering piece | value | EXPECT | 1 |

## H. eventWarnings — the guidance layer

Each case: build the prior events, then call `eventWarnings(draft, events, CONFIG, NOW)`.
Report **the number of warnings and their levels**, e.g. `["red","amber"]`, unless stated.

| ID | Prior state | Draft | Kind | Expected |
|---|---|---|---|---|
| H1 | fill B1 | Chemistry Check fePpm 150 | EXPECT | a `red` warning |
| H2 | fill B1 | Chemistry Check fePpm 50 | EXPECT | no warning |
| H3 | fill B1 | Chemistry Check hclPct 10 | EXPECT | an `amber` |
| H4 | fill B1 | Chemistry Check temp 99 | EXPECT | an `amber` |
| H5 | fill+dispose B1 | Chemistry Check on B1 | EXPECT | amber "inactive bath" |
| H6 | nothing | Chemistry Check on B1 | EXPECT | amber "no fill logged" |
| H7 | fill B1 | Chemistry Check all in band | EXPECT | 0 warnings |
| H8 | fill B1 | Load In [S1] | EXPECT | 0 warnings |
| H9 | nothing | Load In [S1] | EXPECT | amber "no fill logged" |
| H10 | fill+dispose B1 | Load In [S1] | EXPECT | red "fill it before loading" |
| H11 | fill B1, S1 already in B1 | Load In [S1] | EXPECT | amber "already in bath" |
| H12 | fill B1, S1 Cleared | Load In [S1] | EXPECT | amber "already Cleared" |
| H13 | fill B1, S1 Scrap | Load In [S1] | EXPECT | a `red` |
| H14 | fill B1, S1 Returned | Load In [S1] | EXPECT | a `red` |
| H15 | fill B1, S1 → Engineering | Load In [S1] | EXPECT | red "disposition it" |
| H16 | fill B1, S1 has 3 cycles (max 3) | Load In [S1] | EXPECT | red "would be cycle 4" |
| H17 | fill B1, S1 has 2 cycles | Load In [S1] | EXPECT | no cycle warning |
| H18 | fill B1, S1 unresolved wax | Load In [S1] | EXPECT | red "re-mask it before re-loading" |
| H19 | H18 | Load In [S1] **with** `remask:[{serial:"S1",areas:["Cooling holes"]}]` covering it | EXPECT | no wax warning |
| H20 | S1 has 2 failed areas | Load In with remask covering only 1 | EXPECT | red, names the remaining area |
| H21 | H20 | Load In with remask `areas:[]` (all) | EXPECT | no wax warning |
| H22 | fill B1, 12 parts in B1 (capacity 12) | Load In [S13] | EXPECT | red over-capacity |
| H23 | fill B1, 11 parts | Load In [S12] | EXPECT | no capacity warning |
| H24 | fill B1, 12 parts incl. S5 | Load In [S5] (already inside) | EXPECT | no capacity warning |
| H25 | fill B1, 10 parts | Load In [S11,S12,S13] (would be 13) | EXPECT | red over-capacity |
| H26 | S1 last event 2026-03-10 | Load In [S1] dated 2026-03-01 | EXPECT | amber "dated before" |
| H27 | S1 last event 2026-03-01 | Load In [S1] dated 2026-03-10 | EXPECT | no back-date warning |
| H28 | bath flagged (iron high) | Load In on it | EXPECT | amber carrying the flag |
| H29 | fill B1, S1 in B1 | Extraction [S1] normal | EXPECT | 0 warnings |
| H30 | fill B1, S1 NOT in B1 | Extraction [S1] | EXPECT | amber "not currently in bath" |
| H31 | S1 loaded 2026-03-10T08:00 | Extraction dated 2026-03-09 | EXPECT | red "before it went in" |
| H32 | fill+dispose B1 | Extraction on B1 | EXPECT | red "is disposed" |
| H33 | fill B1, S1+S2 in B1 | Extraction [S1] only | EXPECT | 0 warnings |
| H34 | fill B1, 2 parts inside | Bath Disposal B1 | EXPECT | red "still holds 2 part(s)" |
| H35 | fill B1, empty | Bath Disposal B1 | EXPECT | 0 warnings |
| H36 | no fill | Bath Disposal B1 | EXPECT | amber "no charge to dispose" |
| H37 | already disposed | Bath Disposal B1 | EXPECT | amber "already disposed" |
| H38 | active bath | Bath Fill B1 | EXPECT | amber "already active" |
| H39 | disposed bath | Bath Fill B1 | EXPECT | 0 warnings |
| H40 | never filled | Bath Fill B1 | EXPECT | 0 warnings |
| H41 | disposed B1 | HCl Top-Up B1 | EXPECT | a `red` |
| H42 | no fill | HCl Top-Up B1 | EXPECT | amber "no fill logged" |
| H43 | active B1 | Water Top-Up B1 | EXPECT | 0 warnings |
| H44 | S1 currently in a bath | Re-Masking S1 | EXPECT | red "extract it before re-masking" |
| H45 | S1 out, no wax failure | Re-Masking S1 | EXPECT | amber "may be unnecessary" |
| H46 | S1 out, unresolved wax | Re-Masking S1 | EXPECT | 0 warnings |
| H47 | S1 Cleared | Engineering Review S1 | EXPECT | amber "already cleared" |
| H48 | S1 in bath | Engineering Review S1 | EXPECT | amber "still in bath" |
| H49 | S1 already has a disposition | Engineering Review S1 (new, `id` null) | EXPECT | amber "already has a disposition" |
| H50 | H49 but the draft **is** that existing event (same `id`) | | EXPECT | no duplicate-disposition warning |
| H51 | editing an existing Load In (draft `id` matches an event) | | EXPECT | the event does not warn against itself |
| H52 | Load In with 3 serials, all problematic | | RECORD | count of warnings |
| H53 | draft type with no rules (`Water Top-Up`, no bath) | | EXPECT | 0 warnings |
| H54 | Load In with no bath set | | EXPECT | no bath warnings, does not throw |
| H55 | Extraction with no bath set | | EXPECT | does not throw |

## I. Suggestions & rescue baths

| ID | Setup | Ask | Kind | Expected |
|---|---|---|---|---|
| I1 | 2 healthy baths, one iron 20 one iron 60 | healthyBaths[0].bath | EXPECT | the iron-20 one |
| I2 | 1 healthy 1 flagged | healthyBaths.length | EXPECT | 1 |
| I3 | disposed bath | in healthyBaths? | EXPECT | no |
| I4 | bath never filled | in healthyBaths? | EXPECT | no |
| I5 | healthy B1,B2; exclude B1 | suggestRescueBath | EXPECT | `"B2"` |
| I6 | only B1 healthy; exclude B1 | suggestRescueBath | EXPECT | `""` |
| I7 | B2 healthy but FULL (12/12) | suggestRescueBath excluding B1 | EXPECT | `""` (full not offered) |
| I8 | no baths healthy | suggestRescueBath | EXPECT | `""` |
| I9 | part awaiting re-strip | a `reload` suggestion exists | EXPECT | yes |
| I10 | I9 | its `action.bath` | EXPECT | a healthy bath |
| I11 | 2 parts same jc awaiting | grouped into 1 suggestion? | EXPECT | 1 |
| I12 | 2 parts different jc | suggestions count | EXPECT | 2 |
| I13 | part needing re-mask | suggestion detail mentions re-mask | EXPECT | yes |
| I14 | part over hours in bath (30 h, max 24) | red `extract` suggestion | EXPECT | yes |
| I15 | I14 | `action.preselect` contains the serial | EXPECT | yes |
| I16 | part in bath 10 h | extract suggestion? | EXPECT | no |
| I17 | bath iron over limit | red `dispose` suggestion | EXPECT | yes |
| I18 | bath HCl below min | amber `topup-hcl` suggestion | EXPECT | yes |
| I19 | bath both iron-over AND hcl-low | which suggestion(s)? | RECORD | value |
| I20 | bath 40 days old | amber dispose suggestion | EXPECT | yes |
| I21 | no chem for 5 days | info "no chemistry check" | EXPECT | yes |
| I22 | chem logged today | that info suggestion absent | EXPECT | absent |
| I23 | active bath, filled, NO chem ever | does it throw? | EXPECT | no throw |
| I24 | disposed bath still holding parts | red suggestion | EXPECT | yes |
| I25 | disposed bath, empty | any suggestion? | EXPECT | none |
| I26 | piece → Engineering | red engineering suggestion | EXPECT | yes |
| I27 | mixed levels | output sorted red → amber → info | EXPECT | sorted |
| I28 | no events | deriveSuggestions | EXPECT | `[]`, no throw |
| I29 | part awaiting, NO healthy bath | suggestion detail | EXPECT | "no healthy bath available" |
| I30 | 20 parts awaiting across 3 jcs | suggestions count | RECORD | value |

## J. idleParts, lookupSerial, deriveDefects

| ID | Setup | Ask | Kind | Expected |
|---|---|---|---|---|
| J1 | 1 awaiting re-strip, 1 in bath, 1 cleared | idleParts length | EXPECT | 1 |
| J2 | 1 awaiting + 1 needs-remask | idleParts length | EXPECT | 2 |
| J3 | two idle, different out-times | order | EXPECT | newest-out first |
| J4 | no events | idleParts | EXPECT | `[]` |
| J5 | S1 loaded with jc `JC1` | lookupSerial(S1).jc | EXPECT | `"JC1"` |
| J6 | S1 in two loads, jc changed | lookupSerial(S1).jc | EXPECT | the later one |
| J7 | unknown serial | lookupSerial | EXPECT | `{jc:"",component:""}` |
| J8 | S1 only on an Engineering Review with a jc | lookupSerial(S1).jc | EXPECT | `"JC1"` |
| J9 | Engineering Review | deriveDefects kind | EXPECT | `"Eng review"` |
| J10 | standalone Re-Masking event | a `Re-mask` defect row | EXPECT | yes |
| J11 | **re-mask recorded on a Load In** (`remask:[…]`) | a `Re-mask` defect row | RECORD | value |
| J12 | extraction with wax | `Wax failure` row | EXPECT | yes |
| J13 | extraction result Re-strip | `Re-strip` row | EXPECT | yes |
| J14 | extraction wax AND re-strip | rows for that item | EXPECT | 2 |
| J15 | deriveDefects | sorted newest first | EXPECT | descending |
| J16 | no events | deriveDefects | EXPECT | `[]` |

## K. Helpers & formatting

| ID | Call | Kind | Expected |
|---|---|---|---|
| K1 | `round(1.234, 2)` | EXPECT | 1.23 |
| K2 | `round(1.235, 2)` | RECORD | value |
| K3 | `round(2.5, 0)` | RECORD | value |
| K4 | `round(-1.234, 2)` | RECORD | value |
| K5 | `num("")` | EXPECT | null |
| K6 | `num(null)` | EXPECT | null |
| K7 | `num("abc")` | EXPECT | null |
| K8 | `num("0")` | EXPECT | 0 |
| K9 | `num(0)` | EXPECT | 0 |
| K10 | `num("12.5")` | EXPECT | 12.5 |
| K11 | `num(" ")` | RECORD | value |
| K12 | `num(Infinity)` | EXPECT | null |
| K13 | `fmtNum(1.239)` | EXPECT | `"1.24"` |
| K14 | `fmtNum("")` | EXPECT | `""` |
| K15 | `hrsBetween("08:00","16:00")` | EXPECT | 8 |
| K16 | `hrsBetween("22:00","02:00")` | EXPECT | 4 |
| K17 | `hrsBetween("08:00","08:00")` | RECORD | value |
| K18 | `hrsBetween(null,"08:00")` | EXPECT | 0 |
| K19 | `hoursBetweenDT("2026-03-01T08:00","2026-03-01T18:00")` | EXPECT | 10 |
| K20 | `hoursBetweenDT("2026-03-01T18:00","2026-03-01T08:00")` (negative) | EXPECT | 0 |
| K21 | `hoursBetweenDT(null,x)` | EXPECT | 0 |
| K22 | `daysBetween("2026-03-01","2026-03-31")` | EXPECT | 30 |
| K23 | `daysBetween(x,null)` | EXPECT | `""` |
| K24 | `daysBetween` across a DST boundary (Mar 29 → Mar 30, Europe) | RECORD | value |
| K25 | `fmtDate("2026-03-05")` | EXPECT | `"05 Mar 26"` |
| K26 | `fmtDT("2026-03-05T14:30")` | EXPECT | `"05 Mar 26 14:30"` |
| K27 | `fmtDate("")` | EXPECT | `""` |
| K28 | `byDate` on two events same datetime, different eventId | EXPECT | tie-broken by eventId |
| K29 | `byDate` with a missing datetime | EXPECT | does not throw |
| K30 | `nextEventId("2026-03-01", [])` | EXPECT | `"20260301-0001"` |
| K31 | `nextEventId` with 2 existing same-day events | EXPECT | `"20260301-0003"` |
| K32 | `nextEventId` with 2 same-day events where the **middle one was deleted** (ids 0001, 0003 exist) | RECORD | value — does it collide? |
| K33 | `nextEventId` counting events from OTHER days | EXPECT | not counted |
| K34 | `eventsForSerial` returns loads, extractions and serial-events | EXPECT | all three |
| K35 | `eventsForSerial` sorted ascending | EXPECT | ascending |
| K36 | `eventsForSerial` for an unknown serial | EXPECT | `[]` |
| K37 | `TYPES` has all 10 event types | EXPECT | 10 keys |
| K38 | `TYPES["Load In"].custom` | EXPECT | `"load"` |
| K39 | every key in `TYPE_PILL` maps to a `p-*` class | EXPECT | all match |
| K40 | every `TYPES` key (except hidden) has a `TYPE_PILL` entry | RECORD | any missing |

## L. Cross-cutting scenarios (full shop-floor flows)

Build the whole flow, then report the asked value.

| ID | Flow | Ask | Kind | Expected |
|---|---|---|---|---|
| L1 | fill B1 → load 6 parts → extract 3 Cleared → extract 3 Re-strip | kpis.fpy | EXPECT | 50 |
| L2 | L1 | bathContents(B1).length | EXPECT | 0 |
| L3 | L1 | idleParts length | EXPECT | 3 |
| L4 | L1 → re-load the 3 → extract all Cleared | kpis.cleared | EXPECT | 6 |
| L5 | L4 | avgCycles | EXPECT | 1.5 |
| L6 | part fails wax → re-loaded WITHOUT re-mask | eventWarnings level on that load | EXPECT | red |
| L7 | part fails wax → re-masked on the load → extracted Cleared | final status.s | EXPECT | `"Cleared"` |
| L8 | part cycles 4 times (max 3) | final status.s | EXPECT | `"→ Engineering"` |
| L9 | L8 → Engineering Review Accepted | status.s | EXPECT | `"Accepted"` |
| L10 | bath filled → 30 days pass → chem iron 150 | suggestions levels | RECORD | value |
| L11 | fill → load → dispose bath without extracting | deriveBath flags | EXPECT | "still recorded inside a disposed bath" |
| L12 | L11 | suggestions | EXPECT | red extract suggestion |
| L13 | L11 | is the part still in `idleParts`? | RECORD | value |
| L14 | L11 | piece status.s | RECORD | value |
| L15 | fill B1 → load 12 (full) → part elsewhere needs rescue | suggestion `action.bath` | EXPECT | not B1 |
| L16 | 2 baths, parts in both, one disposed | kpis.inBath | RECORD | value |
| L17 | load → extract → load → extract, spanning a month | piece cycles / total hours | EXPECT | 2 cycles, hours summed |
| L18 | same serial in two baths simultaneously (bad data) | derivePieces does not throw | EXPECT | no throw |
| L19 | extraction listing a serial never loaded | derivePieces does not throw | EXPECT | no throw |
| L20 | events with duplicate `id` values | deriveKpis does not throw | EXPECT | no throw |
| L21 | event with `datetime` undefined | deriveImmersions does not throw | EXPECT | no throw |
| L22 | 500 loads × 5 serials | deriveKpis wall time | RECORD | milliseconds |
| L23 | L22 | deriveSuggestions wall time | RECORD | milliseconds |
| L24 | full example dataset (Settings → Load example data, if extractable) | any function throwing | RECORD | value |

---


---

# HOW TO REPORT

Write your results to **`audit/RESULTS.tsv`** in this repo. That file, and nothing else.

Format — one line per case ID, tab-separated, no header, no prose:

```
A1	PASS
A2	FAIL	expected 6, got 1
A3	RECORD	"Cleared"
A4	THREW	Cannot read properties of undefined (reading 'datetime')
A5	SKIPPED	function removed on main
```

Last line of the file:

```
TOTALS	pass=<n>	fail=<n>	record=<n>	threw=<n>	skipped=<n>
```

Then:

```bash
git add audit/RESULTS.tsv
git commit -m "Audit round 2 results"
git push -u origin claude/cloudflare-pages-hosting-tajgyw
```

## Rules

- **Write `audit/RESULTS.tsv` only.** Do not touch `index.html`, `TASK.md`, `NOTES.md`,
  the tests, or anything else. Do not fix what you find — reporting it is the whole job.
- Keep your harness in `/tmp/audit2.mjs`. It must not be committed.
- Every case ID in the list above appears in `RESULTS.tsv` exactly once — groups A–M.
  Do not collapse ranges ("A1-A10 PASS"), do not omit passing cases, do not stop early
  because a run is going well.
- Do not guess a result for a case you did not run. Mark it `SKIPPED` with a reason.
- `RECORD` values verbatim — what the code returned, not rounded or reworded.
- Before writing a `FAIL`, re-read your own fixture and confirm the expectation matches
  what you actually built. A mismatch there is a harness bug: fix it and re-run.
