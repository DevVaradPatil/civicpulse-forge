# Forge — Gen AI Buildathon (context for this repo)

Build window: **2 days**. Top 10 teams present at a grand finale; judges pick two winners,
audience picks one favourite.

## Track chosen

**Theme 1 — Civic Pulse, Digital Governance & Public Information.**

> Democratizing information, modernizing public service delivery, and bridging the gap between
> citizens, regulatory policy, and public institutions.

**Problem (from the track's problem spectrum):**

> **Transparent Civic Grievance & Infrastructure Triage System** — an open platform where citizens
> submit visual or audio reports of localized civic issues (road/bridge damage, pollution, water
> leaks). The system automatically evaluates severity, routes issues to relevant authorities, and
> maintains public accountability dashboards.

## Scoring rubric (100 pts)

| Pillar | Pts | What they look for |
|---|---|---|
| Technical Architecture & Engineering Depth | 20 | Clean modular code, low latency. **Must go beyond frontend wrappers / basic API templates** — custom RAG pipelines, geospatial models, browser automation loops, complex state graphs. |
| **AI Reasoning & Agentic Execution** | **25** | Autonomy & workflow resilience: how the system **plans, executes multi-step tool calls, handles errors, self-corrects**. Model accuracy & guardrails: minimal hallucination, **robust source attribution**. |
| Problem Relevance, Impact & USP | 25 | Real-world value; clear differentiation from off-the-shelf chatbots; innovation & scalability. |
| **Live Demonstration & Robustness** | **30** | Runs live without crashing. Graceful handling of bad input, missing data, flaky network. |

## Hard rules (disqualification)

1. **No dummy data — zero tolerance.** Hardcoded JSON, static mock datasets, or fake placeholder
   numbers are prohibited. Must consume **real-time APIs, live databases, or official open
   datasets** (e.g. IMD, ISRO Bhuvan, Data.gov.in).
2. **No pre-existing projects.** Boilerplate/libraries/SDKs may be reused, but **all core logic,
   AI models, and agent workflows must be built during the hackathon window.**
3. **Every team member must be able to explain the architecture, data flow, and AI logic.**
4. No pre-recorded demos passed off as live.

> **Provenance note for this repo:** the Next.js/Supabase/UI shell is reused as boilerplate from a
> prior civic project by the same author. The core of *this* submission — live open-data ingestion,
> the tool-calling agent loop, grounded source attribution, and the accountability layer — is built
> during the Forge window. Keep this note accurate and be upfront about it if asked.

## Submission checklist

- [ ] Live deployment URL (Vercel)
- [ ] 2–3 min demo video, **end-to-end live**, showing real-time AI reasoning / tool usage / agentic execution
- [ ] Public GitHub repo: clean README with setup + **architecture diagram/flowchart**
- [ ] 5–7 slide pitch deck: Title & Team · Problem & Context · Solution & Key Features ·
      Technical Architecture & Innovation · Roadmap & Live Demo Summary
