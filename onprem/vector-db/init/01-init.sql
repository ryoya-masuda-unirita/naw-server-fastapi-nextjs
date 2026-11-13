-- 初回起動時（データが空のとき）だけ実行される
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgroonga;
CREATE EXTENSION IF NOT EXISTS age;
ALTER DATABASE onprem_vector SET session_preload_libraries = 'age';
ALTER DATABASE onprem_vector SET search_path = ag_catalog, "$user", public;
LOAD 'age';
SET search_path = ag_catalog, "$user", public;
SELECT create_graph('embedding_graph')
WHERE NOT EXISTS (
  SELECT 1
  FROM ag_catalog.ag_graph
  WHERE name = 'embedding_graph'
);
