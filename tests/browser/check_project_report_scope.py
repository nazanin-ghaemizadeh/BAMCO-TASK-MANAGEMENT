"""Real Chromium, production assets/CSP, synthetic in-memory API only.

UI controls are exercised with Playwright clicks/typing. Test hooks only seed data,
observe caches, hold response timing, and inject auth/grant lifecycle boundaries.
These are UI acceptance tests; PostgreSQL tests separately establish RLS authority.
"""
import asyncio
import functools
import http.server
import json
import os
import shutil
import threading
import traceback
from pathlib import Path
from urllib.parse import urlsplit

from playwright.async_api import async_playwright, expect
from run_smoke import MOCK, MSG_MOCK, login, click_route, settled, home

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'test-results' / 'project-report-scope'
FIXTURE = MOCK + '\n' + MSG_MOCK + '\n' + (Path(__file__).parent / 'mock-project-report-api.js').read_text()
FEATURES = {'timeline-only': 'taskTimeline', 'performance-only': 'performanceReport'}
ENDPOINTS = {'taskTimeline': 'task_timeline_report_feed', 'performanceReport': 'performance_report_feed'}


async def capture(page, name):
    await page.screenshot(path=str(OUT / (name + '.png')), full_page=True)


async def flush(page):
    await page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')


async def gate(page, endpoint, label):
    await page.evaluate('([endpoint,label]) => __projectReportFixture.holdNext(endpoint,label)', [endpoint, label])


async def entered(page, label):
    await page.wait_for_function('label => __projectReportFixture.gates[label]?.entered', arg=label)


async def release(page, label):
    await page.evaluate('label => __projectReportFixture.release(label)', label)
    await page.wait_for_function('label => __projectReportFixture.gates[label]?.finished', arg=label)
    await flush(page)


async def close_project_dialog(page, selector):
    await page.locator(selector + ' [data-project-close]').last.click()
    await expect(page.locator(selector)).not_to_be_visible()


async def private_snapshot(page):
    return await page.evaluate("""() => {
      const s = Bamco.state;
      return JSON.stringify({ tasks:s.tasks, requests:s.requests, requestHistory:s.requestHistory,
        definitionRequests:s.definitionRequests, profiles:s.profiles });
    }""")


async def check_routes(page, feature, companion=None):
    for denied in ['kanban', 'approvals', 'archive', 'dashboard', 'accessMatrix', companion]:
        if denied:
            assert not await page.evaluate('key => BamcoAccess.can(key,"view")', denied), denied
            await expect(page.locator(f'#nav [data-view="{denied}"]')).not_to_be_visible()
    assert await page.evaluate('key => BamcoAccess.can(key,"view")', feature)


async def open_project(page, project_id=7101):
    await click_route(page, 'projects')
    await settled(page, 'projects')
    await page.locator(f'[data-project-select="{project_id}"]').click()
    await expect(page.locator('[data-project-action="edit"]')).to_be_visible()


async def open_item(page, item_id):
    await page.locator('[data-project-view="wbs"]').click()
    await page.locator(f'[data-project-item-open="{item_id}"]').dblclick()
    await expect(page.locator('#projectItemDialog')).to_be_visible()


async def choose_today(page, name):
    await page.locator(f'#projectItemForm [data-project-date="{name}"]').click()
    await expect(page.locator('#calendarDialog')).to_be_visible()
    # The production day grid hides the legacy submit button and commits on
    # a visible day click. Use the selected day (today for an empty field).
    await page.locator('#calendarDialog .day-picker-grid [data-day].selected').click()
    await expect(page.locator('#calendarDialog')).not_to_be_visible()
    assert await page.locator(f'#projectItemForm [name="{name}"]').input_value()


