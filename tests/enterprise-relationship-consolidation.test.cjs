'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('navigation is governed by a feature catalog and one common access service',()=>{
  const catalog=read('assets/js/navigation-registry.js');
  const navigation=read('assets/js/core/application.js');
  assert.match(catalog,/featureKey/,'every navigable route must carry a feature key');
  assert.match(catalog,/featureForRoute/,'routes must resolve their canonical feature');
  assert.match(navigation,/BamcoAccess/,'direct navigation must consult the access service');
  assert.match(navigation,/\.can\([^)]*['"]view['"]/,'route guard must request view permission');
  assert.doesNotMatch(navigation,/\.manager-only/,'CSS classes are not an authorization check');
  assert.match(catalog,/if \('disabled' in node && !allowed\) node\.disabled = true/,'the shared access pass may disable a denied control but cannot re-enable a locally invalid one');
  assert.doesNotMatch(catalog,/node\.disabled = !allowed/,'local action prerequisites must survive a feature access refresh');
});

test('late feature controls use canonical grants instead of manager presentation checks',()=>{
  const targets=[
    ['assets/js/phase3-response-tracking.js','responseTracking'],
    ['assets/js/production-runtime.js','BamcoAccess'],
    ['assets/js/people-task-transfer.js',"'kanban','edit'"],
    ['assets/js/feature-structure.js','canDocuments']
  ];
  for(const [file,needle] of targets){
    const source=read(file);
    assert.match(source,new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    assert.doesNotMatch(source,/\bisManager\s*\(|\bisMgr\s*\(|\.manager-only/);
  }
  const prefetch=read('assets/js/feature-prefetch.js');
  assert.match(prefetch,/BamcoProfiles\?\.list\?\.\(\)/);
  assert.doesNotMatch(prefetch,/state\.profile\?\.role==='manager'/);
  const documents=read('assets/js/documents-sites.js');
  assert.match(documents,/canDocuments/);
  assert.match(documents,/canSites/);
  assert.doesNotMatch(documents,/\bisMgr\s*\(|\bmanagerProfiles\s*\(|profile\.role/);
  assert.match(documents,/isSystemManager\(\)/,'only the credential-wide export retains a protected system-manager guard');
  const responseReport=read('assets/js/runtime.js').slice(read('assets/js/runtime.js').indexOf('let responseRows'));
  assert.match(responseReport,/canResponseReport/);
  assert.doesNotMatch(responseReport,/\bisManager\s*\(/);
});

test('profiles have one client-side canonical registry and account concepts stay separate',()=>{
  const profiles=read('assets/js/profile-runtime.js');
  const shell=read('assets/js/shell.js');
  const edge=read('supabase/functions/admin-users/index.ts');
  assert.match(profiles,/BamcoProfiles/);
  assert.match(profiles,/\bupsert\b/);
  assert.match(profiles,/\blabel\b/);
  assert.match(profiles,/new Map\(/,'identity cache must be keyed by immutable user id');
  assert.doesNotMatch(shell,/<input id="profileEmail"[^>]*\breadonly\b/,'organizational email is a canonical profile field that the account page can edit');
  assert.match(edge,/const internalEmail=\(login:string\)=>`\$\{login\}@no-email\.invalid`/);
  assert.match(edge,/const authEmail=internalEmail\(login\)/);
  assert.doesNotMatch(edge,/const authEmail=publicEmail\|\|/,'corporate email must never become the Auth identifier');
});

test('people controls and directory use feature grants, with credentials kept system-manager-only',()=>{
  const shell=read('assets/js/shell.js');
  const edge=read('supabase/functions/admin-users/index.ts');
  assert.doesNotMatch(shell,/\b(?:isManager|manager-only)\b/,'people/templates/stickers/sent messages may not use legacy manager presentation gates');
  assert.match(shell,/data-feature-key="people"/);
  assert.match(shell,/window\.addEventListener\('bamco:feature-access-changed',syncFeatureControls\)/,'a changed grant must immediately update active people controls');
  assert.match(shell,/isSystemManager\(\)/,'credential and last-admin-sensitive controls retain only the protected system-manager gate');
  assert.match(shell,/const directory=await edge\(\{\},'GET'\)/,'people listing must come through the canonical scoped directory endpoint');
  assert.match(edge,/callerRpc\('can_access_feature',\{p_feature_key:'people',p_action:action\}\)/,'the edge handler must verify a caller-bound generic feature grant');
  assert.match(edge,/bamco_can_direct_manage_organization_user/,'safe edits must be constrained by the organization tree');
  assert.match(edge,/bamco_strict_descendant_user_ids/,'directory rows must be scoped by the server-side descendant relation');
  assert.match(edge,/const sensitive=\['role','system_access','active','login_name','temporary_password'/,'ordinary editors may not submit sensitive account fields');
  assert.match(edge,/const forbidden=systemOnly\(\);if\(forbidden\)return forbidden;/,'create, delete and credentials stay system-manager-only');
});

test('approval actions rely on the workflow assignee rather than manager CSS or polling patches',()=>{
  const app=read('assets/js/app.js');
  const requestSyncPath=path.join(root,'assets/js/request-sync.js');
  const requestSync=fs.existsSync(requestSyncPath)?fs.readFileSync(requestSyncPath,'utf8'):'';
  const build=read('scripts/build-static-bundles.mjs');
  assert.doesNotMatch(app,/isManager\(\)\s*&&\s*route\.actionable/,'an organizational approver must see their own action');
  assert.doesNotMatch(app,/hasSubordinates\s*=>\s*directAuthority/,'reporting scope is not an approval bypass');
  assert.doesNotMatch(requestSync,/setInterval\s*\(/,'request routing must not use a dedicated polling patch');
  assert.doesNotMatch(requestSync,/selectAll\(['"]change_requests['"]/,'the workbench must not bypass its server-scoped snapshot');
  assert.doesNotMatch(build,/['"]assets\/js\/request-sync\.js['"]/,'obsolete request-sync runtime is outside the source graph');
});

test('vehicle and petty-cash RLS separates read, create, edit and delete feature actions',()=>{
  const migration=read('supabase/migrations/20260922074613_enterprise_relationship_authorization_consolidation.sql');
  assert.match(migration,/Final vehicle and petty-cash boundary/);
  for(const [feature,policyPrefix] of [
    ['vehiclePermanent','vehicle_permanent'],
    ['vehicleTemporary','vehicle_temporary'],
    ['pettyCash','petty_cash_entries']
  ]){
    assert.match(migration,new RegExp(`create policy ${policyPrefix}_feature_read[\\s\\S]*?can_access_feature\\('${feature}','view'\\)`));
    assert.match(migration,new RegExp(`can_access_feature\\('${feature}','create'\\)`));
    assert.match(migration,new RegExp(`can_access_feature\\('${feature}','edit'\\)`));
    assert.match(migration,new RegExp(`can_access_feature\\('${feature}','delete'\\)`));
  }
  assert.match(migration,/bucket_id='vehicle-forms'[\s\S]*?can_access_feature\('vehiclePermanent','view'\)/);
  assert.match(migration,/bucket_id='petty-cash-private'[\s\S]*?can_access_feature\('pettyCash','view'\)/);
  assert.doesNotMatch(migration,/create policy vehicle_permanent_granted on public\.vehicle_permanent_records for all/);
  assert.doesNotMatch(migration,/create policy vehicle_temporary_granted on public\.vehicle_temporary_records for all/);
});

test('chat access derives its feature from system/task context and stays inside the generic policy engine',()=>{
  const migration=read('supabase/migrations/20260922074613_enterprise_relationship_authorization_consolidation.sql');
  const start=migration.indexOf('-- Canonical chat authorization');
  const end=migration.indexOf('-- An unassigned intake task is valid for a system manager.',start);
  assert.ok(start>=0&&end>start,'the canonical chat authorization tail must be present');
  const chat=migration.slice(start,end);
  assert.match(chat,/create or replace function private\.chat_feature_key_for_thread[\s\S]*?when p_system_recipient_id is not null then 'messages'[\s\S]*?when p_task_id is not null then 'taskChats'/,'system and task context must take precedence over legacy thread type');
  assert.doesNotMatch(chat,/private\.is_manager\s*\(/,'effective chat access must not use the legacy manager bypass');
  for(const policy of ['chat_threads_feature_read','chat_members_feature_read','chat_messages_feature_read']){
    assert.match(chat,new RegExp(`create policy ${policy}[\\s\\S]*?using\\(private\\.can_access_chat\\(`),'chat record reads must use the shared chat predicate');
  }
  assert.match(chat,/array\['chat_threads','chat_members','chat_messages'\]/,'all chat tables must be registered for RLS-filtered Realtime delivery');
  assert.match(chat,/alter publication supabase_realtime add table public\.%I/,'the registration must target the Supabase Realtime publication');
});

test('RLS uses auth-bound public contracts rather than revoked arbitrary-actor helpers',()=>{
  const policy=read('supabase/migrations/20260922102000_enterprise_relationship_authorization_policy_contract.sql');
  for(const helper of [
    'bamco_is_system_manager',
    'bamco_can_access_request',
    'bamco_can_direct_manage_organization_user',
    'bamco_strict_descendant_user_ids'
  ]) assert.match(policy,new RegExp(`create or replace function public\\.${helper}`));
  assert.match(policy,/private\.request_user_is_participant\(p_request_id,auth\.uid\(\)\)/);
  assert.match(policy,/private\.organization_actor_can_direct_manage_user\(auth\.uid\(\),p_target_user\)/);
  assert.match(policy,/public\.bamco_can_access_request\(id\)/,'approval request RLS must bind the requester/approver check to auth.uid');
  assert.match(policy,/public\.bamco_can_direct_manage_organization_user\(coalesce\(owner_id,created_by\)\)/,'supervisor task writes must bind the actor to auth.uid');
});

test('message center is a generic feature and resolves live recipients through canonical profiles',()=>{
  const messageCenter=read('assets/js/phase2-message-engine.js');
  const queue=read('supabase/functions/send-message-queue/index.ts');
  assert.match(messageCenter,/BamcoProfiles/);
  assert.match(messageCenter,/featureForRoute\?\.\('messageCenter'\)/);
  assert.match(messageCenter,/data-feature-action="create"/);
  assert.doesNotMatch(messageCenter,/\bisManager\s*\(/);
  assert.doesNotMatch(messageCenter,/manager-only/);
  assert.match(queue,/can_access_feature/);
  assert.doesNotMatch(queue,/profile\?\.role!==['"]manager['"]/);
});

test('message, profile and position follow-up uses current identities and scoped server actions',()=>{
  const migration=read('supabase/migrations/20260922113000_message_center_profile_scope_consolidation.sql');
  const variableContract=read('supabase/migrations/20260922115500_message_plpgsql_variable_contract.sql');
  const queueContract=read('supabase/migrations/20260922121000_message_queue_plpgsql_variable_contract.sql');
  const nonrecursivePolicies=read('supabase/migrations/20260922122000_message_read_policy_nonrecursive.sql');
  const queue=read('supabase/functions/send-message-queue/index.ts');
  const build=read('scripts/build-static-bundles.mjs');
  assert.match(migration,/create or replace view public\.message_recipient_live_state[\s\S]*?profile\.display_name[\s\S]*?profile\.avatar_path[\s\S]*?profile\.updated_at/);
  assert.match(migration,/create or replace view public\.message_response_tracking[\s\S]*?recipient_display_name[\s\S]*?recipient_avatar_path/);
  assert.match(migration,/create or replace function public\.prepare_workflow_messages[\s\S]*?can_access_feature\('messageCenter','create'\)[\s\S]*?organization_scope_user_ids/);
  assert.match(migration,/v_feature_key:=case when v_batch\.kind='reminder' then 'responseTracking' else 'messageCenter' end/);
  assert.match(migration,/message_deliveries_feature_read[\s\S]*?can_access_feature\('messages','view'\)[\s\S]*?bamco_can_read_message_batch\(batch_id\)/);
  assert.match(migration,/bamco_can_read_message_batch[\s\S]*?can_access_feature\('sentMessages','view'/);
  assert.match(migration,/profiles_update_self[\s\S]*?can_access_feature\('people','edit'\)[\s\S]*?bamco_strict_descendant_user_ids/);
  assert.match(migration,/emit_position_structure_relationship_change[\s\S]*?organization_position_changed/);
  assert.match(migration,/feature_can_access_for\(v_actor,v_feature\.feature_key,'manage_access'\)/);
  assert.match(migration,/feature_can_access_for\(v_actor,'sitesAccess','manage_access'\)/);
  assert.match(queue,/organization_scope_user_ids/);
  assert.match(queue,/batch\.kind==='reminder'\?'responseTracking':'messageCenter'/);
  assert.doesNotMatch(queue,/profile\?\.role!==['"]manager['"]/);
  assert.match(variableContract,/v_template_key/,'PL\/pgSQL state must not collide with template columns');
  assert.match(variableContract,/source\.batch_id=v_batch_id/,'reminder batches must use isolated local state');
  assert.match(queueContract,/v_delivery public\.message_deliveries%rowtype/,'queue records must not shadow SQL aliases');
  assert.match(nonrecursivePolicies,/create or replace function public\.bamco_can_read_message_batch/);
  assert.match(nonrecursivePolicies,/message_batches_feature_read[\s\S]*?bamco_can_read_message_batch\(id\)/);
  assert.doesNotMatch(nonrecursivePolicies,/message_batches_feature_read[\s\S]*?exists\([\s\S]*?message_deliveries/,'batch policy must not recurse through delivery RLS');
  assert.match(queue,/import '\.\/message-renderer\.js'/,'the deployable Edge source must use its verified local renderer dependency');
  assert.match(build,/supabase\/functions\/send-message-queue\/message-renderer\.js/,'the local Edge renderer copy must be generated from the canonical browser source');
});
