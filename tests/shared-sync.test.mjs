import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");
const scriptSrc = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));

function makeHarness({ role = "admin", rejectOversize = false, rejectAdminOps = false, initialEvents = [] } = {}) {
  const registry = new Map();
  function unregister(node) {
    if (node.attrs?.id) registry.delete("#" + node.attrs.id);
    for (const child of node.children || []) unregister(child);
  }
  function node(tag) {
    const listeners = {};
    return {
      tagName: String(tag).toUpperCase(), children: [], attrs: {}, style: {}, nodeType: 1,
      className: "", value: "", checked: false, disabled: false, hidden: false,
      textContent: "", _html: "", parentNode: null,
      classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
      setAttribute(k, v){ this.attrs[k] = String(v); if(k === "id") registry.set("#" + v, this); if(k === "value") this.value = v; if(k === "disabled") this.disabled = true; },
      getAttribute(k){ return this.attrs[k]; },
      addEventListener(type, fn){ (listeners[type] ||= []).push(fn); }, removeEventListener(){},
      append(...kids){ for(const kid of kids){ if(kid != null){ kid.parentNode = this; this.children.push(kid); } } },
      appendChild(kid){ this.append(kid); return kid; },
      remove(){ if(this.parentNode) this.parentNode.children = this.parentNode.children.filter(k => k !== this); unregister(this); },
      focus(){}, click(){ if(typeof this.onclick === "function") return this.onclick(); },
      querySelector(){ return null; }, querySelectorAll(){ return []; },
      set innerHTML(v){ this._html = String(v); this.children.forEach(unregister); this.children = []; },
      get innerHTML(){ return this._html; }
    };
  }
  const document = {
    body: null, createElement: node, createElementNS: (_ns, tag) => node(tag),
    createTextNode: text => ({ nodeType: 3, textContent: String(text), parentNode: null }),
    addEventListener(){}, querySelector: sel => registry.get(sel) || null
  };
  document.body = node("body");
  for(const match of html.matchAll(/<([a-z0-9]+)[^>]*\bid="([^"]+)"/gi)){
    const el = node(match[1]); el.setAttribute("id", match[2]); document.body.append(el);
  }

  const stores = { events: [], config: [], outbox: [] };
  let eventId = 1, outboxSeq = 1;
  const request = run => {
    const req = {};
    globalThis.setTimeout(() => { try { req.result = run(); req.onsuccess?.({ target: req }); } catch(error){ req.error = error; req.onerror?.({ target: req }); } }, 0);
    return req;
  };
  const store = name => ({
    getAll: () => request(() => stores[name].slice()),
    put: obj => request(() => {
      if(name === "events"){
        if(obj.id == null) obj.id = eventId++;
        const i = stores.events.findIndex(e => e.id === obj.id);
        i < 0 ? stores.events.push(obj) : stores.events.splice(i, 1, obj);
        return obj.id;
      }
      if(name === "outbox"){
        if(obj.seq == null) obj.seq = outboxSeq++;
        const i = stores.outbox.findIndex(e => e.seq === obj.seq);
        i < 0 ? stores.outbox.push(obj) : stores.outbox.splice(i, 1, obj);
        return obj.seq;
      }
      const i = stores.config.findIndex(e => e.k === obj.k);
      i < 0 ? stores.config.push(obj) : stores.config.splice(i, 1, obj);
      return obj.k;
    }),
    delete: key => request(() => {
      const field = name === "events" ? "id" : name === "outbox" ? "seq" : "k";
      const i = stores[name].findIndex(e => e[field] === key);
      if(i >= 0) stores[name].splice(i, 1);
    }),
    clear: () => request(() => { stores[name].length = 0; })
  });
  // A real IndexedDB transaction spans stores and reports completion, which is
  // what putEventQueued relies on to write an event and its outbox row together.
  function makeTx(factory){
    const t = { oncomplete:null, onerror:null, onabort:null, _pending:0 };
    const track = fn => (...a) => {
      t._pending++;
      const r = fn(...a);
      globalThis.setTimeout(() => { if(--t._pending === 0) globalThis.setTimeout(() => t.oncomplete && t.oncomplete(), 0); }, 0);
      return r;
    };
    t.objectStore = name => {
      const s = factory(name);
      return { getAll:track(s.getAll), put:track(s.put), delete:track(s.delete), clear:track(s.clear) };
    };
    return t;
  }
  const indexedDB = { open(){
    const req = {};
    globalThis.setTimeout(() => {
      const db = { objectStoreNames: { contains: () => true }, createObjectStore(){}, transaction: (_n, _m) => makeTx(store) };
      req.onupgradeneeded?.({ target: { result: db } }); req.onsuccess?.({ target: { result: db } });
    }, 0);
    return req;
  } };

  let serverEvents = initialEvents.map(event => ({ ...event }));
  let held = null;
  let seenResolve = null;
  let seenPromise = null;
  const batches = [];
  const response = (status, body) => ({ ok: status >= 200 && status < 300, status, async json(){ return body; } });
  async function fetch(path, opts = {}) {
    if(path === "/api/sync" && (opts.method || "GET") === "GET") return response(200, { role, events: serverEvents, config: {} });
    if(path === "/api/sync" && opts.method === "POST"){
      const ops = JSON.parse(opts.body).ops;
      batches.push(ops);
      seenResolve?.();
      if(held) await held;
      if(rejectOversize && ops.length > 500) return response(413, { error: "Too many operations in one batch." });
      if(rejectAdminOps){
        const opIndex = ops.findIndex(op => op.op === "config" || op.op === "del" || op.op === "reset" || op.op === "clear-events");
        if(opIndex >= 0) return response(403, { error: "Only an admin can make this change.", opIndex });
      }
      for(const op of ops){
        if(op.op === "put"){
          const i = serverEvents.findIndex(e => e.uid === op.uid);
          i < 0 ? serverEvents.push({ ...op.event }) : serverEvents.splice(i, 1, { ...op.event });
        } else if(op.op === "del") serverEvents = serverEvents.filter(e => e.uid !== op.uid);
        else if(op.op === "reset") serverEvents = [];
      }
      return response(200, { role, events: serverEvents, config: {} });
    }
    if(path === "/api/login" && opts.method === "DELETE") return response(200, { ok: true });
    return response(404, { error: "Not found" });
  }
  const control = {
    holdNextPost(){
      seenPromise = new Promise(resolve => { seenResolve = resolve; });
      held = new Promise(resolve => { this.release = () => { held = null; seenResolve = null; resolve(); }; });
      return seenPromise;
    },
    release(){}, batches
  };

  const local = new Map();
  const localStorage = { getItem:k => local.get(k) ?? null, setItem:(k,v) => local.set(k,String(v)), removeItem:k => local.delete(k) };
  const window = { print(){}, matchMedia:() => ({ matches:false }), addEventListener(){} };
  let debounceId = 0;
  const fakeSetTimeout = (fn, ms = 0) => ms === 0 ? globalThis.setTimeout(fn, 0) : ++debounceId;
  const fakeClearTimeout = () => {};
  const alerts = [];
  const handle = new Function(
    "document", "window", "indexedDB", "Blob", "URL", "FileReader", "alert", "confirm",
    "location", "fetch", "localStorage", "setInterval", "setTimeout", "clearTimeout",
    scriptSrc + "\n;return {" +
      "addEvent:o=>addEvent(o),syncNow:()=>syncNow(),queueOp:o=>queueOp(o)," +
      "events:()=>EVENTS.map(e=>({...e})),outbox:()=>getAll('outbox')," +
      "run:t=>{activeTab=t;render();}," +
      "nextEventId:(d,e)=>nextEventId(d,e)," +
      "saveDraft:async d=>{formType=d.type;editId=null;formData={...d};await saveForm();}," +
      "seed:async n=>{for(let i=0;i<n;i++){const e={type:'Parts Received',datetime:'2026-08-04T10:00',serials:['S'+i],uid:'u'+i,eventId:'20260804-'+String(i+1).padStart(4,'0')};await putRec('events',e);await queueOp({op:'put',uid:e.uid,event:e});}await loadAll();}" +
    "};"
  )(
    document, window, indexedDB, class Blob {}, { createObjectURL:() => "blob:x", revokeObjectURL(){} },
    class FileReader {}, message => alerts.push(String(message)), () => true, { protocol: "https:" }, fetch, localStorage,
    () => 1, fakeSetTimeout, fakeClearTimeout
  );
  return { handle, control, stores, registry, alerts };
}