async def project_ordinary(page, width, checks):
    await check_routes(page, 'projects')
    assert not await page.evaluate("BamcoAccess.can('projects','edit') || BamcoAccess.can('projects','delete')")
    await open_project(page)
    await expect(page.locator('[data-project-action="delete"]')).to_be_disabled()
    original = await page.evaluate('__projectReportFixture.projects[0].owner_id')
    history_before = await page.evaluate('({url:location.href,length:history.length})')
    await page.locator('[data-project-action="edit"]').click()
    form = page.locator('#projectForm')
    await expect(form.locator('[name="project_owner_id"]')).to_be_disabled()
    await expect(form).to_contain_text('اختیار تغییر متولی')
    await form.locator('[name="title"]').fill('Cancelled foreign edit')
    await close_project_dialog(page, '#projectDialog')
    assert await page.evaluate('__projectReportFixture.projects[0].title') == 'Foreign project fixture'
    assert await page.evaluate('({url:location.href,length:history.length})') == history_before
    await page.locator('[data-project-action="edit"]').click()
    await form.locator('[name="title"]').fill('Edited foreign metadata')
    await form.locator('[name="description"]').fill('Ordinary editor retains original ownership')
    await form.locator('[name="priority"]').select_option('urgent')
    await gate(page, 'save_project_metadata', 'ordinary-save')
    await form.locator('[type="submit"]').click()
    await entered(page, 'ordinary-save')
    await expect(form.locator('[type="submit"]')).to_be_disabled()
    # A second user click cannot submit while this button is disabled.
    assert await page.evaluate('__projectReportFixture.calls.filter(x=>x.endpoint==="save_project_metadata").length') == 1
    await release(page, 'ordinary-save')
    await expect(page.locator('#projectDialog')).not_to_be_visible()
    await expect(page.locator('.project-detail')).to_contain_text('Edited foreign metadata')
    assert await page.evaluate('__projectReportFixture.projects[0].owner_id') == original
    metadata = await page.evaluate('__projectReportFixture.calls.find(x=>x.endpoint==="save_project_metadata").body.p_payload')
    assert sorted(metadata) == ['description', 'planned_end', 'planned_start', 'priority', 'status', 'title']
    checks.append('foreign ordinary metadata save, owner lock, cancellation and in-flight duplicate prevention')

    await page.locator('[data-project-action="item"]').click()
    item = page.locator('#projectItemForm')
    # Inspect the option itself: the enabled-control matcher can retarget its
    # parent select, which remains enabled for the ordinary phase/milestone choices.
    await expect(item.locator('option[value="activity"]')).to_have_js_property('disabled', True)
    for kind in ['phase', 'milestone']:
        await expect(item.locator(f'option[value="{kind}"]')).to_have_js_property('disabled', False)
    await item.locator('[name="item_type"]').select_option('phase')
    await item.locator('[name="title"]').fill('Browser-created phase')
    await item.locator('[type="submit"]').click()
    await expect(page.locator('#projectItemDialog')).not_to_be_visible()
    phase_id = await page.evaluate('__projectReportFixture.items.find(x=>x.title==="Browser-created phase").id')
    await open_item(page, phase_id)
    await item.locator('[name="title"]').fill('Browser-edited phase')
    await item.locator('[type="submit"]').click()
    await expect(page.locator('#projectItemDialog')).not_to_be_visible()
    await page.locator('[data-project-action="item"]').click()
    await item.locator('[name="item_type"]').select_option('milestone')
    await item.locator('[name="title"]').fill('Browser-created milestone')
    await choose_today(page, 'milestone_date')
    await item.locator('[type="submit"]').click()
    await expect(page.locator('#projectItemDialog')).not_to_be_visible()
    milestone = await page.evaluate('__projectReportFixture.items.find(x=>x.title==="Browser-created milestone")')
    assert milestone['planned_start'] == milestone['planned_end'] and milestone['planned_start']
    await page.locator('[data-project-action="dependency"]').click()
    dep = page.locator('#projectDependencyForm')
    await dep.locator('[name="predecessor_item_id"]').select_option(str(phase_id))
    await dep.locator('[name="successor_item_id"]').select_option(str(milestone['id']))
    await dep.locator('[type="submit"]').click()
    await expect(page.locator('#projectDependencyDialog')).not_to_be_visible()
    assert await page.evaluate('__projectReportFixture.dependencies.length') == 1
    await page.locator('[data-project-view="gantt"]').click()
    await expect(page.locator('.gantt-pro-scroll')).to_be_visible()
    await capture(page, f'{width}-ordinary-gantt')
    await open_item(page, 7202)
    await expect(item.locator('fieldset')).to_have_js_property('disabled', True)
    await expect(item.locator('[name="title"]')).to_be_disabled()
    await expect(item.locator('[type="submit"]')).to_be_disabled()
    await expect(item.locator('[data-project-item-delete]')).to_be_disabled()
    await expect(item).to_contain_text('فقط قابل مشاهده')
    await capture(page, f'{width}-protected-activity-readonly')
    await close_project_dialog(page, '#projectItemDialog')
    await open_item(page, phase_id)
    await item.locator('[data-project-item-delete]').click()
    await expect(page.locator('#bamcoNoticeDialog')).to_be_visible()
    await page.locator('[data-notice-cancel]').click()
    assert await page.evaluate('id=>__projectReportFixture.items.some(x=>x.id===id)', phase_id)
    await item.locator('[data-project-item-delete]').click()
    await page.locator('[data-notice-ok]').click()
    await expect(page.locator('#projectItemDialog')).not_to_be_visible()
    assert not await page.evaluate('id=>__projectReportFixture.items.some(x=>x.id===id)', phase_id)
    assert not await page.evaluate("__projectReportFixture.calls.some(x=>['save_project_activity','delete_project_activity','request_project_deletion'].includes(x.endpoint))")
    checks.append('phase create/edit/delete, milestone calendar, dependency, protected activity/create/delete denied')

    await page.locator('[data-project-action="back"]').click()
    await page.locator('[data-project-action="new"]').click()
    await page.locator('#projectForm [name="title"]').fill('Self-owned ordinary project')
    await page.locator('#projectForm [type="submit"]').click()
    await expect(page.locator('#projectDialog')).not_to_be_visible()
    await expect(page.locator('.project-detail')).to_contain_text('Self-owned ordinary project')
    assert await page.evaluate('__projectReportFixture.projects.at(-1).owner_id===__testApi.actor.id')
    await page.locator('[data-project-action="back"]').click()
    await page.locator('[data-project-select="7101"]').click()
    checks.append('ordinary create remains self-owned')

    # Lifecycle injection is a simulated server revocation, through the real access resolver.
    await page.locator('[data-project-action="edit"]').click()
    await form.locator('[name="title"]').fill('Late revoked mutation')
    await gate(page, 'save_project_metadata', 'revoked-save')
    await form.locator('[type="submit"]').click()
    await entered(page, 'revoked-save')
    await page.evaluate("async()=>{__testApi.featureAccess=[];await BamcoAccess.refresh({force:true})}")
    await release(page, 'revoked-save')
    await expect(page.locator('#projectDialog')).not_to_be_visible()
    assert await page.evaluate('bamcoProjects.model.projects.length') == 0
    assert await page.evaluate('bamcoProjects.model.selected') is None
    await expect(page.locator('#projectFeatureRoot')).not_to_contain_text('Late revoked mutation')
    checks.append('revoked grant closes form and discards late mutation response')
    await page.evaluate('async()=>{__testApi.featureAccess.push({feature_key:"projects",can_view:true});await BamcoAccess.refresh({force:true})}')
    await open_project(page)
    await expect(page.locator('[data-project-action="delete"]')).to_be_disabled()
    await page.locator('[data-project-action="back"]').click()
    await gate(page, 'list_project_workspace', 'old-project-account')
    await page.locator('[data-project-action="refresh"]').click()
    await entered(page, 'old-project-account')
    await home(page)
    await page.evaluate('async()=>{Bamco.state.user={id:"new-project-account"};Bamco.state.token="new-project-token";__testApi.featureAccess=[];await BamcoAccess.refresh({force:true})}')
    await release(page, 'old-project-account')
    assert await page.evaluate('bamcoProjects.model.projects.length') == 0
    assert await page.evaluate('bamcoProjects.model.selected') is None
    checks.append('regrant preserves protected denial; old-account project read response is rejected')


