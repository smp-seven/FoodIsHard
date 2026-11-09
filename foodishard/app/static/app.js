/* FoodIsHard - vegetarian family dinner planner.
 * Plain JavaScript, no build step. Talks to server.py (live mode) or keeps
 * everything on this device (preview mode) when no server is reachable. */
"use strict";

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
const ICONS = {
  calendar: '<path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/>',
  basket: '<path d="M3 9h18l-2 10a2 2 0 0 1-2 1.6H7A2 2 0 0 1 5 19L3 9Zm5 0 3-5m5 5-3-5M9 13v4m6-4v4"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h11"/>',
  gear: '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  swap: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15m0 5v-5h5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  heart: '<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3.6A5 5 0 0 1 21 11c-2 4.6-9 9-9 9Z"/>',
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  home: '<path d="M4 11 12 4l8 7M6 9.5V20h12V9.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  download: '<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/>',
  print: '<path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  sparkle: '<path d="M12 3v4m0 10v4M3 12h4m10 0h4M6.3 6.3l2.5 2.5m6.4 6.4 2.5 2.5m0-11.4-2.5 2.5m-6.4 6.4-2.5 2.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2m-7 0 1 13h8l1-13"/>',
  pot: '<path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-6Zm-2 0h20M9 6c0-1 1-1 1-2m4 2c0-1 1-1 1-2"/>',
  exchange: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
  bolt: '<path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z"/>',
  out: '<path d="M6 3v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M8 13v8M17 21V3c-2 0-3.5 2.5-3.5 6s1.5 4 3.5 4"/>',
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}
function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    if (!el.firstChild) el.innerHTML = icon(el.dataset.icon);
  });
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 9);
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STAGES = {
  smooth: { name: "Smooth & mashed", hint: "Early weaning: blended or well mashed." },
  finger: { name: "Finger foods & soft lumps", hint: "Holding soft strips, chewing lumps, managing toast." },
  chopped: { name: "Chopped family food", hint: "Same meal as you, cut small, still go easy on salt." },
};

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseISO(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d, n) {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}
function mondayIndex(d) { return (d.getDay() + 6) % 7; } // Mon=0 … Sun=6
function weekStartFor(d, startDay) {
  const back = (mondayIndex(d) - startDay + 7) % 7;
  const x = addDays(d, -back); x.setHours(0, 0, 0, 0); return x;
}
function niceDate(d) { return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }
function monthsBetween(from, to) {
  let m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  let days = to.getDate() - from.getDate();
  if (days < 0) { m -= 1; const prev = new Date(to.getFullYear(), to.getMonth(), 0); days += prev.getDate(); }
  return { m, days };
}
function ageText(fromISO) {
  if (!fromISO) return "";
  const { m, days } = monthsBetween(parseISO(fromISO), new Date());
  if (m < 0) return "not yet";
  if (m >= 24) return `${Math.floor(m / 12)} years`;
  return `${m} month${m === 1 ? "" : "s"}${days ? `, ${days} day${days === 1 ? "" : "s"}` : ""}`;
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------
const app = {
  mode: "loading", // live | demo
  user: "",
  state: null,
  recipes: [],
  byId: {},
  ing: null,
  tab: "week",
  weekStart: null, // ISO of the week being viewed
  listGroup: "aisle",
  recipeFilter: "all",
  recipeQuery: "",
};

const DEMO_KEY = "foodishard-demo-v2";

async function getJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

async function boot() {
  hydrateIcons();
  const [rec, ing, defaults] = await Promise.all([
    getJSON("data/recipes.json"), getJSON("data/ingredients.json"), getJSON("data/defaults.json"),
  ]);
  app.recipes = rec.recipes;
  app.byId = Object.fromEntries(app.recipes.map((r) => [r.id, r]));
  app.ing = ing;

  try {
    const res = await getJSON("api/state");
    if (!res.state) throw new Error("no state");
    app.mode = "live";
    app.state = res.state;
    app.user = res.user || "";
  } catch {
    app.mode = "demo";
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(DEMO_KEY) || "null"); } catch { /* storage blocked */ }
    app.state = saved || { ...clone(defaults), rev: 0 };
    const b = $("#banner");
    b.hidden = false;
    b.textContent = "Preview mode: changes are saved on this device only.";
  }

  app.weekStart = iso(weekStartFor(new Date(), app.state.settings.weekStartDay || 0));
  if (app.mode === "demo" && !app.state.plans[app.weekStart]) {
    // give the preview something to look at
    applyLocal({ op: "plan", week: app.weekStart, plan: suggestWeek(app.weekStart) });
  }

  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => go(t.dataset.tab)));
  window.addEventListener("hashchange", fromHash);
  document.addEventListener("click", closeMenusOnOutside, true);
  $("#sheet").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  fromHash();
  if (app.mode === "live") startPolling();
}

// ---------------------------------------------------------------------------
// Operations (mirror of apply_op in server.py)
// ---------------------------------------------------------------------------
function applyOp(state, op, user) {
  const now = Math.floor(Date.now() / 1000);
  switch (op.op) {
    case "settings": Object.assign(state.settings, op.patch || {}); break;
    case "plan": state.plans[op.week] = op.plan; break;
    case "day": {
      const plan = state.plans[op.week] || (state.plans[op.week] = { days: [null, null, null, null, null, null, null] });
      while (plan.days.length < 7) plan.days.push(null);
      plan.days[op.i] = op.day; break;
    }
    case "pref": state.prefs[op.recipe] = { ...(state.prefs[op.recipe] || {}), ...(op.patch || {}) }; break;
    case "check": {
      const week = state.checks[op.week] || (state.checks[op.week] = {});
      const item = week[op.key] || (week[op.key] = {});
      item[op.field] = !!op.value; item.by = user; item.at = now; break;
    }
    case "clear_checks": state.checks[op.week] = {}; break;
    case "extra_add": (state.extras[op.week] || (state.extras[op.week] = [])).push({ ...op.item, by: user }); break;
    case "extra_remove": state.extras[op.week] = (state.extras[op.week] || []).filter((i) => i.id !== op.id); break;
    case "price": {
      state.prices = state.prices || {};
      if (op.price == null) delete state.prices[op.key];
      else state.prices[op.key] = { p: +op.price, shop: op.shop || "aldi", at: now, by: user };
      break;
    }
    case "swap": {
      state.swaps = state.swaps || {};
      if (op.alt == null) delete state.swaps[op.key]; else state.swaps[op.key] = String(op.alt);
      break;
    }
    case "shop_for": {
      state.shopFor = state.shopFor || {};
      const wk = state.shopFor[op.week] || (state.shopFor[op.week] = {});
      if (op.shop) wk[op.key] = op.shop; else delete wk[op.key];
      break;
    }
    default: throw new Error("unknown op " + op.op);
  }
  state.rev = (state.rev || 0) + 1;
  return state;
}

function applyLocal(op) {
  applyOp(app.state, op, app.user || "you");
  if (app.mode === "demo") {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(app.state)); } catch { /* fine */ }
  }
}

let sending = 0;
async function send(op, { rerender = true } = {}) {
  applyLocal(op); // optimistic
  if (rerender) render();
  if (app.mode !== "live") return;
  sending++;
  try {
    const r = await fetch("api/op", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(op) });
    const res = await r.json();
    if (!r.ok) throw new Error(res.error || r.status);
    app.state = res.state;
  } catch (err) {
    toast("Couldn't save. Check your connection.");
    console.error(err);
  } finally {
    sending--;
    if (rerender) render();
  }
}

function startPolling() {
  setInterval(async () => {
    if (document.hidden || sending) return;
    try {
      const res = await getJSON(`api/state?rev=${app.state.rev}`);
      if (res.state && !sending) {
        app.state = res.state;
        // don't redraw under someone's fingers while typing
        if (!document.activeElement || !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) render();
      }
    } catch { /* offline for a moment */ }
  }, 4000);
}

// ---------------------------------------------------------------------------
// Household maths
// ---------------------------------------------------------------------------
function household() {
  const s = app.state.settings;
  const adults = s.people || [];
  const baby = s.baby || {};
  const factor = adults.reduce((t, p) => t + (+p.portion || 0), 0) + (baby.include ? (+baby.portion || 0) : 0);
  return { adults, baby, factor: factor || 1 };
}

function prefsFor(id) { return app.state.prefs[id] || {}; }

// ----- ingredients, swaps and food rules -----
function ingMeta(k) { return app.ing.items[k] || { n: k, a: "other", s: "any" }; }

