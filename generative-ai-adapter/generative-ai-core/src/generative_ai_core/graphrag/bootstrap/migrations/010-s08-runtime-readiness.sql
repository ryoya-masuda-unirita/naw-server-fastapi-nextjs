-- S08 GraphRAG V0 runtime readiness resources owned by AI-Core.
-- Runtime execution must remain idempotent and non-destructive.
create extension if not exists pgroonga;
create extension if not exists age;

create index if not exists chunks_s08_pgroonga_content_idx
  on graphrag_s02.chunks using pgroonga (content_hash);

create index if not exists evidence_items_s08_pgroonga_source_idx
  on graphrag_s02.evidence_items using pgroonga (evidence_kind);
