/* Unit tests for the pure domain layer of index.html.
 *
 * The app ships as one self-contained HTML file. Rather than duplicate logic,
 * this harness extracts the DOMAIN block (and the whole <script>) straight out
 * of index.html and exercises it in Node — single source of truth, no drift.
 *
 * The floor works in SETS and COUNTS, never serials: an entry is "set 7261, six
 * parts". The unit the domain tracks is therefore a LOT — N parts of one set
 * sharing a place and a history — and most of what follows is about lots
 * splitting when only some of them come out, and merging back when they go in.
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
  "round","num","fmtNum","byDate","hrsBetween","hoursBetweenDT","minsBetweenDT","minsBetween","daysBetween",
  "fmtDate","fmtDT","fmtMins","fmtDur","fmtParts","nextEventId",
  "parseQty","setOf","qtyOf","setList","eventsForSet",
  "deriveLotState","deriveImmersions","deriveLots","lotByKey","lotStatusFor","bathContents","dipStatus",
  "benchStock","drawPreview","planDraw","drawOrder",
  "deriveBath","deriveBaths","deriveSets","deriveKpis","deriveDefects","eventWarnings","bathList",
  "lookupSet","healthyBaths","suggestRescueBath","deriveSuggestions","waitingLots","parkedLots",
  "waxAreasOf","waxSummary","remaskAreasOf","loadRemaskAreas","unresolvedWaxAreas","maskConfigFor",
  "TYPES","F","TYPE_PILL","REMOVAL_RESULTS","WAITING_AREA"
];
// eslint-disable-next-line no-new-func
const D = new Function(domainSrc + "\nreturn {" + EXPORTS.join(",") + "};")();

const CONFIG = { tempSet:90, tempTol:3, hclMin:16, hclMax:22, feMax:100, maxCycles:3, maxHours:24, maxBathAge:30, baths:["B1","B2"], operators:[] };
const NOW = "2026-04-01T00:00";
let _id = 0;
const ev = o => ({ id:++_id, uid:"u" + _id, eventId:(o.datetime || "").slice(0,10).replace(/-/g,"") + "-" + _id, ...o });
const load = (dt, bath, set, qty, extra = {}) => ev({ datetime:dt, type:"Load In", bath, set, qty, ...extra });
const out = (dt, bath, items, extra = {}) => ev({ datetime:dt, type:"Extraction", bath, items, ...extra });
const lotsOf = (events, now = NOW) => D.deriveLots(events, CONFIG, now);
const statusCount = (events, s, now = NOW) => lotsOf(events, now).filter(r => r.status.s === s).reduce((a, r) => a + r.qty, 0);

/* ----------------------------- harness ----------------------------- */
test("the whole <script> parses (syntax check)", () => {
  assert.doesNotThrow(() => new Function(scriptSrc));
});
test("the event schema uses Load In + Extraction, not a combined Immersion", () => {
  assert.ok(D.TYPES["Load In"] && D.TYPES["Extraction"]);
  assert.equal(D.TYPES["Immersion"], undefined);
});
test("no event type asks for a serial number", () => {
  const fieldNames = Object.values(D.TYPES).flatMap(t => t.fields).map(f => f[0]);
  assert.ok(!fieldNames.includes("serial"), "no form field stores a serial");
  assert.ok(!fieldNames.includes("jc"), "the job-card field is now the set number");
  assert.ok(fieldNames.includes("set") && fieldNames.includes("qty"), "sets are entered as a number and a count");
  assert.deepEqual(D.TYPES["Load In"].fields.map(f => f[0]).slice(0, 3), ["bath", "set", "qty"]);
  assert.equal(D.F.set[1], "Set No.");
  assert.equal(D.F.qty[1], "Number of parts");
});

/* ----------------------------- helpers ----------------------------- */
test("time helpers", () => {
  assert.equal(D.hrsBetween("08:00", "15:30"), 7.5);
  assert.equal(D.hrsBetween("20:30", "02:00"), 5.5);
  assert.equal(D.hoursBetweenDT("2026-03-22T08:00", "2026-03-22T15:30"), 7.5);
  assert.equal(D.hoursBetweenDT("2026-03-22T20:00", "2026-03-23T02:00"), 6); // spans midnight/days
  assert.equal(D.daysBetween("2026-03-13", "2026-03-24"), 11);
  assert.equal(D.fmtDate("2026-03-13"), "13 Mar 26");
  assert.equal(D.nextEventId("2026-03-13T08:00", []), "20260313-0001");
  assert.equal(D.fmtMins(95), "1 h 35 min");
  assert.equal(D.fmtParts(1), "1 part");
  assert.equal(D.fmtParts(6), "6 parts");
});
test("a count is a whole number of parts, and a blank count is zero", () => {
  assert.equal(D.parseQty("6"), 6);
  assert.equal(D.parseQty(6.7), 6);
  assert.equal(D.parseQty(""), 0);
  assert.equal(D.parseQty("-3"), 0);
  assert.equal(D.qtyOf({ set:"7261", qty:"4" }), 4);
  // a half-filled form must fail its own required check, not record one part
  assert.equal(D.qtyOf({ set:"7261", qty:"" }), 0);
  assert.equal(D.qtyOf({ set:"7261" }), 1);
});
test("legacy ledgers read as sets: a job card is a set, a serial list is a count", () => {
  const legacy = { type:"Load In", jc:"7261", serials:["7261-01","7261-02","7261-03"] };
  assert.equal(D.setOf(legacy), "7261");
  assert.equal(D.qtyOf(legacy), 3);
  assert.equal(D.setOf({ set:"7440", jc:"ignored" }), "7440");   // `set` wins when both are present
});
test("setList offers every set the ledger knows, numerically ordered", () => {
  const events = [load("2026-03-02T08:00", "B1", "7440", 2), load("2026-03-01T08:00", "B1", "7261", 6),
    ev({ datetime:"2026-03-03T08:00", type:"Bath Fill", bath:"B1" })];
  assert.deepEqual(D.setList(events), ["7261", "7440"]);
});

