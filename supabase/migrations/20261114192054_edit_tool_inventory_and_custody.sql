DO $migration$
DECLARE
  ws text;
  relation text;
BEGIN
  FOREACH ws IN ARRAY ARRAY['public','bamco_process','bamco_quality'] LOOP
    EXECUTE format($schema$
      ALTER TABLE %1$I.tool_movements DROP CONSTRAINT tool_movements_tool_id_fkey,
        ADD CONSTRAINT tool_movements_tool_id_fkey FOREIGN KEY (tool_id)
        REFERENCES %1$I.tool_assets(id) ON DELETE CASCADE;
      GRANT UPDATE(kind,exited_at,exit_receiver,exit_deliverer,reason) ON %1$I.tool_movements TO authenticated;

      CREATE OR REPLACE FUNCTION %1$I.check_tool_movement() RETURNS trigger LANGUAGE plpgsql
      SET search_path = pg_catalog AS $guard$
      BEGIN
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tool_id::text,0));
        IF TG_OP = 'UPDATE' AND OLD.entered_at IS NOT NULL AND NEW.entered_at IS NULL THEN
          RAISE EXCEPTION 'برای گردش بسته‌شده، اطلاعات ورود الزامی است.';
        END IF;
        IF EXISTS (
          SELECT 1 FROM %1$I.tool_movements AS m
          WHERE m.tool_id = NEW.tool_id AND m.id <> NEW.id
            AND m.exited_at < coalesce(NEW.entered_at, 'infinity'::timestamp)
            AND NEW.exited_at < coalesce(m.entered_at, 'infinity'::timestamp)
        ) THEN
          RAISE EXCEPTION 'بازهٔ خروج و ورود با گردش دیگری از این ابزار هم‌پوشانی دارد.';
        END IF;
        RETURN NEW;
      END $guard$;

      CREATE FUNCTION %1$I.bump_tool_revision() RETURNS trigger LANGUAGE plpgsql
      SET search_path = pg_catalog AS $bump$
      BEGIN
        NEW.revision := OLD.revision + 1;
        RETURN NEW;
      END $bump$;
      REVOKE ALL ON FUNCTION %1$I.bump_tool_revision() FROM PUBLIC, anon, authenticated;
    $schema$, ws);

    FOREACH relation IN ARRAY ARRAY['tool_assets','tool_movements'] LOOP
      EXECUTE format($table$
        ALTER TABLE %1$I.%2$I ADD COLUMN revision bigint NOT NULL DEFAULT 1;
        CREATE TRIGGER bump_tool_revision BEFORE UPDATE ON %1$I.%2$I
          FOR EACH ROW EXECUTE FUNCTION %1$I.bump_tool_revision();
        GRANT DELETE ON %1$I.%2$I TO authenticated;
        CREATE POLICY tool_delete ON %1$I.%2$I FOR DELETE TO authenticated
          USING ((SELECT %1$I.can_access_feature('tools','view')) AND (SELECT %1$I.can_access_feature('tools','delete')));
      $table$, ws, relation);
    END LOOP;
  END LOOP;
END $migration$;
NOTIFY pgrst, 'reload schema';
