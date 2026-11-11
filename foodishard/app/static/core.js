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
  family: { name: "Family food", hint: "Toddlers and up: the same meal as you, cut to a safe size. Still go easy on salt; no whole nuts under 5." },
};
// Recipes have notes for the first three stages; "family" uses the chopped note.
const STAGE_NOTE = { smooth: "smooth", finger: "finger", chopped: "chopped", family: "chopped" };
// Each child gets a colour, used wherever their portion or notes appear.
const KID_COLOURS = ["#6B5BA8", "#1F7A75", "#B55A1E", "#2F5FA8", "#8A3F7A", "#5B7A1F"];

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
  gear: '<path d="M10.43 5.18L10.50 2.52A9.6 9.6 0 0 1 13.50 2.52L13.57 5.18A7.0 7.0 0 0 1 15.71 6.06L17.64 4.23A9.6 9.6 0 0 1 19.77 6.36L17.94 8.29A7.0 7.0 0 0 1 18.82 10.43L21.48 10.50A9.6 9.6 0 0 1 21.48 13.50L18.82 13.57A7.0 7.0 0 0 1 17.94 15.71L19.77 17.64A9.6 9.6 0 0 1 17.64 19.77L15.71 17.94A7.0 7.0 0 0 1 13.57 18.82L13.50 21.48A9.6 9.6 0 0 1 10.50 21.48L10.43 18.82A7.0 7.0 0 0 1 8.29 17.94L6.36 19.77A9.6 9.6 0 0 1 4.23 17.64L6.06 15.71A7.0 7.0 0 0 1 5.18 13.57L2.52 13.50A9.6 9.6 0 0 1 2.52 10.50L5.18 10.43A7.0 7.0 0 0 1 6.06 8.29L4.23 6.36A9.6 9.6 0 0 1 6.36 4.23L8.29 6.06A7.0 7.0 0 0 1 10.43 5.18Z"/><circle cx="12" cy="12" r="2.6"/>',
  swap: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15m0 5v-5h5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  heart: '<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3.6A5 5 0 0 1 21 11c-2 4.6-9 9-9 9Z"/>',
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.2c2.4.2 4 1.8 4.5 4.3"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
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
  recipes: [], byId: {}, families: [], famById: {}, themes: [], themeById: {},
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
const HOST_KEY = "foodishard-host-v1";

function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } }
function load(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }

