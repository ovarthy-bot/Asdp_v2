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
// Hassasiyet çubuğu (0-100): 0 = teknisyenler aynı işi aynı saatlerde yapar, 100 = B1 onayları düzenli aralıklarda.
let sensitivity = (() => { const v = parseInt(localStorage.getItem('asdp_sensitivity'), 10); return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 50; })();
let chosenScenario = ''; // Kullanıcının seçtiği senaryo anahtarı; '' = hassasiyete göre otomatik
let techPreAssignments = load('asdp_techPreAssigns', []);

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
  save('asdp_techPreAssigns', techPreAssignments);
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
  document.querySelectorAll('input[name="planMode"]').forEach(r => { r.checked = (r.value === planMode); });
  document.querySelectorAll('#modeRow label').forEach(l => l.classList.toggle('active', l.dataset.mode === planMode));
  $('modeSummaryNote').textContent = (planMode === 'all') ? 'Mevcut: Supervisor ALL' : 'Mevcut: Supervisor Grup';
  const desc = $('modeDescription');
  if (planMode === 'all') {
    desc.innerHTML = 'Klasik mod: tek B1 teknisyen her işin bitişinde 15 dk onay süresi alır. Onay aralıkları mümkün olduğunca birbirine yığılmadan planlanır.';
  } else {
    desc.innerHTML = 'Süpervizör grup modu — 3 rol:<br>' +
      '• <strong>Supervisor</strong>: hem iş yapar hem <strong>aynı işte</strong> aynı saatte çalışan Teknisyenleri denetler. Bir Supervisor aynı işte birden fazla Teknisyene denetim yapabilir; bir Teknisyene farklı zamanlarda birden fazla Supervisor da denetim yapabilir.<br>' +
      '• <strong>Kalifiyeli</strong>: tek başına çalışabilir, denetim aramaz, denetleme yapmaz (Kalifiyeli ile Teknisyen Supervisor olmadan birlikte çalışamaz).<br>' +
      '• <strong>Teknisyen</strong>: yalnızca <strong>aynı işte</strong> en az bir Supervisor’ün çalıştığı saatlerde iş alabilir; asla denetimsiz çalışmaz.<br>' +
      'Teknisyen ile onu denetleyen Supervisor <strong>aynı iş ve birebir aynı saat aralığında</strong> listelenir; Supervisor ve Teknisyen blokları farklı yerde başlayıp bitiyorsa bloklar, birbirinin sınırlarından bölünerek eşleştirilir.';
  }
}

// Hassasiyet çubuğunun yazıya çevrilmiş hâli (özet satırı, sonuç başlığı ve yapay zeka verisi için).
function sensitivityText(){
  const v = sensitivity;
  const tag = v <= 20 ? 'teknisyen eşitliği' : v >= 80 ? 'B1 düzeni' : v === 50 ? 'dengeli' : v < 50 ? 'eşitliğe yakın' : 'B1 düzenine yakın';
  return `%${v} (${tag})`;
}

function applyAlgoUI(){
  const slider = $('sensitivity');
  if (slider) slider.value = sensitivity;
  const valueEl = $('sensitivityValue');
  if (valueEl) valueEl.textContent = sensitivityText();
  const algoNote = $('algoSummaryNote');
  if (algoNote) algoNote.textContent = 'Hassasiyet: ' + sensitivityText();
  const algoDesc = $('algoDescription');
  if (algoDesc) {
    const now = sensitivity <= 20
      ? 'Şu an: tüm teknisyenler neredeyse aynı işleri aynı saat aralıklarında yapar; B1 onayları işlerin doğal bitişine göre dağılır ve düzenli olmayabilir.'
      : sensitivity >= 80
        ? "Şu an: B1 onayları eşit aralıklara oturtulur; diğer teknisyenlerin işleri ve saat aralıkları B1'in bu düzenine göre ayarlanır (iş parçaları daha bölünmüş olabilir)."
        : 'Şu an: ikisi arasında bir denge kurulur; işlerin bitişleri doğal sıradan B1 düzenine doğru kısmen kaydırılır.';
    algoDesc.innerHTML = `<strong>Sol:</strong> tüm teknisyenler birbirinin neredeyse aynı işlerini aynı saat aralıklarında yapar, B1 onayları düzensiz olabilir. <strong>Sağ:</strong> B1 teknisyenin onay aralıkları düzenli olur, diğer teknisyenlerin iş ve saatleri B1'e göre ayarlanır.<br>` +
      `Her teknisyen programda <strong>tek bir ekipte (grupta)</strong> yer alır. Adam saat dağıtımı birden fazla ekip düzeniyle yapılabiliyorsa plan oluşturulduktan sonra senaryolardan birini kendiniz seçebilirsiniz. Her iki uçta da Supervisor denetimi, B1 onayı ve iş süresi sınırları aynen korunur.<br>${now}`;
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
  updateTechsStat();
}


function normalizeTechPreAssignments(){
  if (!Array.isArray(techPreAssignments)) techPreAssignments = [];
  while (techPreAssignments.length < technicians.length) techPreAssignments.push([]);
  if (techPreAssignments.length > technicians.length) techPreAssignments = techPreAssignments.slice(0, technicians.length);
  techPreAssignments = techPreAssignments.map(list => Array.isArray(list) ? list : []);
  save('asdp_techPreAssigns', techPreAssignments);
}

function updatePreAssignSummary(){
  let count = 0;
  (techPreAssignments || []).forEach(arr => count += (arr || []).length);
  const el = $('preAssignSummary');
  if (el) el.textContent = count > 0 ? `${count} atama tanımlı` : 'tanımlı yok';
}

function renderPreAssignTaskSelect(){
  const sel = $('preAssignTaskSelect');
  if(!sel) return;
  const current = sel.value;
  sel.innerHTML = tasks.map((t, i) => `<option value="${i}">${escHtml(t.name || ('İş ' + (i+1)))}</option>`).join('');
  if(current !== '' && +current < tasks.length) sel.value = current;
}

function renderPreAssigns(){
  normalizeTechPreAssignments();
  
  const techSel = $('preAssignTechSelect');
  if (techSel) {
    const currentTech = techSel.value;
    techSel.innerHTML = technicians.map((name, i) => `<option value="${i}">${escHtml(name || ('Teknisyen ' + (i+1)))}</option>`).join('');
    if(currentTech !== '' && +currentTech < technicians.length) techSel.value = currentTech;
  }
  
  renderPreAssignTaskSelect();
  
  const preAssignsDiv = $('preAssigns');
  if (!preAssignsDiv) return;
  preAssignsDiv.innerHTML = '';
  
  technicians.forEach((name, techIndex) => {
    const assigns = techPreAssignments[techIndex] || [];
    if(assigns.length === 0) return;
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '8px';
    wrap.innerHTML = `<div style="color:var(--muted);margin:6px 0"><strong>${escHtml(name)}</strong></div>`;
    assigns.forEach((a, assignIndex) => {
      const taskName = tasks[a.taskId] ? tasks[a.taskId].name : 'Bilinmeyen İş';
      const row = document.createElement('div');
      row.className = 'input-group';
      row.innerHTML = `
        <span style="font-size:0.9rem; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escHtml(taskName)}">${escHtml(taskName)}</span>
        <input type="time" data-tech-p="${techIndex}" data-assign-i="${assignIndex}" data-field="preassign-start" value="${a.start || ''}">
        <input type="time" data-tech-p="${techIndex}" data-assign-i="${assignIndex}" data-field="preassign-end" value="${a.end || ''}">
        <button class="btn-del" data-delpreassign="${techIndex}:${assignIndex}" style="padding:8px 10px">×</button>
      `;
      wrap.appendChild(row);
    });
    preAssignsDiv.appendChild(wrap);
  });
  updatePreAssignSummary();
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
    const row = document.createElement('div'); row.className = 'list-item-card';
    row.innerHTML = `
      <div class="list-item-row">
        <input type="text" data-i="${i}" data-field="name" value="${escHtml(t.name)}" placeholder="İş Tanımı">
        <input type="number" step="0.25" min="0" data-i="${i}" data-field="hours" value="${t.hours}" placeholder="Saat">
        <label class="open-toggle" title="OPEN iş: önce zorunlu işler yerleşir; bu iş kalan boş zamanları doldurmak için kullanılır.">
          <input type="checkbox" data-i="${i}" data-field="openTask" ${t.open ? 'checked' : ''}>
          <span class="emoji-open">📖</span>
          <span class="emoji-closed">📕</span>
        </label>
        <button class="btn-del" data-del="${i}">×</button>
      </div>
    `;
    tasksDiv.appendChild(row);
  });
  save('asdp_tasks', tasks);
  updateTasksStat();
  renderDupeWarning();
  renderPreAssignTaskSelect();
  renderPreAssigns();
}

function renderTechs(){
  normalizeTechRoles();
  techsDiv.innerHTML = '';
  technicians.forEach((t,i)=>{
    const role = techRoles[i] || 'regular';
    const row = document.createElement('div'); row.className = 'list-item-card';
    row.innerHTML = `
      <div class="list-item-row">
        <input type="text" data-i="${i}" data-field="tech" value="${escHtml(t)}" placeholder="Teknisyen Adı">
        <select class="role-select group-only" data-i="${i}" data-field="techRole" style="font-size: 0.95rem; padding: 0.5rem;">
          <option value="supervisor"${role==='supervisor'?' selected':''}>👷🏼‍♂️ Supervisor</option>
          <option value="qualified"${role==='qualified'?' selected':''}>🧑‍🔬 Kalifiyeli</option>
          <option value="regular"${role==='regular'?' selected':''}>👨‍🔧 Teknisyen</option>
        </select>
        <button class="btn-del" data-deltech="${i}">×</button>
      </div>
    `;
    techsDiv.appendChild(row);
  });
  save('asdp_techs', technicians);
  normalizeTechBlocks();
  renderTechBlockSelect();
  updateTechsStat();
  renderPreAssigns();
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
  tasksStatDiv.innerHTML = `Toplam İş: <strong>${count}</strong> – Girdi Toplamı: <strong>${total.toFixed(2)} saat</strong>${openCount ? ` – OPEN: <strong>${openCount}</strong>` : ''}`;
}

function updateTechsStat(){
  const count = technicians.length;
  const totalTaskHours = tasks.reduce((sum, task) => sum + (parseFloat(task.hours) || 0), 0);
  const avgPerTech = count > 0 ? (totalTaskHours / count).toFixed(2) : '0.00';
  let netCapHours = '0.00';

  const shiftS = t2m($('shiftStart').value);
  const shiftE = t2m($('shiftEnd').value);
  if (shiftS !== null && shiftE !== null && shiftE > shiftS) {
    // Preview calculation mirrors the planning engine: union overlapping breaks so
    // the pre-plan statistic never double-subtracts them, and clamp blocks to shift.
    const rawBreaks = [
      { start: t2m($('breakStart').value), end: t2m($('breakEnd').value) },
      { start: t2m($('teaBreakStart').value), end: t2m($('teaBreakEnd').value) }
    ].filter(b => b.start !== null && b.end !== null && b.end > b.start && b.end > shiftS && b.start < shiftE)
      .map(b => ({ s: Math.max(shiftS, b.start), e: Math.min(shiftE, b.end) }))
      .sort((a, b) => a.s - b.s);

    const breaks = [];
    for (const b of rawBreaks) {
      const last = breaks[breaks.length - 1];
      if (!last || b.s > last.e) breaks.push({ ...b });
      else last.e = Math.max(last.e, b.e);
    }
    const breakMinutes = breaks.reduce((sum, b) => sum + b.e - b.s, 0);
    const workEnd = Math.max(0, shiftE - shiftS - breakMinutes);
    const toWork = realMin => {
      const r = Math.min(Math.max(realMin, shiftS), shiftE);
      let work = r - shiftS;
      for (const b of breaks) work -= Math.max(0, Math.min(r, b.e) - b.s);
      return Math.min(Math.max(0, work), workEnd);
    };

    let totalCapacityMin = 0;
    for (const blocks of (techBlocks || []).slice(0, count)) {
      const intervals = [];
      for (const block of blocks || []) {
        const sr = t2m(block.start), er = t2m(block.end);
        if (sr === null || er === null || er <= sr) continue;
        const a = toWork(sr), b = toWork(er);
        if (b > a) intervals.push({ s: a, e: b });
      }
      intervals.sort((a, b) => a.s - b.s);
      const merged = [];
      for (const interval of intervals) {
        const last = merged[merged.length - 1];
        if (!last || interval.s > last.e) merged.push({ ...interval });
        else last.e = Math.max(last.e, interval.e);
      }
      const busy = merged.reduce((sum, interval) => sum + interval.e - interval.s, 0);
      totalCapacityMin += Math.max(0, workEnd - busy);
    }
    netCapHours = (totalCapacityMin / 60).toFixed(2);
  }

  let extra = '';
  if (planMode === 'group') {
    const sup = techRoles.filter(role => role === 'supervisor').length;
    const qua = techRoles.filter(role => role === 'qualified').length;
    const reg = technicians.length - sup - qua;
    extra = `<br><span class="small">Supervisor: <strong>${sup}</strong> – Kalifiyeli: <strong>${qua}</strong> – Teknisyen: <strong>${reg}</strong></span>`;
  }
  techsStatDiv.innerHTML = `Toplam Teknisyen: <strong>${count}</strong> – Ortalama girdi yükü: <strong>${avgPerTech} saat</strong> – Dolu saatler sonrası vardiya kapasitesi: <strong>${netCapHours} saat</strong>${extra}`;
}

// ---- Initial render ----
renderTasks(); renderTechs(); renderHeadBlocks(); renderTechBlocks(); renderPreAssigns();
$('headTech').value = headTech;
$('shiftStart').value = shiftStart;
$('shiftEnd').value = shiftEnd;
$('breakStart').value = breakStart;
$('breakEnd').value = breakEnd;
if ($('teaBreakStart')) $('teaBreakStart').value = teaBreakStart;
if ($('teaBreakEnd')) $('teaBreakEnd').value = teaBreakEnd;
applyModeUI();
applyAlgoUI();
updateShiftSummary();
updateTechsStat();
updateB1Summary();
updateBusySummary();

// ---- Buttons ----
$('addTask').addEventListener('click', ()=>{ tasks.push({ name:`NRC ${tasks.length+1}`, hours:1.0, open:false }); renderTasks(); });
$('addTech').addEventListener('click', ()=>{ chosenScenario = ''; technicians.push(`Teknisyen ${technicians.length+1}`); techBlocks.push([]); normalizeTechPreAssignments(); techRoles.push('regular'); renderTechs(); renderTechBlocks(); });
$('resetTasks').addEventListener('click', ()=>{ if(confirm('Tüm işleri sıfırlamak?')){ tasks=[]; techPreAssignments=[]; renderTasks(); }});
$('resetTechs').addEventListener('click', ()=>{ if(confirm('Tüm teknisyenleri sıfırlamak?')){ chosenScenario = ''; technicians=[]; techBlocks=[]; techRoles=[]; techPreAssignments=[]; renderTechs(); renderTechBlocks(); }});
$('clearBreak').addEventListener('click', ()=>{ $('breakStart').value=''; $('breakEnd').value=''; breakStart=''; breakEnd=''; localStorage.removeItem('asdp_breakStart'); localStorage.removeItem('asdp_breakEnd'); updateShiftSummary(); updateTechsStat(); });
if ($('clearTeaBreak')) $('clearTeaBreak').addEventListener('click', ()=>{ $('teaBreakStart').value=''; $('teaBreakEnd').value=''; teaBreakStart=''; teaBreakEnd=''; localStorage.removeItem('asdp_teaBreakStart'); localStorage.removeItem('asdp_teaBreakEnd'); updateShiftSummary(); updateTechsStat(); });
$('addHeadBlock').addEventListener('click', ()=>{ headBlocks.push({start:'', end:''}); renderHeadBlocks(); });

$('addPreAssign').addEventListener('click', ()=>{
  normalizeTechPreAssignments();
  const techIndex = +$('preAssignTechSelect').value;
  const taskId = +$('preAssignTaskSelect').value;
  const start = $('preAssignStart').value;
  const end = $('preAssignEnd').value;
  if (!Number.isFinite(techIndex) || !Number.isFinite(taskId) || !start || !end || t2m(end) <= t2m(start)) { alert('Geçerli teknisyen, iş, başlangıç ve bitiş saati girin.'); return; }
  techPreAssignments[techIndex].push({taskId, start, end});
  $('preAssignStart').value = '';
  $('preAssignEnd').value = '';
  save('asdp_techPreAssigns', techPreAssignments);
  renderPreAssigns();
});

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
  save('asdp_techPreAssigns', techPreAssignments);
  renderTechBlocks();
});

