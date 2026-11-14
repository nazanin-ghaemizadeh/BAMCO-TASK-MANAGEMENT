-- Each existing workspace has its own inventory and uses its own feature grants.
DO $migration$
DECLARE
  ws text;
  relation text;
  membership text;
BEGIN
  FOREACH ws IN ARRAY ARRAY['public','bamco_process','bamco_quality'] LOOP
    membership := CASE WHEN ws = 'public' THEN 'private.product_workspace_member()'
                       ELSE format('%I.workspace_member()', ws || '_private') END;
    EXECUTE format($schema$
      CREATE TABLE %1$I.tool_assets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL CHECK (btrim(name) <> ''),
        asset_code text NOT NULL CHECK (btrim(asset_code) <> ''),
        purchased_on date,
        purchase_receiver text
      );
      CREATE UNIQUE INDEX tool_asset_code_unique ON %1$I.tool_assets
        (lower(translate(btrim(asset_code), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')));
      CREATE TABLE %1$I.tool_movements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tool_id uuid NOT NULL REFERENCES %1$I.tool_assets(id),
        kind text NOT NULL CHECK (kind IN ('outside','repair')),
        exited_at timestamp NOT NULL,
        exit_receiver text NOT NULL CHECK (btrim(exit_receiver) <> ''),
        exit_deliverer text NOT NULL CHECK (btrim(exit_deliverer) <> ''),
        reason text NOT NULL CHECK (btrim(reason) <> ''),
        entered_at timestamp,
        entry_receiver text,
        entry_deliverer text,
        registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        CHECK ((entered_at IS NULL AND entry_receiver IS NULL AND entry_deliverer IS NULL)
            OR (entered_at >= exited_at AND entered_at IS NOT NULL AND
                coalesce(btrim(entry_receiver),'') <> '' AND coalesce(btrim(entry_deliverer),'') <> ''))
      );
      CREATE UNIQUE INDEX tool_one_open_movement ON %1$I.tool_movements(tool_id) WHERE entered_at IS NULL;
      CREATE INDEX tool_movement_history ON %1$I.tool_movements(tool_id,exited_at DESC,registered_at DESC,id DESC);

      CREATE FUNCTION %1$I.check_tool_movement() RETURNS trigger LANGUAGE plpgsql
      SET search_path = pg_catalog AS $guard$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tool_id::text,0));
          IF EXISTS (SELECT 1 FROM %1$I.tool_movements WHERE tool_id=NEW.tool_id AND entered_at IS NULL) THEN
            RAISE EXCEPTION 'ابتدا ورود ابزار را ثبت کنید.';
          END IF;
          IF EXISTS (SELECT 1 FROM %1$I.tool_movements WHERE tool_id=NEW.tool_id AND entered_at > NEW.exited_at) THEN
            RAISE EXCEPTION 'زمان خروج باید پس از آخرین ورود ابزار باشد.';
          END IF;
        ELSIF OLD.entered_at IS NOT NULL OR NEW.entered_at IS NULL THEN
          RAISE EXCEPTION 'این گردش قبلاً بسته شده یا اطلاعات ورود کامل نیست.';
        END IF;
        RETURN NEW;
      END $guard$;
      REVOKE ALL ON FUNCTION %1$I.check_tool_movement() FROM PUBLIC, anon, authenticated;
      CREATE TRIGGER validate_tool_movement BEFORE INSERT OR UPDATE ON %1$I.tool_movements
        FOR EACH ROW EXECUTE FUNCTION %1$I.check_tool_movement();
    $schema$, ws);

    FOREACH relation IN ARRAY ARRAY['tool_assets','tool_movements'] LOOP
      EXECUTE format($policies$
        ALTER TABLE %1$I.%2$I ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON %1$I.%2$I FROM PUBLIC, anon, authenticated;
        GRANT SELECT ON %1$I.%2$I TO authenticated;
        CREATE POLICY tool_workspace ON %1$I.%2$I AS RESTRICTIVE FOR ALL TO authenticated
          USING ((SELECT %3$s)) WITH CHECK ((SELECT %3$s));
        CREATE POLICY tool_read ON %1$I.%2$I FOR SELECT TO authenticated
          USING ((SELECT %1$I.can_access_feature('tools','view')));
        CREATE POLICY tool_add ON %1$I.%2$I FOR INSERT TO authenticated
          WITH CHECK ((SELECT %1$I.can_access_feature('tools','view')) AND (SELECT %1$I.can_access_feature('tools','create')));
        CREATE POLICY tool_change ON %1$I.%2$I FOR UPDATE TO authenticated
          USING ((SELECT %1$I.can_access_feature('tools','edit')))
          WITH CHECK ((SELECT %1$I.can_access_feature('tools','edit')));
      $policies$, ws, relation, membership);
    END LOOP;
    EXECUTE format($privileges$
      GRANT INSERT(name,asset_code,purchased_on,purchase_receiver), UPDATE(name,asset_code,purchased_on,purchase_receiver) ON %1$I.tool_assets TO authenticated;
      GRANT INSERT(tool_id,kind,exited_at,exit_receiver,exit_deliverer,reason), UPDATE(entered_at,entry_receiver,entry_deliverer) ON %1$I.tool_movements TO authenticated;
    $privileges$, ws);
  END LOOP;
END $migration$;
NOTIFY pgrst, 'reload schema';
