// Durable storage for published search and company-intelligence reports.
//
// Railway should provide DATABASE_URL by linking the Postgres service. The HTTP
// pg-proxy remains a supported fallback for the existing deployment, but its
// bearer is short-lived and therefore not the preferred production path.
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number | null;
}

let pool: InstanceType<typeof Pool> | null = null;
let migrated: Promise<void> | null = null;

function directConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function proxyConfigured(): boolean {
  return Boolean(process.env.PG_PROXY_URL?.trim() && process.env.PG_DB_NAME?.trim() && process.env.PG_PROXY_TOKEN?.trim());
}

export function configured(): boolean {
  return directConfigured() || proxyConfigured();
}

function directPool(): InstanceType<typeof Pool> {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.REPORT_DB_POOL_MAX ?? 4),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

/**
 * Stringify a value for a ::jsonb parameter, with lone surrogates repaired.
 *
 * Postgres REJECTS a lone surrogate in json. JSON.stringify escapes one as
 * "\ud83c", which is legal JSON syntax and illegal json data, and the error that
 * comes back is the bare "invalid input syntax for type json" -- naming no column,
 * no value and no row.
 *
 * They arrive from any pipeline that slices scraped text at a fixed length: an
 * emoji is a surrogate PAIR, so `body.slice(0, 420)` can cut one in half. Measured
 * on one 576-ad capture: 20 slices ended on a split emoji. It is invisible in
 * testing because writing a lone surrogate to a UTF-8 file silently replaces it --
 * only the database ever sees the broken half.
 *
 * toWellFormed() replaces each with U+FFFD. Applied through a replacer so it
 * reaches every nested string, not just the top level.
 */
const jsonParam = (value: unknown): string =>
  JSON.stringify(value ?? null, (_k, v) => (typeof v === 'string' ? v.toWellFormed() : v)) ?? 'null';

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
  if (directConfigured()) {
    const out = await directPool().query(text, params);
    return { rows: out.rows as T[], rowCount: out.rowCount };
  }
  if (!proxyConfigured()) {
    throw new Error('report database is not configured; link DATABASE_URL or set PG_PROXY_URL, PG_DB_NAME and PG_PROXY_TOKEN');
  }
  const base = process.env.PG_PROXY_URL!.replace(/\/+$/, '');
  const response = await fetch(base + '/api/sql', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + process.env.PG_PROXY_TOKEN,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ db_name: process.env.PG_DB_NAME, sql: text, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error('pg-proxy ' + response.status + ': ' + body.slice(0, 300));
  const out = JSON.parse(body) as QueryResult<T>;
  return { rows: out.rows ?? [], rowCount: out.rowCount ?? out.rows?.length ?? 0 };
}

/**
 * The company-identity rule, in SQL, kept as constants for two reasons.
 *
 * One: worker/db.mjs implements the same rule in JavaScript and the two must not
 * drift — placeKey() there, these two here.
 *
 * Two: NO BACKSLASHES. An earlier version of this migration spelled the regexes
 * `\s+` and `(^|\s)` inside a JS template literal, where `\s` is not an escape
 * sequence and collapses to a bare `s`. Postgres received `'s+'` and `'(^|s)'`,
 * matched nothing, and every merge statement silently updated zero rows. POSIX
 * classes say the same thing with no character a template literal can eat.
 */
const nameKeySql = (col = 'name') =>
  "regexp_replace(regexp_replace(lower(btrim(" + col + ")), '[.,''\"`]', '', 'g'), '[[:space:]]+', ' ', 'g')";
export const NAME_KEY_SQL = nameKeySql();

/** Suffixes a company registry issues. A storefront name carries none of them. */
export const REGISTERED_SQL =
  "~* '(^|[[:space:]])(sdn[[:space:]]*bhd|sendirian[[:space:]]+berhad|berhad|bhd|plt|llp|pte[[:space:]]*ltd|ltd|limited|inc|incorporated|corp|corporation|gmbh|pty)$'";

