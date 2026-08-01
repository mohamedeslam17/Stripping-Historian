/* 2000 generated cases against the DOMAIN block of index.html.
 *
 *   node audit/cases.mjs            run all, print TSV
 *   node audit/cases.mjs --fails    print only non-PASS lines
 *
 * Deterministic: a seeded PRNG, so case N is the same input on every run and on
 * every machine. Re-running after a code change is a true before/after.
 *
 * Expectations are computed from an INDEPENDENT model, never from the app:
 *   A  parseSerials      250  expected list computed arithmetically
 *   B  dip pairing       450  expected open-set/cycles from a separate simulator
 *   C  piece status      400  contract rules + metamorphic relations
 *   D  bath flags        300  expected flag set computed from the config bounds
 *   E  event warnings    300  contract rules ("this state must warn at this level")
 *   F  stream invariants 300  properties that must hold for ANY event stream
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");
const ds = html.indexOf("DOMAIN START"), de = html.indexOf("DOMAIN END");
const src = html.slice(html.indexOf("*/", ds) + 2, html.lastIndexOf("/*", de));
const names = [...new Set([
  ...[...src.matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]),
  ...[...src.matchAll(/^const\s+([A-Za-z_$][\w$]*)\s*=/gm)].map(m => m[1])
])];
const D = new Function(src + "\nreturn {" + names.join(",") + "};")();

const CFG = { tempSet:90, tempTol:3, hclMin:16, hclMax:22, feMax:100, maxCycles:3,
  maxHours:24, maxBathAge:30, bathCapacity:12, baths:["B1","B2","B3"], operators:[],
  waxAreas:["Cooling holes","Part body"] };
const NOW = "2026-06-01T00:00";
const STATUSES = ["Cleared","Accepted","Scrap","Returned","→ Engineering","In bath",
                  "Needs re-mask","Awaiting re-strip","—"];

/* ---- deterministic PRNG ---- */
const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0;
  let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/* ---- fixtures. Baths fill 2026-05-20: inside the 30-day age window. ---- */
let _n = 0;
const mk = o => ({ id:++_n, eventId:(o.datetime||"").slice(0,10).replace(/-/g,"") + "-" + String(_n).padStart(4,"0"), ...o });
const load    = (dt, bath, serials, x={}) => mk({ datetime:dt, type:"Load In", bath, serials, ...x });
const extract = (dt, bath, items,   x={}) => mk({ datetime:dt, type:"Extraction", bath, items, ...x });
const fill    = (dt, bath,          x={}) => mk({ datetime:dt, type:"Bath Fill", bath, hclAddedL:100, waterAddedL:400, ...x });
const chem    = (dt, bath,          x={}) => mk({ datetime:dt, type:"Chemistry Check", bath, temp:90, hclPct:19, fePpm:20, ...x });
const dispose = (dt, bath,          x={}) => mk({ datetime:dt, type:"Bath Disposal", bath, disposalReason:"Scheduled change", ...x });
const engrev  = (dt, serial, st,    x={}) => mk({ datetime:dt, type:"Engineering Review", serial, status:st, ...x });
const item    = (serial, result, wax)     => ({ serial, result, ...(wax ? { wax } : {}) });

const day = n => "2026-05-" + String(n).padStart(2, "0");        // May 2026
const at  = (n, h) => day(n) + "T" + String(h).padStart(2, "0") + ":00";

/* ---- reporting ---- */
const onlyFails = process.argv.includes("--fails");
let pass = 0, fail = 0, threw = 0;
const out = [];
const emit = l => { if(!onlyFails || !l.endsWith("\tPASS")) out.push(l); };
const eq = (id, fn, expected) => {
  let a;
  try { a = fn(); } catch(e){ threw++; emit(id + "\tTHREW\t" + e.message); return; }
  const A = JSON.stringify(a), E = JSON.stringify(expected);
  if(A === E){ pass++; emit(id + "\tPASS"); }
  else { fail++; emit(id + "\tFAIL\texpected " + E + ", got " + A); }
};
const ok = (id, fn, why) => {                       // boolean invariant
  let a;
  try { a = fn(); } catch(e){ threw++; emit(id + "\tTHREW\t" + e.message); return; }
  if(a === true){ pass++; emit(id + "\tPASS"); }
  else { fail++; emit(id + "\tFAIL\t" + why); }
};

