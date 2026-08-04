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
  constructor(status, message) { super(message); this.status = status; }
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

    let ops = [];
    try { ops = (await request.json()).ops || []; } catch { ops = []; }
    if (!Array.isArray(ops)) throw new HttpError(400, "ops must be an array.");
    if (ops.length > 500) throw new HttpError(413, "Too many operations in one batch.");

    const isAdmin = data.role === "admin";
    const now = Date.now();
    const statements = [];

    for (const op of ops) {
      if (!op || typeof op !== "object") continue;

      if (op.op === "put") {
        const ev = op.event;
        if (!ev || typeof ev !== "object" || !op.uid) throw new HttpError(400, "A put needs a uid and an event.");
        // Editing an existing event is an admin action; recording a new one is
        // not. An operator correcting a typo has to ask — which is the point of
        // an event log that engineering will later read as the record of truth.
        if (!isAdmin) {
          const existing = await env.DB.prepare("SELECT uid FROM events WHERE uid = ?").bind(op.uid).first();
          if (existing) throw new HttpError(403, "Only an admin can change an event that is already recorded.");
        }
        statements.push(
          env.DB.prepare(
            `INSERT INTO events (uid, datetime, body, deleted, updated_at) VALUES (?, ?, ?, 0, ?)
             ON CONFLICT(uid) DO UPDATE SET datetime = excluded.datetime, body = excluded.body,
                                            deleted = 0, updated_at = excluded.updated_at`
          ).bind(String(op.uid), String(ev.datetime || ""), JSON.stringify(ev), now)
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
        statements.push(env.DB.prepare("DELETE FROM events"));
        statements.push(env.DB.prepare("DELETE FROM config"));
      }
    }

    if (statements.length) await env.DB.batch(statements);

    return json({ role: data.role, applied: statements.length, ...(await readState(env)) });
  } catch (err) {
    return json({ error: err.message }, { status: err.status || 500 });
  }
}
