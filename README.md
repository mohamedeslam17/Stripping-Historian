# Stripping Historian

A single‑file, event‑sourced shop‑floor log for the **chemical stripping of
turbine components** (HCl strip baths).

Everything is recorded by **set number and number of parts**. There are no serial
numbers anywhere in the app: an entry is *“set 7261, six parts”*, which is what
is written on the basket tag and all anyone should have to type standing at a hot
tank with gloves on.

It runs in **two modes**, and the difference matters:

| | **Shared** (hosted) | **Local** (single file) |
|---|---|---|
| How it's opened | the site URL, over https | `index.html` from disk (`file://`) |
| Who sees the data | everyone with the link **and** a password | only that browser, on that PC |
| Where data lives | Cloudflare D1, server‑side | IndexedDB, in that browser |
| Login | operator or admin password | none |
| Network needed | no — entries queue offline and upload when it returns | never |

The hosted deployment is the shared shop log: **https://stripping-historian.pages.dev**.
Opening the file directly still works exactly as it always did, and is a fine
way to look at a backup on a machine with no network — but understand that a
local copy is a *separate, private* dataset. It does not sync with the shared
log, and never has.

It is built around one idea: **the event log is the single source of truth.**
Operators only ever record *what happened*. Every other screen — sets, bath
status, quality log, dashboard — is **derived** from that immutable stream.
Nothing is double‑entered, and history can never disagree with itself.

---

## Sets and lots

You type a **set number** and a **count**. The thing the app tracks underneath is
a **lot**: *N parts of one set that share a place and a history* — where they are,
how many cycles they have run, how much time they have spent in acid, which mask
areas are still open.

A lot is not something you create; it is what the ledger works out:

- **Add parts** takes a count off the bench and puts a lot in a bath.
- **Remove parts** takes a quantity out of a lot. Pull four of six and the lot
  **splits** — the two left behind keep their own clock, because they are still
  in the tank.
- **Add parts** again puts them back. Parts of a set on the **same cycle** are
  interchangeable, so lots that go in together come back together as one lot,
  carrying the **longest** immersion clock of the lots they came from (the safe
  reading — it is the one that trips the hours limit first). Lots on **different**
  cycles are never merged, because the cycle count is what routes parts to
  engineering.

So a set of six that had four cleared and two sent back for another strip is
simply two lots, and each carries its own answer for “where is it and what has it
been through?”. That is the whole model.

### Dips are split into Add parts + Remove parts

On the floor you rarely know the out‑time when parts go in, they go in as a
**batch**, and they don't all come out together. So a dip is two events (shown as
**Add parts** / **Remove parts** on the bath cards; stored as *Load In* /
*Extraction* in the ledger):

