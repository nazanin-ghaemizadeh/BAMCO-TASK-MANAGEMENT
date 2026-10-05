// Isolated synthetic PostgreSQL fixture. Authorization functions are extracted
// from their canonical repository migrations, never replaced by permissive mocks.
// Only auth.uid() and minimal surrounding tables are supplied by this fixture.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
export const source = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const enterprise = source('supabase/migrations/20260922074613_enterprise_relationship_authorization_consolidation.sql');
export function canonicalFunction(sql, name) {
  const start = sql.toLowerCase().lastIndexOf(`create or replace function ${name.toLowerCase()}(`);
  assert(start >= 0, `canonical function ${name} exists`);
  const end = sql.indexOf('\n$$;', start);
  assert(end > start, `canonical function ${name} is complete`);
  return sql.slice(start, end + 4);
}
export const ids = Object.fromEntries(['direct','peer','role','none','denied','inactive','manager','delegated','resource'].map((key,i) => [key, `00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`]));
export const ordinary = ['view','create','edit','delete','export'];
export const protectedActions = ['manage','manage_access','bypass_approval'];
export async function featureDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.uid',true),'')::uuid
    $$;
    grant usage on schema auth to authenticated,anon,service_role;
    create table public.profiles(id uuid primary key,role text not null default 'owner',active boolean not null default true,
      display_name text,full_name text,email text,avatar_path text,updated_at timestamptz default now());
    create table public.organization_roles(id bigint primary key);
    create table public.organization_positions(id bigint primary key,role_id bigint references public.organization_roles(id),active boolean default true);
    create table public.organization_position_assignments(user_id uuid references public.profiles(id),position_id bigint references public.organization_positions(id),
      is_primary boolean default true,valid_from date default current_date,valid_to date);
    create table public.audit_trail(id bigint generated always as identity,actor_id uuid,action text,target_type text,target_id text,new_data jsonb,metadata jsonb);
  `);
  // Use the real registry/grant tables, constraints and indexes.
  await db.exec(enterprise.slice(enterprise.indexOf('create table if not exists public.app_features('), enterprise.indexOf('insert into public.app_features(')));
  for (const name of ['private.is_system_manager','private.feature_grant_allows','private.feature_can_access_for','private.feature_can_access_resource_for','public.can_access_feature','public.effective_feature_access','public.feature_access_manage_snapshot'])
    await db.exec(canonicalFunction(enterprise,name));
  await db.exec(canonicalFunction(source('supabase/migrations/20260923100000_feature_access_realtime_and_explicit_deny.sql'),'private.feature_can_access_for'));
  await db.exec(canonicalFunction(source('supabase/migrations/20260922113000_message_center_profile_scope_consolidation.sql'),'public.feature_access_manage_snapshot'));
  await db.exec(canonicalFunction(source('supabase/migrations/20260923093000_access_propagation_and_timeline_scope.sql'),'public.set_feature_access'));
  const internals = ['private.is_system_manager(uuid)','private.feature_grant_allows(public.feature_access_grants,text)',
    'private.feature_can_access_for(uuid,text,text,text,text)','private.feature_can_access_resource_for(uuid,text,text,text,text)'];
  for (const signature of internals) await db.exec(`revoke all on function ${signature} from public,anon,authenticated,service_role`);
  for (const signature of ['public.can_access_feature(text,text)','public.effective_feature_access()','public.feature_access_manage_snapshot(text)','public.set_feature_access(text,jsonb)']) {
    await db.exec(`revoke all on function ${signature} from public,anon; grant execute on function ${signature} to authenticated,service_role`);
  }
  for (const [name,id] of Object.entries(ids)) await db.query('insert into public.profiles(id,role,active,display_name) values($1,$2,$3,$4)',[id,name==='manager'?'manager':'owner',name!=='inactive',`Synthetic ${name}`]);
  await db.exec('insert into public.organization_roles values(1),(2); insert into public.organization_positions values(1,1,true),(2,2,true)');
  await db.query('insert into public.organization_position_assignments(user_id,position_id) values($1,1),($2,1)',[ids.role,ids.denied]);
  const as = async (name, role='authenticated') => {
    await db.exec('reset role'); await db.query("select set_config('test.uid',$1,false)",[ids[name] || '']); await db.exec(`set role ${role}`);
  };
  const root = async () => db.exec('reset role');
  const one = async (sql,args=[]) => (await db.query(sql,args)).rows[0];
  const can = async (feature,action='view') => (await one('select public.can_access_feature($1,$2) allowed',[feature,action])).allowed;
  const snapshot = async () => (await one('select public.effective_feature_access() result')).result;
  const grant = async (feature,name='direct',bits={},extra={}) => {
    await root();
    const row = {feature_key:feature,subject_kind:'user',user_id:ids[name],effect:'allow',can_view:true,...bits,...extra};
    const keys=Object.keys(row);
    return (await one(`insert into public.feature_access_grants(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,Object.values(row)));
  };
  const features = async keys => { await root(); for(const key of keys) await db.query('insert into public.app_features(feature_key,route_key,title) values($1,$1,$1) on conflict do nothing',[key]); };
  return {db,as,root,one,can,snapshot,grant,features};
}
