# CivicPulse — Handoff

Everything needed to pick this up cold, run it, and keep it honest.
Written 31 Oct 2026. Submission deadline **1 Nov 2026, 23:59**.

Repo: <https://github.com/DevVaradPatil/civicpulse-forge>

---

## 1. What this is

A civic grievance platform for Bengaluru built for the **Forge Gen AI Buildathon,
Theme 1**. Two halves:

- **Accountability (data-driven).** 16,071 real grievances and 43,492 real BBMP work
  orders, so the product can set *what citizens complained about* against *what the
  city actually paid for*.
- **Reporting (live).** A citizen photographs an issue → AI triages it → it routes to
  the real responsible agency → the community confirms → an AI verifies the fix from
  an after-photo.

The reporting half is deliberately **empty of data**. It is demonstrated *live*, not
from seeded rows. Seeding is an instant disqualification (see §6).

---

## 2. The one rule that can disqualify us

> **No dummy data. Zero tolerance.** Never seed, invent, mock or hardcode records,
> counts or placeholder numbers.

Every row carries its provenance: `source`, `source_record_id`, `source_url`,
`source_payload`, `ingested_at`. If a number appears in the UI it must trace back to a
real record. Practical consequences already baked in — **don't undo these**:

- `severity` and `photo_path` are **nullable** and stay NULL on imported records. The
  source has no severity and no photo; defaulting them would invent data.
- `rejected` and `closed` are **real statuses**, excluded from every resolution rate
  rather than folded into resolved.
- Geolocation failure does **not** silently pin the city centre. The reporter is told,
  and must opt in; the choice is stored in `location_source`.
- A ward with no records is drawn **unshaded**, never as 0%.
- Agencies that the data only ever abbreviates (BCP, BMTC, KSFES, KSRTC, BDA) are
  shown as acronyms. Do **not** expand them — the dataset never does.

---

## 3. Quick start

```bash
git clone https://github.com/DevVaradPatil/civicpulse-forge.git
cd civicpulse-forge
npm install
cp .env.example .env.local   # then fill it in, see §4
npm run dev
```

The app will run against whatever Supabase project `.env.local` points at. If that
project is empty, follow §5 to populate it.

---

## 4. Environment variables

`.env.local` (and the same set in Vercel → Project → Settings → Environment Variables):

