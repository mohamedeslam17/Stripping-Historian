/* Audit harness — reviewer-authored, verified against main.
 *
 * Run:  node audit/harness.mjs
 *
 * Fixtures here are correct: exports are derived from the file (not hardcoded),
 * baths are filled inside the age window, and every signature matches the DOMAIN
 * block. Do not rewrite the fixtures — add cases using the helpers provided.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");
const ds = html.indexOf("DOMAIN START"), de = html.indexOf("DOMAIN END");
const src = html.slice(html.indexOf("*/", ds) + 2, html.lastIndexOf("/*", de));
// Derive exports from the source so a renamed/removed function never nukes the run.
const names = [...src.matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
const D = new Function(src + "\nreturn {" + names.join(",") + "};")();

const CONFIG = { tempSet:90, tempTol:3, hclMin:16, hclMax:22, feMax:100, maxCycles:3,
  maxHours:24, maxBathAge:30, bathCapacity:12, baths:["B1","B2","B3"], operators:[],
  maskAreas:["Cooling holes","Part body"] };
const NOW = "2026-04-01T00:00";

// NOTE: baths are filled 2026-03-25 — inside the 30-day age window, so no stray
// "Age" flag contaminates unrelated cases. Only age cases fill earlier.
let _n = 0;
const mk = o => ({ id:++_n, eventId:(o.datetime||"").slice(0,10).replace(/-/g,"") + "-" + String(_n).padStart(4,"0"), ...o });
const load    = (dt, bath, set, qty, x = {}) => mk({ datetime:dt, type:"Load In", bath, set, qty, ...x });
const extract = (dt, bath, items,   x = {}) => mk({ datetime:dt, type:"Extraction", bath, items, ...x });
const fill    = (dt, bath,          x = {}) => mk({ datetime:dt, type:"Bath Fill", bath, hclAddedL:100, waterAddedL:400, ...x });
const chem    = (dt, bath,          x = {}) => mk({ datetime:dt, type:"Chemistry Check", bath, temp:90, hclPct:19, fePpm:20, ...x });
const dispose = (dt, bath,          x = {}) => mk({ datetime:dt, type:"Bath Disposal", bath, disposalReason:"Scheduled change", ...x });
const engrev  = (dt, set, qty, status, x = {}) => mk({ datetime:dt, type:"Engineering Review", set, qty, status, ...x });
const item    = (set, qty, result, wax)     => ({ set, qty, result, ...(wax ? { wax } : {}) });

// One lot per set in these fixtures, so "the status of set S1" is unambiguous.
const statusOf = (evs, set = "S1") => (D.deriveLots(evs, CONFIG, NOW).find(p => p.set === set) || {}).status?.s;
const inTank   = (evs, b) => D.bathContents(evs, NOW, b).reduce((a, r) => a + r.qty, 0);
const warn     = (draft, evs)  => D.eventWarnings(draft, evs, CONFIG, NOW).map(x => x.level);

let pass = 0, fail = 0;
const eq = (id, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if(a === e){ pass++; console.log(id + "\tPASS"); }
  else { fail++; console.log(id + "\tFAIL\texpected " + e + ", got " + a); }
};

/* ---- M: engineering disposition vs. a cleared dip ---- */
const dipCleared = [ load("2026-03-01T08:00","B1","S1",2),
                     extract("2026-03-01T18:00","B1",[item("S1",2,"Cleared")]) ];
const after = st => [...dipCleared, engrev("2026-03-02T08:00","S1",2,st)];

eq("M1", statusOf(after("Scrap")), "Scrap");
eq("M2", statusOf(after("Return to vendor")), "Returned");
eq("M3", statusOf(after("Accepted")), "Accepted");
eq("M4", statusOf(after("Hold")), "→ Engineering");
eq("M5", statusOf([...dipCleared, load("2026-03-03T08:00","B1","S1",2)]), "In bath");
eq("M7", statusOf([...dipCleared, load("2026-03-03T08:00","B1","S1",2),
                   extract("2026-03-03T18:00","B1",[item("S1",2,"Re-strip")])]), "Awaiting re-strip");
eq("M8", statusOf([ load("2026-03-01T08:00","B1","S1",2),
                    extract("2026-03-01T12:00","B1",[item("S1",2,"Re-strip")]),
                    load("2026-03-02T08:00","B1","S1",2),
                    extract("2026-03-02T12:00","B1",[item("S1",2,"Cleared")]) ]), "Cleared");
