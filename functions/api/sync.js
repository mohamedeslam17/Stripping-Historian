import { json } from "../_lib/auth.js";

// The whole data API is this one endpoint.
//
//   GET  /api/sync            -> { role, events, config }
//   POST /api/sync { ops[] }  -> apply the client's queued ops, return fresh state
//
// The log is small (a busy shop produces a few thousand events a year) so the
// client always pulls the whole thing rather than doing incremental sync. That
// removes an entire class of "my dashboard disagrees with yours" bugs, which
// matters more here than shaving a few hundred KB off a page load.

function requireDB(env) {
  if (!env.DB) throw new HttpError(503, "Server is not configured: the D1 database binding 'DB' is missing.");
}

class HttpError extends Error {
  constructor(status, message, opIndex = null) { super(message); this.status = status; this.opIndex = opIndex; }
}

function eventBody(ev, uid) {
  if (!ev || typeof ev !== "object" || Array.isArray(ev) || !uid) {
    throw new HttpError(400, "A put needs a uid and an event.");
  }
  if (String(ev.uid || "") !== String(uid)) {
    throw new HttpError(400, "The event uid must match the operation uid.");
  }
  if (typeof ev.type !== "string" || !ev.type.trim()) {
    throw new HttpError(400, "An event needs a type.");
  }
  if (typeof ev.datetime !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(ev.datetime)) {
    throw new HttpError(400, "An event needs a valid local date and time.");
  }
  if (typeof ev.eventId !== "string" || !ev.eventId.trim()) {
    throw new HttpError(400, "An event needs an event id.");
  }
  const body = JSON.stringify(ev);
  if (body.length > 200000) throw new HttpError(413, "One event is too large.");
  return body;
}

async function readState(env) {
  const [events, config] = await Promise.all([
    env.DB.prepare("SELECT body FROM events WHERE deleted = 0 ORDER BY datetime").all(),
    env.DB.prepare("SELECT k, v FROM config").all(),
  ]);

  const cfg = {};
  for (const row of config.results || []) {
    try { cfg[row.k] = JSON.parse(row.v); } catch { /* a corrupt row must not break the whole load */ }
  }

  const list = [];
  for (const row of events.results || []) {
    try { list.push(JSON.parse(row.body)); } catch { /* likewise */ }
  }

  return { events: list, config: cfg };
}

export async function onRequestGet({ env, data }) {
  try {
    requireDB(env);
    return json({ role: data.role, ...(await readState(env)) });
  } catch (err) {
    return json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function onRequestPost({ request, env, data }) {
  try {
    requireDB(env);

    let payload;
    try { payload = await request.json(); }
    catch { throw new HttpError(400, "Request body must be valid JSON."); }
    const ops = payload && payload.ops != null ? payload.ops : [];
    if (!Array.isArray(ops)) throw new HttpError(400, "ops must be an array.");
    if (ops.length > 500) throw new HttpError(413, "Too many operations in one batch.");

    const isAdmin = data.role === "admin";
    const now = Date.now();
    const statements = [];
    const operatorPuts = new Map();

    for (let opIndex = 0; opIndex < ops.length; opIndex++) {
      const op = ops[opIndex];
      try {
        if (!op || typeof op !== "object" || Array.isArray(op)) throw new HttpError(400, "Each operation must be an object.");

        if (op.op === "put") {
          const ev = op.event;
          const body = eventBody(ev, op.uid);
          // Editing an existing event is an admin action; recording a new one is
          // not. An operator correcting a typo has to ask — which is the point of
          // an event log that engineering will later read as the record of truth.
          if (!isAdmin) {
            const earlierBody = operatorPuts.get(String(op.uid));
            if (earlierBody != null && earlierBody !== body) {
              throw new HttpError(403, "Only an admin can change an event that is already recorded.");
            }
            operatorPuts.set(String(op.uid), body);
            const existing = await env.DB.prepare("SELECT body, deleted FROM events WHERE uid = ?").bind(op.uid).first();
            // A retry of the exact same new event is idempotent. This matters when
            // two tabs race or the response is lost after D1 committed the batch.
            if (existing && (+existing.deleted !== 0 || existing.body !== body)) {
              throw new HttpError(403, "Only an admin can change an event that is already recorded.");
            }
          }
          statements.push(
            env.DB.prepare(
              `INSERT INTO events (uid, datetime, body, deleted, updated_at) VALUES (?, ?, ?, 0, ?)
               ON CONFLICT(uid) DO UPDATE SET datetime = excluded.datetime, body = excluded.body,
                                              deleted = 0, updated_at = excluded.updated_at`
            ).bind(String(op.uid), ev.datetime, body, now)
          );

        } else if (op.op === "del") {
          if (!isAdmin) throw new HttpError(403, "Only an admin can delete an event.");
          if (!op.uid) throw new HttpError(400, "A delete needs a uid.");
          // Soft delete: the row stays so that a client which is still offline
          // cannot resurrect the event by re-sending its own stale copy.
          statements.push(
            env.DB.prepare("UPDATE events SET deleted = 1, updated_at = ? WHERE uid = ?").bind(now, String(op.uid))
          );

        } else if (op.op === "config") {
          if (!isAdmin) throw new HttpError(403, "Only an admin can change settings.");
          if (!op.k) throw new HttpError(400, "A config op needs a key.");
          statements.push(
            env.DB.prepare(
              `INSERT INTO config (k, v, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`
            ).bind(String(op.k), JSON.stringify(op.v ?? null), now)
          );

        } else if (op.op === "reset") {
          if (!isAdmin) throw new HttpError(403, "Only an admin can clear the log.");
          // Keep tombstones so a stale offline operator cannot resurrect events
          // that were deliberately cleared before that browser reconnected.
          statements.push(env.DB.prepare("UPDATE events SET deleted = 1, updated_at = ? WHERE deleted = 0").bind(now));
          statements.push(env.DB.prepare("DELETE FROM config"));
        } else if (op.op === "clear-events") {
          if (!isAdmin) throw new HttpError(403, "Only an admin can clear the log.");
          statements.push(env.DB.prepare("UPDATE events SET deleted = 1, updated_at = ? WHERE deleted = 0").bind(now));
        } else {
          throw new HttpError(400, "Unknown operation.");
        }
      } catch (err) {
        if (err instanceof HttpError && !Number.isInteger(err.opIndex)) err.opIndex = opIndex;
        throw err;
      }
    }

    if (statements.length) await env.DB.batch(statements);

    return json({ role: data.role, applied: statements.length, ...(await readState(env)) });
  } catch (err) {
    const body = { error: err.message };
    if (Number.isInteger(err.opIndex)) body.opIndex = err.opIndex;
    return json(body, { status: err.status || 500 });
  }
}
