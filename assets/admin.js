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

  function todayInRange(from, until) {
    const now = new Date();
    return now >= new Date(from + 'T00:00:00') && now <= new Date(until + 'T23:59:59');
  }

  // ============================================================
  // LOGIN
  // ============================================================
  function doLogin() {
    const val = $('#admin-password').value;
    const err = $('#admin-login-error');
    if (val !== C.admin.password) { err.textContent = 'Password salah.'; return; }
    err.textContent = '';
    sessionStorage.setItem(AUTH_KEY, val); // dipakai lagi sbg adminToken kalau tab di-refresh
    API.setAdminToken(val); // dikirim ke Apps Script untuk aksi admin (lihat README)
    $('#admin-password').value = '';
    openDashboard();
  }
  function doLogout() {
    sessionStorage.removeItem(AUTH_KEY);
    API.setAdminToken(null);
    $('#admin-shell').classList.add('hidden');
    $('#admin-login-view').classList.remove('hidden');
  }

  // ============================================================
  // SHELL + NAV
  // ============================================================
  async function openDashboard() {
    $('#admin-login-view').classList.add('hidden');
    $('#admin-shell').classList.remove('hidden');
    $('#reports-scope-note').textContent = API.mode === 'mock'
      ? 'Rekap partisipasi — mode demo, hanya tersimpan di browser ini.'
      : 'Rekap partisipasi dari Google Sheet.';
    await reloadData();
    renderTopicsList();
    renderSessionsList();
    switchTab('dashboard');
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
      const [employees, participations] = await Promise.all([API.listEmployees(), API.listParticipations()]);
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
    } catch (e) {
      grid.innerHTML = '<p class="text-error col-span-full">Gagal memuat ringkasan.</p>';
    }
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
          <div>
            <p class="font-bold text-primary">${escapeHtml(t.title)}</p>
            <p class="text-xs text-on-surface-variant mt-1">${escapeHtml(t.code)} · ${(t.questions || []).length} soal · lulus ≥ ${t.passThreshold || C.passThresholdDefault}%</p>
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
    $('#t-material').value = topic ? topic.material : '';
    setImagePreview(topic ? topic.materialImage : '');
    $('#csv-import-status').textContent = '';
    $('#btn-topic-delete').hidden = !topic;
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
            <input type="radio" name="correct-${idx}" value="${i}" ${q.correct === i ? 'checked' : ''} class="w-4 h-4 accent-[#00468c]" />
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
    const topic = {
      code: editingTopicCode || $('#t-code').value.trim(),
      title: $('#t-title').value.trim(),
      passThreshold: Number($('#t-threshold').value) || C.passThresholdDefault,
      material: $('#t-material').value,
      materialImage: currentImageUrl,
      questions,
    };
    if (!topic.code) { alert('Kode topik wajib diisi.'); return; }
    await API.saveTopic(topic);
    await reloadData();
    renderTopicsList();
    switchTab('topics');
  }

  async function deleteTopicConfirm() {
    if (!editingTopicCode) return;
    if (!confirm(`Hapus topik "${editingTopicCode}"? Sesi yang memakainya jadi tidak tampil di kiosk.`)) return;
    await API.deleteTopic(editingTopicCode);
    await reloadData();
    renderTopicsList();
    switchTab('topics');
  }

  // ============================================================
  // GAMBAR MATERI (upload ke Drive lewat Apps Script)
  // ============================================================
  function setImagePreview(url) {
    currentImageUrl = url || '';
    const wrap = $('#t-image-preview-wrap');
    if (currentImageUrl) { $('#t-image-preview').src = currentImageUrl; wrap.classList.remove('hidden'); }
    else { wrap.classList.add('hidden'); }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleImageFileChange(ev) {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    const status = $('#t-image-status');
    if (API.mode !== 'apps_script') {
      status.textContent = 'Upload gambar hanya tersedia di mode apps_script.';
      status.className = 'text-xs text-error mt-1';
      return;
    }
    status.textContent = 'Mengunggah…';
    status.className = 'text-xs text-on-surface-variant mt-1';
    try {
      const base64 = await fileToBase64(file);
      const url = await API.uploadImage(base64, file.name, file.type);
      if (!url) throw new Error('no url');
      setImagePreview(url);
      status.textContent = 'Gambar berhasil diunggah.';
      status.className = 'text-xs text-green-700 mt-1';
    } catch (e) {
      status.textContent = 'Gagal mengunggah gambar. Coba lagi.';
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
              <p class="text-xs text-on-surface-variant mt-1">${escapeHtml(s.topicCode)} · ${s.validFrom} – ${s.validUntil}</p>
              <div class="mt-2">${statusPill(s.status)}</div>
            </div>
            <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
          </div>
        </button>`;
    }).join('');
    $$('.session-card', wrap).forEach(el => el.onclick = () => openSessionEditor(sessions[Number(el.dataset.i)]));
  }

  function openSessionEditor(session) {
    editingSessionId = session ? session.id : null;
    $('#session-editor-title').textContent = session ? 'Edit Sesi' : 'Sesi Baru';
    const sel = $('#s-topic');
    sel.innerHTML = topics.map(t => `<option value="${escapeAttr(t.code)}">${escapeHtml(t.title)} (${escapeHtml(t.code)})</option>`).join('');
    if (!topics.length) sel.innerHTML = '<option value="">— buat topik dulu —</option>';
    sel.value = session ? session.topicCode : (topics[0] ? topics[0].code : '');
    $('#s-title').value = session ? (session.title || '') : '';
    $('#s-from').value = session ? session.validFrom : new Date().toISOString().slice(0, 10);
    $('#s-until').value = session ? session.validUntil : '';
    $('#s-companies').value = session ? (session.targetCompanies || []).join(', ') : '';
    $('#s-status').value = session ? session.status : 'draft';
    $('#btn-session-delete').hidden = !session;
    showPanel('panel-session-editor');
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
      targetCompanies: $('#s-companies').value.split(',').map(s => s.trim()).filter(Boolean),
      status: $('#s-status').value,
    };
    await API.saveSession(session);
    await reloadData();
    renderSessionsList();
    switchTab('sessions');
  }

  async function deleteSessionConfirm() {
    if (!editingSessionId) return;
    if (!confirm('Hapus sesi ini?')) return;
    await API.deleteSession(editingSessionId);
    await reloadData();
    renderSessionsList();
    switchTab('sessions');
  }

  // ============================================================
  // TAB LAPORAN
  // ============================================================
  let lastReports = [];
  async function renderReports() {
    const body = $('#reports-body');
    body.innerHTML = `<tr><td colspan="8" class="px-6 py-4 text-on-surface-variant">Memuat…</td></tr>`;
    try {
      lastReports = await API.listParticipations();
      renderCompanySummary(lastReports);
      populateCompanyFilter(lastReports);
      renderReportsTable(lastReports);
    } catch (e) {
      body.innerHTML = `<tr><td colspan="8" class="px-6 py-4 text-on-surface-variant">Gagal memuat laporan.</td></tr>`;
      $('#company-summary-body').innerHTML = '';
    }
  }

  function renderReportsTable(list) {
    const body = $('#reports-body');
    if (!list.length) { body.innerHTML = `<tr><td colspan="8" class="px-6 py-4 text-on-surface-variant">Belum ada partisipasi tercatat.</td></tr>`; return; }
    body.innerHTML = list.map(p => `
      <tr>
        <td class="px-6 py-3">${p.submittedAt ? new Date(p.submittedAt).toLocaleString('id-ID') : '-'}</td>
        <td class="px-6 py-3 font-medium">${escapeHtml(p.nama || '-')}</td>
        <td class="px-6 py-3 font-mono text-xs">${escapeHtml(p.nik || '-')}</td>
        <td class="px-6 py-3">${escapeHtml(p.perusahaan || '-')}</td>
        <td class="px-6 py-3">${escapeHtml(p.topicCode || '-')}</td>
        <td class="px-6 py-3">${p.score ?? '-'}%</td>
        <td class="px-6 py-3">${passPill(p.passed)}</td>
        <td class="px-6 py-3 font-mono text-xs">${escapeHtml(p.certificateNo || '-')}</td>
      </tr>`).join('');
  }

  function renderCompanySummary(list) {
    const wrap = $('#company-summary-body');
    if (!list.length) { wrap.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-on-surface-variant">Belum ada data.</td></tr>`; return; }
    const byCompany = {};
    list.forEach(p => {
      const key = p.perusahaan || 'Tanpa perusahaan';
      const g = byCompany[key] || (byCompany[key] = { total: 0, passed: 0, scoreSum: 0 });
      g.total++;
      g.scoreSum += Number(p.score) || 0;
      if (p.passed) g.passed++;
    });
    wrap.innerHTML = Object.keys(byCompany).sort().map(name => {
      const g = byCompany[name];
      const avg = Math.round(g.scoreSum / g.total);
      const rate = Math.round((g.passed / g.total) * 100);
      return `<tr>
        <td class="px-6 py-3 font-medium">${escapeHtml(name)}</td><td class="px-6 py-3">${g.total}</td><td class="px-6 py-3">${g.passed}</td>
        <td class="px-6 py-3">${g.total - g.passed}</td><td class="px-6 py-3">${avg}%</td><td class="px-6 py-3 font-bold text-primary">${rate}%</td>
      </tr>`;
    }).join('');
  }

  function populateCompanyFilter(list) {
    const sel = $('#reports-company-filter');
    const current = sel.value;
    const companies = [...new Set(list.map(p => p.perusahaan).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">Semua perusahaan</option>' +
      companies.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
    sel.value = companies.includes(current) ? current : '';
  }

  function applyCompanyFilter() {
    const val = $('#reports-company-filter').value;
    renderReportsTable(val ? lastReports.filter(p => p.perusahaan === val) : lastReports);
  }

  function exportCsv() {
    if (!lastReports.length) { alert('Tidak ada data untuk diunduh.'); return; }
    const cols = ['submittedAt', 'nama', 'nik', 'perusahaan', 'topicCode', 'sessionId', 'attemptNo', 'score', 'passed', 'certificateNo', 'verificationToken'];
    const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [cols.join(',')].concat(lastReports.map(p => cols.map(c => csvEscape(p[c])).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `laporan-safety-talk-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

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

  function renderEmployeesTable(list) {
    const body = $('#employees-body');
    if (!list.length) { body.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-on-surface-variant">Tidak ada karyawan yang cocok.</td></tr>`; return; }
    body.innerHTML = list.map(e => `
      <tr>
        <td class="px-6 py-3 font-medium">${escapeHtml(e.nama || '-')}</td>
        <td class="px-6 py-3 font-mono text-xs">${escapeHtml(e.nik || '-')}</td>
        <td class="px-6 py-3">${escapeHtml(e.perusahaan || '-')}</td>
        <td class="px-6 py-3">${escapeHtml(e.jabatan || '-')}</td>
        <td class="px-6 py-3">${escapeHtml(e.departemen || '-')}</td>
      </tr>`).join('');
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
    $('#t-image').addEventListener('change', handleImageFileChange);
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
    $('#reports-company-filter').onchange = applyCompanyFilter;
    $('#employees-search').addEventListener('input', applyEmployeeSearch);
  }

  document.addEventListener('DOMContentLoaded', () => {
    $$('[data-org-name]').forEach(el => el.textContent = C.org.name);
    $$('[data-org-subtitle]').forEach(el => el.textContent = C.org.subtitle);
    bind();
    const savedToken = sessionStorage.getItem(AUTH_KEY);
    if (savedToken) { API.setAdminToken(savedToken); openDashboard(); }
  });
})();
