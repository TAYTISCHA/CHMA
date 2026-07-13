let state = { token: null, scope: 'ALL', rejectType: 'student' };
let rejectTargetId = null; // เก็บ sub_id (ของนักศึกษา) หรือ "lineCode_step" (ของรุ่นพี่)

function saveSession(token) { localStorage.setItem('a_family_admin_token', token); }
function loadSession() { return localStorage.getItem('a_family_admin_token'); }
function clearSession() {
  localStorage.removeItem('a_family_admin_token');
  localStorage.removeItem('a_family_admin_scope');
}
function saveScope(scope) { localStorage.setItem('a_family_admin_scope', scope); }
function loadScope() { return localStorage.getItem('a_family_admin_scope'); }

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

// ไอคอนหลอดทดลองสำหรับสถานะต่าง ๆ (สื่อความหมายด้วยสีของ "น้ำยา" ในหลอด)
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

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginError');
  errEl.classList.add('hidden');
  btn.disabled = true; btn.textContent = 'กำลังเข้าสู่ระบบ...';

  try {
    const res = await callApi('adminLogin', {
      username: document.getElementById('loginUser').value.trim(),
      password: document.getElementById('loginPass').value
    });
    if (!res.success) throw new Error(res.error || 'เข้าสู่ระบบไม่สำเร็จ');
    saveSession(res.token);
    saveScope(res.scope);
    state.token = res.token;
    state.scope = res.scope;
    applyScopeUI();
    await switchTab('queue');
  } catch (err) {
    errEl.textContent = '⚠ ' + err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearSession();
  location.reload();
});
document.getElementById('refreshBtn').addEventListener('click', loadQueue);
document.getElementById('tabQueue').addEventListener('click', () => switchTab('queue'));
document.getElementById('tabMissions').addEventListener('click', () => switchTab('missions'));

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

  missionsTabBtn.classList.remove('hidden');

  if (scope === 'ALL') {
    badge.classList.add('hidden');
    hint.textContent = 'คุณเข้าใช้งานในฐานะแอดมินกลาง สามารถตรวจงานนักศึกษาและภารกิจของรุ่นพี่ได้ทุกสาย';
    if (lineSelect) lineSelect.disabled = false;
    if (saveBtn) saveBtn.textContent = 'บันทึกและอนุมัติภารกิจทันที';
    if (formTitle) formTitle.textContent = '➕ เพิ่ม / แก้ไขภารกิจ (ระบบส่วนกลาง)';
    if (adminQueueSection) adminQueueSection.classList.remove('hidden');
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
  }
}

function applyTabStyles() {
  const isQueue = currentTab === 'queue';
  document.getElementById('tabQueue').className =
    'tabBtn px-4 py-2 rounded-xl text-sm font-bold font-display transition ' +
    (isQueue ? 'flame-btn text-white' : 'text-ink-soft hover:text-amber-700');
  document.getElementById('tabMissions').className =
    'tabBtn px-4 py-2 rounded-xl text-sm font-bold font-display transition ' +
    (!isQueue ? 'flame-btn text-white' : 'text-ink-soft hover:text-amber-700');
  document.getElementById('queueView').classList.toggle('hidden', !isQueue);
  document.getElementById('missionsView').classList.toggle('hidden', isQueue);
}

async function switchTab(tab) {
  currentTab = tab;
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  applyScopeUI();
  applyTabStyles();
  if (tab === 'queue') {
    await loadQueue();
  } else {
    await loadMissions();
  }
}

