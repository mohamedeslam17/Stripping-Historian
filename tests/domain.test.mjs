/* Unit tests for the pure domain layer of index.html.
 *
 * The app ships as one self-contained HTML file. Rather than duplicate logic,
 * this harness extracts the DOMAIN block (and the whole <script>) straight out
 * of index.html and exercises it in Node — so there is a single source of truth
 * and the tests cannot drift from what actually ships.
 *
 * Run with:  node --test   (or `npm test`)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");

/* ---- extract the full script and the pure DOMAIN block ---- */
const scriptSrc = html.slice(html.indexOf("<script>") + "<script>".length, html.lastIndexOf("</script>"));

const domStart = html.indexOf("DOMAIN START");
const domEnd = html.indexOf("DOMAIN END");
assert.ok(domStart > -1 && domEnd > domStart, "DOMAIN markers must be present in index.html");
// from the end of the START comment line to the start of the END comment block
const domainSrc = html.slice(html.indexOf("*/", domStart) + 2, html.lastIndexOf("/*", domEnd));

const EXPORTS = [
  "round","num","fmtNum","byDate","hrsBetween","daysBetween","fmtDate","fmtDT","nextEventId",
  "pieceStatusFor","derivePieces","deriveBath","deriveBaths","deriveJobCards","deriveKpis",
  "deriveDefects","eventWarnings","isWaxFail","TYPES","F","TYPE_PILL"
];
// eslint-disable-next-line no-new-func
const D = new Function(domainSrc + "\nreturn {" + EXPORTS.join(",") + "};")();

const CONFIG = {
  tempSet:90, tempTol:3, hclMin:16, hclMax:22, feMax:100,
  maxCycles:3, maxHours:24, maxBathAge:30,
  baths:["B1","B2"], operators:[]
};
const NOW = "2026-04-01T00:00";
let _id = 0;
const ev = o => ({ id:++_id, eventId:(o.datetime || "").slice(0,10).replace(/-/g,"") + "-x", ...o });

/* ----------------------------- helpers ----------------------------- */
test("the whole <script> parses (syntax check)", () => {
  // new Function compiles but does not execute the body — a pure syntax gate.
  assert.doesNotThrow(() => new Function(scriptSrc));
});

test("hrsBetween handles same-day and overnight", () => {
  assert.equal(D.hrsBetween("08:00", "15:30"), 7.5);
  assert.equal(D.hrsBetween("20:30", "02:00"), 5.5);   // rolls past midnight
  assert.equal(D.hrsBetween("22:00", "22:00"), 0);
  assert.equal(D.hrsBetween("", "10:00"), 0);
});

test("daysBetween, fmtDate, nextEventId", () => {
  assert.equal(D.daysBetween("2026-03-13", "2026-03-24"), 11);
  assert.equal(D.fmtDate("2026-03-13"), "13 Mar 26");
  assert.equal(D.fmtDT("2026-03-13T08:05"), "13 Mar 26 08:05");
  assert.equal(D.nextEventId("2026-03-13T08:00", []), "20260313-0001");
  const seeded = [{ eventId:"20260313-0001" }, { eventId:"20260313-0002" }, { eventId:"20260314-0001" }];
  assert.equal(D.nextEventId("2026-03-13T10:00", seeded), "20260313-0003");
});

/* ----------------------------- pieces ------------------------------ */
test("piece status: cleared, in-progress, and over-cycle routing", () => {
  const events = [
    // P1 clears first pass
    ev({ datetime:"2026-03-22T08:00", type:"Immersion", bath:"B1", jc:"J", serial:"P1", timeIn:"08:00", timeOut:"15:30", result:"Cleared" }),
    // P2 still working (one re-strip)
    ev({ datetime:"2026-03-22T08:00", type:"Immersion", bath:"B1", jc:"J", serial:"P2", timeIn:"08:00", timeOut:"15:30", result:"Re-strip" }),
    // P3 hits 3 re-strips -> engineering
    ev({ datetime:"2026-03-22T08:00", type:"Immersion", bath:"B1", jc:"J", serial:"P3", timeIn:"08:00", timeOut:"10:00", result:"Re-strip" }),
    ev({ datetime:"2026-03-22T11:00", type:"Immersion", bath:"B1", jc:"J", serial:"P3", timeIn:"11:00", timeOut:"13:00", result:"Re-strip" }),
    ev({ datetime:"2026-03-22T14:00", type:"Immersion", bath:"B1", jc:"J", serial:"P3", timeIn:"14:00", timeOut:"16:00", result:"Re-strip" }),
    // P4 scrapped by engineering
    ev({ datetime:"2026-03-22T08:00", type:"Immersion", bath:"B1", jc:"J", serial:"P4", timeIn:"08:00", timeOut:"10:00", result:"Re-strip" }),
    ev({ datetime:"2026-03-23T09:00", type:"Engineering Review", jc:"J", serial:"P4", status:"Scrap" })
  ];
  const rows = Object.fromEntries(D.derivePieces(events, CONFIG).map(r => [r.serial, r]));
  assert.equal(rows.P1.status.s, "Cleared");
  assert.equal(rows.P1.firstPass, true);
  assert.equal(rows.P2.status.s, "In progress");
  assert.equal(rows.P2.firstPass, false);
  assert.equal(rows.P3.status.s, "→ Engineering");
  assert.equal(rows.P3.cycles, 3);
  assert.equal(rows.P4.status.s, "Scrap");
});