// ---------------------------------------------------------------------------
// Operations (keep in step with apply_op in server.py)
// ---------------------------------------------------------------------------
// applyOp() lives in ops.js so the Cloudflare Worker can share it.

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
      const r = await appFetch("api/op", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(queue[0]) });
      if (r.status === 403 && app.host === "Cloudflare") throw new SignedOutError("not in a household"); // keep the queue
      if (r.status >= 400 && r.status < 500) {
        // Rejected (e.g. this phone is running an old copy of the app): say so rather than quietly undo it.
        const why = await r.text(); console.warn("op rejected", queue[0], why);
        let msg = ""; try { msg = JSON.parse(why).error || ""; } catch { /* not json */ }
        if (typeof toast === "function") toast(`Couldn't save that change${msg ? `: ${msg}` : ""}. Try updating the app (Settings).`);
      }
      else if (!r.ok) throw new Error(r.status);
      else { const res = await r.json(); app.state = res.state; }
      const now = load(QUEUE_KEY, []);
      now.shift();
      store(QUEUE_KEY, now);
    }
    // replay anything still queued locally on top of the server's state
    store(CACHE_KEY, app.state);
    setOffline(false); setSignedOut(false);
  } catch (err) {
    if (!(err instanceof SignedOutError)) setOffline(true);
  } finally {
    sending--;
  }
}
function setOffline(v) {
  if (app.offline === v) return;
  app.offline = v;
  render();
}
let pollTimer = null;
function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (document.hidden) return;
    if (load(QUEUE_KEY, []).length) return flushQueue();
    if (sending) return;
    try {
      const res = await getJSON(`api/state?rev=${app.state.rev}`);
      setOffline(false);
      if (res.poll && res.poll * 1000 !== app.pollMs) { app.pollMs = res.poll * 1000; startPolling(); return; }
      if (res.state && !sending) {
        app.state = res.state; store(CACHE_KEY, app.state);
        const typing = document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
        if (!typing && !app.selecting.size) render();
      }
    } catch (err) { if (!(err instanceof SignedOutError)) setOffline(true); }
  }, app.pollMs || 4000);
}
/** Thrown when the online version's sign-in has expired (Cloudflare Access redirects to its login page). */
class SignedOutError extends Error {}
/** fetch() for the app's own files and API. Notices an expired sign-in instead of mistaking it for no signal. */
async function appFetch(url, opts = {}) {
  const r = await fetch(url, { cache: "no-store", redirect: "manual", ...opts });
  if (r.type === "opaqueredirect" || r.status === 401) { setSignedOut(true); throw new SignedOutError("signed out"); }
  return r;
}
async function getJSON(url) {
  const r = await appFetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  if (url.startsWith("api/")) setSignedOut(false);
  return r.json();
}
function setSignedOut(v) {
  if (app.signedOut === v) return;
  app.signedOut = v;
  const b = typeof document !== "undefined" && document.getElementById("banner");
  if (!b) return;
  if (v) {
    if (app.offline) setOffline(false);
    b.innerHTML = `Your sign-in has expired. Your changes are saved on this phone. <button class="btn sm" style="margin-left:8px" data-act="signInAgain">Sign in again</button>`;
    b.classList.add("signed-out"); b.hidden = false;
  } else if (b.classList.contains("signed-out")) {
    b.classList.remove("signed-out"); b.hidden = true; b.innerHTML = "";
  }
}

