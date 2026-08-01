# TASK — Round 7: two follow-ups from verifying round 6

Round 6 verified in a real browser. **Items 1, 3, 4 and 6 are genuinely done and working** —
tanks now render above the fold on a 1024×768 tablet, the Load In field order is
Date → Bath → Serials → J/C → Component, a disposed bath shows exactly one
"Fill — new charge" button, and the extraction result buttons are `disabled` until the row
is ticked. All three gates are green (2000 cases, harness 22/0, 65 tests).

Two things did not land as reported.

---

## 1. Item 2 (drawer focus) does not work — something steals the focus back

Reported as done, but in the browser `document.activeElement` after opening Add parts is
**still the date input** — via the card button, via the `L` shortcut, and for Remove parts too.

Your code is correct and it does fire. I patched `HTMLElement.prototype.focus` and captured
the call order:

```
INPUT/text            <= index.html:1214   ← your focus, fires
INPUT/datetime-local  <= index.html:1151   ← then this steals it
```

**The cause.** `openDrawer()` (line 1149-1152) already had a generic autofocus that predates
your change:

```js
function openDrawer(){
  drawerOpen = true; renderDrawer();
  setTimeout(() => { const root = $("#drawerRoot"); const f = root && root.querySelector &&
    root.querySelector("input, select, textarea, button.typetab"); if(f && f.focus) f.focus(); }, 0);
}
```

`renderDrawer()` runs synchronously inside `openDrawer()`, so **your** `setTimeout(…, 0)` is
queued first and this generic one is queued second — it runs last and wins, focusing the
first input in the drawer, which is the date field.

**Fix.** Give the specific choice priority over the generic fallback. Either:

- have `renderDrawer()` record its preferred target (e.g. on a module-level variable or a
  `data-` attribute) and make `openDrawer()`'s fallback focus it when set, falling back to
  the current `querySelector` only when it is not; **or**
- move the focus decision entirely into `openDrawer()`, switching on `formType`.

Either is fine. What must not remain is two independent `setTimeout(…, 0)` handlers racing
for the same thing.

**Verify in a browser, not by reading the code.** Open the app, load the example data, press
`L`, and type a serial character immediately — it must land in the serials field with no
click. Press `E` — focus must be on **All** or the first row checkbox. Do the same by
clicking the **Add parts** / **Remove parts** buttons on a tank card. All four paths.

---

## 2. Item 5: the suggestion count in the header is the pre-dedupe number

The dedupe and the cap both work — 6 raw suggestions collapse to 4, three render, and a
"show all (1)" expander holds the rest. But the heading still reads:

```
SUGGESTED NEXT ACTIONS · 6
```

`suggestionsPanel()` line 1662 builds the heading from `sugs.length`, which is the count
**before** your per-bath dedupe. The operator reads 6 and can only ever reach 4.

**Fix.** Count after dedupe. The heading should say `· 4` for the example dataset.

**Verify.** With the example data loaded, the number in the heading equals the number of
suggestions reachable once "show all" is expanded.

---

## Constraints

- `index.html` only. Do not touch `audit/cases.mjs`, `audit/harness.mjs`, `audit/NOTES.md`,
  or this file.
- Do not change anything that round 6 got right — items 1, 3, 4 and 6 are verified working.
- Do not restyle.

## Verify before pushing — all three must be clean

```bash
node audit/cases.mjs --fails     # TOTALS pass=2000 fail=0 threw=0
node audit/harness.mjs           # 22 pass, 0 fail
npm test                         # domain + smoke green
```

## Report

**Overwrite** `audit/RESULTS.tsv`:

```
ITEM1	done|skipped	<how you resolved the focus race, and which of the four paths you tested in a browser>
ITEM2	done|skipped	<one line>
CASES	pass=<n>	fail=<n>
HARNESS	pass=<n>	fail=<n>
NPMTEST	pass|fail
NOTES	<anything you had to decide, or "none">
```

Do not report the focus item as done unless you have observed the focus land correctly in a
running browser. Reading the code is not sufficient — that is exactly how this one was
missed last round.

Then commit and push to `claude/cloudflare-pages-hosting-tajgyw`.
