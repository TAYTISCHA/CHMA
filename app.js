// ==========================================
// 1. HELPERS & STATE MANAGEMENT
// ==========================================
const $ = id => document.getElementById(id);
const toggle = (id, show) => $(id)?.classList.toggle('hidden', !show);
const on = (id, evt, cb) => $(id)?.addEventListener(evt, cb);

let state = {
  token: localStorage.getItem('a_family_student_token'),
  nickname: localStorage.getItem('a_family_student_nickname'),
  lineCode: localStorage.getItem('a_family_student_line'),
  currentUploadStep: null,
  announcements: []
};

const saveSession = (token, nickname, lineCode) => {
  state.token = token; state.nickname = nickname; state.lineCode = lineCode;
  localStorage.setItem('a_family_student_token', token);
  localStorage.setItem('a_family_student_nickname', nickname);
  localStorage.setItem('a_family_student_line', lineCode);
};

const clearSession = () => { localStorage.clear(); location.reload(); };
const escapeHtml = str => Object.assign(document.createElement('div'), { textContent: str || '' }).innerHTML;
const toDriveThumbnail = (url, size = 1000) => url?.match(/[-\w]{20,}/) ? `https://drive.google.com/thumbnail?id=${url.match(/[-\w]{20,}/)[0]}&sz=w${size}` : url;
const fileToBase64 = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = e => rej(e); r.readAsDataURL(file); });

// ==========================================
// 2. AUTHENTICATION (LOGIN / LOGOUT)
// ==========================================
on('loginForm', 'submit', async e => {
  e.preventDefault();
  const btn = $('loginBtn');
  toggle('loginError', false);
  btn.disabled = true; btn.textContent = 'กำลังเข้าสู่ระบบ...';

  try {
    const res = await callApi('studentLogin', {
      student_id: $('loginStudentId').value.trim(),
      password: $('loginPassword').value
    });
    if (!res.success) throw new Error(res.error || 'เข้าสู่ระบบไม่สำเร็จ');
    
    saveSession(res.token, res.nickname, res.line_code);
    await switchView(true);
  } catch (err) {
    $('loginError').textContent = '⚠ ' + err.message;
    toggle('loginError', true);
  } finally {
    btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ 🚀';
  }
});

on('logoutBtn', 'click', clearSession);
on('refreshBtn', 'click', () => loadDashboard());

// ==========================================
// 3. VIEW CONTROLLER & DASHBOARD
// ==========================================
async function switchView(isLoggedIn) {
  toggle('loginView', !isLoggedIn);
  toggle('dashView', isLoggedIn);
  if (isLoggedIn) {
    await loadDashboard();
  } else {
    await checkAnnouncements('public');
  }
}

async function loadDashboard() {
  const res = await callApi('getStudentDashboard', { token: state.token });
  if (!res.success) return clearSession();

  $('dashNickname').textContent = state.nickname;
  $('dashLineCode').textContent = state.lineCode;
  
  renderSteps(res.steps || []);
  await checkAnnouncements('mine');
}

function renderSteps(steps) {
  $('stepsContainer').innerHTML = steps.map(s => {
    let statusBadge = '', btnHtml = '', bgClass = 'glass';

    if (s.status === 'Passed') {
      statusBadge = `<span class="bg-emerald-500/15 text-emerald-700 text-xs px-2.5 py-1 rounded-full font-bold">✓ ผ่านแล้ว</span>`;
    } else if (s.status === 'Pending') {
      statusBadge = `<span class="bg-amber-400/20 text-amber-700 text-xs px-2.5 py-1 rounded-full font-bold">⏳ รอตรวจ</span>`;
    } else if (s.status === 'Rejected') {
      statusBadge = `<span class="bg-rose-500/15 text-rose-600 text-xs px-2.5 py-1 rounded-full font-bold">❌ แก้ไข</span>`;
      btnHtml = `<button data-step="${s.step}" data-action="upload" class="bg-amber-500 hover:bg-amber-600 text-white text-xs px-4 py-1.5 rounded-xl font-bold transition shadow-sm">ส่งใหม่</button>`;
    } else if (s.status === 'Active') {
      statusBadge = `<span class="bg-bubble/20 text-ink text-xs px-2.5 py-1 rounded-full font-bold">🎯 ทำได้เลย</span>`;
      btnHtml = `<button data-step="${s.step}" data-action="upload" class="flame-btn text-white text-xs px-5 py-1.5 rounded-xl font-bold transition shadow-sm">ส่งงาน</button>`;
    } else {
      statusBadge = `<span class="opacity-40 text-xs px-2.5 py-1 rounded-full font-medium">🔒 ล็อก</span>`;
      bgClass = 'glass opacity-50 select-none';
    }

    return `
      <div class="${bgClass} rounded-2xl p-4 flex flex-col gap-2">
        <div class="flex justify-between items-start gap-2">
          <h3 class="font-display font-bold text-sm text-ink">ด่านที่ ${s.step}: ${escapeHtml(s.task_title)}</h3>
          <div class="flex-shrink-0">${statusBadge}</div>
        </div>
        <p class="text-xs text-ink-soft whitespace-pre-line">${escapeHtml(s.task_desc)}</p>
        ${s.status === 'Passed' && s.hint_text ? `<div class="p-3 bg-mint-soft/40 border border-mint rounded-xl text-xs text-ink mt-1">💡 <b>คำใบ้สายรหัส:</b> ${escapeHtml(s.hint_text)}</div>` : ''}
        ${s.status === 'Rejected' && s.reject_reason ? `<div class="p-3 bg-rose-500/10 border border-rose-400/30 rounded-xl text-xs text-rose-700 mt-1">💬 <b>พี่คอมเมนต์ว่า:</b> ${escapeHtml(s.reject_reason)}</div>` : ''}
        ${btnHtml ? `<div class="flex justify-end mt-1">${btnHtml}</div>` : ''}
      </div>`;
  }).join('');
}

