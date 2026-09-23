begin;

update public.feature_access_grants grant_row
set effect = 'allow',
    can_view = true,
    can_create = true,
    can_edit = true,
    can_delete = true,
    can_export = true,
    revoked_at = null
where grant_row.feature_key = 'invoices'
  and grant_row.subject_kind = 'user'
  and grant_row.user_id in (
    select id
    from public.profiles
    where active
      and btrim(replace(full_name, E'‌', '')) = 'نازنین قائمی'
  );

insert into public.feature_access_grants (
  feature_key, subject_kind, user_id, effect,
  can_view, can_create, can_edit, can_delete, can_export,
  granted_by
)
select 'invoices', 'user', profile.id, 'allow', true, true, true, true, true, null
from public.profiles profile
where profile.active
  and btrim(replace(profile.full_name, E'‌', '')) = 'نازنین قائمی'
  and not exists (
    select 1
    from public.feature_access_grants grant_row
    where grant_row.feature_key = 'invoices'
      and grant_row.subject_kind = 'user'
      and grant_row.user_id = profile.id
      and grant_row.revoked_at is null
  );

commit;
