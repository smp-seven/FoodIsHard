# FoodIsHard online (Cloudflare)

This runs FoodIsHard on Cloudflare's free plan for several households at once, with no Home
Assistant needed:

- Each household's data is kept completely separate.
- People sign in with their email and a 6-digit code. There are no passwords.
- You, as admin, invite households from inside the app.
- Each household invites its own partner, so you don't edit settings for every new person.

The Home Assistant app is unaffected: it ignores everything in this file.

**How it fits together**

| Part | What it does |
|---|---|
| **Worker** | Serves the app. |
| **Directory** (a Durable Object with a small SQLite database) | Records who belongs to which household. |
| **Household** (one Durable Object each) | Holds that household's plans, lists and settings. Only its members can reach it. |
| **Cloudflare Access** | Sends the email codes and only lets listed emails through. The app keeps that list up to date when people are invited or removed. |

**Where the data lives:** in your Cloudflare account, in Cloudflare's **EU data centres**.
That's the default, set by `DATA_REGION`. To keep data small and tidy:

- shopping lists are deleted after **8 weeks**
- meal plans are deleted after **a year**

**Cost:** free for up to 50 people. Access's free plan has a 50-person limit, and the app stops
at 45 to leave room. Zero Trust asks for a payment card even on the free plan, but it charges
nothing unless you choose a paid plan.

---

## One-time set-up

Cloudflare tweaks its dashboard often, so a button may be worded slightly differently from
these steps.

### 1. Zero Trust (the sign-in)

1. In the dashboard, open **Zero Trust**, pick a **team name** and choose the **Free** plan.
   - The team name becomes `yourteam.cloudflareaccess.com`.
   - It's shared by everything in this Cloudflare account, so pick something neutral.
   - You can change it later under **Settings → Team domain**, but then update
     `ACCESS_TEAM` to match.
2. Go to **Integrations → Identity providers → Add new identity provider** and choose
   **One-time PIN**. New Zero Trust accounts only offer "Sign in with Cloudflare" by default,
   which your friends can't use.

### 2. Deploy the app

1. Go to **Workers & Pages → Create → Import a repository**, connect GitHub, and pick
   `smp-seven/FoodIsHard`.
2. Keep the suggested build settings: root directory `/`, deploy command `npx wrangler deploy`.
3. You'll get `https://foodishard.<your-subdomain>.workers.dev`. Until step 5 is done it shows
   an **"Almost there"** page and nothing else.

### 3. Create the sign-in policy

1. In Zero Trust, open **Access controls → Policies → Add a policy**.
2. Fill it in:
   - **Name:** `FoodIsHard people` (spelled exactly like this, because the app looks for it
     by name)
   - **Action:** Allow
   - **Session duration:** 1 month
   - **Include → Emails:** your own email
3. Save.

### 4. Protect the Worker with it

1. Open the Worker and go to the **Access** tab.
2. Choose **Protect this Worker behind Access**, then **All traffic**.
3. Pick the **FoodIsHard people** policy and click **Apply Access**.
4. Open the new Access application, then:
   - under **Login methods**, tick **One-time PIN** and untick **Cloudflare**
   - turn on **Instant Auth** if it's offered
   - copy the **Application Audience (AUD) Tag**

### 5. The basic settings

Open the Worker's **Settings** and find **Runtime variables and secrets**, with
**Production** selected.

> **Not** the "Variables and secrets" under *Build*: the running app can't see those. The
> resource list under **Bindings → Add a binding** isn't it either.

Click **Add variable** for each of these, then **Deploy**:

| Type | Name | Value |
|---|---|---|
| Text | `ACCESS_TEAM` | `yourteam.cloudflareaccess.com` (no `https://`) |
| Secret | `ACCESS_AUD` | the AUD tag from step 4 |
| Secret | `ADMINS` | the exact email you sign in with, with no quotes; separate several with commas |

Optional: `DATA_REGION` = `auto` lets Cloudflare choose where to store data instead of the EU.
Only use it if the EU option fails on your plan, and decide before anyone uses the app: changing
it later starts every household afresh.

Now open the address on your phone and sign in with your email and the code. The app creates
your household automatically, called "Home"; you can rename it in Settings.

**At this point it works.** The only manual job left is that every invited email also has to
be added to the policy from step 3 by hand. Step 6 automates that.

### 6. Let invites update the sign-in list automatically (recommended)

This gives the app a key that can only edit Access policies, so inviting someone in the app is
all it takes.

1. **Create the token.**
   1. Click the person icon (top right), then **Profile → API Tokens → Create Token**.
   2. **Name:** `FoodIsHard sign-in list`.
   3. **Policies:** choose **Start from scratch (Custom)**. Don't use a template; they all
      give far more access than this needs.
   4. Set **Include** to **your account**, not "All accounts".
   5. Search for **Access: Apps and Policies** and tick **Edit**. Nothing else should be
      ticked (the counter shows 1 of the available permissions).
   6. **Token expiration:** No expiration. An expiry date would quietly stop invites
      working.
   7. **Client IP address filtering:** leave empty.
   8. Create the token and copy it. It's shown only once.
2. **Find your Account ID.** It's on the Workers & Pages overview or the account home page,
   usually in the right-hand column. Copy it.
3. **Add the settings.** On the Worker, go to **Settings → Runtime variables and secrets**
   (Production) and add:

   | Name | Type | Value |
   |---|---|---|
   | `CF_ACCOUNT_ID` | Text | your Account ID |
   | `CF_API_TOKEN` | **Secret** | the token |

   Then **Deploy**.
4. **Check it worked.** In the app, open **Settings → Admin** and press **Update sign-in
   list now**. It should say the list was updated or is already up to date. If it reports an
   error, the message says what Cloudflare didn't like.