/** The ingredient actually used once household swaps / budget mode apply. */
function resolveIng(k) {
  const m = ingMeta(k);
  const options = m.sw || [];
  const chosen = (app.state.swaps || {})[k];
  let alt = null;
  if (chosen !== undefined) alt = options.find((o) => o.k === chosen) || null; // "" means keep the original
  else if (app.state.settings.budget) alt = options.find((o) => o.budget) || null;
  return alt ? { k: alt.k, r: alt.r, from: k, why: alt.why } : { k, r: 1, from: null };
}
function effectiveIngredients(r) {
  return r.ingredients.map((i) => {
    const res = resolveIng(i.k);
    const m = ingMeta(res.k);
    const u = res.from ? (m.pk ? m.pk[1] : (i.u || "")) : (i.u || m.u || "");
    return { ...i, k: res.k, q: i.q == null ? null : i.q * res.r, u, from: res.from, orig: i.k };
  });
}
function avoidList() { return app.state.settings.avoid || []; }
function dislikeWords() {
  return (app.state.settings.dislikes || "").toLowerCase().split(/[,\n]/).map((w) => w.trim()).filter(Boolean);
}
/** Reasons a recipe is off the menu for this household (allergens, dislikes). */
function blockedBy(r) {
  const avoid = avoidList(), words = dislikeWords(), why = new Set();
  effectiveIngredients(r).forEach((i) => {
    const m = ingMeta(i.k);
    (m.al || []).forEach((a) => { if (avoid.includes(a)) why.add(app.ing.allergens[a] || a); });
    words.forEach((w) => { if (m.n.toLowerCase().includes(w)) why.add(w); });
  });
  words.forEach((w) => { if (r.name.toLowerCase().includes(w)) why.add(w); });
  return [...why];
}
function checkLabelFor(k) {
  const avoid = avoidList();
  return (ingMeta(k).mc || []).filter((a) => avoid.includes(a)).map((a) => app.ing.allergens[a] || a);
}

// ----- shops and prices -----
function enabledShops() {
  const on = app.state.settings.shops || Object.keys(app.ing.shops);
  return Object.keys(app.ing.shops).filter((s) => s !== "any" && on.includes(s));
}
function shopMult(s) { return (app.ing.shops[s] || app.ing.shops.any).m || 1; }
function priceShop() { return app.state.settings.priceShop || "aldi"; }
/** Pack price at Aldi level, either the household's own figure or the built-in estimate. */
function basePrice(k) {
  const m = ingMeta(k);
  const own = (app.state.prices || {})[k];
  if (own) return { p: own.p / shopMult(own.shop), own };
  return m.p != null ? { p: m.p } : null;
}
function money(n) { return n == null ? "" : `£${n.toFixed(2)}`; }
/** Cost of q units of ingredient k, or null if not priced / units differ. */
function costOf(k, q, u, { wholePacks = false, shop = priceShop() } = {}) {
  const m = ingMeta(k), bp = basePrice(k);
  if (!bp || !m.pk || q == null) return null;
  const [pq, pu] = m.pk;
  if ((pu || "") !== (u || "")) return null;
  const packs = wholePacks ? Math.max(1, Math.ceil(q / pq - 0.02)) : q / pq;
  return packs * bp.p * shopMult(shop);
}
function recipeCost(r, shop = priceShop()) {
  let total = 0, missing = 0;
  effectiveIngredients(r).forEach((i) => {
    if (i.q == null) return;
    const c = costOf(i.k, i.q, i.u, { shop });
    if (c == null) missing++; else total += c;
  });
  return { perPortion: total, missing };
}

function planFor(week) {
  const p = app.state.plans[week];
  const days = p && Array.isArray(p.days) ? p.days.slice(0, 7) : [];
  while (days.length < 7) days.push(null);
  return days.map((d) => d || { recipe: null, status: "cook", locked: false });
}

function previousWeekRecipes(week) {
  const prev = iso(addDays(parseISO(week), -7));
  return new Set(planFor(prev).map((d) => d.recipe).filter(Boolean));
}

function maxTimeFor(week, i) {
  const s = app.state.settings;
  const date = addDays(parseISO(week), i);
  const weekend = mondayIndex(date) >= 5; // Sat / Sun
  return weekend ? (s.weekendMax || 90) : (s.weeknightMax || 40);
}

function pickRecipe(week, i, days, exclude = new Set(), { emergency = false } = {}) {
  const recent = previousWeekRecipes(week);
  const used = new Set(days.map((d, j) => (j !== i ? d.recipe : null)).filter(Boolean));
  const sourceCount = {};
  days.forEach((d, j) => {
    if (j !== i && d.recipe && app.byId[d.recipe]) {
      const src = app.byId[d.recipe].protein_source; sourceCount[src] = (sourceCount[src] || 0) + 1;
    }
  });
  const maxT = maxTimeFor(week, i);
  const pool = app.recipes.filter((r) => !prefsFor(r.id).ban && !exclude.has(r.id)
    && !!r.emergency === emergency && !blockedBy(r).length);
  // progressively relax the rules until something fits
  const tiers = [
    (r) => r.time <= maxT && !used.has(r.id) && !recent.has(r.id) && (sourceCount[r.protein_source] || 0) < 2,
    (r) => r.time <= maxT && !used.has(r.id) && (sourceCount[r.protein_source] || 0) < 2,
    (r) => r.time <= maxT && !used.has(r.id),
    (r) => !used.has(r.id),
    () => true,
  ];
  for (const ok of tiers) {
    const options = pool.filter(ok);
    if (options.length) {
      const weights = options.map((r) => (prefsFor(r.id).fav ? 3 : 1));
      let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
      for (let k = 0; k < options.length; k++) { roll -= weights[k]; if (roll <= 0) return options[k].id; }
      return options[options.length - 1].id;
    }
  }
  return null;
}

function suggestWeek(week) {
  const days = planFor(week);
  for (let i = 0; i < 7; i++) {
    const d = days[i];
    if (d.locked || d.status !== "cook") continue;
    d.recipe = null;
  }
  for (let i = 0; i < 7; i++) {
    const d = days[i];
    if (d.locked || d.status !== "cook") continue;
    d.recipe = pickRecipe(week, i, days);
  }
  return { days };
}

// ---------------------------------------------------------------------------
// Quantities
// ---------------------------------------------------------------------------
const FRACTIONS = { 0.25: "¼", 0.5: "½", 0.75: "¾" };
function niceNumber(n) {
  const q = Math.round(n * 4) / 4;
  const whole = Math.floor(q), frac = +(q - whole).toFixed(2);
  if (!frac) return String(whole || (n > 0 ? "¼" : "0"));
  return `${whole || ""}${FRACTIONS[frac] || ""}`;
}
function fmtQty(q, u, { forShopping = false } = {}) {
  if (q == null) return "";
  if (u === "g" || u === "ml") {
    if (q >= 1000) return `${(Math.ceil(q / 100) / 10).toString()} ${u === "g" ? "kg" : "l"}`;
    return `${Math.max(5, Math.ceil(q / 10) * 10)} ${u}`;
  }
  if (u === "tin") {
    if (!forShopping) return `${niceNumber(q)} tin${q > 1 ? "s" : ""}`;
    const n = Math.ceil(q - 0.05); return `${n} tin${n === 1 ? "" : "s"}`;
  }
  if (u === "tbsp" || u === "tsp") return `${niceNumber(q)} ${u}`;
  if (u === "slices") { const n = Math.ceil(q); return `${n} slice${n === 1 ? "" : "s"}`; }
  if (forShopping) return String(Math.ceil(q - 0.05));
  return niceNumber(q);
}
function scaleStep(text, factor) {
  return text.replace(/\{\{(\d+(?:\.\d+)?)\|(\w+)\}\}/g, (_, n, u) => fmtQty(+n * factor, u));
}