function descendants(root){
  const out = [];
  for(const child of root?.children || []){
    if(child.nodeType === 1){ out.push(child); out.push(...descendants(child)); }
  }
  return out;
}

function textOf(node){
  if(node?.nodeType === 3) return node.textContent || "";
  return (node?.textContent || "") + (node?.children || []).map(textOf).join("");
}

async function waitFor(check, timeout = 1500){
  const end = Date.now() + timeout;
  while(Date.now() < end){ const value = await check(); if(value) return value; await new Promise(r => setTimeout(r, 5)); }
  throw new Error("timed out");
}

test("a save made while a POST is in flight remains local and is uploaded next", async () => {
  const race = makeHarness();
  await waitFor(() => race.registry.get("#brandMode")?.textContent === "shared · admin");
  await race.handle.addEvent({ type:"Parts Received", datetime:"2026-08-04T10:00", serials:["A"] });
  const postSeen = race.control.holdNextPost();
  const firstSync = race.handle.syncNow();
  await postSeen;
  await race.handle.addEvent({ type:"Parts Received", datetime:"2026-08-04T10:01", serials:["B"] });
  race.control.release();
  await firstSync;
  await waitFor(async () => (await race.handle.outbox()).length === 0);
  assert.deepEqual(race.handle.events().map(e => e.serials?.[0]), ["A", "B"]);
  assert.equal((await race.handle.outbox()).length, 0);
  assert.deepEqual(race.control.batches.map(b => b.length), [1, 1]);
});

