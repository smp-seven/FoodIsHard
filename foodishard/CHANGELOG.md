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

## 0.8.0
- Online version: households and invites now live in a small database instead of a settings file. Admins invite new households from Settings → Admin; anyone can invite their partner from Settings → Who's in your household. With an optional Cloudflare API token, invites and removals update the sign-in list automatically.
- Online version: rename yourself and your household; admins can delete a household (and its data).
- Home Assistant version: no changes beyond the version number.

## 0.8.1
- Settings → About: what is stored and who can see it (worded for whichever version you run), plus food-safety notes on allergies, vegetarian labels and babies.

## 0.8.2
- Both versions: old shopping lists are deleted after 8 weeks and meal plans after a year, so data stays small and tidy.
- Online version: data is kept in Cloudflare's EU data centres (DATA_REGION, default "eu").

## 0.8.3
- Online version: invite messages mention signing in with Google or an email code. Set-up guide covers adding Google sign-in.

## 0.8.4
- All rights reserved licence. About page links to the privacy policy and terms on foodishard.uk.

## 0.9.0
- Online version: an admin dashboard. Admin emails that aren't in a household open straight to it. It lists everyone by household with join date, last active and who invited them, with search and filters for "never signed in" and "inactive". From it you can create households, add, move and remove people, rename or delete households, re-copy invite messages and re-sync sign-in. Last active is recorded at most once an hour, and the privacy policy says so.
- The FoodIsHard logo is in the app, on the home screen icon and in the browser tab. Adding the app to your home screen opens it full-screen.
- The first tab is now "Today", and Settings (a clearer cog) is at the top of every main screen. Back returns you to where you were.
- New households start with no staples (the test porridge, milk and yoghurt are gone).

## 0.9.1
- Cleaner settings cog.

## 0.9.2
- Baby mode: gentle suggestions as the baby grows, based on their corrected age if a due date is set. It suggests moving on to finger foods (from about 7 months) and chopped family food (from about 10 to 12 months), and a rough baby portion size for their age. Nothing changes until you tap "Yes, change it", and "Not yet" hides a suggestion. Under 6 months it reminds you that most babies start solids around then. A card on Today shows when there's something to review.

## 0.9.3
- "Cooking for little ones": add as many babies and young children as you like, each with their own name, birth date (and due date if early), eating stage and portion. Each child has a colour. Recipes and cooking mode show a coloured note for each child at their own stage, the "take their portions out" step names them all, and each child gets their own salt check for their age. Growing-up suggestions work per child.
- New eating stage, "Family food", for toddlers and older (suggested from about 2 years).
- Existing baby settings carry over automatically as the first child.

## 0.9.4
- Online version: the app opens without signal. The phone keeps a copy of the app, your latest plan and shopping list. Ticks and changes are saved on the phone and sent when you're back online.
- Online version: when your sign-in expires, a banner says so with a "Sign in again" button, instead of "no signal". Changes made meanwhile are kept and sent after you sign in.
- Shopping notes that mention the baby now use your children's names, and are hidden for households without little ones.
- The no-signal badge on the shopping list sits under the heading.
- Home Assistant: no offline copy (by design). Otherwise the same.

## 0.9.5
- Online version: admins get a **Recipe feedback** screen, off the admin dashboard. It shows every household's ratings and notes, newest first or grouped by recipe, with filters, search and a "new" count, plus a button that copies them for Claude without anyone's names.
- The rating sheet and About now say that ratings and notes are visible to whoever runs FoodIsHard. The Home Assistant version is unchanged.
- Online version: the "Copy your feedback" setting is gone, since the admin sees everyone's feedback. Home Assistant keeps it.
