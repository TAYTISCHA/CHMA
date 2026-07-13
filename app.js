const STEP_LABELS = { active:'กำลังทำ ✏️', completed:'ผ่านแล้ว 🎉', locked:'ยังไม่ปลดล็อค 🔒', reviewing:'รอตรวจ ⏳' };

let state = { token: null, currentStep: null };

// ---------- persistence ----------
function saveSession(token) { localStorage.setItem('a_family_token', token); }
function loadSession() { return localStorage.getItem('a_family_token'); }
function clearSession() { localStorage.removeItem('a_family_token'); }

// ---------- image compression ----------
function compressImage(file, maxWidth = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({ base64: dataUrl.split(',')[1], mime: 'image/jpeg', dataUrl });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- login ----------
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginError');
  errEl.classList.add('hidden');
  btn.disabled = true; btn.textContent = 'กำลังเข้าสู่ระบบ...';

  try {
    const res = await callApi('studentLogin', {
      student_id: document.getElementById('loginStudentId').value.trim(),
      password: document.getElementById('loginPassword').value
    });
    if (!res.success) throw new Error(res.error || 'เข้าสู่ระบบไม่สำเร็จ');
    saveSession(res.token);
    state.token = res.token;
    await loadDashboard();
  } catch (err) {
    errEl.textContent = '⚠ ' + err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ 🚀';
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearSession();
  location.reload();
});

document.getElementById('refreshBtn').addEventListener('click', loadDashboard);

