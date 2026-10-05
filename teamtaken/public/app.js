'use strict';
// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAYS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag'];
const DAYS_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr'];
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : (method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
    body: body !== undefined ? JSON.stringify(body) : (method !== 'GET' ? '{}' : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && state.user) { state.user = null; render(); }
    throw new Error(data.error || 'Er ging iets mis');
  }
  return data;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2500);
}

// datums (lokale tijd, ISO-formaat YYYY-MM-DD)
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const mondayOf = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); };
const fmtDay = (s) => { const d = parseISO(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const fmtDayFull = (s) => { const d = parseISO(s); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const weekdayIdx = (s) => (parseISO(s).getDay() + 6) % 7;
const weekNumber = (s) => {
  const d = parseISO(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
};
const today = () => iso(new Date());

// tijd
function fmtMin(m) {
  if (m === null || m === undefined || Number.isNaN(m)) return '–';
  const sign = m < 0 ? '-' : ''; m = Math.abs(Math.round(m));
  const h = Math.floor(m / 60), r = m % 60;
  if (!h) return `${sign}${r}m`;
  return r ? `${sign}${h}u ${r}m` : `${sign}${h}u`;
}
const fmtDiff = (m) => (m > 0 ? '+' : '') + fmtMin(m);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const fmtPct = (v) => (v === null ? '–' : v + '%');
function timeFields(name, minutes) {
  const hours = minutes && minutes % 60 === 0 && minutes >= 60;
  const val = minutes ? (hours ? minutes / 60 : minutes) : '';
  return `<div class="time-input">
    <input type="number" name="${name}" min="0" step="any" inputmode="decimal" value="${val}" placeholder="0">
    <select name="${name}_unit"><option value="m"${hours ? '' : ' selected'}>minuten</option><option value="h"${hours ? ' selected' : ''}>uren</option></select>
  </div>`;
}
function readMinutes(form, name) {
  const raw = form.elements[name].value.trim().replace(',', '.');
  if (raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * (form.elements[name + '_unit'].value === 'h' ? 60 : 1));
}

// ---------- state ----------
const state = {
  loading: true, needsSetup: false, user: null,
  users: [], activities: [],
  tab: 'overview',            // manager: 'overview' | 'user:<id>' | 'admin'
  weekStart: mondayOf(new Date()),
  weekTasks: [],              // taken van het weekbord
  range: 'week', rangeFrom: '', rangeTo: '',
  rangeTasks: [],             // taken voor de analyse
  showInactive: false,
};
const isManager = () => state.user && state.user.role === 'manager';
const employees = () => state.users.filter((u) => u.role === 'employee');
const userById = (id) => state.users.find((u) => u.id === Number(id));

// ---------- modal ----------
function openModal(html) {
  const b = document.createElement('div');
  b.className = 'backdrop';
  b.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { b.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  b.addEventListener('mousedown', (e) => { if (e.target === b) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(b);
  b.close = close;
  const first = b.querySelector('input:not([type=hidden]), select, textarea'); if (first) first.focus();
  return b;
}

// ---------- data laden ----------
function rangeBounds() {
  const t = today(), d = new Date();
  switch (state.range) {
    case 'week': return [mondayOf(d), addDays(mondayOf(d), 4)];
    case 'prevweek': { const m = addDays(mondayOf(d), -7); return [m, addDays(m, 4)]; }
    case 'month': return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
    case 'prevmonth': return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))];
    case 'all': return ['', ''];
    case 'custom': return [state.rangeFrom || '', state.rangeTo || t];
    default: return ['', ''];
  }
}
const qs = (o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v) p.set(k, v); const s = p.toString(); return s ? '?' + s : ''; };

async function loadUsers() { state.users = await api('/users'); }
async function loadActivities() { state.activities = await api('/activities'); }
async function loadWeek() {
  const uid = currentBoardUserId();
  if (!uid) { state.weekTasks = []; return; }
  state.weekTasks = await api('/tasks' + qs({ user_id: uid, from: state.weekStart, to: addDays(state.weekStart, 4) }));
}
async function loadRange() {
  if (!isManager()) return;
  const [from, to] = rangeBounds();
  const uid = state.tab.startsWith('user:') ? state.tab.slice(5) : '';
  state.rangeTasks = await api('/tasks' + qs({ user_id: uid, from, to }));
}
function currentBoardUserId() {
  if (!state.user) return null;
  if (!isManager()) return state.user.id;
  return state.tab.startsWith('user:') ? Number(state.tab.slice(5)) : null;
}
async function refresh() {
  const jobs = [];
  if (state.tab === 'overview' || state.tab.startsWith('user:') || !isManager()) {
    jobs.push(loadWeek());
    if (isManager()) jobs.push(loadRange());
  }
  await Promise.all(jobs);
  render();
}

// ---------- analyse ----------
const sum = (arr, f) => arr.reduce((a, t) => a + (f(t) || 0), 0);
function analyze(tasks) {
  const done = tasks.filter((t) => t.status === 'done');
  const open = tasks.filter((t) => t.status !== 'done');
  const estDone = sum(done, (t) => t.est_minutes), spent = sum(done, (t) => t.spent_minutes);
  const over = done.filter((t) => t.spent_minutes > t.est_minutes);
  const t0 = today();
  return {
    total: tasks.length, done: done.length, open: open.length,
    overdue: open.filter((t) => t.day < t0).length,
    estAll: sum(tasks, (t) => t.est_minutes), estDone, spent,
    diff: spent - estDone, accuracy: pct(spent, estDone),
    avgSpent: done.length ? spent / done.length : null,
    avgEst: done.length ? estDone / done.length : null,
    completion: pct(done.length, tasks.length),
    overCount: over.length, overRate: pct(over.length, done.length),
    openEst: sum(open, (t) => t.est_minutes),
  };
}
function groupBy(tasks, keyFn) {
  const map = new Map();
  for (const t of tasks) {
    const raw = keyFn(t); const key = raw.trim().toLowerCase() || '(geen)';
    if (!map.has(key)) map.set(key, { label: raw.trim() || '(geen)', tasks: [] });
    map.get(key).tasks.push(t);
  }
  return [...map.values()].map((g) => ({ label: g.label, ...analyze(g.tasks) }));
}
const diffClass = (d) => (d > 0 ? 'over' : d < 0 ? 'under' : '');

function kpiHtml(a) {
  return `<div class="kpis">
    <div class="kpi"><div class="l">Taken totaal</div><div class="v">${a.total}</div><div class="s muted">${a.done} afgerond · ${a.open} open</div></div>
    <div class="kpi"><div class="l">Afgerond</div><div class="v">${fmtPct(a.completion)}</div><div class="s ${a.overdue ? 'over' : 'muted'}">${a.overdue} achterstallig</div></div>
    <div class="kpi"><div class="l">Verwachte tijd (afgerond)</div><div class="v">${fmtMin(a.estDone)}</div><div class="s muted">alle taken: ${fmtMin(a.estAll)}</div></div>
    <div class="kpi"><div class="l">Bestede tijd</div><div class="v">${fmtMin(a.spent)}</div><div class="s muted">gem. ${fmtMin(a.avgSpent)} per taak</div></div>
    <div class="kpi"><div class="l">Afwijking</div><div class="v ${diffClass(a.diff)}">${a.done ? fmtDiff(a.diff) : '–'}</div><div class="s muted">${a.done ? (a.diff > 0 ? 'langer dan verwacht' : a.diff < 0 ? 'sneller dan verwacht' : 'precies volgens plan') : ''}</div></div>
    <div class="kpi"><div class="l">Inschattingsnauwkeurigheid</div><div class="v">${fmtPct(a.accuracy)}</div><div class="s muted">besteed / verwacht</div></div>
    <div class="kpi"><div class="l">Taken over de planning</div><div class="v">${a.overCount}</div><div class="s muted">${fmtPct(a.overRate)} van afgerond</div></div>
    <div class="kpi"><div class="l">Nog open (verwacht)</div><div class="v">${fmtMin(a.openEst)}</div><div class="s muted">${a.open} taken</div></div>
  </div>`;
}
function groupTable(rows, firstCol) {
  if (!rows.length) return '<div class="empty">Geen gegevens in deze periode</div>';
  rows.sort((a, b) => b.spent - a.spent || b.total - a.total);
  return `<div class="table-wrap"><table><thead><tr><th>${firstCol}</th><th class="num">Taken</th><th class="num">Afgerond</th>
    <th class="num">Gem. verwacht</th><th class="num">Gem. besteed</th><th class="num">Totaal besteed</th><th class="num">Afwijking</th><th class="num">Nauwkeurigheid</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td class="wrap">${esc(r.label)}</td><td class="num">${r.total}</td><td class="num">${r.done}</td>
      <td class="num">${fmtMin(r.avgEst)}</td><td class="num">${fmtMin(r.avgSpent)}</td><td class="num">${fmtMin(r.spent)}</td>
      <td class="num ${diffClass(r.diff)}">${r.done ? fmtDiff(r.diff) : '–'}</td><td class="num">${fmtPct(r.accuracy)}</td></tr>`).join('')}
    </tbody></table></div>`;
}
function barChart(rows, labelKey = 'label') {
  const data = rows.filter((r) => r.estDone || r.spent);
  if (!data.length) return '<div class="empty">Nog geen afgeronde taken in deze periode</div>';
  const max = Math.max(...data.map((r) => Math.max(r.estDone, r.spent)), 1);
  return `<div class="legend"><span><i style="background:var(--est)"></i>Verwacht</span><span><i style="background:var(--spent)"></i>Besteed</span></div>
    <div class="bars">${data.map((r) => `<div class="bar-row"><div class="bar-label" title="${esc(r[labelKey])}">${esc(r[labelKey])}</div>
      <div class="bar-pair">
        <div class="row" style="gap:6px;flex-wrap:nowrap"><div class="bar est" style="width:${(r.estDone / max) * 100}%"></div><span class="bar-val">${fmtMin(r.estDone)}</span></div>
        <div class="row" style="gap:6px;flex-wrap:nowrap"><div class="bar spent" style="width:${(r.spent / max) * 100}%"></div><span class="bar-val">${fmtMin(r.spent)}</span></div>
      </div></div>`).join('')}</div>`;
}
function taskTable(tasks, showUser) {
  if (!tasks.length) return '<div class="empty">Geen taken in deze periode</div>';
  const rows = [...tasks].sort((a, b) => b.day.localeCompare(a.day) || b.id - a.id);
  return `<div class="table-wrap"><table><thead><tr><th>Datum</th>${showUser ? '<th>Medewerker</th>' : ''}<th>Activiteit</th><th>Klant/reden</th><th>Opmerkingen</th>
    <th class="num">Verwacht</th><th class="num">Besteed</th><th class="num">Afwijking</th><th>Status</th></tr></thead><tbody>
    ${rows.map((t) => { const d = t.status === 'done' ? t.spent_minutes - t.est_minutes : null;
      return `<tr><td>${DAYS_SHORT[weekdayIdx(t.day)]} ${fmtDay(t.day)}</td>${showUser ? `<td>${esc((userById(t.user_id) || {}).name || t.user_id)}</td>` : ''}
      <td>${esc(t.activity)}</td><td class="wrap">${esc(t.customer)}</td><td class="wrap">${esc(t.notes)}</td>
      <td class="num">${fmtMin(t.est_minutes)}</td><td class="num">${t.status === 'done' ? fmtMin(t.spent_minutes) : '–'}</td>
      <td class="num ${d === null ? '' : diffClass(d)}">${d === null ? '–' : fmtDiff(d)}</td>
      <td>${t.status === 'done' ? 'Afgerond' : t.day < today() ? '<span class="badge warn">Achterstallig</span>' : 'Open'}</td></tr>`; }).join('')}
    </tbody></table></div>`;
}
function weekdayRows(tasks) {
  return DAYS.map((name, i) => ({ label: name, ...analyze(tasks.filter((t) => weekdayIdx(t.day) === i)) }));
}

function rangeBar() {
  const opts = [['week', 'Deze week'], ['prevweek', 'Vorige week'], ['month', 'Deze maand'], ['prevmonth', 'Vorige maand'], ['all', 'Alles'], ['custom', 'Aangepast']];
  const [from, to] = rangeBounds();
  return `<div class="row">
    <label>Periode<select id="range">${opts.map(([v, l]) => `<option value="${v}"${state.range === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    ${state.range === 'custom' ? `<label>Van<input type="date" id="rangeFrom" value="${esc(state.rangeFrom)}"></label><label>Tot en met<input type="date" id="rangeTo" value="${esc(state.rangeTo)}"></label>` : ''}
    <span class="muted small" style="align-self:end;padding-bottom:9px">${from ? `${fmtDayFull(from)} – ${fmtDayFull(to || today())}` : 'Alle data'}</span>
    <button class="btn" data-act="export" style="margin-left:auto;align-self:end">Exporteer CSV</button>
  </div>`;
}

function overviewHtml() {
  const tasks = state.rangeTasks;
  const a = analyze(tasks);
  const perUser = employees().map((u) => ({ label: u.name, ...analyze(tasks.filter((t) => t.user_id === u.id)) }));
  const perActivity = groupBy(tasks, (t) => t.activity);
  const perCustomer = groupBy(tasks, (t) => t.customer).sort((x, y) => y.total - x.total).slice(0, 15);
  return `<div class="stack">
    <div class="card">${rangeBar()}</div>
    ${kpiHtml(a)}
    <div class="card"><h2>Per medewerker</h2>${groupTable(perUser, 'Medewerker')}</div>
    <div class="grid2">
      <div class="card"><h2>Tijd per activiteit</h2>${barChart(perActivity)}</div>
      <div class="card"><h2>Verwacht vs. besteed per weekdag</h2>${barChart(weekdayRows(tasks))}</div>
    </div>
    <div class="card"><h2>Per activiteit</h2>${groupTable(perActivity, 'Activiteit')}</div>
    <div class="card"><h2>Top klanten / redenen</h2>${groupTable(perCustomer, 'Klant/reden')}</div>
    <div class="card"><h2>Alle taken</h2>${taskTable(tasks, true)}</div>
  </div>`;
}

function userAnalysisHtml() {
  const tasks = state.rangeTasks;
  const perActivity = groupBy(tasks, (t) => t.activity);
  const perCustomer = groupBy(tasks, (t) => t.customer).sort((x, y) => y.total - x.total).slice(0, 15);
  return `<div class="stack">
    <h2 style="font-size:18px">Analyse</h2>
    <div class="card">${rangeBar()}</div>
    ${kpiHtml(analyze(tasks))}
    <div class="grid2">
      <div class="card"><h2>Tijd per activiteit</h2>${barChart(perActivity)}</div>
      <div class="card"><h2>Verwacht vs. besteed per weekdag</h2>${barChart(weekdayRows(tasks))}</div>
    </div>
    <div class="card"><h2>Per activiteit</h2>${groupTable(perActivity, 'Activiteit')}</div>
    <div class="card"><h2>Per klant / reden</h2>${groupTable(perCustomer, 'Klant/reden')}</div>
    <div class="card"><h2>Alle taken</h2>${taskTable(tasks, false)}</div>
  </div>`;
}

// ---------- weekbord ----------
function boardHtml(ownerId) {
  const week = [0, 1, 2, 3, 4].map((i) => addDays(state.weekStart, i));
  const t0 = today();
  const a = analyze(state.weekTasks);
  const isCurrent = state.weekStart === mondayOf(new Date());
  return `
    <div class="weekbar">
      <button class="btn" data-act="prevWeek" aria-label="Vorige week">←</button>
      <button class="btn" data-act="thisWeek"${isCurrent ? ' disabled' : ''}>Deze week</button>
      <button class="btn" data-act="nextWeek" aria-label="Volgende week">→</button>
      <span class="title">Week ${weekNumber(state.weekStart)} · ${fmtDay(week[0])} – ${fmtDayFull(week[4])}</span>
      <span class="muted small">${a.done}/${a.total} afgerond · verwacht ${fmtMin(a.estAll)} · besteed ${fmtMin(a.spent)}</span>
    </div>
    <div class="week">${week.map((day, i) => {
      const tasks = state.weekTasks.filter((t) => t.day === day);
      const s = analyze(tasks);
      return `<section class="day${day === t0 ? ' today' : ''}">
        <div class="day-head"><strong>${DAYS[i]} <span class="muted" style="font-weight:400">${fmtDay(day)}</span></strong></div>
        <div class="day-sum">${tasks.length ? `${s.done}/${s.total} klaar · ${fmtMin(s.estAll)} gepland${s.done ? ` · ${fmtMin(s.spent)} besteed` : ''}` : 'Geen taken'}</div>
        ${tasks.map((t) => taskCard(t, ownerId)).join('')}
        <button class="add-task" data-act="add" data-day="${day}">+ Taak toevoegen</button>
      </section>`;
    }).join('')}</div>`;
}
function taskCard(t, ownerId) {
  const done = t.status === 'done';
  const d = done ? t.spent_minutes - t.est_minutes : 0;
  const overdue = !done && t.day < today();
  const canDelete = isManager() || !t.by_manager;
  return `<div class="task${done ? ' done' : ''}${overdue ? ' overdue' : ''}" data-id="${t.id}">
    <button class="check" data-act="toggle" title="${done ? 'Heropenen' : 'Afronden'}" aria-label="${done ? 'Heropenen' : 'Afronden'}"></button>
    <div class="t-title">${esc(t.activity)}</div>
    ${t.customer ? `<div class="t-cust">${esc(t.customer)}</div>` : ''}
    ${t.notes ? `<div class="t-notes">${esc(t.notes)}</div>` : ''}
    <div class="t-times"><span>Verwacht ${fmtMin(t.est_minutes)}</span>${done ? `<span>Besteed ${fmtMin(t.spent_minutes)}</span><span class="${diffClass(d)}">${d ? fmtDiff(d) : '✓ op schema'}</span>` : ''}
      ${t.by_manager ? '<span class="badge">Van manager</span>' : ''}${overdue ? '<span class="badge warn">Achterstallig</span>' : ''}</div>
    <div class="t-actions"><button class="btn small ghost" data-act="edit">Bewerken</button>${canDelete ? '<button class="btn small ghost danger" data-act="delete">Verwijderen</button>' : ''}</div>
  </div>`;
}

// ---------- taak-dialogen ----------
function taskDialog(task, day, ownerId) {
  const editing = !!task;
  const t = task || { day, activity: '', customer: '', notes: '', est_minutes: null, spent_minutes: null, status: 'open' };
  const week = [0, 1, 2, 3, 4].map((i) => addDays(state.weekStart, i));
  if (!week.includes(t.day)) week.push(t.day);
  const names = state.activities.map((a) => a.name);
  const known = names.some((n) => n.toLowerCase() === t.activity.toLowerCase());
  const owner = userById(ownerId);
  const m = openModal(`
    <h2>${editing ? 'Taak bewerken' : 'Nieuwe taak'}${isManager() && owner ? ` <span class="muted" style="font-weight:400">· ${esc(owner.name)}</span>` : ''}</h2>
    <form class="form-grid" autocomplete="off">
      <label>Dag<select name="day">${week.map((d) => `<option value="${d}"${d === t.day ? ' selected' : ''}>${DAYS[weekdayIdx(d)]} ${fmtDay(d)}</option>`).join('')}</select></label>
      <label>Activiteit<select name="activity">
        ${!editing ? '<option value="" disabled selected>Kies een activiteit…</option>' : ''}
        ${names.map((n) => `<option${known && n.toLowerCase() === t.activity.toLowerCase() ? ' selected' : ''}>${esc(n)}</option>`).join('')}
        ${editing && !known ? `<option selected>${esc(t.activity)}</option>` : ''}
        <option value="__new__">+ Nieuwe activiteit toevoegen…</option></select></label>
      <label id="newAct" hidden>Naam nieuwe activiteit (wordt opgeslagen in de lijst)<input name="newActivity" maxlength="100"></label>
      <label>Klant / reden<input name="customer" maxlength="200" value="${esc(t.customer)}"></label>
      <label>Opmerkingen<textarea name="notes" maxlength="2000">${esc(t.notes)}</textarea></label>
      <label>Verwachte tijd${timeFields('est', t.est_minutes)}</label>
      ${editing ? `<div class="form-grid cols2">
        <label>Status<select name="status"><option value="open"${t.status === 'open' ? ' selected' : ''}>Open</option><option value="done"${t.status === 'done' ? ' selected' : ''}>Afgerond</option></select></label>
        <label>Bestede tijd${timeFields('spent', t.spent_minutes)}</label></div>` : ''}
      <div class="error" id="err"></div>
      <div class="actions"><button type="button" class="btn" data-close>Annuleren</button><button class="btn primary">Opslaan</button></div>
    </form>`);
  const form = $('form', m);
  form.elements.activity.addEventListener('change', () => {
    const isNew = form.elements.activity.value === '__new__';
    $('#newAct', m).hidden = !isNew;
    if (isNew) form.elements.newActivity.focus();
  });
  $('[data-close]', m).onclick = m.close;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#err', m);
    let activity = form.elements.activity.value;
    if (activity === '__new__') activity = form.elements.newActivity.value.trim();
    const est = readMinutes(form, 'est');
    if (!activity) { err.textContent = 'Kies een activiteit of vul een nieuwe in'; return; }
    if (est === null || Number.isNaN(est) || est < 1) { err.textContent = 'Vul een verwachte tijd in'; return; }
    const body = { day: form.elements.day.value, activity, customer: form.elements.customer.value, notes: form.elements.notes.value, est_minutes: est };
    if (editing) {
      const spent = readMinutes(form, 'spent');
      if (Number.isNaN(spent)) { err.textContent = 'Bestede tijd is ongeldig'; return; }
      body.status = form.elements.status.value; body.spent_minutes = spent;
      if (body.status === 'done' && spent === null) { err.textContent = 'Vul de bestede tijd in om af te ronden'; return; }
    } else if (isManager()) body.user_id = ownerId;
    try {
      await api(editing ? `/tasks/${t.id}` : '/tasks', { method: editing ? 'PATCH' : 'POST', body });
      m.close();
      await Promise.all([loadActivities(), refresh()]);
    } catch (ex) { err.textContent = ex.message; }
  });
}
function completeDialog(task) {
  const m = openModal(`
    <h2>Taak afronden</h2>
    <p style="margin:0 0 12px"><strong>${esc(task.activity)}</strong>${task.customer ? ` · ${esc(task.customer)}` : ''}<br><span class="muted small">Verwacht: ${fmtMin(task.est_minutes)}</span></p>
    <form class="form-grid" autocomplete="off">
      <label>Hoeveel tijd heb je eraan besteed?${timeFields('spent', task.spent_minutes ?? task.est_minutes)}</label>
      <div class="error" id="err"></div>
      <div class="actions"><button type="button" class="btn" data-close>Annuleren</button><button class="btn primary">Afronden</button></div>
    </form>`);
  $('[data-close]', m).onclick = m.close;
  $('form', m).addEventListener('submit', async (e) => {
    e.preventDefault();
    const spent = readMinutes(e.target, 'spent');
    if (spent === null || Number.isNaN(spent)) { $('#err', m).textContent = 'Vul de bestede tijd in'; return; }
    try {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status: 'done', spent_minutes: spent } });
      m.close(); await refresh(); toast('Taak afgerond');
    } catch (ex) { $('#err', m).textContent = ex.message; }
  });
}