/** Apply only the report-owned schema. The historical core schema remains in schema.sql. */
export function migrate(): Promise<void> {
  if (migrated) return migrated;
  migrated = (async () => {
    await sql(`
      create table if not exists published_report (
        id bigserial primary key,
        public_id text not null unique,
        report_type text not null check (report_type in ('business_search', 'company_research', 'person_research', 'ads_research', 'ads_market')),
        status text not null default 'queued'
          check (status in ('queued', 'running', 'completed', 'partial', 'failed')),
        title text,
        user_id text,
        request jsonb not null default '{}'::jsonb,
        source_search_report_id bigint references search_report(id) on delete set null,
        company_id bigint references company_data(id) on delete set null,
        job_id text,
        result jsonb,
        error text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        completed_at timestamptz
      );
      create index if not exists published_report_type_idx on published_report (report_type, created_at desc);
      create index if not exists published_report_user_idx on published_report (user_id, created_at desc);
      create index if not exists published_report_search_idx on published_report (source_search_report_id);
      create index if not exists published_report_company_idx on published_report (company_id);
      create unique index if not exists published_report_auto_person_unique_idx
        on published_report ((request->>'sourceReportId'), (request->>'personId'))
        where report_type = 'person_research' and request->>'autoTriggered' = 'true';
      create table if not exists company_research_run (
        report_id bigint primary key references published_report(id) on delete cascade,
        round01 jsonb,
        round02 jsonb,
        round03 jsonb,
        round04 jsonb,
        validated_ledger jsonb,
        final_report jsonb,
        translated_report jsonb,
        translation_metadata jsonb not null default '{}'::jsonb,
        round_status jsonb not null default '{}'::jsonb,
        engine_metadata jsonb not null default '{}'::jsonb,
        started_at timestamptz,
        completed_at timestamptz,
        updated_at timestamptz not null default now()
      );
      create table if not exists person_research_run (
        report_id bigint primary key references published_report(id) on delete cascade,
        discovery jsonb,
        synthesis jsonb,
        validated_ledger jsonb,
        final_report jsonb,
        run_status jsonb not null default '{}'::jsonb,
        engine_metadata jsonb not null default '{}'::jsonb,
        started_at timestamptz,
        completed_at timestamptz,
        updated_at timestamptz not null default now()
      );
      create table if not exists ads_research_run (
        report_id bigint primary key references published_report(id) on delete cascade,
        facebook jsonb,
        google jsonb,
        ads jsonb,
        final_report jsonb,
        run_status jsonb not null default '{}'::jsonb,
        engine_metadata jsonb not null default '{}'::jsonb,
        started_at timestamptz,
        completed_at timestamptz,
        updated_at timestamptz not null default now()
      )
    `);
    // Keyword MARKET research, which is a different question from ads_research
    // above. That one is one COMPANY across two networks; this is one MARKET
    // across many advertisers, Facebook only -- the Google Ads Transparency
    // Center has no keyword search of ad content, only advertiser and website
    // lookup, so there is no Google half to store.
    await sql(`
      create table if not exists ads_market_run (
        report_id bigint primary key references published_report(id) on delete cascade,
        -- Plural even though the form takes one product keyword: the crawler
        -- fetches keywords concurrently and expanding one term into variants is
        -- the obvious next step. A single text column would need a migration the
        -- first time that happens.
        keywords text[] not null default '{}',
        region text not null default 'MY',
        -- What the fetch actually got, per keyword, before any interpretation:
        -- pages, ads, whether the cap bit, errors, timings.
        fetch_stats jsonb,
        -- The deterministic SQL rollup the report was written from. Every number
        -- in report_md comes from here, so keeping it is what makes the report
        -- auditable and lets the report page draw its tables without a model.
        digest jsonb,
        report_md text,
        -- The finished teardown page: one self-contained HTML document, inline
        -- styles, no assets but Google Fonts. Stored here so /r/:id can serve it
        -- directly rather than standing up a second host for one file.
        report_html text,
        report_engine text,
        report_model text,
        -- Promoted out of digest so the library can sort and filter without
        -- parsing jsonb, and so a truncated run is visible in a LIST rather than
        -- only after somebody opens it.
        ads_total integer,
        ads_on_topic integer,
        advertisers integer,
        unique_creatives integer,
        truncated boolean not null default false,
        run_status jsonb not null default '{}'::jsonb,
        engine_metadata jsonb not null default '{}'::jsonb,
        started_at timestamptz,
        completed_at timestamptz,
        updated_at timestamptz not null default now(),
        -- Same shape of rule as search_report.blocked_scan_has_no_count: a run
        -- that claims it finished must carry the counts that say what it covered.
        constraint ads_market_completed_has_counts
          check (completed_at is null or ads_total is not null)
      )
    `);
    await sql(`create index if not exists ads_market_run_keywords_idx on ads_market_run using gin (keywords)`);
    await sql(`alter table ads_market_run add column if not exists report_html text`);
    // There is deliberately NO spend, impressions or reach column. Those fields
    // are null on 100% of Malaysian commercial ads in the Ad Library -- measured
    // over 672 -- and a nullable column is an invitation to read null as zero
    // later. A column that does not exist cannot be misread.
    await sql(`
      comment on column ads_market_run.ads_on_topic is
        'Ads whose own copy contains the topic terms. Facebook keyword_unordered matches loosely (98 of 576 measured), so this, not ads_total, is the real market size.'
    `);
    await sql(`
      comment on column ads_market_run.truncated is
        'A per-keyword page cap was hit, so more ads exist than were captured. Surfaced at list level because a capped run must never read as a complete market.'
    `);
    await sql(`
      do $$
      declare report_type_constraint text;
      begin
        select conname into report_type_constraint
        from pg_constraint
        where conrelid = 'published_report'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) like '%report_type%';
        if report_type_constraint is not null then
          execute format('alter table published_report drop constraint %I', report_type_constraint);
        end if;
        alter table published_report add constraint published_report_report_type_check
          check (report_type in ('business_search', 'company_research', 'person_research', 'ads_research', 'ads_market'));
      end $$;
    `);
    // ------------------------------------------------------------------ the run log
    // ONE APPEND-ONLY TRAIL PER RUN, and it lives in Postgres rather than in a
    // process, a file on the mini, or a Railway stdout buffer.
    //
    // Before this table there were four separate recording systems and no id
    // joining them: the worker log knew a job id, fb-recon knew a run directory,
    // company_research_run knew a report id, and the container's stdout knew
    // nothing at all. Answering "where did this run stop" meant matching wall
    // clock timestamps across three machines by hand.
    //
    // Append-only and written as it happens, because the failure that started
    // this -- the gateway restarting mid-job and answering the worker's result
    // with "no such job -- it was evicted" -- destroys anything held in memory
    // and anything assembled at the end. A row already committed survives it.
    await sql(`
      create table if not exists run_event (
        id bigserial primary key,
        at timestamptz not null default now(),
        report_id bigint references published_report(id) on delete cascade,
        public_id text,
        job_id text,
        stage text,
        event text not null,
        detail jsonb not null default '{}'::jsonb
      );
      create index if not exists run_event_report_idx on run_event (report_id, id);
      create index if not exists run_event_public_idx on run_event (public_id, id);
      create index if not exists run_event_at_idx on run_event (at desc);
    `);
    // Existing deployments already have company_research_run, so these must be
    // additive migrations rather than part of the CREATE TABLE definition only.
    // ------------------------------------------------------------------ company identity
    // A REGISTERED COMPANY NAME IS THE IDENTITY. Google issues a place id per
    // BRANCH, so one legal entity arrives as several rows: "ERS Energy Sdn Bhd"
    // is the KL head office (03-3099 1468) and "ERS Energy Sdn. Bhd." is the
    // Johor branch (07-361 1468), and researching one could not see the other.
    // Eternalgy Sdn Bhd was the same, split across a 21 Aug feed scan and a
    // 23 Aug place-card scan, with three dossiers on one row and one on the other.
    //
    // Storefront names are NOT unique and are left alone: this table holds five
    // separate "The Store" branches on five phone numbers. worker/db.mjs decides
    // which is which; NAME_KEY_SQL / REGISTERED_SQL below are the same rule in SQL.
    //
    // NOTHING IS DELETED. The superseded rows keep their own address and phone
    // and gain `merged_into`, pointing at the row that now carries the identity.
    await sql(`
      alter table company_data add column if not exists merged_into bigint
        references company_data(id) on delete set null;
      comment on column company_data.merged_into is
        'Set when this row is a branch of a registered company that another row now represents. Kept, never deleted; scans and research follow the target.';
      create index if not exists company_data_merged_idx on company_data (merged_into);
    `);
    // The oldest row of each registered name wins, because its id is the one
    // already cited by existing reports.
    await sql(`
      with registered as (
        select id, ${NAME_KEY_SQL} as k from company_data
        where merged_into is null and ${NAME_KEY_SQL} ${REGISTERED_SQL}
      ),
      groups as (
        select k, min(id) as keep from registered group by k having count(*) > 1
      )
      update company_data c set merged_into = g.keep
      from registered r join groups g on g.k = r.k
      where c.id = r.id and r.id <> g.keep;
    `);
    // Follow the merge everywhere a company is referenced, so no report and no
    // scan link is left pointing at a row that no longer carries the identity.
    await sql(`
      update published_report p set company_id = c.merged_into
      from company_data c where p.company_id = c.id and c.merged_into is not null;
    `);
    // Collapse the scan links BEFORE remapping them, and collapse them against
    // where every row is ABOUT to point, not only against where rows already
    // point.
    //
    // The first version of this deleted a link only when the merge target was
    // already linked to the same report. That misses the case that actually
    // happens on a wide scan: one report links to X and to Y, both of which merge
    // into Z, and neither is Z. Nothing is deleted, both are then updated to Z,
    // and the update violates search_report_company_pkey -- which takes down
    // migrate(), and migrate() runs at the top of every query, so the entire
    // report API answers `duplicate key value violates unique constraint
    // "search_report_company_pkey"` until someone redeploys with a fix. Seen in
    // production on 24 Aug after a 117-company scan of "solar installer in
    // malaysia" produced two branches of one registered name.
    //
    // So: resolve every row on a report to its final company, and where several
    // resolve to the same one, keep the lowest company_id and drop the rest. A
    // dropped row is a duplicate link, never a lost one -- the survivor names the
    // same company on the same report.
    await sql(`
      delete from search_report_company a
      using company_data ca
      where ca.id = a.company_id
        and exists (
          select 1
          from search_report_company b
          join company_data cb on cb.id = b.company_id
          where b.report_id = a.report_id
            and b.company_id <> a.company_id
            and coalesce(cb.merged_into, cb.id) = coalesce(ca.merged_into, ca.id)
            and b.company_id < a.company_id
        );
    `);
    await sql(`
      update search_report_company a set company_id = c.merged_into
      from company_data c where a.company_id = c.id and c.merged_into is not null;
    `);
    // Adopt the registry name as the dedupe key, so the NEXT scan of any branch
    // updates this row instead of opening a third one. Survivors only, and only
    // where no other row already holds that key.
    await sql(`
      update company_data c set place_id = 'name:' || ${NAME_KEY_SQL}
      where c.merged_into is null
        and c.place_id not like 'name:%'
        and ${NAME_KEY_SQL} ${REGISTERED_SQL}
        and not exists (
          select 1 from company_data d
          where d.id <> c.id and d.place_id = 'name:' || ${nameKeySql('c.name')}
        );
    `);

    // Researching a company again produces a NEW report, not a replacement: the
    // findings are a snapshot of what the public web said on a given day, and the
    // previous snapshot is the only thing a later one can be read against. Four
    // Eternalgy Sdn Bhd dossiers existed under one identical title before this,
    // three of them on the same company id, with nothing to tell them apart.
    await sql(`alter table published_report add column if not exists version integer;`);
    // Self-healing rather than run-once: it renumbers any company whose reports
    // do not already carry distinct versions. That covers the first backfill
    // (every version still null) AND the case above, where merging two company
    // rows brings two V1 dossiers together under one id. Once a company is
    // numbered correctly the group is skipped, so re-running costs nothing.
    await sql(`
      with dupes as (
        select report_type, company_id from published_report
        where company_id is not null
        group by report_type, company_id
        having count(*) <> count(distinct version)
      ),
      ranked as (
        select p.id, row_number() over (
                 partition by p.report_type, p.company_id order by p.created_at, p.id
               ) as rn
        from published_report p
        join dupes d on d.report_type = p.report_type and d.company_id = p.company_id
      )
      update published_report p set version = r.rn from ranked r where p.id = r.id;
    `);
    await sql(`update published_report set version = 1 where version is null;`);
    await sql(`
      alter table published_report alter column version set default 1;
      alter table published_report alter column version set not null;
      comment on column published_report.version is
        'Nth research pass on this company_id. V1 is the first; a re-run is V2, V3, ... Never overwritten.';
    `);
    await sql(`
      create index if not exists published_report_company_version_idx
        on published_report (company_id, report_type, version desc);
    `);
    await sql(`
      alter table company_research_run add column if not exists translated_report jsonb;
      alter table company_research_run add column if not exists translation_metadata jsonb not null default '{}'::jsonb;
      comment on column company_research_run.translated_report is 'Chinese (zh-CN) translation of final_report. URLs, IDs and contact values remain canonical.';
    `);
  })().catch((err) => {
    migrated = null;
    throw err;
  });
  return migrated;
}

