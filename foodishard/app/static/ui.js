/* FoodIsHard UI: screens, sheets, cooking mode and events. Depends on core.js. */
"use strict";

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function boot() {
  hydrateIcons(document);
  const [rec, ing, defaults, lunches] = await Promise.all([getJSON("data/recipes.json"), getJSON("data/ingredients.json"), getJSON("data/defaults.json"), getJSON("data/lunches.json").catch(() => null)]);
  app.lunchData = lunches || { use: {}, lunches: [], keepDays: 3 }; // quick leftover lunches (templates)
  app.defaults = defaults; // a fresh household's starting point (also used by "See it as a new household")
  app.recipes = rec.recipes; app.byId = Object.fromEntries(app.recipes.map((r) => [r.id, r]));
  app.families = rec.families; app.famById = Object.fromEntries(app.families.map((f) => [f.id, f]));
  app.themes = rec.themes || []; app.themeById = Object.fromEntries(app.themes.map((t) => [t.id, t]));
  app.ing = ing;

  try {
    const res = await getJSON("api/state");
    if (res.adminOnly) return bootAdmin(res);
    if (!res.state) throw new Error("no state");
    app.mode = "live"; app.state = res.state; app.termsNeeded = res.termsNeeded || null; app.staging = !!res.staging; app.user = res.user || ""; app.host = res.host || "Home Assistant"; app.region = res.region || null; app.pollMs = (res.poll || 4) * 1000;
    store(CACHE_KEY, app.state); store(HOST_KEY, { host: app.host, user: app.user, poll: app.pollMs, termsNeeded: app.termsNeeded });
  } catch (err) {
    const cached = load(CACHE_KEY, null), seenHost = load(HOST_KEY, {});
    if (!cached && seenHost.adminOnly) {
      $("#view").innerHTML = `<div class="empty" style="margin-top:20vh">${err instanceof SignedOutError ? "Your sign-in has expired." : "The admin dashboard needs a connection."}<br><br><button class="btn primary" data-act="signInAgain">Try again</button></div>`;
      document.body.classList.add("admin-only"); document.addEventListener("click", onClick);
      return;
    }
    if (cached && location.protocol !== "file:" && !/claude|artifact/.test(location.hostname)) {
      // opened with no signal (or an expired sign-in): use this phone's copy
      const seen = load(HOST_KEY, {});
      app.mode = "live"; app.state = cached; app.offline = !(err instanceof SignedOutError);
      app.host = seen.host || "Home Assistant"; app.user = seen.user || ""; app.pollMs = seen.poll || 4000; app.termsNeeded = seen.termsNeeded || null; // offline: still ask
    } else {
      app.mode = "demo";
      app.state = load(DEMO_KEY, null) || { ...clone(defaults), rev: 0 };
      const b = $("#banner"); b.hidden = false; b.textContent = "Preview: changes are saved on this device only.";
    }
  }
  ["plans", "prefs", "checks", "extras", "prices", "swaps", "shopFor", "shopPref"].forEach((k) => { app.state[k] = app.state[k] || {}; });

  app.weekStart = iso(weekStartFor(new Date(), settings().weekStartDay || 0));
  if (app.mode === "demo" && !app.state.plans[app.weekStart]) applyLocal({ op: "plan", week: app.weekStart, plan: suggestWeek(app.weekStart) });
  // Grown-ups added before 0.11 have no id, so nights marked "out" point at a list position. Pin each one to the key it
  // already uses (p0, p1…), so existing nights stay with the same person and removing someone can't shift them.
  const ppl = settings().people || [];
  if (ppl.some((p) => !p.id)) send({ op: "settings", patch: { people: ppl.map((p, i) => (p.id ? p : { ...p, id: `p${i}` })) } }, { rerender: false });

  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("input", onInput);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeSheet(); closeMenus(); } });
  setupLongPress();
  window.addEventListener("hashchange", fromHash);
  fromHash();
  backGuard();
  if (app.staging) { document.body.classList.add("staging"); document.body.insertAdjacentHTML("afterbegin", `<div class="staging-bar">Test version: separate data, only you can see it</div>`); }
  termsGate();
  allergyConsentCheck();
  nightOwl();
  // Older versions kept little ones' exact birth and due dates: trim them to month and year, plus weeks early (once)
  if ((app.mode === "live" || app.mode === "demo") && kidsNeedTrimming()) send({ op: "settings", patch: { children: kidsAll(), ...(settings().baby ? { baby: null } : {}) } }, { rerender: false });
  if (app.mode === "live") { startPolling(); flushQueue(); }
  if (app.mode === "live" && app.host === "Cloudflare" && !app.offline && !app.signedOut) {
    loadAccount(); loadNotice();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) loadNotice(); });
  }
  // Online version only: keep a copy of the app on the phone so it opens without signal.
  if (app.host === "Cloudflare" && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    // Updates: check whenever the app comes back to the front. A new version downloads quietly,
    // then waits: Settings shows "Update ready" with what's new until you press Update now.
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (app.updating) location.reload(); });
    navigator.serviceWorker.register("sw.js").then((reg) => {
      const ready = () => { if (reg.waiting && navigator.serviceWorker.controller) updateReady(reg.waiting); };
      ready();
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        if (w) w.addEventListener("statechange", () => { if (w.state === "installed") ready(); });
      });
      document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch((err) => console.warn("offline copy unavailable", err));
  }
}

/** Admin-only accounts (online version): no household, just the admin dashboard. */
async function bootAdmin(res) {
  app.mode = "admin"; app.tab = location.hash === "#feedback" ? "feedback" : "admin"; app.user = res.user || ""; app.host = "Cloudflare"; app.region = res.region || null;
  store(HOST_KEY, { host: "Cloudflare", user: app.user, adminOnly: true });
  document.body.classList.add("admin-only");
  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("input", onInput);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  window.addEventListener("hashchange", fromHash);
  render();
  await loadAccount();
  setInterval(() => { if (!document.hidden && $("#sheet").hidden) loadAccount(); }, 60000);
}

function hydrateIcons(root) { $$("[data-icon]", root).forEach((el) => { if (!el.firstChild) el.innerHTML = icon(el.dataset.icon, 24); }); }
function go(tab) {
  if (tab === "settings" && !["settings", "admin", "feedback"].includes(app.tab)) app.prevTab = app.tab; if (location.hash !== "#" + tab) location.hash = tab; else { app.tab = tab; render(); } }
function fromHash() {
  const t = (location.hash || "#tonight").slice(1), was = app.tab;
  app.tab = ["tonight", "week", "shop", "recipes", "life", "settings", "admin", "feedback"].includes(t) ? t : "tonight";
  if (app.tab === "life" && !(app.state && lifeOn())) { app.tab = "tonight"; history.replaceState(null, "", "#tonight"); } // Life is hard is switched off
  if ((app.tab === "admin" || app.tab === "feedback") && app.host !== "Cloudflare") app.tab = "settings";
  if (app.mode === "admin" && app.tab !== "feedback") app.tab = "admin";
  if (app.tab !== "feedback") app.fbAdmin = null; // reopening shows what's new since this visit
  if (app.tab === "settings" && !startHereSeen()) { if (app.mode === "preview") app.previewStartSeen = true; else store("fihStartHere", true); }
  if (app.tab === "shop" && was !== "shop") app.shopAhead = shopDefaultAhead(); // open on the list you'll actually shop from
  app.selecting.clear();
  render(); window.scrollTo(0, 0);
}

const APP_VERSION = "0.11.66"; // bump with config.yaml, sw.js VERSION, whatsnew.json and the changelog
// The last error on this device, sent with "Report a problem" (online version).
window.addEventListener("error", (e) => { app.lastError = String(e.message || "").slice(0, 160); });
window.addEventListener("unhandledrejection", (e) => { app.lastError = String((e.reason && (e.reason.message || e.reason)) || "").slice(0, 160); });

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render() {
  if (app.mode === "admin" || app.tab === "admin" || app.tab === "feedback") {
    $$(".nav button").forEach((b) => b.classList.remove("on"));
    const view = $("#view"); view.innerHTML = app.tab === "feedback" ? viewAdminFeedback() : viewAdmin(); hydrateIcons(view);
    $("#dock").hidden = true;
    return;
  }
  if (!app.state) return;
  if (app.tab === "life" && !lifeOn()) app.tab = "tonight"; // switched off on another phone
  $$(".nav button").forEach((b) => b.classList.toggle("on", b.dataset.tab === app.tab));
  $(".nav [data-tab=life]").hidden = !lifeOn();
  document.body.classList.toggle("life-on", lifeOn()); // five tabs
  document.body.classList.toggle("sea", app.tab === "life"); // Life is hard has its own calm colours
  const views = { tonight: viewTonight, week: viewWeek, shop: viewShop, recipes: viewRecipes, life: viewLife, settings: viewSettings };
  const view = $("#view");
  view.innerHTML = views[app.tab]();
  hydrateIcons(view);
  const dock = $("#dock");
  dock.hidden = app.tab !== "shop";
  document.body.classList.toggle("has-dock", app.tab === "shop"); // leaves room so the buttons never cover the list
  reportBubble();
  if (app.tab === "shop") dock.innerHTML = dockShop();
  const left = buildList(iso(addDays(parseISO(currentWeek()), 7 * shopDefaultAhead()))).filter((i) => i.active && !i.done && !i.bought).length;
  const c = $("#shopCount"); c.hidden = !left || app.tab === "shop"; c.textContent = left;
}
function currentWeek() { return iso(weekStartFor(new Date(), settings().weekStartDay || 0)); }
/** The week the shopping list is showing: this week, or up to 12 weeks ahead (handy for Christmas). */
const SHOP_AHEAD = 12;
function shopWeek() { return iso(addDays(parseISO(currentWeek()), 7 * (app.shopAhead || 0))); }
function shopWeekName(n) { const date = niceDate(parseISO(shopWeek())); return n === 0 ? `This week · ${date}` : n === 1 ? `Next week · ${date}` : `Week of ${date}`; }
function shopWeekBar() {
  const n = app.shopAhead || 0;
  return `<div class="row between" style="margin:-4px 0 10px;gap:8px">
    <button class="icon-btn sm" data-act="shopAhead" data-d="-1" ${n ? "" : "disabled"} aria-label="Earlier week">${icon("left", 18)}</button>
    <b>${esc(shopWeekName(n))}</b>
    <button class="icon-btn sm" data-act="shopAhead" data-d="1" ${n < SHOP_AHEAD ? "" : "disabled"} aria-label="Later week">${icon("right", 18)}</button></div>`;
}
/** Which list to open on: next week's on the last day of the week (you're shopping for the week ahead), or once
    this week's list is all bought and next week's has things on it. Otherwise this week's. */
function shopDefaultAhead() {
  const next = iso(addDays(parseISO(currentWeek()), 7));
  const nextLeft = () => buildList(next).some((i) => i.active && !i.bought && !i.done);
  const thisLeft = buildList(currentWeek()).some((i) => i.active && !i.bought && !i.done);
  const lastDay = iso(addDays(parseISO(currentWeek()), 6)) === iso(new Date());
  return (lastDay && planFor(next).some((d) => d.recipe)) || (!thisLeft && nextLeft()) ? 1 : 0;
}
/** On this week's list: a gentle pointer when next week already has dinners planned. */
function nextWeekHint() {
  if (app.shopAhead) return "";
  const next = iso(addDays(parseISO(currentWeek()), 7));
  if (!planFor(next).some((d) => d.recipe)) return "";
  const n = buildList(next).filter((i) => i.active && !i.bought && !i.done).length;
  return n ? `<button class="card row" style="width:100%;margin-top:12px;padding:14px 16px;text-align:left" data-act="shopAhead" data-d="1"><span class="grow"><b>Next week's list</b><br><span class="small muted">${n} item${n === 1 ? "" : "s"} for dinners already planned</span></span><span aria-hidden="true">›</span></button>` : "";
}

function header(eyebrow, title, right = "", { logo = false } = {}) {
  return `<header class="head">${logo ? `<img class="brand" src="icon-192.png" alt="FoodIsHard" width="44" height="44">` : ""}<div class="grow"><p class="eyebrow">${eyebrow}</p><h1 class="title">${title}</h1></div>${right}</header>`;
}
/** "Start here": a small speech bubble under the glowing Settings button until Settings has been opened once.
    In "See it as a new household" it's remembered only on screen, so previewing doesn't use it up. */
function startHereSeen() { return app.mode === "preview" ? !!app.previewStartSeen : !!load("fihStartHere", false); }
function settingsButton() {
  const glow = nudges().length ? " nudge" : "";
  const btn = settingsButtonOnly(glow);
  return glow && !startHereSeen() && app.tab === "tonight" ? `<span class="start-wrap">${btn}<span class="start-bubble" aria-hidden="true">Start here</span></span>` : btn;
}
function settingsButtonOnly(glow) {
  return app.update
    ? `<button class="icon-btn has-dot${glow}" data-act="go" data-to="settings" aria-label="Settings: an update is ready">${icon("gear")}<span class="update-dot" aria-hidden="true">!</span></button>`
    : `<button class="icon-btn${glow}" data-act="go" data-to="settings" aria-label="${glow ? "Settings: something needs setting up" : "Settings"}">${icon("gear")}</button>`;
}
function offlineBadge() { return app.offline ? `<span class="badge-offline">${icon("nosignal", 16)}No signal · ticks saved</span>` : ""; }

function kcalTiles(r, onHero) {
  const { adults } = household();
  return adults.map((p, idx) => `<button class="tile" data-act="macros" data-id="${r.id}" data-who="${idx}" aria-label="Full nutrition for ${esc(p.name)}">
      <span class="k"><span>${esc(p.name)}</span><span aria-hidden="true">›</span></span><span class="v">${kcalFor(r, p.portion).toLocaleString("en-GB")} kcal</span></button>`).join("");
}
/** "765 kcal", or "765 / 610 kcal" when grown-ups' portions differ. */
function kcalShort(r) { return [...new Set(household().adults.map((p) => kcalFor(r, p.portion).toLocaleString("en-GB")))].join(" / ") + "&nbsp;kcal"; }
function visibleSteps(r) { const inc = kids().length > 0; return r.steps.filter((s) => inc || !s.baby); }
/** Coloured name chips, one per child. */
function kidChips(list = kids()) { return list.map((k) => `<span class="kid-chip" style="${kidStyle(k)}">${esc(k.name || "Little one")}</span>`).join(""); }
/** One coloured note per child for a recipe, at their own stage. */
/** Things worth flagging for one child and one recipe: salt from shop-bought foods, and being too young for solids. */
function kidWarnings(r, k, info) {
  const out = [], name = k.name || "the baby";
  // NHS "around 6 months" is about actual age (premature babies: ask the health visitor), so this uses the date of birth
  const age = (info.ageActual || {}).m;
  if (age != null && age < 6) out.push(`${name} is under 6 months old. The NHS advises starting solids at around 6 months, so check with your health visitor first.`);
  const portion = +k.portion || 0;
  if (portion > 0) {
    // salt the steps can't take out: bread, wraps, gnocchi, beans and the like
    const parts = effectiveIngredients(r).map((i) => {
      const m = ingMeta(i.k);
      if (!m.nu || i.k === "salt" || (m.f || []).includes("salt")) return null;
      return { n: m.n.split(/[(/]/)[0].trim().toLowerCase(), salt: gramsFor(i.k, i.q, i.u) / 100 * m.nu[7] * portion };
    }).filter((x) => x && x.salt > 0.05).sort((a, b) => b.salt - a.salt);
    const total = parts.reduce((t, x) => t + x.salt, 0);
    if (total >= info.saltLimit / 2) {
      const from = parts.slice(0, 2).map((x) => x.n).join(" and ");
      out.push(`About ${total.toFixed(1)} g of salt in ${name}'s portion, mostly from the ${from}. The NHS limit at this age is ${info.saltLimit} g a day, so go easy on those and keep the rest of the day low in salt.`);
    }
  }
  return out;
}
function kidNotes(r, { withRules = false } = {}) {
  return kids().map((k) => {
    const info = kidInfo(k), note = personaliseStep((r.baby || {})[STAGE_NOTE[k.stage] || "smooth"] || "") || "Take their portion out before salt, stock or chilli, and cut it to a size they can manage.";
    const warn = kidWarnings(r, k, info);
    return `<div class="baby-box kid" style="${kidStyle(k)}"><p class="kid-head"><span class="kid-dot"></span><b>${esc(k.name || "Little one")}</b> · ${esc(STAGES[k.stage]?.name || "")}</p><p style="margin:0">${esc(note)}</p>
      ${warn.map((w) => `<p class="small" style="margin:6px 0 0;color:var(--warn-ink);background:var(--warn-soft);padding:6px 10px;border-radius:10px">${esc(w)}</p>`).join("")}
      ${withRules ? `<ul><li>No added salt or stock in their portion.</li>${info.underOne ? `<li>No honey until they turn 1${info.firstBirthday ? ` (after ${info.firstBirthday.toLocaleDateString("en-GB", { month: "long", year: "numeric" })})` : ""}.</li>` : ""}<li>Quarter cherry tomatoes and grapes. Nuts ground or smooth only.</li></ul>` : ""}</div>`;
  }).join("");
}

function babySuggestionCard(sg) {
  return `<div class="baby-suggest"><p>${esc(sg.text)}</p>${sg.info
    ? `<button class="btn sm" data-act="babyDismiss" data-kid="${esc(sg.kid)}" data-k="${esc(sg.key)}">Got it</button>`
    : `<div class="row" style="gap:8px"><button class="btn sm primary" data-act="babyAccept" data-kid="${esc(sg.kid)}" data-k="${esc(sg.key)}">Yes, change it</button><button class="btn sm" data-act="babyDismiss" data-kid="${esc(sg.kid)}" data-k="${esc(sg.key)}">Not yet</button></div>`}</div>`;
}

// ----- Tonight -----
/** Important things a household hasn't set yet. The Settings button glows, and so does each field, until they're done. */
function nudges() {
  if (!app.state) return [];
  const s = settings(), out = [];
  if (!s.allergyAsked && !(s.avoid || []).length) out.push("allergies");
  if (kids().some((k) => !kidBornDate(k))) out.push("kidBorn");
  return out;
}
// ---- Storing and reheating (FSA and NHS guidance) ----
const GRAINS = ["rice", "rice_pouch", "arborio", "couscous"];
// "grainsMixed" in recipes.json: rice or couscous mixed through, so the whole dish follows the stricter rice rule
function hasGrains(r) { return !!r.grainsMixed; }
function storingBox(r) {
  const whole = hasGrains(r), side = !whole && r.ingredients.some((i) => GRAINS.includes(i.k)), little = kids().length > 0;
  const grain = r.ingredients.some((i) => i.k === "couscous") ? "couscous" : "rice";
  return `<details class="fold" style="margin-top:14px"><summary class="section-label" style="display:flex;justify-content:space-between">Storing & reheating leftovers <span aria-hidden="true">›</span></summary><div class="card stack" style="padding:14px 16px;gap:6px;font-size:15px">
    <span>Cool within ${whole ? "1 hour" : "1 to 2 hours"} (split into small tubs to speed it up), then into the fridge. Eat within ${whole ? "24 hours" : "2 days"}, or freeze.</span>
    ${whole ? `<span class="small muted">The ${grain} is why it's stricter: its spores survive cooking, so it mustn't sit around warm.</span>` : ""}
    ${side ? `<span>Any leftover ${grain} is stricter: cool it within 1 hour, keep it in the fridge and eat it within 24 hours.</span>` : ""}
    ${r.freeze ? `<span><b>Freezes well:</b> ${esc(r.freeze.charAt(0).toLowerCase() + r.freeze.slice(1))}. Defrost in the fridge overnight and eat within 24 hours.</span>` : ""}
    <span>Reheat only once, until steaming hot all the way through.</span>
    ${little ? `<span class="small muted">For ${esc(kidNames())}: reheat until steaming hot, then let it cool before serving. Throw away anything left in their bowl.</span>` : ""}
    <span class="small muted">From Food Standards Agency and NHS advice.</span></div></details>`;
}
/** "+2 guests · cooking double", or "" for a normal day. */
function dayAdjustText(d) {
  if (!d) return "";
  const x = +(d.guests != null ? d.guests : d.extra) || 0, bits = [], { adults, kids: little } = household(), away = new Set(d.away || []);
  const out = [...adults.filter((p, i) => away.has(personKey(p, i))).map((p) => p.name), ...little.filter((k) => away.has(k.id)).map((k) => k.name || "Little one")];
  if (out.length) bits.push(`${joinNames(out)} out`);
  if (x > 0) bits.push(`+${niceNumber(x)} ${x === 1 ? "guest" : "guests"}`);
  if (x < 0) bits.push(`${niceNumber(-x)} fewer eating`);
  if (d.double) bits.push("cooking double");
  return bits.join(" · ");
}
function leftoversFrom(days, d) {
  const src = d.from != null && days[d.from], r = src && src.recipe && app.byId[src.recipe];
  return r ? `From ${DOW_LONG[mondayIndex(addDays(parseISO(app.weekStart), d.from))]}'s ${esc(r.name.toLowerCase())}` : "From earlier in the week";
}
/** Cook double: twice the amounts tonight, and the next day becomes leftovers from it. Turning it off puts the next day back. */
function setDouble(week, i) {
  const days = planFor(week), d = days[i], next = days[i + 1], on = !d.double;
  dayUpdate(i, { double: on }, week);
  if (!next) return;
  // a night off or a day you've locked stays as it is: the extra keeps for lunch or another night
  const free = !next.locked && next.status !== "skip" && !(next.status === "leftovers" && next.from !== i);
  if (on && free) dayUpdate(i + 1, { status: "leftovers", from: i, note: null, was: { status: next.status || "cook", recipe: next.recipe || null, note: next.note || null } }, week);
  else if (!on && next.status === "leftovers" && next.from === i) {
    const was = next.was || { status: "cook", recipe: next.recipe || null };
    dayUpdate(i + 1, { status: was.status, recipe: was.recipe, note: was.note || null, from: null, was: null }, week); // exactly as it was
  }
}
function openEating(week, i, { keepScroll = false } = {}) {
  const days = planFor(week), d = days[i], next = days[i + 1], { adults, kids: little } = household();
  const date = addDays(parseISO(week), i), guests = +(d.guests != null ? d.guests : Math.max(0, +d.extra || 0)) || 0, away = new Set(d.away || []), r = d.recipe && app.byId[d.recipe];
  const nextR = next && next.status === "cook" && next.recipe && app.byId[next.recipe];
  const who = [...adults.map((p, n) => ({ key: personKey(p, n), name: p.name, sub: sizeLabel(+p.portion || 1) })), ...little.map((k) => ({ key: k.id, name: k.name || "Little one", sub: `${portionShort(k.portion)} portion`, kid: k }))];
  openSheet(`<p class="eyebrow">${DOW_LONG[mondayIndex(date)]} ${date.getDate()} ${MONTHS[date.getMonth()]}${r ? ` · ${esc(r.name)}` : ""}</p><h1 class="title" style="font-size:26px">Who's eating?</h1>
    <div class="list" style="margin-bottom:12px">
      ${who.map((w) => `<label class="row between ${w.kid ? "kid-stripe" : ""}" style="padding:12px 16px;${w.kid ? kidStyle(w.kid) : ""}"><span class="row" style="gap:10px"><span><b>${esc(w.name)}</b><br><span class="small muted">${esc(w.sub)}</span></span></span>
        <span class="switch"><input type="checkbox" data-act="eatingWho" data-week="${week}" data-i="${i}" data-k="${esc(w.key)}" ${away.has(w.key) ? "" : "checked"} aria-label="${esc(w.name)} eating"><i></i></span></label>`).join("")}
      <div class="row between" style="padding:12px 16px;border-top:1px solid var(--line-soft)"><span><b>Guests</b><br><span class="small muted">Regular portions</span></span>
        <div class="stepper"><button data-act="eatingGuests" data-week="${week}" data-i="${i}" data-d="-1" aria-label="One fewer guest" ${guests <= 0 ? "disabled" : ""}>−</button><span>${guests}</span><button data-act="eatingGuests" data-week="${week}" data-i="${i}" data-d="1" aria-label="One more guest">+</button></div></div>
      <div class="row between" style="padding:14px 16px;border-top:1px solid var(--line-soft)"><span><b>Cook double</b>${next && !next.locked && next.status !== "skip" ? `<br><span class="small muted">${DOW_LONG[mondayIndex(addDays(date, 1))]} becomes leftovers${nextR && !d.double ? ` instead of ${esc(nextR.name.toLowerCase())}` : ""}</span>` : ""}</span>
        <label class="switch"><input type="checkbox" data-act="eatingDouble" data-week="${week}" data-i="${i}" ${d.double ? "checked" : ""} aria-label="Cook double"><i></i></label></div>
      ${next && (next.locked || next.status === "skip") && !d.double ? `<div class="small muted" style="padding:0 16px 12px">${DOW_LONG[mondayIndex(addDays(date, 1))]} stays ${next.status === "skip" ? "a night off" : "locked"}.</div>` : ""}
    </div>
    <p class="small muted">Cooking ${niceNumber(dayFactor(d))} portions that night.</p>
    <button class="btn lg primary" data-close>Done</button>`, { keepScroll });
}
/** "Start by 17:25", from the household's usual dinner time and the recipe's total time. */
function startByTag(r) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(settings().dinnerTime || "");
  if (!m) return "";
  const start = new Date(); start.setHours(+m[1], +m[2] - r.time, 0, 0);
  const late = Date.now() > start.getTime();
  const hm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const ready = new Date(Date.now() + r.time * 60000);
  if (late && ready.getDate() !== new Date().getDate()) return ""; // past midnight: no point saying
  return `<span class="tag" style="align-self:flex-start">${icon("clock", 14)} ${late ? `Dinner around ${hm(ready)} if you start now` : `Start by ${hm(start)} for dinner at ${esc(settings().dinnerTime)}`}</span>`;
}
/** Today's rating for this recipe, if someone has left one. */
function ratedToday(id) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return feedbackFor(id).filter((f) => f.at * 1000 >= start.getTime()).pop() || null;
}
function viewTonight() {
  const today = new Date(), { week, i } = todaySlot();
  const d = planFor(week)[i];
  const r = d.recipe && app.byId[d.recipe];
  const { factor, kids: little } = household();
  const eyebrow = `${DOW_LONG[mondayIndex(today)]} ${today.getDate()} ${MONTHS_LONG[today.getMonth()]}`;
  let hero;
  if (d.status === "cook" && r) {
    const babyStep = visibleSteps(r).findIndex((s) => s.baby);
    const cost = recipeCost(r) * dayFactor(d);
    hero = `<section class="hero">
      <div class="row wrap" style="gap:8px"><span class="tag">${esc(r.emergency ? "Quick meal" : family(r.family).name)}</span><span class="tag">${r.time} min</span><span class="tag">≈ ${money(cost)}</span></div>
      <h1>${esc(r.name)}</h1>
      ${dayAdjustText(d) ? `<button class="tag" style="align-self:flex-start;border:0" data-act="eating" data-i="${i}" data-week="${week}">${icon("people", 14)} ${esc(dayAdjustText(d))}</button>` : ""}
      ${headlineSwaps(r).length ? `<span class="tag" style="align-self:flex-start">Made with ${esc(headlineSwaps(r).join(", "))}</span>` : ""}
      <div class="tiles">${kcalTiles(r, true)}</div>
      ${little.length && babyStep >= 0 ? `<div class="baby-note">${icon("baby")}<span>${kidChips(little)} ${little.length > 1 ? "portions come" : "portion comes"} out at <b>step ${babyStep + 1}</b></span></div>` : ""}
      ${(() => {
        const rated = ratedToday(r.id);
        if (d.cooked !== r.id && !rated) return `${startByTag(r)}<div class="row"><button class="btn lg white grow" data-act="cook" data-id="${r.id}">${icon("play", 18)}Start cooking</button>
          <button class="btn lg outline" data-act="quicker" data-i="${i}">${icon("bolt", 18)}Quicker</button></div>`;
        if (!rated) return `<div class="row"><button class="btn lg white grow" style="white-space:nowrap" data-act="rateMeal" data-id="${r.id}">Leave feedback</button>
          <button class="btn lg outline" style="white-space:nowrap;flex:0 0 auto" data-act="cook" data-id="${r.id}" aria-label="Cook again">${icon("refresh", 18)}Again</button></div>`;
        return `<div class="row between" style="gap:10px"><span class="tag">✓ Cooked · ${esc(({ loved: "you loved it", fine: "it was fine", never: "not again" })[rated.rating] || "rated")}</span>
          <button class="btn outline" data-act="cook" data-id="${r.id}">${icon("refresh", 16)}Cook again</button></div>`;
      })()}
    </section>`;
  } else if (d.status === "skip" || d.status === "leftovers") {
    hero = `<section class="hero"><span class="tag" style="align-self:flex-start">Tonight</span>
      <h1>${d.status === "skip" ? `Night off${d.note ? ` · ${esc(d.note)}` : ""}` : "Leftovers night"}</h1>
      ${d.status === "leftovers" ? `<p style="margin:0;opacity:.9">Reheat until steaming hot all the way through, and only once.${(() => { const src = d.from != null && planFor(week)[d.from], sr = src && src.recipe && app.byId[src.recipe]; return sr && hasGrains(sr) ? " It has rice or couscous, so it should have gone in the fridge within an hour and be eaten within a day." : ""; })()}</p>` : ""}
      <div class="row"><button class="btn white" data-act="status" data-i="${i}" data-s="cook">Cook something after all</button></div></section>`;
  } else {
    hero = `<section class="card empty"><p class="h2">Nothing planned tonight</p>
      <div class="row" style="justify-content:center;margin-top:14px"><button class="btn primary" data-act="go" data-to="week">Plan the week</button><button class="btn" data-act="emergency" data-i="${i}">${icon("bolt", 18)}Something quick</button></div></section>`;
  }

  // the next four days, which may run into next week
  const upcoming = [];
  for (let k = 1; k <= 4; k++) {
    const date = addDays(today, k), wk = iso(weekStartFor(date, settings().weekStartDay || 0));
    const idx = (mondayIndex(date) - (settings().weekStartDay || 0) + 7) % 7;
    const day = planFor(wk)[idx], rr = day.recipe && app.byId[day.recipe];
    let label = `<span class="n muted">Nothing yet</span>`;
    if (day.status === "skip") label = `<span class="n muted">Skipped${day.note ? ` · ${esc(day.note)}` : ""}</span>`;
    else if (day.status === "leftovers") label = `<span class="n muted">Leftovers</span>`;
    else if (rr) label = `<span class="n">${esc(rr.name)}</span>${rr.emergency ? `<span class="pill warm">Quick</span>` : `<span class="small muted">${rr.time}m</span>`}`;
    upcoming.push(`<button ${rr && day.status === "cook" ? `data-act="recipe" data-id="${rr.id}" data-week="${wk}" data-i="${idx}"` : `data-act="go" data-to="week"`}><span class="d">${DOW[mondayIndex(date)].toUpperCase()}</span>${label}</button>`);
  }

  const ahead = shopDefaultAhead(), shopWk = iso(addDays(parseISO(currentWeek()), 7 * ahead));
  const list = buildList(shopWk).filter((x) => x.active);
  const toBuy = list.filter((x) => !x.done && !x.bought), left = toBuy.length;
  const total = list.reduce((t, x) => t + (x.cost || 0), 0), leftCost = toBuy.reduce((t, x) => t + (x.cost || 0), 0);
  const growing = babySuggestions().filter((x) => !x.info);
  const growNames = joinNames([...new Set(growing.map((x) => x.name))]);
  return `${header(eyebrow, "Tonight", settingsButton(), { logo: true })}
    ${growing.length ? `<button class="card row" style="width:100%;margin-bottom:12px;padding:12px 16px;text-align:left;gap:10px" data-act="babyReview"><span class="grow"><b>${esc(growNames)} ${growing.length && new Set(growing.map((x) => x.kid)).size > 1 ? "are" : "is"} growing</b><br><span class="small muted">${growing.length === 1 ? "A suggestion" : `${growing.length} suggestions`} for their meals</span></span><span class="muted">›</span></button>` : ""}
    ${hero}
    ${todayLunchCard()}
    <div class="row between" style="margin:22px 4px 10px"><h2 class="h2">Coming up</h2><button class="btn sm ghost" data-act="go" data-to="week">See the week</button></div>
    <div class="list week-mini">${upcoming.join("")}</div>
    <button class="card row" style="width:100%;margin-top:14px;padding:14px 16px;text-align:left" data-act="go" data-to="shop">
      <span class="icon-btn on" style="border-radius:14px">${icon("basket")}</span>
      <span class="grow"><b>${left ? `${left} thing${left === 1 ? "" : "s"} to buy${ahead ? " for next week" : ""}` : "Shopping list"}</b><br><span class="small muted">${left ? `≈ ${money(leftCost)} left` : `≈ ${money(total)} ${ahead ? "next" : "this"} week`}</span></span>
      <span style="color:var(--accent);font-weight:700">Open</span></button>`;
}

