// FoodIsHard state operations, shared by the app (browser), the Cloudflare Worker and,
// in Python form, server.py. Every change to a household is one of these small ops.
// Keep server.py apply_op() in step with this file.
/* eslint-disable no-unused-vars */
// Names that would reach JavaScript's shared object machinery if used as keys. Changes come
// from phones, so every key in one is checked before it touches the data.
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
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
}
function applyOp(state, op, user) {
  checkOp(op);
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
    default: throw new Error("unknown op " + op.op);
  }
  state.rev = (state.rev || 0) + 1;
  return state;
}

globalThis.FoodIsHardOps = { applyOp };
