/* Unit tests for the pure domain layer of index.html.
 *
 * The app ships as one self-contained HTML file. Rather than duplicate logic,
 * this harness extracts the DOMAIN block (and the whole <script>) straight out
 * of index.html and exercises it in Node — single source of truth, no drift.
 *
 * Run with:  npm test   (node --test tests/*.test.mjs)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");

const scriptSrc = html.slice(html.indexOf("<script>") + "<script>".length, html.lastIndexOf("</script>"));
const domStart = html.indexOf("DOMAIN START");
const domEnd = html.indexOf("DOMAIN END");
assert.ok(domStart > -1 && domEnd > domStart, "DOMAIN markers must be present in index.html");
const domainSrc = html.slice(html.indexOf("*/", domStart) + 2, html.lastIndexOf("/*", domEnd));

const EXPORTS = [
  "round","num","fmtNum","byDate","hrsBetween","hoursBetweenDT","daysBetween","fmtDate","fmtDT","nextEventId",
  "parseSerials","eventsForSerial","deriveImmersions","bathContents","pieceStatusFor","derivePieces",
  "deriveBath","deriveBaths","deriveJobCards","deriveKpis","deriveDefects","eventWarnings","bathList",
  "lookupSerial","healthyBaths","suggestRescueBath","deriveSuggestions","idleParts","parkedParts","waitingParts",
  "waxFailures","lastUnresolvedWax","waxAreasOf","unresolvedWaxAreas","TYPES","F","TYPE_PILL"
];
// eslint-disable-next-line no-new-func
const D = new Function(domainSrc + "\nreturn {" + EXPORTS.join(",") + "};")();

const CONFIG = { tempSet:90, tempTol:3, hclMin:16, hclMax:22, feMax:100, maxCycles:3, maxHours:24, maxBathAge:30, baths:["B1","B2"], operators:[] };
const NOW = "2026-04-01T00:00";
let _id = 0;
const ev = o => ({ id:++_id, eventId:(o.datetime || "").slice(0,10).replace(/-/g,"") + "-" + _id, ...o });
const load = (dt, bath, serials, extra = {}) => ev({ datetime:dt, type:"Load In", bath, serials, ...extra });
const extract = (dt, bath, items, extra = {}) => ev({ datetime:dt, type:"Extraction", bath, items, ...extra });

/* ----------------------------- harness ----------------------------- */
test("the whole <script> parses (syntax check)", () => {
  assert.doesNotThrow(() => new Function(scriptSrc));
});
test("the event schema uses Load In + Extraction, not a combined Immersion", () => {
  assert.ok(D.TYPES["Load In"] && D.TYPES["Extraction"]);
  assert.equal(D.TYPES["Immersion"], undefined);
});

/* ----------------------------- helpers ----------------------------- */
test("time + serial helpers", () => {
  assert.equal(D.hrsBetween("08:00", "15:30"), 7.5);
  assert.equal(D.hrsBetween("20:30", "02:00"), 5.5);
  assert.equal(D.hoursBetweenDT("2026-03-22T08:00", "2026-03-22T15:30"), 7.5);
  assert.equal(D.hoursBetweenDT("2026-03-22T20:00", "2026-03-23T02:00"), 6); // spans midnight/days
  assert.equal(D.daysBetween("2026-03-13", "2026-03-24"), 11);
  assert.equal(D.fmtDate("2026-03-13"), "13 Mar 26");
  assert.equal(D.nextEventId("2026-03-13T08:00", []), "20260313-0001");
});
test("parseSerials expands ranges and dedupes", () => {
  assert.deepEqual(D.parseSerials("7261-01..06"), ["7261-01","7261-02","7261-03","7261-04","7261-05","7261-06"]);
  assert.deepEqual(D.parseSerials("7261-01..7261-03, 7261-09"), ["7261-01","7261-02","7261-03","7261-09"]);
  assert.deepEqual(D.parseSerials("A1\nA2 A2,A3"), ["A1","A2","A3"]);
  assert.deepEqual(D.parseSerials(""), []);
  // a pasted Excel column: tabs, CRLF newlines, and quoted cells
  assert.deepEqual(D.parseSerials('7261-01\t7261-02\r\n"7261-03"\n7261-04'), ["7261-01", "7261-02", "7261-03", "7261-04"]);
});

