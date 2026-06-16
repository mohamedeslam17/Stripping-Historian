/* Headless smoke test: boot the real app from index.html against a tiny
 * in-memory DOM + IndexedDB shim, load the example data, then render every
 * tab, both custom forms, and the modals. Catches runtime errors in the view
 * layer that the syntax gate and pure-domain tests cannot.
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
  return {
    tag, children: [], attrs: {}, style: {}, nodeType: 1, className: "", value: "", checked: false, textContent: "",
    _html: "",
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
    "openForm:t=>{startNew(t);}," +
    "serialHistory:s=>showSerial(s)," +
    "bathModal:b=>showBath(b)," +
    "loadExample:()=>loadExample()," +
    "clickExport:()=>{document.querySelector('#exportCsv').onclick();document.querySelector('#exportJson').onclick();}," +
    "mainKids:()=>document.querySelector('#main').children.length," +
    "pieces:()=>derivePieces(EVENTS,CONFIG,nowLocalDT())," +
    "eventsLen:()=>EVENTS.length };"
)(document, window, indexedDB, Blob, URL, FileReader, alert, confirm);

let failed = 0;
function ok(cond, msg){ if(cond){ console.log("ok   - " + msg); } else { console.log("FAIL - " + msg); failed++; } }
function safe(label, fn){ try { fn(); ok(true, label); } catch(e){ ok(false, label + "  →  " + (e && e.stack ? e.stack.split("\n")[0] : e)); } }

(async function(){
  await tick(); // let boot openDB/loadAll/render finish
  ok(handle.eventsLen() === 0, "boots with an empty store");

  await handle.loadExample();
  await tick();
  ok(handle.eventsLen() > 25, "example data loaded (" + handle.eventsLen() + " events)");

  for(const tab of ["Log event", "Event log", "Pieces", "Baths", "Quality", "Dashboard", "Settings"]){
    safe("renders tab: " + tab, () => { handle.run(tab); if(handle.mainKids() < 1) throw new Error("empty main"); });
  }

  safe("renders the Load In form", () => handle.openForm("Load In"));
  safe("renders the Extraction form", () => handle.openForm("Extraction"));
  safe("renders Chemistry Check form", () => handle.openForm("Chemistry Check"));

  const ps = handle.pieces();
  ok(ps.length > 0, "derives pieces from the example (" + ps.length + ")");
  const inBath = ps.filter(p => p.status.s === "In bath");
  ok(inBath.length >= 3, "example leaves parts in a bath (" + inBath.length + " in bath)");
  safe("opens a piece history modal", () => handle.serialHistory(ps[0].serial));
  safe("opens a bath modal", () => handle.bathModal("102-103"));
  safe("opens the live bath modal", () => handle.bathModal("206-207"));
  safe("export handlers run", () => handle.clickExport());

  console.log(failed ? ("\n" + failed + " smoke check(s) FAILED") : "\nall smoke checks passed");
  process.exit(failed ? 1 : 0);
})();
