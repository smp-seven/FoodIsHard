// Writes out every recipe as a household would see it, for every combination of kitchen (appliances) and milk.
// Uses the app's own kitchen.js, so the checker sees exactly what the app shows.
// Usage: node tools/render_recipes.mjs [out.json]   (prints JSON to stdout if no file is given)
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const here = path.dirname(new URL(import.meta.url).pathname), app = path.join(here, "..", "foodishard", "app");
vm.runInThisContext(fs.readFileSync(path.join(app, "static", "kitchen.js"), "utf8"));
const { renderJobs, newUse, addPreheat } = globalThis.kitchenRules;
const kitchen = JSON.parse(fs.readFileSync(path.join(app, "data", "kitchen.json"), "utf8"));
const recipes = JSON.parse(fs.readFileSync(path.join(app, "data", "recipes.json"), "utf8")).recipes;

const choosable = kitchen.appliances.filter((a) => !a.always).map((a) => a.id);
const always = kitchen.appliances.filter((a) => a.always).map((a) => a.id);
const condName = (id) => "no" + id.charAt(0).toUpperCase() + id.slice(1);
function pick(variants, on, base) { // same rule as the app's pickVersion
  let best = base, size = 0;
  for (const [key, text] of Object.entries(variants || {})) {
    const c = key.split("+");
    if (c.length > size && c.every((x) => on.includes(x))) { best = text; size = c.length; }
  }
  return best;
}
const out = [];
for (let mask = 0; mask < 1 << choosable.length; mask++) {
  const have = [...always, ...choosable.filter((_, i) => !(mask & (1 << i)))];
  for (const milk of [false, true]) {
    const on = [...(milk ? ["noMilk"] : []), ...choosable.filter((a) => !have.includes(a)).map(condName)].sort();
    for (const r of recipes) {
      const use = newUse(), job = (t) => renderJobs(t, kitchen, have, use), top = pick(r.if, on, {});
      let steps = r.steps.map((s) => ({ t: job(pick(s.if, on, s.t)), baby: !!s.baby })).filter((s) => s.t.trim());
      steps = addPreheat(steps, use);
      const baby = Object.fromEntries(Object.entries(r.baby || {}).map(([k, v]) => [k, job(pick((r.babyIf || {})[k], on, v))]));
      const text = steps.map((s) => s.t).join(" ");
      const needs = [...use.missing];
      if (/\boven\b(?! glove)/i.test(text) && !have.includes("oven")) needs.push("oven");
      out.push({ id: r.id, on, have, name: top.name || r.name, blurb: top.blurb || r.blurb, time: (top.time || r.time) + use.extra,
        steps, baby, needs, errors: use.errors });
    }
  }
}
const json = JSON.stringify(out);
if (process.argv[2]) fs.writeFileSync(process.argv[2], json); else process.stdout.write(json);