export type ReportType = 'business_search' | 'company_research' | 'person_research' | 'ads_research' | 'ads_market';
export type ReportStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed';

export interface PublishedReport {
  id: string;
  public_id: string;
  report_type: ReportType;
  status: ReportStatus;
  title: string | null;
  user_id: string | null;
  request: Record<string, unknown>;
  source_search_report_id: string | null;
  company_id: string | null;
  job_id: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export async function createReport(input: {
  type: ReportType;
  title: string;
  userId?: string | null;
  request: Record<string, unknown>;
  companyId?: string | null;
}): Promise<PublishedReport> {
  await migrate();
  const publicId = crypto.randomBytes(15).toString('base64url');
  // The version is read and written inside one statement so two clicks arriving
  // together cannot both compute "V2". A report with no company (a business
  // search) is always V1 -- there is no earlier pass for it to follow.
  const out = await sql<PublishedReport>(
    `with v as (
       select case when $6::bigint is null then 1
              else (select coalesce(max(version), 0) + 1 from published_report
                    where report_type = $2 and company_id = $6::bigint)
              end as n
     )
     insert into published_report (public_id, report_type, title, user_id, request, company_id, version)
     select $1, $2, $3 || case when v.n > 1 then ' · V' || v.n else '' end,
            $4, $5::jsonb, $6, v.n
     from v
     returning *`,
    [publicId, input.type, input.title, input.userId ?? null, JSON.stringify(input.request), input.companyId ?? null],
  );
  const created = out.rows[0]!;
  await logEvent({
    reportId: created.id, publicId, stage: 'report', event: 'report.created',
    detail: { type: input.type, title: created.title, company_id: input.companyId ?? null, request: input.request },
  });
  return created;
}

export async function updateReport(publicId: string, patch: {
  status?: ReportStatus;
  title?: string;
  searchReportId?: string | null;
  companyId?: string | null;
  jobId?: string | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  completed?: boolean;
}): Promise<PublishedReport> {
  await migrate();
  const out = await sql<PublishedReport>(
    `update published_report set
       status = coalesce($2, status),
       title = coalesce($3, title),
       source_search_report_id = coalesce($4, source_search_report_id),
       company_id = coalesce($5, company_id),
       job_id = coalesce($6, job_id),
       result = case when $7::boolean then $8::jsonb else result end,
       error = case when $9::boolean then $10 else error end,
       completed_at = case when $11::boolean then now() else completed_at end,
       updated_at = now()
     where public_id = $1 returning *`,
    [
      publicId, patch.status ?? null, patch.title ?? null, patch.searchReportId ?? null,
      patch.companyId ?? null, patch.jobId ?? null,
      Object.prototype.hasOwnProperty.call(patch, 'result'), jsonParam(patch.result),
      Object.prototype.hasOwnProperty.call(patch, 'error'), patch.error ?? null, patch.completed === true,
    ],
  );
  if (!out.rows[0]) throw new Error('no published report ' + publicId);
  // Status is the one field worth a line of its own: `running` -> `partial` is
  // the transition a caller is waiting on, and until now nothing recorded when
  // it happened or what it was carrying. A patch that touches no status (a
  // jobId stamp, a heartbeat) is not an event.
  if (patch.status || patch.completed || patch.error) {
    await logEvent({
      reportId: out.rows[0].id, publicId, stage: 'report',
      event: 'report.' + (patch.status ?? (patch.completed ? 'completed' : 'error')),
      detail: {
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.completed ? { completed: true } : {}),
        ...(patch.error ? { error: String(patch.error).slice(0, 1_000) } : {}),
        ...(patch.jobId ? { job_id: patch.jobId } : {}),
      },
    });
  }
  return out.rows[0];
}

