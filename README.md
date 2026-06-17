# Stripping Historian

A single‑file, **fully offline**, event‑sourced shop‑floor log for the **chemical
stripping of turbine components** (HCl strip baths). Open `index.html` in any
modern browser — no server, no install, no network. All data stays in that
browser, on that PC, in IndexedDB.

It is built around one idea: **the event log is the single source of truth.**
Operators only ever record *what happened*. Every other screen — piece tracker,
bath status, quality log, dashboard — is **derived** from that immutable stream.
Nothing is double‑entered, and history can never disagree with itself.

### Dips are split into Add parts + Remove parts

On the floor you rarely know the out‑time when a part goes in, parts go in as a
**batch**, and they don't all come out together. So a dip is two events (shown as
**Add parts** / **Remove parts** on the bath cards; stored as *Load In* /
*Extraction* in the ledger):

- **Add parts** (*Load In*) — *N* parts go INTO a bath. The event timestamp *is*
  the time‑in. Serials are entered as a list, with range shorthand like
  `7261-01..06`, **or picked from the waiting area** (see below). The destination
  drop‑down also offers **Waiting area** — choose it to **park** the serials
  without a bath (stored as *Parts Received*) instead of dipping them.
- **Remove parts** (*Extraction*) — pull **some** of what's currently in that bath.
  The form shows you the **live bath contents** as a checklist; you tick the parts
  coming out and set each result (Cleared / Re‑strip / Hold). Parts you don't tick
  **stay in**.
- **Move** (*Transfer*) — relocate **all or some** of a bath's contents to another
  bath. The part keeps its current dip (a move is **not** counted as a new strip
  cycle); its immersion time simply carries on in the new tank.

The system pairs loads → extractions per serial, counts cycles automatically,
computes each dip's hours from the two timestamps, and always knows **what's still
in every bath** ("On the floor now"). A part that comes out Re‑strip can simply be
loaded again — that's its next cycle.

---

## Quick start

1. Open `index.html` (double‑click, or serve the folder).
2. Go to **Settings → Data → Load example data** to explore a realistic dataset.
3. The **Dashboard** is home: one card per tank showing what's currently in it,
   with **Add parts / Remove parts / Move / Chem / Top up / Dispose** buttons. Use
   the **＋ Log event** drawer (sidebar) for anything else; everything updates
   automatically.
4. Hit **Backup** (sidebar) to save a JSON snapshot; **Import** restores it.

