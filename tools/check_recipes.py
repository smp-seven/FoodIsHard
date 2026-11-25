#!/usr/bin/env python3
"""Check recipes.json against the FoodIsHard recipe standard.

Run from the repo root:  python3 tools/check_recipes.py
Exits non-zero if any recipe breaks a rule. Warnings don't fail the check.
"""
import json
import re
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "foodishard" / "app" / "data"
recipes = json.loads((DATA / "recipes.json").read_text())
items = json.loads((DATA / "ingredients.json").read_text())["items"]
families = {f["id"] for f in recipes["families"]}

TO_TASTE = {"salt", "pepper"}
BANNED = ["parmesan", "grana padano", "worcestershire", "gelatine", "gelatin", "anchov", "fish sauce",
          "honey", "chicken", "beef", "pork", "bacon", "lard", "suet", "coconut"]
SEASONING = re.compile(r"\b(salt|chilli|soy|stock|henderson|feta|halloumi)\b", re.I)
STAGES = ("smooth", "finger", "chopped")
UNITS = {"g", "ml", "tin", "tbsp", "tsp", "slices", ""}
TAGS = {"airfryer", "blender", "oven", "onepot", "comfort", "fakeaway", "pizza", "burger"}

errors, warnings = [], []
seen = set()



# ---- Recipe versions -------------------------------------------------------------------------------------------
# A step can carry full alternative wording per condition ({"t": ..., "if": {"noMilk": ..., "noAirFryer+noMilk": ...}}),
# the recipe can override name/blurb/time per condition (r["if"]), and little-ones' notes per stage (r["babyIf"]).
# The app shows, for each piece, the most specific version whose conditions are all on. Here we build EVERY
# combination and check: no ambiguity, nothing the household can't use left in the words, one baby step.
CONDITIONS = {
    "noMilk": re.compile(r"\b(cheese|cheesy|cheddar|yoghurt|yogurt|butter|milk|paneer|ricotta|feta|halloumi|mozzarella|naan|creamy|cream|ghee|dairy|toastie|toasties)\b", re.I),
    "noAirFryer": re.compile(r"\bair[- ]?fr(y|ier|yer|ied|ying)", re.I),
    "noMicrowave": re.compile(r"microwav", re.I),
    "noBlender": re.compile(r"\bblend|\bblender|food processor", re.I),
}
ALLOWED = {"noMilk": re.compile(r"dairy-free yoghurt|their usual breast milk or formula|peanut butter", re.I)}
NEEDS = {"airFryer": "noAirFryer", "microwave": "noMicrowave", "blender": "noBlender"}  # r["needs"]: hidden without it
# Conditions the app lets households switch on. A condition is only enforced once it's listed here.
ENFORCED = ["noMilk"]

def pick(variants, on, base, where, err, r):
    best, size, tie = base, 0, []
    for key, text in (variants or {}).items():
        conds = set(key.split("+"))
        if conds <= on:
            if len(conds) > size: best, size, tie = text, len(conds), [key]
            elif len(conds) == size: tie.append(key)
    if len(tie) > 1:
        err(r, f"{where}: with {'+'.join(sorted(on))} on, both {tie[0]!r} and {tie[1]!r} apply. Write a combined '{'+'.join(sorted(set(tie[0].split('+')) | set(tie[1].split('+'))))}' version")
    return best

