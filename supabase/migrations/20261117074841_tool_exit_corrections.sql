DO $integrity$
DECLARE ws text;
BEGIN
  FOREACH ws IN ARRAY ARRAY['public','bamco_process','bamco_quality'] LOOP
    EXECUTE format($fn$
      CREATE OR REPLACE FUNCTION %1$I.check_tool_movement()
      RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog
      AS $guard$
      DECLARE
        component_tool uuid;
        component_active boolean;
        component_container boolean;
        batch_action text;
        batch_tool uuid;
        batch_at timestamp;
        batch_receiver text;
        batch_deliverer text;
        batch_kind text;
        batch_reason text;
      BEGIN
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.component_id::text,0));
        SELECT tool_id,active,is_container INTO component_tool,component_active,component_container
        FROM %1$I.tool_components WHERE id=NEW.component_id FOR UPDATE;
        IF component_tool IS NULL OR component_tool<>NEW.tool_id THEN
          RAISE EXCEPTION 'قطعه به این کارت ابزار تعلق ندارد.';
        END IF;
        -- Closed history remains correctable after a component is retired or becomes a case.
        IF (NOT component_active OR component_container) AND (
          TG_OP='INSERT' OR OLD.entered_at IS NULL OR
          (NEW.component_id,NEW.tool_id,NEW.entered_at,NEW.entry_batch_id,NEW.entry_receiver,NEW.entry_deliverer)
            IS DISTINCT FROM
          (OLD.component_id,OLD.tool_id,OLD.entered_at,OLD.entry_batch_id,OLD.entry_receiver,OLD.entry_deliverer)
        ) THEN
          RAISE EXCEPTION 'این قطعه فعال و قابل تحویل نیست.';
        END IF;

        -- A batch records the original group handoff. Further edits belong to the
        -- individual movement and keep its link to the original batch.
        IF TG_OP='INSERT' OR NEW.exit_batch_id IS DISTINCT FROM OLD.exit_batch_id THEN
          SELECT action,tool_id,occurred_at,receiver,deliverer,kind,reason
            INTO batch_action,batch_tool,batch_at,batch_receiver,batch_deliverer,batch_kind,batch_reason
          FROM %1$I.tool_movement_batches WHERE id=NEW.exit_batch_id;
          IF batch_tool IS DISTINCT FROM NEW.tool_id OR batch_action IS DISTINCT FROM 'exit'
            OR batch_at IS DISTINCT FROM NEW.exited_at
            OR batch_receiver IS DISTINCT FROM NEW.exit_receiver
            OR batch_deliverer IS DISTINCT FROM NEW.exit_deliverer
            OR batch_kind IS DISTINCT FROM NEW.kind
            OR batch_reason IS DISTINCT FROM NEW.reason THEN
            RAISE EXCEPTION 'اطلاعات گردش با عملیات خروج گروهی مطابقت ندارد.';
          END IF;
        END IF;

        IF NEW.entered_at IS NULL THEN
          IF NEW.entry_batch_id IS NOT NULL THEN
            RAISE EXCEPTION 'برای گردش باز، عملیات عودت نباید ثبت شده باشد.';
          END IF;
        ELSE
          SELECT action,tool_id,occurred_at,receiver,deliverer
            INTO batch_action,batch_tool,batch_at,batch_receiver,batch_deliverer
          FROM %1$I.tool_movement_batches WHERE id=NEW.entry_batch_id;
          IF batch_tool IS DISTINCT FROM NEW.tool_id OR batch_action IS DISTINCT FROM 'return'
            OR batch_at IS DISTINCT FROM NEW.entered_at
            OR batch_receiver IS DISTINCT FROM NEW.entry_receiver
            OR batch_deliverer IS DISTINCT FROM NEW.entry_deliverer THEN
            RAISE EXCEPTION 'اطلاعات گردش با عملیات عودت گروهی مطابقت ندارد.';
          END IF;
          IF NEW.entered_at<NEW.exited_at THEN
            RAISE EXCEPTION 'زمان عودت نمی‌تواند پیش از خروج باشد.';
          END IF;
        END IF;

        IF TG_OP='UPDATE' AND OLD.entered_at IS NOT NULL AND NEW.entered_at IS NULL THEN
          RAISE EXCEPTION 'گردش بسته‌شده را نمی‌توان دوباره باز کرد.';
        END IF;
        IF EXISTS (
          SELECT 1 FROM %1$I.tool_movements other
          WHERE other.component_id=NEW.component_id AND other.id<>NEW.id
            AND other.exited_at<coalesce(NEW.entered_at,'infinity'::timestamp)
            AND NEW.exited_at<coalesce(other.entered_at,'infinity'::timestamp)
        ) THEN
          RAISE EXCEPTION 'بازه خروج و عودت این قطعه با گردش دیگری هم‌پوشانی دارد.';
        END IF;
        RETURN NEW;
      END
      $guard$;
    $fn$,ws);
  END LOOP;
END
$integrity$;
NOTIFY pgrst,'reload schema';