-- CivicPulse — Supabase schema. Run this in the Supabase SQL Editor.
-- Re-runnable: the upgrade block near the bottom brings an older database up to date.
-- Only the server (service-role key) touches these tables, so RLS is enabled
-- with no policies: the anon key can read/write nothing directly.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- issues
create table if not exists issues (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text default '',
  category      text not null,
  -- Severity is produced by the AI triage agent on citizen photo reports only.
  -- Ingested official records carry no severity in the source, so it stays NULL
  -- rather than being invented.
  severity      int,
  hazards       text[] not null default '{}',
  status        text not null default 'reported',
  lat           double precision not null,
  lng           double precision not null,
  geohash       text,
  -- Only citizen reports have a photo; official open-data records do not.
  photo_path    text,
  -- A spoken report instead of (or alongside) a photo. The problem statement
  -- asks for visual OR audio reports, and speaking removes the need to type,
  -- or to type in English.
  audio_path      text,
  transcript      text,
  transcript_lang text,
  -- How lat/lng was obtained for a citizen report: 'device' (GPS) or
  -- 'approximate' (the reporter accepted a city-centre pin because their
  -- device would not give a fix). Null on ingested records, whose coordinates
  -- come from the source. The UI must not show an approximate pin as exact.
  location_source text,
  confirmations int not null default 0,
  confirmed_by  text[] not null default '{}',
  reporter_id   text,
  reporter_name text,
  ai_confidence double precision,
  resolution    jsonb,
  routing       jsonb,
  seed          boolean not null default false,
  created_at    bigint not null,
  updated_at    bigint not null,

  -- ---- real-world routing (from the source dataset, never invented) ----
  ward          text,
  agency        text,

  -- ---- provenance: every ingested row is traceable to its source record ----
  source           text,   -- e.g. 'opencity'
  source_record_id text,   -- the record's id within that source
  source_url       text,   -- a URL that returns exactly this record
  source_payload   jsonb,  -- the untouched source record
  ingested_at      bigint
);

-- ------------------------------------------------------- upgrade (idempotent)
-- Brings a database created by an earlier version of this file up to date.
-- No-ops on a fresh database, where the table above already has everything.
alter table issues add column if not exists ward             text;
alter table issues add column if not exists agency           text;
alter table issues add column if not exists source           text;
alter table issues add column if not exists source_record_id text;
alter table issues add column if not exists source_url       text;
alter table issues add column if not exists source_payload   jsonb;
alter table issues add column if not exists ingested_at       bigint;
alter table issues add column if not exists location_source  text;
alter table issues add column if not exists audio_path       text;
alter table issues add column if not exists transcript       text;
alter table issues add column if not exists transcript_lang  text;
alter table issues alter column photo_path drop not null;
alter table issues alter column severity   drop not null;
alter table issues alter column severity   drop default;

create index if not exists issues_created_at_idx on issues (created_at desc);
create index if not exists issues_category_idx   on issues (category);
create index if not exists issues_reporter_idx   on issues (reporter_id);
create index if not exists issues_ward_idx       on issues (ward);
create index if not exists issues_agency_idx     on issues (agency);
create index if not exists issues_status_idx     on issues (status);

-- Makes ingestion idempotent: re-running the importer upserts instead of duplicating.
create unique index if not exists issues_source_record_idx
  on issues (source, source_record_id);

-- ---------------------------------------------------------------- users
create table if not exists users (
  uid           text primary key,
  display_name  text default 'Anonymous',
  photo_url     text,
  points        int not null default 0,
  report_count  int not null default 0,
  confirm_count int not null default 0,
  resolve_count int not null default 0,
  updated_at    bigint not null default 0
);

create index if not exists users_points_idx on users (points desc);

-- ------------------------------------------------- meta (insights cache)
create table if not exists meta (
  key   text primary key,
  value jsonb
);

alter table issues enable row level security;
alter table users  enable row level security;
alter table meta   enable row level security;

