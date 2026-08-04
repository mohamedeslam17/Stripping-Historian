import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");
const scriptSrc = html.slice(html.indexOf("<script>") + "<script>".length, html.lastIndexOf("</script>"));

function hostedHarness(){
  const registry = new Map();
  let bodyClearCount = 0;

  function unregister(node){
    if(node.attrs && node.attrs.id) registry.delete("#" + node.attrs.id);
    (node.children || []).forEach(unregister);
  }

  function node(tag){
    const listeners = {};
    const el = {
      tagName:String(tag).toUpperCase(), children:[], attrs:{}, style:{}, nodeType:1,
      className:"", value:"", checked:false, hidden:false, textContent:"", _html:"", parentNode:null,
      classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
      setAttribute(k, v){
        this.attrs[k] = String(v);
        if(k === "id") registry.set("#" + v, this);
        if(k === "value") this.value = v;
      },
      getAttribute(k){ return this.attrs[k]; },
      addEventListener(type, fn){ (listeners[type] ||= []).push(fn); },
      removeEventListener(){},
      async dispatch(type, event = {}){
        for(const fn of (listeners[type] || [])) await fn({ target:this, preventDefault(){}, ...event });
      },
      append(...kids){
        kids.forEach(k => { if(k != null){ k.parentNode = this; this.children.push(k); } });
      },
      appendChild(k){ this.append(k); return k; },
      remove(){
        if(this.parentNode) this.parentNode.children = this.parentNode.children.filter(k => k !== this);
        unregister(this);
      },
      click(){ if(typeof this.onclick === "function") return this.onclick(); },
      focus(){},
      querySelector(){ return null; },
      querySelectorAll(){ return []; },
      set innerHTML(v){
        this._html = String(v);
        if(this === document.body) bodyClearCount++;
        this.children.forEach(unregister);
        this.children = [];
      },
      get innerHTML(){ return this._html; }
    };
    return el;
  }

  const document = {
    body:null,
    createElement:tag => node(tag),
    createElementNS:(_ns, tag) => node(tag),
    createTextNode:t => ({ nodeType:3, textContent:String(t), parentNode:null }),
    addEventListener(){},
    querySelector:sel => registry.get(sel) || null
  };
  document.body = node("body");

  // The script binds handlers before boot, so provide the static shell IDs
  // that exist in the real HTML. Their exact nesting is irrelevant here.
  for(const match of html.matchAll(/<([a-z0-9]+)[^>]*\bid="([^"]+)"/gi)){
    const el = node(match[1]);
    el.setAttribute("id", match[2]);
    document.body.append(el);
  }

  const stores = { events:[], config:[], outbox:[] };
  let eventId = 1, outboxSeq = 1;
  function request(run){
    const req = {};
    setTimeout(() => {
      try { req.result = run(); req.onsuccess?.({ target:req }); }
      catch(error){ req.error = error; req.onerror?.({ target:req }); }
    }, 0);
    return req;
  }
  function store(name){
    return {
      getAll:() => request(() => stores[name].slice()),
      put:obj => request(() => {
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
      delete:key => request(() => {
        const field = name === "events" ? "id" : name === "outbox" ? "seq" : "k";
        const i = stores[name].findIndex(e => e[field] === key);
        if(i >= 0) stores[name].splice(i, 1);
      }),
      clear:() => request(() => { stores[name].length = 0; })
    };
  }
  const indexedDB = {
    open(){
      const req = {};
      setTimeout(() => {
        const db = {
          objectStoreNames:{ contains:() => true },
          createObjectStore(){},
          transaction:(_name, _mode) => ({ objectStore:store })
        };
        req.onupgradeneeded?.({ target:{ result:db } });
        req.onsuccess?.({ target:{ result:db } });
      }, 0);
      return req;
    }
  };

  let signedIn = false;
  const calls = [];
  const response = (status, body) => ({ ok:status >= 200 && status < 300, status, async json(){ return body; } });
  async function fetch(path, opts = {}){
    calls.push([path, opts.method || "GET"]);
    if(path === "/api/login" && opts.method === "POST"){
      signedIn = true;
      return response(200, { role:"admin" });
    }
    if(path === "/api/login" && opts.method === "DELETE"){
      signedIn = false;
      return response(200, { ok:true });
    }
    if(path === "/api/sync"){
      return signedIn
        ? response(200, { role:"admin", events:[], config:{} })
        : response(401, { error:"Not signed in." });
    }
    return response(404, { error:"Not found." });
  }

  const local = new Map();
  const localStorage = {
    getItem:k => local.get(k) ?? null,
    setItem:(k, v) => local.set(k, String(v)),
    removeItem:k => local.delete(k)
  };
  const window = { print(){}, matchMedia:() => ({ matches:false }), addEventListener(){} };
  let intervals = 0;

  new Function(
    "document", "window", "indexedDB", "Blob", "URL", "FileReader", "alert", "confirm",
    "location", "fetch", "localStorage", "setInterval",
    scriptSrc
  )(
    document, window, indexedDB, class Blob {}, { createObjectURL:() => "blob:x", revokeObjectURL(){} },
    class FileReader {}, () => {}, () => true, { protocol:"https:" }, fetch, localStorage,
    () => { intervals++; return intervals; }
  );

  return { document, registry, calls, intervals:() => intervals, bodyClearCount:() => bodyClearCount };
}

async function waitFor(fn, timeout = 1000){
  const end = Date.now() + timeout;
  while(Date.now() < end){
    const value = fn();
    if(value) return value;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for hosted app state");
}

function descendants(root){
  const all = [];
  for(const child of root.children || []){
    if(child.nodeType === 1){ all.push(child); all.push(...descendants(child)); }
  }
  return all;
}

async function signIn(harness){
  const login = await waitFor(() => harness.registry.get("#loginRoot"));
  const nodes = descendants(login);
  const input = nodes.find(el => el.tagName === "INPUT");
  const button = nodes.find(el => el.tagName === "BUTTON");
  assert.ok(input && button, "login form is rendered");
  input.value = "valid";
  await button.dispatch("click");
}

test("hosted sign-in and sign-out preserve and restore the app shell", async () => {
  const harness = hostedHarness();
  const app = harness.registry.get("#app");
  const main = harness.registry.get("#main");

  await waitFor(() => harness.registry.get("#loginRoot"));
  assert.equal(app.hidden, true, "the shell is hidden while signed out");

  await signIn(harness);
  assert.equal(harness.bodyClearCount(), 0, "login never destroys document.body");
  assert.equal(harness.registry.has("#loginRoot"), false, "the login screen is removed");
  assert.equal(app.hidden, false, "the existing shell is restored");
  assert.ok(main.children.length > 0, "the dashboard renders after login");
  assert.equal(harness.registry.get("#brandMode").textContent, "shared · admin");
  assert.equal(harness.intervals(), 1, "background sync starts once");

  await harness.registry.get("#signOutBtn").onclick();
  assert.equal(app.hidden, true, "sign-out hides the shell");
  assert.ok(harness.registry.get("#loginRoot"), "sign-out restores the login screen");

  await signIn(harness);
  assert.equal(app.hidden, false, "the shell can be restored a second time");
  assert.equal(harness.bodyClearCount(), 0, "the sign-out round trip never clears the body");
  assert.equal(harness.intervals(), 1, "re-login does not duplicate the sync timer");
  assert.deepEqual(harness.calls.slice(0, 3), [
    ["/api/sync", "GET"],
    ["/api/login", "POST"],
    ["/api/sync", "GET"]
  ]);
});
