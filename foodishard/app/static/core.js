/* FoodIsHard core: state, sync, planning, shopping list, prices and nutrition.
 * Plain JavaScript, no build step. ui.js draws the screens. */
"use strict";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 9);
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const STAGES = {
  smooth: { name: "Smooth & mashed", hint: "Early weaning: blended or well mashed." },
  finger: { name: "Finger foods & soft lumps", hint: "Holding soft strips, chewing lumps, managing toast." },
  chopped: { name: "Chopped family food", hint: "Same meal as you, cut small. Still go easy on salt." },
};

function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function parseISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function mondayIndex(d) { return (d.getDay() + 6) % 7; }
function weekStartFor(d, startDay) { const back = (mondayIndex(d) - startDay + 7) % 7; const x = addDays(d, -back); x.setHours(0, 0, 0, 0); return x; }
function niceDate(d) { return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }
function monthsBetween(from, to) {
  let m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  let days = to.getDate() - from.getDate();
  if (days < 0) { m -= 1; days += new Date(to.getFullYear(), to.getMonth(), 0).getDate(); }
  return { m, days };
}
function ageText(fromISO) {
  if (!fromISO) return "";
  const { m, days } = monthsBetween(parseISO(fromISO), new Date());
  if (m < 0) return "not born yet";
  if (m >= 24) return `${Math.floor(m / 12)} years`;
  return `${m} month${m === 1 ? "" : "s"}${days && m < 12 ? `, ${days} day${days === 1 ? "" : "s"}` : ""}`;
}
function money(n) { return n == null || isNaN(n) ? "" : `£${n.toFixed(2)}`; }

// ---------------------------------------------------------------------------
// Icons (inline stroke SVG)
// ---------------------------------------------------------------------------
const ICONS = {
  pot: '<path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-6Z"/><path d="M2 10h20M9 6c0-1 1-1 1-2m4 2c0-1 1-1 1-2"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  basket: '<path d="M3 9h18l-2 10a2 2 0 0 1-2 1.6H7A2 2 0 0 1 5 19L3 9Zm5 0 3-5m5 5-3-5"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h11"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  swap: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15m0 5v-5h5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  heart: '<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3.6A5 5 0 0 1 21 11c-2 4.6-9 9-9 9Z"/>',
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  bolt: '<path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
  baby: '<circle cx="12" cy="13" r="7"/><path d="M12 6c0-2 1.5-3 3-3"/><path d="M10 16c1.2 1 2.8 1 4 0"/><circle cx="9.5" cy="12.5" r=".7" fill="currentColor"/><circle cx="14.5" cy="12.5" r=".7" fill="currentColor"/>',
  nosignal: '<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><path d="M3 3l18 18"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  download: '<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/>',
  print: '<path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2m-7 0 1 13h8l1-13"/>',
  home: '<path d="M4 11 12 4l8 7M6 9.5V20h12V9.5"/>',
  skip: '<path d="M5 5l9 7-9 7V5Zm13 0v14"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
};
function icon(name, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------
const app = {
  mode: "loading", // live | demo
  user: "",
  state: null,
  recipes: [], byId: {}, families: [], famById: {},
  ing: null,
  tab: "tonight",
  weekStart: null,
  shopTab: "all",
  recipeFilter: "all", recipeQuery: "", openFamilies: new Set(),
  selecting: new Set(),
  offline: false,
  lastShop: null,
};
const DEMO_KEY = "foodishard-demo-v3";
const CACHE_KEY = "foodishard-cache-v3";
const QUEUE_KEY = "foodishard-queue-v1";

function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } }
function load(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }

