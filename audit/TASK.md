# TASK — Round 5: run the 2000-case suite and report

Round 4 is done (the reviewer made the one-character fix; harness 22/0, `npm test` 65 green).

`audit/cases.mjs` generates and runs **2000 cases**. It is reviewer-authored and currently
passes 2000/0 on this branch. Your job is to run it, and report — **not** to fix.

## Run

```bash
node audit/cases.mjs            # all 2000, TSV to stdout
node audit/cases.mjs --fails    # only the non-PASS lines
```

Deterministic: case N is the same input on every run and every machine, so a change in the
output is a real change in behaviour, never noise.

## What it covers

| Family | Cases | How the expectation is derived |
|---|---|---|
| A | 250 | `parseSerials` — expected list computed arithmetically from prefix/width/range |
| B | 450 | dip pairing — expected open-set, per-serial cycles and bath occupancy from a **separate simulator**, not from the app |
| C | 400 | piece status — contract rules over the full cartesian product of result × disposition × cycles × timing, plus metamorphic relations (appending `Scrap` always yields `Scrap`; shuffling input order must not change the result) |
| D | 300 | bath flags — expected flag count computed from the config bounds, with values sitting **on** every boundary (`fePpm` 99/100/101, `hclPct` 15.9/16/22/22.1, temp ±tolerance, age 29/30/31, capacity 0–16) |
| E | 300 | `eventWarnings` — "this state must warn at this level" contract rules |
| F | 300 | whole-stream invariants that must hold for **any** event stream: `kpis.inBath` equals open dips, every status is a known status, hours never negative or NaN, derivation independent of array identity (memo must not leak), every suggestion level valid, bath contents account for every open dip |

The suite is mutation-tested. Three separate one-character mutations to `index.html` each
produced distinct localized failures (12, 17 and 60), and reverting restored 2000/0 — so a
clean run is meaningful, not vacuous.

## Report

**Overwrite** `audit/RESULTS.tsv` — delete what is there first, do not append. That file only.

```
SUITE	pass=<n>	fail=<n>	threw=<n>	total=<n>
HARNESS	pass=<n>	fail=<n>
NPMTEST	pass|fail
```

Then every non-PASS line from `node audit/cases.mjs --fails`, verbatim, one per line.
If there are none, write `CLEAN` on its own line.

## Rules

- **Read-only.** Do not edit `index.html`, `audit/cases.mjs`, `audit/harness.mjs`,
  `audit/NOTES.md`, or this file. Do not fix anything you find.
- Do not edit the generator to make a case pass. If you believe a case's expectation is
  wrong, report it as a line `DISPUTE <id> <one-line reason>` and leave the code alone.
- Report the totals the tool prints. Do not recount by hand, summarise, or round.
- If the suite throws on load, report the error verbatim and stop — do not repair it.

Then commit and push to `claude/cloudflare-pages-hosting-tajgyw`.
