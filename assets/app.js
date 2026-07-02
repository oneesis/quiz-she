/* ============================================================
   ALUR APLIKASI SAFETY TALK
   ============================================================ */
(function () {
  const C = window.CONFIG;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---- state ----
  let S = {};
  function reset() {
    S = {
      employee: null, session: null, topic: null,
      served: [], answers: [], idx: 0,
      attemptNo: 0, score: 0, passed: false, cert: null,
    };
  }
  reset();

  // ---- util ----
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; };
  function fmtDate(d) {
    const b = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    return `${d.getDate()} ${b[d.getMonth()]} ${d.getFullYear()}`;
  }
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // Materi ditulis sebagai teks biasa oleh admin (bukan HTML), format ringan:
  // baris kosong belum diperlukan (tiap baris = satu paragraf), "- " di awal
  // baris = butir bullet, "## " di awal baris = subjudul.
  function renderMaterialText(text) {
    let html = '', listOpen = false;
    const closeList = () => { if (listOpen) { html += '</ul>'; listOpen = false; } };
    String(text || '').split('\n').forEach(line => {
      const t = line.trim();
      if (!t) { closeList(); return; }
      if (t.startsWith('## ')) { closeList(); html += `<h4>${escapeHtml(t.slice(3))}</h4>`; }
      else if (t.startsWith('- ')) { if (!listOpen) { html += '<ul>'; listOpen = true; } html += `<li>${escapeHtml(t.slice(2))}</li>`; }
      else { closeList(); html += `<p>${escapeHtml(t)}</p>`; }
    });
    closeList();
    return html;
  }

  // ---- navigasi layar ----
  function show(id) {
    $$('.screen').forEach(s => s.classList.remove('is-active'));
    const el = document.getElementById(id);
    el.classList.add('is-active');
    el.scrollTop = 0;
    window.scrollTo(0, 0);
    document.body.classList.toggle('mode-focus', id === 'screen-quiz');
    resetIdle();
  }

  // ---- idle auto-reset (kiosk) ----
  let idleTimer = null;
  function resetIdle() {
    clearTimeout(idleTimer);
    if (!C.idleResetSeconds) return;
    idleTimer = setTimeout(() => { reset(); renderLogin(); show('screen-login'); }, C.idleResetSeconds * 1000);
  }
  ['click', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, resetIdle, { passive: true }));

  // ============================================================
  // 1. LOGIN NIK
  // ============================================================
  function renderLogin() {
    $('#nik-input').value = '';
    $('#login-error').textContent = '';
    const hint = $('#demo-hint');
    if (C.showDemoHint && API.mode === 'mock') {
      hint.hidden = false;
      hint.innerHTML = 'Mode demo — NIK contoh: ' +
        window.SAMPLE.employees.slice(0, 2).map(e => `<button class="chip" data-nik="${e.nik}">${e.nik}</button>`).join(' ');
      $$('.chip', hint).forEach(b => b.onclick = () => { $('#nik-input').value = b.dataset.nik; doLogin(); });
    } else { hint.hidden = true; }
    setTimeout(() => $('#nik-input').focus(), 50);
  }

  async function doLogin() {
    const nik = $('#nik-input').value.trim();
    const err = $('#login-error');
    if (!nik) { err.textContent = 'Masukkan NIK terlebih dahulu.'; return; }
    err.textContent = '';
    setBusy('#btn-login', true);
    try {
      const emp = await API.findEmployee(nik);
      if (!emp) { err.textContent = `NIK "${nik}" tidak ditemukan. Periksa kembali atau hubungi SHE.`; return; }
      S.employee = emp;
      renderConfirm();
      show('screen-confirm');
    } catch (e) {
      err.textContent = 'Tidak dapat terhubung ke data karyawan. Coba lagi.';
    } finally { setBusy('#btn-login', false); }
  }

  // ============================================================
  // 2. KONFIRMASI IDENTITAS
  // ============================================================
  function renderConfirm() {
    const e = S.employee;
    $('#confirm-body').innerHTML = `
      <div class="idcard">
        <div class="idcard__row"><span>Nama</span><strong>${e.nama}</strong></div>
        <div class="idcard__row"><span>NIK</span><strong class="mono">${e.nik}</strong></div>
        <div class="idcard__row"><span>Perusahaan</span><strong>${e.perusahaan}</strong></div>
        <div class="idcard__row"><span>Jabatan</span><strong>${e.jabatan || '-'}</strong></div>
      </div>`;
  }

  // ============================================================
  // 3. PILIH SESSION
  // ============================================================
  async function renderSessions() {
    const wrap = $('#session-list');
    wrap.innerHTML = '<p class="muted">Memuat sesi…</p>';
    show('screen-sessions');
    try {
      const sessions = await API.activeSessions(S.employee);
      if (!sessions.length) {
        wrap.innerHTML = '<div class="empty">Belum ada sesi Safety Talk yang aktif hari ini. Silakan hubungi petugas SHE.</div>';
        return;
      }
      wrap.innerHTML = '';
      sessions.forEach(s => {
        const card = document.createElement('button');
        card.className = 'session-card';
        card.innerHTML = `
          <span class="session-card__eyebrow">${s.topic.code}</span>
          <span class="session-card__title">${s.title || s.topic.title}</span>
          <span class="session-card__meta">${s.topic.questions.length} soal · lulus ≥ ${s.topic.passThreshold || C.passThresholdDefault}%</span>
          <span class="session-card__go">Mulai →</span>`;
        card.onclick = () => { S.session = s; S.topic = s.topic; renderMaterial(); };
        wrap.appendChild(card);
      });
    } catch (e) {
      wrap.innerHTML = '<div class="empty">Gagal memuat sesi. Coba lagi.</div>';
    }
  }

  // ============================================================
  // 4. MATERI
  // ============================================================
  function renderMaterial() {
    $('#material-title').textContent = S.topic.title;
    $('#material-body').innerHTML = renderMaterialText(S.topic.material);

    const imgBtn = $('#material-image-btn');
    if (S.topic.materialImage) {
      $('#material-image').src = S.topic.materialImage;
      imgBtn.hidden = false;
    } else {
      imgBtn.hidden = true;
    }

    const btn = $('#btn-start-quiz');
    show('screen-material');

    const wait = C.minMaterialSeconds || 0;
    if (wait > 0) {
      btn.disabled = true;
      let left = wait;
      btn.textContent = `Baca dulu… (${left}s)`;
      const t = setInterval(() => {
        left--;
        if (left <= 0) { clearInterval(t); btn.disabled = false; btn.textContent = 'Mulai Kuis'; }
        else { btn.textContent = `Baca dulu… (${left}s)`; }
      }, 1000);
    } else { btn.disabled = false; btn.textContent = 'Mulai Kuis'; }
  }

  // ============================================================
  // 5. KUIS
  // ============================================================
  function startQuiz() {
    const n = Math.min(C.questionsPerAttempt, S.topic.questions.length);
    S.served = shuffle(S.topic.questions).slice(0, n).map(q => {
      const order = shuffle(q.options.map((text, i) => ({ text, correct: i === q.correct })));
      return { q: q.q, options: order };
    });
    S.answers = new Array(S.served.length).fill(null);
    S.idx = 0;
    S.attemptNo += 1;
    S.startedAt = Date.now();
    renderQuestion();
    show('screen-quiz');
  }

  function renderQuestion() {
    const item = S.served[S.idx];
    const answeredCount = S.answers.filter(a => a !== null).length;
    $('#quiz-topic-label').textContent = S.topic.title;
    $('#quiz-progress-label').textContent = `Terjawab ${answeredCount}/${S.served.length} · Soal ${S.idx + 1}`;
    $('#quiz-progress-bar').style.width = (answeredCount / S.served.length * 100) + '%';
    $('#quiz-question').textContent = item.q;
    const opts = $('#quiz-options');
    opts.innerHTML = '';
    item.options.forEach((o, i) => {
      const selected = S.answers[S.idx] === i;
      const b = document.createElement('button');
      b.className = selected
        ? 'flex items-center gap-3 p-4 rounded-xl border-2 border-primary bg-primary/5 text-left'
        : 'flex items-center gap-3 p-4 rounded-xl border border-outline-variant hover:border-primary hover:bg-surface-container-low text-left transition-colors';
      b.innerHTML = `
        <span class="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg font-bold ${selected ? 'bg-primary text-white' : 'border border-outline-variant bg-white text-on-surface'}">${String.fromCharCode(65 + i)}</span>
        <span class="text-on-surface ${selected ? 'font-semibold' : ''}">${o.text}</span>
        ${selected ? '<span class="material-symbols-outlined text-primary ml-auto">check_circle</span>' : ''}`;
      b.onclick = () => { S.answers[S.idx] = i; renderQuestion(); };
      opts.appendChild(b);
    });

    $('#btn-prev').classList.toggle('hidden', S.idx === 0);
    $('#btn-next').textContent = S.idx === S.served.length - 1 ? 'Selesai & Nilai' : 'Lanjut →';

    renderNavGrid();
  }

  function renderNavGrid() {
    const grid = $('#quiz-nav-grid');
    grid.innerHTML = '';
    S.served.forEach((_, i) => {
      const answered = S.answers[i] !== null;
      const isCurrent = i === S.idx;
      const b = document.createElement('button');
      let cls = 'aspect-square rounded-lg flex items-center justify-center font-bold text-sm transition-colors ';
      if (isCurrent) cls += 'bg-primary text-white ring-2 ring-primary/30';
      else if (answered) cls += 'bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200';
      else cls += 'bg-surface-container-low text-on-surface-variant border border-outline-variant hover:bg-surface-container-high';
      b.className = cls;
      b.textContent = i + 1;
      b.onclick = () => { S.idx = i; renderQuestion(); };
      grid.appendChild(b);
    });
    const answeredCount = S.answers.filter(a => a !== null).length;
    $('#quiz-nav-answered').textContent = `Terjawab: ${answeredCount}`;
    $('#quiz-nav-remaining').textContent = `Sisa: ${S.served.length - answeredCount}`;
    $('#quiz-incomplete-warning').classList.add('hidden');
  }

  function nextQuestion() {
    if (S.idx < S.served.length - 1) { S.idx++; renderQuestion(); return; }
    const unanswered = S.answers.map((a, i) => (a === null ? i : -1)).filter(i => i >= 0);
    if (unanswered.length) {
      S.idx = unanswered[0];
      renderQuestion();
      const warn = $('#quiz-incomplete-warning');
      warn.textContent = `Masih ada ${unanswered.length} soal belum dijawab. Klik nomornya di navigasi soal.`;
      warn.classList.remove('hidden');
      return;
    }
    grade();
  }
  function prevQuestion() { if (S.idx > 0) { S.idx--; renderQuestion(); } }

  // ============================================================
  // 6. PENILAIAN & HASIL
  // ============================================================
  async function grade() {
    let correct = 0;
    S.served.forEach((item, i) => { if (item.options[S.answers[i]] && item.options[S.answers[i]].correct) correct++; });
    S.correctCount = correct;
    S.score = Math.round(correct / S.served.length * 100);
    S.durationMs = Date.now() - S.startedAt;
    const threshold = S.topic.passThreshold || C.passThresholdDefault;
    S.passed = S.score >= threshold;

    if (S.passed) {
      S.cert = { no: null, token: uuid(), date: new Date() };
    }

    // simpan catatan partisipasi -- nomor sertifikat ditentukan oleh lapisan
    // data (localStorage di mode mock, Apps Script di mode apps_script) supaya
    // urutannya konsisten walau dipakai dari banyak perangkat sekaligus.
    const saved = await API.saveParticipation({
      sessionId: S.session.id, topicCode: S.topic.code,
      nik: S.employee.nik, nama: S.employee.nama, perusahaan: S.employee.perusahaan,
      attemptNo: S.attemptNo, score: S.score, passed: S.passed,
      verificationToken: S.cert ? S.cert.token : null,
      submittedAt: new Date().toISOString(),
    });
    if (S.cert) S.cert.no = saved.certificateNo;

    renderResult(threshold);
    show('screen-result');
  }

  function fmtDuration(ms) {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function renderResult(threshold) {
    const total = S.served.length;
    const circumference = 565.5; // 2 * PI * r(90), lihat svg di index.html

    $('#result-score-num').textContent = S.score;
    const circle = $('#result-gauge-circle');
    circle.classList.toggle('text-secondary-container', S.passed);
    circle.classList.toggle('text-error', !S.passed);
    circle.style.strokeDashoffset = String(circumference);
    requestAnimationFrame(() => { circle.style.strokeDashoffset = String(circumference * (1 - S.score / 100)); });

    const pill = $('#result-status-pill');
    pill.className = 'px-4 py-1 rounded-full flex items-center gap-1 mb-3 font-bold text-xs uppercase tracking-wide ' +
      (S.passed ? 'bg-green-100 text-green-700' : 'bg-error-container text-error');
    pill.innerHTML = `<span class="material-symbols-outlined text-[16px]">${S.passed ? 'check_circle' : 'cancel'}</span>${S.passed ? 'Lulus' : 'Belum Lulus'}`;

    $('#result-heading').textContent = S.passed ? `Selamat, ${S.employee.nama}!` : `Belum Lulus, ${S.employee.nama}`;
    $('#result-note').textContent = S.passed
      ? `Kamu berhasil menyelesaikan ${S.topic.title} dengan skor di atas ambang lulus ${threshold}%.`
      : `Skor belum mencapai ambang lulus ${threshold}%. Baca ulang materi lalu coba lagi.`;

    $('#result-correct').textContent = `${S.correctCount}/${total}`;
    $('#result-wrong').textContent = total - S.correctCount;
    $('#result-duration').textContent = fmtDuration(S.durationMs);

    $('#btn-cert').classList.toggle('hidden', !S.passed);
    $('#btn-retry').classList.toggle('hidden', S.passed);
  }

  // ============================================================
  // 7. SERTIFIKAT
  // ============================================================
  function renderCertificate() {
    const e = S.employee, c = S.cert;
    $('#cert-name').textContent = e.nama;
    $('#cert-nik').textContent = e.nik;
    $('#cert-company').textContent = e.perusahaan;
    $('#cert-topic').textContent = S.topic.title;
    $('#cert-date').textContent = fmtDate(c.date);
    $('#cert-score').textContent = S.score + '%';
    $('#cert-no').textContent = c.no;

    const qEl = $('#cert-qr');
    qEl.innerHTML = '';
    const verifyUrl = `${location.origin}${location.pathname}?verify=${c.token}`;
    new QRCode(qEl, { text: verifyUrl, width: 108, height: 108, correctLevel: QRCode.CorrectLevel.M });
    show('screen-certificate');
  }

  async function downloadPdf() {
    const btn = $('#btn-download');
    setBusy('#btn-download', true, 'Menyiapkan…');
    try {
      const node = $('#certificate');
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff' });
      const img = canvas.toDataURL('image/png');
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] });
      pdf.addImage(img, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`Sertifikat-${S.cert.no.replace(/\//g, '-')}.pdf`);
    } catch (e) {
      alert('Gagal membuat PDF. Coba lagi atau tangkapan layar sebagai cadangan.');
    } finally { setBusy('#btn-download', false); btn.textContent = 'Unduh PDF'; }
  }

  // ============================================================
  // VERIFIKASI (dibuka dari QR: ?verify=TOKEN)
  // ============================================================
  async function tryVerifyFromUrl() {
    const token = new URLSearchParams(location.search).get('verify');
    if (!token) return false;
    const body = $('#verify-body');
    show('screen-verify');
    body.innerHTML = '<p class="muted">Memeriksa…</p>';
    try {
      const p = await API.findByToken(token);
      if (!p) {
        body.innerHTML = '<div class="verify-bad">Sertifikat tidak ditemukan atau tidak valid.</div>';
        return true;
      }
      body.innerHTML = `
        <div class="verify-good">✓ Sertifikat Sah</div>
        <div class="idcard">
          <div class="idcard__row"><span>Nama</span><strong>${p.nama}</strong></div>
          <div class="idcard__row"><span>NIK</span><strong class="mono">${p.nik}</strong></div>
          <div class="idcard__row"><span>Perusahaan</span><strong>${p.perusahaan}</strong></div>
          <div class="idcard__row"><span>No. Sertifikat</span><strong class="mono">${p.certificateNo}</strong></div>
          <div class="idcard__row"><span>Skor</span><strong>${p.score}%</strong></div>
        </div>`;
    } catch (e) {
      body.innerHTML = '<div class="verify-bad">Gagal memverifikasi. Coba lagi.</div>';
    }
    return true;
  }

  // ============================================================
  // LIGHTBOX ZOOM GAMBAR
  // ============================================================
  function openLightbox(src) {
    const img = $('#lightbox-img');
    img.src = src;
    img.classList.remove('is-zoomed');
    $('#lightbox').hidden = false;
  }
  function closeLightbox() { $('#lightbox').hidden = true; }
  function toggleZoom() { $('#lightbox-img').classList.toggle('is-zoomed'); }

  // ---- helper tombol sibuk ----
  function setBusy(sel, busy, label) {
    const b = $(sel);
    if (!b) return;
    b.disabled = busy;
    if (busy) { b.dataset.label = b.textContent; b.textContent = label || 'Memproses…'; }
    else if (b.dataset.label) { b.textContent = b.dataset.label; }
  }

  // ============================================================
  // BINDING
  // ============================================================
  function bind() {
    $('#btn-login').onclick = doLogin;
    $('#nik-input').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    $('#btn-confirm-yes').onclick = () => renderSessions();
    $('#btn-confirm-no').onclick = () => { reset(); renderLogin(); show('screen-login'); };
    $$('[data-back-login]').forEach(b => b.onclick = () => { reset(); renderLogin(); show('screen-login'); });
    $('#btn-material-back').onclick = () => renderSessions();
    $('#btn-start-quiz').onclick = startQuiz;
    $('#btn-next').onclick = nextQuestion;
    $('#btn-prev').onclick = prevQuestion;
    $('#btn-retry').onclick = () => renderMaterial();
    $('#btn-cert').onclick = renderCertificate;
    $('#btn-download').onclick = downloadPdf;
    $('#btn-cert-done').onclick = () => { reset(); renderLogin(); show('screen-login'); };
    $('#btn-verify-close').onclick = () => { history.replaceState(null, '', location.pathname); reset(); renderLogin(); show('screen-login'); };

    $('#material-image-btn').onclick = () => openLightbox($('#material-image').src);
    $('#lightbox-close').onclick = closeLightbox;
    $('#lightbox-img').onclick = toggleZoom;
  }

  // ---- init ----
  document.addEventListener('DOMContentLoaded', async () => {
    // isi teks organisasi
    $$('[data-org-name]').forEach(el => el.textContent = C.org.name);
    $$('[data-org-short]').forEach(el => el.textContent = C.org.short);
    $$('[data-org-subtitle]').forEach(el => el.textContent = C.org.subtitle);
    bind();
    if (await tryVerifyFromUrl()) return;
    renderLogin();
    show('screen-login');
  });
})();
