const $ = id => document.getElementById(id);
const t2m = t => { if(!t) return null; const [h,m] = t.split(':').map(Number); return h*60+m; };
const m2t = m => { m = Math.round(m); if(m < 0) m = 0; const hh = Math.floor(m/60)%24; const mm = m%60; return String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0'); };
const ceil15 = m => Math.max(15, Math.ceil(m/15)*15);
const round15 = m => Math.round(m/15)*15;
const floor15 = m => Math.floor(m/15)*15;
const ceil15x = m => Math.ceil(m/15)*15;
const minutesToHoursStr = m => (m/60).toFixed(2);
const escHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const load = (k,d)=>{ try{ return JSON.parse(localStorage.getItem(k)) ?? d } catch(e){ return d } };
const save = (k,v)=>localStorage.setItem(k,JSON.stringify(v));

// ---- State ----
let tasks = load('asdp_tasks', [{ name:'İş 1', hours:5.0 },{ name:'İş 2', hours:2.0 }]);
let technicians = load('asdp_techs', ['Teknisyen 1','Teknisyen 2','Teknisyen 3']);
let techRoles = load('asdp_techRoles', []);
let headTech = localStorage.getItem('asdp_head') || 'S. KARACAK';
let shiftStart = localStorage.getItem('asdp_shiftStart') || '11:45';
let shiftEnd = localStorage.getItem('asdp_shiftEnd') || '19:45';
let breakStart = localStorage.getItem('asdp_breakStart') || '';
let breakEnd = localStorage.getItem('asdp_breakEnd') || '';
let teaBreakStart = localStorage.getItem('asdp_teaBreakStart') || '';
let teaBreakEnd = localStorage.getItem('asdp_teaBreakEnd') || '';
let headBlocks = load('asdp_headBlocks', [{start: '', end: ''}]);
let techBlocks = load('asdp_techBlocks', []);
let programNote = localStorage.getItem('asdp_programNote') || '';
let planMode = localStorage.getItem('asdp_planMode') || 'all';

const tasksDiv = $('tasks'), techsDiv = $('techs'), headBlocksDiv = $('headBlocks'), techBlocksDiv = $('techBlocks'), resultsDiv = $('results');
const tasksStatDiv = $('tasksStat'), techsStatDiv = $('techsStat'), dupeWarnDiv = $('dupeWarn');
const mainContainer = $('container');

// ---- Normalisation ----
function normalizeTechBlocks(){
  if (!Array.isArray(techBlocks)) techBlocks = [];
  while (techBlocks.length < technicians.length) techBlocks.push([]);
  if (techBlocks.length > technicians.length) techBlocks = techBlocks.slice(0, technicians.length);
  techBlocks = techBlocks.map(list => Array.isArray(list) ? list : []);
  save('asdp_techBlocks', techBlocks);
}
function normalizeTechRoles(){
  if (!Array.isArray(techRoles)) techRoles = [];
  while (techRoles.length < technicians.length) techRoles.push('regular');
  if (techRoles.length > technicians.length) techRoles = techRoles.slice(0, technicians.length);
  techRoles = techRoles.map(r => (r === 'supervisor' || r === 'qualified' || r === 'regular') ? r : 'regular');
  save('asdp_techRoles', techRoles);
}

function applyModeUI(){
  document.body.classList.toggle('mode-all', planMode === 'all');
  document.body.classList.toggle('mode-group', planMode === 'group');
  document.querySelectorAll('input[name="planMode"]').forEach(r => r.checked = (r.value === planMode));
  document.querySelectorAll('#modeRow label').forEach(l => l.classList.toggle('active', l.dataset.mode === planMode));
  $('modeSummaryNote').textContent = (planMode === 'all') ? 'Mevcut: Supervisor ALL' : 'Mevcut: Supervisor Grup';
  const desc = $('modeDescription');
  if (planMode === 'all') {
    desc.innerHTML = 'Klasik mod: tek B1 teknisyen tüm işlerin sonunda 15dk onay süresi alır. Mevcut çalışma sistemi korunur.';
  } else {
    desc.innerHTML = 'Süpervizör grup modu — 3 rol:<br>' +
      '• <strong>Supervisor</strong>: hem iş yapar hem aynı saatte çalışan Teknisyenleri denetler. Bir Supervisor aynı saatlerde birden fazla Teknisyene denetim yapabilir; bir Teknisyene farklı zamanlarda birden fazla Supervisor da denetim yapabilir.<br>' +
      '• <strong>Kalifiyeli</strong>: tek başına çalışabilir, denetim aramaz, denetleme yapmaz.<br>' +
      '• <strong>Teknisyen</strong>: yalnızca en az bir Supervisor’ün çalıştığı saatlerde iş alabilir.';
  }
}

function updateShiftSummary(){
  const ss = $('shiftStart').value || '—';
  const se = $('shiftEnd').value || '—';
  const bs = $('breakStart').value;
  const be = $('breakEnd').value;
  const ts = $('teaBreakStart').value;
  const te = $('teaBreakEnd').value;
  let breakStr = '';
  if (bs && be) breakStr += ` | Yemek ${bs}-${be}`;
  if (ts && te) breakStr += ` | Çay ${ts}-${te}`;
  $('shiftSummary').textContent = `${ss} → ${se}${breakStr}`;
}
function updateB1Summary(){
  $('b1Summary').textContent = ($('headTech').value || '—');
}
function updateBusySummary(){
  let count = 0;
  (techBlocks || []).forEach(arr => count += (arr || []).length);
  $('busySummary').textContent = count > 0 ? `${count} blok tanımlı` : 'tanımlı yok';
}

// ---- Renderers ----
function renderTechBlockSelect(){
  const sel = $('techBlockSelect');
  if(!sel) return;
  const current = sel.value;
  sel.innerHTML = technicians.map((name, i) => `<option value="${i}">${escHtml(name || ('Teknisyen ' + (i+1)))}</option>`).join('');
  if(current !== '' && +current < technicians.length) sel.value = current;
}

function renderTechBlocks(){
  normalizeTechBlocks();
  renderTechBlockSelect();
  techBlocksDiv.innerHTML = '';
  technicians.forEach((name, techIndex) => {
    const blocks = techBlocks[techIndex] || [];
    if(blocks.length === 0) return;
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '8px';
    wrap.innerHTML = `<div style="color:var(--muted);margin:6px 0"><strong>${escHtml(name)}</strong></div>`;
    blocks.forEach((b, blockIndex) => {
      const row = document.createElement('div');
      row.className = 'input-group';
      row.innerHTML = `
        <input type="time" data-tech-i="${techIndex}" data-block-i="${blockIndex}" data-field="techblock-start" value="${b.start || ''}">
        <input type="time" data-tech-i="${techIndex}" data-block-i="${blockIndex}" data-field="techblock-end" value="${b.end || ''}">
        <button class="btn-del" data-deltechblock="${techIndex}:${blockIndex}" style="padding:8px 10px">×</button>
      `;
      wrap.appendChild(row);
    });
    techBlocksDiv.appendChild(wrap);
  });
  updateBusySummary();
}

function checkDuplicateTaskNames(){
  const counts = new Map();
  tasks.forEach((t, i) => {
    const key = (t.name || '').trim().toLowerCase();
    if (!key) return;
    if (!counts.has(key)) counts.set(key, []);
    counts.get(key).push({ name: t.name, idx: i });
  });
  const dupes = [];
  counts.forEach((arr) => { if (arr.length > 1) dupes.push(arr); });
  return dupes;
}

function renderDupeWarning(){
  const dupes = checkDuplicateTaskNames();
  if (dupes.length === 0) {
    dupeWarnDiv.innerHTML = '';
    return false;
  }
  const items = dupes.map(group => {
    const indices = group.map(g => '#' + (g.idx + 1)).join(', ');
    return `<div>• <strong>${escHtml(group[0].name)}</strong> – ${group.length} kez (${indices})</div>`;
  }).join('');
  dupeWarnDiv.innerHTML = `<div class="warning"><strong>⛔ Mükerrer İş İsmi Var</strong><br><div class="small" style="color:var(--danger);margin-top:6px">Aşağıdaki isim(ler) birden fazla kez kullanılmış. Düzeltmeden plan oluşturulamaz:</div>${items}</div>`;
  return true;
}

function renderTasks(){
  tasksDiv.innerHTML = '';
  tasks.forEach((t,i)=>{
    const row = document.createElement('div'); row.className = 'input-group';
    row.innerHTML = `
      <input type="text" data-i="${i}" data-field="name" value="${escHtml(t.name)}">
      <input type="number" step="0.25" min="0" data-i="${i}" data-field="hours" value="${t.hours}">
      <label class="open-toggle" title="OPEN iş: önce zorunlu işler yerleşir; bu iş kalan boş zamanları doldurmak için kullanılır."><input type="checkbox" data-i="${i}" data-field="openTask" ${t.open ? 'checked' : ''}> OPEN</label>
      <button class="btn-del" data-del="${i}">×</button>
    `;
    tasksDiv.appendChild(row);
  });
  save('asdp_tasks', tasks);
  updateTasksStat();
  renderDupeWarning();
}

function renderTechs(){
  normalizeTechRoles();
  techsDiv.innerHTML = '';
  technicians.forEach((t,i)=>{
    const role = techRoles[i] || 'regular';
    const row = document.createElement('div'); row.className = 'input-group';
    row.innerHTML = `
      <input type="text" data-i="${i}" data-field="tech" value="${escHtml(t)}">
      <select class="role-select group-only" data-i="${i}" data-field="techRole">
        <option value="supervisor"${role==='supervisor'?' selected':''}>Supervisor</option>
        <option value="qualified"${role==='qualified'?' selected':''}>Kalifiyeli</option>
        <option value="regular"${role==='regular'?' selected':''}>Teknisyen</option>
      </select>
      <button class="btn-del" data-deltech="${i}">×</button>
    `;
    techsDiv.appendChild(row);
  });
  save('asdp_techs', technicians);
  normalizeTechBlocks();
  renderTechBlockSelect();
  updateTechsStat();
}

function renderHeadBlocks(){
  headBlocksDiv.innerHTML = '';
  headBlocks.forEach((b,i)=>{
    const row = document.createElement('div'); row.className = 'input-group';
    row.innerHTML = `
      <input type="time" data-i="${i}" data-field="headblock-start" value="${b.start}">
      <input type="time" data-i="${i}" data-field="headblock-end" value="${b.end}">
      <button class="btn-del" data-delheadblock="${i}" style="padding:8px 10px">×</button>
    `;
    headBlocksDiv.appendChild(row);
  });
  save('asdp_headBlocks', headBlocks);
}

function updateTasksStat(){
  const count = tasks.length;
  const total = tasks.reduce((s,t)=> s + (parseFloat(t.hours)||0), 0);
  const openCount = tasks.filter(t => !!t.open).length;
  tasksStatDiv.innerHTML = `Toplam İş: <strong>${count}</strong> – Toplam Süre (girdi): <strong>${total.toFixed(2)} saat</strong>${openCount ? ` – OPEN: <strong>${openCount}</strong>` : ''}`;
  tasksStatDiv.innerHTML = `Toplam İş: <strong>${count}</strong> – Toplam Saat: <strong>${total.toFixed(2)}</strong>`;
}

function updateTechsStat(){
  const count = technicians.length;
  const totalTaskHours = tasks.reduce((s,t)=> s + (parseFloat(t.hours)||0), 0);
  const avgPerTech = count>0 ? (totalTaskHours / count).toFixed(2) : '0.00';
  let netCapHours = '0.00';
  
  const sReal = t2m($('shiftStart').value);
  const eReal = t2m($('shiftEnd').value);
  if (sReal && eReal && eReal > sReal) {
    let breaks = [];
    const bsReal = t2m($('breakStart').value);
    const beReal = t2m($('breakEnd').value);
    if (bsReal !== null && beReal !== null && beReal > bsReal) breaks.push({ s: bsReal, e: beReal, len: beReal - bsReal });
    const tsReal = t2m($('teaBreakStart').value);
    const teReal = t2m($('teaBreakEnd').value);
    if (tsReal !== null && teReal !== null && teReal > tsReal) breaks.push({ s: tsReal, e: teReal, len: teReal - tsReal });
    breaks.sort((a,b)=>a.s - b.s);

    const totalBreakLen = breaks.reduce((sum, b) => sum + b.len, 0);
    const workEnd = (eReal - sReal) - totalBreakLen;
    
    if (workEnd > 0) {
      function r2w(rm) {
        if(rm < sReal || rm > sReal + workEnd + totalBreakLen) return null;
        let work = rm - sReal;
        for (const b of breaks) {
          if (rm >= b.s && rm < b.e) return null;
          if (rm >= b.e) work -= b.len;
        }
        return work;
      }
      
      let totalCapMin = 0;
      (techBlocks || []).slice(0, count).forEach(blocks => {
        let busy = 0;
        const valid = [];
        (blocks || []).forEach(b => {
          const sr = t2m(b.start), er = t2m(b.end);
          if (sr !== null && er !== null && er > sr) {
            const sw = r2w(sr), ew = r2w(er);
            if (sw !== null && ew !== null && ew > sw) valid.push({s: Math.max(0, sw), e: Math.min(workEnd, ew)});
          }
        });
        valid.sort((a,b)=>a.s-b.s);
        const merged = [];
        for (const v of valid) {
          if (!merged.length || v.s > merged[merged.length-1].e) merged.push({...v});
          else merged[merged.length-1].e = Math.max(merged[merged.length-1].e, v.e);
        }
        merged.forEach(m => busy += (m.e - m.s));
        totalCapMin += Math.max(0, workEnd - busy);
      });
      netCapHours = (totalCapMin / 60).toFixed(2);
    }
  }

  let extra = '';
  if (planMode === 'group') {
    const sup = techRoles.filter(r => r === 'supervisor').length;
    const qua = techRoles.filter(r => r === 'qualified').length;
    const reg = technicians.length - sup - qua;
    extra = `<br><span class="small">Supervisor: <strong>${sup}</strong> – Kalifiyeli: <strong>${qua}</strong> – Teknisyen: <strong>${reg}</strong></span>`;
  }
  techsStatDiv.innerHTML = `Toplam Teknisyen: <strong>${count}</strong> – Ortalama Yük: <strong>${avgPerTech} saat</strong>${extra}`;
  techsStatDiv.innerHTML = `Toplam Teknisyen: <strong>${count}</strong> – Net kapasite: <strong>${netCapHours} saat</strong>${extra}`;
}

// ---- Initial render ----
renderTasks(); renderTechs(); renderHeadBlocks(); renderTechBlocks();
$('headTech').value = headTech;
$('shiftStart').value = shiftStart;
$('shiftEnd').value = shiftEnd;
$('breakStart').value = breakStart;
$('breakEnd').value = breakEnd;
if ($('teaBreakStart')) $('teaBreakStart').value = teaBreakStart;
if ($('teaBreakEnd')) $('teaBreakEnd').value = teaBreakEnd;
applyModeUI();
updateShiftSummary();
updateB1Summary();
updateBusySummary();

// ---- Buttons ----
$('addTask').addEventListener('click', ()=>{ tasks.push({ name:`NRC ${tasks.length+1}`, hours:1.0, open:false }); renderTasks(); });
$('addTech').addEventListener('click', ()=>{ technicians.push(`Teknisyen ${technicians.length+1}`); techBlocks.push([]); techRoles.push('regular'); renderTechs(); renderTechBlocks(); });
$('resetTasks').addEventListener('click', ()=>{ if(confirm('Tüm işleri sıfırlamak?')){ tasks=[]; renderTasks(); }});
$('resetTechs').addEventListener('click', ()=>{ if(confirm('Tüm teknisyenleri sıfırlamak?')){ technicians=[]; techBlocks=[]; techRoles=[]; renderTechs(); renderTechBlocks(); }});
$('clearBreak').addEventListener('click', ()=>{ $('breakStart').value=''; $('breakEnd').value=''; breakStart=''; breakEnd=''; localStorage.removeItem('asdp_breakStart'); localStorage.removeItem('asdp_breakEnd'); updateShiftSummary(); });
if ($('clearTeaBreak')) $('clearTeaBreak').addEventListener('click', ()=>{ $('teaBreakStart').value=''; $('teaBreakEnd').value=''; teaBreakStart=''; teaBreakEnd=''; localStorage.removeItem('asdp_teaBreakStart'); localStorage.removeItem('asdp_teaBreakEnd'); updateShiftSummary(); });
$('addHeadBlock').addEventListener('click', ()=>{ headBlocks.push({start:'', end:''}); renderHeadBlocks(); });
$('addTechBlock').addEventListener('click', ()=>{
  normalizeTechBlocks();
  const techIndex = +$('techBlockSelect').value;
  const start = $('techBlockStart').value;
  const end = $('techBlockEnd').value;
  if (!Number.isFinite(techIndex) || !start || !end || t2m(end) <= t2m(start)) { alert('Geçerli teknisyen, başlangıç ve bitiş saati girin.'); return; }
  techBlocks[techIndex].push({start, end});
  $('techBlockStart').value = '';
  $('techBlockEnd').value = '';
  save('asdp_techBlocks', techBlocks);
  renderTechBlocks();
});

document.querySelectorAll('input[name="planMode"]').forEach(r => r.addEventListener('change', e => {
  planMode = e.target.value;
  localStorage.setItem('asdp_planMode', planMode);
  applyModeUI();
  updateTechsStat();
}));

mainContainer.addEventListener('input', e => {
  const i = +e.target.dataset.i;
  const f = e.target.dataset.field;

  if (f === 'program-note') {
    programNote = e.target.value;
    localStorage.setItem('asdp_programNote', programNote);
    return;
  }

  if (f === 'techblock-start' || f === 'techblock-end') {
    const techIndex = +e.target.dataset.techI;
    const blockIndex = +e.target.dataset.blockI;
    normalizeTechBlocks();
    if (techBlocks[techIndex] && techBlocks[techIndex][blockIndex]) {
      if (f === 'techblock-start') techBlocks[techIndex][blockIndex].start = e.target.value;
      if (f === 'techblock-end') techBlocks[techIndex][blockIndex].end = e.target.value;
      save('asdp_techBlocks', techBlocks);
    }
    return;
  }

  if (!Number.isFinite(i)) return;

  if (f === 'name') tasks[i].name = e.target.value;
  if (f === 'hours') tasks[i].hours = parseFloat(e.target.value) || 0;
  if (f === 'tech') technicians[i] = e.target.value;
  if (f === 'headblock-start') headBlocks[i].start = e.target.value;
  if (f === 'headblock-end') headBlocks[i].end = e.target.value;

  if (f === 'name' || f === 'hours') {
    save('asdp_tasks', tasks);
    updateTasksStat();
    updateTechsStat();
    renderDupeWarning();
  }
  if (f === 'tech') {
    save('asdp_techs', technicians);
    renderTechBlockSelect();
    renderTechBlocks();
    updateTechsStat();
  }
  if (f === 'headblock-start' || f === 'headblock-end') {
    save('asdp_headBlocks', headBlocks);
  }
});

mainContainer.addEventListener('change', e => {
  const f = e.target.dataset.field;
  const i = +e.target.dataset.i;
  if (f === 'openTask' && Number.isFinite(i)) {
    tasks[i].open = !!e.target.checked;
    save('asdp_tasks', tasks);
    updateTasksStat();
    renderDupeWarning();
    return;
  }
  if (f === 'techRole' && Number.isFinite(i)) {
    normalizeTechRoles();
    techRoles[i] = e.target.value;
    save('asdp_techRoles', techRoles);
    updateTechsStat();
  }
});

mainContainer.addEventListener('click', e => {
  const delTask = e.target.closest('[data-del]');
  if(delTask){ tasks.splice(+delTask.dataset.del,1); renderTasks(); return; }

  const delTech = e.target.closest('[data-deltech]');
  if(delTech){
    const idx = +delTech.dataset.deltech;
    technicians.splice(idx,1);
    techBlocks.splice(idx,1);
    if (Array.isArray(techRoles)) techRoles.splice(idx,1);
    save('asdp_techBlocks', techBlocks);
    save('asdp_techRoles', techRoles);
    renderTechs(); renderTechBlocks();
    return;
  }

  const delTechBlock = e.target.closest('[data-deltechblock]');
  if(delTechBlock){
    const [techIndex, blockIndex] = delTechBlock.dataset.deltechblock.split(':').map(Number);
    normalizeTechBlocks();
    if (techBlocks[techIndex]) techBlocks[techIndex].splice(blockIndex, 1);
    save('asdp_techBlocks', techBlocks);
    renderTechBlocks();
    return;
  }

  const delHeadBlock = e.target.closest('[data-delheadblock]');
  if(delHeadBlock){
    if (headBlocks.length > 1) headBlocks.splice(+delHeadBlock.dataset.delheadblock,1);
    else headBlocks = [{start:'', end:''}];
    renderHeadBlocks();
    return;
  }
});

$('shiftStart').addEventListener('input', e=>{ shiftStart = e.target.value; localStorage.setItem('asdp_shiftStart', shiftStart); updateShiftSummary(); });
$('shiftEnd').addEventListener('input', e=>{ shiftEnd = e.target.value; localStorage.setItem('asdp_shiftEnd', shiftEnd); updateShiftSummary(); });
$('breakStart').addEventListener('input', e=>{ breakStart = e.target.value; localStorage.setItem('asdp_breakStart', breakStart); updateShiftSummary(); });
$('breakEnd').addEventListener('input', e=>{ breakEnd = e.target.value; localStorage.setItem('asdp_breakEnd', breakEnd); updateShiftSummary(); });
if ($('teaBreakStart')) $('teaBreakStart').addEventListener('input', e=>{ teaBreakStart = e.target.value; localStorage.setItem('asdp_teaBreakStart', teaBreakStart); updateShiftSummary(); });
if ($('teaBreakEnd')) $('teaBreakEnd').addEventListener('input', e=>{ teaBreakEnd = e.target.value; localStorage.setItem('asdp_teaBreakEnd', teaBreakEnd); updateShiftSummary(); });
$('headTech').addEventListener('input', e=>{ headTech = e.target.value; localStorage.setItem('asdp_head', headTech); updateB1Summary(); });

// ============================================================
// Time helpers
// ============================================================
let _shiftS_real, _breaks = [], _totalBreakLen = 0, _workEnd_offset;

function workToReal(workOffset){
  let real = _shiftS_real + workOffset;
  for (const b of _breaks) {
    if (real >= b.s) real += b.len;
  }
  return real;
}
function realToWork(realMin){
  const shiftEReal = _shiftS_real + _workEnd_offset + _totalBreakLen;
  if(realMin < _shiftS_real || realMin > shiftEReal) return null;
  let work = realMin - _shiftS_real;
  for (const b of _breaks) {
    if(realMin >= b.s && realMin < b.e) return null;
    if(realMin >= b.e) work -= b.len;
  }
  return work;
}

// ============================================================
// Geometry helpers
// ============================================================
function getFreeIntervals(tech){
  tech.segments.sort((a,b) => a.start - b.start);
  const free = [];
  let cursor = 0;
  for (const seg of tech.segments) {
    if (seg.start > cursor) free.push([cursor, seg.start]);
    cursor = Math.max(cursor, seg.end);
  }
  if (cursor < _workEnd_offset) free.push([cursor, _workEnd_offset]);
  return free;
}

function isFreeRange(tech, start, end){
  if (start < 0 || end > _workEnd_offset || end <= start) return false;
  return !tech.segments.some(s => start < s.end && end > s.start);
}

function placeOnTech(tech, duration, taskId, taskName, opts){
  opts = opts || {};
  const coverage = opts.coverage || null;
  const notBefore = Math.max(0, opts.notBefore || 0);
  const free = getFreeIntervals(tech);
  for (const [fs, fe] of free) {
    const gs = Math.max(fs, notBefore);
    if (fe - gs < duration) continue;
    if (!coverage) {
      const s = gs, e = s + duration;
      tech.segments.push({ start: s, end: e, taskId, taskName });
      tech.totalMin += duration;
      return { start: s, end: e };
    }
    for (const [cs, ce] of coverage) {
      const ovlS = Math.max(gs, cs);
      const ovlE = Math.min(fe, ce);
      if (ovlE - ovlS >= duration) {
        const s = ovlS, e = s + duration;
        tech.segments.push({ start: s, end: e, taskId, taskName });
        tech.totalMin += duration;
        return { start: s, end: e };
      }
    }
  }
  return null;
}

function mergeAndRecompute(techObjs) {
  techObjs.forEach((tech) => {
    tech.segments.sort((a,b)=>a.start - b.start);
    const merged = [];
    for(const s of tech.segments){
      if(merged.length === 0) merged.push(s);
      else {
        const last = merged[merged.length-1];
        if(last.taskId === s.taskId && last.end === s.start){
          last.end = s.end;
        } else merged.push(s);
      }
    }
    tech.segments = merged;
    tech.totalMin = tech.segments.reduce((sum,s) => s.taskId === -1 ? sum : sum + (s.end - s.start), 0);
  });
}

function buildSupervisorCoverage(techObjs, roles){
  const intervals = [];
  techObjs.forEach((tech, idx) => {
    if (roles[idx] !== 'supervisor') return;
    tech.segments.forEach(seg => {
      if (seg.taskId !== -1) intervals.push([seg.start, seg.end]);
    });
  });
  if (intervals.length === 0) return [];
  intervals.sort((a,b)=>a[0]-b[0]);
  const merged = [intervals[0].slice()];
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    if (intervals[i][0] <= last[1]) last[1] = Math.max(last[1], intervals[i][1]);
    else merged.push(intervals[i].slice());
  }
  return merged;
}

