// Cooking jobs: turns {{@job ...}} in a recipe's text into the wording for the household's appliances, using the rules
// in data/kitchen.json. Shared by the app and tools/render_recipes.mjs (the recipe checker), so both always agree.
(function (root) {
  const round = (x) => (x < 10 ? Math.ceil(x) : Math.ceil(x / 5) * 5);
  /** "t=15 what=\"the tofu\" turn=halfway more" → { t: "15", what: "the tofu", turn: "halfway", more: true } */
  function parseArgs(s) {
    const out = {}, re = /(\w+)(?:=(?:"([^"]*)"|(\S+)))?/g;
    let m; while ((m = re.exec(s))) out[m[1]] = m[2] ?? m[3] ?? true;
    return out;
  }
  /** "15" or "6-8" scaled → "19" / "8 to 10"; also returns the change in the longest time */
  function scaleTime(t, scale) {
    const parts = String(t).split("-").map(Number), to = parts.map((x) => (scale ? round(x * scale) : x));
    return { text: to.join(" to "), extra: to[to.length - 1] - parts[parts.length - 1] };
  }
  /** The option the household can use for a job, or null. */
  function optionFor(job, have) { return (job.options || []).find((o) => (o.needs || [o.a]).every((a) => have.includes(a))) || null; }

  /**
   * Render one piece of text. use collects what was chosen: use.appliances (Set), use.preheat (Set of sentences),
   * use.extra (longest extra time), use.missing (jobs nothing in the kitchen can do), use.errors (bad markers).
   */
  function renderJobs(text, kitchen, have, use) {
    return String(text || "").replace(/\{\{@(\w+)([^}]*)\}\}/g, (whole, name, argText, offset, str) => {
      const job = kitchen.jobs[name];
      if (!job) { use.errors.push(`unknown job "${name}"`); return whole; }
      const a = parseArgs(argText);
      let o = optionFor(job, have);
      // Nothing in this kitchen can do it: the recipe is hidden from plans and says what it needs, but if someone
      // opens it anyway it still reads properly, written for the first appliance in the rules.
      if (!o) { use.missing.add(name); o = (job.options || [])[0]; if (!o) return ""; }
      const temp = +(a.temp || 200), otemp = temp + (o.hotter || 0);
      let time = "", extra = 0;
      if (a.t != null) { const s = scaleTime(a.t, o.scale); time = s.text; extra = s.extra; }
      extra += o.addTime || 0;
      if (a.in) { use.appliances.add(o.a); return o.in || ""; } // "add it to {{@crisp in}}" → the air fryer / the tray
      const tpl = a.more ? o.more || o.text : o.text;
      let out = tpl.replace(/\{(\w+)\}/g, (_, k) => ({
        what: a.what ? ` ${a.what}` : "", time, temp, otemp,
        turn: a.turn ? (o.turn || {})[a.turn] || "" : "",
        verb: a.verb || "roast",
      })[k] ?? "");
      use.appliances.add(o.a); (o.needs || []).forEach((x) => use.appliances.add(x));
      if (o.preheat) use.preheat.add(o.preheat.replace("{otemp}", otemp).replace("{temp}", temp));
      use.extra = Math.max(use.extra, extra);
      const before = str.slice(0, offset);
      if (/(^|[.!?]\s+)$/.test(before)) out = out.charAt(0).toUpperCase() + out.slice(1); // starts a sentence
      return out;
    });
  }
  function newUse() { return { appliances: new Set(), preheat: new Set(), extra: 0, missing: new Set(), errors: [] }; }

  /** Add any oven preheat to the first "Get ready:" step, unless the recipe already heats the oven. */
  function addPreheat(steps, use) {
    if (!use.preheat.size) return steps;
    const all = steps.map((s) => s.t).join(" ");
    if (/heat the oven/i.test(all)) return steps;
    const say = [...use.preheat].join(" and ");
    return steps.map((s, i) => {
      if (i !== 0) return s;
      const m = /^Get ready:\s*/.exec(s.t);
      if (!m) return { ...s, t: `${say.charAt(0).toUpperCase() + say.slice(1)}. ${s.t}` };
      const rest = s.t.slice(m[0].length);
      return { ...s, t: `${m[0]}${say}. ${rest.charAt(0).toUpperCase() + rest.slice(1)}` };
    });
  }

  root.kitchenRules = { renderJobs, newUse, addPreheat, optionFor, parseArgs };
})(typeof window !== "undefined" ? window : globalThis);
