// Shared-password auth, deliberately small.
//
// There are no user accounts. Two passwords are configured as Pages secrets:
// OPERATOR_PASSWORD (record events, read the floor) and ADMIN_PASSWORD (also
// edit/delete events and change settings). A successful login returns an
// HMAC-signed cookie carrying only the role and an expiry — there is no session
// table, so nothing to clean up and nothing to go stale.
//
// This keeps outsiders with the link out. It is not a defence against a
// determined attacker who has a valid password, and it is not meant to be.

const COOKIE = "sh_session";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — operators should not re-login mid-shift

const enc = new TextEncoder();

function b64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

// Comparison that does not leak where two strings first differ.
function safeEqual(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function issueToken(env, role) {
  const payload = `${role}.${Date.now() + TTL_MS}`;
  return `${payload}.${await hmac(env.AUTH_SECRET, payload)}`;
}

// Returns the role ("admin" | "operator") or null if the token is absent,
// malformed, forged, or expired.
export async function verifyToken(env, token) {
  if (!token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  const [role, expires, sig] = parts;
  if (role !== "admin" && role !== "operator") return null;
  const expected = await hmac(env.AUTH_SECRET, `${role}.${expires}`);
  if (!safeEqual(sig, expected)) return null;
  if (!Number(expires) || Number(expires) < Date.now()) return null;
  return role;
}

export function readCookie(request, name = COOKIE) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

export function sessionCookie(token) {
  const age = Math.floor(TTL_MS / 1000);
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

// Which password did they send? Checks admin first so that if both secrets are
// accidentally set to the same value, the stronger role wins.
export function roleForPassword(env, password) {
  if (!password) return null;
  if (env.ADMIN_PASSWORD && safeEqual(password, env.ADMIN_PASSWORD)) return "admin";
  if (env.OPERATOR_PASSWORD && safeEqual(password, env.OPERATOR_PASSWORD)) return "operator";
  return null;
}

export function json(body, init = {}) {
  const headers = { "Content-Type": "application/json", ...(init.headers || {}) };
  return new Response(JSON.stringify(body), { ...init, headers });
}

export { COOKIE };
