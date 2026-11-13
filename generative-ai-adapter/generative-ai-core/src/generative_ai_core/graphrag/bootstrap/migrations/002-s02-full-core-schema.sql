-- S02 PR-B Full Core Schema canonical GraphRAG V0 runtime migration.
-- s02:rollback-evidence Drop schema graphrag_s02 after revoking grants from graphrag_s02_app; S01 graphrag_s01 remains fail-closed during abandon and S02 protected tables are not exposed without RLS.
-- s02:sanitized-evidence Validation output is limited to fixture id, table family/name, obligation id, count, boolean, classification label, and sanitized error code.
-- s02:tenant-aware-fk Composite tenant-aware foreign keys include tenant_id on protected relationships.
-- status = 'serving' deterministic_serving_rank

create extension if not exists vector;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'graphrag_s02_app') then
    create role graphrag_s02_app login nobypassrls;
  end if;
  alter role graphrag_s02_app nobypassrls;
end $$;

create schema if not exists graphrag_s02;

create table if not exists graphrag_s02.embedding_profiles (
  profile_id text primary key,
  provider_name_sanitized text not null,
  model_name_sanitized text not null,
  vector_dimension integer not null check (vector_dimension = 1536),
  distance_metric text not null check (distance_metric in ('cosine', 'l2', 'inner_product')),
  status text not null check (status in ('serving', 'shadow', 'deprecated')),
  deterministic_serving_rank integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'serving' or deterministic_serving_rank is not null)
);

create table if not exists graphrag_s02.documents (
  tenant_id text not null,
  document_id text not null,
  owner_user_id text not null,
  audit_user_id text not null,
  source_label_sanitized text not null,
  classification_rank integer not null default 0,
  acl_mode text not null check (acl_mode in ('tenant_wide', 'restricted')),
  acl_principal_ids text[] not null default array[]::text[],
  acl_revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, document_id),
  foreign key (tenant_id) references graphrag_s01.tenants (tenant_id)
);

create table if not exists graphrag_s02.document_versions (
  tenant_id text not null,
  document_id text not null,
  version_id text not null,
  version_ordinal integer not null,
  content_hash text not null,
  owner_user_id text not null,
  audit_user_id text not null,
  classification_rank integer not null default 0,
  acl_mode text not null check (acl_mode in ('tenant_wide', 'restricted')),
  acl_principal_ids text[] not null default array[]::text[],
  acl_revision bigint not null default 1,
  created_at timestamptz not null default now(),
  primary key (tenant_id, document_id, version_id),
  unique (tenant_id, version_id),
  foreign key (tenant_id, document_id) references graphrag_s02.documents (tenant_id, document_id)
);

create table if not exists graphrag_s02.chunks (
  tenant_id text not null,
  document_id text not null,
  version_id text not null,
  chunk_id text not null,
  chunk_ordinal integer not null,
  content_hash text not null,
  owner_user_id text not null,
  audit_user_id text not null,
  classification_rank integer not null default 0,
  acl_mode text not null check (acl_mode in ('tenant_wide', 'restricted')),
  acl_principal_ids text[] not null default array[]::text[],
  acl_revision bigint not null default 1,
  created_at timestamptz not null default now(),
  primary key (tenant_id, document_id, version_id, chunk_id),
  unique (tenant_id, chunk_id),
  foreign key (tenant_id, document_id, version_id) references graphrag_s02.document_versions (tenant_id, document_id, version_id)
);

create table if not exists graphrag_s02.chunk_embeddings (
  tenant_id text not null,
  chunk_id text not null,
  profile_id text not null,
  embedding vector(1536) not null,
  embedding_status text not null check (embedding_status in ('current', 'stale', 'failed')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, chunk_id, profile_id),
  foreign key (tenant_id, chunk_id) references graphrag_s02.chunks (tenant_id, chunk_id),
  foreign key (profile_id) references graphrag_s02.embedding_profiles (profile_id)
);

create table if not exists graphrag_s02.chunk_identifiers (
  tenant_id text not null,
  chunk_identifier_id text not null,
  chunk_id text not null,
  identifier_type text not null,
  identifier_hash text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, chunk_identifier_id),
  unique (tenant_id, chunk_id, identifier_type, identifier_hash),
  foreign key (tenant_id, chunk_id) references graphrag_s02.chunks (tenant_id, chunk_id)
);

create table if not exists graphrag_s02.evidence_items (
  tenant_id text not null,
  evidence_id text not null,
  chunk_id text,
  profile_id text,
  evidence_kind text not null,
  selection_rank integer not null default 0,
  owner_user_id text not null,
  audit_user_id text not null,
  classification_rank integer not null default 0,
  acl_mode text not null check (acl_mode in ('tenant_wide', 'restricted')),
  acl_principal_ids text[] not null default array[]::text[],
  acl_revision bigint not null default 1,
  created_at timestamptz not null default now(),
  primary key (tenant_id, evidence_id),
  foreign key (tenant_id, chunk_id) references graphrag_s02.chunks (tenant_id, chunk_id),
  foreign key (profile_id) references graphrag_s02.embedding_profiles (profile_id)
);

