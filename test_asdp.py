"""Browser integration tests for the ASDP revision. Requires playwright + Chromium."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent
html = (ROOT / 'index.html').read_text(encoding='utf-8')
css = (ROOT / 'style.css').read_text(encoding='utf-8')
js = (ROOT / 'script.js').read_text(encoding='utf-8')

# Test-only instrumentation; this code is injected into the test page, not the app.
debug_probe = '''  window.__debugPlan = {
    tasks: rawTasks.map(t => ({ id: t.id, name: t.name, rawMin: t.rawMin, headAlloc: t.headAlloc,
      isOpen: t.isOpen, requestedTechWorkMin: t.requestedTechWorkMin,
      techWorkMinOriginal: t.techWorkMinOriginal, techWorkMin: t.techWorkMin,
      preAssignedMin: t.preAssignedMin || 0 })),
    technicians: techObjs.map(t => ({ name: t.name, role: t.role,
      segments: t.segments.map(s => ({ taskId: s.taskId, start: s.start, end: s.end, locked: !!s.locked })) })),
    b1Segments: headObj ? headObj.segments.map(s => ({ taskId: s.taskId, start: s.start, end: s.end, kind: s.kind || null })) : [],
    unallocated: [...unallocated, ...finalUnallocated, ...headUnallocated].map(u => ({ task: u.task, taskId: u.taskId, minutes: u.minutes, reason: u.reason }))
  };
  resultsDiv.innerHTML = html;
'''
needle = '  resultsDiv.innerHTML = html;\n  // Plan oluşunca'
if needle not in js:
    raise SystemExit('Cannot find final plan render marker for test instrumentation')
js = js.replace(needle, debug_probe + '  // Plan oluşunca', 1)
css = css.replace(css.split('\n')[0], '')  # Skip external font loading in tests.
html = html.replace('<link rel="stylesheet" href="style.css?v=20261013c"/>', '<style>' + css + '</style>')
html = html.replace('<script src="script.js?v=20261013c"></script>', '<script>' + js + '</script>')
mock = """<script>(()=>{const d=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>d.has(k)?d.get(k):null,setItem:(k,v)=>d.set(k,String(v)),removeItem:k=>d.delete(k),clear:()=>d.clear()}})})();</script>"""
html = html.replace('</head>', mock + '</head>')

results = []
errors = []
def check(name, condition, detail=''):
    results.append((name, bool(condition), detail))

def clean_role_values(page, values):
    page.locator('#techs select[data-field="techRole"]').evaluate_all(
        "(els, vals) => els.forEach((el, i) => { el.value = vals[i]; el.dispatchEvent(new Event('change', { bubbles: true })); })",
        values)

def task_minutes(debug):
    totals = {}
    for tech in debug['technicians']:
        for seg in tech['segments']:
            if seg['taskId'] is not None and seg['taskId'] >= 0:
                totals[seg['taskId']] = totals.get(seg['taskId'], 0) + seg['end'] - seg['start']
    for seg in debug['b1Segments']:
        if seg['taskId'] is not None and seg['taskId'] >= 0:
            totals[seg['taskId']] = totals.get(seg['taskId'], 0) + seg['end'] - seg['start']
    return totals

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])

    # Baseline validation, breaks, capacity and manual over-allocation.
    page = browser.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(html, wait_until='domcontentloaded', timeout=10000)
    check('İlk açılış: işler ve teknisyenler çiziliyor', page.locator('#tasks .list-item-card').count() == 2 and page.locator('#techs .list-item-card').count() == 3)
    page.locator('#planBtn').click(timeout=3000)
    default_success = page.locator('#techProgram').count() == 1 and 'Teknisyenlerin Programı' in page.locator('#results').inner_text()
    check('Varsayılan plan üretiliyor', default_success, page.locator('#results').inner_text()[:150].replace('\n', ' | '))

    invalid_page = browser.new_page()
    invalid_page.set_content(html, wait_until='domcontentloaded', timeout=10000)
    invalid_page.locator('#tasks input[data-i="1"][data-field="hours"]').fill('0.1')
    invalid_page.locator('#tasks input[data-i="1"][data-field="hours"]').dispatch_event('input')
    invalid_page.locator('#planBtn').click(timeout=3000)
    invalid_text = invalid_page.locator('#results').inner_text()
    check('15 dakikalık ızgaraya uymayan süre reddediliyor', '15 dakikalık artışlarla girilmeli' in invalid_text, invalid_text[:180].replace('\n',' | '))

    map_result = page.evaluate("""() => { _shiftS_real=480; _breaks=[{s:600,e:615,len:15},{s:720,e:750,len:30}]; _totalBreakLen=45; _workEnd_offset=435; return {beforeEnd:workToReal(120,'end'),afterStart:workToReal(120,'start'),lunchEnd:workToReal(225,'end'),lunchStart:workToReal(225,'start'),afterLunch:workToReal(240,'start')} }""")
    check('Mola sınırları doğru eşleniyor', map_result == {'beforeEnd':600,'afterStart':615,'lunchEnd':720,'lunchStart':750,'afterLunch':765}, str(map_result))

    page.locator('#shiftDetails').evaluate('(el) => el.open = true')
    page.locator('#shiftStart').fill('11:45'); page.locator('#shiftEnd').fill('19:45')
    page.locator('#breakStart').fill('12:00'); page.locator('#breakEnd').fill('13:00')
    page.locator('#teaBreakStart').fill('12:30'); page.locator('#teaBreakEnd').fill('13:15')
    page.locator('#planBtn').click(timeout=3000)
    overlap_text = page.locator('#results').inner_text()
    check('Çakışan molalar reddediliyor', 'Mola saatleri geçersiz' in overlap_text and 'çakışıyor' in overlap_text, overlap_text[:160].replace('\n',' | '))

    page.locator('#breakStart').fill(''); page.locator('#breakEnd').fill('')
    page.locator('#teaBreakStart').fill(''); page.locator('#teaBreakEnd').fill('')
    page.locator('#shiftStart').fill('08:00'); page.locator('#shiftEnd').fill('09:00')
    page.locator('#planBtn').click(timeout=3000)
    overload_text = page.locator('#results').inner_text()
    check('Kapasite aşımında talep küçültülmüyor ve açık raporlanıyor', 'Kapasite Aşımı – İş süreleri korundu' in overload_text and 'Kapasite açığı' in overload_text, overload_text[:180].replace('\n',' | '))

    page.locator('#shiftEnd').fill('16:00')
    hours = page.locator('#tasks input[data-field="hours"]')
    hours.nth(0).fill('0.5'); hours.nth(0).dispatch_event('input')
    hours.nth(1).fill('1'); hours.nth(1).dispatch_event('input')
    page.locator('#preAssignDetails').evaluate('(el) => el.open = true')
    page.locator('#preAssignTechSelect').select_option('0')
    page.locator('#preAssignTaskSelect').select_option('0')
    page.locator('#preAssignStart').fill('08:00'); page.locator('#preAssignEnd').fill('09:00')
    page.locator('#addPreAssign').click(timeout=3000)
    page.locator('#planBtn').click(timeout=3000)
    overassign_text = page.locator('#results').inner_text()
    check('Sabit manuel atama işçilik hedefini aşıyorsa uyarı veriliyor', 'Manuel atama işçilik hedefini aşıyor' in overassign_text, overassign_text[:180].replace('\n',' | '))

    page.locator('#algoDetails').evaluate('(el) => el.open = true')
    page.locator('#modeDetails').evaluate('(el) => el.open = true')
    page.locator('#algoRow input[value="b1_priority"]').check()
    page.locator('#modeRow input[value="group"]').check()
    clean_role_values(page, ['supervisor', 'regular', 'qualified'])
    page.locator('#planBtn').click(timeout=5000)
    group_text = page.locator('#results').inner_text()
    check('Supervisor Grup modu çalışıyor', page.locator('#techProgram').count() == 1 and 'Supervisor Grup' in group_text, group_text[:180].replace('\n',' | '))

    # Use a separate page to avoid the browser's localStorage test mock persisting state.
    team_page = browser.new_page()
    team_page.on('pageerror', lambda e: errors.append(str(e)))
    team_page.set_content(html, wait_until='domcontentloaded', timeout=10000)
    team_page.locator('#algoDetails').evaluate('(el) => el.open = true')
    team_page.locator('#modeDetails').evaluate('(el) => el.open = true')
    team_page.locator('#modeRow input[value="group"]').check()
    team_page.locator('#algoRow input[value="tech_priority"]').check()
    clean_role_values(team_page, ['supervisor', 'regular', 'regular'])
    team_page.locator('#planBtn').click(timeout=5000)
    debug = team_page.evaluate('window.__debugPlan')
    totals = task_minutes(debug)
    team_overalloc = [f"{task['name']}: {totals.get(task['id'], 0)} > {task['rawMin']} dakika"
                      for task in debug['tasks'] if not task['isOpen'] and task['rawMin'] > 0
                      and totals.get(task['id'], 0) > task['rawMin']]
    check('Teknisyen Öncelikli algoritma işçilik tahminini aşmıyor', not team_overalloc, '; '.join(team_overalloc) or str(totals))

    team_page.locator('#preAssignDetails').evaluate('(el) => el.open = true')
    team_page.locator('#preAssignTechSelect').select_option('1')
    team_page.locator('#preAssignTaskSelect').select_option('0')
    team_page.locator('#preAssignStart').fill('12:00'); team_page.locator('#preAssignEnd').fill('13:00')
    team_page.locator('#addPreAssign').click(timeout=3000)
    team_page.locator('#planBtn').click(timeout=5000)
    debug = team_page.evaluate('window.__debugPlan')
    task0 = next(t for t in debug['tasks'] if t['id'] == 0)
    totals = task_minutes(debug)
    check('Manuel teknisyen ataması ve supervisor kapsamı çift işçilik üretmiyor', totals.get(0, 0) <= task0['rawMin'], f"Atanan: {totals.get(0, 0)} dk; tahmin: {task0['rawMin']} dk")

    team_page.locator('[data-delpreassign]').first.click()
    team_page.locator('#preAssignStart').fill('07:00'); team_page.locator('#preAssignEnd').fill('08:30')
    team_page.locator('#addPreAssign').click(timeout=3000)
    team_page.locator('#planBtn').click(timeout=5000)
    outshift_text = team_page.locator('#results').inner_text()
    check('Vardiya dışındaki manuel atama kırpılmadan reddediliyor', 'manuel atama vardiya dışına taşıyor' in outshift_text.lower(), outshift_text[:180].replace('\n',' | '))

    cap_page = browser.new_page()
    cap_page.on('pageerror', lambda e: errors.append(str(e)))
    cap_page.set_content(html, wait_until='domcontentloaded', timeout=10000)
    cap_page.locator('#shiftDetails').evaluate('(el) => el.open = true')
    cap_page.locator('#breakStart').fill('12:30'); cap_page.locator('#breakEnd').fill('13:30')
    cap_page.locator('#busyDetails').evaluate('(el) => el.open = true')
    cap_page.locator('#techBlockSelect').select_option('0')
    cap_page.locator('#techBlockStart').fill('12:45'); cap_page.locator('#techBlockEnd').fill('14:00')
    cap_page.locator('#addTechBlock').click(timeout=3000)
    cap_summary = cap_page.locator('#techsStat').inner_text()
    check('Mola içinde başlayan dolu blok kapasite özetinde hesaba katılıyor', '20.50 saat' in cap_summary, cap_summary)

    # OPEN task with 50 minutes fixed assignment and 60-minute total estimate.
    open_page = browser.new_page()
    open_page.set_default_timeout(5000)
    open_page.on('pageerror', lambda e: errors.append(str(e)))
    open_page.set_content(html, wait_until='domcontentloaded', timeout=10000)
    # Test this residual in the classic mode, where regular-worker supervision constraints do not remove the fixed block.
    open_page.locator('#modeDetails').evaluate('(el) => el.open = true')
    open_page.locator('#modeRow input[value="all"]').check()
    open_page.locator('#tasks input[data-i="1"][data-field="hours"]').fill('1')
    open_page.locator('#tasks input[data-i="1"][data-field="hours"]').dispatch_event('input')
    open_page.locator('#tasks input[data-i="1"][data-field="openTask"]').evaluate("(el) => { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }")
    open_page.locator('#preAssignDetails').evaluate('(el) => el.open = true')
    open_page.locator('#preAssignTechSelect').select_option('1')
    open_page.locator('#preAssignTaskSelect').select_option('1')
    open_page.locator('#preAssignStart').fill('12:00'); open_page.locator('#preAssignEnd').fill('12:50')
    open_page.locator('#addPreAssign').click(timeout=3000)
    open_page.locator('#planBtn').click(timeout=5000)
    open_debug = open_page.evaluate('window.__debugPlan')
    open_task = next(t for t in open_debug['tasks'] if t['id'] == 1)
    open_totals = task_minutes(open_debug)
    open_text = open_page.locator('#results').inner_text()
    check('OPEN sabit ataması korunur ve toplam tahmini aşmaz', open_totals.get(1, 0) == 50 and open_totals.get(1, 0) <= open_task['rawMin'], f"Atanan: {open_totals.get(1, 0)} dk; tahmin: {open_task['rawMin']} dk")
    check('OPEN işin 15 dakikadan kısa kalanı raporlanıyor', 'Kalan OPEN süre 15 dakikalık planlama birimine sığmadı' in open_text, open_text[-250:].replace('\n',' | '))

    # Single-task OPEN path uses the special equal-sharing scheduler; exercise it separately.
    single_open_page = browser.new_page()
    single_open_page.on('pageerror', lambda e: errors.append(str(e)))
    single_open_page.set_content(html, wait_until='domcontentloaded', timeout=10000)
    single_open_page.locator('#tasks input[data-i="0"][data-field="hours"]').fill('0')
    single_open_page.locator('#tasks input[data-i="0"][data-field="hours"]').dispatch_event('input')
    single_open_page.locator('#tasks input[data-i="1"][data-field="hours"]').fill('1')
    single_open_page.locator('#tasks input[data-i="1"][data-field="hours"]').dispatch_event('input')
    single_open_page.locator('#tasks input[data-i="1"][data-field="openTask"]').evaluate("(el) => { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }")
    single_open_page.locator('#preAssignDetails').evaluate('(el) => el.open = true')
    single_open_page.locator('#preAssignTechSelect').select_option('0')
    single_open_page.locator('#preAssignTaskSelect').select_option('1')
    single_open_page.locator('#preAssignStart').fill('12:00'); single_open_page.locator('#preAssignEnd').fill('12:50')
    single_open_page.locator('#addPreAssign').click(timeout=3000)
    single_open_page.locator('#planBtn').click(timeout=5000)
    single_debug = single_open_page.evaluate('window.__debugPlan')
    single_task = next(t for t in single_debug['tasks'] if t['id'] == 1)
    single_totals = task_minutes(single_debug)
    single_text = single_open_page.locator('#results').inner_text()
    check('Tek işli OPEN yolunda sabit atama ve işçilik üst sınırı korunuyor', single_totals.get(1, 0) == 50 and single_totals.get(1, 0) <= single_task['rawMin'], f"Atanan: {single_totals.get(1, 0)} dk; tahmin: {single_task['rawMin']} dk")
    check('Tek işli OPEN yolunda 10 dakikalık kalan görünür', 'Kalan OPEN süre 15 dakikalık planlama birimine sığmadı' in single_text, single_text[-250:].replace('\n',' | '))

    # Regresyon: kısmen atanan işin kalanı B1'in boş zamanına verilmeli (kapasite israf edilmemeli).
    # 7 personel x 5,5 sa + B1 5,5 sa = 44 sa kapasite, 45 sa talep: en az 1 sa atanamaz, fazlası değil.
    import json
    seed_values = {
        'asdp_tasks': [{'name': f'NRC {i + 1}', 'hours': h} for i, h in enumerate([5, 2, 12, 24, 1, 1])],
        'asdp_techs': ['ilhan', 'emin', 'metin', 'davut', 'onur', 'gizem', 'serdar'],
        'asdp_techRoles': ['supervisor', 'supervisor', 'supervisor', 'regular', 'supervisor', 'regular', 'qualified'],
        'asdp_shiftStart': '12:45', 'asdp_shiftEnd': '19:45',
        'asdp_breakStart': '15:00', 'asdp_breakEnd': '16:00',
        'asdp_teaBreakStart': '17:30', 'asdp_teaBreakEnd': '18:00',
        'asdp_planMode': 'group', 'asdp_algoMode': 'b1_priority',
    }
    seed_js = ''.join(f"localStorage.setItem({json.dumps(k)}, {json.dumps(v if isinstance(v, str) else json.dumps(v))});" for k, v in seed_values.items())
    b1_page = browser.new_page()
    b1_page.on('pageerror', lambda e: errors.append(str(e)))
    b1_page.set_content(html.replace('</head>', f'<script>{seed_js}</script></head>'), wait_until='domcontentloaded', timeout=10000)
    b1_page.locator('#planBtn').click(timeout=5000)
    b1_debug = b1_page.evaluate('window.__debugPlan')
    b1_totals = task_minutes(b1_debug)
    b1_left = sum(u['minutes'] for u in b1_debug['unallocated'] if u['task'] == 'NRC 1' and u['reason'].startswith('Teknisyen ve B1'))
    check('Kısmen atanan işin kalanı B1 boş zamanına yerleşiyor', sum(b1_totals.values()) == 44 * 60 and b1_left == 60,
          f"Yerleşen: {sum(b1_totals.values())} dk (beklenen 2640); NRC 1 atanamayan: {b1_left} dk (beklenen 60)")
    b1_text = b1_page.locator('#results').inner_text()
    check('B1 iş desteği listede ayrı gösteriliyor', 'B1 iş desteği' in b1_text, b1_text[-200:].replace('\n', ' | '))

    # Regresyon: B1 onayı, işin son çalışma saatinden önce kalmamalı (iş vardiya sonunda birikse bile).
    seed_values.update({
        'asdp_shiftStart': '11:45',
        'asdp_techBlocks': [[{'start': '12:45', 'end': '13:45'}], [], [], [], [], [], []],
    })
    seed_js = ''.join(f"localStorage.setItem({json.dumps(k)}, {json.dumps(v if isinstance(v, str) else json.dumps(v))});" for k, v in seed_values.items())
    appr_page = browser.new_page()
    appr_page.on('pageerror', lambda e: errors.append(str(e)))
    appr_page.set_content(html.replace('</head>', f'<script>{seed_js}</script></head>'), wait_until='domcontentloaded', timeout=10000)
    appr_page.locator('#planBtn').click(timeout=5000)
    appr_debug = appr_page.evaluate('window.__debugPlan')
    job_end = {}
    for tech in appr_debug['technicians']:
        for seg in tech['segments']:
            if seg['taskId'] >= 0:
                job_end[seg['taskId']] = max(job_end.get(seg['taskId'], 0), seg['end'])
    early = [f"{appr_debug['tasks'][s['taskId']]['name']}: onay bitişi {s['end']}, işin bitişi {job_end[s['taskId']]}"
             for s in appr_debug['b1Segments'] if s['taskId'] >= 0 and not s.get('kind') and s['taskId'] in job_end and job_end[s['taskId']] > s['end']]
    check('B1 onayı işin son çalışma saatinden önce kalmıyor', not early, '; '.join(early))

    # Regresyon: Teknisyen parçası, onu denetleyen Supervisor parçasıyla aynı iş ve birebir aynı aralıkta olmalı.
    def unpaired_regular_pieces(debug):
        sups = [t for t in debug['technicians'] if t['role'] == 'supervisor']
        missing = []
        for tech in debug['technicians']:
            if tech['role'] != 'regular':
                continue
            for seg in tech['segments']:
                if seg['taskId'] < 0:
                    continue
                if not any(o['taskId'] == seg['taskId'] and o['start'] == seg['start'] and o['end'] == seg['end']
                           for sup in sups for o in sup['segments']):
                    missing.append(f"{tech['name']} iş {seg['taskId']} {seg['start']}-{seg['end']}")
        return missing
    check('Teknisyen parçaları Supervisor parçalarıyla birebir aynı aralıkta (7 kişilik NRC planı)', not unpaired_regular_pieces(b1_debug), '; '.join(unpaired_regular_pieces(b1_debug)[:5]))
    check('Teknisyen parçaları Supervisor parçalarıyla birebir aynı aralıkta (dolu saatli plan)', not unpaired_regular_pieces(appr_debug), '; '.join(unpaired_regular_pieces(appr_debug)[:5]))

    # Bölme adımı: farklı sınırlı bloklar birbirinin sınırından bölünür, zaten birebir olan bloğa dokunulmaz.
    align_result = page.evaluate("""() => {
      const mk = (role, segs) => ({ role, segments: segs.map(([start, end, taskId]) => ({ start, end, taskId, taskName: 'İş' })) });
      const techs = [mk('supervisor', [[0, 75, 0]]), mk('regular', [[0, 60, 0]])];
      alignSupervisionPieces(techs, ['supervisor', 'regular']);
      const same = [mk('supervisor', [[0, 60, 0]]), mk('regular', [[0, 60, 0]])];
      alignSupervisionPieces(same, ['supervisor', 'regular']);
      return { sup: techs[0].segments.map(s => [s.start, s.end]), reg: techs[1].segments.map(s => [s.start, s.end]),
               sameSup: same[0].segments.length, sameReg: same[1].segments.length };
    }""")
    check('Supervisor bloğu Teknisyen bloğunun sınırından bölünüyor; birebir olana dokunulmuyor',
          align_result == {'sup': [[0, 60], [60, 75]], 'reg': [[0, 60]], 'sameSup': 1, 'sameReg': 1}, str(align_result))

    # Regresyon: Teknisyenin müsait olduğu kısa aralık (dolu saatten önce) ekip penceresi uzun diye boş kalmamalı.
    part_values = {
        'asdp_tasks': [{'name': 'J1', 'hours': 7}, {'name': 'J2', 'hours': 11.5}, {'name': 'J3', 'hours': 6}],
        'asdp_techs': ['T1', 'T2', 'T3'], 'asdp_techRoles': ['regular', 'supervisor', 'qualified'],
        'asdp_shiftStart': '08:00', 'asdp_shiftEnd': '16:00', 'asdp_planMode': 'group', 'asdp_algoMode': 'b1_priority',
        'asdp_techBlocks': [[{'start': '09:45', 'end': '13:30'}], [], []],
    }
    part_js = ''.join(f"localStorage.setItem({json.dumps(k)}, {json.dumps(v if isinstance(v, str) else json.dumps(v))});" for k, v in part_values.items())
    part_page = browser.new_page()
    part_page.on('pageerror', lambda e: errors.append(str(e)))
    part_page.set_content(html.replace('</head>', f'<script>{part_js}</script></head>'), wait_until='domcontentloaded', timeout=10000)
    part_page.locator('#planBtn').click(timeout=5000)
    part_debug = part_page.evaluate('window.__debugPlan')
    part_reg = sorted((s for s in part_debug['technicians'][0]['segments'] if s['taskId'] >= 0), key=lambda s: s['start'])
    part_minutes = sum(s['end'] - s['start'] for s in part_reg)
    check('Kısa müsait aralığı olan Teknisyen o aralıkta çalıştırılıyor ve denetimli', bool(part_reg) and part_reg[0]['start'] == 0 and part_minutes >= 240 and not unpaired_regular_pieces(part_debug),
          f"ilk parça: {part_reg[0] if part_reg else None}; toplam: {part_minutes} dk; eşleşmeyen: {unpaired_regular_pieces(part_debug)[:3]}")

    check('Tarayıcı JavaScript hatası yok', len(errors) == 0, '; '.join(errors[:5]))
    browser.close()

for name, ok, detail in results:
    print(('PASS' if ok else 'FAIL') + ' | ' + name + ((' | ' + detail) if detail else ''))
failed = [item for item in results if not item[1]]
print(f'\nSUMMARY: {len(results)-len(failed)}/{len(results)} passed')
if failed:
    raise SystemExit(1)
