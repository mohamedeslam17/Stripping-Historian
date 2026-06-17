/* Headless smoke test: boot the real app from index.html against a tiny
 * in-memory DOM + IndexedDB shim, load the example data, then render every
 * tab, the log drawer (each form), and the modals. Catches view-layer runtime
 * errors that the syntax gate and pure-domain tests cannot.
 *
 * Run with:  node tests/smoke.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");
const scriptSrc = html.slice(html.indexOf("<script>") + "<script>".length, html.lastIndexOf("</script>"));

/* ---- minimal DOM ---- */
function elNode(tag){
  const node = {
    tag, children: [], attrs: {}, style: {}, nodeType: 1, className: "", value: "", checked: false, textContent: "", _html: "",
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    setAttribute(k, v){ this.attrs[k] = v; if(k === "value") this.value = v; },
    getAttribute(k){ return this.attrs[k]; },
    addEventListener(){}, removeEventListener(){},
    append(...ks){ ks.forEach(k => { if(k != null) this.children.push(k); }); },
    appendChild(k){ this.children.push(k); return k; },
    remove(){}, click(){}, focus(){},
    set innerHTML(v){ this._html = v; if(v === "") this.children = []; },
    get innerHTML(){ return this._html; },
    querySelector(){ return null; }
  };
  return node;
}
const registry = {};
const document = {
  createElement: tag => elNode(tag),
  createElementNS: (_ns, tag) => elNode(tag),
  createTextNode: t => ({ nodeType: 3, textContent: String(t) }),
  body: elNode("body"),
  addEventListener(){},
  querySelector(sel){ return registry[sel] || (registry[sel] = elNode("div")); }
};
const window = { print(){}, matchMedia: () => ({ matches: false }) };

/* ---- in-memory IndexedDB ---- */
const stores = { events: [], config: [] };
let autoId = 1;
function req(resultFn){ const r = {}; setTimeout(() => { try { r.result = resultFn(); r.onsuccess && r.onsuccess({ target: r }); } catch(e){ r.error = e; r.onerror && r.onerror({ target: r }); } }, 0); return r; }
function storeApi(name){
  return {
    getAll: () => req(() => stores[name].slice()),
    put: obj => req(() => {
      if(name === "events"){ if(obj.id == null) obj.id = autoId++; const i = stores.events.findIndex(e => e.id === obj.id); i >= 0 ? stores.events[i] = obj : stores.events.push(obj); return obj.id; }
      const i = stores.config.findIndex(e => e.k === obj.k); i >= 0 ? stores.config[i] = obj : stores.config.push(obj); return obj.k;
    }),
    delete: key => req(() => { stores.events = stores.events.filter(e => e.id !== key); }),
    clear: () => req(() => { stores[name] = []; })
  };
}
const indexedDB = { open(){ const r = {}; setTimeout(() => { const db = { objectStoreNames: { contains: () => true }, createObjectStore: () => ({}), transaction: () => ({ objectStore: n => storeApi(n) }) }; r.onupgradeneeded && r.onupgradeneeded({ target: { result: db } }); r.onsuccess && r.onsuccess({ target: { result: db } }); }, 0); return r; } };

const Blob = class { constructor(){} };
const URL = { createObjectURL: () => "blob:x", revokeObjectURL(){} };
const FileReader = class { readAsText(){} };
const alert = () => {};
const confirm = () => true;
const tick = () => new Promise(r => setTimeout(r, 5));

/* ---- run the app ---- */
const handle = new Function(
  "document", "window", "indexedDB", "Blob", "URL", "FileReader", "alert", "confirm",
  scriptSrc + "\n;return {" +
    "run:t=>{activeTab=t;render();}," +
    "openForm:t=>startNew(t)," +
    "loadBath:b=>startLoad(b)," +
    "extractBath:b=>startExtraction(b)," +
    "closeDrawer:()=>closeDrawer()," +
    "serialHistory:s=>showSerial(s)," +
    "bathModal:b=>showBath(b)," +
    "loadExample:()=>loadExample()," +
    "clickExport:()=>{document.querySelector('#exportCsv').onclick();document.querySelector('#exportJson').onclick();}," +
    "mainKids:()=>document.querySelector('#main').children.length," +
    "drawerKids:()=>document.querySelector('#drawerRoot').children.length," +
    "pieces:()=>derivePieces(EVENTS,CONFIG,nowLocalDT())," +
    "suggestions:()=>deriveSuggestions(EVENTS,CONFIG,nowLocalDT())," +
    "issues:()=>deriveIssues(EVENTS,CONFIG,nowLocalDT())," +
    "doAction:a=>startAction(a)," +
    "modalKids:()=>document.querySelector('#modalRoot').children.length," +
    "eventsLen:()=>EVENTS.length };"
)(document, window, indexedDB, Blob, URL, FileReader, alert, confirm);

