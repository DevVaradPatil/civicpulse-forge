-- CivicPulse — Supabase schema. Run this once in the Supabase SQL Editor.
-- Only the server (service-role key) touches these tables, so RLS is enabled
-- with no policies: the anon key can read/write nothing directly.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- issues
create table if not exists issues (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text default '',
  category      text not null,
  severity      int  not null default 1,
  hazards       text[] not null default '{}',
  status        text not null default 'reported',
  lat           double precision not null,
  lng           double precision not null,
  geohash       text,
  photo_path    text not null,
  confirmations int not null default 0,
  confirmed_by  text[] not null default '{}',
  reporter_id   text,
  reporter_name text,
  ai_confidence double precision,
  resolution    jsonb,
  routing       jsonb,
  seed          boolean not null default false,
  created_at    bigint not null,
  updated_at    bigint not null
);

create index if not exists issues_created_at_idx on issues (created_at desc);
create index if not exists issues_category_idx   on issues (category);
create index if not exists issues_reporter_idx   on issues (reporter_id);

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
