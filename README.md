# Stripping Historian

A single‑file, event‑sourced shop‑floor log for the **chemical stripping of
turbine components** (HCl strip baths).

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
  without a bath (stored as *Parts Received*) instead of dipping them. You also set
  the parts' **wax configuration** here — which masked areas they actually have
  (untick e.g. *cooling holes* for parts that don't have them). That config follows
  the serial, so the extraction form only offers real areas and re‑mask analysis
  stays accurate.
- **Remove parts** (*Extraction*) — pull **some** of what's currently in that bath.
  The form shows you the **live bath contents** as a checklist; you tick the parts
  coming out and set each reason (**Cleared / Re‑strip / Re‑mask / Hold**). *Re‑mask*
  pre‑selects the part's masked areas and routes it to **Needs re‑mask**. Parts you
  don't tick **stay in**.
- **Move** (*Transfer*) — relocate **all or some** of a bath's contents to another
  bath, **or out to the waiting area**. To another bath the part keeps its current
  dip (a move is **not** counted as a new strip cycle) and its immersion time
  carries on; to the waiting area it simply leaves the bath and sits there until
  it goes back in.

The system pairs loads → extractions per serial, counts cycles automatically,
computes each dip's hours from the two timestamps, and always knows **what's still
in every bath** ("On the floor now"). A part that comes out Re‑strip can simply be
loaded again — that's its next cycle.

---

## Quick start

1. Open **https://stripping-historian.pages.dev** and sign in with the password
   you were given. (Or, for a private local copy, open `index.html` from disk —
   no password, no sharing.)
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

A status pill sits at the bottom‑right of the shared app: **Synced**, **Syncing…**,
**Offline — queued**, or **Not synced**. If the network drops, keep recording —
entries are held locally and upload automatically when it returns. Don't close
the browser while it still says *queued*.

> **Local mode only:** storage is per‑browser/per‑PC, so treat **Backup** as your
> save button and keep snapshots somewhere durable.

---

## Who can do what

Two passwords, no user accounts — deliberately the least machinery that keeps
outsiders out.

| | Operator | Admin |
|---|---|---|
| Record events (load in, extract, chem, top‑up…) | ✅ | ✅ |
| See the dashboard, floor, pieces, reports | ✅ | ✅ |
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
| **Add parts** (*Load In*) | *N* parts INTO a **bath**, or into the **Waiting area** (parked, no bath). Serials as a list / range / from the waiting area. Also where failed mask areas are **re‑masked** before the re‑dip |
| **Remove parts** (*Extraction*) | Pull some parts OUT (time out, per‑part result + **per‑area wax failure**) |
| **Move** (*Transfer*) | Move all or some of a bath's parts to another bath (same dip), or out to the waiting area |
| Parts Received | The waiting area — serials parked, not yet in a bath (created by *Add parts → Waiting area*) |
| Bath Fill | **Complete fill** — new charge (HCl / water / H₃PO₄ volumes) |
| Chemistry Check | Titration: free HCl %, iron Fe ppm, temperature |
| Top‑Up | **Partial addition** — top up HCl, water and/or H₃PO₄ between checks |
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
- **Waiting area** — **every part physically out of a tank but not finished** lands
  here, so nothing on the bench is ever lost: parts that came **out of a tank**
  (awaiting another strip, blocked needing a re‑mask, **or flagged for engineering**
  after hitting a cycle/hour limit), plus serials **parked** with *Add parts →
  Waiting area*. It shows as a panel on the Dashboard (tap a part to send it to a
  bath, or — for a *review* part — to its engineering review) and as a **drop‑down**
  in the **Add parts** form. A part leaves the waiting area the moment it goes back
  into a bath. (Only finished parts — Cleared / Accepted / Scrap / Returned — drop off.)
- **Capacity** — **off by default** (no part limit). Set a per‑bath capacity in
  Settings (0 = no limit) and loads that would overfill are flagged, the fill level
  shows on each tank, and a full bath is never offered as a rescue.
- **Undo** — recent adds / edits / deletes (up to 20) can be reverted from the
  toast or with Ctrl/Cmd‑Z (text fields keep their native undo). Closing a
  half‑filled form asks before discarding it.

**Configurable limits** (Settings): temperature setpoint/tolerance, free‑HCl band,
iron limit, max cycles & hours per piece, max bath life, bath capacity, titration
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

- **Report** → a self‑contained, **color‑coded HTML** report of every dip with a
  single **Status** column — *Ongoing* (still in a bath), *Completed* (cleared),
  *Re‑strip*, *Re‑mask*, *Hold*, *Moved* — ready to open or print.
- **Backup** → `strip_historian_backup_<date>.json` (config + events).
- **Export CSV** → flat one‑row‑per‑dip table (same *Status* column) for
  spreadsheets/BI, with a numeric hours column and `eventIdIn` / `eventIdOut`
  tracing each row back to the ledger entries it came from.
- **Import** replaces local data from a backup (with confirmation). Malformed
  entries are skipped and config is validated against known keys, so a bad file
  can't corrupt the store. Use it to move between machines or restore after a
  browser reset.

## License

MIT