// ----- Week -----
function viewWeek() {
  const week = app.weekStart, start = parseISO(week), end = addDays(start, 6);
  const days = planFor(week), todayISO = iso(new Date());
  // anyone changing the week since (including a partner's phone) means undoing the shuffle would lose their change
  if (app.undoShuffle && app.undoShuffle.week === week && JSON.stringify(days) !== app.undoShuffle.after) app.undoShuffle = null;
  const { factor } = household();
  let cost = 0;
  const cards = days.map((d, i) => {
    const date = addDays(start, i), isToday = iso(date) === todayISO;
    const r = d.recipe && app.byId[d.recipe], theme = themeFor(week, i);
    const dateCol = `<div><div class="dow">${DOW[mondayIndex(date)].toUpperCase()}</div><div class="dom">${date.getDate()}</div></div>`;
    if (d.status === "skip") return `<article class="day off">${dateCol}<div class="row between"><span><b>Skipped${d.note ? ` · ${esc(d.note)}` : ""}</b></span><button class="btn sm" data-act="status" data-i="${i}" data-s="cook">Undo</button></div></article>`;
    if (d.status === "leftovers") return `<article class="day off">${dateCol}<div class="row between"><span><b>Leftovers</b><br><span class="small muted">${leftoversFrom(days, d)}</span></span><button class="btn sm" data-act="status" data-i="${i}" data-s="cook">Cook instead</button></div></article>`;
    if (!r) return `<article class="day ${isToday ? "today" : ""}">${dateCol}<div>${theme ? `<div class="fam">${esc(theme.name)}</div>` : ""}
      <button class="btn add-slot" data-act="pick" data-i="${i}">${icon("plus", 16)}Choose a dinner</button>
      <div class="actions"><button class="btn sm soft" data-act="skip" data-i="${i}">Skip</button></div></div></article>`;
    const c = recipeCost(r) * dayFactor(d); cost += c;
    const famText = r.emergency ? `<span class="fam quick">${theme && themeMatch(theme, r) ? esc(theme.name) : "Quick"} · ${r.time} min${isToday ? " · tonight" : ""}</span>`
      : `<span class="fam">${esc(theme && themeMatch(theme, r) ? theme.name : family(r.family).name)}${isToday ? " · tonight" : ""}</span>`;
    const fam = `<div class="row between" style="margin:-6px -6px 0 0">${famText}<span class="row" style="gap:0">
        <button class="icon-btn sm ${dayAdjustText(d) ? "on" : "plain"}" data-act="eating" data-i="${i}" data-week="${week}" aria-label="Who's eating: ${esc(dayAdjustText(d) || "everyone")}">${icon("people", 17)}</button>
        ${((lockBtn) => app.lockTip === i ? `<span class="start-wrap">${lockBtn}<span class="start-bubble" aria-hidden="true">Tap the lock to keep this one</span></span>` : lockBtn)(`<button class="icon-btn sm ${d.locked ? "on" : "plain"}${app.lockTip === i ? " nudge" : ""}" data-act="lock" data-i="${i}" aria-label="${d.locked ? "Unlock" : "Keep this one"}">${icon(d.locked ? "lock" : "unlock", 17)}</button>`)}
        <button class="icon-btn sm plain" data-act="dayMenu" data-i="${i}" aria-label="More">${icon("dots", 17)}</button></span></div>`;
    return `<article class="day ${isToday ? "today" : ""}">${dateCol}<div>${fam}
      <button class="name" data-act="recipe" data-id="${r.id}" data-week="${week}" data-i="${i}">${esc(r.name)}${headlineSwaps(r).length ? ` <span class="pill warn" style="vertical-align:3px">with ${esc(headlineSwaps(r).join(", "))}</span>` : ""}</button>
      <div class="small muted" style="margin-top:2px">${r.time} min (${r.hands || r.time} hands-on) · ${money(c)} · ${kcalShort(r)}</div>
      ${d.lunch ? lunchLine(d, i, week) : ""}
      ${dayAdjustText(d) ? `<button class="pill accent" style="border:0;margin-top:6px" data-act="eating" data-i="${i}" data-week="${week}">${icon("people", 13)} ${esc(dayAdjustText(d))}</button>` : ""}
      <div class="actions${d.locked ? " locked" : ""}">
        <button class="btn sm soft" data-act="another" data-i="${i}">${esc(family(r.family).another || "Another")}</button>
        <button class="btn sm soft" data-act="swapDay" data-i="${i}">Swap</button>
        <button class="btn sm soft" data-act="skip" data-i="${i}">Skip</button>
      </div></div></article>`;
  }).join("");
  const thisWeek = week === currentWeek(), any = days.some((d) => d.recipe);
  return `${header(thisWeek ? "This week" : "Week of", `${niceDate(start)} – ${niceDate(end)}`, `<div class="row" style="gap:6px">
      <button class="icon-btn" data-act="week" data-d="-1" aria-label="Previous week">${icon("left", 18)}</button>
      <button class="icon-btn" data-act="week" data-d="1" aria-label="Next week">${icon("right", 18)}</button>${settingsButton()}</div>`)}
    <div class="row" style="margin:0 4px 12px">
      <button class="btn primary" style="white-space:nowrap" data-act="shuffle">${any ? (app.undoShuffle && app.undoShuffle.week === week ? "Shuffle again" : days.some((d) => d.locked) ? "Shuffle the rest" : "Shuffle the week") : "Plan my week"}</button>
      ${app.undoShuffle && app.undoShuffle.week === week ? `<button class="btn" style="white-space:nowrap" data-act="undoShuffle" aria-label="Undo shuffle">${icon("refresh", 16)}Undo</button>` : ""}
      ${any ? `<span class="small muted">≈ ${money(cost)} of food${settings().budget ? " · budget swaps on" : ""}</span>` : ""}
    </div>
    <div class="stack" style="gap:8px">${cards}</div>`;
}

// ----- Shop -----
function shopData() {
  const week = shopWeek();
  const all = buildList(week);
  const bought = all.filter((i) => i.bought);
  const toGet = all.filter((i) => i.active && !i.bought); // the live list
  const tabs = enabledShops().concat("any").map((s) => ({ s, n: toGet.filter((i) => i.shop === s && !i.done).length, all: toGet.filter((i) => i.shop === s).length })).filter((t) => t.all);
  if (app.shopTab !== "all" && !tabs.some((t) => t.s === app.shopTab)) app.shopTab = "all";
  const shown = app.shopTab === "all" ? toGet : toGet.filter((i) => i.shop === app.shopTab);
  return { week, all, toGet, tabs, shown, bought };
}
function viewShop() {
  const { week, all, toGet, tabs, shown, bought } = shopData();
  if (!toGet.length && !all.length) return `${header("Shopping", "Nothing to buy yet", settingsButton())}${shopWeekBar()}<div class="card empty"><button class="btn primary" data-act="shopPlan">Plan ${app.shopAhead ? "that" : "the"} week</button></div>${nextWeekHint()}${staplesCard()}`;
  const done = shown.filter((i) => i.done).length;
  const sel = app.selecting.size;
  const title = sel ? `${sel} selected` : app.shopTab === "all" ? "Shopping list" : `At ${esc(shopName(app.shopTab, false))}`;
  const right = sel ? `<button class="btn sm" data-act="selCancel">Cancel</button>`
    : `<button class="icon-btn" data-act="shopMenu" aria-label="Share, print and more">${icon("dots")}</button>`;

  const groups = {};
  shown.forEach((i) => { (groups[i.aisle] = groups[i.aisle] || []).push(i); });
  const body = aisleOrder().filter((a) => groups[a]).map((a) => `<p class="section-label">${esc(aisleName(a))}</p>
    <div class="list">${groups[a].sort((x, y) => (x.done - y.done) || x.name.localeCompare(y.name)).map(itemRow).join("")}</div>`).join("");

  const sum = (list) => list.reduce((t, i) => t + (i.cost || 0), 0);
  const toBuy = shown.filter((i) => !i.done), trolley = sum(shown.filter((i) => i.done));
  const base = toGet.filter((i) => !i.done).reduce((t, i) => t + (i.cost ? i.cost / shopMult(i.shop === "any" ? priceShop() : i.shop) : 0), 0);
  const compare = enabledShops().slice(0, 4).map((s) => `${esc(shopName(s))} ≈${money(base * shopMult(s))}`).join(" · ");
  const have = all.filter((i) => !i.cupboard && i.have);
  const usedRack = rackUsedThisWeek(week), unchecked = [...usedRack].filter((k) => !(app.state.pantry || {})[k]).length;

  return `${header("Shopping", title, `<div class="row" style="gap:6px">${right}${settingsButton()}</div>`)}
    ${shopWeekBar()}
    ${app.offline ? `<div style="margin:-4px 0 10px">${offlineBadge()}</div>` : ""}
    <div class="stack" style="gap:12px;margin-bottom:6px">
      <div class="row between small"><span class="muted">${done} of ${shown.length} in the trolley${trolley ? ` (≈ ${money(trolley)})` : ""}</span><span class="muted">≈ <b style="color:var(--ink)">${money(sum(toBuy))}</b> to buy</span></div>
      <div class="progress"><i style="width:${shown.length ? Math.round(done / shown.length * 100) : 0}%"></i></div>
      ${tabs.length > 1 ? `<div class="shop-tabs"><button class="chip ${app.shopTab === "all" ? "on" : ""}" data-act="shopTab" data-s="all">All · ${toGet.filter((i) => !i.done).length}</button>${tabs.map((t) => `<button class="chip ${app.shopTab === t.s ? "on" : ""}" data-act="shopTab" data-s="${t.s}">${esc(shopName(t.s))} · ${t.n}</button>`).join("")}</div>` : ""}
    </div>
    ${body || `<div class="card empty"><p><b>Everything's bought.</b> Nice work!</p></div>`}
    ${leftoverCard(all)}
    ${boughtSection(bought, sum(toGet))}
    ${have.length ? `<details class="fold"><summary class="section-label">Not needed this week · ${have.length}</summary><div class="list">${have.map(itemRow).join("")}</div></details>` : ""}
    ${nextWeekHint()}
    ${staplesCard()}
    <button class="card row" style="width:100%;margin-top:12px;padding:14px 16px;text-align:left" data-act="rack">
      <span class="grow"><b>Spice rack &amp; cupboard</b>${unchecked ? `<br><span class="small muted">${unchecked} to check for this week's dinners</span>` : ""}</span>
      ${unchecked ? `<span class="pill warn">Check</span>` : ""}<span aria-hidden="true">›</span></button>
    <p class="small muted" style="margin:20px 4px 0">Same list everywhere: ${compare}. Prices are estimates. Tap an item to fix its price or swap it; hold to select several.</p>`;
}
/** "Left over after this week's dinners": what's left of packs you've actually bought (ticked or Done shopping), so you
    can use it up. Things not bought yet aren't listed: they're not in your kitchen. Tap for ideas to use them up. */
function leftoverCard(items) {
  const left = items.filter((i) => i.leftover && !i.have && (i.done || i.bought));
  if (!left.length) return "";
  const claimed = lunchClaims(shopWeek());
  return `<p class="section-label">Left over after this week's dinners</p><p class="small muted" style="margin:-4px 0 8px">From what you've bought, roughly what you'll have spare.</p><div class="list">${left.map((i) => `<button class="rrow" data-act="itemOpen" data-key="${esc(i.key)}" style="padding:11px 16px"><span class="grow">${esc(i.name)} <span class="small muted">${esc(i.leftover.replace(/^about /, "~"))}</span>${useByNote(i.k)}</span>${claimed.get(i.k) ? `<span class="small muted">${esc(claimed.get(i.k))}</span>` : useUpIdeas(i).length || (i.k && lunchIdeas(i.k).length) ? `<span class="small" style="color:var(--accent)">Ideas ›</span>` : `<span class="muted" aria-hidden="true">›</span>`}</button>`).join("")}</div>${lunchBasicsTip(left)}`;
}
/** "Bought this week": each Done shopping trip, with its total and the week's running total. */
function boughtSection(bought, stillToBuy) {
  if (!bought.length) return "";
  const sum = (list) => list.reduce((t, i) => t + (i.cost || 0), 0), spent = sum(bought);
  const trips = new Map();
  bought.forEach((i) => { if (!trips.has(i.bought)) trips.set(i.bought, []); trips.get(i.bought).push(i); });
  const when = (t) => { const d = new Date(t * 1000); return `${DOW[mondayIndex(d)]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })}`; };
  const open = app.showBought;
  const tripsHtml = [...trips.entries()].sort((a, b) => b[0] - a[0]).map(([t, list]) => {
    const shops = [...new Set(list.map((i) => shopName(i.shop, false)))].join(", "), by = list[0].checkedBy;
    return `<p class="section-label" style="margin-top:12px">${esc(when(t))}${by ? ` · ${esc(by)}` : ""}</p>
      <div class="list">
        <div class="row between small" style="padding:10px 16px;background:var(--sunk)"><span class="muted">${list.length} thing${list.length === 1 ? "" : "s"} · ${esc(shops)}</span><b>≈ ${money(sum(list))}</b></div>
        ${list.sort((a, b) => a.name.localeCompare(b.name)).map((i) => `<div class="row" style="padding:10px 16px;gap:10px"><span class="grow">${esc(i.name)}${i.qtyText ? ` <span class="small muted">${esc(i.qtyText)}</span>` : i.counted && i.n > 1 ? ` <span class="small muted">×${i.n}</span>` : ""}</span>
          ${i.cost != null ? `<span class="small muted">${money(i.cost)}</span>` : ""}<button class="btn sm" data-act="unbuy" data-key="${esc(i.key)}">Put back</button></div>`).join("")}
      </div>`;
  }).join("");
  return `<button class="card row" style="width:100%;margin-top:16px;padding:14px 16px;text-align:left" data-act="toggleBought" aria-expanded="${open ? "true" : "false"}">
      <span class="grow"><b>Bought this week</b><br><span class="small muted">${bought.length} thing${bought.length === 1 ? "" : "s"} · ≈ ${money(spent)} so far · ≈ ${money(spent + stillToBuy)} for the week</span></span>
      <span aria-hidden="true" style="transform:rotate(${open ? 90 : 0}deg);transition:transform .15s">›</span></button>
    ${open ? `<div>${tripsHtml}<p class="small muted" style="margin:10px 4px 0">≈ ${money(spent)} bought + ≈ ${money(stillToBuy)} still on the list = ≈ ${money(spent + stillToBuy)} this week.</p></div>` : ""}`;
}
function itemRow(i) {
  const chips = [];
  if ((i.flags || []).includes("veg")) chips.push(`<span class="pill warn">Check for V</span>`);
  if ((i.flags || []).includes("welfare")) chips.push(`<span class="pill accent">Free-range</span>`);
  (i.checkLabel || []).forEach((a) => chips.push(`<span class="pill warm">Check: ${esc(a.toLowerCase())}</span>`));
  if (i.stale) chips.push(`<span class="pill">Price may be old</span>`);
  const sub = [];
  if (i.counted && i.unitPrice != null) sub.push(`${money(i.unitPrice)} each`);
  if (i.from.length) sub.push(`instead of ${esc(i.from.join(", ").toLowerCase())}`);
  if (i.note) sub.push(esc(i.note));
  if (i.extra && i.by) sub.push(`added by ${esc(i.by)}`);
  if (i.staple) sub.push("every week");
  if (i.covers) sub.push(`covers the ${esc(i.covers)}`);
  if (i.done && i.checkedBy) sub.push(`✓ ${esc(i.checkedBy)}`);
  const key = esc(i.key);
  const selected = app.selecting.has(i.key);
  const lead = i.have ? `<button class="btn sm" data-act="flag" data-key="${key}" data-f="have" data-v="0">Need it</button>`
    : `<input type="checkbox" class="check-input" data-act="tick" data-key="${key}" ${i.done ? "checked" : ""} aria-label="Got ${esc(i.name)}">`;
  const stepper = i.counted && !i.have ? `<span class="mini-step"><button data-act="count" data-key="${key}" data-d="-1" aria-label="One fewer" ${i.n <= 1 ? "disabled" : ""}>−</button><b>${i.n}</b><button data-act="count" data-key="${key}" data-d="1" aria-label="One more">+</button></span>` : "";
  const remove = i.have || i.cupboard ? "" : `<button class="icon-btn sm plain" data-act="removeItem" data-key="${key}" aria-label="Remove ${esc(i.name)} from the list">${icon("x", 16)}</button>`;
  return `<div class="item ${i.done ? "done" : ""} ${selected ? "sel" : ""}" data-key="${key}">
    ${lead}
    <div class="grow">
      <button class="body" data-act="itemOpen" data-key="${key}"><span class="iname">${esc(i.name)}</span> ${i.qtyText ? `<span class="iq">${esc(i.qtyText)}</span>` : ""}
        ${chips.length || sub.length ? `<span class="sub">${chips.join("")}${sub.length ? `<span>${sub.join(" · ")}</span>` : ""}</span>` : ""}</button>
      <div class="item-meta">${stepper}${i.cost != null ? `<span class="price">${money(i.cost)}</span>` : ""}
        <button class="shop-tag ${esc(i.shop)}" data-act="moveOne" data-key="${key}" aria-label="Shop: ${esc(shopName(i.shop, false))}. Tap to change">${esc(shopName(i.shop))}</button></div>
    </div>
    ${remove}
  </div>`;
}
function dockShop() {
  if (app.selecting.size) return `<div class="dock-inner"><button class="btn lg primary grow" data-act="moveSel">Move ${app.selecting.size} to another shop</button></div>`;
  return `<div class="dock-inner"><button class="btn lg grow" style="background:var(--accent-soft);color:var(--accent-dark);border-color:transparent" data-act="addItem">${icon("plus", 18)}Add item</button>
    <button class="btn lg primary grow" data-act="doneShopping">Done shopping</button></div>`;
}

// ----- Recipes -----
function viewRecipes() {
  const q = app.recipeQuery.trim().toLowerCase(), f = app.recipeFilter;
  const { factor } = household();
  const match = (r) => {
    const p = prefsFor(r.id), off = p.ban || blockedBy(r).length;
    if (f === "hidden") return off;
    if (off) return false;
    if (f === "fav" && !p.fav) return false;
    if (f === "quick" && r.time > 30) return false;
    if (q && !`${r.name} ${family(r.family).name} ${r.cuisine} ${r.blurb} ${r.ingredients.map((i) => ingMeta(i.k).n).join(" ")}`.toLowerCase().includes(q)) return false;
    return true;
  };
  const list = app.recipes.filter(match);
  const row = (r) => {
    const p = prefsFor(r.id), blocked = blockedBy(r);
    return `<button class="rrow ${p.ban || blocked.length ? "off" : ""}" data-act="recipe" data-id="${r.id}"><span class="grow"><b>${esc(r.name)}</b><br>
      <span class="small muted">${r.time} min (${r.hands || r.time} hands-on) · ${money(recipeCost(r))} a portion · ${Math.round(nutritionPerPortion(r).kcal).toLocaleString("en-GB")} kcal</span>
      ${blocked.length ? `<br><span class="small" style="color:var(--warm)">Contains ${esc(blocked.join(", ").toLowerCase())}</span>` : p.ban ? `<br><span class="small muted">Marked "never again"</span>` : ""}</span>
      ${cookedIt(r.id) ? `<span class="pill accent" title="Cooked it">✓</span>` : ""}${p.fav ? `<span style="color:var(--warm)" aria-label="Favourite">♥</span>` : ""}${r.time <= 15 ? `<span class="pill warm">Quick</span>` : ""}</button>`;
  };
  const flat = q || f !== "all";
  const sections = [];
  if (flat) sections.push(list.length ? `<div class="list">${list.sort((a, b) => a.name.localeCompare(b.name)).map(row).join("")}</div>` : `<div class="empty">Nothing matches that.</div>`);
  else {
    app.families.forEach((fm) => {
      const rs = list.filter((r) => r.family === fm.id && !r.emergency);
      if (!rs.length) return;
      const open = app.openFamilies.has(fm.id);
      sections.push(`<section class="list"><button class="fam-head" data-act="fam" data-f="${fm.id}" aria-expanded="${open}"><span class="h2">${esc(fm.plural)}</span><span class="small muted">${rs.length} ${open ? "▾" : "▸"}</span></button>${open ? rs.map(row).join("") : ""}</section>`);
    });
    const em = list.filter((r) => r.emergency);
    if (em.length) {
      const open = app.openFamilies.has("_em");
      sections.push(`<section class="list"><button class="fam-head" data-act="fam" data-f="_em" aria-expanded="${open}"><span class="h2">Emergency · 15 min</span><span class="small muted">${em.length} ${open ? "▾" : "▸"}</span></button>${open ? em.map(row).join("") : ""}</section>`);
    }
  }
  const chip = (id, label) => `<button class="chip ${f === id ? "on" : ""}" data-act="rfilter" data-f="${id}">${label}</button>`;
  return `${header(`${app.recipes.length} dinners`, "Recipes", settingsButton())}
    <label class="search" style="margin-bottom:10px">${icon("search", 18)}<input type="search" placeholder="Search lentils, curry, quick…" aria-label="Search recipes" value="${esc(app.recipeQuery)}" data-input="rsearch"></label>
    <div class="chips" style="margin-bottom:12px">${chip("all", "All")}${chip("quick", "Quick")}${chip("fav", "Favourites")}${chip("hidden", "Hidden")}</div>
    <div class="stack">${sections.join("")}</div>`;
}