let failed = 0;
function ok(cond, msg){ console.log((cond ? "ok   - " : "FAIL - ") + msg); if(!cond) failed++; }
function safe(label, fn){ try { fn(); ok(true, label); } catch(e){ ok(false, label + "  →  " + (e && e.stack ? e.stack.split("\n")[0] : e)); } }

(async function(){
  await tick();
  ok(handle.eventsLen() === 0, "boots with an empty store");

  await handle.loadExample();
  await tick();
  ok(handle.eventsLen() > 25, "example data loaded (" + handle.eventsLen() + " events)");

  for(const tab of ["Floor", "Dashboard", "Pieces", "Baths", "Events", "Quality", "Settings"]){
    safe("renders tab: " + tab, () => { handle.run(tab); if(handle.mainKids() < 1) throw new Error("empty main"); });
  }

  safe("opens the Load In drawer (chip input)", () => { handle.openForm("Load In"); if(handle.drawerKids() < 1) throw new Error("no drawer"); handle.closeDrawer(); });
  safe("opens Load for a specific bath", () => { handle.loadBath("206-207"); if(handle.drawerKids() < 1) throw new Error("no drawer"); handle.closeDrawer(); });
  safe("opens the Extraction drawer with live contents", () => { handle.extractBath("206-207"); if(handle.drawerKids() < 1) throw new Error("no drawer"); handle.closeDrawer(); });
  safe("opens the Chemistry Check drawer", () => { handle.openForm("Chemistry Check"); if(handle.drawerKids() < 1) throw new Error("no drawer"); handle.closeDrawer(); });
  safe("a re-load of a wax-failed part shows the inline re-mask step", () => { handle.doAction({ type:"reload", serials:["7501-04"], bath:"206-207", jc:"7501" }); if(handle.drawerKids() < 1) throw new Error("no drawer"); handle.closeDrawer(); });

  safe("the drawer renders exactly once and does not stack on re-open", () => { handle.openForm("Load In"); handle.openForm("Load In"); const k = handle.drawerKids(); if(k !== 2) throw new Error("expected 1 drawer (scrim+panel = 2 nodes), got " + k); handle.closeDrawer(); });

  const sug = handle.suggestions();
  ok(sug.length > 0, "derives next-action suggestions (" + sug.length + ")");
  safe("a suggestion prefills the drawer", () => { handle.doAction(sug[0].action); if(handle.drawerKids() < 1) throw new Error("no drawer"); handle.closeDrawer(); });

  const iss = handle.issues();
  ok(iss.length > 0, "derives data-health issues (" + iss.length + ")");
  safe("a viewbath action opens the bath modal", () => { handle.doAction({ type:"viewbath", bath:"102-103" }); if(handle.modalKids() < 1) throw new Error("no modal"); });

  const ps = handle.pieces();
  ok(ps.length > 0, "derives pieces from the example (" + ps.length + ")");
  ok(ps.filter(p => p.status.s === "In bath").length >= 3, "example leaves parts in a bath (" + ps.filter(p => p.status.s === "In bath").length + " in bath)");
  safe("opens a piece history modal", () => handle.serialHistory(ps[0].serial));
  safe("opens a bath modal", () => handle.bathModal("102-103"));
  safe("opens the live bath modal", () => handle.bathModal("206-207"));
  safe("export handlers run", () => handle.clickExport());

  console.log(failed ? ("\n" + failed + " smoke check(s) FAILED") : "\nall smoke checks passed");
  process.exit(failed ? 1 : 0);
})();