-- ------------------------------------------------------------ functions
-- Atomic points award (replaces Firestore FieldValue.increment).
create or replace function award_points(p_uid text, p_name text, p_action text)
returns void
language plpgsql
security definer
as $$
declare
  pts int := case p_action when 'report' then 10 when 'confirm' then 5 when 'resolve' then 20 else 0 end;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  insert into users (uid, display_name, points, report_count, confirm_count, resolve_count, updated_at)
  values (
    p_uid,
    coalesce(nullif(btrim(p_name), ''), 'Anonymous'),
    pts,
    case when p_action = 'report'  then 1 else 0 end,
    case when p_action = 'confirm' then 1 else 0 end,
    case when p_action = 'resolve' then 1 else 0 end,
    now_ms
  )
  on conflict (uid) do update set
    display_name  = coalesce(nullif(btrim(p_name), ''), users.display_name),
    points        = users.points + pts,
    report_count  = users.report_count  + case when p_action = 'report'  then 1 else 0 end,
    confirm_count = users.confirm_count + case when p_action = 'confirm' then 1 else 0 end,
    resolve_count = users.resolve_count + case when p_action = 'resolve' then 1 else 0 end,
    updated_at    = now_ms;
end;
$$;

-- Atomic, idempotent community confirm (replaces the Firestore transaction).
create or replace function confirm_issue(p_id uuid, p_uid text, p_threshold int)
returns jsonb
language plpgsql
security definer
as $$
declare
  r issues%rowtype;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select * into r from issues where id = p_id for update;
  if not found then
    return null;
  end if;

  if p_uid is not null and p_uid = any(coalesce(r.confirmed_by, '{}'::text[])) then
    return jsonb_build_object('issue', to_jsonb(r), 'counted', false);
  end if;

  update issues set
    confirmations = coalesce(confirmations, 0) + 1,
    confirmed_by  = case when p_uid is null then confirmed_by
                         else array_append(coalesce(confirmed_by, '{}'::text[]), p_uid) end,
    status        = case when status = 'reported'
                          and coalesce(confirmations, 0) + 1 >= p_threshold
                         then 'verified' else status end,
    updated_at    = now_ms
  where id = p_id
  returning * into r;

  return jsonb_build_object('issue', to_jsonb(r), 'counted', true);
end;
$$;

-- ---------------------------------------- derived category → agency routing
-- Which agencies actually handle which category, counted from the ingested
-- records. The routing agent reads this instead of a hardcoded department
-- list, so every routing target is backed by real grievances.
create or replace function category_agency_counts()
returns table (category text, agency text, n bigint)
language sql
stable
as $$
  select i.category, i.agency, count(*) as n
  from issues i
  where i.agency is not null
  group by i.category, i.agency
  order by i.category, count(*) desc;
$$;

-- Ward-level volume and resolution rate, straight from the real rows.
create or replace function ward_stats()
returns table (ward text, total bigint, resolved bigint, open bigint)
language sql
stable
as $$
  select i.ward,
         count(*)                                              as total,
         count(*) filter (where i.status = 'resolved')          as resolved,
         count(*) filter (where i.status in ('reported','reopened','in_progress','verified')) as open
  from issues i
  where i.ward is not null
    and i.source is distinct from 'wikimedia_commons' and not i.seed
  group by i.ward
  order by count(*) desc;
$$;

-- ===================================================== dashboard aggregates
-- These run in Postgres over EVERY row. The dashboard must never aggregate a
-- page of rows fetched into the app: with 16k+ records that would silently
-- report numbers computed from a 200-row window.
--
-- Public photo records (source 'wikimedia_commons', scripts/ingest-commons.mjs)
-- are excluded here: they document real problems but were never filed with an
-- agency, so counting them as open grievances would misstate every rate below.
-- Demo seed rows (seed = true, scripts/seed-demo-users.mjs) are excluded too:
-- they are invented and must never move a real figure.