/* --------------------- load / removal pairing ---------------------- */
test("a load puts one lot in the tank and a partial removal splits it", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 6, { component:"X" }),
    out("2026-03-22T15:30", "B1", [{ set:"7261", qty:2, result:"Cleared" }])
  ];
  const { records, open } = D.deriveLotState(events, "2026-03-22T18:00");
  const closed = records.filter(r => !r.open);
  assert.equal(closed.length, 1);
  assert.equal(closed[0].qty, 2);
  assert.equal(closed[0].result, "Cleared");
  assert.equal(closed[0].hours, 7.5);             // out − in, from the datetimes
  assert.equal(closed[0].mins, 450);
  assert.equal(open.size, 1, "the four left behind are still one lot");
  const still = [...open.values()][0];
  assert.equal(still.qty, 4);
  assert.equal(still.elapsedH, 10);               // 08:00 -> 18:00, clock still running
  assert.deepEqual(D.bathContents(events, "2026-03-22T18:00", "B1").map(r => [r.set, r.qty]), [["7261", 4]]);
});
test("parts left at zero simply stay in — the tank total is what is left", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 6),
    out("2026-03-22T15:30", "B1", [{ set:"7261", qty:2, result:"Cleared" }]),
    out("2026-03-22T18:00", "B1", [{ set:"7261", qty:1, result:"Re-strip" }])
  ];
  assert.equal(D.deriveBath(events, CONFIG, "B1", "2026-03-22T19:00").inTank, 3);
});
test("re-loading a re-stripped lot increments its cycle count and carries its clock", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 4),
    out("2026-03-22T10:00", "B1", [{ set:"7261", qty:4, result:"Re-strip" }]),   // 120 min
    load("2026-03-22T11:00", "B1", "7261", 4),
    out("2026-03-22T13:00", "B1", [{ set:"7261", qty:4, result:"Cleared" }])     // 120 min
  ];
  const rows = lotsOf(events);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cycles, 2);
  assert.equal(rows[0].totalMins, 240, "cumulative immersion adds up across both dips");
  assert.equal(rows[0].status.s, "Cleared");
  const cycles = D.deriveLotState(events, NOW).records.map(r => r.cycle);
  assert.deepEqual(cycles, [1, 2]);
});
test("a re-load draws the longest-waiting parts of the set first", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 6),
    out("2026-03-22T12:00", "B1", [{ set:"7261", qty:2, result:"Re-strip" }]),   // waiting since 12:00
    out("2026-03-22T14:00", "B1", [{ set:"7261", qty:4, result:"Re-strip" }])    // waiting since 14:00
  ];
  const plan = D.drawPreview(events, CONFIG, NOW, "7261", 3);
  assert.equal(plan.fresh, 0);
  assert.deepEqual(plan.picks.map(p => p.qty), [2, 1], "the 12:00 pair goes first, then one of the 14:00 four");
});
test("tapping a bench lot loads THOSE parts, not merely that many of the set", () => {
  const events = [
    ev({ datetime:"2026-03-20T08:00", type:"Parts Received", set:"7501", qty:5 }),        // waiting longest
    load("2026-03-22T08:00", "B1", "7501", 2, { maskAreas:["Cooling holes"] }),            // 2 of the 5 go in
    out("2026-03-22T10:00", "B1", [{ set:"7501", qty:2, result:"Re-strip", wax:["Cooling holes"] }])
  ];
  // by default the longest-waiting parts go first: the three never-dipped ones
  assert.deepEqual(D.drawPreview(events, CONFIG, NOW, "7501", 2).wax, [],
    "the default draw takes the parts with no wax problem");
  // but pointing at the lot that needs a re-mask must load THAT lot
  const remaskLot = D.deriveLots(events, CONFIG, NOW).find(r => r.status.s === "Needs re-mask");
  const aimed = D.drawPreview(events, CONFIG, NOW, "7501", 2, [remaskLot.key]);
  assert.deepEqual(aimed.wax, ["Cooling holes"]);
  assert.deepEqual(aimed.picks.map(p => p.key), [remaskLot.key]);
  // and the gate fires on the aimed load, so it cannot go back in unmasked
  const draft = { type:"Load In", datetime:"2026-03-22T11:00", bath:"B1", set:"7501", qty:2, from:[remaskLot.key] };
  assert.ok(D.eventWarnings(draft, events, CONFIG, NOW).some(w => w.level === "red" && /re-mask it before re-loading/i.test(w.msg)));
  // the saved event draws from the lot it named
  const after = D.deriveLots(events.concat([ev({ ...draft, remask:["Cooling holes"] })]), CONFIG, NOW);
  assert.equal(after.find(r => r.inBath).cycles, 2, "the re-masked pair went in, on its second cycle");
  assert.equal(after.find(r => r.status.s === "Waiting").qty, 3, "the three never-dipped parts stayed on the bench");
});
test("a stale source key falls back to the ordinary draw order", () => {
  const events = [ev({ datetime:"2026-03-20T08:00", type:"Parts Received", set:"7501", qty:3 })];
  const plan = D.drawPreview(events, CONFIG, NOW, "7501", 2, ["a-lot-that-no-longer-exists"]);
  assert.equal(plan.drawn, 2);
  assert.equal(plan.fresh, 0);
});
test("asking for more parts than are waiting records the extra as new", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 2),
    out("2026-03-22T12:00", "B1", [{ set:"7261", qty:2, result:"Re-strip" }])
  ];
  const plan = D.drawPreview(events, CONFIG, NOW, "7261", 5);
  assert.equal(plan.drawn, 2);
  assert.equal(plan.fresh, 3);
  const after = lotsOf(events.concat([load("2026-03-22T13:00", "B1", "7261", 5)]));
  assert.equal(after.reduce((a, r) => a + r.qty, 0), 5);
  assert.deepEqual(after.map(r => [r.qty, r.cycles]).sort(), [[2, 2], [3, 1]].sort(),
    "the two that came back are on cycle 2; the three new ones on cycle 1");
});
test("a set with no history at all starts at cycle 1", () => {
  const rows = lotsOf([load("2026-03-22T08:00", "B1", "7261", 6)]);
  assert.equal(rows[0].cycles, 1);
  assert.equal(rows[0].status.s, "In bath");
});
test("parts of a set on the same cycle merge back into one lot when re-loaded", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 6),
    out("2026-03-22T12:00", "B1", [{ set:"7261", qty:2, result:"Re-strip" }]),   // 240 min on the clock
    out("2026-03-22T14:00", "B1", [{ set:"7261", qty:4, result:"Re-strip" }]),   // 360 min on the clock
    load("2026-03-22T15:00", "B1", "7261", 6)
  ];
  const inTank = D.bathContents(events, "2026-03-22T16:00", "B1");
  assert.equal(inTank.length, 1, "one row in the tank, not two look-alikes");
  assert.equal(inTank[0].qty, 6);
  const row = lotsOf(events, "2026-03-22T16:00")[0];
  assert.equal(row.cycles, 2);
  assert.equal(row.totalMins, 360 + 60, "the merged lot keeps the LONGEST clock of the two, plus the dip in progress");
});
test("lots on different cycles are never merged — the cycle count routes parts to engineering", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 4),
    out("2026-03-22T10:00", "B1", [{ set:"7261", qty:4, result:"Re-strip" }]),
    load("2026-03-22T11:00", "B1", "7261", 2),                                   // 2 go to cycle 2
    out("2026-03-22T12:00", "B1", [{ set:"7261", qty:2, result:"Re-strip" }]),
    load("2026-03-22T13:00", "B1", "7261", 4)                                    // 2 on cycle 3, 2 on cycle 2
  ];
  const inTank = D.bathContents(events, "2026-03-22T14:00", "B1");
  assert.equal(inTank.length, 2);
  assert.deepEqual(inTank.map(r => [r.qty, r.cycle]).sort(), [[2, 2], [2, 3]].sort());
});
test("removing parts that were never in the bath is flagged as an anomaly", () => {
  const { records } = D.deriveLotState([out("2026-03-22T10:00", "B1", [{ set:"Z", qty:2, result:"Cleared" }])], NOW);
  assert.equal(records.length, 1);
  assert.equal(records[0].qty, 2);
  assert.match(records[0].anomaly, /not in the bath/);
});
test("taking out more than are in the tank closes what is there and flags the rest", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 3),
    out("2026-03-22T10:00", "B1", [{ set:"7261", qty:5, result:"Cleared" }])
  ];
  const { records } = D.deriveLotState(events, NOW);
  assert.equal(records.filter(r => !r.anomaly).reduce((a, r) => a + r.qty, 0), 3);
  assert.equal(records.filter(r => r.anomaly).reduce((a, r) => a + r.qty, 0), 2);
  const w = D.eventWarnings(events[1], events, CONFIG, NOW);
  assert.ok(w.some(x => x.level === "red" && /only 3 are in bath B1/.test(x.msg)));
});