async def project_legacy(page, width, checks):
    await open_project(page)
    await expect(page.locator('[data-project-action="delete"]')).to_be_enabled()
    await page.locator('[data-project-action="item"]').click()
    form = page.locator('#projectItemForm')
    await expect(form.locator('option[value="activity"]')).to_have_js_property('disabled', False)
    await form.locator('[name="item_type"]').select_option('activity')
    await form.locator('[name="title"]').fill('Legacy activity approval request')
    await form.locator('[type="submit"]').click()
    await expect(page.locator('#projectItemDialog')).not_to_be_visible()
    assert await page.evaluate('__projectReportFixture.requests.at(-1).endpoint') == 'save_project_activity'
    assert await page.evaluate('__projectReportFixture.items.length') == 2
    await open_item(page, 7202)
    await expect(form.locator('[name="title"]')).to_be_enabled()
    await expect(form.locator('[data-project-item-delete]')).to_be_enabled()
    await form.locator('[name="title"]').fill('Legacy task-linked edit request')
    await form.locator('[type="submit"]').click()
    await expect(page.locator('#projectItemDialog')).not_to_be_visible()
    await open_item(page, 7202)
    await form.locator('[data-project-item-delete]').click()
    await page.locator('[data-notice-ok]').click()
    await expect(page.locator('#projectItemDialog')).not_to_be_visible()
    assert await page.evaluate('__projectReportFixture.requests.at(-1).endpoint') == 'delete_project_activity'
    await page.locator('[data-project-action="delete"]').click()
    await page.locator('[data-notice-cancel]').click()
    before = await page.evaluate('__projectReportFixture.requests.length')
    await page.locator('[data-project-action="delete"]').click()
    await page.locator('[data-notice-ok]').click()
    await page.wait_for_function('n=>__projectReportFixture.requests.length===n+1', arg=before)
    assert await page.evaluate('__projectReportFixture.projects.length') == 2
    await expect(page.locator('#projectFeatureRoot')).to_contain_text('Foreign project fixture')
    await page.locator('[data-project-action="back"]').click()
    await page.locator('[data-project-select="7102"]').click()
    await page.locator('[data-project-action="edit"]').click()
    owner = page.locator('#projectForm [name="project_owner_id"]')
    await expect(owner).to_be_enabled()
    foreign = await page.evaluate('__testApi.profiles[0].id')
    await owner.select_option(foreign)
    await page.locator('#projectForm [type="submit"]').click()
    await expect(page.locator('#projectDialog')).not_to_be_visible()
    assert await page.evaluate('__projectReportFixture.projects[1].owner_id') == foreign
    await capture(page, f'{width}-legacy-protected-controls')
    checks.append('positive legacy capability hints: activity create/edit/delete and project deletion stay on approval RPCs; authorized owner transfer uses existing raw path')


