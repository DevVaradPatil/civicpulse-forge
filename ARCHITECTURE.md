# CivicPulse — architecture & Q&A brief

Everything you need to answer any question about this project. Read once before you present.

**Live:** https://civicpulse-forge.vercel.app · **Repo:** DevVaradPatil/civicpulse-forge

---

## 1. What this is, in one paragraph

Citizens report civic issues by photo or by **speaking in their own Indian language**. An AI
agent pipeline triages, deduplicates, routes to the real responsible agency, and investigates —
and the investigation is the differentiator: it joins the grievance against **what the city
actually spent in that ward**, using 43,492 real BBMP work orders. A public dashboard then holds
each agency to its own resolution rate. No number in the product is invented.

---

## 2. The data (all real, all traceable)

| Source | Rows | What it gives |
|---|---|---|
| OpenCity — I Change My City complaints 2019–2022 | **16,071** | the grievances |
| OpenCity — BBMP work orders 2013–2022 | **43,492** (₹10,571 crore) | the money trail |
| OpenCity — BBMP ward information | **198** polygons | the choropleth |
| Wikimedia Commons (curated, 16 files) | **16** | credited real photos |

All three OpenCity sets join on the **numeric BBMP ward id**, never ward names.

**Headline figures (live):** 16,072 records · 10,803 open · 4,937 resolved · **31.4%** ·
332 re-opened.

**Agency resolution:** BBMP 36% (12,925) · BTP 30% (953) · BWSSB 7% (659) · BESCOM 5% (241) ·
BCP 5% (146) · **KSPCB 3%** (437).

**The money-vs-outcome headline:**
- **Hemmigepura** (ward 198) — ₹183.7 crore across 422 work orders · 134 grievances · 108 open · **19.4%** resolved
- **Ullalu** (ward 130) — ₹223.1 crore across 481 orders · 98 grievances · **19.6%** resolved

Every imported row carries `source`, `source_record_id`, `source_url`, `source_payload`,
`ingested_at`. Each issue page links **"Verify this record at the source"**, which returns that
exact row from the government API.

---

## 3. Architecture

```
Citizen ─ photo ──────────────┐
        └ voice (22 langs) ─► Sarvam Saaras STT ─┐
                                                 ▼
                     Next.js 16 route handlers (server-only)
                                                 │
        ┌────────────────────────────────────────┼─────────────────────┐
        ▼                                        ▼                     ▼
   Triage agent                        Investigation agent        Insights agent
 category·severity·hazards          plans → calls 5 tools        dashboard summary
                                     → self-corrects
                                            │
                                            ▼
                            ┌───── 5 function-calling tools ─────┐
                            │ search_similar_grievances          │
                            │ search_ward_work_orders  (FTS)     │
                            │ get_ward_stats                     │
                            │ get_agency_performance             │
                            │ get_category_routing               │
                            └────────────────┬───────────────────┘
                                             ▼
                        Supabase Postgres — 11 SQL RPCs, GIN full-text index
                        issues (16k) · work_orders (43k) · users · meta
                                             ▲
                     ingest scripts ─────────┘  (OpenCity CKAN API)
```

**Why every aggregate is an RPC:** with 16k+ rows, counting in the app means counting whatever
page happened to load. `dashboard_stats`, `ward_stats`, `agency_stats`, `monthly_trend`,
`hotspot_cells`, `ward_choropleth`, `ward_spend` all run in Postgres over every row.

**The 11 RPCs:** `award_points`, `confirm_issue`, `category_agency_counts`, `ward_stats`,
`dashboard_stats`, `agency_stats`, `monthly_trend`, `hotspot_cells`, `ward_choropleth`,
`ward_spend`, `search_work_orders`.

---

## 4. The agent loop (the 25-point pillar)

`src/lib/agents/investigate.ts` — **not** a one-shot prompt.

- **Two phases.** Phase 1: a tool-calling loop, `MAX_ROUNDS = 5`, `MAX_TOOL_CALLS = 8`.
  Phase 2: a separate structured-synthesis call with a `responseSchema`, so the conclusion is
  typed JSON, not prose we parse.
- **Tools never throw.** A bad argument returns `{ error, hint, did_you_mean }`. The agent reads
  the hint and retries — and the UI prints *"Rejected — the agent corrected itself."*
- **Every claim is attributed.** The Evidence list tags each statement with the tool call that
  produced it (`from search_ward_work_orders(ward_id: 198)`).
- **It plans.** In a recorded run it issued `search_ward_work_orders(query: "road asphalting
  pothole")`, read the description, then re-queried with `query: "BEML Layout road"`.
- **Output:** conclusion + evidence + a drafted complaint naming real contracts and contractors
  (e.g. 198-20-000016, ₹1.71 crore to M/S KRIDL).
- Cached in the `meta` table as `investigation:<issue-id>`; `?refresh=1` forces a fresh run.

**Deterministic wherever possible.** Dedup is geohash + 250 m radius, not an LLM. Stats, hotspots
and category→agency routing are counted in SQL. The LLM is used only where judgement is needed.

---

## 5. Models & why

| Need | Choice | Why |
|---|---|---|
| Reasoning / agent | **Gemini 3.5 Flash** + 4-model fallback | free tier is **per model per day**; one investigation spends several calls, so a single model cannot carry a demo. Chain: 3.5-flash → 2.5-flash → 3.1-flash-lite → 2.5-flash-lite, each with its own quota bucket. |
| Speech → text | **Sarvam AI Saaras v4** | 22 Indian languages with auto-detect; keeps audio off the Gemini quota. |
| Map | **Leaflet + OpenStreetMap** | no API key, no billing account — the rules require free services. Google Maps Platform requires billing. |
| DB / storage / auth | **Supabase** | Postgres (so aggregation is SQL), private Storage bucket, anonymous auth. |
| Hosting | **Vercel** | Next.js 16 App Router, server-only secrets, auto-deploy on push. |