def check_versions(r, items, err):
    keys = set()
    for s_ in r.get("steps", []): keys |= set((s_.get("if") or {}).keys())
    keys |= set((r.get("if") or {}).keys())
    for v in (r.get("babyIf") or {}).values(): keys |= set(v.keys())
    for key in keys:
        parts = key.split("+")
        if any(c not in CONDITIONS for c in parts): err(r, f"unknown condition in {key!r}")
        if parts != sorted(parts): err(r, f"write {key!r} with its conditions in A-Z order: {'+'.join(sorted(parts))!r}")
    milky = [i for i in r.get("ingredients", []) if "milk" in (items.get(i["k"], {}).get("al") or []) and not i.get("optional")]
    adaptable = bool(milky) and all("milk" in (i.get("alt") or {}) for i in milky)
    if any("milk" in (i.get("alt") or {}) for i in milky) and not adaptable:
        for i in milky:
            if "milk" not in (i.get("alt") or {}): err(r, f"{i['k']} contains milk but has no dairy-free swap or 'omit'")
    for n in r.get("needs", []):
        if n not in NEEDS: err(r, f"needs: unknown appliance {n!r}")
    # conditions that can actually apply to this recipe (if it's hidden under a condition, there's nothing to check)
    relevant = [c for c in ENFORCED if not (c == "noMilk" and milky and not adaptable)
                and not any(NEEDS.get(n) == c for n in r.get("needs", []))]
    from itertools import combinations
    for size in range(1, len(relevant) + 1):
        for combo in combinations(relevant, size):
            on = set(combo)
            top = pick(r.get("if"), on, {}, "name/blurb", err, r)
            words = [("name", top.get("name") or r["name"]), ("blurb", top.get("blurb") or r.get("blurb", ""))]
            babies = 0
            for n_, s_ in enumerate(r.get("steps", []), 1):
                t = pick(s_.get("if"), on, s_["t"], f"step {n_}", err, r)
                if t.strip():
                    words.append((f"step {n_}", t)); babies += bool(s_.get("baby"))
            for stage, note in (r.get("baby") or {}).items():
                words.append((f"little ones ({stage})", pick((r.get("babyIf") or {}).get(stage), on, note, f"little ones ({stage})", err, r)))
            if babies != 1: err(r, f"with {'+'.join(sorted(on))} on there are {babies} baby steps, not 1")
            for c in on:
                for where, t in words:
                    clean = ALLOWED[c].sub("", t) if c in ALLOWED else t
                    if hit := CONDITIONS[c].search(clean):
                        err(r, f"with {'+'.join(sorted(on))} on, {where} still says {hit.group(0)!r}: {t[:70]!r}")

def err(r, msg):
    errors.append(f"{r.get('id', '?')}: {msg}")


def warn(r, msg):
    warnings.append(f"{r.get('id', '?')}: {msg}")


