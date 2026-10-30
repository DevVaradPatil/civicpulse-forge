# CivicPulse — Transparent Civic Grievance & Infrastructure Triage

> Citizens report a civic issue with one photo. An AI agent pipeline triages it, routes it to the
> real responsible authority, the community verifies it, and the AI confirms the fix from an
> after-photo — while a public dashboard holds agencies accountable.

Built for the **Forge Gen AI Buildathon** — Theme 1: *Civic Pulse, Digital Governance & Public
Information*. Demo scope: **Bengaluru**.

## Why

Civic complaints disappear into a void: fragmented intake, no verification that anything was
fixed, no public accountability. CivicPulse closes that loop and grounds every claim in real,
citable open data.

## Real data, no mocks

The platform ingests **live citizen grievance records** from the
[OpenCity CKAN API](https://data.opencity.in/dataset/i-change-my-city-data) — 16,000+ real,
geo-coded complaints with real wards, categories, civic agencies (BBMP, BWSSB, BTP, KSPCB) and
resolution statuses. Every row stores its `source`, `source_record_id` and `source_url`, so any
number shown in the UI can be traced back to an official record.

## The agent pipeline

| Agent | Type | Role |
|---|---|---|
| **Triage** | Gemini (vision) | Photo → category, severity, hazards |
| **Dedup** | deterministic | Clusters nearby same-category reports (geohash) |
| **Routing** | Gemini + tools | Drafts a complaint to the real responsible agency |
| **Verifier** | Gemini (vision) | Compares before/after photos to confirm the fix |
| **Insights** | Gemini + tools | Ward-level trends and hotspots, with citations |

Gemini is used only where judgment or perception is needed; deduplication, statistics and hotspot
clustering are deterministic code.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · Supabase (Postgres / Storage / anonymous Auth) ·
Gemini 2.5-flash · Leaflet + OpenStreetMap · deployed on Vercel.

## Setup

See **[DEPLOY-VERCEL.md](DEPLOY-VERCEL.md)** for the full walkthrough (Supabase project, schema,
storage bucket, anonymous auth, Vercel deploy).

```bash
npm install
cp .env.example .env.local     # fill in Gemini + Supabase values
npm run dev                    # http://localhost:3000
```

## Repo docs

- [FORGE-HACKATHON.md](FORGE-HACKATHON.md) — track, rubric, rules, submission checklist
- [PLAN.md](PLAN.md) — build plan and data sources
- [CLAUDE.md](CLAUDE.md) — working conventions

## Provenance

The Next.js/Supabase/UI shell is reused as boilerplate from a prior civic project by the same
author. The live open-data ingestion, tool-calling agent loop, grounding/attribution layer and
accountability dashboard in this submission are built during the Forge window.