function findGaps(segStart, segEnd, coverage){
  const gaps = [];
  let cursor = segStart;
  for (const [cs, ce] of coverage) {
    if (ce <= cursor) continue;
    if (cs >= segEnd) break;
    if (cs > cursor) gaps.push([cursor, Math.min(cs, segEnd)]);
    cursor = Math.max(cursor, ce);
    if (cursor >= segEnd) break;
  }
  if (cursor < segEnd) gaps.push([cursor, segEnd]);
  return gaps.filter(g => g[1] > g[0]);
}

function attributeSupervision(segStart, segEnd, techObjs, roles, technicians){
  const events = [];
  techObjs.forEach((tech, idx) => {
    if (roles[idx] !== 'supervisor') return;
    tech.segments.forEach(seg => {
      if (seg.taskId === -1) return;
      const ovlS = Math.max(seg.start, segStart);
      const ovlE = Math.min(seg.end, segEnd);
      if (ovlE > ovlS) events.push({ supName: technicians[idx], start: ovlS, end: ovlE });
    });
  });
  events.sort((a,b)=>a.start-b.start || b.end-a.end);
  const chosen = [];
  let cursor = segStart;
  while (cursor < segEnd) {
    let best = null;
    for (const ev of events) {
      if (ev.start > cursor) break;
      if (ev.end <= cursor) continue;
      if (!best || ev.end > best.end) best = ev;
    }
    if (!best) break;
    chosen.push({ supName: best.supName, start: cursor, end: Math.min(segEnd, best.end) });
    cursor = best.end;
  }
  const merged = [];
  for (const c of chosen) {
    if (merged.length && merged[merged.length-1].supName === c.supName && merged[merged.length-1].end === c.start) {
      merged[merged.length-1].end = c.end;
    } else merged.push({...c});
  }
  return { covered: merged, fullyCovered: cursor >= segEnd, uncoveredFrom: cursor };
}