/* ------------------- removal reasons / report status ------------------- */
test("'Re-mask' is a removal reason that routes those parts to Needs re-mask", () => {
  const events = [
    ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" }),
    load("2026-03-02T08:00", "B1", "7261", 4, { maskAreas:["Cooling holes", "Part body"] }),
    out("2026-03-02T10:00", "B1", [{ set:"7261", qty:2, result:"Re-mask", wax:["Cooling holes", "Part body"] }])
  ];
  assert.equal(statusCount(events, "Needs re-mask"), 2);
  assert.equal(statusCount(events, "In bath"), 2, "the other two are still in the tank");
  // it's logged in Quality as a re-mask, not a wax failure
  const defs = D.deriveDefects(events);
  assert.ok(defs.some(d => d.kind === "Re-mask" && d.set === "7261" && d.qty === 2));
  assert.ok(!defs.some(d => d.kind === "Wax failure"));
});
test("a wax failure found at extraction blocks the re-dip until it is re-masked", () => {
  const base = [
    ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" }),
    load("2026-03-02T08:00", "B1", "7261", 3, { maskAreas:["Cooling holes", "Part body"] }),
    out("2026-03-02T10:00", "B1", [{ set:"7261", qty:3, result:"Re-strip", wax:["Cooling holes"] }])
  ];
  assert.equal(statusCount(base, "Needs re-mask"), 3);
  assert.deepEqual(D.drawPreview(base, CONFIG, NOW, "7261", 3).wax, ["Cooling holes"]);
  const blocked = { type:"Load In", datetime:"2026-03-02T11:00", bath:"B1", set:"7261", qty:3 };
  assert.ok(D.eventWarnings(blocked, base, CONFIG, NOW).some(w => w.level === "red" && /re-mask it before re-loading/i.test(w.msg)));
  const remasked = { ...blocked, remask:["Cooling holes"] };
  assert.ok(!D.eventWarnings(remasked, base, CONFIG, NOW).some(w => /re-mask it before re-loading/i.test(w.msg)));
  // and once recorded, the areas are clear and the lot is back in the bath
  const after = lotsOf(base.concat([ev(remasked)]));
  assert.equal(after[0].status.s, "In bath");
  assert.deepEqual(after[0].wax, []);
});
test("a re-mask clears only the areas it covers", () => {
  const base = [
    ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" }),
    load("2026-03-02T08:00", "B1", "7261", 2, { maskAreas:["Cooling holes", "Part body"] }),
    out("2026-03-02T10:00", "B1", [{ set:"7261", qty:2, result:"Re-strip", wax:["Cooling holes", "Part body"] }])
  ];
  const half = { type:"Load In", datetime:"2026-03-02T11:00", bath:"B1", set:"7261", qty:2, remask:["Cooling holes"] };
  const w = D.eventWarnings(half, base, CONFIG, NOW);
  assert.ok(w.some(x => x.level === "red" && /Part body/.test(x.msg)), "the area still bare is still a block");
  const after = lotsOf(base.concat([ev(half)]));
  assert.deepEqual(after[0].wax, ["Part body"], "the covered area is resolved, the other is not");
});
test("dip status reads Ongoing / Completed / the removal reason", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 3),
    out("2026-03-22T10:00", "B1", [{ set:"7261", qty:1, result:"Cleared" }, { set:"7261", qty:1, result:"Hold" }])
  ];
  const { records } = D.deriveLotState(events, "2026-03-22T12:00");
  assert.deepEqual(records.map(D.dipStatus).sort(), ["Completed", "Hold", "Ongoing"]);
});