// ---------------------------------------------------------------------------
// Operations (keep in step with apply_op in server.py)
// ---------------------------------------------------------------------------
function applyOp(state, op, user) {
  const now = Math.floor(Date.now() / 1000);
  const bag = (k) => state[k] || (state[k] = {});
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
      const week = bag("checks")[op.week] || (state.checks[op.week] = {});
      const item = week[op.key] || (week[op.key] = {});
      item[op.field] = !!op.value; item.by = user; item.at = now; break;
    }
    case "qty": { const week = bag("checks")[op.week] || (state.checks[op.week] = {}); (week[op.key] || (week[op.key] = {})).n = Math.max(1, Math.min(99, op.n | 0)); break; }
    case "extra_update": (state.extras[op.week] || []).forEach((i) => { if (i.id === op.id) ["name", "price", "qty", "shop"].forEach((k) => { if (k in (op.patch || {})) i[k] = op.patch[k]; }); }); break;
    case "clear_checks": bag("checks")[op.week] = {}; break;
    case "extra_add": (bag("extras")[op.week] || (state.extras[op.week] = [])).push({ ...op.item, by: user }); break;
    case "extra_remove": bag("extras")[op.week] = (state.extras[op.week] || []).filter((i) => i.id !== op.id); break;
    case "price": if (op.price == null) delete bag("prices")[op.key]; else bag("prices")[op.key] = { p: +op.price, shop: op.shop || "aldi", at: now, by: user }; break;
    case "swap": if (op.alt == null) delete bag("swaps")[op.key]; else bag("swaps")[op.key] = String(op.alt); break;
    case "shop_pref": (op.keys || [op.key]).forEach((k) => { if (!k) return; if (op.shop) bag("shopPref")[k] = op.shop; else delete bag("shopPref")[k]; }); break;
    case "pantry": (op.keys || [op.key]).forEach((k) => { if (!k) return; if (op.status) bag("pantry")[k] = op.status; else delete bag("pantry")[k]; }); break;
    case "feedback": {
      const fb = bag("feedback")[op.recipe] || (state.feedback[op.recipe] = []);
      fb.push({ rating: op.rating, tags: op.tags || [], note: (op.note || "").slice(0, 500), at: now, by: user });
      fb.splice(0, Math.max(0, fb.length - 20));
      break;
    }
    case "shop_for": {
      const wk = bag("shopFor")[op.week] || (state.shopFor[op.week] = {});
      if (op.shop) wk[op.key] = op.shop; else delete wk[op.key];
      break;
    }
    default: throw new Error("unknown op " + op.op);
  }
  state.rev = (state.rev || 0) + 1;
  return state;
}

// ---------------------------------------------------------------------------
// Sync: optimistic updates, an offline queue, and polling
// ---------------------------------------------------------------------------
let sending = 0;
function applyLocal(op) {
  applyOp(app.state, op, app.user || "you");
  if (app.mode === "demo") store(DEMO_KEY, app.state); else store(CACHE_KEY, app.state);
}
async function send(op, { rerender = true } = {}) {
  applyLocal(op);
  if (rerender) render();
  if (app.mode !== "live") return;
  const queue = load(QUEUE_KEY, []);
  queue.push(op);
  store(QUEUE_KEY, queue);
  flushQueue();
}
async function flushQueue() {
  if (sending) return;
  if (!load(QUEUE_KEY, []).length) return;
  sending++;
  try {
    for (;;) {
      const queue = load(QUEUE_KEY, []); // re-read: new ops may have been queued meanwhile
      if (!queue.length) break;
      const r = await fetch("api/op", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(queue[0]) });
      if (r.status >= 400 && r.status < 500) console.warn("op rejected", queue[0], await r.text());
      else if (!r.ok) throw new Error(r.status);
      else { const res = await r.json(); app.state = res.state; }
      const now = load(QUEUE_KEY, []);
      now.shift();
      store(QUEUE_KEY, now);
    }
    // replay anything still queued locally on top of the server's state
    store(CACHE_KEY, app.state);
    setOffline(false);
  } catch {
    setOffline(true);
  } finally {
    sending--;
  }
}
function setOffline(v) {
  if (app.offline === v) return;
  app.offline = v;
  render();
}
function startPolling() {
  setInterval(async () => {
    if (document.hidden) return;
    if (load(QUEUE_KEY, []).length) return flushQueue();
    if (sending) return;
    try {
      const res = await getJSON(`api/state?rev=${app.state.rev}`);
      setOffline(false);
      if (res.state && !sending) {
        app.state = res.state; store(CACHE_KEY, app.state);
        const typing = document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
        if (!typing && !app.selecting.size) render();
      }
    } catch { setOffline(true); }
  }, 4000);
}
async function getJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

