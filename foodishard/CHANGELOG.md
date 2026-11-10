# Changelog

## 0.1.0
- First skeleton: week planner, recipe view with baby steps, shared shopping list with export, settings, and 8 sample recipes.

## 0.2.0
- Price estimates per recipe, per week and per shop, with in-app price updates shared between users.
- Ingredient swaps (fresh → frozen, fresh ginger → ground, etc.) and a budget mode.
- Emergency meals (about 15 minutes, from the freezer and cupboard).
- All main supermarkets: pick a shop for anything you add, or change it for any item.
- Food rules (allergies, dislikes) and household details now live in settings only.

## 0.3.0
- New "Kitchen table" design. Tonight is the home screen, with Week, Shop and Recipes alongside.
- Meal families: "Another curry"-style swaps, theme nights, and recipes grouped by family.
- Skip a day (eating out, at friends'), plus leftovers nights.
- Cooking mode: one step at a time, timers, screen kept on, baby step highlighted.
- Full nutrition per person (and salt for the baby's portion), from ingredient data.
- In-shop mode: tabs per supermarket, press and hold to select items and move them to another shop (remembered), "Done shopping" summary, and ticks that queue up when there's no signal.
- Food inflation tracking from the ONS food price index (weekly check, can be switched off).
- Add or remove grown-ups, protein goals, and a "Cooking for a baby" switch.

## 0.4.0
- Spice rack & cupboard: mark items Got it / Low / Out; low and out items go on the list, and ticking them off restocks them. A starter-rack button adds the basic spices in one go.
- All 13 recipes rewritten: every ingredient has an amount (spices included), shorter steps for confident cooks, and hands-on time shown.
- "How was it?" after cooking, with a "Cooked it" badge and copyable feedback for recipe fixes.
- tools/check_recipes.py checks every recipe against the house standard.
- Fix: changes made in quick succession could be lost while syncing.

## 0.4.1
- Security: the server now refuses any request that does not come through Home Assistant's Ingress proxy.

## 0.4.2
- Fonts (Fraunces and Inter, SIL Open Font License) are now bundled, so the app makes no requests to Google or anywhere else from your phones.

## 0.4.3
- Every pull-up panel has a close (X) button that stays visible as you scroll.
- The phone's Back button now closes panels and cooking mode instead of leaving the page underneath.
- Panels stand out more in dark mode.

## 0.4.4
- Dinners now shows in the sidebar for non-admin users too (panel_admin: false).

## 0.5.0
- Staples and things you add yourself: you set the price for one, plus an optional size (e.g. "1 carton"). No more automatic matching.
- On the shopping list: a − / + counter for buying several (the cost multiplies) and an × to remove an item. Removing a recipe item or staple moves it to "Not needed this week", where you can bring it back.
- A staple that matches a recipe ingredient (like Milk) now covers it instead of appearing twice.

## 0.5.1
- Budget mode only makes like-for-like swaps (frozen veg, garlic paste, bottled lemon and so on) and never changes the ingredient a dish is named after.
- Swapping an ingredient from a recipe now applies to that recipe only. The week card and Tonight show "with firm tofu" (or similar) so it is obvious.

## 0.6.0
- 45 recipes (up from 13): new curries, pasta and gnocchi, burritos, fajitas and tacos, stir-fries, traybakes, pies, soups and stews, risotto and biryani, bowls, naan pizzas and burgers, and brunch-for-dinner. Most use the air fryer or blender where it saves effort.
- Theme nights reworked: 20 themes in a searchable list (Curry night, Fakeaway night, Brunch for dinner, Italian, Quick night, Air fryer night, Cheap & cheerful, Protein-packed, Try something new, Favourites…). Each shows how many dinners fit. Other days avoid a theme's dinners so the theme still feels special.
- "Eggs" family is now "Brunch for dinner" (old settings carry over). New families: Risotto & rice, Bowls & salads.
- The dinner picker has a search box, and dinners that fit the day's theme come first.
- Recipe checker also checks tags and theme rules.

## 0.6.1
- Baked risotto: less water, so it comes out creamy rather than soupy.
- Black bean burgers: more oats, blitzed first, and a 10-minute chill so they hold together.

## 0.7.0
- New: FoodIsHard can also run online on Cloudflare's free plan for friends without Home Assistant. Each household has its own private data and people sign in with their email (see CLOUDFLARE.md).
- New: Settings → Your data: download a backup of everything, or restore one. Backups move between the Home Assistant and online versions.
- The app's data changes now live in one shared file (ops.js) used by both versions.
