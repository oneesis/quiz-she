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
  const pad = (n, w = 3) => String(n).padStart(w, '0');
  function fmtDate(d) {
    const b = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    return `${d.getDate()} ${b[d.getMonth()]} ${d.getFullYear()}`;
  }
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));

  // ---- navigasi layar ----
  function show(id) {
    $$('.screen').forEach(s => s.classList.remove('is-active'));
    const el = document.getElementById(id);
    el.classList.add('is-active');
    el.scrollTop = 0;
    window.scrollTo(0, 0);
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
    $('#material-body').innerHTML = S.topic.material;
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
    renderQuestion();
    show('screen-quiz');
  }

  function renderQuestion() {
    const item = S.served[S.idx];
    $('#quiz-progress-bar').style.width = ((S.idx) / S.served.length * 100) + '%';
    $('#quiz-count').textContent = `Soal ${S.idx + 1} dari ${S.served.length}`;
    $('#quiz-question').textContent = item.q;
    const opts = $('#quiz-options');
    opts.innerHTML = '';
    item.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'option' + (S.answers[S.idx] === i ? ' is-selected' : '');
      b.innerHTML = `<span class="option__key">${String.fromCharCode(65 + i)}</span><span>${o.text}</span>`;
      b.onclick = () => { S.answers[S.idx] = i; renderQuestion(); };
      opts.appendChild(b);
    });
    const next = $('#btn-next');
    next.disabled = S.answers[S.idx] === null;
    next.textContent = S.idx === S.served.length - 1 ? 'Selesai & Nilai' : 'Lanjut →';
    $('#btn-prev').hidden = S.idx === 0;
  }

  function nextQuestion() {
    if (S.answers[S.idx] === null) return;
    if (S.idx < S.served.length - 1) { S.idx++; renderQuestion(); }
    else { grade(); }
  }
  function prevQuestion() { if (S.idx > 0) { S.idx--; renderQuestion(); } }

  // ============================================================
  // 6. PENILAIAN & HASIL
  // ============================================================
  async function grade() {
    let correct = 0;
    S.served.forEach((item, i) => { if (item.options[S.answers[i]] && item.options[S.answers[i]].correct) correct++; });
    S.score = Math.round(correct / S.served.length * 100);
    const threshold = S.topic.passThreshold || C.passThresholdDefault;
    S.passed = S.score >= threshold;

    if (S.passed) {
      const seq = API.nextSeq(S.employee.perusahaan);
      const now = new Date();
      const mm = pad(now.getMonth() + 1, 2), yy = String(now.getFullYear()).slice(-2);
      S.cert = {
        no: `${pad(seq)}/ST/${API.companyCode(S.employee.perusahaan)}/${mm}/${yy}`,
        token: uuid(),
        date: now,
      };
    }

    // simpan catatan partisipasi
    await API.saveParticipation({
      sessionId: S.session.id, topicCode: S.topic.code,
      nik: S.employee.nik, nama: S.employee.nama, perusahaan: S.employee.perusahaan,
      attemptNo: S.attemptNo, score: S.score, passed: S.passed,
      certificateNo: S.cert ? S.cert.no : null,
      verificationToken: S.cert ? S.cert.token : null,
      submittedAt: new Date().toISOString(),
    });

    renderResult(threshold);
    show('screen-result');
  }

  function renderResult(threshold) {
    const el = $('#result-body');
    const gaugeColor = S.passed ? 'var(--go)' : 'var(--alert)';
    el.innerHTML = `
      <div class="gauge" style="--val:${S.score};--gc:${gaugeColor}">
        <div class="gauge__inner"><span class="gauge__num">${S.score}<small>%</small></span></div>
      </div>
      <div class="result-status ${S.passed ? 'is-pass' : 'is-fail'}">${S.passed ? 'LULUS' : 'BELUM LULUS'}</div>
      <p class="muted">Ambang lulus ${threshold}% · percobaan ke-${S.attemptNo}</p>`;
    $('#btn-cert').hidden = !S.passed;
    $('#btn-retry').hidden = S.passed;
    $('#result-note').textContent = S.passed
      ? 'Selamat! Sertifikat kamu sudah terbit.'
      : 'Belum mencapai ambang lulus. Baca ulang materi lalu coba lagi.';
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
