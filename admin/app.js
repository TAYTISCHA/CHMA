// ==========================================
// 1. HELPERS & STATE
// ==========================================
const $ = id => document.getElementById(id);
const toggle = (id, show) => $(id)?.classList.toggle('hidden', !show);
const on = (id, evt, cb) => $(id)?.addEventListener(evt, cb);

let state = {
  token: localStorage.getItem('a_family_admin_token'),
  scope: localStorage.getItem('a_family_admin_scope') || 'ALL',
  rejectType: 'student',
  rejectTargetId: null,
  currentTab: 'queue'
};

const saveSession = (token, scope) => {
  state.token = token; state.scope = scope;
  localStorage.setItem('a_family_admin_token', token);
  localStorage.setItem('a_family_admin_scope', scope);
};
const clearSession = () => { localStorage.clear(); location.reload(); };

const escapeHtml = str => Object.assign(document.createElement('div'), { textContent: str || '' }).innerHTML;
const toDriveThumbnail = (url, size = 1000) => url?.match(/[-\w]{20,}/) ? `https://drive.google.com/thumbnail?id=${url.match(/[-\w]{20,}/)[0]}&sz=w${size}` : url;

// ==========================================
// 2. UI COMPONENTS
// ==========================================
const tubeIcon = (fillColor, cracked = false) => `
  <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
    <path d="M5 1H9V9.5L12 13.5C12.8 14.7 12 16 10.5 16H3.5C2 16 1.2 14.7 2 13.5L5 9.5V1Z" stroke="#7c3a10" stroke-width="1" fill="rgba(255,255,255,0.5)"/>
    <path d="M2.6 12.2H11.4L10.6 13.6C10.2 14.4 9.4 15 8.5 15H5.5C4.6 15 3.8 14.4 3.4 13.6L2.6 12.2Z" fill="${fillColor}"/>
    <line x1="4" y1="1" x2="10" y2="1" stroke="#7c3a10" stroke-width="1" stroke-linecap="round"/>
    ${cracked ? `<path d="M6 3L7.3 6.2L5.8 8" stroke="#f43f5e" stroke-width="0.8" fill="none"/>` : ''}
  </svg>`;

const statusBadgeHtml = status => {
  const configs = {
    Pending: { bg: 'bg-amber-400/20 text-amber-700', icon: tubeIcon('#ffb454'), text: 'รอตรวจ' },
    Rejected: { bg: 'bg-rose-500/15 text-rose-600', icon: tubeIcon('#fda4af', true), text: 'ต้องแก้ไข' }
  };
  const c = configs[status] || { bg: 'bg-emerald-500/15 text-emerald-700', icon: tubeIcon('#6ee7b7'), text: 'ใช้งานอยู่' };
  return `<span class="tube-badge px-1.5 py-0.5 rounded-lg ${c.bg} text-[10px] font-bold">${c.icon} ${c.text}</span>`;
};

// ==========================================
// 3. AUTH & TABS
// ==========================================
on('loginForm', 'submit', async e => {
  e.preventDefault();
  const btn = $('loginBtn');
  toggle('loginError', false);
  btn.disabled = true; btn.textContent = 'กำลังเข้าสู่ระบบ...';
  try {
    const res = await callApi('adminLogin', { username: $('loginUser').value.trim(), password: $('loginPass').value });
    if (!res.success) throw new Error(res.error || 'เข้าสู่ระบบไม่สำเร็จ');
    saveSession(res.token, res.scope);
    applyScopeUI();
    checkAdminAnnouncements('mine');
    await switchTab('queue');
  } catch (err) {
    $('loginError').textContent = '⚠ ' + err.message;
    toggle('loginError', true);
  } finally {
    btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
  }
});

on('logoutBtn', 'click', clearSession);
on('refreshBtn', 'click', loadQueue);
on('tabQueue', 'click', () => switchTab('queue'));
on('tabMissions', 'click', () => switchTab('missions'));
on('tabAnnounce', 'click', () => switchTab('announce'));