/**
 * Mark abandoned runs failed.
 *
 * A research run lives in this process. When the container restarts mid-run --
 * a deploy, an OOM, the 502s the workers logged on 22 Aug -- nothing is left to
 * finish the work or to write a terminal status, so the report sits at `running`
 * with `error: null` and no caller polling `api_url` ever gets the terminal
 * status the docs promise it.
 *
 * Two modes, because "stale" and "dead" are not the same claim:
 *
 *   staleMinutes 0 at boot. This process has just started and owns no run, so
 *   anything still non-terminal was stranded by the restart. No age test needed.
 *
 *   staleMinutes > 0 on the interval, for a run whose owner died without taking
 *   the process with it -- and never touching a run this process is still
 *   working on, which is what activePublicIds excludes. That guard matters:
 *   one company report legitimately ran 2h18m waiting behind a serial worker
 *   lane, and an age test alone would have killed it at 45 minutes.
 */
export async function reapAbandoned(staleMinutes: number, activePublicIds: string[] = []): Promise<number> {
  await migrate();
  const out = await sql<{ public_id: string }>(
    `update published_report
        set status = 'failed',
            error = 'This run was abandoned before it finished, most likely because the service restarted while it was working. Start it again.',
            completed_at = now(),
            updated_at = now()
      where status in ('queued','running')
        and updated_at < now() - make_interval(mins => $1::int)
        and not (public_id = any($2::text[]))
      returning public_id`,
    [Math.max(0, Math.floor(staleMinutes)), activePublicIds],
  );
  return out.rowCount ?? 0;
}