test("more than 500 offline operations upload in bounded batches without loss", async () => {
  const oversized = makeHarness({ rejectOversize:true });
  await waitFor(() => oversized.registry.get("#brandMode")?.textContent === "shared · admin");
  await oversized.handle.seed(501);
  await oversized.handle.syncNow();
  assert.equal(oversized.handle.events().length, 501);
  assert.equal((await oversized.handle.outbox()).length, 0);
  assert.deepEqual(oversized.control.batches.map(batch => batch.length), [500, 1]);
});

test("blank process events are rejected before they enter the ledger", async () => {
  const validation = makeHarness();
  await waitFor(() => validation.registry.get("#brandMode")?.textContent === "shared · admin");
  await validation.handle.saveDraft({ type:"Bath Fill", datetime:"2026-08-04T11:00" });
  assert.equal(validation.handle.events().length, 0);
  assert.match(validation.alerts[0] || "", /bath/i);
});

test("an unresolved wax failure really blocks re-loading until its areas are re-masked", async () => {
  const history = [
    { uid:"u-load", eventId:"20260804-0001-X", type:"Load In", datetime:"2026-08-04T08:00", bath:"B1", serials:["S1"], jc:"JC", operator:"OP" },
    { uid:"u-out", eventId:"20260804-0002-X", type:"Extraction", datetime:"2026-08-04T09:00", bath:"B1", operator:"OP", items:[{ serial:"S1", result:"Re-strip", wax:["Cooling holes"] }] }
  ];
  const app = makeHarness({ initialEvents:history });
  await waitFor(() => app.registry.get("#brandMode")?.textContent === "shared · admin");
  const draft = { type:"Load In", datetime:"2026-08-04T10:00", bath:"B2", serials:["S1"], jc:"JC", operator:"OP" };

  await app.handle.saveDraft(draft);
  assert.equal(app.handle.events().length, 2);
  assert.match(app.alerts.at(-1) || "", /re-mask.*Cooling holes/i);

  await app.handle.saveDraft({ ...draft, remask:[{ serial:"S1", areas:["Cooling holes"] }] });
  assert.equal(app.handle.events().length, 3);
});