create table if not exists graphrag_s02.retrieval_traces (
  tenant_id text not null,
  trace_id text not null,
  profile_id text not null,
  trace_status text not null check (trace_status in ('selected', 'rejected', 'error')),
  selected_evidence_count integer not null default 0,
  sanitized_context_key text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, trace_id),
  foreign key (profile_id) references graphrag_s02.embedding_profiles (profile_id)
);

create table if not exists graphrag_s02.answers (
  tenant_id text not null,
  answer_id text not null,
  trace_id text not null,
  answer_status text not null check (answer_status in ('draft', 'complete', 'rejected')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, answer_id),
  foreign key (tenant_id, trace_id) references graphrag_s02.retrieval_traces (tenant_id, trace_id)
);

create table if not exists graphrag_s02.answer_claims (
  tenant_id text not null,
  answer_id text not null,
  claim_id text not null,
  claim_ordinal integer not null,
  claim_status text not null check (claim_status in ('supported', 'unsupported', 'needs_review')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, answer_id, claim_id),
  unique (tenant_id, claim_id),
  foreign key (tenant_id, answer_id) references graphrag_s02.answers (tenant_id, answer_id)
);

create table if not exists graphrag_s02.answer_claim_evidence (
  tenant_id text not null,
  answer_id text not null,
  claim_id text not null,
  evidence_id text not null,
  support_rank integer not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, answer_id, claim_id, evidence_id),
  foreign key (tenant_id, answer_id, claim_id) references graphrag_s02.answer_claims (tenant_id, answer_id, claim_id),
  foreign key (tenant_id, evidence_id) references graphrag_s02.evidence_items (tenant_id, evidence_id)
);

create table if not exists graphrag_s02.entities (
  tenant_id text not null,
  entity_id text not null,
  entity_type text not null,
  canonical_label_hash text not null,
  classification_rank integer not null default 0,
  acl_mode text not null check (acl_mode in ('tenant_wide', 'restricted')),
  acl_principal_ids text[] not null default array[]::text[],
  acl_revision bigint not null default 1,
  created_at timestamptz not null default now(),
  primary key (tenant_id, entity_id)
);

create table if not exists graphrag_s02.entity_aliases (
  tenant_id text not null,
  entity_alias_id text not null,
  entity_id text not null,
  alias_hash text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, entity_alias_id),
  foreign key (tenant_id, entity_id) references graphrag_s02.entities (tenant_id, entity_id)
);

create table if not exists graphrag_s02.kg_edges (
  tenant_id text not null,
  edge_id text not null,
  source_entity_id text not null,
  target_entity_id text not null,
  edge_type text not null,
  edge_status text not null check (edge_status in ('candidate', 'validated', 'rejected')),
  classification_rank integer not null default 0,
  acl_mode text not null check (acl_mode in ('tenant_wide', 'restricted')),
  acl_principal_ids text[] not null default array[]::text[],
  acl_revision bigint not null default 1,
  created_at timestamptz not null default now(),
  primary key (tenant_id, edge_id),
  foreign key (tenant_id, source_entity_id) references graphrag_s02.entities (tenant_id, entity_id),
  foreign key (tenant_id, target_entity_id) references graphrag_s02.entities (tenant_id, entity_id)
);

create table if not exists graphrag_s02.kg_edge_evidence (
  tenant_id text not null,
  edge_id text not null,
  evidence_id text not null,
  evidence_role text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, edge_id, evidence_id),
  foreign key (tenant_id, edge_id) references graphrag_s02.kg_edges (tenant_id, edge_id),
  foreign key (tenant_id, evidence_id) references graphrag_s02.evidence_items (tenant_id, evidence_id)
);

create table if not exists graphrag_s02.graph_projection_events (
  tenant_id text not null,
  event_id text not null,
  source_table text not null,
  source_id text not null,
  projection_status text not null check (projection_status in ('pending', 'processing', 'done', 'failed')),
  sanitized_error_code text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, event_id)
);

create table if not exists graphrag_s02.graph_projection_runs (
  tenant_id text not null,
  run_id text not null,
  run_status text not null check (run_status in ('pending', 'processing', 'done', 'failed')),
  projected_event_count integer not null default 0,
  sanitized_error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (tenant_id, run_id)
);