/* --------------------- load / extract pairing ---------------------- */
test("multi-part load + partial extraction tracks what is still in the bath", () => {
  const events = [
    load("2026-03-22T08:00", "B1", ["A","B","C"], { jc:"J", component:"X" }),
    extract("2026-03-22T15:30", "B1", [{ serial:"A", result:"Cleared" }])   // pull only A
  ];
  const { records, open } = D.deriveImmersions(events, "2026-03-22T18:00");
  const byS = Object.fromEntries(records.map(r => [r.serial, r]));
  assert.equal(byS.A.open, false);
  assert.equal(byS.A.result, "Cleared");
  assert.equal(byS.A.hours, 7.5);             // out − in, from datetimes
  assert.equal(byS.B.open, true);
  assert.equal(byS.C.open, true);
  assert.equal(open.size, 2);                 // B and C are still in the tank
  assert.deepEqual(D.bathContents(events, "2026-03-22T18:00", "B1").map(r => r.serial), ["B","C"]);
  assert.equal(byS.B.elapsedH, 10);           // 08:00 -> 18:00
});
test("re-loading a re-stripped part increments its cycle count", () => {
  const events = [
    load("2026-03-22T08:00", "B1", ["A"]),
    extract("2026-03-22T10:00", "B1", [{ serial:"A", result:"Re-strip" }]),
    load("2026-03-22T11:00", "B1", ["A"]),
    extract("2026-03-22T13:00", "B1", [{ serial:"A", result:"Cleared" }])
  ];
  const { records } = D.deriveImmersions(events, NOW);
  const a = records.filter(r => r.serial === "A");
  assert.equal(a.length, 2);
  assert.deepEqual(a.map(r => r.cycle), [1, 2]);
  assert.equal(a[1].result, "Cleared");
});
test("extracting a part that was never loaded is flagged as an anomaly", () => {
  const { records } = D.deriveImmersions([extract("2026-03-22T10:00", "B1", [{ serial:"Z", result:"Cleared" }])], NOW);
  assert.equal(records.length, 1);
  assert.match(records[0].anomaly, /not in bath/);
});

/* ----------------------------- pieces ------------------------------ */
test("piece status: In bath, Cleared (first pass), Awaiting, and over-cycle routing", () => {
  const events = [
    // A: loaded, still in -> In bath
    load("2026-03-22T08:00", "B1", ["A"], { jc:"J" }),
    // B: cleared first pull -> Cleared + first pass
    load("2026-03-22T08:00", "B1", ["B"], { jc:"J" }),
    extract("2026-03-22T12:00", "B1", [{ serial:"B", result:"Cleared" }]),
    // C: pulled re-strip, not re-loaded -> Awaiting re-strip
    load("2026-03-22T08:00", "B1", ["C"], { jc:"J" }),
    extract("2026-03-22T10:00", "B1", [{ serial:"C", result:"Re-strip" }]),
    // D: three re-strip cycles -> over max -> Engineering
    load("2026-03-22T08:00", "B1", ["D"], { jc:"J" }),
    extract("2026-03-22T09:00", "B1", [{ serial:"D", result:"Re-strip" }]),
    load("2026-03-22T10:00", "B1", ["D"]),
    extract("2026-03-22T11:00", "B1", [{ serial:"D", result:"Re-strip" }]),
    load("2026-03-22T12:00", "B1", ["D"]),
    extract("2026-03-22T13:00", "B1", [{ serial:"D", result:"Re-strip" }])
  ];
  const rows = Object.fromEntries(D.derivePieces(events, CONFIG, "2026-03-22T20:00").map(r => [r.serial, r]));
  assert.equal(rows.A.status.s, "In bath");
  assert.equal(rows.A.inBath, true);
  assert.equal(rows.A.currentBath, "B1");
  assert.equal(rows.B.status.s, "Cleared");
  assert.equal(rows.B.firstPass, true);
  assert.equal(rows.C.status.s, "Awaiting re-strip");
  assert.equal(rows.D.status.s, "→ Engineering");
  assert.equal(rows.D.cycles, 3);
});
test("a scrap disposition shows on the piece", () => {
  const events = [
    load("2026-03-22T08:00", "B1", ["P"], { jc:"J" }),
    extract("2026-03-22T10:00", "B1", [{ serial:"P", result:"Re-strip" }]),
    ev({ datetime:"2026-03-23T09:00", type:"Engineering Review", serial:"P", status:"Scrap" })
  ];
  assert.equal(D.derivePieces(events, CONFIG, NOW)[0].status.s, "Scrap");
});