export async function getReport(publicId: string): Promise<PublishedReport | null> {
  await migrate();
  const out = await sql<PublishedReport>('select * from published_report where public_id = $1', [publicId]);
  return out.rows[0] ?? null;
}

/**
 * Delete one report permanently. The ON DELETE CASCADE constraints take the
 * research runs and the run trail with it, and the public /r/:id link 404s from
 * this moment on. company_data and person_data are untouched: the report is a
 * rendering of the dataset, never the dataset itself. A run still in flight
 * survives the deletion harmlessly — its round updates match zero rows and
 * logEvent swallows the orphaned-trail insert.
 *
 * RETURNING rather than rowCount, because the pg-proxy fallback path is not
 * guaranteed to report a rowCount for statements that produce no rows.
 */
export async function deleteReport(publicId: string): Promise<boolean> {
  await migrate();
  const out = await sql<{ id: string }>('delete from published_report where public_id = $1 returning id', [publicId]);
  return out.rows.length > 0;
}

export async function findPersonResearchReport(sourceReportId: string, personId: string): Promise<PublishedReport | null> {
  await migrate();
  const out = await sql<PublishedReport>(
    `select * from published_report
     where report_type = 'person_research'
       and request->>'autoTriggered' = 'true'
       and request->>'sourceReportId' = $1
       and request->>'personId' = $2
     order by created_at desc limit 1`,
    [sourceReportId, personId],
  );
  return out.rows[0] ?? null;
}

/**
 * Any live brief for this person on this report, however it was started.
 *
 * findPersonResearchReport above is scoped to autoTriggered rows because the
 * unique index that protects the auto path is scoped that way too. This one is
 * for the portal button, which must join whatever brief already exists -- the
 * automatic P01 one included -- rather than start a second run of the same
 * person. A failed brief is not returned: that one deserves a retry.
 */
export async function findPersonBrief(sourceReportId: string, personId: string): Promise<PublishedReport | null> {
  await migrate();
  const out = await sql<PublishedReport>(
    `select * from published_report
     where report_type = 'person_research'
       and status <> 'failed'
       and request->>'sourceReportId' = $1
       and request->>'personId' = $2
     order by created_at desc limit 1`,
    [sourceReportId, personId],
  );
  return out.rows[0] ?? null;
}

/**
 * Every VIP brief already started from one company dossier, keyed by the person
 * it is about. The report page needs the whole set at once: a person who has a
 * brief gets a link to it, and only a person who does not gets a button that
 * would start one.
 */
/**
 * The ads report already started for this company, if any.
 *
 * The dossier shows one ads action for the company as a whole, so it needs to know
 * whether a run exists before deciding between a link and a button. Latest first:
 * ads change week to week, so re-running is legitimate and the newest one is the
 * one worth linking to.
 */
export async function findAdsReport(companyId: string | number): Promise<PublishedReport | null> {
  await migrate();
  const out = await sql<PublishedReport>(
    `select * from published_report
     where report_type = 'ads_research'
       and status <> 'failed'
       and company_id = $1::bigint
     order by created_at desc limit 1`,
    [String(companyId)],
  );
  return out.rows[0] ?? null;
}

export async function listPersonBriefs(sourceReportId: string): Promise<Record<string, PublishedReport>> {
  await migrate();
  const out = await sql<PublishedReport>(
    `select distinct on (request->>'personId') *
     from published_report
     where report_type = 'person_research'
       and status <> 'failed'
       and request->>'sourceReportId' = $1
     order by request->>'personId', created_at desc`,
    [sourceReportId],
  );
  const byPerson: Record<string, PublishedReport> = {};
  for (const row of out.rows) {
    const personId = String((row.request as Record<string, unknown>)?.personId ?? '');
    if (personId) byPerson[personId] = row;
  }
  return byPerson;
}

export async function listReports(options: {
  type?: ReportType | null;
  status?: ReportStatus | null;
  limit?: number;
  offset?: number;
} = {}): Promise<{ reports: PublishedReport[]; total: number }> {
  await migrate();
  const limit = Math.min(Math.max(Math.round(options.limit ?? 40), 1), 100);
  const offset = Math.max(Math.round(options.offset ?? 0), 0);
  const params = [options.type ?? null, options.status ?? null, limit, offset];
  const where = `where ($1::text is null or report_type = $1)
                   and ($2::text is null or status = $2)`;
  const [items, count] = await Promise.all([
    sql<PublishedReport>(
      `select * from published_report ${where}
       order by created_at desc limit $3 offset $4`,
      params,
    ),
    sql<{ total: string }>(`select count(*)::text as total from published_report ${where}`, params.slice(0, 2)),
  ]);
  return { reports: items.rows, total: Number(count.rows[0]?.total ?? 0) };
}