-- Headline counts. `undecided` (rejected + closed) is reported separately so a
-- resolution rate can exclude it instead of quietly counting it either way.
create or replace function dashboard_stats()
returns json
language sql
stable
as $$
  select json_build_object(
    'total',     count(*),
    'resolved',  count(*) filter (where status = 'resolved'),
    'open',      count(*) filter (where status in ('reported','verified','in_progress','reopened')),
    'undecided', count(*) filter (where status in ('rejected','closed')),
    -- Records with no AI severity rating (every ingested official record).
    'unrated',   count(*) filter (where severity is null),
    'officialRecords', count(*) filter (where source is not null),
    'citizenReports',  count(*) filter (where source is null),
    'byStatus', coalesce((
      select json_object_agg(s.status, s.n)
      from (select status, count(*) n from issues
            where source is distinct from 'wikimedia_commons' and not seed group by status) s
    ), '{}'::json),
    'byCategory', coalesce((
      select json_object_agg(c.category, c.n)
      from (select category, count(*) n from issues
            where source is distinct from 'wikimedia_commons' and not seed group by category) c
    ), '{}'::json),
    -- Buckets match severityMeta() in src/lib/domain.ts.
    'bySeverity', json_build_object(
      'low',      count(*) filter (where severity >= 1 and severity < 3),
      'med',      count(*) filter (where severity >= 3 and severity < 4),
      'high',     count(*) filter (where severity >= 4 and severity < 5),
      'critical', count(*) filter (where severity >= 5)
    ),
    'windowStart', min(created_at),
    'windowEnd',   max(created_at)
  )
  from issues
  where source is distinct from 'wikimedia_commons' and not seed;
$$;

-- Per-agency accountability. A NULL agency row means the source never assigned
-- one; it is surfaced as "Unassigned" rather than dropped.
create or replace function agency_stats()
returns table (agency text, total bigint, resolved bigint, open bigint, undecided bigint)
language sql
stable
as $$
  select i.agency,
         count(*)                                        as total,
         count(*) filter (where i.status = 'resolved')    as resolved,
         count(*) filter (where i.status in ('reported','verified','in_progress','reopened')) as open,
         count(*) filter (where i.status in ('rejected','closed')) as undecided
  from issues i
  where i.source is distinct from 'wikimedia_commons' and not i.seed
  group by i.agency
  order by count(*) desc;
$$;

-- Volume per calendar month, ending at the most recent record in the data
-- rather than at today's date — so the chart reflects the data it has instead
-- of showing an empty "this week". Months are bucketed in Asia/Kolkata, the
-- grievances' own local time.
create or replace function monthly_trend(p_months int default 12)
returns table (label text, n bigint)
language sql
stable
as $$
  with bounds as (
    select date_trunc(
             'month',
             to_timestamp(max(created_at) / 1000.0) at time zone 'Asia/Kolkata'
           ) as last_month
    from issues
    where source is distinct from 'wikimedia_commons' and not seed
  ),
  months as (
    select generate_series(
             (select last_month from bounds) - ((greatest(p_months, 1) - 1) || ' months')::interval,
             (select last_month from bounds),
             '1 month'::interval
           ) as m
  )
  select to_char(mo.m, 'Mon YYYY') as label,
         count(i.id)               as n
  from months mo
  left join issues i
    on date_trunc('month', to_timestamp(i.created_at / 1000.0) at time zone 'Asia/Kolkata') = mo.m
   and i.source is distinct from 'wikimedia_commons' and not i.seed
  group by mo.m
  order by mo.m;
$$;

-- Recurring-issue clusters by geohash prefix (precision 6 ~ 1.2km cells).
create or replace function hotspot_cells(
  p_precision int default 6,
  p_min       int default 2,
  p_limit     int default 5
)
returns table (
  cell         text,
  lat          double precision,
  lng          double precision,
  n            bigint,
  open_count   bigint,
  top_category text
)
language sql
stable
as $$
  select substr(i.geohash, 1, p_precision)        as cell,
         avg(i.lat)                               as lat,
         avg(i.lng)                               as lng,
         count(*)                                 as n,
         count(*) filter (where i.status in ('reported','verified','in_progress','reopened')) as open_count,
         mode() within group (order by i.category) as top_category
  from issues i
  where i.geohash is not null and length(i.geohash) >= p_precision
    and i.source is distinct from 'wikimedia_commons' and not i.seed
  group by substr(i.geohash, 1, p_precision)
  having count(*) >= p_min
  order by count(*) desc
  limit p_limit;
$$;