// ==========================================
// 4. MISSION UPLOAD MANAGEMENT (Event Delegation)
// ==========================================
on('stepsContainer', 'click', e => {
  const btn = e.target.closest('button');
  if (!btn || btn.dataset.action !== 'upload') return;

  state.currentUploadStep = btn.dataset.step;
  $('modalStep').textContent = `ด่านที่ ${state.currentUploadStep}`;
  $('imgInput').value = '';
  $('msgInput').value = '';
  toggle('imgPreview', false);
  toggle('uploadError', false);
  toggle('uploadModal', true);
});

on('imgInput', 'change', async e => {
  const file = e.target.files[0];
  if (!file) return toggle('imgPreview', false);
  
  try {
    $('imgPreview').src = await fileToBase64(file);
    toggle('imgPreview', true);
  } catch (err) { toggle('imgPreview', false); }
});

on('cancelUpload', 'click', () => toggle('uploadModal', false));

on('confirmUpload', 'click', async () => {
  const fileInput = $('imgInput');
  if (!fileInput.files.length) return $('uploadError').textContent = '⚠ กรุณาแนบรูปภาพภารกิจ', toggle('uploadError', true);

  const btn = $('confirmUpload');
  toggle('uploadError', false);
  btn.disabled = true; btn.textContent = 'กำลังส่ง...';

  try {
    const base64Str = await fileToBase64(fileInput.files[0]);
    const res = await callApi('submitMission', {
      token: state.token,
      step: Number(state.currentUploadStep),
      image_data: base64Str,
      student_msg: $('msgInput').value.trim()
    });

    if (!res.success) throw new Error(res.error || 'ส่งงานไม่สำเร็จ');
    toggle('uploadModal', false);
    await loadDashboard();
  } catch (err) {
    $('uploadError').textContent = '⚠ ' + err.message;
    toggle('uploadError', true);
  } finally {
    btn.disabled = false; btn.textContent = 'ส่งภารกิจ 🚀';
  }
});

// ==========================================
// 5. ANNOUNCEMENTS POPUP LOGIC
// ==========================================
const STUDENT_ANNOUNCE_SEEN_KEY = 'a_family_student_announce_seen';
const getSeenIds = () => JSON.parse(localStorage.getItem(STUDENT_ANNOUNCE_SEEN_KEY) || '[]');
const markSeenIds = ids => localStorage.setItem(STUDENT_ANNOUNCE_SEEN_KEY, JSON.stringify([...new Set([...getSeenIds(), ...ids])]));

async function checkAnnouncements(kind) {
  const res = await callApi(kind === 'public' ? 'getPublicAnnouncements' : 'getStudentAnnouncements', kind === 'public' ? { audience: 'STUDENT' } : { token: state.token });
  if (!res?.success) return;

  state.announcements = res.announcements || [];
  $('announceList').innerHTML = state.announcements.length 
    ? state.announcements.map(a => `<div class="glass-input rounded-2xl p-3.5"><p class="font-display font-bold text-ink text-sm mb-1">📌 ${escapeHtml(a.title)}</p><p class="text-ink-soft text-sm whitespace-pre-line">${escapeHtml(a.message)}</p></div>`).join('')
    : `<p class="text-center text-ink-soft text-sm py-6">ยังไม่มีประกาศจากพี่ๆ เลย~</p>`;

  const unseen = state.announcements.filter(a => !getSeenIds().includes(a.announce_id));
  toggle('announceBell', state.announcements.length > 0);
  toggle('announceDot', unseen.length > 0);
  if (unseen.length > 0) toggle('announceModal', true);
}

on('announceCloseBtn', 'click', () => toggle('announceModal', false));
on('announceBell', 'click', () => toggle('announceModal', true));
on('announceOkBtn', 'click', () => {
  markSeenIds(state.announcements.map(a => a.announce_id));
  toggle('announceDot', false);
  toggle('announceModal', false);
});

// ==========================================
// 6. INITIALIZATION (BOOT)
// ==========================================
(async () => {
  await switchView(!!state.token);
})();
