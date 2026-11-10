// FoodIsHard on Cloudflare: one Worker serves the app, and each household's data lives in
// its own Durable Object, so households can never see each other's plans or lists.
// Sign-in is done by Cloudflare Access in front of the Worker; this file double-checks
// the Access token and maps the signed-in email to a household.
//
// Settings (Worker > Settings > Variables and Secrets, never in the repo):
//   ACCESS_TEAM  e.g. "yourteam.cloudflareaccess.com"
//   ACCESS_AUD   the Access application's "Application Audience (AUD) Tag"
//   HOUSEHOLDS   JSON, e.g. {"smiths": {"alex@example.com": "Alex", "sam@example.com": "Sam"}}
// See CLOUDFLARE.md for the full set-up.

import { DurableObject } from "cloudflare:workers";
import "../../foodishard/app/static/ops.js";
import recipes from "../../foodishard/app/data/recipes.json";
import ingredients from "../../foodishard/app/data/ingredients.json";
import defaults from "../../foodishard/app/data/defaults.json";
import {
  parseHouseholds, householdIds, verifyAccessToken, withDefaults, prune,
  validateImport, MAX_STATE_BYTES, ONS_URL, parseOns,
} from "./logic.js";

const { applyOp } = globalThis.FoodIsHardOps;
const DATA = { "recipes.json": recipes, "ingredients.json": ingredients, "defaults.json": defaults };
const POLL_SECONDS = 8; // how often open phones check for changes (keeps well inside the free tier)

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const page = (title, body, status) => new Response(
  `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
  <body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#222"><h1 style="font-size:1.4rem">${title}</h1>${body}</body>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

/** Who is this? Returns {email, household, name} or a Response explaining the problem. */
async function identify(request, env) {
  if (!env.ACCESS_TEAM || !env.ACCESS_AUD) {
    return page("Almost there", "<p>FoodIsHard is deployed, but sign-in isn't set up yet. Add <b>ACCESS_TEAM</b> and <b>ACCESS_AUD</b> in the Worker's settings (see CLOUDFLARE.md).</p>", 503);
  }
  let email;
  try {
    email = await verifyAccessToken(request.headers.get("Cf-Access-Jwt-Assertion"), { teamDomain: env.ACCESS_TEAM, aud: env.ACCESS_AUD });
  } catch (err) {
    return page("Please sign in", `<p>Couldn't confirm who you are (${String(err.message).replace(/[<>&]/g, "")}). Reload the page to sign in again.</p>`, 401);
  }
  let members;
  try { members = parseHouseholds(env.HOUSEHOLDS); } catch (err) {
    return page("Set-up problem", `<p>The HOUSEHOLDS setting has a mistake: ${String(err.message).replace(/[<>&]/g, "")}</p>`, 500);
  }
  const m = members[email];
  if (!m) return page("Not set up yet", `<p>You're signed in as <b>${email.replace(/[<>&]/g, "")}</b>, but that email isn't part of a household yet. Ask whoever invited you to add it.</p>`, 403);
  return { email, ...m };
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
      const home = env.HOUSEHOLD.get(env.HOUSEHOLD.idFromName(who.household));
      try {
        if (path === "/api/state" && request.method === "GET") {
          const res = await home.getState(url.searchParams.get("rev"));
          return json(res.unchanged ? { ...res, poll: POLL_SECONDS } : { ...res, user: who.name, host: "Cloudflare", poll: POLL_SECONDS });
        }
        if (request.method === "POST" && (path === "/api/op" || path === "/api/import")) {
          const text = await request.text();
          if (!text || text.length > MAX_STATE_BYTES) return json({ error: "bad length" }, 400);
          let body;
          try { body = JSON.parse(text); } catch { return json({ error: "bad json" }, 400); }
          const res = path === "/api/op" ? await home.op(body, who.name) : await home.importState(body);
          return json({ ...res, user: who.name });
        }
      } catch (err) {
        return json({ error: String(err.message || err) }, 400);
      }
      return json({ error: "not found" }, 404);
    }

    // Static files (the app itself). Unknown paths fall back to the app shell.
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
    return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
  },

  /** Weekly: fetch the ONS food price index once and share it with every household. */
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
    for (const id of householdIds(env.HOUSEHOLDS)) {
      await env.HOUSEHOLD.get(env.HOUSEHOLD.idFromName(id)).setInflation(info);
    }
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
}