A desktop‑oriented console: a left sidebar nav, a slide‑in **Log** drawer, and
keyboard shortcuts — **L** add parts · **E** remove parts · **N** new event · **/** search.
Serials are entered as **chips** (type/paste, Enter to add; ranges like
`7261-01..06` expand).

> Because storage is per‑browser/per‑PC, treat **Backup** as your save button and
> keep snapshots somewhere durable.

---

## What it tracks

**Event types** (each form shows only the fields it needs):

| Event | Purpose |
|---|---|
| **Add parts** (*Load In*) | *N* parts INTO a **bath**, or into the **Waiting area** (parked, no bath). Serials as a list / range / from the waiting area. Also where failed mask areas are **re‑masked** before the re‑dip |
| **Remove parts** (*Extraction*) | Pull some parts OUT (time out, per‑part result + **per‑area wax failure**) |
| **Move** (*Transfer*) | Move all or some of a bath's parts to another bath (same dip continues) |
| Parts Received | The waiting area — serials parked, not yet in a bath (created by *Add parts → Waiting area*) |
| Bath Fill | **Complete fill** — new charge (HCl / water / H₃PO₄ volumes) |
| Chemistry Check | Titration: free HCl %, iron Fe ppm, temperature |
| Top‑Up | **Partial addition** — top up acid and/or water between checks |
| Engineering Review | Disposition a part (Accepted / Scrap / Return / Hold…) |
| Bath Disposal | Bath taken out of service (with reason) |

> Wax failure and re‑masking are **not** standalone events — you never know a mask
> failed until you pull the part, so wax failure is captured **on the extraction**,
> and re‑masking is captured **on the next Load In** (the re‑dip).

**Derived views** (just four screens — Dashboard, Pieces, Events, Quality, plus
Settings):

- **Dashboard** — the landing screen, with the floor + baths + KPIs in one place:
  a **visual of every tank with the parts currently inside it** (over‑hours parts
  in red, out‑of‑band tanks in red), each carrying its chemistry summary, status
  and one‑click **Add parts / Remove parts / Move / Chem / Top up / Dispose**
  (Top up offers a **complete fill** or a **partial addition**); a **Waiting area**
  panel (serials parked, not yet in a bath); the headline KPIs; the **next‑action
  suggestions**; and first‑pass yield by job card. Click a tank for full chemistry
  charts and contents.
- **Pieces** — one row per serial: cycles, cumulative hours, wax fails, where it is,
  and a status (`In bath`, `Awaiting re‑strip`, `Needs re‑mask`, `Cleared`,
  `→ Engineering`, `Scrap`, …), filterable. Click *history* for a full timeline and
  a printable **strip traveler** for the quality record.
- **Quality** — an instant defect database (wax failures, re‑masks, engineering
  reviews, re‑strips), filterable by kind.
- **Stop conditions** — a part over the cycle/hour limit is automatically held for
  engineering, with the breached limit stated as the reason.

**Smart guidance (it knows the state of every bath and piece).** The event stream
is treated as a **state machine**, so the app relates each action to what is
already true:

- **Suggested next actions** — the Floor shows a ranked "what to do next" list and
  each item **prefills the drawer**: re‑load awaiting parts into a suggested healthy
  **rescue bath** (re‑mask first if the last dip lost its wax), send over‑limit
  parts to engineering, dispose a spent bath, top up low acid, extract parts that
  have been in too long, log an overdue titration. Pieces and bath/piece dialogs
  carry the same one‑click actions.
- **Wax failure and re‑masking live in the dip, not as separate events.** A wax
  failure is only discovered when a part is pulled, so it's recorded **on the
  extraction**, **per masked area** (e.g. *cooling holes* vs the *part body*,
  configurable — those fail independently). Re‑masking is recorded **as part of the
  next Load In**: when you re‑load a part that came out with a wax failure, the form
  lists its failed areas and you tick the ones you re‑waxed. Any unticked area keeps
  the part in a **Needs re‑mask** state and **blocks the re‑load** (red warning); a
  re‑mask clears **only the areas it covers**, so a part with two failed areas stays
  blocked until both are done. The whole chain shows in the timeline and Quality log.
- **Relationship‑aware warnings** — logging something illogical is flagged before
  you save: disposing a bath that **still has parts in it**, re‑masking a part
  that's **currently submerged**, re‑loading a part that already **cleared** or is
  **awaiting engineering**, an extraction dated **before** the part went in, a load
  **back‑dated** before the part's last event, chemistry on an inactive bath, and
  more — without blocking the entry.
- **Autofill** — typing/scanning a known serial fills in its J/C and component;
  the extraction list pre‑ticks parts already over the max immersion time.
- **Idle parts come back to you** — parts that came out of a tank and aren't done
  (awaiting another strip, or blocked needing a re‑mask) are tracked as *idle*. When
  you open **Add parts**, they're listed as **"Waiting to go back in" — tap to add**
  (or *Add all*), so you never lose track of a part sitting on the bench.
- **Waiting area** — parts received but not yet in a bath. Add them with the
  regular **Add parts** form by choosing **Waiting area** as the destination (no
  separate flow). They show in the Waiting‑area panel on the Dashboard, and appear
  in a **drop‑down** in the **Add parts** form for any bath — pick one (or *Add
  all*), on top of typing brand‑new serials. A part leaves the waiting area once
  it's loaded into a bath.
- **Capacity** — tanks have a configurable capacity; loads that would overfill are
  flagged, the fill level shows on each tank, and a full bath is never offered as a
  rescue.
- **Undo** — the last add / edit / delete can be reverted from the toast or with
  Ctrl/Cmd‑Z.

**Configurable limits** (Settings): temperature setpoint/tolerance, free‑HCl band,
iron limit, max cycles & hours per piece, max bath life, bath capacity, bath IDs,
masked areas, operators.

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