/* ================= A. parseSerials — 250 ================= */
{
  const prefixes = ["7261-","A","JT9-","X-","", "PN0"];
  let i = 0;
  const R = mulberry(11);
  for(; i < 150; i++){
    const p = prefixes[i % prefixes.length];
    const width = 1 + (i % 4);
    const start = 1 + Math.floor(R() * 20);
    const count = 1 + Math.floor(R() * 8);
    const end = start + count - 1;
    const pad = n => String(n).padStart(width, "0");
    const expected = [];
    for(let n = start; n <= end; n++) expected.push(p + pad(n));
    eq("A" + (i + 1), () => D.parseSerials(p + pad(start) + ".." + pad(end)), expected);
  }
  for(; i < 200; i++){                                  // comma / space / dupe lists
    const k = 1 + (i % 5);
    const list = Array.from({ length:k }, (_, j) => "S" + (i * 10 + j));
    const sep = [", ", " ", ";", "\n", ",  "][i % 5];
    const text = list.join(sep) + (i % 3 === 0 ? sep + list[0] : "");   // sometimes duplicate
    eq("A" + (i + 1), () => D.parseSerials(text), list);
  }
  for(; i < 250; i++){                                  // degenerate inputs must not throw
    const junk = ["", "  ", "..", "a..", "..b", "1..", "..2", "x..y", "-", "..",
                  "7261-01..", "'q'", '"w"', "1..1", "9..9"][i % 15];
    ok("A" + (i + 1), () => Array.isArray(D.parseSerials(junk)), "parseSerials must always return an array");
  }
}

/* ================= B. dip pairing — 450 ================= */
/* Independent simulator: a load puts each serial in a bath; an extraction of a
   listed serial removes it. Cycles = number of loads naming that serial. */
{
  for(let c = 1; c <= 450; c++){
    const R = mulberry(1000 + c);
    const nS = 1 + Math.floor(R() * 4);
    const serials = Array.from({ length:nS }, (_, j) => "S" + (j + 1));
    const baths = ["B1","B2"];
    const evs = [];
    const model = new Map();          // serial -> bath (open)
    const cycles = new Map();
    let d = 2, steps = 2 + Math.floor(R() * 6);
    for(let s = 0; s < steps; s++){
      d += 1;
      const bath = baths[Math.floor(R() * baths.length)];
      if(R() < 0.55){                                    // load
        const pick = serials.filter(() => R() < 0.6);
        if(!pick.length) continue;
        evs.push(load(at(d, 8), bath, pick));
        pick.forEach(s2 => { model.set(s2, bath); cycles.set(s2, (cycles.get(s2) || 0) + 1); });
      } else {                                           // extract
        const inBath = [...model.entries()].filter(([, b]) => b === bath).map(([s2]) => s2);
        const pick = inBath.filter(() => R() < 0.7);
        if(!pick.length) continue;
        evs.push(extract(at(d, 16), bath, pick.map(s2 => item(s2, R() < 0.5 ? "Cleared" : "Re-strip"))));
        pick.forEach(s2 => model.delete(s2));
      }
    }
    const expOpen = [...model.keys()].sort();
    const sub = c % 3;
    if(sub === 0)
      eq("B" + c, () => [...D.deriveImmersions(evs, NOW).open.keys()].sort(), expOpen);
    else if(sub === 1)
      eq("B" + c, () => {
        const recs = D.deriveImmersions(evs, NOW).records.filter(r => r.inDT);
        const got = {};
        recs.forEach(r => { got[r.serial] = (got[r.serial] || 0) + 1; });
        return Object.fromEntries(Object.entries(got).sort(([a], [b]) => a.localeCompare(b)));
      }, Object.fromEntries([...cycles.entries()].sort(([a], [b]) => a.localeCompare(b))));
    else
      eq("B" + c, () => {
        const byBath = {};
        ["B1","B2"].forEach(b => { const n = D.bathContents(evs, NOW, b).length; if(n) byBath[b] = n; });
        return byBath;
      }, (() => {
        const e = {};
        [...model.values()].forEach(b => { e[b] = (e[b] || 0) + 1; });
        return Object.fromEntries(Object.entries(e).sort());
      })());
  }
}