/* ---------------------------- moves ------------------------------- */
test("a move to another bath continues the same dip — not a new cycle", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 4),
    ev({ datetime:"2026-03-22T10:00", type:"Transfer", bath:"B1", toBath:"B2", items:[{ set:"7261", qty:4 }] }),
    out("2026-03-22T12:00", "B2", [{ set:"7261", qty:4, result:"Cleared" }])
  ];
  const rows = lotsOf(events);
  assert.equal(rows[0].cycles, 1, "a bath-to-bath move is not a second strip cycle");
  assert.equal(rows[0].totalMins, 240, "the clock carries across the move");
  assert.equal(D.deriveKpis(events, CONFIG, NOW).dips, 4, "4 part-dips, not 8");
  const moved = D.deriveLotState(events, NOW).records.find(r => r.result === "Moved");
  assert.equal(moved.bath, "B1");
});
test("a partial move splits the lot and leaves the rest where it was", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 6),
    ev({ datetime:"2026-03-22T10:00", type:"Transfer", bath:"B1", toBath:"B2", items:[{ set:"7261", qty:2 }] })
  ];
  const now = "2026-03-22T11:00";
  assert.equal(D.deriveBath(events, CONFIG, "B1", now).inTank, 4);
  assert.equal(D.deriveBath(events, CONFIG, "B2", now).inTank, 2);
});
test("a move out to the waiting area takes the parts out of the tank", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 5),
    ev({ datetime:"2026-03-22T10:00", type:"Transfer", bath:"B1", toBath:"", items:[{ set:"7261", qty:5 }] })
  ];
  assert.equal(D.deriveBath(events, CONFIG, "B1", NOW).inTank, 0);
  assert.equal(statusCount(events, "Awaiting re-strip"), 5);
  assert.equal(D.waitingLots(events, CONFIG, NOW).reduce((a, r) => a + r.qty, 0), 5);
});

