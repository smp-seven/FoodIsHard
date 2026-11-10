// FoodIsHard on Cloudflare: one Worker serves the app, and each household's data lives in
// its own Durable Object, so households can never see each other's plans or lists.
// Sign-in is done by Cloudflare Access in front of the Worker; this file double-checks
// the Access token, then looks the person up in the Directory (who's in which household).
//
// Settings (Worker > Settings > Variables and Secrets, never in the repo):
//   ACCESS_TEAM   e.g. "yourteam.cloudflareaccess.com"
//   ACCESS_AUD    the Access application's "Application Audience (AUD) Tag"
//   ADMINS        your email (comma-separate several). Admins invite new households.
//   DATA_REGION   optional: "eu" (default) or "auto"
// Optional, so invites update the sign-in list automatically:
//   CF_ACCOUNT_ID        your Cloudflare account ID
//   CF_API_TOKEN         secret: an API token allowed to edit Access policies
//   ACCESS_POLICY_NAME   defaults to "FoodIsHard people"
// Older set-ups: HOUSEHOLDS (JSON) is imported into the Directory once, then ignored.
// See CLOUDFLARE.md for the full set-up.

import { DurableObject } from "cloudflare:workers";
import "../../foodishard/app/static/ops.js";
import recipes from "../../foodishard/app/data/recipes.json";
import ingredients from "../../foodishard/app/data/ingredients.json";
import defaults from "../../foodishard/app/data/defaults.json";
import {
  verifyAccessToken, withDefaults, prune, validateImport, MAX_STATE_BYTES, ONS_URL, parseOns,
  parseAdmins, syncAccessPolicy,
} from "./logic.js";
import { Directory } from "./directory.js";

export { Directory };

const { applyOp } = globalThis.FoodIsHardOps;
const RECIPE_NAMES = Object.fromEntries(recipes.recipes.map((r) => [r.id, r.name]));
const DATA = { "recipes.json": recipes, "ingredients.json": ingredients, "defaults.json": defaults };
const POLL_SECONDS = 8; // how often open phones check for changes (keeps well inside the free tier)
const WHO_CACHE_MS = 60_000; // remember who's who for a minute, to halve requests

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const page = (title, body, status) => new Response(
  `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
  <body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#222"><h1 style="font-size:1.4rem">${title}</h1>${body}</body>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

// Where data is stored. "eu" (the default) keeps every household's data, and the directory of
// names and emails, in Cloudflare's EU data centres. Set DATA_REGION to "auto" to let
// Cloudflare choose. Decide before real use: changing it later starts everyone afresh.
const region = (env) => (env.DATA_REGION === "auto" ? "auto" : "eu");
const space = (env, ns) => (region(env) === "eu" ? ns.jurisdiction("eu") : ns);
const stub = (env, ns, name) => { const s = space(env, ns); return s.get(s.idFromName(name)); };
const directory = (env) => stub(env, env.DIRECTORY, "directory");
const household = (env, id) => stub(env, env.HOUSEHOLD, id);

let imported = false;
const whoCache = new Map();
export function forgetWho() { whoCache.clear(); imported = false; }

/** Who is this? Returns {email, household, householdName, name, admin} or a Response explaining the problem. */
async function identify(request, env) {
  if (!env.ACCESS_TEAM || !env.ACCESS_AUD) {
    return page("Almost there", "<p>FoodIsHard is deployed, but sign-in isn't set up yet. Add <b>ACCESS_TEAM</b>, <b>ACCESS_AUD</b> and <b>ADMINS</b> in the Worker's settings (see CLOUDFLARE.md).</p>", 503);
  }
  let email;
  try {
    email = await verifyAccessToken(request.headers.get("Cf-Access-Jwt-Assertion"), { teamDomain: env.ACCESS_TEAM, aud: env.ACCESS_AUD });
  } catch (err) {
    return page("Please sign in", `<p>Couldn't confirm who you are (${esc(err.message)}). Reload the page to sign in again.</p>`, 401);
  }
  const admin = parseAdmins(env.ADMINS).includes(email);
  const hit = whoCache.get(email);
  if (hit && Date.now() - hit.at < WHO_CACHE_MS) return { ...hit.who, admin };
  const dir = directory(env);
  try {
    if (!imported) { await dir.importOnce(env.HOUSEHOLDS || ""); imported = true; }
  } catch (err) {
    return page("Set-up problem", `<p>The old HOUSEHOLDS setting has a mistake: ${esc(err.message)}</p>`, 500);
  }
  const m = await dir.whoIs(email);
  if (!m && !admin) return page("Not set up yet", `<p>You're signed in as <b>${esc(email)}</b>, but you haven't been added to a household yet. Ask whoever invited you to add this email in FoodIsHard's Settings.</p>`, 403);
  // An admin who isn't in a household gets the admin dashboard only.
  const who = m ? { email, household: m.household, householdName: m.householdName, name: m.name }
    : { email, household: null, householdName: null, name: email.split("@")[0] };
  whoCache.set(email, { who, at: Date.now() });
  return { ...who, admin };
}

