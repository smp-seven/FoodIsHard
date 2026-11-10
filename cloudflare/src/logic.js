// Pure logic for the Cloudflare version of FoodIsHard: sign-in checks, household lookup
// and state housekeeping. Nothing in here talks to Cloudflare directly, so it can be
// tested with plain Node (see cloudflare/test.mjs).

// ---------------------------------------------------------------------------
// Households
// ---------------------------------------------------------------------------

/**
 * HOUSEHOLDS is set in the Cloudflare dashboard (never in the repo), as JSON:
 *   { "smiths": { "alex@example.com": "Alex", "sam@example.com": "Sam" },
 *     "patels": { "priya@example.com": "Priya" } }
 * Household ids are letters, numbers and dashes. Each email belongs to one household.
 */
export function parseHouseholds(raw) {
  if (!raw) return {};
  const doc = typeof raw === "string" ? JSON.parse(raw) : raw;
  const byEmail = {};
  for (const [id, members] of Object.entries(doc)) {
    if (!/^[a-z0-9-]{1,40}$/i.test(id)) throw new Error(`Household id "${id}" should only use letters, numbers and dashes`);
    for (const [email, name] of Object.entries(members || {})) {
      const key = email.trim().toLowerCase();
      if (byEmail[key]) throw new Error(`${key} is in more than one household`);
      byEmail[key] = { household: id.toLowerCase(), name: String(name || key.split("@")[0]) };
    }
  }
  return byEmail;
}

export function householdIds(raw) {
  return [...new Set(Object.values(parseHouseholds(raw)).map((m) => m.household))];
}

// ---------------------------------------------------------------------------
// Cloudflare Access sign-in (checks the signed token Access adds to every request)
// ---------------------------------------------------------------------------

const b64urlToBytes = (s) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
const b64urlToJSON = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

let jwksCache = { url: null, keys: null, at: 0 };

/** Fetch (and cache for an hour) the public keys Access signs tokens with. */
export async function accessKeys(teamDomain, fetchImpl = fetch, now = Date.now()) {
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  if (jwksCache.url === url && jwksCache.keys && now - jwksCache.at < 3600_000) return jwksCache.keys;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Couldn't load Access keys (${res.status})`);
  const { keys } = await res.json();
  jwksCache = { url, keys, at: now };
  return keys;
}
export function clearKeyCache() { jwksCache = { url: null, keys: null, at: 0 }; }

/**
 * Verify a Cloudflare Access token. Returns the signed-in email, or throws.
 * teamDomain: e.g. "yourteam.cloudflareaccess.com"; aud: the application's AUD tag.
 */
export async function verifyAccessToken(token, { teamDomain, aud, fetchImpl = fetch, now = Date.now() }) {
  if (!token) throw new Error("not signed in");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const header = b64urlToJSON(parts[0]);
  const payload = b64urlToJSON(parts[1]);
  if (header.alg !== "RS256") throw new Error("unexpected algorithm");
  const keys = await accessKeys(teamDomain, fetchImpl, now);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) { clearKeyCache(); throw new Error("unknown signing key"); }
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error("bad signature");
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(aud)) throw new Error("token is for a different application");
  if (payload.iss && payload.iss !== `https://${teamDomain}`) throw new Error("token from a different team");
  const secs = Math.floor(now / 1000);
  if (!payload.exp || payload.exp < secs) throw new Error("sign-in has expired");
  if (payload.nbf && payload.nbf > secs + 60) throw new Error("token not valid yet");
  if (!payload.email) throw new Error("no email in token");
  return String(payload.email).toLowerCase();
}

// ---------------------------------------------------------------------------
// Household state
// ---------------------------------------------------------------------------

/** Fill in keys added in newer versions (mirrors _load() in server.py). */
export function withDefaults(state, defaults) {
  const base = structuredClone(defaults);
  if (!state) return { ...base, rev: 0 };
  for (const [k, v] of Object.entries(base)) if (!(k in state)) state[k] = v;
  for (const [k, v] of Object.entries(base.settings)) if (!(k in state.settings)) state.settings[k] = v;
  (state.settings.people || []).forEach((p) => { if (p.goal == null) p.goal = 40; });
  if (typeof state.rev !== "number") state.rev = 0;
  return state;
}

/** Drop old weeks: shopping lists after 8 weeks, meal plans after a year (same as server.py). */
export const KEEP_WEEKS = { lists: 8, plans: 52 };
export function prune(state, today = new Date()) {
  const cutoff = (weeks) => { const d = new Date(today); d.setDate(d.getDate() - weeks * 7); return d.toISOString().slice(0, 10); };
  const short = cutoff(KEEP_WEEKS.lists), long = cutoff(KEEP_WEEKS.plans);
  for (const k of ["checks", "extras", "shopFor"]) for (const wk of Object.keys(state[k] || {})) if (wk < short) delete state[k][wk];
  for (const wk of Object.keys(state.plans || {})) if (wk < long) delete state.plans[wk];
  return state;
}