function applyScopeUI() {
  const isAll = state.scope === 'ALL';
  toggle('scopeBadge', !isAll);
  $('scopeBadge').innerHTML = isAll ? '' : `<div>${escapeHtml(state.scope)}</div>`;
  $('scopeHint').textContent = isAll ? 'คุณเข้าใช้งานในฐานะแอดมินกลาง สามารถตรวจงานนักศึกษาและภารกิจของรุ่นพี่ได้ทุกสาย' : `คุณดูแลและเห็นเฉพาะงานของสาย ${state.scope} เท่านั้น`;
  
  toggle('tabMissions', true);
  toggle('centralAdminQueueSection', isAll);
  
  ['missionLineCode', 'announceLineCode'].forEach(id => {
    if ($(id)) {
      $(id).disabled = !isAll;
      if (!isAll) $(id).value = state.scope;
    }
  });

  if ($('saveMissionBtn')) $('saveMissionBtn').textContent = isAll ? 'บันทึกและอนุมัติภารกิจทันที' : 'ส่งคำขอเพิ่ม/แก้ไขภารกิจไปยังแอดมินกลาง';
  if ($('missionFormTitle')) $('missionFormTitle').textContent = isAll ? '➕ เพิ่ม / แก้ไขภารกิจ (ระบบส่วนกลาง)' : '📝 ส่งคำขอเพิ่ม / แก้ไขคำใบ้ภารกิจ';
}

