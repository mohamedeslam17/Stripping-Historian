# TASK — Round 6: operator-efficiency fixes (UI/UX)

Findings from driving the real app in Chromium with the example data loaded, at 1440×900
and at 1024×768 (tablet). This round is **implementation**, not audit.

The operator using this is under time pressure. Every extra click, scroll or retyped field
is paid on every event, all shift. Optimise for that, not for completeness.

Work through these **in order**. Run the checks after each one — do not batch them.

---

## 1. Put the tanks first (highest value)

**Problem.** On the Dashboard the tanks start at **y≈793px**. Above them sit an alert
banner, six KPI tiles, and up to six suggestion rows. On a 1024×768 tablet the KPI tiles
wrap to two rows and **no tank is visible at all** on arrival. The operator's first
question is "what's in my tanks" and the answer is below the fold.

**Where.** `vDash(m)` — around line 1934. Current append order is: KPI strip (`kpis`) →
`suggestionsPanel()` → orphan panel → `parkedPanel()` → tanks.

**Change.** Reorder to:

1. orphan/safety panel (keep first — it's a data-integrity warning)
2. **tanks**
3. waiting area (`parkedPanel()`)
4. suggestions (`suggestionsPanel()`)
5. KPI strip last

**Verify.** With example data loaded at 1024×768, the first tank card is visible without
scrolling.

---

## 2. Focus the field the operator actually uses

**Problem.** On opening Add parts *or* Remove parts, `document.activeElement` is the
**date input** — which is already prefilled correctly with now. So every event begins with
a wasted click or tab. I confirmed this in the browser for both drawers.

**Where.** `renderDrawer()` — around line 1160, after the form fields are built.

**Change.** After the drawer renders:

- **Add parts** → focus the serials chip input.
- **Remove parts** → focus the **All** button (or the first row checkbox).
- Every other event type → leave as is.

Do not autofocus anything when re-opening in edit mode (`editId != null`).

**Verify.** Press `L`, then type a serial immediately — it must land in the serials field
with no click. Press `E` — focus must be on All / the first checkbox.

---

## 3. Add parts: serials before J/C and Component

**Problem.** J/C No. and Component render **above** Serials, but they are auto-filled
**from** the serials — typing `7261-01` fills `7261` / `GT26 R2011 V3` (verified working).
The operator reads top-down, sees two empty boxes, and assumes they must fill them.

**Where.** `buildLoadFields(card, refreshWarn)` — around line 1322.

**Change.** Order the fields: **Date/time → Bath → Serials → J/C → Component → waiting
area → masked areas → Notes.** Keep the autofill behaviour exactly as it is; only the
order changes. If J/C and Component were auto-filled, style them so it is visible they
came from history (a subtle "from history" hint is enough) while staying editable.

**Verify.** Type a known serial; J/C and Component populate below it. Type an unknown
serial; both stay empty and editable.

---

## 4. A disposed bath must offer Fill, not the three things it cannot do

**Problem.** Bath 102-103 is disposed. Its card shows **Add parts / Chem / Top up** — all
invalid on a disposed bath — and **no Fill button**. Clicking Add parts correctly warns
"fill it before loading", but there is no button to do that. The operator has to go to
Log event → Bath Fill → reselect the bath.

**Where.** `tankCard(s)` — around line 1906, the action-button block.

**Change.** When the bath is disposed (`!s.active && s.disposal`), replace the whole button
row with a single primary **Fill — new charge** that opens the Bath Fill drawer prefilled
with that bath. Keep the existing buttons for active baths.

**Verify.** The disposed tank card shows exactly one action, and it opens Bath Fill with
the bath already selected.

---

## 5. Stop reporting the same condition four times

**Problem.** Bath 106-107 being 131 days old appears in the red banner, as a flag on the
card, and **twice** in the suggestion list (dispose it; log a titration). Four baths
produce six suggestion rows. It reads as noise, so it gets ignored.

**Where.** `deriveSuggestions` (DOMAIN block) and/or `suggestionsPanel()` around line 1650.

**Change.** Collapse to **at most one suggestion per bath** — the most urgent one, using
the existing `red → amber → info` ranking. Keep every piece-level suggestion (re-load,
engineering review) as it is. Then cap the rendered list at the top 3 with a
"show all (N)" expander.

**Careful:** `deriveSuggestions` is covered by `audit/cases.mjs` family F, which asserts
every suggestion carries a valid level. Keep the shape of the objects unchanged.

**Verify.** With example data, the suggestion list shows 3 rows plus an expander, and no
bath appears twice.

---

## 6. Remove parts: do not pre-select a result on unticked rows

**Problem.** Every row in the extraction checklist shows **Cleared** already selected in
green before the row is ticked. It reads as a decision that has been made, and tick-All →
Save records "Cleared" for every part without a deliberate choice on any of them. This is
the quality record.

**Where.** `buildExtractFields(card, refreshWarn)` — around line 1528.

**Change.** Render the result buttons **disabled/greyed until the row's checkbox is
ticked**. On tick, enable them with Cleared as the default. Do not change what gets saved
for a ticked row.

**Verify.** Unticked rows show no active green selection. Tick a row → Cleared becomes the
active default. Tick All → Save still records Cleared for all, as today.

---

## Also worth doing (small)

`lastOperator` (line 1108) already prefills the operator on new forms — that part works.
But it is in-memory only, so it resets whenever the page is reloaded. Persist it with the
config so an operator types their name once per shift, not once per browser session.

---

## Constraints

- **`index.html` only**, plus tests if you add any. Do not touch `audit/cases.mjs`,
  `audit/harness.mjs`, `audit/NOTES.md`, or this file.
- Keep the DOMAIN block pure — no DOM or storage inside it. Item 5 is the only one that
  may touch DOMAIN logic; prefer doing it in `suggestionsPanel()` if that is cleaner.
- Do not restyle the app. These are targeted changes, not a redesign.
- Do not change any existing behaviour that is not named above.

## Verify before pushing — all three must be clean

```bash
node audit/cases.mjs --fails     # expect: TOTALS pass=2000 fail=0 threw=0
node audit/harness.mjs           # expect: 22 pass, 0 fail
npm test                         # expect: domain + smoke green
```

If a case in `audit/cases.mjs` fails, **you changed behaviour that was covered**. Do not
edit the suite to make it pass — report it as `DISPUTE <id> <reason>` and leave that item
undone.

## Report

**Overwrite** `audit/RESULTS.tsv`:

```
ITEM1	done|skipped	<one line>
ITEM2	done|skipped	<one line>
ITEM3	done|skipped	<one line>
ITEM4	done|skipped	<one line>
ITEM5	done|skipped	<one line>
ITEM6	done|skipped	<one line>
CASES	pass=<n>	fail=<n>
HARNESS	pass=<n>	fail=<n>
NPMTEST	pass|fail
NOTES	<anything you had to decide, or "none">
```

Then commit and push to `claude/cloudflare-pages-hosting-tajgyw`.
