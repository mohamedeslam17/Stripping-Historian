import test from "node:test";
import assert from "node:assert/strict";
import {
  issueToken, verifyToken, roleForPassword, readCookie, sessionCookie, clearCookie
} from "../functions/_lib/auth.js";

const env = { AUTH_SECRET: "s3cret-signing-key", ADMIN_PASSWORD: "boss-pw", OPERATOR_PASSWORD: "floor-pw" };

test("a freshly issued token verifies back to its role", async () => {
  assert.equal(await verifyToken(env, await issueToken(env, "admin")), "admin");
  assert.equal(await verifyToken(env, await issueToken(env, "operator")), "operator");
});

test("a token signed with a different secret is rejected", async () => {
  const token = await issueToken({ AUTH_SECRET: "other-key" }, "admin");
  assert.equal(await verifyToken(env, token), null);
});

test("editing the role inside a token does not grant that role", async () => {
  const token = await issueToken(env, "operator");
  const [, expires, sig] = token.split(".");
  assert.equal(await verifyToken(env, `admin.${expires}.${sig}`), null);
});

test("extending the expiry inside a token does not extend the session", async () => {
  const token = await issueToken(env, "admin");
  const [role, , sig] = token.split(".");
  assert.equal(await verifyToken(env, `${role}.${Date.now() + 9e9}.${sig}`), null);
});

test("an expired token is rejected even though its signature is genuine", async () => {
  // Sign a payload that is already in the past, the way a real stale cookie is.
  const past = Date.now() - 1000;
  const good = await issueToken(env, "admin");
  const sig = good.split(".")[2];
  assert.equal(await verifyToken(env, `admin.${past}.${sig}`), null);
});

test("malformed and empty tokens are rejected, not thrown on", async () => {
  for(const bad of [null, undefined, "", "garbage", "a.b", "a.b.c.d", "admin..", "..."]){
    assert.equal(await verifyToken(env, bad), null, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test("an unknown role in an otherwise valid-looking token is rejected", async () => {
  const token = await issueToken(env, "superuser");
  assert.equal(await verifyToken(env, token), null);
});

test("passwords map to roles, and anything else maps to nothing", () => {
  assert.equal(roleForPassword(env, "boss-pw"), "admin");
  assert.equal(roleForPassword(env, "floor-pw"), "operator");
  assert.equal(roleForPassword(env, "wrong"), null);
  assert.equal(roleForPassword(env, ""), null);
  assert.equal(roleForPassword(env, null), null);
});

test("a near-miss password (prefix or different case) does not authenticate", () => {
  assert.equal(roleForPassword(env, "floor-p"), null);
  assert.equal(roleForPassword(env, "floor-pww"), null);
  assert.equal(roleForPassword(env, "FLOOR-PW"), null);
});

test("an unset password secret never matches an empty submission", () => {
  const partial = { ADMIN_PASSWORD: "boss-pw" };           // no operator password configured
  assert.equal(roleForPassword(partial, ""), null);
  assert.equal(roleForPassword(partial, undefined), null);
  assert.equal(roleForPassword({}, ""), null);
});

test("if both passwords are set to the same value, the stronger role wins", () => {
  const same = { ADMIN_PASSWORD: "same", OPERATOR_PASSWORD: "same" };
  assert.equal(roleForPassword(same, "same"), "admin");
});

test("the session cookie is read out of a crowded Cookie header", () => {
  const request = { headers: { get: () => "foo=1; sh_session=abc.def.ghi; other=2" } };
  assert.equal(readCookie(request), "abc.def.ghi");
});

test("a missing cookie header reads as null rather than throwing", () => {
  assert.equal(readCookie({ headers: { get: () => null } }), null);
  assert.equal(readCookie({ headers: { get: () => "unrelated=1" } }), null);
});

test("the cookie is HttpOnly, Secure and SameSite, and logout expires it", () => {
  const set = sessionCookie("tok");
  for(const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/"]) assert.ok(set.includes(flag), `missing ${flag}`);
  assert.ok(clearCookie().includes("Max-Age=0"));
});

test("a token round-trips through the cookie header it will be sent in", async () => {
  const token = await issueToken(env, "operator");
  const header = sessionCookie(token);
  const value = header.slice(header.indexOf("=") + 1, header.indexOf(";"));
  assert.equal(await verifyToken(env, value), "operator");
});
