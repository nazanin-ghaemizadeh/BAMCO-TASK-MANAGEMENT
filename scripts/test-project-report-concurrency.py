#!/usr/bin/env python3
"""Project/report independent-session acceptance on the existing disposable PostgreSQL 17 CI service.

Synthetic source-derived fixture only. Reuses the invoice harness' loopback-only
URL validation, exact PostgreSQL/driver pin, fresh-cluster role ownership,
observed pg_blocking_pids barriers, bounded waits, and exact owned-resource cleanup.
No Supabase/API/Storage calls, no production credentials, and no user records.
Run after invoice concurrency cleans up its database/roles. This is not PGlite.
"""
from pathlib import Path
import importlib.util
import json
import signal
import time
import sys
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('invoice_concurrency_support', ROOT / 'scripts/test-invoice-attachments-concurrency.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
require = base.require
ACTOR, OUTSIDER = base.ACTOR, base.OUTSIDER

class Harness(base.Harness):
    def __init__(self, *args):
        super().__init__(*args)
        self.database = 'bamco_project_concurrency_' + uuid4().hex

    def setup(self):
        self.admin = self.psycopg.connect(**self.settings, autocommit=True)
        version, superuser = self.admin.execute("select current_setting('server_version_num')::integer,rolsuper from pg_roles where rolname=current_user").fetchone()
        require(version // 10000 == 17 and superuser, 'Fresh disposable PostgreSQL 17 superuser required')
        self.cluster_lock = self.admin.execute('select pg_try_advisory_lock(17298341,20261003)').fetchone()[0]
        require(self.cluster_lock, 'Another fixture owns this disposable cluster')
        require(not self.admin.execute('select rolname from pg_roles where rolname=any(%s)', (list(base.FIXTURE_ROLES),)).fetchall(), 'Fixture roles already exist; refusing non-fresh cluster')
        self.admin.execute(self.sql.SQL('create database {} template template0').format(self.sql.Identifier(self.database)))
        self.created_database = True
        self.observer = self.connect(actor=False)
        with self.observer.transaction():
            self.observer.execute((ROOT / 'tests/sql/fixtures/project-live-trigger-contract.sql').read_text(), prepare=False)
        self.roles_owned = True
        self.observer.execute((ROOT / 'tests/sql/fixtures/business-section-stage1-baseline.sql').read_text(), prepare=False)
        project = (ROOT / 'supabase/schema-proposals/project-ordinary-metadata-scope.sql').read_text()
        self.observer.execute(project, prepare=False)
        self.observer.execute(project, prepare=False)
        self.observer.execute('create trigger project_dependency_cycle_guard before insert or update on public.project_dependencies for each row execute function private.prevent_project_dependency_cycle()')
        self.observer.execute((ROOT / 'supabase/schema-proposals/isolated-section-report-feeds.sql').read_text(), prepare=False)
        self.actor = self.connect()
        print(f'SETUP PostgreSQL {version}: independent backends, synthetic source-derived project fixture, migration reapplied', flush=True)

    def node(self, c, title, parent=None):
        return self.rpc(c, 'mutate_project_node', 10, None, 'create', {'item_type':'phase','title':title,'parent_item_id':parent})['id']

    def edge(self, c, a, b):
        return self.rpc(c, 'mutate_project_dependency', 10, None, 'create', {'predecessor_item_id':a,'successor_item_id':b})['id']

    def graph_races(self):
        for first_uid, second_uid in [(ACTOR,OUTSIDER),(OUTSIDER,ACTOR)]:
            a,b=self.node(self.actor,'Edge A'),self.node(self.actor,'Edge B')
            self.race('reciprocal dependency',lambda c:self.edge(c,a,b),lambda c:self.edge(c,b,a),first_uid=first_uid,second_uid=second_uid,rejection=(('23514',),'Circular'))
            require(self.observer.execute('select count(*) from project_dependencies where predecessor_item_id=any(%s)',([a,b],)).fetchone()[0]==1,'Reciprocal graph committed a cycle')
            self.pass_test('reciprocal dependencies serialize across two ordinary actors')
        a,b=self.node(self.actor,'Parent A'),self.node(self.actor,'Parent B')
        self.race('reciprocal reparent',lambda c:self.rpc(c,'mutate_project_node',10,a,'edit',{'parent_item_id':b}),lambda c:self.rpc(c,'mutate_project_node',10,b,'edit',{'parent_item_id':a}),rejection=(('23514',),'حلقوی'))
        self.pass_test('reciprocal WBS parents serialize without cycle')
        a,b,c=self.node(self.actor,'Update edge A'),self.node(self.actor,'Update edge B'),self.node(self.actor,'Update edge C')
        edge=self.edge(self.actor,a,b)
        self.race('updated edge versus reciprocal insert',lambda conn:self.rpc(conn,'mutate_project_dependency',10,edge,'edit',{'predecessor_item_id':c}),lambda conn:self.edge(conn,b,c),rejection=(('23514',),'Circular'))
        self.pass_test('dependency replacement excludes old edge while guarding concurrent reciprocal edge')
        parent=self.node(self.actor,'Delete wins')
        self.race('delete parent versus create child',lambda conn:self.rpc(conn,'mutate_project_node',10,parent,'delete',{}),lambda conn:self.node(conn,'Rejected child',parent),rejection=(('23514',),'بالادست'))
        require(self.observer.execute('select count(*) from project_items where parent_item_id=%s',(parent,)).fetchone()[0]==0,'Deleted parent has orphaned child')
        self.pass_test('parent deletion serializes before concurrent node creation')

    def protected_race(self, kind):
        parent=self.node(self.actor,'Protected '+kind)
        writer=self.connect(actor=False)
        caller=self.connect()
        call=base.ConcurrentCall(caller,lambda c:self.rpc(c,'mutate_project_node',10,parent,'delete',{}))
        try:
            with writer.transaction():
                writer.execute('select id from projects where id=10 for update')
                if kind=='activity':
                    writer.execute("insert into project_items(project_id,parent_item_id,item_type,title,owner_id,created_by,approval_state) values(10,%s,'activity','Synthetic pending activity',%s,%s,'pending')",(parent,OUTSIDER,OUTSIDER))
                else:
                    writer.execute("insert into change_requests(id,proposed_data,request_status) values(%s,%s,'pending')",(parent+10000,self.jsonb({'request_context':'project_activity','project_id':10,'parent_item_id':parent})))
                call.start();self.wait_blocked(call,writer.info.backend_pid,'protected '+kind)
            call.finish();self.check_error(call.error,('42501','55000'),None)
            require(self.observer.execute('select count(*) from project_items where id=%s',(parent,)).fetchone()[0]==1,'Protected parent was removed')
            self.races+=1;self.pass_test('concurrent '+kind+' commit prevents queued ordinary subtree deletion')
        finally:
            if call.thread.ident is not None and not call.done.is_set():caller.cancel();require(call.done.wait(base.THREAD_SECONDS),'cancelled worker failed to exit')
            writer.close();caller.close()

    def revocation_races(self):
        a,b=self.node(self.actor,'Revoke A'),self.node(self.actor,'Revoke B')
        actions=[
            ('project metadata',lambda c:self.rpc(c,'save_project_metadata',10,{'title':'MUST NOT COMMIT AFTER REVOKE'})),
            ('node metadata',lambda c:self.rpc(c,'mutate_project_node',10,a,'edit',{'title':'MUST NOT COMMIT AFTER REVOKE'})),
            ('dependency create',lambda c:self.edge(c,a,b))]
        for inactive in (False,True):
            for kind,action in actions:
                writer=self.connect(actor=False);caller=self.connect();call=base.ConcurrentCall(caller,action)
                try:
                    with writer.transaction():
                        writer.execute('select id from projects where id=10 for update')
                        call.start();self.wait_blocked(call,writer.info.backend_pid,'access changed while '+kind+' waits')
                        if inactive:
                            self.observer.execute('update profiles set active=false where id=%s',(ACTOR,))
                        else:
                            self.observer.execute("update feature_access_grants set revoked_at=clock_timestamp() where feature_key='projects' and user_id=%s",(ACTOR,))
                    call.finish();self.check_error(call.error,('42501',),None)
                    self.races+=1;self.pass_test(kind+' rechecks '+('inactive profile' if inactive else 'revoked grant')+' after observed project-lock wait')
                finally:
                    if call.thread.ident is not None and not call.done.is_set():
                        caller.cancel();require(call.done.wait(base.THREAD_SECONDS),'cancelled worker failed to exit')
                    self.observer.execute('update profiles set active=true where id=%s',(ACTOR,))
                    self.observer.execute("update feature_access_grants set revoked_at=null where feature_key='projects' and user_id=%s",(ACTOR,))
                    writer.close();caller.close()

    def reports(self):
        self.observer.execute("delete from feature_access_grants where feature_key in ('kanban','archive','approvals') and user_id=%s",(ACTOR,))
        self.observer.execute("insert into feature_access_grants(feature_key,subject_kind,user_id,can_view) values('taskTimeline','user',%s,true)",(ACTOR,))
        feed=self.rpc(self.actor,'task_timeline_report_feed');require(len(feed['tasks'])==2,'Timeline must include foreign task')
        require(self.actor.execute('select count(*) from tasks').fetchone()[0]==1,'Timeline broadened personal SELECT')
        self.reject(lambda c:self.rpc(c,'performance_report_feed'),states=('42501',))
        self.observer.execute("update feature_access_grants set revoked_at=clock_timestamp() where feature_key='taskTimeline' and user_id=%s",(ACTOR,))
        self.reject(lambda c:self.rpc(c,'task_timeline_report_feed'),states=('42501',))
        self.pass_test('independent report gate, personal SELECT preservation, committed grant revocation')

    def run(self):
        self.setup();self.graph_races();self.protected_race('activity');self.protected_race('open workflow');self.reports();self.revocation_races()

def main():
    import argparse
    argparse.ArgumentParser(description=__doc__).parse_args()
    settings=base.connection_settings()
    import psycopg
    from psycopg import sql
    from psycopg.types.json import Jsonb
    require(psycopg.__version__==base.PINNED_DRIVER,'Install documented pinned psycopg driver')
    harness=Harness(settings,psycopg,sql,Jsonb);started=time.monotonic()
    if hasattr(signal,'SIGALRM'):
        def timeout(_s,_f):raise TimeoutError('Project concurrency exceeded 240 seconds')
        signal.signal(signal.SIGALRM,timeout);signal.alarm(240)
    try:harness.run()
    finally:
        if hasattr(signal,'SIGALRM'):signal.alarm(0)
        harness.cleanup()
    print(f'Project/report multi-session PostgreSQL: PASS ({harness.passed} cases, {harness.races} observed lock barriers, {time.monotonic()-started:.1f}s)',flush=True)

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(f'FAIL {type(error).__name__}: {error}',file=sys.stderr,flush=True)
        raise SystemExit(1)