async function loadQueue() {
  const res = await callApi('getQueue', { token: state.token });
  if (!res.success) {
    clearSession();
    document.getElementById('loginView').classList.remove('hidden');
    document.getElementById('appShell').classList.add('hidden');
    const errEl = document.getElementById('loginError');
    errEl.textContent = '⚠ ' + (res.error || 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    errEl.classList.remove('hidden');
    return;
  }
  renderQueue(res.queue);
  if (res.scope && res.scope !== state.scope) {
    state.scope = res.scope;
    saveScope(res.scope);
    applyScopeUI();
  }
}

function renderQueue(queue) {
  document.getElementById('queueCount').textContent = `${queue.length} รายการ`;
  const list = document.getElementById('queueList');
  const empty = document.getElementById('emptyState');
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
        onclick="window.open('${toDriveThumbnail(item.image_url, 1600)}', '_blank')"
        onerror="this.onerror=null;this.src='${item.image_url}';" />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="element-tile px-2 py-0.5 rounded-md text-xs font-extrabold font-data">${escapeHtml(item.line_code)}</span>
          <span class="text-xs text-ink-soft font-medium">ด่านที่ ${item.step}</span>
        </div>
        <p class="font-bold text-sm text-ink">${escapeHtml(item.nickname)} <span class="text-ink-soft font-normal font-data text-xs">(${escapeHtml(String(item.student_id))})</span></p>
        <p class="text-ink-soft text-sm mt-1 whitespace-pre-line">${escapeHtml(item.student_msg) || '<span class="text-ink-soft/50">— ไม่มีข้อความแนบ —</span>'}</p>
        <div class="flex gap-2 mt-3">
          <button class="approveBtn bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg px-3 py-1.5 shadow-sm transition" data-id="${item.sub_id}">✓ อนุมัติ</button>
          <button class="rejectBtn bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg px-3 py-1.5 shadow-sm transition" data-id="${item.sub_id}">✕ ปฏิเสธ</button>
        </div>
      </div>
    `;
    list.appendChild(card);
  });

  document.querySelectorAll('.approveBtn').forEach(btn => {
    btn.addEventListener('click', () => approveItem(btn.dataset.id, btn));
  });
  document.querySelectorAll('.rejectBtn').forEach(btn => {
    btn.addEventListener('click', () => openRejectModal(btn.dataset.id, 'student'));
  });
}

async function approveItem(subId, btn) {
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  try {
    const res = await callApi('approveSubmission', { token: state.token, sub_id: subId });
    if (!res.success) throw new Error(res.error);
    await loadQueue();
  } catch (err) {
    alert(err.message);
    btn.disabled = false; btn.textContent = '✓ อนุมัติ';
  }
}

function openRejectModal(id, type) {
  rejectTargetId = id;
  state.rejectType = type; // 'student' หรือ 'mission'
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
  if (!reason) { alert('กรุณากรอกเหตุผลด้วยครับ'); return; }

  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  try {
    if (state.rejectType === 'student') {
      const res = await callApi('rejectSubmission', {
        token: state.token,
        sub_id: rejectTargetId,
        reject_reason: reason
      });
      if (!res.success) throw new Error(res.error);
      await loadQueue();
    } else {
      const [lineCode, step] = rejectTargetId.split('_');
      const res = await callApi('rejectMission', {
        token: state.token,
        line_code: lineCode,
        step: Number(step),
        reject_reason: reason
      });
      if (!res.success) throw new Error(res.error);
      await loadMissions();
    }
    document.getElementById('rejectModal').classList.add('hidden');
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'ยืนยันปฏิเสธ';
  }
});

/* ---------------- MISSION MANAGEMENT ---------------- */

async function loadMissions() {
  try {
    const res = await callApi('listMissions', { token: state.token });
    if (!res.success) {
      alert(res.error || 'โหลดรายการภารกิจไม่สำเร็จ');
      return;
    }
    renderMissions(res.missions);

    if (state.scope === 'ALL') {
      const queueRes = await callApi('getMissionQueue', { token: state.token });
      if (queueRes.success) {
        renderMissionQueue(queueRes.queue);
      }
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาดในการโหลดข้อมูลภารกิจ');
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
        <button class="approveMissionBtn bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg px-2.5 py-1 shadow-sm transition"
          data-line="${escapeHtml(m.line_code)}" data-step="${m.step}">✓ ผ่านอนุมัติ</button>
        <button class="rejectMissionBtn bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg px-2.5 py-1 shadow-sm transition"
          data-line="${escapeHtml(m.line_code)}" data-step="${m.step}">✕ ไม่ผ่าน (คอมเมนต์)</button>
      </div>
    `;
    list.appendChild(card);
  });

  document.querySelectorAll('.approveMissionBtn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
      try {
        const res = await callApi('approveMission', {
          token: state.token,
          line_code: btn.dataset.line,
          step: Number(btn.dataset.step)
        });
        if (!res.success) throw new Error(res.error);
        await loadMissions();
      } catch (err) {
        alert(err.message);
        btn.disabled = false; btn.textContent = '✓ ผ่านอนุมัติ';
      }
    });
  });

  document.querySelectorAll('.rejectMissionBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      openRejectModal(`${btn.dataset.line}_${btn.dataset.step}`, 'mission');
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
      ? `<button class="deleteMissionBtn text-xs text-rose-600 underline underline-offset-2 flex-shrink-0" data-line="${escapeHtml(m.line_code)}" data-step="${m.step}">ลบ</button>`
      : '';

    row.className = `${borderClass} rounded-2xl p-3 flex flex-col gap-1`;
    row.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="element-tile px-2 py-0.5 rounded-md text-xs font-extrabold font-data flex-shrink-0">${escapeHtml(m.line_code)}</span>
        <span class="text-xs text-ink-soft flex-shrink-0 font-medium">ด่าน ${m.step}</span>
        ${statusBadge}
        <div class="flex-1"></div>
        <button class="editMissionBtn text-xs text-amber-700 underline underline-offset-2 flex-shrink-0 mr-2 font-semibold"
          data-line="${escapeHtml(m.line_code)}" data-step="${m.step}"
          data-title="${escapeHtml(m.task_title)}" data-desc="${escapeHtml(m.task_desc)}" data-hint="${escapeHtml(m.hint_text)}">แก้ไข</button>
        ${deleteButtonHtml}
      </div>
      <div class="mt-1">
        <p class="text-sm font-bold text-ink">${escapeHtml(m.task_title)}</p>
        <p class="text-xs text-ink-soft truncate mt-0.5">💡 ${escapeHtml(m.hint_text) || '— ไม่มีคำใบ้ —'}</p>
      </div>
      ${rejectCommentHtml}
    `;
    list.appendChild(row);
  });

  // 💡 เมื่อกดปุ่มแก้ไข
  document.querySelectorAll('.editMissionBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('missionLineCode').value = btn.dataset.line;
      document.getElementById('missionStep').value = btn.dataset.step;

      // แสดงข้อความบอกว่ากำลังแก้ไข และปุ่มยกเลิก
      document.getElementById('stepDisplay').textContent = `กำลังแก้ไขด่านที่ ${btn.dataset.step}`;
      document.getElementById('cancelEditBtn').classList.remove('hidden');

      document.getElementById('missionTitle').value = btn.dataset.title;
      document.getElementById('missionDesc').value = btn.dataset.desc;
      document.getElementById('missionHint').value = btn.dataset.hint;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // 💡 เมื่อกดปุ่มลบ
  document.querySelectorAll('.deleteMissionBtn').forEach(btn => {
    btn.addEventListener('click', () => deleteMission(btn.dataset.line, btn.dataset.step));
  });
}

// 💡 โค้ดสำหรับปุ่ม "ยกเลิกแก้"
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
  btn.disabled = true; btn.textContent = 'กำลังดำเนินการ...';

  try {
    const res = await callApi('addMission', {
      token: state.token,
      line_code: document.getElementById('missionLineCode').value,
      step: Number(document.getElementById('missionStep').value),
      task_title: document.getElementById('missionTitle').value.trim(),
      task_desc: document.getElementById('missionDesc').value.trim(),
      hint_text: document.getElementById('missionHint').value.trim()
    });

    if (!res.success) throw new Error(res.error || 'บันทึกภารกิจไม่สำเร็จ');

    okEl.textContent = '✓ ' + (res.message || 'บันทึกข้อมูลเรียบร้อยแล้ว!');
    okEl.classList.remove('hidden');

    // 💡 รีเซ็ตฟอร์มกลับเป็นรันเลขอัตโนมัติ
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
    const res = await callApi('deleteMission', { token: state.token, line_code: lineCode, step: Number(step) });
    if (!res.success) throw new Error(res.error);
    await loadMissions();
  } catch (err) {
    alert(err.message);
  }
}

(async function boot() {
  const token = loadSession();
  if (token) {
    state.token = token;
    state.scope = loadScope() || 'ALL';
    await switchTab('queue');
  }
})();
