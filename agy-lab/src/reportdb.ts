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

/** Apply only the report-owned schema. The historical core schema remains in schema.sql. */
export function migrate(): Promise<void> {
  if (migrated) return migrated;
  migrated = (async () => {
    await sql(`
      create table if not exists published_report (
        id bigserial primary key,
        public_id text not null unique,
        report_type text not null check (report_type in ('business_search', 'company_research', 'person_research')),
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
      )
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
          check (report_type in ('business_search', 'company_research', 'person_research'));
      end $$;
    `);
    // Existing deployments already have company_research_run, so these must be
    // additive migrations rather than part of the CREATE TABLE definition only.
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

export type ReportType = 'business_search' | 'company_research' | 'person_research';
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
  const out = await sql<PublishedReport>(
    `insert into published_report (public_id, report_type, title, user_id, request, company_id)
     values ($1,$2,$3,$4,$5::jsonb,$6)
     returning *`,
    [publicId, input.type, input.title, input.userId ?? null, JSON.stringify(input.request), input.companyId ?? null],
  );
  return out.rows[0]!;
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
      Object.prototype.hasOwnProperty.call(patch, 'result'), JSON.stringify(patch.result ?? null),
      Object.prototype.hasOwnProperty.call(patch, 'error'), patch.error ?? null, patch.completed === true,
    ],
  );
  if (!out.rows[0]) throw new Error('no published report ' + publicId);
  return out.rows[0];
}

export async function getReport(publicId: string): Promise<PublishedReport | null> {
  await migrate();
  const out = await sql<PublishedReport>('select * from published_report where public_id = $1', [publicId]);
  return out.rows[0] ?? null;
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
  const out = await sql<PublishedReport>(
    `select * from published_report
     where company_id = $1 and report_type = 'company_research' and status <> 'failed'
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
      Object.prototype.hasOwnProperty.call(patch, 'discovery'), JSON.stringify(patch.discovery ?? null),
      Object.prototype.hasOwnProperty.call(patch, 'synthesis'), JSON.stringify(patch.synthesis ?? null),
      Object.prototype.hasOwnProperty.call(patch, 'ledger'), JSON.stringify(patch.ledger ?? null),
      Object.prototype.hasOwnProperty.call(patch, 'finalReport'), JSON.stringify(patch.finalReport ?? null),
      Object.prototype.hasOwnProperty.call(patch, 'status'), JSON.stringify(patch.status ?? {}),
      Object.prototype.hasOwnProperty.call(patch, 'metadata'), JSON.stringify(patch.metadata ?? {}),
      patch.completed === true,
    ],
  );
}

export async function personResearchRun(reportId: string): Promise<Record<string, unknown> | null> {
  await migrate();
  return (await sql('select * from person_research_run where report_id=$1', [reportId])).rows[0] ?? null;
}

export async function close(): Promise<void> {
  if (pool) await pool.end();
  pool = null;
}
