/* ============================================================
   PANEL ADMIN — kelola topik, sesi, dan laporan partisipasi.
   Login sisi-browser saja (lihat catatan keamanan di README).
   ============================================================ */
(function () {
  const C = window.CONFIG;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const AUTH_KEY = 'admin_auth';

  let topics = [];
  let sessions = [];
  let editingTopicCode = null;   // null = topik baru
  let editingSessionId = null;   // null = sesi baru
  let qCount = 0;                // penomor blok soal di editor

  function show(id) {
    $$('.screen').forEach(s => s.classList.remove('is-active'));
    document.getElementById(id).classList.add('is-active');
    window.scrollTo(0, 0);
  }

  // ============================================================
  // LOGIN
  // ============================================================
  function doLogin() {
    const val = $('#admin-password').value;
    const err = $('#admin-login-error');
    if (val !== C.admin.password) { err.textContent = 'Password salah.'; return; }
    err.textContent = '';
    sessionStorage.setItem(AUTH_KEY, '1');
    $('#admin-password').value = '';
    openDashboard();
  }
  function doLogout() {
    sessionStorage.removeItem(AUTH_KEY);
    show('admin-screen-login');
  }

  // ============================================================
  // DASHBOARD + TABS
  // ============================================================
  async function openDashboard() {
    show('admin-screen-dashboard');
    $('#reports-scope-note').textContent = API.mode === 'mock'
      ? 'Rekap partisipasi — mode demo, hanya tersimpan di browser ini.'
      : 'Rekap partisipasi dari Google Sheet.';
    await reloadData();
    renderTopicsList();
    renderSessionsList();
  }

  async function reloadData() {
    [topics, sessions] = await Promise.all([API.listTopics(), API.listSessions()]);
  }

  function switchTab(tab) {
    $$('.admin-tab').forEach(b => b.classList.toggle('is-active', b.dataset.tab === tab));
    $$('.admin-panel').forEach(p => { p.hidden = true; });
    $('#panel-' + tab).hidden = false;
    if (tab === 'reports') renderReports();
  }

  // ============================================================
  // TAB TOPIK
  // ============================================================
  function renderTopicsList() {
    const wrap = $('#topics-list');
    if (!topics.length) { wrap.innerHTML = '<div class="empty">Belum ada topik. Klik "+ Topik Baru".</div>'; return; }
    wrap.innerHTML = '';
    topics.forEach(t => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'admin-row';
      row.innerHTML = `
        <span class="admin-row__main">
          <span class="admin-row__title">${escapeHtml(t.title)}</span>
          <span class="admin-row__meta">${escapeHtml(t.code)} · ${(t.questions || []).length} soal · lulus ≥ ${t.passThreshold || C.passThresholdDefault}%</span>
        </span>
        <span class="admin-row__go">Edit →</span>`;
      row.onclick = () => openTopicEditor(t);
      wrap.appendChild(row);
    });
  }

  function openTopicEditor(topic) {
    editingTopicCode = topic ? topic.code : null;
    $('#topic-editor-title').textContent = topic ? 'Edit Topik' : 'Topik Baru';
    $('#t-code').value = topic ? topic.code : '';
    $('#t-code').disabled = !!topic; // kode = kunci, tidak diubah setelah dibuat
    $('#t-title').value = topic ? topic.title : '';
    $('#t-threshold').value = topic ? (topic.passThreshold || C.passThresholdDefault) : C.passThresholdDefault;
    $('#t-material').value = topic ? topic.material : '';
    $('#btn-topic-delete').hidden = !topic;
    $('#questions-editor').innerHTML = '';
    qCount = 0;
    (topic ? topic.questions : [{ q: '', options: ['', '', '', ''], correct: 0 }]).forEach(addQuestionBlock);
    show('admin-screen-topic-editor');
  }

  function addQuestionBlock(question) {
    const idx = qCount++;
    const q = question || { q: '', options: ['', '', '', ''], correct: 0 };
    const wrap = document.createElement('fieldset');
    wrap.className = 'question-block';
    wrap.dataset.idx = idx;
    wrap.innerHTML = `
      <label class="field-label">Pertanyaan</label>
      <input class="admin-input q-text" value="${escapeAttr(q.q)}" required />
      <div class="q-options">
        ${[0, 1, 2, 3].map(i => `
          <label class="q-option-row">
            <input type="radio" name="correct-${idx}" value="${i}" ${q.correct === i ? 'checked' : ''} />
            <input class="admin-input q-option-text" placeholder="Opsi ${String.fromCharCode(65 + i)}" value="${escapeAttr(q.options[i] || '')}" required />
          </label>`).join('')}
      </div>
      <button type="button" class="btn btn--ghost admin-btn-sm admin-danger btn-remove-question">Hapus Soal</button>`;
    wrap.querySelector('.btn-remove-question').onclick = () => wrap.remove();
    $('#questions-editor').appendChild(wrap);
  }

  function collectQuestions() {
    return $$('.question-block', $('#questions-editor')).map(block => {
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
      questions,
    };
    if (!topic.code) { alert('Kode topik wajib diisi.'); return; }
    await API.saveTopic(topic);
    await reloadData();
    renderTopicsList();
    switchTab('topics');
    show('admin-screen-dashboard');
  }

  async function deleteTopicConfirm() {
    if (!editingTopicCode) return;
    if (!confirm(`Hapus topik "${editingTopicCode}"? Sesi yang memakainya jadi tidak tampil di kiosk.`)) return;
    await API.deleteTopic(editingTopicCode);
    await reloadData();
    renderTopicsList();
    switchTab('topics');
    show('admin-screen-dashboard');
  }

  // ============================================================
  // TAB SESI
  // ============================================================
  function renderSessionsList() {
    const wrap = $('#sessions-list');
    if (!sessions.length) { wrap.innerHTML = '<div class="empty">Belum ada sesi. Klik "+ Sesi Baru".</div>'; return; }
    wrap.innerHTML = '';
    sessions.forEach(s => {
      const topic = topics.find(t => t.code === s.topicCode);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'admin-row';
      row.innerHTML = `
        <span class="admin-row__main">
          <span class="admin-row__title">${escapeHtml(s.title || (topic ? topic.title : s.topicCode))}</span>
          <span class="admin-row__meta">${escapeHtml(s.topicCode)} · ${s.validFrom} – ${s.validUntil} ·
            <span class="status-pill status-pill--${s.status}">${s.status}</span></span>
        </span>
        <span class="admin-row__go">Edit →</span>`;
      row.onclick = () => openSessionEditor(s);
      wrap.appendChild(row);
    });
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
    show('admin-screen-session-editor');
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
    show('admin-screen-dashboard');
  }

  async function deleteSessionConfirm() {
    if (!editingSessionId) return;
    if (!confirm('Hapus sesi ini?')) return;
    await API.deleteSession(editingSessionId);
    await reloadData();
    renderSessionsList();
    switchTab('sessions');
    show('admin-screen-dashboard');
  }

  // ============================================================
  // TAB LAPORAN
  // ============================================================
  let lastReports = [];
  async function renderReports() {
    const body = $('#reports-body');
    body.innerHTML = '<tr><td colspan="8" class="muted">Memuat…</td></tr>';
    try {
      lastReports = await API.listParticipations();
      if (!lastReports.length) { body.innerHTML = '<tr><td colspan="8" class="muted">Belum ada partisipasi tercatat.</td></tr>'; return; }
      body.innerHTML = lastReports.map(p => `
        <tr>
          <td>${p.submittedAt ? new Date(p.submittedAt).toLocaleString('id-ID') : '-'}</td>
          <td>${escapeHtml(p.nama || '-')}</td>
          <td class="mono">${escapeHtml(p.nik || '-')}</td>
          <td>${escapeHtml(p.perusahaan || '-')}</td>
          <td>${escapeHtml(p.topicCode || '-')}</td>
          <td>${p.score ?? '-'}%</td>
          <td><span class="status-pill status-pill--${p.passed ? 'published' : 'draft'}">${p.passed ? 'Lulus' : 'Belum lulus'}</span></td>
          <td class="mono">${escapeHtml(p.certificateNo || '-')}</td>
        </tr>`).join('');
    } catch (e) {
      body.innerHTML = '<tr><td colspan="8" class="muted">Gagal memuat laporan.</td></tr>';
    }
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

  // ---- util ----
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function escapeAttr(s) { return escapeHtml(s); }

  // ============================================================
  // BINDING
  // ============================================================
  function bind() {
    $('#btn-admin-login').onclick = doLogin;
    $('#admin-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    $('#btn-admin-logout').onclick = doLogout;
    $$('.admin-tab').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

    $('#btn-new-topic').onclick = () => openTopicEditor(null);
    $('#topic-form').addEventListener('submit', saveTopicForm);
    $('#btn-topic-cancel').onclick = () => show('admin-screen-dashboard');
    $('#btn-add-question').onclick = () => addQuestionBlock(null);
    $('#btn-topic-delete').onclick = deleteTopicConfirm;

    $('#btn-new-session').onclick = () => openSessionEditor(null);
    $('#session-form').addEventListener('submit', saveSessionForm);
    $('#btn-session-cancel').onclick = () => show('admin-screen-dashboard');
    $('#btn-session-delete').onclick = deleteSessionConfirm;

    $('#btn-export-csv').onclick = exportCsv;
  }

  document.addEventListener('DOMContentLoaded', () => {
    $$('[data-org-name]').forEach(el => el.textContent = C.org.name);
    $$('[data-org-short]').forEach(el => el.textContent = C.org.short);
    bind();
    if (sessionStorage.getItem(AUTH_KEY) === '1') openDashboard();
    else show('admin-screen-login');
  });
})();
