# CivicPulse — CLAUDE.md

Transparent civic grievance & infrastructure triage platform, built for the **Forge Gen AI
Buildathon, Theme 1 (Civic Pulse, Digital Governance & Public Information)**.

Citizens report civic issues (roads, water leaks, streetlights, waste) with a photo; an AI agent
pipeline triages, deduplicates, routes to the real responsible agency, tracks resolution, and
verifies the fix from an after-photo. A public dashboard holds agencies accountable.

- **Hackathon rules, rubric, submission checklist:** [FORGE-HACKATHON.md](FORGE-HACKATHON.md)
- **Current build plan:** [PLAN.md](PLAN.md)
- **Deploy/setup:** [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md)

## Hard constraints

- **NO DUMMY DATA — zero tolerance, instant disqualification.** Never seed, invent, mock, or
  hardcode records, counts, or placeholder numbers. All data comes from live APIs / official open
  datasets, with provenance stored on the row (`source`, `source_record_id`, `source_url`).
  If a number appears in the UI, it must be traceable to a real record.
- **Core logic must be built during the hackathon window.** The Next.js/Supabase/UI shell is reused
  boilerplate; ingestion, the agent loop, and the grounding layer are new work.
- **Free services only** — no paid tiers, no billing accounts.
- **UI: minimal, modern, NO gradients, flat solid colors.** Tokens live in `src/app/globals.css`
  (`@theme`) — use them (`bg-brand`, `text-muted`, `bg-sev-high`), never hardcoded hex.
- **Demo scope: Bengaluru** (that's where the real open grievance data is).

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**, deployed on **Vercel**.
- **Tailwind v4** (CSS `@theme` in `globals.css`; no `tailwind.config.js`).
- **Supabase**: Postgres (data), Storage (private `media` bucket), Auth (**anonymous**;
  access tokens verified server-side).
- **Gemini** (`gemini-2.5-flash`, server-side only — 2.0-flash is zeroed on the free tier).
- **Leaflet + OpenStreetMap** + markercluster. lucide-react, react-hot-toast.
- Real data: **OpenCity CKAN API** (see PLAN.md for the endpoint).

## Layout

- `src/app/` — `/`, `/report`, `/map`, `/dashboard`, `/leaderboard`, `/profile`, `/u/[uid]`,
  `/issue/[id]`, and `/api/*`.
- `src/lib/agents/` — Gemini agents (triage, routing, verifier, insights).
- `src/lib/server/` — supabase, issues, users, stats, insights, storage, gemini, auth.
- `src/lib/domain.ts` — categories, statuses, severity, city config. **Single source of truth.**
- `supabase/schema.sql` — tables + atomic RPCs (`award_points`, `confirm_issue`). Run in SQL editor.
- `scripts/` — data ingestion + maintenance utilities.

## Commands

- `npm run dev` · `npm run build` (keep green) · `npm run lint`
- `node --env-file=.env.local scripts/<script>.mjs`

## Conventions

- Gemini / Supabase access is **server-side only** (route handlers + service-role key). The client
  only ever calls our own `/api/*`.
- Tailwind v4 doesn't detect dynamic class names — map tokens to **literal** class strings
  (see `ui/badge.tsx`).
- Every AI-surfaced claim must carry **source attribution**. No un-cited numbers.
- Prefer deterministic code over an LLM call wherever it's possible (dedup, stats, hotspots).
