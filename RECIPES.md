# Writing recipes

Recipes live in `foodishard/app/data/recipes.json`, and ingredients in `ingredients.json`. After any change, run:

```
python3 tools/check_recipes.py
```

It must say `0 errors`. The checker is the safety net, so don't work around it. If it complains, the recipe needs fixing.

## Versions of a recipe ("if")

Households differ: some avoid milk, and some have no air fryer. A recipe has **one** set of steps, and the few steps that differ carry complete alternative wording. The app shows each household one version, and the cook never sees the alternatives.

```json
{ "t": "Air fry the halloumi at 200°C for 8 minutes until golden.",
  "if": {
    "noAirFryer": "Roast the halloumi on a lined tray at 220°C for 12 to 15 minutes until golden.",
    "noMilk": "Air fry the tofu at 200°C for 8 minutes until golden.",
    "noAirFryer+noMilk": "Roast the tofu on a lined tray at 220°C for 15 minutes until golden."
  } }
```

- **Conditions:** `noMilk` (a milk allergy, or the Vegan switch), `noAirFryer`, `noMicrowave` and `noBlender`.
- **Combinations:** for each step, the app uses the most specific version whose conditions are all switched on. If two conditions both change a step, write the combined version, with its conditions in A–Z order joined by `+`. The checker will tell you when one is missing.
- **An empty string `""` leaves the step out** in that version.
- **Write every version as a whole, natural sentence.** Never write "if you don't have…".
- **The recipe's name, blurb and time:** use `"if": { "noMilk": { "name": "…", "blurb": "…", "time": 40 } }` on the recipe itself.
- **Little-ones' notes:** use `"babyIf": { "smooth": { "noBlender": "…" } }`.
- **Appliances with no sensible alternative:** add `"needs": ["airFryer"]` to the recipe. It's hidden for households without one.

## Allergy swaps for ingredients ("alt")

A recipe ingredient can say what happens when a household avoids an allergen it contains:

```json
{ "k": "greek_yoghurt", "q": 30, "u": "g", "alt": { "milk": ["soya_yoghurt", "oat_yoghurt", "df_yoghurt"] } }
```

- `"omit"` leaves the ingredient out.
- An ingredient key swaps it like-for-like.
- `{ "k": "oil", "q": 1, "u": "tbsp" }` swaps it with a new amount.
- **A list gives options in order of preference.** The app uses the first one that clears all of the household's allergies.
- Every swap is checked against all of the household's allergies, like any other ingredient.

## What the checker proves

For every recipe, it builds **every combination** of the conditions that can apply and checks four things:
- each step has exactly one version, with no ambiguity;
- nothing the household can't use is left in the name, blurb, steps or little-ones' notes, such as dairy words for `noMilk` or "air fryer" for `noAirFryer`;
- there's exactly one baby step;
- every milk ingredient in a recipe that adapts for milk has a swap or `"omit"`.
