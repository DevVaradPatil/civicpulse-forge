# Plan — 2 days

## The pivot: Delhi (seeded fake data) → Bengaluru (real open data)

The prior version seeded ~30 invented issues. Under Forge's zero-tolerance rule that is an
instant disqualification. Verified replacement (live-tested, no API key required):

**OpenCity / I Change My City complaints** — CKAN datastore API
```
https://data.opencity.in/api/3/action/datastore_search?resource_id=a60abf5c-3a15-4967-af32-c3074248580f
```
- **16,071 real citizen grievances**, **100% geo-coded**
- Fields: `created_at, ward_id, ward_title, title, description, location, address,
  latitude, longitude, category_title, sub_category_title, civic_agency_title,
  complaint_status_title, comment_count`
- Real categories: Mobility/Roads · Garbage & Unsanitary Practices · Streetlights ·
  Water Supply · Traffic & Road Safety · Animal Husbandry
- Real statuses: Resolved · Open · Re-opened · On-the-Job · Closed · Rejected
- **Real agencies: BBMP · BWSSB · BTP · KSPCB · BCP** → genuine routing targets

Secondary sources (optional, add only if they earn their keep):
- [BBMP Grievances Data](https://data.opencity.in/dataset/bbmp-grievances-data) — ward-level 2020–2025
- [CPGRAMS on data.gov.in](https://www.data.gov.in/catalog/public-grievance-details-cpgrams-along-feedback-details) — national benchmark (free API key)
- Open-Meteo — keyless live rainfall forecast, to ground waterlogging predictions in real weather

---

## Day 1 — real-data spine (removes the DQ risk)

1. **Ingestion pipeline** `scripts/ingest-opencity.mjs`
   - Pulls live from the CKAN API (paginated), upserts into Supabase.
   - Provenance columns on every row: `source`, `source_record_id`, `source_url`, `ingested_at`.
   - Idempotent — safe to re-run; never invents a field.
2. **Schema changes** (`supabase/schema.sql`)
   - `photo_path` → **nullable** (official records have no photo; only citizen reports do).
   - Add `ward`, `agency`, `source*` columns. Keep an index on `ward` and `agency`.
3. **Re-scope to Bengaluru** — `src/lib/domain.ts`: BENGALURU center/zoom; map our categories onto
   the dataset's real `category_title` values; **derive category→agency from the data**, deleting
   the hardcoded Delhi departments.
4. **UI handles photoless records** — issue card / detail / before-after must not assume a photo.
   Distinguish *official record* vs *citizen report* visually.
5. Dashboard shows **real** numbers: BBMP resolution rate, real wards, hotspots from 16k points.

## Day 2 — agentic depth + anti-hallucination (the 25+25 pts)

6. **Real agent loop** — replace one-shot Gemini calls with **function-calling**: the agent plans,
   invokes tools, handles tool errors, retries/self-corrects, and reports its trace.
   Tools (all over the real dataset):
   - `search_similar_grievances(lat, lng, category, radius)`
   - `get_ward_stats(ward)` → real volume + resolution rate
   - `get_agency_performance(agency)` → real resolved/open split
   - `draft_complaint(issue, evidence)`
   Surface the **tool-call trace** in the UI — that IS the agentic-execution evidence.
7. **Source attribution everywhere** — every AI claim cites real counts and links the source
   record(s). No un-cited numbers anywhere in the product.
8. **Edge-case hardening** (30-pt bucket): no photo, no geolocation, API down, Gemini 429/503,
   empty ward, bad input. Every failure path degrades gracefully with a visible message.

## Keep (already built, still the USP)
- Photo → AI triage → community confirm → **AI before/after fix-verification** → dashboard.
- Map with clustering/filters, dark mode, mobile, toasts.

## Explicitly not doing
- Browser-automation/Playwright agent — that's the track's *problem #3*, not ours. High risk, low fit for 2 days.

## Open questions
- Keep the name **CivicPulse**? Theme 1 is literally titled "Civic Pulse" — the fit is good, but
  decide deliberately.
- Confirm with organizers that reusing the UI/infra shell as boilerplate is acceptable.
