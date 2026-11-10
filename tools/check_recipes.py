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

for w in warnings:
    print("warning:", w)
for e in errors:
    print("ERROR:  ", e)
print(f"\n{len(recipes['recipes'])} recipes checked: {len(errors)} errors, {len(warnings)} warnings")
sys.exit(1 if errors else 0)
