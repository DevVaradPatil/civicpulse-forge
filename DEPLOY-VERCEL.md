# CivicPulse — Deploy on Vercel + Supabase (100% free, no Google Cloud)

The app no longer uses Firestore, Cloud Storage, Firebase Auth, or Cloud Run.
It now runs on **Vercel** (hosting) + **Supabase** (Postgres, file storage, anonymous auth).
The only Google service left is the **Gemini API key** (Google AI Studio free tier — no billing).

| Was | Now |
|---|---|
| Cloud Run | **Vercel** |
| Cloud Firestore | **Supabase Postgres** |
| Cloud Storage | **Supabase Storage** (private bucket) |
| Firebase Auth (Google + anon) | **Supabase Auth** (anonymous) |
| Gemini API | Gemini API (unchanged) |

---

## Step 1 — Create the Supabase project (~3 min)

1. Go to **https://supabase.com** → sign in with GitHub → **New project**.
   - Name: `civicpulse` · pick any region (Mumbai/Singapore is closest to India)
   - Set a database password (you won't need it for this app) → **Create**.
2. Wait ~1 minute for it to provision.

## Step 2 — Create the database tables

1. In your project, open **SQL Editor** → **New query**.
2. Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   You should see "Success". This creates the `issues`, `users`, and `meta` tables plus
   the two atomic functions (`award_points`, `confirm_issue`).

## Step 3 — Create the storage bucket

1. Open **Storage** → **New bucket**.
2. Name it exactly **`media`**, leave **Public bucket OFF** (it must stay private —
   photos are streamed through our own `/api/media` proxy) → **Create**.

## Step 4 — Enable anonymous sign-in

1. Open **Authentication** → **Sign In / Providers**.
2. Turn **Anonymous sign-ins** ON → Save.
   (This is what gives every visitor a stable identity so they can report/confirm
   instantly, and it's what the server verifies on every write.)

## Step 5 — Collect your keys

Open **Project Settings → API** and copy:

| Value | Env var |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` / publishable key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` / secret key | `SUPABASE_SERVICE_ROLE_KEY` ⚠️ **secret** |

> The **anon key is safe** in the browser: every table has RLS enabled with **no policies**,
> so that key can't read or write anything directly. All data flows through our `/api/*`
> routes using the service-role key, which stays server-side.

## Step 6 — Local `.env.local`

```bash
cp .env.example .env.local
```

Fill it in:

```
GEMINI_API_KEY=<your existing AI Studio key>
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
SUPABASE_BUCKET=media
```

Then:

```bash
npm install
npm run dev
```

## Step 7 — Seed the demo data (~30 Delhi issues)

```bash
node --env-file=.env.local scripts/seed.mjs --dry-run   # preview, changes nothing
node --env-file=.env.local scripts/seed.mjs             # apply
```

The seed is **non-destructive**: it only deletes rows it created (`seed = true` or a
`reporter_id` starting with `seed-`). Real reports and real users are always preserved.

## Step 8 — Deploy to Vercel

1. Go to **https://vercel.com** → sign in with GitHub → **Add New… → Project**.
2. Import your **CivicPulse** repo. Vercel auto-detects Next.js —
   leave the build settings alone.
3. Before deploying, add **Environment Variables** (same five as `.env.local`):
   - `GEMINI_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_BUCKET` = `media`
4. **Deploy**. You'll get a `https://<project>.vercel.app` URL.

### Optional
- Set `NEXT_PUBLIC_SITE_URL` to your final Vercel URL so SEO metadata, `robots.txt`
  and `sitemap.xml` use it (otherwise Vercel's own URL is detected automatically).
- Every `git push` to `main` now auto-deploys.

---

## Free-tier notes

- **Vercel Hobby** — free, and unlike Cloud Run there's **no cold-start delay** worth worrying
  about for a demo. Serverless functions have a 10s default limit on Hobby; our AI routes
  declare longer `maxDuration`, and Gemini triage typically returns in 2–5s.
- **Supabase free** — 500 MB database, 1 GB file storage, no credit card.
- **Gemini** — free tier, unchanged.
- **No billing account anywhere.**

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Supabase is not configured` | Env vars missing/misspelled in Vercel → redeploy after adding |
| Photos 404 | Bucket isn't named `media`, or `SUPABASE_BUCKET` doesn't match |
| Confirm/report does nothing | Anonymous sign-ins not enabled (Step 4) |
| `relation "issues" does not exist` | `schema.sql` wasn't run (Step 2) |
| AI errors | `GEMINI_API_KEY` missing, or free-tier quota exhausted for the day |