test("two online clients cannot assign the same visible event id", async () => {
  const a = makeHarness(), b = makeHarness();
  await Promise.all([
    waitFor(() => a.registry.get("#brandMode")?.textContent === "shared · admin"),
    waitFor(() => b.registry.get("#brandMode")?.textContent === "shared · admin")
  ]);
  await a.handle.addEvent({ type:"Parts Received", datetime:"2026-08-04T11:00", serials:["A"], jc:"JC", operator:"OP" });
  await b.handle.addEvent({ type:"Parts Received", datetime:"2026-08-04T11:00", serials:["B"], jc:"JC", operator:"OP" });
  assert.notEqual(a.handle.events()[0].eventId, b.handle.events()[0].eventId);
});

test("one rejected operator change does not erase a valid queued event", async () => {
  const mixed = makeHarness({ role:"operator", rejectAdminOps:true });
  await waitFor(() => mixed.registry.get("#brandMode")?.textContent === "shared · operator");
  await mixed.handle.addEvent({ type:"Parts Received", datetime:"2026-08-04T12:00", serials:["VALID"], jc:"JC", operator:"OP" });
  await mixed.handle.queueOp({ op:"config", k:"maxCycles", v:4 });
  await mixed.handle.syncNow();
  assert.equal(mixed.handle.events().length, 1);
  assert.equal((await mixed.handle.outbox()).length, 0);
  assert.deepEqual(mixed.control.batches.map(batch => batch.map(op => op.op)), [["put", "config"], ["put"]]);
});

test("clearing events on the server preserves shared configuration", async () => {
  const { onRequestPost } = await import("../functions/api/sync.js");
  const batchedSql = [];
  const db = {
    prepare(sql){
      return {
        sql, args:[], bind(...args){ this.args = args; return this; },
        async first(){ return null; },
        async all(){ return { results:[] }; }
      };
    },
    async batch(statements){ batchedSql.push(...statements.map(s => s.sql)); }
  };
  const resetResponse = await onRequestPost({
    request:new Request("https://example.test/api/sync", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ ops:[{ op:"clear-events" }] }) }),
    env:{ DB:db }, data:{ role:"admin" }
  });
  assert.equal(resetResponse.status, 200);
  assert.ok(batchedSql.some(sql => /events/i.test(sql)), "events are cleared");
  assert.ok(!batchedSql.some(sql => /DELETE FROM config/i.test(sql)), "config is preserved");
});

test("the API identifies a malformed operation without applying its batch", async () => {
  const { onRequestPost } = await import("../functions/api/sync.js");
  let applied = false;
  const db = {
    prepare(sql){ return { sql, bind(){ return this; }, async first(){ return null; }, async all(){ return { results:[] }; } }; },
    async batch(){ applied = true; }
  };
  const response = await onRequestPost({
    request:new Request("https://example.test/api/sync", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ ops:[
      { op:"put", uid:"u1", event:{ uid:"u1", eventId:"20260804-1", type:"Bath Fill", datetime:"" } }
    ] }) }),
    env:{ DB:db }, data:{ role:"admin" }
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).opIndex, 0);
  assert.equal(applied, false);
});

test("the API points to the rejected operator op while leaving the batch atomic", async () => {
  const { onRequestPost } = await import("../functions/api/sync.js");
  let applied = false;
  const event = { uid:"u1", eventId:"20260804-0001-X", type:"Parts Received", datetime:"2026-08-04T10:00", serials:["S1"], jc:"JC", operator:"OP" };
  const db = {
    prepare(sql){ return { sql, bind(){ return this; }, async first(){ return null; }, async all(){ return { results:[] }; } }; },
    async batch(){ applied = true; }
  };
  const response = await onRequestPost({
    request:new Request("https://example.test/api/sync", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ ops:[
      { op:"put", uid:"u1", event },
      { op:"config", k:"maxCycles", v:4 }
    ] }) }),
    env:{ DB:db }, data:{ role:"operator" }
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).opIndex, 1);
  assert.equal(applied, false);
});