// ---------------------------------------------------------------------------
// Household
// ---------------------------------------------------------------------------
function settings() { return app.state.settings; }
// ---- Little ones ---------------------------------------------------------------
// settings.children = [{ id, name, born, due, stage, portion, dismissed }], settings.childrenOn.
// Older versions had a single settings.baby; it's read as the first child until saved again.
function kidsAll() {
  const s = settings();
  if (Array.isArray(s.children) && s.children.length) return s.children;
  const b = s.baby || {};
  return b.include || b.born ? [{ id: "c1", name: b.name || "Baby", born: b.born || "", due: b.due || "", stage: b.stage || "smooth", portion: b.portion ?? 0.25, dismissed: b.dismissed || [] }] : [];
}
function kidsOn() { const s = settings(); return s.childrenOn ?? !!(s.baby && s.baby.include); }
function kids() { return kidsOn() ? kidsAll() : []; }
function kidColour(c) { const i = Math.max(0, kidsAll().findIndex((k) => k.id === c.id)); return KID_COLOURS[i % KID_COLOURS.length]; }
function kidStyle(c) { return `--kid:${kidColour(c)}`; }
function saveKids(list, on = kidsOn()) { return send({ op: "settings", patch: { children: list, childrenOn: on } }); }
function updateKid(id, patch) { saveKids(kidsAll().map((k) => (k.id === id ? { ...k, ...patch } : k))); }
function joinNames(names) { return names.length <= 1 ? (names[0] || "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`; }
function kidNames(list = kids()) { return joinNames(list.map((k) => k.name || "Baby")); }

function household() {
  const s = settings();
  const adults = s.people || [];
  const little = kids();
  const factor = adults.reduce((t, p) => t + (+p.portion || 0), 0) + little.reduce((t, k) => t + (+k.portion || 0), 0);
  return { adults, kids: little, factor: factor || 1 };
}
function kidInfo(c) {
  const ageActual = c.born ? monthsBetween(parseISO(c.born), new Date()) : null;
  const ageCorrected = c.due ? monthsBetween(parseISO(c.due), new Date()) : ageActual;
  let firstBirthday = null;
  if (c.born) { firstBirthday = parseISO(c.born); firstBirthday.setFullYear(firstBirthday.getFullYear() + 1); }
  const months = ageActual ? ageActual.m : 9;
  const saltLimit = months < 12 ? 1 : months < 48 ? 2 : 3; // NHS daily maximums
  return { ageActual, ageCorrected, firstBirthday, underOne: months < 12, saltLimit };
}
// Gentle, dismissible suggestions as the baby grows. They never change anything by
// themselves: babies vary, and portions should follow their appetite. Ages use the
// corrected age when a due date is given (premature babies), otherwise the real age.
// These are rough general guides, not professional advice.
const BABY_STAGE_FROM = [["smooth", 0], ["finger", 7], ["chopped", 10], ["family", 24]]; // months
const BABY_PORTION_FROM = [[6, 0.2], [9, 0.25], [12, 0.33], [24, 0.4], [48, 0.5]]; // months, share of an adult portion
const PORTION_WORDS = { 0.2: "a fifth", 0.25: "a quarter", 0.33: "a third", 0.4: "two-fifths", 0.5: "half" };
function kidSuggestions(c) {
  if (!c.born) return [];
  const info = kidInfo(c), age = info.ageCorrected || info.ageActual;
  if (!age || age.m < 0) return [];
  const name = c.name || "Baby", m = age.m, corrected = c.due && c.due !== c.born;
  const ageWords = `${ageText(corrected ? c.due : c.born)}${corrected ? " (corrected)" : ""}`;
  const out = [];
  if (m < 6) out.push({ key: "start", info: true, text: `${name} is ${ageWords}. Most babies start solid food at around 6 months${corrected ? "; for babies born early, ask your health visitor when to start" : ""}. Their portions are here for when you're ready.` });
  const order = BABY_STAGE_FROM.map(([k]) => k);
  const due = BABY_STAGE_FROM.filter(([, from]) => m >= from).pop()[0];
  if (order.indexOf(due) > order.indexOf(c.stage || "smooth")) {
    const why = { finger: "Many babies are ready for soft lumps and finger foods from about 7 months.",
      chopped: "Many babies move on to chopped family food from about 10 to 12 months.",
      family: "Many toddlers eat the same family meals from about 2 years, cut to a safe size." }[due];
    out.push({ key: `stage:${due}`, set: { stage: due }, text: `${name} is ${ageWords}. ${why} Switch ${name}'s notes to "${STAGES[due].name}"?` });
  }
  const band = BABY_PORTION_FROM.filter(([from]) => m >= from).pop();
  if (band && band[1] > (+c.portion || 0) + 0.02) {
    out.push({ key: `portion:${band[1]}`, set: { portion: band[1] },
      text: `As a very rough guide, many ${m >= 12 ? "children" : "babies"} of ${name}'s age eat about ${PORTION_WORDS[band[1]]} of an adult portion (it's set to ${(+c.portion || 0).toFixed(2)} now). Go by their appetite. Make it ${PORTION_WORDS[band[1]]}?` });
  }
  return out.filter((x) => !(c.dismissed || []).includes(x.key)).map((x) => ({ ...x, kid: c.id, name }));
}
function babySuggestions() { return kids().flatMap(kidSuggestions); }

function babyName() { return kidNames(); }
function prefsFor(id) { return app.state.prefs[id] || {}; }
function family(id) { return app.famById[id] || { id, name: id, plural: id }; }

// ---------------------------------------------------------------------------
// Ingredients, swaps and food rules
// ---------------------------------------------------------------------------
function ingMeta(k) { return app.ing.items[k] || { n: k, a: "other", s: "any" }; }
/** Is this ingredient what the dish is named after? ("Paneer & pea curry" -> paneer, peas) */
function isHeadline(k, r) {
  if (!r) return false;
  const name = r.name.toLowerCase();
  return ingMeta(k).n.toLowerCase().split(" (")[0].split(/[^a-z]+/).some((w) => w.length > 3 && name.includes(w.replace(/e?s$/, "")));
}
/** The ingredient actually used: a swap chosen for this recipe, then one chosen everywhere,
 *  then budget mode (like-for-like swaps only, never the ingredient the dish is named after). */
function resolveIng(k, r = null) {
  const m = ingMeta(k), options = m.sw || [], swaps = app.state.swaps || {};
  const local = r ? swaps[`${r.id}:${k}`] : undefined, global = swaps[k];
  const chosen = local !== undefined ? local : global;
  let alt = null;
  if (chosen !== undefined) alt = options.find((o) => o.k === chosen) || null;
  else if (settings().budget && !isHeadline(k, r)) {
    const avoid = avoidList(), clashes = (o) => [...(ingMeta(o.k).al || []), ...(ingMeta(o.k).mc || [])].some((a) => avoid.includes(a));
    alt = options.find((o) => o.auto && !clashes(o)) || null; // never swap in something the household avoids
  }
  return alt ? { k: alt.k, r: alt.r, from: k, local: local !== undefined } : { k, r: 1, from: null };
}
/** Swaps that change what the dish is (shown on the week card), e.g. "with firm tofu". */
function headlineSwaps(r) {
  return effectiveIngredients(r).filter((i) => i.from && isHeadline(i.from, r)).map((i) => ingMeta(i.k).n.split(" (")[0].toLowerCase());
}
function effectiveIngredients(r) {
  return r.ingredients.map((i) => {
    const res = resolveIng(i.k, r), m = ingMeta(res.k);
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
/** Whole packs to buy. A little over (up to 15%, and never more than 0.3 of a pack) doesn't buy another one. */
const PACK_SLACK = 0.15, PACK_SLACK_MAX = 0.3;
function packsFor(q, pq) {
  const n = q / pq;
  return Math.max(1, Math.ceil(n / (1 + PACK_SLACK) - 1e-9), Math.ceil(n - PACK_SLACK_MAX - 1e-9));
}
function costOf(k, q, u, { wholePacks = false, shop = priceShop() } = {}) {
  const m = ingMeta(k), bp = basePrice(k);
  if (!bp || !m.pk || q == null) return null;
  const [pq, pu] = m.pk;
  if ((pu || "") !== (u || "")) return null;
  const packs = wholePacks ? packsFor(q, pq) : q / pq;
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
function kcalFor(r, portion) { return Math.round(nutritionPerPortion(r).kcal * (+portion || 1)); }

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
// Theme nights. Settings store a theme id per weekday (0 = Monday). Older versions stored a
// family id, which is why "eggs" is mapped to brunch.
const THEME_ALIASES = { eggs: "brunch" };
function themeById(id) { return id ? app.themeById[THEME_ALIASES[id] || id] || null : null; }
function themeIdForDow(dow) { const t = themeById((settings().themes || {})[String(dow)]); return t ? t.id : null; }
function themeFor(week, i) { return themeById(themeIdForDow(mondayIndex(addDays(parseISO(week), i)))); }
function everCooked(id) {
  if (cookedIt(id)) return true;
  const thisWeek = app.weekStart || iso(new Date());
  return Object.entries(app.state.plans || {}).some(([wk, p]) => wk < thisWeek && (p.days || []).some((d) => d && d.recipe === id && d.status === "cook"));
}
/** Does recipe r fit theme t? Category rules (families, tags, cuisines) are OR'd; limits are AND'd. */
function themeMatch(t, r) {
  if (!t || !r) return false;
  const m = t.match || {};
  if (r.emergency && !m.emergency) return false;
  const cats = [...(m.families || []), ...(m.tags || []), ...(m.cuisines || [])];
  if (cats.length && !((m.families || []).includes(r.family) || (m.tags || []).some((x) => (r.tags || []).includes(x)) || (m.cuisines || []).includes(r.cuisine))) return false;
  if (m.maxTime && r.time > m.maxTime) return false;
  if (m.maxCost && recipeCost(r) > m.maxCost) return false;
  if (m.minProtein && nutritionPerPortion(r).protein < m.minProtein) return false;
  if (m.fav && !prefsFor(r.id).fav) return false;
  if (m.uncooked && everCooked(r.id)) return false;
  return true;
}
function themeRecipes(t) { return app.recipes.filter((r) => usable(r) && themeMatch(t, r)); }
/** Themes set on other days that "reserve" their recipes, so a curry night isn't undercut by a curry on Tuesday. */
function reservedThemes() { return Object.values(settings().themes || {}).map(themeById).filter((t) => t && t.reserve); }
function previousWeekRecipes(week, weeks = 1) {
  const out = new Set();
  for (let w = 1; w <= weeks; w++) planFor(iso(addDays(parseISO(week), -7 * w))).forEach((d) => { if (d.recipe) out.add(d.recipe); });
  return out;
}
/** How likely the planner is to pick a recipe: favourites and meals you loved come up more, "not again" hardly ever. */
function recipeWeight(id) {
  const last = feedbackFor(id).slice(-1)[0];
  return (prefsFor(id).fav ? 3 : 1) * (last && last.rating === "loved" ? 2 : last && last.rating === "never" ? 0.1 : 1);
}
function maxTimeFor(week, i) {
  const s = settings(), weekend = mondayIndex(addDays(parseISO(week), i)) >= 5;
  return weekend ? (s.weekendMax || 90) : (s.weeknightMax || 40);
}
function pickRecipe(week, i, days, { exclude = new Set(), emergency = false, fam = null } = {}) {
  const recent = previousWeekRecipes(week), recent3 = previousWeekRecipes(week, 3); // try to avoid the last 3 weeks, at least the last 1
  const waste = { days, i, base: wasteOf(days.map((d, j) => (j === i ? { ...d, recipe: null } : d))) }; // part-packs without this day
  const others = days.map((d, j) => (j !== i && d.status === "cook" ? d.recipe : null)).filter(Boolean);
  const used = new Set(others);
  const famCount = {};
  others.forEach((id) => { const f = app.byId[id] && app.byId[id].family; if (f) famCount[f] = (famCount[f] || 0) + 1; });
  const neighbours = [days[i - 1], days[i + 1]].map((d) => d && d.recipe && app.byId[d.recipe] && app.byId[d.recipe].family).filter(Boolean);
  const theme = fam || emergency ? null : themeFor(week, i);
  const reserved = theme ? [] : reservedThemes();
  const free = (r) => !reserved.some((t) => themeMatch(t, r));
  const maxT = maxTimeFor(week, i);
  const base = app.recipes.filter((r) => usable(r) && !exclude.has(r.id));
  let pool = fam ? base.filter((r) => r.family === fam && !!r.emergency === emergency)
    : theme ? base.filter((r) => themeMatch(theme, r))
    : base.filter((r) => !!r.emergency === emergency);
  if (!pool.length && fam) pool = base.filter((r) => r.family === fam);
  if (!pool.length && theme) pool = base.filter((r) => !r.emergency); // nothing fits the theme any more
  const tiers = [
    (r) => r.time <= maxT && !used.has(r.id) && !recent3.has(r.id) && !famCount[r.family] && !neighbours.includes(r.family) && free(r),
    (r) => r.time <= maxT && !used.has(r.id) && !recent.has(r.id) && !famCount[r.family] && !neighbours.includes(r.family) && free(r),
    (r) => r.time <= maxT && !used.has(r.id) && (famCount[r.family] || 0) < 2 && !neighbours.includes(r.family) && free(r),
    (r) => r.time <= maxT && !used.has(r.id) && !recent.has(r.id),
    (r) => r.time <= maxT && !used.has(r.id),
    (r) => !used.has(r.id),
    () => true,
  ];
  for (const ok of tiers) {
    const options = pool.filter(ok);
    if (!options.length) continue;
    const weights = options.map((r) => recipeWeight(r.id) * useUpBonus(r, waste));
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
    const n = packsFor(q, 1); return `${n} tin${n === 1 ? "" : "s"}`;
  }
  if (u === "tbsp" || u === "tsp") return `${niceNumber(q)} ${u}`;
  if (u === "slices") { const n = Math.ceil(q); return `${n} slice${n === 1 ? "" : "s"}`; }
  return forShopping ? String(Math.max(1, Math.ceil(q - 1e-9))) : niceNumber(q); // eggs, wraps, buns: buy every one
}
// ---- Which ingredients a step mentions (for cooking mode) ----
const GENERIC_WORDS = new Set(["sauce", "cube", "paste", "leave", "pouch", "piece", "stick", "relish", "flake", "wrap"]);
const STEP_ALIASES = {
  soy_sauce: ["soy sauce", "soy"], sweet_chilli: ["sweet chilli sauce", "sweet chilli"], chilli: ["chilli flakes", "chilli"],
  hendersons: ["henderson's"], stock: ["stock cube", "stock"], sourdough: ["sourdough", "bread"], salad_leaves: ["salad"],
  rice_pouch: ["rice pouch", "rice"], tortillas: ["tortilla", "wrap"], hard_cheese: ["cheese"], cheddar: ["cheddar", "cheese"],
  greek_yoghurt: ["yoghurt"], natural_yoghurt: ["yoghurt"], quorn_pieces: ["quorn"], pepper: ["black pepper", "salt and pepper", "salt, pepper"], oil: ["oil"],
  ground_coriander: ["ground coriander"], ground_ginger: ["ground ginger"], chapati: ["chapati"], frozen_spinach: ["spinach"],
  filo: ["filo"], mixed_veg: ["frozen veg", "veg"],
};
const singular = (w) => w.replace(/(oes|ches|shes|xes)$/, (m) => m.slice(0, -2)).replace(/s$/, "");
function stepTerms(k) {
  if (STEP_ALIASES[k]) return STEP_ALIASES[k];
  const base = ingMeta(k).n.toLowerCase().split(/\s*[(/]/)[0].replace(/^(frozen|fresh|dried|plain|mature|pitted|smooth|reduced-salt|low-salt|wholewheat|sliced|crusty|firm|microwave)\s+/, "").trim();
  const words = base.split(/\s+/), head = singular(words[words.length - 1]);
  const terms = [singular(base)];
  if (words.length > 1 && head.length >= 3 && !GENERIC_WORDS.has(head)) terms.push(head);
  return terms;
}
/** The recipe's ingredients that a step's text names. The longest, most specific name wins ("black pepper" over "pepper"). */
function stepIngredients(text, ings, before = "") {
  const low = text.toLowerCase(), earlier = before.toLowerCase(), taken = [], found = [], share = {}; // taken: [start, end, term]
  const termsOf = ings.map((i) => stepTerms(i.orig || i.k));
  const primary = new Map(termsOf.map((ts, idx) => [ts[0], idx])); // each ingredient's own full name
  const cands = termsOf.flatMap((ts, idx) => ts.map((t, n) => ({ t, idx, n }))).sort((a, b) => b.t.length - a.t.length);
  for (const { t, idx, n } of cands) {
    if (n > 0 && primary.has(t) && primary.get(t) !== idx) continue; // "onion" means the onions, not the spring onions
    const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:e?s)?\\b`, "g");
    let m;
    while ((m = re.exec(low))) {
      const a = m.index, b = a + m[0].length;
      const clash = taken.find(([x, y]) => a < y && b > x);
      if (clash && !(clash[0] === a && clash[2] === t)) continue; // "the beans" can mean both kinds of bean
      if (!clash) taken.push([a, b, t]);
      if (!found.includes(idx)) found.push(idx);
      const lead = low.slice(Math.max(0, a - 20), a);
      if (/\bhalf (?:of )?the $/.test(lead)) share[idx] = "half"; // "half the oil"
      else if (/\brest of the $/.test(lead) && !share[idx]) // the rest is half only if an earlier step used half; otherwise it's most of it
        share[idx] = termsOf[idx].some((t2) => new RegExp(`\\bhalf (?:of )?the ${t2}`).test(earlier)) ? "half" : "the rest";
    }
  }
  return found.sort((a, b) => a - b).map((idx) => (share[idx] === "half" ? { ...ings[idx], q: ings[idx].q == null ? null : ings[idx].q * 0.5, part: "half" }
    : share[idx] ? { ...ings[idx], part: share[idx] } : ings[idx]));
}
function scaleStep(text, factor) { return text.replace(/\{\{(\d+(?:\.\d+)?)\|(\w+)\}\}/g, (_, n, u) => fmtQty(+n * factor, u)); }
/** Shopping notes that mention "the baby": named for your children, or dropped if you have none. */
function kidNote(note) {
  if (!note || !/\bbaby\b/i.test(note)) return note || null;
  if (kids().length) return personaliseStep(note);
  const plain = note.replace(/,?\s*or a baby stock cube/i, "");
  return /\bbaby\b/i.test(plain) ? null : plain;
}
function personaliseStep(text) {
  const little = kids();
  // [[...]] is baby-only text inside a normal step, e.g. "(keep a spoonful back for the baby)"
  text = text.replace(/\[\[(.*?)\]\]/g, little.length ? "$1" : "");
  if (!little.length) return text;
  const n = kidNames(little), many = little.length > 1;
  return text
    .replace(/\b[Tt]he baby's portion\b/g, many ? `${n}'s portions` : `${n}'s portion`)
    .replace(/\b[Tt]he baby's share\b/g, many ? `${n}'s shares` : `${n}'s share`)
    .replace(/\b[Tt]he baby's\b/g, `${n}'s`)
    .replace(/\bfor the baby\b/g, `for ${n}`)
    .replace(/\bthe baby\b/g, many ? "the little ones" : n);
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
/** Portions for one day: the household, plus guests or minus anyone out, doubled when cooking double. */
function personKey(p, i) { return p.id || `p${i}`; }
/** Who's eating on a day: everyone, minus anyone ticked out, plus guests (in regular portions). */
function dayFactor(day) {
  const { adults, kids: little } = household(), away = new Set((day && day.away) || []);
  let f = adults.reduce((t, p, i) => t + (away.has(personKey(p, i)) ? 0 : +p.portion || 0), 0) + little.reduce((t, k) => t + (away.has(k.id) ? 0 : +k.portion || 0), 0);
  f += +(day && (day.guests != null ? day.guests : day.extra)) || 0; // "extra" was the older +/- adults
  f = Math.max(0.5, f);
  return day && day.double ? f * 2 : f;
}
/** Portions to cook a recipe for: tonight's adjustments if it's tonight's dinner, otherwise the household's. */
function factorFor(id) {
  const { week, i } = todaySlot(), d = planFor(week)[i];
  return d && d.status === "cook" && d.recipe === id ? dayFactor(d) : household().factor;
}
/** Where today sits in the plan. */
function todaySlot() { return { week: currentWeek(), i: (mondayIndex(new Date()) - (settings().weekStartDay || 0) + 7) % 7 }; }
function buildList(week) {
  const items = new Map();
  planFor(week).forEach((d) => {
    if (d.status !== "cook" || !d.recipe) return;
    const factor = dayFactor(d);
    const r = app.byId[d.recipe]; if (!r) return;
    effectiveIngredients(r).forEach((ing) => {
      const m = ingMeta(ing.k), key = "i:" + ing.k;
      if (!items.has(key)) items.set(key, { key, k: ing.k, name: m.n, aisle: m.a, shop: m.s, flags: m.f || [], note: kidNote(m.note), cupboard: !!m.c, qty: {}, recipes: [], from: new Set(), swappable: new Set() });
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
    it.bought = c.bought || null; // when "Done shopping" filed it under Bought this week
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
    } else if (it.k) {
      const e = Object.entries(it.qty || {});
      it.cost = e.length === 1 ? costOf(it.k, e[0][1], e[0][0], { wholePacks: true, shop: costShop }) : null;
      if (e.length === 1) it.leftover = leftoverText(it.k, e[0][1], e[0][0]);
    }
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
/** What's left of the packs you buy, for things that go off ("¾ left over", "about 130 g left over"). */
// Only things that go off within days once bought or opened: a note on every line would just be ignored.
const GOES_OFF = new Set(["spinach", "red_pepper", "courgette", "broccoli", "mushrooms", "cherry_tomatoes", "coriander", "cauliflower",
  "spring_onion", "cucumber", "salad_leaves", "white_cabbage", "beansprouts", "avocado", "celery", "ricotta", "cottage_cheese",
  "mozzarella", "feta", "tofu", "paneer", "halloumi", "gnocchi", "hummus", "chopped_tomatoes", "black_beans", "kidney_beans",
  "chickpeas", "green_lentils", "baked_beans", "passata", "cannellini"]);
/** Perishables the other planned days will leave part-packs of: Map ingredient → share of a pack left over. */
function partPacks(days, except = -1) {
  const need = new Map();
  days.forEach((d, j) => {
    if (j === except || d.status !== "cook" || !d.recipe || !app.byId[d.recipe]) return;
    const f = dayFactor(d);
    effectiveIngredients(app.byId[d.recipe]).forEach((i) => {
      const m = ingMeta(i.k);
      if (i.q == null || !GOES_OFF.has(i.k) || !m.pk || (m.pk[1] || "") !== (i.u || "")) return;
      need.set(i.k, (need.get(i.k) || 0) + i.q * f);
    });
  });
  const out = new Map();
  need.forEach((q, k) => {
    const pq = ingMeta(k).pk[0], packs = packsFor(q, pq), left = (packs * pq - q) / pq;
    if (left >= 0.25) out.set(k, left);
  });
  return out;
}
const wasteOf = (days) => [...partPacks(days).values()].reduce((a, b) => a + b, 0);
/** How much the planner favours a recipe for this day by what it does to the week's part-packs:
 *  using up half a cauliflower scores well, opening a new tub of ricotta for 50 g scores badly. */
function useUpBonus(r, ctx) {
  if (!ctx) return 1;
  const days = ctx.days.map((d, j) => (j === ctx.i ? { ...d, status: "cook", recipe: r.id } : d));
  const change = wasteOf(days) - ctx.base;
  return change <= -0.25 ? 4 : change <= 0.15 ? 2 : change >= 0.6 ? 0.5 : 1;
}
function leftoverText(k, q, u) {
  const m = ingMeta(k);
  if (!m.pk || !GOES_OFF.has(k)) return null;
  const [pq, pu] = m.pk;
  if ((pu || "") !== (u || "") || !(q > 0)) return null;
  const packs = packsFor(q, pq), left = packs * pq - q;
  if (left / pq < 0.25) return null; // near enough the whole pack
  if (u === "g" || u === "ml") return `about ${fmtQty(Math.floor(left / 10) * 10 || left, u)} left over`;
  if (u === "tin") return `${niceNumber(left)} tin left over`;
  if (u === "slices") return `${Math.floor(left)} slices left over`;
  if (pq === 1) return `${niceNumber(left)} left over`;
  return Math.floor(left) >= 1 ? `${Math.floor(left)} left over` : null;
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
/** Aisles in the household's own order (Settings), with any new aisles added where they normally go. */
function aisleOrder() {
  const all = app.ing.aisles.map((a) => a.id), mine = (settings().aisleOrder || []).filter((id) => all.includes(id));
  all.forEach((id, n) => { if (!mine.includes(id)) mine.splice(Math.min(n, mine.length), 0, id); });
  return mine;
}
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