create table if not exists graphrag_s02.graph_drift_checks (
  tenant_id text not null,
  check_id text not null,
  check_status text not null check (check_status in ('not-run', 'pass', 'blocking-fail', 'sanitized-fail')),
  drift_count integer not null default 0,
  sanitized_error_code text,
  checked_at timestamptz not null default now(),
  primary key (tenant_id, check_id)
);

insert into graphrag_s02.embedding_profiles (
  profile_id,
  provider_name_sanitized,
  model_name_sanitized,
  vector_dimension,
  distance_metric,
  status,
  deterministic_serving_rank
) values
  ('profile-serving-1536', 'provider-sanitized', 'model-1536-sanitized', 1536, 'cosine', 'serving', 1),
  ('profile-shadow-1536', 'provider-sanitized', 'model-shadow-1536-sanitized', 1536, 'cosine', 'shadow', 2),
  ('profile-deprecated-1536', 'provider-sanitized', 'model-deprecated-1536-sanitized', 1536, 'cosine', 'deprecated', 99)
on conflict (profile_id) do update set
  provider_name_sanitized = excluded.provider_name_sanitized,
  model_name_sanitized = excluded.model_name_sanitized,
  vector_dimension = excluded.vector_dimension,
  distance_metric = excluded.distance_metric,
  status = excluded.status,
  deterministic_serving_rank = excluded.deterministic_serving_rank,
  updated_at = now();

alter table graphrag_s02.documents enable row level security;
alter table graphrag_s02.documents force row level security;
do $$
begin
  if not exists (
      select 1
      from pg_policies
      where schemaname = 'graphrag_s02'
        and tablename = 'documents'
        and policyname = 'documents_s02_tenant_acl_policy'
  ) then
    create policy documents_s02_tenant_acl_policy on graphrag_s02.documents
  using (tenant_id = current_setting('app.tenant_id', true) and acl_mode in ('tenant_wide', 'restricted'));
  end if;
end $$;

alter table graphrag_s02.document_versions enable row level security;
alter table graphrag_s02.document_versions force row level security;
do $$
begin
  if not exists (
      select 1
      from pg_policies
      where schemaname = 'graphrag_s02'
        and tablename = 'document_versions'
        and policyname = 'document_versions_s02_tenant_acl_policy'
  ) then
    create policy document_versions_s02_tenant_acl_policy on graphrag_s02.document_versions
  using (tenant_id = current_setting('app.tenant_id', true) and acl_mode in ('tenant_wide', 'restricted'));
  end if;
end $$;

alter table graphrag_s02.chunks enable row level security;
alter table graphrag_s02.chunks force row level security;
do $$
begin
  if not exists (
      select 1
      from pg_policies
      where schemaname = 'graphrag_s02'
        and tablename = 'chunks'
        and policyname = 'chunks_s02_tenant_acl_policy'
  ) then
    create policy chunks_s02_tenant_acl_policy on graphrag_s02.chunks
  using (tenant_id = current_setting('app.tenant_id', true) and acl_mode in ('tenant_wide', 'restricted'));
  end if;
end $$;

alter table graphrag_s02.evidence_items enable row level security;
alter table graphrag_s02.evidence_items force row level security;
do $$
begin
  if not exists (
      select 1
      from pg_policies
      where schemaname = 'graphrag_s02'
        and tablename = 'evidence_items'
        and policyname = 'evidence_items_s02_tenant_acl_policy'
  ) then
    create policy evidence_items_s02_tenant_acl_policy on graphrag_s02.evidence_items
  using (tenant_id = current_setting('app.tenant_id', true) and acl_mode in ('tenant_wide', 'restricted'));
  end if;
end $$;

alter table graphrag_s02.entities enable row level security;
alter table graphrag_s02.entities force row level security;
do $$
begin
  if not exists (
      select 1
      from pg_policies
      where schemaname = 'graphrag_s02'
        and tablename = 'entities'
        and policyname = 'entities_s02_tenant_acl_policy'
  ) then
    create policy entities_s02_tenant_acl_policy on graphrag_s02.entities
  using (tenant_id = current_setting('app.tenant_id', true) and acl_mode in ('tenant_wide', 'restricted'));
  end if;
end $$;

alter table graphrag_s02.kg_edges enable row level security;
alter table graphrag_s02.kg_edges force row level security;
do $$
begin
  if not exists (
      select 1
      from pg_policies
      where schemaname = 'graphrag_s02'
        and tablename = 'kg_edges'
        and policyname = 'kg_edges_s02_tenant_acl_policy'
  ) then
    create policy kg_edges_s02_tenant_acl_policy on graphrag_s02.kg_edges
  using (tenant_id = current_setting('app.tenant_id', true) and acl_mode in ('tenant_wide', 'restricted'));
  end if;
end $$;

grant usage on schema graphrag_s02 to graphrag_s02_app;
grant select, insert, update, delete on all tables in schema graphrag_s02 to graphrag_s02_app;
