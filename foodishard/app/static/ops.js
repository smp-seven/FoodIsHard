// FoodIsHard state operations, shared by the app (browser), the Cloudflare Worker and,
// in Python form, server.py. Every change to a household is one of these small ops.
// Keep server.py apply_op() in step with this file.
/* eslint-disable no-unused-vars */
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

globalThis.FoodIsHardOps = { applyOp };