// ---------------------------------------------------------------------------
// Shopping list
// ---------------------------------------------------------------------------
function buildList(week) {
  const { factor } = household();
  const items = new Map();
  const days = planFor(week);
  const meta = (k) => app.ing.items[k] || { n: k, a: "other", s: "any" };

  days.forEach((d, i) => {
    if (d.status !== "cook" || !d.recipe) return;
    const r = app.byId[d.recipe]; if (!r) return;
    effectiveIngredients(r).forEach((ing) => {
      const m = meta(ing.k);
      const key = "i:" + ing.k;
      if (!items.has(key)) {
        items.set(key, { key, k: ing.k, name: m.n, aisle: m.a, shop: m.s, flags: m.f || [], note: m.note, cupboard: !!m.c, qty: {}, recipes: [], from: new Set(), swappable: new Set() });
      }
      const it = items.get(key);
      if (ing.q != null) it.qty[ing.u] = (it.qty[ing.u] || 0) + ing.q * factor;
      if (!it.recipes.includes(r.name)) it.recipes.push(r.name);
      if (ing.from) it.from.add(ing.from);
      if ((meta(ing.orig).sw || []).length) it.swappable.add(ing.orig);
    });
  });

  (app.state.settings.staples || []).filter((s) => s.on).forEach((s) => {
    items.set("s:" + s.id, { key: "s:" + s.id, name: s.name, amount: s.amount, aisle: s.aisle || "other", shop: s.shop || "aldi", flags: [], note: s.note, staple: true, recipes: [], fixedCost: s.price != null && s.price !== "" ? +s.price : null });
  });
  (app.state.extras[week] || []).forEach((x) => {
    items.set("x:" + x.id, { key: "x:" + x.id, name: x.name, aisle: x.aisle || "other", shop: x.shop || "any", flags: [], extra: true, id: x.id, by: x.by, recipes: [] });
  });

  const checks = app.state.checks[week] || {};
  const shopFor = (app.state.shopFor || {})[week] || {};
  const out = [];
  items.forEach((it) => {
    const c = checks[it.key] || {};
    if (shopFor[it.key]) it.shop = shopFor[it.key];
    it.from = [...(it.from || [])].map((k) => meta(k).n);
    it.swappable = [...(it.swappable || [])];
    it.checkLabel = it.k ? checkLabelFor(it.k) : [];
    if (it.fixedCost != null) it.cost = it.fixedCost * shopMult(priceShop());
    else if (it.k) {
      const entries = Object.entries(it.qty);
      it.cost = entries.length === 1 ? costOf(it.k, entries[0][1], entries[0][0], { wholePacks: true }) : null;
    }
    it.done = !!c.done; it.have = !!c.have; it.need = !!c.need; it.checkedBy = c.by;
    it.qtyText = it.amount || Object.entries(it.qty || {}).map(([u, q]) => fmtQty(q, u, { forShopping: true })).join(" + ");
    it.active = it.cupboard ? it.need : !it.have;
    out.push(it);
  });
  return out;
}

function aisleOrder() { return app.ing.aisles.map((a) => a.id); }
function aisleName(id) { return (app.ing.aisles.find((a) => a.id === id) || { name: "Other" }).name; }
function shopName(id, short = true) { const s = app.ing.shops[id] || app.ing.shops.any; return short ? s.short : s.name; }

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function go(tab) { location.hash = tab; }
function fromHash() {
  const t = (location.hash || "#week").slice(1);
  app.tab = ["week", "list", "recipes", "settings"].includes(t) ? t : "week";
  render();
  window.scrollTo(0, 0);
}

function render() {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.tab === app.tab));
  const view = $("#view");
  const views = { week: renderWeek, list: renderList, recipes: renderRecipes, settings: renderSettings };
  view.innerHTML = views[app.tab]();
  hydrateIcons(view);
  bindView(view);
  // badge: items still to get this week
  const remaining = buildList(app.weekStart).filter((i) => i.active && !i.done).length;
  const badge = $("#listBadge");
  badge.hidden = !remaining || app.tab === "list";
  badge.textContent = remaining;
}

function proteinLine(r) {
  const { adults } = household();
  return adults.map((p) => `${esc(p.name)} ${Math.round(r.protein * (+p.portion || 1))}g`).join(" · ");
}

// ----- Week -----
function renderWeek() {
  const week = app.weekStart;
  const start = parseISO(week);
  const end = addDays(start, 6);
  const days = planFor(week);
  const todayISO = iso(new Date());
  const anyPlanned = days.some((d) => d.recipe);
  const thisWeek = iso(weekStartFor(new Date(), app.state.settings.weekStartDay || 0)) === week;
  const { factor } = household();

  let hero = "";
  const ti = days.findIndex((_, i) => iso(addDays(start, i)) === todayISO);
  if (ti >= 0) {
    const d = days[ti];
    const r = d.recipe && app.byId[d.recipe];
    if (d.status === "cook" && r) {
      hero = `<section class="hero">
        <p class="eyebrow">Tonight</p>
        <h2>${esc(r.name)}</h2>
        <div class="meta">${r.time} min <span class="dot"></span>${proteinLine(r)} protein</div>
        <div class="btn-row"><button class="btn small" data-open="${r.id}"><span data-icon="pot"></span>Start cooking</button>
        <button class="btn small" data-emergency="${ti}"><span data-icon="bolt"></span>Something quicker</button></div>
      </section>`;
    } else if (d.status !== "cook") {
      hero = `<section class="hero"><p class="eyebrow">Tonight</p><h2>${d.status === "out" ? "Night off: eating out" : "Leftovers night"}</h2></section>`;
    }
  }

  let weekCost = 0;
  const cards = days.map((d, i) => {
    const date = addDays(start, i);
    const isToday = iso(date) === todayISO;
    const r = d.recipe && app.byId[d.recipe];
    const muted = d.status !== "cook";
    let title, meta = "";
    if (d.status === "out") title = `<span class="day-title empty">Eating out / night off</span>`;
    else if (d.status === "leftovers") title = `<span class="day-title empty">Leftovers</span>`;
    else if (r) {
      const cost = recipeCost(r).perPortion * factor;
      weekCost += cost;
      title = `<button class="day-title" data-open="${r.id}">${r.emergency ? `<span class="pill warm" style="vertical-align:3px">⚡ Quick</span> ` : ""}${esc(r.name)}</button>`;
      meta = `<div class="meta">${r.time} min<span class="dot"></span>${proteinLine(r)} protein<span class="dot"></span>≈${money(cost)}</div>`;
    } else title = `<button class="day-title empty" data-pick="${i}">+ Choose a dinner</button>`;

    const actions = d.status === "cook" ? `
      <button class="icon-btn" data-swap="${i}" title="Swap for something else" aria-label="Swap"><span data-icon="swap"></span></button>
      <button class="icon-btn ${d.locked ? "on" : ""}" data-lock="${i}" title="${d.locked ? "Unlock" : "Keep this one"}" aria-label="Lock"><span data-icon="${d.locked ? "lock" : "unlock"}"></span></button>
      <button class="icon-btn" data-menu="${i}" aria-label="More"><span data-icon="dots"></span></button>`
      : `<button class="btn small" data-status="${i}:cook">Cook instead</button>`;

    return `<article class="day ${isToday ? "today" : ""} ${muted ? "muted" : ""}">
      <div class="date"><div class="dow">${DOW[mondayIndex(date)]}</div><div class="dom">${date.getDate()}</div></div>
      <div class="day-main">${title}${meta}<div class="day-actions">${actions}</div></div>
    </article>`;
  }).join("");

  return `
    <header class="page-head">
      <div>
        <p class="eyebrow">${thisWeek ? "This week" : "Week of"}</p>
        <h1>${niceDate(start)} – ${niceDate(end)}</h1>
      </div>
      <div class="week-nav">
        <button class="icon-btn" data-week="-1" aria-label="Previous week"><span data-icon="left"></span></button>
        <button class="icon-btn" data-week="1" aria-label="Next week"><span data-icon="right"></span></button>
      </div>
    </header>
    ${hero}
    <div class="btn-row" style="margin-bottom:6px">
      <button class="btn primary" data-suggest><span data-icon="sparkle"></span>${anyPlanned ? "Shuffle week" : "Plan my week"}</button>
      <button class="btn" data-goto="list"><span data-icon="basket"></span>Shopping</button>
    </div>
    ${anyPlanned ? `<p class="meta" style="margin:0 4px 14px">Dinners use ≈ ${money(weekCost)} of food at ${esc(shopName(priceShop(), false))} prices${app.state.settings.budget ? " · budget swaps on" : ""}</p>` : `<div style="height:8px"></div>`}
    <div class="days">${cards}</div>`;
}

// ----- Shopping list -----
function shopOrder() { return [...enabledShops(), "any"]; }