// ---------------------------------------------------------------------------
// Household
// ---------------------------------------------------------------------------
function settings() { return app.state.settings; }
function household() {
  const s = settings();
  const adults = s.people || [];
  const baby = s.baby || {};
  const factor = adults.reduce((t, p) => t + (+p.portion || 0), 0) + (baby.include ? (+baby.portion || 0) : 0);
  return { adults, baby, factor: factor || 1 };
}
function babyInfo() {
  const b = household().baby;
  const ageActual = b.born ? monthsBetween(parseISO(b.born), new Date()) : null;
  const ageCorrected = b.due ? monthsBetween(parseISO(b.due), new Date()) : ageActual;
  let firstBirthday = null;
  if (b.born) { firstBirthday = parseISO(b.born); firstBirthday.setFullYear(firstBirthday.getFullYear() + 1); }
  const months = ageActual ? ageActual.m : 9;
  const saltLimit = months < 12 ? 1 : months < 48 ? 2 : 3; // NHS daily maximums
  return { b, ageActual, ageCorrected, firstBirthday, underOne: months < 12, saltLimit };
}
function babyName() { const b = household().baby; return b.name || "Baby"; }
function prefsFor(id) { return app.state.prefs[id] || {}; }
function family(id) { return app.famById[id] || { id, name: id, plural: id }; }

// ---------------------------------------------------------------------------
// Ingredients, swaps and food rules
// ---------------------------------------------------------------------------
function ingMeta(k) { return app.ing.items[k] || { n: k, a: "other", s: "any" }; }
function resolveIng(k) {
  const m = ingMeta(k), options = m.sw || [];
  const chosen = (app.state.swaps || {})[k];
  let alt = null;
  if (chosen !== undefined) alt = options.find((o) => o.k === chosen) || null;
  else if (settings().budget) alt = options.find((o) => o.budget) || null;
  return alt ? { k: alt.k, r: alt.r, from: k } : { k, r: 1, from: null };
}
function effectiveIngredients(r) {
  return r.ingredients.map((i) => {
    const res = resolveIng(i.k), m = ingMeta(res.k);
    const u = res.from ? (m.pk ? m.pk[1] : (i.u || "")) : (i.u || m.u || "");
    return { ...i, k: res.k, q: i.q == null ? null : i.q * res.r, u, from: res.from, orig: i.k };
  });
}
function avoidList() { return settings().avoid || []; }
function dislikeWords() { return (settings().dislikes || "").toLowerCase().split(/[,\n]/).map((w) => w.trim()).filter(Boolean); }
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
function checkLabelFor(k) { const avoid = avoidList(); return (ingMeta(k).mc || []).filter((a) => avoid.includes(a)).map((a) => app.ing.allergens[a] || a); }
function usable(r) { return !prefsFor(r.id).ban && !blockedBy(r).length; }

// ---------------------------------------------------------------------------
// Shops and prices
// ---------------------------------------------------------------------------
const SHOP_ORDER = ["aldi", "lidl", "tesco", "sainsburys", "asda", "ms", "waitrose"];
function enabledShops() { const on = settings().shops || SHOP_ORDER; return SHOP_ORDER.filter((s) => on.includes(s)); }
function shopOrder() { return [...enabledShops(), "any"]; }
function shopName(id, short = true) { const s = app.ing.shops[id] || app.ing.shops.any; return short ? s.short : s.name; }
function shopMult(s) { return (app.ing.shops[s] || app.ing.shops.any).m || 1; }
function priceShop() { const p = settings().priceShop || "aldi"; return enabledShops().includes(p) ? p : (enabledShops()[0] || "aldi"); }
function inflationFactor() {
  const inf = app.state.inflation || {};
  return settings().inflation !== false && inf.factor ? inf.factor : 1;
}
function basePrice(k) {
  const m = ingMeta(k), own = (app.state.prices || {})[k];
  if (own) {
    const ageDays = (Date.now() / 1000 - own.at) / 86400;
    return { p: own.p / shopMult(own.shop), own, stale: ageDays > 365 };
  }
  return m.p != null ? { p: m.p * inflationFactor() } : null;
}
function costOf(k, q, u, { wholePacks = false, shop = priceShop() } = {}) {
  const m = ingMeta(k), bp = basePrice(k);
  if (!bp || !m.pk || q == null) return null;
  const [pq, pu] = m.pk;
  if ((pu || "") !== (u || "")) return null;
  const packs = wholePacks ? Math.max(1, Math.ceil(q / pq - 0.02)) : q / pq;
  return packs * bp.p * shopMult(shop);
}
function recipeCost(r, shop = priceShop()) {
  let total = 0;
  effectiveIngredients(r).forEach((i) => { if (i.q != null) { const c = costOf(i.k, i.q, i.u, { shop }); if (c != null) total += c; } });
  return total; // per standard portion
}

