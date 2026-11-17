-- The tool asset AFTER INSERT trigger seeds its primary component.
-- Permit only the primary marker in addition to the normal component fields.
DO $grant$
DECLARE ws text;
BEGIN
  FOREACH ws IN ARRAY ARRAY['public','bamco_process','bamco_quality'] LOOP
    EXECUTE format('GRANT INSERT(is_primary) ON %I.tool_components TO authenticated',ws);
  END LOOP;
END
$grant$;