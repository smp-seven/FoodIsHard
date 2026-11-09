/* FoodIsHard UI: screens, sheets, cooking mode and events. Depends on core.js. */
"use strict";

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function boot() {
  hydrateIcons(document);
  const [rec, ing, defaults] = await Promise.all([getJSON("data/recipes.json"), getJSON("data/ingredients.json"), getJSON("data/defaults.json")]);
  app.recipes = rec.recipes; app.byId = Object.fromEntries(app.recipes.map((r) => [r.id, r]));
  app.families = rec.families; app.famById = Object.fromEntries(app.families.map((f) => [f.id, f]));
  app.ing = ing;

  try {
    const res = await getJSON("api/state");
    if (!res.state) throw new Error("no state");
    app.mode = "live"; app.state = res.state; app.user = res.user || "";
    store(CACHE_KEY, app.state);
  } catch {
    const cached = load(CACHE_KEY, null);
    if (cached && location.protocol !== "file:" && !/claude|artifact/.test(location.hostname)) {
      app.mode = "live"; app.state = cached; app.offline = true; // opened with no signal
    } else {
      app.mode = "demo";
      app.state = load(DEMO_KEY, null) || { ...clone(defaults), rev: 0 };
      const b = $("#banner"); b.hidden = false; b.textContent = "Preview: changes are saved on this device only.";
    }
  }
  ["plans", "prefs", "checks", "extras", "prices", "swaps", "shopFor", "shopPref"].forEach((k) => { app.state[k] = app.state[k] || {}; });

  app.weekStart = iso(weekStartFor(new Date(), settings().weekStartDay || 0));
  if (app.mode === "demo" && !app.state.plans[app.weekStart]) applyLocal({ op: "plan", week: app.weekStart, plan: suggestWeek(app.weekStart) });

  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("input", onInput);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeSheet(); closeMenus(); } });
  setupLongPress();
  window.addEventListener("hashchange", fromHash);
  fromHash();
  if (app.mode === "live") { startPolling(); flushQueue(); }
}