// ---------------------------------------------------------------------------
// Nutrition (per standard portion, then scaled per person)
// ---------------------------------------------------------------------------
const NUTRIENTS = ["kcal", "protein", "carbs", "sugars", "fat", "saturates", "fibre", "salt"];
function gramsFor(k, q, u) {
  const m = ingMeta(k);
  if (q == null) return m.nq || 0;
  if (u === "g" || u === "ml") return q;
  return m.g ? q * m.g : 0;
}
function nutritionPerPortion(r, { forBaby = false } = {}) {
  const out = Object.fromEntries(NUTRIENTS.map((n) => [n, 0]));
  effectiveIngredients(r).forEach((i) => {
    const m = ingMeta(i.k);
    if (!m.nu) return;
    if (forBaby && (i.k === "salt" || i.k === "chilli" || (m.f || []).includes("salt"))) return;
    const g = gramsFor(i.k, i.q, i.u);
    NUTRIENTS.forEach((n, idx) => { out[n] += (g / 100) * m.nu[idx]; });
  });
  return out;
}
function proteinFor(r, portion) { return Math.round(nutritionPerPortion(r).protein * (+portion || 1)); }

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------
function planFor(week) {
  const p = app.state.plans[week];
  const days = p && Array.isArray(p.days) ? p.days.slice(0, 7) : [];
  while (days.length < 7) days.push(null);
  return days.map((d) => {
    const day = d || { recipe: null, status: "cook", locked: false };
    if (day.status === "out") day.status = "skip"; // older versions
    return day;
  });
}
function themeFor(week, i) { return (settings().themes || {})[String(mondayIndex(addDays(parseISO(week), i)))] || null; }
function previousWeekRecipes(week) { return new Set(planFor(iso(addDays(parseISO(week), -7))).map((d) => d.recipe).filter(Boolean)); }
function maxTimeFor(week, i) {
  const s = settings(), weekend = mondayIndex(addDays(parseISO(week), i)) >= 5;
  return weekend ? (s.weekendMax || 90) : (s.weeknightMax || 40);
}
function pickRecipe(week, i, days, { exclude = new Set(), emergency = false, fam = null } = {}) {
  const recent = previousWeekRecipes(week);
  const others = days.map((d, j) => (j !== i && d.status === "cook" ? d.recipe : null)).filter(Boolean);
  const used = new Set(others);
  const famCount = {};
  others.forEach((id) => { const f = app.byId[id] && app.byId[id].family; if (f) famCount[f] = (famCount[f] || 0) + 1; });
  const neighbours = [days[i - 1], days[i + 1]].map((d) => d && d.recipe && app.byId[d.recipe] && app.byId[d.recipe].family).filter(Boolean);
  const theme = fam || (emergency ? null : themeFor(week, i));
  const themed = new Set(Object.values(settings().themes || {}));
  const maxT = maxTimeFor(week, i);
  const pool = app.recipes.filter((r) => usable(r) && !exclude.has(r.id)
    && (theme ? r.family === theme : (!!r.emergency === emergency)));
  const tiers = [
    (r) => r.time <= maxT && !used.has(r.id) && !recent.has(r.id) && !famCount[r.family] && !neighbours.includes(r.family) && (theme || !themed.has(r.family)),
    (r) => r.time <= maxT && !used.has(r.id) && (famCount[r.family] || 0) < 2 && !neighbours.includes(r.family) && (theme || !themed.has(r.family)),
    (r) => r.time <= maxT && !used.has(r.id),
    (r) => !used.has(r.id),
    () => true,
  ];
  for (const ok of tiers) {
    const options = pool.filter(ok);
    if (!options.length) continue;
    const weights = options.map((r) => (prefsFor(r.id).fav ? 3 : 1));
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let k = 0; k < options.length; k++) { roll -= weights[k]; if (roll <= 0) return options[k].id; }
    return options[options.length - 1].id;
  }
  return null;
}
function suggestWeek(week) {
  const days = planFor(week);
  days.forEach((d) => { if (!d.locked && d.status === "cook") d.recipe = null; });
  days.forEach((d, i) => { if (!d.locked && d.status === "cook") d.recipe = pickRecipe(week, i, days); });
  return { days };
}