/* ================= C. piece status — 400 ================= */
/* Contract rules and metamorphic relations, not a re-implementation. */
{
  const results = ["Cleared","Re-strip","Hold"];
  const disps   = [null,"Accepted","Scrap","Return to vendor","Hold","Engineering review"];
  // flat index over the full cartesian product, first 200 combinations
  const combos = [];
  for(let ri = 0; ri < results.length; ri++)
  for(let di = 0; di < disps.length; di++)
  for(let cyc = 1; cyc <= 4; cyc++)
  for(let timing = 0; timing < 3; timing++) combos.push([ri, di, cyc, timing]);
  let c = 0;
  for(const [ri, di, cyc, timing] of combos.slice(0, 200)){
    c++;
    const evs = [];
    let d = 2;
    for(let k = 0; k < cyc; k++){
      evs.push(load(at(d, 8), "B1", ["S1"]));
      evs.push(extract(at(d, 16), "B1", [item("S1", k === cyc - 1 ? results[ri] : "Re-strip")]));
      d += 1;
    }
    const lastOut = at(d - 1, 16);
    if(disps[di]){
      const when = timing === 0 ? at(d - 1, 9) : timing === 1 ? lastOut : at(d, 8);
      evs.push(engrev(when, "S1", disps[di]));
    }
    const st = () => D.derivePieces(evs, CFG, NOW)[0].status.s;
    // Rule: Scrap is absolute, whatever else happened.
    if(disps[di] === "Scrap") eq("C" + c, st, "Scrap");
    // Rule: Return to vendor is absolute.
    else if(disps[di] === "Return to vendor") eq("C" + c, st, "Returned");
    // Rule: a disposition at or after the last dip governs.
    else if(disps[di] && timing >= 1)
      eq("C" + c, st, disps[di] === "Accepted" ? "Accepted" : "→ Engineering");
    // Rule: no disposition, last dip cleared → Cleared.
    else if(!disps[di] && results[ri] === "Cleared") eq("C" + c, st, "Cleared");
    // Otherwise only assert the status is a known one.
    else ok("C" + c, () => STATUSES.includes(st()), "status must be one of " + STATUSES.join("/"));
  }
  // Metamorphic: appending a Scrap always yields Scrap; shuffling input order
  // must not change the derived status; re-loading an idle part puts it In bath.
  for(let k = 1; k <= 200; k++){
    c = 200 + k;
    const R = mulberry(7000 + k);
    const evs = [];
    let d = 2;
    const n = 1 + Math.floor(R() * 3);
    for(let j = 0; j < n; j++){
      evs.push(load(at(d, 8), "B1", ["S1"]));
      if(R() < 0.8) evs.push(extract(at(d, 16), "B1", [item("S1", R() < 0.5 ? "Cleared" : "Re-strip")]));
      d += 1;
    }
    const mode = k % 4;
    if(mode === 0)
      eq("C" + c, () => D.derivePieces([...evs, engrev(at(d + 1, 8), "S1", "Scrap")], CFG, NOW)[0].status.s, "Scrap");
    else if(mode === 1){
      const shuffled = evs.slice().sort(() => R() - 0.5);
      eq("C" + c, () => D.derivePieces(shuffled, CFG, NOW)[0].status.s,
                        D.derivePieces(evs, CFG, NOW)[0].status.s);
    } else if(mode === 2)
      eq("C" + c, () => D.derivePieces([...evs, load(at(d + 1, 8), "B1", ["S1"])], CFG, NOW)[0].status.s, "In bath");
    else
      ok("C" + c, () => { const p = D.derivePieces(evs, CFG, NOW)[0]; return p.cycles >= 1 && p.hours >= 0; },
         "cycles >= 1 and hours >= 0 for a serial that was loaded");
  }
}

/* ================= D. bath flags — 300 ================= */
{
  for(let c = 1; c <= 300; c++){
    const R = mulberry(20000 + c);
    // values chosen to sit on and around every boundary
    const fe   = [20, 99, 100, 101, 150][c % 5];
    const hcl  = [19, 15.9, 16, 22, 22.1][Math.floor(c / 5) % 5];
    const temp = [90, 93, 93.1, 86.9, 87][Math.floor(c / 25) % 5];
    const ageD = [0, 29, 30, 31][Math.floor(c / 125) % 4];
    const parts = c % 17;                       // 0..16 against capacity 12
    const fillDay = 20 - ageD < 1 ? 1 : 20 - ageD;
    const evs = [fill(at(fillDay, 8), "B1"), chem(at(20, 12), "B1", { fePpm:fe, hclPct:hcl, temp })];
    if(parts) evs.push(load(at(20, 14), "B1", Array.from({ length:parts }, (_, j) => "S" + j)));
    // independent expectation
    let n = 0;
    if(fe > CFG.feMax) n++;
    if(hcl < CFG.hclMin || hcl > CFG.hclMax) n++;
    if(Math.abs(temp - CFG.tempSet) > CFG.tempTol) n++;
    const ageDays = Math.round((new Date(at(20, 12)) - new Date(at(fillDay, 8))) / 86400000);
    const trueAge = Math.round((new Date(NOW) - new Date(at(fillDay, 8))) / 86400000);
    if(trueAge >= CFG.maxBathAge) n++;
    if(parts > CFG.bathCapacity) n++;
    void ageDays;
    eq("D" + c, () => D.deriveBath(evs, CFG, "B1", NOW).flags.length, n);
  }
}

