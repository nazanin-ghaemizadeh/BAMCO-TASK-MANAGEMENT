begin;

update public.feature_access_grants
set effect = 'allow',
    can_view = true,
    can_create = true,
    can_edit = true,
    can_delete = true,
    can_export = true,
    revoked_at = null
where feature_key = 'invoices'
  and subject_kind = 'user'
  and user_id in (
    '2f4f8533-9775-4018-b0b3-647bb1b3a8a8'::uuid,
    'faad7679-9cca-4620-820d-35382d08c00a'::uuid
  );

commit;