async def report_refresh(page, feature, retry=False):
    if feature == 'taskTimeline':
        # Timeline has no visible refresh control; invoke its real lifecycle callback.
        await page.evaluate('bamcoTimelineRefresh()')
    else:
        # A failure retains the toolbar and adds a separate inline retry button.
        # Exercise the actual retry control without an ambiguous global locator.
        scope = '.workspace-error' if retry else '.performance-command-row'
        await page.locator('#performanceReportView ' + scope + ' [data-canonical-refresh="performanceReport"]').click()


async def report_marker(page, feature, marker):
    target = '#ttUnscheduledList' if feature == 'taskTimeline' else '#performanceReportView tbody'
    await expect(page.locator(target)).to_contain_text(marker)


async def report_case(page, width, scenario, checks):
    feature = FEATURES[scenario]
    other = 'performanceReport' if feature == 'taskTimeline' else 'taskTimeline'
    endpoint = ENDPOINTS[feature]
    await check_routes(page, feature, other)
    before = await private_snapshot(page)
    offset = await page.evaluate('__projectReportFixture.calls.length')
    await click_route(page, feature)
    await settled(page, feature)
    await report_marker(page, feature, 'Initial')
    assert await private_snapshot(page) == before
    assert not await page.evaluate('offset=>__projectReportFixture.calls.slice(offset).some(x=>x.endpoint==="request_workflow_snapshot")', offset)
    assert await page.evaluate('feature=>BamcoSectionReports.peek(feature).tasks.length', feature) == 2
    assert await page.evaluate('feature=>BamcoSectionReports.peek(feature)', other) is None
    if feature == 'taskTimeline':
        await page.locator('#ttBody [data-task="9101"]').click()
        dialog = page.locator('#timelineReadonlyDetail')
        await expect(dialog).to_be_visible()
        await expect(dialog).to_contain_text('Read-only foreign detail')
        await expect(dialog.locator('input,textarea,select,form,a')).to_have_count(0)
        assert await page.evaluate('Bamco.state.view') == feature
        history_before = await page.evaluate('({url:location.href,length:history.length})')
        await dialog.locator('button').click()
        await expect(dialog).not_to_be_visible()
        assert await page.evaluate('({url:location.href,length:history.length})') == history_before
        await page.locator('[data-mode="gantt"]').click()
        await page.locator('#ttBody [data-task="9101"]').click()
        await expect(dialog).to_be_visible()
        await dialog.locator('button').click()
        await page.locator('#ttUnscheduled').click()
        await page.locator('#ttUnscheduledList [data-task="9102"]').click()
        await expect(dialog).to_contain_text('Read-only unscheduled detail')
        await capture(page, f'{width}-timeline-readonly')
        await dialog.locator('button').click()
        await page.locator('#ttCloseUnscheduled').click()
        await page.locator('#ttSearch').fill('no matching task')
        await expect(page.locator('#ttBody [data-task]')).to_have_count(0)
        await page.locator('#ttSearch').fill('')
    else:
        row = page.locator('#performanceReportView tbody tr[data-canonical-row]').first
        await expect(row.locator('td').nth(1)).to_have_text('۲')
        await expect(row.locator('[data-definition-metric="for-self"]')).to_have_text('۲')
        await expect(row.locator('.performance-progress')).to_contain_text('۵۰')
        await capture(page, f'{width}-performance-independent')
    checks.append('independent report-only entry without Kanban/approvals; foreign report rows and personal/workflow/profile cache isolation')
    if feature == 'taskTimeline':
        checks.append('calendar, Gantt and unscheduled details readonly; close/search never enter Kanban or alter browser history')
    else:
        checks.append('active plus archived performance metrics and aggregate definition counts')

    # A successful old response arrives after a newer successful render.
    await page.evaluate('__projectReportFixture.revision="Old"')
    await gate(page, endpoint, 'older-report')
    await report_refresh(page, feature)
    await entered(page, 'older-report')
    await page.evaluate('__projectReportFixture.revision="Fresh"')
    await report_refresh(page, feature)
    await report_marker(page, feature, 'Fresh')
    await release(page, 'older-report')
    await report_marker(page, feature, 'Fresh')
    assert 'Fresh' in json.dumps(await page.evaluate('feature=>BamcoSectionReports.peek(feature)', feature))
    assert await private_snapshot(page) == before
    assert not await page.evaluate("__projectReportFixture.calls.some(x=>['save_project_activity','delete_project_activity','request_project_deletion','save_project_metadata','mutate_project_node','mutate_project_dependency'].includes(x.endpoint)||(x.endpoint==='tasks'&&x.method!=='GET'))")
    checks.append('repeated refresh keeps the newest success when an older response arrives late')

    await page.evaluate('endpoint=>__projectReportFixture.malformedNext=endpoint', endpoint)
    await report_refresh(page, feature)
    await page.wait_for_function('feature=>BamcoSectionReports.peek(feature)===null', arg=feature)
    await expect(page.locator('#' + feature + 'View')).to_contain_text('معتبر نیست')
    await report_refresh(page, feature, retry=True)
    await report_marker(page, feature, 'Fresh')
    await page.evaluate('endpoint=>__projectReportFixture.failNext=endpoint', endpoint)
    await report_refresh(page, feature)
    await expect(page.locator('#' + feature + 'View')).to_contain_text('Synthetic retryable failure')
    await report_refresh(page, feature, retry=True)
    await report_marker(page, feature, 'Fresh')
    checks.append('malformed and failed responses clear report cache; retry recovers')

    await page.evaluate('__projectReportFixture.revision="Interrupted"')
    await gate(page, endpoint, 'interrupted-report')
    await report_refresh(page, feature)
    await entered(page, 'interrupted-report')
    await home(page)
    await release(page, 'interrupted-report')
    await expect(page.locator('#homeView')).to_be_visible()
    assert await page.evaluate('Bamco.state.view') == 'home'
    await click_route(page, feature)
    await settled(page, feature)
    await report_marker(page, feature, 'Interrupted')
    checks.append('navigation away during loading stays home; reopening uses a valid current report')

    if feature == 'taskTimeline':
        await page.locator('#ttBody [data-task="9101"]').click()
        await expect(page.locator('#timelineReadonlyDetail')).to_be_visible()
    await page.evaluate('__projectReportFixture.revision="Revoked"')
    await gate(page, endpoint, 'revoked-report')
    # An open modal deliberately remains open when an external invalidation starts.
    if feature == 'taskTimeline':
        await page.evaluate('bamcoTimelineRefresh()')
    else:
        await report_refresh(page, feature)
    await entered(page, 'revoked-report')
    await page.evaluate('async feature=>{__testApi.featureAccess=__testApi.featureAccess.filter(x=>x.feature_key!==feature);await BamcoAccess.refresh({force:true})}', feature)
    await release(page, 'revoked-report')
    assert await page.evaluate('feature=>BamcoSectionReports.peek(feature)', feature) is None
    await expect(page.locator('#' + feature + 'View')).not_to_contain_text('Revoked report-only person')
    await expect(page.locator('#timelineReadonlyDetail')).not_to_be_visible()
    await expect(page.locator('#homeView')).to_be_visible()
    checks.append('revocation immediately clears data and open detail; late successful response cannot restore it')

    # Restore only this report, then switch the synthetic account while its response is held.
    await page.evaluate('async feature=>{__testApi.featureAccess.push({feature_key:feature,can_view:true});await BamcoAccess.refresh({force:true})}', feature)
    await click_route(page, feature)
    await report_marker(page, feature, 'Revoked')
    await page.evaluate('__projectReportFixture.revision="OldAccount"')
    await gate(page, endpoint, 'account-report')
    await report_refresh(page, feature)
    await entered(page, 'account-report')
    await home(page)
    await page.evaluate("""async () => {
      const person={id:'00000000-0000-4000-8000-000000000003',full_name:'New synthetic account',role:'owner',active:true};
      __testApi.actor=person; __testApi.featureAccess=[];
      Object.assign(Bamco.state,{user:{id:person.id},profile:person,token:'new-synthetic-account-token'});
      await BamcoAccess.refresh({force:true});
    }""")
    await release(page, 'account-report')
    assert await page.evaluate('feature=>BamcoSectionReports.peek(feature)', feature) is None
    await expect(page.locator('#' + feature + 'View')).not_to_contain_text('OldAccount')
    await expect(page.locator('#homeView')).to_be_visible()
    checks.append('old-account late response cannot repopulate a new account cache or reopen the route')
    await page.evaluate('async feature=>{__testApi.featureAccess.push({feature_key:feature,can_view:true});await BamcoAccess.refresh({force:true})}', feature)
    await click_route(page, feature)
    await report_marker(page, feature, 'OldAccount')
    await gate(page, endpoint, 'inactive-account')
    await report_refresh(page, feature)
    await entered(page, 'inactive-account')
    await page.evaluate('async()=>{__testApi.actor.active=false;Bamco.state.profile.active=false;await BamcoAccess.refresh({force:true})}')
    await release(page, 'inactive-account')
    assert await page.evaluate('feature=>BamcoSectionReports.peek(feature)', feature) is None
    await expect(page.locator('#timelineReadonlyDetail')).not_to_be_visible()
    checks.append('account deactivation discards an in-flight successful report')


