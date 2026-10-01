-- Restore catalog-driven validation accidentally replaced by the later legacy
-- optimize_task_lifecycle_resequence migration. No RLS/permission changes.
-- Existing rows are deliberately not bulk-rewritten here: future completed
-- writes auto-archive, and legacy completed rows are repaired when edited.
-- Audit/backfill of existing production rows needs separate reviewed execution.

CREATE OR REPLACE FUNCTION private.enforce_task_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare st public.task_statuses; pr public.priorities; old_st public.task_statuses; old_pr public.priorities; changed boolean;
begin
 -- Retain the later display-ID-only maintenance fast path.
 if tg_op='UPDATE' and current_setting('bamco.resequencing',true)='1' then return new;end if;
 if tg_op='UPDATE' and current_user='postgres' and pg_trigger_depth()>1 and current_setting('bamco.catalog_rename',true)='1' and (to_jsonb(new)-array['status','priority'])=(to_jsonb(old)-array['status','priority']) then return new;end if;

 -- Account removal changes references only; historic dates/statuses must survive,
 -- including legacy records that predate the current task validation rules.
 if tg_op='UPDATE' and current_user='postgres'
 and nullif(current_setting('bamco.deleting_person',true),'') is not null then
  if (to_jsonb(new)-array['owner_id','created_by']) is distinct from (to_jsonb(old)-array['owner_id','created_by'])
  or (new.owner_id is distinct from old.owner_id and not(new.owner_id is null and old.owner_id::text=current_setting('bamco.deleting_person',true)))
  or (new.created_by is distinct from old.created_by and not(new.created_by is null and old.created_by::text=current_setting('bamco.deleting_person',true))) then
   raise exception 'حذف حساب فقط مجاز به حذف ارتباط فرد با وظیفه است';
  end if;
  if old.owner_id is not null and new.owner_id is null then
   select full_name into new.former_owner_name from public.profiles where id=old.owner_id;
   new.owner_deleted_at=now();
  end if;
  new.last_updated_at=now();new.row_version=old.row_version+1;return new;
 end if;
 -- A manager can resolve one orphaned active task without rewriting its history.
 if tg_op='UPDATE' and old.owner_id is null and old.owner_deleted_at is not null
 and not old.archived and (private.task_status_option(old.status)).kind not in ('completed','cancelled')
 and new.owner_id is not null
 and (to_jsonb(new)-array['owner_id'])=(to_jsonb(old)-array['owner_id']) then
  if not private.is_manager() or not exists(select 1 from public.profiles where id=new.owner_id and active) then
   raise exception 'متولی فعال و دسترسی مدیر لازم است' using errcode='42501';
  end if;
  new.former_owner_name=null;new.owner_deleted_at=null;
  new.last_updated_at=now();new.row_version=old.row_version+1;return new;
 end if;
 if new.owner_id is not null then new.former_owner_name=null;new.owner_deleted_at=null;
 elsif tg_op='UPDATE' and old.owner_id is not null
 and current_user='postgres' and current_setting('bamco.deleting_person',true)=old.owner_id::text then
  select full_name into new.former_owner_name from public.profiles where id=old.owner_id;
  new.owner_deleted_at=now();
 elsif tg_op='INSERT' then
  if new.owner_deleted_at is not null or new.former_owner_name is not null then raise exception 'اطلاعات حذف متولی قابل ثبت دستی نیست';end if;
 elsif new.owner_deleted_at is distinct from old.owner_deleted_at or new.former_owner_name is distinct from old.former_owner_name then
  raise exception 'اطلاعات حذف متولی قابل تغییر دستی نیست';
 end if;
 st=private.task_status_option(new.status);pr=private.task_priority_option(new.priority);
 if st.key is null then raise exception 'وضعیت تعریف نشده است';end if;
 if pr.key is null then raise exception 'اولویت تعریف نشده است';end if;
 if tg_op='UPDATE' then old_st=private.task_status_option(old.status);old_pr=private.task_priority_option(old.priority);end if;
 if not st.active and (tg_op='INSERT' or st.key is distinct from old_st.key) then raise exception 'این وضعیت غیرفعال است';end if;
 if not pr.active and (tg_op='INSERT' or pr.key is distinct from old_pr.key) then raise exception 'این اولویت غیرفعال است';end if;
 new.status=st.label;new.priority=pr.label;
 changed=tg_op='INSERT';
 if tg_op='UPDATE' then changed=st.key is distinct from old_st.key or (new.owner_id,new.start_date,new.due_date,new.done_date,new.archived) is distinct from (old.owner_id,old.start_date,old.due_date,old.done_date,old.archived);end if;
 if changed then
  if st.owner_mode='none' then new.owner_id=null;elsif st.owner_mode='required' and new.owner_id is null and new.owner_deleted_at is null then raise exception 'این وضعیت به متولی نیاز دارد';end if;
  if st.start_mode='none' then new.start_date=null;elsif st.start_mode='required' and new.start_date is null then raise exception 'تاریخ شروع برای این وضعیت الزامی است';end if;
  if st.due_mode='none' then new.due_date=null;elsif st.due_mode='required' and new.due_date is null then raise exception 'تاریخ پایان برای این وضعیت الزامی است';end if;
  if not st.tracks_deadline then new.reminder_days=0;end if;
  if st.kind<>'completed' then new.done_date=null;end if;
  if (new.archived or st.kind='completed') and (tg_op='INSERT' or not old.archived) and not st.archivable then raise exception 'این وضعیت اجازه انتقال به آرشیو ندارد';end if;
  if new.due_date is not null and new.start_date is not null and new.due_date<new.start_date then raise exception 'تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد';end if;
 end if;
 if st.kind='completed' then new.done_date=coalesce(new.done_date,current_date);new.archived=true;new.archived_at=coalesce(new.archived_at,now());end if;
 new.last_updated_at=now();if tg_op='UPDATE' then new.row_version=old.row_version+1;end if;
 return new;
end $function$
;

