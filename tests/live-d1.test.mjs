/* The sync handlers against a real SQLite database.
 *
 * D1 is SQLite underneath, so running functions/api/sync.js against node:sqlite
 * executes its actual SQL and schema.sql for real. The other suites stub the DB
 * binding — prepare() returns canned rows and batch() only collects SQL strings
 * — which means a typo in any statement would pass every other test and fail on
 * deploy. These cases close that gap.
 *
 * node:sqlite arrived in Node 22.5; on anything older the suite skips rather
 * than failing, so the file is safe on any supported runtime.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* Node < 22.5 */ }
const skip = DatabaseSync ? false : "node:sqlite is unavailable on this Node";

const { onRequestPost, onRequestGet } = await import("../functions/api/sync.js");
const admin = { role: "admin" }, operator = { role: "operator" };

function makeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(join(here, "..", "schema.sql"), "utf8"));
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    async first() { const r = db.prepare(sql).all(...args); return r.length ? r[0] : null; },
    async all() { return { results: db.prepare(sql).all(...args), success: true }; },
    async run() { const i = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(i.changes) } }; },
    _exec() { return db.prepare(sql).run(...args); }
  });
  return {
    rows: (sql, ...a) => db.prepare(sql).all(...a),
    binding: {
      prepare: sql => stmt(sql),
      // D1 batches are atomic: every statement commits, or none does.
      async batch(statements) {
        db.exec("BEGIN");
        try {
          const out = statements.map(s => ({ success: true, meta: { changes: Number(s._exec().changes) } }));
          db.exec("COMMIT");
          return out;
        } catch (e) { db.exec("ROLLBACK"); throw e; }
      }
    }
  };
}

const ev = (uid, extra = {}) => ({ uid, type: "Load In", datetime: "2026-08-04T10:00", eventId: "20260804-" + uid, ...extra });
const post = (env, data, ops) => onRequestPost({
  request: new Request("https://example.test/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ops }) }),
  env, data
});

test("schema.sql loads and a put round-trips through real SQL", { skip }, async () => {
  const d1 = makeD1(), env = { DB: d1.binding };
  assert.equal((await post(env, admin, [{ op: "put", uid: "u1", event: ev("u1", { serials: ["7261-01"] }) }])).status, 200);
  const body = await (await onRequestGet({ env, data: admin })).json();
  assert.equal(body.events.length, 1);
  assert.deepEqual(body.events[0].serials, ["7261-01"]);
});

test("re-put of the same uid updates in place rather than duplicating", { skip }, async () => {
  const d1 = makeD1(), env = { DB: d1.binding };
  await post(env, admin, [{ op: "put", uid: "u1", event: ev("u1", { notes: "first" }) }]);
  await post(env, admin, [{ op: "put", uid: "u1", event: ev("u1", { notes: "second" }) }]);
  assert.equal(d1.rows("SELECT COUNT(*) c FROM events")[0].c, 1);
  const body = await (await onRequestGet({ env, data: admin })).json();
  assert.equal(body.events[0].notes, "second");
});

test("delete is soft: the tombstone stays and GET hides the event", { skip }, async () => {
  const d1 = makeD1(), env = { DB: d1.binding };
  await post(env, admin, [{ op: "put", uid: "u1", event: ev("u1") }]);
  await post(env, admin, [{ op: "del", uid: "u1" }]);
  assert.equal(d1.rows("SELECT deleted FROM events WHERE uid='u1'")[0].deleted, 1);
  assert.equal((await (await onRequestGet({ env, data: admin })).json()).events.length, 0);
});

test("a stale offline operator cannot resurrect a deleted event", { skip }, async () => {
  const d1 = makeD1(), env = { DB: d1.binding };
  await post(env, admin, [{ op: "put", uid: "u1", event: ev("u1") }]);
  await post(env, admin, [{ op: "del", uid: "u1" }]);
  assert.equal((await post(env, operator, [{ op: "put", uid: "u1", event: ev("u1") }])).status, 403);
  assert.equal((await (await onRequestGet({ env, data: admin })).json()).events.length, 0);
});

test("an operator retrying the identical event is idempotent", { skip }, async () => {
  const d1 = makeD1(), env = { DB: d1.binding };
  const e = ev("u1");
  assert.equal((await post(env, operator, [{ op: "put", uid: "u1", event: e }])).status, 200);
  assert.equal((await post(env, operator, [{ op: "put", uid: "u1", event: e }])).status, 200);
  assert.equal(d1.rows("SELECT COUNT(*) c FROM events")[0].c, 1);
});

test("an operator cannot change a recorded event, an admin can", { skip }, async () => {
  const d1 = makeD1(), env = { DB: d1.binding };
  await post(env, operator, [{ op: "put", uid: "u1", event: ev("u1", { notes: "orig" }) }]);
  assert.equal((await post(env, operator, [{ op: "put", uid: "u1", event: ev("u1", { notes: "tampered" }) }])).status, 403);
  assert.equal((await post(env, admin, [{ op: "put", uid: "u1", event: ev("u1", { notes: "corrected" }) }])).status, 200);
  assert.equal((await (await onRequestGet({ env, data: admin })).json()).events[0].notes, "corrected");
});

test("clear-events keeps configuration, reset drops it", { skip }, async () => {
  const a = makeD1(), envA = { DB: a.binding };
  await post(envA, admin, [{ op: "config", k: "maxHours", v: 24 }, { op: "put", uid: "u1", event: ev("u1") }]);
  await post(envA, admin, [{ op: "clear-events" }]);
  const cleared = await (await onRequestGet({ env: envA, data: admin })).json();
  assert.equal(cleared.events.length, 0);
  assert.equal(cleared.config.maxHours, 24);

  const b = makeD1(), envB = { DB: b.binding };
  await post(envB, admin, [{ op: "config", k: "maxHours", v: 24 }, { op: "put", uid: "u1", event: ev("u1") }]);
  await post(envB, admin, [{ op: "reset" }]);
  const reset = await (await onRequestGet({ env: envB, data: admin })).json();
  assert.deepEqual(reset.config, {});
  assert.equal(b.rows("SELECT COUNT(*) c FROM events")[0].c, 1, "tombstone survives reset");
});

test("a batch containing one bad operation applies none of it", { skip }, async () => {
  const d1 = makeD1(), env = { DB: d1.binding };
  const r = await post(env, admin, [
    { op: "put", uid: "good", event: ev("good") },
    { op: "put", uid: "bad", event: { uid: "bad", type: "Load In", datetime: "not-a-date", eventId: "x" } }
  ]);
  assert.equal(r.status, 400);
  assert.equal(d1.rows("SELECT COUNT(*) c FROM events")[0].c, 0, "the valid op did not land either");
});
