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

## 0.10.4
- **Allergy question on first use:** a household with no allergies set is asked once, on the Today screen. Households that have already set theirs never see it.
- **Allergen-aware budget swaps:** budget mode never automatically swaps in an ingredient carrying something the household avoids, e.g. bottled lemon juice when avoiding sulphites.
- **Recipe checker:** fails if any ingredient's name or note mentions coconut without being tagged with it, so a new product can't slip past the coconut setting.
- **Recipe fixes:** the paneer curry takes the baby's portion before the (0% fat) yoghurt goes in. Cheesy beans on toast says to fry the baby's egg until the yolk is firm. The traybake's chopped-stage note no longer suggests halloumi.
- **Security:** both versions refuse keys named after JavaScript's built-in object properties, and cap the length of shopping items and feedback tags. The online version adds a full content security policy, so only the app's own files can run, including on error pages and recipe data.
- Local test server: passes the Worker's headers through, so it behaves like the real thing.

## 0.10.5
- **Amounts in cooking mode:** each step lists the ingredients it names, with amounts for your household. The most specific name wins, e.g. "black pepper" isn't confused with red peppers, and "the beans" lists both kinds when a recipe uses two.
- **Start-by time:** set a usual dinner time in Settings (Week & planning). The Today card then says "Start by 17:25", or suggests Quicker if it's already too late.
- **Undo after Shuffle:** the toast after reshuffling the week has an Undo button for 6 seconds.
- **Longer memory:** the planner tries to avoid anything from the last 3 weeks (at least the last 1). Meals you rated "loved it" come up twice as often, and "not again" hardly ever.

## 0.10.6
- **Who's eating:** ⋯ on any day → "Who's eating / cook double…" adds guests or takes someone off for that night, in adult portions. The shopping list, the day's cost, and the recipe and cooking mode on the night all use the adjusted amounts.
- **Cook double:** doubles that night's amounts and makes the next day "Leftovers from Tuesday's …". Turning it off puts the next day's dinner back.
- **Left over on the list:** things that go off within days (fresh veg, soft cheeses, tofu, opened tins and so on) show what's left of the pack, e.g. "¾ tin left over". Long-keeping things don't, to keep the list readable.
- **Aisle order:** Settings → Shopping & prices → Aisle order lets a household match the list to their shop.
- **Leftovers guidance:** every recipe ends with how to cool, store, freeze and reheat it, following Food Standards Agency and NHS advice. Rice and couscous dishes get the stricter 1-hour/24-hour rule, rice on the side gets its own line, and 14 recipes say what freezes well. Leftovers night on the Today card reminds you to reheat once, until steaming hot.
- **Fixes:** closing the Swap panel (X, tapping outside or Back) returns to the recipe or shopping item it came from. The "under 6 months" note now uses the baby's actual age, as NHS advice does, so a mistyped due date can't trigger it.

## 0.10.7
- **Uses up part-packs:** when planning, each candidate dinner is scored by how it changes the week's leftovers of things that go off. Using up half a cauliflower scores well; opening a new tub for 50 g scores badly. In 300 simulated weeks, the packs-worth left over fell from about 5.1 to 3.6 a week, still within the usual variety, theme and time rules.
- **Use up the rest:** tapping a shopping item that shows "left over" suggests up to four recipes not already planned that use it. Choosing one asks which day to put it on.
- **Nudges instead of a tutorial:** the first-use allergy card on Today is gone. When something important isn't set (allergies not confirmed, a child without a birth date), the Settings button glows and so does the field, until it's done. Allergies can be confirmed with "No allergies in our household". The glow is still for anyone who prefers reduced motion.

## 0.10.8
- **Weekly staples** have their own panel, opened from the shopping list's ⋯ menu ("Weekly staples…") or from Settings. Adding a staple puts the cursor straight in its name.
- **Undo shuffle** is now a button next to "Shuffle again", replacing the toast's short-lived Undo. It stays until you change something else in that week, since undoing then would lose that change.

