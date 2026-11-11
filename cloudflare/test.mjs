// Tests for the Cloudflare version, run with plain Node (no Cloudflare account needed):
//   node --no-warnings cloudflare/test.mjs
// A small loader stands in for the Workers runtime ("cloudflare:workers", JSON modules),
// fake Durable Objects keep data in memory (the Directory uses Node's built-in SQLite),
// and a fake Cloudflare API stands in for the Access policy.
import { register } from "node:module";
import { DatabaseSync } from "node:sqlite";
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
const { LIMITS } = await import("./src/directory.js");
const { Household, Directory } = worker;

// ---- fake Access: our own RSA key pair standing in for Cloudflare's -------------------
const TEAM = "test-team.cloudflareaccess.com", AUD = "aud-123";
const keyPair = () => crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pair = await keyPair();
const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1", alg: "RS256" };
const b64u = (buf) => Buffer.from(buf).toString("base64url");
async function token(claims, { kid = "k1", key = pair.privateKey } = {}) {
  const h = b64u(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const p = b64u(JSON.stringify({ aud: [AUD], iss: `https://${TEAM}`, exp: now + 3600, iat: now, ...claims }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}

// ---- fake Cloudflare API (one reusable Access policy) and ONS --------------------------
const policy = {
  id: "pol-1", name: "FoodIsHard people", decision: "allow", created_at: "x", reusable: true,
  include: [{ email: { email: "admin@example.com" } }, { github_organization: { name: "keep-me" } }], exclude: [], require: [], session_duration: "730h",
};
let apiCalls = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url === `https://${TEAM}/cdn-cgi/access/certs`) return new Response(JSON.stringify({ keys: [jwk] }));
  if (url.includes("ons.gov.uk")) return new Response(JSON.stringify({ months: [{ date: "2026 OCT", value: "200" }, { date: "2026 NOV", value: "203" }] }));
  if (url.startsWith("https://api.cloudflare.com/client/v4/accounts/acc-1/access/policies")) {
    apiCalls.push({ method: init.method || "GET", url });
    assert.equal(init.headers.Authorization, "Bearer tok-1");
    if ((init.method || "GET") === "GET") return new Response(JSON.stringify({ success: true, result: [{ id: "other", name: "Something else", include: [] }, structuredClone(policy)] }));
    if (init.method === "PUT" && url.endsWith("/pol-1")) {
      const body = JSON.parse(init.body);
      assert.ok(!("id" in body) && !("created_at" in body), "read-only fields removed");
      Object.assign(policy, body);
      return new Response(JSON.stringify({ success: true, result: policy }));
    }
  }
  return new Response("nope", { status: 404 });
};
const policyEmails = () => policy.include.filter((r) => r.email).map((r) => r.email.email).sort();

// ---- fake Durable Objects and static assets ----------------------------------------
function sqlStorage() {
  const db = new DatabaseSync(":memory:");
  return {
    exec(q, ...args) {
      const stmt = db.prepare(q);
      const rows = /^\s*select/i.test(q) ? stmt.all(...args).map((r) => ({ ...r })) : (stmt.run(...args), []);
      return { toArray: () => rows, one: () => rows[0] };
    },
  };
}
const jurisdictions = [];
function namespace(Cls, env) {
  const objects = new Map();
  return {
    idFromName: (n) => n,
    jurisdiction(j) { jurisdictions.push(j); return this; },
    get(id) {
      if (!objects.has(id)) {
        const store = new Map();
        const ctx = { storage: {
          get: async (k) => structuredClone(store.get(k)), put: async (k, v) => { store.set(k, structuredClone(v)); },
          deleteAll: async () => store.clear(), sql: sqlStorage(), _store: store,
        } };
        objects.set(id, new Cls(ctx, env));
      }
      return objects.get(id);
    },
    objects,
  };
}
function makeEnv(extra = {}) {
  const env = {
    ACCESS_TEAM: TEAM, ACCESS_AUD: AUD, ADMINS: "Admin@example.com",
    ASSETS: { fetch: async (req) => (["/index.html", "/core.js"].includes(new URL(req.url).pathname) ? new Response("asset " + new URL(req.url).pathname) : new Response("", { status: 404 })) },
    ...extra,
  };
  env.HOUSEHOLD = namespace(Household, env);
  env.DIRECTORY = namespace(Directory, env);
  worker.forgetWho();
  return env;
}
let env = makeEnv({
  HOUSEHOLDS: JSON.stringify({ smiths: { "alex@example.com": "Alex", "Sam@Example.com": "Sam" }, patels: { "priya@example.com": "Priya" } }),
});

const call = async (path, { email, method, body, tok, e = env, extraHeaders = {} } = {}) => {
  const headers = body ? { "Content-Type": "application/json", ...extraHeaders } : { ...extraHeaders };
  if (tok !== undefined) headers["Cf-Access-Jwt-Assertion"] = tok;
  else if (email) headers["Cf-Access-Jwt-Assertion"] = await token({ email });
  const res = await worker.default.fetch(new Request("https://foodishard.example.workers.dev" + path, { method: method || (body ? "POST" : "GET"), headers, body: body && JSON.stringify(body) }), e);
  const type = res.headers.get("Content-Type") || "";
  return { status: res.status, body: type.includes("json") ? await res.json() : await res.text() };
};
const state = async (email) => (await call("/api/state", { email })).body.state;

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log("ok -", name); };

