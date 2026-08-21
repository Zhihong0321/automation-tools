-- gmap-recon storage. Verified against the live pg_2nd database, not written
-- from memory: every column, constraint and index below was read back out of
-- information_schema after the tables were created.
--
-- Apply it through the pg-proxy (or psql) against an empty database:
--   POST /api/sql  {"db_name":"pg_2nd","sql":"<this file>","params":[]}
-- Every statement is IF NOT EXISTS, so re-running it is safe.
--
-- WHY THIS FILE EXISTS. The tables were originally created by an ad-hoc script.
-- That meant the only description of the schema lived in a terminal that had
-- already scrolled away, and a wiped database would have had no way back. This
-- is the recreate path.

-- Companies found by a scan. One row per business, not one per sighting: the
-- same shop turns up in many searches and must not be copied each time.
create table if not exists company_data (
  id            bigserial primary key,
  -- Google's own id for the place, parsed out of the maps URL. This is the
  -- dedup key; without it a town rescanned weekly grows a duplicate set a week.
  place_id      text unique,
  name          text not null,
  rating        numeric(2,1),
  -- Null when Maps served a signed-out "limited view", which omits review
  -- counts entirely. Null here is missing data, never zero reviews.
  reviews       integer,
  category      text,
  address       text,
  phone         text,
  website       text,
  maps_url      text,
  source        text not null default 'gmap',
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index if not exists company_data_name_idx  on company_data (lower(name));
create index if not exists company_data_phone_idx on company_data (phone);

-- People attached to a company. Created and indexed now; the research chain
-- (Phase 3) is what fills it. Nothing writes this table yet.
create table if not exists person_data (
  id         bigserial primary key,
  company_id bigint references company_data(id) on delete cascade,
  name       text,
  position   text,
  phone      text,
  email      text,
  address    text,
  -- jsonb rather than a column per network: a contact may have several, and
  -- which networks matter is not settled yet.
  messenger  jsonb,
  source     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists person_data_company_idx on person_data (company_id);
create index if not exists person_data_email_idx   on person_data (lower(email));

-- One row per search a user ran.
create table if not exists search_report (
  id             bigserial primary key,
  -- Who asked. Nullable on purpose: the column is recorded now and populated
  -- later, so the history is not lost when user accounts do arrive.
  user_id        text,
  keyword        text not null,
  place          text,
  query          text not null,
  -- Null when the scan was blocked. See the constraint below — this is the
  -- single most important rule in the system.
  found          integer,
  blocked        boolean not null default false,
  blocked_reason text,
  capped         boolean not null default false,
  -- Maps serves a reduced page to signed-out sessions. Not a block by itself,
  -- but it is what separates two runs that otherwise look identical.
  limited_view   boolean,
  job_id         text,
  worker         text,
  took_ms        integer,
  created_at     timestamptz not null default now(),
  -- Google degrades rather than errors: a throttled search returns an empty or
  -- thin feed with no captcha and no error. Recording that as found = 0 writes
  -- a claim about the town that nothing downstream can tell from the truth, and
  -- afterwards a throttled town is indistinguishable from an empty one. So a
  -- blocked scan carries no count at all, and the database refuses one.
  constraint blocked_scan_has_no_count check (not blocked or found is null)
);
create index if not exists search_report_keyword_idx on search_report (lower(keyword), lower(coalesce(place, '')));
create index if not exists search_report_user_idx    on search_report (user_id);

-- Which companies a given search returned, and where they sat in the feed.
-- Many-to-many because a company appears in many searches over time; `rank` is
-- the feed position, the only ranking signal a scan actually observes.
create table if not exists search_report_company (
  report_id  bigint not null references search_report(id) on delete cascade,
  company_id bigint not null references company_data(id)  on delete cascade,
  rank       integer,
  primary key (report_id, company_id)
);
create index if not exists srcompany_company_idx on search_report_company (company_id);

comment on column search_report.user_id is 'Who asked for the scan. Nullable on purpose: the column is recorded now, populated later.';
comment on column search_report.found is 'Null when blocked. A soft-blocked scan is never written as 0 - see the blocked_scan_has_no_count constraint.';
comment on column company_data.reviews is 'Null when Maps served a signed-out limited view, which omits review counts. Null is missing data, not zero reviews.';

-- A stable public shell around either report workflow. The opaque public id is
-- the share token: report pages do not expose the API bearer token and cannot be
-- enumerated by sequential database ids.
create table if not exists published_report (
  id                      bigserial primary key,
  public_id               text not null unique,
  report_type             text not null check (report_type in ('business_search', 'company_research')),
  status                  text not null default 'queued'
                                  check (status in ('queued', 'running', 'completed', 'partial', 'failed')),
  title                   text,
  user_id                 text,
  request                 jsonb not null default '{}'::jsonb,
  source_search_report_id bigint references search_report(id) on delete set null,
  company_id              bigint references company_data(id) on delete set null,
  job_id                  text,
  result                  jsonb,
  error                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  completed_at            timestamptz
);
create index if not exists published_report_type_idx on published_report (report_type, created_at desc);
create index if not exists published_report_user_idx on published_report (user_id, created_at desc);
create index if not exists published_report_search_idx on published_report (source_search_report_id);
create index if not exists published_report_company_idx on published_report (company_id);

-- Every model round is retained independently for benchmarking. Each round is
-- JSON rather than text so it can carry raw output, parsed fields, validation
-- errors, model metadata and timing without adding a column for every detail.
-- The stable round01..round04 column identities are intentional requirements.
create table if not exists company_research_run (
  report_id        bigint primary key references published_report(id) on delete cascade,
  round01          jsonb,
  round02          jsonb,
  round03          jsonb,
  round04          jsonb,
  validated_ledger jsonb,
  final_report     jsonb,
  round_status     jsonb not null default '{}'::jsonb,
  engine_metadata  jsonb not null default '{}'::jsonb,
  started_at       timestamptz,
  completed_at     timestamptz,
  updated_at       timestamptz not null default now()
);

comment on column published_report.public_id is 'Opaque share id used by the public /r/:id report URL.';
comment on column company_research_run.round01 is 'Raw and parsed Gemini discovery artifact.';
comment on column company_research_run.round02 is 'Raw and parsed ChatGPT audit artifacts, split by contacts/people/signals.';
comment on column company_research_run.round03 is 'Raw and parsed Meta/Muse capability-gated social artifact.';
comment on column company_research_run.round04 is 'Raw final Gemini synthesis plus fidelity validation.';
