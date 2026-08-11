/* ============================================================
   PANEL ADMIN — kelola topik, sesi, dan laporan partisipasi.
   Login sisi-browser saja (lihat catatan keamanan di README).
   ============================================================ */
(function () {
  const C = window.CONFIG;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const AUTH_KEY = 'admin_auth';
  const PAGE_TITLES = { dashboard: 'Dashboard', topics: 'Topik', sessions: 'Sesi', reports: 'Laporan', employees: 'Karyawan' };

  let topics = [];
  let sessions = [];
  let editingTopicCode = null;   // null = topik baru
  let editingSessionId = null;   // null = sesi baru
  let qCount = 0;                // penomor blok soal di editor
  let lastTab = 'dashboard';     // tab aktif terakhir, dipakai saat kembali dari editor
  let currentImageUrl = '';      // materialImage topik yang sedang diedit

  function showPanel(id) {
    $$('.admin-panel').forEach(p => p.classList.add('hidden'));
    $('#' + id).classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  // validFrom/validUntil bisa "yyyy-MM-dd" (sesi lama, sepanjang hari) atau
  // "yyyy-MM-ddTHH:mm" (sesi baru, jam spesifik). String tanggal-polos
  // ditambahi jam default (awal/akhir hari) biar bisa dibandingkan sama rata.
  function todayInRange(from, until) {
    const now = new Date();
    const f = new Date(from.length > 10 ? from : from + 'T00:00:00');
    const u = new Date(until.length > 10 ? until : until + 'T23:59:59');
    return now >= f && now <= u;
  }

  // ============================================================
  // LOGIN
  // ============================================================
  // Password ASLI cuma pernah dicek server-side (lihat api/data.js) --
  // di sini kita cuma pernah pegang & simpan TOKEN SESI balasannya, bukan
  // passwordnya. Sebelumnya password mentah yang tersimpan di config.js
  // publik itu sendiri yang jadi "token" dan dikirim balik ke server; itu
  // aman-aman saja untuk mode mock (memang cuma demo lokal), tapi di mode
  // sheets sekarang beneran tersembunyi.
  async function doLogin() {
    const val = $('#admin-password').value;
    const err = $('#admin-login-error');
    const btn = $('#btn-admin-login');
    btn.disabled = true;
    try {
      const result = await API.adminLogin(val);
      if (!result.ok) { err.textContent = 'Password salah.'; return; }
      err.textContent = '';
      sessionStorage.setItem(AUTH_KEY, result.token); // token sesi, bukan password
      API.setAdminToken(result.token);
      $('#admin-password').value = '';
      openDashboard();
    } catch (e) {
      err.textContent = 'Gagal menghubungi server. Coba lagi.';
    } finally {
      btn.disabled = false;
    }
  }
  function doLogout() {
    sessionStorage.removeItem(AUTH_KEY);
    API.setAdminToken(null);
    $('#admin-shell').classList.add('hidden');
    $('#admin-login-view').classList.remove('hidden');
    clearTimeout(idleTimer);
  }

  // ============================================================
  // AUTO-LOGOUT SAAT IDLE (keamanan -- PC admin bisa dipakai bersama)
  // ============================================================
  const IDLE_MS = 15 * 60 * 1000; // 15 menit tanpa aktivitas
  let idleTimer = null;
  function resetIdleTimer() {
    if ($('#admin-shell').classList.contains('hidden')) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      doLogout();
      alert('Sesi admin berakhir otomatis karena tidak ada aktivitas selama 15 menit.');
    }, IDLE_MS);
  }
  ['mousemove', 'keydown', 'click', 'touchstart'].forEach(evt => document.addEventListener(evt, resetIdleTimer));

  // ============================================================
  // SHELL + NAV
  // ============================================================
  async function openDashboard() {
    $('#admin-login-view').classList.add('hidden');
    $('#admin-shell').classList.remove('hidden');
    resetIdleTimer();
    $('#reports-scope-note').textContent = API.mode === 'mock'
      ? 'Rekap partisipasi — mode demo, hanya tersimpan di browser ini.'
      : 'Rekap partisipasi dari Google Sheet.';
    // Navigasi ke dashboard SEKARANG (bukan setelah data topik/sesi selesai
    // dimuat) supaya klik tab lain oleh admin selagi data masih dimuat
    // tidak tertimpa balik ke Dashboard begitu reloadData() selesai.
    switchTab('dashboard');
    await reloadData();
    renderTopicsList();
    renderSessionsList();
    // reloadData() baru selesai sekarang -- render ulang Dashboard supaya kartu
    // "Total Topik"/"Sesi Aktif" tidak nyangkut di 0 (dihitung dari topics/sessions
    // yang saat render pertama di atas masih kosong).
    if (lastTab === 'dashboard') renderDashboardPanel();
  }

  async function reloadData() {
    [topics, sessions] = await Promise.all([API.listTopics(), API.listSessions()]);
  }

  function switchTab(tab) {
    lastTab = tab;
    $$('.nav-link').forEach(b => b.classList.toggle('is-active', b.dataset.tab === tab));
    $('#admin-page-title').textContent = PAGE_TITLES[tab];
    showPanel('panel-' + tab);
    if (tab === 'dashboard') renderDashboardPanel();
    if (tab === 'reports') renderReports();
    if (tab === 'employees') renderEmployees();
  }

  // ============================================================
  // DASHBOARD
  // ============================================================
  function kpiCard(icon, label, value, note) {
    return `
      <div class="bg-white p-5 rounded-2xl border border-outline-variant card-shadow flex flex-col justify-between h-32">
        <div class="flex justify-between items-start">
          <span class="text-xs font-bold uppercase tracking-wide text-on-surface-variant">${label}</span>
          <div class="p-2 bg-primary/10 rounded-lg text-primary"><span class="material-symbols-outlined">${icon}</span></div>
        </div>
        <div>
          <span class="text-3xl font-extrabold text-primary">${value}</span>
          <div class="text-xs text-on-surface-variant mt-1">${note}</div>
        </div>
      </div>`;
  }

  function initials(name) {
    return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  async function renderDashboardPanel() {
    const grid = $('#kpi-grid');
    grid.innerHTML = '<p class="text-on-surface-variant col-span-full">Memuat…</p>';
    const list = $('#recent-activity-list');
    list.innerHTML = '';
    try {
      // Pakai cache yang sudah ada kalau tab Karyawan/Laporan sudah pernah
      // dibuka sebelumnya -- hindari fetch ulang data yang sama tiap kali
      // admin bolak-balik ke Dashboard (Apps Script lambat per panggilan).
      if (!lastEmployees.length) lastEmployees = await API.listEmployees();
      if (!lastReports.length) lastReports = await API.listParticipations();
      const employees = lastEmployees, participations = lastReports;
      const activeSessions = sessions.filter(s => s.status === 'published' && todayInRange(s.validFrom, s.validUntil));
      const total = participations.length;
      const avgScore = total ? Math.round(participations.reduce((s, p) => s + (Number(p.score) || 0), 0) / total) : 0;
      const passRate = total ? Math.round(participations.filter(p => p.passed).length / total * 100) : 0;

      grid.innerHTML = [
        kpiCard('group', 'Total Karyawan', employees.length, 'dari roster'),
        kpiCard('menu_book', 'Total Topik', topics.length, (topics.reduce((s, t) => s + (t.questions || []).length, 0)) + ' soal total'),
        kpiCard('event_available', 'Sesi Aktif', activeSessions.length, 'published & berlaku hari ini'),
        kpiCard('fact_check', 'Total Partisipasi', total, 'seluruh percobaan tercatat'),
        kpiCard('leaderboard', 'Rata-rata Skor', avgScore + '%', 'seluruh partisipasi'),
        kpiCard('assignment_turned_in', 'Tingkat Kelulusan', passRate + '%', 'seluruh partisipasi'),
      ].join('');

      const recent = participations.slice(0, 6);
      if (!recent.length) {
        list.innerHTML = '<div class="p-6 text-on-surface-variant text-sm">Belum ada partisipasi tercatat.</div>';
      } else {
        list.innerHTML = recent.map(p => `
          <div class="p-4 flex items-center justify-between hover:bg-surface-container-low transition-colors">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">${escapeHtml(initials(p.nama))}</div>
              <div>
                <p class="font-bold text-sm text-on-surface">${escapeHtml(p.nama || '-')}</p>
                <p class="text-xs text-on-surface-variant">${escapeHtml(p.perusahaan || '-')} · ${escapeHtml(p.topicCode || '-')}</p>
              </div>
            </div>
            <div class="text-right">
              <p class="font-bold text-sm ${p.passed ? 'text-green-600' : 'text-error'}">${p.score ?? '-'}%</p>
              <p class="text-[11px] text-on-surface-variant">${p.submittedAt ? new Date(p.submittedAt).toLocaleString('id-ID') : '-'}</p>
            </div>
          </div>`).join('');
      }
      renderTrendChart(participations);
    } catch (e) {
      grid.innerHTML = '<p class="text-error col-span-full">Gagal memuat ringkasan.</p>';
    }
  }

  function renderTrendChart(participations) {
    const wrap = $('#trend-chart');
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }) });
    }
    const byMonth = {};
    participations.forEach(p => {
      if (!p.submittedAt) return;
      const d = new Date(p.submittedAt);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const g = byMonth[key] || (byMonth[key] = { total: 0, passed: 0 });
      g.total++;
      if (p.passed) g.passed++;
    });
    wrap.innerHTML = months.map(m => {
      const g = byMonth[m.key] || { total: 0, passed: 0 };
      const rate = g.total ? Math.round(g.passed / g.total * 100) : 0;
      return `
        <div class="flex items-center gap-3">
          <span class="w-14 text-xs text-on-surface-variant">${m.label}</span>
          <div class="flex-1 bg-surface-container-low rounded-full h-4 overflow-hidden">
            <div class="bg-secondary-container h-full rounded-full" style="width:${rate}%"></div>
          </div>
          <span class="w-28 text-xs text-right text-on-surface-variant">${rate}% (${g.total} peserta)</span>
        </div>`;
    }).join('');
  }

  // ============================================================
  // EDITOR MATERI (contenteditable + document.execCommand -- bawaan browser,
  // tanpa library luar)
  // ============================================================
  // Materi diedit di sini tersimpan sebagai HTML, bukan lagi teks+markup
  // ("## "/"- "). Topik LAMA yang materinya masih teks polos otomatis
  // dikonversi ke HTML begitu dibuka di editor ini (legacyMaterialToHtml) --
  // jadi format lama & baru hidup berdampingan tanpa migrasi data manual.
  // Fungsi yang sama dipakai ulang buat paste-handler di bawah (lihat
  // bindMaterialEditor) -- paste teks polos yang masih pakai "## "/"- "/
  // "1. " otomatis jadi subjudul/list beneran, bukan tersisa sebagai teks
  // literal.
  // Sisi peserta (app.js renderMaterialText) mendeteksi HTML vs teks polos
  // lewat ada/tidaknya tag "<" di string materinya.
  function looksLikeHtml(s) { return /<[a-z][\s\S]*>/i.test(String(s || '')); }
  function legacyMaterialToHtml(text) {
    let html = '', listTag = null; // null | 'ul' | 'ol'
    const closeList = () => { if (listTag) { html += `</${listTag}>`; listTag = null; } };
    String(text || '').split('\n').forEach(line => {
      const t = line.trim();
      if (!t) { closeList(); return; }
      if (t.startsWith('## ')) { closeList(); html += `<h4>${escapeHtml(t.slice(3))}</h4>`; }
      else if (t.startsWith('- ')) {
        if (listTag !== 'ul') { closeList(); html += '<ul>'; listTag = 'ul'; }
        html += `<li>${escapeHtml(t.slice(2))}</li>`;
      } else if (/^\d+\.\s/.test(t)) {
        if (listTag !== 'ol') { closeList(); html += '<ol>'; listTag = 'ol'; }
        html += `<li>${escapeHtml(t.replace(/^\d+\.\s/, ''))}</li>`;
      } else { closeList(); html += `<p>${escapeHtml(t)}</p>`; }
    });
    closeList();
    return html;
  }
  const EDITOR_STATE_CMDS = ['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList', 'justifyLeft', 'justifyCenter', 'justifyRight'];
  function updateEditorToolbarState() {
    $$('#t-material-toolbar [data-cmd]').forEach(btn => {
      const cmd = btn.dataset.cmd;
      btn.classList.toggle('is-active', EDITOR_STATE_CMDS.includes(cmd) && document.queryCommandState(cmd));
    });
  }
  function bindMaterialEditor() {
    const body = $('#t-material');
    $$('#t-material-toolbar [data-cmd]').forEach(btn => {
      btn.addEventListener('mousedown', (e) => e.preventDefault()); // jaga selection jangan hilang saat tombol diklik
      btn.addEventListener('click', () => { document.execCommand(btn.dataset.cmd); body.focus(); updateEditorToolbarState(); });
    });
    $$('#t-material-toolbar [data-block]').forEach(btn => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => { document.execCommand('formatBlock', false, btn.dataset.block); body.focus(); });
    });
    body.addEventListener('keyup', updateEditorToolbarState);
    body.addEventListener('mouseup', updateEditorToolbarState);
    // Paste selalu dipaksa jadi teks polos (bukan HTML/formatting bawaan dari
    // sumbernya, mis. Word/halaman web) lalu diproses lewat konverter yang
    // sama dengan data lama -- jadi "## "/"- "/"1. " langsung jadi
    // subjudul/list beneran, bukan tersisa sebagai teks literal.
    body.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (!text) return;
      e.preventDefault();
      document.execCommand('insertHTML', false, legacyMaterialToHtml(text));
    });
  }

  // ============================================================
  // TAB TOPIK
  // ============================================================
  function renderTopicsList() {
    const wrap = $('#topics-list');
    if (!topics.length) { wrap.innerHTML = emptyState('Belum ada topik. Klik "+ Topik Baru".'); return; }
    wrap.innerHTML = topics.map((t, i) => `
      <button type="button" data-i="${i}" class="topic-card text-left bg-white p-5 rounded-2xl border border-outline-variant card-shadow hover:border-primary transition-colors">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 flex-shrink-0 rounded-lg bg-secondary-container/25 text-primary-container flex items-center justify-center">${window.topicIconSvg(t)}</div>
            <div>
              <p class="font-bold text-primary">${escapeHtml(t.title)}</p>
              <p class="text-xs text-on-surface-variant mt-1">${escapeHtml(t.code)} · ${(t.questions || []).length} soal · lulus ≥ ${t.passThreshold || C.passThresholdDefault}%</p>
            </div>
          </div>
          <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
        </div>
      </button>`).join('');
    $$('.topic-card', wrap).forEach(el => el.onclick = () => openTopicEditor(topics[Number(el.dataset.i)]));
  }

  function openTopicEditor(topic) {
    editingTopicCode = topic ? topic.code : null;
    $('#topic-editor-title').textContent = topic ? 'Edit Topik' : 'Topik Baru';
    $('#t-code').value = topic ? topic.code : '';
    $('#t-code').disabled = !!topic; // kode = kunci, tidak diubah setelah dibuat
    $('#t-title').value = topic ? topic.title : '';
    $('#t-threshold').value = topic ? (topic.passThreshold || C.passThresholdDefault) : C.passThresholdDefault;
    $('#t-material').innerHTML = topic ? (looksLikeHtml(topic.material) ? topic.material : legacyMaterialToHtml(topic.material)) : '';
    setImagePreview(topic ? topic.materialImage : '');
    $('#csv-import-status').textContent = '';
    $('#btn-topic-delete').hidden = !topic;
    $('#btn-topic-duplicate').hidden = !topic;
    $('#questions-editor').innerHTML = '';
    qCount = 0;
    (topic ? topic.questions : [{ q: '', options: ['', '', '', ''], correct: 0 }]).forEach(addQuestionBlock);
    showPanel('panel-topic-editor');
  }

  function addQuestionBlock(question) {
    const idx = qCount++;
    const q = question || { q: '', options: ['', '', '', ''], correct: 0 };
    const wrap = document.createElement('fieldset');
    wrap.className = 'border border-outline-variant rounded-xl p-4 space-y-3';
    wrap.dataset.idx = idx;
    wrap.innerHTML = `
      <label class="block text-xs font-bold uppercase tracking-wide text-on-surface-variant">Pertanyaan</label>
      <input class="admin-field q-text" value="${escapeAttr(q.q)}" required />
      <div class="space-y-2">
        ${[0, 1, 2, 3].map(i => `
          <label class="flex items-center gap-3">
            <input type="radio" name="correct-${idx}" value="${i}" ${q.correct === i ? 'checked' : ''} class="w-4 h-4 accent-[#1f4d33]" />
            <input class="admin-field q-option-text" placeholder="Opsi ${String.fromCharCode(65 + i)}" value="${escapeAttr(q.options[i] || '')}" required />
          </label>`).join('')}
      </div>
      <button type="button" class="btn-remove-question text-error text-sm font-bold hover:underline">Hapus Soal</button>`;
    wrap.querySelector('.btn-remove-question').onclick = () => wrap.remove();
    $('#questions-editor').appendChild(wrap);
  }

  function collectQuestions() {
    return $$('fieldset', $('#questions-editor')).map(block => {
      const opts = $$('.q-option-text', block).map(i => i.value.trim());
      const correct = Number(block.querySelector('input[type=radio]:checked').value);
      return { q: $('.q-text', block).value.trim(), options: opts, correct };
    });
  }

  async function saveTopicForm(ev) {
    ev.preventDefault();
    const questions = collectQuestions();
    if (!questions.length) { alert('Tambahkan minimal satu soal.'); return; }
    // contenteditable bukan elemen form, tidak ikut validasi "required" bawaan
    // browser seperti textarea dulu -- dicek manual di sini.
    if (!$('#t-material').textContent.trim()) { alert('Materi wajib diisi.'); return; }
    const code = editingTopicCode || $('#t-code').value.trim();
    if (!code) { alert('Kode topik wajib diisi.'); return; }
    if (!editingTopicCode && topics.some(t => t.code === code)) {
      alert(`Kode topik "${code}" sudah dipakai topik lain. Pakai kode yang berbeda.`);
      return;
    }
    const topic = {
      code,
      title: $('#t-title').value.trim(),
      passThreshold: Number($('#t-threshold').value) || C.passThresholdDefault,
      material: $('#t-material').innerHTML,
      materialImage: currentImageUrl,
      questions,
    };
    const btn = $('#topic-form button[type=submit]');
    btn.disabled = true;
    try {
      await API.saveTopic(topic);
      await reloadData();
      renderTopicsList();
      switchTab('topics');
    } catch (e) {
      alert('Gagal menyimpan topik. Periksa koneksi lalu coba lagi.');
    } finally {
      btn.disabled = false;
    }
  }

  async function duplicateTopicConfirm() {
    if (!editingTopicCode) return;
    const src = topics.find(t => t.code === editingTopicCode);
    if (!src) return;
    const input = prompt('Kode topik baru untuk hasil duplikat:', src.code + '-COPY');
    if (!input) return;
    const code = input.trim();
    if (!code) return;
    if (topics.some(t => t.code === code)) { alert(`Kode topik "${code}" sudah dipakai topik lain. Pakai kode yang berbeda.`); return; }
    const copy = {
      code, title: src.title + ' (Copy)', passThreshold: src.passThreshold,
      material: src.material, materialImage: src.materialImage, questions: src.questions,
    };
    try {
      await API.saveTopic(copy);
      await reloadData();
      renderTopicsList();
      openTopicEditor(topics.find(t => t.code === code));
    } catch (e) {
      alert('Gagal menduplikat topik. Periksa koneksi lalu coba lagi.');
    }
  }

  async function deleteTopicConfirm() {
    if (!editingTopicCode) return;
    if (!confirm(`Hapus topik "${editingTopicCode}"? Sesi yang memakainya jadi tidak tampil di kiosk.`)) return;
    try {
      await API.deleteTopic(editingTopicCode);
      await reloadData();
      renderTopicsList();
      switchTab('topics');
    } catch (e) {
      alert('Gagal menghapus topik. Periksa koneksi lalu coba lagi.');
    }
  }

  // ============================================================
  // GAMBAR MATERI (upload ke Vercel Blob lewat api/data.js)
  // ============================================================
  function setImagePreview(url) {
    currentImageUrl = url || '';
    const wrap = $('#t-image-preview-wrap');
    if (currentImageUrl) { $('#t-image-preview').src = currentImageUrl; wrap.classList.remove('hidden'); }
    else { wrap.classList.add('hidden'); }
  }

  // Vercel serverless function menolak body > ~4.5MB (413 sebelum kode kita
  // sempat jalan) -- foto dari HP modern gampang lebih besar dari itu. Perkecil
  // dulu lewat <canvas> supaya base64-nya konsisten muat, tanpa perlu naikkan
  // limit server (yang toh dibatasi platform, tidak bisa diubah dari kode).
  function resizeImageToBase64(file, maxDim = 1600, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        URL.revokeObjectURL(img.src);
        resolve({ base64: canvas.toDataURL(mimeType, quality).split(',')[1], mimeType });
      };
      img.onerror = () => reject(new Error('Gagal membaca gambar'));
      img.src = URL.createObjectURL(file);
    });
  }

  async function handleImageFileChange(ev) {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    const status = $('#t-image-status');
    if (API.mode !== 'sheets') {
      status.textContent = 'Upload gambar hanya tersedia saat tersambung ke Google Sheet.';
      status.className = 'text-xs text-error mt-1';
      return;
    }
    status.textContent = 'Mengunggah…';
    status.className = 'text-xs text-on-surface-variant mt-1';
    try {
      const { base64, mimeType } = await resizeImageToBase64(file);
      const url = await API.uploadImage(base64, file.name, mimeType);
      if (!url) throw new Error('no url');
      setImagePreview(url);
      status.textContent = 'Gambar berhasil diunggah.';
      status.className = 'text-xs text-green-700 mt-1';
    } catch (e) {
      status.textContent = 'Gagal mengunggah gambar: ' + (e && e.message ? e.message : 'coba lagi.');
      status.className = 'text-xs text-error mt-1';
    }
  }

  // ponytail: import PDF/PPT = unggah ke Vercel Blob lewat endpoint upload_image
  // yang generik, lalu sisipkan tautannya ke HTML materi. Tanpa kolom/schema
  // baru & tanpa ubah sisi peserta -- app.js merender topic.material sebagai
  // HTML mentah, jadi tautannya otomatis muncul. Isinya tidak diekstrak jadi
  // teks; berkas dibuka/diunduh apa adanya (PPT tak bisa dirender di browser).
  const DOC_MAX_BYTES = 10 * 1024 * 1024; // cap 10MB (base64 +~33% -> ~13MB body; Vercel Functions kini terima body s.d. 100MB)
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(new Error('Gagal membaca berkas'));
      r.readAsDataURL(file);
    });
  }
  function insertMaterialDocLink(url, name) {
    const p = document.createElement('p');
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = '📄 ' + name;
    a.setAttribute('style', 'display:inline-block;padding:8px 14px;border-radius:10px;background:#e8f3ec;color:#1f4d33;font-weight:700;text-decoration:none;margin:6px 0');
    p.appendChild(a);
    $('#t-material').appendChild(p);
  }
  async function handleDocFileChange(ev) {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    const status = $('#t-doc-status');
    if (API.mode !== 'sheets') {
      status.textContent = 'Import materi hanya tersedia saat tersambung ke Google Sheet.';
      status.className = 'text-xs text-error mt-1';
      return;
    }
    if (file.size > DOC_MAX_BYTES) {
      status.textContent = `Berkas terlalu besar (${(file.size / 1024 / 1024).toFixed(1)}MB). Maksimal 10MB — kompres atau bagi filenya dulu.`;
      status.className = 'text-xs text-error mt-1';
      return;
    }
    status.textContent = 'Mengunggah…';
    status.className = 'text-xs text-on-surface-variant mt-1';
    try {
      const base64 = await fileToBase64(file);
      const url = await API.uploadImage(base64, file.name, file.type || 'application/octet-stream');
      if (!url) throw new Error('no url');
      insertMaterialDocLink(url, file.name);
      status.textContent = 'Materi ditambahkan sebagai tautan di bawah teks materi.';
      status.className = 'text-xs text-green-700 mt-1';
    } catch (e) {
      status.textContent = 'Gagal mengunggah: ' + (e && e.message ? e.message : 'coba lagi.');
      status.className = 'text-xs text-error mt-1';
    }
  }

  // ============================================================
  // IMPOR SOAL DARI CSV
  // ============================================================
  function parseCsv(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* diabaikan, ditangani lewat \n */ }
      else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(v => v !== ''));
  }

  function setCsvStatus(msg, isError) {
    const el = $('#csv-import-status');
    el.textContent = msg;
    el.className = 'text-xs font-semibold ' + (isError ? 'text-error' : 'text-green-700');
  }

  function handleCsvFileChange(ev) {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result));
      if (!rows.length) { setCsvStatus('File CSV kosong.', true); return; }
      const header = rows[0].map(h => h.trim().toLowerCase());
      const need = ['pertanyaan', 'opsia', 'opsib', 'opsic', 'opsid', 'jawaban'];
      const idx = {};
      need.forEach(n => { idx[n] = header.indexOf(n); });
      if (Object.values(idx).some(i => i === -1)) {
        setCsvStatus('Header CSV tidak sesuai template. Unduh "Template CSV" dulu.', true);
        return;
      }
      let added = 0, skipped = 0;
      rows.slice(1).forEach(r => {
        const q = (r[idx.pertanyaan] || '').trim();
        const options = [r[idx.opsia], r[idx.opsib], r[idx.opsic], r[idx.opsid]].map(o => (o || '').trim());
        const correct = 'ABCD'.indexOf((r[idx.jawaban] || '').trim().toUpperCase());
        if (!q || options.some(o => !o) || correct === -1) { skipped++; return; }
        addQuestionBlock({ q, options, correct });
        added++;
      });
      setCsvStatus(`${added} soal berhasil diimpor.` + (skipped ? ` ${skipped} baris dilewati (data tidak lengkap atau jawaban tidak valid).` : ''), skipped > 0 && added === 0);
    };
    reader.readAsText(file, 'utf-8');
  }

  function downloadCsvTemplate() {
    const rows = [
      ['pertanyaan', 'opsiA', 'opsiB', 'opsiC', 'opsiD', 'jawaban'],
      ['Apa fungsi utama helm keselamatan?', 'Gaya berpenampilan', 'Melindungi kepala dari benturan & benda jatuh', 'Menahan panas matahari', 'Identitas perusahaan', 'B'],
    ];
    const csvEscape = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = rows.map(r => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'template-soal.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ============================================================
  // TAB SESI
  // ============================================================
  function pill(label, tone) {
    const cls = tone === 'good' ? 'bg-green-100 text-green-700' : 'bg-secondary-container/25 text-on-secondary-container';
    return `<span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${cls}">${escapeHtml(label)}</span>`;
  }
  const statusPill = (status) => pill(status, status === 'published' ? 'good' : 'plain');
  const passPill = (passed) => pill(passed ? 'Lulus' : 'Belum lulus', passed ? 'good' : 'plain');
  const expiredPill = () => `<span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold uppercase bg-error-container text-on-error-container">Kedaluwarsa</span>`;
  const isExpired = (s) => new Date() > new Date(s.validUntil.length > 10 ? s.validUntil : s.validUntil + 'T23:59:59');

  // validFrom/validUntil "yyyy-MM-dd" (sesi lama, sepanjang hari) atau
  // "yyyy-MM-ddTHH:mm" (sesi baru, jam spesifik) -- tampilkan jam cuma
  // kalau memang diisi.
  function fmtSessionDate(v) {
    if (!v) return '-';
    const hasTime = v.length > 10;
    const d = new Date(hasTime ? v : v + 'T00:00:00');
    const datePart = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    if (!hasTime) return datePart;
    return `${datePart}, ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function renderSessionsList() {
    const wrap = $('#sessions-list');
    if (!sessions.length) { wrap.innerHTML = emptyState('Belum ada sesi. Klik "+ Sesi Baru".'); return; }
    wrap.innerHTML = sessions.map((s, i) => {
      const topic = topics.find(t => t.code === s.topicCode);
      return `
        <button type="button" data-i="${i}" class="session-card text-left bg-white p-5 rounded-2xl border border-outline-variant card-shadow hover:border-primary transition-colors">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-bold text-primary">${escapeHtml(s.title || (topic ? topic.title : s.topicCode))}</p>
              <p class="text-xs text-on-surface-variant mt-1">${escapeHtml(s.topicCode)} · ${fmtSessionDate(s.validFrom)} – ${fmtSessionDate(s.validUntil)}</p>
              <div class="mt-2 flex gap-2">${statusPill(s.status)}${s.status === 'published' && isExpired(s) ? expiredPill() : ''}</div>
            </div>
            <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
          </div>
        </button>`;
    }).join('');
    $$('.session-card', wrap).forEach(el => el.onclick = () => openSessionEditor(sessions[Number(el.dataset.i)]));
  }

  // <input type=datetime-local> butuh "yyyy-MM-ddTHH:mm" persis -- tanggal
  // polos dari sesi lama ditambahi jam default (awal hari utk "dari", akhir
  // hari utk "sampai") biar konsisten dgn cara todayInRange menafsirkannya.
  function toDatetimeLocalValue(v, endOfDay) {
    if (!v) return '';
    return v.length > 10 ? v : v + (endOfDay ? 'T23:59' : 'T00:00');
  }
  function localDatetimeValue(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openSessionEditor(session) {
    editingSessionId = session ? session.id : null;
    $('#session-editor-title').textContent = session ? 'Edit Sesi' : 'Sesi Baru';
    const sel = $('#s-topic');
    sel.innerHTML = topics.map(t => `<option value="${escapeAttr(t.code)}">${escapeHtml(t.title)} (${escapeHtml(t.code)})</option>`).join('');
    if (!topics.length) sel.innerHTML = '<option value="">— buat topik dulu —</option>';
    sel.value = session ? session.topicCode : (topics[0] ? topics[0].code : '');
    $('#s-title').value = session ? (session.title || '') : '';
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 0, 0);
    $('#s-from').value = session ? toDatetimeLocalValue(session.validFrom, false) : localDatetimeValue(new Date());
    $('#s-until').value = session ? toDatetimeLocalValue(session.validUntil, true) : localDatetimeValue(endOfToday);
    $('#s-status').value = session ? session.status : 'draft';
    $('#btn-session-delete').hidden = !session;
    populateCompanyCheckboxes(session ? (session.targetCompanies || []) : []);
    showPanel('panel-session-editor');
  }

  // Daftar centang perusahaan diisi dari roster karyawan (bukan diketik manual)
  // supaya tidak ada typo yang bikin target sesi diam-diam tidak kena siapa-siapa.
  async function populateCompanyCheckboxes(selected) {
    const wrap = $('#s-companies-list');
    wrap.innerHTML = '<p class="text-xs text-on-surface-variant">Memuat daftar perusahaan…</p>';
    try {
      if (!lastEmployees.length) lastEmployees = await API.listEmployees();
      // gabung dengan yang sudah dipilih sebelumnya, kalau-kalau ada nama
      // perusahaan lama yang sudah tidak ada lagi di roster saat ini
      const companies = [...new Set([...lastEmployees.map(e => e.perusahaan), ...selected].filter(Boolean))].sort();
      if (!companies.length) {
        wrap.innerHTML = '<p class="text-xs text-on-surface-variant">Belum ada data perusahaan di roster karyawan.</p>';
        return;
      }
      wrap.innerHTML = companies.map(c => `
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" class="s-company-checkbox w-4 h-4 accent-[#1f4d33]" value="${escapeAttr(c)}" ${selected.includes(c) ? 'checked' : ''} />
          ${escapeHtml(c)}
        </label>`).join('');
    } catch (e) {
      wrap.innerHTML = '<p class="text-xs text-error">Gagal memuat daftar perusahaan.</p>';
    }
  }

  async function saveSessionForm(ev) {
    ev.preventDefault();
    const topicCode = $('#s-topic').value;
    if (!topicCode) { alert('Buat topik terlebih dahulu.'); return; }
    const validFrom = $('#s-from').value, validUntil = $('#s-until').value;
    if (validUntil < validFrom) { alert('Tanggal "Berlaku Sampai" tidak boleh sebelum "Berlaku Dari".'); return; }
    const session = {
      id: editingSessionId || ('S-' + Date.now().toString(36).toUpperCase()),
      topicCode,
      title: $('#s-title').value.trim(),
      validFrom, validUntil,
      targetCompanies: $$('.s-company-checkbox:checked').map(cb => cb.value),
      status: $('#s-status').value,
    };
    const btn = $('#session-form button[type=submit]');
    btn.disabled = true;
    try {
      await API.saveSession(session);
      await reloadData();
      renderSessionsList();
      switchTab('sessions');
    } catch (e) {
      alert('Gagal menyimpan sesi. Periksa koneksi lalu coba lagi.');
    } finally {
      btn.disabled = false;
    }
  }

  async function deleteSessionConfirm() {
    if (!editingSessionId) return;
    if (!confirm('Hapus sesi ini?')) return;
    try {
      await API.deleteSession(editingSessionId);
      await reloadData();
      renderSessionsList();
      switchTab('sessions');
    } catch (e) {
      alert('Gagal menghapus sesi. Periksa koneksi lalu coba lagi.');
    }
  }

  // ============================================================
  // TAB LAPORAN
  // ============================================================
  let lastReports = [];
  async function renderReports() {
    const body = $('#reports-body');
    body.innerHTML = `<tr><td colspan="8" class="px-6 py-4 text-on-surface-variant">Memuat…</td></tr>`;
    try {
      // openDashboard() sengaja pindah ke tab Dashboard duluan sementara
      // reloadData() (isi topics/sessions) masih jalan di belakang (lihat
      // komentarnya) -- kalau admin buru-buru klik Laporan sebelum itu
      // selesai, sessions/topics masih [] di sini. Semua yang di bawah
      // (ringkasan topik, dropdown analitik, Belum Lulus per Sesi) butuh
      // sessions terisi, jadi ditunggu dulu kalau belum ada.
      if (!sessions.length) await reloadData();
      lastReports = await API.listParticipations();
      renderCompanySummary(lastReports);
      await renderTopicSummary(lastReports);
      populateQuestionAnalyticsSessionSelect();
      renderQuestionAnalytics(lastReports, $('#question-analytics-session-select').value);
      populateFilter('#reports-company-filter', lastReports, p => p.perusahaan, 'Semua perusahaan');
      populateFilter('#reports-topic-filter', lastReports, p => p.topicCode, 'Semua topik');
      renderReportsTable(lastReports);
      renderMissingReport();
    } catch (e) {
      body.innerHTML = `<tr><td colspan="8" class="px-6 py-4 text-on-surface-variant">Gagal memuat laporan.</td></tr>`;
      $('#company-summary-body').innerHTML = '';
      $('#topic-summary-body').innerHTML = '';
    }
  }

  function renderReportsTable(list) {
    const body = $('#reports-body');
    if (!list.length) { body.innerHTML = `<tr><td colspan="8" class="px-6 py-4 text-on-surface-variant">Belum ada partisipasi tercatat.</td></tr>`; return; }
    body.innerHTML = list.map(p => `
      <tr>
        <td class="px-6 py-3">${p.submittedAt ? new Date(p.submittedAt).toLocaleString('id-ID') : '-'}</td>
        <td class="px-6 py-3 font-medium"><button type="button" class="history-link text-primary hover:underline" data-nik="${escapeAttr(p.nik)}" data-nama="${escapeAttr(p.nama)}">${escapeHtml(p.nama || '-')}</button></td>
        <td class="px-6 py-3 font-mono text-xs">${escapeHtml(p.nik || '-')}</td>
        <td class="px-6 py-3">${escapeHtml(p.perusahaan || '-')}</td>
        <td class="px-6 py-3">${escapeHtml(p.topicCode || '-')}</td>
        <td class="px-6 py-3">${p.score ?? '-'}%</td>
        <td class="px-6 py-3">${passPill(p.passed)}</td>
        <td class="px-6 py-3 font-mono text-xs">${escapeHtml(p.certificateNo || '-')}</td>
      </tr>`).join('');
    $$('.history-link', body).forEach(b => b.onclick = () => openEmployeeHistory(b.dataset.nik, b.dataset.nama));
  }

  function buildSummary(list, keyFn, fallbackLabel) {
    const groups = {};
    list.forEach(p => {
      const key = keyFn(p) || fallbackLabel;
      const g = groups[key] || (groups[key] = { total: 0, passed: 0, scoreSum: 0 });
      g.total++;
      g.scoreSum += Number(p.score) || 0;
      if (p.passed) g.passed++;
    });
    return groups;
  }

  function renderSummaryTable(elId, groups) {
    const wrap = $(elId);
    const names = Object.keys(groups).sort();
    if (!names.length) { wrap.innerHTML = `<tr><td colspan="6" class="px-4 py-3 text-on-surface-variant">Belum ada data.</td></tr>`; return; }
    wrap.innerHTML = names.map(name => {
      const g = groups[name];
      const avg = Math.round(g.scoreSum / g.total);
      const rate = Math.round((g.passed / g.total) * 100);
      return `<tr>
        <td class="px-4 py-3 font-medium">${escapeHtml(name)}</td><td class="px-4 py-3">${g.total}</td><td class="px-4 py-3">${g.passed}</td>
        <td class="px-4 py-3">${g.total - g.passed}</td><td class="px-4 py-3">${avg}%</td><td class="px-4 py-3 font-bold text-primary">${rate}%</td>
      </tr>`;
    }).join('');
  }

  function renderCompanySummary(list) {
    renderSummaryTable('#company-summary-body', buildSummary(list, p => p.perusahaan, 'Tanpa perusahaan'));
  }

  // Ringkasan per Topik dihitung per ORANG dalam cakupan roster topik itu
  // (gabungan targetCompanies semua sesinya), BUKAN per baris
  // partisipasi/attempt -- beda dari Ringkasan per Perusahaan di atas yang
  // tetap per-attempt. Ini supaya PESERTA = total karyawan yang seharusnya
  // ikut (bukan cuma yang sempat menjawab) dan %LULUS jadi lebih
  // mencerminkan kondisi nyata, bukan cuma dari yang mengerjakan saja.
  // Topik yang sudah dijadwalkan sesi tapi belum ada satu pun yang
  // mengerjakan tetap muncul (peserta = cakupan, lulus = 0) -- sengaja,
  // supaya tidak hilang begitu saja dari laporan.
  async function renderTopicSummary(list) {
    if (!lastEmployees.length) lastEmployees = await API.listEmployees();
    const attemptsByTopic = {};
    list.forEach(p => {
      const key = p.topicCode || 'Tanpa topik';
      (attemptsByTopic[key] || (attemptsByTopic[key] = [])).push(p);
    });
    const topicCodes = new Set([...sessions.map(s => s.topicCode), ...Object.keys(attemptsByTopic)]);

    const groups = {};
    topicCodes.forEach(topicCode => {
      const attempts = attemptsByTopic[topicCode] || [];
      const topicSessions = sessions.filter(s => s.topicCode === topicCode);
      const passedNiks = new Set(attempts.filter(p => p.passed).map(p => p.nik));
      const attemptedNiks = new Set(attempts.map(p => p.nik));
      let total, passed, notAttempted;
      if (topicSessions.length) {
        const scopeNiks = new Set();
        topicSessions.forEach(s => {
          const scope = (s.targetCompanies || []).length ? lastEmployees.filter(e => s.targetCompanies.includes(e.perusahaan)) : lastEmployees;
          scope.forEach(e => scopeNiks.add(e.nik));
        });
        total = scopeNiks.size;
        passed = [...scopeNiks].filter(nik => passedNiks.has(nik)).length;
        notAttempted = [...scopeNiks].filter(nik => !attemptedNiks.has(nik)).length;
      } else {
        // topik tanpa sesi terjadwal (mis. data lama) -- tidak ada cakupan
        // roster yg bisa dihitung, fallback ke jumlah orang yg pernah coba.
        total = attemptedNiks.size;
        passed = passedNiks.size;
        notAttempted = null;
      }
      const avg = attempts.length ? Math.round(attempts.reduce((s, p) => s + (Number(p.score) || 0), 0) / attempts.length) : 0;
      groups[topicCode || 'Tanpa topik'] = { total, passed, notAttempted, avg };
    });

    const wrap = $('#topic-summary-body');
    const names = Object.keys(groups).sort();
    if (!names.length) { wrap.innerHTML = `<tr><td colspan="7" class="px-4 py-3 text-on-surface-variant">Belum ada data.</td></tr>`; return; }
    wrap.innerHTML = names.map(name => {
      const g = groups[name];
      const rate = g.total ? Math.round((g.passed / g.total) * 100) : 0;
      return `<tr>
        <td class="px-4 py-3 font-medium">${escapeHtml(name)}</td><td class="px-4 py-3">${g.total}</td><td class="px-4 py-3">${g.passed}</td>
        <td class="px-4 py-3">${g.total - g.passed}</td><td class="px-4 py-3">${g.avg}%</td>
        <td class="px-4 py-3">${g.notAttempted == null ? '-' : g.notAttempted}</td>
        <td class="px-4 py-3 font-bold text-primary">${rate}%</td>
      </tr>`;
    }).join('');
  }

  // Sesi yang sama bisa dipakai berkali-kali (mis. sesi bulanan pakai topik
  // yang sama), jadi analitik HARUS dipilih per sesi -- kalau digabung semua
  // sesi, tingkat-salah jadi rata-rata kabur antar batch peserta yang beda.
  function populateQuestionAnalyticsSessionSelect() {
    const sel = $('#question-analytics-session-select');
    const current = sel.value;
    const opts = sessions.map(s => {
      const topic = topics.find(t => t.code === s.topicCode);
      return `<option value="${escapeAttr(s.id)}">${escapeHtml(s.title || (topic ? topic.title : s.topicCode))}</option>`;
    });
    sel.innerHTML = opts.join('') + `<option value="ALL">Semua sesi (gabungan)</option>`;
    // default ke sesi pertama (bukan "gabungan") supaya tidak tercampur tanpa sengaja
    sel.value = [...sessions.map(s => s.id), 'ALL'].includes(current) ? current : (sessions[0] ? sessions[0].id : 'ALL');
  }

  // Direkap dari answerBreakdown tiap partisipasi (dikunci ke topik+teks soal,
  // bukan indeks, karena soal yang tampil diacak & beda2 tiap percobaan).
  // Percobaan dari sebelum fitur ini aktif tidak punya answerBreakdown, jadi
  // otomatis tidak ikut terhitung -- bukan bug, cuma belum ada datanya.
  function renderQuestionAnalytics(list, sessionId) {
    const scoped = sessionId && sessionId !== 'ALL' ? list.filter(p => p.sessionId === sessionId) : list;
    const groups = {};
    scoped.forEach(p => {
      (p.answerBreakdown || []).forEach(item => {
        const key = (p.topicCode || '-') + '::' + item.q;
        const g = groups[key] || (groups[key] = { topicCode: p.topicCode, q: item.q, served: 0, wrong: 0, correctText: '', choiceCounts: {} });
        g.served++;
        if (!item.correct) g.wrong++;
        if (item.correctText && !g.correctText) g.correctText = item.correctText;
        // Percobaan dari sebelum fitur ini diperluas cuma punya {q, correct}
        // (tanpa "chosen") -- tetap ikut kehitung di served/wrong, cuma tidak
        // nambah ke hitungan jawaban terbanyak dipilih. Jawaban BENAR juga
        // sengaja tidak dihitung di sini -- kolom ini khusus menangkap
        // miskonsepsi (jawaban salah paling sering dipilih), bukan sekadar
        // jawaban paling populer. Kalau ikut dihitung, saat pilihan salah
        // terpecah rata (mis. 2 salah beda opsi, masing2 1x) jawaban benar
        // bisa menang seri cuma karena urutan penyisipan, dan tampil
        // membingungkan di sebelah "Jawaban Benar" padahal tingkat salahnya tinggi.
        if (item.chosen && !item.correct) g.choiceCounts[item.chosen] = (g.choiceCounts[item.chosen] || 0) + 1;
      });
    });
    const rows = Object.values(groups)
      .filter(g => g.wrong > 0) // kolom ini khusus soal yg pernah salah -- yg 0 salah tidak perlu diagnosis
      .map(g => {
        let topChoice = '-', topCount = 0;
        Object.entries(g.choiceCounts).forEach(([text, count]) => { if (count > topCount) { topChoice = text; topCount = count; } });
        return { ...g, wrongRate: Math.round((g.wrong / g.served) * 100), topChoice, topChoiceCount: topCount };
      })
      .sort((a, b) => b.wrongRate - a.wrongRate || b.served - a.served);

    const wrap = $('#question-analytics-body');
    if (!rows.length) {
      const msg = Object.keys(groups).length
        ? 'Semua soal pada sesi ini selalu dijawab benar -- tidak ada yang perlu didiagnosis.'
        : 'Belum ada data untuk sesi ini. Analitik dihitung dari percobaan kuis setelah fitur ini aktif.';
      wrap.innerHTML = `<tr><td colspan="7" class="px-6 py-4 text-on-surface-variant">${msg}</td></tr>`;
      return;
    }
    wrap.innerHTML = rows.slice(0, 25).map(r => {
      // jawaban terbanyak dipilih BEDA dari jawaban benar -- sinyal kuat ada
      // miskonsepsi umum, bukan cuma soal susah biasa.
      const isMisconception = r.topChoice !== '-' && r.topChoice !== r.correctText;
      return `
      <tr>
        <td class="px-6 py-3">${escapeHtml(r.topicCode || '-')}</td>
        <td class="px-6 py-3">${escapeHtml(r.q)}</td>
        <td class="px-6 py-3">${r.served}</td>
        <td class="px-6 py-3">${r.wrong}</td>
        <td class="px-6 py-3 font-bold ${r.wrongRate >= 50 ? 'text-error' : 'text-primary'}">${r.wrongRate}%</td>
        <td class="px-6 py-3 ${isMisconception ? 'text-error font-semibold' : ''}">${escapeHtml(r.topChoice)}${r.topChoiceCount ? ` (${r.topChoiceCount}x)` : ''}</td>
        <td class="px-6 py-3 text-green-700">${escapeHtml(r.correctText || '-')}</td>
      </tr>`;
    }).join('');
  }

  function populateFilter(selId, list, keyFn, allLabel) {
    const sel = $(selId);
    const current = sel.value;
    const values = [...new Set(list.map(keyFn).filter(Boolean))].sort();
    sel.innerHTML = `<option value="">${allLabel}</option>` +
      values.map(v => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('');
    sel.value = values.includes(current) ? current : '';
  }

  function getFilteredReports() {
    const company = $('#reports-company-filter').value;
    const topic = $('#reports-topic-filter').value;
    const from = $('#reports-from').value;
    const until = $('#reports-until').value;
    let filtered = lastReports;
    if (company) filtered = filtered.filter(p => p.perusahaan === company);
    if (topic) filtered = filtered.filter(p => p.topicCode === topic);
    if (from) filtered = filtered.filter(p => p.submittedAt && new Date(p.submittedAt) >= new Date(from + 'T00:00:00'));
    if (until) filtered = filtered.filter(p => p.submittedAt && new Date(p.submittedAt) <= new Date(until + 'T23:59:59'));
    return filtered;
  }

  function applyReportFilters() {
    renderReportsTable(getFilteredReports());
  }

  function downloadCsv(rows, cols, filename) {
    const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [cols.join(',')].concat(rows.map(r => cols.map(c => csvEscape(r[c])).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportCsv() {
    const rows = getFilteredReports();
    if (!rows.length) { alert('Tidak ada data untuk diunduh.'); return; }
    const cols = ['submittedAt', 'nama', 'nik', 'perusahaan', 'topicCode', 'sessionId', 'attemptNo', 'score', 'passed', 'certificateNo', 'verificationToken'];
    downloadCsv(rows, cols, `laporan-sharing-session-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  // ============================================================
  // LAPORAN: BELUM LULUS PER SESI
  // ============================================================
  let lastMissingList = [];

  // Dipecah perusahaan -> departemen -> {total, passed}, dari scope karyawan
  // & passedNiks yang sama dengan tabel "Belum Lulus per Sesi" di bawahnya
  // (satu sumber data, satu dropdown sesi -- tidak ada logika ganda).
  function renderDeptChart(scope, passedNiks) {
    const wrap = $('#dept-chart');
    if (!scope.length) { wrap.innerHTML = `<p class="text-sm text-on-surface-variant">Tidak ada karyawan dalam cakupan sesi ini.</p>`; return; }
    const companies = {};
    scope.forEach(e => {
      const co = e.perusahaan || 'Tanpa perusahaan';
      const dept = e.departemen || 'Tanpa departemen';
      const c = companies[co] || (companies[co] = {});
      const d = c[dept] || (c[dept] = { total: 0, passed: 0 });
      d.total++;
      if (passedNiks.has(e.nik)) d.passed++;
    });
    wrap.innerHTML = Object.keys(companies).sort().map(co => {
      const depts = companies[co];
      const rows = Object.keys(depts).sort().map(dept => {
        const d = depts[dept];
        const rate = d.total ? Math.round((d.passed / d.total) * 100) : 0;
        return `
          <div class="flex items-center gap-3">
            <span class="w-32 text-xs text-on-surface-variant truncate" title="${escapeAttr(dept)}">${escapeHtml(dept)}</span>
            <div class="flex-1 bg-error/20 rounded-full h-4 overflow-hidden">
              <div class="bg-emerald-500 h-full rounded-full" style="width:${rate}%"></div>
            </div>
            <span class="w-28 text-xs text-right text-on-surface-variant">${d.passed}/${d.total} lulus</span>
          </div>`;
      }).join('');
      return `
        <div>
          <p class="text-sm font-bold text-on-surface mb-2">${escapeHtml(co)}</p>
          <div class="space-y-2">${rows}</div>
        </div>`;
    }).join('');
  }

  async function renderMissingReport() {
    const sel = $('#missing-session-select');
    if (!sessions.length) {
      sel.innerHTML = '<option value="">— belum ada sesi —</option>';
      $('#missing-report-body').innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-on-surface-variant">Belum ada sesi.</td></tr>`;
      $('#missing-count').textContent = '-';
      return;
    }
    const current = sel.value;
    sel.innerHTML = sessions.map(s => {
      const topic = topics.find(t => t.code === s.topicCode);
      return `<option value="${escapeAttr(s.id)}">${escapeHtml(s.title || (topic ? topic.title : s.topicCode))}</option>`;
    }).join('');
    sel.value = sessions.some(s => s.id === current) ? current : sessions[0].id;
    await computeMissingReport(sel.value);
  }

  async function computeMissingReport(sessionId) {
    const body = $('#missing-report-body');
    body.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-on-surface-variant">Memuat…</td></tr>`;
    try {
      const session = sessions.find(s => s.id === sessionId);
      if (!session) { body.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-on-surface-variant">Sesi tidak ditemukan.</td></tr>`; return; }
      if (!lastEmployees.length) lastEmployees = await API.listEmployees();
      if (!lastReports.length) lastReports = await API.listParticipations();

      const scope = (session.targetCompanies || []).length
        ? lastEmployees.filter(e => session.targetCompanies.includes(e.perusahaan))
        : lastEmployees;
      const forSession = lastReports.filter(p => p.sessionId === sessionId);
      const passedNiks = new Set(forSession.filter(p => p.passed).map(p => p.nik));
      // status dihitung sekali di sini & ditempel ke tiap objek karyawan --
      // dipakai ulang oleh tabel di bawah dan tombol "Salin buat WA"
      // (buildMissingWhatsAppText) supaya tidak dihitung dua kali.
      lastMissingList = scope.filter(e => !passedNiks.has(e.nik)).map(e => {
        const missing = isMissingNik(e);
        const attempts = forSession.filter(p => p.nik === e.nik).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
        const status = missing ? 'NIK belum diisi di roster' : (attempts.length ? `Sudah coba, skor terakhir ${attempts[0].score}%` : 'Belum coba');
        return { ...e, missing, status };
      });
      renderDeptChart(scope, passedNiks);

      $('#missing-count').textContent = `${lastMissingList.length} dari ${scope.length} karyawan dalam cakupan belum lulus`;
      if (!lastMissingList.length) {
        body.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-green-700 font-bold">Semua karyawan dalam cakupan sudah lulus.</td></tr>`;
        return;
      }
      body.innerHTML = lastMissingList.map(e => `<tr class="${e.missing ? 'bg-error-container/20' : ''}">
          <td class="px-6 py-3 font-medium">${e.missing
            ? escapeHtml(e.nama || '-')
            : `<button type="button" class="history-link text-primary hover:underline" data-nik="${escapeAttr(e.nik)}" data-nama="${escapeAttr(e.nama)}">${escapeHtml(e.nama || '-')}</button>`}</td>
          <td class="px-6 py-3 font-mono text-xs">${e.missing ? '<span class="text-error font-bold">Kosong</span>' : escapeHtml(e.nik)}</td>
          <td class="px-6 py-3">${escapeHtml(e.perusahaan || '-')}</td>
          <td class="px-6 py-3">${escapeHtml(e.jabatan || '-')}</td>
          <td class="px-6 py-3">${escapeHtml(e.departemen || '-')}</td>
          <td class="px-6 py-3">${escapeHtml(e.status)}</td>
        </tr>`).join('');
      $$('.history-link', body).forEach(b => b.onclick = () => openEmployeeHistory(b.dataset.nik, b.dataset.nama));
    } catch (e) {
      body.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-error">Gagal memuat. Periksa koneksi lalu coba lagi.</td></tr>`;
    }
  }

  function exportMissingCsv() {
    if (!lastMissingList.length) { alert('Tidak ada data untuk diunduh.'); return; }
    const cols = ['nama', 'nik', 'perusahaan', 'jabatan', 'departemen'];
    const sessionTitle = $('#missing-session-select option:checked').textContent.trim();
    downloadCsv(lastMissingList, cols, `belum-lulus-${sessionTitle.replace(/[^a-z0-9]+/gi, '-')}.csv`);
  }

  // Teks siap-tempel buat grup WA -- dikelompokkan per departemen, pakai
  // status yang sama persis dengan tabel di atas (dari computeMissingReport).
  function buildMissingWhatsAppText() {
    const sessionTitle = $('#missing-session-select option:checked').textContent.trim();
    const groups = {};
    lastMissingList.forEach(e => {
      const dept = e.departemen || 'Tanpa Departemen';
      (groups[dept] || (groups[dept] = [])).push(e);
    });
    const lines = [`*Belum Lulus -- ${sessionTitle}*`, $('#missing-count').textContent, ''];
    Object.keys(groups).sort().forEach(dept => {
      lines.push(`*${dept}*`);
      groups[dept].forEach((e, i) => lines.push(`${i + 1}. ${e.nama || '-'} (${e.perusahaan || '-'}) - ${e.status}`));
      lines.push('');
    });
    return lines.join('\n').trim();
  }
  async function copyMissingForWhatsApp() {
    if (!lastMissingList.length) { alert('Tidak ada data untuk disalin.'); return; }
    try {
      await navigator.clipboard.writeText(buildMissingWhatsAppText());
      alert('Teks tersalin -- siap ditempel ke grup WhatsApp.');
    } catch (e) {
      alert('Gagal menyalin (browser mungkin tidak mengizinkan). Coba lagi.');
    }
  }

  // ============================================================
  // RIWAYAT KARYAWAN (modal, dipakai dari Laporan & Karyawan)
  // ============================================================
  async function openEmployeeHistory(nik, nama) {
    $('#history-modal-name').textContent = nama || nik;
    $('#history-modal-nik').textContent = nik;
    const body = $('#history-modal-body');
    body.innerHTML = '<p class="p-6 text-on-surface-variant text-sm">Memuat…</p>';
    $('#employee-history-modal').classList.remove('hidden');
    try {
      if (!lastReports.length) lastReports = await API.listParticipations();
      const rows = lastReports.filter(p => p.nik === nik)
        .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      if (!rows.length) { body.innerHTML = '<p class="p-6 text-on-surface-variant text-sm">Belum ada riwayat percobaan.</p>'; return; }
      body.innerHTML = rows.map(p => `
        <div class="p-4">
          <div class="flex items-center justify-between gap-2">
            <span class="font-bold text-sm">${escapeHtml(p.topicCode || '-')}</span>
            ${passPill(p.passed)}
          </div>
          <p class="text-xs text-on-surface-variant mt-1">${p.submittedAt ? new Date(p.submittedAt).toLocaleString('id-ID') : '-'} · Percobaan ke-${p.attemptNo ?? '-'} · Skor ${p.score ?? '-'}%</p>
          ${p.certificateNo ? `<p class="text-xs font-mono text-primary mt-1">No. Sertifikat: ${escapeHtml(p.certificateNo)}</p>` : ''}
        </div>`).join('');
    } catch (e) {
      body.innerHTML = '<p class="p-6 text-error text-sm">Gagal memuat riwayat.</p>';
    }
  }
  function closeEmployeeHistory() { $('#employee-history-modal').classList.add('hidden'); }

  // ============================================================
  // TAB KARYAWAN
  // ============================================================
  let lastEmployees = [];
  async function renderEmployees() {
    const body = $('#employees-body');
    body.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-on-surface-variant">Memuat…</td></tr>`;
    $('#employees-scope-note').textContent = API.mode === 'mock'
      ? 'Daftar karyawan (baca saja) — dari assets/config.js (data contoh mode demo).'
      : 'Daftar karyawan (baca saja) — dari Google Sheet Master_Karyawan.';
    try {
      lastEmployees = await API.listEmployees();
      renderEmployeesTable(lastEmployees);
    } catch (e) {
      body.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-on-surface-variant">Gagal memuat daftar karyawan.</td></tr>`;
    }
  }

  const isMissingNik = (e) => !e.nik || e.nik === '-';

  function renderEmployeesTable(list) {
    const body = $('#employees-body');
    const missingCount = list.filter(isMissingNik).length;
    $('#employees-missing-nik-note').textContent = missingCount
      ? `${missingCount} karyawan belum punya NIK di roster — tidak bisa login kiosk sampai dilengkapi.` : '';
    if (!list.length) { body.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-on-surface-variant">Tidak ada karyawan yang cocok.</td></tr>`; return; }
    body.innerHTML = list.map(e => {
      const missing = isMissingNik(e);
      return `
      <tr class="${missing ? 'bg-error-container/20' : ''}">
        <td class="px-6 py-3 font-medium">${missing
          ? escapeHtml(e.nama || '-')
          : `<button type="button" class="history-link text-primary hover:underline" data-nik="${escapeAttr(e.nik)}" data-nama="${escapeAttr(e.nama)}">${escapeHtml(e.nama || '-')}</button>`}</td>
        <td class="px-6 py-3 font-mono text-xs">${missing ? '<span class="text-error font-bold">Kosong</span>' : escapeHtml(e.nik)}</td>
        <td class="px-6 py-3">${escapeHtml(e.perusahaan || '-')}</td>
        <td class="px-6 py-3">${escapeHtml(e.jabatan || '-')}</td>
        <td class="px-6 py-3">${escapeHtml(e.departemen || '-')}</td>
      </tr>`;
    }).join('');
    $$('.history-link', body).forEach(b => b.onclick = () => openEmployeeHistory(b.dataset.nik, b.dataset.nama));
  }

  function applyEmployeeSearch() {
    const q = $('#employees-search').value.trim().toLowerCase();
    if (!q) { renderEmployeesTable(lastEmployees); return; }
    renderEmployeesTable(lastEmployees.filter(e =>
      (e.nama || '').toLowerCase().includes(q) ||
      (e.nik || '').toLowerCase().includes(q) ||
      (e.perusahaan || '').toLowerCase().includes(q)));
  }

  // ---- util ----
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function escapeAttr(s) { return escapeHtml(s); }
  function emptyState(msg) { return `<div class="col-span-full text-center text-on-surface-variant py-10 border-2 border-dashed border-outline-variant rounded-2xl">${escapeHtml(msg)}</div>`; }

  // ============================================================
  // BINDING
  // ============================================================
  function bind() {
    $('#btn-admin-login').onclick = doLogin;
    $('#admin-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    $('#btn-admin-logout').onclick = doLogout;
    $$('.nav-link').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

    $('#btn-new-topic').onclick = () => openTopicEditor(null);
    $('#topic-form').addEventListener('submit', saveTopicForm);
    $('#btn-topic-cancel').onclick = () => switchTab('topics');
    $('#btn-topic-back').onclick = () => switchTab('topics');
    $('#btn-add-question').onclick = () => addQuestionBlock(null);
    $('#btn-topic-delete').onclick = deleteTopicConfirm;
    $('#btn-topic-duplicate').onclick = duplicateTopicConfirm;
    $('#t-image').addEventListener('change', handleImageFileChange);
    $('#btn-import-doc').addEventListener('mousedown', (e) => e.preventDefault());
    $('#btn-import-doc').addEventListener('click', () => $('#t-doc').click());
    $('#t-doc').addEventListener('change', handleDocFileChange);
    bindMaterialEditor();
    $('#btn-remove-image').onclick = () => setImagePreview('');
    $('#btn-download-csv-template').onclick = downloadCsvTemplate;
    $('#btn-import-csv').onclick = () => $('#csv-import-input').click();
    $('#csv-import-input').addEventListener('change', handleCsvFileChange);

    $('#btn-new-session').onclick = () => openSessionEditor(null);
    $('#session-form').addEventListener('submit', saveSessionForm);
    $('#btn-session-cancel').onclick = () => switchTab('sessions');
    $('#btn-session-back').onclick = () => switchTab('sessions');
    $('#btn-session-delete').onclick = deleteSessionConfirm;

    $('#btn-export-csv').onclick = exportCsv;
    $('#reports-company-filter').onchange = applyReportFilters;
    $('#reports-topic-filter').onchange = applyReportFilters;
    $('#reports-from').onchange = applyReportFilters;
    $('#reports-until').onchange = applyReportFilters;
    $('#missing-session-select').addEventListener('change', (e) => computeMissingReport(e.target.value));
    $('#question-analytics-session-select').addEventListener('change', (e) => renderQuestionAnalytics(lastReports, e.target.value));
    $('#btn-export-missing-csv').onclick = exportMissingCsv;
    $('#btn-copy-missing-wa').onclick = copyMissingForWhatsApp;
    $('#employees-search').addEventListener('input', applyEmployeeSearch);

    $('#btn-history-close').onclick = closeEmployeeHistory;
    $('#employee-history-modal').addEventListener('click', (e) => { if (e.target.id === 'employee-history-modal') closeEmployeeHistory(); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    $$('[data-org-name]').forEach(el => el.textContent = C.org.name);
    $$('[data-org-subtitle]').forEach(el => el.textContent = C.org.subtitle);
    bind();
    const savedToken = sessionStorage.getItem(AUTH_KEY);
    if (savedToken) { API.setAdminToken(savedToken); openDashboard(); }
  });
})();
