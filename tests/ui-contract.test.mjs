import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");

test("bath status and close controls use separate CSS classes", () => {
  assert.match(html, /\.dot\.x\{background:/, "inactive bath status keeps its dot state");
  assert.match(html, /\.closebtn\{width:34px;height:34px;/, "close controls keep their touch target");
  assert.doesNotMatch(html, /\n\s*\.x(?:\{|:)/, "a generic .x rule must not resize inactive status dots");
  assert.doesNotMatch(html, /class:\s*"x"/, "close controls must not reuse the dot state class");
});

test("nothing on the floor is entered or displayed as a serial number", () => {
  assert.doesNotMatch(html, /function parseSerials\b/, "the serial parser is gone");
  assert.doesNotMatch(html, /function chipInput\b/, "the serial chip entry is gone");
  assert.doesNotMatch(html, /\.chipbox\{/, "the chip-box styling is gone with it");
  assert.doesNotMatch(html, /placeholder:"type or paste serials/, "no field asks anyone to paste serials");
  assert.match(html, /placeholder:"e\.g\. 7261"/, "a set number is typed instead");
  assert.match(html, /placeholder:"e\.g\. 6"/, "and a plain count of parts beside it");
});

test("the parts entry is a set number and a count", () => {
  assert.match(html, /function setAndQtyFields\(/, "one helper owns both fields everywhere they are asked for");
  assert.match(html, /F\.set\[1\] ?=|set:\["set","Set No\.","set"\]/, "the set field is labelled Set No.");
  assert.match(html, /qty:\["qty","Number of parts","qty"\]/, "the count field is labelled Number of parts");
  assert.match(html, /type:"number", min:"1", step:"1"/, "a count is a positive whole number");
});

test("the waiting area offers whole sets, not a list of parts to tick", () => {
  assert.match(html, /Waiting area — " \+ groups\.length \+ " set/, "the bench is grouped by set");
  assert.match(html, /tap to fill this entry/, "one tap fills the set number and the count");
  assert.doesNotMatch(html, /event-waiting-parts/, "the single-pick waiting-area select is gone");
  assert.doesNotMatch(html, /box\.addMany = /, "the bulk serial-chip helpers are gone");
});

test("a removal says how many parts come out of each lot", () => {
  assert.match(html, /function lotQtyRow\(/, "removal and move share one quantity row");
  assert.match(html, /class:"contents picklist"/, "a bath's lots render as a list");
  assert.match(html, /\.picklist\{max-height:min\([^)]+\);overflow-y:auto\}/, "a long list scrolls inside the drawer");
  assert.match(html, /"Parts of set " \+ r\.set \+ " to take from bath "/, "each quantity box is labelled");
  assert.match(html, /Leave a set at 0 and it stays in the tank/, "leaving parts in is explained, not implied");
});

test("a background sync repaint cannot move the operator's place", () => {
  assert.match(html, /function renderInPlace\(/, "the poll repaints through a scroll-preserving path");
  assert.match(html, /window\.scrollTo\(x, y\)/, "the window scroll offset is restored");
  assert.match(html, /keepDrawer: drawerOpen && formType != null/, "an open drawer is left standing");
  assert.doesNotMatch(html, /SYNC_STATE !== "syncing"\) render\(\);/, "the poll no longer calls render() unconditionally");
});