// a partial removal splits the set: half cleared, half still in the tank
eq("M9", D.deriveLots([ load("2026-03-01T08:00","B1","S1",6),
                        extract("2026-03-01T18:00","B1",[item("S1",4,"Cleared")]) ], CONFIG, NOW)
          .map(p => [p.qty, p.status.s]), [[2,"In bath"],[4,"Cleared"]]);
eq("M14", D.deriveSets([ load("2026-03-01T08:00","B1","JC1",2),
                         extract("2026-03-01T18:00","B1",[item("JC1",2,"Cleared")]),
                         engrev("2026-03-02T08:00","JC1",2,"Hold") ], CONFIG, NOW)[0].eng, 2);

/* ---- R: regressions the reviewer verified working — must stay working ---- */
const full12 = [ fill("2026-03-25T08:00","B1"), load("2026-03-25T10:00","B1","S1",12) ];
const bath12 = D.deriveBath(full12, CONFIG, "B1", NOW);

eq("R1", bath12.free, 0);
eq("R2", bath12.flags, []);
eq("R3", D.deriveBath([ fill("2026-03-25T08:00","B1"),
                        load("2026-03-25T10:00","B1","S1",13) ], CONFIG, "B1", NOW).flags,
        ["Over capacity 13/12"]);
// load is measured in part-hours: two single parts, five and six hours in
eq("R4", D.deriveBath([ fill("2026-03-25T08:00","B1"),
                        load("2026-03-25T10:00","B1","S1",1),
                        extract("2026-03-25T15:00","B1",[item("S1",1,"Cleared")]),
                        load("2026-03-26T10:00","B1","S2",1),
                        extract("2026-03-26T16:00","B1",[item("S2",1,"Cleared")]) ], CONFIG, "B1", NOW).loadH, 11);
eq("R5", D.nextEventId("2026-03-01", [{ eventId:"20260301-0001" }, { eventId:"20260301-0002" }]), "20260301-0003");

const healthy2 = [ fill("2026-03-25T08:00","B1"), chem("2026-03-30T08:00","B1",{ fePpm:20 }),
                   fill("2026-03-25T08:00","B2"), chem("2026-03-30T08:00","B2",{ fePpm:60 }) ];
eq("R6", D.suggestRescueBath(healthy2, CONFIG, NOW, "B1"), "B2");
eq("R7", D.suggestRescueBath([...healthy2, load("2026-03-26T08:00","B2","S1",12)], CONFIG, NOW, "B1"), "");
eq("R8", D.deriveSuggestions([ fill("2026-03-25T08:00","B1"),
                               chem("2026-03-30T08:00","B1",{ fePpm:150 }) ], CONFIG, NOW)
          .filter(s => s.action.type === "dispose").length, 1);

const base12 = [ fill("2026-03-25T08:00","B1"), load("2026-03-25T10:00","B1","S1",12) ];
eq("R9",  warn({ type:"Load In", bath:"B1", set:"S2", qty:1, datetime:"2026-03-27T08:00" }, base12), ["red"]);
// a back-dated load into a bath with room: soft, not a gate
const base11 = [ fill("2026-03-25T08:00","B1"), load("2026-03-25T10:00","B1","S1",11) ];
eq("R10", warn({ type:"Load In", bath:"B1", set:"S1", qty:1, datetime:"2026-03-25T09:00" }, base11), ["amber"]);

const restripHold = [ load("2026-03-01T08:00","B1","S1",2),
                      extract("2026-03-01T18:00","B1",[item("S1",2,"Re-strip")]),
                      engrev("2026-03-02T08:00","S1",2,"Hold"), fill("2026-03-25T08:00","B1") ];
eq("R11", warn({ type:"Load In", bath:"B1", set:"S1", qty:2, datetime:"2026-03-26T08:00" }, restripHold), ["red"]);
eq("R12", statusOf([ load("2026-03-01T08:00","B1","S1",2),
                     extract("2026-03-02T09:00","B1",[item("S1",2,"Re-strip")]) ]), "→ Engineering");
eq("R13", D.deriveImmersions(dipCleared, NOW).records[0].hours, 10);
eq("R14", D.deriveImmersions(dipCleared, NOW).open.size, 0);
eq("R15", inTank(full12, "B1"), 12);

console.log("TOTALS\tpass=" + pass + "\tfail=" + fail);
process.exit(fail ? 1 : 0);
