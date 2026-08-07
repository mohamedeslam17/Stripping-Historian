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

test("the waiting area is a multi-select checklist, not a one-at-a-time drop-down", () => {
  assert.match(html, /class:"contents picklist"/, "waiting-area parts render as a tickable list");
  assert.match(html, /\.picklist\{max-height:\d+px;overflow-y:auto\}/, "a long bench scrolls inside the drawer");
  assert.match(html, /"Add " \+ p\.serial \+ " to this load"/, "each row has its own labelled checkbox");
  assert.doesNotMatch(html, /event-waiting-parts/, "the single-pick waiting-area select is gone");
  assert.match(html, /box\.addMany = /, "bulk add exists so ticking N parts is one update");
  assert.match(html, /box\.removeMany = /, "and unticking removes without retyping");
});

test("a background sync repaint cannot move the operator's place", () => {
  assert.match(html, /function renderInPlace\(/, "the poll repaints through a scroll-preserving path");
  assert.match(html, /window\.scrollTo\(x, y\)/, "the window scroll offset is restored");
  assert.match(html, /keepDrawer: drawerOpen && formType != null/, "an open drawer is left standing");
  assert.doesNotMatch(html, /SYNC_STATE !== "syncing"\) render\(\);/, "the poll no longer calls render() unconditionally");
});
