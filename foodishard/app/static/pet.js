// A small extra. Everything for it lives in this one file.
// To take it out: delete this file, its <script> line in index.html and "pet.js" in sw.js.
(() => {
  const KEY = "fihPet", HOUR = 3600000;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
  const save = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* fine */ } };
  const clamp = (n) => Math.max(0, Math.min(100, n));
  const RATE = { food: 4, fun: 3, clean: 2 }; // points lost per hour
  // Who might come up when you pull: body shape, colours, and whether there are leaves on top
  const VEG = {
    potato: { name: "Spud", what: "a potato", fill: "#d9a865", line: "#b9854a", body: "M30 40c4-22 30-30 50-24s28 22 24 42-14 38-40 40-40-14-38-30 0-18 4-28z" },
    carrot: { name: "Cara", what: "a carrot", fill: "#ef8a2c", line: "#c96a14", leafy: true, body: "M30 30Q62 16 94 30Q90 60 66 102Q62 108 58 102Q34 60 30 30z" },
    beetroot: { name: "Beetrice", what: "a beetroot", fill: "#a3324f", line: "#7a2238", leafy: true, body: "M62 24c22 0 36 16 36 38s-16 34-32 36l-4 10-4-10c-16-2-32-14-32-36s14-38 36-38z" },
    parsnip: { name: "Nip", what: "a parsnip", fill: "#efe0bb", line: "#c9b17e", leafy: true, body: "M32 30Q62 18 92 30Q88 62 65 104Q62 108 59 104Q36 62 32 30z" },
    radish: { name: "Rad", what: "a radish", fill: "#e0465a", line: "#b02d40", leafy: true, body: "M62 26c20 0 34 14 34 32s-14 30-28 34l-6 14-6-14c-14-4-28-16-28-34s14-32 34-32z" },
  };
  const veg = (p) => VEG[(p && p.kind) || "potato"] || VEG.potato;
  const LEAVES = `<path d="M62 30c-2-10-10-18-20-20 2 10 10 18 20 20zM62 30c0-12 2-20 6-26 4 8 2 18-6 26zM62 30c4-10 12-16 22-16-4 10-12 16-22 16z" fill="#6fae63" stroke="#4f8a4f" stroke-width="1.5"/>`;

  function tick(p) { // catch up on the time away
    const now = Date.now(), hrs = (now - p.at) / HOUR;
    if (p.stage === "pet") {
      // when everything ran out (worked out, so it's right even after weeks away); two days after that, Spud leaves
      const emptyAt = p.emptyAt || p.at + Math.max(...Object.keys(RATE).map((k) => p[k] / RATE[k])) * HOUR;
      for (const k in RATE) p[k] = clamp(p[k] - RATE[k] * hrs);
      if (p.food + p.fun + p.clean === 0) { p.emptyAt = emptyAt; if (now - emptyAt > 48 * HOUR) p.stage = "gone"; }
      else p.emptyAt = 0;
    }
    p.at = now; return p;
  }
  const asleep = () => { const h = new Date().getHours(); return h >= 22 || h < 7; };
  const mood = (p) => { const m = Math.min(p.food, p.fun, p.clean); return m > 55 ? "happy" : m > 20 ? "ok" : "sad"; };

  function spud(p, anim) {
    const sleeping = asleep(), m = mood(p), v = veg(p);
    const eyes = sleeping ? `<path d="M44 52q6 4 12 0M68 52q6 4 12 0" stroke="#3b2a1a" stroke-width="3" fill="none" stroke-linecap="round"/>`
      : `<circle cx="50" cy="52" r="5" fill="#3b2a1a"/><circle cx="74" cy="52" r="5" fill="#3b2a1a"/><circle cx="52" cy="50" r="1.6" fill="#fff"/><circle cx="76" cy="50" r="1.6" fill="#fff"/>`;
    const mouth = sleeping ? `<circle cx="62" cy="68" r="3" fill="#3b2a1a"/>`
      : m === "happy" ? `<path d="M52 64q10 10 20 0" stroke="#3b2a1a" stroke-width="3" fill="none" stroke-linecap="round"/>`
      : m === "ok" ? `<path d="M54 67h16" stroke="#3b2a1a" stroke-width="3" stroke-linecap="round"/>`
      : `<path d="M52 71q10 -8 20 0" stroke="#3b2a1a" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    const dirt = p.clean < 40 ? `<circle cx="38" cy="74" r="3" fill="#7a5a3a" opacity=".6"/><circle cx="84" cy="40" r="2.5" fill="#7a5a3a" opacity=".6"/><circle cx="80" cy="80" r="2" fill="#7a5a3a" opacity=".6"/>` : "";
    return `<div class="pet-spud ${anim || ""} ${sleeping ? "zzz" : ""}"><svg viewBox="0 0 124 110" width="150" height="133" aria-hidden="true">
      <ellipse cx="62" cy="104" rx="34" ry="5" fill="rgba(0,0,0,.12)"/>
      ${v.leafy ? LEAVES : ""}<path d="${v.body}" fill="${v.fill}" stroke="${v.line}" stroke-width="2"/>
      ${p.kind && p.kind !== "potato" ? `<path d="M44 80q6 2 10 0M70 84q5 2 9 0" stroke="${v.line}" stroke-width="1.5" fill="none" opacity=".7"/>` : `<circle cx="44" cy="34" r="2" fill="${v.line}"/><circle cx="90" cy="66" r="2" fill="${v.line}"/><circle cx="70" cy="88" r="1.6" fill="${v.line}"/>`}
      ${m === "happy" && !sleeping ? `<circle cx="42" cy="62" r="5" fill="#f08a7a" opacity=".5"/><circle cx="82" cy="62" r="5" fill="#f08a7a" opacity=".5"/>` : ""}
      ${eyes}${mouth}${dirt}</svg></div>`;
  }
  // Before the pet: a plant in a mound of soil. Each tug pulls it up a little more.
  const egg = (pulls, kind) => { const up = pulls * 7, v = VEG[kind] || VEG.potato; return `<div class="pet-spud egg ${pulls ? "tug" : ""}"><svg viewBox="0 0 124 110" width="150" height="133" aria-hidden="true">
      <g transform="translate(0 ${-up})">
        <path d="M62 86V44" stroke="#4f8a4f" stroke-width="4" stroke-linecap="round"/>
        <path d="M62 62c-14-2-22-12-22-22 12 0 20 8 22 22zM62 54c12-2 20-12 20-24-12 2-19 10-20 24zM62 46c-8-6-10-14-6-22 7 4 9 12 6 22z" fill="#6fae63" stroke="#4f8a4f" stroke-width="1.5"/>
        ${pulls > 1 ? `<path d="M48 96c0-8 6-12 14-12s14 4 14 12-6 12-14 12-14-4-14-12z" fill="${v.fill}" stroke="${v.line}" stroke-width="2"/>` : ""}
      </g>
      <path d="M14 104c8-18 28-24 48-24s40 6 48 24z" fill="#7a5a3a"/>
      <circle cx="36" cy="96" r="2" fill="#5e4329"/><circle cx="84" cy="94" r="2.4" fill="#5e4329"/><circle cx="62" cy="100" r="1.8" fill="#5e4329"/></svg></div>`; };

  const bar = (label, v) => `<div class="pet-bar"><span>${label}</span><i><b style="width:${Math.round(v)}%;background:${v > 55 ? "#5b9a6b" : v > 20 ? "#e0a93b" : "#d4573b"}"></b></i></div>`;
  const ageText = (p) => { const d = Math.floor((Date.now() - p.born) / (24 * HOUR)); return d < 1 ? "Brand new" : `${d} day${d === 1 ? "" : "s"} old`; };
  function tonight() {
    try { const days = planFor(app.weekStart), i = (new Date().getDay() + 6) % 7, r = days[i] && app.byId[days[i].recipe]; return r ? r.name.toLowerCase() : ""; } catch { return ""; }
  }

  let say = "", anim = "", replant = false;
  function draw() {
    const box = document.querySelector("#petBox"); if (!box) return;
    const p = tick(load() || { stage: "egg", cracks: 0, at: Date.now() }); save(p);
    let body;
    if (p.stage === "egg") body = `${egg(p.cracks, p.kind)}<p class="pet-say">${say || "Something's growing here. Give it a pull?"}</p>`;
    else if (p.stage === "gone") body = `<div class="pet-note">Dear you,<br>Nobody fed me for ages so I've gone to stay with my nan. She does a lovely roast. Don't worry about me.<br>— ${p.name} x</div>
      <div class="pet-btns"><button class="btn" data-pet="restart">Find a new egg</button></div>`;
    else {
      const sleeping = asleep();
      body = `${spud(p, anim)}<p class="pet-name"><b>${p.name}</b> · <span class="muted">${ageText(p)}</span></p>
        <p class="pet-say">${say || (sleeping ? "Zzz… (it's bedtime)" : mood(p) === "happy" ? "Living its best life." : mood(p) === "ok" ? "Doing alright." : "Looking a bit sorry for itself.")}</p>
        ${bar("Fed", p.food)}${bar("Fun", p.fun)}${bar("Clean", p.clean)}
        ${replant ? `<div class="pet-btns"><button class="btn sm" data-pet="keep">No, keep him</button><button class="btn sm primary" data-pet="restart">Yes, replant</button></div>`
          : `<div class="pet-btns"><button class="btn sm" data-pet="feed">Feed</button><button class="btn sm" data-pet="play">Play</button><button class="btn sm" data-pet="wash">Wash</button></div>`}`;
    }
    box.querySelector(".pet-body").innerHTML = body; anim = ""; say = "";
  }
  function act(what) {
    const p = tick(load()); if (!p) return;
    if (what === "egg" && p.stage === "egg") {
      p.cracks++;
      if (!p.kind) { const ks = Object.keys(VEG); p.kind = ks[Math.floor(Math.random() * ks.length)]; } // decided on the first pull
      if (p.cracks >= 3) { const v = veg(p); Object.assign(p, { stage: "pet", name: v.name, born: Date.now(), food: 70, fun: 70, clean: 90 }); say = `Pop! It's ${v.what}! Say hello to ${v.name}.`; anim = "pop"; }
      else say = p.cracks === 1 ? "It's stuck fast. Pull harder!" : "Nearly… one more!";
    } else if (what === "restart") { replant = false; save({ stage: "egg", cracks: 0, mini: p.mini, at: Date.now() }); return draw(); }
    else if (what === "keep") { replant = false; say = "Phew."; }
    else if (what === "replant") { replant = true; say = `Put ${p.name} back in the ground and start again?`; }
    else if (p.stage === "pet" && asleep() && what !== "egg") { say = `Shh, ${p.name}'s asleep.`; }
    else if (what === "feed") {
      if (p.food > 90) say = `${p.name}'s stuffed. No more, thanks.`; else { const t = tonight(); p.food = clamp(p.food + 30); say = t ? `${p.name} had a little bit of ${t}. Nom.` : "Nom nom."; anim = "chomp"; }
    } else if (what === "play") { p.fun = clamp(p.fun + 25); p.food = clamp(p.food - 5); p.clean = clamp(p.clean - 5); say = "Wheee!"; anim = "bounce"; }
    else if (what === "wash") { p.clean = 100; say = `Squeaky clean (for ${veg(p).what}).`; anim = "wash"; }
    save(p); draw();
  }
  // Shrunk: a tiny pixel veg sits in the bottom-right corner (remembered on this phone); tap it to open Spud again
  const PIX = ["..XXXX..", ".XXXXXX.", "XXOXXOXX", "XXXXXXXX", "XXRXXRXX", ".XXMMXX.", "..XXXX.."];
  function setMini(on) {
    const p = load(); if (p) { p.mini = on; save(p); }
    const old = document.querySelector("#petMini"); if (old) old.remove();
    if (!on) return;
    css();
    const v = veg(p), rows = v.leafy ? [".G.G.G..", ...PIX.slice(1)] : PIX;
    const col = { X: v.fill, O: "#3b2a1a", R: "#f08a7a", M: "#3b2a1a", G: "#4f8a4f" };
    const px = rows.flatMap((row, y) => [...row].map((c, x) => c === "." ? "" : `<rect x="${x}" y="${y}" width="1" height="1" fill="${col[c]}"/>`)).join("");
    document.body.insertAdjacentHTML("beforeend", `<button id="petMini" aria-label="${p ? p.name : "Pet"}"><svg viewBox="0 0 8 7" width="32" height="28" shape-rendering="crispEdges">${px}</svg></button>`);
    document.querySelector("#petMini").addEventListener("click", (e) => { e.stopPropagation(); e.currentTarget.remove(); open(); });
  }
  function css() {
    if (document.querySelector("#petCss")) return;
    document.head.insertAdjacentHTML("beforeend", `<style id="petCss">
      #petBox{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);animation:petFade .2s}
      #petBox .pet-card{position:relative;width:min(320px,90vw);background:var(--surface,#fff);border:1px solid var(--line,#ddd);border-radius:22px;padding:18px 18px 16px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.25);animation:petPop .3s cubic-bezier(.34,1.56,.64,1)}
      #petBox .pet-x{position:absolute;z-index:1;top:8px;right:10px;background:none;border:0;font-size:22px;line-height:1;color:inherit;cursor:pointer}
      .pet-spud{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;display:inline-block;animation:petBob 2.4s ease-in-out infinite;cursor:pointer}
      .pet-spud.zzz{animation-duration:5s}.pet-spud.zzz::after{content:"z z z";position:absolute;margin:-10px 0 0 -10px;font-size:13px;opacity:.6}
      .pet-spud.tug{animation:petTug .45s}.pet-spud.pop{animation:petPop .5s cubic-bezier(.34,1.56,.64,1)}
      .pet-spud.bounce{animation:petBounce .45s 3}.pet-spud.chomp{animation:petChomp .25s 4}.pet-spud.wash{animation:petWobble .4s 2}
      .pet-name{margin:4px 0 0}.pet-say{min-height:2.6em;margin:6px 0 10px;font-size:14px}
      .pet-bar{display:flex;align-items:center;gap:8px;font-size:12px;margin:4px 0}.pet-bar span{width:42px;text-align:left}
      .pet-bar i{flex:1;height:8px;border-radius:5px;background:rgba(127,127,127,.2);overflow:hidden}.pet-bar b{display:block;height:100%;border-radius:5px;transition:width .4s}
      .pet-btns{display:flex;gap:8px;justify-content:center;margin-top:12px}
      .pet-note{margin-top:18px;font-family:cursive,serif;text-align:left;background:#fffbe8;color:#3b2a1a;border-radius:10px;padding:14px;transform:rotate(-1.5deg);line-height:1.5}
      @keyframes petFade{from{opacity:0}}@keyframes petPop{from{transform:scale(.4);opacity:0}}
      @keyframes petTug{30%{transform:translateY(-8px) scaleY(1.08)}60%{transform:translateY(2px) scaleY(.96)}}@keyframes petBob{50%{transform:translateY(-5px)}}@keyframes petBounce{40%{transform:translateY(-22px) scaleY(1.05)}80%{transform:translateY(0) scaleY(.92)}}
      @keyframes petChomp{50%{transform:scale(1.06,.94)}}@keyframes petWobble{25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}}
      body.has-dock #petMini{bottom:calc(var(--nav-h,70px) + 84px + env(safe-area-inset-bottom))}
      body.has-bubble #petMini{bottom:calc(var(--nav-h,70px) + 54px + env(safe-area-inset-bottom))}
      body.has-bubble.has-dock #petMini{bottom:calc(var(--nav-h,70px) + 124px + env(safe-area-inset-bottom))}
      #petBox .pet-close{position:absolute;z-index:1;top:10px;left:12px;background:none;border:0;font:inherit;font-size:14px;color:var(--muted,#888);cursor:pointer;padding:4px}
      #petMini{position:fixed;right:11px;bottom:calc(var(--nav-h,70px) + 14px + env(safe-area-inset-bottom));z-index:15;background:none;border:0;padding:4px;cursor:pointer;animation:petBob 2.4s ease-in-out infinite;filter:drop-shadow(0 2px 2px rgba(0,0,0,.25))}
      @media (prefers-reduced-motion:reduce){.pet-spud,#petBox,#petBox .pet-card{animation:none!important}}</style>`);
  }
  function open() {
    if (document.querySelector("#petBox")) return;
    css();
    document.body.insertAdjacentHTML("beforeend", `<div id="petBox" role="dialog" aria-label="Pet"><div class="pet-card"><button class="pet-close" data-pet="close">Close</button><button class="pet-x" data-pet="min" aria-label="Shrink to the corner">–</button><div class="pet-body"></div></div></div>`);
    const box = document.querySelector("#petBox");
    box.addEventListener("click", (e) => {
      e.stopPropagation();
      const b = e.target.closest("[data-pet]");
      if (b && b.dataset.pet === "close") { setMini(false); return box.remove(); }
      if (b && b.dataset.pet === "min") { box.remove(); return setMini(true); }
      if (b) return act(b.dataset.pet);
      if (e.target.closest(".pet-spud.egg")) return act("egg");
      if (e.target.closest(".pet-spud") && !replant) { say = ["Hello!", "Hehe, that tickles.", `I'm ${veg(load()).what}.`, "Is it dinner yet?"][Math.floor(Math.random() * 4)]; anim = "bounce"; draw(); }
    });
    // press and hold Spud for 1.5 seconds to put him back in the ground
    let holdT = 0;
    box.addEventListener("pointerdown", (e) => { if (e.target.closest(".pet-spud:not(.egg)")) holdT = setTimeout(() => { holdT = 0; act("replant"); }, 1500); });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) box.addEventListener(ev, () => { clearTimeout(holdT); holdT = 0; });
    draw();
  }
  if ((load() || {}).mini) setMini(true); // still in the corner from last time

  // The way in: tap the version number at the bottom of Settings seven times, quickly.
  let taps = [];
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".fih-ver")) return;
    const now = Date.now(); taps = taps.filter((t) => now - t < 3000); taps.push(now);
    if (taps.length >= 7) { taps = []; open(); }
  }, true);
})();
