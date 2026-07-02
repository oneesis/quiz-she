/* ============================================================
   LAPISAN DATA (API)
   Satu antarmuka, dua sumber: 'mock' dan 'apps_script'.
   Ganti sumber di config.js tanpa menyentuh app.js.
   ============================================================ */
(function () {
  const C = window.CONFIG;
  let adminToken = null; // diisi admin.js setelah login; dikirim ke Apps Script untuk aksi admin

  // ---- penyimpanan aman (localStorage bila tersedia, jika tidak in-memory) ----
  const mem = {};
  const store = {
    get(k) {
      try { return localStorage.getItem(k); } catch (e) { return mem[k] ?? null; }
    },
    set(k, v) {
      try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; }
    },
  };

  function todayInRange(from, until) {
    const now = new Date();
    const f = new Date(from + 'T00:00:00');
    const u = new Date(until + 'T23:59:59');
    return now >= f && now <= u;
  }

  function companyCode(perusahaan) {
    // "PT OFN" -> "OFN", "PT SCI" -> "SCI"
    return (perusahaan || '').replace(/^PT\s+/i, '').trim().split(/\s+/)[0].toUpperCase() || 'NA';
  }

  function nextSeq(perusahaan) {
    const key = 'seq_' + companyCode(perusahaan) + '_' + new Date().toISOString().slice(0, 7);
    const n = (parseInt(store.get(key) || '0', 10) || 0) + 1;
    store.set(key, String(n));
    return n;
  }

  // Konten kuis (topik + sesi) berasal dari config.js sebagai bawaan, tapi bisa
  // ditimpa lewat Panel Admin (admin.html). Mode mock: perubahan tersimpan di
  // localStorage perangkat ini saja. Mode apps_script: tersimpan di Google Sheet.
  function readOverride(key, fallback) {
    const raw = store.get(key);
    if (raw === null) return fallback.slice();
    try { const list = JSON.parse(raw); return Array.isArray(list) ? list : fallback.slice(); }
    catch (e) { return fallback.slice(); }
  }
  function writeOverride(key, list) { store.set(key, JSON.stringify(list)); }

  function buildActiveSessions(employee, sessions, topics) {
    return sessions
      .filter(s => s.status === 'published' && todayInRange(s.validFrom, s.validUntil))
      .filter(s => !(s.targetCompanies || []).length || s.targetCompanies.includes(employee.perusahaan))
      .map(s => ({ ...s, topic: topics.find(t => t.code === s.topicCode) }))
      .filter(s => s.topic);
  }

  // ---------------- MOCK ----------------
  const mockApi = {
    async findEmployee(nik) {
      const key = (nik || '').trim().toLowerCase();
      return window.SAMPLE.employees.find(e => e.nik.toLowerCase() === key) || null;
    },
    async activeSessions(employee) {
      const [sessions, topics] = await Promise.all([this.listSessions(), this.listTopics()]);
      return buildActiveSessions(employee, sessions, topics);
    },
    async saveParticipation(rec) {
      const list = JSON.parse(store.get('participations') || '[]');
      list.push(rec);
      store.set('participations', JSON.stringify(list));
      return true;
    },
    async findByToken(token) {
      const list = JSON.parse(store.get('participations') || '[]');
      return list.find(p => p.verificationToken === token) || null;
    },
    async listParticipations() {
      return JSON.parse(store.get('participations') || '[]').slice().reverse();
    },
    async listEmployees() { return window.SAMPLE.employees; },

    async listTopics() { return readOverride('admin_topics', window.SAMPLE.topics); },
    async saveTopic(topic) {
      const list = readOverride('admin_topics', window.SAMPLE.topics);
      const i = list.findIndex(t => t.code === topic.code);
      if (i >= 0) list[i] = topic; else list.push(topic);
      writeOverride('admin_topics', list);
      return topic;
    },
    async deleteTopic(code) {
      writeOverride('admin_topics', readOverride('admin_topics', window.SAMPLE.topics).filter(t => t.code !== code));
      return true;
    },

    async listSessions() { return readOverride('admin_sessions', window.SAMPLE.sessions); },
    async saveSession(session) {
      const list = readOverride('admin_sessions', window.SAMPLE.sessions);
      const i = list.findIndex(s => s.id === session.id);
      if (i >= 0) list[i] = session; else list.push(session);
      writeOverride('admin_sessions', list);
      return session;
    },
    async deleteSession(id) {
      writeOverride('admin_sessions', readOverride('admin_sessions', window.SAMPLE.sessions).filter(s => s.id !== id));
      return true;
    },
  };

  // ------------- APPS SCRIPT -------------
  // Endpoint tunggal: GET ?action=... untuk baca, POST untuk simpan.
  // Detail kontrak ada di README.
  const scriptApi = {
    async _get(params) {
      const url = C.appsScriptUrl + '?' + new URLSearchParams(params).toString();
      const res = await fetch(url);
      if (!res.ok) throw new Error('Gagal menghubungi server data');
      return res.json();
    },
    async _post(action, payload) {
      const res = await fetch(C.appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // hindari preflight CORS
        body: JSON.stringify({ action, payload, adminToken }),
      });
      if (!res.ok) throw new Error('Gagal menyimpan ke server data');
      return res.json();
    },
    async findEmployee(nik) {
      const data = await this._get({ action: 'employee', nik: (nik || '').trim() });
      return data && data.nik ? data : null;
    },
    async activeSessions(employee) {
      const [sessions, topics] = await Promise.all([this.listSessions(), this.listTopics()]);
      return buildActiveSessions(employee, sessions, topics);
    },
    async saveParticipation(rec) {
      const data = await this._post('participation', rec);
      return !!(data && data.ok);
    },
    async findByToken(token) {
      const data = await this._get({ action: 'verify', token });
      return data && data.verificationToken ? data : null;
    },
    async listParticipations() {
      const data = await this._get({ action: 'participations' });
      return Array.isArray(data) ? data : [];
    },
    async listEmployees() {
      const data = await this._get({ action: 'employees', adminToken: adminToken || '' });
      return Array.isArray(data) ? data : [];
    },

    async listTopics() {
      const data = await this._get({ action: 'topics' });
      return Array.isArray(data) && data.length ? data : window.SAMPLE.topics;
    },
    async saveTopic(topic) { await this._post('topic_save', topic); return topic; },
    async deleteTopic(code) { await this._post('topic_delete', { code }); return true; },

    async listSessions() {
      const data = await this._get({ action: 'sessions' });
      return Array.isArray(data) && data.length ? data : window.SAMPLE.sessions;
    },
    async saveSession(session) { await this._post('session_save', session); return session; },
    async deleteSession(id) { await this._post('session_delete', { id }); return true; },
  };

  const impl = C.dataSource === 'apps_script' ? scriptApi : mockApi;

  window.API = {
    mode: C.dataSource,
    findEmployee: (nik) => impl.findEmployee(nik),
    activeSessions: (emp) => impl.activeSessions(emp),
    saveParticipation: (rec) => impl.saveParticipation(rec),
    findByToken: (t) => impl.findByToken(t),
    listParticipations: () => impl.listParticipations(),
    listEmployees: () => impl.listEmployees(),
    setAdminToken: (t) => { adminToken = t; },
    listTopics: () => impl.listTopics(),
    saveTopic: (t) => impl.saveTopic(t),
    deleteTopic: (code) => impl.deleteTopic(code),
    listSessions: () => impl.listSessions(),
    saveSession: (s) => impl.saveSession(s),
    deleteSession: (id) => impl.deleteSession(id),
    companyCode,
    nextSeq,
  };
})();