---

## 6. Security / correctness posture

- Gemini and Supabase are **server-side only**. The browser only ever calls our own `/api/*`.
- RLS is on with **no policies**; the anon key cannot read or write any table directly.
- Storage bucket is **private**; media is streamed through `/api/media`, which allowlists the
  `issues/`, `resolutions/` and `audio/` prefixes.
- Geolocation **refuses to guess** — denial is disclosed and the pin is opt-in, stored in
  `location_source`.

---

## 7. Ten real challenges (pick 2–3 if asked)

1. **Two date formats, both month-first.** The dataset mixes separators. Parsing day-first gives
   **13,793 chronological inversions** against the source's own `_id` order; month-first gives
   **0**. Guessing wrong silently corrupts 6,405 timestamps.
2. **Work orders have two different row schemas.** Reading one gave **13.6%** of amounts; reading
   both gives **99.998%**.
3. **A misfiled, byte-identical duplicate resource.** `Hebbala(Num-21)` actually holds ward 022
   rows. Keying on a content hash collapsed **314 duplicates** — avoiding a **₹53 crore**
   double-count on 12 wards alone.
4. **Ward names don't match across datasets** (Hoodi/Hudi, Ulsoor/Halsoor). A name join silently
   drops **22 of 198** wards. We join on the numeric ward id.
5. **Aggregating in the app was wrong.** The dashboard was summing a 200-row page and reporting it
   as the total. All aggregation moved into SQL RPCs. PostgREST also caps at 1,000 rows, which
   silently truncated a `.limit(6000)`.
6. **Gemini free tier is per model per day.** Hence the four-model fallback chain.
7. **Gemini 3.x requires `thought_signature`** to be echoed back. Rebuilding the parts ourselves
   returned 400; we echo the model's own content object intact.
8. **CARTO basemaps started requiring a key** — and failed with **HTTP 200** plus a 2 KB
   "APIKEY REQUIRED" watermark tile, invisible to any status-code check. Found by looking at the
   deployed map. Switched to OSM.
9. **No joinable image source exists.** The grievance dataset has no complaint id; I Change My City
   has no public API. Attaching stock photos would be fabrication, so imported records show no
   photo, and real photos come from Wikimedia Commons as separate, credited records.
10. **The storage bucket was public** — every citizen photo readable by URL. Found while testing
    audio; made private, with media served through the proxy.

---

## 8. Q&A bank

**"Is any of this data fake?"**
> The grievances, work orders, ward boundaries and every statistic are real open data. The
> leaderboard accounts are seed data to show the gamification UI — disclosed in the footer on
> every page, excluded from every dashboard, ward and agency figure, and excluded from the
> agent's evidence so it can never cite one. Their photos are real credited Commons photos.

**"How is this different from a chatbot on top of a dataset?"**
> A chatbot answers from the text you give it. This plans, calls five tools against a live
> Postgres database, recovers from its own bad arguments, and joins a complaint against ₹10,571
> crore of work orders to say what was already spent. No off-the-shelf chatbot can tell you
> Hemmigepura spent ₹183.7 crore and still has 108 of 134 grievances open.

**"What stops it hallucinating?"**
> Three things. Tools return structured rows, not prose. Phase 2 is a schema-constrained call, so
> the output shape is enforced. And every claim in Evidence is tagged with the tool call that
> produced it — if a claim has no tool behind it, you can see that.

**"Why Gemini and not GPT/Claude?"**
> Free tier, and it's per model per day, which let us build a four-model fallback so a demo can't
> be killed by one quota. Nothing in the agent is Gemini-specific — it's standard function calling.

**"How does it scale to another city?"**
> `src/lib/domain.ts` is the single source of truth for categories, statuses and city config, and
> the ingest scripts are CKAN-generic. A new city needs its own dataset ids and ward polygons;
> the agent, the RPCs and the UI are unchanged.

**"What's the latency?"**
> Tool calls are 300–900 ms each against Postgres. A full 6-call investigation runs ~48 s
> end-to-end, dominated by model round-trips. Cached afterwards, so re-opening is instant.

**"What would you do next?"**
> Wire the spend-vs-outcome contrast into the dashboard as a first-class panel — the data and the
> `ward_spend` RPC already exist, only the UI is missing. Then before/after photo verification at
> scale, and SMS/WhatsApp intake for citizens who won't install anything.

**"Did you build this during the hackathon?"**
> The Next.js/Supabase/UI shell is reused boilerplate from a prior civic project by the same
> author, and we say so in the README. The ingestion, the agent loop and its tools, the grounding
> and attribution layer, the work-order money trail and the accountability dashboard are all new.

---

## 9. Repo map

```
src/app/            / · /report · /map · /dashboard · /leaderboard · /issue/[id] · /api/*
src/lib/agents/     triage · routing · verifier · insights · investigate + tools
src/lib/server/     supabase · issues · users · stats · insights · storage · gemini · sarvam · auth
src/lib/domain.ts   categories, statuses, severity, agencies, city config — single source of truth
supabase/schema.sql tables + 11 RPCs (idempotent; run in the SQL editor)
scripts/            ingest-opencity · ingest-workorders · ingest-commons · seed-demo-users
                    test-tools · test-agent-recovery
```

**Self-checks:** `scripts/test-tools.mjs` (12 assertions of the agent's tools against the live DB)
and `scripts/test-agent-recovery.mjs` (the loop recovers from a tool error and never cites a call
that failed or never ran).
