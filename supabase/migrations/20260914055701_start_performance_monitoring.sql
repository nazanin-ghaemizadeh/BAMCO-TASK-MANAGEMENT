insert into public.app_settings (key, value, updated_by, updated_at, is_sensitive)
values (
  'performance_monitoring_started_at',
  jsonb_build_object('value', '2026-09-14T05:57:01.467017Z'),
  null,
  '2026-09-14T05:57:01.467017Z'::timestamptz,
  false
)
on conflict (key) do update
set value = excluded.value,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at,
    is_sensitive = excluded.is_sensitive;
