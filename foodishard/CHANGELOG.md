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

## 0.9.6
- Online version: **Sign out** in Settings → Your account and on the admin dashboard. It clears this device's copy, so the next person can't see it offline, then ends the sign-in.
- Online version: **Delete my account** in Settings → Your account. It removes you and your email from the sign-in list, and takes your name off the household's past ticks and notes. If you're the last person in the household, it deletes the household and all its data too, with an offer to download a backup first.
- About and the privacy policy explain both. Home Assistant is unchanged.
- Setting a spice to Got it, Low or Out, or tapping Favourite or Never again on a recipe, no longer jumps back to the top of the panel. (Both versions.)

## 0.9.7
- Every recipe's method has been rewritten for people who don't cook much. Each starts with a **Get ready** step for the chopping, draining and slicing, and each cooking step says which pan, what heat, how long and what "done" looks like. Nothing is used before it has been prepared, for example the halved tomatoes in the halloumi couscous. Long steps are split up.
- Cooking mode offers a timer for a step's longest wait ("stir for 1 minute, then simmer for 20" offers 20 minutes, not 1).

## 0.9.8
- Calories replace protein on the Today card, the week list, the recipe list and the recipe panel. Tap a person's figure for the full nutrition, which still includes protein and the protein goal. The week list shows one figure when everyone's portion is the same.

## 0.9.9
- Online version: admins can **Message everyone** from the admin dashboard. The message appears as a card at the top of the app the next time each person opens it, until they tap **Got it**. Each person sees it once, whichever phone they use. The dashboard shows how many people have seen it, and you can take it down or replace it.

## 0.10.0
- **Shopping through the week:** pressing **Done shopping** moves everything ticked into **Bought this week**, stamped with the day, time and who shopped. The list then shows only what's left, and its total is what's still to buy, with anything already in the trolley shown separately. Bought this week, at the bottom of the list, shows each trip with its total, the week's total so far, and **Put back** for anything filed by mistake. Untick all leaves bought items alone. The Today card shows what's left to buy.
- **After cooking:** once today's dinner has been cooked to the last step, the Today card offers **Leave feedback** and **Again** instead of Start cooking. After rating, it shows "Cooked · you loved it".

## 0.10.1
- Online version: updates arrive faster. The app checks for a new version whenever you switch back to it, and reloads itself once the new version has downloaded. It waits if you're cooking or have a panel open. Previously the first open after an update showed the old version.

## 0.10.2
- Online version: **updates wait for you.** When a new version has downloaded, a blue **!** appears on the Settings button, and Settings shows **Update ready** with what's new and an **Update now** button. Otherwise it updates the next time the app is fully closed and reopened.
- Each version's files are now kept together. Before, files were refreshed one at a time, so a phone could briefly run a mix of old and new code. That caused, for example, Done shopping to clear the list and then put it all back.
- If the server ever refuses a change, the app now says so instead of quietly undoing it.
- New file `whatsnew.json`: the short notes shown in the Update ready card.

## 0.10.3
- **Recipe and baby-safety review:**
  - Five recipes hid a step everyone needs inside the baby step: saag paneer, lemon ricotta pasta, veg chow mein, the cheesy bean pasta bake and the frittata. Those steps now show for every household, and the recipe checker refuses a baby step that holds anything else.
  - Baby notes say **full-fat** plain yoghurt, since under-2s need full-fat dairy. With little ones, the shopping list suggests a small pot.
  - Little ones get soft chickpeas held back from the tin, not crispy roasted ones. Beansprouts are always cooked until piping hot, and only after the baby's portion comes out. Edamame and peas are squashed. Eggs for little ones are always fully set.
  - Fixed baby notes that didn't match their steps (traybake, tacos, enchiladas). Huevos rancheros now cooks the baby's egg in its own pan, and the baby's ricotta in the lemon ricotta pasta is taken before the raw garlic goes in.
  - The recipe panel warns when shop-bought foods (bread, wraps, gnocchi, beans and so on) put a child's portion over half their daily salt limit, and when a child is under 6 months.
  - Feta is marked as salty. Allergen prompts were added for sulphites (bottled lemon and lime juice, dried apricots), milk (chapatis), gluten (falafel), and sesame, milk and egg (burger buns).
  - Bread and coriander amounts use consistent units, and the jacket potato gives times for more than one.
- **New in recipes:** text in `[[double brackets]]` inside a step only shows to households with little ones, e.g. "keep a spoonful back for the baby".
- **Security:** tighter checks on every change sent to the server, in both versions. The online version only accepts changes from the app's own pages, adds standard browser protection headers, and requires the sign-in token's issuer. CLOUDFLARE.md now recommends the Lax cookie setting for the sign-in.
