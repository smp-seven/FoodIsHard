# FoodIsHard

A vegetarian family dinner planner with a shared shopping list, built to run as a
Home Assistant add-on.

- **Tonight:** the home screen, with tonight's dinner, per-person protein (tap for full nutrition) and what's coming up.
- **Week view:** "Plan my week" suggests seven dinners from meal families, with optional theme nights (Curry night, Fakeaway night, Quick night and about 20 more). Use Another curry, Swap or Skip on any day.
- **Cooking mode:** one step at a time, with timers and the baby's step highlighted.
- **Recipes:** scaled to everyone's portion sizes, with protein per person and a "take the baby's portion out here" step.
- **Shopping list:** merged from the week's dinners plus weekly staples. Grouped by aisle or by shop, ticks sync between phones, and it exports as a copy/paste list, a .txt download or a printable PDF.
- **Prices:** rough estimates per recipe and per week, adjusted for food inflation using the ONS food price index, at your chosen supermarket, plus a rule-of-thumb comparison with the others. Tap any price to correct it.
- **Swaps and budget mode:** fresh → frozen, fresh ginger → ground and so on. Emergency meals for nights you need something in 15 minutes.
- **Private by design:** fonts are bundled and the only outside request is the weekly ONS price index (which you can switch off).
- **Food rules:** strictly vegetarian (no gelatine, anchovy or animal rennet), plus allergies and dislikes you set yourself.

## Install on Home Assistant

(Home Assistant renamed add-ons to **apps** in 2026.2.)

1. Go to **Settings → Apps → Install app** (the app store).
2. Open the **⋮** menu (top right), choose **Repositories**, add
   `https://github.com/smp-seven/FoodIsHard`, then close the dialog.
3. Find **FoodIsHard** in the store (use **⋮ → Check for updates** if it isn't there yet)
   and press **Install**. It builds on your device, which takes a few minutes.
4. Turn on **Start on boot**, **Watchdog** and **Show in sidebar**, then press **Start**.
   **Dinners** appears in the sidebar on every device, behind your normal login.

Updates appear as an **Update** button on the app's page.

Your household details, plans, ticks, prices and settings are stored in the app's
`/data` folder, so they're included in Home Assistant backups. Nothing personal is kept
in this repository.

## Run it online for friends (Cloudflare)

For people without Home Assistant, FoodIsHard can also run on Cloudflare's free plan, with
separate households, email sign-in and in-app invites. See **[CLOUDFLARE.md](CLOUDFLARE.md)** for the steps.

Backups made in **Settings → Your data** move between the Home Assistant and Cloudflare versions.

## How it's built

- `foodishard/app/server.py`: a single-file Python server (standard library only)
  that serves the app and stores one JSON document.
- `foodishard/app/static/`: the web app (plain HTML, CSS and JavaScript, no build step).
- `foodishard/app/data/recipes.json`: the recipe library. Quantities are per standard
  adult portion, and `{{300|ml}}` in a step is scaled automatically.
- `tools/check_recipes.py`: run after editing recipes. It checks every recipe has amounts, known tags and families for the theme nights, a baby step before any seasoning, nutrition data and nothing from the banned list.
- `foodishard/app/data/ingredients.json`: aisle, suggested shop and label warnings
  for every ingredient.

### Run it locally (optional)

```bash
FOODISHARD_ALLOW_ALL=1 FOODISHARD_DATA=./dev-data PORT=8099 python3 foodishard/app/server.py
# open http://localhost:8099
```

If the server isn't reachable (for example, opening the static files on their own),
the app runs in preview mode and saves to the browser instead.

## Licence and safety

**All rights reserved.** This code is public so it can be viewed and installed by its author.
It isn't licensed for use, copying or hosting by anyone else (see [LICENSE](LICENSE)).

It's provided as-is, with no warranty. Recipes, nutrition figures, prices and baby-feeding notes
are general guidance only and haven't been reviewed by a professional. Always check food labels
for allergens, and follow NHS weaning guidance.