export const MAX_STATE_BYTES = 1_500_000;

/** Check an uploaded backup looks like FoodIsHard data before replacing a household with it. */
export function validateImport(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error("That file isn't a FoodIsHard backup");
  const state = doc.foodishard ? doc.state : doc; // accept the export wrapper or a bare state
  if (!state || typeof state !== "object" || !state.settings || typeof state.settings !== "object" || !Array.isArray(state.settings.people))
    throw new Error("That file isn't a FoodIsHard backup");
  if (JSON.stringify(state).length > MAX_STATE_BYTES) throw new Error("That backup is too big");
  for (const k of ["plans", "prefs", "checks", "extras", "prices", "swaps", "shopFor", "shopPref", "pantry", "feedback"])
    if (k in state && (typeof state[k] !== "object" || state[k] === null || Array.isArray(state[k]))) throw new Error(`Backup has a damaged "${k}" section`);
  return state;
}

// ---------------------------------------------------------------------------
// ONS food inflation (same source and maths as server.py)
// ---------------------------------------------------------------------------

export const ONS_URL = "https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7bu/mm23/data";

export function parseOns(doc, basePeriod) {
  const months = (doc.months || []).filter((m) => String(m.value ?? "").trim());
  if (!months.length) throw new Error("no monthly values");
  const latest = months[months.length - 1];
  const base = months.find((m) => String(m.date || "").toUpperCase() === basePeriod.toUpperCase());
  if (!base) throw new Error(`base period ${basePeriod} not found`);
  return { latest: latest.date, factor: Math.round((parseFloat(latest.value) / parseFloat(base.value)) * 10000) / 10000 };
}

// ---------------------------------------------------------------------------
// Admins and the Access sign-in list
// ---------------------------------------------------------------------------

/** ADMINS setting: comma- or space-separated emails. */
export function parseAdmins(raw) {
  return String(raw || "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export const DEFAULT_POLICY_NAME = "FoodIsHard people";

/**
 * Make the Access policy's email list match the directory (plus admins), so inviting someone
 * in the app is all it takes for them to be able to sign in. Other kinds of rule in the policy
 * are left alone. Needs CF_ACCOUNT_ID and a CF_API_TOKEN secret; without them it reports
 * "manual" and the admin adds emails in the dashboard instead.
 */
export async function syncAccessPolicy(env, memberEmails, fetchImpl = fetch) {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) return { ok: false, manual: true, message: "Automatic sign-in updates aren't set up, so add new emails to the Access policy by hand." };
  const emails = [...new Set([...parseAdmins(env.ADMINS), ...memberEmails.map((e) => e.toLowerCase())])].sort();
  if (!emails.length) return { ok: false, message: "No emails to allow, so the sign-in list was left alone." };
  const name = env.ACCESS_POLICY_NAME || DEFAULT_POLICY_NAME;
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID)}/access/policies`;
  const headers = { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" };
  const call = async (url, init = {}) => {
    const res = await fetchImpl(url, { ...init, headers });
    let body = {};
    try { body = await res.json(); } catch { /* not json */ }
    if (!res.ok || body.success === false) {
      const why = (body.errors || []).map((e) => e.message).join("; ") || `HTTP ${res.status}`;
      throw new Error(`Cloudflare said: ${why}`);
    }
    return body.result;
  };
  try {
    const list = await call(`${base}?per_page=100`);
    const policy = (list || []).find((p) => p.name === name);
    if (!policy) return { ok: false, message: `Couldn't find an Access policy called "${name}".` };
    const others = (policy.include || []).filter((r) => !r.email);
    const current = (policy.include || []).filter((r) => r.email).map((r) => String(r.email.email).toLowerCase()).sort();
    if (JSON.stringify(current) === JSON.stringify(emails)) return { ok: true, changed: false, count: emails.length, message: "Sign-in list already up to date." };
    const body = { ...policy, include: [...others, ...emails.map((email) => ({ email: { email } }))] };
    for (const k of ["id", "created_at", "updated_at", "app_count", "reusable"]) delete body[k];
    await call(`${base}/${encodeURIComponent(policy.id)}`, { method: "PUT", body: JSON.stringify(body) });
    return { ok: true, changed: true, count: emails.length, message: `Sign-in list updated (${emails.length} people).` };
  } catch (err) {
    return { ok: false, message: String(err.message || err).slice(0, 300) };
  }
}