/** After anyone joins or leaves: refresh the Access sign-in list and remember how it went. */
async function syncSignIn(env) {
  const dir = directory(env);
  const result = await syncAccessPolicy(env, await dir.allEmails());
  await dir.recordSync(result);
  return result;
}

async function readBody(request) {
  const text = await request.text();
  if (!text || text.length > MAX_STATE_BYTES) throw new Error("bad length");
  return JSON.parse(text);
}

async function api(request, env, who, url) {
  const path = url.pathname, post = request.method === "POST";
  const dir = directory(env);
  const signInInfo = () => ({ manageSignIn: !!(env.CF_API_TOKEN && env.CF_ACCOUNT_ID) });

  // ---- admin-only accounts have no household data ----
  if (!who.household) {
    if (path === "/api/state" && !post) return json({ adminOnly: true, user: who.name, host: "Cloudflare", region: region(env), poll: POLL_SECONDS });
    if (path === "/api/account" && !post) return json({ me: { email: who.email, name: who.name }, household: null, admin: true, ...signInInfo() });
    if (!path.startsWith("/api/admin")) return json({ error: "This is an admin-only account, so it has no household" }, 400);
  }

  // ---- the household's meal-planning data ----
  if (path === "/api/state" && !post) {
    const res = await household(env, who.household).getState(url.searchParams.get("rev"));
    return json(res.unchanged ? { ...res, poll: POLL_SECONDS } : { ...res, user: who.name, host: "Cloudflare", region: region(env), account: true, poll: POLL_SECONDS });
  }
  if (path === "/api/op" && post) {
    const op = await readBody(request);
    const res = await household(env, who.household).op(op, who.name);
    if (op && op.op === "feedback") await dir.noteFeedback(who.household);
    return json({ ...res, user: who.name });
  }
  if (path === "/api/import" && post) return json({ ...(await household(env, who.household).importState(await readBody(request))), user: who.name });

  // ---- your household's members ----
  if (path === "/api/account" && !post) return json({ ...(await dir.account(who.email)), admin: who.admin, ...signInInfo() });
  if (path === "/api/account/invite" && post) {
    const body = await readBody(request);
    const acct = await dir.invite(who.email, body);
    whoCache.clear();
    const signIn = await syncSignIn(env);
    return json({ ...acct, admin: who.admin, ...signInInfo(), signIn, invited: String(body.email).trim().toLowerCase() });
  }
  if (path === "/api/account/remove" && post) {
    const { email } = await readBody(request);
    await dir.remove(who.email, email, { admin: who.admin });
    whoCache.clear();
    const signIn = await syncSignIn(env);
    let acct = {};
    try { acct = await dir.account(who.email); } catch { /* removed themselves */ }
    return json({ ...acct, admin: who.admin, ...signInInfo(), signIn });
  }
  if (path === "/api/account/delete" && post) {
    // Delete my account: leave the household (deleting it, and all its data, if I'm the last one),
    // take my name off the household's ticks and notes, and drop my email from the sign-in list.
    const res = await dir.leave(who.email);
    if (res.deleted) await household(env, res.deleted).wipe();
    else {
      const others = (await dir.householdMembers(res.left)).map((m) => m.name);
      if (!others.includes(who.name)) await household(env, res.left).forgetPerson(who.name);
    }
    whoCache.clear();
    const signIn = await syncSignIn(env);
    return json({ deleted: true, householdDeleted: !!res.deleted, stillAdmin: who.admin, signIn });
  }
  if (path === "/api/account/rename" && post) {
    const acct = await dir.rename(who.email, await readBody(request));
    whoCache.clear();
    return json({ ...acct, admin: who.admin, ...signInInfo() });
  }

  // ---- admins ----
  if (path.startsWith("/api/admin")) {
    if (!who.admin) return json({ error: "Only admins can do that" }, 403);
    if (path === "/api/admin" && !post) return json({ ...(await dir.overview()), ...signInInfo(), feedback: await dir.feedbackNew(who.email) });
    if (path === "/api/admin/feedback" && !post) {
      // Collect every household's recipe ratings. Fine at this size (45 people at most).
      const { households } = await dir.overview();
      const lists = await Promise.all(households.map((h) => household(env, h.id).feedbackList()));
      const items = [];
      households.forEach((h, i) => {
        for (const [recipe, list] of Object.entries(lists[i] || {})) {
          for (const f of list || []) {
            items.push({ household: h.name, householdId: h.id, recipe, recipeName: RECIPE_NAMES[recipe] || recipe, rating: f.rating, tags: f.tags || [], note: f.note || "", at: f.at || 0, by: f.by || "" });
          }
        }
      });
      items.sort((a, b) => b.at - a.at);
      return json({ items: items.slice(0, 3000), ...(await dir.feedbackNew(who.email)) });
    }
    if (path === "/api/admin/feedback/seen" && post) return json(await dir.markFeedbackSeen(who.email));
    if (path === "/api/admin/household" && post) {
      const created = await dir.createHousehold(who.email, await readBody(request));
      whoCache.clear();
      const signIn = await syncSignIn(env);
      return json({ ...(await dir.overview()), ...signInInfo(), signIn, created: created.id });
    }
    if (path === "/api/admin/delete-household" && post) {
      const { id } = await readBody(request);
      await dir.deleteHousehold(who.email, String(id || ""));
      await household(env, String(id)).wipe();
      whoCache.clear();
      const signIn = await syncSignIn(env);
      return json({ ...(await dir.overview()), ...signInInfo(), signIn });
    }
    const changed = async (extra = {}) => {
      whoCache.clear();
      const signIn = await syncSignIn(env);
      return json({ ...(await dir.overview()), ...signInInfo(), signIn, ...extra });
    };
    if (path === "/api/admin/member" && post) {
      await dir.addMember(who.email, await readBody(request));
      return changed();
    }
    if (path === "/api/admin/move" && post) {
      const { email, household: to } = await readBody(request);
      await dir.moveMember(email, to);
      whoCache.clear();
      return json({ ...(await dir.overview()), ...signInInfo() });
    }
    if (path === "/api/admin/rename-household" && post) {
      const { id, name } = await readBody(request);
      await dir.renameHousehold(id, name);
      whoCache.clear();
      return json({ ...(await dir.overview()), ...signInInfo() });
    }
    if (path === "/api/admin/remove" && post) {
      const { email } = await readBody(request);
      await dir.remove(who.email, email, { admin: true });
      return changed();
    }
    if (path === "/api/admin/leave" && post) {
      const res = await dir.leave(who.email);
      if (res.deleted) await household(env, res.deleted).wipe();
      return changed();
    }
    if (path === "/api/admin/sync" && post) {
      const signIn = await syncSignIn(env);
      return json({ ...(await dir.overview()), ...signInInfo(), signIn });
    }
  }
  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/api/health") return json({ ok: true });

    const who = await identify(request, env);
    if (who instanceof Response) return who;

    const name = path.split("/").pop();
    if (path.startsWith("/data/") && DATA[name]) {
      return new Response(JSON.stringify(DATA[name]), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" } });
    }

    if (path.startsWith("/api/")) {
      try {
        return await api(request, env, who, url);
      } catch (err) {
        return json({ error: String(err.message || err).replace(/^Error: /, "") }, 400);
      }
    }

    // Static files (the app itself). Unknown paths fall back to the app shell.
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
    return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
  },

  /** Weekly: fetch the ONS food price index once and share it with every household; tidy the sign-in list. */
  async scheduled(event, env) {
    const base = ingredients.prices_base_period || "2026 OCT";
    let info;
    try {
      const res = await fetch(ONS_URL, { headers: { "User-Agent": "FoodIsHard (home meal planner)" } });
      if (!res.ok) throw new Error(`ONS ${res.status}`);
      info = { ...parseOns(await res.json(), base), base, error: null };
    } catch (err) {
      info = { error: String(err.message || err).slice(0, 200) };
    }
    info.checked = Math.floor(Date.now() / 1000);
    const dir = directory(env);
    await dir.importOnce(env.HOUSEHOLDS || "");
    const { households } = await dir.overview();
    for (const h of households) await household(env, h.id).setInflation(info);
    if (env.CF_API_TOKEN && env.CF_ACCOUNT_ID) await syncSignIn(env);
  },
};