document.querySelectorAll('input[name="planMode"]').forEach(r => r.addEventListener('change', e => {
  planMode = e.target.value;
  localStorage.setItem('asdp_planMode', planMode);
  applyModeUI();
  updateTechsStat();
}));

const sensitivityInput = $('sensitivity');
if (sensitivityInput) {
  sensitivityInput.addEventListener('input', e => {
    sensitivity = Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0));
    localStorage.setItem('asdp_sensitivity', String(sensitivity));
    applyAlgoUI();
  });
  // Çubuk bırakıldığında bir plan zaten gösteriliyorsa yeni hassasiyetle yeniden planlanır.
  sensitivityInput.addEventListener('change', () => {
    if (typeof window._asdpShowPlan === 'function') { savePlanInputs(); plan({ keepScroll: true }); }
  });
}

mainContainer.addEventListener('input', e => {
  const i = +e.target.dataset.i;
  const f = e.target.dataset.field;

  if (f === 'program-note') {
    programNote = e.target.value;
    localStorage.setItem('asdp_programNote', programNote);
    return;
  }


  if (f === 'preassign-start' || f === 'preassign-end') {
    const techIndex = +e.target.dataset.techP;
    const assignIndex = +e.target.dataset.assignI;
    normalizeTechPreAssignments();
    if (techPreAssignments[techIndex] && techPreAssignments[techIndex][assignIndex]) {
      if (f === 'preassign-start') techPreAssignments[techIndex][assignIndex].start = e.target.value;
      if (f === 'preassign-end') techPreAssignments[techIndex][assignIndex].end = e.target.value;
      save('asdp_techPreAssigns', techPreAssignments);
    }
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
      updateTechsStat();
  save('asdp_techPreAssigns', techPreAssignments);
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
    if (f === 'name') renderPreAssigns();
  }
  if (f === 'tech') {
    save('asdp_techs', technicians);
    renderTechBlockSelect();
    renderTechBlocks();
    renderPreAssigns();
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
    chosenScenario = '';
    techRoles[i] = e.target.value;
    save('asdp_techRoles', techRoles);
    updateTechsStat();
  }
});