function hydrateIcons(root) { $$("[data-icon]", root).forEach((el) => { if (!el.firstChild) el.innerHTML = icon(el.dataset.icon, 24); }); }
function go(tab) { if (location.hash !== "#" + tab) location.hash = tab; else { app.tab = tab; render(); } }
function fromHash() {
  const t = (location.hash || "#tonight").slice(1);
  app.tab = ["tonight", "week", "shop", "recipes", "settings"].includes(t) ? t : "tonight";
  app.selecting.clear();
  render(); window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render() {
  if (!app.state) return;
  $$(".nav button").forEach((b) => b.classList.toggle("on", b.dataset.tab === app.tab));
  const views = { tonight: viewTonight, week: viewWeek, shop: viewShop, recipes: viewRecipes, settings: viewSettings };
  const view = $("#view");
  view.innerHTML = views[app.tab]();
  hydrateIcons(view);
  const dock = $("#dock");
  dock.hidden = app.tab !== "shop";
  if (app.tab === "shop") dock.innerHTML = dockShop();
  const left = buildList(currentWeek()).filter((i) => i.active && (!i.cupboard || i.need) && !i.done).length;
  const c = $("#shopCount"); c.hidden = !left || app.tab === "shop"; c.textContent = left;
}
function currentWeek() { return iso(weekStartFor(new Date(), settings().weekStartDay || 0)); }

function header(eyebrow, title, right = "") {
  return `<header class="head"><div class="grow"><p class="eyebrow">${eyebrow}</p><h1 class="title">${title}</h1></div>${right}</header>`;
}
function settingsButton() { return `<button class="icon-btn" data-act="go" data-to="settings" aria-label="Settings">${icon("gear")}</button>`; }
function offlineBadge() { return app.offline ? `<span class="badge-offline">${icon("nosignal", 16)}No signal · ticks saved</span>` : ""; }

function proteinTiles(r, onHero) {
  const { adults } = household();
  return adults.map((p, idx) => `<button class="tile" data-act="macros" data-id="${r.id}" data-who="${idx}" aria-label="Full nutrition for ${esc(p.name)}">
      <span class="k"><span>${esc(p.name)}</span><span aria-hidden="true">›</span></span><span class="v">${proteinFor(r, p.portion)} g protein</span></button>`).join("");
}
function proteinShort(r) { return household().adults.map((p) => proteinFor(r, p.portion)).join(" / ") + " g"; }
function visibleSteps(r) { const inc = household().baby.include; return r.steps.filter((s) => inc || !s.baby); }

// ----- Tonight -----
function viewTonight() {
  const today = new Date(), week = currentWeek();
  const i = (mondayIndex(today) - (settings().weekStartDay || 0) + 7) % 7;
  const d = planFor(week)[i];
  const r = d.recipe && app.byId[d.recipe];
  const { factor, baby } = household();
  const eyebrow = `${DOW_LONG[mondayIndex(today)]} ${today.getDate()} ${MONTHS_LONG[today.getMonth()]}`;
  let hero;
  if (d.status === "cook" && r) {
    const babyStep = visibleSteps(r).findIndex((s) => s.baby);
    const cost = recipeCost(r) * factor;
    hero = `<section class="hero">
      <div class="row wrap" style="gap:8px"><span class="tag">${esc(r.emergency ? "Quick meal" : family(r.family).name)}</span><span class="tag">${r.time} min</span><span class="tag">≈ ${money(cost)}</span></div>
      <h1>${esc(r.name)}</h1>
      <div class="tiles">${proteinTiles(r, true)}</div>
      ${baby.include && babyStep >= 0 ? `<div class="baby-note">${icon("baby")}<span>${esc(babyName())}'s portion comes out at <b>step ${babyStep + 1}</b></span></div>` : ""}
      <div class="row"><button class="btn lg white grow" data-act="cook" data-id="${r.id}">${icon("play", 18)}Start cooking</button>
      <button class="btn lg outline" data-act="quicker" data-i="${i}">${icon("bolt", 18)}Quicker</button></div>
    </section>`;
  } else if (d.status === "skip" || d.status === "leftovers") {
    hero = `<section class="hero"><span class="tag" style="align-self:flex-start">Tonight</span>
      <h1>${d.status === "skip" ? `Night off${d.note ? ` · ${esc(d.note)}` : ""}` : "Leftovers night"}</h1>
      <div class="row"><button class="btn white" data-act="status" data-i="${i}" data-s="cook">Cook something after all</button></div></section>`;
  } else {
    hero = `<section class="card empty"><p class="h2">Nothing planned tonight</p><p>Plan the week, or grab a quick one.</p>
      <div class="row" style="justify-content:center"><button class="btn primary" data-act="go" data-to="week">Plan the week</button><button class="btn" data-act="emergency" data-i="${i}">${icon("bolt", 18)}Something quick</button></div></section>`;
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
    upcoming.push(`<button ${rr && day.status === "cook" ? `data-act="recipe" data-id="${rr.id}"` : `data-act="go" data-to="week"`}><span class="d">${DOW[mondayIndex(date)].toUpperCase()}</span>${label}</button>`);
  }

  const list = buildList(week).filter((x) => x.active && (!x.cupboard || x.need));
  const left = list.filter((x) => !x.done).length, total = list.reduce((t, x) => t + (x.cost || 0), 0);
  return `${header(eyebrow, "Tonight", settingsButton())}
    ${hero}
    <div class="row between" style="margin:22px 4px 10px"><h2 class="h2">Coming up</h2><button class="btn sm ghost" data-act="go" data-to="week">See the week</button></div>
    <div class="list week-mini">${upcoming.join("")}</div>
    <button class="card row" style="width:100%;margin-top:14px;padding:14px 16px;text-align:left" data-act="go" data-to="shop">
      <span class="icon-btn on" style="border-radius:14px">${icon("basket")}</span>
      <span class="grow"><b>${left ? `${left} thing${left === 1 ? "" : "s"} to buy` : "Shopping's done"}</b><br><span class="small muted">≈ ${money(total)} this week</span></span>
      <span style="color:var(--accent);font-weight:700">Open</span></button>`;
}

// ----- Week -----
function viewWeek() {
  const week = app.weekStart, start = parseISO(week), end = addDays(start, 6);
  const days = planFor(week), todayISO = iso(new Date());
  const { factor } = household();
  let cost = 0;
  const cards = days.map((d, i) => {
    const date = addDays(start, i), isToday = iso(date) === todayISO;
    const r = d.recipe && app.byId[d.recipe], theme = themeFor(week, i);
    const dateCol = `<div><div class="dow">${DOW[mondayIndex(date)].toUpperCase()}</div><div class="dom">${date.getDate()}</div></div>`;
    if (d.status === "skip") return `<article class="day off">${dateCol}<div class="row between"><span><b>Skipped${d.note ? ` · ${esc(d.note)}` : ""}</b><br><span class="small muted">Not on the shopping list</span></span><button class="btn sm" data-act="status" data-i="${i}" data-s="cook">Undo</button></div></article>`;
    if (d.status === "leftovers") return `<article class="day off">${dateCol}<div class="row between"><span><b>Leftovers</b><br><span class="small muted">From earlier in the week</span></span><button class="btn sm" data-act="status" data-i="${i}" data-s="cook">Cook instead</button></div></article>`;
    if (!r) return `<article class="day ${isToday ? "today" : ""}">${dateCol}<div>${theme ? `<div class="fam">${esc(family(theme).name)} · theme night</div>` : ""}
      <button class="name" style="font-family:var(--sans);font-size:15px;color:var(--muted)" data-act="pick" data-i="${i}">+ Choose a dinner</button>
      <div class="actions"><button class="btn sm soft" data-act="skip" data-i="${i}">Skip</button></div></div></article>`;
    const c = recipeCost(r) * factor; cost += c;
    const famText = r.emergency ? `<span class="fam quick">Quick · ${r.time} min${isToday ? " · tonight" : ""}</span>`
      : `<span class="fam">${esc(family(r.family).name)}${isToday ? " · tonight" : theme ? " · theme night" : ""}</span>`;
    const fam = `<div class="row between" style="margin:-6px -6px 0 0">${famText}<span class="row" style="gap:0">
        <button class="icon-btn sm ${d.locked ? "on" : "plain"}" data-act="lock" data-i="${i}" aria-label="${d.locked ? "Unlock" : "Keep this one"}">${icon(d.locked ? "lock" : "unlock", 17)}</button>
        <button class="icon-btn sm plain" data-act="dayMenu" data-i="${i}" aria-label="More">${icon("dots", 17)}</button></span></div>`;
    return `<article class="day ${isToday ? "today" : ""}">${dateCol}<div>${fam}
      <button class="name" data-act="recipe" data-id="${r.id}">${esc(r.name)}</button>
      <div class="small muted" style="margin-top:2px">${r.time} min (${r.hands || r.time} hands-on) · ${money(c)} · ${proteinShort(r)}</div>
      <div class="actions">
        <button class="btn sm soft" data-act="another" data-i="${i}">${esc(family(r.family).another || "Another")}</button>
        <button class="btn sm soft" data-act="swapDay" data-i="${i}">Swap</button>
        <button class="btn sm soft" data-act="skip" data-i="${i}">Skip</button>
      </div></div></article>`;
  }).join("");
  const thisWeek = week === currentWeek(), any = days.some((d) => d.recipe);
  return `${header(thisWeek ? "This week" : "Week of", `${niceDate(start)} – ${niceDate(end)}`, `<div class="row" style="gap:6px">
      <button class="icon-btn" data-act="week" data-d="-1" aria-label="Previous week">${icon("left", 18)}</button>
      <button class="icon-btn" data-act="week" data-d="1" aria-label="Next week">${icon("right", 18)}</button></div>`)}
    <div class="row" style="margin:0 4px 12px">
      <button class="btn primary" data-act="shuffle">${any ? "Shuffle unlocked" : "Plan my week"}</button>
      ${any ? `<span class="small muted">≈ ${money(cost)} of food${settings().budget ? " · budget swaps on" : ""}</span>` : ""}
    </div>
    <div class="stack" style="gap:8px">${cards}</div>`;
}

// ----- Shop -----
function shopData() {
  const week = currentWeek();
  const all = buildList(week);
  const toGet = all.filter((i) => i.active && (!i.cupboard || i.need));
  const tabs = enabledShops().concat("any").map((s) => ({ s, n: toGet.filter((i) => i.shop === s && !i.done).length, all: toGet.filter((i) => i.shop === s).length })).filter((t) => t.all);
  if (app.shopTab !== "all" && !tabs.some((t) => t.s === app.shopTab)) app.shopTab = "all";
  const shown = app.shopTab === "all" ? toGet : toGet.filter((i) => i.shop === app.shopTab);
  return { week, all, toGet, tabs, shown };
}
function viewShop() {
  const { week, all, toGet, tabs, shown } = shopData();
  if (!toGet.length && !all.length) return `${header("Shopping", "Nothing to buy yet")}<div class="card empty"><p>Plan some dinners and the list builds itself.</p><button class="btn primary" data-act="go" data-to="week">Plan the week</button></div>`;
  const done = shown.filter((i) => i.done).length;
  const sel = app.selecting.size;
  const title = sel ? `${sel} selected` : app.shopTab === "all" ? "Shopping list" : `At ${esc(shopName(app.shopTab, false))}`;
  const right = sel ? `<button class="btn sm" data-act="selCancel">Cancel</button>`
    : `<div class="row" style="gap:6px">${offlineBadge()}<button class="icon-btn" data-act="shopMenu" aria-label="Share, print and more">${icon("dots")}</button></div>`;

  const groups = {};
  shown.forEach((i) => { (groups[i.aisle] = groups[i.aisle] || []).push(i); });
  const body = aisleOrder().filter((a) => groups[a]).map((a) => `<p class="section-label">${esc(aisleName(a))}</p>
    <div class="list">${groups[a].sort((x, y) => (x.done - y.done) || x.name.localeCompare(y.name)).map(itemRow).join("")}</div>`).join("");

  const total = toGet.reduce((t, i) => t + (i.cost || 0), 0);
  const base = toGet.reduce((t, i) => t + (i.cost ? i.cost / shopMult(i.shop === "any" ? priceShop() : i.shop) : 0), 0);
  const compare = enabledShops().slice(0, 4).map((s) => `${esc(shopName(s))} ≈${money(base * shopMult(s))}`).join(" · ");
  const have = all.filter((i) => !i.cupboard && i.have);
  const usedRack = rackUsedThisWeek(week), unchecked = [...usedRack].filter((k) => !(app.state.pantry || {})[k]).length;

  return `${header(`Week of ${niceDate(parseISO(week))}`, title, right)}
    <div class="stack" style="gap:12px;margin-bottom:6px">
      <div class="row between small"><span class="muted">${done} of ${shown.length} in the trolley</span><span class="muted">≈ <b style="color:var(--ink)">${money(app.shopTab === "all" ? total : shown.reduce((t, i) => t + (i.cost || 0), 0))}</b></span></div>
      <div class="progress"><i style="width:${shown.length ? Math.round(done / shown.length * 100) : 0}%"></i></div>
      ${tabs.length > 1 ? `<div class="shop-tabs"><button class="chip ${app.shopTab === "all" ? "on" : ""}" data-act="shopTab" data-s="all">All · ${toGet.filter((i) => !i.done).length}</button>${tabs.map((t) => `<button class="chip ${app.shopTab === t.s ? "on" : ""}" data-act="shopTab" data-s="${t.s}">${esc(shopName(t.s))} · ${t.n}</button>`).join("")}</div>` : ""}
    </div>
    ${body}
    ${have.length ? `<details class="fold"><summary class="section-label">Already got · ${have.length}</summary><div class="list">${have.map(itemRow).join("")}</div></details>` : ""}
    <button class="card row" style="width:100%;margin-top:16px;padding:14px 16px;text-align:left" data-act="rack">
      <span class="grow"><b>Spice rack &amp; cupboard</b><br><span class="small muted">${unchecked ? `${unchecked} thing${unchecked === 1 ? "" : "s"} this week's dinners use ${unchecked === 1 ? "hasn't" : "haven't"} been checked` : "Mark anything running low and it goes on the list"}</span></span>
      ${unchecked ? `<span class="pill warn">Check</span>` : ""}<span aria-hidden="true">›</span></button>
    <p class="small muted" style="margin:20px 4px 0">Same list everywhere: ${compare}. Prices are estimates${inflationFactor() !== 1 ? ", adjusted for food inflation" : ""}. Tap an item to correct its price, swap it or move it to another shop. Press and hold to select several.</p>`;
}
function itemRow(i) {
  const chips = [];
  if ((i.flags || []).includes("veg")) chips.push(`<span class="pill warn">Check for V</span>`);
  if ((i.flags || []).includes("welfare")) chips.push(`<span class="pill accent">Free-range</span>`);
  (i.checkLabel || []).forEach((a) => chips.push(`<span class="pill warm">Check: ${esc(a.toLowerCase())}</span>`));
  if (i.stale) chips.push(`<span class="pill">Price may be old</span>`);
  const sub = [];
  if (i.from.length) sub.push(`instead of ${esc(i.from.join(", ").toLowerCase())}`);
  if (i.note && !i.recipes.length) sub.push(esc(i.note));
  else if (i.note) sub.push(esc(i.note));
  if (i.extra && i.by) sub.push(`Added by ${esc(i.by)}`);
  if (i.staple) sub.push("Every week");
  if (i.done && i.checkedBy) sub.push(`✓ ${esc(i.checkedBy)}`);
  const selected = app.selecting.has(i.key);
  let lead;
  if (i.have) lead = `<button class="btn sm" data-act="flag" data-key="${esc(i.key)}" data-f="have" data-v="0">Need it</button>`;
  else lead = `<input type="checkbox" class="check-input" data-act="tick" data-key="${esc(i.key)}" ${i.done ? "checked" : ""} aria-label="Got ${esc(i.name)}">`;
  return `<div class="item ${i.done ? "done" : ""} ${selected ? "sel" : ""}" data-key="${esc(i.key)}">
    ${lead}
    <button class="body" data-act="itemOpen" data-key="${esc(i.key)}"><span class="iname">${esc(i.name)}</span> ${i.qtyText ? `<span class="iq">${esc(i.qtyText)}</span>` : ""}
      ${chips.length || sub.length ? `<span class="sub">${chips.join("")}${sub.length ? `<span>${sub.join(" · ")}</span>` : ""}</span>` : ""}</button>
    ${i.cost != null && !i.cupboard ? `<span class="price">${money(i.cost)}</span>` : ""}
    <button class="shop-tag ${esc(i.shop)}" data-act="moveOne" data-key="${esc(i.key)}" aria-label="Shop: ${esc(shopName(i.shop, false))}. Tap to change">${esc(shopName(i.shop))}</button>
  </div>`;
}
function dockShop() {
  if (app.selecting.size) return `<div class="dock-inner"><button class="btn lg primary grow" data-act="moveSel">Move ${app.selecting.size} to another shop</button></div>`;
  return `<div class="dock-inner"><button class="btn lg primary grow" data-act="doneShopping">Done shopping</button>
    <button class="btn lg" style="width:54px;padding:0" data-act="addItem" aria-label="Add an item">${icon("plus")}</button></div>`;
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
      <span class="small muted">${r.time} min (${r.hands || r.time} hands-on) · ${money(recipeCost(r))} a portion · ${Math.round(nutritionPerPortion(r).protein)} g protein</span>
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
  return `${header(`${app.recipes.length} dinners`, "Recipes")}
    <label class="search" style="margin-bottom:10px">${icon("search", 18)}<input type="search" placeholder="Search lentils, curry, quick…" aria-label="Search recipes" value="${esc(app.recipeQuery)}" data-input="rsearch"></label>
    <div class="chips" style="margin-bottom:12px">${chip("all", "All")}${chip("quick", "Quick")}${chip("fav", "Favourites")}${chip("hidden", "Hidden")}</div>
    <div class="stack">${sections.join("")}</div>`;
}

// ----- Settings -----
function viewSettings() {
  const s = settings(), bi = babyInfo(), b = bi.b;
  const stepper = (act, idx, val, step, fmt = (v) => v) => `<div class="stepper"><button data-act="${act}" data-i="${idx}" data-d="${-step}" aria-label="Less">−</button><span>${fmt(val)}</span><button data-act="${act}" data-i="${idx}" data-d="${step}" aria-label="More">+</button></div>`;
  const people = s.people.map((p, i) => `<div class="stack" style="padding:14px 16px;gap:10px">
      <div class="row"><input class="input grow" value="${esc(p.name)}" data-set="personName" data-i="${i}" aria-label="Name">
      ${s.people.length > 1 ? `<button class="icon-btn plain" data-act="removePerson" data-i="${i}" aria-label="Remove ${esc(p.name)}">${icon("trash", 18)}</button>` : ""}</div>
      <div class="row between"><span class="small muted">Portion size</span>${stepper("portion", i, p.portion, 0.1, (v) => (+v).toFixed(1))}</div>
      <div class="row between"><span class="small muted">Protein goal at dinner</span>${stepper("goal", i, p.goal || 40, 5, (v) => `${v} g`)}</div></div>`).join("");
  const famOpts = (cur) => `<option value="">No theme</option>` + app.families.map((f) => `<option value="${f.id}" ${cur === f.id ? "selected" : ""}>${esc(f.name)}</option>`).join("");
  const themes = s.themes || {};
  const themeRows = DOW_LONG.map((d, i) => `<div class="row between" style="padding:6px 16px"><span>${d}</span><select class="input" style="width:170px;min-height:42px" data-set="theme" data-i="${i}">${famOpts(themes[String(i)])}</select></div>`).join("");
  const shopsOn = s.shops || SHOP_ORDER;
  const avoid = s.avoid || [];
  const inf = app.state.inflation || {};
  const infLine = s.inflation === false ? "Off: prices stay at the built-in estimates."
    : inf.factor ? `Food prices ${inf.factor >= 1 ? "up" : "down"} ${Math.abs((inf.factor - 1) * 100).toFixed(1)}% since ${esc(inf.base || "")} (ONS, latest ${esc(inf.latest || "")}).${inf.error ? " Last check failed, so this is the previous figure." : ""}`
    : inf.error ? "Couldn't reach the ONS yet. It'll try again later." : app.mode === "live" ? "Checks the ONS food price index once a week." : "Runs on your Home Assistant, not in the preview.";
  const saving = (() => { const keepB = s.budget, keepSw = app.state.swaps; s.budget = false; app.state.swaps = {};
    const off = buildList(currentWeek()).filter((i) => i.active && !i.cupboard).reduce((t, i) => t + (i.cost || 0), 0);
    s.budget = true; const on = buildList(currentWeek()).filter((i) => i.active && !i.cupboard).reduce((t, i) => t + (i.cost || 0), 0);
    s.budget = keepB; app.state.swaps = keepSw; return off - on; })();
  const catalogue = `<datalist id="catalogue">${Object.values(app.ing.items).map((m) => `<option value="${esc(m.n)}">`).join("")}</datalist>`;
  const staples = (s.staples || []).map((st, i) => `<div class="stack" style="padding:14px 16px;gap:8px">
      <div class="row"><input class="input grow" list="catalogue" value="${esc(st.name)}" data-set="stapleName" data-i="${i}" aria-label="Item">
        <label class="switch" title="On every list"><input type="checkbox" data-set="stapleOn" data-i="${i}" ${st.on ? "checked" : ""}><i></i></label></div>
      <div class="row"><input class="input grow" value="${esc(st.amount || "")}" placeholder="Amount, e.g. 4 pints" data-set="stapleAmount" data-i="${i}" aria-label="Amount">
        ${(st.k !== undefined ? st.k : catalogueMatch(st.name || "")) ? `<span class="pill accent">Priced</span>` : `<span>£</span><input class="input" style="width:84px" inputmode="decimal" value="${st.price != null ? esc(st.price) : ""}" placeholder="0.00" data-set="staplePrice" data-i="${i}" aria-label="Price">`}
        <button class="icon-btn plain" data-act="stapleDel" data-i="${i}" aria-label="Remove">${icon("trash", 18)}</button></div></div>`).join("");

  return `${header("Settings", "Your household", `<button class="icon-btn" data-act="go" data-to="tonight" aria-label="Back">${icon("left", 18)}</button>`)}
    <p class="small muted" style="margin:-6px 4px 6px">Saved on your Home Assistant, not in the app's code.</p>

    <p class="section-label">Grown-ups</p>
    <div class="list">${people}<div style="padding:12px 16px"><button class="btn sm" data-act="addPerson">${icon("plus", 16)}Add a person</button></div></div>

    <p class="section-label">Baby</p>
    <div class="list">
      <label class="row" style="padding:13px 16px"><span class="grow"><b>Cooking for a baby</b><br><span class="small muted">Adds baby portions and weaning steps to every recipe</span></span>
        <span class="switch"><input type="checkbox" data-set="babyInclude" ${b.include ? "checked" : ""}><i></i></span></label>
      ${b.include ? `<div class="stack" style="padding:14px 16px;gap:10px">
        <input class="input" value="${esc(b.name)}" data-set="baby" data-f="name" aria-label="Baby's name">
        <div class="row"><label class="grow"><span class="small muted">Born</span><input class="input" type="date" value="${esc(b.born)}" data-set="baby" data-f="born"></label>
          <label class="grow"><span class="small muted">Due date</span><input class="input" type="date" value="${esc(b.due)}" data-set="baby" data-f="due"></label></div>
        <span class="small muted">${b.born ? `${esc(ageText(b.born))} old${b.due && b.due !== b.born ? ` · ${esc(ageText(b.due))} corrected` : ""}` : "Add the birth date. If they arrived early, add the due date too, for their corrected age."}</span>
        <label><span class="small muted">Eating stage</span><select class="input" data-set="baby" data-f="stage">${Object.entries(STAGES).map(([k, v]) => `<option value="${k}" ${b.stage === k ? "selected" : ""}>${v.name}</option>`).join("")}</select></label>
        <span class="small muted">${esc(STAGES[b.stage]?.hint || "")}</span>
        ${bi.ageCorrected && bi.ageCorrected.m >= 12 && b.stage !== "chopped" ? `<div class="pill baby" style="white-space:normal;padding:8px 12px">Past 12 months corrected: they may be ready for chopped family food.</div>` : ""}
        <div class="row between"><span class="small muted">Portion size</span>${stepper("babyPortion", 0, b.portion, 0.05, (v) => (+v).toFixed(2))}</div></div>` : ""}
    </div>

    <p class="section-label">Food</p>
    <div class="list">
      <div class="stack" style="padding:14px 16px;gap:8px"><b>Allergies: never include</b>
        <div class="chips wrap">${Object.entries(app.ing.allergens).map(([k, v]) => `<button class="chip ${avoid.includes(k) ? "on" : ""}" data-act="avoid" data-k="${k}">${esc(v)}</button>`).join("")}</div>
        <span class="small muted">Recipes with these are hidden. Shopping items that sometimes contain them get a "Check" label.</span></div>
      <div class="stack" style="padding:14px 16px;gap:8px"><b>Dislikes</b><input class="input" value="${esc(s.dislikes || "")}" placeholder="e.g. mushroom, feta" data-set="text" data-f="dislikes"><span class="small muted">Separate with commas.</span></div>
      <div class="stack" style="padding:14px 16px 8px;gap:4px"><b>Theme nights</b><span class="small muted">Optional. Days without a theme stay random.</span></div>
      <div style="padding-bottom:8px">${themeRows}</div>
      <div class="stack" style="padding:14px 16px;gap:10px">
        <label><span class="small muted">Weeknight time limit</span><select class="input" data-set="num" data-f="weeknightMax">${[20, 30, 40, 50, 60].map((m) => `<option value="${m}" ${+s.weeknightMax === m ? "selected" : ""}>${m} minutes</option>`).join("")}</select></label>
        <label><span class="small muted">Weekend time limit</span><select class="input" data-set="num" data-f="weekendMax">${[40, 60, 90, 120].map((m) => `<option value="${m}" ${+s.weekendMax === m ? "selected" : ""}>${m} minutes</option>`).join("")}</select></label>
        <label><span class="small muted">Week starts on (the day after your big shop)</span><select class="input" data-set="num" data-f="weekStartDay">${DOW_LONG.map((d, i) => `<option value="${i}" ${(+s.weekStartDay || 0) === i ? "selected" : ""}>${d}</option>`).join("")}</select></label>
      </div>
      <div class="stack" style="padding:14px 16px;gap:4px"><b>Always</b><span class="small muted">Nothing from a dead animal: no meat, fish, gelatine, anchovy (so no Worcestershire), cochineal (E120) or animal rennet (so no Parmesan or Grana Padano). Free-range eggs, cheese with the V symbol.</span></div>
    </div>

    <p class="section-label">Shopping &amp; prices</p>
    <div class="list">
      <div class="stack" style="padding:14px 16px;gap:8px"><b>Shops you use</b>
        <div class="chips wrap">${SHOP_ORDER.map((k) => `<button class="chip ${shopsOn.includes(k) ? "on" : ""}" data-act="shopToggle" data-k="${k}">${esc(shopName(k))}</button>`).join("")}</div></div>
      <label class="stack" style="padding:14px 16px;gap:6px"><b>Estimate prices at</b><select class="input" data-set="text" data-f="priceShop">${enabledShops().map((k) => `<option value="${k}" ${priceShop() === k ? "selected" : ""}>${esc(shopName(k, false))}</option>`).join("")}</select>
        <span class="small muted">${esc(app.ing.prices_note || "")}</span></label>
      <label class="row" style="padding:13px 16px"><span class="grow"><b>Budget mode</b><br><span class="small muted">Frozen veg, pastes and cheaper swaps${saving > 0.05 ? ` · about ${money(saving)} ${s.budget ? "saved" : "cheaper"} this week` : ""}</span></span>
        <span class="switch"><input type="checkbox" data-set="bool" data-f="budget" ${s.budget ? "checked" : ""}><i></i></span></label>
      <label class="row" style="padding:13px 16px"><span class="grow"><b>Track food inflation</b><br><span class="small muted">${infLine}</span></span>
        <span class="switch"><input type="checkbox" data-set="bool" data-f="inflation" ${s.inflation !== false ? "checked" : ""}><i></i></span></label>
      <button class="row" style="padding:13px 16px;width:100%;border:0;background:none;text-align:left" data-act="rack"><span class="grow"><b>Spice rack &amp; cupboard</b><br><span class="small muted">What you've got, what's running low</span></span><span aria-hidden="true">›</span></button>
      <div class="row" style="padding:13px 16px"><span class="grow"><b>Receipt reader</b><br><span class="small muted">Coming later: scan receipts to update prices, read on your own PC.</span></span></div>
    </div>

    <p class="section-label">Weekly staples</p>
    <div class="list">${staples}<div style="padding:12px 16px" class="stack"><button class="btn sm" style="align-self:flex-start" data-act="stapleAdd">${icon("plus", 16)}Add a staple</button>
      <span class="small muted">Breakfasts, lunches and anything you buy every week. Pick a name from the suggestions and it's priced for you.</span></div></div>
    ${catalogue}
    <p class="section-label">Recipe feedback</p>
    <div class="list"><div class="row" style="padding:13px 16px"><span class="grow"><b>Copy your feedback</b><br><span class="small muted">Paste it to Claude to get recipes adjusted</span></span><button class="btn sm" data-act="copyFeedback">${icon("copy", 16)}Copy</button></div></div>
    <p class="small muted" style="text-align:center;margin-top:24px">${app.mode === "live" ? `Synced through Home Assistant${app.user ? ` · signed in as ${esc(app.user)}` : ""}` : "Preview: saved on this device only"} · FoodIsHard 0.4.0</p>`;
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------
function openSheet(html) { $("#sheetBody").innerHTML = html; hydrateIcons($("#sheetBody")); $("#sheet").hidden = false; $(".sheet-panel").scrollTop = 0; document.body.style.overflow = "hidden"; }
function closeSheet() { $("#sheet").hidden = true; document.body.style.overflow = ""; }

function openRecipe(id, { pickDay = null } = {}) {
  const r = app.byId[id]; if (!r) return;
  const { factor, baby } = household(), p = prefsFor(id), bi = babyInfo();
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
    <div class="tiles" style="margin-bottom:12px">${household().adults.map((pp, idx) => `<button class="tile card" style="background:var(--surface)" data-act="macros" data-id="${id}" data-who="${idx}"><span class="k muted"><span>${esc(pp.name)}</span><span>›</span></span><span class="v">${proteinFor(r, pp.portion)} g protein</span></button>`).join("")}</div>
    <div class="row wrap" style="margin-bottom:6px">
      ${pickDay != null ? `<button class="btn primary" data-act="put" data-id="${id}" data-i="${pickDay}">Use for this day</button>` : `<button class="btn primary" data-act="cook" data-id="${id}">${icon("play", 16)}Cook</button>`}
      <button class="btn ${p.fav ? "primary" : ""}" data-act="pref" data-id="${id}" data-f="fav" data-v="${p.fav ? 0 : 1}">${icon("heart", 16)}${p.fav ? "Favourite" : "Favourite"}</button>
      <button class="btn" data-act="pref" data-id="${id}" data-f="ban" data-v="${p.ban ? 0 : 1}">${icon("ban", 16)}${p.ban ? "Allow again" : "Never again"}</button>
      ${pickDay == null ? `<select class="input" style="width:auto;min-height:44px" data-set="putDay" data-id="${id}"><option value="">Add to this week…</option>${dayOpts}</select>` : ""}
    </div>
    <p class="section-label">Ingredients · for ${niceNumber(factor)} portions</p>
    <div class="card"><ul class="ing-list">${ingHTML}</ul></div>
    ${rack.length || cupboard.length ? `<p class="section-label">From the spice rack &amp; cupboard</p><div class="card"><ul class="ing-list">${rack.map((i) => `<li><span>${esc(ingMeta(i.k).n)}</span><span class="muted" style="white-space:nowrap">${esc(fmtQty(i.q * factor, i.u))}</span></li>`).join("")}${cupboard.map((i) => `<li><span>${esc(ingMeta(i.k).n)}</span><span class="muted">to taste</span></li>`).join("")}</ul></div>` : ""}
    ${baby.include ? `<p class="section-label">${esc(babyName())} · ${esc(STAGES[baby.stage]?.name || "")}</p><div class="baby-box"><p style="margin:0">${esc(personaliseStep((r.baby || {})[baby.stage] || "") || "Take their portion out before salt, stock or chilli, and cut it to a size they can manage.")}</p>
      <ul><li>No added salt or stock in their portion.</li>${bi.underOne ? `<li>No honey until ${bi.firstBirthday ? `${niceDate(bi.firstBirthday)} ${bi.firstBirthday.getFullYear()}` : "their first birthday"}.</li>` : ""}<li>Quarter cherry tomatoes and grapes. Nuts ground or smooth only.</li></ul></div>` : ""}
    <p class="section-label">Method</p>
    <ol class="steps">${steps.map((s) => `<li class="${s.baby ? "baby" : ""}">${esc(personaliseStep(scaleStep(s.t, factor)))}</li>`).join("")}</ol>`);
}

function openMacros(id, who) {
  const r = app.byId[id]; if (!r) return;
  const { adults, baby } = household(), bi = babyInfo();
  const per = nutritionPerPortion(r);
  const tabs = adults.map((p, i) => `<button class="${String(who) === String(i) ? "on" : ""}" data-act="macros" data-id="${id}" data-who="${i}">${esc(p.name)} · ${(+p.portion).toFixed(1).replace(".0", "")}</button>`).join("")
    + (baby.include ? `<button class="${who === "baby" ? "on" : ""}" data-act="macros" data-id="${id}" data-who="baby">${esc(babyName())}</button>` : "");
  let body;
  if (who === "baby") {
    const n = nutritionPerPortion(r, { forBaby: true }), f = +baby.portion || 0.25;
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
    <p class="small muted" style="margin:0">Estimates from UK food composition data, including your swaps. Brands vary a little.</p>
    <button class="btn" data-act="recipe" data-id="${id}">Back to the recipe</button></div>`);
}

function openPicker(i, { emergency = false } = {}) {
  const week = app.weekStart, date = addDays(parseISO(week), i), maxT = maxTimeFor(week, i), theme = themeFor(week, i);
  const list = app.recipes.filter((r) => usable(r) && (!emergency || r.emergency))
    .sort((a, b) => (theme ? (b.family === theme) - (a.family === theme) : 0) || (a.time > maxT) - (b.time > maxT) || a.name.localeCompare(b.name));
  openSheet(`<p class="eyebrow">${DOW_LONG[mondayIndex(date)]} ${date.getDate()}</p><h1 class="title" style="font-size:26px">${emergency ? "Something quick" : "Choose a dinner"}</h1>
    <p class="muted">${theme ? `${esc(family(theme).name)} night comes first. ` : ""}Up to ${maxT} minutes suits this day.</p>
    <div class="list">${list.map((r) => `<button class="rrow" data-act="put" data-id="${r.id}" data-i="${i}"><span class="grow"><b>${esc(r.name)}</b><br><span class="small muted">${esc(r.emergency ? "Quick" : family(r.family).name)} · ${r.time} min · ${money(recipeCost(r))} a portion</span></span>${prefsFor(r.id).fav ? "♥" : ""}</button>`).join("")}</div>`);
}

function openSkip(i) {
  const date = addDays(parseISO(app.weekStart), i);
  const reasons = ["Eating out", "At friends'", "Takeaway", "Away"];
  openSheet(`<h1 class="title" style="font-size:26px">Skip ${DOW_LONG[mondayIndex(date)]}?</h1><p class="muted">Its ingredients come off the shopping list.</p>
    <form data-form="skip" data-i="${i}" class="stack"><div class="chips wrap">${reasons.map((r) => `<button type="button" class="chip" data-act="skipReason" data-r="${esc(r)}">${esc(r)}</button>`).join("")}</div>
    <input class="input" name="note" placeholder="Or type a note (optional)" autocomplete="off"><button class="btn lg primary">Skip this day</button></form>`);
}

function openSwap(k, reopen) {
  const m = ingMeta(k), current = resolveIng(k).k;
  const row = (altKey, why, isOrig) => {
    const am = ingMeta(altKey), bp = basePrice(altKey), on = current === altKey;
    return `<button class="rrow" data-act="setSwap" data-k="${esc(k)}" data-alt="${isOrig ? "" : esc(altKey)}" ${reopen ? `data-reopen="${esc(reopen)}"` : ""}>
      <span class="grow"><b>${on ? "✓ " : ""}${esc(am.n)}</b>${isOrig ? ` <span class="small muted">(original)</span>` : ""}<br><span class="small muted">${esc(why)}${bp && am.pk ? ` · ${money(bp.p * shopMult(priceShop()))} per ${esc(fmtQty(am.pk[0], am.pk[1]))}` : ""}</span></span></button>`;
  };
  openSheet(`<h1 class="title" style="font-size:26px">Swap ${esc(m.n.toLowerCase())}</h1><p class="muted">Applies to every recipe, for everyone. Budget mode picks the cheaper option automatically.</p>
    <div class="list">${row(k, "As the recipe says", true)}${(m.sw || []).map((o) => row(o.k, o.why, false)).join("")}</div>`);
}

function openItem(key) {
  const it = buildList(currentWeek()).find((i) => i.key === key); if (!it) return;
  const bp = it.k ? basePrice(it.k) : null, m = it.k ? ingMeta(it.k) : null;
  const shopNow = it.shop === "any" ? priceShop() : it.shop;
  openSheet(`<p class="eyebrow">${esc(aisleName(it.aisle))}</p><h1 class="title" style="font-size:26px">${esc(it.name)}</h1>
    <p class="muted" style="margin:6px 0 12px">${it.qtyText ? `${esc(it.qtyText)} · ` : ""}${it.recipes.length ? `for ${esc(it.recipes.join(", "))}` : it.staple ? "Every week" : it.extra ? `Added${it.by ? ` by ${esc(it.by)}` : ""}` : ""}</p>
    ${it.note ? `<p class="pill" style="white-space:normal;padding:8px 12px">${esc(it.note)}</p>` : ""}
    <div class="stack">
      ${m && m.pk ? `<form class="card stack" style="padding:14px 16px;gap:10px" data-form="price" data-k="${esc(it.k)}">
        <div class="row between"><b>Price</b><span class="small muted">${bp && bp.own ? `Updated by ${esc(bp.own.by || "someone")} on ${niceDate(new Date(bp.own.at * 1000))}` : `Estimate, checked ${esc(app.ing.prices_checked || "")}`}</span></div>
        <span class="small muted">For a pack of ${esc(fmtQty(m.pk[0], m.pk[1]))}</span>
        <div class="row"><span style="font-weight:700">£</span><input class="input" name="price" inputmode="decimal" value="${bp ? (bp.p * shopMult(shopNow)).toFixed(2) : ""}" aria-label="Price">
          <select class="input" name="shop" style="width:140px" aria-label="Seen at">${enabledShops().map((s) => `<option value="${s}" ${s === shopNow ? "selected" : ""}>${esc(shopName(s))}</option>`).join("")}</select></div>
        <div class="row"><button class="btn primary">Save price</button>${bp && bp.own ? `<button type="button" class="btn" data-act="resetPrice" data-k="${esc(it.k)}">Use the estimate</button>` : ""}</div></form>` : ""}
      ${it.swappable.length ? `<div class="card stack" style="padding:14px 16px;gap:8px"><b>Swap</b><div class="row wrap">${it.swappable.map((k) => `<button class="btn sm" data-act="swapIng" data-k="${esc(k)}">${esc(ingMeta(k).n)}…</button>`).join("")}</div></div>` : ""}
      <div class="card stack" style="padding:14px 16px;gap:8px"><b>Get it at</b>
        <div class="shop-grid">${shopOrder().map((s) => `<button class="${it.shop === s ? "on" : ""}" data-act="moveTo" data-keys="${esc(key)}" data-s="${s}">${esc(shopName(s))}</button>`).join("")}</div>
        <span class="small muted">Remembered for next time. Change it again whenever you like.</span></div>
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
      <input class="input" name="name" list="catalogue2" placeholder="What do you need?" autocomplete="off" required>
      <input class="input" name="amount" placeholder="How much (optional)" autocomplete="off">
      <div class="shop-grid">${shops.map((s) => `<button type="button" class="${s === last ? "on" : ""}" data-act="addShop" data-s="${s}">${esc(shopName(s))}</button>`).join("")}</div>
      <input type="hidden" name="shop" value="${last}">
      <button class="btn lg primary">Add</button></form>
    <datalist id="catalogue2">${Object.values(app.ing.items).map((m) => `<option value="${esc(m.n)}">`).join("")}</datalist>`);
  setTimeout(() => { const f = $("#sheetBody input[name=name]"); if (f) f.focus(); }, 250);
}

function openDone() {
  const { toGet } = shopData();
  const left = toGet.filter((i) => !i.done), got = toGet.length - left.length;
  if (!left.length) { toast("All done. Nice work!"); return; }
  app.moveKeys = left.map((i) => i.key); app.moveShop = null;
  openSheet(`<h1 class="title" style="font-size:26px">Got ${got} of ${toGet.length}</h1>
    <p class="muted">Still to get: ${esc(left.slice(0, 6).map((i) => i.name).join(", "))}${left.length > 6 ? ` and ${left.length - 6} more` : ""}.</p>
    <p style="margin:14px 0 8px"><b>Pick them up elsewhere this week?</b></p>
    <div class="shop-grid" style="margin-bottom:14px">${shopOrder().map((s) => `<button data-act="pickMoveShop" data-s="${s}">${esc(shopName(s))}</button>`).join("")}</div>
    <input type="checkbox" id="moveAlways" hidden>
    <div class="stack"><button class="btn lg primary" data-act="confirmMove" disabled id="moveGo">Pick a shop</button><button class="btn lg" data-close>Leave them on the list</button></div>`);
}

function openRack() {
  const used = rackUsedThisWeek(currentWeek());
  const row = (m) => {
    const seg = [["ok", "Got it"], ["low", "Low"], ["out", "Out"]].map(([s, l]) => `<button class="${m.status === s ? "on" : ""}" data-act="rackSet" data-k="${m.k}" data-s="${s}">${l}</button>`).join("");
    return `<div class="stack" style="padding:12px 16px;gap:8px"><div class="row between"><b>${esc(m.n)}</b>${used.has(m.k) ? `<span class="pill accent">This week</span>` : ""}</div><div class="seg">${seg}</div></div>`;
  };
  const items = rackItems();
  const spices = items.filter((m) => m.rack === "spices"), cupboard = items.filter((m) => m.rack !== "spices");
  const missing = spices.filter((m) => m.status !== "ok");
  const starterCost = missing.reduce((t, m) => t + (basePrice(m.k) || { p: 0 }).p * shopMult(priceShop()), 0);
  openSheet(`<h1 class="title" style="font-size:26px">Spice rack &amp; cupboard</h1>
    <p class="muted">Low or Out goes on the shopping list. Ticking it off in the shop marks it Got it again.</p>
    ${missing.length ? `<button class="btn primary block" style="margin:6px 0 4px" data-act="rackStarter">Starter rack: add ${missing.length} spices to the list (≈ ${money(starterCost)})</button>` : ""}
    <p class="section-label">Spices</p><div class="list">${spices.map(row).join("")}</div>
    <p class="section-label">Cupboard</p><div class="list">${cupboard.map(row).join("")}</div>`);
}

const FEEDBACK_TAGS = ["Too bland", "Too spicy", "Too salty", "Took longer", "Too fiddly", "Too much food", "Not enough", "Baby loved it", "Baby wasn't keen"];
function openFeedback(id) {
  const r = app.byId[id]; app.fbRating = null;
  openSheet(`<p class="eyebrow">${esc(r.name)}</p><h1 class="title" style="font-size:26px">How was it?</h1>
    <form data-form="feedback" data-id="${id}" class="stack" style="margin-top:12px">
      <div class="seg"><button type="button" data-act="feedbackRate" data-r="loved">Loved it</button><button type="button" data-act="feedbackRate" data-r="fine">Fine</button><button type="button" data-act="feedbackRate" data-r="never">Not again</button></div>
      <div class="chips wrap">${FEEDBACK_TAGS.filter((t) => household().baby.include || !t.startsWith("Baby")).map((t) => `<button type="button" class="chip" data-act="feedbackTag" data-t="${esc(t)}">${esc(t)}</button>`).join("")}</div>
      <input class="input" name="note" placeholder="Anything else? e.g. needed more salt" autocomplete="off">
      <button class="btn lg primary" id="fbSave" disabled>Save</button><button type="button" class="btn" data-close>Skip</button></form>`);
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
function startCooking(id) {
  closeSheet();
  app.cook = { id, step: 0, timers: [], showIng: false };
  $("#cook").hidden = false;
  try { navigator.wakeLock && navigator.wakeLock.request("screen").then((l) => { wakeLock = l; }).catch(() => {}); } catch { /* not supported */ }
  clearInterval(cookTick);
  cookTick = setInterval(tickTimers, 1000);
  renderCook();
}
function stopCooking() {
  $("#cook").hidden = true; $("#cook").innerHTML = ""; app.cook = null; clearInterval(cookTick);
  try { wakeLock && wakeLock.release(); } catch { /* fine */ }
}
function stepMinutes(text) { const m = text.match(/(\d+)(?:\s*[–-]\s*(\d+))?\s*min(?:ute)?s?/i); return m ? +(m[2] || m[1]) : null; }
function renderCook() {
  const c = app.cook; if (!c) return;
  const r = app.byId[c.id], steps = visibleSteps(r), s = steps[c.step], { factor, baby } = household();
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
      <span class="small muted">Screen stays on</span><button class="btn sm" data-act="cookIng">${c.showIng ? "Hide" : "Ingredients"}</button></div>
    <p class="small" style="font-weight:600;color:var(--muted);margin:12px 0 8px">${esc(r.name)}</p>
    <div class="cook-progress">${prog}</div>
    <div class="grow" style="overflow-y:auto;padding:18px 0;display:flex;flex-direction:column;gap:16px">
      ${c.showIng ? `<div class="card"><ul class="ing-list">${ingList}</ul></div>` : ""}
      <p class="eyebrow" style="color:${s.baby ? "var(--baby)" : "var(--muted)"}">Step ${c.step + 1} of ${steps.length}${s.baby ? ` · ${esc(babyName())}'s portion` : ""}</p>
      <section class="cook-panel ${s.baby ? "baby" : ""}"><p class="cook-step">${esc(text)}</p>
        ${s.baby && baby.include ? `<p style="margin:12px 0 0">${esc(personaliseStep((r.baby || {})[baby.stage] || ""))}</p>` : ""}</section>
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
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2800); }
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("List copied. Paste it anywhere."); }
  catch { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("List copied"); } catch { toast("Couldn't copy on this device"); } ta.remove(); }
}
function downloadText(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}
function printList() {
  const week = currentWeek(), items = buildList(week).filter((i) => i.active && (!i.cupboard || i.need));
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
function dayUpdate(i, patch, week = app.weekStart) { const days = planFor(week); send({ op: "day", week, i, day: { ...days[i], ...patch } }); }

const ACTIONS = {
  go: (d) => { closeSheet(); go(d.to); },
  week: (d) => { app.weekStart = iso(addDays(parseISO(app.weekStart), 7 * +d.d)); render(); },
  shuffle: () => { send({ op: "plan", week: app.weekStart, plan: suggestWeek(app.weekStart) }); toast("Here's a plan. Swap anything you don't fancy."); },
  recipe: (d) => openRecipe(d.id),
  macros: (d) => openMacros(d.id, d.who),
  cook: (d) => startCooking(d.id),
  pick: (d) => openPicker(+d.i),
  put: (d) => { dayUpdate(+d.i, { recipe: d.id, status: "cook", note: null }); closeSheet(); toast(`${app.byId[d.id].name} added`); },
  another: (d) => {
    const i = +d.i, days = planFor(app.weekStart), cur = app.byId[days[i].recipe];
    const next = pickRecipe(app.weekStart, i, days, { exclude: new Set([cur.id]), fam: cur.family });
    if (!next || next === cur.id) return toast(`No other ${family(cur.family).name.toLowerCase()} yet`);
    dayUpdate(i, { recipe: next });
  },
  swapDay: (d) => {
    const i = +d.i, days = planFor(app.weekStart), cur = days[i].recipe;
    const isEm = cur && app.byId[cur] && app.byId[cur].emergency;
    dayUpdate(i, { recipe: pickRecipe(app.weekStart, i, days, { exclude: new Set(cur ? [cur] : []), emergency: !!isEm }) });
  },
  quicker: (d) => {
    const week = currentWeek(), i = +d.i, days = planFor(week);
    dayUpdate(i, { recipe: pickRecipe(week, i, days, { exclude: new Set([days[i].recipe]), emergency: true }), status: "cook" }, week);
    toast("Swapped for a quick one");
  },
  emergency: (d) => { const week = d.week || currentWeek(), i = +d.i, days = planFor(week); dayUpdate(i, { recipe: pickRecipe(week, i, days, { emergency: true }), status: "cook" }, week); closeMenus(); },
  skip: (d) => openSkip(+d.i),
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
  dayMenu: (d, el) => openMenu(el, [["pickFromMenu", "Choose a recipe…", "book", `data-i="${d.i}"`], ["emergency", "Emergency meal (about 15 min)", "bolt", `data-i="${d.i}" data-week="${app.weekStart}"`],
    ["status", "Leftovers night", "pot", `data-i="${d.i}" data-s="leftovers"`], ["status", "Clear this day", "x", `data-i="${d.i}" data-s="clear"`]]),
  pickFromMenu: (d) => { closeMenus(); openPicker(+d.i); },
  fam: (d) => { app.openFamilies.has(d.f) ? app.openFamilies.delete(d.f) : app.openFamilies.add(d.f); render(); },
  rfilter: (d) => { app.recipeFilter = d.f; render(); },
  pref: (d) => { send({ op: "pref", recipe: d.id, patch: { [d.f]: d.v === "1" } }); openRecipe(d.id); },
  swapIng: (d) => openSwap(d.k, d.reopen),
  setSwap: (d) => { send({ op: "swap", key: d.k, alt: d.alt }); if (d.reopen) openRecipe(d.reopen); else { closeSheet(); toast(d.alt ? `Swapped for ${ingMeta(d.alt).n.toLowerCase()}` : "Back to the original"); } },
  // shop
  shopTab: (d) => { app.shopTab = d.s; render(); },
  tick: (d, el) => {
    send({ op: "check", week: currentWeek(), key: d.key, field: "done", value: el.checked }, { rerender: false });
    const k = d.key.startsWith("i:") ? d.key.slice(2) : null;
    if (k && ingMeta(k).c) send({ op: "pantry", key: k, status: el.checked ? "ok" : "out" }, { rerender: false });
    render();
  },
  rack: () => openRack(),
  rackSet: (d) => { send({ op: "pantry", key: d.k, status: d.s }); openRack(); },
  rackStarter: () => {
    const keys = rackItems().filter((m) => m.rack === "spices" && m.status !== "ok").map((m) => m.k);
    send({ op: "pantry", keys, status: "out" }); closeSheet(); toast(`Added ${keys.length} spices to the list`);
  },
  feedbackRate: (d, el) => { $$("#sheetBody [data-act=feedbackRate]").forEach((b) => b.classList.toggle("on", b === el)); app.fbRating = d.r; $("#fbSave").disabled = false; },
  feedbackTag: (d, el) => { el.classList.toggle("on"); },
  copyFeedback: () => copyText(feedbackText()),
  flag: (d) => { send({ op: "check", week: currentWeek(), key: d.key, field: d.f, value: d.v === "1" }); if (d.close) closeSheet(); },
  itemOpen: (d) => { if (app.selecting.size) return toggleSelect(d.key); openItem(d.key); },
  moveOne: (d) => { if (app.selecting.size) return toggleSelect(d.key); openMove([d.key]); },
  moveSel: () => openMove([...app.selecting]),
  selCancel: () => { app.selecting.clear(); render(); },
  pickMoveShop: (d, el) => { app.moveShop = d.s; $$("#sheetBody .shop-grid button").forEach((b) => b.classList.toggle("on", b === el)); const g = $("#moveGo"); g.disabled = false; g.textContent = `Move to ${shopName(d.s)}`; },
  confirmMove: () => {
    const keys = app.moveKeys || [], shop = app.moveShop, always = $("#moveAlways") && $("#moveAlways").checked;
    if (!shop || !keys.length) return;
    const week = currentWeek();
    if (always) { send({ op: "shop_pref", keys, shop }, { rerender: false }); keys.forEach((k) => send({ op: "shop_for", week, key: k, shop: null }, { rerender: false })); }
    else keys.forEach((k) => send({ op: "shop_for", week, key: k, shop }, { rerender: false }));
    app.selecting.clear(); closeSheet(); render();
    toast(`Moved ${keys.length} to ${shopName(shop)}`);
  },
  moveTo: (d) => { const week = currentWeek(); send({ op: "shop_pref", keys: [d.keys], shop: d.s }, { rerender: false }); send({ op: "shop_for", week, key: d.keys, shop: null }); closeSheet(); toast(`Now from ${shopName(d.s)}`); },
  resetPrice: (d) => { send({ op: "price", key: d.k, price: null }); closeSheet(); toast("Using the built-in estimate"); },
  removeExtra: (d) => { send({ op: "extra_remove", week: currentWeek(), id: d.id }); closeSheet(); },
  addItem: () => openAdd(),
  addShop: (d, el) => { $$("#sheetBody .shop-grid button").forEach((b) => b.classList.toggle("on", b === el)); $("#sheetBody input[name=shop]").value = d.s; },
  doneShopping: () => openDone(),
  shopMenu: (d, el) => openMenu(el, [["copyList", "Copy the list", "copy"], ["downloadList", "Download as text", "download"], ["printList", "Print or save as PDF", "print"], ["untickAll", "Untick everything", "trash"]]),
  copyList: () => { closeMenus(); copyText(listAsText(currentWeek(), { byShop: true })); },
  downloadList: () => { closeMenus(); downloadText(listAsText(currentWeek(), { byShop: true }), `shopping-${currentWeek()}.txt`); },
  printList: () => { closeMenus(); printList(); },
  untickAll: () => { closeMenus(); send({ op: "clear_checks", week: currentWeek() }); },
  // cooking
  cookClose: () => stopCooking(),
  cookIng: () => { app.cook.showIng = !app.cook.showIng; renderCook(); },
  cookStep: (d) => {
    const c = app.cook, n = visibleSteps(app.byId[c.id]).length;
    if (+d.d > 0 && c.step === n - 1) { const id = c.id; stopCooking(); openFeedback(id); return; }
    c.step = Math.max(0, Math.min(n - 1, c.step + +d.d)); renderCook();
  },
  timerStart: (d) => { app.cook.timers.push({ label: `${d.m}-minute timer`, end: Date.now() + d.m * 60000 }); renderCook(); },
  timerStop: (d) => { app.cook.timers.splice(+d.i, 1); renderCook(); },
  // settings
  portion: (d) => { const people = clone(settings().people); people[+d.i].portion = Math.max(0.3, Math.round((+people[+d.i].portion + +d.d) * 10) / 10); send({ op: "settings", patch: { people } }); },
  goal: (d) => { const people = clone(settings().people); people[+d.i].goal = Math.max(10, (+people[+d.i].goal || 40) + +d.d); send({ op: "settings", patch: { people } }); },
  babyPortion: (d) => { const b = settings().baby; send({ op: "settings", patch: { baby: { ...b, portion: Math.max(0.05, Math.round((+b.portion + +d.d) * 100) / 100) } } }); },
  addPerson: () => { const people = clone(settings().people); people.push({ id: uid(), name: `Adult ${people.length + 1}`, portion: 1, goal: 40 }); send({ op: "settings", patch: { people } }); },
  removePerson: (d) => { const people = clone(settings().people); people.splice(+d.i, 1); send({ op: "settings", patch: { people } }); },
  avoid: (d) => { const a = new Set(settings().avoid || []); a.has(d.k) ? a.delete(d.k) : a.add(d.k); send({ op: "settings", patch: { avoid: [...a] } }); },
  shopToggle: (d) => {
    const on = new Set(settings().shops || SHOP_ORDER); on.has(d.k) ? on.delete(d.k) : on.add(d.k);
    if (!on.size) return toast("Keep at least one shop");
    send({ op: "settings", patch: { shops: SHOP_ORDER.filter((s) => on.has(s)) } });
  },
  stapleAdd: () => { const staples = clone(settings().staples || []); staples.push({ id: uid(), name: "", amount: "", aisle: "other", shop: enabledShops()[0] || "aldi", on: true }); send({ op: "settings", patch: { staples } }); },
  stapleDel: (d) => { const staples = clone(settings().staples || []); staples.splice(+d.i, 1); send({ op: "settings", patch: { staples } }); },
};

function onClick(e) {
  if (e.target.closest("[data-close]") && !e.target.closest("[data-act]")) { closeSheet(); return; }
  const tab = e.target.closest(".nav button");
  if (tab) { closeSheet(); go(tab.dataset.tab); return; }
  if (!e.target.closest(".menu") && !e.target.closest("[data-act=dayMenu],[data-act=shopMenu]")) closeMenus();
  const el = e.target.closest("[data-act]");
  if (!el || longPressFired) { longPressFired = false; return; }
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  if (el.tagName === "INPUT" && el.type === "checkbox" && app.selecting.size) { e.preventDefault(); toggleSelect(el.dataset.key); return; }
  fn(el.dataset, el, e);
}

function onChange(e) {
  const el = e.target, d = el.dataset, s = settings();
  if (!d.set) return;
  const people = () => clone(s.people), staples = () => clone(s.staples || []);
  switch (d.set) {
    case "personName": { const p = people(); p[+d.i].name = el.value.trim() || p[+d.i].name; return send({ op: "settings", patch: { people: p } }); }
    case "babyInclude": return send({ op: "settings", patch: { baby: { ...s.baby, include: el.checked } } });
    case "baby": return send({ op: "settings", patch: { baby: { ...s.baby, [d.f]: el.value } } });
    case "text": return send({ op: "settings", patch: { [d.f]: el.value } });
    case "num": {
      send({ op: "settings", patch: { [d.f]: +el.value } });
      if (d.f === "weekStartDay") { app.weekStart = iso(weekStartFor(new Date(), +el.value)); render(); }
      return;
    }
    case "bool": return send({ op: "settings", patch: { [d.f]: el.checked } });
    case "theme": { const t = { ...(s.themes || {}) }; if (el.value) t[d.i] = el.value; else delete t[d.i]; return send({ op: "settings", patch: { themes: t } }); }
    case "stapleName": {
      const st = staples(), k = catalogueMatch(el.value), m = k ? ingMeta(k) : null;
      st[+d.i] = { ...st[+d.i], name: el.value.trim(), k: k || null, ...(m ? { aisle: m.a, shop: st[+d.i].shop || m.s } : {}) };
      return send({ op: "settings", patch: { staples: st } });
    }
    case "stapleAmount": { const st = staples(); st[+d.i].amount = el.value; return send({ op: "settings", patch: { staples: st } }); }
    case "staplePrice": { const st = staples(); st[+d.i].price = el.value.trim() === "" ? null : Math.max(0, parseFloat(el.value.replace(/[£,]/g, "")) || 0); return send({ op: "settings", patch: { staples: st } }); }
    case "stapleOn": { const st = staples(); st[+d.i].on = el.checked; return send({ op: "settings", patch: { staples: st } }); }
    case "putDay": if (el.value !== "") { dayUpdate(+el.value, { recipe: d.id, status: "cook", note: null }); closeSheet(); toast(`${app.byId[d.id].name} added`); } return;
    default:
  }
}

function onSubmit(e) {
  const f = e.target.closest("[data-form]");
  if (!f) return;
  e.preventDefault();
  const val = (n) => (f.elements.namedItem(n) || {}).value || "";
  if (f.dataset.form === "skip") { dayUpdate(+f.dataset.i, { status: "skip", note: val("note").trim() || null }); closeSheet(); return; }
  if (f.dataset.form === "price") {
    const price = parseFloat(val("price").replace(/[£,\s]/g, ""));
    if (!(price >= 0)) return toast("Enter a price, like 1.25");
    send({ op: "price", key: f.dataset.k, price, shop: val("shop") }); closeSheet(); toast("Price saved for everyone"); return;
  }
  if (f.dataset.form === "feedback") {
    if (!app.fbRating) return;
    const tags = $$("#sheetBody [data-act=feedbackTag].on").map((b) => b.dataset.t);
    send({ op: "feedback", recipe: f.dataset.id, rating: app.fbRating, tags, note: val("note").trim() }, { rerender: false });
    if (app.fbRating === "loved") send({ op: "pref", recipe: f.dataset.id, patch: { fav: true } }, { rerender: false });
    if (app.fbRating === "never") send({ op: "pref", recipe: f.dataset.id, patch: { ban: true } }, { rerender: false });
    closeSheet(); render();
    toast(app.fbRating === "never" ? "Won't suggest that again. It's under Recipes → Hidden." : "Thanks. Saved.");
    return;
  }
  if (f.dataset.form === "add") {
    const name = val("name").trim(); if (!name) return;
    const shop = val("shop"), k = catalogueMatch(name);
    app.lastShop = shop;
    send({ op: "extra_add", week: currentWeek(), item: { id: uid(), name: k ? ingMeta(k).n : name, amount: val("amount").trim() || null, shop, k, aisle: k ? ingMeta(k).a : "other" } });
    closeSheet(); toast(`Added ${name} (${shopName(shop)})`);
  }
}

let searchTimer;
function onInput(e) {
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

boot().catch((err) => {
  console.error(err);
  $("#view").innerHTML = `<div class="empty"><p class="h2">Something went wrong loading</p><p>${esc(err.message)}</p></div>`;
});
