# FoodIsHard online (Cloudflare)

This runs FoodIsHard on Cloudflare's free plan for several households at once, with no
Home Assistant needed. Each household's data is kept completely separate, and people sign in
with their email address and a 6-digit code (no passwords).

The Home Assistant app is unaffected: it ignores everything in this file.

**How it fits together**

- One Cloudflare **Worker** serves the app.
- Each household gets its own **Durable Object**: a small private store that only that
  household's members can reach.
- **Cloudflare Access** sits in front and handles sign-in. The Worker double-checks every
  request and works out which household the person belongs to.
- Which email belongs to which household is set in the Cloudflare dashboard, **never in the
  repo**.

**Cost:** free for a handful of households. The free plan allows up to 50 people on Access, and
far more requests and storage than a few families need. If a free limit were ever reached, the
app would stop saving for the rest of that day (UTC) and then carry on. Nothing is charged
unless you choose a paid plan.

---

## One-time set-up (about 20 minutes)

Cloudflare tweaks its dashboard often, so a button may be worded slightly differently from
these steps.

### 1. Decide which Cloudflare account to use

Using a **separate Cloudflare account just for FoodIsHard** is recommended. That way, changing
or closing your other projects can never take your friends' app down. A Gmail "plus" address
works for this, for example `you+foodishard@gmail.com`.

### 2. Set up Zero Trust (this is what provides the sign-in)

1. In the dashboard, open **Zero Trust**.
2. Pick a **team name**. This becomes `yourteam.cloudflareaccess.com`, so write it down.
3. Choose the **Free** plan. Cloudflare may ask for a card even on the free plan; you aren't
   charged for up to 50 users.
4. Under **Settings → Authentication → Login methods**, check that **One-time PIN** is
   listed. It's on by default.

### 3. Deploy the app from GitHub

1. Go to **Workers & Pages → Create → Import a repository**, connect GitHub, and pick
   `smp-seven/FoodIsHard`. Alternatively, use the **Deploy to Cloudflare** button in the
   README.
2. Leave the build settings as suggested. The deploy command is `npx wrangler deploy` and the
   root directory is `/`.
3. Press **Deploy**. When it finishes you get an address like
   `https://foodishard.<your-subdomain>.workers.dev`.

If you open that address now, you'll see an **"Almost there"** page. That's expected: the app
refuses to show anything until sign-in is set up.

### 4. Turn on sign-in for the Worker

1. Open the Worker, go to **Settings → Domains & Routes**, and next to `workers.dev` choose
   **Enable Cloudflare Access**. Newer dashboards may have an **Access** tab on the Worker
   instead; choose **All traffic**.
2. Choose **Manage Cloudflare Access** to open the policy.
3. Under the rule that says who's allowed in, choose **Include → Emails** and add every
   person's email address: yours and each friend's.
4. Set the **session duration** to **1 month**, so people don't have to sign in every day.
5. On the same Access application, find the **Application Audience (AUD) Tag**, usually under
   *Overview* or *Basic information*, and copy it.

### 5. Tell the Worker who lives where

Open the Worker, go to **Settings → Variables and Secrets**, add these three as **Text**
variables, then **Deploy**:

| Name | Value |
|---|---|
| `ACCESS_TEAM` | `yourteam.cloudflareaccess.com` |
| `ACCESS_AUD` | the AUD tag from step 4 |
| `HOUSEHOLDS` | see below |

`HOUSEHOLDS` lists each household, with the email address and display name of each person:

```json
{
  "smiths": { "alex@example.com": "Alex", "sam@example.com": "Sam" },
  "patels": { "priya@example.com": "Priya", "dev@example.com": "Dev" }
}
```

- Household names use letters, numbers and dashes only. They're never shown to anyone.
- Each email can only be in one household.
- Email capitals don't matter.

### 6. Try it

Open the address on a phone, enter your email, and type in the code that arrives. The app
opens with a fresh plan. In Chrome on Android, use **⋮ → Add to Home screen** so it opens like
an app.

---

## Day to day

**Adding a household or a person:** add their email in two places:

- the Access policy (step 4)
- `HOUSEHOLDS` (step 5)

Then press Deploy.

**Removing someone:** take them out of both. Their household's data stays until you delete it.

**Updates:** every push to the GitHub repo redeploys automatically. Households keep all their
data, and the three variables are kept too.

**Privacy:** as the account owner you could, technically, look at households' data in the
Cloudflare dashboard. It's polite to tell your friends that. The app stores meal plans,
shopping lists, prices, settings (names, portion sizes, allergies) and recipe feedback.
Nothing else.

**Backups and leaving:**

- Anyone can use **Settings → Your data → Download a backup** at any time.
- That file can be restored into any copy of FoodIsHard: the Home Assistant app, another
  person's Cloudflare copy, or their own.
- If you ever stop hosting, give people a few weeks' notice to download their backups.

## Running your own copy

A household that wants its own copy, on its own free Cloudflare account, follows the same
steps with just their household in `HOUSEHOLDS`. Then they restore their backup in Settings.

## Troubleshooting

| What you see | What to do |
|---|---|
| "Almost there" | `ACCESS_TEAM` or `ACCESS_AUD` isn't set, or the Worker wasn't redeployed after adding them. |
| "Please sign in" | The sign-in has expired or isn't valid for this app. Reload the page. If it keeps happening, check that `ACCESS_AUD` matches the tag on the Access application. |
| "Not set up yet" | The person signed in fine, but their email isn't in `HOUSEHOLDS`. |
| "Set-up problem" | `HOUSEHOLDS` isn't valid JSON, or an email is listed twice. The message says which. |
| The code email never arrives | Their email isn't in the Access policy. Cloudflare silently ignores addresses it doesn't recognise. |
| App says it's offline | The sign-in has probably expired while the app was open. Reload to sign in again. |

## For developers

- `wrangler.jsonc` is the Worker config.
- `cloudflare/src/index.js` is the Worker and the `Household` Durable Object.
- `cloudflare/src/logic.js` holds sign-in checks, household lookup and housekeeping.
- `foodishard/app/static/ops.js` holds the state changes, shared with the app.
- `node cloudflare/test.mjs` runs the tests with plain Node, using a fake Access key and fake
  Durable Objects.
- `npx wrangler dev` runs it locally. Locally there's no Access, so to sign in, create a
  `.dev.vars` file and test with your own token, or test with the Node script instead.
