// ==========================================
// 1. HELPERS & STATE MANAGEMENT
// ==========================================
const $ = id => document.getElementById(id);
const toggle = (id, show) => $(id)?.classList.toggle('hidden', !show);
const on = (id, evt, cb) => $(id)?.addEventListener(evt, cb);

let state = {
  token: localStorage.getItem('a_family_admin_token'),
  username: localStorage.getItem('a_family_admin_username'),
  scope: localStorage.getItem('a_family_admin_scope'), 
  currentRejectQueueId: null,
  currentEditMissionId: null,
  announcements: []
};

const saveSession = (token, username, scope) => {
  state.token = token; state.username = username; state.scope = scope;
  localStorage.setItem('a_family_admin_token', token);
  localStorage.setItem('a_family_admin_username', username);
  localStorage.setItem('a_family_admin_scope', scope);
};

const clearSession = () => { localStorage.clear(); location.reload(); };
const escapeHtml = str => Object.assign(document.createElement('div'), { textContent: str || '' }).innerHTML;
const toDriveThumbnail = (url, size = 600) => url?.match(/[-\w]{20,}/) ? `https://drive.google.com/thumbnail?id=${url.match(/[-\w]{20,}/)[0]}&sz=w${size}` : url;

// ==========================================
// 2. AUTHENTICATION (ADMIN LOGIN)
// ==========================================
on('loginForm', 'submit', async e => {
  e.preventDefault();
  
  // 🛡️ Guard Clause: ถ้าไม่ใช่หน้าแอดมิน (ไม่มีช่องกรอกชื่อแอดมิน) ให้หยุดทำงานทันที
  if (!$('loginUser') || !$('loginPass')) return;

  const btn = $('loginBtn');
  toggle('loginError', false);
  btn.disabled = true; btn.textContent = 'กำลังตรวจสอบสิทธิ์...';

  try {
    const res = await callApi('adminLogin', {
      username: $('loginUser').value.trim(),
      password: $('loginPass').value
    });
    if (!res.success) throw new Error(res.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    
    saveSession(res.token, res.username, res.scope);
    await switchView(true);
  } catch (err) {
    $('loginError').textContent = '⚠ ' + err.message;
    toggle('loginError', true);
  } finally {
    btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
  }
});

on('logoutBtn', 'click', clearSession);

// ==========================================
// 3. NAVIGATION & TABS SYSTEM
// ==========================================
const tabs = ['tabQueue', 'tabMissions', 'tabAnnounce'];
const views = ['queueView', 'missionsView', 'announceManageView'];

tabs.forEach((tabId, idx) => {
  on(tabId, 'click', () => switchTab(views[idx], tabId));
});

function switchTab(activeViewId, activeTabId) {
  views.forEach(v => toggle(v, v === activeViewId));
  tabs.forEach(t => {
    const el = $(t);
    if (t === activeTabId) {
      el?.classList.add('flame-btn', 'text-white');
      el?.classList.remove('text-ink-soft', 'hover:bg-white/40');
    } else {
      el?.classList.remove('flame-btn', 'text-white');
      el?.classList.add('text-ink-soft', 'hover:bg-white/40');
    }
  });
  
  if (activeViewId === 'queueView') loadQueue();
  if (activeViewId === 'missionsView') loadMissions();
  if (activeViewId === 'announceManageView') loadAnnounceManage();
}

async function switchView(isLoggedIn) {
  toggle('loginView', !isLoggedIn);
  toggle('appShell', isLoggedIn);
  if (isLoggedIn) {
    setupScopeBadge();
    switchTab('queueView', 'tabQueue');
  }
}

function setupScopeBadge() {
  const isCentral = state.scope === 'ALL';
  const badge = $('scopeBadge');
  if (badge) {
    badge.textContent = isCentral ? 'แอดมินกลาง 👑' : `สายรหัส ${state.scope} 🧪`;
    badge.className = isCentral 
      ? 'element-tile text-white bg-amber-700 px-2.5 py-1.5 rounded-xl text-xs font-extrabold text-center leading-tight'
      : 'element-tile text-ink bg-amber-200 px-2.5 py-1.5 rounded-xl text-xs font-extrabold text-center leading-tight';
    toggle('scopeBadge', true);
  }
  $('scopeHint').textContent = `สิทธิ์การเข้าถึง: เข้าดูและจัดการเฉพาะระบบของ ${isCentral ? 'ทุกสายรหัสส่วนกลาง' : `สายรหัส ${state.scope}`}`;
  
  const lineSelect = $('missionLineCode');
  if (lineSelect) {
    lineSelect.value = state.scope;
    lineSelect.disabled = !isCentral;
  }
  toggle('centralAdminQueueSection', isCentral);
}

// ==========================================
// 4. QUEUE MANAGEMENT (ตรวจงาน)
// ==========================================
on('refreshBtn', 'click', () => loadQueue());

async function loadQueue() {
  const res = await callApi('getAdminQueue', { token: state.token });
  if (!res.success) return clearSession();

  $('queueCount').textContent = `รายการรอตรวจทั้งหมด: ${res.queue?.length || 0} รายการ`;
  toggle('emptyState', !res.queue || res.queue.length === 0);

  $('queueList').innerHTML = (res.queue || []).map(q => `
    <div class="glass-strong rounded-2xl p-4 space-y-3">
      <div class="flex justify-between items-start flex-wrap gap-1">
        <div>
          <span class="bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide">สาย ${q.line_code}</span>
          <h3 class="font-display font-bold text-sm text-ink mt-1">${escapeHtml(q.student_name)} (${q.student_id})</h3>
        </div>
        <span class="text-[11px] text-ink-soft/70 font-mono">${q.timestamp}</span>
      </div>
      <p class="text-xs text-ink"><b class="text-amber-700">ด่านที่ ${q.step}:</b> ${escapeHtml(q.task_title)}</p>
      ${q.student_msg ? `<p class="text-xs bg-white/50 p-2.5 rounded-xl text-ink-soft italic">" ${escapeHtml(q.student_msg)} "</p>` : ''}
      ${q.image_url ? `
        <a href="${q.image_url}" target="_blank" class="block group relative overflow-hidden rounded-xl border border-ink/5">
          <img src="${toDriveThumbnail(q.image_url)}" class="w-full max-h-64 object-cover group-hover:scale-102 transition duration-300" />
          <div class="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition">คลิกเพื่อดูรูปใหญ่ 🔍</div>
        </a>` : ''}
      <div class="flex gap-2 pt-1">
        <button onclick="handleApprove('${q.queue_id}')" class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2 rounded-xl transition">ผ่านคุ้มค่า ✅</button>
        <button onclick="openRejectModal('${q.queue_id}')" class="flex-1 bg-rose-100 hover:bg-rose-200 text-rose-600 font-bold text-xs py-2 rounded-xl transition">ให้กลับไปแก้ ❌</button>
      </div>
    </div>
  `).join('');
}

window.handleApprove = async (queueId) => {
  if (!confirm('ยืนยันให้ผ่านด่านนี้ใช่หรือไม่? น้องจะได้รับคำใบ้ถัดไปทันที')) return;
  const res = await callApi('reviewSubmission', { token: state.token, queue_id: queueId, action: 'Approve' });
  if (res.success) loadQueue(); else alert(res.error || 'เกิดข้อผิดพลาด');
};

window.openRejectModal = (queueId) => {
  state.currentRejectQueueId = queueId;
  $('rejectReasonInput').value = '';
  toggle('rejectModal', true);
};

on('cancelReject', 'click', () => toggle('rejectModal', false));
on('confirmReject', 'click', async () => {
  const reason = $('rejectReasonInput').value.trim();
  if (!reason) return alert('กรุณาระบุเหตุผลที่ให้แก้ด้วยครับพี่~');
  
  const res = await callApi('reviewSubmission', {
    token: state.token,
    queue_id: state.currentRejectQueueId,
    action: 'Reject',
    reason: reason
  });
  if (res.success) { toggle('rejectModal', false); loadQueue(); } else alert(res.error || 'เกิดข้อผิดพลาด');
});

// ==========================================
// 5. MISSION MANAGEMENT (จัดการภารกิจ + ปุ่มยกเลิก)
// ==========================================
on('cancelEditBtn', 'click', () => {
  $('missionStep').value = 0;
  $('stepDisplay').textContent = 'รันเลขอัตโนมัติ 🚀';
  $('missionFormTitle').textContent = '➕ เพิ่ม / แก้ไขภารกิจ';
  $('missionTitle').value = '';
  $('missionDesc').value = '';
  $('missionHint').value = '';
  toggle('cancelEditBtn', false);
  state.currentEditMissionId = null;
  
  const lineSelect = $('missionLineCode');
  if (lineSelect) lineSelect.disabled = (state.scope !== 'ALL');
});

on('saveMissionBtn', 'click', async () => {
  const title = $('missionTitle').value.trim();
  if (!title) return showFormMsg('missionError', 'กรุณากรอกชื่อภารกิจ');

  const btn = $('saveMissionBtn');
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  hideFormMsg('missionError'); hideFormMsg('missionSuccess');

  try {
    const res = await callApi('saveMission', {
      token: state.token,
      mission_id: state.currentEditMissionId,
      line_code: $('missionLineCode').value,
      step: Number($('missionStep').value),
      title: title,
      desc: $('missionDesc').value.trim(),
      hint: $('missionHint').value.trim()
    });

    if (!res.success) throw new Error(res.error || 'บันทึกไม่สำเร็จ');
    
    showFormMsg('missionSuccess', '🎉 บันทึกภารกิจเรียบร้อยแล้ว!');
    $('cancelEditBtn').click(); 
    loadMissions();
  } catch (err) {
    showFormMsg('missionError', '❌ ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'บันทึกภารกิจ';
  }
});

async function loadMissions() {
  const res = await callApi('getAdminMissions', { token: state.token });
  if (!res.success) return;

  toggle('missionsEmptyState', !res.missions || res.missions.length === 0);
  $('missionsList').innerHTML = (res.missions || []).map(m => `
    <div class="glass rounded-xl p-3.5 flex justify-between items-start gap-3">
      <div class="space-y-1">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="bg-ink text-white text-[9px] font-bold px-1.5 py-0.5 rounded">สาย ${m.line_code}</span>
          <span class="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 rounded">ด่าน ${m.step}</span>
          <h4 class="font-display font-bold text-xs text-ink">${escapeHtml(m.title)}</h4>
        </div>
        <p class="text-[11px] text-ink-soft line-clamp-2">${escapeHtml(m.desc)}</p>
      </div>
      <button onclick="prepareEditMission(${JSON.stringify(m).replace(/"/g, '&quot;')})" class="text-[11px] text-amber-700 hover:underline font-bold flex-shrink-0">แก้ไข ✏️</button>
    </div>
  `).join('');
}

window.prepareEditMission = (m) => {
  state.currentEditMissionId = m.mission_id;
  $('missionFormTitle').textContent = `✏️ แก้ไขภารกิจ (ด่านที่ ${m.step})`;
  $('missionLineCode').value = m.line_code;
  $('missionLineCode').disabled = true; 
  $('missionStep').value = m.step;
  $('stepDisplay').textContent = `ด่านที่ ${m.step} (แก้ไขอยู่)`;
  $('missionTitle').value = m.title;
  $('missionDesc').value = m.desc || '';
  $('missionHint').value = m.hint || '';
  toggle('cancelEditBtn', true);
  $('missionFormTitle').scrollIntoView({ behavior: 'smooth' });
};

// ==========================================
// 6. ANNOUNCEMENT MANAGEMENT (จัดการประกาศ)
// ==========================================
on('cancelAnnounceEditBtn', 'click', () => {
  $('announceFormTitle').textContent = '➕ เพิ่ม / แก้ไขประกาศ';
  $('announceTitle').value = '';
  $('announceMessage').value = '';
  $('announceEditId').value = '';
  toggle('cancelAnnounceEditBtn', false);
});

on('saveAnnounceBtn', 'click', async () => {
  const title = $('announceTitle').value.trim();
  const msg = $('announceMessage').value.trim();
  if (!title || !msg) return showFormMsg('announceError', 'กรุณากรอกหัวข้อและข้อความให้ครบถ้วน');

  const btn = $('saveAnnounceBtn');
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  hideFormMsg('announceError'); hideFormMsg('announceSuccess');

  try {
    const res = await callApi('saveAnnouncement', {
      token: state.token,
      announce_id: $('announceEditId').value || null,
      audience: $('announceAudience').value,
      line_code: $('announceLineCode').value,
      title: title,
      message: msg
    });

    if (!res.success) throw new Error(res.error || 'บันทึกประกาศไม่สำเร็จ');
    
    showFormMsg('announceSuccess', '📢 บันทึกประกาศเรียบร้อยแล้ว!');
    $('cancelAnnounceEditBtn').click();
    loadAnnounceManage();
  } catch (err) {
    showFormMsg('announceError', '❌ ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'บันทึกประกาศ';
  }
});

async function loadAnnounceManage() {
  const res = await callApi('getAdminAnnouncements', { token: state.token });
  if (!res.success) return;

  toggle('announceListEmptyState', !res.announcements || res.announcements.length === 0);
  $('announceManageList').innerHTML = (res.announcements || []).map(a => `
    <div class="glass rounded-xl p-3.5 space-y-2">
      <div class="flex justify-between items-start gap-2">
        <div>
          <span class="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 rounded">ผู้เห็น: ${a.audience}</span>
          <span class="bg-ink text-white text-[9px] font-bold px-1.5 py-0.5 rounded">สาย: ${a.line_code}</span>
          <h4 class="font-display font-bold text-xs text-ink mt-1">📌 ${escapeHtml(a.title)}</h4>
        </div>
        <div class="flex gap-2 text-[11px] font-bold flex-shrink-0">
          <button onclick="prepareEditAnnounce(${JSON.stringify(a).replace(/"/g, '&quot;')})" class="text-amber-700 hover:underline">แก้</button>
          <button onclick="handleDeleteAnnounce('${a.announce_id}')" class="text-rose-600 hover:underline">ลบ</button>
        </div>
      </div>
      <p class="text-[11px] text-ink-soft whitespace-pre-line">${escapeHtml(a.message)}</p>
    </div>
  `).join('');
}

window.prepareEditAnnounce = (a) => {
  $('announceEditId').value = a.announce_id;
  $('announceFormTitle').textContent = '✏️ แก้ไขประกาศ';
  $('announceAudience').value = a.audience;
  $('announceLineCode').value = a.line_code;
  $('announceTitle').value = a.title;
  $('announceMessage').value = a.message;
  toggle('cancelAnnounceEditBtn', true);
  $('announceFormTitle').scrollIntoView({ behavior: 'smooth' });
};

window.handleDeleteAnnounce = async (id) => {
  if (!confirm('คุณแน่ใจใช่ไหมที่จะลบประกาศนี้?')) return;
  const res = await callApi('deleteAnnouncement', { token: state.token, announce_id: id });
  if (res.success) loadAnnounceManage(); else alert(res.error || 'เกิดข้อผิดพลาด');
};

function showFormMsg(id, txt) { const el = $(id); if(el) { el.textContent = txt; el.classList.remove('hidden'); } }
function hideFormMsg(id) { $(id)?.classList.add('hidden'); }

// ==========================================
// 7. INITIALIZATION
// ==========================================
(async () => {
  await switchView(!!state.token);
})();