// ----- Settings -----
function viewSettings() {
  const s = settings();
  const stepper = (act, idx, val, step, fmt = (v) => v) => `<div class="stepper"><button data-act="${act}" data-i="${idx}" data-d="${-step}" aria-label="Less">−</button><span>${fmt(val)}</span><button data-act="${act}" data-i="${idx}" data-d="${step}" aria-label="More">+</button></div>`;

  const themeRows = DOW_LONG.map((d, i) => { const t = themeById(themeIdForDow(i));
    return `<button class="rrow" data-act="themePick" data-i="${i}" style="padding:10px 16px"><span class="grow">${d}</span><span class="${t ? "" : "muted"}">${esc(t ? t.name : "No theme")}</span><span class="muted">›</span></button>`; }).join("");
  const shopsOn = s.shops || SHOP_ORDER;
  const avoid = s.avoid || [];
  const inf = app.state.inflation || {};
  const infLine = s.inflation === false ? ""
    : inf.factor ? `Food prices ${inf.factor >= 1 ? "up" : "down"} ${Math.abs((inf.factor - 1) * 100).toFixed(1)}% since ${esc(inf.base || "")} (ONS, latest ${esc(inf.latest || "")}).${inf.error ? " Last check failed." : ""}`
    : inf.error ? "Couldn't reach the ONS yet." : app.mode === "live" ? "ONS food price index, checked weekly" : "Not in the preview";
  const saving = (() => { const keepB = s.budget, keepSw = app.state.swaps; s.budget = false; app.state.swaps = {};
    const off = buildList(currentWeek()).filter((i) => i.active && !i.cupboard).reduce((t, i) => t + (i.cost || 0), 0);
    s.budget = true; const on = buildList(currentWeek()).filter((i) => i.active && !i.cupboard).reduce((t, i) => t + (i.cost || 0), 0);
    s.budget = keepB; app.state.swaps = keepSw; return off - on; })();
  const catalogue = `<datalist id="catalogue">${Object.values(app.ing.items).map((m) => `<option value="${esc(m.n)}">`).join("")}</datalist>`;


  return `${header("Settings", "Your household", `<button class="icon-btn" data-act="go" data-to="${app.prevTab || "tonight"}" aria-label="Back">${icon("left", 18)}</button>`)}
    ${updateCard()}
    ${accountSection()}

    ${whoYouCookFor()}

    <p class="section-label">Food</p>
    <div class="list">
      <div class="stack ${nudges().includes("allergies") ? "nudge-field" : ""}" style="padding:14px 16px;gap:8px"><b>Allergies: never include</b>
        <div class="chips wrap">${Object.entries(app.ing.allergens).map(([k, v]) => `<button class="chip ${avoid.includes(k) ? "on" : ""}" data-act="avoid" data-k="${k}">${esc(v)}</button>`).join("")}</div>
        <span class="small muted">Recipes with these are hidden. Shopping items that sometimes contain them get a "Check" label.${app.host === "Cloudflare" ? ` They're stored with your household so the planner can avoid them. Untick any time to remove them.` : ""}</span>
        ${nudges().includes("allergies") ? `<button class="btn sm" style="align-self:flex-start" data-act="allergyDone">No allergies in our household</button>` : ""}</div>
      <div class="stack" style="padding:14px 16px;gap:8px"><b>Dislikes</b><input class="input" value="${esc(s.dislikes || "")}" placeholder="e.g. mushroom, feta" data-set="text" data-f="dislikes"></div>
      <div class="stack" style="padding:14px 16px 8px;gap:4px"><b>Theme nights</b></div>
      <div style="padding-bottom:8px">${themeRows}</div>
      <div class="stack" style="padding:14px 16px;gap:10px">
        <label><span class="small muted">Usual dinner time</span><input class="input" type="time" value="${esc(s.dinnerTime || "")}" data-set="text" data-f="dinnerTime"></label>
        <label><span class="small muted">Weeknight cooking time</span><select class="input" data-set="num" data-f="weeknightMax">${[20, 30, 40, 50, 60].map((m) => `<option value="${m}" ${+s.weeknightMax === m ? "selected" : ""}>Up to ${m} minutes</option>`).join("")}</select></label>
        <label><span class="small muted">Weekend cooking time</span><select class="input" data-set="num" data-f="weekendMax">${[40, 60, 90, 120].map((m) => `<option value="${m}" ${+s.weekendMax === m ? "selected" : ""}>Up to ${m} minutes</option>`).join("")}</select></label>
        <label><span class="small muted">Week starts on</span><select class="input" data-set="num" data-f="weekStartDay">${DOW_LONG.map((d, i) => `<option value="${i}" ${(+s.weekStartDay || 0) === i ? "selected" : ""}>${d}</option>`).join("")}</select></label>
      </div>
      <div class="stack" style="padding:14px 16px;gap:4px"><b>Always</b><span class="small muted">Fully vegetarian: no meat, fish, gelatine, anchovy (so no Worcestershire), cochineal (E120) or animal rennet (so no Parmesan or Grana Padano). Free-range eggs, cheese with the V symbol.</span></div>
    </div>

    <p class="section-label">Shopping &amp; prices</p>
    <div class="list">
      <div class="stack" style="padding:14px 16px;gap:8px"><b>Shops you use</b>
        <span class="small muted">${shopsOn.length === SHOP_ORDER.length ? "All selected. Tap any you don't use to turn it off." : `${shopsOn.length} of ${SHOP_ORDER.length} selected. Tap to turn on or off.`}</span>
        <div class="chips wrap">${SHOP_ORDER.map((k) => { const on = shopsOn.includes(k); return `<button class="chip pick ${on ? "on" : ""}" data-act="shopToggle" data-k="${k}" aria-pressed="${on}">${on ? icon("check", 14) : ""}${esc(shopName(k))}</button>`; }).join("")}</div></div>
      <label class="stack" style="padding:14px 16px;gap:6px"><b>Estimate prices at</b><select class="input" data-set="text" data-f="priceShop">${enabledShops().map((k) => `<option value="${k}" ${priceShop() === k ? "selected" : ""}>${esc(shopName(k, false))}</option>`).join("")}</select>
        <span class="small muted">${esc(app.ing.prices_note || "")}</span></label>
      <label class="row" style="padding:13px 16px"><span class="grow"><b>Budget mode</b><br><span class="small muted">Swaps like frozen veg, garlic paste, bottled lemon${saving > 0.05 ? ` · about ${money(saving)} ${s.budget ? "saved" : "cheaper"} this week` : ""}</span></span>
        <span class="switch"><input type="checkbox" data-set="bool" data-f="budget" ${s.budget ? "checked" : ""}><i></i></span></label>
      <label class="row" style="padding:13px 16px"><span class="grow"><b>Track food inflation</b>${infLine ? `<br><span class="small muted">${infLine}</span>` : ""}</span>
        <span class="switch"><input type="checkbox" data-set="bool" data-f="inflation" ${s.inflation !== false ? "checked" : ""}><i></i></span></label>
      <button class="row" style="padding:13px 16px;width:100%;border:0;background:none;text-align:left" data-act="aisles"><span class="grow"><b>Aisle order</b></span><span aria-hidden="true">›</span></button>
      <button class="row" style="padding:13px 16px;width:100%;border:0;background:none;text-align:left" data-act="rack"><span class="grow"><b>Spice rack &amp; cupboard</b></span><span aria-hidden="true">›</span></button>
    </div>

    <p class="section-label">Around the house</p>
    <div class="list"><label class="row" style="padding:13px 16px"><span class="grow"><b>Life is hard</b><br><span class="small muted">Adds a tab for everyday routines, like the dog fed or the bins out. See when each was last done, and by whom.</span></span>
      <span class="switch"><input type="checkbox" data-set="bool" data-f="lifeOn" ${s.lifeOn ? "checked" : ""}><i></i></span></label></div>

    ${catalogue}
    <p class="section-label">Your data</p>
    <div class="list"><div class="row" style="padding:13px 16px"><span class="grow"><b>Download a backup</b></span><button class="btn sm" data-act="exportData">${icon("download", 16)}Save</button></div>
      <div class="row" style="padding:13px 16px"><span class="grow"><b>Restore from a backup</b><br><span class="small muted">Replaces everything here, for everyone in your household</span></span><label class="btn sm">Choose file<input type="file" accept="application/json,.json" data-set="importFile" hidden></label></div></div>
    ${app.host === "Cloudflare" ? `<p class="section-label">Help</p>
    <div class="list"><button class="rrow" data-act="report"><span class="grow"><b>Report a problem</b></span><span class="muted">›</span></button></div>` : `<p class="section-label">Recipe feedback</p>
    <div class="list"><div class="row" style="padding:13px 16px"><span class="grow"><b>Copy your feedback</b><br><span class="small muted">Paste it to Claude</span></span><button class="btn sm" data-act="copyFeedback">${icon("copy", 16)}Copy</button></div></div>`}
    <p class="section-label">About</p>
    <div class="list"><button class="rrow" data-act="about"><span class="grow"><b>About FoodIsHard, your data and safety</b><br><span class="small muted">Includes notes on allergies and babies</span></span><span class="muted">›</span></button></div>
    ${accountFooter()}
    <p class="small muted" style="text-align:center;margin-top:24px">${app.mode === "live" ? `Synced through ${esc(app.host || "Home Assistant")}${app.user ? ` · signed in as ${esc(app.user)}` : ""}` : app.mode === "preview" ? "Previewing as a new household: nothing is saved" : "Preview: saved on this device only"} · FoodIsHard ${APP_VERSION}</p>`;
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------
// Panels and cooking mode add a history entry, so the phone's Back button closes them
// instead of leaving the page underneath.
let sheetPushed = false, cookPushed = false;
/** Open the panel. keepScroll: redrawing the panel that's already open, so stay where you were. */
function openSheet(html, { keepScroll = false } = {}) {
  app.sheetBack = null; app.panel = null; // a panel opened from another one sets this afterwards, so closing it goes back
  const panel = $(".sheet-panel"), top = keepScroll && !$("#sheet").hidden ? panel.scrollTop : 0;
  $("#sheetBody").innerHTML = html; hydrateIcons($("#sheetBody"));
  $("#sheet").hidden = false; panel.scrollTop = top; document.body.style.overflow = "hidden";
  if (!sheetPushed) { history.pushState({ panel: "sheet" }, ""); sheetPushed = true; }
}
/** Close the panel. fromBack: Back was pressed. navigating: we're about to change page, so don't step history back. */
function closeSheet({ fromBack = false, navigating = false } = {}) {
  if ($("#sheet").hidden) return;
  if (app.sheetBack && !navigating) { // e.g. Swap opened from a recipe: closing it shows the recipe again
    const back = app.sheetBack; app.sheetBack = null;
    if (fromBack) sheetPushed = false; // the phone's Back used up the history entry, so the recipe gets a new one
    back(); return;
  }
  $("#sheet").hidden = true; document.body.style.overflow = "";
  if (sheetPushed) {
    sheetPushed = false;
    if (navigating) history.replaceState(null, "");
    else if (!fromBack) history.back();
  }
}
window.addEventListener("popstate", (e) => {
  if (e.state && e.state.fih === "root") return leavingApp();
  if (!$("#sheet").hidden) closeSheet({ fromBack: true });
  else if (app.cook) stopCooking({ fromBack: true });
});
/* Online, in a browser tab, the page before the app is the Cloudflare sign-in page. Pressing Back from the app's first
   page used to land there ("Your code session is no longer available"), which looks like being signed out. So the app
   keeps one extra step at its start: the first Back stays in the app with a hint, a second Back leaves.
   Installed (home-screen) apps start fresh with no sign-in page behind them, so they're left alone. */
/** Admin: see the app exactly as a brand-new household would. A blank household lives only on screen: nothing is
    sent, saved or synced, and server updates are paused. "Back to my household" (or reloading) puts everything back. */
function previewNew(on) {
  const b = $("#banner");
  if (on && app.mode === "live") {
    app.previewSaved = app.state; app.mode = "preview"; app.previewStartSeen = false; app.previewLockSeen = false;
    app.previewTerms = app.termsNeeded; app.termsNeeded = { version: "preview", changes: [] }; // show the agreement screen too
    app.state = { ...clone(app.defaults), rev: 0 };
    ["plans", "prefs", "checks", "extras", "prices", "swaps", "shopFor", "shopPref"].forEach((k) => { app.state[k] = app.state[k] || {}; });
    b.hidden = false; b.innerHTML = `Previewing as a new household. Nothing here is saved. <button class="btn sm" style="margin-left:8px" data-act="previewEnd">Back to my household</button>`;
  } else if (!on && app.mode === "preview") {
    app.state = app.previewSaved; app.previewSaved = null; app.mode = "live";
    app.termsNeeded = app.previewTerms || null; app.previewTerms = null; termsUngate();
    b.hidden = true; b.innerHTML = "";
  } else return;
  app.weekStart = currentWeek(); app.undoShuffle = null; app.shopAhead = 0; app.selecting.clear();
  closeSheet({ navigating: true }); go("tonight"); render(); window.scrollTo(0, 0);
  if (on) termsGate();
  toast(on ? "This is what a new household sees" : "Back to your household");
}
/** The first time someone picks a dinner for a day on the Week tab, point out the lock (it keeps a day when shuffling).
    Shown once per phone (or once per preview). Stays at least 3 seconds; after that, any touch dismisses it. */
function lockTip(i) {
  if (app.tab !== "week" || app.lockTip != null) return;
  const seen = app.mode === "preview" ? app.previewLockSeen : load("fihLockTip", false);
  const usedLock = Object.values(app.state.plans || {}).some((p) => p && Array.isArray(p.days) && p.days.some((d) => d && d.locked));
  if (seen || usedLock) return; // they've already found the lock
  if (app.mode === "preview") app.previewLockSeen = true; else store("fihLockTip", true);
  app.lockTip = i; render();
  setTimeout(() => {
    const done = () => { document.removeEventListener("pointerdown", done, true); app.lockTip = null; render(); };
    document.addEventListener("pointerdown", done, true);
  }, 3000);
}
/** A locked day can't be changed from its buttons: the lock gives a little shake and glow instead. */
function lockedDay(i) {
  if (!(planFor(app.weekStart)[i] || {}).locked) return false;
  const el = $(`[data-act="lock"][data-i="${i}"]`);
  if (el) { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); setTimeout(() => el.classList.remove("shake"), 1000); }
  return true;
}
/** Online: agreeing to the terms of use. The server says who needs to (new joiners, and everyone after the admin asks
    with a list of what's changed). The privacy policy is linked as information, not something to agree to. */
const SITE = "https://foodishard.uk/";
function termsGate() {
  const need = app.termsNeeded;
  if (app.host !== "Cloudflare" || !["live", "preview"].includes(app.mode) || !need || $("#termsGate")) return;
  const changes = Array.isArray(need.changes) ? need.changes : [];
  document.body.insertAdjacentHTML("beforeend", `<div id="termsGate" class="terms-gate" role="dialog" aria-modal="true" aria-labelledby="termsTitle"><div class="terms-inner">
    <img src="icon-192.png" alt="" width="56" height="56" style="border-radius:14px">
    <h1 class="title" id="termsTitle" style="font-size:28px;margin:14px 0 6px">${changes.length ? "The terms have been updated" : "Before you start"}</h1>
    ${changes.length ? `<p class="muted" style="margin:0 0 10px">Please have a look at what's changed and confirm you still agree. What's changed:</p>
    <ul class="terms-points terms-changes">${changes.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
    <p class="muted" style="margin:16px 0 10px">As a reminder, the key points:</p>` : `<p class="muted" style="margin:0 0 14px">FoodIsHard is a free meal planner, run by one person for friends and family. Please read the terms of use before using it. The key points:</p>`}
    <ul class="terms-points">
      <li>Recipes, nutrition and baby notes are <b>general guidance</b>, not medical or professional advice.</li>
      <li>The allergy settings only hide recipes that list an allergen. <b>Always check the label</b> of what you buy.</li>
      <li>For babies, follow NHS weaning guidance and your health visitor.</li>
      <li>It's free and provided as-is, and may change or stop at any time.</li>
    </ul>
    <p style="margin:14px 0"><a href="${SITE}terms.html" target="_blank" rel="noopener">Read the terms of use</a> · <a href="${SITE}privacy.html" target="_blank" rel="noopener">Privacy policy</a></p>
    <label class="row terms-tick"><input type="checkbox" id="termsTick" data-act="termsTick"><span>I've read and agree to the <b>terms of use</b>, including the food safety notes.</span></label>
    <p class="small muted" style="margin:8px 0 18px">How your information is looked after is explained in the privacy policy.</p>
    <button class="btn lg primary block" id="termsGo" data-act="termsAccept" disabled>Continue</button>
  </div></div>`);
  document.body.classList.add("gated");
  [...document.body.children].forEach((el) => { if (el.id !== "termsGate" && !el.classList.contains("toast")) el.inert = true; }); // nothing behind it can be reached
}
function termsUngate() {
  const g = $("#termsGate"); if (g) g.remove();
  document.body.classList.remove("gated");
  [...document.body.children].forEach((el) => { el.inert = false; });
}
/** The server's latest word on the terms (from a sync): close the screen if agreed elsewhere, or show it if asked again. */
function termsUpdate(need) {
  app.termsNeeded = need || null;
  store(HOST_KEY, { ...load(HOST_KEY, {}), termsNeeded: app.termsNeeded });
  if (!app.termsNeeded) termsUngate(); else termsGate();
}
async function acceptTerms() {
  if (!$("#termsTick") || !$("#termsTick").checked) return;
  const btn = $("#termsGo"); btn.disabled = true;
  if (app.mode === "preview") { app.termsNeeded = null; termsUngate(); allergyConsentCheck(); return; } // preview: nothing is recorded
  try {
    const res = await accountCall("api/terms/accept", { version: app.termsNeeded.version });
    termsUpdate(res.termsNeeded);
    flushQueue(); // anything changed before agreeing (e.g. offline) can go now
    allergyConsentCheck();
  } catch (e) { btn.disabled = false; toast(/changed/.test(e.message) ? e.message : "Couldn't save that. Check your connection and try again."); }
}
/* Allergies are health information (UK GDPR "special category"), so the online version asks before storing them: once
   per household, the first time one is ticked. Households that ticked allergies before this existed are asked once too. */
function needsAllergyConsent() { return app.host === "Cloudflare" && ["live", "preview"].includes(app.mode) && !settings().allergyConsent; }
const ALLERGY_CONSENT_TEXT = `Allergies are health information. To hide recipes that contain them, FoodIsHard stores the allergies you tick with your household, so everyone in it can see them. Only tick allergies for the people you cook for, with their agreement. You can untick them at any time.`;
function openAllergyConsent(k) {
  openSheet(`<p class="eyebrow">Allergies</p><h1 class="title" style="font-size:26px">Store this allergy?</h1>
    <p>${ALLERGY_CONSENT_TEXT}</p>
    <div class="stack" style="margin-top:12px"><button class="btn lg primary" data-act="allergyAgree" data-k="${esc(k)}">Yes, store it</button><button class="btn" data-close>Cancel</button></div>`);
}
function allergyConsentCheck() {
  if (!needsAllergyConsent() || !(settings().avoid || []).length || app.termsNeeded || app.allergyAsked) return;
  app.allergyAsked = true; // once per visit; it's recorded as soon as they choose
  const names = (settings().avoid || []).map((k) => app.ing.allergens[k] || k);
  openSheet(`<p class="eyebrow">Allergies</p><h1 class="title" style="font-size:26px">Keep your allergy settings?</h1>
    <p>Your household has these allergies ticked: <b>${esc(joinNames(names))}</b>.</p>
    <p>${ALLERGY_CONSENT_TEXT}</p>
    <div class="stack" style="margin-top:12px"><button class="btn lg primary" data-act="allergyAgree">Keep them</button><button class="btn" data-act="allergyClear">Remove them</button></div>`);
}
/** Opened between 1am and 4am (night feeds): a quiet nod, once a night. */
function nightOwl() {
  const now = new Date(), h = now.getHours(), night = now.toDateString();
  if (h < 1 || h > 3 || load("fihNight", "") === night) return;
  store("fihNight", night);
  setTimeout(() => toast("Planning dinner at this hour? Respect."), 1500);
}
function backGuard() {
  if (app.host !== "Cloudflare" || matchMedia("(display-mode: standalone)").matches || navigator.standalone) return;
  try { if (sessionStorage.getItem("fihGuard")) return; sessionStorage.setItem("fihGuard", "1"); } catch { return; } // once per tab, not on every reload
  history.replaceState({ fih: "root" }, "");
  history.pushState({ fih: "app" }, "");
}
function leavingApp() {
  if (app.leaveArmed) { app.leaveArmed = false; history.back(); return; } // second Back: really leave
  app.leaveArmed = true; setTimeout(() => { app.leaveArmed = false; }, 3000);
  history.pushState({ fih: "app" }, "");
  if (!$("#sheet").hidden) closeSheet({ fromBack: true, navigating: true });
  toast("Press back again to leave FoodIsHard");
}

function openRecipe(id, { pickDay = null, keepScroll = false, day = null } = {}) {
  const r = app.byId[id]; if (!r) return;
  if (!day && keepScroll && app.recipeDay && app.recipeDay.id === id) day = app.recipeDay; // redrawing the same panel
  const planned = day && planFor(day.week)[day.i], onDay = planned && planned.recipe === id ? day : null;
  app.recipeDay = onDay ? { ...onDay, id } : null;
  // that day's guests or cook-double when opened from the plan; otherwise tonight's if it's tonight's dinner
  const factor = onDay ? dayFactor(planned) : factorFor(id), p = prefsFor(id);
  const ings = effectiveIngredients(r), main = ings.filter((i) => i.q != null && !ingMeta(i.k).c), rack = ings.filter((i) => i.q != null && ingMeta(i.k).c), cupboard = ings.filter((i) => i.q == null);
  const fb = feedbackFor(id), lastFb = fb[fb.length - 1];
  const blocked = blockedBy(r), cost = recipeCost(r), avoid = avoidList().map((a) => app.ing.allergens[a] || a);
  const ingHTML = main.map((i) => {
    const m = ingMeta(i.k), chips = [];
    if ((m.f || []).includes("veg")) chips.push(`<span class="pill warn">Check for V</span>`);
    if ((m.f || []).includes("welfare")) chips.push(`<span class="pill accent">Free-range</span>`);
    checkLabelFor(i.k).forEach((a) => chips.push(`<span class="pill warm">Check: ${esc(a.toLowerCase())}</span>`));
    const canSwap = (ingMeta(i.orig).sw || []).length;
    return `<li><span>${esc(m.n)} ${chips.join(" ")}${i.from ? `<br><span class="small muted">instead of ${esc(ingMeta(i.from).n.toLowerCase())}</span>` : ""}
      ${canSwap ? `<br><button class="btn sm" style="margin-top:6px" data-act="swapIng" data-k="${esc(i.orig)}" data-reopen="${id}">Swap</button>` : ""}</span>
      <span class="muted" style="white-space:nowrap">${esc(fmtQty(i.q * factor, i.u))}</span></li>`;
  }).join("");
  const dayOpts = DOW_LONG.map((_, i) => { const d = addDays(parseISO(app.weekStart), i); return `<option value="${i}">${DOW_LONG[mondayIndex(d)]} ${d.getDate()}</option>`; }).join("");
  const steps = visibleSteps(r);
  openSheet(`
    <p class="eyebrow">${esc(r.emergency ? "Quick meal" : family(r.family).name)}</p>
    <h1 class="title" style="font-size:27px">${esc(r.name)}</h1>
    <p class="muted" style="margin:6px 0 10px">${esc(r.blurb)}</p>
    ${blocked.length ? `<p class="pill warm" style="white-space:normal;padding:8px 12px">Contains ${esc(blocked.join(", ").toLowerCase())}, so it's hidden from your plans.</p>` : ""}
    ${lastFb ? `<p class="small muted" style="margin:0 0 8px">Cooked ${fb.length}× · last time: ${({ loved: "loved it", fine: "fine", never: "not again" })[lastFb.rating] || ""}${lastFb.tags.length ? ` (${esc(lastFb.tags.join(", ").toLowerCase())})` : ""}${lastFb.note ? `, "${esc(lastFb.note)}"` : ""}</p>` : ""}
    <div class="row wrap" style="gap:6px;margin-bottom:12px">${cookedIt(id) ? `<span class="pill accent">✓ Cooked it</span>` : ""}<span class="pill">${r.time} min · ${r.hands || r.time} hands-on</span><span class="pill">${money(cost)} a portion · ${money(cost * factor)} in all</span>
      ${avoid.length && !blocked.length ? `<span class="pill warm">No ${esc(avoid.join(", ").toLowerCase())}</span>` : ""}</div>
    <div class="tiles" style="margin-bottom:12px">${household().adults.map((pp, idx) => `<button class="tile card" style="background:var(--surface)" data-act="macros" data-id="${id}" data-who="${idx}"><span class="k muted"><span>${esc(pp.name)}</span><span>›</span></span><span class="v">${kcalFor(r, pp.portion).toLocaleString("en-GB")} kcal</span></button>`).join("")}</div>
    <div class="row wrap" style="margin-bottom:6px">
      ${pickDay != null ? `<button class="btn primary" data-act="put" data-id="${id}" data-i="${pickDay}">Use for this day</button>` : `<button class="btn primary" data-act="cook" data-id="${id}"${onDay ? ` data-week="${onDay.week}" data-i="${onDay.i}"` : ""}>${icon("play", 16)}Cook</button>`}
      <button class="btn ${p.fav ? "primary" : ""}" data-act="pref" data-id="${id}" data-f="fav" data-v="${p.fav ? 0 : 1}">${icon("heart", 16)}${p.fav ? "Favourite" : "Favourite"}</button>
      <button class="btn" data-act="pref" data-id="${id}" data-f="ban" data-v="${p.ban ? 0 : 1}">${icon("ban", 16)}${p.ban ? "Allow again" : "Never again"}</button>
      ${pickDay == null ? `<select class="input" style="width:auto;min-height:44px" data-set="putDay" data-id="${id}"><option value="">Add to this week…</option>${dayOpts}</select>` : ""}
    </div>
    <p class="section-label">Ingredients · for ${niceNumber(factor)} portions${onDay && dayAdjustText(planned) ? ` (${DOW_LONG[mondayIndex(addDays(parseISO(onDay.week), onDay.i))]}: ${esc(dayAdjustText(planned))})` : ""}</p>
    <div class="card"><ul class="ing-list">${ingHTML}</ul></div>
    ${rack.length || cupboard.length ? `<p class="section-label">From the spice rack &amp; cupboard</p><div class="card"><ul class="ing-list">${rack.map((i) => `<li><span>${esc(ingMeta(i.k).n)}</span><span class="muted" style="white-space:nowrap">${esc(fmtQty(i.q * factor, i.u))}</span></li>`).join("")}${cupboard.map((i) => `<li><span>${esc(ingMeta(i.k).n)}</span><span class="muted">to taste</span></li>`).join("")}</ul></div>` : ""}
    ${kids().length ? `<p class="section-label">Little ones</p><div class="stack" style="gap:8px">${kidNotes(r, { withRules: true })}</div>` : ""}
    <p class="section-label">Method</p>
    <ol class="steps">${steps.map((s) => `<li class="${s.baby ? "baby" : ""}">${s.baby ? `<span class="kid-chips">${kidChips()}</span>` : ""}${esc(personaliseStep(scaleStep(s.t, factor)))}</li>`).join("")}</ol>
    ${storingBox(r)}`, { keepScroll });
}

function openMacros(id, who) {
  const r = app.byId[id]; if (!r) return;
  const { adults, kids: little } = household();
  const per = nutritionPerPortion(r);
  const tabs = adults.map((p, i) => `<button class="${String(who) === String(i) ? "on" : ""}" data-act="macros" data-id="${id}" data-who="${i}">${esc(p.name)} · ${(+p.portion).toFixed(1).replace(".0", "")}</button>`).join("")
    + little.map((k) => `<button class="${who === `kid:${k.id}` ? "on" : ""}" data-act="macros" data-id="${id}" data-who="kid:${esc(k.id)}">${esc(k.name || "Little one")}</button>`).join("");
  let body;
  const kid = String(who).startsWith("kid:") && little.find((k) => `kid:${k.id}` === who);
  if (kid) {
    const bi = kidInfo(kid), n = nutritionPerPortion(r, { forBaby: true }), f = +kid.portion || 0.25;
    const salt = n.salt * f, pct = Math.min(100, Math.round(salt / bi.saltLimit * 100));
    body = `<div class="row" style="align-items:baseline;gap:8px"><span class="big-number">${Math.round(n.kcal * f)}</span><span class="muted">kcal</span></div>
      <div class="list"><div class="stack" style="padding:13px 16px;gap:6px"><div class="row between"><b>Salt</b><b>${salt.toFixed(2)} g</b></div>
        <div class="progress"><i style="width:${pct}%;background:${pct > 60 ? "var(--warm)" : "var(--baby)"}"></i></div>
        <span class="small muted">${pct}% of the ${bi.saltLimit} g daily maximum at their age (NHS). Counted before seasoning, because their portion comes out first.</span></div>
        <div class="nrow"><span>Protein</span><span>${(n.protein * f).toFixed(1)} g</span></div>
        <div class="nrow"><span>Fibre</span><span>${(n.fibre * f).toFixed(1)} g</span></div></div>`;
  } else {
    const p = adults[+who] || adults[0], f = +p.portion || 1, goal = p.goal || 40;
    const v = (k) => per[k] * f, prot = v("protein"), pct = Math.min(100, Math.round(prot / goal * 100));
    body = `<div class="row" style="align-items:baseline;gap:8px"><span class="big-number">${Math.round(v("kcal")).toLocaleString("en-GB")}</span><span class="muted">kcal</span></div>
      <div class="list">
        <div class="stack" style="padding:13px 16px;gap:6px"><div class="row between"><b>Protein</b><b>${Math.round(prot)} g</b></div>
          <div class="progress"><i style="width:${pct}%"></i></div><span class="small muted">${pct}% of a ${goal} g dinner goal</span></div>
        <div class="nrow"><b>Carbohydrate</b><span>${Math.round(v("carbs"))} g</span></div><div class="nrow sub"><span>of which sugars</span><span>${Math.round(v("sugars"))} g</span></div>
        <div class="nrow"><b>Fat</b><span>${Math.round(v("fat"))} g</span></div><div class="nrow sub"><span>of which saturates</span><span>${Math.round(v("saturates"))} g</span></div>
        <div class="nrow"><b>Fibre</b><span>${Math.round(v("fibre"))} g</span></div>
        <div class="nrow"><b>Salt</b><span>${v("salt").toFixed(1)} g</span></div></div>`;
  }
  openSheet(`<p class="eyebrow">${esc(r.name)} · per portion</p><h1 class="title" style="font-size:26px;margin-bottom:12px">What's in it</h1>
    <div class="seg" role="tablist" style="margin-bottom:14px">${tabs}</div><div class="stack">${body}
    <p class="small muted" style="margin:0">Estimates. Brands vary.</p>
    <button class="btn" data-act="recipe" data-id="${id}">Back to the recipe</button></div>`);
}

const sheetSearch = (placeholder) => `<label class="search" style="margin:4px 0 12px">${icon("search", 18)}<input type="search" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" data-input="sfilter" autocomplete="off"></label>`;
function openPicker(i, { emergency = false } = {}) {
  const week = app.weekStart, date = addDays(parseISO(week), i), maxT = maxTimeFor(week, i), theme = emergency ? null : themeFor(week, i);
  const fits = (r) => !!theme && themeMatch(theme, r);
  const list = app.recipes.filter((r) => usable(r) && (!emergency || r.emergency))
    .sort((a, b) => (fits(b) - fits(a)) || (a.time > maxT) - (b.time > maxT) || a.name.localeCompare(b.name));
  const row = (r) => `<button class="rrow" data-act="put" data-id="${r.id}" data-i="${i}" data-text="${esc(`${r.name} ${family(r.family).name} ${r.cuisine} ${r.ingredients.map((x) => ingMeta(x.k).n).join(" ")}`.toLowerCase())}"><span class="grow"><b>${esc(r.name)}</b><br><span class="small muted">${esc(r.emergency ? "Quick" : family(r.family).name)} · ${r.time} min · ${money(recipeCost(r))} a portion</span></span>${prefsFor(r.id).fav ? "♥" : ""}</button>`;
  const themed = list.filter(fits), rest = list.filter((r) => !fits(r));
  openSheet(`<p class="eyebrow">${DOW_LONG[mondayIndex(date)]} ${date.getDate()}</p><h1 class="title" style="font-size:26px">${emergency ? "Something quick" : "Choose a dinner"}</h1>
    <p class="muted">Up to ${maxT} minutes suits this day.</p>${sheetSearch("Search dinners or ingredients")}
    ${themed.length ? `<p class="section-label" data-group>${esc(theme.name)}</p><div class="list" style="margin-bottom:12px">${themed.map(row).join("")}</div><p class="section-label" data-group>Everything else</p>` : ""}
    <div class="list">${rest.map(row).join("")}</div><div class="empty" data-none hidden>Nothing matches that.</div>`);
}

function openThemePicker(dow) {
  const cur = themeIdForDow(dow);
  const groups = [["Food", "By type of dinner"], ["Cuisine", "By cuisine"], ["Other", "Something different"]];
  const row = (t) => { const n = themeRecipes(t).length;
    return `<button class="rrow" data-act="setTheme" data-i="${dow}" data-t="${t.id}" data-text="${esc(`${t.name} ${t.blurb}`.toLowerCase())}"><span class="grow"><b>${esc(t.name)}</b><br><span class="small muted">${esc(t.blurb)} · ${n ? `${n} dinner${n === 1 ? "" : "s"}` : "none yet"}</span></span>${cur === t.id ? `<span class="pill accent">✓</span>` : ""}</button>`; };
  openSheet(`<p class="eyebrow">Theme night</p><h1 class="title" style="font-size:26px;margin-bottom:12px">${DOW_LONG[dow]}</h1>
    ${sheetSearch("Search themes")}
    <div class="list" style="margin-bottom:12px"><button class="rrow" data-act="setTheme" data-i="${dow}" data-t="" data-text="no theme random"><span class="grow"><b>No theme</b></span>${cur ? "" : `<span class="pill accent">✓</span>`}</button></div>
    ${groups.map(([g, label]) => { const ts = app.themes.filter((t) => (t.group || "Other") === g); return ts.length ? `<p class="section-label" data-group>${label}</p><div class="list" style="margin-bottom:12px">${ts.map(row).join("")}</div>` : ""; }).join("")}
    <div class="empty" data-none hidden>No themes match that.</div>`);
}

function openSkip(i) {
  const date = addDays(parseISO(app.weekStart), i);
  const reasons = ["Eating out", "At friends'", "Takeaway", "Away"];
  openSheet(`<h1 class="title" style="font-size:26px;margin-bottom:14px">Skip ${DOW_LONG[mondayIndex(date)]}?</h1>
    <form data-form="skip" data-i="${i}" class="stack"><div class="chips wrap">${reasons.map((r) => `<button type="button" class="chip" data-act="skipReason" data-r="${esc(r)}">${esc(r)}</button>`).join("")}</div>
    <input class="input" name="note" placeholder="Or type a note (optional)" autocomplete="off"><button class="btn lg primary">Skip this day</button></form>`);
}

function openSwap(k, reopen, itemKey = null) {
  const m = ingMeta(k), r = reopen ? app.byId[reopen] : null, current = resolveIng(k, r).k;
  const scope = r ? `${r.id}:${k}` : k;
  const row = (altKey, why, isOrig) => {
    const am = ingMeta(altKey), bp = basePrice(altKey), on = current === altKey;
    return `<button class="rrow" data-act="setSwap" data-k="${esc(scope)}" data-alt="${isOrig ? "" : esc(altKey)}" ${reopen ? `data-reopen="${esc(reopen)}"` : ""}>
      <span class="grow"><b>${on ? "✓ " : ""}${esc(am.n)}</b>${isOrig ? ` <span class="small muted">(original)</span>` : ""}<br><span class="small muted">${esc(why)}${bp && am.pk ? ` · ${money(bp.p * shopMult(priceShop()))} per ${esc(fmtQty(am.pk[0], am.pk[1]))}` : ""}</span></span></button>`;
  };
  openSheet(`<h1 class="title" style="font-size:26px">Swap ${esc(m.n.toLowerCase())}</h1>
    <p class="muted">${r ? `Just for ${esc(r.name)}.` : "For every recipe that uses it."}</p>
    <div class="list">${row(k, "As the recipe says", true)}${(m.sw || []).map((o) => row(o.k, o.why, false)).join("")}</div>`);
  if (reopen) app.sheetBack = () => openRecipe(reopen);
  else if (itemKey) app.sheetBack = () => openItem(itemKey);
}
/** On a shopping item with some left over: recipes that use up the rest, not already planned this week. */
function useUpCard(it) {
  const ideas = useUpIdeas(it), lunches = it.k ? lunchIdeas(it.k) : [];
  if (!ideas.length && !lunches.length) return "";
  // How much is left decides which comes first: over half a pack is enough for a dinner; less suits a lunch.
  const share = it.k ? partPacks(planFor(shopWeek())).get(it.k) || 0 : 0, lots = share > 0.5;
  const swapHead = `<b>Swap a dinner to use it</b><span class="small muted">This replaces that day's dinner and may add things to your list.</span>`;
  // how much is left, said once at the top, whichever ideas come first
  const amount = `<div class="card row leftover-amt" style="padding:12px 16px;gap:10px"><span aria-hidden="true" style="font-size:20px">🧺</span><span class="grow"><b>${esc(capFirst(it.leftover.replace(/ left over$/, "")))} left</b><br><span class="small muted">${esc(it.name)}, after this week's dinners</span>${keepAdvice(it.k)}</span></div>`;
  const dinners = ideas.length ? `<div class="list">${ideas.map((x) => `<button class="rrow" data-act="useUpPick" data-id="${x.r.id}" data-item="${esc(it.key)}"><span class="grow">${esc(x.r.name)}<br><span class="small" style="color:${x.whole ? "var(--accent)" : "var(--muted)"}">${useUpCover(x)}</span></span><span class="small muted">${x.r.time} min</span></button>`).join("")}</div>` : "";
  if (!ideas.length) return amount + lunchIdeasCard(it, lunches);
  if (lots || !lunches.length) return `${amount}<div class="card stack" style="padding:14px 16px;gap:8px">${swapHead}${dinners}</div>${lunchIdeasCard(it, lunches)}`;
  return `${amount}${lunchIdeasCard(it, lunches)}<details class="card swap-more" style="padding:12px 16px"><summary class="small"><b>Or swap a dinner instead…</b></summary><div class="stack" style="gap:8px;margin-top:8px">${swapHead}${dinners}</div></details>`;
}
/** Recipes that use up a part-pack, with how far the spare amount goes: the whole meal for your household (nothing more
    to buy) comes first, then ones it covers at least one portion of (a lunch for one, say). Ideas that would need more
    of it bought are left out, since the point is to use up what you've got. */
function useUpIdeas(it) {
  if (!it.leftover || !it.k) return [];
  const days = planFor(shopWeek()), planned = new Set(days.map((d) => d.recipe).filter(Boolean));
  const m = ingMeta(it.k), spare = (partPacks(days).get(it.k) || 0) * ((m.pk && m.pk[0]) || 0); // in the recipe's unit
  if (!spare) return [];
  const people = dayFactor({});
  return app.recipes.filter((r) => usable(r) && !planned.has(r.id))
    .map((r) => {
      const ing = effectiveIngredients(r).find((i) => i.k === it.k && i.q && (i.u || "") === ((m.pk && m.pk[1]) || ""));
      if (!ing) return null;
      const portions = spare / ing.q; // amounts are per portion
      return portions >= 1 ? { r, portions, whole: portions >= people * 0.95 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (b.whole - a.whole) || (a.whole ? recipeWeight(b.r.id) - recipeWeight(a.r.id) : b.portions - a.portions) || a.r.time - b.r.time)
    .slice(0, 4);
}
/* ---- Quick leftover lunches (grown-ups only) ----------------------------------------------------------------------
   Templates in data/lunches.json (wrap, pitta, toastie...) filled from the week's real leftovers, so a bit of spare
   halloumi becomes "Halloumi wrap with spinach" on Wednesday. A lunch sits on a day alongside its dinner (day.lunch),
   and the leftovers it uses stop showing as spare. Cheap basics (wraps, pittas, bread) are suggested, never assumed. */
const lunchUse = (k) => ((app.lunchData || {}).use || {})[k];
const lunchTemplate = (id) => ((app.lunchData || {}).lunches || []).find((l) => l.id === id);
const capFirst = (t) => t.charAt(0).toUpperCase() + t.slice(1);
function lunchName(t, main, withKs) {
  if (!t) return "Lunch";
  const nm = (k) => (lunchUse(k) || { name: k }).name;
  if ((t.needsOne || []).includes(main) && t.selfName) return withKs.length ? `${t.selfName.replace(/ with veg$/, "")} with ${joinNames(withKs.map(nm))}` : t.selfName;
  if (/with \{main\}/.test(t.name)) return t.name.replace("{main}", joinNames([main, ...withKs].map(nm)));
  const base = t.name.replace("{Main}", capFirst(nm(main))).replace("{main}", nm(main));
  return withKs.length ? `${base} with ${joinNames(withKs.map(nm))}` : base;
}
/** Leftovers already given to a planned lunch this week: ingredient → "Wed lunch". */
function lunchClaims(week) {
  const out = new Map(), start = parseISO(week);
  planFor(week).forEach((d, i) => { if (d && d.lunch) [d.lunch.main, ...(d.lunch.with || [])].forEach((k) => out.set(k, `${DOW[mondayIndex(addDays(start, i))]} lunch`)); });
  return out;
}
/** What's on this week's list (or a staple), by catalogue ingredient. */
function onListKeys(week) { return new Set(buildList(week).map((i) => i.k || catalogueMatch(i.name)).filter(Boolean)); }
/** Lunch ideas that use up a leftover: the leftover itself plus up to two other leftovers the lunch can take. */
function lunchIdeas(k, week = shopWeek()) {
  if (!lunchUse(k)) return [];
  const days = planFor(week), left = partPacks(days), claimed = lunchClaims(week), avoid = new Set(avoidList()), onList = onListKeys(week);
  const today = iso(new Date());
  if (!left.has(k) || claimed.has(k) || iso(useByDate(k, week)) < today) return []; // past its best once opened
  const pool = [...left.keys()].filter((x) => x !== k && !claimed.has(x) && lunchUse(x) && iso(useByDate(x, week)) >= today);
  return ((app.lunchData || {}).lunches || []).filter((t) => t.takes.includes(k)).map((t) => {
    const need = t.needsOne || [];
    if (need.length && !need.includes(k) && !need.some((x) => pool.includes(x))) return null;
    if (t.base.some((b) => [...(ingMeta(b.k).al || []), ...(ingMeta(b.k).mc || [])].some((a) => avoid.has(a)))) return null;
    const must = need.length && !need.includes(k) ? [need.find((x) => pool.includes(x))] : [];
    const withKs = [...must, ...pool.filter((x) => t.takes.includes(x) && !must.includes(x))].slice(0, 3);
    const missing = t.base.filter((b) => !onList.has(b.k)).map((b) => b.k);
    return { t, main: k, with: withKs, name: lunchName(t, k, withKs), missing };
  }).filter(Boolean).sort((a, b) => a.missing.length - b.missing.length || b.with.length - a.with.length).slice(0, 4);
}
const ingShort = (k) => ingMeta(k).n.split(" / ")[0].toLowerCase();
/* Keeping leftovers safely: each perishable says how many days it keeps once opened (ko, in ingredients.json, checked
   against UK guidance). A leftover is opened on the first planned dinner that uses it; it's good until that day + ko. */
const keepDays = (k) => ingMeta(k).ko || 3;
function openedDate(k, week) {
  const start = parseISO(week), i = planFor(week).findIndex((d) => d && d.recipe && d.status !== "leftovers" && app.byId[d.recipe] && effectiveIngredients(app.byId[d.recipe]).some((x) => x.k === k));
  return i >= 0 ? addDays(start, i) : new Date();
}
function useByDate(k, week) { return addDays(openedDate(k, week), keepDays(k)); }
/** "use by Wed", amber when it's today or tomorrow. */
function useByNote(k) {
  if (!k || !ingMeta(k).ko) return "";
  const d = useByDate(k, shopWeek()), days = Math.round((parseISO(iso(d)) - parseISO(iso(new Date()))) / 864e5);
  if (days < 0) return `<br><span class="small keep-past">Past its best once opened: check it</span>`;
  return `<br><span class="small ${days <= 1 ? "keep-soon" : "muted"}">Use by ${days === 0 ? "today" : days === 1 ? "tomorrow" : DOW_LONG[mondayIndex(d)]} once opened</span>`;
}
function keepAdvice(k) {
  if (!k || !ingMeta(k).ko) return "";
  const n = keepDays(k);
  const m = ingMeta(k);
  return `<br><span class="small ${n <= 2 ? "keep-soon" : "muted"}">Keeps about ${n} day${n === 1 ? "" : "s"} once opened in the fridge, but never past the packet's use-by date.${m.kt ? ` ${esc(m.kt)}` : ""}${m.fz ? " Or freeze it within that time: defrost in the fridge, use within a day, and don't refreeze." : ""}</span>`;
}
function lunchIdeasCard(it, ideas) {
  if (!ideas.length) return "";
  return `<div class="card stack lunch-card" style="padding:14px 16px;gap:8px"><b>As a quick lunch</b><span class="small muted">For grown-ups, on another day this week.</span>
    <div class="list">${ideas.map((x) => `<button class="rrow" data-act="lunchPick" data-t="${x.t.id}" data-k="${esc(x.main)}" data-item="${esc(it.key)}"><span aria-hidden="true" style="font-size:22px">${x.t.emoji}</span><span class="grow">${esc(x.name)}${x.missing.length ? `<br><span class="small muted">Needs ${esc(joinNames(x.missing.map(ingShort)))}</span>` : ""}</span><span class="small muted">${x.t.minutes} min</span></button>`).join("")}</div></div>`;
}
/** A gentle nudge: nothing on the list to wrap leftovers in? A cheap pack of pittas opens up most lunches. */
function lunchBasicsTip(left) {
  if (!left.some((i) => i.k && lunchUse(i.k))) return "";
  const onList = onListKeys(shopWeek());
  if (["tortillas", "flatbread", "bread"].some((k) => onList.has(k))) return "";
  const avoid = new Set(avoidList()), k = ["flatbread", "tortillas"].find((x) => !(ingMeta(x).al || []).some((a) => avoid.has(a)));
  if (!k) return "";
  const p = basePrice(k);
  return `<div class="card row" style="margin-top:8px;padding:12px 16px;gap:10px"><span aria-hidden="true">💡</span><span class="grow small">A pack of ${esc(ingShort(k))}${p ? ` (about ${money(p.p * shopMult(priceShop()))})` : ""} turns these into quick lunches.</span><button class="btn sm" data-act="lunchBasic" data-k="${k}">Add</button></div>`;
}
function addBasic(k, why) {
  const p = basePrice(k);
  send({ op: "extra_add", week: shopWeek(), item: { id: uid(), name: ingMeta(k).n, price: p ? +(p.p * shopMult(priceShop())).toFixed(2) : null, qty: 1, shop: "any", amount: why || null } });
}
/** Pick a day (today onwards, within a few days so opened food is still good) and how many it's for. */
function openLunchPick(tId, main, itemKey, keep = {}) {
  const idea = lunchIdeas(main).find((x) => x.t.id === tId); if (!idea) return;
  const week = shopWeek(), start = parseISO(week), today = iso(new Date()), ks = [main, ...idea.with];
  // only days while everything in it is still good once opened (the shortest-keeping one decides), never past that
  const last = iso(ks.map((k) => useByDate(k, week)).reduce((a, b) => (a < b ? a : b)));
  const first = iso(openedDate(main, week)) > today ? iso(openedDate(main, week)) : today;
  const shortest = ks.map((k) => [k, keepDays(k)]).sort((a, b) => a[1] - b[1])[0];
  const n = keep.n || 1, add = keep.add || new Set(idea.missing);
  app.lunchPickState = { tId, main, with: idea.with, itemKey, n, add };
  const days = planFor(week).map((d, i) => ({ d, i, date: addDays(start, i) })).filter(({ date }) => iso(date) >= first && iso(date) <= last);
  openSheet(`<p class="eyebrow">Quick lunch</p><h1 class="title" style="font-size:26px">${idea.t.emoji} ${esc(idea.name)}</h1>
    <p class="small muted">About ${idea.t.minutes} minutes. For grown-ups: not adapted for little ones.</p>
    <div class="chips" style="margin:10px 0">${[1, 2].map((k) => `<button class="chip ${n === k ? "on" : ""}" data-act="lunchN" data-n="${k}">For ${k}</button>`).join("")}</div>
    ${idea.missing.length ? `<div class="stack" style="gap:6px;margin-bottom:10px">${idea.missing.map((k) => `<label class="row" style="gap:10px"><input type="checkbox" data-act="lunchAdd" data-k="${k}" ${add.has(k) ? "checked" : ""}><span class="small">Add ${esc(ingShort(k))} to the list${basePrice(k) ? ` (about ${money(basePrice(k).p * shopMult(priceShop()))})` : ""}. Skip if you've got some.</span></label>`).join("")}</div>` : ""}
    ${shortest[1] <= 3 ? `<p class="keep-warn">Once opened, ${esc((lunchUse(shortest[0]) || { name: ingShort(shortest[0]) }).name)} ${/s$/.test((lunchUse(shortest[0]) || { name: "" }).name) && !/(hummus|houmous|couscous)$/.test((lunchUse(shortest[0]) || { name: "" }).name) ? "keep" : "keeps"} about ${shortest[1]} day${shortest[1] === 1 ? "" : "s"} in the fridge, and never past the packet's use-by date.</p>` : ""}
    <p class="muted" style="margin:6px 0">Which day?</p>
    ${days.length ? `<div class="list">${days.map(({ d, i, date }) => `<button class="rrow" data-act="lunchPut" data-i="${i}"><span class="grow"><b>${DOW_LONG[mondayIndex(date)]}</b>${d && d.lunch ? `<br><span class="small muted">Replaces ${esc(lunchName(lunchTemplate(d.lunch.t), d.lunch.main, d.lunch.with || []))}</span>` : ""}</span><span class="muted">›</span></button>`).join("")}</div>`
      : `<p class="small muted">No safe days left for this one this week: opened food doesn't keep long.</p>`}`, { keepScroll: !!keep.n });
  if (itemKey) app.sheetBack = () => openItem(itemKey);
}
function lunchLine(d, i, week) {
  const t = lunchTemplate(d.lunch.t);
  return `<button class="lunch-line" data-act="lunchOpen" data-i="${i}" data-week="${week}"><span aria-hidden="true">${t ? t.emoji : "🥪"}</span> Lunch: ${esc(lunchName(t, d.lunch.main, d.lunch.with || []))}</button>`;
}
function todayLunchCard() {
  const week = currentWeek(), i = mondayIndex(new Date()) - mondayIndex(parseISO(week)), d = planFor(week)[(i + 7) % 7];
  if (!d || !d.lunch) return "";
  const t = lunchTemplate(d.lunch.t);
  return `<button class="card row lunch-today" style="width:100%;margin-top:12px;padding:12px 16px;text-align:left;gap:10px" data-act="lunchOpen" data-i="${(i + 7) % 7}" data-week="${week}"><span aria-hidden="true" style="font-size:22px">${t ? t.emoji : "🥪"}</span><span class="grow"><span class="small muted">Lunch today</span><br><b>${esc(lunchName(t, d.lunch.main, d.lunch.with || []))}</b></span><span class="muted">›</span></button>`;
}
function openLunch(i, week) {
  const d = planFor(week)[i]; if (!d || !d.lunch) return;
  const t = lunchTemplate(d.lunch.t), n = d.lunch.n || 1, ks = [d.lunch.main, ...(d.lunch.with || [])];
  if (!t) return;
  const prep = ks.map((k) => (lunchUse(k) || {}).how).filter(Boolean);
  const steps = t.steps.flatMap((st) => (st === "{prep}" ? prep : [st]));
  const say = { tortillas: ["wrap", "wraps"], flatbread: ["pitta", "pittas"], bread: ["slice of bread", "slices of bread"], eggs: ["egg", "eggs"] };
  const base = t.base.map((b) => { const q = b.q * n, w = say[b.k]; return w ? `${q} ${q === 1 ? w[0] : w[1]}` : `${q}${b.u ? ` ${b.u}` : ""} ${ingShort(b.k)}`; });
  openSheet(`<p class="eyebrow">Quick lunch · ${DOW_LONG[mondayIndex(addDays(parseISO(week), i))]}</p><h1 class="title" style="font-size:26px">${t.emoji} ${esc(lunchName(t, d.lunch.main, d.lunch.with || []))}</h1>
    <p class="small muted">For ${n}, about ${t.minutes} minutes. For grown-ups: not adapted for little ones.</p>
    <p><b>Uses your leftover</b> ${esc(joinNames(ks.map((k) => (lunchUse(k) || { name: k }).name)))}${base.length ? `, plus ${esc(joinNames(base))}` : ""}.</p>
    <ol class="lunch-steps">${steps.map((st) => `<li>${esc(st)}</li>`).join("")}</ol>
    <button class="btn" style="width:100%" data-act="lunchRemove" data-i="${i}" data-week="${week}">${icon("trash", 16)}Remove this lunch</button>`);
}
/** How far the spare goes, in plain words. */
function useUpCover(x) {
  if (x.whole) return "What's left is enough for everyone";
  const n = Math.floor(x.portions);
  return n === 1 ? "What's left makes 1 portion: a lunch for one" : `What's left makes ${n} portions`;
}
function openUseUp(id, itemKey) {
  const week = shopWeek(), days = planFor(week), r = app.byId[id], start = parseISO(week), today = iso(new Date());
  const slots = days.map((d, i) => ({ d, i, date: addDays(start, i) })).filter(({ d, date }) => iso(date) >= today && !d.locked && d.status !== "skip");
  openSheet(`<p class="eyebrow">Use up the rest</p><h1 class="title" style="font-size:26px">${esc(r.name)}</h1>
    <p class="muted">Which day should it go on?</p>
    <div class="list">${slots.map(({ d, i, date }) => { const cur = d.recipe && app.byId[d.recipe];
      return `<button class="rrow" data-act="useUpPut" data-id="${id}" data-i="${i}"><span class="grow"><b>${DOW_LONG[mondayIndex(date)]}</b><br><span class="small muted">${d.status === "leftovers" ? "Instead of leftovers" : cur ? `Instead of ${esc(cur.name.toLowerCase())}` : "Nothing planned yet"}</span></span></button>`; }).join("") || `<div class="row" style="padding:14px 16px"><span class="muted">No free days left this week.</span></div>`}</div>`);
  app.sheetBack = () => openItem(itemKey);
}
function openItem(key) {
  const it = buildList(shopWeek()).find((i) => i.key === key); if (!it) return;
  const bp = it.k ? basePrice(it.k) : null, m = it.k ? ingMeta(it.k) : null;
  const shopNow = it.shop === "any" ? priceShop() : it.shop;
  openSheet(`<p class="eyebrow">${esc(aisleName(it.aisle))}</p><h1 class="title" style="font-size:26px">${esc(it.name)}</h1>
    <p class="muted" style="margin:6px 0 12px">${it.qtyText ? `${esc(it.qtyText)} · ` : ""}${it.recipes.length ? `for ${esc(it.recipes.join(", "))}` : it.staple ? "Every week" : it.extra ? `Added${it.by ? ` by ${esc(it.by)}` : ""}` : ""}</p>
    ${it.note ? `<p class="pill" style="white-space:normal;padding:8px 12px">${esc(it.note)}</p>` : ""}
    <div class="stack">
      ${it.counted ? `<form class="card stack" style="padding:14px 16px;gap:10px" data-form="manual" data-key="${esc(key)}">
        <label><span class="small muted">Name</span><input class="input" name="name" value="${esc(it.name)}"></label>
        <label><span class="small muted">Price each</span><span class="row" style="gap:6px"><b>£</b><input class="input" name="price" inputmode="decimal" value="${it.unitPrice != null ? it.unitPrice.toFixed(2) : ""}" placeholder="0.00"></span></label>
        <button class="btn primary">Save</button>${it.staple ? `<span class="small muted">Changes the staple for every week.</span>` : ""}</form>` : ""}
      ${m && m.pk ? `<form class="card stack" style="padding:14px 16px;gap:10px" data-form="price" data-k="${esc(it.k)}">
        <div class="row between"><b>Price</b><span class="small muted">${bp && bp.own ? `Updated by ${esc(bp.own.by || "someone")} on ${niceDate(new Date(bp.own.at * 1000))}` : `Estimate, checked ${esc(app.ing.prices_checked || "")}`}</span></div>
        <span class="small muted">For a pack of ${esc(fmtQty(m.pk[0], m.pk[1]))}</span>
        <div class="row"><span style="font-weight:700">£</span><input class="input" name="price" inputmode="decimal" value="${bp ? (bp.p * shopMult(shopNow)).toFixed(2) : ""}" aria-label="Price">
          <select class="input" name="shop" style="width:140px" aria-label="Seen at">${enabledShops().map((s) => `<option value="${s}" ${s === shopNow ? "selected" : ""}>${esc(shopName(s))}</option>`).join("")}</select></div>
        <div class="row"><button class="btn primary">Save price</button>${bp && bp.own ? `<button type="button" class="btn" data-act="resetPrice" data-k="${esc(it.k)}">Use the estimate</button>` : ""}</div></form>` : ""}
      ${useUpCard(it)}
      ${it.swappable.length ? `<div class="card stack" style="padding:14px 16px;gap:8px"><b>Swap</b><div class="row wrap">${it.swappable.map((k) => `<button class="btn sm" data-act="swapIng" data-k="${esc(k)}" data-item="${esc(it.key)}">${esc(ingMeta(k).n)}…</button>`).join("")}</div></div>` : ""}
      <div class="card stack" style="padding:14px 16px;gap:8px"><b>Get it at</b>
        <div class="shop-grid">${shopOrder().map((s) => `<button class="${it.shop === s ? "on" : ""}" data-act="moveTo" data-keys="${esc(key)}" data-s="${s}">${esc(shopName(s))}</button>`).join("")}</div>
        <span class="small muted">Remembered for next time.</span></div>
      <div class="row wrap">
        ${it.cupboard ? `<button class="btn" data-act="rack">Open the spice rack</button>` : ""}
        ${!it.cupboard ? `<button class="btn" data-act="flag" data-key="${esc(key)}" data-f="have" data-v="${it.have ? 0 : 1}" data-close="1">${icon("home", 16)}${it.have ? "Need it after all" : "Already got it"}</button>` : ""}
        ${it.extra ? `<button class="btn" data-act="removeExtra" data-id="${esc(it.id)}">${icon("trash", 16)}Remove</button>` : ""}
      </div></div>`);
}

function openMove(keys) {
  const n = keys.length;
  app.moveKeys = keys; app.moveShop = null;
  openSheet(`<h1 class="title" style="font-size:24px">Get ${n === 1 ? "this" : `these ${n}`} at…</h1>
    <div class="shop-grid" style="margin:14px 0">${shopOrder().map((s) => `<button data-act="pickMoveShop" data-s="${s}">${esc(shopName(s))}</button>`).join("")}</div>
    <label class="row" style="padding:4px 0 12px"><input type="checkbox" class="check-input" id="moveAlways" checked><span><b>Always get ${n === 1 ? "it" : "these"} there</b><br><span class="small muted">Untick to move for this week only</span></span></label>
    <button class="btn lg primary block" data-act="confirmMove" disabled id="moveGo">Pick a shop</button>`);
}

function openAdd() {
  const shops = shopOrder(), last = app.lastShop || shops[0];
  openSheet(`<h1 class="title" style="font-size:26px">Add to the list</h1>
    <form data-form="add" class="stack" style="margin-top:12px">
      <input class="input" name="name" placeholder="What do you need?" autocomplete="off" required>
      <div class="row">
        <label class="grow"><span class="small muted">Price each (optional)</span><span class="row" style="gap:6px"><b>£</b><input class="input" name="price" inputmode="decimal" placeholder="0.00" autocomplete="off"></span></label>
        <div><span class="small muted">How many</span><div class="stepper"><button type="button" data-act="addCount" data-d="-1" aria-label="Fewer">−</button><span id="addCountShow">1</span><button type="button" data-act="addCount" data-d="1" aria-label="More">+</button></div></div>
        <input type="hidden" name="qty" value="1">
      </div>
      <div class="shop-grid">${shops.map((s) => `<button type="button" class="${s === last ? "on" : ""}" data-act="addShop" data-s="${s}">${esc(shopName(s))}</button>`).join("")}</div>
      <input type="hidden" name="shop" value="${last}">
      <button class="btn lg primary">Add</button></form>`);
  setTimeout(() => { const f = $("#sheetBody input[name=name]"); if (f) f.focus(); }, 250);
}
/** Done shopping: file what's ticked under "Bought this week", then deal with anything left. */
function doneShopping() {
  const { toGet, week } = shopData();
  const got = toGet.filter((i) => i.done), left = toGet.filter((i) => !i.done);
  const cost = got.reduce((t, i) => t + (i.cost || 0), 0);
  if (got.length) send({ op: "trip", week, keys: got.map((i) => i.key) });
  const restocked = got.filter((i) => i.cupboard && i.k).map((i) => i.k); // bought spices and cupboard bits go back to "Got it"
  if (restocked.length) send({ op: "pantry", keys: restocked, status: "ok" });
  const saved = got.length ? `${got.length} thing${got.length === 1 ? "" : "s"} (≈ ${money(cost)}) moved to Bought this week` : "";
  if (!left.length) { toast(got.length ? `${saved}. All done!` : "Nothing on the list. All done!"); return; }
  if (!got.length) { toast("Tick what's in your trolley first"); return; }
  toast(saved);
  openDone(left, got.length);
}
function openDone(left, got) {
  app.moveKeys = left.map((i) => i.key); app.moveShop = null;
  openSheet(`<h1 class="title" style="font-size:26px">Got ${got}, ${left.length} still to get</h1>
    <p class="muted">${esc(left.slice(0, 6).map((i) => i.name).join(", "))}${left.length > 6 ? ` and ${left.length - 6} more` : ""}.</p>
    <p style="margin:14px 0 8px"><b>Pick them up elsewhere this week?</b></p>
    <div class="shop-grid" style="margin-bottom:14px">${shopOrder().map((s) => `<button data-act="pickMoveShop" data-s="${s}">${esc(shopName(s))}</button>`).join("")}</div>
    <input type="checkbox" id="moveAlways" hidden>
    <div class="stack"><button class="btn lg primary" data-act="confirmMove" disabled id="moveGo">Pick a shop</button><button class="btn lg" data-close>Leave them on the list</button></div>`);
}

function openAisles({ keepScroll = false } = {}) {
  const order = aisleOrder();
  openSheet(`<h1 class="title" style="font-size:26px">Aisle order</h1>
    <p class="muted">Put the aisles in the order you reach them.</p>
    <div class="list">${order.map((id, n) => `<div class="row" style="padding:8px 8px 8px 16px;gap:6px"><span class="grow">${esc(aisleName(id))}</span>
      <button class="icon-btn sm plain" data-act="aisleMove" data-id="${id}" data-d="-1" aria-label="Move ${esc(aisleName(id))} up" ${n === 0 ? "disabled" : ""}>${icon("up", 18)}</button>
      <button class="icon-btn sm plain" data-act="aisleMove" data-id="${id}" data-d="1" aria-label="Move ${esc(aisleName(id))} down" ${n === order.length - 1 ? "disabled" : ""}>${icon("down", 18)}</button></div>`).join("")}</div>
    <div class="row" style="gap:8px;margin-top:14px"><button class="btn primary" data-close>Done</button>${(settings().aisleOrder || []).length ? `<button class="btn" data-act="aisleReset">Reset to usual</button>` : ""}</div>`, { keepScroll });
}
function staplesSummary() {
  const on = (settings().staples || []).filter((x) => x.on && (x.name || "").trim()).map((x) => x.name.trim());
  return on.length ? (on.length > 3 ? `${on.slice(0, 3).join(", ")} + ${on.length - 3} more` : joinNames(on)) : "None yet";
}
function staplesCard() {
  return `<button class="card row" style="width:100%;margin-top:16px;padding:14px 16px;text-align:left" data-act="staples">
      <span class="grow"><b>Weekly staples</b><br><span class="small muted">${esc(staplesSummary())}</span></span><span aria-hidden="true">›</span></button>`;
}
/** Weekly staples: things on every list (milk, bread, lunches). A panel, opened from the shopping list's ⋯ menu or Settings. */
function openStaples({ keepScroll = false, focusLast = false } = {}) {
  const s = settings();
  const staples = (s.staples || []).map((st, i) => `<div class="stack" style="padding:14px 16px;gap:8px">
      <div class="row"><input class="input grow" value="${esc(st.name)}" placeholder="e.g. Milk" data-set="stapleName" data-i="${i}" aria-label="Item">
        <label class="switch" title="On every list"><input type="checkbox" data-set="stapleOn" data-i="${i}" ${st.on ? "checked" : ""}><i></i></label></div>
      <input class="input" value="${esc(st.amount || "")}" placeholder="Size, e.g. 1 carton (optional)" data-set="stapleAmount" data-i="${i}" aria-label="Size">
      <div class="row wrap">
        <span class="row" style="gap:6px"><b>£</b><input class="input" style="width:84px" inputmode="decimal" value="${st.price != null ? esc(st.price) : ""}" placeholder="each" data-set="staplePrice" data-i="${i}" aria-label="Price each"></span>
        <div class="stepper"><button data-act="stapleCount" data-i="${i}" data-d="-1" aria-label="Fewer">−</button><span>×${+st.qty || 1}</span><button data-act="stapleCount" data-i="${i}" data-d="1" aria-label="More">+</button></div>
        <select class="input" style="width:auto;flex:1;min-width:110px" data-set="stapleShop" data-i="${i}" aria-label="Shop">${shopOrder().map((k) => `<option value="${k}" ${(st.shop || "aldi") === k ? "selected" : ""}>${esc(shopName(k))}</option>`).join("")}</select>
        <button class="icon-btn plain" data-act="stapleDel" data-i="${i}" aria-label="Remove">${icon("trash", 18)}</button></div></div>`).join("");
  openSheet(`<div data-staples><h1 class="title" style="font-size:26px">Weekly staples</h1>
    <p class="muted">Switched-on ones go on every shopping list.</p>
    <div class="list">${staples || `<div class="row" style="padding:14px 16px"><span class="muted">Nothing yet.</span></div>`}</div>
    <div class="row" style="gap:8px;margin-top:12px"><button class="btn" data-act="stapleAdd">${icon("plus", 16)}Add a staple</button><button class="btn primary" data-close>Done</button></div></div>`, { keepScroll });
  if (focusLast) { const f = $$("#sheetBody [data-set=stapleName]").pop(); if (f) f.focus(); }
}
const staplesOpen = () => !!$("#sheetBody [data-staples]") && !$("#sheet").hidden;
function openRack({ keepScroll = false } = {}) {
  const used = rackUsedThisWeek(shopWeek());
  const row = (m) => {
    const seg = [["ok", "Got it"], ["low", "Low"], ["out", "Out"]].map(([s, l]) => `<button class="${m.status === s ? "on" : ""}" data-act="rackSet" data-k="${m.k}" data-s="${s}">${l}</button>`).join("");
    return `<div class="stack" style="padding:12px 16px;gap:8px"><div class="row between"><b>${esc(m.n)}</b>${used.has(m.k) ? `<span class="pill accent">This week</span>` : ""}</div><div class="seg">${seg}</div></div>`;
  };
  const items = rackItems();
  const spices = items.filter((m) => m.rack === "spices"), cupboard = items.filter((m) => m.rack !== "spices");
  const missing = items.filter((m) => used.has(m.k) && !m.status); // needed for this week's dinners but not ticked yet
  openSheet(`<h1 class="title" style="font-size:26px">Spice rack &amp; cupboard</h1>
    <p class="muted">Low or Out goes on the shopping list.</p>
    ${missing.length ? `<button class="btn primary block" style="margin:6px 0 4px" data-act="rackStarter">Add ${missing.length} unchecked for this week</button>` : ""}
    <p class="section-label">Spices</p><div class="list">${spices.map(row).join("")}</div>
    <p class="section-label">Cupboard</p><div class="list">${cupboard.map(row).join("")}</div>`, { keepScroll });
}

const FEEDBACK_TAGS = ["Too bland", "Too spicy", "Too salty", "Took longer", "Too fiddly", "Too much food", "Not enough", "Little ones loved it", "Little ones weren't keen"];
function openFeedback(id) {
  const r = app.byId[id]; app.fbRating = null;
  openSheet(`<p class="eyebrow">${esc(r.name)}</p><h1 class="title" style="font-size:26px">How was it?</h1>
    <form data-form="feedback" data-id="${id}" class="stack" style="margin-top:12px">
      <div class="seg"><button type="button" data-act="feedbackRate" data-r="loved">Loved it</button><button type="button" data-act="feedbackRate" data-r="fine">Fine</button><button type="button" data-act="feedbackRate" data-r="never">Not again</button></div>
      <div class="chips wrap">${FEEDBACK_TAGS.filter((t) => kids().length || !t.startsWith("Little ones")).map((t) => `<button type="button" class="chip" data-act="feedbackTag" data-t="${esc(t)}">${esc(t)}</button>`).join("")}</div>
      <input class="input" name="note" placeholder="Anything else? e.g. needed more salt" autocomplete="off">
      ${app.host === "Cloudflare" ? `<span class="small muted">Your household can see this. Whoever runs FoodIsHard sees it without your name.</span>` : ""}
      <button class="btn lg primary" id="fbSave" disabled>Save</button><button type="button" class="btn" data-close>Skip</button></form>`);
}
function deviceText() {
  const ua = navigator.userAgent || "";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Unknown";
  const br = /Edg\//.test(ua) ? "Edge" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Chrome|CriOS/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "Other";
  const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone ? ", installed" : "";
  return `${os}, ${br}${installed}`;
}
function reportDetails() { return `Version ${APP_VERSION} · ${deviceText()}${app.lastError ? ` · Last error: ${app.lastError}` : ""}`; }
function openReport() {
  openSheet(`<h1 class="title" style="font-size:26px">Report a problem</h1>
    <form data-form="report" class="stack">
      <textarea name="text" rows="5" maxlength="300" placeholder="What happened, and what were you doing?" required></textarea>
      <p class="small muted">Sent with: ${esc(reportDetails())}</p>
      <button class="btn lg primary">Send</button><button type="button" class="btn" data-close>Cancel</button></form>`);
}
function feedbackText() {
  const lines = ["FoodIsHard recipe feedback", ""];
  Object.entries(app.state.feedback || {}).forEach(([id, list]) => {
    const r = app.byId[id]; if (!r || !list.length) return;
    lines.push(`${r.name} (${id})`);
    list.forEach((f) => lines.push(`- ${new Date(f.at * 1000).toISOString().slice(0, 10)} ${f.rating}${f.tags.length ? ` [${f.tags.join(", ")}]` : ""}${f.note ? `: ${f.note}` : ""}`));
    lines.push("");
  });
  return lines.length > 2 ? lines.join("\n") : "No feedback yet.";
}

// ---------------------------------------------------------------------------
// Cooking mode
// ---------------------------------------------------------------------------
let cookTick = null, wakeLock = null;
function startCooking(id, { factor = null } = {}) {
  if (!$("#sheet").hidden) { // hand the panel's history entry over to cooking mode
    $("#sheet").hidden = true; document.body.style.overflow = "";
    if (sheetPushed) { sheetPushed = false; cookPushed = true; }
  }
  app.cook = { id, step: 0, timers: [], showIng: false, factor: factor || factorFor(id) };
  $("#cook").hidden = false;
  try { navigator.wakeLock && navigator.wakeLock.request("screen").then((l) => { wakeLock = l; }).catch(() => {}); } catch { /* not supported */ }
  clearInterval(cookTick);
  cookTick = setInterval(tickTimers, 1000);
  if (!cookPushed) { history.pushState({ panel: "cook" }, ""); cookPushed = true; }
  renderCook();
}
function stopCooking({ fromBack = false, handOver = false } = {}) {
  $("#cook").hidden = true; $("#cook").innerHTML = ""; app.cook = null; clearInterval(cookTick);
  try { wakeLock && wakeLock.release(); } catch { /* fine */ }
  if (!cookPushed) return;
  cookPushed = false;
  if (handOver) sheetPushed = true; // the next panel reuses this history entry
  else if (!fromBack) history.back();
}
/** The timer to offer for a step: its longest wait ("stir for 1 minute, then simmer for 20 minutes" → 20). */
function stepMinutes(text) {
  const all = [...text.matchAll(/(\d+)(?:\s*(?:[–-]|to)\s*(\d+))?\s*min(?:ute)?s?\b/gi)].map((m) => +(m[2] || m[1]));
  return all.length ? Math.max(...all) : null;
}
function renderCook() {
  const c = app.cook; if (!c) return;
  const r = app.byId[c.id], steps = visibleSteps(r), s = steps[c.step], factor = c.factor || household().factor;
  const text = personaliseStep(scaleStep(s.t, factor)), mins = stepMinutes(text);
  const prog = steps.map((st, i) => `<span class="${i < c.step ? "done" : i === c.step && st.baby ? "baby" : i === c.step ? "done" : ""}"></span>`).join("");
  const timers = c.timers.map((t, i) => {
    const left = Math.max(0, Math.round((t.end - Date.now()) / 1000));
    return `<div class="timer ${left === 0 ? "ring" : ""}">${icon("clock", 22)}<span class="grow"><b>${esc(t.label)}</b><br><span class="small muted">${left === 0 ? "Done!" : "Running"}</span></span>
      <span class="t" data-timer="${i}">${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}</span>
      <button class="icon-btn sm plain" data-act="timerStop" data-i="${i}" aria-label="Stop timer">${icon("x", 16)}</button></div>`;
  }).join("");
  const ingList = effectiveIngredients(r).filter((i) => i.q != null).map((i) => `<li><span>${esc(ingMeta(i.k).n)}</span><span class="muted">${esc(fmtQty(i.q * factor, i.u))}</span></li>`).join("");
  $("#cook").innerHTML = `
    <div class="row between"><button class="icon-btn" data-act="cookClose" aria-label="Close cooking mode">${icon("x", 18)}</button>
      <button class="btn sm" data-act="cookIng">${c.showIng ? "Hide" : "Ingredients"}</button></div>
    <p class="small" style="font-weight:600;color:var(--muted);margin:12px 0 8px">${esc(r.name)}</p>
    <div class="cook-progress">${prog}</div>
    <div class="grow" style="overflow-y:auto;padding:18px 0;display:flex;flex-direction:column;gap:16px">
      ${c.showIng ? `<div class="card"><ul class="ing-list">${ingList}</ul></div>` : ""}
      <p class="eyebrow" style="color:${s.baby ? "var(--baby)" : "var(--muted)"}">Step ${c.step + 1} of ${steps.length}${s.baby ? ` · ${esc(kidNames())}'s ${kids().length > 1 ? "portions" : "portion"}` : ""}</p>
      <section class="cook-panel ${s.baby ? "baby" : ""}"><p class="cook-step">${esc(text)}</p>
        ${(() => { const used = s.baby ? [] : stepIngredients(text, effectiveIngredients(r), steps.slice(0, c.step).map((x) => x.t).join(" ")).filter((i) => i.q != null); /* salt and pepper still claim their words, but have no amount to show */ return used.length ? `<ul class="step-ings">${used.map((i) => `<li><span>${esc(ingMeta(i.k).n)}${i.part ? ` <span class="small">(${i.part})</span>` : ""}</span><b>${esc(fmtQty(i.q * factor, i.u))}</b></li>`).join("")}</ul>` : ""; })()}
        ${s.baby && kids().length ? `<div class="stack" style="gap:8px;margin-top:12px">${kidNotes(r)}</div>` : ""}</section>
      ${mins ? `<button class="btn" data-act="timerStart" data-m="${mins}">${icon("clock", 18)}Start a ${mins}-minute timer</button>` : ""}
      ${timers}
    </div>
    <div class="row"><button class="btn lg" style="flex:1" data-act="cookStep" data-d="-1" ${c.step === 0 ? "disabled" : ""}>Back</button>
      <button class="btn lg primary" style="flex:2" data-act="cookStep" data-d="1">${c.step === steps.length - 1 ? "Done" : "Next step"}</button></div>`;
}
function tickTimers() {
  const c = app.cook; if (!c || !c.timers.length) return;
  let rerender = false;
  c.timers.forEach((t, i) => {
    const left = Math.max(0, Math.round((t.end - Date.now()) / 1000));
    const el = document.querySelector(`[data-timer="${i}"]`);
    if (el) el.textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
    if (left === 0 && !t.rang) { t.rang = true; rerender = true; ring(t.label); }
  });
  if (rerender) renderCook();
}
function ring(label) {
  toast(`Timer done: ${label}`);
  try { navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 300]); } catch { /* fine */ }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach((t) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.25, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3); });
  } catch { /* no audio */ }
}

// ---------------------------------------------------------------------------
// Menus, toast, export
// ---------------------------------------------------------------------------
function openMenu(btn, items) {
  closeMenus();
  const m = document.createElement("div");
  m.className = "menu";
  m.innerHTML = items.map(([act, label, ic, extra = ""]) => `<button data-act="${act}" ${extra}>${ic ? icon(ic, 18) : ""}${label}</button>`).join("");
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect();
  m.style.left = `${Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right + scrollX - m.offsetWidth))}px`;
  let top = r.bottom + scrollY + 4;
  if (r.bottom + m.offsetHeight + 90 > innerHeight) top = r.top + scrollY - m.offsetHeight - 4;
  m.style.top = `${top}px`;
}
function closeMenus() { $$(".menu").forEach((m) => m.remove()); }
let toastTimer;
function toast(msg, { undo = null } = {}) {
  const t = $("#toast");
  app.toastUndo = undo;
  t.innerHTML = `${esc(msg)}${undo ? ` <button class="toast-undo" data-act="toastUndo">Undo</button>` : ""}`;
  t.hidden = false; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; app.toastUndo = null; }, undo ? 6000 : 2800);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied"); }
  catch { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Copied"); } catch { toast("Couldn't copy on this device"); } ta.remove(); }
}
function downloadText(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}
function printList() {
  const week = shopWeek(), items = buildList(week).filter((i) => i.active);
  const total = items.reduce((t, i) => t + (i.cost || 0), 0);
  const html = aisleOrder().map((g) => { const group = items.filter((i) => i.aisle === g); if (!group.length) return "";
    return `<h2>${esc(aisleName(g))}</h2><ul>${group.sort((a, b) => a.name.localeCompare(b.name)).map((i) => `<li>${esc(i.name)} ${i.qtyText ? `<b>${esc(i.qtyText)}</b>` : ""} <span class="where">${esc(shopName(i.shop))}${(i.flags || []).includes("veg") ? " · check V" : ""}</span></li>`).join("")}</ul>`; }).join("");
  const dinners = planFor(week).map((d, i) => d.status === "cook" && d.recipe && app.byId[d.recipe] ? `${DOW[mondayIndex(addDays(parseISO(week), i))]}: ${app.byId[d.recipe].name}` : null).filter(Boolean).join(" · ");
  $("#print").innerHTML = `<h1>Shopping list</h1><div class="sub">Week of ${niceDate(parseISO(week))} · ≈${money(total)}<br>${esc(dinners)}</div>${html}`;
  window.print();
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
function dayUpdate(i, patch, week = app.weekStart) {
  if (app.undoShuffle && app.undoShuffle.week === week) app.undoShuffle = null; // a later change: undoing the shuffle would lose it
  const days = planFor(week); send({ op: "day", week, i, day: { ...days[i], ...patch } }); }

const ACTIONS = {
  go: (d) => { closeSheet({ navigating: true }); go(d.to); },
  week: (d) => { app.weekStart = iso(addDays(parseISO(app.weekStart), 7 * +d.d)); render(); },
  shuffle: () => {
    const week = app.weekStart, before = clone({ days: planFor(week) }), had = before.days.some((d) => d.recipe);
    send({ op: "plan", week, plan: suggestWeek(week) });
    if (had) app.undoShuffle = { week, plan: before, after: JSON.stringify(planFor(week)) }; // "Undo" stays until the week changes again
    render();
    const now = Date.now(); app.shuffles = now - (app.lastShuffle || 0) < 60000 ? (app.shuffles || 0) + 1 : 1; app.lastShuffle = now;
    toast(app.shuffles === 10 ? "Can't decide? Honestly, same." : "Here's a plan"); // a little joke for the truly indecisive
  },
  undoShuffle: () => {
    const u = app.undoShuffle; if (!u) return;
    app.undoShuffle = null; send({ op: "plan", week: u.week, plan: u.plan }); toast("Put back as it was");
  },
  toastUndo: () => { const u = app.toastUndo; app.toastUndo = null; $("#toast").hidden = true; if (u) u(); },
  recipe: (d) => openRecipe(d.id, d.week ? { day: { week: d.week, i: +d.i } } : {}),
  macros: (d) => openMacros(d.id, d.who),
  cook: (d) => startCooking(d.id, d.week ? { factor: dayFactor(planFor(d.week)[+d.i]) } : {}),
  pick: (d) => openPicker(+d.i),
  themePick: (d) => openThemePicker(+d.i),
  setTheme: (d) => {
    const t = { ...(settings().themes || {}) }; if (d.t) t[d.i] = d.t; else delete t[d.i];
    send({ op: "settings", patch: { themes: t } }); closeSheet();
    toast(d.t ? `${DOW_LONG[+d.i]}: ${themeById(d.t).name}` : `${DOW_LONG[+d.i]}: no theme`);
  },
  put: (d) => { dayUpdate(+d.i, { recipe: d.id, status: "cook", note: null }); closeSheet(); toast(`${app.byId[d.id].name} added`); lockTip(+d.i); },
  another: (d) => {
    if (lockedDay(+d.i)) return;
    const i = +d.i, days = planFor(app.weekStart), cur = app.byId[days[i].recipe];
    const next = pickRecipe(app.weekStart, i, days, { exclude: new Set([cur.id]), fam: cur.family, emergency: !!cur.emergency });
    if (!next || next === cur.id) return toast(`No other ${family(cur.family).name.toLowerCase()} yet`);
    dayUpdate(i, { recipe: next }); lockTip(i);
  },
  swapDay: (d) => {
    if (lockedDay(+d.i)) return;
    const i = +d.i, days = planFor(app.weekStart), cur = days[i].recipe;
    const isEm = cur && app.byId[cur] && app.byId[cur].emergency;
    dayUpdate(i, { recipe: pickRecipe(app.weekStart, i, days, { exclude: new Set(cur ? [cur] : []), emergency: !!isEm }) }); lockTip(i);
  },
  quicker: (d) => {
    const week = currentWeek(), i = +d.i, days = planFor(week);
    dayUpdate(i, { recipe: pickRecipe(week, i, days, { exclude: new Set([days[i].recipe]), emergency: true }), status: "cook" }, week);
    toast("Swapped for a quick one");
  },
  emergency: (d) => { const week = d.week || currentWeek(), i = +d.i, days = planFor(week); dayUpdate(i, { recipe: pickRecipe(week, i, days, { emergency: true }), status: "cook" }, week); closeMenus(); },
  skip: (d) => { if (!lockedDay(+d.i)) openSkip(+d.i); },
  skipReason: (d) => { const f = $("#sheetBody form[data-form=skip]"); f.elements.namedItem("note").value = d.r; $$("#sheetBody .chip").forEach((c) => c.classList.toggle("on", c.dataset.r === d.r)); },
  lock: (d) => { const days = planFor(app.weekStart); dayUpdate(+d.i, { locked: !days[+d.i].locked }); },
  status: (d) => {
    closeMenus();
    const week = app.tab === "tonight" ? currentWeek() : app.weekStart, i = +d.i, days = planFor(week);
    if (d.s === "clear") return dayUpdate(i, { status: "cook", recipe: null, locked: false, note: null }, week);
    const patch = { status: d.s, note: null };
    if (d.s === "cook" && !days[i].recipe) patch.recipe = pickRecipe(week, i, days);
    dayUpdate(i, patch, week);
  },
  dayMenu: (d, el) => openMenu(el, [["eating", "Who's eating / cook double…", "people", `data-i="${d.i}" data-week="${app.weekStart}"`], ["pickFromMenu", "Choose a recipe…", "book", `data-i="${d.i}"`], ["emergency", "Emergency meal (about 15 min)", "bolt", `data-i="${d.i}" data-week="${app.weekStart}"`],
    ["status", "Leftovers night", "pot", `data-i="${d.i}" data-s="leftovers"`], ["status", "Clear this day", "x", `data-i="${d.i}" data-s="clear"`]]),
  pickFromMenu: (d) => { closeMenus(); openPicker(+d.i); },
  eating: (d) => { closeMenus(); openEating(d.week || app.weekStart, +d.i); },
  eatingGuests: (d) => { const day = planFor(d.week)[+d.i], g = +(day.guests != null ? day.guests : Math.max(0, +day.extra || 0)) || 0; dayUpdate(+d.i, { guests: Math.max(0, Math.min(20, g + +d.d)), extra: null }, d.week); openEating(d.week, +d.i, { keepScroll: true }); },
  eatingWho: (d) => { const day = planFor(d.week)[+d.i], away = new Set(day.away || []); away.has(d.k) ? away.delete(d.k) : away.add(d.k); dayUpdate(+d.i, { away: [...away], extra: day.extra < 0 ? null : day.extra }, d.week); openEating(d.week, +d.i, { keepScroll: true }); },
  eatingDouble: (d) => { setDouble(d.week, +d.i); openEating(d.week, +d.i, { keepScroll: true }); },
  fam: (d) => { app.openFamilies.has(d.f) ? app.openFamilies.delete(d.f) : app.openFamilies.add(d.f); render(); },
  rfilter: (d) => { app.recipeFilter = d.f; render(); },
  pref: (d) => { send({ op: "pref", recipe: d.id, patch: { [d.f]: d.v === "1" } }); openRecipe(d.id, { keepScroll: true }); },
  swapIng: (d) => openSwap(d.k, d.reopen, d.item || null),
  setSwap: (d) => { send({ op: "swap", key: d.k, alt: d.alt }); if (d.reopen) openRecipe(d.reopen); else { closeSheet(); toast(d.alt ? `Swapped for ${ingMeta(d.alt).n.toLowerCase()}` : "Back to the original"); } },
  // shop
  shopTab: (d) => { app.shopTab = d.s; render(); },
  tick: (d, el) => {
    send({ op: "check", week: shopWeek(), key: d.key, field: "done", value: el.checked }, { rerender: false });
    const k = d.key.startsWith("i:") ? d.key.slice(2) : null;
    if (k && ingMeta(k).c) send({ op: "pantry", key: k, status: el.checked ? "ok" : "out" }, { rerender: false });
    render();
  },
  rack: () => openRack(),
  useUpPick: (d) => openUseUp(d.id, d.item),
  useUpPut: (d) => {
    const week = currentWeek(), target = planFor(week)[+d.i];
    if (target.status === "leftovers" && target.from != null && planFor(week)[target.from].double) dayUpdate(target.from, { double: false }, week); // no leftovers needed now
    dayUpdate(+d.i, { status: "cook", recipe: d.id, from: null, was: null }, week); app.sheetBack = null; closeSheet(); toast(`${app.byId[d.id].name} is on ${DOW_LONG[mondayIndex(addDays(parseISO(currentWeek()), +d.i))]}`); },
  aisles: () => openAisles(),
  aisleMove: (d) => {
    const order = aisleOrder(), n = order.indexOf(d.id), to = n + +d.d;
    if (n < 0 || to < 0 || to >= order.length) return;
    [order[n], order[to]] = [order[to], order[n]];
    send({ op: "settings", patch: { aisleOrder: order } }, { rerender: false }); openAisles({ keepScroll: true });
  },
  aisleReset: () => { send({ op: "settings", patch: { aisleOrder: [] } }, { rerender: false }); openAisles({ keepScroll: true }); toast("Back to the usual order"); },
  rackSet: (d) => { send({ op: "pantry", key: d.k, status: d.s }); openRack({ keepScroll: true }); },
  rackStarter: () => {
    const used = rackUsedThisWeek(shopWeek()), keys = rackItems().filter((m) => used.has(m.k) && !m.status).map((m) => m.k);
    send({ op: "pantry", keys, status: "out" }); openRack({ keepScroll: true }); toast(`Added ${keys.length} to the shopping list`);
  },
  feedbackRate: (d, el) => { $$("#sheetBody [data-act=feedbackRate]").forEach((b) => b.classList.toggle("on", b === el)); app.fbRating = d.r; $("#fbSave").disabled = false; },
  feedbackTag: (d, el) => { el.classList.toggle("on"); },
  copyFeedback: () => copyText(feedbackText()),
  about: () => openAbout(),
  report: () => openReport(),
  signInAgain: () => { location.reload(); },
  acctReload: () => { loadAccount(); toast("Refreshed"); },
  noticeDismiss: () => dismissNotice(),
  updateNow: () => updateNow(),
  adminNotice: () => openAdminNotice(),
  adminBubble: (d, el) => adminDo("api/admin/bubble", { on: el.checked }, () => { app.reportBubble = el.checked; reportBubble(); toast(el.checked ? "💬 button on for everyone" : "💬 button off for everyone"); }),
  adminNoticeClear: () => { if (window.confirm("Take the message down? Anyone who hasn't seen it yet won't.")) adminDo("api/admin/notice/clear", {}, () => toast("Message taken down")); },
  signOut: () => signOut(),
  deleteAccount: () => openDeleteAccount(),
  deleteAccountConfirm: () => deleteAccount(),
  fbReload: () => { app.fbAdmin = null; render(); },
  fbFilter: (d) => { app.fbFilter = d.f; render(); },
  fbGroup: (d) => { app.fbGroup = d.g; render(); },
  fbCopy: () => copyText(app.fbKind === "problems" ? problemsText() : adminFeedbackText()),
  problemDelete: (d) => {
    if (!window.confirm("Delete this problem report? This can't be undone.")) return;
    adminDo("api/admin/problem/delete", { ref: d.ref }, () => {
      if (app.fbAdmin) app.fbAdmin.items = app.fbAdmin.items.filter((i) => i.ref !== d.ref);
      render(); toast("Report deleted");
    });
  },
  shopPlan: () => { app.weekStart = shopWeek(); go("week"); },
  shopAhead: (d) => { app.shopAhead = Math.max(0, Math.min(SHOP_AHEAD, (app.shopAhead || 0) + +d.d)); app.selecting.clear(); app.shopTab = "all"; render(); window.scrollTo(0, 0); },
  termsTick: (d, el) => { $("#termsGo").disabled = !el.checked; },
  termsAccept: () => acceptTerms(),
  adminTermsAsk: () => openSheet(`<p class="eyebrow">Admin</p><h1 class="title" style="font-size:26px">Ask everyone to agree again</h1>
    <p class="muted">Update the terms page first. Then list what's changed, one point per line. Everyone will see this list and be asked to confirm they still agree, the next time they open the app.</p>
    <form data-form="termsAsk" class="stack"><textarea name="changes" rows="6" maxlength="3000" placeholder="e.g. Added a section about little ones' details" required></textarea>
      <button class="btn lg primary">Ask everyone</button><button type="button" class="btn" data-close>Cancel</button></form>`),
  previewStart: () => previewNew(true),
  previewEnd: () => previewNew(false),
  fbOpen: (d) => { app.fbKind = d.k; app.fbAdmin = null; go("feedback"); },
  adminFilter: (d) => { app.adminFilter = d.f; render(); },
  adminMember: (d) => openAdminMember(d.email),
  adminHousehold: (d) => openAdminHousehold(d.id),
  adminAdd: (d) => openAdminAdd(d.id, d.name),
  adminResend: (d) => { const hit = adminFind(d.email); if (hit) copyText(inviteMessage(hit.m.name, hit.m.email)); },
  adminMoveTo: (d) => { const hit = adminFind(d.email), to = app.adminInfo.households.find((h) => h.id === d.id); adminDo("api/admin/move", { email: d.email, household: d.id }, () => toast(`${hit ? hit.m.name : d.email} moved to ${to ? to.name : "the new household"}`)); },
  adminRemove: (d) => { if (window.confirm(`Remove ${d.name}? They won't be able to sign in any more.`)) adminDo("api/admin/remove", { email: d.email }, () => toast(`${d.name} removed`)); },
  adminLeave: () => {
    const own = app.account && app.account.household;
    const msg = own && own.members.length <= 1 ? `Delete your household "${own.name}" and its plans, and make this an admin-only account?` : "Leave your household and make this an admin-only account?";
    if (window.confirm(msg)) adminDo("api/admin/leave", {}, () => { location.hash = "admin"; location.reload(); });
  },
  acctInvite: () => openInviteForm("member"),
  adminNewHousehold: () => openInviteForm("household"),
  inviteCopy: () => copyText(app.inviteMsg || ""),
  inviteShare: () => { navigator.share({ text: app.inviteMsg }).catch(() => {}); },
  acctRemove: async (d) => {
    if (!window.confirm(`Remove ${d.name} from your household? They won't be able to sign in any more.`)) return;
    try { await accountCall("api/account/remove", { email: d.email }); await loadAccount(); toast(`${d.name} removed`); } catch (err) { toast(err.message); }
  },
  adminDeleteHousehold: (d) => {
    if (window.confirm(`Delete ${d.name}? Everyone in it is signed out and all their plans, lists and settings are deleted for good. Ask them to download a backup first.`)) adminDo("api/admin/delete-household", { id: d.id }, () => toast(`${d.name} deleted`));
  },
  adminSync: async () => {
    try { const r = await accountCall("api/admin/sync", {}); await loadAccount(); toast(r.signIn.message); } catch (err) { toast(err.message); }
  },
  exportData: () => {
    const doc = { foodishard: 1, exported: new Date().toISOString(), state: app.state };
    const blob = new Blob([JSON.stringify(doc, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `foodishard-backup-${iso(new Date())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("Backup downloaded");
  },
  flag: (d) => { send({ op: "check", week: shopWeek(), key: d.key, field: d.f, value: d.v === "1" }); if (d.close) closeSheet(); },
  itemOpen: (d) => { if (app.selecting.size) return toggleSelect(d.key); openItem(d.key); },
  moveOne: (d) => { if (app.selecting.size) return toggleSelect(d.key); openMove([d.key]); },
  moveSel: () => openMove([...app.selecting]),
  selCancel: () => { app.selecting.clear(); render(); },
  pickMoveShop: (d, el) => { app.moveShop = d.s; $$("#sheetBody .shop-grid button").forEach((b) => b.classList.toggle("on", b === el)); const g = $("#moveGo"); g.disabled = false; g.textContent = `Move to ${shopName(d.s)}`; },
  confirmMove: () => {
    const keys = app.moveKeys || [], shop = app.moveShop, always = $("#moveAlways") && $("#moveAlways").checked;
    if (!shop || !keys.length) return;
    const week = shopWeek();
    if (always) { send({ op: "shop_pref", keys, shop }, { rerender: false }); keys.forEach((k) => send({ op: "shop_for", week, key: k, shop: null }, { rerender: false })); }
    else keys.forEach((k) => send({ op: "shop_for", week, key: k, shop }, { rerender: false }));
    app.selecting.clear(); closeSheet(); render();
    toast(`Moved ${keys.length} to ${shopName(shop)}`);
  },
  moveTo: (d) => { const week = shopWeek(); send({ op: "shop_pref", keys: [d.keys], shop: d.s }, { rerender: false }); send({ op: "shop_for", week, key: d.keys, shop: null }); closeSheet(); toast(`Now from ${shopName(d.s)}`); },
  count: (d) => { const it = buildList(shopWeek()).find((x) => x.key === d.key); if (it) send({ op: "qty", week: shopWeek(), key: d.key, n: (it.n || 1) + +d.d }); },
  removeItem: (d) => {
    const week = shopWeek();
    if (d.key.startsWith("x:")) { send({ op: "extra_remove", week, id: d.key.slice(2) }); toast("Removed"); return; }
    send({ op: "check", week, key: d.key, field: "have", value: true });
    toast(d.key.startsWith("s:") ? "Off the list this week" : "Moved to Not needed this week");
  },
  addCount: (d) => { const f = $("#sheetBody input[name=qty]"); const n = Math.max(1, (+f.value || 1) + +d.d); f.value = n; $("#addCountShow").textContent = n; },
  stapleCount: (d) => { const st = clone(settings().staples || []); st[+d.i].qty = Math.max(1, (+st[+d.i].qty || 1) + +d.d); send({ op: "settings", patch: { staples: st } });  openStaples({ keepScroll: true }); },
  resetPrice: (d) => { send({ op: "price", key: d.k, price: null }); closeSheet(); toast("Using the built-in estimate"); },
  removeExtra: (d) => { send({ op: "extra_remove", week: shopWeek(), id: d.id }); closeSheet(); },
  addItem: () => openAdd(),
  addShop: (d, el) => { $$("#sheetBody .shop-grid button").forEach((b) => b.classList.toggle("on", b === el)); $("#sheetBody input[name=shop]").value = d.s; },
  doneShopping: () => doneShopping(),
  toggleBought: () => { app.showBought = !app.showBought; render(); },
  rateMeal: (d) => openFeedback(d.id),
  unbuy: (d) => { send({ op: "trip", week: shopWeek(), key: d.key, keys: [d.key], undo: true }); toast("Back on the list"); },
  staples: () => { closeMenus(); openStaples(); },
  shopMenu: (d, el) => openMenu(el, [["staples", "Weekly staples…", "basket"], ["copyList", "Copy the list", "copy"], ["downloadList", "Download as text", "download"], ["printList", "Print or save as PDF", "print"], ["untickAll", "Untick everything", "trash"]]),
  copyList: () => { closeMenus(); copyText(listAsText(shopWeek(), { byShop: true })); },
  downloadList: () => { closeMenus(); downloadText(listAsText(shopWeek(), { byShop: true }), `shopping-${shopWeek()}.txt`); },
  printList: () => { closeMenus(); printList(); },
  untickAll: () => { closeMenus(); send({ op: "clear_checks", week: shopWeek() }); },
  // cooking
  cookClose: () => stopCooking(),
  cookIng: () => { app.cook.showIng = !app.cook.showIng; renderCook(); },
  cookStep: (d) => {
    const c = app.cook, n = visibleSteps(app.byId[c.id]).length;
    if (+d.d > 0 && c.step === n - 1) {
      const id = c.id, { week, i } = todaySlot(), day = planFor(week)[i];
      if (day && day.recipe === id && day.cooked !== id) dayUpdate(i, { cooked: id }, week); // today's dinner is done
      stopCooking({ handOver: true }); openFeedback(id); return;
    }
    c.step = Math.max(0, Math.min(n - 1, c.step + +d.d)); renderCook();
  },
  timerStart: (d) => { app.cook.timers.push({ label: `${d.m}-minute timer`, end: Date.now() + d.m * 60000 }); renderCook(); },
  timerStop: (d) => { app.cook.timers.splice(+d.i, 1); renderCook(); },
  // settings
  portion: (d) => { const people = clone(settings().people); people[+d.i].portion = Math.max(0.3, Math.min(3, Math.round((+people[+d.i].portion + +d.d) * 20) / 20)); send({ op: "settings", patch: { people } }); refreshPanel(); },
  portionSet: (d) => { const people = clone(settings().people); people[+d.i].portion = +d.v; app.fineTune = false; send({ op: "settings", patch: { people } }); refreshPanel(); },
  fineTune: () => { app.fineTune = true; refreshPanel(); },
  goal: (d) => { const people = clone(settings().people); people[+d.i].goal = Math.max(10, (+people[+d.i].goal || 40) + +d.d); send({ op: "settings", patch: { people } }); refreshPanel(); },
  person: (d) => { app.fineTune = false; openPerson(+d.i); },
  kidPanel: (d) => openKid(d.id),
  kidsOnNow: () => saveKids(kidsAll(), true),
  addPersonNamed: (d) => { if (settings().people.length >= MAX_PEOPLE) return; const people = clone(settings().people); people.push({ id: uid(), name: d.n, portion: 1, goal: 40 }); send({ op: "settings", patch: { people } }); closeSheet(); toast(`${d.n} added`); },
  babyReview: () => { const sg = babySuggestions().find((x) => !x.info) || babySuggestions()[0]; if (sg) openKid(sg.kid); else go("settings"); },
  babyAccept: (d) => {
    const sg = babySuggestions().find((x) => x.kid === d.kid && x.key === d.k); if (!sg) return;
    const k = kidsAll().find((x) => x.id === d.kid);
    updateKid(d.kid, { ...sg.set, dismissed: [...(k.dismissed || []), d.k] });
    refreshPanel(); toast("Updated");
  },
  babyDismiss: (d) => { const k = kidsAll().find((x) => x.id === d.kid); if (k) updateKid(d.kid, { dismissed: [...new Set([...(k.dismissed || []), d.k])] }); refreshPanel(); },
  kidPortion: (d) => { const k = kidsAll().find((x) => x.id === d.id); if (k) updateKid(d.id, { portion: Math.max(0.05, Math.round(((+k.portion || 0) + +d.d) * 100) / 100) }); refreshPanel(); },
  kidAdd: () => { if (kidsAll().length >= MAX_PEOPLE) return; const id = uid(); saveKids([...kidsAll(), { id, name: "", born: "", due: "", stage: "smooth", portion: 0.25, dismissed: [] }], true); openKid(id); },
  kidRemove: (d) => {
    const k = kidsAll().find((x) => x.id === d.id);
    if (window.confirm(`Remove ${k && k.name ? k.name : "this child"}? Their portions and notes come out of the recipes.`)) { saveKids(kidsAll().filter((x) => x.id !== d.id)); closeSheet(); }
  },
  addPerson: () => openAddPerson(),
  removePerson: (d) => { const people = clone(settings().people); if (people.length <= 1 || !window.confirm(`Remove ${people[+d.i].name}? Portions and the shopping list will be for one fewer.`)) return; people.splice(+d.i, 1); send({ op: "settings", patch: { people } }); closeSheet(); },
  allergyDone: () => { send({ op: "settings", patch: { allergyAsked: true } }); toast(avoidList().length ? "Saved. Recipes with those are hidden" : "Saved: no allergies"); },
  avoid: (d) => {
    const a = new Set(settings().avoid || []), adding = !a.has(d.k);
    if (adding && needsAllergyConsent()) return openAllergyConsent(d.k); // first allergy: ask before storing it
    adding ? a.add(d.k) : a.delete(d.k); send({ op: "settings", patch: { avoid: [...a] } });
  },
  allergyAgree: (d) => {
    const a = new Set(settings().avoid || []); if (d.k) a.add(d.k);
    send({ op: "settings", patch: { avoid: [...a], allergyConsent: { at: Math.floor(Date.now() / 1000), by: app.user || "" } } });
    closeSheet({ navigating: true }); toast(d.k ? "Saved. Recipes with that are hidden" : "Thanks. Your allergy settings are kept");
  },
  allergyClear: () => { send({ op: "settings", patch: { avoid: [], allergyAsked: true } }); closeSheet({ navigating: true }); toast("Allergy settings removed"); },
  shopToggle: (d) => {
    const on = new Set(settings().shops || SHOP_ORDER); on.has(d.k) ? on.delete(d.k) : on.add(d.k);
    if (!on.size) return toast("Keep at least one shop");
    send({ op: "settings", patch: { shops: SHOP_ORDER.filter((s) => on.has(s)) } });
  },
  stapleAdd: () => { const staples = clone(settings().staples || []); staples.push({ id: uid(), name: "", price: null, qty: 1, shop: enabledShops()[0] || "aldi", on: true }); send({ op: "settings", patch: { staples } }); openStaples({ keepScroll: true, focusLast: true }); },
  stapleDel: (d) => { const staples = clone(settings().staples || []); staples.splice(+d.i, 1); send({ op: "settings", patch: { staples } }); openStaples({ keepScroll: true }); },
};

function onClick(e) {
  if (e.target.closest("[data-close]") && !e.target.closest("[data-act]")) { closeSheet(); return; }
  const tab = e.target.closest(".nav button");
  if (tab) { closeSheet({ navigating: true }); go(tab.dataset.tab); return; }
  if (!e.target.closest(".menu") && !e.target.closest("[data-act=dayMenu],[data-act=shopMenu]")) closeMenus();
  const el = e.target.closest("[data-act]");
  if (!el || longPressFired) { longPressFired = false; return; }
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  if (el.tagName === "INPUT" && el.type === "checkbox" && app.selecting.size) { e.preventDefault(); toggleSelect(el.dataset.key); return; }
  fn(el.dataset, el, e);
}

function onChange(e) {
  const el = e.target, d = el.dataset;
  if (!d.set) return;
  const s = app.state ? settings() : {};
  const people = () => clone(s.people), staples = () => clone(s.staples || []);
  switch (d.set) {
    case "personName": { const p = people(); p[+d.i].name = el.value.trim() || p[+d.i].name; return send({ op: "settings", patch: { people: p } }); }
    case "kidsOn": { // the switch: on with nobody yet adds a little one and opens their details
      const list = kidsAll();
      if (el.checked && !list.length) { const id = uid(); saveKids([{ id, name: "", born: "", due: "", stage: "smooth", portion: 0.25, dismissed: [] }], true); openKid(id); return; }
      return saveKids(list, el.checked);
    }
    case "kid": {
      const k = kidsAll().find((x) => x.id === d.id) || {}, [y, m] = (k.born || "").split("-");
      const patch = d.f === "bornMonth" || d.f === "bornYear"
        ? { born: `${d.f === "bornYear" ? el.value : y || new Date().getFullYear()}-${d.f === "bornMonth" ? el.value : m || "01"}` }
        : d.f === "early" ? { early: +el.value || 0 } : { [d.f]: d.f === "name" ? el.value.trim() : el.value };
      updateKid(d.id, patch); if (d.f !== "name") refreshPanel(); return;
    }
    case "text": return send({ op: "settings", patch: { [d.f]: el.value } });
    case "num": {
      send({ op: "settings", patch: { [d.f]: +el.value } });
      if (d.f === "weekStartDay") { app.weekStart = iso(weekStartFor(new Date(), +el.value)); render(); }
      return;
    }
    case "bool": send({ op: "settings", patch: { [d.f]: el.checked } }); if (d.f === "lifeOn" && el.checked) toast("Life tab added"); return;
    case "acctName": case "acctHousehold": {
      const body = d.set === "acctName" ? { name: el.value } : { householdName: el.value };
      accountCall("api/account/rename", body).then((a) => { app.account = { ...app.account, ...a }; toast("Saved"); if (app.account.admin) loadAccount(); }).catch((err) => toast(err.message));
      return;
    }
    case "importFile": { const f = el.files && el.files[0]; el.value = ""; if (f) importBackup(f); return; }
    case "theme": { const t = { ...(s.themes || {}) }; if (el.value) t[d.i] = el.value; else delete t[d.i]; return send({ op: "settings", patch: { themes: t } }); }
    case "stapleName": { const st = staples(); st[+d.i] = { ...st[+d.i], name: el.value.trim() }; delete st[+d.i].k; return send({ op: "settings", patch: { staples: st } }); }
    case "stapleShop": { const st = staples(); st[+d.i].shop = el.value; send({ op: "settings", patch: { staples: st } }); if (staplesOpen()) openStaples({ keepScroll: true }); return; }
    case "stapleAmount": { const st = staples(); st[+d.i].amount = el.value; return send({ op: "settings", patch: { staples: st } }); }
    case "staplePrice": { const st = staples(); st[+d.i].price = el.value.trim() === "" ? null : Math.max(0, parseFloat(el.value.replace(/[£,]/g, "")) || 0); return send({ op: "settings", patch: { staples: st } }); }
    case "stapleOn": { const st = staples(); st[+d.i].on = el.checked; send({ op: "settings", patch: { staples: st } }); if (staplesOpen()) openStaples({ keepScroll: true }); return; }
    case "putDay": if (el.value !== "") { dayUpdate(+el.value, { recipe: d.id, status: "cook", note: null }); closeSheet(); toast(`${app.byId[d.id].name} added`); } return;
    default:
  }
}

function onSubmit(e) {
  const f = e.target.closest("[data-form]");
  if (!f) return;
  e.preventDefault();
  const val = (n) => (f.elements.namedItem(n) || {}).value || "";
  if (f.dataset.form === "adminAdd") {
    const body = { household: f.dataset.id, name: val("name").trim(), email: val("email").trim() };
    accountCall("api/admin/member", body).then(async (res) => { await loadAccount(); showInviteResult(body.name, body.email.toLowerCase(), res.signIn); }).catch((err) => toast(err.message));
    return;
  }
  if (f.dataset.form === "termsAsk") {
    const changes = val("changes").split("\n").map((x) => x.trim()).filter(Boolean);
    if (!changes.length) return;
    if (!window.confirm(`Ask all ${((app.adminInfo || {}).terms || {}).people || ""} people to agree to the updated terms?`)) return;
    adminDo("api/admin/terms/ask", { changes }, () => { closeSheet(); toast("Everyone will be asked on their next visit"); });
    return;
  }
  if (f.dataset.form === "report") {
    const text = val("text").trim(); if (!text) return;
    send({ op: "feedback", recipe: "_problem", rating: "problem", tags: [], note: `${text.slice(0, 300)}\n— ${reportDetails()}`.slice(0, 500) });
    closeSheet(); toast("Sent. Thanks for letting us know"); return;
  }
  if (f.dataset.form === "addPerson") { const name = val("name").trim(); if (!name || settings().people.length >= MAX_PEOPLE) return; const people = clone(settings().people); people.push({ id: uid(), name, portion: 1, goal: 40 }); send({ op: "settings", patch: { people } }); closeSheet(); toast(`${name} added`); return; }
  if (f.dataset.form === "adminNotice") { adminDo("api/admin/notice", { text: val("text") }, () => toast("Sent")); return; }
  if (f.dataset.form === "adminRename") { adminDo("api/admin/rename-household", { id: f.dataset.id, name: val("name").trim() }, () => toast("Renamed")); return; }
  if (f.dataset.form === "invite" || f.dataset.form === "newHousehold") { submitInvite(f.dataset.form === "newHousehold" ? "household" : "member", f); return; }
  if (f.dataset.form === "skip") { dayUpdate(+f.dataset.i, { status: "skip", note: val("note").trim() || null }); closeSheet(); return; }
  if (f.dataset.form === "price") {
    const price = parseFloat(val("price").replace(/[£,\s]/g, ""));
    if (!(price >= 0)) return toast("Enter a price, like 1.25");
    send({ op: "price", key: f.dataset.k, price, shop: val("shop") }); closeSheet(); toast("Price saved"); return;
  }
  if (f.dataset.form === "feedback") {
    if (!app.fbRating) return;
    const tags = $$("#sheetBody [data-act=feedbackTag].on").map((b) => b.dataset.t);
    send({ op: "feedback", recipe: f.dataset.id, rating: app.fbRating, tags, note: val("note").trim() }, { rerender: false });
    if (app.fbRating === "loved") send({ op: "pref", recipe: f.dataset.id, patch: { fav: true } }, { rerender: false });
    if (app.fbRating === "never") send({ op: "pref", recipe: f.dataset.id, patch: { ban: true } }, { rerender: false });
    closeSheet(); render();
    toast(app.fbRating === "never" ? "Won't suggest that again. It's under Recipes → Hidden." : "Saved");
    if (app.fbRating === "never") { // a third "Not again" within a few hours gets a sympathetic nod
      const recent = load("fihNever", []).filter((t) => Date.now() - t < 4 * 3600e3).concat(Date.now()); store("fihNever", recent);
      if (recent.length === 3) setTimeout(() => toast("Tough crowd tonight."), 2600);
    }
    return;
  }
  if (f.dataset.form === "manual") {
    const key = f.dataset.key, name = val("name").trim(), pt = val("price").replace(/[£,\s]/g, "");
    const price = pt === "" ? null : Math.max(0, parseFloat(pt) || 0);
    if (key.startsWith("x:")) send({ op: "extra_update", week: shopWeek(), id: key.slice(2), patch: { ...(name ? { name } : {}), price } });
    else if (key.startsWith("s:")) { const st = clone(settings().staples || []), s = st.find((x) => "s:" + x.id === key); if (s) { if (name) s.name = name; s.price = price; } send({ op: "settings", patch: { staples: st } }); }
    closeSheet(); toast("Saved"); return;
  }
  if (f.dataset.form === "add") {
    const name = val("name").trim(); if (!name) return;
    const shop = val("shop"), priceTxt = val("price").replace(/[£,\s]/g, "");
    const price = priceTxt === "" ? null : Math.max(0, parseFloat(priceTxt) || 0);
    app.lastShop = shop;
    send({ op: "extra_add", week: shopWeek(), item: { id: uid(), name, price, qty: Math.max(1, +val("qty") || 1), shop } });
    closeSheet(); toast(`Added ${name} (${shopName(shop)})`);
  }
}

let searchTimer;
// ---------------------------------------------------------------------------
// About: what's stored and the safety notes.
// ---------------------------------------------------------------------------
function openAbout() {
  const online = app.host === "Cloudflare", ha = app.mode === "live" && !online;
  const where = online
    ? `<p>FoodIsHard online runs on a Cloudflare account belonging to its host, who invited you or your household. It's a not-for-profit project, not a business. Your meal plans, shopping lists and settings are kept securely in a database on Cloudflare's servers${app.region === "eu" ? " in the EU" : ""}. They aren't shown to the host in the app. As the account owner they could access them, but only would if you asked, for example to help fix a problem. Cloudflare also sends the sign-in codes.</p>
       <ul>
         <li><b>About you:</b> your name, your email (to sign in), your household's name, who invited you, when you last used the app (so unused places can be freed up), whether you've seen the latest announcement, and when you agreed to the terms of use.</li>
         <li><b>About your household:</b> meal plans, shopping lists, prices, settings (including any allergies you tick and, if you add little ones, whatever first name or nickname you give them, the month and year they were born, and how many weeks early, if they were. Never their exact date of birth), recipe feedback and, if you use Life is hard, your routines with when and by whom each was last done.</li>
         <li><b>Allergies</b> are health information, so they're only stored if you tick them and confirm. Untick them to remove them.</li>
         <li><b>Recipe ratings and notes</b> are shown to the person who runs FoodIsHard without your name or household attached (just the day), so they can improve the recipes. <b>Problem reports</b> include your household's name and first name so they can follow up, plus the app version, your device type and browser, and the last error. Nothing else of your household's is shown to them in the app.</li>
         <li><b>In your household,</b> everyone shares the plans, lists and settings, and can see each other's name, email and when they last used the app.</li>
         <li><b>Never stored:</b> passwords (there aren't any) or payment details.</li>
         <li><b>Not shared:</b> other households can never see your data, and nothing is sold or used for advertising.</li>
       </ul>
       <p>Old shopping lists are deleted after 8 weeks and meal plans after a year. The full details, including how long everything is kept, your rights and how to complain, are in the <a href="https://foodishard.uk/privacy.html" target="_blank" rel="noopener">privacy policy</a>.</p>
       <p>You can <b>download a backup</b> of your household's data any time (Settings → Your data), and <b>delete your account</b> yourself (Settings → Your account). If you're the last person in your household, that deletes the household's data too.</p>`
    : ha ? `<p>Everything is stored on your own Home Assistant, and only people with a Home Assistant login can open it. Nothing is sent anywhere else. Old shopping lists are deleted after 8 weeks and meal plans after a year.</p>`
    : `<p>This is a preview. Everything is saved in this browser only.</p>`;
  openSheet(`<div class="row" style="gap:14px;margin-bottom:6px"><img src="icon-192.png" alt="" width="56" height="56" style="border-radius:14px"><div><p class="eyebrow">About</p><h1 class="title" style="font-size:26px;margin:0">FoodIsHard</h1></div></div>
    <div class="stack about" style="gap:6px">
      <p>A free, not-for-profit meal planner for vegetarian households. It isn't a business or a professional service, and it comes with no guarantees: you use it at your own risk.</p>
      <h2 class="h2">Food safety: please read</h2>
      <ul>
        <li><b>Recipes haven't been checked by a dietitian or doctor.</b> Treat them, the nutrition figures and the prices as rough guides.</li>
        <li><b>Allergies:</b> the allergy settings hide recipes that list an allergen, but they can't know what's in the products you buy. Products and labels change, so <b>always check the label</b>, every time.</li>
        <li><b>Vegetarian:</b> some cheeses and other products use animal rennet or gelatine. Check for the vegetarian symbol.</li>
        <li><b>Babies:</b> the baby notes are general ideas, not medical advice. Follow NHS weaning guidance and your health visitor, cut food to a safe size, avoid whole nuts and added salt, and never leave a baby alone while eating.</li>
        <li>If you have a medical condition or a serious allergy, check with a professional.</li>
      </ul>
      <h2 class="h2">Your data</h2>
      ${where}
      <p>Once a week the app looks up the UK food price index from the Office for National Statistics. That request contains no personal data.</p>
      <p class="small muted">More detail: <a href="https://foodishard.uk/privacy.html" target="_blank" rel="noopener">privacy policy</a> and <a href="https://foodishard.uk/terms.html" target="_blank" rel="noopener">terms of use</a>.</p>
    </div>`);
}

// ---------------------------------------------------------------------------
// Households and invites (online version only)
// ---------------------------------------------------------------------------
async function accountCall(path, body) {
  const r = await appFetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  let res = {};
  try { res = await r.json(); } catch { /* not json */ }
  if (!r.ok) throw new Error(res.error || `Something went wrong (${r.status})`);
  return res;
}
// ---- Who you cook for: one list of everyone who eats dinner (sizes, little ones) ----
const SIZES = [["Smaller", 0.75], ["Regular", 1], ["Larger", 1.25], ["Extra", 1.5]];
const PORTION_FRACTIONS = { 0.2: "⅕", 0.25: "¼", 0.33: "⅓", 0.4: "⅖", 0.5: "½" };
function portionShort(p) { return PORTION_FRACTIONS[p] || `${Math.round((+p || 0) * 100)}%`; }
function sizeLabel(portion) { const hit = SIZES.find(([, v]) => Math.abs(v - portion) < 0.01); return hit ? hit[0] : `×${(+portion).toFixed(2).replace(/0$/, "")}`; }
let typicalKcal = null;
/** Calories in a typical dinner here: the middle of all the recipes, per standard portion. */
function typicalDinnerKcal() {
  if (typicalKcal == null) { const all = app.recipes.map((r) => nutritionPerPortion(r).kcal).sort((a, b) => a - b); typicalKcal = all[Math.floor(all.length / 2)] || 650; }
  return typicalKcal;
}
function whoYouCookFor() {
  const s = settings(), { factor } = household(), kidsHere = kidsOn() ? kidsAll() : [], paused = !kidsOn() && kidsAll().length;
  const adults = s.people.map((p, i) => `<button class="rrow" data-act="person" data-i="${i}" style="padding:12px 16px"><span class="grow"><b>${esc(p.name)}</b><br><span class="small muted">${esc(sizeLabel(+p.portion || 1))} · about ${Math.round(typicalDinnerKcal() * (+p.portion || 1) / 10) * 10} kcal</span></span><span class="muted" aria-hidden="true">›</span></button>`).join("");
  const little = kidsHere.map((k) => `<button class="rrow kid-stripe ${kidBornDate(k) ? "" : "nudge-field"}" data-act="kidPanel" data-id="${esc(k.id)}" style="padding:12px 16px;${kidStyle(k)}"><span class="grow"><b>${esc(k.name || "Little one")}</b><br><span class="small muted">${kidBornDate(k) ? esc(monthsText(kidAge(k))) : "add when they were born"} · ${esc((STAGES[k.stage]?.name || "").split(" &")[0])} · ${esc(portionShort(k.portion))} portion</span></span><span class="muted" aria-hidden="true">›</span></button>`).join("");
  return `<p class="section-label">Who you cook for</p>
    <div class="list">
      <div class="row between" style="padding:12px 16px;gap:12px;background:var(--sunk)"><span class="small muted">Everyone who eats dinner, signed in or not</span><b style="white-space:nowrap">${niceNumber(factor)} portions a night</b></div>
      ${adults}
      <div style="padding:4px 16px 12px">${settings().people.length < MAX_PEOPLE ? `<button class="btn sm" data-act="addPerson">${icon("plus", 16)}Add a grown-up</button>` : `<span class="small muted">Up to ${MAX_PEOPLE} grown-ups. Use guests on a day for bigger gatherings.</span>`}</div>
      <label class="row between" style="padding:13px 16px;border-top:1px solid var(--line-soft);gap:12px"><span><b>Cooking for little ones</b><br><span class="small muted">${paused ? `${esc(kidNames(kidsAll()))} ${kidsAll().length > 1 ? "are" : "is"} saved but left out for now` : "Their own portions, stages and safety notes in every recipe"}</span></span>
        <span class="switch"><input type="checkbox" data-set="kidsOn" ${kidsOn() ? "checked" : ""} aria-label="Cooking for little ones"><i></i></span></label>
      ${little}
      ${kidsOn() ? `<div style="padding:4px 16px 12px">${kidsAll().length < MAX_PEOPLE ? `<button class="btn sm" data-act="kidAdd">${icon("plus", 16)}Add a little one</button>` : `<span class="small muted">Up to ${MAX_PEOPLE} little ones.</span>`}</div>` : ""}
    </div>`;
}
/** A grown-up's panel: name, named size (with what it means), optional protein goal. */
function openPerson(i, { keepScroll = false } = {}) {
  const s = settings(), p = s.people[i]; if (!p) return;
  const portion = +p.portion || 1, named = SIZES.some(([, v]) => Math.abs(v - portion) < 0.01);
  const fine = app.fineTune || !named;
  openSheet(`<p class="eyebrow">Who you cook for</p><h1 class="title" style="font-size:26px">${esc(p.name)}</h1>
    <label class="stack" style="gap:6px;margin-bottom:14px"><span class="small muted">Name</span><input class="input" value="${esc(p.name)}" data-set="personName" data-i="${i}"></label>
    <p class="section-label" style="margin-top:0">Dinner size</p>
    <div class="seg" style="margin-bottom:8px">${SIZES.map(([n, v]) => `<button class="${Math.abs(v - portion) < 0.01 ? "on" : ""}" data-act="portionSet" data-i="${i}" data-v="${v}">${n}</button>`).join("")}</div>
    <p class="small" style="margin:0 0 6px">About <b>${Math.round(typicalDinnerKcal() * portion / 10) * 10} kcal</b> for a typical dinner here. For example, 90 g of pasta becomes <b>${Math.round(90 * portion / 5) * 5} g</b>.</p>
    ${fine ? `<div class="row between" style="margin:6px 0"><span class="small muted">Fine-tune</span><div class="stepper"><button data-act="portion" data-i="${i}" data-d="-0.05" aria-label="Less">−</button><span>×${portion.toFixed(2)}</span><button data-act="portion" data-i="${i}" data-d="0.05" aria-label="More">+</button></div></div>`
      : `<button class="btn sm ghost" style="margin-bottom:6px" data-act="fineTune" data-i="${i}">Fine-tune</button>`}
    <p class="section-label">Protein goal at dinner <span class="muted" style="text-transform:none;letter-spacing:0">(optional)</span></p>
    <div class="row" style="justify-content:flex-end"><div class="stepper"><button data-act="goal" data-i="${i}" data-d="-5" aria-label="Less">−</button><span>${p.goal || 40} g</span><button data-act="goal" data-i="${i}" data-d="5" aria-label="More">+</button></div></div>
    <div class="row" style="gap:8px;margin-top:18px"><button class="btn primary" data-close>Done</button>${s.people.length > 1 ? `<button class="btn" style="color:var(--warm)" data-act="removePerson" data-i="${i}">${icon("trash", 16)}Remove</button>` : ""}</div>`, { keepScroll });
  app.panel = { type: "person", i };
}
/** A little one's panel: the same details as before (dates, stage, portion, suggestions). */
function openKid(id, { keepScroll = false } = {}) {
  const k = kidsAll().find((x) => x.id === id); if (!k) return;
  const corrected = kidEarlyWeeks(k) > 0;
  openSheet(`<p class="eyebrow">Who you cook for</p><h1 class="title" style="font-size:26px">${esc(k.name || "Little one")}</h1>
    <div class="list">${kidCardHtml(k, corrected)}</div>
    <div class="row" style="gap:8px;margin-top:14px"><button class="btn primary" data-close>Done</button></div>`, { keepScroll });
  app.panel = { type: "kid", id };
}
/** Birth month and year, and weeks early: all a little one's advice needs (no exact dates are kept). */
function kidBornFields(k) {
  const [y, m] = (k.born || "").split("-"), now = new Date().getFullYear(), id = esc(k.id), need = kidBornDate(k) ? "" : " nudge-field";
  const months = Array.from({ length: 12 }, (_, i) => [String(i + 1).padStart(2, "0"), new Date(2000, i, 1).toLocaleDateString("en-GB", { month: "short" })]);
  const years = Array.from({ length: 13 }, (_, i) => String(now - i)), early = kidEarlyWeeks(k);
  return `<div class="row" style="gap:8px">
      <label class="grow"><span class="small muted">Born in</span><select class="input${need}" data-set="kid" data-id="${id}" data-f="bornMonth" aria-label="Month born">${m ? "" : `<option value="" selected disabled>Month</option>`}${months.map(([v, n]) => `<option value="${v}" ${v === m ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="grow"><span class="small muted">&nbsp;</span><select class="input${need}" data-set="kid" data-id="${id}" data-f="bornYear" aria-label="Year born">${y ? "" : `<option value="" selected disabled>Year</option>`}${years.map((v) => `<option value="${v}" ${v === y ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>
    <label><span class="small muted">Born early?</span><select class="input" data-set="kid" data-id="${id}" data-f="early">${Array.from({ length: 17 }, (_, w) => `<option value="${w}" ${w === early ? "selected" : ""}>${w ? `${w} week${w === 1 ? "" : "s"} early` : "No, around their due date"}</option>`).join("")}</select></label>`;
}
function kidCardHtml(k, corrected) {
  return `<div class="stack kid-card" style="padding:14px 16px;gap:10px;${kidStyle(k)}">
        <div class="row"><span class="kid-dot" aria-hidden="true"></span><input class="input grow" value="${esc(k.name)}" placeholder="First name or nickname (optional)" data-set="kid" data-id="${esc(k.id)}" data-f="name" aria-label="First name or nickname (optional)">
          <button class="icon-btn plain" data-act="kidRemove" data-id="${esc(k.id)}" aria-label="Remove ${esc(k.name || "child")}">${icon("trash", 18)}</button></div>
        ${kidBornFields(k)}
        <span class="small muted">${kidBornDate(k) ? `About ${esc(monthsText(kidAge(k)))} old${corrected ? ` · ${esc(monthsText(kidAge(k, true)))} corrected` : ""}` : "Add the month and year they were born."}</span>
        <label><span class="small muted">Eating stage</span><select class="input" data-set="kid" data-id="${esc(k.id)}" data-f="stage">${Object.entries(STAGES).map(([s2, v]) => `<option value="${s2}" ${k.stage === s2 ? "selected" : ""}>${v.name}</option>`).join("")}</select></label>
        <span class="small muted">${esc(STAGES[k.stage]?.hint || "")}</span>
        ${kidSuggestions(k).map(babySuggestionCard).join("")}
        <div class="row between"><span class="small muted">Portion size (share of an adult's)</span><div class="stepper"><button data-act="kidPortion" data-id="${esc(k.id)}" data-d="-0.05" aria-label="Less">−</button><span>${(+k.portion || 0).toFixed(2)}</span><button data-act="kidPortion" data-id="${esc(k.id)}" data-d="0.05" aria-label="More">+</button></div></div>
      </div>`;
}
/** Redraw whichever person panel is open after a change (not while typing a name). */
function refreshPanel() {
  const p = app.panel; if (!p || $("#sheet").hidden) return;
  if (p.type === "person") openPerson(p.i, { keepScroll: true }); else openKid(p.id, { keepScroll: true });
}
function openAddPerson() {
  const names = new Set(settings().people.map((p) => p.name.toLowerCase()));
  const members = (app.account && app.account.household ? app.account.household.members : []).map((m) => m.name).filter((n) => n && !names.has(n.toLowerCase()));
  openSheet(`<p class="eyebrow">Who you cook for</p><h1 class="title" style="font-size:26px">Add a grown-up</h1>
    ${members.length ? `<p class="small muted" style="margin-bottom:6px">From your household:</p><div class="chips wrap" style="margin-bottom:12px">${members.map((n) => `<button class="chip" data-act="addPersonNamed" data-n="${esc(n)}">${esc(n)}</button>`).join("")}</div>` : ""}
    <form data-form="addPerson" class="stack"><label><span class="small muted">Name</span><input class="input" name="name" required autocomplete="off" placeholder="e.g. Grandad"></label>
      <button class="btn lg primary">Add</button></form>`);
}

// ---- "Update ready" (online version) ----
const newerThan = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
async function updateReady(worker) {
  app.update = { worker, notes: [] };
  try {
    const res = await fetch("whatsnew.json", { cache: "no-store" });
    const { versions = [] } = await res.json();
    const fresh = versions.filter((v) => newerThan(v.version, APP_VERSION));
    app.update.version = fresh.length ? fresh[0].version : null;
    app.update.notes = fresh.flatMap((v) => v.notes).slice(0, 6);
  } catch { /* no notes: the button still works */ }
  if (["tonight", "week", "shop", "recipes", "life", "settings"].includes(app.tab) && !app.cook) render();
}
function updateCard() {
  const u = app.update;
  if (!u) return "";
  return `<div class="update-card" role="status">
    <div class="row between"><b>Update ready${u.version ? ` · FoodIsHard ${esc(u.version)}` : ""}</b><span class="update-dot" style="position:static" aria-hidden="true">!</span></div>
    ${u.notes.length ? `<span class="small">What's new:</span><ul class="small">${u.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    <button class="btn primary" style="align-self:flex-start" data-act="updateNow">Update now</button>
    <span class="small muted">Anything you've ticked is kept.</span></div>`;
}
function updateNow() {
  const u = app.update; if (!u) return;
  app.updating = true;
  u.worker.postMessage("skipWaiting");
  setTimeout(() => location.reload(), 3000); // in case the switch-over message is missed
}

// ---- A message from the admin, shown once to each person (online version) ----
let noticeChecked = 0;
/** The 💬 "Report a problem" button on every page (online). The admin switches it on or off for everyone. */
function reportBubble() {
  const on = app.host === "Cloudflare" && app.reportBubble === true, el = $("#reportBubble");
  document.body.classList.toggle("has-bubble", on);
  if (on && !el) document.body.insertAdjacentHTML("beforeend", `<button id="reportBubble" class="report-bubble" data-act="report" aria-label="Report a problem">💬</button>`);
  if (!on && el) el.remove();
}
async function loadNotice() {
  if (Date.now() - noticeChecked < 10 * 60000) return; // at most every 10 minutes
  noticeChecked = Date.now();
  try {
    const { notice, reportBubble: bubble } = await accountCall("api/notice");
    app.reportBubble = bubble === true; reportBubble();
    if (notice) showNotice(notice);
  } catch { noticeChecked = 0; /* try again next time */ }
}
function showNotice(n) {
  const el = $("#notice");
  el.dataset.id = n.id;
  el.innerHTML = `<div class="row" style="gap:10px"><img src="icon-192.png" alt="" width="28" height="28" style="border-radius:8px"><span class="eyebrow grow" style="margin:0">Message from FoodIsHard · ${shortDate(n.at)}</span></div>
    <div class="notice-text">${esc(n.text)}</div>
    <button class="btn sm primary" style="align-self:flex-end" data-act="noticeDismiss">Got it</button>`;
  el.hidden = false;
}
async function dismissNotice() {
  const el = $("#notice"); el.hidden = true;
  try { await accountCall("api/notice/seen", { id: Number(el.dataset.id) }); } catch { /* shown again next time: better than never */ }
}
function openAdminNotice() {
  const n = (app.adminInfo || {}).notice;
  openSheet(`<p class="eyebrow">Admin</p><h1 class="title" style="font-size:26px">Message everyone</h1>
    <p class="muted">Each person sees it once. Sending a new message replaces the old one.</p>
    ${n ? `<div class="list" style="margin-bottom:12px"><div class="stack" style="padding:12px 16px;gap:6px"><span class="small muted">Showing now · sent ${shortDate(n.at)} · seen by ${n.seenBy} of ${app.adminInfo.people}</span><span style="white-space:pre-line">${esc(n.text)}</span>
      <button class="btn sm" style="align-self:flex-start;color:var(--warm)" data-act="adminNoticeClear">Take it down</button></div></div>` : ""}
    <form data-form="adminNotice" class="stack">
      <textarea class="input" name="text" rows="4" maxlength="400" required placeholder="e.g. 5 new recipes this week. Tell me what you think!" style="resize:vertical;min-height:100px"></textarea>
      <span class="small muted">Up to 400 characters. People who join later see it too, until you take it down.</span>
      <button class="btn lg primary">${n ? "Send instead" : "Send to everyone"}</button></form>`);
}

// ---- Sign out and delete my account (online version) ----
/** Forget this device's copy (so the next person can't see it offline), then end the Cloudflare sign-in. */
async function signOut({ ask = true } = {}) {
  if (ask && load(QUEUE_KEY, []).length) {
    try { await flushQueue(); } catch { /* checked below */ }
    const left = load(QUEUE_KEY, []).length;
    if (left && !window.confirm(`${left} change${left === 1 ? " hasn't" : "s haven't"} been sent yet (no signal?). Sign out anyway and lose ${left === 1 ? "it" : "them"}?`)) return;
  }
  [CACHE_KEY, QUEUE_KEY, HOST_KEY].forEach((k) => { try { localStorage.removeItem(k); } catch { /* fine */ } });
  location.href = "/cdn-cgi/access/logout";
}
function openDeleteAccount() {
  const a = app.account; if (!a || !a.household) return;
  const last = a.household.members.length <= 1;
  openSheet(`<p class="eyebrow">Your account</p><h1 class="title" style="font-size:26px">Delete my account?</h1>
    <div class="stack about" style="gap:6px">
      <p>This removes <b>${esc(a.me.email)}</b> from FoodIsHard straight away, and you won't be able to sign in any more.</p>
      ${last
        ? `<p><b>You're the only person in ${esc(a.household.name)}</b>, so the household is deleted too: every plan, list, price, setting and rating, for good. Download a backup first if you might want it.</p>
           <button class="btn" data-act="exportData">${icon("download", 16)}Download a backup first</button>`
        : `<p>${esc(a.household.name)} carries on for everyone else, with its plans and lists. Your name is taken off past ticks and notes.</p>`}
      ${a.admin ? `<p class="small muted">You're an admin, so you'll still be able to open the admin dashboard until your email is taken out of ADMINS in Cloudflare.</p>` : ""}
      <p class="small muted">To join again later, someone will need to invite you.</p>
    </div>
    <div class="stack" style="margin-top:14px">
      <button class="btn lg" style="color:var(--warm)" data-act="deleteAccountConfirm">${icon("trash", 16)}${last ? `Delete my account and ${esc(a.household.name)}` : "Delete my account"}</button>
      <button class="btn" data-close>Keep my account</button>
    </div>`);
}
async function deleteAccount() {
  const a = app.account; if (!a || !a.household) return;
  if (!window.confirm(a.household.members.length <= 1 ? `Really delete your account and all of ${a.household.name}'s data? This can't be undone.` : "Really delete your account? This can't be undone.")) return;
  try {
    await accountCall("api/account/delete", {});
  } catch (err) { return toast(`Couldn't delete: ${err.message}`); }
  closeSheet();
  $("#view").innerHTML = `<div class="empty" style="margin-top:20vh">Your account has been deleted.<br>Signing you out…</div>`;
  setTimeout(() => signOut({ ask: false }), 1500);
}
async function loadAccount() {
  try {
    app.account = await accountCall("api/account");
    app.adminInfo = app.account.admin ? await accountCall("api/admin") : null;
  } catch (err) { app.account = { error: err.message }; }
  if ((app.tab === "admin" || app.tab === "feedback") && app.mode !== "admin" && !(app.account && app.account.admin)) { app.tab = "settings"; history.replaceState(null, "", "#settings"); }
  if (app.tab === "settings" || app.tab === "admin") render();
}
/** Sign out and delete my account: the bottom of Settings, online version only. */
function accountFooter() {
  const a = app.account;
  if (app.host !== "Cloudflare") return "";
  return `<p class="section-label">Your account</p>
    <div class="list">
      <div class="row" style="padding:13px 16px"><span class="grow"><b>Sign out</b></span><button class="btn sm" data-act="signOut">Sign out</button></div>
      ${a && a.household ? `<div class="row" style="padding:13px 16px"><span class="grow"><b>Delete my account</b></span><button class="btn sm" style="color:var(--warm)" data-act="deleteAccount">Delete…</button></div>` : ""}
    </div>`;
}
function accountSection() {
  if (app.host !== "Cloudflare") return "";
  const a = app.account;
  if (!a) {
    if (app.offline || app.signedOut) return `<p class="section-label">Who's in your household</p><div class="list"><div class="row" style="padding:13px 16px"><span class="muted">${app.signedOut ? "Sign in again to manage your household." : "Managing your household needs a connection."}</span></div></div>`;
    if (!app.accountLoading) { app.accountLoading = true; loadAccount().finally(() => { app.accountLoading = false; }); }
    return `<p class="section-label">Who's in your household</p><div class="list"><div class="row" style="padding:13px 16px"><span class="muted">Loading…</span></div></div>`;
  }
  if (a.error) return `<p class="section-label">Your household</p><div class="list"><div class="row" style="padding:13px 16px"><span class="grow muted">Couldn't load: ${esc(a.error)}</span><button class="btn sm" data-act="acctReload">Retry</button></div></div>`;
  const meEmail = a.me.email;
  const members = a.household.members.map((m) => `<div class="row" style="padding:12px 16px"><span class="grow"><b>${esc(m.name)}</b>${m.email === meEmail ? ` <span class="small muted">(you)</span>` : ""}<br><span class="small muted">${esc(m.email)}</span></span>
      ${m.email !== meEmail ? `<button class="icon-btn plain" data-act="acctRemove" data-email="${esc(m.email)}" data-name="${esc(m.name)}" aria-label="Remove ${esc(m.name)}">${icon("trash", 18)}</button>` : ""}</div>`).join("");
  let html = `<p class="section-label">Who's in your household</p>
    <div class="list">
      <div class="stack" style="padding:14px 16px;gap:8px"><label><span class="small muted">Household name</span><input class="input" value="${esc(a.household.name)}" data-set="acctHousehold"></label>
        <label><span class="small muted">Your name</span><input class="input" value="${esc(a.me.name)}" data-set="acctName"></label></div>
      ${members}
      <div style="padding:12px 16px" class="stack"><button class="btn sm" style="align-self:flex-start" data-act="acctInvite">${icon("plus", 16)}Invite someone to your household</button></div>
    </div>`;
  if (a.admin) {
    html += `<p class="section-label">Admin</p>
    <div class="list"><button class="rrow" data-act="go" data-to="admin"><span class="grow"><b>Admin dashboard</b></span><span class="muted">›</span></button></div>`;
  }
  return html;
}
function openInviteForm(kind) {
  const newHousehold = kind === "household";
  openSheet(`<p class="eyebrow">${newHousehold ? "Admin" : esc(app.account.household.name)}</p><h1 class="title" style="font-size:26px">${newHousehold ? "Invite a new household" : "Invite someone"}</h1>
    <p class="muted">${newHousehold ? "They'll get their own private plan and list." : "They'll share your plan and shopping list."}</p>
    <form data-form="${newHousehold ? "newHousehold" : "invite"}" class="stack">
      ${newHousehold ? `<label><span class="small muted">Household name</span><input class="input" name="householdName" placeholder="e.g. The Smiths" required autocomplete="off"></label>` : ""}
      <label><span class="small muted">Their first name</span><input class="input" name="name" required autocomplete="off"></label>
      <label><span class="small muted">Their email (the one they'll sign in with)</span><input class="input" name="email" type="email" required autocomplete="off" inputmode="email"></label>
      <button class="btn lg primary">Add them</button></form>`);
}
function inviteMessage(name, email) {
  const url = `${location.origin}${location.pathname.replace(/[^/]*$/, "")}`;
  return `Hi ${name}! I've added you to FoodIsHard, the meal planner we use.

1. Open ${url} on your phone
2. Sign in with ${email}, using Google or a code sent by email
3. Add it to your home screen from your browser's menu, so it opens like an app.`;
}
function showInviteResult(name, email, signIn) {
  const msg = inviteMessage(name, email);
  app.inviteMsg = msg;
  const warn = signIn && !signIn.ok
    ? `<p class="small" style="color:var(--warm)">${signIn.manual ? (app.account && app.account.admin ? "Add their email to your Access policy in Cloudflare before they try to sign in." : "Ask whoever runs FoodIsHard to let their email sign in (it isn't automatic yet).") : `The sign-in list didn't update: ${esc(signIn.message || "")}`}</p>` : "";
  openSheet(`<p class="eyebrow">Done</p><h1 class="title" style="font-size:26px">${esc(name)} is added</h1>${warn}
    <p class="muted">Send them this:</p><div class="card" style="padding:14px;white-space:pre-wrap">${esc(msg)}</div>
    <div class="row" style="gap:8px;margin-top:12px">${navigator.share ? `<button class="btn primary" data-act="inviteShare">Share</button>` : ""}<button class="btn" data-act="inviteCopy">${icon("copy", 16)}Copy</button></div>`);
}
async function submitInvite(kind, f) {
  const val = (n) => ((f.elements.namedItem(n) || {}).value || "").trim();
  const body = { name: val("name"), email: val("email") };
  if (kind === "household") body.householdName = val("householdName");
  const btn = f.querySelector("button"); if (btn) { btn.disabled = true; btn.textContent = "Adding…"; }
  try {
    const res = await accountCall(kind === "household" ? "api/admin/household" : "api/account/invite", body);
    await loadAccount();
    showInviteResult(body.name, body.email.toLowerCase(), res.signIn);
  } catch (err) {
    toast(err.message);
    if (btn) { btn.disabled = false; btn.textContent = "Add them"; }
  }
}

// ---------------------------------------------------------------------------
// Admin dashboard (online version)
// ---------------------------------------------------------------------------
function ago(secs) {
  if (!secs) return null;
  const d = Math.max(0, Date.now() / 1000 - secs);
  if (d < 3600) return "in the last hour";
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 86400 * 60) return `${Math.floor(d / 86400)} day${Math.floor(d / 86400) === 1 ? "" : "s"} ago`;
  return `${Math.floor(d / 86400 / 30)} months ago`;
}
function shortDate(secs) { const d = new Date(secs * 1000); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
const INACTIVE_DAYS = 30;
function memberStatus(m) {
  if (!m.lastSeen) return "never";
  return Date.now() / 1000 - m.lastSeen > INACTIVE_DAYS * 86400 ? "inactive" : "active";
}
function viewAdmin() {
  const ad = app.adminInfo, acct = app.account;
  const back = app.mode === "admin" ? "" : `<button class="icon-btn" data-act="go" data-to="settings" aria-label="Back to settings">${icon("left", 18)}</button>`;
  const right = `<div class="row" style="gap:6px"><button class="icon-btn" data-act="acctReload" aria-label="Refresh">${icon("refresh", 18)}</button>${back}</div>`;
  if (!ad) return `${header("FoodIsHard", "Admin", right, { logo: true })}<div class="list"><div class="row" style="padding:16px"><span class="muted">${acct && acct.error ? `Couldn't load: ${esc(acct.error)}` : "Loading…"}</span></div></div>`;
  const people = ad.households.flatMap((h) => h.members.map((m) => ({ ...m, household: h })));
  const never = people.filter((m) => memberStatus(m) === "never").length, inactive = people.filter((m) => memberStatus(m) === "inactive").length;
  const f = app.adminFilter || "all";
  const pct = Math.min(100, Math.round((ad.people / ad.limits.people) * 100));
  const sync = ad.lastSync;
  const chip = (id, label) => `<button class="chip ${f === id ? "on" : ""}" data-act="adminFilter" data-f="${id}">${label}</button>`;
  const memberRow = (m, h) => {
    const st = memberStatus(m);
    if (f !== "all" && st !== f) return "";
    const seen = st === "never" ? `<span style="color:var(--warm)">Never signed in</span>` : `Active ${ago(m.lastSeen)}`;
    const inviter = m.addedBy && people.find((p) => p.email === m.addedBy);
    const by = !m.addedBy || m.addedBy === "import" ? "" : ` · invited by ${inviter ? esc(inviter.name) : "an admin"}`;
    return `<div class="row" style="padding:11px 16px" data-text="${esc(`${m.name} ${m.email} ${h.name}`.toLowerCase())}"><span class="grow"><b>${esc(m.name)}</b> <span class="small muted">${esc(m.email)}</span><br>
      <span class="small muted">${seen} · joined ${shortDate(m.created)}${by}</span></span>
      <button class="icon-btn sm plain" data-act="adminMember" data-email="${esc(m.email)}" aria-label="Options for ${esc(m.name)}">${icon("dots", 17)}</button></div>`;
  };
  const households = ad.households.map((h) => {
    const rows = h.members.map((m) => memberRow(m, h)).join("");
    if (f !== "all" && !rows) return "";
    return `<section class="list" style="margin-bottom:12px" data-group-list>
      <div class="row" style="padding:12px 16px;background:var(--sunk)" data-text="${esc(h.name.toLowerCase())}" data-name="${esc(h.name.toLowerCase())}">
        <span class="grow"><b>${esc(h.name)}</b> <span class="small muted">${h.members.length} ${h.members.length === 1 ? "person" : "people"}</span></span>
        <button class="icon-btn sm plain" data-act="adminAdd" data-id="${esc(h.id)}" data-name="${esc(h.name)}" aria-label="Add someone to ${esc(h.name)}">${icon("plus", 17)}</button>
        <button class="icon-btn sm plain" data-act="adminHousehold" data-id="${esc(h.id)}" aria-label="Options for ${esc(h.name)}">${icon("dots", 17)}</button></div>
      ${rows || `<div class="row" style="padding:11px 16px"><span class="small muted">Nobody yet</span></div>`}</section>`;
  }).join("");
  const own = acct && acct.household;
  return `${header("FoodIsHard", "Admin", right, { logo: true })}
    <div class="list" style="margin-bottom:12px">
      <div class="stack" style="padding:14px 16px;gap:8px">
        <div class="row between"><b>${ad.people} of ${ad.limits.people} people</b><span class="small muted">${ad.households.length} household${ad.households.length === 1 ? "" : "s"}</span></div>
        <div style="height:8px;border-radius:4px;background:var(--sunk);overflow:hidden"><div style="height:100%;width:${pct}%;background:${pct > 85 ? "var(--warm)" : "var(--accent)"}"></div></div>
        <span class="small muted">${never} never signed in · ${inactive} inactive for ${INACTIVE_DAYS}+ days. Free sign-in allows 50; the app stops at ${ad.limits.people}.</span>
      </div>
      <div class="stack" style="padding:12px 16px;gap:8px;border-top:1px solid var(--line-soft)">
        ${ad.manageSignIn
          ? `<span class="small muted">Sign-in list: ${sync ? `${sync.ok ? "✓" : "⚠"} ${esc(sync.message || "")} (${ago(sync.at) || "just now"})` : "not checked yet"}</span>
             <button class="btn sm" style="align-self:flex-start" data-act="adminSync">Update sign-in list now</button>`
          : `<span class="small" style="color:var(--warm)">Automatic sign-in updates aren't set up: add new emails to your Access policy by hand (CLOUDFLARE.md, step 6).</span>`}
      </div>
    </div>
    <div class="list" style="margin-bottom:12px"><button class="rrow" data-act="fbOpen" data-k="problems" style="padding:13px 16px"><span class="grow"><b>Problem reports</b></span>${ad.feedback && ad.feedback.problems ? `<span class="pill warn">${ad.feedback.problems} new</span>` : ""}${icon("right", 18)}</button>
      <button class="rrow" data-act="fbOpen" data-k="recipes" style="padding:13px 16px;border-top:1px solid var(--line-soft)"><span class="grow"><b>Recipe feedback</b></span>${ad.feedback && ad.feedback.new ? `<span class="pill accent">${ad.feedback.new} new</span>` : ""}${icon("right", 18)}</button>
      <button class="rrow" data-act="adminNotice" style="padding:13px 16px;border-top:1px solid var(--line-soft)"><span class="grow"><b>Message everyone</b>${ad.notice ? `<br><span class="small muted">Showing now · seen by ${ad.notice.seenBy} of ${ad.people}</span>` : ""}</span>${icon("right", 18)}</button>
      <label class="row" style="padding:13px 16px;border-top:1px solid var(--line-soft)"><span class="grow"><b>💬 Report button on every page</b><br><span class="small muted">Report a problem is always in Settings</span></span>
        <span class="switch"><input type="checkbox" data-act="adminBubble" ${ad.reportBubble !== false ? "checked" : ""}><i></i></span></label>
      <button class="rrow" data-act="adminTermsAsk" style="padding:13px 16px;border-top:1px solid var(--line-soft)"><span class="grow"><b>Terms of use</b><br><span class="small muted">${ad.terms ? `${ad.terms.agreed} of ${ad.terms.people} agreed to the ${ad.terms.ask ? `update of ${shortDate(ad.terms.ask.at)}` : "current terms"}` : ""} · Ask everyone again</span></span>${icon("right", 18)}</button></div>
    <div class="row" style="gap:8px;margin-bottom:10px"><button class="btn primary" data-act="adminNewHousehold">${icon("plus", 16)}New household</button>
      ${app.mode === "live" ? `<button class="btn" data-act="previewStart">See it as a new household</button>` : ""}</div>
    <label class="search" style="margin-bottom:10px">${icon("search", 18)}<input type="search" placeholder="Search people or households" aria-label="Search people or households" data-input="afilter" autocomplete="off"></label>
    <div class="chips" style="margin-bottom:12px">${chip("all", "Everyone")}${chip("never", `Never signed in (${never})`)}${chip("inactive", `Inactive (${inactive})`)}</div>
    <div id="adminList">${households || `<div class="empty">${ad.households.length ? "Nobody matches that." : "No households yet."}</div>`}</div>
    <div class="empty" data-none hidden>Nobody matches that.</div>
    ${own ? `<div class="list" style="margin-top:18px"><div class="stack" style="padding:14px 16px;gap:8px"><b>Your own household: ${esc(own.name)}</b>
      <span class="small muted">Leaving makes this an admin-only account${own.members.length <= 1 ? ", and deletes the household and its plans" : ""}.</span>
      <button class="btn sm" style="align-self:flex-start" data-act="adminLeave">Make this an admin-only account</button></div></div>` : ""}
    <div style="text-align:center;margin-top:24px"><button class="btn sm" data-act="signOut">Sign out</button></div>
    <p class="small muted" style="text-align:center;margin-top:10px">Signed in as ${esc(acct && acct.me ? acct.me.email : app.user)} · admin · FoodIsHard ${APP_VERSION}</p>`;
}
// ---- Recipe feedback from every household (its own screen, off the dashboard) ----
const RATING_LABEL = { loved: "Loved it", fine: "Fine", never: "Not again", problem: "Problem" };
const RATING_PILL = { loved: "accent", fine: "", never: "warm", problem: "warn" };
async function loadAdminFeedback() {
  if (app.fbLoading) return;
  app.fbLoading = true;
  try {
    const res = await accountCall("api/admin/feedback");
    const problems = app.fbKind === "problems";
    app.fbAdmin = { ...res, prevSeen: problems ? res.problemsSeen : res.seen };
    if (problems ? res.problems : res.new) { // opening the screen counts as reading them; they stay marked "New" until you leave
      const seen = await accountCall("api/admin/feedback/seen", { kind: problems ? "problems" : "recipes" });
      if (app.adminInfo) app.adminInfo.feedback = seen;
    }
  } catch (err) { app.fbAdmin = { error: err.message }; }
  app.fbLoading = false;
  if (app.tab === "feedback") render();
}
/** The admin's two feedback screens: recipe ratings, or problem reports from "Report a problem". */
function fbOfKind() { const p = app.fbKind === "problems"; return ((app.fbAdmin && app.fbAdmin.items) || []).filter((i) => (i.recipe === "_problem") === p); }
function fbFiltered() {
  const fb = app.fbAdmin, f = app.fbFilter || "all";
  return fbOfKind().filter((i) => f === "all"
    || (f === "new" && fbIsNew(i, fb))
    || (f === "notes" && (i.note || i.tags.length))
    || (f === "never" && i.rating === "never")
    || (f === "kids" && i.tags.some((t) => t.startsWith("Little ones"))));
}
function viewAdminFeedback() {
  const right = `<div class="row" style="gap:6px"><button class="icon-btn" data-act="fbReload" aria-label="Refresh">${icon("refresh", 18)}</button><button class="icon-btn" data-act="go" data-to="admin" aria-label="Back to the admin dashboard">${icon("left", 18)}</button></div>`;
  const problems = app.fbKind === "problems", head = header("Admin", problems ? "Problem reports" : "Recipe feedback", right, { logo: true });
  const fb = app.fbAdmin;
  if (!fb) { loadAdminFeedback(); return `${head}<div class="list"><div class="row" style="padding:16px"><span class="muted">Loading…</span></div></div>`; }
  if (fb.error) return `${head}<div class="list"><div class="row" style="padding:16px"><span class="grow muted">Couldn't load: ${esc(fb.error)}</span><button class="btn sm" data-act="fbReload">Retry</button></div></div>`;
  const all = fbOfKind(), items = problems ? all : fbFiltered(), f = app.fbFilter || "all", g = problems ? "latest" : app.fbGroup || "latest";
  const homes = fb.households || 0, recipesRated = new Set(all.map((i) => i.recipe)).size;
  const fresh = all.filter((i) => fbIsNew(i, fb)).length;
  const count = (fn) => all.filter(fn).length;
  const chip = (id, label, n) => `<button class="chip ${f === id ? "on" : ""}" data-act="fbFilter" data-f="${id}">${label}${n != null ? ` (${n})` : ""}</button>`;
  const entry = (i, showRecipe) => `<div class="row" style="padding:11px 16px;align-items:flex-start" data-text="${esc(`${i.recipeName} ${i.household} ${i.by} ${i.note} ${i.tags.join(" ")}`.toLowerCase())}">
      <span class="grow">${showRecipe ? `<b>${esc(i.recipeName)}</b> ` : ""}<span class="pill ${RATING_PILL[i.rating] || ""}">${esc(RATING_LABEL[i.rating] || i.rating)}</span>${fbIsNew(i, fb) ? ` <span class="pill warn">New</span>` : ""}<br>
      <span class="small muted">${[i.household, i.by].filter(Boolean).map(esc).join(" · ")}${i.household || i.by ? " · " : ""}${i.at ? (i.recipe === "_problem" ? `${shortDate(i.at)} (${ago(i.at)})` : shortDate(i.at)) : "date unknown"}</span>
      ${i.tags.length ? `<br><span class="small">${i.tags.map(esc).join(" · ")}</span>` : ""}
      ${i.note ? `<br><span style="font-style:italic">“${esc(i.note)}”</span>` : ""}</span>
      ${i.ref ? `<button class="icon-btn sm" data-act="problemDelete" data-ref="${esc(i.ref)}" aria-label="Delete this report">${icon("trash", 16)}</button>` : ""}</div>`;
  let body;
  if (!all.length) body = `<div class="empty">${problems ? "No problem reports." : "No ratings yet."}</div>`;
  else if (!items.length) body = `<div class="empty">Nothing matches that filter.</div>`;
  else if (g === "recipe") {
    const groups = new Map();
    items.forEach((i) => { if (!groups.has(i.recipe)) groups.set(i.recipe, []); groups.get(i.recipe).push(i); });
    body = [...groups.values()].map((list) => {
      const n = (r) => list.filter((i) => i.rating === r).length;
      const summary = [["loved", "loved"], ["fine", "fine"], ["never", "not again"]].filter(([r]) => n(r)).map(([r, w]) => `${n(r)} ${w}`).join(" · ");
      return `<section class="list" style="margin-bottom:12px" data-group-list>
        <div class="row" style="padding:12px 16px;background:var(--sunk)" data-text="${esc(list[0].recipeName.toLowerCase())}" data-name="${esc(list[0].recipeName.toLowerCase())}"><span class="grow"><b>${esc(list[0].recipeName)}</b><br><span class="small muted">${summary}</span></span></div>
        ${list.map((i) => entry(i, false)).join("")}</section>`;
    }).join("");
  } else body = `<section class="list" data-group-list><div hidden data-name=""></div>${items.map((i) => entry(i, true)).join("")}</section>`;
  if (problems) return `${head}
    <div class="row between" style="margin:0 0 10px;gap:10px"><span class="small muted">${fresh ? `${fresh} new since you last looked.` : "Nothing new since you last looked."} Names are left out of the copy.</span>
      <button class="btn sm" data-act="fbCopy" ${all.length ? "" : "disabled"}>${icon("copy", 16)}Copy for Claude</button></div>
    <div id="adminList"><section class="list" data-group-list><div hidden data-name=""></div>${all.length ? all.map((i) => entry(i, false)).join("") : body}</section></div>`;
  return `${head}
    <div class="list" style="margin-bottom:12px"><div class="stack" style="padding:14px 16px;gap:8px">
      <b>${all.length} rating${all.length === 1 ? "" : "s"} of ${recipesRated} recipe${recipesRated === 1 ? "" : "s"}, from ${homes} household${homes === 1 ? "" : "s"}</b>
      <span class="small muted">${fresh ? `${fresh} new since you last looked.` : "Nothing new since you last looked."} Ratings are anonymous.</span>
      <button class="btn sm" style="align-self:flex-start" data-act="fbCopy" ${items.length ? "" : "disabled"}>${icon("copy", 16)}Copy ${f === "all" ? "all" : "these"} for Claude</button>
    </div></div>
    <div class="seg" style="margin-bottom:10px"><button class="${g === "latest" ? "on" : ""}" data-act="fbGroup" data-g="latest">Latest first</button><button class="${g === "recipe" ? "on" : ""}" data-act="fbGroup" data-g="recipe">By recipe</button></div>
    <label class="search" style="margin-bottom:10px">${icon("search", 18)}<input type="search" placeholder="Search recipes or notes" aria-label="Search feedback" data-input="ffilter" autocomplete="off"></label>
    <div class="chips" style="margin-bottom:12px">${chip("all", "All")}${chip("new", "New", fresh)}${chip("notes", "With comments", count((i) => i.note || i.tags.length))}${chip("never", "Not again", count((i) => i.rating === "never"))}${count((i) => i.tags.some((t) => t.startsWith("Little ones"))) ? chip("kids", "Little ones", count((i) => i.tags.some((t) => t.startsWith("Little ones")))) : ""}</div>
    <div id="adminList">${body}</div>
    <div class="empty" data-none hidden>Nothing matches that.</div>`;
}
/** Everyone's feedback as plain text for Claude, grouped by recipe, without names. */
/** "New since you last looked". Ratings only carry the day they were left (anonymity), so a rating counts as new if its
    day hasn't fully passed before your last look. */
function fbIsNew(i, fb) { return i.recipe === "_problem" ? i.at > fb.prevSeen : i.at + 86400 > fb.prevSeen; }
/** Problem reports as plain text to paste to Claude: newest first, no names. */
function problemsText() {
  const list = fbOfKind();
  if (!list.length) return "No problem reports.";
  return ["FoodIsHard problem reports (newest first)", "", ...list.map((i, n) => `${n + 1}. ${i.at ? new Date(i.at * 1000).toISOString().slice(0, 16).replace("T", " ") : "date unknown"}\n${i.note}\n`)].join("\n");
}
function adminFeedbackText() {
  const groups = new Map();
  fbFiltered().forEach((i) => { if (!groups.has(i.recipe)) groups.set(i.recipe, { name: i.recipeName, list: [] }); groups.get(i.recipe).list.push(i); });
  const lines = ["FoodIsHard recipe feedback from all households (anonymous)", ""];
  for (const [id, { name, list }] of groups) {
    lines.push(`${name} (${id})`);
    list.slice().sort((a, b) => a.at - b.at).forEach((f) => lines.push(`- ${f.at ? new Date(f.at * 1000).toISOString().slice(0, 10) : "?"} ${f.rating}${f.tags.length ? ` [${f.tags.join(", ")}]` : ""}${f.note ? `: ${f.note}` : ""}`));
    lines.push("");
  }
  return lines.length > 2 ? lines.join("\n") : "No feedback yet.";
}
function adminFind(email) {
  for (const h of (app.adminInfo || { households: [] }).households) { const m = h.members.find((x) => x.email === email); if (m) return { m, h }; }
  return null;
}
function openAdminMember(email) {
  const hit = adminFind(email); if (!hit) return;
  const { m, h } = hit, others = app.adminInfo.households.filter((x) => x.id !== h.id);
  openSheet(`<p class="eyebrow">${esc(h.name)}</p><h1 class="title" style="font-size:26px">${esc(m.name)}</h1>
    <p class="muted">${esc(m.email)}<br>Joined ${shortDate(m.created)} · ${m.lastSeen ? `active ${ago(m.lastSeen)}` : "never signed in"}<br>${m.termsVersion ? `Agreed to the terms ${m.termsAt ? shortDate(m.termsAt) : ""}${m.termsVersion !== ((app.adminInfo || {}).terms || {}).version ? " (an older version)" : ""}` : "Hasn't agreed to the terms yet"}</p>
    <div class="stack">
      <button class="btn" data-act="adminResend" data-email="${esc(m.email)}">${icon("copy", 16)}Copy their invite message again</button>
      ${others.length ? `<p class="section-label" style="margin-bottom:4px">Move to another household</p><div class="list">${others.map((o) => `<button class="rrow" data-act="adminMoveTo" data-email="${esc(m.email)}" data-id="${esc(o.id)}"><span class="grow">${esc(o.name)}</span><span class="small muted">${o.members.length}</span></button>`).join("")}</div>` : ""}
      <button class="btn" style="color:var(--warm)" data-act="adminRemove" data-email="${esc(m.email)}" data-name="${esc(m.name)}">${icon("trash", 16)}Remove ${esc(m.name)}</button>
    </div>`);
}
function openAdminHousehold(id) {
  const h = (app.adminInfo.households || []).find((x) => x.id === id); if (!h) return;
  openSheet(`<p class="eyebrow">Household</p><h1 class="title" style="font-size:26px">${esc(h.name)}</h1>
    <form data-form="adminRename" data-id="${esc(h.id)}" class="stack"><label><span class="small muted">Household name</span><input class="input" name="name" value="${esc(h.name)}" required></label><button class="btn">Rename</button></form>
    <div class="stack" style="margin-top:14px">
      <button class="btn" data-act="adminAdd" data-id="${esc(h.id)}" data-name="${esc(h.name)}">${icon("plus", 16)}Add someone to ${esc(h.name)}</button>
      <button class="btn" style="color:var(--warm)" data-act="adminDeleteHousehold" data-id="${esc(h.id)}" data-name="${esc(h.name)}">${icon("trash", 16)}Delete household and all its data</button>
    </div>`);
}
function openAdminAdd(id, name) {
  openSheet(`<p class="eyebrow">${esc(name)}</p><h1 class="title" style="font-size:26px">Add someone</h1>
    <p class="muted">They'll share ${esc(name)}'s plan and shopping list.</p>
    <form data-form="adminAdd" data-id="${esc(id)}" class="stack">
      <label><span class="small muted">Their first name</span><input class="input" name="name" required autocomplete="off"></label>
      <label><span class="small muted">Their email (the one they'll sign in with)</span><input class="input" name="email" type="email" required autocomplete="off" inputmode="email"></label>
      <button class="btn lg primary">Add them</button></form>`);
}
async function adminDo(path, body, done) {
  try {
    const res = await accountCall(path, body);
    app.adminInfo = { ...app.adminInfo, ...res };
    closeSheet(); await loadAccount();
    if (done) done(res);
    return res;
  } catch (err) { toast(err.message); return null; }
}

async function importBackup(file) {
  let doc;
  try { doc = JSON.parse(await file.text()); } catch { return toast("That file isn't a FoodIsHard backup"); }
  const state = doc && doc.foodishard ? doc.state : doc;
  if (!state || !state.settings || !Array.isArray(state.settings.people)) return toast("That file isn't a FoodIsHard backup");
  const when = doc.exported ? ` from ${niceDate(new Date(doc.exported))}` : "";
  if (!confirmReplace(when)) return;
  if (app.mode !== "live") {
    app.state = { ...state, rev: (app.state.rev || 0) + 1 }; store(DEMO_KEY, app.state); render(); return toast("Backup restored");
  }
  try {
    const r = await appFetch("api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(doc) });
    const res = await r.json();
    if (!r.ok) throw new Error(res.error || r.status);
    store(QUEUE_KEY, []); app.state = res.state; store(CACHE_KEY, app.state); render(); toast("Backup restored");
  } catch (err) { toast(`Couldn't restore: ${err.message}`); }
}
function confirmReplace(when) {
  return window.confirm(`Restore this backup${when}? It replaces all FoodIsHard data for your household.`);
}

function onInput(e) {
  if (e.target.dataset.input === "afilter" || e.target.dataset.input === "ffilter") {
    const q = e.target.value.trim().toLowerCase(), list = $("#adminList");
    $$("[data-group-list]", list).forEach((sec) => {
      const head = sec.firstElementChild, rows = [...sec.children].slice(1).filter((r) => r.dataset.text);
      const headHit = !q || q.split(/\s+/).every((w) => (head.dataset.name || "").includes(w));
      let any = false;
      rows.forEach((r) => { const hit = !q || q.split(/\s+/).every((w) => r.dataset.text.includes(w)); r.hidden = !hit && !headHit; any = any || !r.hidden; });
      sec.hidden = !(any || headHit);
    });
    const none = $("[data-none]", $("#view")); if (none) none.hidden = $$("[data-group-list]", list).some((s) => !s.hidden);
    return;
  }
  if (e.target.dataset.input === "sfilter") {
    const q = e.target.value.trim().toLowerCase(), body = $("#sheetBody");
    $$("[data-text]", body).forEach((el) => { el.hidden = !!q && !q.split(/\s+/).every((w) => el.dataset.text.includes(w)); });
    $$(".list", body).forEach((l) => { const rows = $$("[data-text]", l); if (rows.length) l.hidden = rows.every((r) => r.hidden); });
    $$("[data-group]", body).forEach((h) => { let n = h.nextElementSibling; h.hidden = !!(n && n.classList.contains("list") && n.hidden); });
    const none = $("[data-none]", body); if (none) none.hidden = $$("[data-text]", body).some((r) => !r.hidden);
    return;
  }
  if (e.target.dataset.input === "rsearch") {
    app.recipeQuery = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { const pos = e.target.selectionStart; render(); const s = $("[data-input=rsearch]"); if (s) { s.focus(); s.setSelectionRange(pos, pos); } }, 150);
  }
}

// long-press to multi-select on the shopping list
let pressTimer = null, pressStart = null, longPressFired = false;
function setupLongPress() {
  document.addEventListener("pointerdown", (e) => {
    const row = e.target.closest(".item");
    if (!row || app.tab !== "shop" || e.target.closest("input")) return;
    pressStart = { x: e.clientX, y: e.clientY }; longPressFired = false;
    pressTimer = setTimeout(() => { longPressFired = true; toggleSelect(row.dataset.key); try { navigator.vibrate && navigator.vibrate(20); } catch { /* fine */ } }, 450);
  });
  const cancel = () => { clearTimeout(pressTimer); pressTimer = null; };
  document.addEventListener("pointerup", cancel);
  document.addEventListener("pointercancel", cancel);
  document.addEventListener("pointermove", (e) => { if (pressStart && Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 10) cancel(); });
  document.addEventListener("contextmenu", (e) => { if (e.target.closest(".item")) e.preventDefault(); });
}
function toggleSelect(key) { app.selecting.has(key) ? app.selecting.delete(key) : app.selecting.add(key); render(); }

// ---------------------------------------------------------------------------
// Life is hard: household routines (Settings switch, off by default)
// ---------------------------------------------------------------------------
// The guiding rule is "show help, never build resentment": each routine shows when it was last done and by whom.
// Nothing is ever overdue or red, nobody is assigned anything, and there are no points or reminders.
const CHORE_STARTERS = [
  { name: "Dog fed", emoji: "🦴", timing: "ampm" }, { name: "Dog walked", emoji: "🐕", timing: "daily" },
  { name: "Washing on", emoji: "🧺", timing: "any" }, { name: "Washing out", emoji: "👕", timing: "any" },
  { name: "Bins out", emoji: "🗑️", timing: "days", days: [] }, { name: "Bottles washed", emoji: "🍼", timing: "daily" },
  { name: "Dishwasher on", emoji: "🍽️", timing: "daily" }, { name: "Plants watered", emoji: "🪴", timing: "any" },
];
const CHORE_EMOJI = ["🐕", "🐈", "🐟", "🧺", "🗑️", "♻️", "🍼", "🍽️", "🪴", "🧹", "🛏️", "💊", "📦", "🚗", "🛁", "🧸"];
const CHORE_TIMING_NAMES = { any: "Any time", daily: "Every day", ampm: "Morning and evening", times: "Several times a day", days: "Certain days" };
const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th"];
const SUN_FIRST = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EVENING_FROM = 15; // a tick from 3pm counts as the evening one ("Morning and evening")
function lifeOn() { return !!settings().lifeOn; }
function chores() { return app.state.chores || []; }
function firstName(n) { return String(n || "").trim().split(/\s+/)[0] || ""; }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function clockTime(d) { return d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" }); }
/** "just now", "20 min ago", "2 hours ago", "yesterday at 18:05", "on Tuesday", "12 days ago" */
function lifeWhen(at) {
  const d = new Date(at * 1000), now = new Date(), secs = Math.max(0, now / 1000 - at);
  if (secs < 120) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 6 * 3600) { const h = Math.floor(secs / 3600); return `${h} hour${h === 1 ? "" : "s"} ago`; }
  if (sameDay(d, now)) return `today at ${clockTime(d)}`;
  if (sameDay(d, addDays(now, -1))) return `yesterday at ${clockTime(d)}`;
  const days = Math.round((now - d) / 864e5);
  return days < 7 ? `on ${DOW_LONG[(d.getDay() + 6) % 7]}` : `${days} days ago`;
}
function choreLine(e) { const who = firstName(e.by); return `${lifeWhen(e.at)}${who ? `, ${esc(who)}` : ""}`; }
function dayList(days) {
  const names = [...(days || [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DOW_LONG[(d + 6) % 7] + "s"); // Monday first
  return names.length === 7 ? "Every day" : names.length ? joinNames(names) : "No days picked yet";
}
/** What a routine's card says. Done things get a soft tick; things not done yet just say so, quietly. */
function choreStatus(c) {
  const now = new Date(), log = c.log || [], last = log[log.length - 1];
  const today = log.filter((e) => sameDay(new Date(e.at * 1000), now));
  const lastText = last ? choreLine(last) : "Not done yet";
  if (c.timing === "ampm") {
    const am = today.filter((e) => tickSlot(e) === "am").pop(), pm = today.filter((e) => tickSlot(e) === "pm").pop();
    // two buttons: each half is ticked and unticked on its own, whatever the time
    const slot = (label, s, e, later) => `<button class="slot ${e ? "done" : ""}" data-act="choreSlot" data-id="${esc(c.id)}" data-s="${s}" aria-pressed="${!!e}">${e ? icon("check", 13) : ""}${label}${e ? ` · ${clockTime(new Date(e.at * 1000))}${firstName(e.by) ? `, ${esc(firstName(e.by))}` : ""}` : later ? " · later" : " · not yet"}</button>`;
    return { done: !!(am && pm), slots: true, html: `<span class="slots">${slot("Morning", "am", am, false)}${slot("Evening", "pm", pm, now.getHours() < EVENING_FROM)}</span>` };
  }
  if (c.timing === "times") { // one button per time, each ticked and unticked on its own
    const n = c.times || 3, got = (k) => today.filter((e) => String(e.s) === String(k)).pop();
    const btn = (k) => { const e = got(k); return `<button class="slot ${e ? "done" : ""}" data-act="choreSlot" data-id="${esc(c.id)}" data-s="${k}" aria-pressed="${!!e}">${e ? icon("check", 13) : ""}${ORDINAL[k]}${e ? ` · ${clockTime(new Date(e.at * 1000))}${firstName(e.by) ? `, ${esc(firstName(e.by))}` : ""}` : ""}</button>`; };
    const done = Array.from({ length: n }, (_, i) => got(i + 1)).filter(Boolean).length;
    return { done: done === n, slots: true, html: `<span class="small muted">${done} of ${n} today</span><span class="slots">${Array.from({ length: n }, (_, i) => btn(i + 1)).join("")}</span>` };
  }
  const dueToday = c.timing === "daily" || (c.timing === "days" && (c.days || []).includes(now.getDay()));
  if (dueToday) return today.length
    ? { done: true, html: `<span class="ok">${icon("check", 13)}Done ${choreLine(today[today.length - 1])}</span>` }
    : { done: false, html: `Not yet today${last ? ` <span class="muted">· last ${choreLine(last)}</span>` : ""}` };
  if (c.timing === "days") return { done: false, html: `${esc(dayList(c.days))}${last ? ` <span class="muted">· last ${choreLine(last)}</span>` : ""}` };
  return { done: !!last && sameDay(new Date(last.at * 1000), now), html: last ? lastText : `<span class="muted">${lastText}</span>` };
}
const WAVES = `<svg class="life-waves" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true"><path d="M0 34 C 50 18, 100 18, 150 32 S 250 48, 300 32 S 370 18, 400 26 V60 H0Z"/><path d="M0 44 C 60 32, 110 34, 170 44 S 280 56, 340 44 S 390 36, 400 40 V60 H0Z"/></svg>`;
function viewLife() {
  const list = chores(), now = new Date();
  const cards = list.map((c) => { const st = choreStatus(c);
    const inner = `<span class="chore-emoji" aria-hidden="true">${esc(c.emoji || "✨")}</span>
      <span class="grow"><b>${esc(c.name)}</b><span class="chore-sub">${st.html}</span></span>`;
    const cls = `chore ${st.done ? "done" : ""} ${app.lifeFlash === c.id ? "flash" : ""}`;
    return st.slots ? `<div class="${cls} has-slots">${inner}</div>` : `<button class="${cls}" data-act="choreTap" data-id="${esc(c.id)}">${inner}</button>`; }).join("");
  return `<div class="life-top">${header(`${DOW_LONG[(now.getDay() + 6) % 7]} · Life is hard`, "Around the house", settingsButton())}${WAVES}</div>
    ${list.length ? `<div class="chores">${cards}</div>
      <p class="small muted" style="text-align:center;margin:12px 0 0">Tap when it's done, tap again to undo. Everyone in your household sees it.</p>
      <div style="text-align:center;margin-top:14px"><button class="btn sm" data-act="lifeEdit">${icon("plus", 16)}Add, change or remove</button></div>`
    : `<div class="empty life-empty"><p class="h2">Did anyone feed the dog?</p>
      <p>Life is hard is for the little routines you share at home: the washing, the bins, the dog. Tap one when it's done and everyone in your household can see what's been taken care of, and when, without having to ask.</p>
      <button class="btn primary" style="margin-top:8px" data-act="choreNew">${icon("plus", 16)}Add a routine</button></div>`}`;
}
/** Thanks, then a few seconds to undo. */
/** The tick that makes a routine "done" right now: today's latest (for morning-and-evening, the latest in the current
    half of the day). Tapping a done routine takes that tick back; tapping one that isn't done ticks it. */
/** Which half of the day a tick was for: the half it was ticked for, or (older ticks) the time it was ticked. */
function tickSlot(e) { return e.s || (new Date(e.at * 1000).getHours() < EVENING_FROM ? "am" : "pm"); }
function currentTick(c, slot) {
  const now = new Date();
  return (c.log || []).filter((e) => sameDay(new Date(e.at * 1000), now) && (c.timing === "times" ? String(e.s) === String(slot) : c.timing !== "ampm" || tickSlot(e) === slot)).pop() || null;
}
function choreTap(id, slot) {
  const c = chores().find((x) => x.id === id); if (!c) return;
  if (c.timing === "ampm" && !slot) slot = new Date().getHours() < EVENING_FROM ? "am" : "pm";
  if (c.timing === "times" && !slot) return; // its buttons say which one
  if (c.timing !== "ampm" && c.timing !== "times") slot = undefined;
  const part = slot ? ` (${slot === "am" ? "morning" : slot === "pm" ? "evening" : ORDINAL[+slot]})` : "";
  const cur = currentTick(c, slot);
  if (cur && cur.t) { // already done: untick it (Undo puts it back)
    send({ op: "chore_done", id, key: cur.t, undo: true });
    toast(`${c.name}${part}: not done`, { undo: () => send({ op: "chore_done", id, key: uid() + uid(), slot }) });
    return;
  }
  const key = uid() + uid();
  app.lifeFlash = id;
  send({ op: "chore_done", id, key, slot });
  setTimeout(() => { if (app.lifeFlash === id) app.lifeFlash = null; }, 900);
  const who = firstName(app.user);
  toast(`${who ? `Thanks, ${who}` : "Thank you"}${c.emoji ? ` ${c.emoji}` : ""}`, { undo: () => send({ op: "chore_done", id, key, slot, undo: true }) });
}
/** Remove a routine and its history, after a quick check. */
function removeChore(id, then) {
  const c = chores().find((x) => x.id === id); if (!c) return;
  if (!window.confirm(`Remove "${c.name}" and its history?`)) return;
  send({ op: "chore_remove", id }); then(); toast(`${c.name} removed`);
}
/** A routine's recent ticks, newest first, each with Remove (for a tick that shouldn't be there). */
function choreRecent(id) {
  const c = chores().find((x) => x.id === id), log = c ? [...(c.log || [])].reverse() : [];
  if (!log.length) return "";
  return `<div><p class="small muted" style="margin:0 0 6px">Recently done</p><div class="list">${log.map((e) => `<div class="row" style="padding:8px 8px 8px 16px"><span class="grow small">${choreLine(e)}</span>
    <button class="btn sm" data-act="choreUntick" data-id="${esc(id)}" data-t="${esc(e.t || "")}" data-from="edit">Remove</button></div>`).join("")}</div></div>`;
}
function openLifeEdit({ keepScroll = false } = {}) {
  const list = chores();
  openSheet(`<p class="eyebrow">Life is hard</p><h2 class="title" style="font-size:24px;margin-bottom:12px">Routines</h2>
    ${list.length ? `<div class="list">${list.map((c, i) => `<div class="row" style="padding:6px 8px 6px 16px">
      <button class="rrow" style="padding:8px 0" data-act="choreEdit" data-id="${esc(c.id)}"><span aria-hidden="true" style="font-size:22px">${esc(c.emoji || "✨")}</span><span class="grow"><b>${esc(c.name)}</b><br><span class="small muted">${esc(c.timing === "days" ? dayList(c.days) : (c.timing === "times" ? `${c.times || 3} times a day` : CHORE_TIMING_NAMES[c.timing] || "Any time"))}</span></span></button>
      <button class="icon-btn sm" data-act="choreMove" data-id="${esc(c.id)}" data-d="-1" ${i ? "" : "disabled"} aria-label="Move up">${icon("up", 16)}</button>
      <button class="icon-btn sm" data-act="choreMove" data-id="${esc(c.id)}" data-d="1" ${i < list.length - 1 ? "" : "disabled"} aria-label="Move down">${icon("down", 16)}</button>
      <button class="icon-btn sm" data-act="choreDelete" data-id="${esc(c.id)}" aria-label="Remove ${esc(c.name)}">${icon("trash", 16)}</button></div>`).join("")}</div>` : ""}
    <button class="btn primary" style="width:100%;margin-top:16px" data-act="choreNew">${icon("plus", 16)}Add a routine</button>`, { keepScroll });
}
function openChore(draft, { keepScroll = false } = {}) {
  app.choreDraft = draft;
  const d = draft;
  const ideas = d.id ? [] : CHORE_STARTERS.filter((x) => !chores().some((c) => c.name.toLowerCase() === x.name.toLowerCase()));
  openSheet(`<p class="eyebrow">Life is hard</p><h2 class="title" style="font-size:24px;margin-bottom:12px">${d.id ? "Change routine" : "Add a routine"}</h2>
    <div class="stack" style="gap:14px">
      ${ideas.length ? `<div><p class="small muted" style="margin:0 0 6px">Pick an idea to fill it in, or write your own</p>
        <div class="chips wrap">${ideas.map((x) => `<button class="chip ${d.name === x.name ? "on" : ""}" data-act="choreStarter" data-name="${esc(x.name)}">${x.emoji} ${esc(x.name)}</button>`).join("")}</div></div>` : ""}
      <div class="row" style="gap:10px"><input class="input chore-emoji-input" id="choreEmoji" value="${esc(d.emoji || "")}" maxlength="16" aria-label="Emoji" placeholder="✨">
        <input class="input" id="choreName" value="${esc(d.name || "")}" maxlength="60" placeholder="e.g. Cat fed" aria-label="Name"></div>
      <div class="chips wrap">${CHORE_EMOJI.map((e) => `<button class="chip emoji-chip ${d.emoji === e ? "on" : ""}" data-act="choreEmoji" data-e="${e}" aria-label="Use ${e}">${e}</button>`).join("")}</div>
      <div><p class="small muted" style="margin:0 0 6px">When</p>
        <div class="chips wrap">${Object.entries(CHORE_TIMING_NAMES).map(([k, v]) => `<button class="chip ${d.timing === k ? "on" : ""}" data-act="choreTiming" data-t="${k}">${v}</button>`).join("")}</div></div>
      ${d.timing === "times" ? `<div><p class="small muted" style="margin:0 0 6px">How many times a day</p><div class="chips wrap">${[2, 3, 4, 5, 6].map((n) => `<button class="chip ${(d.times || 3) === n ? "on" : ""}" data-act="choreTimes" data-n="${n}">${n}</button>`).join("")}</div></div>` : ""}
      ${d.timing === "days" ? `<div class="chips wrap">${[1, 2, 3, 4, 5, 6, 0].map((n) => `<button class="chip ${(d.days || []).includes(n) ? "on" : ""}" data-act="choreDay" data-n="${n}">${SUN_FIRST[n]}</button>`).join("")}</div>` : ""}
      <p class="small muted" style="margin:0">${{ any: "Shows when it was last done.", daily: "Shows whether it's been done today.", ampm: "Shows the morning one and the evening one. Tick either at any time.", times: "Shows how many have been done today. Tick each one at any time.", days: "Shows whether it's been done on the days you pick." }[d.timing]}</p>
      <button class="btn primary" data-act="choreSave">${d.id ? "Save" : `${icon("plus", 16)}Add`}</button>
      ${d.id ? choreRecent(d.id) : ""}
      ${d.id ? `<button class="btn" data-act="choreRemove">${icon("trash", 16)}Remove this routine</button>` : ""}
    </div>`, { keepScroll });
  if (app.choreFromList) app.sheetBack = () => openLifeEdit(); // closing goes back to the list it came from
}
/** Keep what's been typed before redrawing the panel. */
function choreDraftRead() {
  const d = app.choreDraft; if (!d) return null;
  const n = $("#choreName"), e = $("#choreEmoji");
  if (n) d.name = n.value; if (e) d.emoji = e.value;
  return d;
}
Object.assign(ACTIONS, {
  choreTap: (d) => choreTap(d.id),
  choreSlot: (d) => choreTap(d.id, d.s),
  choreUntick: (d) => {
    if (!d.t) return;
    send({ op: "chore_done", id: d.id, key: d.t, undo: true });
    if (d.from === "edit") openChore(choreDraftRead(), { keepScroll: true }); else closeSheet();
    toast("Taken back");
  },
  lifeEdit: () => openLifeEdit(),
  choreNew: () => { app.choreFromList = !$("#sheet").hidden; openChore({ name: "", emoji: "", timing: "any", days: [] }); },
  choreEdit: (d) => { const c = chores().find((x) => x.id === d.id); if (!c) return; app.choreFromList = true; openChore({ ...clone(c), log: undefined }); },
  choreStarter: (d) => { // an idea fills in the add panel; nothing is added until you tap Add
    const x = CHORE_STARTERS.find((y) => y.name === d.name); if (!x) return;
    openChore({ ...(choreDraftRead() || {}), name: x.name, emoji: x.emoji, timing: x.timing, days: x.days || [] }, { keepScroll: true });
  },
  choreEmoji: (d) => { const x = choreDraftRead(); if (x) { x.emoji = d.e; openChore(x, { keepScroll: true }); } },
  choreTimes: (d) => { const x = choreDraftRead(); if (x) { x.times = +d.n; openChore(x, { keepScroll: true }); } },
  choreTiming: (d) => { const x = choreDraftRead(); if (x) { x.timing = d.t; openChore(x, { keepScroll: true }); } },
  choreDay: (d) => { const x = choreDraftRead(); if (!x) return; const n = +d.n, days = new Set(x.days || []); days.has(n) ? days.delete(n) : days.add(n); x.days = [...days]; openChore(x, { keepScroll: true }); },
  choreMove: (d) => { send({ op: "chore_move", id: d.id, d: +d.d }); openLifeEdit({ keepScroll: true }); },
  choreSave: () => {
    const x = choreDraftRead(); if (!x) return;
    const fields = { name: String(x.name || "").trim(), emoji: String(x.emoji || "").trim(), timing: x.timing, days: x.timing === "days" ? x.days || [] : [], ...(x.timing === "times" ? { times: x.times || 3 } : {}) };
    if (!fields.name) { toast("Give it a name"); $("#choreName") && $("#choreName").focus(); return; }
    if (x.id) send({ op: "chore_update", id: x.id, patch: fields }); else send({ op: "chore_add", item: { id: uid(), ...fields } });
    app.choreDraft = null; openLifeEdit(); toast("Saved");
  },
  lunchPick: (d) => openLunchPick(d.t, d.k, d.item),
  lunchN: (d) => { const st = app.lunchPickState; if (st) openLunchPick(st.tId, st.main, st.itemKey, { n: +d.n, add: st.add }); },
  lunchAdd: (d, el) => { const st = app.lunchPickState; if (st) el.checked ? st.add.add(d.k) : st.add.delete(d.k); },
  lunchPut: (d) => {
    const st = app.lunchPickState; if (!st) return;
    const week = shopWeek(), i = +d.i, t = lunchTemplate(st.tId), dayName = DOW_LONG[mondayIndex(addDays(parseISO(week), i))];
    dayUpdate(i, { lunch: { t: st.tId, main: st.main, with: st.with, n: st.n } }, week);
    st.add.forEach((k) => addBasic(k, `for ${dayName}'s lunch`));
    app.lunchPickState = null; app.sheetBack = null; closeSheet();
    toast(`${lunchName(t, st.main, st.with)} is ${dayName}'s lunch`);
  },
  lunchOpen: (d) => openLunch(+d.i, d.week),
  lunchRemove: (d) => { dayUpdate(+d.i, { lunch: null }, d.week); closeSheet(); toast("Lunch removed"); },
  lunchBasic: (d) => { addBasic(d.k, "for quick lunches"); toast(`${capFirst(ingShort(d.k))} added to the list`); },
  choreDelete: (d) => removeChore(d.id, () => openLifeEdit({ keepScroll: true })),
  choreRemove: () => {
    const x = app.choreDraft; if (!x || !x.id) return;
    removeChore(x.id, () => { app.choreDraft = null; openLifeEdit(); });
  },
});
// "2 hours ago" and "Not yet today" keep up with the clock while the tab is open
setInterval(() => { if (app.tab === "life" && !document.hidden && app.state && $("#sheet").hidden && !app.cook) render(); }, 60000);

boot().catch((err) => {
  console.error(err);
  $("#view").innerHTML = `<div class="empty"><p class="h2">Something went wrong loading</p><p>${esc(err.message)}</p></div>`;
});
