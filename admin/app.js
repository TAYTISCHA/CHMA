// ============= STATE & SESSION MANAGEMENT =============
let state = { token: null, scope: 'ALL', rejectType: 'student' };
let rejectTargetId = null; // เก็บ sub_id (ของนักศึกษา) หรือ "lineCode_step" (ของรุ่นพี่)
let isLoadingQueue = false;
let isLoadingMissions = false;

function saveSession(token) { 
  sessionStorage.setItem('a_family_admin_token', token); 
}

function loadSession() { 
  return sessionStorage.getItem('a_family_admin_token'); 
}

function clearSession() {
  sessionStorage.removeItem('a_family_admin_token');
  sessionStorage.removeItem('a_family_admin_scope');
}

function saveScope(scope) { 
  sessionStorage.setItem('a_family_admin_scope', scope); 
}

function loadScope() { 
  return sessionStorage.getItem('a_family_admin_scope'); 
}

// ============= UTILITY FUNCTIONS =============

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function toDriveThumbnail(url, size) {
  if (!url) return '';
  const match = String(url).match(/[-\w]{20,}/);
  if (!match) return url;
  return `https://drive.google.com/thumbnail?id=${match[0]}&sz=w${size || 1000}`;
}

// Centralized error display
function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'fixed top-4 right-4 bg-rose-500/20 border border-rose-500 text-rose-700 px-4 py-3 rounded-lg text-sm max-w-sm z-50';
  errorDiv.innerHTML = `⚠ ${escapeHtml(message)} <button onclick="this.parentElement.remove()" class="ml-2 font-bold">✕</button>`;
  document.body.appendChild(errorDiv);
  setTimeout(() => errorDiv.remove(), 5000);
}

function showSuccess(message) {
  const successDiv = document.createElement('div');
  successDiv.className = 'fixed top-4 right-4 bg-emerald-500/20 border border-emerald-500 text-emerald-700 px-4 py-3 rounded-lg text-sm max-w-sm z-50';
  successDiv.innerHTML = `✓ ${escapeHtml(message)} <button onclick="this.parentElement.remove()" class="ml-2 font-bold">✕</button>`;
  document.body.appendChild(successDiv);
  setTimeout(() => successDiv.remove(), 3000);
}

// Safe API call wrapper
async function safeApiCall(apiName, params) {
  try {
    if (!window.callApi) throw new Error('API client not loaded');
    const res = await callApi(apiName, params);
    if (!res?.success) throw new Error(res?.error || `${apiName} failed`);
    return res;
  } catch (err) {
    console.error(`API Error (${apiName}):`, err);
    throw err;
  }
}

// ============= UI ICON & BADGE FUNCTIONS =============

function tubeIcon(fillColor, opts) {
  opts = opts || {};
  const cracked = opts.cracked ? `<path d="M6 3L7.3 6.2L5.8 8" stroke="#f43f5e" stroke-width="0.8" fill="none"/>` : '';
  return `
    <svg width="14" height="16" viewBox="0 0 14 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 1H9V9.5L12 13.5C12.8 14.7 12 16 10.5 16H3.5C2 16 1.2 14.7 2 13.5L5 9.5V1Z" stroke="#7c3a10" stroke-width="1" fill="rgba(255,255,255,0.5)"/>
      <path d="M2.6 12.2H11.4L10.6 13.6C10.2 14.4 9.4 15 8.5 15H5.5C4.6 15 3.8 14.4 3.4 13.6L2.6 12.2Z" fill="${fillColor}"/>
      <line x1="4" y1="1" x2="10" y2="1" stroke="#7c3a10" stroke-width="1" stroke-linecap="round"/>
      ${cracked}
    </svg>`;
}

function statusBadgeHtml(status) {
  if (status === 'Pending') {
    return `<span class="tube-badge px-1.5 py-0.5 rounded-lg bg-amber-400/20 text-amber-700 text-[10px] font-bold">${tubeIcon('#ffb454')} รอตรวจ</span>`;
  } else if (status === 'Rejected') {
    return `<span class="tube-badge px-1.5 py-0.5 rounded-lg bg-rose-500/15 text-rose-600 text-[10px] font-bold">${tubeIcon('#fda4af', {cracked:true})} ต้องแก้ไข</span>`;
  }
  return `<span class="tube-badge px-1.5 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-700 text-[10px] font-bold">${tubeIcon('#6ee7b7')} ใช้งานอยู่</span>`;
}

