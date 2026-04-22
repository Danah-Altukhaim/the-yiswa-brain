-- RLS setup. Run AFTER `prisma migrate deploy` has created the schema.
-- Executed by the migration role (BYPASSRLS). Runtime app uses app_runtime (no BYPASSRLS).

-- 1. Roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime LOGIN PASSWORD 'pw';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_migrate') THEN
    CREATE ROLE app_migrate LOGIN PASSWORD 'pw' BYPASSRLS;
  END IF;
END$$;

GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;

-- 2. Helper: current tenant from session var
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

-- 3. Enable + FORCE RLS on every tenant-scoped table
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'users','modules','entries','entry_versions','media',
    'chat_sessions','voice_transcripts','api_keys','audit_log',
    'permissions','content_analytics','ai_suggestions',
    'scheduled_jobs','activity_feed','import_logs','migration_diffs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_isolation ON %I;
       CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = current_tenant_id())
         WITH CHECK (tenant_id = current_tenant_id())', t, t);
  END LOOP;
END$$;

-- tenants table: readable if slug matches request OR admin bypass via SET LOCAL app.is_admin = 'true'
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self ON tenants;
CREATE POLICY tenant_self ON tenants
  USING (id = current_tenant_id() OR current_setting('app.is_admin', true) = 'true')
  WITH CHECK (id = current_tenant_id() OR current_setting('app.is_admin', true) = 'true');

-- 4. JSONB + search indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_entries_data_path_ops
  ON entries USING GIN (data jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_entries_data_name_trgm
  ON entries USING GIN ((data->>'name') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entries_data_name_en_trgm
  ON entries USING GIN ((data->>'name_en') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entries_status_expr
  ON entries ((data->>'status'));
