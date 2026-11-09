# FoodIsHard

Open **Dinners** from the Home Assistant sidebar.

- **Tonight:** tonight's dinner, who gets how much protein (tap for full nutrition), and what's coming up.
- **Week:** *Plan my week*, then use **Another curry**, **Swap** or **Skip** on any day. The lock keeps a day when you shuffle.
- **Shop:** tick things off as they go in the trolley. Tap an item to fix its price, swap it or change shop. Press and hold to select several and move them. Ticks made with no signal are saved and sync later.
- **Settings** (gear on Tonight): people and portions, the baby switch, allergies, theme nights, shops, budget mode, inflation tracking and weekly staples.

Data is stored in `/data/state.json` and included in Home Assistant backups.
The add-on checks the ONS food price index once a week (switch it off in Settings to stop).
