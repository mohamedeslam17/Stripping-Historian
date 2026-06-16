# Stripping Historian

A single‑file, **fully offline**, event‑sourced shop‑floor log for the **chemical
stripping of turbine components** (HCl strip baths). Open `index.html` in any
modern browser — no server, no install, no network. All data stays in that
browser, on that PC, in IndexedDB.

It is built around one idea: **the event log is the single source of truth.**
Operators only ever record *what happened*. Every other screen — piece tracker,
bath status, quality log, dashboard — is **derived** from that immutable stream.
Nothing is double‑entered, and history can never disagree with itself.

### Dips are split into Load In + Extraction

On the floor you rarely know the out‑time when a part goes in, parts go in as a
**batch**, and they don't all come out together. So a dip is two events:

- **Load In** — *N* parts go INTO a bath. The event timestamp *is* the time‑in.
  Serials are entered as a list, with range shorthand like `7261-01..06`.
- **Extraction** — pull **some** of what's currently in that bath. The form shows
  you the **live bath contents** as a checklist; you tick the parts coming out and
  set each result (Cleared / Re‑strip / Hold). Parts you don't tick **stay in**.

The system pairs loads → extractions per serial, counts cycles automatically,
computes each dip's hours from the two timestamps, and always knows **what's still
in every bath** ("On the floor now"). A part that comes out Re‑strip can simply be
loaded again — that's its next cycle.

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
| **Load In** | *N* parts INTO a bath (time in); serials as a list / range |
| **Extraction** | Pull some parts OUT (time out, per‑part result + wax) |
| Bath Fill | New charge (HCl / water / H₃PO₄ volumes) |
| Chemistry Check | Titration: free HCl %, iron Fe ppm, temperature |
| HCl / Water Top‑Up | Maintain the charge between checks |
| Wax Failure | Masking defect on a part |
| Re‑Masking | Part re‑waxed before another dip |
| Engineering Review | Disposition a part (Accepted / Scrap / Return / Hold…) |
| Bath Disposal | Bath taken out of service (with reason) |

**Derived views**

- **Pieces** — one row per serial: cycles, cumulative hours, wax fails, where it is,
  and a status (`In bath`, `Awaiting re‑strip`, `Cleared`, `→ Engineering`,
  `Scrap`, …), filterable. Click *history* for a full timeline and a printable
  **strip traveler** for the quality record.
- **Baths** — an **On the floor now** panel listing exactly what is in each tank
  (with elapsed time), plus per‑bath state for the **current charge** (resets after
  a refill): age, latest chemistry, piece‑hour load, parts processed, and
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

Two layers, both reading straight from `index.html` so they can't drift from what
ships:

- **`tests/domain.test.mjs`** — extracts the DOMAIN block and unit‑tests the pure
  logic (load/extraction pairing, what's‑left tracking, cycle counting, bath flags,
  KPIs, entry warnings). Also syntax‑checks the entire `<script>`.
- **`tests/smoke.mjs`** — boots the real app against a tiny in‑memory DOM +
  IndexedDB shim, loads the example data, and renders every tab, both custom forms,
  and the modals — catching view‑layer runtime errors headlessly.

```bash
npm test
```

---

## Data & portability

- **Backup** → `strip_historian_backup_<date>.json` (config + events).
- **Export CSV** → flat `eventId,datetime,type,…` for spreadsheets/BI.
- **Import** replaces local data from a backup (with confirmation), so you can move
  between machines or restore after a browser reset.

## License

MIT