// ============================================================
// Smart placement helpers (group mode)
// ============================================================
function placeSupervisorSmart(sup, duration, taskId, taskName, techObjs, roles){
  const cov = buildSupervisorCoverage(techObjs, roles);

  for (let i = 0; i < techObjs.length; i++) {
    if (roles[i] !== 'regular') continue;
    const t = techObjs[i];
    for (const seg of t.segments) {
      if (seg.taskId === -1) continue;
      const gaps = findGaps(seg.start, seg.end, cov);
      for (const [gs, ge] of gaps) {
        const useDur = Math.min(duration, floor15(ge - gs));
        if (useDur < 15) continue;
        if (isFreeRange(sup, gs, gs + useDur)) {
          sup.segments.push({ start: gs, end: gs + useDur, taskId, taskName });
          sup.totalMin += useDur;
          return { start: gs, end: gs + useDur };
        }
      }
    }
  }

  const free = getFreeIntervals(sup);
  for (const [fs, fe] of free) {
    if (fe - fs < duration) continue;
    let cursor = fs;
    while (cursor + duration <= fe) {
      const ovl = cov.find(([cs, ce]) => cursor < ce && cursor + duration > cs);
      if (!ovl) {
        sup.segments.push({ start: cursor, end: cursor + duration, taskId, taskName });
        sup.totalMin += duration;
        return { start: cursor, end: cursor + duration };
      }
      cursor = Math.max(cursor + 15, ovl[1]);
    }
  }

  return placeOnTech(sup, duration, taskId, taskName);
}

function repairCoverage(techObjs, roles){
  for (let iter = 0; iter < 300; iter++) {
    const cov = buildSupervisorCoverage(techObjs, roles);
    let target = null;
    for (let i = 0; i < techObjs.length; i++) {
      if (roles[i] !== 'regular') continue;
      const t = techObjs[i];
      for (const seg of t.segments) {
        if (seg.taskId === -1) continue;
        const gaps = findGaps(seg.start, seg.end, cov);
        if (gaps.length > 0) { target = { gap: gaps[0] }; break; }
      }
      if (target) break;
    }
    if (!target) return;
    if (!relocateSupervisorWork(techObjs, roles, target.gap[0], target.gap[1])) return;
  }
}