| Key | What | Where to get it |
|---|---|---|
| `GEMINI_API_KEY` | Server-side only | [Google AI Studio](https://aistudio.google.com/apikey), free tier |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public key, safe in the browser | same page |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Bypasses RLS, server-only | same page |
| `SUPABASE_BUCKET` | Storage bucket for photos, value `media` | create it as **private** |

Two Supabase settings that are easy to miss and break things silently:

1. **Enable anonymous sign-ins** — Authentication → Sign In / Providers → Anonymous.
   Without it every visitor is unauthenticated, so points and the leaderboard never
   attribute. (Reports still submit; they just have no owner.)
2. **Create the `media` bucket as private.** Photos are served through our own
   `/api/media/*` route, never straight from Supabase.

**No Google Maps API key is needed.** The map is Leaflet + OpenStreetMap, which needs
no key. Google Maps Platform requires a billing account even inside its free
allowance, which breaks the hackathon's "free services only" rule. Don't add it.

---

## 5. Database setup from scratch

```bash
# 1. Run the whole of supabase/schema.sql in the Supabase SQL editor.
#    It is idempotent — safe to re-run, and re-running is how you apply changes.

# 2. Grievances: 16,071 rows, ~2-3 min
node --env-file=.env.local scripts/ingest-opencity.mjs

# 3. Work orders: 43,492 rows, ~4 min
node --env-file=.env.local scripts/ingest-workorders.mjs

# 4. Public photo records: 16 curated Commons photos, ~30 s
node --env-file=.env.local scripts/ingest-commons.mjs
```

Both ingests are **idempotent** (upsert on `source` + `source_record_id`) — re-running
them does not duplicate anything, and both verify themselves against the database at
the end. Add `--dry-run` to see what they'd do without writing, `--limit N` for a quick
smoke test.

Ward boundaries are a static file already in the repo:
`public/bengaluru-wards.geojson` (198 BBMP wards, 178 KB gzipped). It was built from
the official KML; you do not need to regenerate it.

---

## 6. Where the data comes from

| Dataset | Rows | Licence | Used for |
|---|---|---|---|
| [I Change My City Complaints Log 2019–2022](https://data.opencity.in/dataset/i-change-my-city-data) | 16,071 | CC-BY-SA, Janaagraha via OpenCity | Grievances, wards, agencies, statuses |
| [BBMP Work Orders by Ward 2013–2022](https://data.opencity.in/dataset/bbmp-work-orders-by-ward-2013-2022) | 43,492 | Public Domain | Spend per ward, the money trail |
| [BBMP Ward Information](https://data.opencity.in/dataset/bbmp-ward-information) | 198 polygons | unstated | Ward boundaries for the choropleth |
| [Wikimedia Commons](https://commons.wikimedia.org/) (curated in `scripts/ingest-commons.mjs`) | 16 photos | CC BY / CC BY-SA / CC0, per photo | Public photo records: real geotagged photos of Bengaluru civic problems |

### Public photo records (`source = 'wikimedia_commons'`)

Real photos of real Bengaluru problems (flooding in Tatanagar, sewage foam in the
Bellandur storm drain, burning rubbish at Rampura Lake, potholes in Munnekollal, …),
each credited to its photographer with its licence. They are **standalone records, never
attached to an OpenCity grievance**. What a person chose is the list of files and each
one's category; the location, date, photographer, licence and description come from the
Commons API and are stored untouched in `source_payload`. Severity stays NULL, there is no
reporter and no agency, and they are **excluded from the agency/ward/dashboard figures**
(they were never filed with an agency). They do appear on the map and feed the dedup agent.
Two files have no geotag; they are placed at the locality their caption names and
labelled as such (`location_source = 'locality'`).

Everything joins on the **numeric BBMP ward id (1–198)**, never on ward names — see
§7.

### On grievance photos — we checked, there is no honest source

The imported records have no photos and cannot get them:

- The dataset has no image field and **no complaint id** to join on.
- I Change My City has **no public API**; its pages render client-side and return 0
  bytes to a fetch.
- Swachhata (MoHUA) does before/after photos but publishes no open data.

Even scraped photos could not be matched to our records — any pairing would be
invented, which is the same disqualifying offence as fake numbers. **Do not attach
stock or scraped images to imported records.** Before/after verification works on
citizen reports, which do have photos. That's what you film.

If you want real imagery against imported records, the one honest route is
**Mapillary** (free token, CC-BY-SA): "nearest street-level image to this location" is
a *true* claim. Not built — needs a token.

---

## 7. Data gotchas that will cost you hours

These were all found the hard way. Each one would have silently put a wrong number on
screen.

1. **`created_at` has two formats and both are month-first.**
   `7/31/2022 14:03` and `1-1-2019 06:33`. Parsing the dashed ones as day-first
   corrupts 6,405 timestamps *with no error*. Proof: month-first gives **0**
   chronological inversions against the source's own `_id` ordering; day-first gives
   13,793.

2. **Join on ward id, never ward name.** The datasets transliterate the same places
   differently — Hoodi/Hudi, Ulsoor/Halsoor, Arekere/Arakere, Bilekahalli/Bilekhalli
   and 18 more. Name-joining matches only 176 of 198 wards and silently drops the rest.

3. **Ward `"Other"` is not a place.** It's the dataset's catch-all (`ward_id` 199, 637
   records). Excluded from ward rankings, where it would otherwise read as the
   2nd-busiest ward. See `UNATTRIBUTED_WARD` in `src/lib/domain.ts`.

4. **The work-order dataset ships two different row formats.** One terse
   (`wodetails`/`amount`), one rich (`Name of Work`/`Gross`/`Budget Head`/dates).
   Reading only the first makes 86% of amounts look unparseable. Reading both:
   99.998%.

5. **One work-order resource is misfiled.** `Work Orders for Hebbala(Num-21)` contains
   only ward **022** rows. A row's own `Ward` field wins over the filename;
   `ward_source` records which was used.

6. **…which makes Num-21 and Num-22 byte-identical uploads.** Keying rows by resource
   would store both and **double that ward's spend**. Rows are keyed on a hash of
   their own content — 314 duplicates collapse.

7. **Postgres full-text search ANDs bare terms.** `websearch_to_tsquery('pothole road
   asphalting')` requires all three words and matches nothing. Queries are joined with
   `or` in `toAnyTermsQuery()` and ranked by `ts_rank`.

8. **Gemini's free tier caps requests *per model per day*** (gemini-2.5-flash allows
   20). One agent investigation spends several. `src/lib/server/gemini.ts` walks a
   chain of four function-calling-capable models, each with its own quota bucket —
   observed going three models deep mid-demo. **Budget quota for rehearsals.**

9. **Gemini 3.x rejects a turn whose `functionCall` parts lost their
   `thought_signature`.** The agent loop echoes the model's own content back intact
   rather than rebuilding it.

10. **PostgREST caps responses at 1000 rows.** Never aggregate by fetching rows —
    aggregate in SQL. `getDashboard()` once did this and would have reported
    "Total: 200".

---

## 8. Architecture

```
Browser ──► /api/* (Next route handlers, server-only) ──► Supabase (Postgres + Storage)
                             │
                             └──► Gemini (server-side only, model fallback chain)

Agents (src/lib/agents/)
  triage.ts      one-shot  photo        → category + severity + hazards
  routing.ts     one-shot  issue        → complaint letter
  verifier.ts    one-shot  before/after → fix verified?
  insights.ts    one-shot  aggregates   → summary + predictions
  investigate.ts MULTI-STEP loop with function calling  ◄── the centrepiece
    └─ tools.ts  search_similar_grievances · get_ward_stats
                 get_agency_performance   · get_category_routing
                 search_ward_work_orders   (full-text over 43,492 orders)
```

**All aggregation happens in Postgres**, never by fetching rows (see gotcha 10). RPCs
live in `supabase/schema.sql`: `dashboard_stats`, `agency_stats`, `monthly_trend`,
`hotspot_cells`, `ward_stats`, `ward_choropleth`, `category_agency_counts`,
`ward_spend`, `search_work_orders`.

`src/lib/domain.ts` is the **single source of truth** for categories, statuses,
agencies and city config. Everything in it is derived from the dataset's own values.

### The investigation agent is the differentiator

It plans, calls tools over the live data, recovers when a tool rejects its arguments,
and **renders its tool-call trace in the UI** — the reasoning is inspectable, not
asserted. A verified run on a Hemmigepura pothole:

```
1. search_similar_grievances  → 13 records within 1km · 4 resolved, 9 open
2. get_category_routing       → pothole → BBMP (5,370 records)
3. get_ward_stats             → Hemmigepura: 134 records, 19% resolved (rank 32/197)
4. get_agency_performance     → BBMP: 12,925 records, 36% resolved
5. search_ward_work_orders    → Ward 198: ₹183.71 crore across 422 orders
```

…producing: *"work orders 198-19-000003 (₹5.57 crore) and 198-16-000022 (₹7.63 crore)
were allocated for road improvements and asphalting in this ward"* — both verified to
exist with matching amounts and real contractor names.

---

## 9. Verified numbers (use these to spot regressions)

As of 31 Oct 2026, read from the live database:

```
issues              16,071 imported + 1 test citizen report  (see §12)
work_orders         43,492 across 177 wards
resolution rate     31.4%  (4,937 resolved of 15,739 decided)
still open          10,802
re-opened           332     ← closed out, then raised again
record window       2019-01-01 → 2022-07-31
agencies            BBMP 36% · BTP 30% · BWSSB 7% · BESCOM 5% · BCP 5% · KSPCB 3%
wards               197 named + "Other"; 4 of 197 clear 60% resolution, 28 below 20%
recorded spend      ₹10,571 crore   median order ₹14.95 lakh
worst value         Hemmigepura: ₹183.7cr spent, 108 of 134 grievances still open, 19.4%
                    Kadu Malleshwar: ₹3.14 crore spent per still-open grievance
```

Sanity check that must always hold: `resolved + open + undecided == total`.

---

## 10. Commands

```bash
npm run dev            # dev server on :3000
npm run build          # keep this green
npm run lint           # 6 pre-existing React 19 errors — not ours, don't panic
```

```bash
# Scripts that import app code need the loader (teaches node "@/" and "server-only")
node --import ./scripts/node-loader.mjs --env-file=.env.local scripts/test-tools.mjs
node --import ./scripts/node-loader.mjs --env-file=.env.local scripts/test-agent-recovery.mjs
```

`test-tools.mjs` — 12 assertions of the agent's tools against the live DB: error
contracts, rate arithmetic, radius bounds, alias normalisation, the catch-all ward.
Run it after touching `tools.ts` or the RPCs.

`test-agent-recovery.mjs` — proves the agent loop keeps working when a ward name can't
be matched, and never cites a tool call that failed or never ran.

---

## 11. Deploying to Vercel

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new). Next.js is
   auto-detected; no build config needed.
2. Add all five environment variables from §4 (Production **and** Preview).
3. Deploy. `npm run build` is already green, so a failure means a missing env var.
4. After the first deploy, check `/dashboard` renders real numbers and `/map` loads the
   ward layer — those exercise Supabase and the static GeoJSON respectively.

`DEPLOY-VERCEL.md` has the original longer notes.

---

## 12. State of play

### Done and verified
- Real-data spine: both ingests, full provenance, idempotent
- Ward choropleth over official BBMP boundaries
- Multi-step investigation agent with visible tool-call trace
- Money trail: spend vs outcome, full-text retrieval over work orders
- Edge-case hardening: bad input, no geolocation, API down, AI down, 404s, error
  boundaries — each tested in the browser, not just read
- Landing page, data-grounded Community Hero system

### Not done
- **README with architecture diagram** (required for submission)
- **5–7 slide pitch deck** (required)
- **2–3 min demo video, end-to-end live** (required)
- **Vercel deployment** (required)
- Audio reports — the problem statement says *"visual **or audio** reports"* and we
  only do visual. Gemini handles audio natively; this is a few hours and closes a hole
  a judge could find by reading the brief. **Highest-value remaining feature.**
- Spend-vs-outcome panel on the dashboard. The data and API are in
  (`/api/wards` returns `spend`), the UI is not.

### Decisions waiting for you
- **One test citizen report is in the database** — *"Severe multiple potholes on
  highway"* by **"Test User 1"**, with a real photo and real AI triage. It's a genuine
  submission, not fabricated, but the name will show on the leaderboard. Either rename
  the user or delete the row before the demo. It is `source IS NULL`, so it's the only
  non-imported issue.
- **The hero image** (`public/hero-map.webp`) is decorative, marked `aria-hidden`, and
  the page asserts no geography about it — because nobody has verified the outline is
  Bengaluru. If it isn't, nothing on the page is a false claim, but you may want to
  swap it for a render of the real ward boundaries we now ship.

---

## 13. Demo script that actually lands

1. **Dashboard** — 16,071 real grievances. KSPCB resolves **3%**. 332 grievances were
   re-opened after being closed out.
2. **Map → "Ward resolution rate"** — the city shaded by real performance. Click a red
   ward; the popup gives real counts.
3. **Open an imported grievance → "Verify this record at the source"** — the link
   returns that exact record from the government API. Nothing here is made up.
4. **Run investigation** — watch it choose five tools, then show the trace. Land on:
   *"₹183 crore of work orders in this ward, this pothole still open, ward resolving
   19%."*
5. **File a report live** — photograph something, AI triages it, routes it to BBMP.
   This is why the citizen side looks empty: it's filled on stage, not seeded.