mainContainer.addEventListener('click', e => {
  const delTask = e.target.closest('[data-del]');
  if(delTask){
    const delIdx = +delTask.dataset.del;
    tasks.splice(delIdx,1);
    // Manuel atamalardaki iş referanslarını yeni sıraya göre kaydır, silinen işe ait olanları kaldır.
    techPreAssignments = (techPreAssignments || []).map(list => (list || [])
      .filter(a => a.taskId !== delIdx)
      .map(a => a.taskId > delIdx ? { ...a, taskId: a.taskId - 1 } : a));
    save('asdp_techPreAssigns', techPreAssignments);
    renderTasks();
    return;
  }

  const delTech = e.target.closest('[data-deltech]');
  if(delTech){
    const idx = +delTech.dataset.deltech;
    chosenScenario = '';
    technicians.splice(idx,1);
    techBlocks.splice(idx,1);
    if (Array.isArray(techPreAssignments)) techPreAssignments.splice(idx,1);
    if (Array.isArray(techRoles)) techRoles.splice(idx,1);
    save('asdp_techBlocks', techBlocks);
  save('asdp_techPreAssigns', techPreAssignments);
    save('asdp_techRoles', techRoles);
    renderTechs(); renderTechBlocks();
    return;
  }


  const delPreAssign = e.target.closest('[data-delpreassign]');
  if(delPreAssign){
    const [techIndex, assignIndex] = delPreAssign.dataset.delpreassign.split(':').map(Number);
    normalizeTechPreAssignments();
    if (techPreAssignments[techIndex]) techPreAssignments[techIndex].splice(assignIndex, 1);
    save('asdp_techPreAssigns', techPreAssignments);
    renderPreAssigns();
    return;
  }
  const delTechBlock = e.target.closest('[data-deltechblock]');
  if(delTechBlock){
    const [techIndex, blockIndex] = delTechBlock.dataset.deltechblock.split(':').map(Number);
    normalizeTechBlocks();
    if (techBlocks[techIndex]) techBlocks[techIndex].splice(blockIndex, 1);
    save('asdp_techBlocks', techBlocks);
  save('asdp_techPreAssigns', techPreAssignments);
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

$('shiftStart').addEventListener('input', e=>{ shiftStart = e.target.value; localStorage.setItem('asdp_shiftStart', shiftStart); updateShiftSummary(); updateTechsStat(); });
$('shiftEnd').addEventListener('input', e=>{ shiftEnd = e.target.value; localStorage.setItem('asdp_shiftEnd', shiftEnd); updateShiftSummary(); updateTechsStat(); });
$('breakStart').addEventListener('input', e=>{ breakStart = e.target.value; localStorage.setItem('asdp_breakStart', breakStart); updateShiftSummary(); updateTechsStat(); });
$('breakEnd').addEventListener('input', e=>{ breakEnd = e.target.value; localStorage.setItem('asdp_breakEnd', breakEnd); updateShiftSummary(); updateTechsStat(); });
if ($('teaBreakStart')) $('teaBreakStart').addEventListener('input', e=>{ teaBreakStart = e.target.value; localStorage.setItem('asdp_teaBreakStart', teaBreakStart); updateShiftSummary(); updateTechsStat(); });
if ($('teaBreakEnd')) $('teaBreakEnd').addEventListener('input', e=>{ teaBreakEnd = e.target.value; localStorage.setItem('asdp_teaBreakEnd', teaBreakEnd); updateShiftSummary(); updateTechsStat(); });
$('headTech').addEventListener('input', e=>{ headTech = e.target.value; localStorage.setItem('asdp_head', headTech); updateB1Summary(); });

// Saat kutusuna tıklanınca saat seçiciyi hemen aç (sonradan eklenen saat alanları dahil).
document.addEventListener('click', e => {
  const el = e.target;
  if (el instanceof HTMLInputElement && el.type === 'time' && typeof el.showPicker === 'function') {
    try { el.showPicker(); } catch (_) {}
  }
});

// ============================================================
// Time helpers
// ============================================================
let _shiftS_real, _breaks = [], _totalBreakLen = 0, _workEnd_offset;

// İş-zamanı ofsetini gerçek saate çevirir. Mola sınırında başlangıç mola bitimine,
// bitiş ise mola başlangıcına eşlenir; böylece mola öncesi ve sonrası işler görselde
// yanlışlıkla üst üste binmez. edge: 'start' | 'end'.
function workToReal(workOffset, edge = 'start'){
  let real = _shiftS_real + workOffset;
  for (const b of _breaks) {
    const crossed = edge === 'end' ? real > b.s : real >= b.s;
    if (crossed) real += b.len;
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

// Gerçek saati iş-zamanına çevirir; vardiya dışını sınıra, mola içini mola sınırına oturtur.
function realToWorkClamp(realMin){
  const shiftEReal = _shiftS_real + _workEnd_offset + _totalBreakLen;
  const r = Math.min(Math.max(realMin, _shiftS_real), shiftEReal);
  let work = r - _shiftS_real;
  for (const b of _breaks) work -= Math.max(0, Math.min(r, b.e) - b.s);
  return Math.min(Math.max(0, work), _workEnd_offset);
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
        if(last.taskId === s.taskId && last.end === s.start && !!last.locked === !!s.locked){
          last.end = s.end;
        } else merged.push(s);
      }
    }
    tech.segments = merged;
    tech.totalMin = tech.segments.reduce((sum,s) => s.taskId === -1 ? sum : sum + (s.end - s.start), 0);
  });
}

// Denetim işe bağlıdır: taskId verilirse yalnızca o işte çalışan Supervisor'lerin aralıkları döner.
function buildSupervisorCoverage(techObjs, roles, taskId){
  const intervals = [];
  techObjs.forEach((tech, idx) => {
    if (roles[idx] !== 'supervisor') return;
    tech.segments.forEach(seg => {
      if (seg.taskId !== -1 && (taskId === undefined || seg.taskId === taskId)) intervals.push([seg.start, seg.end]);
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

function attributeSupervision(segStart, segEnd, techObjs, roles, technicians, taskId){
  const events = [];
  techObjs.forEach((tech, idx) => {
    if (roles[idx] !== 'supervisor') return;
    tech.segments.forEach(seg => {
      if (seg.taskId === -1 || seg.taskId !== taskId) return;
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
function repairCoverage(techObjs, roles){
  for (let iter = 0; iter < 300; iter++) {
    let target = null;
    for (let i = 0; i < techObjs.length; i++) {
      if (roles[i] !== 'regular') continue;
      const t = techObjs[i];
      for (const seg of t.segments) {
        if (seg.taskId === -1) continue;
        const gaps = findGaps(seg.start, seg.end, buildSupervisorCoverage(techObjs, roles, seg.taskId));
        if (gaps.length > 0) { target = { gap: gaps[0], taskId: seg.taskId }; break; }
      }
      if (target) break;
    }
    if (!target) return;
    if (!relocateSupervisorWork(techObjs, roles, target.gap[0], target.gap[1], target.taskId)) return;
  }
}

// Teknisyenlerin bu işte (aynı işte Supervisor olmadan) çalıştığı toplam dakika.
function uncoveredRegularMinutes(techObjs, roles, taskId){
  const cov = buildSupervisorCoverage(techObjs, roles, taskId);
  let total = 0;
  techObjs.forEach((t, i) => {
    if (roles[i] !== 'regular') return;
    t.segments.forEach(sg => {
      if (sg.taskId === taskId) findGaps(sg.start, sg.end, cov).forEach(([a, b]) => { total += b - a; });
    });
  });
  return total;
}

// Supervisor parçasının sonunu newEnd'e çekmek aynı işteki bir Teknisyeni denetimsiz bırakır mı?
function shrinkBreaksSupervision(techObjs, roles, tech, seg, newEnd){
  if (roles[tech.index] !== 'supervisor' || seg.taskId === -1) return false;
  const before = uncoveredRegularMinutes(techObjs, roles, seg.taskId);
  const oldEnd = seg.end;
  seg.end = Math.max(seg.start, newEnd);
  const after = uncoveredRegularMinutes(techObjs, roles, seg.taskId);
  seg.end = oldEnd;
  return after > before;
}

// Bir Supervisor'ün aynı işteki parçasından 15dk'yı Teknisyenin denetimsiz kaldığı ana kaydırır.
function relocateSupervisorWork(techObjs, roles, gapStart, gapEnd, taskId){
  const slot = Math.min(15, gapEnd - gapStart);
  if (slot < 15) return false;

  for (let i = 0; i < techObjs.length; i++) {
    if (roles[i] !== 'supervisor') continue;
    const sup = techObjs[i];

    if (!isFreeRange(sup, gapStart, gapStart + slot)) continue;

    const seg = sup.segments
      .filter(s => s.taskId === taskId && !s.locked)
      .filter(s => !(s.start < gapStart + slot && s.end > gapStart))
      .filter(s => s.end - s.start >= slot)
      .sort((a, b) => (a.end - a.start) - (b.end - b.start))
      .find(s => !shrinkBreaksSupervision(techObjs, roles, sup, s, s.end - slot));
    if (!seg) continue;

    seg.end -= slot;
    if (seg.end <= seg.start) sup.segments = sup.segments.filter(s => s !== seg);
    sup.segments.push({ start: gapStart, end: gapStart + slot, taskId, taskName: seg.taskName });
    sup.segments.sort((a,b)=>a.start - b.start);
    return true;
  }
  return false;
}

// Grup modunda her Teknisyen parçası, aynı işte ve birebir aynı saat aralığında çalışan bir Supervisor
// parçasıyla eşleşir. Plan zaten böyle kurulmuşsa hiçbir şey bölünmez; farklı sınırlara sahip bloklar
// (ör. Supervisor 08:00-09:15, Teknisyen 08:00-09:00) yalnızca birbirini denetleyen blok kümesi
// içinde, birbirinin sınırlarından bölünür. Çalışılan zaman, kişi yükleri ve iş toplamları değişmez;
// yalnızca bitişik parçalar artık birleştirilmez. Fazladan denetleyen Supervisor'ler ve Kalifiyeli
// parçaları bölünmez. Plan tamamlandıktan sonra, çıktıdan hemen önce çağrılmalıdır.
function alignSupervisionPieces(techObjs, roles){
  const byTask = new Map();
  techObjs.forEach((tech, idx) => tech.segments.forEach(seg => {
    if (seg.taskId == null || seg.taskId === -1) return;
    if (!byTask.has(seg.taskId)) byTask.set(seg.taskId, []);
    byTask.get(seg.taskId).push({ seg, role: roles[idx] });
  }));

  const cutsOf = new Map(); // seg -> bölme noktaları
  byTask.forEach(items => {
    const regs = items.filter(x => x.role === 'regular');
    const sups = items.filter(x => x.role === 'supervisor');
    if (!regs.length || !sups.length) return;

    const parent = new Map();
    const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const join = (a, b) => parent.set(find(a), find(b));
    items.forEach(x => parent.set(x, x));

    // 1) Birebir aynı aralıkta Supervisor parçası olan Teknisyen parçaları bölünmeden eşleşir.
    const used = new Set();
    const pending = [];
    regs.forEach(r => {
      const exact = sups.find(x => x.seg.start === r.seg.start && x.seg.end === r.seg.end);
      if (exact) { join(r, exact); used.add(exact); } else pending.push(r);
    });
    // 2) Kalanlara tek bir Supervisor parçası atanır (en az fazlalıklı, daha önce atananlar tercih edilir);
    //    tek parça yetmiyorsa en uzağa uzanan Supervisor parçaları zincirlenir.
    pending.sort((a, b) => (b.seg.end - b.seg.start) - (a.seg.end - a.seg.start));
    pending.forEach(r => {
      const whole = sups.filter(x => x.seg.start <= r.seg.start && x.seg.end >= r.seg.end)
        .sort((a, b) => (used.has(b) - used.has(a)) || ((a.seg.end - a.seg.start) - (b.seg.end - b.seg.start)));
      if (whole.length) { join(r, whole[0]); used.add(whole[0]); return; }
      let cursor = r.seg.start;
      while (cursor < r.seg.end) {
        let best = null;
        for (const x of sups) {
          if (x.seg.start > cursor || x.seg.end <= cursor) continue;
          if (!best || used.has(x) > used.has(best) || (used.has(x) === used.has(best) && x.seg.end > best.seg.end)) best = x;
        }
        if (!best) break;
        join(r, best); used.add(best); cursor = best.seg.end;
      }
    });

    // 3) Her küme yalnızca kendi bloklarının sınırlarından bölünür.
    const groupPoints = new Map();
    items.forEach(x => {
      const g = find(x);
      if (!groupPoints.has(g)) groupPoints.set(g, { members: [], points: new Set() });
      const entry = groupPoints.get(g);
      entry.members.push(x);
      entry.points.add(x.seg.start); entry.points.add(x.seg.end);
    });
    groupPoints.forEach(({ members, points }) => {
      if (members.length < 2) return;
      const sorted = [...points].sort((a, b) => a - b);
      members.forEach(x => {
        const inner = sorted.filter(p => p > x.seg.start && p < x.seg.end);
        if (inner.length) cutsOf.set(x.seg, inner);
      });
    });
  });
  if (!cutsOf.size) return;

  techObjs.forEach(tech => {
    const out = [];
    tech.segments.forEach(seg => {
      const inner = cutsOf.get(seg);
      if (!inner) { out.push(seg); return; }
      let from = seg.start;
      inner.concat(seg.end).forEach(to => { out.push({ ...seg, start: from, end: to }); from = to; });
    });
    tech.segments = out.sort((a, b) => a.start - b.start);
  });
}

// ============================================================
// Plan
// ============================================================
function savePlanInputs(){
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
  save('asdp_techPreAssigns', techPreAssignments);
}

$('planBtn').addEventListener('click', ()=>{
  savePlanInputs();
  plan();
});

// Senaryo seçimi: sonuç yeniden hesaplanmaz, hesaplanmış senaryolardan biri gösterilir. '' = otomatik (önerilen).
window.selectScenario = function(key) {
  chosenScenario = key || '';
  if (typeof window._asdpShowPlan === 'function') window._asdpShowPlan({ keepScroll: true });
};

function plan(opts){
  opts = opts || {};
  const startScrollY = window.scrollY; // sonuç alanı temizlenmeden önceki kaydırma konumu
  window._asdpShowPlan = null;
  resultsDiv.innerHTML = '';

  const dupes = checkDuplicateTaskNames();
  if (dupes.length > 0) {
    renderDupeWarning();
    resultsDiv.innerHTML = `<div class="warning"><strong>⛔ Plan Oluşturulamadı: Mükerrer İş İsmi Var</strong><br>
      <div class="small" style="color:var(--danger);margin-top:6px">İşler listesinde birden fazla aynı isim kullanılmış. Önce isimleri benzersiz hale getirin.</div></div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const inputErrors = [];
  if (!Array.isArray(tasks) || tasks.length === 0) inputErrors.push('En az bir iş tanımlanmalı.');
  (Array.isArray(tasks) ? tasks : []).forEach((task, i) => {
    const name = String(task?.name ?? '').trim();
    const rawHours = task?.hours;
    const hours = (rawHours == null || String(rawHours).trim() === '') ? NaN : Number(rawHours);
    if (!name) inputErrors.push(`${i + 1}. işin tanımı boş.`);
    if (!Number.isFinite(hours) || hours < 0) {
      inputErrors.push(`${name || `${i + 1}. iş`} için süre sıfır veya pozitif bir sayı olmalı; boş bırakılamaz.`);
    } else if (Math.abs(hours * 4 - Math.round(hours * 4)) > 1e-8) {
      inputErrors.push(`${name || `${i + 1}. iş`} süresi 15 dakikalık artışlarla girilmeli (0,25 saat katları).`);
    }
  });
  if (Array.isArray(tasks) && tasks.length && tasks.every(task => !(Number(task?.hours) > 0))) {
    inputErrors.push('En az bir işin süresi sıfırdan büyük olmalı.');
  }
  if (!Array.isArray(technicians) || technicians.length === 0) inputErrors.push('En az bir teknisyen olmalı.');
  const techNameCounts = new Map();
  (Array.isArray(technicians) ? technicians : []).forEach((name, i) => {
    const normalized = String(name ?? '').trim().toLocaleLowerCase('tr-TR');
    if (!normalized) inputErrors.push(`${i + 1}. teknisyenin adı boş.`);
    else techNameCounts.set(normalized, (techNameCounts.get(normalized) || 0) + 1);
  });
  const repeatedTechNames = [...techNameCounts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
  if (repeatedTechNames.length) inputErrors.push(`Teknisyen adları benzersiz olmalı: ${repeatedTechNames.join(', ')}.`);
  if (inputErrors.length) {
    resultsDiv.innerHTML = `<div class="warning"><strong>⛔ Plan oluşturulamadı: girişleri düzeltin</strong>${inputErrors.map(message => `<div class="small">• ${escHtml(message)}</div>`).join('')}</div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if(!$('shiftStart').value || !$('shiftEnd').value){ resultsDiv.innerHTML = `<div class="warning">Vardiya başlangıç/bitiş saatlerini girin.</div>`; $('shiftDetails').open = true; return; }

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
  const breakErrors = [];
  const breakPairs = [
    { label: 'Yemek molası', start: $('breakStart').value, end: $('breakEnd').value },
    { label: 'Çay molası', start: $('teaBreakStart')?.value || '', end: $('teaBreakEnd')?.value || '' }
  ];
  for (const item of breakPairs) {
    if (!!item.start !== !!item.end) {
      breakErrors.push(`${item.label}: başlangıç ve bitiş birlikte girilmeli.`);
      continue;
    }
    if (!item.start && !item.end) continue;
    const start = t2m(item.start), end = t2m(item.end);
    if (start === null || end === null || end <= start) {
      breakErrors.push(`${item.label}: bitiş başlangıçtan sonra olmalı; gece yarısını aşan aralık desteklenmiyor.`);
      continue;
    }
    if (start < _shiftS_real || end > shiftE_real) {
      breakErrors.push(`${item.label}: mola vardiya içinde olmalı (${m2t(_shiftS_real)}–${m2t(shiftE_real)}).`);
      continue;
    }
    _breaks.push({ s: start, e: end, len: end - start, label: item.label });
  }
  _breaks.sort((a,b)=>a.s - b.s);
  for (let i = 1; i < _breaks.length; i++) {
    if (_breaks[i].s < _breaks[i - 1].e) {
      breakErrors.push(`${_breaks[i - 1].label} ile ${_breaks[i].label} çakışıyor. Molaları çakışmayacak şekilde düzeltin.`);
    }
  }
  if (breakErrors.length) {
    resultsDiv.innerHTML = `<div class="warning"><strong>⛔ Mola saatleri geçersiz</strong>${breakErrors.map(message => `<div class="small">• ${escHtml(message)}</div>`).join('')}</div>`;
    $('shiftDetails').open = true;
    return;
  }
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
      const s_work = realToWorkClamp(s_real);
      const e_work = realToWorkClamp(e_real);
      if (e_work > s_work) valid.push({ start: s_work, end: e_work });
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
  let totalCapacityMin = techFreeCapacities.reduce((sum, cap) => sum + cap, 0);

  let rawTasks = tasks.map((t, idx) => {
    const inputHours = parseFloat(t.hours) || 0;
    const rawMin = Math.round(inputHours * 60);
    const headAlloc = Math.min(HEAD_MIN, rawMin);
    const techWorkMin = Math.max(0, rawMin - headAlloc);
    return { id: idx, name: t.name, inputHours, rawMin, headAlloc, isOpen: !!t.open,
      requestedTechWorkMin: techWorkMin,
      techWorkMinOriginal: techWorkMin, techWorkMinBeforeRound: techWorkMin, techWorkMin };
  });

  // ---- Manuel (önceden) iş atamaları: sabit, algoritma bunları taşımaz ----
  normalizeTechPreAssignments();
  const validPreAssigns = technicians.map(() => []);
  const techPreAssignMinutes = technicians.map(() => 0);
  const preAssignWarnings = [];
  techPreAssignments.forEach((assigns, techIndex) => {
    if (!validPreAssigns[techIndex]) return;
    const techName = technicians[techIndex] || ('Teknisyen ' + (techIndex + 1));
    (assigns || []).forEach(assign => {
      const rt = rawTasks[assign.taskId];
      const label = `${escHtml(techName)} – ${escHtml(rt ? rt.name : 'Silinmiş iş')} (${escHtml(assign.start || '?')}-${escHtml(assign.end || '?')})`;
      if (!rt) { preAssignWarnings.push(`${label}: iş listede yok, atlandı.`); return; }
      const assignStartReal = t2m(assign.start);
      const assignEndReal = t2m(assign.end);
      if (assignStartReal === null || assignEndReal === null || assignEndReal <= assignStartReal) {
        preAssignWarnings.push(`${label}: başlangıç/bitiş saatleri geçersiz, atlandı.`);
        return;
      }
      if (assignStartReal < _shiftS_real || assignEndReal > shiftE_real) {
        preAssignWarnings.push(`${label}: manuel atama vardiya dışına taşıyor; blok kırpılmadan atlandı.`);
        return;
      }
      const valid = normalizeWorkBlocks([assign]);
      if (valid.length === 0) { preAssignWarnings.push(`${label}: vardiya dışında veya tamamen molada, atlandı.`); return; }
      const { start, end } = valid[0];
      const clash = techBusyBlocks[techIndex].some(b => start < b.end && end > b.start)
        || validPreAssigns[techIndex].some(p => start < p.end && end > p.start);
      if (clash) { preAssignWarnings.push(`${label}: dolu saat veya başka bir manuel atamayla çakışıyor, atlandı.`); return; }
      validPreAssigns[techIndex].push({ start, end, taskId: assign.taskId });
    });
  });

  validPreAssigns.forEach((assigns, techIndex) => {
    assigns.forEach(assign => {
      const dur = assign.end - assign.start;
      const rt = rawTasks[assign.taskId];
      rt.techWorkMinOriginal = Math.max(0, rt.techWorkMinOriginal - dur);
      rt.techWorkMinBeforeRound = rt.techWorkMinOriginal;
      rt.techWorkMin = rt.techWorkMinOriginal;
      rt.preAssignedMin = (rt.preAssignedMin || 0) + dur;
      techPreAssignMinutes[techIndex] += dur;
      techFreeCapacities[techIndex] = Math.max(0, techFreeCapacities[techIndex] - dur);
    });
  });
  const manualOverAssignmentWarnings = rawTasks
    .filter(task => (task.preAssignedMin || 0) > (task.isOpen ? task.rawMin : task.requestedTechWorkMin))
    .map(task => {
      const target = task.isOpen ? task.rawMin : task.requestedTechWorkMin;
      return `${escHtml(task.name)}: sabit manuel atamalar, işin teknisyen işçilik hedefini ${minutesToHoursStr((task.preAssignedMin || 0) - target)} saat aşıyor. Sabit bloklar korunmuştur; toplam atama tahmini aşabilir.`;
    });

  totalCapacityMin = techFreeCapacities.reduce((sum, cap) => sum + cap, 0);

  // Tahmini işçilik süreleri kapasite aşıldığında otomatik küçültülmez. Kalan açık,
  // sonuçlarda raporlanır; girilen süreyi sessizce değiştirmek yanıltıcı olur.
  let capacityExceeded = false;
  const roundingAdjustments = [];
  rawTasks.forEach(task => {
    if (task.techWorkMin <= 0) return;
    if (task.isOpen) {
      task.techWorkMinBeforeRound = task.techWorkMinOriginal;
      // A fully covered OPEN task must not receive a phantom 15-minute segment.
      // For a positive remainder, round to the existing 15-minute planning grid.
      task.techWorkMin = task.techWorkMinOriginal > 0
        ? Math.max(15, ceil15x(task.techWorkMinOriginal))
        : 0;
      return;
    }
    const before = task.techWorkMin;
    let rounded = ceil15x(before);
    task.techWorkMin = rounded;
    const diff = rounded - task.techWorkMinBeforeRound;
    if (diff !== 0) roundingAdjustments.push({ name: task.name, before: task.techWorkMinBeforeRound, after: rounded, diff });
  });
  // İşin teknisyenlere verilecek toplam hedefi (manuel atamalar dahil); kalan süre hesabı buna göre yapılır.
  // Manuel atama işin bütçesini aşıyorsa hedef, girilen tahmini aşamaz.
  rawTasks.forEach(task => { task.techTargetMin = Math.min(task.techWorkMin + (task.preAssignedMin || 0), ceil15x(task.requestedTechWorkMin)); });
  const mandatoryAfterRound = rawTasks.filter(t => !t.isOpen).reduce((sum, t) => sum + t.techWorkMin, 0);
  capacityExceeded = mandatoryAfterRound > totalCapacityMin;

  // Süresi olan tek bir iş kartı varsa iş tüm personele eşit paylaştırılır (scheduleSingleTaskEqually);
  // eşitliği bozacak ekip bölümü ve hedef bitiş kaydırması bu durumda uygulanmaz.
  const activeTasks = rawTasks.filter(t => t.rawMin > 0);
  const singleTask = activeTasks.length === 1 ? activeTasks[0] : null;
  const sens = Math.min(1, Math.max(0, (Number(sensitivity) || 0) / 100)); // hassasiyet çubuğu, 0..1

  // Bir senaryo (ekip düzeni) için tüm planı kurar: dağıtım, B1 onayları, denetim kuralı ve birebir eşleştirme.
  // Girdiler ve kapasite hesabı senaryodan bağımsızdır; senaryoya özgü her şey burada yeniden oluşturulur.
  function buildScenario(spec){
    const crews = spec.crews;
    const scenarioWarnings = preAssignWarnings.slice();
    const techObjs = technicians.map((name, index) => ({
      name, index,
      role: isGroup ? (techRoles[index] || 'regular') : 'all',
      segments: [], totalMin: 0,
      busyMin: (techBusyMinutes[index] || 0) + (techPreAssignMinutes[index] || 0),
      freeCapacity: techFreeCapacities[index] || 0
    }));
    techBusyBlocks.forEach((blocks, techIndex) => {
      const tech = techObjs[techIndex];
      if (!tech) return;
      blocks.forEach(block => tech.segments.push({ start: block.start, end: block.end, taskId: -1, taskName: 'DOLU' }));
    });

    validPreAssigns.forEach((assigns, techIndex) => {
      const tech = techObjs[techIndex];
      if (!tech) return;
      assigns.forEach(assign => {
         const taskName = rawTasks[assign.taskId] ? rawTasks[assign.taskId].name : 'İş';
         tech.segments.push({ start: assign.start, end: assign.end, taskId: assign.taskId, taskName: taskName, locked: true });
         tech.totalMin += (assign.end - assign.start);
      });
    });

    const tasksCopy = rawTasks.map(t => ({ ...t }));
    const taskSegments = new Map();
    tasksCopy.forEach(t => taskSegments.set(t.id, []));
    const unallocated = [];

    let equalShare = null;

    tasksCopy.sort((a, b) => b.techWorkMin - a.techWorkMin);

    // ============================================================
    // Ekip tabanlı dağıtım çekirdeği
    // ------------------------------------------------------------
    // Bir senaryoda teknisyenler sabit ekiplere (gruplara) bölünür; her teknisyen yalnızca tek bir ekipte
    // yer alır. Zaman 15 dk'lık hücrelere bölünür ve bir iş parçası bir ekibin hücrelerine yerleşir: o
    // hücrede ekibin müsait üyeleri aynı işi aynı saatte yapar. Grup modunda bir Teknisyen yalnızca aynı
    // hücrede aynı işi yapan bir Supervisor ile birlikte iş alır; denetimsiz yerleşim hiçbir adımda yapılmaz.
    //  1) Dağıtım   : işler (büyükten küçüğe) ekiplere kapasiteleri oranında verilir; sığmayan iş bölünür.
    //  2) Doğal sıra: her ekip kendi işlerini küçükten büyüğe, vardiya başından itibaren yapar; işin doğal bitişi bulunur.
    //  3) Hassasiyet: işin bitiş hedefi, doğal bitişten eşit aralıklı B1 onay hedefine doğru hassasiyet oranında
    //                 kaydırılır (0 = teknisyen eşitliği / doğal sıra, 1 = düzenli B1 onayları).
    //  4) Yerleşim  : işler hedef bitişlerine göre sırayla, hedeften geriye doğru en geç boş hücrelere yerleştirilir;
    //                 böylece iş tam hedef saatinde biter ve B1 onayı oraya oturur.
    // Harcanan süre hiçbir zaman işin kalan işçilik bütçesini (techWorkMin) aşmaz; sığmayan kısım atanamayan olarak raporlanır.
    // ============================================================
    const CELL = 15;
    const GRID_K = Math.floor(_workEnd_offset / CELL);
    const MIN_RUN = 2;
    const FIT_SLACK = 2;
    const roleOf = i => techObjs[i].role;
    const b1Blocks = normalizeWorkBlocks(load('asdp_headBlocks', []));
    const b1Blocked = f => b1Blocks.some(b => (f - 1) * CELL < b.end && f * CELL > b.start);

    function makeGrid(){
      return {
        occ: techObjs.map(t => {
          const a = new Uint8Array(GRID_K);
          for (let k = 0; k < GRID_K; k++) if (!isFreeRange(t, k * CELL, (k + 1) * CELL)) a[k] = 1;
          return a;
        }),
        load: techObjs.map(t => t.totalMin / CELL)
      };
    }
    const cloneGrid = g => ({ occ: g.occ.map(a => a.slice()), load: g.load.slice() });

    // k hücresinde ekibin kullanılabilir üyeleri: müsait olanlar; Grup modunda ekipte müsait Supervisor yoksa Teknisyenler çıkar.
    function usableAt(grid, crew, k){
      const free = [];
      let hasSup = false;
      for (const p of crew) {
        if (grid.occ[p][k]) continue;
        free.push(p);
        if (roleOf(p) === 'supervisor') hasSup = true;
      }
      if (!isGroup || hasSup) return free;
      return free.filter(p => roleOf(p) !== 'regular');
    }

    // Hücrede çalışacak üyeler: yeterli kişi varsa hepsi; azsa önce önceki hücredeki ekip (süreklilik), sonra en az yüklü olanlar.
    // Grup modunda Teknisyen seçildiyse seçime bir Supervisor girer. Hücrede kalan Teknisyenler Supervisor'süz kalıp boşa
    // çıkmasın diye: tek Supervisor kalıyorsa önce Teknisyenler alınır (onsuz çalışamazlar) ya da seçim Supervisor'süz
    // Kalifiyelilerden yapılır; birden çok Supervisor varsa fazladan Supervisor alınmaz (diğeri başka işte denetleyebilsin).
    function pickParticipants(grid, usable, need, prev){
      if (need >= usable.length) return usable.slice();
      const ord = usable.slice().sort((a, b) => (prev.has(b) - prev.has(a)) || (grid.load[a] - grid.load[b]) || (a - b));
      if (!isGroup) return ord.slice(0, need);
      const sups = ord.filter(p => roleOf(p) === 'supervisor');
      const regs = ord.filter(p => roleOf(p) === 'regular');
      if (!regs.length) return ord.slice(0, need);
      const quals = ord.filter(p => roleOf(p) === 'qualified');
      // Supervisor'lü seçim: bir Supervisor + (tek Supervisor kaldıysa önce Teknisyenler) + diğerleri.
      const others = sups.length === 1 ? regs.concat(quals) : ord.filter(p => roleOf(p) !== 'supervisor');
      const withSup = [sups[0]].concat(others.slice(0, need - 1));
      for (const p of ord) { if (withSup.length >= need) break; if (!withSup.includes(p)) withSup.push(p); }
      const stranded = sups.length === 1 ? regs.filter(r => !withSup.includes(r)).length : 0;
      if (stranded > 0 && quals.length >= need) return quals.slice(0, need);
      return withSup;
    }

    // units (15 dk'lık kişi-birimi) kadar işi ekibin hücrelerine yerleştirir.
    //  dir 'fwd': vardiya başından ileri doğru; dir 'bwd': bound hücresinden geriye doğru (olmazsa bound'dan sonrasına).
    // Kısa (MIN_RUN'dan az) boşluklar önce atlanır; böylece iş mümkün olduğunca ardışık hücrelerde toplanır.
    function placePiece(grid, crew, units, dir, bound, onCell){
      const none = { placed: 0, first: -1, last: -1 };
      if (units <= 0 || !crew.length || GRID_K <= 0) return none;
      const caps = [];
      let maxCap = 0;
      for (let k = 0; k < GRID_K; k++) { const u = usableAt(grid, crew, k); caps.push(u); if (u.length > maxCap) maxCap = u.length; }
      if (!maxCap) return none;
      const minRun = Math.min(MIN_RUN, Math.ceil(units / maxCap));
      const runs = [];
      for (let k = 0; k < GRID_K;) {
        if (!caps[k].length) { k++; continue; }
        let b = k;
        while (b < GRID_K && caps[b].length) b++;
        runs.push([k, b]);
        k = b;
      }
      let seq;
      if (dir === 'fwd') {
        seq = runs.map(([a, b], i) => ({ a, b, asc: true, exempt: i === 0 }));
      } else {
        const below = [], above = [];
        runs.forEach(([a, b]) => {
          if (a < bound) below.push({ a, b: Math.min(b, bound), asc: false, exempt: b >= bound });
          if (b > bound) above.push({ a: Math.max(a, bound), b, asc: true, exempt: false });
        });
        seq = below.reverse().concat(above);
      }
      let rem = units, first = Infinity, last = -1, prevK = -10, prevSet = new Set();
      const take = k => {
        const u = usableAt(grid, crew, k);
        if (!u.length) return;
        const ps = pickParticipants(grid, u, rem, Math.abs(k - prevK) === 1 ? prevSet : new Set());
        if (!ps.length) return;
        ps.forEach(p => { grid.occ[p][k] = 1; grid.load[p] += 1; onCell(p, k); });
        rem -= ps.length;
        prevK = k; prevSet = new Set(ps);
        if (k < first) first = k;
        if (k > last) last = k;
      };
      for (const strict of [true, false]) {
        for (const run of seq) {
          if (rem <= 0) break;
          if (strict && !run.exempt && run.b - run.a < minRun) continue;
          if (run.asc) { for (let k = run.a; k < run.b && rem > 0; k++) take(k); }
          else { for (let k = run.b - 1; k >= run.a && rem > 0; k--) take(k); }
        }
        if (rem <= 0) break;
      }
      return { placed: units - rem, first: last < 0 ? -1 : first, last };
    }

    const freeUnits = (grid, crew) => { let s = 0; for (let k = 0; k < GRID_K; k++) s += usableAt(grid, crew, k).length; return s; };

    // Adım 1: işleri ekiplere paylaştır. Her ekibe kapasitesi oranında yük düşer (kişi başı yük eşitlenir);
    // iş mümkünse bölünmeden tek ekibe verilir, sığmayan iş en az sayıda ekibe bölünür.
    function planAllocation(jobs, grid){
      const capU = crews.map(crew => freeUnits(grid, crew));
      const capSum = capU.reduce((a, b) => a + b, 0);
      const totalU = jobs.reduce((a, j) => a + j.units, 0);
      const target = capU.map(c => (capSum ? totalU * c / capSum : 0));
      const assigned = crews.map(() => 0);
      const alloc = new Map();
      jobs.slice().sort((a, b) => b.units - a.units || a.id - b.id).forEach(j => {
        let need = j.units;
        const parts = [];
        const room = c => Math.max(0, capU[c] - assigned[c]);
        const fit = crews.map((_, c) => c)
          .filter(c => room(c) >= need && target[c] - assigned[c] >= need - FIT_SLACK)
          .sort((a, b) => (target[a] - assigned[a]) - (target[b] - assigned[b]) || a - b)[0];
        if (fit !== undefined) {
          parts.push({ c: fit, units: need });
          assigned[fit] += need;
          need = 0;
        } else {
          const order = crews.map((_, c) => c).sort((a, b) => (target[b] - assigned[b]) - (target[a] - assigned[a]) || a - b);
          for (const pass of [0, 1]) {
            for (const c of order) {
              if (need <= 0) break;
              const cap = pass === 0 ? Math.min(room(c), Math.max(0, Math.ceil(target[c] - assigned[c] - 1e-9))) : room(c);
              const takeU = Math.min(need, cap);
              if (takeU <= 0) continue;
              const ex = parts.find(p => p.c === c);
              if (ex) ex.units += takeU; else parts.push({ c, units: takeU });
              assigned[c] += takeU;
              need -= takeU;
            }
          }
        }
        alloc.set(j.id, { parts, leftover: need });
      });
      return alloc;
    }

    // Adım 2: her ekip işlerini küçükten büyüğe, vardiya başından itibaren yapsaydı işlerin bitiş hücreleri (doğal bitiş).
    function naturalPass(jobs, alloc, grid){
      const g = cloneGrid(grid);
      const fin = new Map();
      crews.forEach((crew, c) => {
        const pieces = [];
        jobs.forEach(j => { (alloc.get(j.id)?.parts || []).forEach(p => { if (p.c === c) pieces.push({ job: j, units: p.units }); }); });
        pieces.sort((x, y) => x.job.units - y.job.units || x.job.id - y.job.id);
        pieces.forEach(pc => {
          const r = placePiece(g, crew, pc.units, 'fwd', 0, () => {});
          if (r.placed > 0) fin.set(pc.job.id, Math.max(fin.get(pc.job.id) || 0, r.last + 1));
        });
      });
      return fin;
    }

    // Adım 3: bitiş hedefleri. Doğal bitişler sırasıyla eşit aralıklı hedeflere (son iş değişmez) sens oranında yaklaştırılır;
    // hedef hiçbir zaman doğal bitişten erken olmaz (erken hedef yerleştirilemeyeceği için). sens küçükse hedef = doğal bitiş.
    function computeDeadlines(jobs, fin){
      const list = jobs.filter(j => fin.has(j.id)).map(j => ({ j, n: fin.get(j.id) }))
        .sort((a, b) => a.n - b.n || a.j.units - b.j.units || a.j.id - b.j.id);
      const cnt = list.length;
      const tEnd = cnt ? Math.max(...list.map(x => x.n)) : 0;
      const f = list.map((x, r) => Math.min(GRID_K, x.n + Math.round(sens * Math.max(0, Math.ceil(tEnd * (r + 1) / cnt) - x.n))));
      if (sens > 0.15) {
        // B1 onayları (işin son hücresi) üst üste binmesin ve B1'in dolu saatine denk gelmesin.
        let prev = 0;
        for (let r = 0; r < cnt; r++) {
          let v = Math.max(f[r], list[r].n);
          while ((v <= prev || b1Blocked(v)) && v < GRID_K) v++;
          f[r] = v; prev = v;
        }
        for (let r = cnt - 2; r >= 0; r--) {
          if (f[r] >= f[r + 1]) { const alt = Math.max(list[r].n, f[r + 1] - 1); if (!b1Blocked(alt)) f[r] = alt; }
        }
      }
      const out = new Map();
      list.forEach((x, r) => out.set(x.j.id, f[r]));
      return out;
    }

    const recFor = job => (p, k) => {
      const start = k * CELL;
      techObjs[p].segments.push({ start, end: start + CELL, taskId: job.task.id, taskName: job.task.name });
      techObjs[p].totalMin += CELL;
      taskSegments.get(job.task.id).push({ techIndex: p, start, end: start + CELL });
    };

    // Adım 4: hedef bitişe göre sıralı, geriye doğru yerleşim. Ekip kapasitesi yetmeyen kısım diğer ekiplerin boşluklarına taşar.
    function scheduleCrewPlan(mandatoryList, openList){
      const grid = makeGrid();
      const toJob = t => ({ id: t.id, task: t, units: Math.floor(t.techWorkMin / CELL) });
      const jobs = mandatoryList.filter(t => t.techWorkMin >= CELL).map(toJob);
      if (jobs.length) {
        const alloc = planAllocation(jobs, grid);
        const deadlines = computeDeadlines(jobs, naturalPass(jobs, alloc, grid));
        const bound = j => (deadlines.has(j.id) ? deadlines.get(j.id) : GRID_K);
        jobs.slice().sort((a, b) => bound(a) - bound(b) || b.units - a.units || a.id - b.id).forEach(j => {
          const a = alloc.get(j.id);
          let left = a.leftover;
          a.parts.forEach(pt => {
            left += pt.units - placePiece(grid, crews[pt.c], pt.units, 'bwd', bound(j), recFor(j)).placed;
          });
          if (left > 0) {
            const order = crews.map((_, c) => c).sort((x, y) => freeUnits(grid, crews[y]) - freeUnits(grid, crews[x]) || x - y);
            for (const c of order) {
              if (left <= 0) break;
              left -= placePiece(grid, crews[c], left, 'bwd', bound(j), recFor(j)).placed;
            }
          }
          if (left > 0) unallocated.push({ taskId: j.task.id, task: j.task.name, minutes: left * CELL, reason: 'Teknisyen kapasitesi doldu; mümkün olan kısım teknisyenlere dağıtıldı' });
        });
      }
      // OPEN işler zorunlu işlerden sonra, kalan boşluklara ekip halinde ve vardiya başından itibaren yerleşir.
      const openJobs = openList.filter(t => t.techWorkMin >= CELL).map(toJob).sort((a, b) => a.units - b.units || a.id - b.id);
      if (openJobs.length) {
        const alloc = planAllocation(openJobs, grid);
        openJobs.forEach(j => {
          const a = alloc.get(j.id);
          let left = a.leftover;
          a.parts.forEach(pt => { left += pt.units - placePiece(grid, crews[pt.c], pt.units, 'fwd', 0, recFor(j)).placed; });
          for (const c of crews.map((_, i) => i)) {
            if (left <= 0) break;
            left -= placePiece(grid, crews[c], left, 'fwd', 0, recFor(j)).placed;
          }
        });
      }
    }
    // ============================================================
    // Tek iş kartı: iş tüm personele eşit paylaştırılır.
    // ------------------------------------------------------------
    // Pay 15dk'lık birimlerle dağıtılır; sıradaki 15dk her zaman o işte en az
    // süresi olana gider (manuel atanmış süre kişinin payına sayılır). İşçilik
    // tahmini hiçbir zaman dengeleme amacıyla artırılmaz; yuvarlama ve kapasite
    // farkları raporlanır. Herkes mümkün olduğunca aynı saatlerde birlikte çalışır.
    // Grup modunda Teknisyen
    // yalnızca aynı işte Supervisor'ün çalıştığı dilimleri alabilir; alamadığı
    // pay diğer personele geçer (denetim kuralı eşitlikten önce gelir).
    // ============================================================
    function scheduleSingleTaskEqually(task){
      const SLOT = 15;
      const K = Math.floor(_workEnd_offset / SLOT);
      const n = techObjs.length;
      const ids = techObjs.map((_, i) => i);
      const isSup = i => isGroup && techObjs[i].role === 'supervisor';
      const isReg = i => isGroup && techObjs[i].role === 'regular';
      const rank = i => isSup(i) ? 0 : isReg(i) ? 2 : 1;
      const overlapsSlot = (s, k) => s.start < (k + 1) * SLOT && s.end > k * SLOT;

      const pre = techObjs.map(t => t.segments.reduce((sum, s) => (s.locked && s.taskId === task.id) ? sum + (s.end - s.start) : sum, 0));
      const free = techObjs.map(t => Array.from({ length: K }, (_, k) => isFreeRange(t, k * SLOT, (k + 1) * SLOT)));
      const initialCaps = free.map(f => f.filter(Boolean).length * SLOT);
      const work = task.isOpen
        ? floor15(Math.max(0, Math.max(15, ceil15x(task.rawMin)) - (task.preAssignedMin || 0)))
        : task.techWorkMin;

      // Supervisor'ün manuel atamasıyla zaten denetlenen dilimler ve denetim bekleyen manuel Teknisyen dilimleri.
      const supLockedAt = Array.from({ length: K }, (_, k) => ids.some(i => isSup(i) &&
        techObjs[i].segments.some(s => s.locked && s.taskId === task.id && s.start <= k * SLOT && s.end >= (k + 1) * SLOT)));
      const regLockedAt = Array.from({ length: K }, (_, k) => ids.some(i => isReg(i) &&
        techObjs[i].segments.some(s => s.locked && s.taskId === task.id && overlapsSlot(s, k))));
      const regFreeAt = Array.from({ length: K }, (_, k) => ids.filter(i => isReg(i) && free[i][k]).length);

      // Herkes dilimleri aynı sırayla seçer ki ekip aynı saatlerde birlikte çalışsın: bu işe ait
      // manuel atama varsa onun çevresi, yoksa vardiya başı önce gelir.
      const anchors = [];
      for (let k = 0; k < K; k++) if (techObjs.some(t => t.segments.some(s => s.locked && s.taskId === task.id && overlapsSlot(s, k)))) anchors.push(k);
      const dist = k => anchors.length ? Math.min(...anchors.map(a => Math.abs(a - k))) : k;
      const pos = new Array(K);
      Array.from({ length: K }, (_, k) => k).sort((a, b) => dist(a) - dist(b) || a - b).forEach((k, p) => { pos[k] = p; });

      function allocate(caps){
        const add = ids.map(() => 0);
        let rest = work;
        while (rest >= SLOT) {
          let best = -1;
          for (const i of ids) {
            if (add[i] + SLOT > caps[i]) continue;
            const d = best < 0 ? -1 : (pre[i] + add[i]) - (pre[best] + add[best]);
            if (d < 0 || (d === 0 && rank(i) < rank(best))) best = i;
          }
          if (best < 0) break;
          add[best] += SLOT;
          rest -= SLOT;
        }
        return add;
      }

      // Supervisor'ler önce denetim bekleyen manuel Teknisyen dilimlerini, sonra en çok Teknisyenin boş
      // olduğu dilimleri alır; Kalifiyeli Supervisor'lerin çalıştığı dilimleri tercih eder, Teknisyen
      // yalnızca bu dilimlere yerleşir.
      function place(add){
        const take = ids.map(() => []);
        const covered = supLockedAt.slice();
        for (const i of ids.slice().sort((a, b) => rank(a) - rank(b) || a - b)) {
          const need = add[i] / SLOT;
          if (!need) continue;
          const slots = [];
          for (let k = 0; k < K; k++) if (free[i][k] && (!isReg(i) || covered[k])) slots.push(k);
          const score = isSup(i) ? (k => (regLockedAt[k] && !covered[k] ? 1000 : 0) + regFreeAt[k])
            : isGroup ? (k => covered[k] ? 1 : 0) : (() => 0);
          slots.sort((a, b) => score(b) - score(a) || pos[a] - pos[b]);
          take[i] = slots.slice(0, need).sort((a, b) => a - b);
          if (isSup(i)) take[i].forEach(k => { covered[k] = true; });
        }
        return take;
      }

      // Supervisor dilimleri bir Teknisyenin payına yetmezse o Teknisyenin üst sınırı düşürülür ve pay yeniden dağıtılır.
      const caps = initialCaps.slice();
      const supervisionLimited = ids.map(() => false);
      let take;
      for (let guard = 0; guard < 500; guard++) {
        const add = allocate(caps);
        take = place(add);
        const short = ids.filter(i => take[i].length * SLOT < add[i]);
        if (!short.length) break;
        short.forEach(i => { caps[i] = take[i].length * SLOT; supervisionLimited[i] = true; });
      }

      ids.forEach(i => {
        const runs = [];
        take[i].forEach(k => {
          const last = runs[runs.length - 1];
          if (last && last[1] === k) last[1] = k + 1; else runs.push([k, k + 1]);
        });
        runs.forEach(([a, b]) => {
          const start = a * SLOT, end = b * SLOT;
          techObjs[i].segments.push({ start, end, taskId: task.id, taskName: task.name });
          techObjs[i].totalMin += end - start;
          taskSegments.get(task.id).push({ techIndex: i, start, end });
        });
      });

      const placed = take.reduce((s, tk) => s + tk.length * SLOT, 0);
      const rest = work - placed;
      if (rest >= SLOT && !task.isOpen) {
        unallocated.push({ taskId: task.id, task: task.name, minutes: rest, reason: 'Teknisyen kapasitesi doldu; mümkün olan kısım teknisyenlere dağıtıldı' });
      }
      return { task, pre, initialCaps, supervisionLimited, padded: Math.max(0, -rest),
        target: (work + pre.reduce((s, p) => s + p, 0)) / n,
        planned: ids.map(i => pre[i] + take[i].length * SLOT) };
    }

    // Manuel atanmış Teknisyen parçalarına, işin kalan süresinden, aynı işte ve aynı saatte
    // boş bir Supervisor yerleştirilir; aksi halde bu parçalar denetimsiz kalıp kesilirdi.
    // Tek iş kartında bu yerleşimi eşit paylaşım kendisi yapar.
    if (isGroup && !singleTask) {
      techObjs.filter(x => x.role === 'regular').forEach(reg => {
        reg.segments.filter(s => s.locked).forEach(seg => {
          const task = tasksCopy.find(t => t.id === seg.taskId);
          if (!task) return;
          for (const [gs, ge] of findGaps(seg.start, seg.end, buildSupervisorCoverage(techObjs, techRoles, seg.taskId))) {
            let cur = gs;
            while (cur + 15 <= ge && task.techWorkMin >= 15) {
              const sup = techObjs.filter(s => s.role === 'supervisor' && isFreeRange(s, cur, cur + 15))
                .sort((a, b) => a.totalMin - b.totalMin || a.index - b.index)[0];
              if (!sup) { cur += 15; continue; }
              let end = cur + 15;
              while (end + 15 <= ge && end + 15 - cur <= task.techWorkMin && isFreeRange(sup, end, end + 15)) end += 15;
              sup.segments.push({ start: cur, end, taskId: task.id, taskName: task.name });
              sup.totalMin += end - cur;
              task.techWorkMin -= end - cur; // Supervisor zamanı aynı işçilik bütçesinden düşülür
              taskSegments.get(task.id).push({ techIndex: sup.index, start: cur, end });
              cur = end;
            }
          }
        });
      });
    }

    const mandatoryTasks = tasksCopy.filter(t => !t.isOpen).sort((a, b) => b.techWorkMin - a.techWorkMin);
    const openTasks = tasksCopy.filter(t => t.isOpen).sort((a, b) => a.techWorkMin - b.techWorkMin || a.id - b.id);

    if (singleTask) {
      equalShare = scheduleSingleTaskEqually(singleTask);
    } else {
      scheduleCrewPlan(mandatoryTasks, openTasks);
    }
    // Supervisor coverage on fixed regular-technician assignments consumes the same
    // remaining man-hour budget as any other segment; do not add those minutes back.
    mergeAndRecompute(techObjs);

    if (isGroup) repairCoverage(techObjs, techRoles);
    mergeAndRecompute(techObjs);

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

    // B1 parçaları: kind boşsa onay, 'support' = kısmen atanmış işe B1 iş desteği, 'b1only' = B1'e verilen iş.
    // Farklı türdeki bitişik parçalar birleştirilmez; böylece onay ile iş desteği listede ayrı görünür.
    function mergeSingleSchedule(obj){
      if (!obj) return;
      obj.segments.sort((a,b)=>a.start - b.start || a.end - b.end);
      const merged = [];
      for (const s of obj.segments) {
        const last = merged[merged.length - 1];
        if (last && last.taskId === s.taskId && last.end === s.start && !!last.locked === !!s.locked && (last.kind || '') === (s.kind || '')) {
          last.end = s.end;
        } else {
          merged.push({...s});
        }
      }
      obj.segments = merged;
      obj.totalMin = obj.segments.reduce((sum, seg) => seg.taskId === -1 ? sum : sum + (seg.end - seg.start), 0);
    }

    let headObj = null;
    const headSupportAssignments = [];

    // ------------------------------------------------------------
    // Kalan işi kurtarma: kapasite yüzünden atanamayan süre, hiç süre eklenmeden
    //  1) teknisyenlerin boşalan/kalan aralıklarına (Teknisyen için aynı işte Supervisor kapsamıyla),
    //  2) B1'in boş zamanına (iş desteği) yerleştirilmeye çalışılır.
    // Önce işin B1 onayından önceki boşluklar denenir; olmazsa onaydan sonrası kullanılır.
    // Küçük kalanlar önce gelir ki mümkün olduğunca çok iş tamamlansın.
    // ------------------------------------------------------------
    function rescueLeftoverWork(){
      if (!headObj) return;
      const dropFromScheduler = (taskId, minutes) => {
        for (let i = 0; i < unallocated.length && minutes > 0; i++) {
          const entry = unallocated[i];
          if (entry.taskId !== taskId) continue;
          const cut = Math.min(entry.minutes, minutes);
          entry.minutes -= cut;
          minutes -= cut;
        }
        for (let i = unallocated.length - 1; i >= 0; i--) if (unallocated[i].minutes <= 0) unallocated.splice(i, 1);
      };

      finalUnallocated.filter(u => u.rescuable && u.minutes >= 15).sort((a, b) => a.minutes - b.minutes).forEach(u => {
        const task = tasksCopy.find(t => t.id === u.taskId);
        if (!task || task.isOpen) return;
        const approvalStarts = headObj.segments.filter(s => s.taskId === task.id && !s.kind).map(s => s.start);
        const softEnd = approvalStarts.length ? Math.min(...approvalStarts) : _workEnd_offset;
        const limits = softEnd < _workEnd_offset ? [softEnd, _workEnd_offset] : [_workEnd_offset];
        // İşin toplamı (teknisyenler + B1) girilen tahmini aşamaz: yalnızca gerçek eksik kadar süre taşınır.
        const placedNow = assignedTaskMinutesOnTechnicians(task.id)
          + headObj.segments.reduce((sum, seg) => seg.taskId === task.id ? sum + (seg.end - seg.start) : sum, 0);
        const budget = Math.max(15, ceil15x(task.techTargetMin + task.headAlloc));
        const shortfall = Math.min(u.minutes, budget - placedNow);
        if (shortfall < 15) return;
        let rest = shortfall;
        let onTechs = 0, onB1 = 0;

        if (!u.b1OnlyFull) {
          const order = techObjs.slice().sort((a, b) =>
            (isGroup && techRoles[a.index] === 'regular') - (isGroup && techRoles[b.index] === 'regular') || a.totalMin - b.totalMin || a.index - b.index);
          for (const limitEnd of limits) {
            for (const tech of order) {
              const needsCover = isGroup && techRoles[tech.index] === 'regular';
              while (rest >= 15) {
                const slot = findSlotBefore(tech, rest, limitEnd, needsCover ? buildSupervisorCoverage(techObjs, techRoles, task.id) : null);
                if (!slot) break;
                tech.segments.push({ start: slot.start, end: slot.end, taskId: task.id, taskName: task.name });
                tech.totalMin += slot.end - slot.start;
                rest -= slot.end - slot.start;
                onTechs += slot.end - slot.start;
              }
            }
          }
        }

        for (const limitEnd of limits) {
          while (rest >= 15) {
            const slot = findSlotBefore(headObj, rest, limitEnd, null);
            if (!slot) break;
            const kind = u.b1OnlyFull ? 'b1only' : 'support';
            headObj.segments.push({ start: slot.start, end: slot.end, taskId: task.id, taskName: task.name, kind });
            headObj.totalMin += slot.end - slot.start;
            (u.b1OnlyFull ? headOverflowAssignments : headSupportAssignments)
              .push({ taskId: task.id, taskName: task.name, start: slot.start, end: slot.end, type: u.b1OnlyFull ? 'b1Only' : 'b1Support' });
            rest -= slot.end - slot.start;
            onB1 += slot.end - slot.start;
          }
        }

        if (onTechs + onB1 > 0) {
          mergeAndRecompute(techObjs);
          mergeSingleSchedule(headObj);
          dropFromScheduler(task.id, onTechs + onB1);
          u.minutes = rest; // gerçek eksik: yerleşenden sonra kalan
          if (rest > 0) u.reason = 'Teknisyen ve B1 kapasitesi doldu; işin mümkün olan kısmı yerleştirildi, kalan kısım atanamadı';
        }
      });
      for (let i = finalUnallocated.length - 1; i >= 0; i--) if (finalUnallocated[i].rescuable && finalUnallocated[i].minutes <= 0) finalUnallocated.splice(i, 1);
    }

    if (true) {
      headObj = { name: headTech, segments: [], totalMin: 0 };

      const headBlockInputs = load('asdp_headBlocks', []);
      // B1 dolu aralıklarını da teknisyen bloklarıyla aynı mola-dostu dönüşümden geçir.
      // Başlangıç molanın içinde olsa bile mola bitişinden sonraki doluluk korunur.
      normalizeWorkBlocks(headBlockInputs).forEach(block => {
        headObj.segments.push({ start: block.start, end: block.end, taskId: -1, taskName: 'DOLU' });
      });

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
              partlyAssignedItems.push({ task, assigned, missing: Math.max(0, task.techTargetMin - assigned) });
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
            // Kalan süre B1'in boş zamanına (veya boşalan teknisyen aralıklarına) rescueLeftoverWork ile yerleştirilmeye çalışılır.
            finalUnallocated.push({
              taskId: item.task.id,
              task: item.task.name,
              minutes: item.missing,
              rescuable: true,
              reason: 'Teknisyen ve B1 kapasitesi doldu; işin mümkün olan kısmı yerleştirildi, kalan kısım atanamadı'
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
            finalUnallocated.push({ taskId: task.id, task: task.name, minutes: fullB1Duration, rescuable: true, b1OnlyFull: true,
              reason: 'B1 kapasitesi dolu olduğu için iş kimseye atanmadı' });
          }
        }
      }

      mergeAndRecompute(techObjs);
      recomputeTaskTimeline();

      // ------------------------------------------------------------
      // B1 onay planı: onay, işin bitişinde (veya sonrasında) olmalıdır. Birçok iş aynı anda
      // biterse vardiya sonundaki B1 dilimleri yetmez ve onay işin bitişinden önceye düşer.
      // Bu durumda işin onaydan sonraki 15 dk'lık parçaları, onaydan önceki boş bir aralıkla veya
      // başka bir işin parçasıyla yer değiştirir; toplam işçilik, kişi yükü ve Supervisor denetimi
      // bozulmaz. Taşınamayan iş kalırsa uyarı olarak gösterilir.
      // ------------------------------------------------------------
      const approvalCandidates = tasksCopy.filter(t => !t.isOpen && !b1OnlyTaskIds.has(t.id) && t.headAlloc > 0);
      // B1'in boş dilimi tüm işlere yetmiyorsa, onaysız kalan iş teknisyenlerden de geri alınır; bu yüzden
      // dilimler önce en çok işçilik taşıyan işlere ayrılır (en az süre kaybı).
      const approvalJobs = [];
      {
        const sim = { segments: headObj.segments.map(sg => ({ ...sg })), totalMin: headObj.totalMin };
        approvalCandidates.slice()
          .sort((a, b) => assignedTaskMinutesOnTechnicians(b.id) - assignedTaskMinutesOnTechnicians(a.id) || a.id - b.id)
          .forEach(t => {
            if (placeOnTech(sim, t.headAlloc, t.id, t.name, { notBefore: 0 })) approvalJobs.push(t);
            else headUnallocated.push({ taskId: t.id, task: t.name, minutes: t.headAlloc, reason: 'B1 kapasitesi dolu' });
          });
      }

      // target: B1 programı (kalıcı) ya da onun kopyası (deneme). İşler en geç bitenden başlayarak yerleşir.
      function planApprovals(target){
        const ordered = approvalJobs.slice().sort((a, b) => {
          const A = taskFinalEnd.get(a.id), B = taskFinalEnd.get(b.id);
          if (A === null && B === null) return a.id - b.id;
          if (A === null) return 1;
          if (B === null) return -1;
          return B - A || a.id - b.id;
        });
        return ordered.map(t => {
          const headNeeded = t.headAlloc;
          const taskEnd = taskFinalEnd.get(t.id);
          let attempt;
          if (taskEnd === null) {
            attempt = placeOnTech(target, headNeeded, t.id, t.name, { notBefore: 0 });
          } else {
            attempt = scheduleExactWindow(target, Math.max(0, taskEnd - headNeeded), taskEnd, t.id, t.name);
            if (!attempt) attempt = placeOnTech(target, headNeeded, t.id, t.name, { notBefore: taskEnd });
            if (!attempt) {
              // Bitişten sonra yer yoksa, bitişe en yakın (en geç) boş B1 dilimi kullanılır.
              for (let st = floor15(taskEnd - headNeeded); st >= 0 && !attempt; st -= 15) {
                attempt = scheduleExactWindow(target, st, st + headNeeded, t.id, t.name);
              }
            }
          }
          return { task: t, taskEnd, attempt };
        });
      }
      const approvalIsEarly = p => !!p.attempt && p.taskEnd !== null && p.attempt.end < p.taskEnd;

      // Aynı işte Supervisor olmadan çalışan Teknisyen dakikalarının toplamı (yer değiştirme denetimi için).
      function uncoveredTotal(){
        if (!isGroup) return 0;
        const covCache = new Map();
        const covFor = id => { if (!covCache.has(id)) covCache.set(id, buildSupervisorCoverage(techObjs, techRoles, id)); return covCache.get(id); };
        let total = 0;
        techObjs.forEach((tech, i) => {
          if (techRoles[i] !== 'regular') return;
          tech.segments.forEach(seg => {
            if (seg.taskId === -1 || seg.taskId == null) return;
            findGaps(seg.start, seg.end, covFor(seg.taskId)).forEach(([a, b]) => { total += b - a; });
          });
        });
        return total;
      }
      function carveSegments(tech, from, to){
        const kept = [];
        tech.segments.forEach(seg => {
          if (seg.end <= from || seg.start >= to) { kept.push(seg); return; }
          if (seg.start < from) kept.push({ ...seg, end: from });
          if (seg.end > to) kept.push({ ...seg, start: to });
        });
        tech.segments = kept;
      }

      // task işinin deadline'dan sonraki 15 dk'lık parçalarını deadline'dan önceye taşır.
      // deadlines: diğer işlerin onay bitişleri; bir parça ancak kendi onayından önce kalacak yere gidebilir.
      function repairTail(task, deadline, deadlines){
        let moved = false;
        function tryMoveUnit(fromTech, a){
          const base = uncoveredTotal();
          const others = techObjs.filter(y => y !== fromTech).sort((p, q) => p.totalMin - q.totalMin || p.index - q.index);
          const order = [fromTech].concat(others);
          for (let p = deadline - 15; p >= 0; p -= 15) {
            for (const wantFree of [true, false]) {
              for (const toTech of order) {
                if (toTech === fromTech && p + 15 > a) continue;
                const hit = toTech.segments.filter(sg => sg.start < p + 15 && sg.end > p);
                let swapSeg = null;
                if (hit.length === 0) {
                  if (!wantFree) continue;
                } else {
                  if (wantFree || hit.length !== 1) continue;
                  const sg = hit[0];
                  if (sg.locked || sg.taskId === -1 || sg.taskId == null || sg.taskId === task.id) continue;
                  if (sg.start > p || sg.end < p + 15) continue;
                  if (a + 15 > (deadlines.has(sg.taskId) ? deadlines.get(sg.taskId) : Infinity)) continue;
                  swapSeg = sg;
                }
                const backupFrom = fromTech.segments, backupTo = toTech.segments;
                const swapId = swapSeg ? swapSeg.taskId : null, swapName = swapSeg ? swapSeg.taskName : null;
                carveSegments(fromTech, a, a + 15);
                if (swapSeg) {
                  carveSegments(toTech, p, p + 15);
                  fromTech.segments.push({ start: a, end: a + 15, taskId: swapId, taskName: swapName });
                } else if (toTech !== fromTech) {
                  toTech.segments = toTech.segments.slice(); // yedek dizi değiştirilmesin; geri almada özgün dizi dönülür
                }
                toTech.segments.push({ start: p, end: p + 15, taskId: task.id, taskName: task.name });
                if (uncoveredTotal() <= base) return true;
                fromTech.segments = backupFrom;
                toTech.segments = backupTo;
              }
            }
          }
          return false;
        }

        for (let guard = 0; guard < 400; guard++) {
          const units = [];
          techObjs.forEach(tech => tech.segments.forEach(seg => {
            if (seg.taskId === task.id && !seg.locked && seg.end > deadline && seg.end - seg.start >= 15) units.push({ tech, a: seg.end - 15 });
          }));
          units.sort((u, v) => v.a - u.a);
          let progressed = false;
          for (const u of units) {
            if (tryMoveUnit(u.tech, u.a)) { progressed = true; moved = true; break; }
          }
          mergeAndRecompute(techObjs);
          if (!progressed) break;
        }
        return moved;
      }

      for (let round = 0; round < 12; round++) {
        recomputeTaskTimeline();
        const dry = planApprovals({ segments: headObj.segments.map(sg => ({ ...sg })), totalMin: headObj.totalMin });
        const early = dry.filter(approvalIsEarly);
        if (!early.length) break;
        const deadlines = new Map(dry.filter(p => p.attempt).map(p => [p.task.id, p.attempt.end]));
        let movedAny = false;
        for (const p of early) if (repairTail(p.task, p.attempt.end, deadlines)) movedAny = true;
        if (!movedAny) break;
      }
      recomputeTaskTimeline();
      planApprovals(headObj).forEach(p => {
        const t = p.task;
        if (p.attempt) {
          headAssignments.push({ taskId: t.id, taskName: t.name, start: p.attempt.start, end: p.attempt.end, type: 'headAlloc' });
        } else if (p.taskEnd === null) {
          headUnallocated.push({ taskId: t.id, task: t.name, minutes: t.headAlloc, reason: 'B1 kapasitesi dolu' });
        } else {
          headUnallocated.push({ taskId: t.id, task: t.name, minutes: t.headAlloc, reason: 'B1 için iş bitişiyle aynı veya sonrasında boş aralık yok' });
        }
      });

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

      function getOpenPool(){
        return tasksCopy
          .filter(t => t.isOpen && t.rawMin > 0)
          .sort((a,b) => Math.max(15, ceil15x(a.rawMin)) - Math.max(15, ceil15x(b.rawMin)) || a.id - b.id)
          .map(t => ({ task: t, remaining: Math.max(0, Math.max(15, ceil15x(t.rawMin)) - assignedTaskMinutesOnTechnicians(t.id)) }));
      }

      function remainingOpenPool(pool){
        return pool.reduce((sum, item) => sum + Math.max(0, item.remaining), 0);
      }

      function nextOpenItem(pool){
        return pool.find(item => item.remaining >= 15) || null;
      }

      function findOpenSlotForTarget(target, taskId){
        const free = getFreeIntervals(target.obj);
        for (let i = free.length - 1; i >= 0; i--) {
          const [fs, fe] = free[i];
          let cursor = floor15(fe) - 15;
          while (cursor >= fs) {
            if (isGroup && target.role === 'regular') {
              const coverage = buildSupervisorCoverage(techObjs, techRoles, taskId);
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
            const slot = findOpenSlotForTarget(target, item.task.id);
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

      // Zorunlu işlerin kalan süresi, OPEN dolgudan önce B1'in/teknisyenlerin boş zamanına verilir.
      rescueLeftoverWork();

      const openPoolAfterFill = fillAllOpenGapsFromPool();
      // OPEN work is best-effort fill, but any residual must be visible rather than silently dropped.
      openPoolAfterFill.filter(item => item.remaining > 0).forEach(item => {
        finalUnallocated.push({
          taskId: item.task.id,
          task: item.task.name,
          minutes: item.remaining,
          reason: item.remaining < 15
            ? 'Kalan OPEN süre 15 dakikalık planlama birimine sığmadı; süre artırılmadı'
            : 'OPEN işin kalan süresi kullanılabilir boş aralıklara sığmadı'
        });
      });

      const taskIdsWithB1 = new Set(headObj.segments.filter(s => s.taskId !== -1 && s.taskId != null && s.kind !== 'support').map(s => s.taskId));
      const removedByB1Rule = new Set();
      techObjs.forEach(tech => {
        const kept = [];
        for (const seg of tech.segments) {
          if (seg.taskId === -1 || seg.taskId == null || seg.locked || taskIdsWithB1.has(seg.taskId) || (tasksCopy.find(t => t.id === seg.taskId)?.isOpen)) kept.push(seg);
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

    // ============================================================
    // KESİN DENETİM KURALI: Teknisyen hiçbir şartta denetimsiz çalışamaz.
    // Önceki aşamalar (manuel atamalar, B1 kuralıyla geri alınan işler vb.)
    // Supervisor kapsamı dışında Teknisyen dakikası bırakmışsa o dakikalar
    // kesilir; kesilen iş Supervisor/Kalifiyeli'ye ya da kapsam içindeki bir
    // Teknisyene taşınır, yer yoksa atanamayan olarak raporlanır.
    // ============================================================
    function findSlotBefore(tech, maxDur, limitEnd, coverage){
      for (const [fs, fe0] of getFreeIntervals(tech)) {
        const fe = Math.min(fe0, limitEnd);
        const windows = coverage ? coverage.map(([cs, ce]) => [Math.max(fs, cs), Math.min(fe, ce)]) : [[fs, fe]];
        for (const [ws, we] of windows) {
          const len = Math.min(maxDur, floor15(we - ws));
          if (len >= 15) return { start: ws, end: ws + len };
        }
      }
      return null;
    }
    function enforceSupervision(){
      // repairCoverage burada çağrılmaz: B1 onayı planlanmış işleri onaydan sonraya taşıyabilir.
      const covByTask = new Map();
      const covFor = taskId => {
        if (!covByTask.has(taskId)) covByTask.set(taskId, buildSupervisorCoverage(techObjs, techRoles, taskId));
        return covByTask.get(taskId);
      };
      const cutMinutes = new Map();
      techObjs.forEach((tech, idx) => {
        if (techRoles[idx] !== 'regular') return;
        const kept = [];
        tech.segments.forEach(seg => {
          if (seg.taskId === -1 || seg.taskId == null) { kept.push(seg); return; }
          const gaps = findGaps(seg.start, seg.end, covFor(seg.taskId));
          if (gaps.length === 0) { kept.push(seg); return; }
          let cursor = seg.start;
          for (const [gs, ge] of gaps) {
            if (gs > cursor) kept.push({ ...seg, start: cursor, end: gs });
            cursor = ge;
          }
          if (cursor < seg.end) kept.push({ ...seg, start: cursor, end: seg.end });
          cutMinutes.set(seg.taskId, (cutMinutes.get(seg.taskId) || 0) + gaps.reduce((s, [gs, ge]) => s + (ge - gs), 0));
          if (seg.locked) {
            const gapStr = gaps.map(([gs, ge]) => `${m2t(workToReal(gs, 'start'))}-${m2t(workToReal(ge, 'end'))}`).join(', ');
            scenarioWarnings.push(`${escHtml(tech.name)} – ${escHtml(seg.taskName)}: ${gapStr} arasında bu işte çalışan Supervisor yok; denetimsiz kısım uygulanmadı.`);
          }
        });
        tech.segments = kept;
      });
      mergeAndRecompute(techObjs);

      cutMinutes.forEach((minutes, taskId) => {
        const task = tasksCopy.find(t => t.id === taskId);
        if (!task || task.isOpen) return; // OPEN dolgu işidir; kesilen kısım yeniden dağıtılmaz
        // İş, B1 onayından sonra bitmesin.
        const approvalStarts = headObj ? headObj.segments.filter(s => s.taskId === taskId && !s.kind).map(s => s.start) : [];
        const limitEnd = approvalStarts.length ? Math.min(...approvalStarts) : _workEnd_offset;
        let rest = minutes;
        const order = techObjs.slice().sort((a, b) =>
          (techRoles[a.index] === 'regular') - (techRoles[b.index] === 'regular') || a.totalMin - b.totalMin);
        for (const tech of order) {
          const isRegular = techRoles[tech.index] === 'regular';
          while (rest >= 15) {
            const slot = findSlotBefore(tech, rest, limitEnd, isRegular ? buildSupervisorCoverage(techObjs, techRoles, taskId) : null);
            if (!slot) break;
            tech.segments.push({ start: slot.start, end: slot.end, taskId, taskName: task.name });
            tech.totalMin += slot.end - slot.start;
            rest -= slot.end - slot.start;
          }
          if (rest < 15) break;
        }
        if (rest > 0) finalUnallocated.push({ taskId, task: task.name, minutes: rest, rescuable: true, reason: 'Bu işte Supervisor çalışmayan saatlere denk geldiği için Teknisyene verilemedi ve başka kimseye sığmadı' });
      });
      mergeAndRecompute(techObjs);
    }
    if (isGroup) {
      enforceSupervision();
      rescueLeftoverWork();
    }

    // Teknisyen parçalarını, onları denetleyen Supervisor parçalarıyla birebir aynı aralığa getir.
    if (isGroup) alignSupervisionPieces(techObjs, techRoles);

    if (isGroup) {
      techObjs.forEach((tech, idx) => {
        if (techRoles[idx] !== 'regular') return;
        tech.segments.forEach(seg => {
          if (seg.taskId === -1) return;
          const attr = attributeSupervision(seg.start, seg.end, techObjs, techRoles, technicians, seg.taskId);
          if (!attr.fullyCovered) {
            supervisionGaps.push({
              techName: tech.name,
              taskName: seg.taskName,
              from: workToReal(attr.uncoveredFrom, 'start'),
              to: workToReal(seg.end, 'end')
            });
          }
        });
      });
    }

    // Son plana göre: onayı işin son çalışma saatinden önce kalan işler (B1'de uygun boş zaman bulunamadı).
    recomputeTaskTimeline();
    const earlyApprovals = [];
    if (headObj) {
      tasksCopy.filter(t => !t.isOpen && !b1OnlyTaskIds.has(t.id)).forEach(t => {
        const approvals = headObj.segments.filter(sg => sg.taskId === t.id && !sg.kind);
        const taskEnd = taskFinalEnd.get(t.id);
        if (!approvals.length || taskEnd === null || taskEnd === undefined) return;
        const last = approvals.reduce((a, b) => (b.end > a.end ? b : a));
        if (last.end < taskEnd) earlyApprovals.push({ taskName: t.name, from: last.start, to: last.end, taskEnd });
      });
    }
    return { spec, techObjs, headObj, tasksCopy, unallocated, finalUnallocated, headUnallocated, headOverflowAssignments,
      headSupportAssignments, headAssignments, supervisionGaps, b1OnlyTaskIds, equalShare, warnings: scenarioWarnings, earlyApprovals };
  }

  // ============================================================
  // Dağıtım senaryoları
  // ------------------------------------------------------------
  // Adam saat dağıtımı birden fazla ekip düzeniyle yapılabiliyorsa her düzen bir senaryodur. Her teknisyen
  // bir senaryoda tek bir ekipte yer alır. Grup modunda Teknisyen içeren her ekipte en az bir Supervisor bulunur.
  // Kullanıcı seçmezse hassasiyet çubuğuna göre en uygun senaryo otomatik seçilir.
  // ============================================================
  const MAX_SCENARIOS = 8;
  function generateCrewSpecs(){
    const n = technicians.length;
    const idx = Array.from({ length: n }, (_, i) => i);
    const roleAt = i => (isGroup ? (techRoles[i] || 'regular') : 'all');
    const specs = [];
    const seen = new Set();
    const norm = crews => crews.filter(c => c.length).map(c => c.slice().sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
    const valid = crews => !isGroup || crews.every(c => !c.some(i => roleAt(i) === 'regular') || c.some(i => roleAt(i) === 'supervisor'));
    const add = raw => {
      const crews = norm(raw);
      const key = crews.map(c => c.join(',')).join('|');
      if (seen.has(key) || !valid(crews)) return;
      seen.add(key);
      specs.push({ key, crews });
    };
    const smallest = list => list.reduce((m, c) => (c.length < m.length ? c : m), list[0]);
    const balanced = m => { const cs = Array.from({ length: m }, () => []); idx.forEach(i => smallest(cs).push(i)); return cs; };

    add([idx]);
    if (singleTask || n < 2) return specs;

    if (isGroup) {
      const S = idx.filter(i => roleAt(i) === 'supervisor');
      const Q = idx.filter(i => roleAt(i) === 'qualified');
      const R = idx.filter(i => roleAt(i) === 'regular');
      const lead = k => {
        const cs = Array.from({ length: k }, () => []);
        S.forEach((s, i) => cs[i % k].push(s));
        R.concat(Q).forEach(i => smallest(cs).push(i));
        return cs;
      };
      for (let k = 2; k <= Math.min(S.length, 4); k++) add(lead(k));
      if (Q.length && S.length + R.length > 0) {
        for (let g = 1; g <= Math.min(Q.length, 2); g++) {
          for (let k = 1; k <= Math.min(S.length, 3); k++) {
            const cs = Array.from({ length: k }, () => []);
            S.forEach((s, i) => cs[i % k].push(s));
            R.forEach(r => smallest(cs).push(r));
            const qs = Array.from({ length: g }, () => []);
            Q.forEach(q => smallest(qs).push(q));
            add(cs.concat(qs));
          }
        }
      }
      if (!R.length) for (let m = 2; m <= Math.min(n, 4); m++) add(balanced(m));
    } else {
      for (let m = 2; m <= Math.min(n, 4); m++) add(balanced(m));
    }
    specs.sort((a, b) => a.crews.length - b.crews.length);
    return specs.slice(0, MAX_SCENARIOS);
  }

  // Bir senaryonun sonucunu puanlar. Sert ölçütler (atanamayan süre, denetim açığı, erken onay) önce gelir;
  // yumuşak ölçütler: teknisyen eşitliği (yük dengesi + aynı iş/aynı saat benzerliği) ve B1 onay düzeni.
  function scenarioMetrics(R){
    const asg = new Map();
    const addAsg = (id, m) => asg.set(id, (asg.get(id) || 0) + m);
    R.techObjs.forEach(t => t.segments.forEach(s => { if (s.taskId >= 0) addAsg(s.taskId, s.end - s.start); }));
    let degraded = 0;
    R.headObj.segments.forEach(s => {
      if (s.taskId < 0) return;
      addAsg(s.taskId, s.end - s.start);
      if (s.kind) degraded += s.end - s.start;
    });
    let missing = 0;
    R.tasksCopy.forEach(t => {
      if (t.isOpen || t.rawMin <= 0) return;
      const budget = Math.max(15, ceil15x(t.techTargetMin + t.headAlloc));
      missing += Math.max(0, budget - (asg.get(t.id) || 0));
    });

    const cells = R.techObjs.map(t => {
      const set = new Set();
      t.segments.forEach(s => { if (s.taskId >= 0) for (let c = Math.floor(s.start / 15); c * 15 < s.end; c++) set.add(s.taskId + ':' + c); });
      return set;
    });
    const loads = cells.map(c => c.size);
    const able = R.techObjs.map((_, i) => techFreeCapacities[i] > 0 ? i : -1).filter(i => i >= 0);
    let balance = 1;
    if (able.length > 1) {
      const hi = Math.max(...able.map(i => loads[i])), lo = Math.min(...able.map(i => loads[i]));
      balance = hi > 0 ? 1 - (hi - lo) / hi : 1;
    }
    let sim = 1, pairs = 0, simSum = 0;
    for (let a = 0; a < able.length; a++) for (let b = a + 1; b < able.length; b++) {
      const A = cells[able[a]], B = cells[able[b]];
      let inter = 0;
      A.forEach(x => { if (B.has(x)) inter++; });
      const uni = A.size + B.size - inter;
      simSum += uni ? inter / uni : 1;
      pairs++;
    }
    if (pairs) sim = simSum / pairs;
    const equality = 0.5 * balance + 0.5 * sim;

    const ends = R.headObj.segments.filter(s => s.taskId >= 0 && !s.kind).map(s => s.end).sort((a, b) => a - b);
    let regularity = 1;
    if (ends.length > 2) {
      const gaps = ends.map((e, i) => e - (i ? ends[i - 1] : 0));
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) * (g - mean), 0) / gaps.length);
      regularity = mean > 0 ? Math.max(0, 1 - sd / mean) : 0;
    }
    const pieces = R.techObjs.reduce((a, t) => a + t.segments.filter(s => s.taskId >= 0).length, 0);
    return { missing, degraded, gaps: R.supervisionGaps.length, early: R.earlyApprovals.length, equality, regularity, pieces,
      score: (1 - sens) * equality + sens * regularity };
  }

  function scenarioSignature(R){
    return R.techObjs.map(t => t.segments.filter(s => s.taskId >= 0).map(s => `${s.taskId}:${s.start}-${s.end}`).join(',')).join('/')
      + '#' + R.headObj.segments.filter(s => s.taskId >= 0).map(s => `${s.taskId}:${s.start}-${s.end}`).join(',');
  }

  function buildAllScenarios(){
    const out = [];
    const seenSig = new Set();
    generateCrewSpecs().forEach(spec => {
      const R = buildScenario(spec);
      const sig = scenarioSignature(R);
      if (seenSig.has(sig)) return;
      seenSig.add(sig);
      R.metrics = scenarioMetrics(R);
      out.push(R);
    });
    // Aynı sert sonucu veren senaryolar seçilebilir; belirgin biçimde daha kötü olanlar listeden çıkarılır.
    const best = out.reduce((b, r) => {
      const m = r.metrics;
      return (!b || m.gaps < b.gaps || (m.gaps === b.gaps && (m.missing < b.missing || (m.missing === b.missing && m.early < b.early)))) ? m : b;
    }, null);
    const usable = out.filter(r => r.metrics.gaps <= best.gaps && r.metrics.missing <= best.missing + 15 && r.metrics.early <= best.early + 1);
    usable.forEach((r, i) => { r.id = i; });
    return usable.length ? usable : out;
  }

  // Önerilen senaryo: puanı en yüksek olanın SCORE_TOL yakınındaki senaryolar arasından en az ekipli olan
  // (küçük bir kazanç için ekip yapısı bozulmasın). Kullanıcı seçtiyse onun seçimi geçerlidir.
  const SCORE_TOL = 0.05;
  function pickScenario(list, chosenKey){
    const ranked = list.slice().sort((a, b) => b.metrics.score - a.metrics.score || a.spec.crews.length - b.spec.crews.length || a.id - b.id);
    const recommended = ranked.filter(r => r.metrics.score >= ranked[0].metrics.score - SCORE_TOL)
      .sort((a, b) => a.spec.crews.length - b.spec.crews.length || b.metrics.score - a.metrics.score || a.id - b.id)[0];
    const manual = list.find(r => r.spec.key === chosenKey);
    return manual ? { picked: manual, auto: false, recommended } : { picked: recommended, auto: true, recommended };
  }

  const crewNames = crews => crews.map(c => c.map(i => technicians[i]).join(' + ')).join('  |  ');
  function scenarioBarHtml(view){
    const { list, picked, auto, recommended } = view;
    if (list.length < 2) {
      return `<div class="card scn-card"><div class="small">🧩 Ekip düzeni: <strong>${escHtml(crewNames(picked.spec.crews))}</strong> <span style="color:var(--muted)">(bu girdilerle tek uygun dağıtım var)</span></div></div>`;
    }
    const chips = list.map((r, i) => {
      const m = r.metrics;
      const badge = r === recommended ? '<span class="scn-badge">★ Önerilen</span>' : '';
      return `<button type="button" class="scn-chip${r === picked ? ' active' : ''}" onclick="selectScenario('${escHtml(r.spec.key)}')" title="${escHtml(crewNames(r.spec.crews))}">
        <span class="scn-title">Senaryo ${i + 1} · ${r.spec.crews.length === 1 ? 'Tek ekip' : r.spec.crews.length + ' ekip'} ${badge}</span>
        <span class="scn-crews">${escHtml(crewNames(r.spec.crews))}</span>
        <span class="scn-meta">Teknisyen eşitliği %${Math.round(m.equality * 100)} · B1 düzeni %${Math.round(m.regularity * 100)} · ${m.pieces} parça${m.missing ? ` · <span style="color:var(--warning)">${(m.missing / 60).toFixed(2)} sa atanamadı</span>` : ''}</span>
      </button>`;
    }).join('');
    return `<div class="card scn-card"><h2>🎛️ Dağıtım Senaryoları</h2>
      <div class="small" style="color:var(--muted);margin-bottom:8px">Adam saat dağıtımı birden fazla ekip düzeniyle yapılabiliyor. Her teknisyen bir senaryoda tek bir ekipte yer alır. ${auto ? 'Hassasiyet çubuğuna göre <strong>önerilen senaryo otomatik seçildi</strong>; isterseniz aşağıdan kendiniz seçebilirsiniz.' : 'Senaryoyu <strong>siz seçtiniz</strong>.'}</div>
      <div class="scn-list">${chips}</div>
      ${auto ? '' : `<button type="button" class="btn scn-auto" onclick="selectScenario('')">↺ Otomatik (önerilen) seçime dön</button>`}
    </div>`;
  }

  // Seçilen senaryoyu çizer (senaryo çubuğu, ekip kartları, B1 listesi, uyarılar).
  function renderPlan(view){
    const R = view.picked;
    const { techObjs, headObj, tasksCopy, unallocated, finalUnallocated, headUnallocated, headOverflowAssignments,
      headSupportAssignments, supervisionGaps, equalShare } = R;
    const preAssignWarnings = R.warnings;
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
        const real = { startReal: workToReal(s.start, 'start'), endReal: workToReal(s.end, 'end') };
        perTech[idx].segs.push({ taskId: s.taskId, task: tasks[s.taskId].name, start: real.startReal, end: real.endReal, _ws: s.start, _we: s.end, locked: !!s.locked });
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
    const crewText = R.spec.crews.length === 1 ? 'Tek ekip' : `${R.spec.crews.length} ekip`;
    html += `<div class="card"><div class="small">Mod: <strong>${isGroup ? 'Supervisor Grup' : 'Supervisor ALL'}</strong> – Hassasiyet: <strong>${sensitivityText()}</strong> – Ekip düzeni: <strong>${crewText}</strong> – Toplam İş: <strong>${tasks.length}</strong> – Girdi Toplam Süre: <strong>${totalInputHours.toFixed(2)} saat</strong></div></div>`;
    html += scenarioBarHtml(view);

    // Capacity table
    const busyRows = technicians.map((name, i) => {
      const busyH = minutesToHoursStr(techBusyMinutes[i] || 0);
      const freeH = minutesToHoursStr(techFreeCapacities[i] || 0);
      const role = isGroup ? `<span class="role-tag ${techRoles[i] || 'regular'}">${techRoles[i] === 'supervisor' ? 'Supervisor' : techRoles[i] === 'qualified' ? 'Kalifiyeli' : 'Teknisyen'}</span>` : '';
      const preH = minutesToHoursStr(techPreAssignMinutes[i] || 0);
      return `<tr><td><strong>${escHtml(name)}</strong>${role}</td><td>${busyH}</td><td>${preH}</td><td>${freeH}</td></tr>`;
    }).join('');
    html += `<details class="collapsible" open><summary>⏱️ Teknisyen Net Kapasite Kontrolü</summary><div class="body">
      <div class="small" style="color:var(--muted);margin-bottom:8px">Dolu saatler iş ataması için kapalıdır ve toplam yüke eklenmez.</div>
      <table class="table"><tr><th>Teknisyen</th><th>Dolu Blok</th><th>Manuel İş</th><th>Otomatik Atamaya Kalan</th></tr>${busyRows}</table>
    </div></details>`;

    if (preAssignWarnings.length > 0) {
      html += `<div class="warning"><strong>📌 Uygulanamayan Manuel Atamalar</strong><br>${preAssignWarnings.map(w => `<div class="small">• ${w}</div>`).join('')}</div>`;
    }

    if (manualOverAssignmentWarnings.length > 0) {
      html += `<div class="attention"><strong>📌 Manuel atama işçilik hedefini aşıyor</strong>${manualOverAssignmentWarnings.map(w => `<div class="small">• ${w}</div>`).join('')}</div>`;
    }

    // Kapasite yetmiyorsa süreleri değiştirmek yerine açık kapasite açığını göster.
    if (capacityExceeded) {
      const capHours = (totalCapacityMin / 60).toFixed(2);
      const needHours = (mandatoryAfterRound / 60).toFixed(2);
      const deficitHours = ((mandatoryAfterRound - totalCapacityMin) / 60).toFixed(2);
      let detailHtml = '<table class="table" style="margin-top:10px"><tr><th>İş</th><th>Planlama işçilik talebi</th><th>Manuel atama</th></tr>';
      tasksCopy.filter(t => !t.isOpen && t.techWorkMinOriginal > 0).forEach(task => {
        detailHtml += `<tr><td><strong>${escHtml(task.name)}</strong></td><td>${(task.techWorkMin / 60).toFixed(2)} saat</td><td>${((task.preAssignedMin || 0) / 60).toFixed(2)} saat</td></tr>`;
      });
      detailHtml += '</table>';
      html += `<details class="collapsible" open><summary>⚠️ Kapasite Aşımı – İş süreleri korundu</summary><div class="body attention">
        <strong>Zorunlu işlerin toplam işçilik talebi mevcut teknisyen kapasitesini aşıyor.</strong><br>
        <span class="small" style="color:var(--muted)">Kullanılabilir kapasite: <strong>${capHours} saat</strong><br>
        Planlanan zorunlu işçilik talebi: <strong>${needHours} saat</strong><br>
        Kapasite açığı: <strong>${deficitHours} saat</strong><br>
        İşlerin süreleri otomatik olarak küçültülmedi. Atanamayan süreler sonuç uyarılarında gösterilir; planı uygulamadan önce kapasite/iş listesi yeniden düzenlenmelidir.</span>${detailHtml}
      </div></details>`;
    }

    if (roundingAdjustments.length > 0) {
      const rows = roundingAdjustments.map(a => `<div class="small">• ${escHtml(a.name)}: ${(a.before / 60).toFixed(2)} → ${(a.after / 60).toFixed(2)} saat (${a.diff > 0 ? '+' : ''}${a.diff} dk, 15 dk yukarı yuvarlama)</div>`).join('');
      html += `<details class="collapsible"><summary>ℹ️ 15 dk yukarı yuvarlama düzeltmeleri (${roundingAdjustments.length})</summary><div class="body">${rows}</div></details>`;
    }

    // Tek iş kartı: eşit paylaşım özeti ve eşitliği bozan (çakışan) koşullar.
    let equalShareSummary = null;
    if (equalShare) {
      const es = equalShare;
      const h = minutesToHoursStr;
      const finalMin = techObjs.map(t => t.segments.reduce((s, sg) => sg.taskId === es.task.id ? s + (sg.end - sg.start) : s, 0));
      const level = Math.max(0, ...es.planned.filter((p, i) => p > es.pre[i]));
      const conflicts = [], infos = [], noShare = [], shortRound = [];
      techObjs.forEach((t, i) => {
        if (es.pre[i] > level) conflicts.push(`${t.name}: manuel ataması (${h(es.pre[i])} sa) eşit payı aşıyor; işin kalanı diğer personele paylaştırıldı.`);
        else if (es.planned[i] < level) {
          if (es.supervisionLimited[i]) conflicts.push(`${t.name}: aynı işte Supervisor'ün çalıştığı saatler yetmediği için ${h(es.planned[i])} sa verilebildi (denetim kuralı eşitlikten önce gelir).`);
          else if (es.planned[i] - es.pre[i] >= es.initialCaps[i]) conflicts.push(`${t.name}: dolu saatleri nedeniyle boş zamanı (${h(es.initialCaps[i])} sa) eşit paya yetmedi.`);
          else if (es.planned[i] === 0) noShare.push(t.name);
          else shortRound.push(t.name);
        }
      });
      if (noShare.length) conflicts.push(`İş süresi herkese en az 15 dk vermeye yetmiyor: ${noShare.join(', ')} bu işten pay almadı.`);
      if (shortRound.length) conflicts.push(`15 dk'lık plan birimi nedeniyle tam eşitlik sağlanamadı: ${shortRound.join(', ')} diğerlerinden en fazla 15 dk az aldı. İşçilik tahmini eşitleme amacıyla artırılmadı.`);
      const changed = techObjs.map((_, i) => i).filter(i => finalMin[i] !== es.planned[i]);
      const withdrawn = changed.length > 0 && finalMin.every(m => m === 0);
      if (withdrawn) conflicts.push('B1 onayı planlanamadığı için iş personelden geri alındı (aşağıdaki uyarılara bakın).');
      else changed.forEach(i => conflicts.push(`${techObjs[i].name}: denetim / B1 kontrolü sonrası payı ${h(es.planned[i])} → ${h(finalMin[i])} sa oldu.`));

      // Eşitlik sağlandıysa herkesin payı, sağlanamadıysa ulaşılamayan eşit pay hedefi gösterilir.
      const shareLabel = conflicts.length ? `eşit pay hedefi: <strong>${h(es.target)} sa</strong>` : `kişi başı pay: <strong>${h(level)} sa</strong>`;
      equalShareSummary = { is_no: es.task.name, [conflicts.length ? 'esit_pay_hedefi' : 'kisi_basi_pay']: h(conflicts.length ? es.target : level) + ' sa', notlar: conflicts.concat(infos) };
      html += `<div class="${conflicts.length ? 'attention' : 'capacity-info'}"><strong>⚖️ Tek İş Kartı – Eşit Paylaşım${conflicts.length ? ': Çakışan Koşullar' : ''}</strong>
        <div class="small" style="margin:6px 0"><strong>${escHtml(es.task.name)}</strong> işi ${techObjs.length} personele paylaştırıldı – ${shareLabel}</div>
        ${conflicts.concat(infos).map(x => `<div class="small">• ${escHtml(x)}</div>`).join('')}</div>`;
    }

    // ==========================================================
    // 👷 Teknisyenlerin Programı – YENİ 2 SÜTUNLU TASARIM
    // Teknisyen ismi + Toplam (saat) başlık olarak; içeride
    // İşler ve zaman aralıkları tek satırda 2 sütun.
    // ==========================================================
    let techHtml = `<details class="collapsible" id="techProgram" open><summary>👷 Teknisyenlerin Programı</summary><div class="body">
      <div style="margin:10px 0 14px 0">
        <label class="small" style="display:block;margin-bottom:6px;color:var(--muted)">Opsiyonel Not</label>
        <textarea data-field="program-note" placeholder="Planla ilgili not ekle...">${escHtml(programNote)}</textarea>
      </div>`;

    const roleLabel = r => r === 'supervisor' ? 'Supervisor' : r === 'qualified' ? 'Kalifiyeli' : 'Teknisyen';
    const roleEmoji = r => r === 'supervisor' ? '👷🏼‍♂️' : r === 'qualified' ? '🧑‍🔬' : '👨‍🔧';
    const nameWithRole = i => escHtml(perTech[i].name) + (isGroup ? ` <span title="${roleLabel(perTech[i].role)}">${roleEmoji(perTech[i].role)}</span>` : '');

    // Kişi bazında toplam ve boşluklar: kartlar gruplandığı için kişinin günlük toplamı kartların altındaki tabloda gösterilir.
    let summaryRows = '';
    perTech.forEach((p, idx)=>{
      p.segs.sort((a,b)=>a.start - b.start);

      let gapCell = '—';
      // p.total manuel atamaları da içerir; dolu bloklar sonrası kapasiteden toplam atanmış işi çıkar.
      const freeCap = Math.max(0, _workEnd_offset - (techBusyMinutes[idx] || 0));
      const remainingFree = Math.max(0, freeCap - p.total);
      if (freeCap !== undefined && remainingFree >= 15) {
        const gaps = [];
        const techObj = techObjs[idx];
        if (techObj) {
          for (const [ws, we] of getFreeIntervals(techObj)) {
            if (we - ws >= 15) gaps.push(`${m2t(workToReal(ws, 'start'))} - ${m2t(workToReal(we, 'end'))}`);
          }
        }
        gapCell = `<span style="color:var(--warning)">⚠ ${minutesToHoursStr(remainingFree)} sa${gaps.length ? `<br><span style="font-family:monospace;font-size:0.9em">${gaps.join(', ')}</span>` : ''}</span>`;
      }
      const totalCell = p.segs.length ? `${minutesToHoursStr(p.total)} sa` : `<span style="color:var(--warning)">⚠ Atanmış iş yok</span>`;
      summaryRows += `<tr><td><strong>${nameWithRole(idx)}</strong></td><td>${totalCell}</td><td>${gapCell}</td></tr>`;
    });

    // Her teknisyen tek bir ekipte (grupta) listelenir: kart = ekip. Ekibin aynı işi aynı saatte yapan üyeleri tek satırda
    // birleşir; ekibin yalnızca bir kısmı çalışıyorsa satırın altında çalışanlar yazılır.
    const crewCards = [];
    R.spec.crews.forEach((members, crewIdx) => {
      const slots = new Map();
      members.forEach(i => perTech[i].segs.forEach(s => {
        const key = `${s.taskId}|${s.start}|${s.end}`;
        if (!slots.has(key)) slots.set(key, { ...s, members: [] });
        const slot = slots.get(key);
        slot.members.push(i);
        slot.locked = slot.locked || s.locked;
      }));
      const active = members.filter(i => perTech[i].segs.length > 0);
      if (!active.length) return;
      const segs = [...slots.values()].sort((a, b) => a.start - b.start || a.taskId - b.taskId);
      crewCards.push({ crewIdx, members, active, segs });
    });

    const waIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
    if (crewCards.length) {
      techHtml += `<div style="display:flex;justify-content:flex-end;margin-bottom:14px">
        <button class="btn-wa-copy btn-wa-all" onclick="copyWAAll()">${waIcon} <span>Tümünü WhatsApp'a Kopyala</span></button>
      </div>`;
    }

    window._waCopyData = [];
    crewCards.forEach((c, idx)=>{
      // Ekip süresi: ekipten en az birinin çalıştığı zaman (iş-zamanı aralıklarının birleşimi).
      const spans = c.segs.map(s => [s._ws, s._we]).sort((a, b) => a[0] - b[0]);
      let crewTime = 0, curEnd = -1;
      spans.forEach(([a, b]) => { const from = Math.max(a, curEnd); if (b > from) crewTime += b - from; curEnd = Math.max(curEnd, b); });
      const totals = c.active.map(i => perTech[i].total);
      const sameTotals = totals.every(v => v === totals[0]);

      const body = '<div class="program-table">' + c.segs.map(s => {
        const subset = s.members.length < c.active.length;
        let line = `<div class="program-seg">
          <span class="program-task">${s.locked ? '<span title="Manuel atama">📌 </span>' : ''}${escHtml(s.task)}</span>
          <span class="program-time">${m2t(s.start)} - ${m2t(s.end)}</span>
        </div>`;
        if (subset) line += `<div class="small program-meta-line" style="color:var(--muted)">👥 ${s.members.map(i => escHtml(perTech[i].name)).join(', ')}</div>`;
        const hasRegular = isGroup && s.members.some(i => perTech[i].role === 'regular');
        const supMembers = isGroup ? s.members.filter(i => perTech[i].role === 'supervisor') : [];
        if (hasRegular && supMembers.length) {
          // Aynı işte aynı saatte çalışan Supervisor denetler.
          line += `<div class="small program-meta-line" style="color:var(--accent)">↳ Denetim: ${supMembers.map(i => escHtml(perTech[i].name)).join(', ')} (${m2t(s.start)}-${m2t(s.end)})</div>`;
        } else if (hasRegular) {
          const attr = attributeSupervision(s._ws, s._we, techObjs, techRoles, technicians, s.taskId);
          if (attr.covered.length > 0) {
            const supList = attr.covered.map(cv => `${escHtml(cv.supName)} (${m2t(workToReal(cv.start, 'start'))}-${m2t(workToReal(cv.end, 'end'))})`).join(', ');
            line += `<div class="small program-meta-line" style="color:var(--accent)">↳ Denetim: ${supList}</div>`;
          }
          if (!attr.fullyCovered) {
            line += `<div class="small program-meta-line" style="color:var(--danger)">⚠ Denetimsiz: ${m2t(workToReal(attr.uncoveredFrom, 'start'))}-${m2t(workToReal(s._we, 'end'))}</div>`;
          }
        }
        return line;
      }).join('') + '</div>';

      window._waCopyData[idx] = {
        names: c.active.map(i => perTech[i].name),
        total: minutesToHoursStr(crewTime),
        segs: c.segs.map(s => ({ task: s.task, s: m2t(s.start), e: m2t(s.end),
          who: s.members.length < c.active.length ? s.members.map(i => perTech[i].name).join(', ') : '' }))
      };

      techHtml += `<div class="tech-program-block">
        <div class="tech-program-header">
          <div class="tech-program-header-left">
            <span class="tech-program-name"><span>${c.active.length > 1 ? '👥' : '👤'} ${c.active.map(nameWithRole).join(' + ')}</span></span>
          </div>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <span class="tech-program-total">${sameTotals ? 'Toplam' : 'Ekip süresi'}: <strong>${minutesToHoursStr(sameTotals ? totals[0] : crewTime)} sa</strong></span>
            <button class="btn-wa-copy" onclick="copyWA(${idx})">${waIcon} <span>WhatsApp</span></button>
          </div>
        </div>
        ${sameTotals ? '' : `<div class="small program-meta-line" style="color:var(--muted);margin:0 0 6px 0">${c.active.map(i => `${escHtml(perTech[i].name)}: ${minutesToHoursStr(perTech[i].total)} sa`).join(' · ')}</div>`}
        ${body}
      </div>`;
    });
    techHtml += `<div class="small" style="color:var(--muted);margin-top:4px">Kişi bazında toplam ve boşluklar</div>
      <table class="table" style="margin-top:8px"><tr><th>Teknisyen</th><th>Toplam</th><th>Boşluk</th></tr>${summaryRows}</table>`;
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
          const realStart = m2t(workToReal(s.start, 'start'));
          const realEnd = m2t(workToReal(s.end, 'end'));
          const isB1Only = s.kind === 'b1only' || b1OnlyKeys.has(`${s.start}-${s.end}-${s.taskId}`);
          const isSupport = s.kind === 'support';
          const isOpenB1 = tasksCopy.find(t => t.id === s.taskId)?.isOpen;
          const tag = isB1Only ? '<span class="b1-only-tag">B1-only</span>'
            : isSupport ? '<span class="b1-only-tag" title="Teknisyenlere sığmayan kalan süre B1 boş zamanına yerleştirildi">B1 iş desteği</span>'
            : (isOpenB1 ? '<span class="b1-only-tag">OPEN fill</span>' : '');
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
      const headSupportTotal = headSupportAssignments.reduce((s, h) => s + (h.end - h.start), 0);
      html += `<div class="card"><h2>👑 B1 Teknisyen Zaman Listesi <span class="role-tag head">${escHtml(headTech || '—')}</span></h2><div class="small" style="color:var(--muted);margin-bottom:8px">B1 için otomatik ayarlanan onay / B1-only zaman aralıkları aşağıdadır. Bu liste Supervisor Grup modunda da hesaplanır.</div>${headDisplayHtml}`;
      html += `<div class="stat" style="margin-top:10px">
        Toplam B1 yükü: <strong>${minutesToHoursStr(headWorkTotal)} saat</strong>
        ${headOverflowTotal > 0 ? ` – B1’e özel atanan iş yükü: <strong style="color:var(--warn)">${minutesToHoursStr(headOverflowTotal)} saat</strong>` : ''}
        ${headSupportTotal > 0 ? ` – Kalan işe B1 iş desteği: <strong style="color:var(--warn)">${minutesToHoursStr(headSupportTotal)} saat</strong>` : ''}
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

    const earlyApprovals = R.earlyApprovals;
    if (earlyApprovals.length > 0) {
      const rows = earlyApprovals.map(w => `<div class="small">⚠ <strong>${escHtml(w.taskName)}</strong> – B1 onayı ${m2t(workToReal(w.from, 'start'))} - ${m2t(workToReal(w.to, 'end'))}; işte bu saatten sonra da çalışma var (son çalışma bitişi ${m2t(workToReal(w.taskEnd, 'end'))}).</div>`).join('');
      html += `<div class="attention"><strong>⚠ B1 Onayı İş Bitişinden Önce</strong><br><div class="small" style="margin:6px 0">B1'in uygun boş zamanı bulunamadığı için aşağıdaki işlerin onayı, işin son çalışma saatinden önceye yerleştirildi. Gerekirse B1 dolu saatlerini veya iş dağılımını gözden geçirin.</div>${rows}</div>`;
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

    const aiData = {
      calisma_sistemi: isGroup ? "Grup (Supervisor Denetimli)" : "Herkes Bağımsız",
      dagitim_hassasiyeti: sensitivityText(),
      secili_senaryo: R.spec.crews.map(c => c.map(i => technicians[i]).join(" + ")).join(" | "),
      toplam_is_sayisi: tasks.length,
      toplam_sure: totalInputHours.toFixed(2) + " saat",
      // Ekrandaki "📋 İşler" listesinin birebir karşılığı: her işe ayrılması gereken süre.
      is_listesi: tasks.map(t => ({
        is_no: t.name,
        ayrilacak_sure_saat: parseFloat(t.hours) || 0,
        tip: t.open ? "OPEN" : "Zorunlu"
      })),
      is_bazinda_plan: tasks.map((t, i) => ({
        is_no: t.name,
        girilen_sure: (parseFloat(t.hours) || 0).toFixed(2) + " saat",
        tip: t.open ? "OPEN" : "Zorunlu",
        teknisyen_atamalari: perTech.flatMap(p => p.segs
          .filter(s => s.taskId === i)
          .map(s => ({ teknisyen: p.name, baslangic: m2t(s.start), bitis: m2t(s.end) })))
          .sort((a, b) => a.baslangic.localeCompare(b.baslangic)),
        b1_onay: headObj ? headObj.segments.filter(s => s.taskId === i)
          .map(s => ({ baslangic: m2t(workToReal(s.start, 'start')), bitis: m2t(workToReal(s.end, 'end')), ...(s.kind === 'support' ? { tur: 'B1 iş desteği' } : s.kind === 'b1only' ? { tur: 'B1-only' } : {}) })) : []
      })),
      teknisyen_atamalari: perTech.map(p => ({
        teknisyen: p.name,
        rol: p.role,
        toplam_sure: minutesToHoursStr(p.total) + " sa",
        atanan_isler: p.segs.map(s => ({
          is_no: s.task,
          baslangic: m2t(s.start),
          bitis: m2t(s.end)
        }))
      })),
      b1_atamalari: headObj ? headObj.segments.filter(s => s.taskId !== -1).map(s => ({
        is_no: s.taskName,
        baslangic: m2t(workToReal(s.start, 'start')),
        bitis: m2t(workToReal(s.end, 'end')),
        ...(s.kind === 'support' ? { tur: 'B1 iş desteği' } : s.kind === 'b1only' ? { tur: 'B1-only' } : {})
      })) : [],
      tek_is_esit_paylasim: equalShareSummary || undefined,
      atanmayan_isler: finalUnallocated.map(u => ({
        is_no: u.task,
        sure: (u.minutes / 60).toFixed(2) + " sa",
        sebep: u.reason
      }))
    };
    window._aiCopyData = JSON.stringify(aiData, null, 2);

    html += `<button class="btn-ai-copy" id="btnAiCopy" onclick="copyAIVerisi()">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2L9.2 8.6 2 9.2l5.4 4.7-1.7 6.9 6.3-3.8 6.3 3.8-1.7-6.9L22 9.2l-7.2-.6L12 2z"/></svg> 
      <span>🤖 AI İçin Tüm Planı Kopyala</span>
    </button>`;

    html += `<div class="footer-warning">⚠️ Bu planlama bir öneridir. Gerçek durumlarda işyeri prosedürlerine ve operasyonel ihtiyaçlara göre değişiklik yapılabilir.</div>`;
    resultsDiv.innerHTML = html;
    if (view.keepScroll) {
      window.scrollTo({ top: view.scrollY || 0 });
    } else {
      // Plan oluşunca doğrudan "Teknisyenlerin Programı" bölümüne git.
      const scrollTarget = $('techProgram') || resultsDiv;
      window.scrollTo({ top: scrollTarget.getBoundingClientRect().top + window.scrollY - 20, behavior: 'smooth' });
    }
  }

  const scenarios = buildAllScenarios();
  window._asdpShowPlan = (o, scrollY) => {
    renderPlan({ list: scenarios, ...pickScenario(scenarios, chosenScenario), ...(o || {}), scrollY: scrollY === undefined ? window.scrollY : scrollY });
  };
  window._asdpShowPlan(opts, startScrollY);
}

// WhatsApp metni parçaları: vardiya/yemek/çay tüm personel için aynıdır.
function waShiftLines() {
  const shiftS = $('shiftStart').value || '—';
  const shiftE = $('shiftEnd').value || '—';
  let text = `🗓️ Vardiya: ${shiftS} - ${shiftE}\n`;
  const bs = $('breakStart').value, be = $('breakEnd').value;
  if (bs && be) text += `🍲 Yemek: ${bs} - ${be}\n`;
  const ts = $('teaBreakStart') ? $('teaBreakStart').value : '', te = $('teaBreakEnd') ? $('teaBreakEnd').value : '';
  if (ts && te) text += `☕ Çay: ${ts} - ${te}\n`;
  return text;
}
const waGroupHeader = data => `${data.names.length > 1 ? '👥' : '👷'} *${data.names.join(', ')}*\n⏳ Toplam: ${data.total} saat\n`;
const waTaskLines = data => data.segs.length
  ? data.segs.map(s => `🔹 ${s.s} - ${s.e} | ${s.task}${s.who ? ` (${s.who})` : ''}\n`).join('')
  : `⚠ Atanmış iş yok.\n`;
function waCopy(text, doneMsg) {
  navigator.clipboard.writeText(text).then(() => {
    alert(doneMsg);
  }).catch(err => {
    console.error('Kopyalama hatası:', err);
    alert('Kopyalama başarısız oldu. Lütfen tekrar deneyin.');
  });
}

window.copyWA = function(idx) {
  const data = window._waCopyData[idx];
  if (!data) return;
  const text = waGroupHeader(data) + waShiftLines() + `\n*GÖREVLER:*\n` + waTaskLines(data);
  waCopy(text, data.names.join(', ') + ' planı kopyalandı!');
};

// Tüm grupların görevleri tek mesajda; vardiya/yemek/çay en üstte bir kez yazılır.
window.copyWAAll = function() {
  const all = window._waCopyData || [];
  if (!all.length) return;
  const text = waShiftLines() + `\n*GÖREVLER:*\n` + all.map(data => `\n` + waGroupHeader(data) + waTaskLines(data)).join('');
  waCopy(text, 'Tüm plan kopyalandı!');
};

window.copyAIVerisi = function() {
  if (!window._aiCopyData) return;
  const btn = document.getElementById('btnAiCopy');
  navigator.clipboard.writeText(window._aiCopyData).then(() => {
    if (btn) {
      btn.classList.add('success');
      btn.innerHTML = '✅ Yapay Zeka Verisi Kopyalandı!';
      setTimeout(() => {
        btn.classList.remove('success');
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2L9.2 8.6 2 9.2l5.4 4.7-1.7 6.9 6.3-3.8 6.3 3.8-1.7-6.9L22 9.2l-7.2-.6L12 2z"/></svg> <span>🤖 AI İçin Tüm Planı Kopyala</span>';
      }, 2000);
    }
  }).catch(err => {
    console.error('AI Verisi kopyalanamadı:', err);
    alert('Kopyalama başarısız oldu.');
  });
};