function renderList() {
  const week = app.weekStart;
  const all = buildList(week);
  const active = all.filter((i) => i.active);
  const done = active.filter((i) => i.done).length;
  const pct = active.length ? Math.round((done / active.length) * 100) : 0;
  const start = parseISO(week);

  if (!all.some((i) => !i.staple && !i.extra) && !active.length) {
    return `<header class="page-head"><div><p class="eyebrow">Shopping</p><h1>Week of ${niceDate(start)}</h1></div></header>
      <div class="empty-state"><h2>Nothing planned yet</h2><p>Plan some dinners and the list builds itself.</p>
      <button class="btn primary" data-goto="week">Plan the week</button></div>`;
  }

  const groupKey = app.listGroup === "shop" ? "shop" : "aisle";
  const order = groupKey === "aisle" ? aisleOrder() : shopOrder();
  const toGet = active.filter((i) => !i.cupboard || i.need);
  const groups = {};
  toGet.forEach((i) => { const g = order.includes(i[groupKey]) ? i[groupKey] : (groupKey === "shop" ? "any" : "other"); (groups[g] = groups[g] || []).push(i); });
  const sortItems = (a, b) => (a.done - b.done) || a.name.localeCompare(b.name);

  const groupHTML = order.filter((g) => groups[g]).map((g) => {
    const title = groupKey === "aisle" ? aisleName(g) : shopName(g, false);
    const sub = groupKey === "shop" ? groups[g].reduce((t, i) => t + (i.cost || 0), 0) : 0;
    return `<h3>${esc(title)}${sub ? ` <span style="text-transform:none;letter-spacing:0;font-weight:500">· ≈${money(sub)}</span>` : ""}</h3><div class="group">${groups[g].sort(sortItems).map(itemRow).join("")}</div>`;
  }).join("");

  const cupboard = all.filter((i) => i.cupboard && !i.need);
  const have = all.filter((i) => !i.cupboard && i.have);

  const priced = toGet.filter((i) => i.cost != null);
  const total = priced.reduce((t, i) => t + i.cost, 0);
  const unpriced = toGet.length - priced.length;
  const base = total / shopMult(priceShop());
  const compare = enabledShops().filter((s) => s !== priceShop()).map((s) => `${esc(shopName(s))} ≈${money(base * shopMult(s))}`).join(" · ");
  const lastShop = app.lastShop || enabledShops()[0] || "any";
  const shopSelect = shopOrder().map((s) => `<option value="${s}" ${s === lastShop ? "selected" : ""}>${esc(shopName(s))}</option>`).join("");

  return `
    <header class="page-head">
      <div><p class="eyebrow">Shopping list</p><h1>Week of ${niceDate(start)}</h1></div>
      <div class="seg" role="tablist">
        <button class="${groupKey === "aisle" ? "on" : ""}" data-group="aisle">Aisle</button>
        <button class="${groupKey === "shop" ? "on" : ""}" data-group="shop">Shop</button>
      </div>
    </header>
    <section class="panel cost-panel">
      <div class="row" style="justify-content:space-between;align-items:baseline">
        <div><span class="eyebrow">Estimated total</span><div class="big-money">≈ ${money(total)}</div></div>
        <span class="meta">at ${esc(shopName(priceShop(), false))} prices</span>
      </div>
      <div class="meta">${compare ? `Same list: ${compare}` : ""}<br>This is whole packs, so it's more than the dinners use. The rest carries over.${unpriced ? `<br>${unpriced} item${unpriced === 1 ? "" : "s"} not priced (your own additions, mostly)` : ""}</div>
    </section>
    <form class="addbar" data-add>
      <input class="input" name="name" placeholder="Add an item" autocomplete="off" enterkeyhint="done">
      <select class="input shop-pick" name="shop" aria-label="From which shop">${shopSelect}</select>
      <button class="btn primary" aria-label="Add"><span data-icon="plus"></span></button>
    </form>
    <div class="list-tools">
      <span class="meta">${done} of ${active.length} in the trolley</span>
      <div class="btn-row">
        <button class="btn small" data-copy><span data-icon="copy"></span>Copy</button>
        <button class="btn small" data-download><span data-icon="download"></span>Download</button>
        <button class="btn small" data-print><span data-icon="print"></span>Print / PDF</button>
      </div>
    </div>
    <div class="progress"><i style="width:${pct}%"></i></div>
    ${groupHTML}
    ${have.length ? `<details class="fold"><summary>Already got (${have.length})</summary><div class="group">${have.map(itemRow).join("")}</div></details>` : ""}
    ${cupboard.length ? `<details class="fold"><summary>Check the cupboard (${cupboard.length})</summary>
      <p class="meta" style="margin:0 4px 8px">Things you probably have. Tap <b>Need it</b> to add one to the list.</p>
      <div class="group">${cupboard.map(itemRow).join("")}</div></details>` : ""}
    <p class="meta" style="margin:20px 4px 0">Prices are rough estimates (last checked ${esc(app.ing.prices_checked || "")}). Tap any price to put in the real one: it's saved for both of you.</p>
    ${done ? `<div style="margin-top:16px;text-align:center"><button class="btn small" data-clear><span data-icon="trash"></span>Untick everything</button></div>` : ""}`;
}

function itemRow(i) {
  const chips = [];
  (i.flags || []).forEach((f) => {
    if (f === "veg") chips.push(`<span class="pill warn" title="${esc(app.ing.flags.veg)}">Check V</span>`);
    if (f === "welfare") chips.push(`<span class="pill accent">Free-range</span>`);
  });
  (i.checkLabel || []).forEach((a) => chips.push(`<span class="pill warm">Check: ${esc(a.toLowerCase())}</span>`));
  const sub = [];
  if (i.recipes.length) sub.push(esc(i.recipes.join(", ")));
  if (i.from && i.from.length) sub.push(`instead of ${esc(i.from.join(", ").toLowerCase())}`);
  if (i.staple) sub.push("Weekly staple");
  if (i.extra) sub.push(i.by ? `Added by ${esc(i.by)}` : "Added");
  if (i.note) sub.push(esc(i.note));
  if (i.done && i.checkedBy) sub.push(`✓ ${esc(i.checkedBy)}`);

  let right;
  if (i.cupboard && !i.need) right = `<button class="btn small" data-flag="${i.key}:need:1">Need it</button>`;
  else if (i.cupboard && i.need) right = `<button class="icon-btn" data-flag="${i.key}:need:0" title="Don't need it" aria-label="Don't need it"><span data-icon="x"></span></button>`;
  else if (i.have) right = `<button class="btn small" data-flag="${i.key}:have:0">Need it</button>`;
  else if (i.extra) right = `<button class="icon-btn" data-remove="${esc(i.id)}" aria-label="Remove"><span data-icon="trash"></span></button>`;
  else right = `<button class="icon-btn" data-flag="${i.key}:have:1" title="Already got it" aria-label="Already got it"><span data-icon="home"></span></button>`;

  const priceBtn = i.k && !i.cupboard ? `<button class="price-btn" data-price="${esc(i.k)}" title="Update price">${i.cost != null ? "≈" + money(i.cost) : "add £"}</button>`
    : (i.cost != null ? `<span class="price-btn static">≈${money(i.cost)}</span>` : "");
  const swapBtn = i.swappable && i.swappable.length && !i.done ? `<button class="swap-btn" data-swapsheet="${esc(i.swappable.join(","))}"><span data-icon="exchange"></span>Swap</button>` : "";

  const showCheck = !(i.cupboard && !i.need) && !i.have;
  return `<div class="item ${i.done ? "done" : ""}">
    ${showCheck ? `<button class="check" data-flag="${i.key}:done:${i.done ? 0 : 1}" aria-label="Tick"><i>${icon("check")}</i></button>` : `<span></span>`}
    <div>
      <div><span class="item-name">${esc(i.name)}</span> ${i.qtyText ? `<span class="item-qty">${esc(i.qtyText)}</span>` : ""}</div>
      <div class="item-sub">${chips.join("")}${sub.length ? `<span>${sub.join(" · ")}</span>` : ""}</div>
      ${priceBtn || swapBtn ? `<div class="item-actions">${priceBtn}${swapBtn}</div>` : ""}
    </div>
    <div class="item-right"><button class="shop ${esc(i.shop)}" data-shopfor="${esc(i.key)}" title="Change shop">${esc(shopName(i.shop))}</button>${right}</div>
  </div>`;
}

function listAsText(week, { byShop = false } = {}) {
  const items = buildList(week).filter((i) => i.active && (!i.cupboard || i.need));
  const key = byShop ? "shop" : "aisle";
  const order = byShop ? shopOrder() : aisleOrder();
  const total = items.reduce((t, i) => t + (i.cost || 0), 0);
  const lines = [`Shopping list: week of ${niceDate(parseISO(week))} (≈${money(total)} at ${shopName(priceShop(), false)})`, ""];
  order.forEach((g) => {
    const group = items.filter((i) => i[key] === g);
    if (!group.length) return;
    lines.push((byShop ? shopName(g, false) : aisleName(g)).toUpperCase());
    group.sort((a, b) => a.name.localeCompare(b.name)).forEach((i) => {
      const where = byShop ? "" : ` [${shopName(i.shop)}]`;
      const warn = (i.flags || []).includes("veg") ? " (check V)" : "";
      lines.push(`${i.done ? "☑" : "☐"} ${i.name}${i.qtyText ? ` (${i.qtyText})` : ""}${warn}${where}`);
    });
    lines.push("");
  });
  return lines.join("\n").trim() + "\n";
}