async function switchTab(tab) {
  state.currentTab = tab;
  toggle('loginView', false); toggle('appShell', true);
  applyScopeUI();

  const views = { queue: 'queueView', missions: 'missionsView', announce: 'announceManageView' };
  ['queue', 'missions', 'announce'].forEach(t => {
    const active = state.currentTab === t;
    $(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`).className = `tabBtn px-4 py-2 rounded-xl text-sm font-bold font-display transition ${active ? 'flame-btn text-white' : 'text-ink-soft hover:text-amber-700'}`;
    toggle(views[t], active);
  });

  if (tab === 'queue') await loadQueue();
  else if (tab === 'missions') await loadMissions();
  else if (tab === 'announce') await loadAnnouncementsManage();
}

// ==========================================
// 4. QUEUE MANAGEMENT (Event Delegation Applied)
// ==========================================
async function loadQueue() {
  const res = await callApi('getQueue', { token: state.token });
  if (!res.success) {
    clearSession();
    $('loginError').textContent = '⚠ ' + (res.error || 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    toggle('loginError', true); toggle('loginView', true); toggle('appShell', false);
    return;
  }
  if (res.scope && res.scope !== state.scope) saveSession(state.token, res.scope);
  applyScopeUI();
  
  $('queueCount').textContent = `${res.queue.length} รายการ`;
  toggle('emptyState', res.queue.length === 0);
  
  $('queueList').innerHTML = res.queue.map(item => `
    <div class="glass rounded-2xl p-4 flex gap-4">
      <img src="${toDriveThumbnail(item.image_url, 300)}" loading="lazy" class="w-28 h-28 object-cover rounded-xl border border-white/60 flex-shrink-0 cursor-pointer bg-white/40 shadow-sm" onclick="window.open('${toDriveThumbnail(item.image_url, 1600)}', '_blank')" onerror="this.onerror=null;this.src='${item.image_url}';" />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="element-tile px-2 py-0.5 rounded-md text-xs font-extrabold font-data">${escapeHtml(item.line_code)}</span>
          <span class="text-xs text-ink-soft font-medium">ด่านที่ ${item.step}</span>
        </div>
        <p class="font-bold text-sm text-ink">${escapeHtml(item.nickname)} <span class="text-ink-soft font-normal font-data text-xs">(${escapeHtml(String(item.student_id))})</span></p>
        <p class="text-ink-soft text-sm mt-1 whitespace-pre-line">${escapeHtml(item.student_msg) || '<span class="text-ink-soft/50">— ไม่มีข้อความแนบ —</span>'}</p>
        <div class="flex gap-2 mt-3">
          <button class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg px-3 py-1.5 shadow-sm transition" data-action="approve" data-id="${item.sub_id}">✓ อนุมัติ</button>
          <button class="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg px-3 py-1.5 shadow-sm transition" data-action="reject" data-id="${item.sub_id}">✕ ปฏิเสธ</button>
        </div>
      </div>
    </div>
  `).join('');
}

// Queue Actions (Delegation)
on('queueList', 'click', async e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'approve') {
    btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
    try {
      const res = await callApi('approveSubmission', { token: state.token, sub_id: id });
      if (!res.success) throw new Error(res.error);
      await loadQueue();
    } catch (err) { alert(err.message); btn.disabled = false; btn.textContent = '✓ อนุมัติ'; }
  } else if (action === 'reject') {
    openRejectModal(id, 'student');
  }
});

function openRejectModal(id, type) {
  state.rejectTargetId = id; state.rejectType = type;
  $('rejectReasonInput').value = '';
  $('rejectModalTitle').textContent = type === 'mission' ? 'ระบุเหตุผลที่ปฏิเสธภารกิจของรุ่นพี่' : 'ระบุเหตุผลที่ปฏิเสธงานของน้อง';
  toggle('rejectModal', true);
}

on('cancelReject', 'click', () => toggle('rejectModal', false));
on('confirmReject', 'click', async () => {
  const reason = $('rejectReasonInput').value.trim();
  if (!reason) return alert('กรุณากรอกเหตุผลด้วยครับ');
  
  const btn = $('confirmReject');
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  try {
    let res;
    if (state.rejectType === 'student') {
      res = await callApi('rejectSubmission', { token: state.token, sub_id: state.rejectTargetId, reject_reason: reason });
      if (!res.success) throw new Error(res.error);
      await loadQueue();
    } else {
      const [lineCode, step] = state.rejectTargetId.split('_');
      res = await callApi('rejectMission', { token: state.token, line_code: lineCode, step: Number(step), reject_reason: reason });
      if (!res.success) throw new Error(res.error);
      await loadMissions();
    }
    toggle('rejectModal', false);
  } catch (err) { alert(err.message); } 
  finally { btn.disabled = false; btn.textContent = 'ยืนยันปฏิเสธ'; }
});

// ==========================================
// 5. MISSIONS MANAGEMENT
// ==========================================
async function loadMissions() {
  try {
    const res = await callApi('listMissions', { token: state.token });
    if (!res.success) return alert(res.error || 'โหลดรายการภารกิจไม่สำเร็จ');
    renderMissions(res.missions || []);
    
    if (state.scope === 'ALL') {
      const queueRes = await callApi('getMissionQueue', { token: state.token });
      if (queueRes.success) renderMissionQueue(queueRes.queue || []);
    }
  } catch (e) { alert('เกิดข้อผิดพลาดในการโหลดข้อมูลภารกิจ'); }
}

function renderMissionQueue(queue) {
  toggle('centralAdminQueueSection', queue.length > 0);
  $('missionQueueList').innerHTML = queue.map(m => `
    <div class="glass-input rounded-xl p-3 text-sm">
      <div class="flex items-center gap-2 mb-1.5"><span class="element-tile px-2 py-0.5 rounded-md text-xs font-extrabold font-data">${escapeHtml(m.line_code)}</span><span class="text-xs font-bold text-amber-700">ด่านที่ ${m.step}</span></div>
      <p class="font-bold text-ink mb-0.5">หัวข้อ: ${escapeHtml(m.task_title)}</p>
      <p class="text-ink-soft text-xs mb-1"><b>วิธีทำ:</b> ${escapeHtml(m.task_desc)}</p>
      <p class="text-ink-soft text-xs mb-3"><b>คำใบ้หลังผ่าน:</b> ${escapeHtml(m.hint_text) || '— ไม่มี —'}</p>
      <div class="flex gap-2">
        <button class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg px-2.5 py-1" data-action="approve-m" data-line="${escapeHtml(m.line_code)}" data-step="${m.step}">✓ ผ่านอนุมัติ</button>
        <button class="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg px-2.5 py-1" data-action="reject-m" data-line="${escapeHtml(m.line_code)}" data-step="${m.step}">✕ ไม่ผ่าน (คอมเมนต์)</button>
      </div>
    </div>
  `).join('');
}

on('missionQueueList', 'click', async e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const { action, line, step } = btn.dataset;
  if (action === 'approve-m') {
    btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
    try {
      const res = await callApi('approveMission', { token: state.token, line_code: line, step: Number(step) });
      if (!res.success) throw new Error(res.error);
      await loadMissions();
    } catch (err) { alert(err.message); btn.disabled = false; btn.textContent = '✓ ผ่านอนุมัติ'; }
  } else if (action === 'reject-m') {
    openRejectModal(`${line}_${step}`, 'mission');
  }
});

function renderMissions(missions) {
  const filtered = state.scope === 'ALL' ? missions : missions.filter(m => m.line_code === state.scope);
  toggle('missionsEmptyState', filtered.length === 0);
  
  $('missionsList').innerHTML = filtered.map(m => `
    <div class="glass ${m.status === 'Pending' ? 'border-amber-400/50' : m.status === 'Rejected' ? 'border-rose-400/50' : ''} rounded-2xl p-3 flex flex-col gap-1">
      <div class="flex items-center gap-2">
        <span class="element-tile px-2 py-0.5 rounded-md text-xs font-extrabold font-data flex-shrink-0">${escapeHtml(m.line_code)}</span>
        <span class="text-xs text-ink-soft flex-shrink-0 font-medium">ด่าน ${m.step}</span>
        ${statusBadgeHtml(m.status)}
        <div class="flex-1"></div>
        <button class="text-xs text-amber-700 underline flex-shrink-0 mr-2 font-semibold" data-action="edit" data-line="${escapeHtml(m.line_code)}" data-step="${m.step}" data-title="${escapeHtml(m.task_title)}" data-desc="${escapeHtml(m.task_desc)}" data-hint="${escapeHtml(m.hint_text)}">แก้ไข</button>
        ${state.scope === 'ALL' ? `<button class="text-xs text-rose-600 underline flex-shrink-0" data-action="delete" data-line="${escapeHtml(m.line_code)}" data-step="${m.step}">ลบ</button>` : ''}
      </div>
      <div class="mt-1">
        <p class="text-sm font-bold text-ink">${escapeHtml(m.task_title)}</p>
        <p class="text-xs text-ink-soft truncate mt-0.5">💡 ${escapeHtml(m.hint_text) || '— ไม่มีคำใบ้ —'}</p>
      </div>
      ${m.status === 'Rejected' ? `<div class="mt-2 text-xs bg-rose-500/10 border border-rose-400/30 rounded-lg p-2 text-rose-700"><b>เหตุผลที่ไม่ผ่าน:</b> ${escapeHtml(m.reject_reason)}</div>` : ''}
    </div>
  `).join('');
}

on('missionsList', 'click', async e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const { action, line, step, title, desc, hint } = btn.dataset;
  if (action === 'edit') {
    $('missionLineCode').value = line; $('missionStep').value = step;
    $('stepDisplay').textContent = `กำลังแก้ไขด่านที่ ${step}`; toggle('cancelEditBtn', true);
    $('missionTitle').value = title; $('missionDesc').value = desc; $('missionHint').value = hint;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (action === 'delete') {
    if (state.scope !== 'ALL' || !confirm(`ลบภารกิจ ${line} ด่าน ${step} ใช่ไหม?`)) return;
    try {
      const res = await callApi('deleteMission', { token: state.token, line_code: line, step: Number(step) });
      if (!res.success) throw new Error(res.error);
      await loadMissions();
    } catch (err) { alert(err.message); }
  }
});

on('cancelEditBtn', 'click', () => {
  $('missionStep').value = 0; $('stepDisplay').textContent = 'รันเลขอัตโนมัติ 🚀'; toggle('cancelEditBtn', false);
  $('missionTitle').value = ''; $('missionDesc').value = ''; $('missionHint').value = '';
});

on('saveMissionBtn', 'click', async () => {
  const btn = $('saveMissionBtn');
  toggle('missionError', false); toggle('missionSuccess', false);
  btn.disabled = true; btn.textContent = 'กำลังดำเนินการ...';
  
  try {
    const res = await callApi('addMission', {
      token: state.token, line_code: $('missionLineCode').value, step: Number($('missionStep').value),
      task_title: $('missionTitle').value.trim(), task_desc: $('missionDesc').value.trim(), hint_text: $('missionHint').value.trim()
    });
    if (!res.success) throw new Error(res.error || 'บันทึกภารกิจไม่สำเร็จ');
    
    $('missionSuccess').textContent = '✓ ' + (res.message || 'บันทึกข้อมูลเรียบร้อยแล้ว!');
    toggle('missionSuccess', true);
    
    $('cancelEditBtn').click(); // Reset form
    await loadMissions();
  } catch (err) {
    $('missionError').textContent = '⚠ ' + err.message; toggle('missionError', true);
  } finally { btn.disabled = false; applyScopeUI(); }
});

// ==========================================
// 6. ANNOUNCEMENT MANAGEMENT
// ==========================================
async function loadAnnouncementsManage() {
  try {
    const res = await callApi('listAnnouncements', { token: state.token });
    if (!res.success) return alert(res.error || 'โหลดรายการประกาศไม่สำเร็จ');
    renderAnnounceManageList(res.announcements || []);
  } catch (e) { alert('เกิดข้อผิดพลาดในการโหลดข้อมูลประกาศ'); }
}

const AUDIENCE_LABEL = { STUDENT: 'นักศึกษา', ADMIN: 'รุ่นพี่', ALL: 'ทุกคน' };

function renderAnnounceManageList(list) {
  toggle('announceListEmptyState', list.length === 0);
  $('announceManageList').innerHTML = list.map(a => {
    const isOff = a.status !== 'Active';
    return `
    <div class="glass rounded-2xl p-3 flex flex-col gap-1 ${isOff ? 'opacity-60' : ''}">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="element-tile px-2 py-0.5 rounded-md text-xs font-extrabold font-data">${escapeHtml(a.line_code)}</span>
        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-700">${AUDIENCE_LABEL[a.audience] || a.audience}</span>
        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${isOff ? 'bg-ink/10 text-ink-soft' : 'bg-emerald-500/15 text-emerald-700'}">${isOff ? 'ปิดใช้งาน' : 'กำลังแสดง'}</span>
        <div class="flex-1"></div>
        <button class="text-xs text-amber-700 underline mr-2 font-semibold" data-action="edit-a" data-id="${escapeHtml(a.announce_id)}" data-title="${escapeHtml(a.title)}" data-message="${escapeHtml(a.message)}" data-audience="${escapeHtml(a.audience)}" data-line="${escapeHtml(a.line_code)}">แก้ไข</button>
        <button class="text-xs text-amber-700 underline mr-2 font-semibold" data-action="toggle-a" data-id="${escapeHtml(a.announce_id)}" data-status="${escapeHtml(a.status)}">${isOff ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</button>
        <button class="text-xs text-rose-600 underline" data-action="delete-a" data-id="${escapeHtml(a.announce_id)}">ลบ</button>
      </div>
      <div class="mt-1"><p class="text-sm font-bold text-ink">📌 ${escapeHtml(a.title)}</p><p class="text-xs text-ink-soft mt-0.5 whitespace-pre-line">${escapeHtml(a.message)}</p></div>
    </div>`;
  }).join('');
}

on('announceManageList', 'click', async e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const { action, id, title, message, audience, line, status } = btn.dataset;
  
  if (action === 'edit-a') {
    $('announceEditId').value = id; $('announceTitle').value = title; $('announceMessage').value = message;
    $('announceAudience').value = audience; $('announceLineCode').value = line;
    $('announceFormTitle').textContent = '✏️ กำลังแก้ไขประกาศ'; toggle('cancelAnnounceEditBtn', true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (action === 'toggle-a') {
    btn.disabled = true;
    try {
      const res = await callApi('editAnnouncement', { token: state.token, announce_id: id, status: status === 'Active' ? 'Inactive' : 'Active' });
      if (!res.success) throw new Error(res.error); await loadAnnouncementsManage();
    } catch (err) { alert(err.message); btn.disabled = false; }
  } else if (action === 'delete-a') {
    if (!confirm('ลบประกาศนี้ใช่ไหม?')) return;
    try {
      const res = await callApi('deleteAnnouncement', { token: state.token, announce_id: id });
      if (!res.success) throw new Error(res.error); await loadAnnouncementsManage();
    } catch (err) { alert(err.message); }
  }
});

on('cancelAnnounceEditBtn', 'click', () => {
  $('announceEditId').value = ''; $('announceTitle').value = ''; $('announceMessage').value = '';
  $('announceAudience').value = 'ALL'; $('announceLineCode').value = state.scope === 'ALL' ? 'A1' : state.scope;
  $('announceFormTitle').textContent = '➕ เพิ่ม / แก้ไขประกาศ'; toggle('cancelAnnounceEditBtn', false);
});

on('saveAnnounceBtn', 'click', async () => {
  const btn = $('saveAnnounceBtn');
  toggle('announceError', false); toggle('announceSuccess', false);
  const data = { announce_id: $('announceEditId').value, title: $('announceTitle').value.trim(), message: $('announceMessage').value.trim(), audience: $('announceAudience').value, line_code: $('announceLineCode').value };
  
  if (!data.title || !data.message) return $('announceError').textContent = '⚠ กรุณากรอกหัวข้อและข้อความ', toggle('announceError', true);
  
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  try {
    const endpoint = data.announce_id ? 'editAnnouncement' : 'addAnnouncement';
    const res = await callApi(endpoint, { token: state.token, ...data });
    if (!res.success) throw new Error(res.error || 'บันทึกประกาศไม่สำเร็จ');
    
    $('announceSuccess').textContent = '✓ ' + (res.message || 'บันทึกเรียบร้อยแล้ว!'); toggle('announceSuccess', true);
    $('cancelAnnounceEditBtn').click(); // Reset form
    await loadAnnouncementsManage();
  } catch (err) { $('announceError').textContent = '⚠ ' + err.message; toggle('announceError', true); }
  finally { btn.disabled = false; btn.textContent = 'บันทึกประกาศ'; }
});

// ==========================================
// 7. ADMIN ANNOUNCEMENT NOTIFICATIONS
// ==========================================
const ADMIN_ANNOUNCE_SEEN_KEY = 'a_family_admin_announce_seen';
const getSeenIds = () => JSON.parse(localStorage.getItem(ADMIN_ANNOUNCE_SEEN_KEY) || '[]');
const markSeenIds = ids => localStorage.setItem(ADMIN_ANNOUNCE_SEEN_KEY, JSON.stringify([...new Set([...getSeenIds(), ...ids])]));

let currentAdminAnnouncements = [];

async function checkAdminAnnouncements(kind) {
  const res = await callApi(kind === 'public' ? 'getPublicAnnouncements' : 'getAdminAnnouncements', kind === 'public' ? { audience: 'ADMIN' } : { token: state.token });
  if (!res?.success) return;

  currentAdminAnnouncements = res.announcements || [];
  const container = $('announceList');
  container.innerHTML = currentAdminAnnouncements.length ? currentAdminAnnouncements.map(a => `<div class="glass-input rounded-2xl p-3.5"><p class="font-display font-bold text-ink text-sm mb-1">📌 ${escapeHtml(a.title)}</p><p class="text-ink-soft text-sm whitespace-pre-line">${escapeHtml(a.message)}</p></div>`).join('') : `<p class="text-center text-ink-soft text-sm py-6">ยังไม่มีประกาศตอนนี้~</p>`;
  
  const unseen = currentAdminAnnouncements.filter(a => !getSeenIds().includes(a.announce_id));
  toggle('announceBell', currentAdminAnnouncements.length > 0);
  $('announceBell')?.classList.toggle('flex', currentAdminAnnouncements.length > 0);
  toggle('announceDot', unseen.length > 0);
  if (unseen.length > 0) toggle('announceModal', true);
}

on('announceCloseBtn', 'click', () => toggle('announceModal', false));
on('announceOkBtn', 'click', () => { markSeenIds(currentAdminAnnouncements.map(a => a.announce_id)); toggle('announceDot', false); toggle('announceModal', false); });
on('announceBell', 'click', () => toggle('announceModal', true));

// ==========================================
// 8. INIT
// ==========================================
(async () => {
  if (state.token) { checkAdminAnnouncements('mine'); await switchTab('queue'); }
  else { checkAdminAnnouncements('public'); }
})();
