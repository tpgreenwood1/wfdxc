CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS runners_name_trgm_idx ON runners USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS runner_aliases_alias_trgm_idx ON runner_aliases USING gin (alias gin_trgm_ops);