If you named the policy something other than `FoodIsHard people`, also add
`ACCESS_POLICY_NAME` (Text) with its exact name.

> **Security note:** this token can edit the Access policies in this Cloudflare account,
> nothing else. If your account also runs other projects with Access, it could edit their
> policies too. That's a good reason to give FoodIsHard its own Cloudflare account. The app
> only ever changes the email list of the one policy it's named after.

### 7. Optional: "Sign in with Google" as well as email codes

This lets people sign in with their Google account in one tap, while keeping email codes for
everyone else. It only works when the email you invited is their Google account's email.

1. **Google Cloud Console** ([console.cloud.google.com](https://console.cloud.google.com)):
   1. Create a project, e.g. *FoodIsHard sign-in*.
   2. Set up the **OAuth consent screen** (or *Google Auth Platform*):
      - app name FoodIsHard, with your email as the contact
      - audience **External**
      - no extra scopes
   3. **Publish app**, so it's *in production*. In Testing mode, only Google accounts you list
      can sign in.
   4. Go to **Credentials → Create credentials → OAuth client ID** and choose **Web
      application**:
      - **Authorized JavaScript origins:** `https://<team-name>.cloudflareaccess.com`
      - **Authorized redirect URIs:**
        `https://<team-name>.cloudflareaccess.com/cdn-cgi/access/callback`
   5. Copy the Client ID and Client secret.
2. **Zero Trust:**
   1. Go to **Integrations → Identity providers → Add new → Google**, paste both values, save,
      and press **Test**.
   2. In the FoodIsHard **Access application → Login methods**:
      - tick **Google** and **One-time PIN**
      - untick **Cloudflare**
      - turn **Instant Auth** off so people can choose

If you change your team name later, update both Google URIs as well.

---

## Day to day

**Inviting a new household (admin):**
1. In the app, go to **Settings → Admin → New household** and enter the household name, the
   first person's name and their email.
2. Send them the message it gives you.
3. They can then invite their partner themselves.

**Inviting your partner (anyone):** go to **Settings → Who's in your household → Invite
someone**.

**Removing someone:** tap the bin icon next to them. They're signed out within a minute. An
admin can delete a whole household from **Settings → Admin**. That permanently deletes its
data, so ask them to download a backup first.

**Updates:** every push to the GitHub repo redeploys automatically. All data and settings
are kept.

**Privacy:** as the account owner you could, technically, look at households' data in the
Cloudflare dashboard. It's polite to tell your friends that. The app stores:
- each person's name and email
- meal plans, shopping lists and prices
- settings (portion sizes, allergies)
- recipe feedback

Nothing else.

**Backups and leaving:**
- Anyone can use **Settings → Your data → Download a backup** at any time.
- That file can be restored into any copy of FoodIsHard: the Home Assistant app, another
  person's Cloudflare copy, or their own.
- If you ever stop hosting, give people a few weeks' notice.

**Moving from the old `HOUSEHOLDS` setting:** if you set up an earlier version with a
`HOUSEHOLDS` variable, it's imported automatically the first time, and nobody loses
anything. After that it's ignored, and you can delete it.

## Limits

- 45 people in total, leaving room under Access's free limit of 50.
- Up to 8 people per household.

## Troubleshooting

| What you see | What to do |
|---|---|
| "Almost there" | `ACCESS_TEAM` or `ACCESS_AUD` isn't set, or the Worker wasn't redeployed after adding them. |
| "Please sign in" | The sign-in has expired or isn't valid for this app. Reload the page. If it keeps happening, check that `ACCESS_AUD` matches the AUD tag. |
| "Not set up yet" | They signed in, but nobody has invited that email. Invite it from Settings. If it's **you**, `ADMINS` doesn't exactly match the email you signed in with. |
| Only "Sign in with Cloudflare" is offered | Add **One-time PIN** under Integrations → Identity providers, and tick it in the application's Login methods (steps 1 and 4). |
| Google sign-in says "redirect_uri_mismatch" | The Google URIs don't exactly match your current team name (step 7). |
| Google sign-in works but says "Not set up yet" | Their Google account's email isn't the one you invited. Invite that address, or they sign in with an email code instead. |
| The sign-in page shows an old team name | Changes take a few minutes. Try a private window. |
| The code email never arrives | That email isn't in the **FoodIsHard people** policy. Cloudflare silently ignores unknown addresses. Press **Update sign-in list now**, or add the email to the policy by hand. |
| Invite says "add their email to your Access policy" | Step 6 isn't set up yet, so add the email to the policy by hand. |
| An error mentioning "jurisdiction" on first sign-in | Your plan doesn't allow the EU restriction. Add `DATA_REGION` = `auto` and Deploy. |
| App says it's offline | The sign-in has probably expired while the app was open. Reload to sign in again. |

## For developers (and learning)

| File | What it is |
|---|---|
| `wrangler.jsonc` | Worker config: the two Durable Object classes and a weekly cron. |
| `cloudflare/src/index.js` | Routing, sign-in check, the `Household` Durable Object. |
| `cloudflare/src/directory.js` | The `Directory` Durable Object (SQLite tables `households`, `members`, `meta`) and every rule about who may invite or remove whom. |
| `cloudflare/src/logic.js` | Access token checking, the Access policy sync, housekeeping. |
| `foodishard/app/static/ops.js` | The data changes, shared with the app and the Home Assistant version. |

To work on it locally:

- `node --no-warnings cloudflare/test.mjs` runs the tests with plain Node. It uses a fake
  Access key, fake Durable Objects backed by Node's built-in SQLite, and a fake Cloudflare
  API.
- `node --no-warnings cloudflare/dev-server.mjs` runs the online version on your computer at
  `http://localhost:8787/?as=you@example.com`. Change `?as=` to "be" someone else. It's for
  local testing only.