/* ----------------------------- baths ------------------------------- */
test("bath flags fire on iron / HCl / temp excursions, and report contents", () => {
  const events = [
    ev({ datetime:"2026-03-13T08:00", type:"Bath Fill", bath:"B1" }),
    ev({ datetime:"2026-03-13T09:00", type:"Chemistry Check", bath:"B1", temp:90, hclPct:21, fePpm:30 }),
    ev({ datetime:"2026-03-23T09:00", type:"Chemistry Check", bath:"B1", temp:85, hclPct:14, fePpm:160 }),
    load("2026-03-23T10:00", "B1", ["A","B"])
  ];
  const s = D.deriveBath(events, CONFIG, "B1", NOW);
  assert.equal(s.active, true);
  assert.equal(s.flags.length, 3);
  assert.deepEqual(s.contents.map(r => r.serial), ["A","B"]);
});
test("bath state is scoped to the current charge (resets after a refill)", () => {
  const events = [
    ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" }),
    ev({ datetime:"2026-03-05T09:00", type:"Chemistry Check", bath:"B1", temp:90, hclPct:20, fePpm:150 }),
    ev({ datetime:"2026-03-06T07:00", type:"Bath Disposal", bath:"B1", disposalReason:"Iron limit reached" }),
    ev({ datetime:"2026-03-10T08:00", type:"Bath Fill", bath:"B1" }),
    ev({ datetime:"2026-03-11T09:00", type:"Chemistry Check", bath:"B1", temp:90, hclPct:21, fePpm:20 })
  ];
  const s = D.deriveBath(events, CONFIG, "B1", NOW);
  assert.equal(s.active, true);
  assert.equal(s.lastChem.fePpm, 20);
  assert.equal(s.flags.length, 0);
});

test("bathList = no defaults; derives baths from config + the event log", () => {
  // a clean slate (no configured baths, no events) shows no baths
  assert.deepEqual(D.bathList([], { baths:[] }), []);
  // baths referenced in events appear even when none are configured
  const events = [
    ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" }),
    load("2026-03-02T08:00", "B1", ["A"]),
    ev({ datetime:"2026-03-02T09:00", type:"Transfer", bath:"B1", toBath:"B2", serials:["A"] })
  ];
  assert.deepEqual(D.bathList(events, { baths:[] }), ["B1", "B2"]);
  // configured baths come first, then any extra ones seen in data; no dupes
  assert.deepEqual(D.bathList(events, { baths:["B2", "B9"] }), ["B2", "B9", "B1"]);
  assert.equal(D.deriveBaths([], { baths:[] }, NOW).length, 0);
});

/* ------------------------------ KPIs ------------------------------- */
test("KPIs: FPY, re-strip rate, and parts-in-bath count", () => {
  const events = [
    load("2026-03-22T08:00", "B1", ["A","B"], { jc:"J" }),
    extract("2026-03-22T10:00", "B1", [{ serial:"A", result:"Cleared" }, { serial:"B", result:"Re-strip" }]),
    load("2026-03-22T11:00", "B1", ["B"]),
    extract("2026-03-22T13:00", "B1", [{ serial:"B", result:"Cleared" }]),
    load("2026-03-22T14:00", "B1", ["C"], { jc:"J" }) // C still in the tank
  ];
  const k = D.deriveKpis(events, CONFIG, "2026-03-22T20:00");
  assert.equal(k.total, 3);
  assert.equal(k.cleared, 2);
  assert.equal(k.fp, 1);                 // only A cleared on its first pull
  assert.equal(k.fpy, 33);
  assert.equal(k.inBath, 1);             // C
  assert.equal(k.dips, 4);               // A, B×2, C
  assert.equal(k.reStrip, 1);
  assert.equal(k.reStripRate, 25);
});

/* ----------------------------- quality ----------------------------- */
test("defects expand per extracted item (wax + re-strip)", () => {
  const events = [
    load("2026-03-22T08:00", "B1", ["A","B"]),
    extract("2026-03-22T10:00", "B1", [{ serial:"A", result:"Re-strip", waxFailure:"Complete mask loss" }, { serial:"B", result:"Cleared", waxFailure:"None" }])
  ];
  const defs = D.deriveDefects(events);
  assert.ok(defs.some(d => d.kind === "Wax failure" && d.serial === "A"));
  assert.ok(defs.some(d => d.kind === "Re-strip" && d.serial === "A"));
  assert.ok(!defs.some(d => d.serial === "B")); // B was clean
});

