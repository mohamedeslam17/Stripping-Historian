import { verifyToken, readCookie, json } from "./_lib/auth.js";

// Everything under /api/* requires a valid session except the login endpoint
// itself. The static app (index.html) is served without a gate — it renders a
// password screen and cannot show any data until /api/sync succeeds, so there
// is nothing to leak in the HTML.
const PUBLIC = new Set(["/api/login"]);

export async function onRequest(context) {
  const { request, env, next } = context;
  const path = new URL(request.url).pathname;

  if (!path.startsWith("/api/")) return next();
  if (PUBLIC.has(path)) return next();

  if (!env.AUTH_SECRET) {
    return json({ error: "Server is not configured: AUTH_SECRET is missing." }, { status: 503 });
  }

  const role = await verifyToken(env, readCookie(request));
  if (!role) return json({ error: "Not signed in." }, { status: 401 });

  context.data.role = role;
  return next();
}
