# FoodIsHard

A vegetarian family dinner planner with a shared shopping list, built to run as a
Home Assistant add-on.

- **Week view:** "Plan my week" suggests seven dinners. Swap, lock or mark any night as leftovers or eating out.
- **Recipes:** scaled to everyone's portion sizes, with protein per person and a "take the baby's portion out here" step.
- **Shopping list:** merged from the week's dinners plus weekly staples. Grouped by aisle or by shop, ticks sync between phones, and it exports as a copy/paste list, a .txt download or a printable PDF.
- **Prices:** rough estimates per recipe and per week at your chosen supermarket, plus a rule-of-thumb comparison with the others. Tap any price to correct it.
- **Swaps and budget mode:** fresh → frozen, fresh ginger → ground and so on. Emergency meals for nights you need something in 15 minutes.
- **Food rules:** strictly vegetarian (no gelatine, anchovy or animal rennet), plus allergies and dislikes you set yourself.

## Install on Home Assistant

1. In Home Assistant go to **Settings → Add-ons → Add-on Store**.
2. Open the **⋮** menu (top right), choose **Repositories**, and add:
   `https://github.com/smp-seven/FoodIsHard`
3. Find **FoodIsHard** in the store, click **Install**, then **Start**.
   The first install builds on your device and takes a minute or two.
4. Turn on **Show in sidebar**. "Dinners" then appears in Home Assistant on every
   device and phone, behind your normal HA login, including over Tailscale.

Updates appear as an **Update** button on the add-on page.

Your household details, plans, ticks, prices and settings are stored in the add-on's `/data` folder, so they're
included in Home Assistant backups. Nothing personal is kept in this repository.

## How it's built

- `foodishard/app/server.py`: a single-file Python server (standard library only)
  that serves the app and stores one JSON document.
- `foodishard/app/static/`: the web app (plain HTML, CSS and JavaScript, no build step).
- `foodishard/app/data/recipes.json`: the recipe library. Quantities are per standard
  adult portion, and `{{300|ml}}` in a step is scaled automatically.
- `foodishard/app/data/ingredients.json`: aisle, suggested shop and label warnings
  for every ingredient.

### Run it locally (optional)

```bash
FOODISHARD_DATA=./dev-data PORT=8099 python3 foodishard/app/server.py
# open http://localhost:8099
```

If the server isn't reachable (for example, opening the static files on their own),
the app runs in preview mode and saves to the browser instead.
