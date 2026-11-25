// FoodIsHard state operations, shared by the app (browser), the Cloudflare Worker and,
// in Python form, server.py. Every change to a household is one of these small ops.
// Keep server.py apply_op() in step with this file.
const MAX_PEOPLE = 10; // grown-ups and little ones each, per household
// Life is hard (household routines): how many, and how many recent ticks each keeps ("last done" only needs a few)
const MAX_CHORES = 30, CHORE_LOG = 8, CHORE_TIMINGS = ["any", "daily", "ampm", "days", "times"];
/* eslint-disable no-unused-vars */
// Names that would reach JavaScript's shared object machinery if used as keys. Changes come
// from phones, so every key in one is checked before it touches the data.
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype", ...Object.getOwnPropertyNames(Object.prototype)]);
function checkOp(op) {
  const bad = () => { throw new Error("That change doesn't look right"); };
  const key = (k) => { if (k == null) return; if (typeof k !== "string" || !k || k.length > 200 || UNSAFE_KEYS.has(k)) bad(); };
  if (!op || typeof op !== "object" || typeof op.op !== "string") bad();
  if (op.week != null && !/^\d{4}-\d{2}-\d{2}$/.test(op.week)) bad();
  [op.key, op.recipe, op.id].forEach(key);
  if (op.keys != null) { if (!Array.isArray(op.keys) || op.keys.length > 500) bad(); op.keys.forEach(key); }
  if (op.patch != null) { if (typeof op.patch !== "object" || Array.isArray(op.patch)) bad(); Object.keys(op.patch).forEach(key); }
  if (op.op === "day" && !(Number.isInteger(op.i) && op.i >= 0 && op.i < 7)) bad();
  if (op.op === "check" && !["done", "have", "need"].includes(op.field)) bad();
  // sensible sizes for things people type
  const long = (v, n) => v != null && String(v).length > n;
  if (op.op === "extra_add" && (!op.item || typeof op.item !== "object" || long(op.item.name, 120) || long(op.item.amount, 120) || long(op.item.id, 60))) bad();
  if (op.op === "extra_update" && op.patch && long(op.patch.name, 120)) bad();
  // a household cooks for up to 10 grown-ups and 10 little ones (guests on a day cover bigger gatherings)
  // dislikes: ingredient keys picked from the list
  for (const f of ["dislikeKs", "budgetSkip", "kitchenOff"]) { // lists of ingredient keys: dislikes, and budget swaps turned off
    const v = op.op === "settings" && op.patch ? op.patch[f] : null;
    if (v != null && (!Array.isArray(v) || v.length > 200 || v.some((k) => typeof k !== "string" || k.length > 60))) bad();
  }
  if (op.op === "settings" && op.patch && ["people", "children"].some((k) => op.patch[k] != null && (!Array.isArray(op.patch[k]) || op.patch[k].length > MAX_PEOPLE))) bad();
  if (["chore_add", "chore_update"].includes(op.op)) {
    const c = op.op === "chore_add" ? op.item : op.patch;
    if (!c || typeof c !== "object" || Array.isArray(c)) bad();
    if (op.op === "chore_add" && (!String(c.name || "").trim() || typeof c.id !== "string" || long(c.id, 40))) bad();
    if (op.op === "chore_update" && Object.keys(c).some((k) => !["name", "emoji", "timing", "days", "times"].includes(k))) bad();
    if (c.times != null && !(Number.isInteger(c.times) && c.times >= 2 && c.times <= 6)) bad(); // "several times a day": 2 to 6
    if ("name" in c && (!String(c.name || "").trim() || long(c.name, 60))) bad();
    if (c.emoji != null && long(c.emoji, 16)) bad();
    if (c.timing != null && !CHORE_TIMINGS.includes(c.timing)) bad();
    if (c.days != null && (!Array.isArray(c.days) || c.days.length > 7 || c.days.some((d) => !(Number.isInteger(d) && d >= 0 && d < 7)))) bad();
  }
  if (op.op === "chore_done" && (typeof op.key !== "string" || long(op.key, 40) || (op.slot != null && !/^(am|pm|[1-6])$/.test(String(op.slot))))) bad();
  if (op.op === "chore_move" && op.d !== 1 && op.d !== -1) bad();
  // a quick leftover lunch on a day: which template, the leftover it uses up, up to 3 others, for 1 or 2 people
  if (op.op === "day" && op.day && op.day.lunch != null) {
    const l = op.day.lunch;
    if (typeof l !== "object" || Array.isArray(l) || typeof l.t !== "string" || long(l.t, 20) || typeof l.main !== "string" || long(l.main, 40)
      || (l.with != null && (!Array.isArray(l.with) || l.with.length > 3 || l.with.some((k) => typeof k !== "string" || long(k, 40))))
      || (l.n != null && l.n !== 1 && l.n !== 2) || Object.keys(l).some((k) => !["t", "main", "with", "n"].includes(k))) bad();
  }
  if (op.op === "feedback" && (op.tags != null && (!Array.isArray(op.tags) || op.tags.length > 12 || op.tags.some((t) => long(t, 40))))) bad();
}
function applyOp(state, op, user) {
  checkOp(op);
  const now = Math.floor(Date.now() / 1000);
  const bag = (k) => state[k] || (state[k] = {});
  switch (op.op) {
    case "settings": Object.assign(state.settings, op.patch || {}); trimChildren(state.settings); break;
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
    // "Untick all" clears the live list but keeps what's already been bought this week
    case "clear_checks": bag("checks")[op.week] = Object.fromEntries(Object.entries(state.checks[op.week] || {}).filter(([, v]) => v && v.bought)); break;
    // Done shopping: ticked items move to "Bought this week", stamped with the trip's time. undo puts them back.
    case "trip": {
      const week = bag("checks")[op.week] || (state.checks[op.week] = {});
      (op.keys || []).forEach((k) => {
        const item = week[k] || (week[k] = {});
        if (op.undo) { delete item.bought; item.done = false; } else { item.bought = now; item.done = true; }
        item.by = user; item.at = now;
      });
      break;
    }
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
    // Life is hard: household routines with "last done" ticks. op.key on a tick is the phone's own label for it, so Undo
    // removes exactly that tick even if someone else ticked the same thing a moment later.
    case "chore_add": {
      const list = state.chores || (state.chores = []);
      if (list.some((c) => c.id === op.item.id)) break;
      if (list.length >= MAX_CHORES) throw new Error("That's the most routines a household can have");
      list.push({ id: op.item.id, ...choreFields(op.item), log: [] }); break;
    }
    case "chore_update": (state.chores || []).forEach((c) => { if (c.id === op.id) Object.assign(c, choreFields(op.patch, c)); }); break;
    case "chore_remove": state.chores = (state.chores || []).filter((c) => c.id !== op.id); break;
    case "chore_move": {
      const list = state.chores || [], i = list.findIndex((c) => c.id === op.id), j = i + op.d;
      if (i >= 0 && j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
      break;
    }
    case "chore_done": {
      const c = (state.chores || []).find((x) => x.id === op.id);
      if (!c) break;
      c.log = (c.log || []).filter((e) => e.t !== op.key);
      if (!op.undo) c.log.push({ at: now, by: user, t: op.key, ...(op.slot ? { s: op.slot } : {}) }); // s: morning or evening, for those routines
      c.log.splice(0, Math.max(0, c.log.length - CHORE_LOG));
      break;
    }
    default: throw new Error("unknown op " + op.op);
  }
  state.rev = (state.rev || 0) + 1;
  return state;
}

/** A routine's own fields, tidied: name, emoji, timing ("any", "daily", "ampm" = morning and evening, "days" = certain
    weekdays, 0 = Sunday) and days. With "was", only the fields given change. */
function choreFields(src, was = {}) {
  const has = (k) => src[k] !== undefined;
  const timing = has("timing") ? src.timing || "any" : was.timing || "any";
  const days = has("days") ? [...new Set(src.days || [])].sort() : was.days || [];
  return {
    name: has("name") ? String(src.name).trim().slice(0, 60) : was.name,
    emoji: has("emoji") ? String(src.emoji || "").trim().slice(0, 16) : was.emoji || "",
    timing, days: timing === "days" ? days : [],
    ...(timing === "times" ? { times: Math.max(2, Math.min(6, Math.round(+(has("times") ? src.times : was.times) || 3))) } : {}),
  };
}

/* Privacy: little ones are kept with month and year of birth plus weeks early, never exact birth or due dates, however
   the data arrives (an older app, a restored backup). Weeks early is worked out from the old dates when they're there. */
function trimChildren(settings) {
  const day = /^\d{4}-\d{2}-\d{2}/;
  const fix = (c) => {
    if (!c || typeof c !== "object" || !(day.test(c.born || "") || c.due)) return c;
    let early = Number.isFinite(+c.early) && c.early !== "" && c.early != null ? +c.early : 0;
    if (!(c.early != null && c.early !== "") && c.due && day.test(c.born || "")) early = Math.round((Date.parse(c.due) - Date.parse(c.born)) / 6048e5) || 0;
    const out = { ...c, born: String(c.born || "").slice(0, 7), early: Math.max(0, Math.min(20, Math.round(early))) };
    delete out.due;
    return out;
  };
  if (Array.isArray(settings.children)) settings.children = settings.children.map(fix);
  if (settings.baby && (settings.baby.born || settings.baby.due)) {
    if (!Array.isArray(settings.children) || !settings.children.length) settings.children = [fix({ id: "c1", name: settings.baby.name || "", born: settings.baby.born || "", due: settings.baby.due || "", stage: settings.baby.stage || "smooth", portion: settings.baby.portion ?? 0.25, dismissed: settings.baby.dismissed || [] })];
    if (settings.childrenOn == null) settings.childrenOn = !!settings.baby.include;
    settings.baby = null;
  }
  return settings;
}

globalThis.FoodIsHardOps = { applyOp, trimChildren };
