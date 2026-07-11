# Stripe Setup, Final Deploy Steps

You've got: Publishable key, Secret key, both Price IDs. Time to wire it up.

## Step 1, Tell Cloudflare your Stripe secret

```bash
cd ~/Hireflow/worker
npx wrangler secret put STRIPE_SECRET_KEY
# Paste your sk_live_... when prompted, hit enter.
```

## Step 2, Deploy the new Worker

```bash
npx wrangler deploy
```

Should print: `https://hireflow-api.hireflow.workers.dev`

## Step 3, Create the Stripe webhook

Stripe needs to ping your Worker when payments succeed. Set this up in the Dashboard:

1. Go to <https://dashboard.stripe.com/webhooks>
2. Click **+ Add endpoint**
3. **Endpoint URL:**
   ```
   https://hireflow-api.hireflow.workers.dev/stripe/webhook
   ```
4. **Events to listen for**, click "+ Select events" and check these 4:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Click **Add endpoint**
6. On the next page, click **Reveal** under "Signing secret" → copy the `whsec_...` value

## Step 4, Tell Cloudflare the webhook secret

```bash
cd ~/Hireflow/worker
npx wrangler secret put STRIPE_WEBHOOK_SECRET
# Paste the whsec_... value, hit enter.
```

## Step 5, Redeploy the Worker with the new secret

```bash
npx wrangler deploy
```

## Step 6, Enable the Customer Portal in Stripe

Required for the "Manage billing" button:

1. Go to <https://dashboard.stripe.com/settings/billing/portal>
2. Click **Activate test link** or **Activate** (live mode)
3. Defaults are fine, just save.

## Step 7, Push the new frontend to GitHub

Upload to your repo (drag into GitHub web uploader or push via git):

**New files:**
- `pricing.html`
- `success.html`
- `js/plan.js`
- `STRIPE_SETUP.md` (this file)

**Changed files:**
- `index.html` (pricing link in footer)
- `editor.html` (upgrade button, lock icons, plan pill)
- `interview.html` (gates for free users)
- `export.html` (download counter + limit)
- `js/config.js` (publishable key added)
- `js/editor.js` (plan-aware logic)
- `js/icons.js` (new lock + crown icons)
- `worker/wrangler.toml` (Stripe env vars)
- `worker/worker.js` (Stripe endpoints + gating)

Pages will go live in ~1 minute on appliohq.com.

## Step 8, Test it

1. Open <https://appliohq.com>, sign in (or sign up fresh)
2. You should see a purple **Upgrade** button in the topbar
3. Hit **Upgrade** → pricing page → click **Upgrade to Premium**
4. You'll land on Stripe Checkout, real payment, real money. Use your own card.
5. After payment, redirected to `success.html` → then click **Open Editor**
6. Plan pill should now show a crown badge, Premium. Lock icons gone. AI works.

**Want to test without paying real money first?** Use a Stripe test card by temporarily switching to test mode keys (separate dashboard). But you said no test mode, so just be ready with your card and ~$10.

## Troubleshooting

**Webhook never fires (plan stays Free after payment):**
- Go to <https://dashboard.stripe.com/webhooks> → click your endpoint → check the **Recent deliveries** tab.
- Failed deliveries show the response. Common issue: signature mismatch → re-copy the signing secret and rerun `npx wrangler secret put STRIPE_WEBHOOK_SECRET`.
- Also check `npx wrangler tail` in another terminal to see live Worker logs.

**"Could not start checkout":**
- Probably wrong Price ID or wrong Stripe secret. Check `wrangler.toml` and the secret you set.

**Checkout works but plan never updates:**
- Webhook isn't reaching Worker (see above), or webhook signing secret is wrong, or the email mismatch. Worker uses `client_reference_id` set to the signed-in email. Verify in Stripe Dashboard → recent Checkout Sessions → the field should equal your account email.

**Want to manually grant Premium for a test user:**

```bash
npx wrangler kv key get --binding=HIREFLOW_KV "user:you@example.com"
# Copy the JSON, edit "plan": "premium", paste back:
npx wrangler kv key put --binding=HIREFLOW_KV "user:you@example.com" '{"email":"you@example.com","plan":"premium",...}'
```

## What's now gated to Premium / Lifetime

| Feature | Free | Premium | Lifetime |
|---|---|---|---|
| Resume Builder (build/customize) | ✓ | ✓ | ✓ |
| All 9 templates | ✓ | ✓ | ✓ |
| Job Tracker | ✓ | ✓ | ✓ |
| Resume downloads | 10 total | unlimited | unlimited |
| AI Improve writing |, | ✓ | ✓ |
| Tailor to Job (AI) |, | ✓ | ✓ |
| ATS Check (AI) |, | ✓ | ✓ |
| AI Resume Analysis |, | ✓ | ✓ |
| AI Interview Prep |, | ✓ | ✓ |
| Resume import (AI parse) |, | ✓ | ✓ |
| Pricing | $0 | $9.99/mo | $39.99 once |