/* ------------------------ status + limits -------------------------- */
test("a lot over the cycle limit is held for engineering, with the reason stated", () => {
  const events = [];
  for(let c = 0; c < 3; c++){
    events.push(load("2026-03-2" + (2 + c) + "T08:00", "B1", "7261", 2));
    events.push(out("2026-03-2" + (2 + c) + "T10:00", "B1", [{ set:"7261", qty:2, result:"Re-strip" }]));
  }
  const row = lotsOf(events)[0];
  assert.equal(row.cycles, 3);
  assert.equal(row.status.s, "→ Engineering");
  assert.match(row.status.reason, /3 cycles ≥ 3/);
});
test("a lot over the immersion limit is held for engineering", () => {
  const events = [
    load("2026-03-22T00:00", "B1", "7261", 2),
    out("2026-03-23T02:00", "B1", [{ set:"7261", qty:2, result:"Re-strip" }])   // 26 h
  ];
  const row = lotsOf(events)[0];
  assert.equal(row.status.s, "→ Engineering");
  assert.match(row.status.reason, /≥ 24 h/);
});
test("an engineering review dispositions a quantity, splitting the lot if need be", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 4),
    out("2026-03-22T10:00", "B1", [{ set:"7261", qty:4, result:"Hold" }]),
    ev({ datetime:"2026-03-22T11:00", type:"Engineering Review", set:"7261", qty:1, status:"Scrap" }),
    ev({ datetime:"2026-03-22T11:05", type:"Engineering Review", set:"7261", qty:2, status:"Accepted" })
  ];
  assert.equal(statusCount(events, "Scrap"), 1);
  assert.equal(statusCount(events, "Accepted"), 2);
  assert.equal(lotsOf(events).reduce((a, r) => a + r.qty, 0), 4, "no parts appear or disappear");
});
test("scrapped parts are never offered back to a bath", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 3),
    out("2026-03-22T10:00", "B1", [{ set:"7261", qty:3, result:"Hold" }]),
    ev({ datetime:"2026-03-22T11:00", type:"Engineering Review", set:"7261", qty:3, status:"Scrap" })
  ];
  const plan = D.drawPreview(events, CONFIG, NOW, "7261", 3);
  assert.equal(plan.drawn, 0);
  assert.equal(plan.fresh, 3, "the ledger will not silently re-use scrapped parts");
  assert.equal(D.benchStock(events, CONFIG, NOW, "7261").qty, 0);
});
test("a set never dipped sits in the waiting area as Waiting, then becomes In bath", () => {
  const parked = [ev({ datetime:"2026-03-22T08:00", type:"Parts Received", set:"7501", qty:3, component:"X" })];
  assert.equal(statusCount(parked, "Waiting"), 3);
  assert.deepEqual(D.parkedLots(parked, CONFIG, NOW).map(r => [r.set, r.qty, r.kind]), [["7501", 3, "received"]]);
  const loaded = parked.concat([load("2026-03-22T09:00", "B1", "7501", 3)]);
  assert.equal(statusCount(loaded, "In bath"), 3);
  assert.equal(D.parkedLots(loaded, CONFIG, NOW).length, 0, "loading takes them off the bench");
  assert.equal(lotsOf(loaded).reduce((a, r) => a + r.qty, 0), 3, "the parked parts ARE the loaded parts");
});
test("the waiting area holds everything out of a tank but not finished", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 6, { maskAreas:["Cooling holes"] }),
    out("2026-03-22T10:00", "B1", [
      { set:"7261", qty:2, result:"Cleared" },
      { set:"7261", qty:2, result:"Re-strip" },
      { set:"7261", qty:2, result:"Re-mask", wax:["Cooling holes"] }
    ]),
    ev({ datetime:"2026-03-22T11:00", type:"Parts Received", set:"7501", qty:1 })
  ];
  const kinds = {};
  D.waitingLots(events, CONFIG, NOW).forEach(w => { kinds[w.kind] = (kinds[w.kind] || 0) + w.qty; });
  assert.deepEqual(kinds, { "awaiting re-strip":2, "needs re-mask":2, "received":1 });
  assert.ok(!D.waitingLots(events, CONFIG, NOW).some(w => w.set === "7261" && w.kind === "received"),
    "cleared parts drop off the bench");
});