export async function getCompany(companyId: string): Promise<Record<string, unknown> | null> {
  await migrate();
  const out = await sql('select * from company_data where id = $1', [companyId]);
  return out.rows[0] ?? null;
}

/**
 * The dossier that already exists for this company, if there is one.
 *
 * The report page lets anyone holding the link press Research, so the same
 * company can be asked for three times in a minute. Each run is four rounds of
 * deep research against a worker that does them one at a time — so a repeat
 * click joins the run already going rather than queueing another behind it.
 * A failed run is not returned: that one deserves a retry.
 */
export async function findCompanyReport(companyId: string): Promise<PublishedReport | null> {
  await migrate();
  // Only a run that is STILL GOING. This guard exists so a double-click, or a
  // shared link opened by three people at once, lands on the run already in
  // flight instead of starting four twenty-minute dossiers -- and that is all it
  // is for. A company whose research has finished is allowed to be researched
  // again; that second pass is V2, not a duplicate. Returning the old terminal
  // report here is what made "research this company" silently do nothing.
  const out = await sql<PublishedReport>(
    `select * from published_report
     where company_id = $1 and report_type = 'company_research'
       and status in ('queued', 'running')
     order by id desc limit 1`,
    [companyId],
  );
  return out.rows[0] ?? null;
}

export async function searchResult(reportId: string): Promise<{ report: Record<string, unknown>; companies: Record<string, unknown>[] } | null> {
  await migrate();
  const report = (await sql('select * from search_report where id = $1', [reportId])).rows[0];
  if (!report) return null;
  const companies = (
    await sql(
      `select c.*, src.rank
       from search_report_company src
       join company_data c on c.id = src.company_id
       where src.report_id = $1 order by src.rank asc`,
      [reportId],
    )
  ).rows;
  return { report, companies };
}

export async function initResearchRun(reportId: string): Promise<void> {
  await migrate();
  await sql(
    `insert into company_research_run (report_id, started_at)
     values ($1, now()) on conflict (report_id) do nothing`,
    [reportId],
  );
}

export async function saveRound(
  reportId: string,
  round: 'round01' | 'round02' | 'round03' | 'round04',
  artifact: Record<string, unknown>,
  status: string,
  engine: Record<string, unknown>,
): Promise<void> {
  await initResearchRun(reportId);
  // Column names come only from the closed union above, never from request data.
  await sql(
    `update company_research_run set
       ${round} = $2::jsonb,
       round_status = jsonb_set(round_status, $3::text[], to_jsonb($4::text), true),
       engine_metadata = jsonb_set(engine_metadata, $3::text[], $5::jsonb, true),
       updated_at = now()
     where report_id = $1`,
    [reportId, JSON.stringify(artifact), [round], status, JSON.stringify(engine)],
  );
  // The trail entry is written from here rather than from the fifteen call
  // sites in intel.ts, because every round transition in every report type
  // already passes through this function. One hook, total coverage.
  await logEvent({
    reportId, stage: round, event: 'round.' + status,
    detail: {
      ...engine,
      ...(artifact.error ? { error: String(artifact.error).slice(0, 1_000) } : {}),
      ...(artifact.error_code ? { error_code: artifact.error_code } : {}),
    },
  });
  // Heartbeat the published report too. Rounds used to write only to
  // company_research_run, so published_report.updated_at stayed frozen at the
  // moment the run started and could not tell a working run from a dead one --
  // and one company report legitimately took 2h18m waiting on a serial worker
  // lane. Anything that reaps on staleness needs this to be true first.
  await sql('update published_report set updated_at = now() where id = $1', [reportId]);
}

export async function saveFinal(
  reportId: string,
  ledger: Record<string, unknown>,
  finalReport: Record<string, unknown>,
): Promise<void> {
  await initResearchRun(reportId);
  await sql(
    `update company_research_run set validated_ledger=$2::jsonb, final_report=$3::jsonb,
       completed_at=now(), updated_at=now() where report_id=$1`,
    [reportId, JSON.stringify(ledger), JSON.stringify(finalReport)],
  );
  // The dossier now exists and is durable. On the Newpages run this moment was
  // 16:20:25 and the report did not go readable until 16:24:41 -- four minutes
  // in which the product was finished and the screen said nothing. The trail
  // says when the deliverable landed, separately from when it was published.
  await logEvent({
    reportId, stage: 'final', event: 'final.saved',
    detail: {
      contacts: Array.isArray(finalReport.contacts) ? finalReport.contacts.length : 0,
      people: Array.isArray(finalReport.people) ? finalReport.people.length : 0,
      signals: Array.isArray(finalReport.signals) ? finalReport.signals.length : 0,
      synthesis_mode: finalReport.synthesis_mode ?? null,
      has_summary: Boolean(finalReport.summary),
    },
  });
}

/** Store the Chinese render separately so the canonical English evidence ledger
 * remains machine-readable and existing API consumers keep their current shape. */
export async function saveTranslation(
  reportId: string,
  translatedReport: Record<string, unknown>,
  metadata: Record<string, unknown>,
): Promise<void> {
  await initResearchRun(reportId);
  await sql(
    `update company_research_run set translated_report=$2::jsonb, translation_metadata=$3::jsonb,
       updated_at=now() where report_id=$1`,
    [reportId, JSON.stringify(translatedReport), JSON.stringify(metadata)],
  );
  await logEvent({
    reportId, stage: 'translation', event: 'translation.' + (typeof metadata.status === 'string' && metadata.status ? metadata.status : 'saved'),
    detail: metadata,
  });
}