/* ================= E. event warnings — 300 ================= */
{
  const has = (w, lvl) => w.some(x => x.level === lvl);
  for(let c = 1; c <= 300; c++){
    const R = mulberry(30000 + c);
    const mode = c % 10;
    const W = (draft, evs) => D.eventWarnings(draft, evs, CFG, NOW);
    if(mode === 0){                       // dispose a bath holding parts -> red
      const k = 1 + Math.floor(R() * 5);
      const evs = [fill(at(20, 8), "B1"), load(at(21, 8), "B1", Array.from({ length:k }, (_, j) => "P" + j))];
      ok("E" + c, () => has(W({ type:"Bath Disposal", bath:"B1", datetime:at(22, 8) }, evs), "red"),
         "disposing a bath with parts inside must warn red");
    } else if(mode === 1){                // extract a serial that is not in the bath -> amber
      const evs = [fill(at(20, 8), "B1")];
      ok("E" + c, () => has(W({ type:"Extraction", bath:"B1", datetime:at(21, 8), items:[item("Q1","Cleared")] }, evs), "amber"),
         "extracting a part that is not in the bath must warn amber");
    } else if(mode === 2){                // load into a disposed bath -> red
      const evs = [fill(at(18, 8), "B1"), dispose(at(19, 8), "B1")];
      ok("E" + c, () => has(W({ type:"Load In", bath:"B1", serials:["Z1"], datetime:at(20, 8) }, evs), "red"),
         "loading into a disposed bath must warn red");
    } else if(mode === 3){                // iron over limit -> red
      const fe = CFG.feMax + 1 + Math.floor(R() * 50);
      ok("E" + c, () => has(W({ type:"Chemistry Check", bath:"B1", fePpm:fe, datetime:at(21, 8) }, [fill(at(20, 8), "B1")]), "red"),
         "iron over the limit must warn red");
    } else if(mode === 4){                // over capacity -> red
      const evs = [fill(at(20, 8), "B1"), load(at(21, 8), "B1", Array.from({ length:CFG.bathCapacity }, (_, j) => "F" + j))];
      ok("E" + c, () => has(W({ type:"Load In", bath:"B1", serials:["EXTRA"], datetime:at(22, 8) }, evs), "red"),
         "a load that would exceed capacity must warn red");
    } else if(mode === 5){                // unresolved wax blocks a re-load -> red
      const evs = [load(at(20, 8), "B1", ["W1"]),
                   extract(at(20, 16), "B1", [item("W1","Re-strip",["Cooling holes"])]), fill(at(21, 8), "B1")];
      ok("E" + c, () => has(W({ type:"Load In", bath:"B1", serials:["W1"], datetime:at(22, 8) }, evs), "red"),
         "re-loading a part with unresolved wax must warn red");
    } else if(mode === 6){                // ...and a covering re-mask clears it
      const evs = [load(at(20, 8), "B1", ["W2"]),
                   extract(at(20, 16), "B1", [item("W2","Re-strip",["Cooling holes"])]), fill(at(21, 8), "B1")];
      ok("E" + c, () => !has(W({ type:"Load In", bath:"B1", serials:["W2"], datetime:at(22, 8),
                                remask:[{ serial:"W2", areas:["Cooling holes"] }] }, evs), "red"),
         "a covering re-mask must clear the wax block");
    } else if(mode === 7){                // extraction dated before the load -> red
      const evs = [fill(at(20, 8), "B1"), load(at(21, 12), "B1", ["T1"])];
      ok("E" + c, () => has(W({ type:"Extraction", bath:"B1", datetime:at(21, 8), items:[item("T1","Cleared")] }, evs), "red"),
         "an extraction dated before the load must warn red");
    } else if(mode === 8){                // a clean load warns about nothing
      const evs = [fill(at(20, 8), "B1"), chem(at(21, 8), "B1")];
      eq("E" + c, () => W({ type:"Load In", bath:"B1", serials:["N" + c], datetime:at(22, 8) }, evs).length, 0);
    } else {                              // never throws, whatever the draft
      const types = Object.keys(D.TYPES);
      const t = types[Math.floor(R() * types.length)];
      ok("E" + c, () => Array.isArray(W({ type:t, bath:R() < 0.5 ? "B1" : undefined,
                                          serials:["A1"], items:[item("A1","Cleared")],
                                          serial:"A1", datetime:at(22, 8) },
                                        [fill(at(20, 8), "B1")])),
         "eventWarnings must return an array for every draft type");
    }
  }
}

