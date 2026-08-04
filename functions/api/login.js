import { roleForPassword, issueToken, sessionCookie, clearCookie, json } from "../_lib/auth.js";

// There is deliberately no GET here. Cloudflare Pages serves static assets in
// preference to a function for GET requests, so a GET route on this path is
// answered by index.html and never reaches this code. The app asks
// GET /api/sync instead and treats a 401 as "not signed in".

// POST /api/login {password} — exchange a password for a session cookie.
export async function onRequestPost({ request, env }) {
  if (!env.AUTH_SECRET || (!env.ADMIN_PASSWORD && !env.OPERATOR_PASSWORD)) {
    return json({ error: "Server is not configured: set AUTH_SECRET and at least one password." }, { status: 503 });
  }

  let password = "";
  try { password = (await request.json()).password || ""; } catch { /* empty body -> empty password -> rejected below */ }

  const role = roleForPassword(env, password);

  // A small fixed delay on failure. Not real rate limiting, but it makes
  // guessing over the network tedious without adding any moving parts.
  if (!role) {
    await new Promise(r => setTimeout(r, 400));
    return json({ error: "Wrong password." }, { status: 401 });
  }

  return json({ role }, { headers: { "Set-Cookie": sessionCookie(await issueToken(env, role)) } });
}

// DELETE /api/login — sign out.
export async function onRequestDelete() {
  return json({ ok: true }, { headers: { "Set-Cookie": clearCookie() } });
}