// ============= LOGIN MANAGEMENT =============

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginError');
  errEl.classList.add('hidden');
  btn.disabled = true; 
  btn.textContent = 'กำลังเข้าสู่ระบบ...';

  try {
    const res = await safeApiCall('adminLogin', {
      username: document.getElementById('loginUser').value.trim(),
      password: document.getElementById('loginPass').value
    });
    
    saveSession(res.token);
    saveScope(res.scope);
    state.token = res.token;
    state.scope = res.scope;
    applyScopeUI();
    checkAdminAnnouncements('mine');
    await switchTab('queue');
  } catch (err) {
    errEl.textContent = '⚠ ' + err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false; 
    btn.textContent = 'เข้าสู่ระบบ';
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearSession();
  location.reload();
});

document.getElementById('refreshBtn').addEventListener('click', loadQueue);
document.getElementById('tabQueue').addEventListener('click', () => switchTab('queue'));
document.getElementById('tabMissions').addEventListener('click', () => switchTab('missions'));
document.getElementById('tabAnnounce').addEventListener('click', () => switchTab('announce'));

// ============= TAB MANAGEMENT =============

let currentTab = 'queue';

function applyScopeUI() {
  const scope = state.scope;
  const badge = document.getElementById('scopeBadge');
  const hint = document.getElementById('scopeHint');
  const missionsTabBtn = document.getElementById('tabMissions');
  const lineSelect = document.getElementById('missionLineCode');
  const saveBtn = document.getElementById('saveMissionBtn');
  const formTitle = document.getElementById('missionFormTitle');
  const adminQueueSection = document.getElementById('centralAdminQueueSection');
  const announceLineSelect = document.getElementById('announceLineCode');

  missionsTabBtn.classList.remove('hidden');

  if (scope === 'ALL') {
    badge.classList.add('hidden');
    hint.textContent = 'คุณเข้าใช้งานในฐานะแอดมินกลาง สามารถตรวจงานนักศึกษาและภารกิจรุ่นพี่ได้ทั้งหมด';
    if (lineSelect) lineSelect.disabled = false;
    if (saveBtn) saveBtn.textContent = 'บันทึกและอนุมัติภารกิจทันที';
    if (formTitle) formTitle.textContent = '➕ เพิ่ม / แก้ไขภารกิจ (ระบบส่วนกลาง)';
    if (adminQueueSection) adminQueueSection.classList.remove('hidden');
    if (announceLineSelect) announceLineSelect.disabled = false;
  } else {
    badge.innerHTML = `<div>${escapeHtml(scope)}</div>`;
    badge.classList.remove('hidden');
    hint.textContent = `คุณดูแลและเห็นเฉพาะงานของสาย ${scope} เท่านั้น`;

    if (lineSelect) {
      lineSelect.value = scope;
      lineSelect.disabled = true;
    }
    if (saveBtn) saveBtn.textContent = 'ส่งคำขอเพิ่ม/แก้ไขภารกิจไปยังแอดมินกลาง';
    if (formTitle) formTitle.textContent = '📝 ส่งคำขอเพิ่ม / แก้ไขคำใบ้ภารกิจ';
    if (adminQueueSection) adminQueueSection.classList.add('hidden');
    if (announceLineSelect) {
      announceLineSelect.value = scope;
      announceLineSelect.disabled = true;
    }
  }
}

function applyTabStyles() {
  const tabs = ['queue', 'missions', 'announce'];
  const btnIds = { queue: 'tabQueue', missions: 'tabMissions', announce: 'tabAnnounce' };
  const viewIds = { queue: 'queueView', missions: 'missionsView', announce: 'announceManageView' };

  tabs.forEach(t => {
    const active = currentTab === t;
    document.getElementById(btnIds[t]).className =
      'tabBtn px-4 py-2 rounded-xl text-sm font-bold font-display transition ' +
      (active ? 'flame-btn text-white' : 'text-ink-soft hover:text-amber-700');
    document.getElementById(viewIds[t]).classList.toggle('hidden', !active);
  });
}

