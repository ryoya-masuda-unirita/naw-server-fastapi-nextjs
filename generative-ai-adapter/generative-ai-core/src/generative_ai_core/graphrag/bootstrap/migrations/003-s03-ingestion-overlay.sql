-- S03 Ingestion Pipeline overlay for the S02 canonical GraphRAG schema.
-- s03:rollback-evidence S03-only overlay additions can be abandoned by dropping
-- document_acl_grants, embedding_queue, acl_propagation_outbox, acl_drift_checks,
-- and the S03 is_current overlay columns without rewriting S02 canonical migration
-- artifacts or weakening S01/S02 RLS obligations.
-- s03:sanitized-evidence Validation output is limited to fixture ids, case ids,
-- row-count booleans, classification labels, statuses, ACL revision relation, and
-- sanitized failure/error codes.

alter table graphrag_s02.document_versions
  add column if not exists is_current boolean not null default true;

alter table graphrag_s02.chunks
  add column if not exists is_current boolean not null default true;

create table if not exists graphrag_s02.document_acl_grants (
  tenant_id text not null,
  grant_id text not null,
  document_id text not null,
  acl_mode text not null check (acl_mode in ('tenant_wide', 'restricted')),
  acl_principal_ids text[] default array[]::text[],
  classification_rank integer not null default 1,
  acl_revision bigint not null,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (tenant_id, grant_id),
  foreign key (tenant_id, document_id)
    references graphrag_s02.documents (tenant_id, document_id)
);

create table if not exists graphrag_s02.embedding_queue (
  tenant_id text not null,
  queue_id text not null,
  chunk_id text not null,
  profile_id text not null default 'profile-serving-1536',
  content_hash text not null,
  queue_status text not null check (queue_status in ('pending', 'processing', 'done', 'failed')),
  acl_revision bigint not null,
  sanitized_error_code text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, queue_id),
  unique (tenant_id, chunk_id, profile_id),
  foreign key (tenant_id, chunk_id)
    references graphrag_s02.chunks (tenant_id, chunk_id),
  foreign key (profile_id)
    references graphrag_s02.embedding_profiles (profile_id)
);

create table if not exists graphrag_s02.acl_propagation_outbox (
  tenant_id text not null,
  outbox_id text not null,
  document_id text not null,
  acl_revision bigint not null,
  outbox_status text not null check (outbox_status in ('pending', 'processing', 'done', 'failed')),
  sanitized_error_code text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, outbox_id),
  unique (tenant_id, document_id, acl_revision),
  foreign key (tenant_id, document_id)
    references graphrag_s02.documents (tenant_id, document_id)
);

create table if not exists graphrag_s02.acl_drift_checks (
  tenant_id text not null,
  check_id text not null,
  check_status text not null check (check_status in ('not-run', 'pass', 'blocking-fail', 'sanitized-fail')),
  checked_table text not null,
  drift_count integer not null default 0,
  sanitized_error_code text,
  checked_at timestamptz not null default now(),
  primary key (tenant_id, check_id)
);

create table if not exists graphrag_s02.llm_candidate_origins (
  tenant_id text not null,
  candidate_id text not null,
  candidate_kind text not null check (candidate_kind in ('entity', 'edge')),
  source_chunk_id text not null,
  extraction_run_id text not null,
  verification_status text not null check (verification_status = 'candidate'),
  trust_level text not null check (trust_level = 'llm_suggested'),
  sanitized_evidence_id text not null,
  classification_rank integer not null,
  acl_mode text not null,
  acl_principal_ids text[] not null default '{}',
  acl_revision bigint not null,
  primary key (tenant_id, candidate_id, extraction_run_id, source_chunk_id),
  foreign key (tenant_id, source_chunk_id) references graphrag_s02.chunks(tenant_id, chunk_id) on delete cascade
);

create index if not exists document_versions_s03_current_idx
  on graphrag_s02.document_versions (tenant_id, document_id, is_current);

create index if not exists chunks_s03_current_idx
  on graphrag_s02.chunks (tenant_id, document_id, version_id, is_current);

alter table graphrag_s02.document_acl_grants enable row level security;
alter table graphrag_s02.document_acl_grants force row level security;
alter table graphrag_s02.embedding_queue enable row level security;
alter table graphrag_s02.embedding_queue force row level security;
alter table graphrag_s02.acl_propagation_outbox enable row level security;
alter table graphrag_s02.acl_propagation_outbox force row level security;
alter table graphrag_s02.acl_drift_checks enable row level security;
alter table graphrag_s02.acl_drift_checks force row level security;
alter table graphrag_s02.llm_candidate_origins enable row level security;
alter table graphrag_s02.llm_candidate_origins force row level security;

drop policy if exists document_acl_grants_s03_tenant_policy on graphrag_s02.document_acl_grants;
create policy document_acl_grants_s03_tenant_policy on graphrag_s02.document_acl_grants
  using (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

drop policy if exists embedding_queue_s03_tenant_policy on graphrag_s02.embedding_queue;
create policy embedding_queue_s03_tenant_policy on graphrag_s02.embedding_queue
  using (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

drop policy if exists acl_propagation_outbox_s03_tenant_policy on graphrag_s02.acl_propagation_outbox;
create policy acl_propagation_outbox_s03_tenant_policy on graphrag_s02.acl_propagation_outbox
  using (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

drop policy if exists acl_drift_checks_s03_tenant_policy on graphrag_s02.acl_drift_checks;
create policy acl_drift_checks_s03_tenant_policy on graphrag_s02.acl_drift_checks
  using (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

drop policy if exists llm_candidate_origins_s03_tenant_policy on graphrag_s02.llm_candidate_origins;
create policy llm_candidate_origins_s03_tenant_policy on graphrag_s02.llm_candidate_origins
  using (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

grant select, insert, update, delete on all tables in schema graphrag_s02 to graphrag_s02_app;