test("first-pass requires the chronologically first immersion to clear", () => {
  const events = [
    ev({ datetime:"2026-03-22T20:00", type:"Immersion", serial:"X", timeIn:"20:00", timeOut:"22:00", result:"Cleared" }),
    ev({ datetime:"2026-03-22T08:00", type:"Immersion", serial:"X", timeIn:"08:00", timeOut:"10:00", result:"Re-strip" })
  ];
  const row = D.derivePieces(events, CONFIG)[0];
  assert.equal(row.status.s, "Cleared");      // it did eventually clear
  assert.equal(row.firstPass, false);          // but not on the first dip
});

/* ----------------------------- baths ------------------------------- */
test("bath flags fire on iron / HCl / temp excursions", () => {
  const events = [
    ev({ datetime:"2026-03-13T08:00", type:"Bath Fill", bath:"B1" }),
    ev({ datetime:"2026-03-13T09:00", type:"Chemistry Check", bath:"B1", temp:90, hclPct:21, fePpm:30 }),
    ev({ datetime:"2026-03-23T09:00", type:"Chemistry Check", bath:"B1", temp:85, hclPct:14, fePpm:160 })
  ];
  const s = D.deriveBath(events, CONFIG, "B1", NOW);
  assert.equal(s.active, true);
  assert.equal(s.lastChem.fePpm, 160);
  assert.equal(s.flags.length, 3, "iron, HCl band, and temp band should all flag");
  assert.ok(s.flags.some(f => f.includes("Iron")));
  assert.ok(s.flags.some(f => f.includes("HCl")));
  assert.ok(s.flags.some(f => f.includes("Temp")));
});

test("bath state is scoped to the current charge (resets after a refill)", () => {
  const events = [
    ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" }),
    ev({ datetime:"2026-03-05T09:00", type:"Chemistry Check", bath:"B1", temp:90, hclPct:20, fePpm:150 }), // old, spent
    ev({ datetime:"2026-03-06T07:00", type:"Bath Disposal", bath:"B1", disposalReason:"Iron limit reached" }),
    ev({ datetime:"2026-03-10T08:00", type:"Bath Fill", bath:"B1" }),                                       // fresh charge
    ev({ datetime:"2026-03-11T09:00", type:"Chemistry Check", bath:"B1", temp:90, hclPct:21, fePpm:20 })
  ];
  const s = D.deriveBath(events, CONFIG, "B1", NOW);
  assert.equal(s.active, true, "latest fill has no later disposal");
  assert.equal(s.lastChem.fePpm, 20, "only the fresh charge's chemistry counts");
  assert.equal(s.flags.length, 0, "fresh charge is in band");
});

test("a disposed bath is not active and reports its disposal", () => {
  const events = [
    ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B2" }),
    ev({ datetime:"2026-03-06T07:00", type:"Bath Disposal", bath:"B2", disposalReason:"Scheduled change" })
  ];
  const s = D.deriveBath(events, CONFIG, "B2", NOW);
  assert.equal(s.active, false);
  assert.ok(s.disposal);
  assert.equal(s.disposal.disposalReason, "Scheduled change");
});

