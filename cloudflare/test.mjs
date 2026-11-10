// Tests for the Cloudflare version, run with plain Node (no Cloudflare account needed):
//   node cloudflare/test.mjs
// A small loader stands in for the Workers runtime ("cloudflare:workers", JSON modules),
// and fake Durable Objects keep each household's data in memory.
import { register } from "node:module";
import assert from "node:assert/strict";

register("data:text/javascript," + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === "cloudflare:workers") return { url: "fake:cloudflare-workers", shortCircuit: true };
  return next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (url === "fake:cloudflare-workers") return { format: "module", shortCircuit: true, source: "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }" };
  if (url.endsWith(".json")) {
    const { readFile } = await import("node:fs/promises");
    const text = await readFile(new URL(url), "utf8");
    return { format: "module", shortCircuit: true, source: "export default " + text };
  }
  return next(url, ctx);
}`));

const worker = await import("./src/index.js");
const logic = await import("./src/logic.js");
const { Household } = worker;

// ---- fake Access: our own RSA key pair standing in for Cloudflare's -------------------
const TEAM = "test-team.cloudflareaccess.com", AUD = "aud-123";
const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1", alg: "RS256" };
const b64u = (buf) => Buffer.from(buf).toString("base64url");
async function token(claims, { kid = "k1", key = pair.privateKey } = {}) {
  const h = b64u(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const p = b64u(JSON.stringify({ aud: [AUD], iss: `https://${TEAM}`, exp: now + 3600, iat: now, ...claims }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}
globalThis.fetch = async (url) => {
  if (String(url) === `https://${TEAM}/cdn-cgi/access/certs`) return new Response(JSON.stringify({ keys: [jwk] }));
  if (String(url).includes("ons.gov.uk")) return new Response(JSON.stringify({ months: [{ date: "2026 OCT", value: "200" }, { date: "2026 NOV", value: "203" }] }));
  return new Response("nope", { status: 404 });
};

// ---- fake Durable Object namespace and static assets ---------------------------------
function namespace(env) {
  const objects = new Map();
  return {
    idFromName: (n) => n,
    get(id) {
      if (!objects.has(id)) {
        const store = new Map();
        const ctx = { storage: { get: async (k) => structuredClone(store.get(k)), put: async (k, v) => { store.set(k, structuredClone(v)); } } };
        objects.set(id, new Household(ctx, env));
      }
      return objects.get(id);
    },
    objects,
  };
}
const env = {
  ACCESS_TEAM: TEAM, ACCESS_AUD: AUD,
  HOUSEHOLDS: JSON.stringify({ smiths: { "alex@example.com": "Alex", "Sam@Example.com": "Sam" }, patels: { "priya@example.com": "Priya" } }),
  ASSETS: { fetch: async (req) => (new URL(req.url).pathname === "/index.html" || new URL(req.url).pathname === "/core.js" ? new Response("asset " + new URL(req.url).pathname) : new Response("", { status: 404 })) },
};
env.HOUSEHOLD = namespace(env);

const call = async (path, { email, method = "GET", body, tok } = {}) => {
  const headers = {};
  if (tok !== undefined) headers["Cf-Access-Jwt-Assertion"] = tok;
  else if (email) headers["Cf-Access-Jwt-Assertion"] = await token({ email });
  const res = await worker.default.fetch(new Request("https://foodishard.example.workers.dev" + path, { method, headers, body: body && JSON.stringify(body) }), env);
  const type = res.headers.get("Content-Type") || "";
  return { status: res.status, body: type.includes("json") ? await res.json() : await res.text() };
};

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log("ok -", name); };

