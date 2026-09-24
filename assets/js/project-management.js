/* Project domain: one project state, modal editing, WBS and schedule views. */
(() => {
  'use strict';
  const E = window.bamcoEnterprise; if (!E) return;
  const { q, esc, fa, date, dateTime, progress, statusText, fetchRows, insert, insertMinimal, update, removeRows, setBusy, notify } = E;
  const model = { projects: [], items: [], dependencies: [], selected: null, search: '', loaded: false, detailView: 'summary', projectEditor: null, itemEditor: null, dependencyEditor: null };
  let loadVersion = 0;
  const root = () => q('#projectFeatureRoot');
  const project = id => model.projects.find(row => String(row.id) === String(id));
  const selected = () => project(model.selected);
  const items = id => model.items.filter(row => String(row.project_id) === String(id));
  const item = id => model.items.find(row => String(row.id) === String(id));
  const dependency = id => model.dependencies.find(row => String(row.id) === String(id));
  const itemTypeText = value => ({ phase: 'فاز', activity: 'فعالیت', milestone: 'نقطه عطف' }[value] || value || '—');
  const phasePalette = ['#2f6fb6', '#8759ad', '#c57a2d', '#b75a67', '#536d8f', '#a76438'];
  const wbsIndentStep = 52;
  const itemLabel = row => row?.item_type === 'activity' && item(row.parent_item_id)?.item_type === 'activity' ? 'زیرفعالیت' : itemTypeText(row?.item_type);
  const phaseMeta = (row, rows) => {
    const map = new Map(rows.map(entry => [String(entry.id), entry])); let cursor = row, guard = 0;
    while (cursor?.parent_item_id && guard++ < rows.length) cursor = map.get(String(cursor.parent_item_id));
    const rootPhase = cursor?.item_type === 'phase' ? cursor : (row?.item_type === 'phase' ? row : null);
    const phases = rows.filter(entry => entry.item_type === 'phase' && !entry.parent_item_id);
    const index = Math.max(0, phases.findIndex(entry => String(entry.id) === String(rootPhase?.id)));
    return { color: phasePalette[index % phasePalette.length], index };
  };
  const dateField = (name, label, value = '') => `<label>${label}<span class="enterprise-date-field"><input name="${name}_jalali" class="jalali-input" readonly value="${esc(value ? date(value) : '')}" placeholder="۱۴۰۵/۰۱/۰۱"><button type="button" class="ghost bamco-icon-button" data-project-date="${name}" aria-label="${label}">▦</button><input name="${name}" type="hidden" value="${esc(value || '')}"></span></label>`;
  const generatedProjectCode = () => `PRJ-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const datesAreValid = (start, end) => !start || !end || start <= end;
  const calculatedProgress = row => {
    const children = model.items.filter(child => String(child.parent_item_id) === String(row.id));
    if (!children.length) return Number(row.progress || 0);
    const totalWeight = children.reduce((sum, child) => sum + Number(child.weight || 1), 0);
    return totalWeight ? children.reduce((sum, child) => sum + calculatedProgress(child) * Number(child.weight || 1), 0) / totalWeight : 0;
  };
  const projectProgress = row => {
    if (row.progress_override != null) return Number(row.progress_override);
    const roots = items(row.id).filter(entry => !entry.parent_item_id);
    return roots.length ? roots.reduce((sum, entry) => sum + calculatedProgress(entry), 0) / roots.length : Number(row.progress || 0);
  };
  function scopeTitle() { return state.profile?.role === 'manager' ? 'همه پروژه‌ها' : (state.organizationScope?.descendantUserIds || []).length ? 'پروژه‌های من و زیرمجموعه‌ها' : 'پروژه‌های من'; }
  function render() {
    const host = root(); if (!host) return;
    const visible = model.projects.filter(row => !model.search || [row.title, row.project_code, row.status].some(value => String(value || '').toLowerCase().includes(model.search.toLowerCase())));
    const current = selected();
    const accessControl = '<button type="button" class="ghost hidden" data-feature-access-control="local" data-project-action="access">مدیریت دسترسی</button>';
    const projectSearch = `<input id="projectSearch" class="search" type="search" value="${esc(model.search)}" placeholder="جست‌وجوی پروژه…">`;
    const commandBar = current ? `<div class="project-top-command-row bamco-command-bar"><span data-feature-access-suppressed="true" hidden></span><button type="button" class="ghost" data-home-action>بازگشت به خانه</button><button type="button" class="ghost" data-project-action="back">بازگشت به پروژه‌ها</button><button type="button" class="ghost" data-project-action="edit">ویرایش پروژه</button><button type="button" class="danger" data-project-action="delete">حذف پروژه</button><button type="button" class="primary" data-project-action="item">افزودن فعالیت</button><button type="button" class="ghost" data-project-action="dependency">مدیریت روابط</button><button type="button" class="ghost ${model.detailView === 'gantt' ? 'active' : ''}" data-project-view="gantt">نمای گانت</button><button type="button" class="ghost ${model.detailView === 'wbs' ? 'active' : ''}" data-project-view="wbs">نمای ساختار شکست</button>${projectSearch}</div>` : `<div class="project-top-command-row bamco-command-bar"><button type="button" class="ghost" data-home-action>بازگشت به خانه</button><button type="button" class="primary" data-project-action="new">افزودن پروژه</button>${accessControl}<button type="button" class="ghost" data-project-action="refresh">تازه‌سازی</button>${projectSearch}</div>`;
    const listContent = !model.loaded ? '<div class="empty project-loading">در حال بارگذاری پروژه‌ها…</div>' : visible.length ? visible.map(row => `<button type="button" class="enterprise-list-card ${String(row.id) === String(model.selected) ? 'active' : ''}" data-project-select="${row.id}"><span><strong>${esc(row.title)}</strong><small>${esc(statusText(row.status))}</small></span><span>${progress(projectProgress(row))}<b>${fa(Math.round(projectProgress(row)))}٪</b></span></button>`).join('') : '<div class="empty">پروژه‌ای برای نمایش وجود ندارد.</div>';
    host.innerHTML = `<div class="feature-toolbar enterprise-toolbar"><div><h3>مدیریت پروژه‌ها</h3></div></div>${commandBar}<div class="enterprise-grid project-grid ${current ? 'detail-open' : ''}"><section class="panel"><div class="panel-head"><h3>${scopeTitle()}</h3><span class="enterprise-count">${fa(visible.length)} پروژه</span></div><div class="enterprise-card-list">${listContent}</div></section><section class="panel project-detail">${current ? detailMarkup(current) : '<div class="enterprise-empty"><b>پروژه‌ای انتخاب نشده است.</b><span>برای شروع، پروژه‌ای اضافه کنید یا یکی از کارت‌ها را انتخاب کنید.</span></div>'}</section></div>${projectDialogMarkup()}${current ? itemDialogMarkup(current) + dependencyDialogMarkup(current) : ''}`;
    bind();
    scheduleProjectDiagramLayout();
  }
  function projectDialogMarkup() {
    const editing = project(model.projectEditor);
    const statuses = [['draft','پیش‌نویس'],['planned','برنامه‌ریزی‌شده'],['in_progress','در حال اجرا'],['waiting','در انتظار'],['completed','تکمیل‌شده']];
    const priorities = [['low','کم'],['medium','متوسط'],['urgent','فوری']];
    return `<dialog id="projectDialog" class="modal enterprise-modal project-dialog"><form id="projectForm" method="dialog"><input type="hidden" name="project_id" value="${editing?.id || ''}"><div class="modal-head"><div><h3>${editing ? 'ویرایش پروژه' : 'افزودن پروژه'}</h3><p>مسئول پروژه، ایجادکنندهٔ آن است.</p></div><button type="button" data-project-close aria-label="بستن">×</button></div><div class="form-grid"><label>عنوان پروژه<input name="title" value="${esc(editing?.title || '')}" required></label><label>وضعیت<select name="status">${statuses.map(([value,label]) => `<option value="${value}" ${editing?.status === value || (!editing && value === 'planned') ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="span-2">توضیحات<textarea name="description" rows="3">${esc(editing?.description || '')}</textarea></label>${dateField('planned_start', 'شروع برنامه‌ای', editing?.planned_start)}${dateField('planned_end', 'پایان برنامه‌ای', editing?.planned_end)}<label>اولویت<select name="priority">${priorities.map(([value,label]) => `<option value="${value}" ${editing?.priority === value || (!editing && value === 'medium') ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><div class="modal-actions"><button type="button" class="ghost" data-project-close>انصراف</button><button type="submit" class="primary">${editing ? 'ذخیره تغییرات' : 'ثبت پروژه'}</button></div></form></dialog>`;
  }
  function detailMarkup(row) {
    const rows = items(row.id), deps = projectDependencies(rows);
    if (model.detailView === 'wbs') return workBreakdownMarkup(row, rows);
    if (model.detailView === 'gantt') return ganttMarkup(rows);
    return `<div class="project-detail-head"><div><h3>${esc(row.title)}</h3><p>${esc(row.description || 'بدون توضیحات')}</p></div><span class="status-badge">${esc(statusText(row.status))}</span></div><div class="project-kpis"><div><b>${fa(Math.round(projectProgress(row)))}٪</b><span>پیشرفت پروژه</span>${progress(projectProgress(row))}</div><div><b>${fa(rows.length)}</b><span>فعالیت‌های پروژه</span></div><div><b>${fa(rows.filter(entry => Number(calculatedProgress(entry)) >= 100).length)}</b><span>تکمیل‌شده</span></div><div><b>${fa(deps.length)}</b><span>روابط برنامه</span></div></div><div class="project-dates"><span>شروع برنامه‌ای: ${date(row.planned_start)}</span><span>پایان برنامه‌ای: ${date(row.planned_end)}</span><span>ایجاد: ${dateTime(row.created_at)}</span></div>`;
  }
  function projectDependencies(rows) { const ids = new Set(rows.map(row => String(row.id))); return model.dependencies.filter(row => ids.has(String(row.predecessor_item_id)) || ids.has(String(row.successor_item_id))); }
  function workBreakdownMarkup(projectRow, rows) {
    const byParent = new Map(), known = new Set(rows.map(row => String(row.id)));
    rows.forEach(row => { const key = row.parent_item_id && known.has(String(row.parent_item_id)) ? String(row.parent_item_id) : '__project__'; byParent.set(key, [...(byParent.get(key) || []), row]); });
    const seen = new Set();
    const subtreeDepth = (row, ancestry = new Set()) => {
      const id = String(row.id); if (ancestry.has(id)) return 1;
      const next = new Set(ancestry); next.add(id);
      const childDepths = (byParent.get(id) || []).map(child => subtreeDepth(child, next));
      return 1 + (childDepths.length ? Math.max(...childDepths) : 0);
    };
    const rootCard = `<article class="project-wbs-card project-wbs-root-card" data-wbs-node="project-root"><span>پروژه</span><b>${esc(projectRow.title)}</b><small>${fa(Math.round(projectProgress(projectRow)))}٪ پیشرفت</small></article>`;
    const branch = (row, depth = 1, ancestry = new Set(), columnShift = 0) => {
      const id = String(row.id); if (ancestry.has(id) || seen.has(id)) return '';
      seen.add(id); const next = new Set(ancestry); next.add(id);
      const meta = phaseMeta(row, rows), parent = row.parent_item_id && known.has(String(row.parent_item_id)) ? row.parent_item_id : 'project-root';
      const progressText = row.item_type === 'milestone' ? date(row.planned_start) : `${fa(Math.round(calculatedProgress(row)))}٪ پیشرفت`;
      const children = (byParent.get(id) || []).map(child => branch(child, depth + 1, next, columnShift)).filter(Boolean).join('');
      const shift = Math.min(Math.max(0, depth - 1), 6) * wbsIndentStep;
      const columnStyle = depth === 1 ? ` style="--wbs-branch-shift:${columnShift}px;--wbs-branch-extra:${columnShift * 2}px"` : '';
      return `<section class="project-wbs-branch ${children ? 'has-children' : ''}" data-wbs-branch="${row.id}"${columnStyle}><article class="project-wbs-card ${row.item_type}" data-wbs-node="${row.id}" data-wbs-parent="${parent}" data-wbs-depth="${depth}" data-project-item-open="${row.id}" style="--wbs-depth:${depth};--wbs-shift:${shift}px;--phase-color:${meta.color}" title="برای ویرایش دوبار کلیک کنید"><span>${esc(itemLabel(row))}</span><b>${esc(row.title)}</b><small>${progressText}</small></article>${children ? `<div class="project-wbs-children">${children}</div>` : ''}</section>`;
    };
    const roots = (byParent.get('__project__') || []).map(row => branch(row, 1, new Set(), Math.min(Math.max(0, subtreeDepth(row) - 1), 6) * wbsIndentStep)).filter(Boolean);
    rows.forEach(row => { if (!seen.has(String(row.id))) roots.push(branch(row, 1, new Set(), Math.min(Math.max(0, subtreeDepth(row) - 1), 6) * wbsIndentStep)); });
    const forest = roots.length ? `<div class="project-wbs-forest" style="--wbs-root-count:${roots.length}">${roots.join('')}</div>` : '<div class="empty">برای شروع، یک فاز، فعالیت یا نقطه عطف اضافه کنید.</div>';
    return `<div class="wbs-direct"><div class="project-wbs-canvas"><svg class="project-wbs-connectors" aria-label="اتصالات ساختار شکست"></svg><div class="project-wbs-tree">${rootCard}${forest}</div></div></div>`;
  }
  function ganttMarkup(rows) {
    const dated = rows.filter(row => row.planned_start || row.planned_end); if (!dated.length) return '<div class="empty">برای نمایش گانت، تاریخ برنامه‌ای فعالیت‌ها را ثبت کنید.</div>';
    const stamp = value => value ? Date.parse(`${value}T00:00:00Z`) : null, day = 86400000, rowH = 58;
    const start = Math.min(...dated.map(row => stamp(row.planned_start || row.planned_end))), end = Math.max(...dated.map(row => stamp(row.planned_end || row.planned_start)));
    const count = Math.max(1, Math.floor((end - start) / day) + 1), viewport = Math.max(860, Number(window.innerWidth || 1280)), cell = Math.max(32, Math.min(56, Math.ceil((viewport - 360) / count))), days = Array.from({ length: count }, (_, index) => new Date(start + index * day).toISOString().slice(0, 10)), width = count * cell;
    const children = parent => rows.filter(row => String(row.parent_item_id || '') === String(parent || ''));
    const ordered = []; const visit = (row, level = 0) => { ordered.push({ row, level }); children(row.id).forEach(child => visit(child, level + 1)); };
    children(null).forEach(row => visit(row)); rows.filter(row => row.parent_item_id && !rows.some(parent => String(parent.id) === String(row.parent_item_id))).forEach(row => visit(row));
    const timelineRows = ordered.filter(entry => entry.row.planned_start || entry.row.planned_end);
    const pos = new Map(timelineRows.map((entry, index) => [String(entry.row.id), index]));
    const x = (row, edge) => { const value = edge === 'start' ? (row.planned_start || row.planned_end) : (row.planned_end || row.planned_start); const offset = Math.floor((stamp(value) - start) / day); return Math.max(8, Math.min(width - 8, width - (offset + (edge === 'end' ? 1 : 0)) * cell)); };
    const relationSvg = projectDependencies(rows).filter(dep => pos.has(String(dep.predecessor_item_id)) && pos.has(String(dep.successor_item_id))).map(dep => { const from = item(dep.predecessor_item_id), to = item(dep.successor_item_id), kind = dep.dependency_type || 'FS', map = { FS: ['end','start'], SS: ['start','start'], FF: ['end','end'], SF: ['start','end'] }[kind] || ['end','start'], x1 = x(from, map[0]), x2 = x(to, map[1]), y1 = pos.get(String(from.id)) * rowH + rowH / 2, y2 = pos.get(String(to.id)) * rowH + rowH / 2, lane = Math.round((x1 + x2) / 2), path = Math.abs(y1 - y2) < 2 ? `M ${x1} ${y1} H ${x2}` : `M ${x1} ${y1} H ${lane} V ${y2} H ${x2}`; return `<path d="${path}" class="gantt-dependency-line" marker-end="url(#ganttArrow)"><title>${kind} · ${esc(from.title)} ← ${esc(to.title)}</title></path>`; }).join('');
    const months = []; days.forEach((value, index) => { const key = date(value).slice(0, 7); const last = months.at(-1); if (last?.key === key) last.count++; else months.push({ key, count: 1, index }); });
    const labelRows = timelineRows.map(({ row, level }) => { const meta = phaseMeta(row, rows); return `<div class="gantt-pro-label-row ${row.item_type === 'phase' ? 'phase-row' : ''} ${level > 1 ? 'subactivity-row' : ''}" data-project-item-open="${row.id}" title="برای ویرایش دوبار کلیک کنید" style="--level:${level};--phase-color:${meta.color}"><b>${esc(row.title)}</b><small>${esc(itemLabel(row))}${row.item_type !== 'milestone' ? ` · ${fa(Math.round(calculatedProgress(row)))}٪` : ''}</small></div>`; }).join('');
    const trackRows = timelineRows.map(({ row, level }) => { const from = Math.floor((stamp(row.planned_start || row.planned_end) - start) / day), to = Math.floor((stamp(row.planned_end || row.planned_start) - start) / day), duration = Math.max(1, to - from + 1), meta = phaseMeta(row, rows); return `<div class="gantt-pro-track ${row.item_type === 'phase' ? 'phase-row' : ''} ${level > 1 ? 'subactivity-row' : ''}" data-project-item-open="${row.id}" title="برای ویرایش دوبار کلیک کنید" style="--phase-color:${meta.color}">${row.item_type === 'milestone' ? `<i class="gantt-pro-milestone" style="right:${from * cell + cell / 2 - 8}px" title="${esc(row.title)}"></i>` : `<i class="gantt-pro-bar" style="right:${from * cell + 3}px;width:${Math.max(10, duration * cell - 6)}px"><span>${fa(Math.round(calculatedProgress(row)))}٪</span></i>`}</div>`; }).join('');
    const timelineStyle = `width:${width}px;--gantt-cell-width:${cell}px`;
    return `<div class="gantt-pro-wrap gantt-direct"><div class="gantt-pro"><div class="gantt-pro-label-head">فعالیت‌های پروژه</div><div class="gantt-pro-header-scroll" aria-label="تقویم گانت"><div class="gantt-pro-header" style="${timelineStyle}"><div class="gantt-pro-months">${months.map(month => `<span style="width:${month.count * cell}px">${esc(month.key)}</span>`).join('')}</div><div class="gantt-pro-days">${days.map(value => `<span style="width:${cell}px">${esc(date(value).split('/').at(-1))}</span>`).join('')}</div></div></div><aside class="gantt-pro-label-scroll"><div class="gantt-pro-labels">${labelRows}</div></aside><div class="gantt-pro-timeline-scroll"><div class="gantt-pro-timeline" style="${timelineStyle}"><svg class="gantt-dependencies" viewBox="0 0 ${width} ${timelineRows.length * rowH}" width="${width}" height="${timelineRows.length * rowH}" aria-label="روابط پیش‌نیازی و پس‌نیازی"><defs><marker id="ganttArrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L0,7 L6,3.5 z"></path></marker></defs>${relationSvg}</svg>${trackRows}</div></div></div></div>`;
  }
  function drawWbsConnectors() {
    const host = root(), canvas = host?.querySelector('.project-wbs-canvas'), svg = canvas?.querySelector('.project-wbs-connectors'); if (!canvas || !svg) return;
    const box = canvas.getBoundingClientRect(); if (!box.width || !box.height) return;
    const nodes = new Map([...canvas.querySelectorAll('[data-wbs-node]')].map(node => [String(node.dataset.wbsNode), node]));
    const childGroups = new Map();
    [...nodes.values()].forEach(node => {
      const parentId = String(node.dataset.wbsParent || ''); if (!parentId || !nodes.has(parentId)) return;
      childGroups.set(parentId, [...(childGroups.get(parentId) || []), node]);
    });
    const paths = [];
    childGroups.forEach((children, parentId) => {
      const parent = nodes.get(parentId), a = parent.getBoundingClientRect(), x1 = Math.round(a.left + a.width / 2 - box.left), y1 = Math.round(a.bottom - box.top);
      const childRects = children.map(node => ({ node, rect: node.getBoundingClientRect() })).sort((left, right) => left.rect.top - right.rect.top || right.rect.right - left.rect.right);
      if (parentId === 'project-root') {
        const points = childRects.map(({ rect }) => ({ x: Math.round(rect.left + rect.width / 2 - box.left), y: Math.round(rect.top - box.top) }));
        const firstTop = Math.min(...points.map(point => point.y)), busY = Math.round(y1 + Math.max(18, (firstTop - y1) / 2)), minX = Math.min(x1, ...points.map(point => point.x)), maxX = Math.max(x1, ...points.map(point => point.x));
        paths.push(`M ${x1} ${y1} V ${busY}`);
        if (maxX > minX) paths.push(`M ${minX} ${busY} H ${maxX}`);
        points.forEach(point => paths.push(`M ${point.x} ${busY} V ${point.y}`));
        return;
      }
      const points = childRects.map(({ rect }) => ({ edge: Math.round(rect.right - box.left), y: Math.round(rect.top + rect.height / 2 - box.top) }));
      const trunkX = Math.max(...points.map(point => point.edge)) + 18, jointY = Math.round(y1 + 18), lastY = Math.max(jointY, ...points.map(point => point.y));
      paths.push(`M ${x1} ${y1} V ${jointY} H ${trunkX} V ${lastY}`);
      points.forEach(point => paths.push(`M ${trunkX} ${point.y} H ${point.edge}`));
    });
    const links = paths.length ? `<path d="${paths.join(' ')}" class="project-wbs-link"></path>` : '';
    svg.setAttribute('viewBox', `0 0 ${Math.ceil(canvas.scrollWidth)} ${Math.ceil(canvas.scrollHeight)}`); svg.setAttribute('width', String(Math.ceil(canvas.scrollWidth))); svg.setAttribute('height', String(Math.ceil(canvas.scrollHeight))); svg.innerHTML = links;
  }
  function drawGanttDependencies() {
    const host = root(), timeline = host?.querySelector('.gantt-direct .gantt-pro-timeline'), svg = timeline?.querySelector('.gantt-dependencies'); if (!timeline || !svg) return;
    const box = timeline.getBoundingClientRect(); if (!box.width || !box.height) return;
    const tracks = new Map([...timeline.querySelectorAll('.gantt-pro-track[data-project-item-open]')].map(track => [String(track.dataset.projectItemOpen), track]));
    const edge = (track, side) => { const mark = q('.gantt-pro-bar,.gantt-pro-milestone', track); if (!mark) return null; const r = mark.getBoundingClientRect(), x = mark.classList.contains('gantt-pro-milestone') ? r.left + r.width / 2 : (side === 'start' ? r.right : r.left); return { x: Math.round(x - box.left), y: Math.round(r.top + r.height / 2 - box.top) }; };
    const links = projectDependencies(model.items).filter(dep => tracks.has(String(dep.predecessor_item_id)) && tracks.has(String(dep.successor_item_id))).map(dep => {
      const kind = dep.dependency_type || 'FS', sides = { FS: ['end','start'], SS: ['start','start'], FF: ['end','end'], SF: ['start','end'] }[kind] || ['end','start'], from = edge(tracks.get(String(dep.predecessor_item_id)), sides[0]), to = edge(tracks.get(String(dep.successor_item_id)), sides[1]);
      if (!from || !to) return ''; const lane = Math.round((from.x + to.x) / 2), path = Math.abs(from.y - to.y) < 2 ? `M ${from.x} ${from.y} H ${to.x}` : `M ${from.x} ${from.y} H ${lane} V ${to.y} H ${to.x}`; return `<path d="${path}" class="gantt-dependency-line" marker-end="url(#ganttArrow)"><title>${kind}</title></path>`;
    }).join('');
    if (!links) return; const defs = svg.querySelector('defs')?.outerHTML || '<defs><marker id="ganttArrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L0,7 L6,3.5 z"></path></marker></defs>';
    svg.setAttribute('viewBox', `0 0 ${Math.ceil(timeline.scrollWidth)} ${Math.ceil(timeline.scrollHeight)}`); svg.setAttribute('width', String(Math.ceil(timeline.scrollWidth))); svg.setAttribute('height', String(Math.ceil(timeline.scrollHeight))); svg.innerHTML = defs + links;
  }
  function bindGanttScroll() {
    const host = root(), body = host?.querySelector('.gantt-direct .gantt-pro-timeline-scroll'), header = host?.querySelector('.gantt-direct .gantt-pro-header-scroll'), labels = host?.querySelector('.gantt-direct .gantt-pro-label-scroll');
    if (!body || !header || !labels || body.dataset.ganttScrollBound === '1') return;
    body.dataset.ganttScrollBound = '1';
    const sync = () => { header.scrollLeft = body.scrollLeft; labels.scrollTop = body.scrollTop; };
    body.addEventListener('scroll', sync, { passive: true });
    sync();
  }
  let diagramResizeBound = false;
  function scheduleProjectDiagramLayout() {
    const redraw = () => { bindGanttScroll(); drawWbsConnectors(); drawGanttDependencies(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(redraw); else redraw();
    setTimeout(redraw, 80);
    if (!diagramResizeBound) { diagramResizeBound = true; window.addEventListener('resize', () => setTimeout(redraw, 0)); }
  }
  function itemDialogMarkup(current) {
    const rows = items(current.id), editing = item(model.itemEditor), parents = rows.filter(row => !editing || String(row.id) !== String(editing.id)).map(row => `<option value="${row.id}" ${String(editing?.parent_item_id) === String(row.id) ? 'selected' : ''}>${esc(row.title)}</option>`).join('');
    const types = [['phase','فاز'],['activity','فعالیت'],['milestone','نقطه عطف']], statuses = [['planned','برنامه‌ریزی‌شده'],['in_progress','در حال اجرا'],['waiting','در انتظار'],['completed','تکمیل‌شده']];
    const phaseLocked = editing?.item_type === 'phase';
    const parentIsActivity = item(editing?.parent_item_id)?.item_type === 'activity';
    return `<dialog id="projectItemDialog" class="modal enterprise-modal project-item-dialog"><form id="projectItemForm" method="dialog"><input type="hidden" name="project_id" value="${current.id}"><input type="hidden" name="item_id" value="${editing?.id || ''}"><div class="modal-head"><div><h3>${editing ? 'ویرایش فعالیت پروژه' : 'افزودن فعالیت پروژه'}</h3><p>فعالیت‌ها به‌صورت خودکار در کانبان نیز نمایش داده می‌شوند.</p></div><button type="button" data-project-close aria-label="بستن">×</button></div><div class="form-grid project-item-form"><label data-project-kind-label>${parentIsActivity ? 'نوع زیرفعالیت' : 'نوع فعالیت'}<select name="item_type" data-project-item-type>${types.map(([value,label]) => `<option value="${value}" ${editing?.item_type === value ? 'selected' : ''}>${value === 'activity' && parentIsActivity ? 'زیرفعالیت' : label}</option>`).join('')}</select></label><label>عنوان<input name="title" value="${esc(editing?.title || '')}" required></label><label class="span-2">فعالیت بالادست<select name="parent_item_id" data-project-parent><option value="">در سطح اول ساختار</option>${parents}</select></label><div class="span-2 item-milestone-date ${editing?.item_type === 'milestone' ? '' : 'hidden'}">${dateField('milestone_date', 'تاریخ نقطه عطف', editing?.item_type === 'milestone' ? editing.planned_start : '')}</div><div class="item-range-start ${editing?.item_type === 'milestone' ? 'hidden' : ''}">${dateField('item_planned_start', 'شروع برنامه‌ای', editing?.planned_start)}</div><div class="item-range-end ${editing?.item_type === 'milestone' ? 'hidden' : ''}">${dateField('item_planned_end', 'پایان برنامه‌ای', editing?.planned_end)}</div><label>وضعیت<select name="status">${statuses.map(([value,label]) => `<option value="${value}" ${editing?.status === value || (!editing && value === 'planned') ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="item-priority">اولویت<select name="priority">${[['low','کم'],['medium','متوسط'],['urgent','فوری']].map(([value,label]) => `<option value="${value}" ${editing?.priority === value || (!editing && value === 'medium') ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="item-progress ${phaseLocked ? 'hidden' : ''}">درصد پیشرفت<input name="progress" type="number" min="0" max="100" value="${esc(editing?.progress ?? 0)}"></label><div class="item-phase-progress ${phaseLocked ? '' : 'hidden'}"><span>درصد پیشرفت فاز</span><b>${fa(Math.round(editing ? calculatedProgress(editing) : 0))}٪</b><small>از فعالیت‌های زیرمجموعه محاسبه می‌شود.</small></div></div><div class="modal-actions">${editing ? `<button type="button" class="danger" data-project-item-delete="${editing.id}">حذف ${parentIsActivity ? 'زیرفعالیت' : 'فعالیت'}</button>` : ''}<button type="button" class="ghost" data-project-close>انصراف</button><button type="submit" class="primary">${editing ? 'ذخیره تغییرات' : 'ثبت فعالیت'}</button></div></form></dialog>`;
  }
  function dependencyDialogMarkup(current) {
    const rows = items(current.id), editing = dependency(model.dependencyEditor), options = selectedId => rows.map(row => `<option value="${row.id}" ${String(selectedId) === String(row.id) ? 'selected' : ''}>${esc(row.title)}</option>`).join(''), deps = projectDependencies(rows);
    return `<dialog id="projectDependencyDialog" class="modal enterprise-modal project-dependency-dialog"><form id="projectDependencyForm" method="dialog"><input type="hidden" name="dependency_id" value="${editing?.id || ''}"><div class="modal-head"><div><h3>${editing ? 'ویرایش رابطه' : 'تعریف رابطه پیش‌نیازی و پس‌نیازی'}</h3><p>وابستگی حلقوی ثبت نمی‌شود.</p></div><button type="button" data-project-close aria-label="بستن">×</button></div><div class="form-grid"><label>پیش‌نیاز<select name="predecessor_item_id" required>${options(editing?.predecessor_item_id)}</select></label><label>پس‌نیاز<select name="successor_item_id" required>${options(editing?.successor_item_id)}</select></label><label>نوع رابطه<select name="dependency_type">${[['FS','پایان به شروع'],['SS','شروع به شروع'],['FF','پایان به پایان'],['SF','شروع به پایان']].map(([value,label]) => `<option value="${value}" ${editing?.dependency_type === value || (!editing && value === 'FS') ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>شناوری زمانی (روز)<input name="lag_days" type="number" value="${esc(editing?.lag_days ?? 0)}"></label></div><div class="modal-actions"><button type="button" class="ghost" data-project-close>انصراف</button><button type="submit" class="primary">${editing ? 'ذخیره رابطه' : 'ثبت رابطه'}</button></div></form><section class="dependency-list"><h4>روابط ثبت‌شده</h4>${deps.length ? deps.map(row => `<article><span>${esc(item(row.predecessor_item_id)?.title || '—')} ← ${esc(item(row.successor_item_id)?.title || '—')}</span><small>${esc(row.dependency_type)} · ${fa(row.lag_days || 0)} روز</small><div><button type="button" class="ghost" data-project-dependency-edit="${row.id}">ویرایش</button><button type="button" class="danger" data-project-dependency-delete="${row.id}">حذف</button></div></article>`).join('') : '<p class="empty">رابطه‌ای تعریف نشده است.</p>'}</section></dialog>`;
  }
  function openDialog(selector) { const dialog = q(selector, root()); if (dialog && !dialog.open) dialog.showModal(); }
  function showProjectDialog(id = null) { model.projectEditor = id; render(); openDialog('#projectDialog'); }
  function showItemDialog(id = null) { model.itemEditor = id; render(); openDialog('#projectItemDialog'); }
  function showDependencyDialog(id = null) { model.dependencyEditor = id; render(); openDialog('#projectDependencyDialog'); }
  function syncItemType(form) { const milestone = form.elements.item_type.value === 'milestone', phase = form.elements.item_type.value === 'phase', parentIsActivity = item(form.elements.parent_item_id?.value)?.item_type === 'activity'; form.querySelector('.item-milestone-date')?.classList.toggle('hidden', !milestone); form.querySelector('.item-range-start')?.classList.toggle('hidden', milestone); form.querySelector('.item-range-end')?.classList.toggle('hidden', milestone); form.querySelector('.item-progress')?.classList.toggle('hidden', phase); form.querySelector('.item-phase-progress')?.classList.toggle('hidden', !phase); const activityOption = form.querySelector('[data-project-item-type] option[value="activity"]'); if (activityOption) activityOption.textContent = parentIsActivity ? 'زیرفعالیت' : 'فعالیت'; const label = form.querySelector('[data-project-kind-label]'); if (label) label.firstChild.textContent = parentIsActivity ? 'نوع زیرفعالیت' : 'نوع فعالیت'; }
  async function saveProject(event) {
    event.preventDefault(); const form = event.target, button = q('[type=submit]', form), id = form.elements.project_id.value, payload = { title: form.elements.title.value.trim(), description: form.elements.description.value.trim() || null, planned_start: form.elements.planned_start.value || null, planned_end: form.elements.planned_end.value || null, status: form.elements.status.value, priority: form.elements.priority.value, updated_by: state.user.id };
    if (!datesAreValid(payload.planned_start, payload.planned_end)) return notify('پایان برنامه‌ای نمی‌تواند پیش از شروع برنامه‌ای باشد.', true);
    setBusy(button, true); try { if (id) { await update('projects', `id=eq.${encodeURIComponent(id)}`, payload); model.selected = id; notify('پروژه ویرایش شد.'); } else { const code = generatedProjectCode(); await (insertMinimal || insert)('projects', { ...payload, project_code: code, owner_id: state.user.id, manager_id: state.user.id, created_by: state.user.id }); model.projectEditor = null; await load(); model.selected = model.projects.find(row => row.project_code === code)?.id || null; render(); notify('پروژه ایجاد شد.'); return; } model.projectEditor = null; q('#projectDialog', root())?.close(); await load(); render(); } catch (error) { notify(error.message, true); } finally { setBusy(button, false); }
  }
  async function saveItem(event) {
    event.preventDefault(); const form = event.target, button = q('[type=submit]', form), id = form.elements.item_id.value, type = form.elements.item_type.value, milestoneDate = form.elements.milestone_date?.value || '', start = type === 'milestone' ? milestoneDate : form.elements.item_planned_start.value, end = type === 'milestone' ? milestoneDate : form.elements.item_planned_end.value;
    if (type === 'milestone' && !milestoneDate) return notify('برای نقطه عطف، یک تاریخ تعیین کنید.', true); if (!datesAreValid(start, end)) return notify('پایان برنامه‌ای نمی‌تواند پیش از شروع برنامه‌ای باشد.', true);
    const parentId = form.elements.parent_item_id.value || null; if (id && String(parentId) === String(id)) return notify('یک فعالیت نمی‌تواند بالادست خودش باشد.', true);
    const existing = item(id); const payload = { project_id: Number(form.elements.project_id.value), item_type: type, title: form.elements.title.value.trim(), owner_id: state.user.id, parent_item_id: parentId, planned_start: start || null, planned_end: end || null, status: form.elements.status.value, priority: form.elements.priority.value, progress: type === 'phase' ? Number(existing?.progress || 0) : Number(form.elements.progress.value || 0), weight: 1, created_by: state.user.id };
    setBusy(button, true); try { if (id) { delete payload.created_by; await update('project_items', `id=eq.${encodeURIComponent(id)}`, payload); notify('فعالیت ویرایش شد.'); } else { await insert('project_items', payload); notify('فعالیت اضافه شد.'); } model.itemEditor = null; q('#projectItemDialog', root())?.close(); await load(); } catch (error) { notify(error.message, true); } finally { setBusy(button, false); }
  }
  async function saveDependency(event) {
    event.preventDefault(); const form = event.target, button = q('[type=submit]', form), id = form.elements.dependency_id.value, predecessor = Number(form.elements.predecessor_item_id.value), successor = Number(form.elements.successor_item_id.value); if (!predecessor || !successor || predecessor === successor) return notify('پیش‌نیاز و پس‌نیاز باید دو فعالیت متفاوت باشند.', true);
    const payload = { predecessor_item_id: predecessor, successor_item_id: successor, dependency_type: form.elements.dependency_type.value, lag_days: Number(form.elements.lag_days.value || 0), created_by: state.user.id };
    setBusy(button, true); try { if (id) { delete payload.created_by; await update('project_dependencies', `id=eq.${encodeURIComponent(id)}`, payload); notify('رابطه ویرایش شد.'); } else { await insert('project_dependencies', payload); notify('رابطه ثبت شد.'); } model.dependencyEditor = null; q('#projectDependencyDialog', root())?.close(); await load(); } catch (error) { notify(error.message, true); } finally { setBusy(button, false); }
  }
  async function removeProject() { const current = selected(); if (!current) return; const ok = window.bamcoConfirm ? await window.bamcoConfirm(`پروژه «${current.title}» و همه فعالیت‌ها و روابط آن حذف شوند؟`) : window.confirm(`پروژه «${current.title}» حذف شود؟`); if (!ok) return; try { await removeRows('projects', `id=eq.${encodeURIComponent(current.id)}`); model.selected = null; await load(); notify('پروژه و همه اطلاعات وابسته حذف شدند.'); } catch (error) { notify(error.message, true); } }
  async function removeItem(id) { const row = item(id); if (!row) return; const ok = window.bamcoConfirm ? await window.bamcoConfirm(`فعالیت «${row.title}» و زیرمجموعه‌ها و روابط وابسته حذف شوند؟`) : window.confirm(`فعالیت «${row.title}» حذف شود؟`); if (!ok) return; try { await removeRows('project_items', `id=eq.${encodeURIComponent(id)}`); await load(); notify('فعالیت حذف شد.'); } catch (error) { notify(error.message, true); } }
  async function removeDependency(id) { const row = dependency(id); if (!row) return; const ok = window.bamcoConfirm ? await window.bamcoConfirm('این رابطه حذف شود؟') : window.confirm('این رابطه حذف شود؟'); if (!ok) return; try { await removeRows('project_dependencies', `id=eq.${encodeURIComponent(id)}`); model.dependencyEditor = null; await load(); showDependencyDialog(null); notify('رابطه حذف شد.'); } catch (error) { notify(error.message, true); } }
  function openProjectDate(button) { const form = button.closest('form'), name = button.dataset.projectDate, visible = form?.elements[`${name}_jalali`], hidden = form?.elements[name]; E.openJalaliPicker?.({ visible, hidden, label: button.getAttribute('aria-label') || 'انتخاب تاریخ' }); }
  function bind() {
    const host = root(); if (!host || host.dataset.bound === '1') return; host.dataset.bound = '1';
    host.addEventListener('input', event => { if (event.target.id === 'projectSearch') { model.search = event.target.value; render(); q('#projectSearch')?.focus(); } });
    host.addEventListener('change', event => { if (event.target.matches('[data-project-item-type],[data-project-parent]')) syncItemType(event.target.closest('form')); });
    host.addEventListener('click', event => { const action = event.target.closest('[data-project-action]')?.dataset.projectAction; if (action === 'new') return showProjectDialog(); if (action === 'edit') return showProjectDialog(model.selected); if (action === 'delete') return void removeProject(); if (action === 'refresh') return void load(); if (action === 'access') return window.bamcoAccessEditor?.open?.({ featureKey: 'projects', title: 'مدیریت دسترسی مدیریت پروژه‌ها' }); if (action === 'back') { model.selected = null; model.detailView = 'summary'; return render(); } if (action === 'item') return showItemDialog(); if (action === 'dependency') return showDependencyDialog(); if (event.target.closest('[data-project-close]')) { model.projectEditor = null; model.itemEditor = null; model.dependencyEditor = null; event.target.closest('dialog')?.close(); return; } const dateButton = event.target.closest('[data-project-date]'); if (dateButton) return openProjectDate(dateButton); const select = event.target.closest('[data-project-select]'); if (select) { model.selected = select.dataset.projectSelect; model.detailView = 'summary'; return render(); } const view = event.target.closest('[data-project-view]'); if (view) { model.detailView = view.dataset.projectView; return render(); } const deleteItem = event.target.closest('[data-project-item-delete]'); if (deleteItem) return void removeItem(deleteItem.dataset.projectItemDelete); const editDependency = event.target.closest('[data-project-dependency-edit]'); if (editDependency) return showDependencyDialog(editDependency.dataset.projectDependencyEdit); const deleteDependency = event.target.closest('[data-project-dependency-delete]'); if (deleteDependency) return void removeDependency(deleteDependency.dataset.projectDependencyDelete); });
    host.addEventListener('dblclick', event => { if (event.target.closest('button')) return; const opener = event.target.closest('[data-project-item-open]'); if (opener) showItemDialog(opener.dataset.projectItemOpen); });
    host.addEventListener('submit', event => { if (event.target.id === 'projectForm') void saveProject(event); if (event.target.id === 'projectItemForm') void saveItem(event); if (event.target.id === 'projectDependencyForm') void saveDependency(event); });
  }
  async function load() { if (!root() || !state.profile) return; const request = ++loadVersion; try { const [projects, projectItems, dependencies] = await Promise.all([fetchRows('projects', 'select=*&order=updated_at.desc,id.desc'), fetchRows('project_items', 'select=*&order=project_id,id'), fetchRows('project_dependencies', 'select=*')]); if (request !== loadVersion) return; Object.assign(model, { projects, items: projectItems, dependencies, loaded: true }); if (model.selected && !project(model.selected)) model.selected = null; render(); } catch (error) { if (request === loadVersion && root()) root().innerHTML = `<div class="panel enterprise-error">${esc(error.message)}</div>`; } }
  function boot() { if (!root()) return; render(); window.BamcoNavigation?.registerView?.('projects', { activate: load }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.bamcoProjects = { load, model };
})();
