// Try the online (multi-household) version on your own computer, no Cloudflare needed:
//   node --no-warnings cloudflare/dev-server.mjs
// then open http://localhost:8787/?as=you@example.com
// Change ?as= to "sign in" as someone else (e.g. a second browser profile). Data is kept in
// memory and lost when you stop it. This is a local test tool only: it fakes Cloudflare
// Access with its own key, so never expose it to the internet.
import { register } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

register("data:text/javascript," + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === "cloudflare:workers") return { url: "fake:cloudflare-workers", shortCircuit: true };
  return next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (url === "fake:cloudflare-workers") return { format: "module", shortCircuit: true, source: "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }" };
  if (url.endsWith(".json")) {
    const { readFile } = await import("node:fs/promises");
    return { format: "module", shortCircuit: true, source: "export default " + await readFile(new URL(url), "utf8") };
  }
  return next(url, ctx);
}`));

const worker = await import("./src/index.js");
const STATIC = fileURLToPath(new URL("../foodishard/app/static/", import.meta.url));
const PORT = +(process.env.PORT || 8787);
const ADMIN = process.env.ADMIN || "you@example.com";

// a stand-in for Cloudflare Access: our own signing key
const TEAM = "local.cloudflareaccess.com", AUD = "local";
const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "local", alg: "RS256" };
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => (String(url) === `https://${TEAM}/cdn-cgi/access/certs` ? Promise.resolve(new Response(JSON.stringify({ keys: [jwk] }))) : realFetch(url, init));
const b64u = (b) => Buffer.from(b).toString("base64url");
async function token(email) {
  const h = b64u(JSON.stringify({ alg: "RS256", kid: "local" }));
  const p = b64u(JSON.stringify({ aud: [AUD], iss: `https://${TEAM}`, email, exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `${h}.${p}.${b64u(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${h}.${p}`)))}`;
}

function namespace(Cls, env) {
  const objects = new Map();
  return {
    idFromName: (n) => n,
    jurisdiction() { return this; },
    get(id) {
      if (!objects.has(id)) {
        const store = new Map(), db = new DatabaseSync(":memory:");
        const sql = { exec(q, ...a) { const s = db.prepare(q); const rows = /^\s*select/i.test(q) ? s.all(...a).map((r) => ({ ...r })) : (s.run(...a), []); return { toArray: () => rows }; } };
        objects.set(id, new Cls({ storage: { get: async (k) => structuredClone(store.get(k)), put: async (k, v) => { store.set(k, structuredClone(v)); }, deleteAll: async () => store.clear(), sql } }, env));
      }
      return objects.get(id);
    },
  };
}
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain" };
const env = {
  ACCESS_TEAM: TEAM, ACCESS_AUD: AUD, ADMINS: ADMIN,
  ASSETS: { async fetch(req) {
    const path = normalize(new URL(req.url).pathname).replace(/^\/+/, "") || "index.html";
    try { return new Response(await readFile(join(STATIC, path)), { headers: { "Content-Type": TYPES[extname(path)] || "application/octet-stream" } }); }
    catch { return new Response("", { status: 404 }); }
  } },
};
env.HOUSEHOLD = namespace(worker.Household, env);
env.DIRECTORY = namespace(worker.Directory, env);

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  // remember who you're pretending to be in a cookie, so the app's own requests carry it
  const as = url.searchParams.get("as") || (/(?:^|; )as=([^;]+)/.exec(req.headers.cookie || "") || [])[1];
  const headers = new Headers();
  if (as) headers.set("Cf-Access-Jwt-Assertion", await token(decodeURIComponent(as)));
  if (req.headers["content-type"]) headers.set("Content-Type", req.headers["content-type"]);
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await worker.default.fetch(new Request(url, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined }), env);
  const out = { "Content-Type": r.headers.get("Content-Type") || "text/plain" };
  if (url.searchParams.get("as")) out["Set-Cookie"] = `as=${encodeURIComponent(url.searchParams.get("as"))}; Path=/; SameSite=Lax`;
  res.writeHead(r.status, out);
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, () => console.log(`FoodIsHard (online version, local test) on http://localhost:${PORT}/?as=${ADMIN}`));