// ---------- beheer (manager) ----------
function adminHtml() {
  const list = state.users.filter((u) => u.role === 'employee');
  return `<div class="stack">
    <div class="card"><h2>Collega-account aanmaken</h2>
      <form id="newUser" class="form-grid cols2" autocomplete="off">
        <label>Naam<input name="name" required maxlength="80"></label>
        <label>Gebruikersnaam<input name="username" required maxlength="30" pattern="[A-Za-z0-9._\\-]{2,30}" autocapitalize="none"></label>
        <label>Wachtwoord (min. 6 tekens)<input name="password" type="text" required minlength="6" autocomplete="off"></label>
        <div style="align-self:end"><button class="btn primary">Account aanmaken</button></div>
        <div class="error" id="userErr" style="grid-column:1/-1"></div>
      </form></div>
    <div class="card"><h2>Collega's</h2>
      ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Naam</th><th>Gebruikersnaam</th><th>Status</th><th></th></tr></thead><tbody>
        ${list.map((u) => `<tr data-uid="${u.id}"><td>${esc(u.name)}</td><td>${esc(u.username)}</td><td>${u.active ? 'Actief' : '<span class="badge warn">Uitgeschakeld</span>'}</td>
        <td class="right"><button class="btn small" data-act="rename">Naam wijzigen</button> <button class="btn small" data-act="resetpw">Wachtwoord instellen</button>
        <button class="btn small ${u.active ? 'danger' : ''}" data-act="toggleActive">${u.active ? 'Uitschakelen' : 'Activeren'}</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">Nog geen collega\'s. Maak hierboven het eerste account aan.</div>'}
      <p class="muted small" style="margin-bottom:0">Uitgeschakelde collega's kunnen niet meer inloggen; hun taken blijven bewaard in de analyse.</p></div>
    <div class="card"><h2>Activiteiten-lijst</h2>
      <p class="muted small" style="margin-top:0">Collega's kiezen hieruit bij het toevoegen van een taak. Zelf toegevoegde activiteiten komen hier automatisch bij.</p>
      <div class="row">${state.activities.map((a) => `<span class="badge" style="padding:4px 10px;font-size:13px">${esc(a.name)} <button class="btn small ghost danger" style="padding:0 4px" data-act="delActivity" data-id="${a.id}" title="Verwijder uit lijst" aria-label="Verwijder ${esc(a.name)}">×</button></span>`).join('')}</div>
      <form id="newActivity" class="row" style="margin-top:12px"><input name="name" placeholder="Nieuwe activiteit…" maxlength="100" required style="max-width:300px"><button class="btn">Toevoegen</button></form>
    </div></div>`;
}
function promptDialog(title, label, { type = 'text', value = '', action }) {
  const m = openModal(`<h2>${esc(title)}</h2><form class="form-grid"><label>${esc(label)}<input name="v" type="${type}" value="${esc(value)}" required autocomplete="off"></label>
    <div class="error" id="err"></div><div class="actions"><button type="button" class="btn" data-close>Annuleren</button><button class="btn primary">Opslaan</button></div></form>`);
  $('[data-close]', m).onclick = m.close;
  $('form', m).addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await action(e.target.elements.v.value); m.close(); } catch (ex) { $('#err', m).textContent = ex.message; }
  });
}

// ---------- hoofdweergave ----------
function render() {
  const app = $('#app');
  if (state.loading) { app.innerHTML = '<div class="empty">Laden…</div>'; return; }
  if (state.needsSetup) { app.innerHTML = authHtml(true); bindAuth(true); return; }
  if (!state.user) { app.innerHTML = authHtml(false); bindAuth(false); return; }

  let tabs = '', content = '';
  if (isManager()) {
    const visible = employees().filter((u) => u.active || state.tab === 'user:' + u.id);
    tabs = `<nav class="tabs" role="tablist">
      <button class="tab${state.tab === 'overview' ? ' active' : ''}" data-tab="overview">Overzicht &amp; analyse</button>
      ${visible.map((u) => `<button class="tab${state.tab === 'user:' + u.id ? ' active' : ''}${u.active ? '' : ' inactive-user'}" data-tab="user:${u.id}">${esc(u.name)}</button>`).join('')}
      <button class="tab${state.tab === 'admin' ? ' active' : ''}" data-tab="admin" style="margin-left:auto">Beheer</button></nav>`;
    if (state.tab === 'overview') content = overviewHtml();
    else if (state.tab === 'admin') content = adminHtml();
    else {
      const u = userById(state.tab.slice(5));
      content = u ? `<div class="stack"><div><h2 style="font-size:20px;margin-bottom:12px">Takenlijst van ${esc(u.name)}</h2>${boardHtml(u.id)}</div>${userAnalysisHtml()}</div>` : '<div class="empty">Collega niet gevonden</div>';
    }
  } else {
    content = boardHtml(state.user.id);
  }
  app.innerHTML = `<header class="topbar"><h1>A-Gas Teamtaken</h1><span class="muted small">${esc(state.user.name)}${isManager() ? ' (manager)' : ''}</span>
    <button class="btn small" data-act="logout">Uitloggen</button></header>
    <main class="container">${!isManager() ? '<h2 style="font-size:20px;margin-bottom:12px">Mijn takenlijst</h2>' : ''}${tabs}${content}</main>`;
}
function authHtml(setup) {
  return `<div class="auth"><div class="card"><h1>A-Gas Teamtaken</h1>
    <p class="muted" style="margin-top:0">${setup ? 'Eerste keer opstarten: maak het manager-account aan.' : 'Log in om je takenlijst te zien.'}</p>
    <form id="authForm" class="form-grid">
      ${setup ? '<label>Jouw naam<input name="name" required maxlength="80"></label>' : ''}
      <label>Gebruikersnaam<input name="username" required autocapitalize="none" autocomplete="username"></label>
      <label>Wachtwoord<input name="password" type="password" required minlength="${setup ? 6 : 1}" autocomplete="${setup ? 'new-password' : 'current-password'}"></label>
      <div class="error" id="err"></div>
      <button class="btn primary">${setup ? 'Account aanmaken' : 'Inloggen'}</button>
    </form></div></div>`;
}
function bindAuth(setup) {
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    try {
      await api(setup ? '/setup' : '/login', { method: 'POST', body: { name: f.name?.value, username: f.username.value, password: f.password.value } });
      await boot();
    } catch (ex) { $('#err').textContent = ex.message; }
  });
}

// ---------- events ----------
document.addEventListener('click', async (e) => {
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) { state.tab = tabBtn.dataset.tab; await refresh(); return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  const card = el.closest('.task');
  const task = card && state.weekTasks.find((t) => t.id === Number(card.dataset.id));
  try {
    switch (act) {
      case 'logout': await api('/logout', { method: 'POST' }); state.user = null; state.tab = 'overview'; render(); break;
      case 'prevWeek': state.weekStart = addDays(state.weekStart, -7); await refresh(); break;
      case 'nextWeek': state.weekStart = addDays(state.weekStart, 7); await refresh(); break;
      case 'thisWeek': state.weekStart = mondayOf(new Date()); await refresh(); break;
      case 'add': taskDialog(null, el.dataset.day, currentBoardUserId()); break;
      case 'edit': if (task) taskDialog(task, task.day, task.user_id); break;
      case 'toggle':
        if (!task) break;
        if (task.status === 'done') { await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status: 'open', spent_minutes: null } }); await refresh(); }
        else completeDialog(task);
        break;
      case 'delete':
        if (task && confirm(`"${task.activity}" verwijderen?`)) { await api(`/tasks/${task.id}`, { method: 'DELETE' }); await refresh(); }
        break;
      case 'export': exportCsv(); break;
      case 'delActivity':
        if (confirm('Deze activiteit uit de lijst verwijderen? Bestaande taken behouden hun activiteit.')) { await api(`/activities/${el.dataset.id}`, { method: 'DELETE' }); await loadActivities(); render(); }
        break;
      case 'rename': case 'resetpw': case 'toggleActive': {
        const u = userById(el.closest('tr').dataset.uid);
        if (act === 'rename') promptDialog(`Naam wijzigen`, 'Naam', { value: u.name, action: async (v) => { await api(`/users/${u.id}`, { method: 'PATCH', body: { name: v } }); await loadUsers(); render(); } });
        else if (act === 'resetpw') promptDialog(`Wachtwoord instellen voor ${u.name}`, 'Nieuw wachtwoord (min. 6 tekens)', { action: async (v) => { await api(`/users/${u.id}`, { method: 'PATCH', body: { password: v } }); toast('Wachtwoord gewijzigd'); } });
        else if (confirm(u.active ? `${u.name} uitschakelen? Deze collega kan dan niet meer inloggen.` : `${u.name} weer activeren?`)) { await api(`/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }); await loadUsers(); render(); }
        break;
      }
    }
  } catch (ex) { toast(ex.message); }
});
document.addEventListener('change', async (e) => {
  if (e.target.id === 'range' || e.target.id === 'rangeFrom' || e.target.id === 'rangeTo') {
    if (e.target.id === 'range') state.range = e.target.value;
    if (e.target.id === 'rangeFrom') state.rangeFrom = e.target.value;
    if (e.target.id === 'rangeTo') state.rangeTo = e.target.value;
    await loadRange(); render();
  }
});
document.addEventListener('submit', async (e) => {
  if (e.target.id === 'newUser') {
    e.preventDefault(); const f = e.target.elements;
    try {
      const u = await api('/users', { method: 'POST', body: { name: f.name.value, username: f.username.value, password: f.password.value } });
      await loadUsers(); render(); toast(`Account voor ${u.name} aangemaakt`);
    } catch (ex) { $('#userErr').textContent = ex.message; }
  }
  if (e.target.id === 'newActivity') {
    e.preventDefault();
    try { await api('/activities', { method: 'POST', body: { name: e.target.elements.name.value } }); await loadActivities(); render(); }
    catch (ex) { toast(ex.message); }
  }
});

function exportCsv() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Datum', 'Weekdag', 'Medewerker', 'Activiteit', 'Klant/reden', 'Opmerkingen', 'Verwacht (min)', 'Besteed (min)', 'Afwijking (min)', 'Status'];
  const lines = state.rangeTasks.map((t) => [t.day, DAYS[weekdayIdx(t.day)], (userById(t.user_id) || {}).name, t.activity, t.customer, t.notes,
    t.est_minutes, t.status === 'done' ? t.spent_minutes : '', t.status === 'done' ? t.spent_minutes - t.est_minutes : '', t.status === 'done' ? 'Afgerond' : 'Open'].map(q).join(';'));
  const blob = new Blob(['﻿' + [head.map(q).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `a-gas-teamtaken-${today()}.csv`; a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- start ----------
async function boot() {
  state.loading = true; render();
  try {
    const me = await api('/me');
    state.needsSetup = me.needsSetup; state.user = me.user;
    if (state.user) {
      await Promise.all([loadUsers(), loadActivities()]);
      if (isManager()) state.tab = 'overview';
      await refresh();
    }
  } catch (ex) { toast(ex.message); }
  state.loading = false; render();
}
boot();