test("operator UI does not expose admin edit, delete, import, or settings writes", async () => {
  const event = { uid:"u1", eventId:"20260804-0001-X", type:"Parts Received", datetime:"2026-08-04T10:00", serials:["S1"], jc:"JC", operator:"OP" };
  const app = makeHarness({ role:"operator", initialEvents:[event] });
  await waitFor(() => app.registry.get("#brandMode")?.textContent === "shared · operator");
  assert.equal(app.registry.get("#importBtn").disabled, true);

  app.handle.run("Events");
  const eventButtons = descendants(app.registry.get("#main")).filter(el => el.tagName === "BUTTON");
  assert.equal(eventButtons.some(el => /^(Edit|Delete) /.test(el.attrs["aria-label"] || "")), false);

  app.handle.run("Settings");
  const settingsInputs = descendants(app.registry.get("#main")).filter(el => el.tagName === "INPUT");
  assert.ok(settingsInputs.length > 0);
  assert.ok(settingsInputs.every(el => el.disabled));
});

test("a never-filled bath offers only the required new-charge action", async () => {
  const app = makeHarness();
  await waitFor(() => app.registry.get("#brandMode")?.textContent === "shared · admin");
  const labels = descendants(app.registry.get("#main"))
    .filter(el => el.tagName === "BUTTON")
    .map(el => textOf(el).trim())
    .filter(Boolean);
  assert.deepEqual(labels, Array(4).fill("Fill — new charge"));
});

test("operator retries are idempotent but cannot edit or resurrect an event", async () => {
  const { onRequestPost } = await import("../functions/api/sync.js");
  const original = { uid:"u1", eventId:"20260804-0001-X", type:"Parts Received", datetime:"2026-08-04T10:00", serials:["S1"], jc:"JC", operator:"OP" };
  const call = async (existing, event) => {
    let applied = false;
    const db = {
      prepare(sql){
        return {
          sql, bind(){ return this; },
          async first(){ return /SELECT body, deleted/.test(sql) ? existing : null; },
          async all(){ return { results:[] }; }
        };
      },
      async batch(){ applied = true; }
    };
    const response = await onRequestPost({
      request:new Request("https://example.test/api/sync", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ ops:[{ op:"put", uid:"u1", event }] }) }),
      env:{ DB:db }, data:{ role:"operator" }
    });
    return { response, applied };
  };

  const retry = await call({ body:JSON.stringify(original), deleted:0 }, original);
  assert.equal(retry.response.status, 200);
  assert.equal(retry.applied, true);

  const edit = await call({ body:JSON.stringify(original), deleted:0 }, { ...original, notes:"changed" });
  assert.equal(edit.response.status, 403);
  assert.equal(edit.applied, false);

  const resurrect = await call({ body:JSON.stringify(original), deleted:1 }, original);
  assert.equal(resurrect.response.status, 403);
  assert.equal(resurrect.applied, false);
});

test("recording an event writes it and its outbox row in one transaction", async () => {
  // Two separate transactions leave a window: a crash between them puts the
  // event on disk with nothing queued, and the next sync replaces the local
  // mirror with a server snapshot that never received it — the operator's entry
  // vanishes with no error. Both rows must land together or not at all.
  const app = makeHarness();
  await waitFor(() => app.registry.get("#brandMode")?.textContent === "shared · admin");

  await app.handle.addEvent({ type:"Parts Received", datetime:"2026-08-04T10:00", serials:["ATOMIC"] });
  assert.equal(app.stores.events.length, 1, "event persisted");
  assert.equal(app.stores.outbox.length, 1, "and its upload was queued in the same write");

  await app.handle.syncNow();
  await waitFor(async () => (await app.handle.outbox()).length === 0);
  assert.ok(app.handle.events().flatMap(e => e.serials || []).includes("ATOMIC"),
    "the event survives the server snapshot that follows");
});