## 0.10.9
Fixes from a review of the new features:
- **Pack rounding:** up to 15% over the packs you're buying no longer buys another (e.g. 1⅛ tins for two adults and a baby is 1 tin, 2¼ is 2). Applies to the list, prices and left-over notes.
- **Cook double** leaves a night off or a locked day as it is (the extra keeps for lunch). Turning it off restores the next day exactly as it was, including an empty day.
- **A day's amounts everywhere:** opening a recipe from the week or the Today list shows that day's guests or cook-double amounts ("for 4¼ portions (Sunday: +2 guests)"), and its Cook button uses them.
- **Undo shuffle** disappears when anyone changes the week, including a partner on another phone.
- **Cooking mode:** "half the oil" and "the rest of the oil" show half the amount. A short name no longer pulls in a similar ingredient ("onion" no longer lists the spring onions).
- **Use up the rest:** suggestions are ranked by what they'd do to the week's part-packs, and ones that would open more than they use are dropped. Putting one on a leftovers night switches off cook double on the day the leftovers came from.
- **Start-by wording:** when it's later than planned: "Dinner around 18:50 if you start now". It no longer shows after midnight.
- **Tidy-ups:** dishes with rice or couscous mixed through are marked `grainsMixed` in recipes.json, checked by the recipe checker. The old allergy card code is removed.

## 0.11.0
- **Who you cook for:** Settings has one list of everyone who eats dinner, grown-ups and little ones together, with the total ("2½ portions a night") at the top. Tapping a grown-up opens their panel:
  - named sizes (Smaller, Regular, Larger, Extra), with Fine-tune for anything in between;
  - what the size means ("about 860 kcal for a typical dinner; 90 g of pasta becomes 115 g");
  - the protein goal, now optional and tucked in here.
  Tapping a little one opens their details and growing-up suggestions. In the online version, adding a grown-up offers your household members' names. The separate on/off switch for little ones has gone: adding one switches them on, and removing the last switches them off.
- **Who's eating, by name:** each night's panel lists everyone with a switch, plus guests and cook double. Every dinner in the week shows a chip, e.g. "Everyone eating" or "Alex out · +2 guests", which opens it. Nights saved with the older +/- adjustment still work.
- **Calmer leftovers:** one "Left over this week" card at the bottom of the shopping list replaces the amber note on each line. "Ideas" appears only where a recipe would use the rest without opening more. The storing and reheating guidance in each recipe starts folded.

## 0.11.1
- **"Cooking for little ones" switch is back**, in Who you cook for, between the grown-ups and the little ones. Off leaves their portions and notes out but keeps their details ("Bo is saved but left out for now"). Switching on with nobody added opens a new little one's details.
- **Tidier rows** in Who you cook for and Who's eating: each name sits on its own line with the details underneath, so names line up whatever their length. A little one's colour is a stripe down the left instead of a dot, and their details are shorter ("9 months · Finger foods · ¼ portion").

## 0.11.2
- **Weekly staples** have a card on the shopping list, next to the spice rack, showing what's on it ("Milk, Bread, Oats + 1 more"). The Settings row shows the same.
- **Shopping list buttons:** "+ Add item" and "Done shopping" are side by side and the same size. The page leaves room at the bottom, so the buttons no longer cover the last lines.

## 0.11.3
- **Less small print:** a copy pass on the grey helper text, panel intros, empty states and toasts. Explanations of how a feature works, lines that repeated the heading, and anything obvious are cut or shortened (about 70 edits). Safety wording is unchanged: allergies, baby and salt notes, storing and reheating, the vegetarian rule, About, and the delete and restore warnings. A few small layout touches keep spacing where a line was removed. Kept on purpose: "Tap an item to fix its price or swap it; hold to select several", "≈ £x left" on the Today card, "Everyone who eats dinner, signed in or not", and the note that people who join later see an admin message too.

## 0.11.4
- Weekly staples are now only on the shopping list (the card, and the ⋯ menu), no longer in Settings.