-- ------------------------------------------------- ward choropleth (by id)
-- Ward statistics keyed by the source's own numeric ward_id, which is what
-- the BBMP ward boundary file (public/bengaluru-wards.geojson) is keyed on.
-- Joining on the id rather than the name matters: the two sources transliterate
-- the same places differently (Hoodi/Hudi, Ulsoor/Halsoor, Arekere/Arakere), so
-- a name join would silently drop ~22 of the 198 wards.
--
-- Reads ward_id out of source_payload, so no re-ingest is needed. Citizen
-- reports have no source_payload and are therefore not in this result; they
-- are mapped as individual pins, not as ward shading.
create or replace function ward_choropleth()
returns table (
  ward_id  int,
  ward     text,
  total    bigint,
  resolved bigint,
  open     bigint
)
language sql
stable
as $$
  select (i.source_payload ->> 'ward_id')::int                  as ward_id,
         min(i.ward)                                            as ward,
         count(*)                                               as total,
         count(*) filter (where i.status = 'resolved')           as resolved,
         count(*) filter (where i.status in ('reported','verified','in_progress','reopened')) as open
  from issues i
  where i.source_payload ->> 'ward_id' ~ '^[0-9]+$'
  group by (i.source_payload ->> 'ward_id')::int
  order by 1;
$$;

-- ===================================================== work orders (spend)
-- BBMP Work Orders by Ward, 2013-2022 (OpenCity, Public Domain). One row per
-- recorded work order. Joined to grievances on the ward number, the same key
-- the ward boundaries use, so spend and outcome can be set against each other.
create table if not exists work_orders (
  id            uuid primary key default gen_random_uuid(),
  ward_id       int  not null,
  ward          text,
  wo_num        text,
  details       text not null default '',
  contractor    text,
  -- Rupees as published. amount is the gross; nett is after deduction.
  amount        numeric,
  nett          numeric,
  deduction     numeric,

  -- Present only in the richer of the dataset's two row formats.
  budget_head   text,
  office        text,
  started_on    bigint,
  ended_on      bigint,

  -- How the ward was determined. Some resources are misfiled: the one named
  -- Hebbala Num-21 holds only ward 022 rows, so a row's own Ward field wins
  -- where it exists, and this records which source was believed.
  ward_source   text,

  source           text not null,
  source_record_id text not null,
  source_url       text,
  source_payload   jsonb,
  ingested_at      bigint
);

create index if not exists work_orders_ward_idx on work_orders (ward_id);
create unique index if not exists work_orders_source_idx
  on work_orders (source, source_record_id);

-- Lexical retrieval over the work descriptions. This is what lets the agent
-- ask "was anything actually built here?" and get ranked, cited rows back
-- rather than a guess.
create index if not exists work_orders_details_fts
  on work_orders using gin (to_tsvector('english', details));

-- Spend per ward, for the spend-vs-outcome view.
create or replace function ward_spend()
returns table (
  ward_id     int,
  ward        text,
  orders      bigint,
  total_amount numeric,
  median_amount numeric
)
language sql
stable
as $$
  select w.ward_id,
         min(w.ward)                                                  as ward,
         count(*)                                                     as orders,
         coalesce(sum(w.amount), 0)                                   as total_amount,
         percentile_cont(0.5) within group (order by w.amount)        as median_amount
  from work_orders w
  group by w.ward_id
  order by coalesce(sum(w.amount), 0) desc;
$$;

-- Ranked search over one ward's work orders. Falls back to returning the
-- largest orders when the query matches nothing, so the agent always learns
-- something about the ward instead of getting an empty result it might read
-- as "no work was done".
create or replace function search_work_orders(
  p_ward_id int,
  p_query   text default null,
  p_limit   int  default 5
)
returns table (
  wo_num     text,
  details    text,
  contractor text,
  amount     numeric,
  rank       real,
  matched    boolean
)
language sql
stable
as $$
  with q as (
    select case
             when p_query is null or btrim(p_query) = '' then null
             else websearch_to_tsquery('english', p_query)
           end as tsq
  ),
  hits as (
    select w.wo_num, w.details, w.contractor, w.amount,
           ts_rank(to_tsvector('english', w.details), (select tsq from q)) as rank,
           true as matched
    from work_orders w
    where w.ward_id = p_ward_id
      and (select tsq from q) is not null
      and to_tsvector('english', w.details) @@ (select tsq from q)
    order by rank desc, w.amount desc nulls last
    limit p_limit
  )
  select * from hits
  union all
  select w.wo_num, w.details, w.contractor, w.amount, 0::real, false
  from work_orders w
  where w.ward_id = p_ward_id
    and not exists (select 1 from hits)
  order by matched desc, rank desc, amount desc nulls last
  limit p_limit;
$$;

alter table work_orders enable row level security;