/** One household's data. Cloudflare runs one copy of this per household, one request at a time. */
export class Household extends DurableObject {
  async load() {
    if (!this.state) this.state = withDefaults(await this.ctx.storage.get("state"), { ...defaults, rev: 0 });
    return this.state;
  }
  async save() {
    prune(this.state);
    await this.ctx.storage.put("state", this.state);
  }
  async getState(rev) {
    const state = await this.load();
    if (rev != null && String(state.rev) === String(rev)) return { unchanged: true, rev: state.rev };
    return { state };
  }
  async op(op, user) {
    const state = await this.load();
    const before = structuredClone(state);
    try {
      applyOp(state, op, user);
      if (JSON.stringify(state).length > MAX_STATE_BYTES) throw new Error("household data is too big");
      await this.save();
    } catch (err) {
      this.state = before;
      throw err;
    }
    return { state };
  }
  async importState(doc) {
    const incoming = validateImport(doc);
    const current = await this.load();
    const state = withDefaults(structuredClone(incoming), { ...defaults, rev: 0 });
    state.rev = Math.max(current.rev || 0, state.rev || 0) + 1; // phones always see it as new
    this.state = state;
    await this.save();
    return { state };
  }
  async setInflation(info) {
    const state = await this.load();
    if (state.settings.inflation === false) return;
    state.inflation = info.error ? { ...(state.inflation || {}), checked: info.checked, error: info.error } : { ...info };
    state.rev = (state.rev || 0) + 1;
    await this.save();
  }
  /** Recipe ratings and notes, for the admin's Feedback screen. */
  async feedbackList() {
    const state = await this.load();
    return state.feedback || {};
  }
  /** Someone deleted their account: replace their name on ticks, items and notes. */
  async forgetPerson(name) {
    const state = await this.load();
    const walk = (o) => {
      if (!o || typeof o !== "object") return;
      if (o.by === name) o.by = "a former member";
      Object.values(o).forEach(walk);
    };
    walk(state);
    state.rev = (state.rev || 0) + 1;
    await this.save();
    return { ok: true };
  }
  /** Called when an admin deletes a household: removes all its data. */
  async wipe() {
    await this.ctx.storage.deleteAll();
    this.state = null;
    return { wiped: true };
  }
}
