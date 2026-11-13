-- s01:protected-inventory
-- s01:rollback-evidence drop disposable schema graphrag_s01 and role graphrag_s01_app after revoking grants; default-deny remains closed during abandon.
-- s01:sanitized-evidence target/graphrag-s01-db-it-evidence contains only case ids, fixture ids, counts, booleans, status labels, and sanitized error codes.

create schema if not exists graphrag_s01;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'graphrag_s01_app') then
    create role graphrag_s01_app login nobypassrls;
  else
    alter role graphrag_s01_app nobypassrls;
  end if;
end
$$;

create table if not exists graphrag_s01.tenants (
  tenant_id text primary key,
  tenant_name_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists graphrag_s01.users (
  tenant_id text not null,
  user_id text not null,
  principal_id text not null,
  clearance_rank integer not null,
  primary key (tenant_id, user_id)
);

create table if not exists graphrag_s01.principals (
  tenant_id text not null,
  principal_id text not null,
  principal_type text not null,
  primary key (tenant_id, principal_id)
);

create table if not exists graphrag_s01.protected_visibility_fixture (
  fixture_id text primary key,
  tenant_id text not null,
  classification_rank integer not null,
  acl_mode text not null,
  acl_principal_ids text[] not null,
  acl_revision bigint not null,
  content_hash text not null
);

create table if not exists graphrag_s01.s01_protected_table_inventory (
  table_name text primary key,
  tenant_owned_required boolean not null,
  rls_required boolean not null,
  force_rls_required boolean not null,
  acl_context_required boolean not null,
  required_columns text[] not null,
  validation_class text not null,
  migration_id text not null
);

create or replace function graphrag_s01.set_request_context(
  p_tenant_id text,
  p_user_id text,
  p_request_id text,
  p_principal_ids text,
  p_clearance_rank integer,
  p_context_version text
) returns void
language plpgsql
as $$
begin
  perform set_config('graphrag.tenant_id', coalesce(p_tenant_id, ''), false);
  perform set_config('graphrag.user_id', coalesce(p_user_id, ''), false);
  perform set_config('graphrag.request_id', coalesce(p_request_id, ''), false);
  perform set_config('graphrag.principal_ids', coalesce(p_principal_ids, ''), false);
  perform set_config('graphrag.clearance_rank', coalesce(p_clearance_rank::text, ''), false);
  perform set_config('graphrag.context_version', coalesce(p_context_version, ''), false);
end
$$;

create or replace function graphrag_s01.clear_request_context() returns void
language plpgsql
as $$
begin
  perform set_config('graphrag.tenant_id', '', false);
  perform set_config('graphrag.user_id', '', false);
  perform set_config('graphrag.request_id', '', false);
  perform set_config('graphrag.principal_ids', '', false);
  perform set_config('graphrag.clearance_rank', '', false);
  perform set_config('graphrag.context_version', '', false);
end
$$;

insert into graphrag_s01.tenants (tenant_id, tenant_name_hash)
values
  ('tenant-default', 'tenant-hash-default'),
  ('tenant-other', 'tenant-hash-other')
on conflict (tenant_id) do update set tenant_name_hash = excluded.tenant_name_hash;

insert into graphrag_s01.users (tenant_id, user_id, principal_id, clearance_rank)
values
  ('tenant-default', 'user-default', 'principal-default', 2),
  ('tenant-other', 'user-other', 'principal-other', 2)
on conflict (tenant_id, user_id) do update set
  principal_id = excluded.principal_id,
  clearance_rank = excluded.clearance_rank;

insert into graphrag_s01.principals (tenant_id, principal_id, principal_type)
values
  ('tenant-default', 'principal-default', 'user'),
  ('tenant-default', 'principal-enterprise-core', 'group'),
  ('tenant-other', 'principal-other', 'user')
on conflict (tenant_id, principal_id) do update set principal_type = excluded.principal_type;

insert into graphrag_s01.protected_visibility_fixture (
  fixture_id,
  tenant_id,
  classification_rank,
  acl_mode,
  acl_principal_ids,
  acl_revision,
  content_hash
) values
  ('fixture-default-tenant-wide', 'tenant-default', 1, 'tenant_wide',
    array['principal-default'], 1, 'hash-default-tenant-wide'),
  ('fixture-other-tenant', 'tenant-other', 1, 'tenant_wide',
    array['principal-other'], 1, 'hash-other-tenant'),
  ('fixture-default-restricted-other-principal', 'tenant-default', 1, 'restricted',
    array['principal-other'], 1, 'hash-restricted-other-principal'),
  ('fixture-default-high-clearance', 'tenant-default', 9, 'tenant_wide',
    array['principal-default'], 1, 'hash-high-clearance')
on conflict (fixture_id) do update set
  tenant_id = excluded.tenant_id,
  classification_rank = excluded.classification_rank,
  acl_mode = excluded.acl_mode,
  acl_principal_ids = excluded.acl_principal_ids,
  acl_revision = excluded.acl_revision,
  content_hash = excluded.content_hash;

insert into graphrag_s01.s01_protected_table_inventory (
  table_name,
  tenant_owned_required,
  rls_required,
  force_rls_required,
  acl_context_required,
  required_columns,
  validation_class,
  migration_id
) values
  ('tenants', true, true, true, true, array['tenant_id'], 'blocking', '001-s01-foundation'),
  ('users', true, true, true, true,
    array['tenant_id', 'user_id', 'principal_id', 'clearance_rank'], 'blocking', '001-s01-foundation'),
  ('principals', true, true, true, true,
    array['tenant_id', 'principal_id', 'principal_type'], 'blocking', '001-s01-foundation'),
  ('protected_visibility_fixture', true, true, true, true,
    array['fixture_id', 'tenant_id', 'classification_rank', 'acl_mode', 'acl_principal_ids', 'acl_revision'],
    'blocking', '001-s01-foundation')
on conflict (table_name) do update set
  tenant_owned_required = excluded.tenant_owned_required,
  rls_required = excluded.rls_required,
  force_rls_required = excluded.force_rls_required,
  acl_context_required = excluded.acl_context_required,
  required_columns = excluded.required_columns,
  validation_class = excluded.validation_class,
  migration_id = excluded.migration_id;

alter table graphrag_s01.tenants enable row level security;
alter table graphrag_s01.tenants force row level security;
alter table graphrag_s01.users enable row level security;
alter table graphrag_s01.users force row level security;
alter table graphrag_s01.principals enable row level security;
alter table graphrag_s01.principals force row level security;
alter table graphrag_s01.protected_visibility_fixture enable row level security;
alter table graphrag_s01.protected_visibility_fixture force row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'graphrag_s01'
      and policyname = 'tenants_default_context_policy'
  ) then
    create policy tenants_default_context_policy on graphrag_s01.tenants
      using (
        tenant_id = current_setting('graphrag.tenant_id', true)
        and current_setting('graphrag.principal_ids', true) <> ''
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'graphrag_s01'
      and policyname = 'users_default_context_policy'
  ) then
    create policy users_default_context_policy on graphrag_s01.users
      using (
        tenant_id = current_setting('graphrag.tenant_id', true)
        and principal_id = any(string_to_array(current_setting('graphrag.principal_ids', true), ','))
        and clearance_rank <= nullif(current_setting('graphrag.clearance_rank', true), '')::integer
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'graphrag_s01'
      and policyname = 'principals_default_context_policy'
  ) then
    create policy principals_default_context_policy on graphrag_s01.principals
      using (
        tenant_id = current_setting('graphrag.tenant_id', true)
        and principal_id = any(string_to_array(current_setting('graphrag.principal_ids', true), ','))
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'graphrag_s01'
      and policyname = 'protected_visibility_fixture_default_context_policy'
  ) then
    create policy protected_visibility_fixture_default_context_policy
      on graphrag_s01.protected_visibility_fixture
      using (
        tenant_id = current_setting('graphrag.tenant_id', true)
        and current_setting('graphrag.principal_ids', true) <> ''
        and classification_rank <= nullif(current_setting('graphrag.clearance_rank', true), '')::integer
        and (
          acl_mode = 'tenant_wide'
          or acl_principal_ids && string_to_array(current_setting('graphrag.principal_ids', true), ',')
        )
      );
  end if;
end
$$;

grant usage on schema graphrag_s01 to graphrag_s01_app;
grant select on
  graphrag_s01.tenants,
  graphrag_s01.users,
  graphrag_s01.principals,
  graphrag_s01.protected_visibility_fixture,
  graphrag_s01.s01_protected_table_inventory
to graphrag_s01_app;
grant execute on function graphrag_s01.set_request_context(text, text, text, text, integer, text)
to graphrag_s01_app;
grant execute on function graphrag_s01.clear_request_context()
to graphrag_s01_app;
