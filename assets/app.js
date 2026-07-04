/* ============================================================
   ALUR APLIKASI SHARING SESSION
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

  // ---- pemuatan lazy pustaka QR/PDF (dipakai cuma di layar sertifikat) ----
  const loadedScripts = {};
  function loadScript(src) {
    if (!loadedScripts[src]) {
      loadedScripts[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('gagal memuat ' + src));
        document.head.appendChild(s);
      });
    }
    return loadedScripts[src];
  }
  const QRCODE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  const HTML2CANVAS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  const JSPDF_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

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
    closeLightbox(); // jangan sampai lightbox "nyangkut" nutupin layar baru
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
        wrap.innerHTML = '<div class="empty">Belum ada Sharing Session yang aktif hari ini. Silakan hubungi petugas SHE.</div>';
        return;
      }
      const existingResults = await Promise.all(sessions.map(s => API.findExisting(S.employee.nik, s.id)));
      wrap.innerHTML = '';
      sessions.forEach((s, i) => {
        const existing = existingResults[i];
        const servedCount = Math.min(C.questionsPerAttempt, s.topic.questions.length);
        const card = document.createElement('button');
        card.className = 'session-card';
        card.innerHTML = `
          <span class="session-card__eyebrow">${s.topic.code}</span>
          <span class="session-card__title">${s.title || s.topic.title}</span>
          <span class="session-card__meta">${servedCount} soal · lulus ≥ ${s.topic.passThreshold || C.passThresholdDefault}%</span>
          ${existing ? '<span class="session-card__badge">✓ Sudah lulus</span>' : ''}
          <span class="session-card__go">${existing ? 'Lihat Sertifikat →' : 'Mulai →'}</span>`;
        card.onclick = () => {
          S.session = s; S.topic = s.topic;
          if (existing) {
            S.score = existing.score;
            S.cert = { no: existing.certificateNo, token: existing.verificationToken, date: existing.submittedAt ? new Date(existing.submittedAt) : new Date() };
            renderCertificate();
          } else {
            renderMaterial();
          }
        };
        wrap.appendChild(card);
      });
    } catch (e) {
      wrap.innerHTML = '<div class="empty">Gagal memuat sesi. Coba lagi.</div>';
    }
  }

  // Riwayat semua topik yang PERNAH lulus (bukan cuma sesi yang lagi aktif
  // hari ini) -- link opsional dari layar Pilih Sesi, supaya alur utama
  // (isi kuis) tetap cepat & tidak ketambahan langkah.
  async function renderHistory() {
    const wrap = $('#history-list');
    wrap.innerHTML = '<p class="muted">Memuat riwayat…</p>';
    show('screen-history');
    try {
      const [history, topics] = await Promise.all([API.listHistory(S.employee.nik), API.listTopics()]);
      if (!history.length) {
        wrap.innerHTML = '<div class="empty">Belum ada sertifikat yang pernah kamu dapatkan.</div>';
        return;
      }
      wrap.innerHTML = '';
      history.forEach(h => {
        const topic = topics.find(t => t.code === h.topicCode);
        const card = document.createElement('button');
        card.className = 'session-card';
        card.innerHTML = `
          <span class="session-card__eyebrow">${escapeHtml(h.topicCode || '-')}</span>
          <span class="session-card__title">${escapeHtml(topic ? topic.title : (h.topicCode || '-'))}</span>
          <span class="session-card__meta">${h.submittedAt ? fmtDate(new Date(h.submittedAt)) : '-'} · Skor ${h.score}%</span>
          <span class="session-card__go">Lihat Sertifikat →</span>`;
        card.onclick = () => {
          S.topic = topic || { code: h.topicCode, title: h.topicCode || '-' };
          S.score = h.score;
          S.cert = { no: h.certificateNo, token: h.verificationToken, date: h.submittedAt ? new Date(h.submittedAt) : new Date() };
          renderCertificate();
        };
        wrap.appendChild(card);
      });
    } catch (e) {
      wrap.innerHTML = '<div class="empty">Gagal memuat riwayat. Coba lagi.</div>';
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
  // Progres jawaban disimpan per NIK+sesi di localStorage supaya kalau kiosk
  // auto-logout karena idle (atau HP-nya di-refresh) di tengah kuis, jawaban
  // tidak hilang -- tinggal login NIK yang sama & pilih sesi yang sama lagi.
  const PROGRESS_MAX_AGE_MS = 4 * 60 * 60 * 1000; // progres lebih lama dari ini dianggap basi
  const progressKey = (nik, sessionId) => `quizProgress:${nik}:${sessionId}`;
  function saveProgress() {
    if (!S.employee || !S.session) return;
    try {
      localStorage.setItem(progressKey(S.employee.nik, S.session.id), JSON.stringify({
        topicCode: S.topic.code, served: S.served, answers: S.answers,
        idx: S.idx, attemptNo: S.attemptNo, startedAt: S.startedAt, savedAt: Date.now(),
      }));
    } catch (e) { /* localStorage penuh/nonaktif -- progres tidak tersimpan, tidak fatal */ }
  }
  function loadProgress(nik, sessionId) {
    try {
      const raw = localStorage.getItem(progressKey(nik, sessionId));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data.savedAt || Date.now() - data.savedAt > PROGRESS_MAX_AGE_MS) return null;
      return data;
    } catch (e) { return null; }
  }
  function clearProgress(nik, sessionId) {
    try { localStorage.removeItem(progressKey(nik, sessionId)); } catch (e) { /* diabaikan */ }
  }

  function startQuiz() {
    const saved = loadProgress(S.employee.nik, S.session.id);
    if (saved && saved.topicCode === S.topic.code && Array.isArray(saved.served) && saved.served.length) {
      S.served = saved.served;
      S.answers = saved.answers;
      S.idx = Math.min(saved.idx, S.served.length - 1);
      S.attemptNo = saved.attemptNo;
      S.startedAt = saved.startedAt;
    } else {
      const n = Math.min(C.questionsPerAttempt, S.topic.questions.length);
      S.served = shuffle(S.topic.questions).slice(0, n).map(q => {
        const order = shuffle(q.options.map((text, i) => ({ text, correct: i === q.correct })));
        return { q: q.q, options: order };
      });
      S.answers = new Array(S.served.length).fill(null);
      S.idx = 0;
      S.attemptNo += 1;
      S.startedAt = Date.now();
    }
    $('#quiz-submit-error').classList.add('hidden');
    $('#btn-next').disabled = false;
    renderQuestion();
    show('screen-quiz');
  }

  function renderQuestion() {
    saveProgress();
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

  async function nextQuestion() {
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
    const btn = $('#btn-next');
    if (btn.disabled) return; // cegah kirim dobel kalau server lambat & tombol diklik lagi
    btn.disabled = true;
    btn.textContent = 'Menyimpan…';
    $('#quiz-submit-error').classList.add('hidden');
    try {
      await grade();
    } catch (e) {
      $('#quiz-submit-error').classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Selesai & Nilai';
    }
  }
  function prevQuestion() { if (S.idx > 0) { S.idx--; renderQuestion(); } }

  // ============================================================
  // 6. PENILAIAN & HASIL
  // ============================================================
  // Koneksi kiosk kadang putus sesaat -- coba kirim ulang otomatis beberapa
  // kali (jeda makin lama) sebelum benar-benar minta karyawan klik ulang.
  const SUBMIT_RETRY_DELAYS_MS = [1000, 2000, 4000];
  async function submitWithRetry(payload) {
    const btn = $('#btn-next');
    for (let i = 0; i <= SUBMIT_RETRY_DELAYS_MS.length; i++) {
      try {
        return await API.saveParticipation(payload);
      } catch (e) {
        if (i === SUBMIT_RETRY_DELAYS_MS.length) throw e; // percobaan otomatis habis
        btn.textContent = `Koneksi terganggu, mencoba lagi… (${i + 1}/${SUBMIT_RETRY_DELAYS_MS.length})`;
        await new Promise(r => setTimeout(r, SUBMIT_RETRY_DELAYS_MS[i]));
      }
    }
  }

  async function grade() {
    let correct = 0;
    // Rincian per soal (dikunci ke teks soal, bukan indeks -- soal & urutan
    // opsi diacak beda2 tiap percobaan) dipakai admin buat lihat soal mana
    // yang paling sering salah, jawaban apa yang paling banyak dipilih, dan
    // apa jawaban yang benar -- bukan cuma persentase salah tanpa konteks.
    const answerBreakdown = S.served.map((item, i) => {
      const chosen = item.options[S.answers[i]];
      const correctOpt = item.options.find(o => o.correct);
      const ok = !!(chosen && chosen.correct);
      if (ok) correct++;
      return { q: item.q, chosen: chosen ? chosen.text : null, correct: ok, correctText: correctOpt ? correctOpt.text : null };
    });
    S.correctCount = correct;
    S.score = Math.round(correct / S.served.length * 100);
    S.durationMs = Date.now() - S.startedAt;
    const threshold = S.topic.passThreshold || C.passThresholdDefault;
    S.passed = S.score >= threshold;

    if (S.passed) {
      S.cert = { no: null, token: uuid(), date: new Date() };
    }

    // simpan catatan partisipasi -- nomor sertifikat ditentukan oleh lapisan
    // data (localStorage di mode mock, backend di mode sheets) supaya
    // urutannya konsisten walau dipakai dari banyak perangkat sekaligus.
    const saved = await submitWithRetry({
      sessionId: S.session.id, topicCode: S.topic.code,
      nik: S.employee.nik, nama: S.employee.nama, perusahaan: S.employee.perusahaan,
      attemptNo: S.attemptNo, score: S.score, passed: S.passed,
      verificationToken: S.cert ? S.cert.token : null,
      submittedAt: new Date().toISOString(),
      answerBreakdown: JSON.stringify(answerBreakdown),
    });
    if (S.cert) S.cert.no = saved.certificateNo;
    clearProgress(S.employee.nik, S.session.id); // sudah terkirim -- progres tersimpan tidak dibutuhkan lagi

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
    qEl.innerHTML = '<span class="muted" style="font-size:11px">Memuat QR…</span>';
    show('screen-certificate');
    const verifyUrl = `${location.origin}${location.pathname}?verify=${c.token}`;
    loadScript(QRCODE_SRC).then(() => {
      qEl.innerHTML = '';
      new QRCode(qEl, { text: verifyUrl, width: 108, height: 108, correctLevel: QRCode.CorrectLevel.M });
    }).catch(() => { qEl.innerHTML = '<span class="muted" style="font-size:11px">Gagal memuat QR.</span>'; });
  }

  async function downloadPdf() {
    const btn = $('#btn-download');
    setBusy('#btn-download', true, 'Menyiapkan…');
    try {
      await Promise.all([loadScript(HTML2CANVAS_SRC), loadScript(JSPDF_SRC)]);
      const node = $('#certificate');
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff' });
      const img = canvas.toDataURL('image/png');
      const { jsPDF } = window.jspdf;
      // Di layar sempit (HP) kartu sertifikat ditumpuk jadi bentuk portrait
      // (lebih tinggi dari lebar). orientation harus ikut bentuk asli kanvas --
      // dipaksa 'landscape' membuat jsPDF membalik lebar/tinggi halaman,
      // sehingga gambar sertifikat kepotong di bagian bawah.
      const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation, unit: 'px', format: [canvas.width, canvas.height] });
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
  // Viewport dikunci (maximum-scale=1) di seluruh app supaya UI kuis tidak
  // sengaja ke-zoom kalau kepencet di HP. Tapi di lightbox gambar materi,
  // pinch-zoom justru yang diinginkan -- daripada menulis ulang logika
  // gesture zoom manual (rawan bug: hitung jarak 2 jari, transform-origin,
  // batas zoom, dst.), viewport dilonggarkan sementara supaya browser
  // menangani pinch-zoom asli, lalu dikunci lagi begitu lightbox ditutup.
  function openLightbox(src) {
    const img = $('#lightbox-img');
    img.src = src;
    img.classList.remove('is-zoomed');
    $('#lightbox').hidden = false;
    const vp = document.querySelector('meta[name=viewport]');
    if (vp) { vp.dataset.prevContent = vp.content; vp.content = 'width=device-width, initial-scale=1, maximum-scale=5'; }
  }
  function closeLightbox() {
    $('#lightbox').hidden = true;
    const vp = document.querySelector('meta[name=viewport]');
    if (vp && vp.dataset.prevContent) { vp.content = vp.dataset.prevContent; delete vp.dataset.prevContent; }
  }
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
    $('#btn-view-history').onclick = () => renderHistory();
    $('#btn-history-back').onclick = () => renderSessions();
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
  // Skrip ini ditaruh di akhir <body>, jadi seluruh HTML yang dibutuhkan di
  // sini sudah pasti ada saat baris ini dieksekusi -- tidak perlu menunggu
  // event DOMContentLoaded, yang di halaman ini malah baru terpicu setelah
  // skrip Tailwind (dipakai layar kuis/hasil) selesai di-JIT-compile oleh
  // browser. Menunggunya cuma menunda tombol login bisa diklik tanpa alasan,
  // apalagi di HP yang CPU-nya lebih lambat memproses compile itu.
  (async () => {
    $$('[data-org-name]').forEach(el => el.textContent = C.org.name);
    $$('[data-org-short]').forEach(el => el.textContent = C.org.short);
    $$('[data-org-subtitle]').forEach(el => el.textContent = C.org.subtitle);
    bind();
    if (await tryVerifyFromUrl()) return;
    renderLogin();
    show('screen-login');
  })();
})();
