CREATE OR REPLACE FUNCTION private.enforce_task_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare new_kind text; old_kind text;
begin
 if tg_op='UPDATE' and current_setting('bamco.resequencing',true)='1' then return new;end if;
 -- Account removal changes references only; historic dates/statuses must survive.
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
 select (private.task_status_option(new.status)).kind into new_kind;
 if new_kind is null then raise exception 'وضعیت معتبر انتخاب کنید.';end if;
 if tg_op='UPDATE' then select (private.task_status_option(old.status)).kind into old_kind;end if;
 if tg_op='UPDATE' and old.owner_id is null and old.owner_deleted_at is not null
 and not old.archived and old_kind not in ('completed','cancelled')
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
 if new_kind='registered' then
  new.owner_id=null;new.start_date=null;new.due_date=null;new.done_date=null;
 elsif new_kind='active' then
  if (new.owner_id is null and new.owner_deleted_at is null) or new.start_date is null or new.due_date is null then
   raise exception 'وظیفه در حال انجام باید متولی، تاریخ شروع و تاریخ پایان داشته باشد';end if;
  new.done_date=null;
 elsif new_kind='waiting' then new.due_date=null;new.done_date=null;
 elsif new_kind='completed' and new.done_date is null then new.done_date=current_date;
 end if;
 if new.due_date is not null and new.start_date is not null and new.due_date<new.start_date then raise exception 'تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد';end if;
 if new.done_date is not null and new_kind<>'completed' then raise exception 'تاریخ انجام فقط برای وظیفه انجام‌شده مجاز است';end if;
 new.last_updated_at=now();if tg_op='UPDATE' then new.row_version=old.row_version+1;end if;
 return new;
end $function$
