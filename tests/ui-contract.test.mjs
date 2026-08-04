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