/* -------------------------- entry warnings ------------------------- */
test("eventWarnings: chemistry over limits", () => {
  const events = [ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" })];
  const w = D.eventWarnings({ type:"Chemistry Check", bath:"B1", fePpm:160, hclPct:14, temp:80 }, events, CONFIG, NOW);
  assert.equal(w.length, 3);
  assert.ok(w.some(x => x.level === "red" && /Iron 160/.test(x.msg)));
  assert.ok(w.some(x => x.level === "amber" && /HCl 14/.test(x.msg)));
});
test("eventWarnings: a load that would exceed max cycles, or re-loads a part already in a bath", () => {
  const prior = [
    ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" }),
    load("2026-03-22T08:00", "B1", ["P"]), extract("2026-03-22T09:00", "B1", [{ serial:"P", result:"Re-strip" }]),
    load("2026-03-22T10:00", "B1", ["P"]), extract("2026-03-22T11:00", "B1", [{ serial:"P", result:"Re-strip" }]),
    load("2026-03-22T12:00", "B1", ["P"]), extract("2026-03-22T13:00", "B1", [{ serial:"P", result:"Re-strip" }]),
    load("2026-03-22T14:00", "B1", ["Q"]) // Q still in the bath
  ];
  const overCycle = D.eventWarnings({ type:"Load In", bath:"B1", serials:["P"] }, prior, CONFIG, NOW);
  assert.ok(overCycle.some(x => x.level === "red" && /cycle 4/.test(x.msg)));
  const alreadyIn = D.eventWarnings({ type:"Load In", bath:"B1", serials:["Q"] }, prior, CONFIG, NOW);
  assert.ok(alreadyIn.some(x => /already in bath/.test(x.msg)));
});
test("eventWarnings: extracting from a disposed bath, or a part that is not in it", () => {
  const prior = [
    ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" }),
    load("2026-03-02T08:00", "B1", ["A"]),
    ev({ datetime:"2026-03-06T07:00", type:"Bath Disposal", bath:"B1", disposalReason:"Iron limit reached" })
  ];
  const w = D.eventWarnings({ type:"Extraction", bath:"B1", items:[{ serial:"Z", result:"Cleared" }] }, prior, CONFIG, NOW);
  assert.ok(w.some(x => x.level === "red" && /disposed/.test(x.msg)));
  assert.ok(w.some(x => /not currently in bath/.test(x.msg)));
});
test("editing a load does not warn against itself", () => {
  const existing = load("2026-03-22T08:00", "B1", ["P"]);
  const w = D.eventWarnings({ ...existing }, [existing], CONFIG, NOW);
  assert.ok(!w.some(x => /already in bath/.test(x.msg)));
});

/* ---------------------- events-for-serial -------------------------- */
test("eventsForSerial finds the serial inside load/extract arrays", () => {
  const events = [
    load("2026-03-22T08:00", "B1", ["A","B"]),
    extract("2026-03-22T10:00", "B1", [{ serial:"A", result:"Cleared" }]),
    ev({ datetime:"2026-03-23T09:00", type:"Engineering Review", serial:"B", status:"Hold" })
  ];
  assert.equal(D.eventsForSerial(events, "A").length, 2);
  assert.equal(D.eventsForSerial(events, "B").length, 2);
});

/* ===================== smart layer: relationship warnings ===================== */
test("warns about disposing a bath that still holds parts", () => {
  const events = [ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" }), load("2026-03-02T08:00", "B1", ["A", "B"])];
  const w = D.eventWarnings({ type:"Bath Disposal", bath:"B1" }, events, CONFIG, NOW);
  assert.ok(w.some(x => x.level === "red" && /still holds 2 part/.test(x.msg)));
});
test("warns about re-masking a part that is currently in a bath", () => {
  const events = [ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" }), load("2026-03-02T08:00", "B1", ["A"])];
  const w = D.eventWarnings({ type:"Re-Masking", serial:"A" }, events, CONFIG, NOW);
  assert.ok(w.some(x => x.level === "red" && /extract it before re-masking/.test(x.msg)));
});
test("warns about re-loading a cleared part, or one awaiting engineering", () => {
  const cleared = [load("2026-03-02T08:00", "B1", ["A"]), extract("2026-03-02T10:00", "B1", [{ serial:"A", result:"Cleared" }])];
  assert.ok(D.eventWarnings({ type:"Load In", bath:"B1", serials:["A"] }, cleared, CONFIG, NOW).some(x => /already Cleared/.test(x.msg)));
  const overCycle = [];
  for(let c = 0; c < 3; c++){ overCycle.push(load(`2026-03-02T0${c}:00`, "B1", ["P"]), extract(`2026-03-02T0${c}:30`, "B1", [{ serial:"P", result:"Re-strip" }])); }
  assert.ok(D.eventWarnings({ type:"Load In", bath:"B1", serials:["P"] }, overCycle, CONFIG, NOW).some(x => x.level === "red" && /awaiting engineering/.test(x.msg)));
});
test("warns when an extraction time is before the part went in", () => {
  const events = [ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" }), load("2026-03-02T10:00", "B1", ["A"])];
  const w = D.eventWarnings({ type:"Extraction", bath:"B1", datetime:"2026-03-02T09:00", items:[{ serial:"A", result:"Cleared" }] }, events, CONFIG, NOW);
  assert.ok(w.some(x => x.level === "red" && /before it went in/.test(x.msg)));
});

/* ===================== smart layer: suggestions / autofill ===================== */
test("lookupSerial recovers J/C and component from history", () => {
  assert.deepEqual(D.lookupSerial([load("2026-03-01T08:00", "B1", ["A", "B"], { jc:"J7", component:"GT" })], "A"), { jc:"J7", component:"GT" });
});
test("suggestRescueBath picks a healthy bath (lowest iron), honoring exclusions", () => {
  const events = [
    ev({ datetime:"2026-03-10T08:00", type:"Bath Fill", bath:"B1" }), ev({ datetime:"2026-03-10T09:00", type:"Chemistry Check", bath:"B1", temp:90, hclPct:20, fePpm:30 }),
    ev({ datetime:"2026-03-10T08:00", type:"Bath Fill", bath:"B2" }), ev({ datetime:"2026-03-10T09:00", type:"Chemistry Check", bath:"B2", temp:90, hclPct:20, fePpm:10 })
  ];
  assert.equal(D.suggestRescueBath(events, CONFIG, "2026-03-10T12:00", ""), "B2");
  assert.equal(D.suggestRescueBath(events, CONFIG, "2026-03-10T12:00", "B2"), "B1");
});
test("deriveSuggestions: re-load an awaiting part into a suggested rescue bath", () => {
  const events = [
    ev({ datetime:"2026-03-10T08:00", type:"Bath Fill", bath:"B1" }), ev({ datetime:"2026-03-10T08:30", type:"Chemistry Check", bath:"B1", temp:90, hclPct:20, fePpm:30 }),
    ev({ datetime:"2026-03-10T08:00", type:"Bath Fill", bath:"B2" }), ev({ datetime:"2026-03-10T08:30", type:"Chemistry Check", bath:"B2", temp:90, hclPct:20, fePpm:10 }),
    load("2026-03-10T09:00", "B1", ["A"], { jc:"J", component:"C" }), extract("2026-03-10T11:00", "B1", [{ serial:"A", result:"Re-strip" }])
  ];
  const reload = D.deriveSuggestions(events, CONFIG, "2026-03-10T12:00").find(s => s.action.type === "reload");
  assert.ok(reload, "should suggest a re-load");
  assert.deepEqual(reload.action.serials, ["A"]);
  assert.equal(reload.action.bath, "B2");        // healthy, and not the bath it just came from
});
test("a wax-failed part is offered as a re-load (re-mask is handled in the load form, not a separate event)", () => {
  const events = [
    ev({ datetime:"2026-03-10T08:00", type:"Bath Fill", bath:"B1" }),
    load("2026-03-10T09:00", "B1", ["A"]), extract("2026-03-10T11:00", "B1", [{ serial:"A", result:"Re-strip", waxFailure:"Complete mask loss" }])
  ];
  const sug = D.deriveSuggestions(events, CONFIG, "2026-03-10T12:00");
  const r = sug.find(s => s.action.type === "reload" && s.action.serials.includes("A"));
  assert.ok(r, "the part is offered for re-load");
  assert.match(r.detail, /re-mask/);
  assert.ok(!sug.some(s => s.action.type === "remask"), "no standalone re-mask suggestion");
});
/* ===================== wax failure -> re-mask -> re-strip chain ===================== */
test("a part is 'Needs re-mask' after a wax failure, until a re-masking resolves it", () => {
  const fail = [
    ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" }),
    load("2026-03-02T08:00", "B1", ["A"], { jc:"J" }),
    extract("2026-03-02T10:00", "B1", [{ serial:"A", result:"Re-strip", wax:["Cooling holes"] }])
  ];
  assert.equal(D.lastUnresolvedWax(fail, "A").area, "Cooling holes");
  assert.equal(D.derivePieces(fail, CONFIG, NOW)[0].status.s, "Needs re-mask");

  const resolved = fail.concat(ev({ datetime:"2026-03-02T12:00", type:"Re-Masking", serial:"A" }));
  assert.equal(D.lastUnresolvedWax(resolved, "A"), null);
  assert.equal(D.derivePieces(resolved, CONFIG, NOW)[0].status.s, "Awaiting re-strip");
});
test("re-loading a part with an unresolved wax failure is flagged red", () => {
  const events = [
    ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" }),
    load("2026-03-02T08:00", "B1", ["A"]),
    extract("2026-03-02T10:00", "B1", [{ serial:"A", result:"Re-strip", waxFailure:"Partial mask loss" }])
  ];
  assert.ok(D.eventWarnings({ type:"Load In", bath:"B1", serials:["A"] }, events, CONFIG, NOW).some(x => x.level === "red" && /wax failure/.test(x.msg)));
});
test("re-masking recorded inside a Load In resolves the wax failure", () => {
  const failed = [
    ev({ datetime:"2026-03-02T08:00", type:"Bath Fill", bath:"B1" }),
    load("2026-03-02T08:30", "B1", ["A"]),
    extract("2026-03-02T10:00", "B1", [{ serial:"A", result:"Re-strip", wax:[{ area:"Cooling holes", severity:"Complete mask loss" }] }])
  ];
  // loading A again with no re-mask is still flagged red
  assert.ok(D.eventWarnings({ type:"Load In", bath:"B1", serials:["A"] }, failed, CONFIG, NOW).some(x => x.level === "red" && /wax failure/.test(x.msg)));
  // ticking the re-masked area in the load clears the warning...
  assert.ok(!D.eventWarnings({ type:"Load In", bath:"B1", serials:["A"], remask:[{ serial:"A", areas:["Cooling holes"] }] }, failed, CONFIG, NOW).some(x => /wax failure/.test(x.msg)));
  // ...and once committed, the part is no longer Needs re-mask
  const resolved = failed.concat(ev({ datetime:"2026-03-02T11:00", type:"Load In", bath:"B1", serials:["A"], remask:[{ serial:"A", areas:["Cooling holes"] }] }));
  assert.equal(D.unresolvedWaxAreas(resolved, "A").length, 0);
});

test("wax failure is tracked per masked area; a re-mask resolves only the areas it covers", () => {
  const cfg = { ...CONFIG, maskAreas:["Cooling holes", "Part body"] };
  const events = [
    ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" }),
    load("2026-03-02T08:00", "B1", ["A"]),
    extract("2026-03-02T10:00", "B1", [{ serial:"A", result:"Re-strip", wax:["Cooling holes", "Part body"] }])
  ];
  assert.deepEqual(D.unresolvedWaxAreas(events, "A").map(x => x.area).sort(), ["Cooling holes", "Part body"]);
  assert.equal(D.derivePieces(events, cfg, NOW)[0].status.s, "Needs re-mask");

  const partial = events.concat(ev({ datetime:"2026-03-02T11:00", type:"Re-Masking", serial:"A", areas:["Cooling holes"] }));
  assert.deepEqual(D.unresolvedWaxAreas(partial, "A").map(x => x.area), ["Part body"]);
  assert.equal(D.derivePieces(partial, cfg, NOW)[0].status.s, "Needs re-mask", "part body still unresolved");

  const full = partial.concat(ev({ datetime:"2026-03-02T12:00", type:"Re-Masking", serial:"A", areas:["Part body"] }));
  assert.equal(D.unresolvedWaxAreas(full, "A").length, 0);
  assert.equal(D.derivePieces(full, cfg, NOW)[0].status.s, "Awaiting re-strip");
});
test("waxAreasOf reads the simple name list, the old {area} shape, and the legacy field", () => {
  assert.deepEqual(D.waxAreasOf({ wax:["Cooling holes", "Part body"] }), ["Cooling holes", "Part body"]);
  assert.deepEqual(D.waxAreasOf({ wax:[{ area:"Cooling holes" }] }), ["Cooling holes"]);   // old shape still readable
  assert.deepEqual(D.waxAreasOf({ waxFailure:"Complete mask loss" }), ["Mask"]);            // legacy single field
  assert.deepEqual(D.waxAreasOf({ waxFailure:"None" }), []);
  assert.deepEqual(D.waxAreasOf({}), []);
});
test("a whole-part re-masking (no areas) resolves every failed area", () => {
  const events = [
    load("2026-03-02T08:00", "B1", ["A"]),
    extract("2026-03-02T10:00", "B1", [{ serial:"A", result:"Re-strip", wax:["Cooling holes", "Part body"] }]),
    ev({ datetime:"2026-03-02T11:00", type:"Re-Masking", serial:"A" })   // no areas => covers all
  ];
  assert.equal(D.unresolvedWaxAreas(events, "A").length, 0);
});

/* ===================== bath capacity & iron projection ===================== */
test("bath capacity: free slots, and a load that would overfill warns", () => {
  const cfg = { ...CONFIG, bathCapacity:2 };
  const events = [ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" }), load("2026-03-02T08:00", "B1", ["A", "B"])];
  const s = D.deriveBath(events, cfg, "B1", NOW);
  assert.equal(s.capacity, 2);
  assert.equal(s.free, 0);
  assert.ok(D.eventWarnings({ type:"Load In", bath:"B1", serials:["C"] }, events, cfg, NOW).some(x => x.level === "red" && /capacity 2/.test(x.msg)));
});
test("suggestRescueBath skips a full bath even if it has the lowest iron", () => {
  const cfg = { ...CONFIG, bathCapacity:1 };
  const events = [
    ev({ datetime:"2026-03-10T08:00", type:"Bath Fill", bath:"B1" }), ev({ datetime:"2026-03-10T09:00", type:"Chemistry Check", bath:"B1", temp:90, hclPct:20, fePpm:10 }),
    ev({ datetime:"2026-03-10T08:00", type:"Bath Fill", bath:"B2" }), ev({ datetime:"2026-03-10T09:00", type:"Chemistry Check", bath:"B2", temp:90, hclPct:20, fePpm:30 }),
    load("2026-03-10T10:00", "B1", ["X"])
  ];
  assert.equal(D.suggestRescueBath(events, cfg, "2026-03-10T12:00", ""), "B2");
});

test("deriveSuggestions: dispose a spent bath, extract an over-hours part, review an over-limit piece", () => {
  const spent = [ev({ datetime:"2026-03-10T08:00", type:"Bath Fill", bath:"B1" }), ev({ datetime:"2026-03-11T08:00", type:"Chemistry Check", bath:"B1", temp:90, hclPct:20, fePpm:160 })];
  assert.ok(D.deriveSuggestions(spent, CONFIG, "2026-03-11T12:00").some(s => s.action.type === "dispose" && s.action.bath === "B1"));

  const stuck = [ev({ datetime:"2026-03-10T08:00", type:"Bath Fill", bath:"B1" }), load("2026-03-10T08:00", "B1", ["A"])];
  const overH = D.deriveSuggestions(stuck, CONFIG, "2026-03-12T08:00").find(s => s.action.type === "extract");
  assert.ok(overH && overH.action.preselect.includes("A"), "over-hours part should be offered for extraction");

  const eng = [];
  for(let c = 0; c < 3; c++){ eng.push(load(`2026-03-10T0${c}:00`, "B1", ["P"]), extract(`2026-03-10T0${c}:30`, "B1", [{ serial:"P", result:"Re-strip" }])); }
  assert.ok(D.deriveSuggestions(eng, CONFIG, "2026-03-10T20:00").some(s => s.action.type === "engineering" && s.action.serial === "P"));
});

/* ===================== part stop conditions ===================== */
test("a part over the cycle/hour limit is held for engineering with a stated reason", () => {
  const events = [];
  for(let c = 0; c < 3; c++){ events.push(load(`2026-03-02T0${c}:00`, "B1", ["P"]), extract(`2026-03-02T0${c}:30`, "B1", [{ serial:"P", result:"Re-strip" }])); }
  const p = D.derivePieces(events, CONFIG, NOW)[0];
  assert.equal(p.status.s, "→ Engineering");
  assert.match(p.status.reason, /3 cycles/);
});

/* ===================== idle parts (waiting to go back in) ===================== */
test("idleParts lists parts that came out and are not finished (awaiting / needs re-mask)", () => {
  const events = [
    ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" }),
    load("2026-03-02T08:00", "B1", ["A", "B", "C", "D"]),
    extract("2026-03-02T10:00", "B1", [
      { serial:"A", result:"Cleared" },                          // done -> not idle
      { serial:"B", result:"Re-strip" },                         // awaiting re-strip -> idle
      { serial:"C", result:"Re-strip", wax:["Cooling holes"] }   // needs re-mask -> idle
    ])
    // D never extracted -> still in bath -> not idle
  ];
  assert.deepEqual(D.idleParts(events, CONFIG, "2026-03-02T12:00").map(p => p.serial).sort(), ["B", "C"]);
});

/* ===================== parked parts (received in the tech's area) ===================== */
test("parkedParts lists received serials until they are loaded into a bath", () => {
  const base = [ev({ datetime:"2026-03-20T08:00", type:"Parts Received", serials:["P1", "P2", "P3"], jc:"J9", component:"GT" })];
  assert.deepEqual(D.parkedParts(base, CONFIG, NOW).map(p => p.serial).sort(), ["P1", "P2", "P3"]);
  assert.equal(D.parkedParts(base, CONFIG, NOW).find(p => p.serial === "P1").jc, "J9");   // J/C carried from the received event
  const afterLoad = base.concat(load("2026-03-21T08:00", "B1", ["P1"]));
  assert.deepEqual(D.parkedParts(afterLoad, CONFIG, NOW).map(p => p.serial).sort(), ["P2", "P3"]);   // P1 drops off once loaded
});
test("waitingParts = parts out of a bath without re-entry, plus parked serials", () => {
  const events = [
    ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" }),
    ev({ datetime:"2026-03-02T07:00", type:"Parts Received", serials:["W9"], jc:"JX" }),   // parked
    load("2026-03-02T08:00", "B1", ["A", "B", "C", "D"]),
    extract("2026-03-02T10:00", "B1", [
      { serial:"A", result:"Cleared" },                           // done -> not waiting
      { serial:"B", result:"Re-strip" },                          // out, not back -> waiting
      { serial:"C", result:"Re-strip", wax:["Cooling holes"] }    // out, needs re-mask -> waiting
    ])
    // D is still in the bath -> not waiting
  ];
  const w = D.waitingParts(events, CONFIG, "2026-03-02T12:00");
  const byS = Object.fromEntries(w.map(p => [p.serial, p]));
  assert.deepEqual(w.map(p => p.serial).sort(), ["B", "C", "W9"]);
  assert.equal(byS.B.kind, "awaiting re-strip");
  assert.equal(byS.B.lastBath, "B1");           // remembers where it came from
  assert.equal(byS.C.kind, "needs re-mask");
  assert.equal(byS.W9.kind, "received");
  // once a waiting part goes back into a bath, it leaves the waiting area
  const back = events.concat(load("2026-03-02T11:00", "B1", ["B"], { remask:[] }));
  assert.ok(!D.waitingParts(back, CONFIG, "2026-03-02T12:00").some(p => p.serial === "B"));
});

/* ===================== move parts to another bath (Transfer) ===================== */
test("a Transfer moves parts to another bath, continuing the same cycle (not a new dip)", () => {
  const events = [
    ev({ datetime:"2026-03-22T08:00", type:"Bath Fill", bath:"B1" }),
    ev({ datetime:"2026-03-22T08:00", type:"Bath Fill", bath:"B2" }),
    load("2026-03-22T08:00", "B1", ["A", "B"], { jc:"J" }),
    ev({ datetime:"2026-03-22T10:00", type:"Transfer", bath:"B1", toBath:"B2", serials:["A"] })
  ];
  assert.deepEqual(D.bathContents(events, "2026-03-22T12:00", "B2").map(r => r.serial), ["A"]); // A moved into B2
  assert.deepEqual(D.bathContents(events, "2026-03-22T12:00", "B1").map(r => r.serial), ["B"]); // B stays in B1
  const pa = D.derivePieces(events, CONFIG, "2026-03-22T12:00").find(p => p.serial === "A");
  assert.equal(pa.status.s, "In bath");
  assert.equal(pa.currentBath, "B2");
  assert.equal(pa.cycles, 1);                 // the move did NOT add a strip cycle
  const cleared = events.concat(extract("2026-03-22T14:00", "B2", [{ serial:"A", result:"Cleared" }]));
  const pc = D.derivePieces(cleared, CONFIG, "2026-03-22T16:00").find(p => p.serial === "A");
  assert.equal(pc.status.s, "Cleared");
  assert.equal(pc.cycles, 1);
  assert.equal(pc.firstPass, true);           // moved then cleared, never re-stripped
});
test("eventWarnings: moving to the same bath, or a part not in the source, is flagged", () => {
  const events = [
    ev({ datetime:"2026-03-22T08:00", type:"Bath Fill", bath:"B1" }),
    ev({ datetime:"2026-03-22T08:00", type:"Bath Fill", bath:"B2" }),
    load("2026-03-22T08:00", "B1", ["A"])
  ];
  assert.ok(D.eventWarnings({ type:"Transfer", bath:"B1", toBath:"B1", serials:["A"] }, events, CONFIG, NOW).some(x => x.level === "red" && /same bath/.test(x.msg)));
  assert.ok(D.eventWarnings({ type:"Transfer", bath:"B1", toBath:"B2", serials:["Z"] }, events, CONFIG, NOW).some(x => /not currently in bath/.test(x.msg)));
});
