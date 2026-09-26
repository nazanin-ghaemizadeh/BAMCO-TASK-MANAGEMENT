-- Personal workspace routes use the same canonical feature catalog and grant
-- matrix as every other application tab. No new public table or RLS surface is
-- introduced by this migration.
insert into public.app_features(feature_key,route_key,title,category,sort_order,active)
values
  ('notes','notes','یادداشت‌ها','personal',390,true),
  ('voiceAssistant','voiceAssistant','دستیار صوتی هوشمند','personal',400,true)
on conflict(feature_key) do update
set route_key=excluded.route_key,
    title=excluded.title,
    category=excluded.category,
    sort_order=excluded.sort_order,
    active=true,
    updated_at=now();

-- Preserve the already released behaviour for active users, but materialize it
-- as explicit grants so the system administrator can now manage it in the
-- access matrix and immediately revoke it when needed.
insert into public.feature_access_grants(
  feature_key,subject_kind,user_id,effect,
  can_view,can_create,can_edit,can_delete,can_export,can_manage_access,can_bypass_approval,
  metadata
)
select feature.feature_key,'user',profile.id,'allow',
  true,true,true,true,true,false,false,
  jsonb_build_object('seed','personal_workspace_access_matrix')
from public.profiles profile
cross join (values ('notes'),('voiceAssistant')) as feature(feature_key)
where profile.active is distinct from false
  and not exists (
    select 1
    from public.feature_access_grants grant_row
    where grant_row.feature_key=feature.feature_key
      and grant_row.subject_kind='user'
      and grant_row.user_id=profile.id
      and grant_row.revoked_at is null
  );