// ---------- dashboard ----------
async function loadDashboard() {
  const res = await callApi('getDashboard', { token: state.token });
  if (!res.success) {
    clearSession();
    document.getElementById('loginView').classList.remove('hidden');
    document.getElementById('dashView').classList.add('hidden');
    const errEl = document.getElementById('loginError');
    errEl.textContent = '⚠ ' + (res.error || 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    errEl.classList.remove('hidden');
    return;
  }

  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('dashView').classList.remove('hidden');
  document.getElementById('dashNickname').textContent = res.nickname;
  document.getElementById('dashLineCode').textContent = res.line_code;
  state.currentStep = res.current_step;

  renderSteps(res.steps);
}

function renderSteps(steps) {
  const container = document.getElementById('stepsContainer');
  container.innerHTML = '';

  steps.forEach((s, idx) => {
    const isDone = s.status === 'completed';
    const isActive = s.status === 'active';
    const isReviewing = s.status === 'reviewing';
    const isLocked = s.status === 'locked';
    const isLast = idx === steps.length - 1;
    const isAllMission = s.line_code === 'ALL';

    const dotClass = isDone ? 'flame-btn text-white'
      : isActive ? 'bg-white text-amber-600 ring-4 ring-bubble/50 bounce-soft'
      : isReviewing ? 'bg-amber-300 text-amber-900'
      : 'bg-white/60 text-ink-soft/50';

    const badgeClass = isDone ? 'bg-amber-500/15 text-amber-700'
      : isActive ? 'bg-bubble-soft text-bubble'
      : isReviewing ? 'bg-amber-300/25 text-amber-700'
      : 'bg-ink/5 text-ink-soft/50';

    const wrap = document.createElement('div');
    wrap.className = 'relative flex gap-3.5';

    let bodyHtml = '';

    // 💡 การสร้างป้ายกำกับภารกิจส่วนกลาง vs ภารกิจสายรหัส
    const missionTypeBadge = isAllMission
      ? `<span class="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center ml-2">ภารกิจส่วนกลาง 🌐</span>`
      : `<span class="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center ml-2">ภารกิจสายรหัส 🧪</span>`;

    if (isLocked) {
      bodyHtml = `<p class="text-ink-soft/60 text-sm">🔒 ทำด่านก่อนหน้าให้ผ่านก่อนนะ~</p>`;
    } else {
      bodyHtml = `
        <div class="flex flex-wrap items-center mb-1 gap-y-1">
          <h3 class="font-display font-bold text-ink">${escapeHtml(s.task_title || '')}</h3>
          ${s.task_title ? missionTypeBadge : ''}
        </div>
        <p class="text-ink-soft text-sm mb-3 whitespace-pre-line">${escapeHtml(s.task_desc || '')}</p>
        <div class="text-xs px-3 py-2 rounded-xl mb-3 ${isDone ? 'bg-amber-400/15 border border-amber-400/30 text-amber-700' : 'bg-ink/5 text-ink-soft'}">
          💡 คำใบ้: ${escapeHtml(s.hint_text || '🔒 ยังไม่ปลดล็อค')}
        </div>
      `;

      if (s.last_submission && s.last_submission.status === 'Rejected') {
        bodyHtml += `<div class="text-xs px-3 py-2 rounded-xl mb-3 bg-rose-500/10 border border-rose-400/30 text-rose-600">
          🙈 ถูกตีกลับ: ${escapeHtml(s.last_submission.reject_reason || 'ไม่ระบุเหตุผล')} — ลองใหม่ได้เลยน้า
        </div>`;
      }

      if (isActive) {
        // 💡 แอบแนบ line_code ไปกับปุ่มด้วย จะได้เอาไปเช็กเพื่อแสดงข้อความใน Modal ถูกต้อง
        bodyHtml += `<button data-step="${s.step}" data-line="${escapeHtml(s.line_code || '')}" class="submitBtn flame-btn text-white font-display font-bold text-sm rounded-xl px-4 py-2 transition">
          📮 อัปโหลดภารกิจ
        </button>`;
      } else if (isReviewing) {
        bodyHtml += `<p class="text-amber-700 text-xs font-medium">⏳ ส่งแล้ว รอรุ่นพี่ตรวจงานอยู่นะ~</p>`;
      }
    }

    // 💡 การแสดงไอคอนในวงกลม: ถ้าผ่านแล้วให้แสดง ⭐ ถ้าเป็นสาย ALL ให้แสดง 🌐 ถ้าเป็นปกติให้แสดงตัวเลข
    const stepDisplayContent = isDone ? '⭐' : (isAllMission ? '🌐' : s.step);

    wrap.innerHTML = `
      <div class="flex flex-col items-center flex-shrink-0">
        <div class="w-11 h-11 rounded-2xl flex items-center justify-center font-display font-bold sticker ${dotClass} ${isDone ? 'pop-in' : ''}">
          ${stepDisplayContent}
        </div>
        ${!isLast ? `<div class="w-1 flex-1 min-h-[28px] my-1 bond-line ${isDone ? 'done' : ''}"></div>` : ''}
      </div>
      <div class="glass rounded-2xl p-4 flex-1 mb-3">
        <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block mb-2 ${badgeClass}">${STEP_LABELS[s.status]}</span>
        ${bodyHtml}
      </div>
    `;
    container.appendChild(wrap);
  });

  document.querySelectorAll('.submitBtn').forEach(btn => {
    btn.addEventListener('click', () => openUploadModal(btn.dataset.step, btn.dataset.line));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- upload modal ----------
let pendingImage = null;

function openUploadModal(step, lineCode) {
  // 💡 เช็กข้อความ Modal ถ่าเป็น ALL ให้แสดง "ส่วนกลาง 🌐" ถ้าปกติแสดง "ด่านที่ X"
  document.getElementById('modalStep').textContent = lineCode === 'ALL' ? 'ส่วนกลาง 🌐' : `ด่านที่ ${step}`;

  document.getElementById('imgInput').value = '';
  document.getElementById('imgPreview').classList.add('hidden');
  document.getElementById('msgInput').value = '';
  document.getElementById('uploadError').classList.add('hidden');
  pendingImage = null;
  document.getElementById('uploadModal').dataset.step = step;
  document.getElementById('uploadModal').classList.remove('hidden');
}

document.getElementById('cancelUpload').addEventListener('click', () => {
  document.getElementById('uploadModal').classList.add('hidden');
});

document.getElementById('imgInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const compressed = await compressImage(file);
  pendingImage = compressed;
  const preview = document.getElementById('imgPreview');
  preview.src = compressed.dataUrl;
  preview.classList.remove('hidden');
});

document.getElementById('confirmUpload').addEventListener('click', async () => {
  const step = document.getElementById('uploadModal').dataset.step;
  const errEl = document.getElementById('uploadError');
  const btn = document.getElementById('confirmUpload');

  if (!pendingImage) {
    errEl.textContent = 'กรุณาแนบรูปภาพก่อนน้า 📸';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true; btn.textContent = 'กำลังส่ง...';
  try {
    const res = await callApi('submitTask', {
      token: state.token,
      step: Number(step),
      image_base64: pendingImage.base64,
      mime_type: pendingImage.mime,
      student_msg: document.getElementById('msgInput').value.trim()
    });
    if (!res.success) throw new Error(res.error || 'ส่งภารกิจไม่สำเร็จ');
    document.getElementById('uploadModal').classList.add('hidden');
    await loadDashboard();
  } catch (err) {
    errEl.textContent = '⚠ ' + err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = 'ส่งภารกิจ 🚀';
  }
});

// ---------- boot ----------
(async function boot() {
  const token = loadSession();
  if (token) {
    state.token = token;
    await loadDashboard();
  }
})();