// ---------------------------------------------------------------------------
// Quantities
// ---------------------------------------------------------------------------
const FRACTIONS = { 0.25: "¼", 0.5: "½", 0.75: "¾" };
function niceNumber(n) {
  const q = Math.round(n * 4) / 4, whole = Math.floor(q), frac = +(q - whole).toFixed(2);
  if (!frac) return String(whole || (n > 0 ? "¼" : "0"));
  return `${whole || ""}${FRACTIONS[frac] || ""}`;
}
function fmtQty(q, u, { forShopping = false } = {}) {
  if (q == null) return "";
  if (u === "g" || u === "ml") {
    if (q >= 1000) return `${Math.ceil(q / 100) / 10} ${u === "g" ? "kg" : "l"}`;
    return `${Math.max(5, Math.ceil(q / 10) * 10)} ${u}`;
  }
  if (u === "tin") {
    if (!forShopping) return `${niceNumber(q)} tin${q > 1 ? "s" : ""}`;
    const n = Math.ceil(q - 0.05); return `${n} tin${n === 1 ? "" : "s"}`;
  }
  if (u === "tbsp" || u === "tsp") return `${niceNumber(q)} ${u}`;
  if (u === "slices") { const n = Math.ceil(q); return `${n} slice${n === 1 ? "" : "s"}`; }
  return forShopping ? String(Math.ceil(q - 0.05)) : niceNumber(q);
}
function scaleStep(text, factor) { return text.replace(/\{\{(\d+(?:\.\d+)?)\|(\w+)\}\}/g, (_, n, u) => fmtQty(+n * factor, u)); }
function personaliseStep(text) {
  if (!household().baby.include) return text;
  const n = babyName();
  return text.replace(/\b[Tt]he baby's\b/g, `${n}'s`).replace(/\bfor the baby\b/g, `for ${n}`);
}

// ---------------------------------------------------------------------------
// Shopping list
// ---------------------------------------------------------------------------
function catalogueMatch(name) {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  return Object.entries(app.ing.items).find(([, m]) => m.n.toLowerCase() === n || m.n.toLowerCase().startsWith(n + " ") || m.n.toLowerCase().replace(/\s*\(.*\)/, "") === n)?.[0] || null;
}
function effectiveShop(week, key, fallback) {
  return ((app.state.shopFor || {})[week] || {})[key] || (app.state.shopPref || {})[key] || fallback || "any";
}
function buildList(week) {
  const { factor } = household();
  const items = new Map();
  planFor(week).forEach((d) => {
    if (d.status !== "cook" || !d.recipe) return;
    const r = app.byId[d.recipe]; if (!r) return;
    effectiveIngredients(r).forEach((ing) => {
      const m = ingMeta(ing.k), key = "i:" + ing.k;
      if (!items.has(key)) items.set(key, { key, k: ing.k, name: m.n, aisle: m.a, shop: m.s, flags: m.f || [], note: m.note, cupboard: !!m.c, qty: {}, recipes: [], from: new Set(), swappable: new Set() });
      const it = items.get(key);
      if (ing.q != null) it.qty[ing.u] = (it.qty[ing.u] || 0) + ing.q * factor;
      if (!it.recipes.includes(r.name)) it.recipes.push(r.name);
      if (ing.from) it.from.add(ing.from);
      if ((ingMeta(ing.orig).sw || []).length) it.swappable.add(ing.orig);
    });
  });
  // spice rack and cupboard: anything marked low or out goes on the list
  Object.entries(app.state.pantry || {}).forEach(([k, st]) => {
    if ((st === "low" || st === "out") && app.ing.items[k] && !items.has("i:" + k)) {
      const m = ingMeta(k);
      items.set("i:" + k, { key: "i:" + k, k, name: m.n, aisle: m.a, shop: m.s, flags: m.f || [], note: null, cupboard: true, qty: {}, recipes: [], from: new Set(), swappable: new Set() });
    }
  });
  const guessAisle = (name) => { const k = catalogueMatch(name || ""); return k ? ingMeta(k).a : "other"; };
  (settings().staples || []).filter((s) => s.on && (s.name || "").trim()).forEach((s) => {
    items.set("s:" + s.id, { key: "s:" + s.id, k: null, name: s.name.trim(), aisle: s.aisle || guessAisle(s.name), shop: s.shop || "aldi", flags: [], note: s.amount || s.note || null, staple: true, id: s.id, recipes: [],
      unitPrice: s.price != null && s.price !== "" ? +s.price : null, baseQty: +s.qty || 1 });
  });
  (app.state.extras[week] || []).forEach((x) => {
    items.set("x:" + x.id, { key: "x:" + x.id, k: null, name: x.name, aisle: x.aisle || guessAisle(x.name), shop: x.shop || "any", flags: [], note: x.amount || null, extra: true, id: x.id, by: x.by, recipes: [],
      unitPrice: x.price != null && x.price !== "" ? +x.price : null, baseQty: +x.qty || 1 });
  });

  // a staple that matches a recipe ingredient (e.g. Milk) covers it, so it isn't listed twice
  items.forEach((st) => {
    if (!st.staple) return;
    const k = catalogueMatch(st.name);
    const ri = k && items.get("i:" + k);
    if (!ri || ri.cupboard) return;
    const q = Object.entries(ri.qty).map(([u, n]) => fmtQty(n, u, { forShopping: true })).join(" + ");
    st.covers = `${q ? q + " " : ""}for ${ri.recipes.join(", ")}`;
    items.delete("i:" + k);
  });

  const checks = (app.state.checks || {})[week] || {};
  const out = [];
  items.forEach((it) => {
    const c = checks[it.key] || {};
    it.shop = effectiveShop(week, it.key, it.shop);
    it.done = !!c.done; it.have = !!c.have; it.need = !!c.need; it.checkedBy = c.by;
    it.from = [...(it.from || [])].map((k) => ingMeta(k).n);
    it.swappable = [...(it.swappable || [])];
    it.checkLabel = it.k ? checkLabelFor(it.k) : [];
    it.qtyText = Object.entries(it.qty || {}).map(([u, q]) => fmtQty(q, u, { forShopping: true })).join(" + ");
    const costShop = it.shop === "any" ? priceShop() : it.shop;
    if (it.staple || it.extra) {
      it.counted = true;
      it.n = c.n || it.baseQty || 1;
      it.cost = it.unitPrice != null ? it.unitPrice * it.n : null;
      it.qtyText = "";
    } else if (it.k) { const e = Object.entries(it.qty || {}); it.cost = e.length === 1 ? costOf(it.k, e[0][1], e[0][0], { wholePacks: true, shop: costShop }) : null; }
    const bp = it.k ? basePrice(it.k) : null;
    it.stale = !!(bp && bp.stale);
    if (it.cupboard) {
      it.rack = ingMeta(it.k).rack || "cupboard";
      it.pantry = (app.state.pantry || {})[it.k] || null;
      it.qtyText = it.pantry === "out" ? "out" : it.pantry === "low" ? "running low" : "";
      const bp = basePrice(it.k); it.cost = bp ? bp.p * shopMult(costShop) : null;
      it.active = it.pantry === "low" || it.pantry === "out" || it.need || it.done;
    } else it.active = !it.have;
    out.push(it);
  });
  return out;
}
function rackItems() {
  return Object.entries(app.ing.items).filter(([, m]) => m.c).map(([k, m]) => ({ k, ...m, status: (app.state.pantry || {})[k] || null }));
}
function rackUsedThisWeek(week) {
  const used = new Set();
  planFor(week).forEach((d) => { if (d.status === "cook" && d.recipe && app.byId[d.recipe]) effectiveIngredients(app.byId[d.recipe]).forEach((i) => { if (ingMeta(i.k).c) used.add(i.k); }); });
  return used;
}
function feedbackFor(id) { return (app.state.feedback || {})[id] || []; }
function cookedIt(id) { return feedbackFor(id).some((f) => f.rating !== "never"); }
function aisleOrder() { return app.ing.aisles.map((a) => a.id); }
function aisleName(id) { return (app.ing.aisles.find((a) => a.id === id) || { name: "Other" }).name; }

function listAsText(week, { byShop = false } = {}) {
  const items = buildList(week).filter((i) => i.active && (!i.cupboard || i.need));
  const key = byShop ? "shop" : "aisle", order = byShop ? shopOrder() : aisleOrder();
  const total = items.reduce((t, i) => t + (i.cost || 0), 0);
  const lines = [`Shopping list: week of ${niceDate(parseISO(week))} (≈${money(total)})`, ""];
  order.forEach((g) => {
    const group = items.filter((i) => i[key] === g);
    if (!group.length) return;
    lines.push((byShop ? shopName(g, false) : aisleName(g)).toUpperCase());
    group.sort((a, b) => a.name.localeCompare(b.name)).forEach((i) => {
      lines.push(`${i.done ? "☑" : "☐"} ${i.name}${i.qtyText ? ` (${i.qtyText})` : ""}${(i.flags || []).includes("veg") ? " (check V)" : ""}${byShop ? "" : ` [${shopName(i.shop)}]`}`);
    });
    lines.push("");
  });
  return lines.join("\n").trim() + "\n";
}
