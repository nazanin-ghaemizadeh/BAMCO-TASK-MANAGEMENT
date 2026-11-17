-- Individually trackable components and atomic batch custody for all tool workspaces.
DO $migration$
DECLARE
  ws text;
  membership text;
  relation text;
  movement record;
  exit_batch uuid;
  entry_batch uuid;
BEGIN
  FOREACH ws IN ARRAY ARRAY['public','bamco_process','bamco_quality'] LOOP
    membership := CASE WHEN ws='public' THEN 'private.product_workspace_member()'
      ELSE format('%I.workspace_member()',ws||'_private') END;

    EXECUTE format($ddl$
      CREATE TABLE %1$I.tool_components (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tool_id uuid NOT NULL REFERENCES %1$I.tool_assets(id) ON DELETE CASCADE,
        component_no integer NOT NULL,
        component_code text NOT NULL,
        component_name text NOT NULL CHECK (btrim(component_name)<>''),
        serial_number text,
        description text,
        is_primary boolean NOT NULL DEFAULT false,
        is_container boolean NOT NULL DEFAULT false,
        active boolean NOT NULL DEFAULT true,
        revision bigint NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        CONSTRAINT tool_components_tool_number_unique UNIQUE(tool_id,component_no),
        CONSTRAINT tool_components_tool_id_unique UNIQUE(tool_id,id),
        CONSTRAINT tool_components_code_unique UNIQUE(component_code)
      );
      CREATE UNIQUE INDEX tool_one_primary_component ON %1$I.tool_components(tool_id) WHERE is_primary;
      CREATE UNIQUE INDEX tool_one_active_container ON %1$I.tool_components(tool_id) WHERE is_container AND active;
      CREATE INDEX tool_components_inventory ON %1$I.tool_components(tool_id,active,component_no);

      CREATE TABLE %1$I.tool_movement_batches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tool_id uuid NOT NULL REFERENCES %1$I.tool_assets(id) ON DELETE CASCADE,
        action text NOT NULL CHECK (action IN ('exit','return')),
        occurred_at timestamp NOT NULL,
        receiver text NOT NULL CHECK (btrim(receiver)<>''),
        deliverer text NOT NULL CHECK (btrim(deliverer)<>''),
        kind text CHECK (kind IS NULL OR kind IN ('outside','repair')),
        reason text,
        created_by uuid REFERENCES %1$I.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        CONSTRAINT tool_movement_batches_tool_id_unique UNIQUE(tool_id,id),
        CONSTRAINT tool_movement_batch_exit_contract CHECK (
          (action='exit' AND kind IS NOT NULL AND coalesce(btrim(reason),'')<>'')
          OR (action='return' AND kind IS NULL)
        )
      );
      CREATE INDEX tool_movement_batches_history ON %1$I.tool_movement_batches(tool_id,created_at DESC,id DESC);

      ALTER TABLE %1$I.tool_movements
        ADD COLUMN component_id uuid,
        ADD COLUMN exit_batch_id uuid,
        ADD COLUMN entry_batch_id uuid;

      CREATE OR REPLACE FUNCTION %1$I.prepare_tool_component()
      RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog
      AS $component$
      DECLARE parent_code text;
      BEGIN
        IF TG_OP='INSERT' THEN
          SELECT asset_code INTO parent_code FROM %1$I.tool_assets WHERE id=NEW.tool_id FOR UPDATE;
          IF parent_code IS NULL THEN RAISE EXCEPTION 'کارت اصلی ابزار پیدا نشد.'; END IF;
          SELECT coalesce(max(component_no),0)+1 INTO NEW.component_no
          FROM %1$I.tool_components WHERE tool_id=NEW.tool_id;
          NEW.component_code := parent_code||'-C-'||lpad(NEW.component_no::text,4,'0');
        ELSE
          IF NEW.tool_id<>OLD.tool_id THEN RAISE EXCEPTION 'انتقال قطعه به کارت دیگر مجاز نیست.'; END IF;
          NEW.component_no:=OLD.component_no;
          NEW.component_code:=OLD.component_code;
          IF (NEW.is_container OR NOT NEW.active) AND EXISTS(
            SELECT 1 FROM %1$I.tool_movements m
            WHERE m.component_id=OLD.id AND m.entered_at IS NULL
          ) THEN
            RAISE EXCEPTION 'قطعه‌ای که خارج از انبار است، قابل غیرفعال‌سازی یا تبدیل به محفظه نیست.';
          END IF;
          NEW.revision:=OLD.revision+1;
        END IF;
        RETURN NEW;
      END
      $component$;
      CREATE TRIGGER prepare_tool_component BEFORE INSERT OR UPDATE ON %1$I.tool_components
        FOR EACH ROW EXECUTE FUNCTION %1$I.prepare_tool_component();

      CREATE OR REPLACE FUNCTION %1$I.create_primary_tool_component()
      RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog
      AS $primary$
      BEGIN
        INSERT INTO %1$I.tool_components(tool_id,component_name,is_primary)
        VALUES(NEW.id,NEW.name,true);
        RETURN NEW;
      END
      $primary$;
      CREATE TRIGGER create_primary_tool_component AFTER INSERT ON %1$I.tool_assets
        FOR EACH ROW EXECUTE FUNCTION %1$I.create_primary_tool_component();

      CREATE OR REPLACE FUNCTION %1$I.sync_primary_tool_component_name()
      RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog
      AS $sync$
      BEGIN
        IF NEW.name IS DISTINCT FROM OLD.name THEN
          UPDATE %1$I.tool_components SET component_name=NEW.name
          WHERE tool_id=NEW.id AND is_primary AND component_name=OLD.name;
        END IF;
        RETURN NEW;
      END
      $sync$;
      CREATE TRIGGER sync_primary_tool_component_name AFTER UPDATE OF name ON %1$I.tool_assets
        FOR EACH ROW EXECUTE FUNCTION %1$I.sync_primary_tool_component_name();
    $ddl$,ws);

    EXECUTE format($seed$
      INSERT INTO %1$I.tool_components(tool_id,component_name,is_primary)
      SELECT asset.id,asset.name,true FROM %1$I.tool_assets asset
      WHERE NOT EXISTS(SELECT 1 FROM %1$I.tool_components component WHERE component.tool_id=asset.id AND component.is_primary);
    $seed$,ws);

    EXECUTE format('DROP TRIGGER IF EXISTS validate_tool_movement ON %I.tool_movements',ws);
    EXECUTE format($backfill$
      UPDATE %1$I.tool_movements movement SET component_id=component.id
      FROM %1$I.tool_components component
      WHERE component.tool_id=movement.tool_id AND component.is_primary AND movement.component_id IS NULL;
    $backfill$,ws);

    FOR movement IN EXECUTE format(
      'SELECT * FROM %I.tool_movements WHERE exit_batch_id IS NULL ORDER BY registered_at,id',ws
    ) LOOP
      EXECUTE format(
        'INSERT INTO %I.tool_movement_batches(tool_id,action,occurred_at,receiver,deliverer,kind,reason,created_by) VALUES($1,''exit'',$2,$3,$4,$5,$6,NULL) RETURNING id',ws
      ) INTO exit_batch USING movement.tool_id,movement.exited_at,movement.exit_receiver,movement.exit_deliverer,movement.kind,movement.reason;
      entry_batch:=NULL;
      IF movement.entered_at IS NOT NULL THEN
        EXECUTE format(
          'INSERT INTO %I.tool_movement_batches(tool_id,action,occurred_at,receiver,deliverer,kind,reason,created_by) VALUES($1,''return'',$2,$3,$4,NULL,NULL,NULL) RETURNING id',ws
        ) INTO entry_batch USING movement.tool_id,movement.entered_at,movement.entry_receiver,movement.entry_deliverer;
      END IF;
      EXECUTE format('UPDATE %I.tool_movements SET exit_batch_id=$1,entry_batch_id=$2 WHERE id=$3',ws)
        USING exit_batch,entry_batch,movement.id;
    END LOOP;

    EXECUTE format($constraints$
      ALTER TABLE %1$I.tool_movements
        ALTER COLUMN component_id SET NOT NULL,
        ALTER COLUMN exit_batch_id SET NOT NULL,
        ADD CONSTRAINT tool_movements_component_fk FOREIGN KEY(tool_id,component_id)
          REFERENCES %1$I.tool_components(tool_id,id) ON DELETE CASCADE,
        ADD CONSTRAINT tool_movements_exit_batch_fk FOREIGN KEY(tool_id,exit_batch_id)
          REFERENCES %1$I.tool_movement_batches(tool_id,id) ON DELETE CASCADE,
        ADD CONSTRAINT tool_movements_entry_batch_fk FOREIGN KEY(tool_id,entry_batch_id)
          REFERENCES %1$I.tool_movement_batches(tool_id,id) ON DELETE CASCADE,
        ADD CONSTRAINT tool_movements_batch_contract CHECK (
          (entered_at IS NULL AND entry_batch_id IS NULL)
          OR (entered_at IS NOT NULL AND entry_batch_id IS NOT NULL)
        );
      DROP INDEX %1$I.tool_one_open_movement;
      CREATE UNIQUE INDEX tool_one_open_component_movement ON %1$I.tool_movements(component_id) WHERE entered_at IS NULL;
      CREATE INDEX tool_component_movement_history ON %1$I.tool_movements(tool_id,component_id,exited_at DESC,registered_at DESC,id DESC);
    $constraints$,ws);

    EXECUTE format($movement_guard$
      CREATE OR REPLACE FUNCTION %1$I.check_tool_movement()
      RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog
      AS $guard$
      DECLARE component_tool uuid; component_active boolean; component_container boolean; batch_action text; batch_tool uuid;
      BEGIN
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.component_id::text,0));
        SELECT tool_id,active,is_container INTO component_tool,component_active,component_container
        FROM %1$I.tool_components WHERE id=NEW.component_id FOR UPDATE;
        IF component_tool IS NULL OR component_tool<>NEW.tool_id THEN RAISE EXCEPTION 'قطعه به این کارت ابزار تعلق ندارد.'; END IF;
        IF NOT component_active OR component_container THEN RAISE EXCEPTION 'این قطعه فعال و قابل تحویل نیست.'; END IF;

        SELECT action,tool_id INTO batch_action,batch_tool FROM %1$I.tool_movement_batches WHERE id=NEW.exit_batch_id;
        IF batch_tool IS DISTINCT FROM NEW.tool_id OR batch_action IS DISTINCT FROM 'exit' THEN
          RAISE EXCEPTION 'عملیات خروج گروهی معتبر نیست.';
        END IF;
        IF NEW.entered_at IS NULL THEN
          IF NEW.entry_batch_id IS NOT NULL THEN RAISE EXCEPTION 'برای گردش باز، عملیات عودت نباید ثبت شده باشد.'; END IF;
        ELSE
          SELECT action,tool_id INTO batch_action,batch_tool FROM %1$I.tool_movement_batches WHERE id=NEW.entry_batch_id;
          IF batch_tool IS DISTINCT FROM NEW.tool_id OR batch_action IS DISTINCT FROM 'return' THEN
            RAISE EXCEPTION 'عملیات عودت گروهی معتبر نیست.';
          END IF;
          IF NEW.entered_at<NEW.exited_at THEN RAISE EXCEPTION 'زمان عودت نمی‌تواند پیش از خروج باشد.'; END IF;
        END IF;
        IF TG_OP='UPDATE' AND OLD.entered_at IS NOT NULL AND NEW.entered_at IS NULL THEN
          RAISE EXCEPTION 'گردش بسته‌شده را نمی‌توان دوباره باز کرد.';
        END IF;
        IF EXISTS (
          SELECT 1 FROM %1$I.tool_movements other
          WHERE other.component_id=NEW.component_id AND other.id<>NEW.id
            AND other.exited_at<coalesce(NEW.entered_at,'infinity'::timestamp)
            AND NEW.exited_at<coalesce(other.entered_at,'infinity'::timestamp)
        ) THEN RAISE EXCEPTION 'بازه خروج و عودت این قطعه با گردش دیگری هم‌پوشانی دارد.'; END IF;
        RETURN NEW;
      END
      $guard$;
      CREATE TRIGGER validate_tool_movement BEFORE INSERT OR UPDATE ON %1$I.tool_movements
        FOR EACH ROW EXECUTE FUNCTION %1$I.check_tool_movement();
    $movement_guard$,ws);

    EXECUTE format($checkout$
      CREATE OR REPLACE FUNCTION %1$I.checkout_tool_components(
        p_tool_id uuid,p_component_ids uuid[],p_occurred_at timestamp,
        p_receiver text,p_deliverer text,p_kind text,p_reason text
      ) RETURNS SETOF %1$I.tool_movements
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
      AS $checkout_fn$
      DECLARE batch_id uuid; matched integer; distinct_count integer;
      BEGIN
        IF auth.uid() IS NULL OR NOT %1$I.can_access_feature('tools','view')
          OR NOT %1$I.can_access_feature('tools','create') THEN
          RAISE EXCEPTION 'اجازه ثبت خروج ابزار را ندارید.' USING ERRCODE='42501';
        END IF;
        IF p_occurred_at IS NULL OR coalesce(btrim(p_receiver),'')='' OR coalesce(btrim(p_deliverer),'')=''
          OR coalesce(btrim(p_reason),'')='' OR p_kind NOT IN ('outside','repair') THEN
          RAISE EXCEPTION 'اطلاعات تحویل کامل یا معتبر نیست.';
        END IF;
        IF coalesce(cardinality(p_component_ids),0)=0 THEN RAISE EXCEPTION 'حداقل یک قطعه را انتخاب کنید.'; END IF;
        SELECT count(DISTINCT item) INTO distinct_count FROM unnest(p_component_ids) item;
        IF distinct_count<>cardinality(p_component_ids) THEN RAISE EXCEPTION 'یک قطعه بیش از یک‌بار انتخاب شده است.'; END IF;
        PERFORM 1 FROM %1$I.tool_components component
        WHERE component.tool_id=p_tool_id AND component.id=ANY(p_component_ids)
          AND component.active AND NOT component.is_container
        ORDER BY component.id FOR UPDATE;
        GET DIAGNOSTICS matched=ROW_COUNT;
        IF matched<>cardinality(p_component_ids) THEN RAISE EXCEPTION 'یکی از قطعات انتخاب‌شده غیرفعال یا متعلق به این کارت نیست.'; END IF;
        IF EXISTS(SELECT 1 FROM %1$I.tool_movements movement WHERE movement.component_id=ANY(p_component_ids) AND movement.entered_at IS NULL) THEN
          RAISE EXCEPTION 'حداقل یکی از قطعات قبلاً خارج شده است.';
        END IF;
        IF EXISTS(SELECT 1 FROM %1$I.tool_movements movement WHERE movement.component_id=ANY(p_component_ids) AND movement.exited_at>p_occurred_at) THEN
          RAISE EXCEPTION 'زمان خروج باید پس از آخرین گردش هر قطعه باشد.';
        END IF;
        INSERT INTO %1$I.tool_movement_batches(tool_id,action,occurred_at,receiver,deliverer,kind,reason)
        VALUES(p_tool_id,'exit',p_occurred_at,p_receiver,p_deliverer,p_kind,p_reason) RETURNING id INTO batch_id;
        RETURN QUERY
        INSERT INTO %1$I.tool_movements(tool_id,component_id,exit_batch_id,kind,exited_at,exit_receiver,exit_deliverer,reason)
        SELECT p_tool_id,component.id,batch_id,p_kind,p_occurred_at,p_receiver,p_deliverer,p_reason
        FROM %1$I.tool_components component
        WHERE component.tool_id=p_tool_id AND component.id=ANY(p_component_ids)
        ORDER BY component.id RETURNING *;
      END
      $checkout_fn$;
    $checkout$,ws);

    EXECUTE format($return$
      CREATE OR REPLACE FUNCTION %1$I.return_tool_components(
        p_tool_id uuid,p_component_ids uuid[],p_occurred_at timestamp,
        p_receiver text,p_deliverer text,p_reason text DEFAULT NULL
      ) RETURNS SETOF %1$I.tool_movements
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
      AS $return_fn$
      DECLARE batch_id uuid; matched integer; distinct_count integer;
      BEGIN
        IF auth.uid() IS NULL OR NOT %1$I.can_access_feature('tools','view')
          OR NOT %1$I.can_access_feature('tools','edit') THEN
          RAISE EXCEPTION 'اجازه ثبت عودت ابزار را ندارید.' USING ERRCODE='42501';
        END IF;
        IF p_occurred_at IS NULL OR coalesce(btrim(p_receiver),'')='' OR coalesce(btrim(p_deliverer),'')='' THEN
          RAISE EXCEPTION 'اطلاعات عودت کامل یا معتبر نیست.';
        END IF;
        IF coalesce(cardinality(p_component_ids),0)=0 THEN RAISE EXCEPTION 'حداقل یک قطعه را انتخاب کنید.'; END IF;
        SELECT count(DISTINCT item) INTO distinct_count FROM unnest(p_component_ids) item;
        IF distinct_count<>cardinality(p_component_ids) THEN RAISE EXCEPTION 'یک قطعه بیش از یک‌بار انتخاب شده است.'; END IF;
        PERFORM 1 FROM %1$I.tool_movements movement
        WHERE movement.tool_id=p_tool_id AND movement.component_id=ANY(p_component_ids) AND movement.entered_at IS NULL
        ORDER BY movement.component_id FOR UPDATE;
        GET DIAGNOSTICS matched=ROW_COUNT;
        IF matched<>cardinality(p_component_ids) THEN RAISE EXCEPTION 'همه قطعات انتخاب‌شده در حال حاضر خارج از انبار نیستند.'; END IF;
        IF EXISTS(SELECT 1 FROM %1$I.tool_movements movement
          WHERE movement.tool_id=p_tool_id AND movement.component_id=ANY(p_component_ids)
            AND movement.entered_at IS NULL AND movement.exited_at>p_occurred_at) THEN
          RAISE EXCEPTION 'زمان عودت نمی‌تواند پیش از خروج باشد.';
        END IF;
        INSERT INTO %1$I.tool_movement_batches(tool_id,action,occurred_at,receiver,deliverer,reason)
        VALUES(p_tool_id,'return',p_occurred_at,p_receiver,p_deliverer,p_reason) RETURNING id INTO batch_id;
        RETURN QUERY
        UPDATE %1$I.tool_movements movement
        SET entered_at=p_occurred_at,entry_receiver=p_receiver,entry_deliverer=p_deliverer,entry_batch_id=batch_id
        WHERE movement.tool_id=p_tool_id AND movement.component_id=ANY(p_component_ids) AND movement.entered_at IS NULL
        RETURNING movement.*;
      END
      $return_fn$;
    $return$,ws);

    FOREACH relation IN ARRAY ARRAY['tool_components','tool_movement_batches'] LOOP
      EXECUTE format($policies$
        ALTER TABLE %1$I.%2$I ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON %1$I.%2$I FROM PUBLIC,anon,authenticated;
        GRANT SELECT ON %1$I.%2$I TO authenticated;
        CREATE POLICY tool_workspace ON %1$I.%2$I AS RESTRICTIVE FOR ALL TO authenticated
          USING((SELECT %3$s)) WITH CHECK((SELECT %3$s));
        CREATE POLICY tool_read ON %1$I.%2$I FOR SELECT TO authenticated
          USING((SELECT %1$I.can_access_feature('tools','view')));
      $policies$,ws,relation,membership);
    END LOOP;

    EXECUTE format($component_policies$
      CREATE POLICY tool_add ON %1$I.tool_components FOR INSERT TO authenticated
        WITH CHECK((SELECT %1$I.can_access_feature('tools','view')) AND (SELECT %1$I.can_access_feature('tools','create')));
      CREATE POLICY tool_change ON %1$I.tool_components FOR UPDATE TO authenticated
        USING((SELECT %1$I.can_access_feature('tools','edit')))
        WITH CHECK((SELECT %1$I.can_access_feature('tools','edit')));
      CREATE POLICY tool_batch_exit ON %1$I.tool_movement_batches FOR INSERT TO authenticated
        WITH CHECK(action='exit' AND (SELECT %1$I.can_access_feature('tools','view')) AND (SELECT %1$I.can_access_feature('tools','create')));
      CREATE POLICY tool_batch_return ON %1$I.tool_movement_batches FOR INSERT TO authenticated
        WITH CHECK(action='return' AND (SELECT %1$I.can_access_feature('tools','view')) AND (SELECT %1$I.can_access_feature('tools','edit')));
      GRANT INSERT(tool_id,component_name,serial_number,description,is_container) ON %1$I.tool_components TO authenticated;
      GRANT UPDATE(component_name,serial_number,description,is_container,active) ON %1$I.tool_components TO authenticated;
      GRANT INSERT(tool_id,action,occurred_at,receiver,deliverer,kind,reason) ON %1$I.tool_movement_batches TO authenticated;
      GRANT INSERT(tool_id,component_id,exit_batch_id,kind,exited_at,exit_receiver,exit_deliverer,reason),
        UPDATE(kind,exited_at,exit_receiver,exit_deliverer,reason,entered_at,entry_receiver,entry_deliverer,entry_batch_id)
        ON %1$I.tool_movements TO authenticated;
      GRANT EXECUTE ON FUNCTION %1$I.checkout_tool_components(uuid,uuid[],timestamp,text,text,text,text) TO authenticated;
      GRANT EXECUTE ON FUNCTION %1$I.return_tool_components(uuid,uuid[],timestamp,text,text,text) TO authenticated;
    $component_policies$,ws);

    EXECUTE format($revoke$
      REVOKE ALL ON FUNCTION %1$I.prepare_tool_component() FROM PUBLIC,anon,authenticated;
      REVOKE ALL ON FUNCTION %1$I.create_primary_tool_component() FROM PUBLIC,anon,authenticated;
      REVOKE ALL ON FUNCTION %1$I.sync_primary_tool_component_name() FROM PUBLIC,anon,authenticated;
      REVOKE ALL ON FUNCTION %1$I.check_tool_movement() FROM PUBLIC,anon,authenticated;
      REVOKE ALL ON FUNCTION %1$I.checkout_tool_components(uuid,uuid[],timestamp,text,text,text,text) FROM PUBLIC,anon;
      REVOKE ALL ON FUNCTION %1$I.return_tool_components(uuid,uuid[],timestamp,text,text,text) FROM PUBLIC,anon;
    $revoke$,ws);
  END LOOP;
END
$migration$;
NOTIFY pgrst,'reload schema';