// ---------------------------------------------------------------- sign-in
await test("health check needs no sign-in", async () => {
  assert.equal((await call("/api/health")).status, 200);
});
await test("no token: asked to sign in, nothing served", async () => {
  for (const p of ["/api/state", "/", "/data/recipes.json", "/api/account", "/api/admin"]) assert.equal((await call(p)).status, 401, p);
});
await test("forged, expired and wrong-app tokens are refused", async () => {
  const other = await keyPair();
  assert.equal((await call("/api/state", { tok: await token({ email: "alex@example.com" }, { key: other.privateKey }) })).status, 401);
  assert.equal((await call("/api/state", { tok: await token({ email: "alex@example.com", exp: 1 }) })).status, 401);
  assert.equal((await call("/api/state", { tok: await token({ email: "alex@example.com", aud: ["someone-else"] }) })).status, 401);
  assert.equal((await call("/api/state", { tok: await token({ email: "admin@example.com", iss: "https://evil.cloudflareaccess.com" }) })).status, 401);
  assert.equal((await call("/api/state", { tok: "garbage" })).status, 401);
});
await test("missing settings: explains set-up instead of serving", async () => {
  const r = await worker.default.fetch(new Request("https://x.workers.dev/"), { ...env, ACCESS_AUD: "" });
  assert.equal(r.status, 503);
});
await test("signed in but not in a household: polite 403", async () => {
  const r = await call("/api/state", { email: "stranger@example.com" });
  assert.equal(r.status, 403); assert.match(r.body, /haven't been added to a household/);
});

// ---------------------------------------------------------------- households & data
await test("old HOUSEHOLDS setting is imported once; app files served to members", async () => {
  assert.equal((await call("/", { email: "alex@example.com" })).body, "asset /index.html");
  const recipes = (await call("/data/recipes.json", { email: "sam@example.com" })).body;
  assert.ok(recipes.recipes.length >= 45 && recipes.themes.length >= 20);
});
await test("new household starts from defaults; names and host come through", async () => {
  const r = await call("/api/state", { email: "alex@example.com" });
  assert.equal(r.body.user, "Alex"); assert.equal(r.body.poll, 8); assert.equal(r.body.host, "Cloudflare");
  assert.equal(r.body.state.rev, 0);
  assert.equal(r.body.region, "eu");
  assert.ok(jurisdictions.length > 0 && jurisdictions.every((j) => j === "eu"), "data kept in the EU");
});
await test("ops are shared within a household (email case ignored)", async () => {
  await call("/api/op", { email: "alex@example.com", body: { op: "settings", patch: { dislikes: "olives" } } });
  await call("/api/op", { email: "sam@example.com", body: { op: "check", week: "2026-11-09", key: "rice", field: "done", value: true } });
  const s = await state("SAM@example.com");
  assert.equal(s.settings.dislikes, "olives"); assert.equal(s.checks["2026-11-09"].rice.by, "Sam");
});
await test("households can't see each other's data", async () => {
  const p = await state("priya@example.com");
  assert.equal(p.settings.dislikes, ""); assert.deepEqual(p.checks, {});
});
await test("bad ops are rejected and don't corrupt state", async () => {
  assert.equal((await call("/api/op", { email: "alex@example.com", body: { op: "explode" } })).status, 400);
  assert.equal((await state("alex@example.com")).settings.dislikes, "olives");
});
await test("unchanged rev returns a tiny reply", async () => {
  const rev = (await state("alex@example.com")).rev;
  assert.equal((await call(`/api/state?rev=${rev}`, { email: "alex@example.com" })).body.unchanged, true);
});

// ---------------------------------------------------------------- admin gets a household
await test("an admin with no household gets the dashboard only", async () => {
  const r = await call("/api/account", { email: "admin@example.com" });
  assert.equal(r.status, 200); assert.equal(r.body.admin, true); assert.equal(r.body.household, null);
  assert.equal(r.body.manageSignIn, false);
  const st = await call("/api/state", { email: "admin@example.com" });
  assert.equal(st.body.adminOnly, true); assert.ok(!st.body.state);
  assert.equal((await call("/api/op", { email: "admin@example.com", body: { op: "settings", patch: {} } })).status, 400);
  assert.equal((await call("/api/account/invite", { email: "admin@example.com", body: { email: "z@example.com", name: "Z" } })).status, 400);
  assert.equal((await call("/api/admin", { email: "admin@example.com" })).status, 200);
});
await test("last active is recorded, at most hourly", async () => {
  const before = (await call("/api/admin", { email: "admin@example.com" })).body.households.flatMap((h) => h.members).find((m) => m.email === "alex@example.com");
  assert.ok(before.lastSeen > 0, "alex has used the app");
  const dir = env.DIRECTORY.get("directory");
  dir.sql.exec("UPDATE members SET last_seen = 100 WHERE email = ?", "alex@example.com");
  worker.forgetWho();
  await call("/api/state", { email: "alex@example.com" });
  const after = dir.rows("SELECT last_seen FROM members WHERE email = ?", "alex@example.com")[0].last_seen;
  assert.ok(after > 100, "old timestamp refreshed");
  dir.sql.exec("UPDATE members SET last_seen = ? WHERE email = ?", after - 60, "alex@example.com");
  worker.forgetWho();
  await call("/api/state", { email: "alex@example.com" });
  assert.equal(dir.rows("SELECT last_seen FROM members WHERE email = ?", "alex@example.com")[0].last_seen, after - 60, "not rewritten within the hour");
  const never = (await call("/api/admin", { email: "admin@example.com" })).body.households.flatMap((h) => h.members).find((m) => m.email === "sam@example.com");
  assert.ok(never.lastSeen > 0);
});
await test("non-admins can't use admin endpoints", async () => {
  assert.equal((await call("/api/admin", { email: "alex@example.com" })).status, 403);
  assert.equal((await call("/api/admin/household", { email: "alex@example.com", body: { householdName: "X", email: "x@y.zz", name: "X" } })).status, 403);
  assert.equal((await call("/api/admin/delete-household", { email: "alex@example.com", body: { id: "patels" } })).status, 403);
  assert.equal((await call("/api/account", { email: "alex@example.com" })).body.admin, false);
});

// ---------------------------------------------------------------- invites (no API token: manual)
await test("without an API token, invites still work and say sign-in is manual", async () => {
  const r = await call("/api/account/invite", { email: "priya@example.com", body: { email: "Dev@Example.com ", name: "Dev" } });
  assert.equal(r.status, 200); assert.equal(r.body.signIn.manual, true); assert.equal(r.body.invited, "dev@example.com");
  assert.equal(r.body.household.members.length, 2);
  const s = await call("/api/state", { email: "dev@example.com" });
  assert.equal(s.status, 200); assert.equal(s.body.user, "Dev");
});

// ---------------------------------------------------------------- invites with automatic sign-in list
env = makeEnv({ CF_ACCOUNT_ID: "acc-1", CF_API_TOKEN: "tok-1" });
await test("admin invites a new household; sign-in list updated, other rules kept", async () => {
  apiCalls = [];
  const r = await call("/api/admin/household", { email: "admin@example.com", body: { householdName: "The Joneses", email: "jo@example.com", name: "Jo" } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.signIn.ok, true);
  assert.deepEqual(policyEmails(), ["admin@example.com", "jo@example.com"]);
  assert.ok(policy.include.some((x) => x.github_organization), "non-email rule kept");
  assert.equal(policy.session_duration, "730h");
  assert.equal(r.body.households.length, 1);
  await call("/api/admin/household", { email: "admin@example.com", body: { householdName: "The Browns", email: "bob@example.com", name: "Bob" } });
  assert.equal((await call("/api/state", { email: "jo@example.com" })).status, 200);
});
await test("a member invites their partner, who can then sign in to the same household", async () => {
  await call("/api/op", { email: "jo@example.com", body: { op: "settings", patch: { dislikes: "mushrooms" } } });
  const r = await call("/api/account/invite", { email: "jo@example.com", body: { email: "chris@example.com", name: "Chris" } });
  assert.equal(r.status, 200); assert.equal(r.body.signIn.ok, true);
  assert.deepEqual(policyEmails(), ["admin@example.com", "bob@example.com", "chris@example.com", "jo@example.com"]);
  assert.equal((await state("chris@example.com")).settings.dislikes, "mushrooms");
});
await test("nobody can invite themselves into someone else's household", async () => {
  // a body naming another household is ignored: invites always go to your own
  const browns = (await call("/api/account", { email: "bob@example.com" })).body.household.id;
  const r = await call("/api/account/invite", { email: "jo@example.com", body: { email: "pat@example.com", name: "Pat", household: browns } });
  assert.equal(r.status, 200);
  const pat = await call("/api/account", { email: "pat@example.com" });
  assert.equal(pat.body.household.id, r.body.household.id);
  assert.notEqual(pat.body.household.id, browns);
  // and someone already in a household can't be pulled into another
  const again = await call("/api/account/invite", { email: "bob@example.com", body: { email: "jo@example.com", name: "Jo" } });
  assert.equal(again.status, 400); assert.match(again.body.error, /already in another household/);
});
await test("bad invites are refused", async () => {
  assert.match((await call("/api/account/invite", { email: "jo@example.com", body: { email: "not-an-email", name: "X" } })).body.error, /email/);
  assert.match((await call("/api/account/invite", { email: "jo@example.com", body: { email: "x@example.com", name: "  " } })).body.error, /name/);
  assert.match((await call("/api/account/invite", { email: "jo@example.com", body: { email: "chris@example.com", name: "C" } })).body.error, /already in your household/);
});
await test("you can only remove people from your own household", async () => {
  const r = await call("/api/account/remove", { email: "jo@example.com", body: { email: "bob@example.com" } });
  assert.equal(r.status, 400); assert.match(r.body.error, /own household/);
  assert.equal((await call("/api/admin/remove", { email: "jo@example.com", body: { email: "bob@example.com" } })).status, 403);
});
await test("removing a partner takes them off the sign-in list and locks them out", async () => {
  const r = await call("/api/account/remove", { email: "jo@example.com", body: { email: "pat@example.com" } });
  assert.equal(r.status, 200); assert.ok(!policyEmails().includes("pat@example.com"));
  assert.equal((await call("/api/state", { email: "pat@example.com" })).status, 403);
});
await test("the last person in a household can't be removed (admins delete households instead)", async () => {
  await call("/api/account/remove", { email: "jo@example.com", body: { email: "chris@example.com" } });
  const r = await call("/api/admin/remove", { email: "admin@example.com", body: { email: "jo@example.com" } });
  assert.equal(r.status, 400); assert.match(r.body.error, /last person/);
});
await test("people can rename themselves and their household", async () => {
  const r = await call("/api/account/rename", { email: "jo@example.com", body: { name: "Joanna", householdName: "Jones family" } });
  assert.equal(r.body.me.name, "Joanna"); assert.equal(r.body.household.name, "Jones family");
  assert.equal((await call("/api/state", { email: "jo@example.com" })).body.user, "Joanna");
});
await test("household size and site-wide limits hold", async () => {
  const saved = { ...LIMITS };
  LIMITS.perHousehold = 2;
  await call("/api/account/invite", { email: "jo@example.com", body: { email: "kim@example.com", name: "Kim" } });
  assert.match((await call("/api/account/invite", { email: "jo@example.com", body: { email: "lee@example.com", name: "Lee" } })).body.error, /up to 2 people/);
  LIMITS.perHousehold = saved.perHousehold; LIMITS.people = 3;
  assert.match((await call("/api/account/invite", { email: "jo@example.com", body: { email: "lee@example.com", name: "Lee" } })).body.error, /is full/);
  Object.assign(LIMITS, saved);
});
await test("admin can add, move, rename and remove across households", async () => {
  const ov = (await call("/api/admin", { email: "admin@example.com" })).body;
  const browns = ov.households.find((h) => h.members.some((m) => m.email === "bob@example.com"));
  const jones = ov.households.find((h) => h.members.some((m) => m.email === "jo@example.com"));
  let r = await call("/api/admin/member", { email: "admin@example.com", body: { household: browns.id, email: "amy@example.com", name: "Amy" } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(policyEmails().includes("amy@example.com"));
  assert.match((await call("/api/admin/member", { email: "admin@example.com", body: { household: browns.id, email: "jo@example.com", name: "Jo" } })).body.error, /already in/);
  assert.match((await call("/api/admin/member", { email: "admin@example.com", body: { household: "nope", email: "q@example.com", name: "Q" } })).body.error, /No such household/);
  r = await call("/api/admin/move", { email: "admin@example.com", body: { email: "amy@example.com", household: jones.id } });
  assert.equal(r.status, 200);
  assert.equal((await call("/api/account", { email: "amy@example.com" })).body.household.id, jones.id);
  assert.match((await call("/api/admin/move", { email: "admin@example.com", body: { email: "bob@example.com", household: jones.id } })).body.error, /last person/);
  r = await call("/api/admin/rename-household", { email: "admin@example.com", body: { id: browns.id, name: "Brown family" } });
  assert.ok(r.body.households.some((h) => h.name === "Brown family"));
  r = await call("/api/admin/remove", { email: "admin@example.com", body: { email: "amy@example.com" } });
  assert.equal(r.status, 200); assert.ok(!policyEmails().includes("amy@example.com"));
  assert.equal((await call("/api/state", { email: "amy@example.com" })).status, 403);
  for (const p of ["/api/admin/member", "/api/admin/move", "/api/admin/rename-household", "/api/admin/leave"])
    assert.equal((await call(p, { email: "jo@example.com", body: {} })).status, 403, p);
});
await test("an admin in a household can leave it to become admin-only", async () => {
  await call("/api/admin/household", { email: "admin@example.com", body: { householdName: "Home", email: "admin@example.com", name: "Admin" } });
  const home = (await call("/api/account", { email: "admin@example.com" })).body.household;
  assert.ok(home && home.name === "Home");
  assert.match((await call("/api/admin/delete-household", { email: "admin@example.com", body: { id: home.id } })).body.error, /your own/);
  await call("/api/op", { email: "admin@example.com", body: { op: "settings", patch: { dislikes: "x" } } });
  const r = await call("/api/admin/leave", { email: "admin@example.com", body: {} });
  assert.equal(r.status, 200); assert.ok(!r.body.households.some((h) => h.id === home.id));
  assert.equal(env.HOUSEHOLD.objects.get(home.id).ctx.storage._store.size, 0, "empty household's data wiped");
  assert.equal((await call("/api/state", { email: "admin@example.com" })).body.adminOnly, true);
  assert.ok(policyEmails().includes("admin@example.com"), "admins can always sign in");
});
await test("deleting a household wipes its data and locks its members out", async () => {
  const ov = (await call("/api/admin", { email: "admin@example.com" })).body;
  const jones = ov.households.find((h) => h.members.some((m) => m.email === "jo@example.com"));
  const r = await call("/api/admin/delete-household", { email: "admin@example.com", body: { id: jones.id } });
  assert.equal(r.status, 200); assert.equal(r.body.households.length, 1);
  assert.deepEqual(policyEmails(), ["admin@example.com", "bob@example.com"]);
  assert.equal((await call("/api/state", { email: "jo@example.com" })).status, 403);
  assert.equal(env.HOUSEHOLD.objects.get(jones.id).ctx.storage._store.size, 0, "household data wiped");
});
await test("sync leaves an up-to-date list alone and reports problems clearly", async () => {
  apiCalls = [];
  const r = await call("/api/admin/sync", { email: "admin@example.com", body: {} });
  assert.equal(r.body.signIn.changed, false); assert.ok(!apiCalls.some((c) => c.method === "PUT"));
  const bad = await logic.syncAccessPolicy({ CF_ACCOUNT_ID: "acc-1", CF_API_TOKEN: "tok-1", ACCESS_POLICY_NAME: "Missing" }, ["a@b.co"]);
  assert.equal(bad.ok, false); assert.match(bad.message, /Couldn't find/);
  assert.equal((await call("/api/admin", { email: "admin@example.com" })).body.lastSync.ok, true);
});

// ---------------------------------------------------------------- backups, inflation, housekeeping
await test("export from one household imports into another; junk is refused", async () => {
  const mine = await state("bob@example.com");
  mine.settings.dislikes = "capers";
  env = makeEnv({ HOUSEHOLDS: JSON.stringify({ a: { "a@example.com": "A" } }) });
  const r = await call("/api/import", { email: "a@example.com", body: { foodishard: 1, state: mine } });
  assert.equal(r.status, 200); assert.equal(r.body.state.settings.dislikes, "capers"); assert.ok(r.body.state.rev > 0);
  assert.equal((await call("/api/import", { email: "a@example.com", body: { hello: "world" } })).status, 400);
  assert.equal((await call("/api/import", { email: "a@example.com", body: { settings: { people: [] }, plans: [] } })).status, 400);
});
await test("weekly ONS check reaches every household that hasn't switched it off", async () => {
  env = makeEnv({ HOUSEHOLDS: JSON.stringify({ a: { "a@example.com": "A" }, b: { "b@example.com": "B" } }) });
  await call("/api/op", { email: "b@example.com", body: { op: "settings", patch: { inflation: false } } });
  await worker.default.scheduled({}, env);
  assert.equal((await state("a@example.com")).inflation.factor, 1.015);
  assert.ok(!((await state("b@example.com")).inflation || {}).factor);
});
await test("old weeks are pruned: lists after 8 weeks, plans after a year", async () => {
  const s = { checks: { "2026-09-07": {}, "2026-09-21": {}, "2026-11-09": {} }, extras: { "2026-09-07": [] }, shopFor: {},
    plans: { "2025-10-27": {}, "2025-11-17": {}, "2026-09-07": {} } };
  logic.prune(s, new Date("2026-11-10"));
  assert.deepEqual(Object.keys(s.checks), ["2026-09-21", "2026-11-09"]); assert.deepEqual(Object.keys(s.extras), []);
  assert.deepEqual(Object.keys(s.plans), ["2025-11-17", "2026-09-07"]);
});
await test("recipe feedback: admins see every household's, with a new count; others can't", async () => {
  const e = makeEnv({ HOUSEHOLDS: JSON.stringify({ a: { "alex@example.com": "Alex" }, b: { "priya@example.com": "Priya" } }) });
  const c = (p, o = {}) => call(p, { e, ...o });
  const before = (await c("/api/admin", { email: "admin@example.com" })).body.feedback;
  assert.equal(before.new, 0);
  const rid = (await import("../foodishard/app/data/recipes.json", { with: { type: "json" } })).default.recipes[0];
  assert.equal((await c("/api/op", { email: "alex@example.com", body: { op: "feedback", recipe: rid.id, rating: "loved", tags: ["Too spicy"], note: "lovely" } })).status, 200);
  assert.equal((await c("/api/op", { email: "priya@example.com", body: { op: "feedback", recipe: rid.id, rating: "never" } })).status, 200);
  assert.equal((await c("/api/admin", { email: "admin@example.com" })).body.feedback.new, 2);
  assert.equal((await c("/api/admin/feedback", { email: "alex@example.com" })).status, 403);
  const r = (await c("/api/admin/feedback", { email: "admin@example.com" })).body;
  const mine = r.items.filter((i) => i.recipe === rid.id && (i.note === "lovely" || i.rating === "never"));
  assert.equal(mine.length, 2);
  const alex = mine.find((i) => i.note === "lovely");
  assert.equal(alex.recipeName, rid.name); assert.equal(alex.by, "Alex"); assert.deepEqual(alex.tags, ["Too spicy"]); assert.ok(alex.household);
  assert.equal(r.new, 2);
  assert.equal((await c("/api/admin/feedback/seen", { email: "admin@example.com", body: {} })).body.new, 0);
  assert.equal((await c("/api/admin", { email: "admin@example.com" })).body.feedback.new, 0);
  assert.equal((await c("/api/admin/feedback/seen", { email: "alex@example.com", body: {} })).status, 403);
});
const space = (ns) => ns.jurisdiction("eu");
await test("delete my account: leaves the household, scrubs the name; the last one out deletes it", async () => {
  const e = makeEnv({ HOUSEHOLDS: JSON.stringify({ a: { "alex@example.com": "Alex", "sam@example.com": "Sam" }, b: { "priya@example.com": "Priya" } }) });
  const c = (p, o = {}) => call(p, { e, ...o });
  await c("/api/op", { email: "alex@example.com", body: { op: "feedback", recipe: "x", rating: "fine" } });
  await c("/api/op", { email: "sam@example.com", body: { op: "feedback", recipe: "x", rating: "loved" } });
  const r = await c("/api/account/delete", { email: "alex@example.com", body: {} });
  assert.equal(r.status, 200); assert.equal(r.body.householdDeleted, false);
  assert.equal((await c("/api/state", { email: "alex@example.com" })).status, 403);
  const s = (await c("/api/state", { email: "sam@example.com" })).body.state;
  assert.deepEqual(s.feedback.x.map((f) => f.by), ["a former member", "Sam"]);
  await c("/api/op", { email: "priya@example.com", body: { op: "extra_add", week: "2026-11-09", item: { id: "i1", name: "Milk" } } });
  const hh = space(e.HOUSEHOLD).get(space(e.HOUSEHOLD).idFromName("b"));
  assert.equal((await hh.getState()).state.extras["2026-11-09"].length, 1);
  const r2 = await c("/api/account/delete", { email: "priya@example.com", body: {} });
  assert.equal(r2.body.householdDeleted, true);
  const ov = (await c("/api/admin", { email: "admin@example.com" })).body;
  assert.equal(ov.households.length, 1); assert.equal(ov.people, 1);
  // the old household's storage is wiped
  assert.equal(((await hh.getState()).state.extras || {})["2026-11-09"], undefined);
  assert.equal((await c("/api/account/delete", { email: "nobody@example.com", body: {} })).status, 403);
});
await test("admin message: everyone sees it once, until they dismiss it; a new one shows again", async () => {
  const e = makeEnv({ HOUSEHOLDS: JSON.stringify({ a: { "alex@example.com": "Alex", "admin@example.com": "Me" }, b: { "priya@example.com": "Priya" } }) });
  const c = (p, o = {}) => call(p, { e, ...o });
  assert.equal((await c("/api/notice", { email: "alex@example.com" })).body.notice, null);
  assert.equal((await c("/api/admin/notice", { email: "alex@example.com", body: { text: "hi" } })).status, 403);
  assert.equal((await c("/api/admin/notice", { email: "admin@example.com", body: { text: "  " } })).status, 400);
  const ov = (await c("/api/admin/notice", { email: "admin@example.com", body: { text: "New recipes are in!" } })).body;
  assert.equal(ov.notice.text, "New recipes are in!"); assert.equal(ov.notice.seenBy, 1);
  assert.equal((await c("/api/notice", { email: "admin@example.com" })).body.notice, null); // the sender has seen it
  const n = (await c("/api/notice", { email: "alex@example.com" })).body.notice;
  assert.equal(n.text, "New recipes are in!");
  assert.equal((await c("/api/notice", { email: "alex@example.com" })).body.notice.id, n.id); // still there until dismissed
  await c("/api/notice/seen", { email: "alex@example.com", body: { id: n.id } });
  assert.equal((await c("/api/notice", { email: "alex@example.com" })).body.notice, null);
  assert.equal((await c("/api/admin", { email: "admin@example.com" })).body.notice.seenBy, 2);
  await c("/api/admin/notice", { email: "admin@example.com", body: { text: "Another one" } });
  assert.equal((await c("/api/notice", { email: "alex@example.com" })).body.notice.text, "Another one");
  await c("/api/admin/notice/clear", { email: "admin@example.com", body: {} });
  assert.equal((await c("/api/notice", { email: "priya@example.com" })).body.notice, null);
  assert.equal((await c("/api/admin", { email: "admin@example.com" })).body.notice, null);
  // the 💬 report button: on by default, only the admin can switch it, everyone sees the change
  assert.equal((await c("/api/notice", { email: "alex@example.com" })).body.reportBubble, true);
  assert.equal((await c("/api/admin/bubble", { email: "alex@example.com", body: { on: false } })).status, 403);
  assert.equal((await c("/api/admin/bubble", { email: "admin@example.com", body: { on: false } })).body.reportBubble, false);
  assert.equal((await c("/api/notice", { email: "alex@example.com" })).body.reportBubble, false);
  await c("/api/admin/bubble", { email: "admin@example.com", body: { on: true } });
  assert.equal((await c("/api/notice", { email: "alex@example.com" })).body.reportBubble, true);
});
await test("security: crafted keys are refused and can't touch shared objects", async () => {
  const e = makeEnv({ HOUSEHOLDS: JSON.stringify({ a: { "alex@example.com": "Alex" } }) });
  const c = (p, o = {}) => call(p, { e, ...o });
  for (const body of [
    { op: "shop_for", week: "__proto__", key: "polluted", shop: "evil" },
    { op: "check", week: "2026-11-09", key: "__proto__", field: "done", value: true },
    { op: "pref", recipe: "constructor", patch: { fav: true } },
    { op: "settings", patch: { ["__proto__"]: { polluted: "evil" } } },
    { op: "trip", week: "2026-11-09", keys: ["ok", "prototype"] },
    { op: "day", week: "2026-11-09", i: "__proto__", day: {} },
    { op: "check", week: "2026-11-09", key: "i:x", field: "__proto__", value: true },
  ]) assert.equal((await c("/api/op", { email: "alex@example.com", body })).status, 400, JSON.stringify(body));
  assert.equal(({}).polluted, undefined);
  for (const body of [
    { op: "pref", recipe: "toString", patch: { fav: true } },
    { op: "extra_add", week: "2026-11-09", item: { id: "a", name: "x".repeat(500) } },
    { op: "feedback", recipe: "r", rating: "fine", tags: ["y".repeat(100)] },
  ]) assert.equal((await c("/api/op", { email: "alex@example.com", body })).status, 400, JSON.stringify(body).slice(0, 60));
  assert.equal((await c("/api/op", { email: "alex@example.com", body: { op: "check", week: "2026-11-09", key: "i:x", field: "done", value: true } })).status, 200);
});
await test("security: changes must come as JSON from the app's own site", async () => {
  const e = makeEnv({ HOUSEHOLDS: JSON.stringify({ a: { "alex@example.com": "Alex" } }) });
  const c = (p, o = {}) => call(p, { e, ...o });
  const body = { email: "evil@example.com", name: "Evil" };
  assert.equal((await c("/api/account/invite", { email: "alex@example.com", body, extraHeaders: { Origin: "https://evil.example" } })).status, 403);
  assert.equal((await c("/api/account/invite", { email: "alex@example.com", body, extraHeaders: { "Content-Type": "text/plain" } })).status, 415);
  assert.equal((await c("/api/account", { email: "alex@example.com" })).body.household.members.length, 1);
  assert.equal((await c("/api/account/invite", { email: "alex@example.com", body: { email: "sam@example.com", name: "Sam" }, extraHeaders: { Origin: "https://foodishard.example.workers.dev" } })).status, 200);
});
await test("security: tokens without the right issuer are refused; responses forbid framing", async () => {
  assert.equal((await call("/api/state", { tok: await token({ email: "alex@example.com", iss: undefined }) })).status, 401);
  const res = await worker.default.fetch(new Request("https://foodishard.example.workers.dev/api/health"), env);
  assert.equal(res.headers.get("X-Frame-Options"), "DENY");
});
await test("DATA_REGION=auto lets Cloudflare choose", async () => {
  const e = makeEnv({ HOUSEHOLDS: JSON.stringify({ z: { "z@example.com": "Z" } }), DATA_REGION: "auto" });
  jurisdictions.length = 0;
  const r = await call("/api/state", { email: "z@example.com", e });
  assert.equal(r.body.region, "auto"); assert.equal(jurisdictions.length, 0);
});
await test("a broken old HOUSEHOLDS setting is reported, not half-imported", async () => {
  const e = makeEnv({ HOUSEHOLDS: "{not json" });
  assert.equal((await call("/api/state", { email: "admin@example.com", e })).status, 500);
  assert.throws(() => logic.parseHouseholds({ a: { "x@y.z": "X" }, b: { "X@y.z": "X2" } }), /more than one household/);
});

console.log(`\n${passed} tests passed`);