async function switchTab(tab) {
  currentTab = tab;
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  applyScopeUI();
  applyTabStyles();
  
  try {
    if (tab === 'queue') {
      await loadQueue();
    } else if (tab === 'missions') {
      await loadMissions();
    } else if (tab === 'announce') {
      await loadAnnouncementsManage();
    }
  } catch (err) {
    showError(`Failed to load ${tab}: ${err.message}`);
  }
}

// ============= QUEUE MANAGEMENT =============

async function loadQueue() {
  if (isLoadingQueue) return; // Prevent duplicate calls
  isLoadingQueue = true;
  
  try {
    const res = await safeApiCall('getQueue', { token: state.token });
    
    renderQueue(res.queue);
    if (res.scope && res.scope !== state.scope) {
      state.scope = res.scope;
      saveScope(res.scope);
      applyScopeUI();
    }
  } catch (err) {
    clearSession();
    document.getElementById('loginView').classList.remove('hidden');
    document.getElementById('appShell').classList.add('hidden');
    const errEl = document.getElementById('loginError');
    errEl.textContent = '⚠ ' + (err.message || 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    errEl.classList.remove('hidden');
  } finally {
    isLoadingQueue = false;
  }
}

function renderQueue(queue) {
  document.getElementById('queueCount').textContent = `${queue.length} รายการ`;
  const list = document.getElementById('queueList');
  const empty = document.getElementById('emptyState');
  
  // Remove old listeners by clearing innerHTML
  list.innerHTML = '';

  if (queue.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  queue.forEach(item => {
    const card = document.createElement('div');
    card.className = 'glass rounded-2xl p-4 flex gap-4';
    card.innerHTML = `
      <img src="${toDriveThumbnail(item.image_url, 300)}" loading="lazy"
        class="w-28 h-28 object-cover rounded-xl border border-white/60 flex-shrink-0 cursor-pointer bg-white/40 shadow-sm"
        onerror="this.onerror=null;this.src='${escapeHtml(item.image_url)}';" />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="element-tile px-2 py-0.5 rounded-md text-xs font-extrabold font-data">${escapeHtml(item.line_code)}</span>
          <span class="text-xs text-ink-soft font-medium">ด่านที่ ${item.step}</span>
        </div>
        <p class="font-bold text-sm text-ink">${escapeHtml(item.nickname)} <span class="text-ink-soft font-normal font-data text-xs">(${escapeHtml(String(item.student_id))})</span></p>
        <p class="text-ink-soft text-sm mt-1 whitespace-pre-line">${escapeHtml(item.student_msg) || '<span class="text-ink-soft/50">— ไม่มีข้อความแนบ —</span>'}</p>
        <div class="flex gap-2 mt-3">
          <button class="approveBtn bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg px-3 py-1.5 shadow-sm transition" data-id="${escapeHtml(String(item.sub_id))}">✓ อนุมัติ</button>
          <button class="rejectBtn bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg px-3 py-1.5 shadow-sm transition" data-id="${escapeHtml(String(item.sub_id))}">✕ ปฏิเสธ</button>
        </div>
      </div>
    `;
    list.appendChild(card);

    // Use event delegation for image click
    const img = card.querySelector('img');
    img.addEventListener('click', () => {
      window.open(toDriveThumbnail(item.image_url, 1600), '_blank');
    });

    // Get buttons and attach listeners
    const approveBtn = card.querySelector('.approveBtn');
    const rejectBtn = card.querySelector('.rejectBtn');
    
    approveBtn.addEventListener('click', () => approveItem(item.sub_id, approveBtn));
    rejectBtn.addEventListener('click', () => openRejectModal(item.sub_id, 'student'));
  });
}

async function approveItem(subId, btn) {
  btn.disabled = true; 
  btn.textContent = 'กำลังบันทึก...';
  
  try {
    await safeApiCall('approveSubmission', { token: state.token, sub_id: subId });
    showSuccess('อนุมัติเรียบร้อยแล้ว');
    await loadQueue();
  } catch (err) {
    showError(err.message);
    btn.disabled = false; 
    btn.textContent = '✓ อนุมัติ';
  }
}

// ============= REJECT MODAL =============

function openRejectModal(id, type) {
  rejectTargetId = id;
  state.rejectType = type;
  document.getElementById('rejectReasonInput').value = '';

  if (type === 'mission') {
    document.getElementById('rejectModalTitle').textContent = 'ระบุเหตุผลที่ปฏิเสธภารกิจของรุ่นพี่';
  } else {
    document.getElementById('rejectModalTitle').textContent = 'ระบุเหตุผลที่ปฏิเสธงานของน้อง';
  }

  document.getElementById('rejectModal').classList.remove('hidden');
}

document.getElementById('cancelReject').addEventListener('click', () => {
  document.getElementById('rejectModal').classList.add('hidden');
});

document.getElementById('confirmReject').addEventListener('click', async () => {
  const btn = document.getElementById('confirmReject');
  const reason = document.getElementById('rejectReasonInput').value.trim();
  
  if (!reason) { 
    showError('กรุณากรอกเหตุผลด้วยครับ');
    return; 
  }

  btn.disabled = true; 
  btn.textContent = 'กำลังบันทึก...';
  
  try {
    if (state.rejectType === 'student') {
      await safeApiCall('rejectSubmission', {
        token: state.token,
        sub_id: rejectTargetId,
        reject_reason: reason
      });
      await loadQueue();
    } else {
      const [lineCode, step] = rejectTargetId.split('_');
      await safeApiCall('rejectMission', {
        token: state.token,
        line_code: lineCode,
        step: Number(step),
        reject_reason: reason
      });
      await loadMissions();
    }
    document.getElementById('rejectModal').classList.add('hidden');
    showSuccess('บันทึกเรียบร้อยแล้ว');
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false; 
    btn.textContent = 'ยืนยันปฏิเสธ';
  }
});

// ============= MISSION MANAGEMENT =============

async function loadMissions() {
  if (isLoadingMissions) return; // Prevent duplicate calls
  isLoadingMissions = true;
  
  try {
    const res = await safeApiCall('listMissions', { token: state.token });
    renderMissions(res.missions);

    if (state.scope === 'ALL') {
      const queueRes = await safeApiCall('getMissionQueue', { token: state.token });
      renderMissionQueue(queueRes.queue);
    }
  } catch (err) {
    showError(err.message);
  } finally {
    isLoadingMissions = false;
  }
}

function renderMissionQueue(queue) {
  const container = document.getElementById('centralAdminQueueSection');
  const list = document.getElementById('missionQueueList');
  list.innerHTML = '';

  if (!queue || queue.length === 0) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');

  queue.forEach(m => {
    const card = document.createElement('div');
    card.className = 'glass-input rounded-xl p-3 text-sm';
    card.innerHTML = `
      <div class="flex items-center gap-2 mb-1.5">
        <span class="element-tile px-2 py-0.5 rounded-md text-xs font-extrabold font-data">${escapeHtml(m.line_code)}</span>
        <span class="text-xs font-bold text-amber-700">ด่านที่ ${m.step}</span>
      </div>
      <p class="font-bold text-ink mb-0.5">หัวข้อ: ${escapeHtml(m.task_title)}</p>
      <p class="text-ink-soft text-xs mb-1"><b>วิธีทำ:</b> ${escapeHtml(m.task_desc)}</p>
      <p class="text-ink-soft text-xs mb-3"><b>คำใบ้หลังผ่าน:</b> ${escapeHtml(m.hint_text) || '— ไม่มี —'}</p>
      <div class="flex gap-2">
        <button class="approveMissionBtn bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg px-2.5 py-1 shadow-sm transition">✓ ผ่านอนุมัติ</button>
        <button class="rejectMissionBtn bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg px-2.5 py-1 shadow-sm transition">✕ ไม่ผ่าน (คอมเมนต์)</button>
      </div>
    `;
    list.appendChild(card);

    const approveBtn = card.querySelector('.approveMissionBtn');
    const rejectBtn = card.querySelector('.rejectMissionBtn');
    
    approveBtn.dataset.line = m.line_code;
    approveBtn.dataset.step = m.step;
    rejectBtn.dataset.line = m.line_code;
    rejectBtn.dataset.step = m.step;

    approveBtn.addEventListener('click', async () => {
      approveBtn.disabled = true; 
      approveBtn.textContent = 'กำลังบันทึก...';
      try {
        await safeApiCall('approveMission', {
          token: state.token,
          line_code: approveBtn.dataset.line,
          step: Number(approveBtn.dataset.step)
        });
        showSuccess('อนุมัติเรียบร้อยแล้ว');
        await loadMissions();
      } catch (err) {
        showError(err.message);
        approveBtn.disabled = false; 
        approveBtn.textContent = '✓ ผ่านอนุมัติ';
      }
    });

    rejectBtn.addEventListener('click', () => {
      openRejectModal(`${rejectBtn.dataset.line}_${rejectBtn.dataset.step}`, 'mission');
    });
  });
}

function renderMissions(missions) {
  const list = document.getElementById('missionsList');
  const empty = document.getElementById('missionsEmptyState');
  list.innerHTML = '';

  const filteredMissions = state.scope === 'ALL'
    ? (missions || [])
    : (missions || []).filter(m => m.line_code === state.scope);

  if (filteredMissions.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  filteredMissions.forEach(m => {
    const row = document.createElement('div');

    let borderClass = 'glass';
    let rejectCommentHtml = '';

    if (m.status === 'Pending') {
      borderClass = 'glass border-amber-400/50';
    } else if (m.status === 'Rejected') {
      borderClass = 'glass border-rose-400/50';
      rejectCommentHtml = `
        <div class="mt-2 text-xs bg-rose-500/10 border border-rose-400/30 rounded-lg p-2 text-rose-700">
          <b>เหตุผลที่ไม่ผ่าน:</b> ${escapeHtml(m.reject_reason)}
        </div>
      `;
    }

    const statusBadge = statusBadgeHtml(m.status);

    const deleteButtonHtml = state.scope === 'ALL'
      ? `<button class="deleteMissionBtn text-xs text-rose-600 underline underline-offset-2 flex-shrink-0">ลบ</button>`
      : '';

    row.className = `${borderClass} rounded-2xl p-3 flex flex-col gap-1`;
    row.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="element-tile px-2 py-0.5 rounded-md text-xs font-extrabold font-data flex-shrink-0">${escapeHtml(m.line_code)}</span>
        <span class="text-xs text-ink-soft flex-shrink-0 font-medium">ด่าน ${m.step}</span>
        ${statusBadge}
        <div class="flex-1"></div>
        <button class="editMissionBtn text-xs text-amber-700 underline underline-offset-2 flex-shrink-0 mr-2 font-semibold">แก้ไข</button>
        ${deleteButtonHtml}
      </div>
      <div class="mt-1">
        <p class="text-sm font-bold text-ink">${escapeHtml(m.task_title)}</p>
        <p class="text-xs text-ink-soft truncate mt-0.5">💡 ${escapeHtml(m.hint_text) || '— ไม่มีคำใบ้ —'}</p>
      </div>
      ${rejectCommentHtml}
    `;
    list.appendChild(row);

    // Setup edit button
    const editBtn = row.querySelector('.editMissionBtn');
    editBtn.dataset.line = m.line_code;
    editBtn.dataset.step = m.step;
    editBtn.dataset.title = m.task_title;
    editBtn.dataset.desc = m.task_desc;
    editBtn.dataset.hint = m.hint_text;

    editBtn.addEventListener('click', () => {
      document.getElementById('missionLineCode').value = editBtn.dataset.line;
      document.getElementById('missionStep').value = editBtn.dataset.step;
      document.getElementById('stepDisplay').textContent = `กำลังแก้ไขด่านที่ ${editBtn.dataset.step}`;
      document.getElementById('cancelEditBtn').classList.remove('hidden');
      document.getElementById('missionTitle').value = editBtn.dataset.title;
      document.getElementById('missionDesc').value = editBtn.dataset.desc;
      document.getElementById('missionHint').value = editBtn.dataset.hint;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Setup delete button
    const deleteBtn = row.querySelector('.deleteMissionBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => deleteMission(m.line_code, m.step));
    }
  });
}

document.getElementById('cancelEditBtn').addEventListener('click', () => {
  document.getElementById('missionStep').value = 0;
  document.getElementById('stepDisplay').textContent = 'รันเลขอัตโนมัติ 🚀';
  document.getElementById('cancelEditBtn').classList.add('hidden');
  document.getElementById('missionTitle').value = '';
  document.getElementById('missionDesc').value = '';
  document.getElementById('missionHint').value = '';
});

document.getElementById('saveMissionBtn').addEventListener('click', async () => {
  const btn = document.getElementById('saveMissionBtn');
  const errEl = document.getElementById('missionError');
  const okEl = document.getElementById('missionSuccess');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

  const lineCode = document.getElementById('missionLineCode').value.trim();
  const step = Number(document.getElementById('missionStep').value);
  const title = document.getElementById('missionTitle').value.trim();
  const desc = document.getElementById('missionDesc').value.trim();
  const hint = document.getElementById('missionHint').value.trim();

  // Validation
  if (!lineCode || !title || !desc) {
    errEl.textContent = '⚠ กรุณากรอกข้อมูลให้ครบถ้วน';
    errEl.classList.remove('hidden');
    return;
  }

  if (step < 0) {
    errEl.textContent = '⚠ ด��านต้องเป็นเลขบวก';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true; 
  btn.textContent = 'กำลังดำเนินการ...';

  try {
    const res = await safeApiCall('addMission', {
      token: state.token,
      line_code: lineCode,
      step: step,
      task_title: title,
      task_desc: desc,
      hint_text: hint
    });

    okEl.textContent = '✓ ' + (res.message || 'บันทึกข้อมูลเรียบร้อยแล้ว!');
    okEl.classList.remove('hidden');

    document.getElementById('missionTitle').value = '';
    document.getElementById('missionDesc').value = '';
    document.getElementById('missionHint').value = '';
    document.getElementById('missionStep').value = 0;
    document.getElementById('stepDisplay').textContent = 'รันเลขอัตโนมัติ 🚀';
    document.getElementById('cancelEditBtn').classList.add('hidden');

    await loadMissions();
  } catch (err) {
    errEl.textContent = '⚠ ' + err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    applyScopeUI();
  }
});

async function deleteMission(lineCode, step) {
  if (state.scope !== 'ALL') return;
  if (!confirm(`ลบภารกิจ ${lineCode} ด่าน ${step} ใช่ไหม?`)) return;
  
  try {
    await safeApiCall('deleteMission', { token: state.token, line_code: lineCode, step: Number(step) });
    showSuccess('ลบเรียบร้อยแล้ว');
    await loadMissions();
  } catch (err) {
    showError(err.message);
  }
}

// ============= ANNOUNCEMENT MANAGEMENT =============

async function loadAnnouncementsManage() {
  try {
    const res = await safeApiCall('listAnnouncements', { token: state.token });
    renderAnnounceManageList(res.announcements);
  } catch (err) {
    showError(err.message);
  }
}

const AUDIENCE_LABEL = { STUDENT: 'นักศึกษา', ADMIN: 'รุ่นพี่', ALL: 'ทุกคน' };

function renderAnnounceManageList(list) {
  const container = document.getElementById('announceManageList');
  const empty = document.getElementById('announceListEmptyState');
  container.innerHTML = '';

  if (!list || list.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.forEach(a => {
    const isInactive = a.status !== 'Active';
    const row = document.createElement('div');
    row.className = `glass rounded-2xl p-3 flex flex-col gap-1 ${isInactive ? 'opacity-60' : ''}`;
    row.innerHTML = `
      <div class="flex items-center gap-2 flex-wrap">
        <span class="element-tile px-2 py-0.5 rounded-md text-xs font-extrabold font-data flex-shrink-0">${escapeHtml(a.line_code)}</span>
        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-700">${AUDIENCE_LABEL[a.audience] || a.audience}</span>
        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${isInactive ? 'bg-ink/10 text-ink-soft' : 'bg-emerald-500/15 text-emerald-700'}">${isInactive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</span>
        <div class="flex-1"></div>
        <button class="editAnnounceBtn text-xs text-amber-700 underline underline-offset-2 flex-shrink-0 mr-2 font-semibold">แก้ไข</button>
        <button class="toggleAnnounceBtn text-xs text-amber-700 underline underline-offset-2 flex-shrink-0 mr-2 font-semibold">${isInactive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</button>
        <button class="deleteAnnounceBtn text-xs text-rose-600 underline underline-offset-2 flex-shrink-0">ลบ</button>
      </div>
      <div class="mt-1">
        <p class="text-sm font-bold text-ink">📌 ${escapeHtml(a.title)}</p>
        <p class="text-xs text-ink-soft mt-0.5 whitespace-pre-line">${escapeHtml(a.message)}</p>
      </div>
    `;
    container.appendChild(row);

    // Setup buttons with safe data assignment
    const editBtn = row.querySelector('.editAnnounceBtn');
    const toggleBtn = row.querySelector('.toggleAnnounceBtn');
    const deleteBtn = row.querySelector('.deleteAnnounceBtn');

    editBtn.dataset.id = a.announce_id;
    editBtn.dataset.title = a.title;
    editBtn.dataset.message = a.message;
    editBtn.dataset.audience = a.audience;
    editBtn.dataset.line = a.line_code;
    editBtn.dataset.status = a.status;

    toggleBtn.dataset.id = a.announce_id;
    toggleBtn.dataset.status = a.status;

    deleteBtn.dataset.id = a.announce_id;

    editBtn.addEventListener('click', () => {
      document.getElementById('announceEditId').value = editBtn.dataset.id;
      document.getElementById('announceTitle').value = editBtn.dataset.title;
      document.getElementById('announceMessage').value = editBtn.dataset.message;
      document.getElementById('announceAudience').value = editBtn.dataset.audience;
      document.getElementById('announceLineCode').value = editBtn.dataset.line;
      document.getElementById('announceFormTitle').textContent = '✏️ กำลังแก้ไขประกาศ';
      document.getElementById('cancelAnnounceEditBtn').classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    toggleBtn.addEventListener('click', async () => {
      const newStatus = toggleBtn.dataset.status === 'Active' ? 'Inactive' : 'Active';
      toggleBtn.disabled = true;
      try {
        await safeApiCall('editAnnouncement', { token: state.token, announce_id: toggleBtn.dataset.id, status: newStatus });
        showSuccess('อัปเดตเรียบร้อยแล้ว');
        await loadAnnouncementsManage();
      } catch (err) {
        showError(err.message);
        toggleBtn.disabled = false;
      }
    });

    deleteBtn.addEventListener('click', async () => {
      if (!confirm('ลบประกาศนี้ใช่ไหม?')) return;
      try {
        await safeApiCall('deleteAnnouncement', { token: state.token, announce_id: deleteBtn.dataset.id });
        showSuccess('ลบเรียบร้อยแล้ว');
        await loadAnnouncementsManage();
      } catch (err) {
        showError(err.message);
      }
    });
  });
}

document.getElementById('cancelAnnounceEditBtn').addEventListener('click', () => {
  document.getElementById('announceEditId').value = '';
  document.getElementById('announceTitle').value = '';
  document.getElementById('announceMessage').value = '';
  document.getElementById('announceAudience').value = 'ALL';
  document.getElementById('announceLineCode').value = state.scope === 'ALL' ? 'A1' : state.scope;
  document.getElementById('announceFormTitle').textContent = '➕ เพิ่ม / แก้ไขประกาศ';
  document.getElementById('cancelAnnounceEditBtn').classList.add('hidden');
});

document.getElementById('saveAnnounceBtn').addEventListener('click', async () => {
  const btn = document.getElementById('saveAnnounceBtn');
  const errEl = document.getElementById('announceError');
  const okEl = document.getElementById('announceSuccess');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

  const editId = document.getElementById('announceEditId').value;
  const title = document.getElementById('announceTitle').value.trim();
  const message = document.getElementById('announceMessage').value.trim();
  const audience = document.getElementById('announceAudience').value;
  const lineCode = document.getElementById('announceLineCode').value;

  if (!title || !message) {
    errEl.textContent = '⚠ กรุณากรอกหัวข้อและข้อความ';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true; 
  btn.textContent = 'กำลังบันทึก...';
  
  try {
    let res;
    if (editId) {
      res = await safeApiCall('editAnnouncement', {
        token: state.token, announce_id: editId, title, message, audience, line_code: lineCode
      });
    } else {
      res = await safeApiCall('addAnnouncement', {
        token: state.token, title, message, audience, line_code: lineCode
      });
    }

    okEl.textContent = '✓ ' + (res.message || 'บันทึกเรียบร้อยแล้ว!');
    okEl.classList.remove('hidden');

    document.getElementById('announceEditId').value = '';
    document.getElementById('announceTitle').value = '';
    document.getElementById('announceMessage').value = '';
    document.getElementById('announceFormTitle').textContent = '➕ เพิ่ม / แก้ไขประกาศ';
    document.getElementById('cancelAnnounceEditBtn').classList.add('hidden');

    await loadAnnouncementsManage();
  } catch (err) {
    errEl.textContent = '⚠ ' + err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false; 
    btn.textContent = 'บันทึกประกาศ';
  }
});

// ============= ADMIN ANNOUNCEMENTS =============

const ADMIN_ANNOUNCE_SEEN_KEY = 'a_family_admin_announce_seen';

function getAdminSeenAnnounceIds() {
  try { 
    return JSON.parse(sessionStorage.getItem(ADMIN_ANNOUNCE_SEEN_KEY)) || []; 
  } catch (e) { 
    return []; 
  }
}

function markAdminAnnounceSeen(ids) {
  const seen = new Set(getAdminSeenAnnounceIds());
  ids.forEach(id => seen.add(id));
  sessionStorage.setItem(ADMIN_ANNOUNCE_SEEN_KEY, JSON.stringify([...seen]));
}

let currentAdminAnnouncements = [];

function renderAdminAnnounceList(list) {
  const container = document.getElementById('announceList');
  container.innerHTML = '';
  if (list.length === 0) {
    container.innerHTML = `<p class="text-center text-ink-soft text-sm py-6">ยังไม่มีประกาศตอนนี้~</p>`;
    return;
  }
  list.forEach(a => {
    const card = document.createElement('div');
    card.className = 'glass-input rounded-2xl p-3.5';
    card.innerHTML = `
      <p class="font-display font-bold text-ink text-sm mb-1">📌 ${escapeHtml(a.title)}</p>
      <p class="text-ink-soft text-sm whitespace-pre-line">${escapeHtml(a.message)}</p>
    `;
    container.appendChild(card);
  });
}

async function checkAdminAnnouncements(kind) {
  try {
    let res;
    if (kind === 'public') {
      res = await safeApiCall('getPublicAnnouncements', { audience: 'ADMIN' });
    } else {
      res = await safeApiCall('getAdminAnnouncements', { token: state.token });
    }

    currentAdminAnnouncements = res.announcements || [];
    renderAdminAnnounceList(currentAdminAnnouncements);

    const bell = document.getElementById('announceBell');
    const dot = document.getElementById('announceDot');

    if (currentAdminAnnouncements.length === 0) {
      bell.classList.add('hidden');
      bell.classList.remove('flex');
      return;
    }
    bell.classList.remove('hidden');
    bell.classList.add('flex');

    const seen = getAdminSeenAnnounceIds();
    const unseen = currentAdminAnnouncements.filter(a => !seen.includes(a.announce_id));

    if (unseen.length > 0) {
      dot.classList.remove('hidden');
      document.getElementById('announceModal').classList.remove('hidden');
    } else {
      dot.classList.add('hidden');
    }
  } catch (err) {
    console.error('Failed to load announcements:', err);
  }
}

document.getElementById('announceCloseBtn').addEventListener('click', () => {
  document.getElementById('announceModal').classList.add('hidden');
});

document.getElementById('announceOkBtn').addEventListener('click', () => {
  markAdminAnnounceSeen(currentAdminAnnouncements.map(a => a.announce_id));
  document.getElementById('announceDot').classList.add('hidden');
  document.getElementById('announceModal').classList.add('hidden');
});

document.getElementById('announceBell').addEventListener('click', () => {
  document.getElementById('announceModal').classList.remove('hidden');
});

// ============= BOOT SEQUENCE =============

(async function boot() {
  try {
    const token = loadSession();
    if (token) {
      state.token = token;
      state.scope = loadScope() || 'ALL';
      await checkAdminAnnouncements('mine');
      await switchTab('queue');
    } else {
      await checkAdminAnnouncements('public');
    }
  } catch (err) {
    console.error('Boot error:', err);
    showError('ไม่สามารถโหลดแอพพลิเคชัน กรุณารีเฟรชหน้า');
  }
})();