/* ------------------------------ baths ------------------------------ */
test("bath state tracks charge, chemistry, contents and flags", () => {
  const events = [
    ev({ datetime:"2026-03-13T08:00", type:"Bath Fill", bath:"B1", hclAddedL:300, waterAddedL:700 }),
    ev({ datetime:"2026-03-14T08:00", type:"Chemistry Check", bath:"B1", temp:90, hclPct:21, fePpm:30 }),
    ev({ datetime:"2026-03-15T08:00", type:"Top-Up", bath:"B1", hclAddedL:120 }),
    load("2026-03-16T08:00", "B1", "7261", 4),
    ev({ datetime:"2026-03-17T08:00", type:"Chemistry Check", bath:"B1", temp:90, hclPct:19, fePpm:160 })
  ];
  const s = D.deriveBath(events, CONFIG, "B1", "2026-03-17T09:00");
  assert.equal(s.active, true);
  assert.equal(s.inTank, 4);
  assert.equal(s.hclAdded, 120, "top-ups since the charge, not the charge itself");
  assert.ok(s.flags.some(f => /Iron 160/.test(f)));
});
test("a bath still holding parts cannot be quietly disposed", () => {
  const events = [
    ev({ datetime:"2026-03-13T08:00", type:"Bath Fill", bath:"B1" }),
    load("2026-03-16T08:00", "B1", "7261", 4)
  ];
  const draft = { type:"Bath Disposal", datetime:"2026-03-17T08:00", bath:"B1", disposalReason:"Contamination" };
  assert.ok(D.eventWarnings(draft, events, CONFIG, NOW).some(w => w.level === "red" && /still holds 4 part/.test(w.msg)));
});
test("capacity is counted in parts, not in lots", () => {
  const cfg = { ...CONFIG, bathCapacity: 5 };
  const events = [
    ev({ datetime:"2026-03-13T08:00", type:"Bath Fill", bath:"B1" }),
    load("2026-03-16T08:00", "B1", "7261", 4)
  ];
  assert.equal(D.deriveBath(events, cfg, "B1", NOW).free, 1);
  const draft = { type:"Load In", datetime:"2026-03-16T09:00", bath:"B1", set:"7440", qty:3 };
  assert.ok(D.eventWarnings(draft, events, cfg, NOW).some(w => w.level === "red" && /would hold 7 parts \(capacity 5\)/.test(w.msg)));
});
test("bathList always shows the configured tanks, plus any found in the ledger", () => {
  assert.deepEqual(D.bathList([load("2026-03-16T08:00", "B9", "7261", 1)], CONFIG), ["B1", "B2", "B9"]);
});
test("a rescue bath is only suggested if it can actually hold the parts", () => {
  const cfg = { ...CONFIG, bathCapacity: 4 };
  const events = [
    ev({ datetime:"2026-03-13T08:00", type:"Bath Fill", bath:"B1" }),
    ev({ datetime:"2026-03-13T09:00", type:"Chemistry Check", bath:"B1", temp:90, hclPct:20, fePpm:10 }),
    ev({ datetime:"2026-03-13T08:00", type:"Bath Fill", bath:"B2" }),
    ev({ datetime:"2026-03-13T09:00", type:"Chemistry Check", bath:"B2", temp:90, hclPct:20, fePpm:20 }),
    load("2026-03-16T08:00", "B1", "7261", 3)
  ];
  assert.equal(D.suggestRescueBath(events, cfg, NOW, "", 3), "B2", "B1 has only one slot left");
  assert.equal(D.suggestRescueBath(events, cfg, NOW, "", 1), "B1", "one part still fits in the lowest-iron bath");
});

/* ------------------------------ rollups ---------------------------- */
test("KPIs count parts, not lots", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 6),
    out("2026-03-22T10:00", "B1", [{ set:"7261", qty:4, result:"Cleared" }, { set:"7261", qty:2, result:"Re-strip" }])
  ];
  const k = D.deriveKpis(events, CONFIG, NOW);
  assert.equal(k.total, 6);
  assert.equal(k.cleared, 4);
  assert.equal(k.awaiting, 2);
  assert.equal(k.inBath, 0);
  assert.equal(k.dips, 6, "six parts were dipped once each");
  assert.equal(k.fpy, 67, "4 of 6 decided parts cleared first time");
  assert.equal(k.sets, 1);
});
test("first-pass yield ignores parts still on a never-pulled first dip", () => {
  const events = [load("2026-03-22T08:00", "B1", "7261", 4)];
  const k = D.deriveKpis(events, CONFIG, NOW);
  assert.equal(k.fpyBase, 0);
  assert.equal(k.fpy, 0);
});
test("deriveSets rolls lots up into one row per set", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 6),
    out("2026-03-22T10:00", "B1", [{ set:"7261", qty:4, result:"Cleared" }, { set:"7261", qty:2, result:"Re-strip" }]),
    load("2026-03-22T08:00", "B1", "7440", 2, { component:"Y" })
  ];
  const rows = D.deriveSets(events, CONFIG, NOW);
  assert.deepEqual(rows.map(r => r.set), ["7261", "7440"]);
  const a = rows[0];
  assert.equal(a.parts, 6);
  assert.equal(a.cleared, 4);
  assert.equal(a.waiting, 2);
  assert.equal(a.fpy, 67);
  assert.equal(rows[1].component, "Y");
});
test("the quality log records the set and how many parts", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 6, { maskAreas:["Cooling holes"] }),
    out("2026-03-22T10:00", "B1", [{ set:"7261", qty:2, result:"Re-strip", wax:["Cooling holes"] }]),
    ev({ datetime:"2026-03-22T11:00", type:"Engineering Review", set:"7261", qty:1, status:"Scrap" })
  ];
  const defs = D.deriveDefects(events);
  const wax = defs.find(d => d.kind === "Wax failure");
  assert.equal(wax.set, "7261");
  assert.equal(wax.qty, 2);
  assert.ok(defs.some(d => d.kind === "Re-strip" && d.qty === 2));
  assert.ok(defs.some(d => d.kind === "Eng review" && d.qty === 1 && d.detail === "Scrap"));
  assert.ok(defs.every(d => d.serial === undefined), "no defect row carries a serial");
});