function printList(week) {
  const items = buildList(week).filter((i) => i.active && (!i.cupboard || i.need));
  const total = items.reduce((t, i) => t + (i.cost || 0), 0);
  const html = aisleOrder().map((g) => {
    const group = items.filter((i) => i.aisle === g);
    if (!group.length) return "";
    return `<h2>${esc(aisleName(g))}</h2><ul>${group.sort((a, b) => a.name.localeCompare(b.name)).map((i) =>
      `<li>${esc(i.name)} ${i.qtyText ? `<b>${esc(i.qtyText)}</b>` : ""} <span class="where">${esc(shopName(i.shop))}${(i.flags || []).includes("veg") ? " · check V" : ""}</span></li>`).join("")}</ul>`;
  }).join("");
  const dinners = planFor(week).map((d, i) => d.status === "cook" && d.recipe && app.byId[d.recipe]
    ? `${DOW[mondayIndex(addDays(parseISO(week), i))]}: ${app.byId[d.recipe].name}` : null).filter(Boolean).join(" · ");
  $("#print").innerHTML = `<h1>Shopping list</h1><div class="sub">Week of ${niceDate(parseISO(week))} · ≈${money(total)} at ${esc(shopName(priceShop(), false))}<br>${esc(dinners)}</div>${html}`;
  window.print();
}

// ----- Recipes -----
function renderRecipes() {
  const q = app.recipeQuery.trim().toLowerCase();
  const f = app.recipeFilter;
  const list = app.recipes.filter((r) => {
    const p = prefsFor(r.id), blocked = blockedBy(r).length;
    if (f === "hidden") return p.ban || blocked;
    if (p.ban || blocked) return false;
    if (f === "fav" && !p.fav) return false;
    if (f === "quick" && r.time > 30) return false;
    if (f === "emergency" && !r.emergency) return false;
    if (q && !(`${r.name} ${r.cuisine} ${r.protein_source} ${r.blurb}`.toLowerCase().includes(q))) return false;
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));

  const chip = (id, label) => `<button class="chip ${f === id ? "on" : ""}" data-filter="${id}">${label}</button>`;
  const { factor } = household();
  return `
    <header class="page-head"><div><p class="eyebrow">${app.recipes.length} dinners</p><h1>Recipes</h1></div></header>
    <input class="input" style="width:100%;margin-bottom:10px" type="search" placeholder="Search: lentils, curry, quick…" value="${esc(app.recipeQuery)}" data-search>
    <div class="chips">${chip("all", "All")}${chip("emergency", "⚡ Emergency")}${chip("quick", "30 min or less")}${chip("fav", "♥ Favourites")}${chip("hidden", "Hidden")}</div>
    <div class="cards">${list.map((r) => {
      const p = prefsFor(r.id), blocked = blockedBy(r);
      const cost = recipeCost(r).perPortion;
      return `<button class="card ${p.ban || blocked.length ? "banned" : ""}" data-open="${r.id}">
        <h2>${p.fav ? "♥ " : ""}${r.emergency ? "⚡ " : ""}${esc(r.name)}</h2>
        <p>${esc(r.blurb)}</p>
        <div class="meta">${r.time} min<span class="dot"></span>≈${r.protein}g protein<span class="dot"></span>≈${money(cost)} a portion · ${money(cost * factor)} for you all</div>
        ${blocked.length ? `<div class="meta" style="color:var(--warm);margin-top:4px">Contains ${esc(blocked.join(", ").toLowerCase())}</div>` : p.ban ? `<div class="meta" style="margin-top:4px">Marked "never again"</div>` : ""}
      </button>`;
    }).join("") || `<div class="empty-state">Nothing matches that.</div>`}</div>`;
}

function babyInfo() {
  const b = household().baby;
  const ageActual = b.born ? monthsBetween(parseISO(b.born), new Date()) : null;
  const ageCorrected = b.due ? monthsBetween(parseISO(b.due), new Date()) : ageActual;
  let firstBirthday = null;
  if (b.born) { firstBirthday = parseISO(b.born); firstBirthday.setFullYear(firstBirthday.getFullYear() + 1); }
  return { b, ageActual, ageCorrected, firstBirthday, underOne: ageActual ? ageActual.m < 12 : true };
}