- **Add parts** (*Load In*) — a **set number** and **how many parts** go INTO a
  bath. The event timestamp *is* the time‑in. The form shows you, before you save,
  exactly what the entry will draw on: how many come off the waiting area, how many
  are new to the log, and which cycle each portion lands on. The destination
  drop‑down also offers **Waiting area** — choose it to **park** a set without a
  bath (stored as *Parts Received*) instead of dipping it. You also set the set's
  **wax configuration** here — which masked areas its parts actually have (untick
  e.g. *cooling holes* for a set that doesn't have them). That config follows the
  set, so the removal form only offers real areas and re‑mask analysis stays
  accurate.
- **Remove parts** (*Extraction*) — pull **some** of what's currently in that bath.
  The form shows the **live bath contents** as one row per lot: the set, how many
  are in the tank, which cycle, and how long they have been in. You type **how many
  come out** and set the reason (**Cleared / Re‑strip / Re‑mask / Hold**). *Re‑mask*
  pre‑selects the set's masked areas and routes those parts to **Needs re‑mask**.
  A set you leave at **0** stays in, and its clock keeps running.
- **Move** (*Transfer*) — relocate all or some of a bath's contents to another
  bath, **or out to the waiting area**. To another bath the parts keep their
  current dip (a move is **not** counted as a new strip cycle) and their immersion
  time carries on; to the waiting area they simply leave the bath and sit there
  until they go back in.

The system pairs loads → removals by lot, counts cycles automatically, computes
each dip's duration from the two timestamps, and always knows **what's still in
every bath**. Parts that come out Re‑strip can simply be added again — that's
their next cycle.

---

## Quick start

1. Open **https://stripping-historian.pages.dev** and sign in with the password
   you were given. (Or, for a private local copy, open `index.html` from disk —
   no password, no sharing.)
2. Start with the first real shop event. The realistic example dataset is available
   only when `index.html` is opened as a private local (`file://`) copy, so demo
   records cannot contaminate the shared production ledger.
3. The **Dashboard** is home: one card per tank showing what's currently in it,
   with **Add parts / Remove parts / Move / Chem / Top up / Dispose** buttons. Use
   the **＋ Log event** drawer (sidebar) for anything else; everything updates
   automatically.
4. Hit **Backup** (sidebar) to save a JSON snapshot; **Import** restores it.

A desktop‑oriented console: a left sidebar nav, a slide‑in **Log** drawer, and
keyboard shortcuts — **L** add parts · **E** remove parts · **N** new event · **/** search.

A status pill sits at the bottom‑right of the shared app: **Synced**, **Syncing…**,
**Offline — queued**, or **Not synced**. If the network drops, keep recording —
entries are held locally and upload automatically when it returns. Don't close
the browser while it still says *queued*.

The shared app checks for other people's work every 20 seconds, but **the screen
only redraws when the log has actually changed** — a check that finds nothing new
costs nothing and touches nothing. When a redraw does happen it **keeps your
scroll position** (page and table), and it will **never rebuild a form you are
filling in**: a repaint that arrives mid‑entry waits until you leave the field.

> **Local mode only:** storage is per‑browser/per‑PC, so treat **Backup** as your
> save button and keep snapshots somewhere durable.

---

## Who can do what

Two passwords, no user accounts — deliberately the least machinery that keeps
outsiders out.

| | Operator | Admin |
|---|---|---|
| Record events (add parts, remove parts, chem, top‑up…) | ✅ | ✅ |
| See the dashboard, sets, reports | ✅ | ✅ |
| Export / backup | ✅ | ✅ |
| **Edit an event already recorded** | ❌ | ✅ |
| **Delete an event** | ❌ | ✅ |
| **Change settings** (limits, baths, operators) | ❌ | ✅ |
| **Clear or import the whole log** | ❌ | ✅ |

Operators can always *add* to the log; correcting or removing what is already
recorded is an admin action, because engineering reads this log as the record of
what actually happened.

This is a shared‑password gate, not real security: it keeps out someone who
merely finds the link. Anyone holding a password can act as that role, and you
cannot tell two operators apart in the log. Rotate the passwords by changing the
Pages secrets (see `DEPLOYMENT.md`) — that signs everyone out.

---

## What it tracks

**Event types** (each form shows only the fields it needs):

| Event | Purpose |
|---|---|
| **Add parts** (*Load In*) | *N* parts of a set INTO a **bath**, or into the **Waiting area** (parked, no bath). Also where failed mask areas are **re‑masked** before the re‑dip |
| **Remove parts** (*Extraction*) | Pull a quantity OUT (time out, reason per quantity + **per‑area wax failure**) |
| **Move** (*Transfer*) | Move a quantity to another bath (same dip), or out to the waiting area |
| Parts Received | The waiting area — a set parked, not yet in a bath (created by *Add parts → Waiting area*) |
| Bath Fill | **Complete fill** — new charge (HCl / water / H₃PO₄ volumes) |
| Chemistry Check | Titration: free HCl %, iron Fe ppm, temperature |
| Top‑Up | **Partial addition** — top up HCl, water and/or H₃PO₄ between checks |
| Engineering Review | Disposition *N* parts of a set (Accepted / Scrap / Return / Hold…) |
| Bath Disposal | Bath taken out of service (with reason) |

> Wax failure and re‑masking are **not** standalone events — you never know a mask
> failed until you pull the parts, so wax failure is captured **on the removal**,
> and re‑masking is captured **on the next Add parts** (the re‑dip).

**Derived views** (just four screens — Dashboard, Sets, Events, Quality, plus
Settings):

- **Dashboard** — the landing screen, with the floor + baths + KPIs in one place:
  a **visual of every tank with the sets currently inside it** (over‑hours lots in
  red, out‑of‑band tanks in red), each carrying its chemistry summary, status
  and one‑click **Add parts / Remove parts / Move / Chem / Top up / Dispose**
  (Top up offers a **complete fill** or a **partial addition**); a **Waiting area**
  panel; the headline KPIs; the **next‑action suggestions**; and first‑pass yield
  by set. Click a tank for full chemistry charts and contents.
- **Sets** — one row per lot: the set, how many parts, cycles, cumulative time,
  open wax areas, where it is, and a status (`In bath`, `Awaiting re-strip`,
  `Needs re-mask`, `Cleared`, `→ Engineering`, `Scrap`, …), filterable and
  searchable by set number. Click *history* for that lot's full timeline, links to
  the rest of its set, and a printable **strip traveler** for the quality record.
- **Quality** — an instant defect database (wax failures, re‑masks, engineering
  reviews, re‑strips) with the set and the number of parts affected, filterable
  by kind.
- **Stop conditions** — a lot over the cycle/hour limit is automatically held for
  engineering, with the breached limit stated as the reason.

**Smart guidance (it knows the state of every bath and every lot).** The event
stream is treated as a **state machine**, so the app relates each action to what
is already true:

- **Suggested next actions** — the Dashboard shows a ranked "what to do next" list
  and each item **prefills the drawer**: re‑load waiting parts into a suggested
  healthy **rescue bath** (re‑mask first if the last dip lost its wax), send
  over‑limit parts to engineering, dispose a spent bath, top up low acid, remove
  parts that have been in too long, log an overdue titration. The Sets table and
  the bath/lot dialogs carry the same one‑click actions.
- **Wax failure and re‑masking live in the dip, not as separate events.** A wax
  failure is only discovered when parts are pulled, so it's recorded **on the
  removal**, **per masked area** (e.g. *cooling holes* vs the *part body*,
  configurable — those fail independently). Re‑masking is recorded **as part of the
  next Add parts**: when you re‑load parts that came out with a wax failure, the
  form lists the failed areas and you tick the ones you re‑waxed. Any unticked area
  keeps those parts in a **Needs re‑mask** state and **blocks the re‑load** (red
  warning); a re‑mask clears **only the areas it covers**, so a lot with two failed
  areas stays blocked until both are done. The whole chain shows in the lot
  timeline and the Quality log.
- **Relationship‑aware warnings** — logging something illogical is flagged before
  you save: disposing a bath that **still has parts in it**, taking out more parts
  than are in the tank, re‑loading a set that was **scrapped** or is **awaiting
  engineering**, a removal dated **before** the parts went in, a load
  **back‑dated** before the set's last event, asking for **more parts than are
  waiting**, chemistry on an inactive bath, and more — without blocking the entry.
- **Autofill** — typing a known set number fills in its component and mask
  configuration; the removal list pre‑fills the full quantity for any lot already
  over the max immersion time.
- **Waiting area** — **every part physically out of a tank but not finished** lands
  here, so nothing on the bench is ever lost: parts that came **out of a tank**
  (awaiting another strip, blocked needing a re‑mask, **or flagged for engineering**
  after hitting a cycle/hour limit), plus sets **parked** with *Add parts →
  Waiting area*. It shows as a panel on the Dashboard (tap a lot to send it to a
  bath, or — for a *review* lot — to its engineering review) and as **one‑tap chips**
  in the **Add parts** form, grouped by set: tap *7261 · 6* and the set number and
  count are filled in for you. Tapping a specific lot loads **those** parts — the
  entry records which bench lots it drew on, so the wax gate fires on the parts you
  actually pointed at. A lot leaves the waiting area the moment it goes back into a
  bath. (Only finished parts — Cleared / Accepted / Scrap / Returned — drop off.)
- **Capacity** — **off by default** (no part limit). Set a per‑bath capacity in
  Settings (0 = no limit) and loads that would overfill are flagged, the fill level
  shows on each tank, and a bath without room is never offered as a rescue.
- **Undo** — admins (and private local copies) can revert recent adds / edits /
  deletes (up to 20) from the toast or with Ctrl/Cmd‑Z. Operator entries are
  immutable once recorded, matching the shared-log permission model. Closing a
  half‑filled form asks before discarding it.

**Configurable limits** (Settings): temperature setpoint/tolerance, free‑HCl band,
iron limit, max cycles & hours per lot, max bath life, bath capacity, titration
cadence (days between chemistry checks; 0 disables the reminder), bath IDs,
masked areas, operators. List fields (bath IDs, operators, masked areas) commit
when you leave the field, and a cleared number box keeps its previous value
rather than persisting as 0.

> **Baths are always shown** — the configured tanks (Settings → Bath IDs) appear on
> the floor at all times, even with no events. Any *extra* bath that turns up in the
> data is added automatically, so nothing with real history is ever hidden.

---

## Architecture

```
index.html
 ├── <style>            self-contained UI
 └── <script>
      ├── DOMAIN block   ← pure functions of (events, config): no DOM, no storage
      ├── storage        ← IndexedDB mirror + durable offline outbox
      ├── sync           ← bounded, retry-safe batches to the hosted API
      ├── DOM helpers    ← element + modal + SVG chart builders
      └── views          ← render the derived data
functions/
 ├── _middleware.js     ← signed-session gate
 └── api/sync.js        ← role checks + atomic D1 writes
```

The **DOMAIN block** holds all the logic worth trusting — `deriveLotState`,
`deriveLots`, `deriveBath`, `deriveKpis`, `eventWarnings`, … — written as pure
functions so it can be tested away from the browser. `deriveLotState` is the
backbone: one ordered fold over the ledger that produces every live lot, every
dip record, and what is in each tank right now.

### Why a single file?

Zero‑dependency, zero‑build, runs from a USB stick on an air‑gapped shop PC, and is
trivial to archive. The trade‑off (no module splitting) is bought back with the
test harness below.

---

## Tests

Four layers, reading the shipped source directly so they can't drift from what
ships:

- **`tests/domain.test.mjs`** — extracts the DOMAIN block and unit‑tests the pure
  logic (lot splitting and merging, cycle counting, cumulative immersion time,
  the wax gate, bath flags, KPIs, entry warnings, and the legacy serial‑era
  ledgers it still has to read). Also syntax‑checks the entire `<script>`.
- **`tests/ui-contract.test.mjs`** — asserts the shipped markup keeps the
  properties that are easy to regress: no serial entry anywhere, a set number and
  a count, per‑lot quantity rows, a repaint that can't move the operator's place.
- **`tests/smoke.mjs`** — boots the real app against a tiny in‑memory DOM +
  IndexedDB shim, loads the example data, and renders every tab, every custom
  form, and the modals — catching view‑layer runtime errors headlessly.
- **`tests/shared-sync.test.mjs`** — drives the hosted client against controlled
  network/IndexedDB fakes and the real sync API handler. It covers in-flight saves,
  queues over 500 operations, rejected mixed-role batches, permissions, event-ID
  collisions, required form fields, tombstones, and clear-vs-config scope.

```bash
npm test
```

---

## Data & portability

- **Report** → a self‑contained, **color‑coded HTML** report of every dip with a
  single **Status** column — *Ongoing* (still in a bath), *Completed* (cleared),
  *Re‑strip*, *Re‑mask*, *Hold*, *Moved* — ready to open or print.
- **Backup** → `strip_historian_backup_<date>.json` (config + events).
- **Export CSV** → flat one‑row‑per‑dip table (same *Status* column) for
  spreadsheets/BI, with the set, the part count, a numeric `hours` column and a
  `partHours` column (hours × parts) that both aggregate in a pivot, and
  `eventIdIn` / `eventIdOut` tracing each row back to the ledger entries it came
  from.
- **Import** replaces data from a backup (with confirmation). In shared mode it
  is admin-only and replaces the shared log; in local mode it replaces only that
  browser's private data. Malformed entries are skipped and config is validated
  against known keys.

### Reading an older, serial‑based backup

Nothing has to be converted. A ledger recorded before this change carries a job
card and a list of serials; both are read as what they always meant — the **set**,
and **how many parts** were in it — so cycle counts, immersion times, bath
contents and yields all still derive. What is lost is only the thing the floor
never used: which individual serial got which result. A removal that named two
serials becomes “two parts out”, allocated oldest‑in first.

## License

MIT