function relocateSupervisorWork(techObjs, roles, gapStart, gapEnd){
  const slot = Math.min(15, gapEnd - gapStart);
  if (slot < 15) return false;

  for (let i = 0; i < techObjs.length; i++) {
    if (roles[i] !== 'supervisor') continue;
    const sup = techObjs[i];

    if (!isFreeRange(sup, gapStart, gapStart + slot)) continue;

    const movable = sup.segments
      .filter(s => s.taskId !== -1)
      .filter(s => !(s.start < gapStart + slot && s.end > gapStart))
      .sort((a, b) => (a.end - a.start) - (b.end - b.start));

    if (movable.length === 0) continue;

    const seg = movable[0];
    if (seg.end - seg.start < slot) continue;

    const taskId = seg.taskId;
    const taskName = seg.taskName;
    seg.end -= slot;
    if (seg.end <= seg.start) sup.segments = sup.segments.filter(s => s !== seg);
    sup.segments.push({ start: gapStart, end: gapStart + slot, taskId, taskName });
    sup.segments.sort((a,b)=>a.start - b.start);
    return true;
  }
  return false;
}

function ensureNoIdleTech(techObjs, roles, isGroup){
  for (let iter = 0; iter < 200; iter++) {
    const idle = techObjs.find(t => t.totalMin === 0 && t.freeCapacity >= 15);
    if (!idle) return;

    const loaded = techObjs.slice().sort((a, b) => b.totalMin - a.totalMin);
    let donor = null;
    for (const cand of loaded) {
      if (cand === idle) continue;
      if (cand.totalMin < 30) break;
      donor = cand;
      break;
    }
    if (!donor) return;

    const movable = donor.segments
      .filter(s => s.taskId !== -1 && (s.end - s.start) >= 30)
      .sort((a, b) => (a.end - a.start) - (b.end - b.start));
    if (movable.length === 0) return;

    const seg = movable[0];
    const moveSize = 15;

    let result;
    if (isGroup && roles[idle.index] === 'regular') {
      const cov = buildSupervisorCoverage(techObjs, roles);
      result = placeOnTech(idle, moveSize, seg.taskId, seg.taskName, { coverage: cov });
      if (!result) result = placeOnTech(idle, moveSize, seg.taskId, seg.taskName);
    } else {
      result = placeOnTech(idle, moveSize, seg.taskId, seg.taskName);
    }
    if (!result) return;

    seg.end -= moveSize;
    if (seg.end <= seg.start) donor.segments = donor.segments.filter(s => s !== seg);
    donor.totalMin -= moveSize;
  }
}

// ============================================================
// Plan
// ============================================================
$('planBtn').addEventListener('click', ()=>{
  save('asdp_tasks', tasks);
  save('asdp_techs', technicians);
  save('asdp_techRoles', techRoles);
  localStorage.setItem('asdp_shiftStart',$('shiftStart').value||'');
  localStorage.setItem('asdp_shiftEnd',$('shiftEnd').value||'');
  localStorage.setItem('asdp_breakStart',$('breakStart').value||'');
  localStorage.setItem('asdp_breakEnd',$('breakEnd').value||'');
  if($('teaBreakStart')) localStorage.setItem('asdp_teaBreakStart',$('teaBreakStart').value||'');
  if($('teaBreakEnd')) localStorage.setItem('asdp_teaBreakEnd',$('teaBreakEnd').value||'');
  localStorage.setItem('asdp_head',$('headTech').value||'');
  save('asdp_headBlocks', headBlocks);
  save('asdp_techBlocks', techBlocks);
  plan();
});