/* ================= F. whole-stream invariants — 300 ================= */
{
  for(let c = 1; c <= 300; c++){
    const R = mulberry(40000 + c);
    const evs = [];
    const baths = ["B1","B2","B3"];
    baths.forEach(b => { if(R() < 0.8) evs.push(fill(at(2, 8), b)); });
    const open = new Map();
    let d = 3;
    const steps = 3 + Math.floor(R() * 10);
    for(let s = 0; s < steps; s++){
      d += 1; if(d > 28) d = 3;
      const b = baths[Math.floor(R() * 3)];
      const roll = R();
      if(roll < 0.4){
        const pick = Array.from({ length:1 + Math.floor(R() * 3) }, () => "S" + Math.floor(R() * 6));
        const uniq = [...new Set(pick)];
        evs.push(load(at(d, 8), b, uniq));
        uniq.forEach(x => open.set(x, b));
      } else if(roll < 0.7){
        const inB = [...open.entries()].filter(([, bb]) => bb === b).map(([x]) => x);
        if(inB.length) {
          evs.push(extract(at(d, 16), b, inB.map(x => item(x, R() < 0.5 ? "Cleared" : "Re-strip",
                                                           R() < 0.3 ? ["Cooling holes"] : null))));
          inB.forEach(x => open.delete(x));
        }
      } else if(roll < 0.8) evs.push(chem(at(d, 10), b, { fePpm:Math.floor(R() * 200), hclPct:10 + R() * 15, temp:80 + R() * 20 }));
      else if(roll < 0.9) evs.push(engrev(at(d, 11), "S" + Math.floor(R() * 6), ["Accepted","Scrap","Hold"][Math.floor(R() * 3)]));
      else evs.push(dispose(at(d, 12), b));
    }
    const inv = c % 6;
    if(inv === 0)
      ok("F" + c, () => D.deriveKpis(evs, CFG, NOW).inBath === D.deriveImmersions(evs, NOW).open.size,
         "kpis.inBath must equal the number of open dips");
    else if(inv === 1)
      ok("F" + c, () => D.derivePieces(evs, CFG, NOW).every(p => STATUSES.includes(p.status.s)),
         "every piece status must be a known status");
    else if(inv === 2)
      ok("F" + c, () => D.deriveImmersions(evs, NOW).records.every(r =>
           (r.hours == null || (r.hours >= 0 && Number.isFinite(r.hours))) &&
           (r.elapsedH == null || (r.elapsedH >= 0 && Number.isFinite(r.elapsedH)))),
         "dip hours must never be negative or NaN");
    else if(inv === 3)
      // determinism: a structurally identical but distinct array must derive identically
      ok("F" + c, () => JSON.stringify(D.derivePieces(evs.map(e => ({ ...e })), CFG, NOW).map(p => [p.serial, p.status.s]))
                     === JSON.stringify(D.derivePieces(evs, CFG, NOW).map(p => [p.serial, p.status.s])),
         "derivation must not depend on array identity (memo must not leak)");
    else if(inv === 4)
      ok("F" + c, () => { const s = D.deriveSuggestions(evs, CFG, NOW);
                          return Array.isArray(s) && s.every(x => ["red","amber","info"].includes(x.level)); },
         "every suggestion must carry a known level");
    else
      ok("F" + c, () => { const open = D.deriveImmersions(evs, NOW).open;
                          const viaBaths = CFG.baths.reduce((a, b) => a + D.bathContents(evs, NOW, b).length, 0);
                          const inCfg = [...open.values()].filter(r => CFG.baths.includes(r.bath)).length;
                          return viaBaths === inCfg; },
         "bath contents must account for every open dip in a configured bath");
  }
}

console.log(out.join("\n"));
console.log("TOTALS\tpass=" + pass + "\tfail=" + fail + "\tthrew=" + threw + "\ttotal=" + (pass + fail + threw));
process.exit(fail + threw ? 1 : 0);