/* ---------------------------- suggestions -------------------------- */
test("suggestions group by set and carry a set + count action", () => {
  const events = [
    ev({ datetime:"2026-03-13T08:00", type:"Bath Fill", bath:"B2" }),
    ev({ datetime:"2026-03-13T09:00", type:"Chemistry Check", bath:"B2", temp:90, hclPct:20, fePpm:10 }),
    load("2026-03-22T08:00", "B1", "7261", 6),
    out("2026-03-22T10:00", "B1", [{ set:"7261", qty:6, result:"Re-strip" }])
  ];
  const sug = D.deriveSuggestions(events, CONFIG, "2026-03-22T11:00");
  const reload = sug.find(x => x.action.type === "reload");
  assert.ok(reload, "the bench is offered back to a bath");
  assert.equal(reload.action.set, "7261");
  assert.equal(reload.action.qty, 6);
  assert.equal(reload.action.bath, "B2");
  assert.match(reload.title, /6 parts of set 7261/);
  assert.ok(reload.action.serials === undefined, "no suggestion carries serials");
});
test("parts left in too long are offered for removal, by lot", () => {
  const events = [
    ev({ datetime:"2026-03-13T08:00", type:"Bath Fill", bath:"B1" }),
    load("2026-03-22T00:00", "B1", "7261", 4)
  ];
  const sug = D.deriveSuggestions(events, CONFIG, "2026-03-23T06:00");   // 30 h in
  const pull = sug.find(x => x.action.type === "extract");
  assert.ok(pull);
  assert.match(pull.title, /4 part\(s\) over 24 h/);
  const keys = D.bathContents(events, "2026-03-23T06:00", "B1").map(r => r.key);
  assert.deepEqual(pull.action.preselect, keys, "the action names the lot, so the form can prefill it");
});

/* ------------------------ back-compat with serial ledgers ----------- */
test("a serial-era ledger still derives: the job card is the set, the list is the count", () => {
  const events = [
    ev({ datetime:"2026-03-22T08:00", type:"Load In", bath:"B1", jc:"7261", component:"X",
      serials:["7261-01","7261-02","7261-03","7261-04"] }),
    ev({ datetime:"2026-03-22T15:30", type:"Extraction", bath:"B1",
      items:[{ serial:"7261-01", result:"Cleared" }, { serial:"7261-02", result:"Re-strip", wax:["Cooling holes"] }] })
  ];
  const rows = lotsOf(events, "2026-03-22T18:00");
  assert.equal(rows.reduce((a, r) => a + r.qty, 0), 4);
  assert.equal(statusCount(events, "In bath", "2026-03-22T18:00"), 2);
  assert.equal(statusCount(events, "Cleared", "2026-03-22T18:00"), 1);
  assert.equal(statusCount(events, "Needs re-mask", "2026-03-22T18:00"), 1);
  assert.equal(rows[0].set, "7261");
  assert.equal(rows[0].component, "X");
});
test("a legacy per-serial re-mask list flattens to the areas it covered", () => {
  assert.deepEqual(D.loadRemaskAreas({ remask:[{ serial:"A", areas:["Cooling holes"] }, { serial:"B", areas:["Part body"] }] }),
    ["Cooling holes", "Part body"]);
  assert.equal(D.loadRemaskAreas({ remask:[{ serial:"A", areas:[] }] }), null, "no areas named meant every area");
  assert.deepEqual(D.loadRemaskAreas({ remask:["Cooling holes"] }), ["Cooling holes"]);
  assert.deepEqual(D.loadRemaskAreas({}), []);
});
test("a legacy standalone Re-Masking event still resolves a wax failure", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 2, { maskAreas:["Cooling holes"] }),
    out("2026-03-22T10:00", "B1", [{ set:"7261", qty:2, result:"Re-strip", wax:["Cooling holes"] }]),
    ev({ datetime:"2026-03-22T11:00", type:"Re-Masking", set:"7261", qty:2, areas:["Cooling holes"] })
  ];
  assert.equal(statusCount(events, "Needs re-mask"), 0);
  assert.equal(statusCount(events, "Awaiting re-strip"), 2);
});
test("a legacy self-contained Immersion still counts as one dip", () => {
  const events = [ev({ datetime:"2026-03-22T08:00", type:"Immersion", bath:"B1", jc:"7261",
    serial:"7261-01", timeIn:"08:00", timeOut:"15:30", result:"Cleared" })];
  const row = lotsOf(events)[0];
  assert.equal(row.qty, 1);
  assert.equal(row.cycles, 1);
  assert.equal(row.totalMins, 450);
  assert.equal(row.status.s, "Cleared");
});

