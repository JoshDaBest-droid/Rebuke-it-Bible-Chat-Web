# Rebuke it: Bible Chat — Bible discovery engine

A minimal, stateless proxy. It is NOT a chatbot backend — it never writes a
theological answer. It holds your Anthropic API key server-side, runs
semantic (embeddings-based) retrieval over the curated verse corpus in
`shared/verses.json`, merges that with whatever the app already found
locally, and returns a short structured result: detected themes, a
one-sentence "why" per suggested passage, and related topics to explore —
drawn from `shared/themes.json`. No database, no user accounts, no separate
AI vendor for embeddings — everything runs on the one Cloudflare account.

## Deploy (one-time)

```bash
cd worker
npm install
npx wrangler login                          # first time only
npx wrangler secret put ANTHROPIC_API_KEY    # paste your Anthropic key when prompted
npx wrangler secret put ADMIN_KEY            # any random string you choose — protects the embeddings endpoint

# Shared KV — powers both the response cache AND semantic retrieval.
# Without this, the worker still answers questions, it just falls back to
# keyword-only retrieval (same as before) and never caches repeated
# questions, which meaningfully raises your cost. Strongly recommended.
npx wrangler kv namespace create RESPONSE_CACHE
# paste the printed id into the [[kv_namespaces]] block in wrangler.toml, then:

npx wrangler deploy
```

Deploy prints a URL like `https://foundation-bible-chat-proxy.<your-subdomain>.workers.dev`.
Copy it into `src/chat/claudeClient.js` (`PROXY_URL`) in the app.

### Build the verse embeddings (one-time, after every deploy that has a KV namespace)

Semantic retrieval needs the curated verses embedded once and cached in KV.
Run this after your first deploy, and again any time you edit
`shared/verses.json`:

```bash
curl -X POST "https://foundation-bible-chat-proxy.<your-subdomain>.workers.dev/admin/rebuild-embeddings" \
  -H "x-admin-key: <the ADMIN_KEY you set above>"
```

Should return `{"ok":true,"embeddedVerses":65}` (or however many verses are
in `shared/verses.json`). If you skip this step, the worker still works —
it just answers using only the app's local keyword-based candidates until
you run it.

### Account deletion (required for App Store submission)

Apple requires any app with account creation to also offer in-app account
deletion (Guideline 5.1.1(v)). `POST /account/delete` handles this — it
verifies the caller's Supabase session token, then deletes their
`auth.users` row via Supabase's Admin API, which cascades (via each
table's `on delete cascade`) to remove everything they've ever synced.

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Get this value from the Supabase dashboard → **Project Settings → API →
service_role** (the *secret* key, not the anon/publishable one — never put
this in a committed file or in the app itself). `SUPABASE_URL` is already
set as a plain (non-secret) var in `wrangler.toml`.

### Signup notification email (optional)

Sends you one email every time someone creates an account, via a Supabase
Database Webhook → this worker → Resend.

1. Create a free account at **resend.com** and grab an API key (Dashboard → API Keys).
   No domain verification needed — the default `onboarding@resend.dev` sender
   works out of the box for this. Verify your own domain later if you want a
   custom "from" address.
2. Set the three secrets:
   ```bash
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put NOTIFY_EMAIL          # your email — where notifications go
   npx wrangler secret put SIGNUP_WEBHOOK_SECRET # any random string you make up
   npx wrangler deploy
   ```
3. In the Supabase dashboard, go to **Database → Webhooks → Create a new webhook**:
   - Table: `users` (schema: `auth`)
   - Events: `Insert`
   - Type: HTTP Request → POST
   - URL: `https://foundation-bible-chat-proxy.<your-subdomain>.workers.dev/webhooks/new-signup`
   - HTTP Headers: add `x-webhook-secret` → the same value you set for `SIGNUP_WEBHOOK_SECRET`

That's it — every new `auth.users` row fires the webhook, the worker checks
the shared secret, and emails `NOTIFY_EMAIL` with the new user's address.
If you skip this whole section, signups still work fine — you just won't
get notified.

## Cost

Cloudflare Workers free tier: 100,000 requests/day. Workers KV free tier:
100,000 reads/day, 1,000 writes/day. Workers AI (used only for embeddings,
not generation) has its own free daily allocation — a single question's
embedding is a tiny fraction of it. You will only be billed by Anthropic
for actual Claude calls (see the app's report for per-message cost
estimates) — the proxy and retrieval layer are free at this app's scale.

## Local dev

```bash
npm run dev
```
