-- Trigram indexes for the command-palette search (entries/search endpoint).
-- pg_trgm is already enabled in 0001_rls.sql.

CREATE INDEX IF NOT EXISTS idx_users_name_trgm
  ON users USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_modules_label_trgm
  ON modules USING GIN (label gin_trgm_ops);