for r in recipes["recipes"]:
    for field in ("id", "name", "blurb", "time", "hands", "family", "ingredients", "steps", "baby"):
        if field not in r:
            err(r, f"missing field '{field}'")
    if r.get("id") in seen:
        err(r, "duplicate id")
    seen.add(r.get("id"))
    if r.get("family") not in families:
        err(r, f"unknown family {r.get('family')!r}")
    for t in r.get("tags", []):
        if t not in TAGS:
            err(r, f"unknown tag {t!r} (known: {', '.join(sorted(TAGS))})")
    if r.get("hands", 0) > r.get("time", 0):
        err(r, "hands-on time is longer than total time")
    if r.get("emergency") and r.get("time", 99) > 15:
        err(r, "emergency meals must take 15 minutes or less")
    if not r.get("emergency") and r.get("hands", 0) > 20:
        warn(r, f"{r['hands']} minutes hands-on is a lot for a weeknight")

    text = " ".join(s["t"] for s in r.get("steps", [])) + " " + r.get("name", "") + " " + r.get("blurb", "")
    low = re.sub(r"\bno\b[^.]{0,25}coconut", "", text.lower())
    for word in BANNED:
        if word in low:
            err(r, f"mentions banned ingredient '{word}'")

    protein = 0.0
    for ing in r.get("ingredients", []):
        k = ing.get("k")
        m = items.get(k)
        if not m:
            err(r, f"unknown ingredient {k!r}")
            continue
        if ing.get("q") is None and k not in TO_TASTE:
            err(r, f"{k} has no quantity (only salt and pepper may be 'to taste')")
        u = ing.get("u", m.get("u", ""))
        if u not in UNITS:
            err(r, f"{k} has an unknown unit {u!r}")
        if m.get("u") == "tin" and ing.get("q") is not None and ing.get("u") != "tin":
            err(r, f"{k} should be measured in tins")
        if m.get("c") and ing.get("q") is not None and u not in ("tsp", "tbsp", "") and k not in ("stock",):
            warn(r, f"cupboard item {k} measured in {u!r}")
        if not m.get("c") and "nu" not in m:
            err(r, f"{k} has no nutrition data")
        # allergy versions: alt: { allergen: "omit" | key | {k, q, u} | [options in order of preference] }
        allergens = json.loads((DATA / "ingredients.json").read_text())["allergens"]
        for a, opts in (ing.get("alt") or {}).items():
            if a not in allergens:
                err(r, f"{k} alt: unknown allergen {a!r}")
            elif a not in (m.get("al") or []):
                err(r, f"{k} alt for {a!r}, but {k} doesn't contain {a}")
            for v in (opts if isinstance(opts, list) else [opts]):
                if v == "omit":
                    continue
                tk = v.get("k") if isinstance(v, dict) else v
                t = items.get(tk)
                if not t:
                    err(r, f"{k} alt: unknown ingredient {tk!r}")
                elif a in (t.get("al") or []):
                    err(r, f"{k} alt: the swap {tk} still contains {a}")
                elif isinstance(v, dict) and v.get("u", "") not in UNITS:
                    err(r, f"{k} alt: unknown unit {v.get('u')!r}")
        if ing.get("q") is not None and "nu" in m:
            g = ing["q"] if u in ("g", "ml") else ing["q"] * m.get("g", 0)
            protein += g / 100 * m["nu"][1]
        words = [w.rstrip("s")[:5] for w in re.split(r"[^a-z]+", m["n"].lower().split(" (")[0]) if len(w) > 3]
        if not m.get("c") and words and not any(w in low for w in words + ["chees" if "chees" in m["n"].lower() or "cheddar" in m["n"].lower() else "~"]):
            warn(r, f"'{m['n']}' isn't mentioned in the steps")
    if protein < 25:
        warn(r, f"only about {protein:.0f} g protein per standard portion")

    steps = r.get("steps", [])
    baby_idx = [i for i, s in enumerate(steps) if s.get("baby")]
    if len(baby_idx) != 1:
        err(r, f"needs exactly one baby step (has {len(baby_idx)})")
    else:
        b = baby_idx[0]
        for i, s in enumerate(steps[:b]):
            m = SEASONING.search(s["t"])
            if m and "before" not in s["t"].lower():
                err(r, f"step {i + 1} adds '{m.group(0)}' before the baby's portion comes out")
    # Households without children never see the baby step, so it must hold nothing anyone else needs:
    # every sentence in it is about the baby. Baby-only asides elsewhere go in [[double brackets]].
    for s in steps:
        if s.get("baby"):
            for sentence in re.split(r"(?<=[.!?])\s+", s["t"].strip()):
                if sentence and "baby" not in sentence.lower():
                    err(r, f"baby step has a sentence everyone needs (it's hidden without children): {sentence[:60]!r}")
        for aside in re.findall(r"\[\[(.*?)\]\]", s["t"]):
            if "baby" not in aside.lower():
                err(r, f"[[...]] is for baby-only text, but this doesn't mention the baby: {aside[:50]!r}")
    if r.get("grainsMixed") and not any(i.get("k") in ("rice", "rice_pouch", "arborio", "couscous") for i in r.get("ingredients", [])):
        err(r, "grainsMixed is set but there's no rice or couscous in it")
    # recipe versions ("if"): build every combination of the conditions this recipe can meet and check each one
    check_versions(r, items, err)
    for stage in STAGES:
        if not r.get("baby", {}).get(stage):
            err(r, f"missing baby note for stage '{stage}'")
    for i, s in enumerate(steps):
        if len(s["t"]) > 320:
            warn(r, f"step {i + 1} is long ({len(s['t'])} characters)")

# Coconut (and anything made from it) must be tagged, so a household avoiding it is warned.
for k, m in items.items():
    words = f"{m.get('n', '')} {m.get('note', '')}".lower()
    if "coconut" in words and "coconut" not in (m.get("al") or []) + (m.get("mc") or []):
        errors.append(f"ingredient {k}: mentions coconut but isn't tagged with it (al or mc)")