/* ----------------------------- KPIs -------------------------------- */
test("KPIs: FPY and re-strip rate", () => {
  const events = [
    ev({ datetime:"2026-03-22T08:00", type:"Immersion", serial:"A", timeIn:"08:00", timeOut:"10:00", result:"Cleared" }),
    ev({ datetime:"2026-03-22T08:00", type:"Immersion", serial:"B", timeIn:"08:00", timeOut:"10:00", result:"Re-strip" }),
    ev({ datetime:"2026-03-22T12:00", type:"Immersion", serial:"B", timeIn:"12:00", timeOut:"14:00", result:"Cleared" })
  ];
  const k = D.deriveKpis(events, CONFIG, NOW);
  assert.equal(k.total, 2);
  assert.equal(k.cleared, 2);
  assert.equal(k.fp, 1);                 // only A cleared first pass
  assert.equal(k.fpy, 50);
  assert.equal(k.immersions, 3);
  assert.equal(k.reStrip, 1);
  assert.equal(k.reStripRate, 33);       // 1 of 3 immersions
});

/* -------------------------- entry warnings ------------------------- */
test("eventWarnings flags an over-limit chemistry check", () => {
  const w = D.eventWarnings({ type:"Chemistry Check", bath:"B1", fePpm:160, hclPct:14, temp:80 }, [], CONFIG, NOW);
  assert.equal(w.length, 3);
  assert.ok(w.some(x => x.level === "red" && /Iron 160/.test(x.msg)));
});

test("eventWarnings flags an immersion that would exceed max cycles", () => {
  const prior = [
    ev({ datetime:"2026-03-22T08:00", type:"Immersion", serial:"P", bath:"B1", timeIn:"08:00", timeOut:"10:00", result:"Re-strip" }),
    ev({ datetime:"2026-03-22T11:00", type:"Immersion", serial:"P", bath:"B1", timeIn:"11:00", timeOut:"13:00", result:"Re-strip" }),
    ev({ datetime:"2026-03-22T14:00", type:"Immersion", serial:"P", bath:"B1", timeIn:"14:00", timeOut:"16:00", result:"Re-strip" }),
    ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" })
  ];
  const draft = { type:"Immersion", serial:"P", bath:"B1", timeIn:"17:00", timeOut:"19:00", result:"Re-strip" };
  const w = D.eventWarnings(draft, prior, CONFIG, NOW);
  assert.ok(w.some(x => x.level === "red" && /cycle 4/.test(x.msg)), "should warn this is cycle 4 > max 3");
});

test("eventWarnings warns about immersing in a disposed bath", () => {
  const prior = [
    ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" }),
    ev({ datetime:"2026-03-06T07:00", type:"Bath Disposal", bath:"B1", disposalReason:"Iron limit reached" })
  ];
  const w = D.eventWarnings({ type:"Immersion", serial:"Q", bath:"B1", timeIn:"08:00", timeOut:"10:00" }, prior, CONFIG, NOW);
  assert.ok(w.some(x => x.level === "red" && /disposed/.test(x.msg)));
});

test("editing an event does not warn against itself", () => {
  const existing = ev({ datetime:"2026-03-22T08:00", type:"Immersion", serial:"P", bath:"B1", timeIn:"08:00", timeOut:"10:00", result:"Re-strip" });
  const all = [existing, ev({ datetime:"2026-03-01T08:00", type:"Bath Fill", bath:"B1" })];
  // editing the same record (same id) -> it must be excluded from the "prior" set
  const draft = { ...existing };
  const w = D.eventWarnings(draft, all, CONFIG, NOW);
  assert.ok(!w.some(x => /cycle 2/.test(x.msg)), "the event must not count itself as a prior cycle");
});

/* --------------------------- job cards ----------------------------- */
test("job-card rollup aggregates pieces and yield", () => {
  const events = [
    ev({ datetime:"2026-03-22T08:00", type:"Immersion", jc:"J1", component:"C", serial:"A", timeIn:"08:00", timeOut:"10:00", result:"Cleared" }),
    ev({ datetime:"2026-03-22T08:00", type:"Immersion", jc:"J1", component:"C", serial:"B", timeIn:"08:00", timeOut:"10:00", result:"Re-strip" }),
    ev({ datetime:"2026-03-22T12:00", type:"Immersion", jc:"J1", component:"C", serial:"B", timeIn:"12:00", timeOut:"14:00", result:"Cleared" })
  ];
  const jc = D.deriveJobCards(events, CONFIG);
  assert.equal(jc.length, 1);
  assert.equal(jc[0].pieces, 2);
  assert.equal(jc[0].cleared, 2);
  assert.equal(jc[0].fp, 1);
  assert.equal(jc[0].fpy, 50);
  assert.equal(jc[0].reStrips, 1);
});