/* ------------------------- entry-time warnings ---------------------- */
test("chemistry out of band is flagged before it is saved", () => {
  const events = [ev({ datetime:"2026-03-13T08:00", type:"Bath Fill", bath:"B1" })];
  const w = D.eventWarnings({ type:"Chemistry Check", datetime:"2026-03-14T08:00", bath:"B1", fePpm:150, hclPct:12, temp:100 }, events, CONFIG, NOW);
  assert.ok(w.some(x => x.level === "red" && /Iron 150/.test(x.msg)));
  assert.ok(w.some(x => /Free HCl 12%/.test(x.msg)));
  assert.ok(w.some(x => /Temp 100/.test(x.msg)));
});
test("loading into a disposed bath is flagged", () => {
  const events = [
    ev({ datetime:"2026-03-13T08:00", type:"Bath Fill", bath:"B1" }),
    ev({ datetime:"2026-03-14T08:00", type:"Bath Disposal", bath:"B1", disposalReason:"Contamination" })
  ];
  const w = D.eventWarnings({ type:"Load In", datetime:"2026-03-15T08:00", bath:"B1", set:"7261", qty:2 }, events, CONFIG, NOW);
  assert.ok(w.some(x => x.level === "red" && /disposed/.test(x.msg)));
});
test("a load dated before the set's last event is flagged as back-dated", () => {
  const events = [load("2026-03-22T08:00", "B1", "7261", 2)];
  const w = D.eventWarnings({ type:"Load In", datetime:"2026-03-21T08:00", bath:"B1", set:"7261", qty:2 }, events, CONFIG, NOW);
  assert.ok(w.some(x => /dated before its last recorded event/.test(x.msg)));
});
test("asking for more parts than are waiting is a soft warning, not a block", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 2),
    out("2026-03-22T10:00", "B1", [{ set:"7261", qty:2, result:"Re-strip" }])
  ];
  const w = D.eventWarnings({ type:"Load In", datetime:"2026-03-22T11:00", bath:"B1", set:"7261", qty:5 }, events, CONFIG, NOW);
  const hit = w.find(x => /Only 2 part\(s\) of set 7261 are waiting/.test(x.msg));
  assert.ok(hit);
  assert.equal(hit.level, "amber");
});
test("a load that would bust the cycle limit is flagged", () => {
  const events = [];
  for(let c = 0; c < 3; c++){
    events.push(load("2026-03-2" + (2 + c) + "T08:00", "B1", "7261", 2));
    events.push(out("2026-03-2" + (2 + c) + "T10:00", "B1", [{ set:"7261", qty:2, result:"Re-strip" }]));
  }
  const w = D.eventWarnings({ type:"Load In", datetime:"2026-03-26T08:00", bath:"B1", set:"7261", qty:2 }, events, CONFIG, NOW);
  assert.ok(w.some(x => x.level === "red" && /would be on cycle 4/.test(x.msg)));
  assert.ok(w.some(x => x.level === "red" && /awaiting engineering review/.test(x.msg)));
});
test("moving between the same bath twice over is flagged", () => {
  const w = D.eventWarnings({ type:"Transfer", datetime:"2026-03-22T10:00", bath:"B1", toBath:"B1", items:[{ set:"7261", qty:1 }] }, [], CONFIG, NOW);
  assert.ok(w.some(x => x.level === "red" && /same bath/.test(x.msg)));
});
test("editing a recorded load does not re-run the re-load checks against its own history", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 2),
    out("2026-03-22T10:00", "B1", [{ set:"7261", qty:2, result:"Re-strip", wax:["Cooling holes"] }])
  ];
  const edit = { ...events[0], notes:"corrected" };
  const w = D.eventWarnings(edit, events, CONFIG, NOW, true);
  assert.ok(!w.some(x => /re-mask it before re-loading/.test(x.msg)));
});

/* ------------------------- lookups + config ------------------------- */
test("a set's component and mask configuration come from its own history", () => {
  const events = [
    ev({ datetime:"2026-03-20T08:00", type:"Parts Received", set:"7261", qty:2, component:"Blade", maskAreas:["Part body"] }),
    load("2026-03-22T08:00", "B1", "7261", 2)
  ];
  assert.equal(D.lookupSet(events, "7261").component, "Blade");
  assert.deepEqual(D.maskConfigFor(events, { maskAreas:["Cooling holes", "Part body"] }, "7261"), ["Part body"]);
  assert.deepEqual(D.maskConfigFor(events, { maskAreas:["Cooling holes"] }, "9999"), ["Cooling holes"], "unknown sets get every configured area");
});
test("eventsForSet picks up both the event's set and its items'", () => {
  const events = [
    load("2026-03-22T08:00", "B1", "7261", 2),
    out("2026-03-22T10:00", "B1", [{ set:"7261", qty:2, result:"Cleared" }]),
    load("2026-03-22T08:00", "B1", "7440", 2)
  ];
  assert.equal(D.eventsForSet(events, "7261").length, 2);
  assert.equal(D.eventsForSet(events, "7440").length, 1);
});
test("lot keys are stable across a re-derivation, so a removal can name its lot", () => {
  const events = [load("2026-03-22T08:00", "B1", "7261", 6)];
  const a = D.bathContents(events, "2026-03-22T10:00", "B1")[0].key;
  const b = D.bathContents(events.slice(), "2026-03-22T11:00", "B1")[0].key;
  assert.equal(a, b);
  // and naming it takes from exactly that lot
  const two = events.concat([load("2026-03-22T09:00", "B1", "7440", 2)]);
  const target = D.bathContents(two, "2026-03-22T10:00", "B1").find(r => r.set === "7440");
  const after = D.deriveBath(two.concat([out("2026-03-22T12:00", "B1", [{ lot:target.key, set:"7440", qty:2, result:"Cleared" }])]),
    CONFIG, "B1", "2026-03-22T13:00");
  assert.equal(after.inTank, 6, "the 7440 pair came out; the 7261 six are untouched");
});
