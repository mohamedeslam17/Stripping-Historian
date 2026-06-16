# Stripping Historian

A single‑file, **fully offline**, event‑sourced shop‑floor log for the **chemical
stripping of turbine components** (HCl strip baths). Open `index.html` in any
modern browser — no server, no install, no network. All data stays in that
browser, on that PC, in IndexedDB.

It is built around one idea: **the event log is the single source of truth.**
Operators only ever record *what happened* (a bath was filled, a titration was
taken, a piece was dipped, a mask failed, a part was dispositioned). Every other
screen — piece tracker, bath status, quality log, dashboard — is **derived** from
that immutable stream. Nothing is double‑entered, and history can never disagree
with itself.

---

## Quick start

1. Open `index.html` (double‑click, or serve the folder).
2. Go to **Settings → Data → Load example data** to explore a realistic dataset.
3. Use **Log event** to record real events; everything else updates automatically.
4. Hit **Backup** (top bar) to save a JSON snapshot; **Import** restores it on any
   machine.

> Because storage is per‑browser/per‑PC, treat **Backup** as your save button and
> keep snapshots somewhere durable.

---

## What it tracks

**Event types** (each form shows only the fields it needs):

| Event | Purpose |
|---|---|
| Bath Fill | New charge (HCl / water / H₃PO₄ volumes) |
| Chemistry Check | Titration: free HCl %, iron Fe ppm, temperature |
| HCl / Water Top‑Up | Maintain the charge between checks |
| Immersion | One dip of a piece (time in/out, result, wax state) |
| Wax Failure | Masking defect on a part |
| Re‑Masking | Part re‑waxed before another dip |
| Engineering Review | Disposition a part (Accepted / Scrap / Return / Hold…) |
| Bath Disposal | Bath taken out of service (with reason) |

**Derived views**

- **Pieces** — one row per serial: cycles, cumulative immersion hours, wax fails,
  and a status (`Cleared`, `In progress`, `→ Engineering`, `Scrap`, …). Click
  *history* for a full timeline and a printable **strip traveler** for the quality
  record.
- **Baths** — per‑bath state for the **current charge** (state resets after a
  refill): age, latest chemistry, piece‑hour load, parts processed, and
  **out‑of‑band flags**. Trend charts for Fe / HCl / temp with limit lines and
  control bands.
- **Quality** — an instant defect database (wax failures, re‑masks, engineering
  reviews, re‑strips), filterable by kind.
- **Dashboard** — first‑pass yield, re‑strip rate, engineering load, bath status,
  and a per‑job‑card rollup.

**Live guidance.** While logging, the form surfaces soft warnings — iron over the
limit, a dip that would exceed max cycles, immersing in a disposed/out‑of‑band
bath — without blocking the entry. Baths out of band and pieces awaiting
disposition are surfaced in a banner and as nav badges.

**Configurable limits** (Settings): temperature setpoint/tolerance, free‑HCl band,
iron limit, max cycles & hours per piece, max bath life, bath IDs, operators.

---

## Architecture

```
index.html
 ├── <style>            self-contained UI
 └── <script>
      ├── DOMAIN block   ← pure functions of (events, config): no DOM, no storage
      ├── storage        ← IndexedDB read/write
      ├── DOM helpers    ← element + modal + SVG chart builders
      └── views          ← render the derived data
```

The **DOMAIN block** holds all the logic worth trusting — `derivePieces`,
`deriveBath`, `deriveKpis`, `eventWarnings`, … — written as pure functions so it
can be tested away from the browser.

### Why a single file?

Zero‑dependency, zero‑build, runs from a USB stick on an air‑gapped shop PC, and is
trivial to archive. The trade‑off (no module splitting) is bought back with the
test harness below.

---

## Tests

The test suite reads `index.html`, extracts the DOMAIN block **and** the whole
`<script>`, and exercises them in Node — so there's a single source of truth and
the tests can't drift from what ships. It also syntax‑checks the entire script.

```bash
npm test        # node --test tests/*.test.mjs
```

---

## Data & portability

- **Backup** → `strip_historian_backup_<date>.json` (config + events).
- **Export CSV** → flat `eventId,datetime,type,…` for spreadsheets/BI.
- **Import** replaces local data from a backup (with confirmation), so you can move
  between machines or restore after a browser reset.

## License

MIT