async def run_case(browser, origin, width, scenario):
    context = await browser.new_context(viewport={'width': width, 'height': 900 if width > 700 else 844},
        is_mobile=width < 700, has_touch=width < 700, service_workers='block')
    blocked, errors, checks = [], [], []
    async def isolated_route(route):
        url = urlsplit(route.request.url)
        if f'{url.scheme}://{url.netloc}' == origin:
            await route.continue_()
        else:
            blocked.append({'host': url.netloc, 'resource_type': route.request.resource_type})
            await route.abort('blockedbyclient')
    async def isolated_socket(socket):
        blocked.append({'host': urlsplit(socket.url).netloc, 'resource_type': 'websocket'})
        await socket.close()
    await context.route('**/*', isolated_route)
    await context.route_web_socket('**/*', isolated_socket)
    page = await context.new_page()
    page.set_default_timeout(10000)
    page.on('pageerror', lambda error: errors.append(str(error)))
    await page.add_init_script(FIXTURE)
    result = {'width': width, 'scenario': scenario, 'checks': checks, 'status': 'failed'}
    try:
        await page.goto(origin + '/', wait_until='load')
        await page.evaluate('scenario=>__projectReportFixture.configure(scenario)', scenario)
        await login(page, 'owner')
        await click_route(page, 'userGuide')
        await settled(page, 'userGuide')
        await expect(page.locator('[data-guide-upload]')).to_have_count(0)
        await home(page)
        checks.append('guide stays view-only for the non-admin actor')
        # Do not override BamcoAccess, report clients, business functions or CSS.
        if scenario == 'ordinary':
            await project_ordinary(page, width, checks)
        elif scenario == 'legacy':
            await project_legacy(page, width, checks)
        else:
            await report_case(page, width, scenario, checks)
        assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth+2'), 'body overflow'
        assert await page.evaluate('__projectReportFixture.expired') == [], 'response gate expired'
        assert not errors, errors
        result['status'] = 'passed'
        await capture(page, f'{width}-{scenario}-final')
    except Exception:
        result['error'] = traceback.format_exc()
        await capture(page, f'{width}-{scenario}-failure')
        result['diagnostic'] = await page.evaluate("""() => ({view:Bamco?.state?.view,
          grants:BamcoAccess?.snapshot(),gates:__projectReportFixture?.gates,
          calls:__projectReportFixture?.calls.slice(-15),
          openDialogs:[...document.querySelectorAll('dialog[open]')].map(x=>x.id)})""")
    finally:
        result['javascript_errors'] = errors
        result['blocked_external_requests'] = blocked
        await context.close()
    print(json.dumps(result, ensure_ascii=False), flush=True)
    return result


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    results = []
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or shutil.which('chromium'), headless=True, args=['--no-sandbox'])
            try:
                for width in [1365, 390]:
                    for scenario in ['ordinary', 'legacy', 'timeline-only', 'performance-only']:
                        results.append(await run_case(browser, f'http://127.0.0.1:{server.server_port}', width, scenario))
            finally:
                await browser.close()
    finally:
        server.shutdown()
        server.server_close()
        (OUT / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
    assert len(results) == 8 and all(row['status'] == 'passed' for row in results), 'See test-results/project-report-scope/results.json'


if __name__ == '__main__':
    asyncio.run(main())
