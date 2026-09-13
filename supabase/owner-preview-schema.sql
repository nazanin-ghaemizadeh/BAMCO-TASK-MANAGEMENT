create function public.owner_workspace_preview(p_user_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare person jsonb; work jsonb; letters_allowed boolean; scopes jsonb;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and active and role='manager') then raise exception 'فقط مدیر مجاز به پیش‌نمایش است.' using errcode='42501'; end if;
 select jsonb_build_object('id',id,'name',coalesce(nullif(display_name,''),full_name)) into person from public.profiles where id=p_user_id and active and role='owner';
 if person is null then raise exception 'متولی فعال پیدا نشد.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'number',legacy_id,'title',title,'status',status,'start_date',start_date,'due_date',due_date,'archived',archived) order by id),'[]'::jsonb) into work from public.task_status_view where owner_id=p_user_id;
 select exists(select 1 from public.letter_access where user_id=p_user_id) into letters_allowed;
 select coalesce(jsonb_agg(scope),'[]'::jsonb) into scopes from public.vehicle_access where user_id=p_user_id;
 return jsonb_build_object('person',person,'tasks',work,'letters',letters_allowed,'vehicles',scopes);
end $$;
revoke all on function public.owner_workspace_preview(uuid) from public,anon;
grant execute on function public.owner_workspace_preview(uuid) to authenticated;