function openRecipe(id, dayIndex = null) {
  const r = app.byId[id]; if (!r) return;
  const { factor, baby } = household();
  const p = prefsFor(id);
  const bi = babyInfo();
  const stage = baby.stage || "finger";
  const ings = effectiveIngredients(r);
  const main = ings.filter((i) => i.q != null);
  const cupboard = ings.filter((i) => i.q == null);
  const blocked = blockedBy(r);
  const cost = recipeCost(r).perPortion;
  const avoid = avoidList().map((a) => app.ing.allergens[a] || a);

  const ingHTML = main.map((i) => {
    const m = ingMeta(i.k);
    const chips = [];
    if ((m.f || []).includes("veg")) chips.push(`<span class="pill warn">Check V</span>`);
    if ((m.f || []).includes("welfare")) chips.push(`<span class="pill accent">Free-range</span>`);
    checkLabelFor(i.k).forEach((a) => chips.push(`<span class="pill warm">Check: ${esc(a.toLowerCase())}</span>`));
    const canSwap = (ingMeta(i.orig).sw || []).length;
    return `<li><span>${esc(m.n)} ${chips.join(" ")}
        ${i.from ? `<span class="meta" style="display:block">instead of ${esc(ingMeta(i.from).n.toLowerCase())}</span>` : ""}
        ${canSwap ? `<button class="swap-btn" data-swapsheet="${esc(i.orig)}" data-reopen="${id}"><span data-icon="exchange"></span>Swap</button>` : ""}</span>
      <span class="q">${esc(fmtQty(i.q * factor, i.u))}</span></li>`;
  }).join("");

  const babyNotes = r.baby || {};
  const babyBox = baby.include ? `
    <section class="baby-box" style="margin-top:16px">
      <h2>👶 ${esc(baby.name || "Baby")}: ${esc(STAGES[stage]?.name || stage)}</h2>
      <p>${esc(babyNotes[stage] || "Take the baby's portion out before salt, stock or chilli, and cut it to a size they can manage.")}</p>
      <ul>
        <li>No added salt or stock in the baby's portion.</li>
        ${bi.underOne ? `<li>No honey until ${bi.firstBirthday ? niceDate(bi.firstBirthday) + " " + bi.firstBirthday.getFullYear() : "their first birthday"}.</li>` : ""}
        <li>Quarter cherry tomatoes and grapes. Nuts ground or smooth only.</li>
      </ul>
    </section>` : "";

  const dayOptions = DOW_LONG.map((name, i) => {
    const date = addDays(parseISO(app.weekStart), i);
    return `<option value="${i}">${DOW_LONG[mondayIndex(date)]} ${date.getDate()}</option>`;
  }).join("");

  openSheet(`
    <div class="r-head">
      <h1>${esc(r.name)}</h1>
      <p>${esc(r.blurb)}</p>
      ${blocked.length ? `<div class="notice" style="margin-bottom:10px">Contains ${esc(blocked.join(", ").toLowerCase())}, so it's hidden from your plans.</div>` : ""}
      <div class="r-stats">
        <span class="pill"><span data-icon="clock" style="width:14px;height:14px"></span>${r.time} min</span>
        ${r.emergency ? `<span class="pill warm">⚡ Emergency meal</span>` : `<span class="pill">${esc(r.cuisine)}</span>`}
        <span class="pill accent">≈ ${proteinLine(r)} protein</span>
        <span class="pill">≈${money(cost)} a portion · ${money(cost * factor)} total</span>
        ${avoid.length && !blocked.length ? `<span class="pill warm">No ${esc(avoid.join(", ").toLowerCase())}</span>` : ""}
      </div>
      <div class="btn-row" style="margin-bottom:16px">
        <button class="btn small ${p.fav ? "primary" : ""}" data-pref="${id}:fav:${p.fav ? 0 : 1}"><span data-icon="heart"></span>Favourite</button>
        <button class="btn small" data-pref="${id}:ban:${p.ban ? 0 : 1}"><span data-icon="ban"></span>${p.ban ? "Allow again" : "Never again"}</button>
        ${dayIndex != null ? `<button class="btn small primary" data-put="${id}:${dayIndex}">Use for this day</button>` :
          `<select class="input" style="flex:0 1 auto;min-height:36px" data-put-select="${id}"><option value="">Add to this week…</option>${dayOptions}</select>`}
      </div>
    </div>
    <h3 style="margin-top:0">Ingredients <span style="text-transform:none;letter-spacing:0;font-weight:500">· for ${niceNumber(factor)} portions</span></h3>
    <div class="panel"><ul class="ing">${ingHTML}</ul>
      ${cupboard.length ? `<p class="meta" style="margin:10px 0 0">Plus from the cupboard: ${cupboard.map((i) => esc(ingMeta(i.k).n.toLowerCase())).join(", ")}.</p>` : ""}
    </div>
    ${babyBox}
    <h3>Method</h3>
    <ol class="steps">${r.steps.filter((s) => baby.include || !s.baby).map((s) => `<li class="${s.baby ? "baby" : ""}">${esc(scaleStep(s.t, factor))}</li>`).join("")}</ol>
  `);
}

function openPicker(dayIndex, { emergency = false } = {}) {
  const date = addDays(parseISO(app.weekStart), dayIndex);
  const maxT = maxTimeFor(app.weekStart, dayIndex);
  const list = app.recipes.filter((r) => !prefsFor(r.id).ban && !blockedBy(r).length && (!emergency || r.emergency))
    .sort((a, b) => (b.emergency ? 1 : 0) - (a.emergency ? 1 : 0) || (a.time > maxT) - (b.time > maxT) || a.name.localeCompare(b.name));
  openSheet(`
    <div class="r-head"><h1>${DOW_LONG[mondayIndex(date)]} ${date.getDate()}</h1><p>${emergency ? "Quick meals from the freezer and cupboard." : `Pick a dinner. ⚡ meals take about 15 minutes. Ones within your ${maxT}-minute limit come next.`}</p></div>
    <div class="cards">${list.map((r) => `<button class="card" data-put="${r.id}:${dayIndex}">
      <h2>${prefsFor(r.id).fav ? "♥ " : ""}${r.emergency ? "⚡ " : ""}${esc(r.name)}</h2>
      <div class="meta">${r.time} min<span class="dot"></span>≈${r.protein}g protein<span class="dot"></span>≈${money(recipeCost(r).perPortion)} a portion</div></button>`).join("")}</div>`);
}

// ----- swap & price sheets -----
function openSwapSheet(keys, reopen) {
  const { factor } = household();
  const blocks = keys.split(",").map((k) => {
    const m = ingMeta(k), current = resolveIng(k).k;
    const row = (altKey, why, isOrig) => {
      const am = ingMeta(altKey);
      const on = current === altKey;
      const val = isOrig ? "" : altKey;
      const bp = basePrice(altKey);
      return `<button class="card ${on ? "selected" : ""}" data-setswap="${esc(k)}:${esc(val)}" ${reopen ? `data-reopen="${esc(reopen)}"` : ""}>
        <h2 style="font-size:16px">${on ? "✓ " : ""}${esc(am.n)}${isOrig ? " <span class='meta'>(original)</span>" : ""}</h2>
        <div class="meta">${esc(why)}${bp && am.pk ? `<span class="dot"></span>≈${money(bp.p * shopMult(priceShop()))} per ${esc(fmtQty(am.pk[0], am.pk[1]))}` : ""}</div></button>`;
    };
    return `<h3>${esc(m.n)}</h3><div class="cards">${row(k, "As the recipe says", true)}${(m.sw || []).map((o) => row(o.k, o.why + (o.budget ? " · budget" : ""), false)).join("")}</div>`;
  }).join("");
  openSheet(`<div class="r-head"><h1>Swap an ingredient</h1><p>This applies to every recipe, for both of you. Budget mode in Settings picks the cheaper option automatically.</p></div>${blocks}`);
}

function openPriceSheet(k) {
  const m = ingMeta(k);
  const own = (app.state.prices || {})[k];
  const bp = basePrice(k);
  const shop = own ? own.shop : priceShop();
  const current = bp ? bp.p * shopMult(shop) : null;
  const opts = shopOrder().filter((s) => s !== "any").map((s) => `<option value="${s}" ${s === shop ? "selected" : ""}>${esc(shopName(s))}</option>`).join("");
  const when = own ? `Updated by ${esc(own.by || "someone")} on ${niceDate(new Date(own.at * 1000))}` : `Built-in estimate, last checked ${esc(app.ing.prices_checked || "")}`;
  openSheet(`
    <div class="r-head"><h1>${esc(m.n)}</h1><p>Price for ${m.pk ? `a pack of <b>${esc(fmtQty(m.pk[0], m.pk[1]))}</b>` : "one pack"}. ${when}.</p></div>
    <form class="panel" data-priceform="${esc(k)}">
      <div class="field"><label class="lbl">Price</label>
        <div class="row"><span style="font-weight:700">£</span><input class="input" name="price" inputmode="decimal" value="${current != null ? current.toFixed(2) : ""}" placeholder="0.00"></div></div>
      <div class="field"><label class="lbl">Seen at</label><select class="input" name="shop">${opts}</select>
        <span class="hint">Other shops are estimated from this with a rule of thumb.</span></div>
      <div class="field"><div class="btn-row"><button class="btn primary">Save price</button>
        ${own ? `<button class="btn" type="button" data-resetprice="${esc(k)}">Use the estimate again</button>` : ""}</div></div>
    </form>`);
}

function openShopMenu(btn, key) {
  closeMenus();
  const m = document.createElement("div");
  m.className = "menu";
  m.innerHTML = `<p class="meta" style="margin:6px 12px">Get this from…</p>` + shopOrder().map((s) => `<button data-setshop="${esc(key)}:${s}"><span class="shop ${s}">${esc(shopName(s))}</span></button>`).join("");
  placeMenu(m, btn);
  m.addEventListener("click", (e) => {
    const b = e.target.closest("[data-setshop]"); if (!b) return;
    const [k, s] = b.dataset.setshop.split(/:(?=[a-z]+$)/);
    closeMenus();
    send({ op: "shop_for", week: app.weekStart, key: k, shop: s });
  });
}

// ----- Settings -----
function renderSettings() {
  const s = app.state.settings;
  const bi = babyInfo();
  const b = bi.b;
  const stageOpts = Object.entries(STAGES).map(([k, v]) => `<option value="${k}" ${b.stage === k ? "selected" : ""}>${v.name}</option>`).join("");
  const suggestMove = bi.ageCorrected && bi.ageCorrected.m >= 12 && b.stage !== "chopped";
  const stepper = (path, val, step) => `<div class="stepper"><button data-step="${path}:${-step}" aria-label="Less">−</button><span>${(+val).toFixed(2).replace(/0$/, "")}</span><button data-step="${path}:${step}" aria-label="More">+</button></div>`;
  const dayOpts = DOW_LONG.map((d, i) => `<option value="${i}" ${(+s.weekStartDay || 0) === i ? "selected" : ""}>${d}</option>`).join("");
  const minOpts = (cur, opts) => opts.map((m) => `<option value="${m}" ${+cur === m ? "selected" : ""}>${m} minutes</option>`).join("");
  const shopOpts = (cur) => shopOrder().map((k) => `<option value="${k}" ${cur === k ? "selected" : ""}>${esc(shopName(k))}</option>`).join("");
  const aisleOpts = (cur) => app.ing.aisles.filter((a) => a.id !== "cupboard").map((a) => `<option value="${a.id}" ${cur === a.id ? "selected" : ""}>${a.name}</option>`).join("");
  const enabled = s.shops || Object.keys(app.ing.shops);
  const avoid = s.avoid || [];
  const ageLine = b.born ? `${esc(ageText(b.born))} old${b.due && b.due !== b.born ? ` · ${esc(ageText(b.due))} corrected` : ""}` : "Add a birth date to see their age. If they were early, add the due date for their corrected age.";

  // what budget mode would save this week
  const allOff = buildListWith({ budget: false }), allOn = buildListWith({ budget: true });
  const saving = allOff - allOn;

  return `
    <header class="page-head"><div><p class="eyebrow">Settings</p><h1>Your household</h1></div></header>
    <p class="meta" style="margin:-6px 4px 8px">These are stored on your Home Assistant, not in the app's code.</p>

    <h3>Grown-ups</h3>
    <div class="panel">
      ${s.people.map((p, i) => `<div class="field">
        <div class="row"><input class="input" value="${esc(p.name)}" data-person-name="${i}" aria-label="Name">${stepper(`people.${i}`, p.portion, 0.1)}</div>
        <span class="hint">Portion size (1 = a standard portion). Protein is shown per person.</span>
      </div>`).join("")}
    </div>

    <h3>Baby</h3>
    <div class="panel">
      <div class="field"><div class="row"><input class="input" value="${esc(b.name)}" data-baby="name" aria-label="Name">
        <label class="switch" title="Include in meals"><input type="checkbox" data-baby-include ${b.include ? "checked" : ""}><i></i></label></div>
        <span class="hint">${b.include ? "Included: recipes show their portion and how to prepare it." : "Turn on to add a baby portion and weaning notes to every recipe."}</span></div>
      ${b.include ? `
      <div class="field"><div class="row">
        <div style="flex:1"><label class="lbl">Born</label><input class="input" style="width:100%" type="date" value="${esc(b.born)}" data-baby="born"></div>
        <div style="flex:1"><label class="lbl">Due date</label><input class="input" style="width:100%" type="date" value="${esc(b.due)}" data-baby="due"></div>
      </div><span class="hint">${ageLine}</span></div>
      <div class="field"><label class="lbl">Eating stage</label><select class="input" data-baby="stage">${stageOpts}</select>
        <span class="hint">${esc(STAGES[b.stage]?.hint || "")}</span>
        ${suggestMove ? `<div class="notice">Past 12 months corrected. They might be ready for chopped family food.</div>` : ""}</div>
      <div class="field"><div class="row" style="justify-content:space-between"><span class="lbl">Baby portion</span>${stepper("baby", b.portion, 0.05)}</div></div>` : ""}
    </div>

    <h3>Food rules</h3>
    <div class="panel">
      <div class="field"><span class="lbl">Allergies: never include</span>
        <div class="chips wrap">${Object.entries(app.ing.allergens).map(([k, v]) => `<button class="chip ${avoid.includes(k) ? "on" : ""}" data-avoid="${k}">${esc(v)}</button>`).join("")}</div>
        <span class="hint">Recipes containing these are hidden. Shopping items that sometimes contain them get a "Check" label.</span></div>
      <div class="field"><label class="lbl">Dislikes</label><input class="input" value="${esc(s.dislikes || "")}" placeholder="e.g. mushroom, feta" data-setting-text="dislikes">
        <span class="hint">Separate with commas. Recipes using these are hidden.</span></div>
      <div class="field"><span class="lbl">Always</span>
        <ul class="rules">
          <li>Nothing from a dead animal: no meat, fish, gelatine, anchovy (so no Worcestershire), cochineal (E120), or animal rennet (so no Parmesan or Grana Padano).</li>
          <li>Free-range, British Lion eggs. Cheese with the V symbol.</li>
          <li>Baby portions come out before salt, stock and chilli. No honey before age 1, and no whole nuts.</li>
        </ul></div>
    </div>

    <h3>Shops & prices</h3>
    <div class="panel">
      <div class="field"><span class="lbl">Shops you use</span>
        <div class="chips wrap">${Object.keys(app.ing.shops).filter((k) => k !== "any").map((k) => `<button class="chip ${enabled.includes(k) ? "on" : ""}" data-shoptoggle="${k}">${esc(shopName(k))}</button>`).join("")}</div></div>
      <div class="field"><label class="lbl">Estimate prices at</label><select class="input" data-setting-text="priceShop">${enabledShops().map((k) => `<option value="${k}" ${priceShop() === k ? "selected" : ""}>${esc(shopName(k, false))}</option>`).join("")}</select>
        <span class="hint">${esc(app.ing.prices_note || "")}</span></div>
      <div class="field"><div class="row" style="justify-content:space-between"><span class="lbl">Budget mode</span>
        <label class="switch"><input type="checkbox" data-budget ${s.budget ? "checked" : ""}><i></i></label></div>
        <span class="hint">Automatically uses cheaper swaps: frozen spinach, peppers and broccoli, garlic paste, bottled lemon juice, natural yoghurt and so on.${saving > 0.05 ? ` This week that's about <b>${money(saving)}</b> ${s.budget ? "saved" : "cheaper"}.` : ""} You can still swap individual items from the shopping list.</span></div>
    </div>

    <h3>Planning</h3>
    <div class="panel">
      <div class="field"><label class="lbl">Week starts on</label><select class="input" data-setting="weekStartDay">${dayOpts}</select>
        <span class="hint">Set this to the day after your big shop.</span></div>
      <div class="field"><label class="lbl">Weeknight time limit</label><select class="input" data-setting="weeknightMax">${minOpts(s.weeknightMax, [20, 30, 40, 50, 60])}</select></div>
      <div class="field"><label class="lbl">Weekend time limit</label><select class="input" data-setting="weekendMax">${minOpts(s.weekendMax, [40, 60, 90, 120])}</select></div>
    </div>

    <h3>Weekly staples</h3>
    <div class="panel">
      ${(s.staples || []).map((st, i) => `<div class="field">
        <div class="row"><input class="input" value="${esc(st.name)}" data-staple="${i}:name" aria-label="Item">
          <label class="switch"><input type="checkbox" data-staple-on="${i}" ${st.on ? "checked" : ""}><i></i></label></div>
        <div class="row"><input class="input" value="${esc(st.amount || "")}" placeholder="Amount" data-staple="${i}:amount" aria-label="Amount">
          <span style="font-weight:700">£</span><input class="input" style="flex:0 0 76px" inputmode="decimal" value="${st.price != null ? esc(st.price) : ""}" placeholder="0.00" data-staple="${i}:price" aria-label="Price at Aldi">
          <button class="icon-btn" data-staple-del="${i}" aria-label="Remove"><span data-icon="trash"></span></button></div>
        <div class="row"><select class="input" data-staple="${i}:aisle">${aisleOpts(st.aisle)}</select><select class="input" style="flex:0 0 auto" data-staple="${i}:shop">${shopOpts(st.shop)}</select></div>
      </div>`).join("")}
      <div class="field"><button class="btn small" data-staple-add><span data-icon="plus"></span>Add a staple</button>
        <span class="hint">Breakfasts, lunches and anything you buy every week. These go on every list. Enter prices at Aldi level.</span></div>
    </div>

    <p class="meta" style="text-align:center;margin-top:24px">${app.mode === "live" ? `Synced through Home Assistant${app.user ? ` · signed in as ${esc(app.user)}` : ""}` : "Preview mode: saved on this device only"} · FoodIsHard 0.2.0</p>`;
}

/** Total list cost this week as if budget mode were on/off (for the settings hint). */
function buildListWith({ budget }) {
  const s = app.state.settings, keepB = s.budget, keepSw = app.state.swaps;
  s.budget = budget; app.state.swaps = {};
  try { return buildList(app.weekStart).filter((i) => i.active && !i.cupboard).reduce((t, i) => t + (i.cost || 0), 0); }
  finally { s.budget = keepB; app.state.swaps = keepSw; }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
function bindView(view) {
  view.onclick = onClick;
  view.onchange = onChange;
  view.oninput = (e) => {
    if (e.target.matches("[data-search]")) {
      app.recipeQuery = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const s = $("[data-search]"); s.focus(); s.setSelectionRange(pos, pos);
    }
  };
  view.onsubmit = (e) => {
    if (e.target.matches("[data-add]")) {
      e.preventDefault();
      const field = e.target.elements.namedItem("name");
      const shop = e.target.elements.namedItem("shop").value;
      const name = field.value.trim();
      if (!name) return;
      app.lastShop = shop;
      send({ op: "extra_add", week: app.weekStart, item: { id: uid(), name, aisle: "other", shop } });
      toast(`Added ${name} (${shopName(shop)})`);
    }
  };
}

function onClick(e) {
  const t = e.target.closest("button, [data-open]");
  if (!t) return;
  const d = t.dataset;
  const week = app.weekStart;

  if (d.open) return openRecipe(d.open);
  if (d.goto) return go(d.goto);
  if (d.week) {
    app.weekStart = iso(addDays(parseISO(week), 7 * +d.week));
    return render();
  }
  if (d.suggest !== undefined) {
    send({ op: "plan", week, plan: suggestWeek(week) });
    return toast("Here's a plan. Swap anything you don't fancy.");
  }
  if (d.swap) {
    const i = +d.swap, days = planFor(week), cur = days[i].recipe;
    const isEm = cur && app.byId[cur] && app.byId[cur].emergency;
    const next = pickRecipe(week, i, days, new Set(cur ? [cur] : []), { emergency: !!isEm });
    return send({ op: "day", week, i, day: { ...days[i], recipe: next, status: "cook" } });
  }
  if (d.emergency) {
    const i = +d.emergency, days = planFor(week);
    const next = pickRecipe(week, i, days, new Set([days[i].recipe]), { emergency: true });
    send({ op: "day", week, i, day: { ...days[i], recipe: next, status: "cook" } });
    return toast("Swapped for a quick one. The original's still in Recipes.");
  }
  if (d.lock) {
    const i = +d.lock, days = planFor(week);
    return send({ op: "day", week, i, day: { ...days[i], locked: !days[i].locked } });
  }
  if (d.pick) return openPicker(+d.pick);
  if (d.menu) return openDayMenu(t, +d.menu);
  if (d.status) {
    const [i, status] = d.status.split(":");
    const days = planFor(week);
    closeMenus();
    if (status === "pick") return openPicker(+i);
    if (status === "emergency") {
      const next = pickRecipe(week, +i, days, new Set(), { emergency: true });
      return send({ op: "day", week, i: +i, day: { ...days[+i], recipe: next, status: "cook" } });
    }
    const day = { ...days[+i], status };
    if (status === "cook" && !day.recipe) day.recipe = pickRecipe(week, +i, days);
    if (status === "clear") { day.status = "cook"; day.recipe = null; day.locked = false; }
    return send({ op: "day", week, i: +i, day });
  }
  if (d.group) { app.listGroup = d.group; return render(); }
  if (d.flag) {
    const parts = d.flag.split(":");
    const val = parts.pop(), field = parts.pop(), key = parts.join(":");
    return send({ op: "check", week, key, field, value: val === "1" });
  }
  if (d.price) return openPriceSheet(d.price);
  if (d.swapsheet) return openSwapSheet(d.swapsheet);
  if (d.shopfor) return openShopMenu(t, d.shopfor);
  if (d.remove) return send({ op: "extra_remove", week, id: d.remove });
  if (d.clear !== undefined) return send({ op: "clear_checks", week });
  if (d.copy !== undefined) return copyText(listAsText(week, { byShop: app.listGroup === "shop" }));
  if (d.download !== undefined) return downloadText(listAsText(week, { byShop: app.listGroup === "shop" }), `shopping-${week}.txt`);
  if (d.print !== undefined) return printList(week);
  if (d.filter) { app.recipeFilter = d.filter; return render(); }
  if (d.avoid) {
    const avoid = new Set(app.state.settings.avoid || []);
    avoid.has(d.avoid) ? avoid.delete(d.avoid) : avoid.add(d.avoid);
    return send({ op: "settings", patch: { avoid: [...avoid] } });
  }
  if (d.shoptoggle) {
    const on = new Set(app.state.settings.shops || Object.keys(app.ing.shops));
    on.has(d.shoptoggle) ? on.delete(d.shoptoggle) : on.add(d.shoptoggle);
    if (!on.size) return toast("Keep at least one shop");
    const patch = { shops: [...on] };
    if (!on.has(priceShop())) patch.priceShop = [...on][0];
    return send({ op: "settings", patch });
  }
  if (d.step) {
    const [path, delta] = d.step.split(":");
    const s = app.state.settings;
    if (path === "baby") {
      const b = { ...s.baby, portion: Math.max(0.05, Math.round((+s.baby.portion + +delta) * 100) / 100) };
      return send({ op: "settings", patch: { baby: b } });
    }
    const i = +path.split(".")[1];
    const people = clone(s.people);
    people[i].portion = Math.max(0.3, Math.round((+people[i].portion + +delta) * 10) / 10);
    return send({ op: "settings", patch: { people } });
  }
  if (d.stapleAdd !== undefined) {
    const staples = clone(app.state.settings.staples || []);
    staples.push({ id: uid(), name: "New item", amount: "", aisle: "other", shop: enabledShops()[0] || "aldi", on: true });
    return send({ op: "settings", patch: { staples } });
  }
  if (d.stapleDel) {
    const staples = clone(app.state.settings.staples || []);
    staples.splice(+d.stapleDel, 1);
    return send({ op: "settings", patch: { staples } });
  }
}

function onChange(e) {
  const el = e.target, d = el.dataset, s = app.state.settings;
  if (d.personName) {
    const people = clone(s.people); people[+d.personName].name = el.value.trim() || people[+d.personName].name;
    return send({ op: "settings", patch: { people } });
  }
  if (d.baby) return send({ op: "settings", patch: { baby: { ...s.baby, [d.baby]: el.value } } });
  if (d.babyInclude !== undefined) return send({ op: "settings", patch: { baby: { ...s.baby, include: el.checked } } });
  if (d.budget !== undefined) return send({ op: "settings", patch: { budget: el.checked } });
  if (d.settingText) return send({ op: "settings", patch: { [d.settingText]: el.value } });
  if (d.setting) {
    send({ op: "settings", patch: { [d.setting]: +el.value } });
    if (d.setting === "weekStartDay") { app.weekStart = iso(weekStartFor(new Date(), +el.value)); render(); }
    return;
  }
  if (d.staple) {
    const [i, field] = d.staple.split(":");
    const staples = clone(s.staples);
    staples[+i][field] = field === "price" ? (el.value.trim() === "" ? null : Math.max(0, parseFloat(el.value.replace(/[£,]/g, "")) || 0)) : el.value;
    return send({ op: "settings", patch: { staples } });
  }
  if (d.stapleOn) {
    const staples = clone(s.staples); staples[+d.stapleOn].on = el.checked;
    return send({ op: "settings", patch: { staples } });
  }
}

// sheet-level clicks (recipe view, picker, swaps, prices)
document.addEventListener("click", (e) => {
  const t = e.target.closest("#sheet button, #sheet [data-put]");
  if (!t) return;
  const d = t.dataset;
  if (d.pref) {
    const [id, field, val] = d.pref.split(":");
    send({ op: "pref", recipe: id, patch: { [field]: val === "1" } });
    return openRecipe(id);
  }
  if (d.put) {
    const [id, i] = d.put.split(":");
    const days = planFor(app.weekStart);
    send({ op: "day", week: app.weekStart, i: +i, day: { ...days[+i], recipe: id, status: "cook" } });
    closeSheet();
    toast(`${app.byId[id].name} added`);
  }
  if (d.swapsheet) return openSwapSheet(d.swapsheet, d.reopen);
  if (d.setswap !== undefined) {
    const [k, alt] = d.setswap.split(":");
    send({ op: "swap", key: k, alt });
    if (d.reopen) return openRecipe(d.reopen);
    closeSheet();
    return toast(alt ? `Swapped for ${ingMeta(alt).n.toLowerCase()}` : "Back to the original");
  }
  if (d.resetprice) {
    send({ op: "price", key: d.resetprice, price: null });
    closeSheet();
    return toast("Using the built-in estimate");
  }
});
document.addEventListener("submit", (e) => {
  const f = e.target.closest("[data-priceform]");
  if (!f) return;
  e.preventDefault();
  const price = parseFloat(String(f.elements.namedItem("price").value).replace(/[£,\s]/g, ""));
  if (!(price >= 0)) return toast("Enter a price, like 1.25");
  send({ op: "price", key: f.dataset.priceform, price, shop: f.elements.namedItem("shop").value });
  closeSheet();
  toast("Price saved for both of you");
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.matches("[data-put-select]") && el.value !== "") {
    const id = el.dataset.putSelect, i = +el.value;
    const days = planFor(app.weekStart);
    send({ op: "day", week: app.weekStart, i, day: { ...days[i], recipe: id, status: "cook" } });
    closeSheet();
    toast(`${app.byId[id].name} added`);
  }
});

// ----- menus -----
function placeMenu(m, btn) {
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect();
  const left = Math.min(window.innerWidth - m.offsetWidth - 8, r.right + window.scrollX - m.offsetWidth);
  m.style.left = `${Math.max(8, left)}px`;
  let top = r.bottom + window.scrollY + 4;
  if (r.bottom + m.offsetHeight + 80 > window.innerHeight) top = r.top + window.scrollY - m.offsetHeight - 4;
  m.style.top = `${top}px`;
}
function openDayMenu(btn, i) {
  closeMenus();
  const m = document.createElement("div");
  m.className = "menu";
  m.innerHTML = `
    <button data-status="${i}:pick">${icon("book")} Choose a recipe…</button>
    <button data-status="${i}:emergency">${icon("bolt")} Emergency meal (about 15 min)</button>
    <button data-status="${i}:leftovers">${icon("pot")} Leftovers night</button>
    <button data-status="${i}:out">${icon("out")} Eating out / night off</button>
    <button data-status="${i}:clear">${icon("x")} Clear this day</button>`;
  m.querySelectorAll("svg").forEach((s) => { s.style.width = "18px"; s.style.height = "18px"; });
  placeMenu(m, btn);
  m.addEventListener("click", (e) => onClick(e));
}
function closeMenus() { document.querySelectorAll(".menu").forEach((m) => m.remove()); }
function closeMenusOnOutside(e) { if (!e.target.closest(".menu") && !e.target.closest("[data-menu]") && !e.target.closest("[data-shopfor]")) closeMenus(); }

// ----- sheet / toast / clipboard -----
function openSheet(html) {
  $("#sheetBody").innerHTML = html;
  hydrateIcons($("#sheetBody"));
  $("#sheet").hidden = false;
  $(".sheet-panel").scrollTop = 0;
  document.body.style.overflow = "hidden";
}
function closeSheet() {
  $("#sheet").hidden = true;
  document.body.style.overflow = "";
}
let toastTimer;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("List copied. Paste it into WhatsApp or anywhere else."); }
  catch {
    const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("List copied"); } catch { toast("Couldn't copy on this device"); }
    ta.remove();
  }
}
function downloadText(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}

boot().catch((err) => {
  console.error(err);
  $("#view").innerHTML = `<div class="empty-state"><h2>Something went wrong loading</h2><p>${esc(err.message)}</p></div>`;
});