export async function researchRun(reportId: string): Promise<Record<string, unknown> | null> {
  await migrate();
  return (await sql('select * from company_research_run where report_id=$1', [reportId])).rows[0] ?? null;
}

export async function initPersonResearchRun(reportId: string): Promise<void> {
  await migrate();
  await sql(
    `insert into person_research_run (report_id, started_at)
     values ($1, now()) on conflict (report_id) do nothing`,
    [reportId],
  );
}

export async function savePersonResearchRun(reportId: string, patch: {
  discovery?: Record<string, unknown>;
  synthesis?: Record<string, unknown>;
  ledger?: Record<string, unknown>;
  finalReport?: Record<string, unknown>;
  status?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  completed?: boolean;
}): Promise<void> {
  await initPersonResearchRun(reportId);
  await sql(
    `update person_research_run set
       discovery = case when $2::boolean then $3::jsonb else discovery end,
       synthesis = case when $4::boolean then $5::jsonb else synthesis end,
       validated_ledger = case when $6::boolean then $7::jsonb else validated_ledger end,
       final_report = case when $8::boolean then $9::jsonb else final_report end,
       run_status = case when $10::boolean then $11::jsonb else run_status end,
       engine_metadata = case when $12::boolean then $13::jsonb else engine_metadata end,
       completed_at = case when $14::boolean then now() else completed_at end,
       updated_at = now() where report_id = $1`,
    [
      reportId,
      Object.prototype.hasOwnProperty.call(patch, 'discovery'), jsonParam(patch.discovery),
      Object.prototype.hasOwnProperty.call(patch, 'synthesis'), jsonParam(patch.synthesis),
      Object.prototype.hasOwnProperty.call(patch, 'ledger'), jsonParam(patch.ledger),
      Object.prototype.hasOwnProperty.call(patch, 'finalReport'), jsonParam(patch.finalReport),
      Object.prototype.hasOwnProperty.call(patch, 'status'), jsonParam(patch.status ?? {}),
      Object.prototype.hasOwnProperty.call(patch, 'metadata'), jsonParam(patch.metadata ?? {}),
      patch.completed === true,
    ],
  );
}

export async function personResearchRun(reportId: string): Promise<Record<string, unknown> | null> {
  await migrate();
  return (await sql('select * from person_research_run where report_id=$1', [reportId])).rows[0] ?? null;
}

export async function initAdsResearchRun(reportId: string): Promise<void> {
  await migrate();
  await sql(
    `insert into ads_research_run (report_id, started_at)
     values ($1, now()) on conflict (report_id) do nothing`,
    [reportId],
  );
}

export async function saveAdsResearchRun(reportId: string, patch: {
  facebook?: Record<string, unknown>;
  google?: Record<string, unknown>;
  ads?: Record<string, unknown>;
  finalReport?: Record<string, unknown>;
  status?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  completed?: boolean;
}): Promise<void> {
  await initAdsResearchRun(reportId);
  await sql(
    `update ads_research_run set
       facebook = case when $2::boolean then $3::jsonb else facebook end,
       google = case when $4::boolean then $5::jsonb else google end,
       ads = case when $6::boolean then $7::jsonb else ads end,
       final_report = case when $8::boolean then $9::jsonb else final_report end,
       run_status = case when $10::boolean then $11::jsonb else run_status end,
       engine_metadata = case when $12::boolean then $13::jsonb else engine_metadata end,
       completed_at = case when $14::boolean then now() else completed_at end,
       updated_at = now() where report_id = $1`,
    [
      reportId,
      Object.prototype.hasOwnProperty.call(patch, 'facebook'), jsonParam(patch.facebook),
      Object.prototype.hasOwnProperty.call(patch, 'google'), jsonParam(patch.google),
      Object.prototype.hasOwnProperty.call(patch, 'ads'), jsonParam(patch.ads),
      Object.prototype.hasOwnProperty.call(patch, 'finalReport'), jsonParam(patch.finalReport),
      Object.prototype.hasOwnProperty.call(patch, 'status'), jsonParam(patch.status ?? {}),
      Object.prototype.hasOwnProperty.call(patch, 'metadata'), jsonParam(patch.metadata ?? {}),
      patch.completed === true,
    ],
  );
}

export async function adsResearchRun(reportId: string): Promise<Record<string, unknown> | null> {
  await migrate();
  return (await sql('select * from ads_research_run where report_id=$1', [reportId])).rows[0] ?? null;
}

export async function initAdsMarketRun(reportId: string, keywords: string[], region: string): Promise<void> {
  await migrate();
  await sql(
    `insert into ads_market_run (report_id, keywords, region, started_at)
     values ($1, $2::text[], $3, now()) on conflict (report_id) do nothing`,
    [reportId, keywords, region],
  );
}

/**
 * Patch a market run. Same has-own-property gate as saveAdsResearchRun: passing a
 * key writes it, omitting it leaves the stored value alone, so a later stage never
 * blanks an earlier one by not knowing about it.
 *
 * The counts are written from the digest by the caller rather than derived here --
 * the digest is the one place that counts, and a second implementation of the same
 * arithmetic is a second chance to disagree with it.
 */
