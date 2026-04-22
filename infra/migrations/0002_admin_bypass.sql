-- Extend tenant_isolation policy on every tenant-scoped table to also allow
-- the is_admin bypass so bootstrap paths (login) can cross tenants cleanly.
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
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = current_tenant_id() OR current_setting(''app.is_admin'', true) = ''true'')
         WITH CHECK (tenant_id = current_tenant_id() OR current_setting(''app.is_admin'', true) = ''true'')',
      t);
  END LOOP;
END$$;