await test("health check needs no sign-in", async () => {
  assert.equal((await call("/api/health")).status, 200);
});
await test("no token: asked to sign in, nothing served", async () => {
  assert.equal((await call("/api/state")).status, 401);
  assert.equal((await call("/")).status, 401);
  assert.equal((await call("/data/recipes.json")).status, 401);
});
await test("forged, expired and wrong-app tokens are refused", async () => {
  const other = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign"]);
  assert.equal((await call("/api/state", { tok: await token({ email: "alex@example.com" }, { key: other.privateKey }) })).status, 401);
  assert.equal((await call("/api/state", { tok: await token({ email: "alex@example.com", exp: 1 }) })).status, 401);
  assert.equal((await call("/api/state", { tok: await token({ email: "alex@example.com", aud: ["someone-else"] }) })).status, 401);
  assert.equal((await call("/api/state", { tok: "garbage" })).status, 401);
});
await test("signed in but not in a household: polite 403", async () => {
  const r = await call("/api/state", { email: "stranger@example.com" });
  assert.equal(r.status, 403); assert.match(r.body, /isn't part of a household/);
});
await test("missing settings: explains set-up instead of serving", async () => {
  const r = await worker.default.fetch(new Request("https://x.workers.dev/"), { ...env, ACCESS_AUD: "" });
  assert.equal(r.status, 503);
});
await test("app files and recipe data served to members", async () => {
  assert.equal((await call("/", { email: "alex@example.com" })).body, "asset /index.html");
  assert.equal((await call("/core.js", { email: "alex@example.com" })).body, "asset /core.js");
  const recipes = (await call("/data/recipes.json", { email: "alex@example.com" })).body;
  assert.ok(recipes.recipes.length >= 45 && recipes.themes.length >= 20);
});
await test("new household starts from defaults; names come from HOUSEHOLDS", async () => {
  const r = await call("/api/state", { email: "alex@example.com" });
  assert.equal(r.status, 200); assert.equal(r.body.user, "Alex"); assert.equal(r.body.poll, 8);
  assert.equal(r.body.state.rev, 0); assert.ok(Array.isArray(r.body.state.settings.people));
});
await test("ops apply and are shared within a household (email case ignored)", async () => {
  const r = await call("/api/op", { email: "alex@example.com", method: "POST", body: { op: "settings", patch: { dislikes: "olives" } } });
  assert.equal(r.status, 200); assert.equal(r.body.state.rev, 1);
  await call("/api/op", { email: "sam@example.com", method: "POST", body: { op: "check", week: "2026-11-09", key: "rice", field: "done", value: true } });
  const s = (await call("/api/state", { email: "SAM@example.com" })).body.state;
  assert.equal(s.settings.dislikes, "olives"); assert.equal(s.checks["2026-11-09"].rice.by, "Sam");
});
await test("households can't see each other's data", async () => {
  const p = (await call("/api/state", { email: "priya@example.com" })).body.state;
  assert.equal(p.settings.dislikes, ""); assert.deepEqual(p.checks, {});
  assert.equal(p.rev, 0);
});
await test("unchanged rev returns a tiny reply", async () => {
  const r = await call("/api/state?rev=2", { email: "alex@example.com" });
  assert.equal(r.body.unchanged, true);
});
await test("bad ops are rejected and don't corrupt state", async () => {
  const r = await call("/api/op", { email: "alex@example.com", method: "POST", body: { op: "explode" } });
  assert.equal(r.status, 400);
  const s = (await call("/api/state", { email: "alex@example.com" })).body.state;
  assert.equal(s.rev, 2); assert.equal(s.settings.dislikes, "olives");
});
await test("export from one household imports into another", async () => {
  const smiths = (await call("/api/state", { email: "alex@example.com" })).body.state;
  const r = await call("/api/import", { email: "priya@example.com", method: "POST", body: { foodishard: 1, state: smiths } });
  assert.equal(r.status, 200); assert.equal(r.body.state.settings.dislikes, "olives"); assert.ok(r.body.state.rev > 0);
  const bad = await call("/api/import", { email: "priya@example.com", method: "POST", body: { hello: "world" } });
  assert.equal(bad.status, 400);
  const bad2 = await call("/api/import", { email: "priya@example.com", method: "POST", body: { settings: { people: [] }, plans: [] } });
  assert.equal(bad2.status, 400);
});
await test("weekly ONS check updates every household that hasn't switched it off", async () => {
  await call("/api/op", { email: "priya@example.com", method: "POST", body: { op: "settings", patch: { inflation: false } } });
  await worker.default.scheduled({}, env);
  const a = (await call("/api/state", { email: "alex@example.com" })).body.state;
  const p = (await call("/api/state", { email: "priya@example.com" })).body.state;
  assert.equal(a.inflation.factor, 1.015); assert.equal(a.inflation.latest, "2026 NOV");
  assert.ok(!p.inflation || !p.inflation.factor);
});
await test("old weeks are pruned so data stays small", async () => {
  const s = { checks: { "2020-01-06": {}, "2026-11-09": {} }, extras: {}, shopFor: {}, plans: { "2020-01-06": {}, "2026-11-09": {} } };
  logic.prune(s, new Date("2026-11-10"));
  assert.deepEqual(Object.keys(s.checks), ["2026-11-09"]); assert.deepEqual(Object.keys(s.plans), ["2026-11-09"]);
});
await test("HOUSEHOLDS mistakes are caught", async () => {
  assert.throws(() => logic.parseHouseholds({ a: { "x@y.z": "X" }, b: { "X@y.z": "X2" } }), /more than one household/);
  assert.throws(() => logic.parseHouseholds({ "bad id!": {} }), /letters, numbers/);
  const r = await worker.default.fetch(new Request("https://x.workers.dev/api/state", { headers: { "Cf-Access-Jwt-Assertion": await token({ email: "a@b.c" }) } }), { ...env, HOUSEHOLDS: "{not json" });
  assert.equal(r.status, 500);
});

console.log(`\n${passed} tests passed`);