export async function saveAdsMarketRun(reportId: string, patch: {
  fetchStats?: Record<string, unknown>;
  digest?: Record<string, unknown>;
  reportMd?: string | null;
  reportHtml?: string | null;
  reportEngine?: string | null;
  reportModel?: string | null;
  adsTotal?: number | null;
  adsOnTopic?: number | null;
  advertisers?: number | null;
  uniqueCreatives?: number | null;
  truncated?: boolean;
  status?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  completed?: boolean;
}): Promise<void> {
  await migrate();
  const has = (k: string) => Object.prototype.hasOwnProperty.call(patch, k);
  await sql(
    `update ads_market_run set
       fetch_stats = case when $2::boolean then $3::jsonb else fetch_stats end,
       digest = case when $4::boolean then $5::jsonb else digest end,
       report_md = case when $6::boolean then $7::text else report_md end,
       report_html = case when $27::boolean then $28::text else report_html end,
       report_engine = case when $8::boolean then $9::text else report_engine end,
       report_model = case when $10::boolean then $11::text else report_model end,
       ads_total = case when $12::boolean then $13::integer else ads_total end,
       ads_on_topic = case when $14::boolean then $15::integer else ads_on_topic end,
       advertisers = case when $16::boolean then $17::integer else advertisers end,
       unique_creatives = case when $18::boolean then $19::integer else unique_creatives end,
       truncated = case when $20::boolean then $21::boolean else truncated end,
       run_status = case when $22::boolean then $23::jsonb else run_status end,
       engine_metadata = case when $24::boolean then $25::jsonb else engine_metadata end,
       completed_at = case when $26::boolean then now() else completed_at end,
       updated_at = now() where report_id = $1`,
    [
      reportId,
      has('fetchStats'), jsonParam(patch.fetchStats),
      has('digest'), jsonParam(patch.digest),
      has('reportMd'), patch.reportMd == null ? null : patch.reportMd.toWellFormed(),
      has('reportEngine'), patch.reportEngine ?? null,
      has('reportModel'), patch.reportModel ?? null,
      has('adsTotal'), patch.adsTotal ?? null,
      has('adsOnTopic'), patch.adsOnTopic ?? null,
      has('advertisers'), patch.advertisers ?? null,
      has('uniqueCreatives'), patch.uniqueCreatives ?? null,
      has('truncated'), patch.truncated === true,
      has('status'), jsonParam(patch.status ?? {}),
      has('metadata'), jsonParam(patch.metadata ?? {}),
      patch.completed === true,
      has('reportHtml'), patch.reportHtml == null ? null : patch.reportHtml.toWellFormed(),
    ],
  );
}

export async function adsMarketRun(reportId: string): Promise<Record<string, unknown> | null> {
  await migrate();
  return (await sql('select * from ads_market_run where report_id=$1', [reportId])).rows[0] ?? null;
}

/**
 * An in-flight market run for the same keyword set and region.
 *
 * Only queued/running counts. A market moves week to week, so re-running a
 * finished keyword is legitimate and a completed report must never block one --
 * the same rule findAdsReport applies to advertisers.
 */
export async function findAdsMarketReport(keywords: string[], region: string): Promise<PublishedReport | null> {
  await migrate();
  const out = await sql<PublishedReport>(
    `select r.* from published_report r
     join ads_market_run m on m.report_id = r.id
     where r.report_type = 'ads_market'
       and r.status in ('queued', 'running')
       and m.region = $2
       and m.keywords @> $1::text[] and m.keywords <@ $1::text[]
     order by r.created_at desc limit 1`,
    [keywords, region],
  );
  return out.rows[0] ?? null;
}

/**
 * Append one line to a run's trail.
 *
 * NEVER THROWS. A logging layer that can kill the run it is describing is worse
 * than no logging layer, so every failure here is swallowed after being written
 * to stdout. The run is the product; this is the account of it.
 */
export async function logEvent(input: {
  reportId?: string | number | null;
  publicId?: string | null;
  jobId?: string | null;
  stage?: string | null;
  event: string;
  detail?: Record<string, unknown> | null;
}): Promise<void> {
  if (!configured()) return;
  try {
    // Bounded, because a round artifact can carry a whole crawl transcript and
    // the trail is meant to stay readable and cheap to write.
    const detail = JSON.stringify(input.detail ?? {}).slice(0, 8_000);
    await sql(
      `insert into run_event (report_id, public_id, job_id, stage, event, detail)
       values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        input.reportId != null && String(input.reportId).trim() ? String(input.reportId) : null,
        input.publicId ?? null,
        input.jobId ?? null,
        input.stage ?? null,
        input.event,
        detail.startsWith('{') ? detail : '{}',
      ],
    );
  } catch (err) {
    console.error('[run_event] could not record "' + input.event + '": ' + ((err as Error).message ?? String(err)));
  }
}

/** Every event for one run, oldest first. Accepts either id form. */
export async function listEvents(key: { reportId?: string | number | null; publicId?: string | null }): Promise<Record<string, unknown>[]> {
  if (!configured()) return [];
  const { rows } = await sql<Record<string, unknown>>(
    `select id, at, report_id, public_id, job_id, stage, event, detail
       from run_event
      where ($1::bigint is null or report_id = $1::bigint)
        and ($2::text is null or public_id = $2::text)
      order by id asc
      limit 2000`,
    [
      key.reportId != null && String(key.reportId).trim() ? String(key.reportId) : null,
      key.publicId ?? null,
    ],
  );
  return rows;
}

export async function close(): Promise<void> {
  if (pool) await pool.end();
  pool = null;
}