function plan(){
  resultsDiv.innerHTML = '';

  const dupes = checkDuplicateTaskNames();
  if (dupes.length > 0) {
    renderDupeWarning();
    resultsDiv.innerHTML = `<div class="warning"><strong>⛔ Plan Oluşturulamadı: Mükerrer İş İsmi Var</strong><br>
      <div class="small" style="color:var(--danger);margin-top:6px">İşler listesinde birden fazla aynı isim kullanılmış. Önce isimleri benzersiz hale getirin.</div></div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if(!$('shiftStart').value || !$('shiftEnd').value){ resultsDiv.innerHTML = `<div class="warning">Vardiya başlangıç/bitiş saatlerini girin.</div>`; $('shiftDetails').open = true; return; }
  if(technicians.length === 0){ resultsDiv.innerHTML = `<div class="warning">En az 1 teknisyen olmalı.</div>`; return; }

  if (planMode === 'group') {
    normalizeTechRoles();
    const supervisors = techRoles.filter(r => r === 'supervisor').length;
    if (supervisors === 0) {
      resultsDiv.innerHTML = `<div class="warning">Supervisor Grup modunda en az 1 kişinin rolü <strong>Supervisor</strong> olmalı.</div>`;
      return;
    }
  }

  _shiftS_real = t2m($('shiftStart').value);
  const shiftE_real = t2m($('shiftEnd').value);
  if(shiftE_real <= _shiftS_real){ resultsDiv.innerHTML = `<div class="warning">Vardiya bitiş saati başlangıçtan sonra olmalı.</div>`; return; }

  _breaks = [];
  const bsReal = t2m($('breakStart').value);
  const beReal = t2m($('breakEnd').value);
  if (bsReal !== null && beReal !== null && beReal > bsReal) _breaks.push({ s: bsReal, e: beReal, len: beReal - bsReal });
  const tsReal = t2m($('teaBreakStart')?.value);
  const teReal = t2m($('teaBreakEnd')?.value);
  if (tsReal !== null && teReal !== null && teReal > tsReal) _breaks.push({ s: tsReal, e: teReal, len: teReal - tsReal });
  _breaks.sort((a,b)=>a.s - b.s);

  _totalBreakLen = _breaks.reduce((sum, b) => sum + b.len, 0);
  _workEnd_offset = (shiftE_real - _shiftS_real) - _totalBreakLen;
  if(_workEnd_offset <= 0) { resultsDiv.innerHTML = `<div class="warning">Vardiya çok kısa / mola çok uzun - plan yapılamıyor.</div>`; return; }

  const HEAD_MIN = 15;
  const isGroup = (planMode === 'group');

  function normalizeWorkBlocks(blocks) {
    const valid = [];
    (blocks || []).forEach(block => {
      const s_real = t2m(block.start);
      const e_real = t2m(block.end);
      if (s_real === null || e_real === null || e_real <= s_real) return;
      const s_work = realToWork(s_real);
      const e_work = realToWork(e_real);
      if (s_work !== null && e_work !== null && e_work > s_work) {
        valid.push({ start: Math.max(0, s_work), end: Math.min(_workEnd_offset, e_work) });
      }
    });
    valid.sort((a,b)=>a.start-b.start);
    const merged = [];
    for (const b of valid) {
      if (!merged.length || b.start > merged[merged.length - 1].end) merged.push({...b});
      else merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, b.end);
    }
    return merged;
  }

  normalizeTechBlocks();
  const techBusyBlocks = technicians.map((_, i) => normalizeWorkBlocks(techBlocks[i] || []));
  const techBusyMinutes = techBusyBlocks.map(blocks => blocks.reduce((sum,b)=>sum + (b.end - b.start), 0));
  const techFreeCapacities = techBusyMinutes.map(busy => Math.max(0, _workEnd_offset - busy));
  const totalCapacityMin = techFreeCapacities.reduce((sum, cap) => sum + cap, 0);

  let rawTasks = tasks.map((t, idx) => {
    const inputHours = parseFloat(t.hours) || 0;
    const rawMin = Math.round(inputHours * 60);
    const headAlloc = Math.min(HEAD_MIN, rawMin);
    const techWorkMin = Math.max(0, rawMin - headAlloc);
    return { id: idx, name: t.name, inputHours, rawMin, headAlloc, isOpen: !!t.open,
      techWorkMinOriginal: techWorkMin, techWorkMinBeforeRound: techWorkMin, techWorkMin };
  });

  const mandatoryTechWorkNeeded = rawTasks.filter(t => !t.isOpen).reduce((s, t) => s + t.techWorkMinOriginal, 0);
  const openTechWorkNeeded = rawTasks.filter(t => t.isOpen).reduce((s, t) => s + t.techWorkMinOriginal, 0);
  const totalTechWorkNeeded = mandatoryTechWorkNeeded + openTechWorkNeeded;

  let reductionRatio = 1.0;
  let capacityExceeded = false;
  if (mandatoryTechWorkNeeded > totalCapacityMin && mandatoryTechWorkNeeded > 0) {
    capacityExceeded = true;
    reductionRatio = (totalCapacityMin * 0.95) / mandatoryTechWorkNeeded;
    rawTasks.forEach(task => {
      if (!task.isOpen && task.techWorkMinOriginal > 0) {
        const reduced = Math.max(Math.min(15, task.techWorkMinOriginal),
          Math.round(task.techWorkMinOriginal * reductionRatio));
        task.techWorkMinBeforeRound = reduced;
        task.techWorkMin = reduced;
      }
    });
  }

  const roundingAdjustments = [];
  rawTasks.forEach(task => {
    if (task.techWorkMin <= 0) return;
    if (task.isOpen) {
      task.techWorkMinBeforeRound = task.techWorkMinOriginal;
      task.techWorkMin = Math.max(15, ceil15x(task.techWorkMinOriginal));
      return;
    }
    const before = task.techWorkMin;
    let rounded = round15(before);
    if (rounded === 0 && before > 0) rounded = 15;
    task.techWorkMin = rounded;
    const diff = rounded - task.techWorkMinBeforeRound;
    if (diff !== 0) roundingAdjustments.push({ name: task.name, before: task.techWorkMinBeforeRound, after: rounded, diff });
  });

  const totalAfterRound = rawTasks.reduce((s, t) => s + t.techWorkMin, 0);
  const mandatoryAfterRound = rawTasks.filter(t => !t.isOpen).reduce((s, t) => s + t.techWorkMin, 0);
  if (mandatoryAfterRound > totalCapacityMin) {
    const upRounded = rawTasks.filter(t => !t.isOpen)
      .filter(t => t.techWorkMin > floor15(t.techWorkMinBeforeRound) && t.techWorkMin > 15)
      .sort((a, b) => (b.techWorkMin - b.techWorkMinBeforeRound) - (a.techWorkMin - a.techWorkMinBeforeRound));
    let excess = mandatoryAfterRound - Math.floor(totalCapacityMin * 0.95 / 15) * 15;
    for (const task of upRounded) {
      if (excess <= 0) break;
      const floored = Math.max(15, floor15(task.techWorkMinBeforeRound));
      if (floored < task.techWorkMin) {
        const saved = task.techWorkMin - floored;
        task.techWorkMin = floored;
        excess -= saved;
        const adj = roundingAdjustments.find(a => a.name === task.name);
        if (adj) { adj.after = floored; adj.diff = floored - task.techWorkMinBeforeRound; }
      }
    }
  }

  const techObjs = technicians.map((name, index) => ({
    name, index,
    role: isGroup ? (techRoles[index] || 'regular') : 'all',
    segments: [], totalMin: 0,
    busyMin: techBusyMinutes[index] || 0,
    freeCapacity: techFreeCapacities[index] || 0
  }));
  techBusyBlocks.forEach((blocks, techIndex) => {
    const tech = techObjs[techIndex];
    if (!tech) return;
    blocks.forEach(block => tech.segments.push({ start: block.start, end: block.end, taskId: -1, taskName: 'DOLU' }));
  });

  let tasksCopy = rawTasks.slice();
  const taskSegments = new Map();
  tasksCopy.forEach(t => taskSegments.set(t.id, []));
  const unallocated = [];

  tasksCopy.sort((a, b) => b.techWorkMin - a.techWorkMin);

  function pickCandidates(){
    return techObjs.slice().sort((a, b) => {
      if (a.totalMin !== b.totalMin) return a.totalMin - b.totalMin;
      if ((b.freeCapacity || 0) !== (a.freeCapacity || 0)) return (b.freeCapacity || 0) - (a.freeCapacity || 0);
      return a.index - b.index;
    });
  }

  function scheduleTaskList(taskList, options){
    options = options || {};
    const isOpenFill = !!options.openFill;
    for(const task of taskList){
      const techWork = task.techWorkMin;
      if(techWork === 0) continue;

      let remainingWork = techWork;
      while(remainingWork > 0) {
        let targetBlockSize = isOpenFill ? 15 : Math.max(30, Math.ceil(remainingWork / Math.max(1, technicians.length)));
        targetBlockSize = ceil15x(targetBlockSize);
        let blockSize = Math.min(targetBlockSize, remainingWork);
        blockSize = Math.max(15, round15(blockSize));
        if (blockSize > remainingWork) blockSize = remainingWork;

        const candidates = pickCandidates();
        let placed = false;
        const maxAttempts = isOpenFill ? 1 : 2;
        for(let attempt = 0; attempt < maxAttempts && !placed; attempt++){
          const trySize = (attempt === 0) ? blockSize : Math.max(15, floor15(blockSize * 0.7));
          const finalSize = Math.min(trySize, remainingWork);
          if (finalSize < 15) break;

          for (const tech of candidates) {
            let result;
            if (isGroup && tech.role === 'supervisor') {
              result = placeSupervisorSmart(tech, finalSize, task.id, task.name, techObjs, techRoles);
            } else if (isGroup && tech.role === 'regular') {
              const cov = buildSupervisorCoverage(techObjs, techRoles);
              if (cov.length > 0) result = placeOnTech(tech, finalSize, task.id, task.name, { coverage: cov });
              if (!result && !isOpenFill) result = placeOnTech(tech, finalSize, task.id, task.name);
            } else {
              result = placeOnTech(tech, finalSize, task.id, task.name);
            }
            if (result) {
              taskSegments.get(task.id).push({ techIndex: tech.index, start: result.start, end: result.end });
              remainingWork -= finalSize;
              placed = true;
              break;
            }
          }
        }

        if(!placed && !isOpenFill) {
          const finalSize = Math.min(15, remainingWork);
          const tinyCandidates = pickCandidates();
          for (const tech of tinyCandidates) {
            let result;
            if (isGroup && tech.role === 'supervisor') {
              result = placeSupervisorSmart(tech, finalSize, task.id, task.name, techObjs, techRoles);
            } else if (isGroup && tech.role === 'regular') {
              const cov = buildSupervisorCoverage(techObjs, techRoles);
              if (cov.length > 0) result = placeOnTech(tech, finalSize, task.id, task.name, { coverage: cov });
            } else {
              result = placeOnTech(tech, finalSize, task.id, task.name);
            }
            if (result) {
              taskSegments.get(task.id).push({ techIndex: tech.index, start: result.start, end: result.end });
              remainingWork -= finalSize;
              placed = true;
              break;
            }
          }
        }

        if(!placed) {
          if (!isOpenFill) unallocated.push({ taskId: task.id, task: task.name, minutes: remainingWork, reason: 'Teknisyen kapasitesi doldu; mümkün olan kısım teknisyenlere dağıtıldı' });
          break;
        }
      }
    }
  }

  const mandatoryTasks = tasksCopy.filter(t => !t.isOpen).sort((a, b) => b.techWorkMin - a.techWorkMin);
  const openTasks = tasksCopy.filter(t => t.isOpen).sort((a, b) => a.techWorkMin - b.techWorkMin || a.id - b.id);

  scheduleTaskList(mandatoryTasks, { openFill:false });
  mergeAndRecompute(techObjs);

  if (isGroup) repairCoverage(techObjs, techRoles);
  mergeAndRecompute(techObjs);

  function getTotals(){ return techObjs.map((t,i)=>({ idx:i, total:t.totalMin })); }
  let totals = getTotals();
  let iter = 0;
  while(iter < 200){
    iter++;
    totals.sort((a,b)=>b.total - a.total);
    const maxTech = totals[0], minTech = totals[totals.length-1];
    const diff = maxTech.total - minTech.total;
    if(diff < 30) break;

    const donor = techObjs[maxTech.idx];
    const receiver = techObjs[minTech.idx];

    let transferred = false;
    donor.segments.sort((a,b) => (a.end - a.start) - (b.end - b.start));
    for(let si = 0; si < donor.segments.length; si++){
      const seg = donor.segments[si];
      if (seg.taskId === -1) continue;
      const segDuration = seg.end - seg.start;
      if(segDuration >= 15){
        let transferAmount = floor15(diff / 2);
        if (transferAmount > segDuration) transferAmount = segDuration;
        
        let attempt;
        if (isGroup && receiver.role === 'regular') {
          const cov = buildSupervisorCoverage(techObjs, techRoles);
          attempt = (cov.length > 0) ? placeOnTech(receiver, transferAmount, seg.taskId, seg.taskName, { coverage: cov }) : null;
          if (!attempt) attempt = placeOnTech(receiver, transferAmount, seg.taskId, seg.taskName);
        } else {
          attempt = placeOnTech(receiver, transferAmount, seg.taskId, seg.taskName);
        }
        if(attempt){
          if(segDuration === transferAmount) donor.segments.splice(si, 1);
          else seg.end -= transferAmount;
          donor.totalMin -= transferAmount;
          const arr = taskSegments.get(seg.taskId) || [];
          arr.push({ techIndex: receiver.index, start: attempt.start, end: attempt.end });
          taskSegments.set(seg.taskId, arr);
          transferred = true;
          break;
        }
      }
    }
    if(!transferred) break;
    mergeAndRecompute(techObjs);
    totals = getTotals();
  }
  mergeAndRecompute(techObjs);

  // PADDING PHASE: Equate technicians using up to 10% time extension (min 15m)
  totals = getTotals();
  totals.sort((a,b)=>b.total - a.total);
  const targetTotal = totals[0].total;

  for (let i = 1; i < totals.length; i++) {
    const tech = techObjs[totals[i].idx];
    let deficit = targetTotal - tech.totalMin;
    while (deficit >= 15) {
      let padded = false;
      for (let si = 0; si < tech.segments.length && deficit >= 15; si++) {
        const seg = tech.segments[si];
        if (seg.taskId === -1) continue;
        const task = rawTasks.find(t => t.id === seg.taskId);
        if (!task) continue;
        const allowedPad = Math.max(15, ceil15x(task.rawMin * 0.10));
        if (allowedPad >= 15) {
          let padAttempt;
          if (isGroup && tech.role === 'regular') {
             const cov = buildSupervisorCoverage(techObjs, techRoles);
             if (cov.length > 0) padAttempt = placeOnTech(tech, 15, seg.taskId, seg.taskName, { coverage: cov });
             if (!padAttempt) padAttempt = placeOnTech(tech, 15, seg.taskId, seg.taskName);
          } else {
             padAttempt = placeOnTech(tech, 15, seg.taskId, seg.taskName);
          }
          if (padAttempt) {
             deficit -= 15;
             const arr = taskSegments.get(seg.taskId) || [];
             arr.push({ techIndex: tech.index, start: padAttempt.start, end: padAttempt.end });
             taskSegments.set(seg.taskId, arr);
             padded = true;
             break; // restart outer while loop to evaluate deficit
          }
        }
      }
      if (!padded) break; // could not pad further
    }
  }
  mergeAndRecompute(techObjs);

  ensureNoIdleTech(techObjs, techRoles, isGroup);
  if (isGroup) repairCoverage(techObjs, techRoles);
  mergeAndRecompute(techObjs);

  let taskFinalEnd = new Map();
  let taskFinalStart = new Map();
  function recomputeTaskTimeline(){
    taskFinalEnd = new Map();
    taskFinalStart = new Map();
    for(const task of tasksCopy){
      const actualSegments = [];
      techObjs.forEach((tech, ti) => {
        tech.segments.forEach(seg => {
          if (seg.taskId === task.id) actualSegments.push({ techIndex: ti, start: seg.start, end: seg.end });
        });
      });
      if(actualSegments.length === 0){
        taskFinalEnd.set(task.id, null); taskFinalStart.set(task.id, null); continue;
      }
      taskFinalEnd.set(task.id, Math.max(...actualSegments.map(s => s.end)));
      taskFinalStart.set(task.id, Math.max(...actualSegments.map(s => s.start)));
    }
  }
  recomputeTaskTimeline();

  const headOverflowAssignments = [];
  const finalUnallocated = [];
  const b1OnlyTaskIds = new Set();
  const headAssignments = [];
  const headUnallocated = [];
  const supervisionGaps = [];

  function isWindowFree(tech, start, end) {
    if (start < 0 || end > _workEnd_offset || end <= start) return false;
    return !tech.segments.some(seg => start < seg.end && end > seg.start);
  }
  function scheduleExactWindow(tech, start, end, taskId, taskName) {
    if (!isWindowFree(tech, start, end)) return null;
    tech.segments.push({ start, end, taskId, taskName });
    tech.totalMin += (end - start);
    return { start, end };
  }
  function tryScheduleOnTechNotBefore(tech, duration, taskId, taskName, notBeforeStart) {
    return placeOnTech(tech, duration, taskId, taskName, { notBefore: notBeforeStart });
  }
  function removeTaskFromTechnicians(taskId){
    techObjs.forEach(tech => {
      const kept = []; let removed = 0;
      tech.segments.forEach(seg => {
        if (seg.taskId === taskId) removed += (seg.end - seg.start);
        else kept.push(seg);
      });
      tech.segments = kept;
      tech.totalMin = Math.max(0, tech.totalMin - removed);
    });
    taskSegments.set(taskId, []);
  }

  function assignedTaskMinutesOnTechnicians(taskId){
    return techObjs.reduce((sum, tech) => sum + tech.segments.reduce((s, seg) => {
      if (seg.taskId === taskId) return s + (seg.end - seg.start);
      return s;
    }, 0), 0);
  }

  let headObj = null;
  if (true) {
    headObj = { name: headTech, segments: [], totalMin: 0 };

    const headBlockInputs = load('asdp_headBlocks', []);
    for (const block of headBlockInputs) {
      const s_real = t2m(block.start);
      const e_real = t2m(block.end);
      if (s_real === null || e_real === null || e_real <= s_real) continue;
      const s_work = realToWork(s_real);
      const e_work = realToWork(e_real);
      if (s_work !== null && e_work !== null && e_work > s_work) {
        headObj.segments.push({ start: s_work, end: e_work, taskId: -1, taskName: 'DOLU' });
      } else if (s_work !== null && e_work === null) {
        headObj.segments.push({ start: s_work, end: _workEnd_offset, taskId: -1, taskName: 'DOLU' });
      }
    }

    const unallocatedTaskIds = Array.from(new Set(unallocated
      .map(u => Number.isFinite(u.taskId) ? u.taskId : (tasksCopy.find(t => t.name === u.task)?.id))
      .filter(id => Number.isFinite(id) && !(tasksCopy.find(t => t.id === id)?.isOpen))));

    if (unallocatedTaskIds.length > 0) {
      const partlyAssignedItems = [];
      const b1OnlyCandidates = unallocatedTaskIds
        .map(id => tasksCopy.find(t => t.id === id))
        .filter(Boolean)
        .filter(task => {
          const assigned = assignedTaskMinutesOnTechnicians(task.id);
          if (assigned > 0) {
            partlyAssignedItems.push({ task, assigned, missing: Math.max(0, task.techWorkMin - assigned) });
            return false;
          }
          return true;
        })
        .sort((a,b) => {
          const durA = a.techWorkMin + a.headAlloc;
          const durB = b.techWorkMin + b.headAlloc;
          if (durA !== durB) return durA - durB;
          return a.id - b.id;
        });

      for (const item of partlyAssignedItems) {
        if (item.missing >= 15) {
          finalUnallocated.push({
            task: item.task.name,
            minutes: item.missing,
            reason: 'İşin mümkün olan kısmı teknisyenlere dağıtıldı; kalan kısım B1-only yapılmadı'
          });
        }
      }

      for (const task of b1OnlyCandidates) {
        const fullB1Duration = Math.max(15, ceil15x(task.techWorkMin + task.headAlloc));
        removeTaskFromTechnicians(task.id);
        b1OnlyTaskIds.add(task.id);
        const attempt = placeOnTech(headObj, fullB1Duration, task.id, task.name);
        if (attempt) {
          headOverflowAssignments.push({ taskId: task.id, taskName: task.name, start: attempt.start, end: attempt.end, type: 'b1Only' });
        } else {
          finalUnallocated.push({ task: task.name, minutes: fullB1Duration, reason: 'B1 kapasitesi dolu olduğu için iş kimseye atanmadı' });
        }
      }
    }

    mergeAndRecompute(techObjs);
    recomputeTaskTimeline();

    const tasksForHead = tasksCopy.filter(t => !t.isOpen).slice().sort((a,b)=>{
      const A = taskFinalEnd.get(a.id), B = taskFinalEnd.get(b.id);
      if(A===null && B===null) return 0;
      if(A===null) return 1;
      if(B===null) return -1;
      return A - B;
    });

    for(const t of tasksForHead){
      if (b1OnlyTaskIds.has(t.id) || t.isOpen) continue;
      const headNeeded = t.headAlloc;
      if(headNeeded <= 0) continue;
      const taskEnd = taskFinalEnd.get(t.id);
      if (taskEnd === null) {
        const attempt = tryScheduleOnTechNotBefore(headObj, headNeeded, t.id, t.name, 0);
        if (attempt) headAssignments.push({ taskId: t.id, taskName: t.name, start: attempt.start, end: attempt.end, type: 'headAlloc' });
        else headUnallocated.push({ taskId: t.id, task: t.name, minutes: headNeeded, reason: 'B1 kapasitesi dolu' });
        continue;
      }
      const exactStart = Math.max(0, taskEnd - headNeeded);
      let attempt = scheduleExactWindow(headObj, exactStart, taskEnd, t.id, t.name);
      if (!attempt) attempt = tryScheduleOnTechNotBefore(headObj, headNeeded, t.id, t.name, taskEnd);
      if (attempt) headAssignments.push({ taskId: t.id, taskName: t.name, start: attempt.start, end: attempt.end, type: 'headAlloc' });
      else headUnallocated.push({ taskId: t.id, task: t.name, minutes: headNeeded, reason: 'B1 için iş bitişiyle aynı veya sonrasında boş aralık yok' });
    }

    if (headUnallocated.length > 0) {
      const fallbackItems = headUnallocated.splice(0)
        .map(u => ({ ...u, taskObj: tasksCopy.find(t => t.id === u.taskId) }))
        .filter(u => u.taskObj)
        .sort((a,b) => {
          const durA = Math.max(15, ceil15x(a.minutes || a.taskObj.headAlloc || 15));
          const durB = Math.max(15, ceil15x(b.minutes || b.taskObj.headAlloc || 15));
          if (durA !== durB) return durA - durB;
          return a.taskObj.id - b.taskObj.id;
        });
      for (const item of fallbackItems) {
        const task = item.taskObj;
        const fallbackDuration = Math.max(15, ceil15x(item.minutes || task.headAlloc || 15));
        const alreadyAssignedToTech = assignedTaskMinutesOnTechnicians(task.id) > 0;
        if (!alreadyAssignedToTech) {
          removeTaskFromTechnicians(task.id);
          b1OnlyTaskIds.add(task.id);
        }
        const attempt = placeOnTech(headObj, fallbackDuration, task.id, task.name);
        if (attempt) {
          headOverflowAssignments.push({ taskId: task.id, taskName: task.name, start: attempt.start, end: attempt.end, type: 'b1OnlyFallback' });
        } else {
          finalUnallocated.push({ task: task.name, minutes: fallbackDuration, reason: 'B1’e atanamadığı için diğer teknisyenlerden de kaldırıldı' });
        }
      }
    }

    function mergeSingleSchedule(obj){
      if (!obj) return;
      obj.segments.sort((a,b)=>a.start - b.start || a.end - b.end);
      const merged = [];
      for (const s of obj.segments) {
        const last = merged[merged.length - 1];
        if (last && last.taskId === s.taskId && last.end === s.start) {
          last.end = s.end;
        } else {
          merged.push({...s});
        }
      }
      obj.segments = merged;
      obj.totalMin = obj.segments.reduce((sum, seg) => seg.taskId === -1 ? sum : sum + (seg.end - seg.start), 0);
    }

    function getOpenPool(){
      return tasksCopy
        .filter(t => t.isOpen && t.rawMin > 0)
        .sort((a,b) => Math.max(15, ceil15x(a.rawMin)) - Math.max(15, ceil15x(b.rawMin)) || a.id - b.id)
        .map(t => ({ task: t, remaining: Math.max(15, ceil15x(t.rawMin)) }));
    }

    function remainingOpenPool(pool){
      return pool.reduce((sum, item) => sum + Math.max(0, item.remaining), 0);
    }

    function nextOpenItem(pool){
      return pool.find(item => item.remaining >= 15) || null;
    }

    function findOpenSlotForTarget(target){
      const free = getFreeIntervals(target.obj);
      for (let i = free.length - 1; i >= 0; i--) {
        const [fs, fe] = free[i];
        let cursor = floor15(fe) - 15;
        while (cursor >= fs) {
          if (isGroup && target.role === 'regular') {
            const coverage = buildSupervisorCoverage(techObjs, techRoles);
            const ok = coverage.some(([cs, ce]) => cursor >= cs && (cursor + 15) <= ce);
            if (!ok) { cursor -= 15; continue; }
          }
          return { start: cursor, end: cursor + 15 };
        }
      }
      return null;
    }

    function fillAllOpenGapsFromPool(){
      const pool = getOpenPool();
      let guard = 0;
      while (remainingOpenPool(pool) >= 15 && guard < 20000) {
        guard++;
        const targets = techObjs.map(t => ({ obj: t, role: isGroup ? (techRoles[t.index] || 'regular') : 'all', isHead:false }))
          .concat([{ obj: headObj, role:'head', isHead:true }])
          .sort((a,b) => {
            const aFree = getFreeIntervals(a.obj).reduce((s,[x,y]) => s + (y-x), 0);
            const bFree = getFreeIntervals(b.obj).reduce((s,[x,y]) => s + (y-x), 0);
            if ((a.obj.totalMin || 0) !== (b.obj.totalMin || 0)) return (a.obj.totalMin || 0) - (b.obj.totalMin || 0);
            return bFree - aFree;
          });

        let placed = false;
        for (const target of targets) {
          const item = nextOpenItem(pool);
          if (!item) break;
          const slot = findOpenSlotForTarget(target);
          if (!slot) continue;
          target.obj.segments.push({ start: slot.start, end: slot.end, taskId: item.task.id, taskName: item.task.name });
          target.obj.totalMin = (target.obj.totalMin || 0) + 15;
          if (target.isHead) {
            headAssignments.push({ taskId: item.task.id, taskName: item.task.name, start: slot.start, end: slot.end, type: 'openB1Fill' });
          } else {
            const arr = taskSegments.get(item.task.id) || [];
            arr.push({ techIndex: target.obj.index, start: slot.start, end: slot.end });
            taskSegments.set(item.task.id, arr);
          }
          item.remaining -= 15;
          placed = true;
          break;
        }
        if (!placed) break;
        mergeAndRecompute(techObjs);
        mergeSingleSchedule(headObj);
        if (isGroup) repairCoverage(techObjs, techRoles);
      }
      mergeAndRecompute(techObjs);
      mergeSingleSchedule(headObj);
      return pool;
    }

    const openPoolAfterFill = fillAllOpenGapsFromPool();

    const taskIdsWithB1 = new Set(headObj.segments.filter(s => s.taskId !== -1 && s.taskId != null).map(s => s.taskId));
    const removedByB1Rule = new Set();
    techObjs.forEach(tech => {
      const kept = [];
      for (const seg of tech.segments) {
        if (seg.taskId === -1 || seg.taskId == null || taskIdsWithB1.has(seg.taskId) || (tasksCopy.find(t => t.id === seg.taskId)?.isOpen)) kept.push(seg);
        else removedByB1Rule.add(seg.taskId);
      }
      tech.segments = kept;
      tech.totalMin = tech.segments.reduce((sum, seg) => seg.taskId === -1 ? sum : sum + (seg.end - seg.start), 0);
    });
    removedByB1Rule.forEach(taskId => {
      const task = tasksCopy.find(t => t.id === taskId);
      if (task && !finalUnallocated.some(u => u.task === task.name)) {
        finalUnallocated.push({ task: task.name, minutes: Math.max(15, ceil15x(task.headAlloc || 15)),
          reason: 'B1’e atanmadığı için diğer teknisyenlere de atanmadı' });
      }
    });

    mergeAndRecompute(techObjs);
    recomputeTaskTimeline();
  }

  if (isGroup) {
    techObjs.forEach((tech, idx) => {
      if (techRoles[idx] !== 'regular') return;
      tech.segments.forEach(seg => {
        if (seg.taskId === -1) return;
        const attr = attributeSupervision(seg.start, seg.end, techObjs, techRoles, technicians);
        if (!attr.fullyCovered) {
          supervisionGaps.push({
            techName: tech.name,
            taskName: seg.taskName,
            from: workToReal(attr.uncoveredFrom),
            to: workToReal(seg.end)
          });
        }
      });
    });
  }

  // ============================================================
  // RENDER
  // ============================================================
  const perTech = technicians.map((n, idx) => ({
    name: n,
    role: isGroup ? (techRoles[idx] || 'regular') : 'all',
    segs: [], total: 0
  }));
  techObjs.forEach((t, idx) => {
    t.segments.forEach(s => {
      if (s.taskId == null || s.taskId === -1) return;
      const real = { startReal: workToReal(s.start), endReal: workToReal(s.end) };
      perTech[idx].segs.push({ task: tasks[s.taskId].name, start: real.startReal, end: real.endReal, _ws: s.start, _we: s.end });
      let segmentDuration = real.endReal - real.startReal;
      for (const b of _breaks) {
        if (real.startReal < b.e && real.endReal > b.s) {
          const overlapStart = Math.max(real.startReal, b.s);
          const overlapEnd = Math.min(real.endReal, b.e);
          segmentDuration -= Math.max(0, overlapEnd - overlapStart);
        }
      }
      perTech[idx].total += segmentDuration;
    });
  });

  let html = '';
  const totalInputHours = tasks.reduce((s,t)=>s + (parseFloat(t.hours)||0),0);
  html += `<div class="card"><div class="small">Mod: <strong>${isGroup ? 'Supervisor Grup' : 'Supervisor ALL'}</strong> – Toplam İş: <strong>${tasks.length}</strong> – Girdi Toplam Süre: <strong>${totalInputHours.toFixed(2)} saat</strong></div></div>`;

  // Capacity table
  const busyRows = technicians.map((name, i) => {
    const busyH = minutesToHoursStr(techBusyMinutes[i] || 0);
    const freeH = minutesToHoursStr(techFreeCapacities[i] || 0);
    const role = isGroup ? `<span class="role-tag ${techRoles[i] || 'regular'}">${techRoles[i] === 'supervisor' ? 'Supervisor' : techRoles[i] === 'qualified' ? 'Kalifiyeli' : 'Teknisyen'}</span>` : '';
    return `<tr><td><strong>${escHtml(name)}</strong>${role}</td><td>${busyH}</td><td>${freeH}</td></tr>`;
  }).join('');
  html += `<details class="collapsible" open><summary>⏱️ Teknisyen Net Kapasite Kontrolü</summary><div class="body">
    <div class="small" style="color:var(--muted);margin-bottom:8px">Dolu saatler iş ataması için kapalıdır ve toplam yüke eklenmez.</div>
    <table class="table"><tr><th>Teknisyen</th><th>Dolu Saat</th><th>Kullanılabilir Saat</th></tr>${busyRows}</table>
  </div></details>`;

  // Capacity scaling note
  if (capacityExceeded) {
    const capHours = (totalCapacityMin / 60).toFixed(2);
    const needHours = (totalTechWorkNeeded / 60).toFixed(2);
    const reductionPct = ((1 - reductionRatio) * 100).toFixed(1);
    const totalPlanned = rawTasks.reduce((s, t) => s + t.techWorkMin, 0);
    const plannedHours = (totalPlanned / 60).toFixed(2);
    let detailHtml = '<table class="table" style="margin-top:10px"><tr><th>İş</th><th>Orijinal → Planlanan</th><th>Fark</th></tr>';
    tasksCopy.forEach(task => {
      if (task.techWorkMinOriginal > 0) {
        const origH = (task.techWorkMinOriginal / 60).toFixed(2);
        const newH = (task.techWorkMin / 60).toFixed(2);
        const diffMin = task.techWorkMinOriginal - task.techWorkMin;
        const diffH = (diffMin / 60).toFixed(2);
        const taskPct = ((diffMin / task.techWorkMinOriginal) * 100).toFixed(1);
        const roundNote = (task.techWorkMin !== task.techWorkMinBeforeRound)
          ? ` <span style="color:#f59e0b;font-size:0.8em">(±15dk yuvarlama)</span>` : '';
        detailHtml += `<tr><td><strong>${escHtml(task.name)}</strong></td><td>${origH} → ${newH} saat${roundNote}</td><td>-${diffH} saat (${taskPct}%)</td></tr>`;
      }
    });
    detailHtml += '</table>';
    html += `<details class="collapsible" open><summary>📊 Kapasite Aşımı – Orantılı Küçültme + 15dk Yuvarlama Uygulandı</summary><div class="body capacity-info">
      <strong>Zorunlu iş kapasitesi aştığı için orantılı küçültme uygulandı.</strong><br>
      <span class="small" style="color:var(--muted)">
        Toplam net kapasite: <strong>${capHours} saat</strong><br>
        Toplam iş yükü (orijinal): <strong>${needHours} saat</strong><br>
        Planlanan toplam: <strong>${plannedHours} saat</strong><br>
        <span style="color:var(--danger)">➜ Tüm işler orantılı olarak <strong>~%${reductionPct}</strong> küçültüldü.</span>
      </span>${detailHtml}
    </div></details>`;
  }

  // ==========================================================
  // 👷 Teknisyenlerin Programı – YENİ 2 SÜTUNLU TASARIM
  // Teknisyen ismi + Toplam (saat) başlık olarak; içeride
  // İşler ve zaman aralıkları tek satırda 2 sütun.
  // ==========================================================
  let techHtml = `<details class="collapsible" open><summary>👷 Teknisyenlerin Programı</summary><div class="body">
    <div style="margin:10px 0 14px 0">
      <label class="small" style="display:block;margin-bottom:6px;color:var(--muted)">Opsiyonel Not</label>
      <textarea data-field="program-note" placeholder="Planla ilgili not ekle...">${escHtml(programNote)}</textarea>
    </div>`;

  perTech.forEach((p, idx)=>{
    p.segs.sort((a,b)=>a.start - b.start);
    const roleTag = isGroup
      ? `<span class="role-tag program-role-tag ${p.role}">${p.role === 'supervisor' ? 'Supervisor' : p.role === 'qualified' ? 'Kalifiyeli' : 'Teknisyen'}</span>`
      : '';

    let body;
    if (p.segs.length) {
      body = '<div class="program-table">' + p.segs.map(s => {
        let line = `<div class="program-seg">
          <span class="program-task">${escHtml(s.task)}</span>
          <span class="program-time">${m2t(s.start)} - ${m2t(s.end)}</span>
        </div>`;
        if (isGroup && p.role === 'regular') {
          const attr = attributeSupervision(s._ws, s._we, techObjs, techRoles, technicians);
          if (attr.covered.length > 0) {
            const supList = attr.covered.map(c => `${escHtml(c.supName)} (${m2t(workToReal(c.start))}-${m2t(workToReal(c.end))})`).join(', ');
            line += `<div class="small program-meta-line" style="color:var(--accent)">↳ Denetim: ${supList}</div>`;
          }
          if (!attr.fullyCovered) {
            line += `<div class="small program-meta-line" style="color:var(--danger)">⚠ Denetimsiz: ${m2t(workToReal(attr.uncoveredFrom))}-${m2t(workToReal(s._we))}</div>`;
          }
        }
        return line;
      }).join('') + '</div>';
    } else {
      body = '<div class="program-empty">⚠ Atanmış iş yok</div>';
    }

    window._waCopyData = window._waCopyData || {};
    window._waCopyData[idx] = { 
      name: p.name, 
      total: minutesToHoursStr(p.total), 
      segs: p.segs.map(s => ({ task: s.task, s: m2t(s.start), e: m2t(s.end) }))
    };

    techHtml += `<div class="tech-program-block">
      <div class="tech-program-header">
        <div class="tech-program-header-left">
          <span class="tech-program-name">${escHtml(p.name)}</span>${roleTag}
        </div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span class="tech-program-total">Toplam: <strong>${minutesToHoursStr(p.total)} sa</strong></span>
          <button class="btn-wa-copy" onclick="copyWA(${idx})">📋 WhatsApp</button>
        </div>
      </div>
      ${body}
    </div>`;
  });
  techHtml += `</div></details>`;
  html += techHtml;

  // ==========================================================
  // 👑 B1 Teknisyen Zaman Listesi
  // ==========================================================
  if (headObj) {
    const allHeadSegs = headObj.segments.filter(s => s.taskId !== -1).sort((a,b) => a.start - b.start);
    let headDisplayHtml = '';
    if (allHeadSegs.length > 0) {
      const b1OnlyKeys = new Set(headOverflowAssignments
        .filter(h => h.type === 'b1Only' || h.type === 'b1OnlyFallback')
        .map(h => `${h.start}-${h.end}-${h.taskId}`));
      headDisplayHtml = '<div class="b1-list">' + allHeadSegs.map(s => {
        const realStart = m2t(workToReal(s.start));
        const realEnd = m2t(workToReal(s.end));
        const isB1Only = b1OnlyKeys.has(`${s.start}-${s.end}-${s.taskId}`);
        const isOpenB1 = tasksCopy.find(t => t.id === s.taskId)?.isOpen;
        const tag = isB1Only ? '<span class="b1-only-tag">B1-only</span>' : (isOpenB1 ? '<span class="b1-only-tag">OPEN fill</span>' : '');
        return `<div class="b1-row${isB1Only ? ' b1-only' : ''}">
          <div class="b1-main-line">
            <span class="b1-task">${escHtml(s.taskName)}</span>
            <span class="b1-time">${realStart} - ${realEnd}</span>
          </div>
          ${tag ? `<div class="b1-meta-line">${tag}</div>` : ''}
        </div>`;
      }).join('') + '</div>';
    } else {
      headDisplayHtml = '<div class="small" style="color:var(--muted)">B1 teknisyenine atanmış görev yok.</div>';
    }
    const headWorkTotal = allHeadSegs.reduce((s, seg) => s + (seg.end - seg.start), 0);
    const headOverflowTotal = headOverflowAssignments.reduce((s, h) => s + (h.end - h.start), 0);
    html += `<div class="card"><h2>👑 B1 Teknisyen Zaman Listesi <span class="role-tag head">${escHtml(headTech || '—')}</span></h2><div class="small" style="color:var(--muted);margin-bottom:8px">B1 için otomatik ayarlanan onay / B1-only zaman aralıkları aşağıdadır. Bu liste Supervisor Grup modunda da hesaplanır.</div>${headDisplayHtml}`;
    html += `<div class="stat" style="margin-top:10px">
      Toplam B1 yükü: <strong>${minutesToHoursStr(headWorkTotal)} saat</strong>
      ${headOverflowTotal > 0 ? ` – B1’e özel atanan iş yükü: <strong style="color:var(--warn)">${minutesToHoursStr(headOverflowTotal)} saat</strong>` : ''}
    </div>`;
    html += `</div>`;
  }

  if (isGroup) {
    const coverage = buildSupervisorCoverage(techObjs, techRoles);
    if (coverage.length === 0) {
      const covHtml = '<div class="warning" style="margin-top:0">⚠ Hiçbir Supervisor’e iş atanamadığı için denetim aralığı oluşmadı.</div>';
      html += `<div class="card"><h2>🛡 Supervisor Denetim Pencereleri</h2>${covHtml}</div>`;
    }
  }

  if (isGroup && supervisionGaps.length > 0) {
    const gapHtml = supervisionGaps.map(g => `<div class="small">⚠ <strong>${escHtml(g.techName)}</strong> – ${escHtml(g.taskName)} işi denetimsiz: ${m2t(g.from)} - ${m2t(g.to)}</div>`).join('');
    html += `<div class="warning"><strong>⛔ Denetim Açığı</strong><br><div class="small" style="color:var(--danger);margin:6px 0">Bu Teknisyenlerin işleri en az bir Supervisor olmadan başlatılamaz. Programı revize edin veya Supervisor saatlerini güncelleyin.</div>${gapHtml}</div>`;
  }

  if (isGroup) {
    const idleNames = perTech.filter(p => p.segs.length === 0).map(p => p.name);
    if (idleNames.length > 0) {
      html += `<div class="attention"><strong>⚠ Atama Yapılmayan Teknisyenler</strong><br><div class="small" style="color:var(--warn);margin-top:6px">Aşağıdaki teknisyenlere zaman aralığı atanamadı (yetersiz iş yükü veya denetim penceresi sorunu olabilir): ${idleNames.map(escHtml).join(', ')}</div></div>`;
    }
  }

  if(headUnallocated.length > 0){
    const headUnallocatedByTask = {};
    headUnallocated.forEach(u => {
      if (!headUnallocatedByTask[u.task]) headUnallocatedByTask[u.task] = { totalMinutes: 0, taskName: u.task };
      headUnallocatedByTask[u.task].totalMinutes += u.minutes;
    });
    const headUnallocHtml = Object.values(headUnallocatedByTask).map(u => {
      const unallocHours = (u.totalMinutes / 60).toFixed(2).replace('.', ',');
      return `<div class="small">${escHtml(u.taskName)} – B1 için ${unallocHours} saat atanamadı</div>`;
    }).join('');
    html += `<div class="warning"><strong>⚠️ Atanamayan Onay Süreleri (B1)</strong><br>${headUnallocHtml}</div>`;
  }

  if (finalUnallocated.length > 0) {
    const finalUnallocHtml = finalUnallocated.map(u => {
      const unallocHours = (u.minutes / 60).toFixed(2).replace('.', ',');
      return `<div class="small">${escHtml(u.task)} – ${unallocHours} saat hiçbir yere atanamadı (${escHtml(u.reason)})</div>`;
    }).join('');
    html += `<div class="warning"><strong>⚠️ Tamamen Atanamayan İşler</strong><br>${finalUnallocHtml}</div>`;
  }

  if (isGroup && unallocated.length > 0 && finalUnallocated.length === 0) {
    const aggregated = {};
    unallocated.forEach(u => {
      if (!aggregated[u.task]) aggregated[u.task] = { minutes: 0, reasons: new Set() };
      aggregated[u.task].minutes += u.minutes;
      aggregated[u.task].reasons.add(u.reason);
    });
    const items = Object.entries(aggregated).map(([name, info]) => {
      const h = (info.minutes / 60).toFixed(2).replace('.', ',');
      const reasons = Array.from(info.reasons).join('; ');
      return `<div class="small">${escHtml(name)} – ${h} saat atanamadı (${escHtml(reasons)})</div>`;
    }).join('');
    if (items) html += `<div class="attention"><strong>⚠ Atanamayan İş Parçaları</strong><br><div class="small" style="margin:6px 0">Aşağıdaki süreler hiçbir teknisyene yerleştirilemedi.</div>${items}</div>`;
  }

  html += `<div class="footer-warning">⚠️ Bu planlama bir öneridir. Gerçek durumlarda işyeri prosedürlerine ve operasyonel ihtiyaçlara göre değişiklik yapılabilir.</div>`;
  resultsDiv.innerHTML = html;
  window.scrollTo({ top: resultsDiv.offsetTop - 20, behavior: 'smooth' });
}

window.copyWA = function(idx) {
  const data = window._waCopyData[idx];
  if (!data) return;
  const shiftS = $('shiftStart').value || '—';
  const shiftE = $('shiftEnd').value || '—';
  let text = `👷 *${data.name}*\n⏳ Toplam: ${data.total} saat\n🗓️ Vardiya: ${shiftS} - ${shiftE}\n`;
  
  const bs = $('breakStart').value, be = $('breakEnd').value;
  if (bs && be) text += `🍲 Yemek: ${bs} - ${be}\n`;
  const ts = $('teaBreakStart') ? $('teaBreakStart').value : '', te = $('teaBreakEnd') ? $('teaBreakEnd').value : '';
  if (ts && te) text += `☕ Çay: ${ts} - ${te}\n`;
  
  text += `\n*GÖREVLER:*\n`;
  if (data.segs.length > 0) {
    data.segs.forEach(s => {
      text += `🔹 ${s.s} - ${s.e} | ${s.task}\n`;
    });
  } else {
    text += `⚠ Atanmış iş yok.\n`;
  }
  
  navigator.clipboard.writeText(text).then(() => {
    alert(data.name + ' planı kopyalandı!');
  }).catch(err => {
    console.error('Kopyalama hatası:', err);
    alert('Kopyalama başarısız oldu. Lütfen tekrar deneyin.');
  });
};