# Theme nights: every rule must point at something real, and category themes need enough dinners.
cuisines = {r.get("cuisine") for r in recipes["recipes"]}
for t in recipes.get("themes", []):
    m = t.get("match", {})
    for f in m.get("families", []):
        if f not in families:
            errors.append(f"theme {t['id']}: unknown family {f!r}")
    for c in m.get("cuisines", []):
        if c not in cuisines:
            warnings.append(f"theme {t['id']}: no recipes have cuisine {c!r}")
    for tg in m.get("tags", []):
        if tg not in TAGS:
            errors.append(f"theme {t['id']}: unknown tag {tg!r}")
    cats = m.get("families", []) + m.get("tags", []) + m.get("cuisines", [])
    if cats:
        n = sum(1 for r in recipes["recipes"] if not r.get("emergency") and (r["family"] in m.get("families", []) or r.get("cuisine") in m.get("cuisines", []) or set(r.get("tags", [])) & set(m.get("tags", []))))
        if n < 3:
            warnings.append(f"theme {t['id']}: only {n} dinners fit, so it will repeat a lot")

# Quick leftover lunches (lunches.json): every ingredient real, every template sensible and safe.
lunch_file = DATA / "lunches.json"
if lunch_file.exists():
    L = json.loads(lunch_file.read_text())
    all_items = json.loads((DATA / "ingredients.json").read_text())["items"]
    use, seen = L.get("use", {}), set()
    for k, u in use.items():
        if k not in all_items:
            errors.append(f"lunches: unknown ingredient {k!r} in use")
        if not u.get("name") or not u.get("how"):
            errors.append(f"lunches: {k!r} needs a name and a how")
    if "beansprouts" in use and "cooked" not in use["beansprouts"]["how"].lower():
        errors.append("lunches: beansprouts must always be cooked (say so in how)")
    for l in L.get("lunches", []):
        lid = l.get("id", "?")
        if lid in seen:
            errors.append(f"lunch {lid}: duplicate id")
        seen.add(lid)
        if "{main}" not in l.get("name", "").lower() and not l.get("selfName"):
            errors.append(f"lunch {lid}: name must include {{Main}} or {{main}}")
        for b in l.get("base", []):
            m = all_items.get(b.get("k"))
            if not m:
                errors.append(f"lunch {lid}: unknown base ingredient {b.get('k')!r}")
            elif (m.get("pk") or [0, ""])[1] != (b.get("u") or "") and not (b.get("u") == "slices" and (m.get("pk") or [0, ""])[1] == "slices"):
                errors.append(f"lunch {lid}: base {b['k']} unit {b.get('u')!r} doesn't match its pack unit")
        for k in l.get("takes", []):
            if k not in use:
                errors.append(f"lunch {lid}: takes {k!r}, which has no entry in use")
        for k in l.get("needsOne", []):
            if k not in l.get("takes", []):
                errors.append(f"lunch {lid}: needsOne {k!r} isn't in takes")
        steps = l.get("steps", [])
        if not steps or steps[0] != "{prep}":
            errors.append(f"lunch {lid}: the first step must be {{prep}}")
        if not isinstance(l.get("minutes"), int) or not 1 <= l["minutes"] <= 30:
            errors.append(f"lunch {lid}: minutes should be 1 to 30")

# Perishables (GOES_OFF in core.js) must say how long they keep once opened, so leftovers and lunches stay safe.
import re as _re
core_js = (ROOT / "foodishard/app/static/core.js").read_text() if (ROOT := DATA.parents[2]) else ""
m_go = _re.search(r"const GOES_OFF = new Set\(\[(.*?)\]\)", core_js, _re.S)
for k in (_re.findall(r'"(\w+)"', m_go.group(1)) if m_go else []):
    it = items.get(k)
    if not it:
        errors.append(f"GOES_OFF: unknown ingredient {k!r}")
    elif not isinstance(it.get("ko"), int) or not 1 <= it["ko"] <= 14:
        errors.append(f"{k}: needs ko (days it keeps once opened, 1 to 14)")
    elif "fz" in it and it["fz"] is not True:
        errors.append(f"{k}: fz should be true or left out")

for w in warnings:
    print("warning:", w)
for e in errors:
    print("ERROR:  ", e)
print(f"\n{len(recipes['recipes'])} recipes checked: {len(errors)} errors, {len(warnings)} warnings")
sys.exit(1 if errors else 0)
