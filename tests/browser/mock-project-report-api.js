/* Wholly synthetic UI fixtures, never a database-policy implementation. */
(() => {
  'use strict';
  const earlier = window.fetch, api = window.__testApi;
  const clone = value => JSON.parse(JSON.stringify(value));
  const stamp = new Date().toISOString(), today = stamp.slice(0, 10);
  const foreign = api.profiles[0].id, actor = api.profiles[1].id;
  const reportOwner = '00000000-0000-4000-8000-000000009001';
  const grant = key => ({ feature_key: key, can_view: true, can_create: false, can_edit: false, can_delete: false, can_export: false, can_manage_access: false, can_bypass_approval: false });
  const store = window.__projectReportFixture = {
    calls: [], gates: {}, gateQueue: [], expired: [], responses: [], serial: 7300, revision: 'Initial', failNext: null, malformedNext: null,
    projects: [], items: [], dependencies: [], requests: [], scenario: '',
    configure(scenario) {
      this.scenario = scenario;
      api.actor = api.profiles[1];
      if (scenario === 'timeline-only') api.actor.id = '00000000-0000-4000-8000-000000000021';
      if (scenario === 'performance-only') api.actor.id = '00000000-0000-4000-8000-000000000022';
      const feature = scenario.startsWith('timeline') ? 'taskTimeline' : scenario.startsWith('performance') ? 'performanceReport' : 'projects';
      api.featureAccess = [grant(feature), grant('settings'), grant('userGuide')];
      if (scenario.startsWith('legacy')) {
        Object.assign(api.featureAccess[0], { can_create: true, can_edit: true, can_delete: true });
        api.featureAccess.push({ ...grant('kanban'), can_create: true, can_edit: true, can_delete: true });
      }
      this.projects = [{ id: 7101, title: 'Foreign project fixture', description: 'Synthetic ordinary metadata', owner_id: foreign, manager_id: foreign, created_by: foreign, status: 'ثبت شده', priority: 'medium', planned_start: today, planned_end: today, created_at: stamp },
        { id: 7102, title: 'Legacy owner transfer fixture', owner_id: actor, manager_id: actor, created_by: actor, status: 'ثبت شده', priority: 'medium', created_at: stamp }];
      this.items = [{ id: 7201, project_id: 7101, item_type: 'phase', title: 'Existing phase', owner_id: foreign, created_by: foreign, parent_item_id: null, status: 'ثبت شده', priority: 'medium', progress: 0, weight: 1, planned_start: today, planned_end: today },
        { id: 7202, project_id: 7101, item_type: 'activity', title: 'Protected task-linked activity', owner_id: foreign, created_by: foreign, parent_item_id: 7201, task_id: 9901, status: 'ثبت شده', priority: 'medium', progress: 0, weight: 1, planned_start: today, planned_end: today }];
    },
    holdNext(endpoint, label) {
      if (this.gates[label]) throw Error('Duplicate response gate: ' + label);
      this.gates[label] = { endpoint, entered: false, finished: false };
      this.gateQueue.push(label);
    },
    release(label) {
      const gate = this.gates[label];
      if (!gate?.entered || gate.finished) throw Error('Response gate is not waiting: ' + label);
      gate.resolve();
    }
  };
  const allowed = key => api.actor.active !== false && api.featureAccess.some(row => row.feature_key === key && row.can_view === true);
  const legacy = () => store.scenario.startsWith('legacy');
  const answer = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const denied = () => ({ data: { message: 'Synthetic endpoint denies this action' }, status: 403 });
  function workspace() {
    return { create_owner_ids: legacy() ? [actor, foreign] : [actor],
      projects: store.projects.map(row => ({ ...row, protected: {
        can_delete: legacy(), can_create_activity: legacy(), can_change_owner: legacy() && row.id === 7102,
        owner_choice_ids: legacy() ? [actor, foreign] : [], owner_lock_reason: row.id === 7101 && legacy() ? 'items' : 'authority'
      } })), items: store.items.map(row => ({ ...row, protected: { can_edit: legacy(), can_delete: legacy() } })), dependencies: store.dependencies };
  }
  function feed(feature) {
    const base = { owner_id: reportOwner, created_by: reportOwner, status: 'در حال انجام', priority: 'متوسط', created_at: stamp, source: 'web', archived: false };
    const tasks = feature === 'taskTimeline' ? [
      { ...base, id: 9101, legacy_id: 9101, title: store.revision + ' scheduled foreign task', description: 'Read-only foreign detail', start_date: today, due_date: today, owner_name: store.revision + ' report-only person' },
      { ...base, id: 9102, legacy_id: 9102, title: store.revision + ' unscheduled foreign task', description: 'Read-only unscheduled detail', start_date: null, due_date: null, owner_name: store.revision + ' report-only person' }
    ] : [
      { ...base, id: 9201, due_date: today, done_date: null },
      { ...base, id: 9202, due_date: today, done_date: today, archived: true, status: 'انجام شده' }
    ];
    return { schema: 'bamco.section-report.v1', feature, tasks,
      profiles: [{ id: reportOwner, display_name: store.revision + ' report-only person' }],
      definition_events: feature === 'performanceReport' ? [{ actorId: reportOwner, ownerId: reportOwner, createdAt: today, count: 2 }] : [], monitoring_started_at: '2026-01-01T00:00:00Z' };
  }
  function handle(endpoint, method, body, url) {
    if (['organization_scope_directory_with_avatars', 'organization_scope_directory'].includes(endpoint) && legacy()) {
      // The positive legacy scenario includes an authorized organization scope.
      // Seed it through the real directory endpoint, never the profile cache.
      return { data: [
        { position_id: 8101, parent_position_id: null, is_current_position: true, role_key: 'manager', occupant_id: actor, occupant_display_name: 'Legacy scope manager', occupant_active: true },
        { position_id: 8102, parent_position_id: 8101, is_current_position: false, role_key: 'member', occupant_id: foreign, occupant_display_name: 'Legacy scoped owner', occupant_active: true }
      ] };
    }
    if (endpoint === 'list_project_workspace') return allowed('projects') ? { data: workspace() } : denied();
    if (['task_timeline_report_feed', 'performance_report_feed'].includes(endpoint)) {
      const feature = endpoint === 'task_timeline_report_feed' ? 'taskTimeline' : 'performanceReport';
      return allowed(feature) ? { data: feed(feature) } : denied();
    }
    if (endpoint === 'save_project_metadata') {
      if (!allowed('projects') || Object.keys(body.p_payload).some(key => !['title', 'description', 'status', 'priority', 'planned_start', 'planned_end'].includes(key))) return denied();
      let row = store.projects.find(row => row.id === body.p_project_id);
      if (body.p_project_id != null && !row) return denied();
      if (!row) { row = { id: store.serial++, owner_id: api.actor.id, manager_id: api.actor.id, created_by: api.actor.id, created_at: stamp }; store.projects.push(row); }
      Object.assign(row, body.p_payload); return { data: row };
    }
    if (endpoint === 'mutate_project_node') {
      const row = store.items.find(row => row.id === body.p_item_id), project = store.projects.find(row => row.id === body.p_project_id);
      if (!allowed('projects') || !project || row && (row.project_id !== project.id || row.item_type === 'activity') || Object.keys(body.p_payload).some(key => ['owner_id', 'created_by', 'task_id', 'approval_status'].includes(key))) return denied();
      if (body.p_action === 'delete') {
        if (!row || store.items.some(child => child.parent_item_id === row.id)) return denied();
        store.items = store.items.filter(item => item !== row); store.dependencies = store.dependencies.filter(dep => dep.predecessor_item_id !== row.id && dep.successor_item_id !== row.id); return { data: { id: row.id } };
      }
      if (body.p_action === 'edit') { if (!row) return denied(); Object.assign(row, body.p_payload); return { data: row }; }
      if (!['phase', 'milestone'].includes(body.p_payload.item_type)) return denied();
      const created = { id: store.serial++, project_id: project.id, owner_id: project.owner_id, created_by: api.actor.id, ...body.p_payload };
      store.items.push(created); return { data: created };
    }
    if (endpoint === 'mutate_project_dependency') {
      if (!allowed('projects')) return denied();
      const row = store.dependencies.find(row => row.id === body.p_dependency_id);
      if (body.p_action === 'delete') { if (!row) return denied(); store.dependencies = store.dependencies.filter(item => item !== row); return { data: { id: row.id } }; }
      const ids = [body.p_payload.predecessor_item_id, body.p_payload.successor_item_id];
      if (ids[0] === ids[1] || !ids.every(id => store.items.some(item => item.id === id && item.project_id === body.p_project_id))) return denied();
      if (row) { Object.assign(row, body.p_payload); return { data: row }; }
      const created = { id: store.serial++, ...body.p_payload }; store.dependencies.push(created); return { data: created };
    }
    if (['save_project_activity', 'delete_project_activity', 'request_project_deletion'].includes(endpoint)) {
      if (!allowed('projects') || !legacy()) return denied();
      // Positive legacy UI fixtures deliberately return pending approval, never a bypass.
      store.requests.push({ endpoint, body: clone(body) }); return { data: { request_id: 9800 + store.requests.length, applied_directly: false } };
    }
    if (['projects', 'project_items', 'project_dependencies', 'project_members'].includes(endpoint) && method !== 'GET') {
      const id = Number(url.searchParams.get('id')?.replace(/^eq\./, ''));
      if (endpoint !== 'projects' || method !== 'PATCH' || id !== 7102 || !allowed('projects') || !legacy()) return denied();
      const row = store.projects.find(row => row.id === id); Object.assign(row, body); return { data: [row] };
    }
    return null;
  }
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href), endpoint = url.pathname.split('/').pop(), method = init.method || 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    store.calls.push({ endpoint, method, body });
    let result = handle(endpoint, method, body, url);
    if (!result) return earlier(input, init);
    if (store.failNext === endpoint) { store.failNext = null; result = { data: { message: 'Synthetic retryable failure' }, status: 503 }; }
    if (store.malformedNext === endpoint) { store.malformedNext = null; result = { data: { schema: 'wrong-report', tasks: [] } }; }
    // Capture before waiting: a successful OLD response may arrive after identity/grants changed.
    result = clone(result);
    const index = store.gateQueue.findIndex(label => store.gates[label].endpoint === endpoint);
    if (index >= 0) {
      const [label] = store.gateQueue.splice(index, 1), gate = store.gates[label]; gate.entered = true;
      let timer;
      try { await new Promise((resolve, reject) => { gate.resolve = resolve; timer = setTimeout(() => { store.expired.push(label); reject(Error('Fixture response gate expired: ' + label)); }, 20000); }); }
      finally { clearTimeout(timer); gate.finished = true; delete gate.resolve; }
    }
    store.responses.push({ endpoint, status: result.status || 200, data: clone(result.data) });
    return answer(result.data, result.status);
  };
})();
