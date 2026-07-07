/* ============================================================
   LAPISAN DATA (API)
   Satu antarmuka, dua sumber: 'mock' dan 'sheets'.
   Ganti sumber di config.js tanpa menyentuh app.js.
   ============================================================ */
(function () {
  const C = window.CONFIG;
  let adminToken = null; // diisi admin.js setelah login; dikirim ke backend untuk aksi admin

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

  // validFrom/validUntil bisa "yyyy-MM-dd" (sesi lama, sepanjang hari) atau
  // "yyyy-MM-ddTHH:mm" (sesi baru, jam spesifik lewat <input type=datetime-local>).
  // String tanggal-polos ditambahi jam default (awal/akhir hari) supaya dua
  // format itu bisa dibandingkan dengan cara yang sama.
  function todayInRange(from, until) {
    const now = new Date();
    const f = new Date(from.length > 10 ? from : from + 'T00:00:00');
    const u = new Date(until.length > 10 ? until : until + 'T23:59:59');
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

  // "001/SS/OFN/07/26" -- dipakai mockApi (penomoran lokal per perangkat).
  // Mode sheets: nomor ini dihitung di server (lihat README) supaya
  // konsisten walau dipakai dari banyak kiosk sekaligus.
  function buildCertNo(perusahaan) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    return `${String(nextSeq(perusahaan)).padStart(3, '0')}/SS/${companyCode(perusahaan)}/${mm}/${yy}`;
  }

  // Konten kuis (topik + sesi) berasal dari config.js sebagai bawaan, tapi bisa
  // ditimpa lewat Panel Admin (admin.html). Mode mock: perubahan tersimpan di
  // localStorage perangkat ini saja. Mode sheets: tersimpan di Google Sheet.
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
    // Mode mock tidak punya server buat nyimpen rahasia -- password memang
    // ada di config.js publik, dan itu ok karena mock cuma buat demo lokal.
    // Token = password itu sendiri, tidak masalah (tidak pernah keluar dari
    // perangkat ini). Bandingkan dgn sheetsApi.adminLogin di bawah, yang
    // beneran menyembunyikan password lewat pengecekan sisi server.
    async adminLogin(password) {
      return { ok: password === C.admin.password, token: password };
    },
    async findEmployee(nik) {
      const key = (nik || '').trim().toLowerCase();
      return window.SAMPLE.employees.find(e => e.nik.toLowerCase() === key) || null;
    },
    async activeSessions(employee) {
      const [sessions, topics] = await Promise.all([this.listSessions(), this.listTopics()]);
      return buildActiveSessions(employee, sessions, topics);
    },
    async findExisting(nik, sessionId) {
      const list = JSON.parse(store.get('participations') || '[]');
      const hits = list.filter(p => p.nik === nik && p.sessionId === sessionId && p.passed);
      return hits.length ? hits[hits.length - 1] : null;
    },
    async listHistory(nik) {
      const key = (nik || '').trim();
      const list = JSON.parse(store.get('participations') || '[]');
      return list.filter(p => p.nik === key && p.passed)
        .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    },
    async saveParticipation(rec) {
      const certificateNo = rec.passed ? buildCertNo(rec.perusahaan) : null;
      const full = { ...rec, certificateNo };
      const list = JSON.parse(store.get('participations') || '[]');
      list.push(full);
      store.set('participations', JSON.stringify(list));
      return { certificateNo };
    },
    async findByToken(token) {
      const list = JSON.parse(store.get('participations') || '[]');
      return list.find(p => p.verificationToken === token) || null;
    },
    async listParticipations() {
      // answerBreakdown disimpan sebagai string JSON (sama seperti kolom Sheet
      // di mode sheets) -- parse balik di sini supaya bentuknya konsisten
      // dgn sheetsApi.listParticipations (selalu array), bukan tanggung jawab
      // tiap pemanggil buat nebak-nebak bentuknya.
      return JSON.parse(store.get('participations') || '[]').slice().reverse().map(p => ({
        ...p,
        answerBreakdown: typeof p.answerBreakdown === 'string' ? JSON.parse(p.answerBreakdown || '[]') : (p.answerBreakdown || []),
      }));
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
    async uploadImage() {
      throw new Error('Upload gambar hanya tersedia di mode sheets.');
    },
  };

  // ------------- BACKEND (api/data.js) -------------
  // Endpoint tunggal: GET ?action=... untuk baca, POST untuk simpan.
  // Detail kontrak ada di README.
  const sheetsApi = {
    async adminLogin(password) {
      // password ASLI cuma pernah dicek di server (ADMIN_TOKEN, env var
      // Vercel) -- balasannya adalah token sesi yang kedaluwarsa sendiri,
      // bukan password itu lagi. Lihat komentar signSession di api/data.js.
      const data = await this._post('admin_login', { password });
      return { ok: !!(data && data.ok), token: (data && data.token) || null };
    },
    async _get(params) {
      const url = C.apiUrl + '?' + new URLSearchParams(params).toString();
      const res = await fetch(url);
      if (!res.ok) throw new Error('Gagal menghubungi server data');
      return res.json();
    },
    async _post(action, payload) {
      const res = await fetch(C.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // hindari preflight CORS
        body: JSON.stringify({ action, payload, adminToken }),
      });
      const data = await res.json().catch(() => null);
      // Teruskan pesan error asli dari server (mis. kuota Drive habis, sesi
      // admin kedaluwarsa) -- dulu dibuang diganti teks generik sehingga
      // penyebab sebenarnya tidak pernah terlihat di UI.
      if (!res.ok || (data && data.ok === false)) throw new Error((data && data.error) || 'Gagal menyimpan ke server data');
      return data;
    },
    async findEmployee(nik) {
      const data = await this._get({ action: 'employee', nik: (nik || '').trim() });
      return data && data.nik ? data : null;
    },
    async activeSessions(employee) {
      const [sessions, topics] = await Promise.all([this.listSessions(), this.listTopics()]);
      return buildActiveSessions(employee, sessions, topics);
    },
    async findExisting(nik, sessionId) {
      const data = await this._get({ action: 'existing', nik: (nik || '').trim(), sessionId });
      return data && data.certificateNo ? data : null;
    },
    async listHistory(nik) {
      const data = await this._get({ action: 'history', nik: (nik || '').trim() });
      return Array.isArray(data) ? data : [];
    },
    async saveParticipation(rec) {
      const data = await this._post('participation', rec);
      return { certificateNo: (data && data.certificateNo) || null };
    },
    async findByToken(token) {
      const data = await this._get({ action: 'verify', token });
      return data && data.verificationToken ? data : null;
    },
    async listParticipations() {
      const data = await this._get({ action: 'participations', adminToken: adminToken || '' });
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
    async saveTopic(topic) {
      const data = await this._post('topic_save', topic);
      if (!data || !data.ok) throw new Error('Gagal menyimpan topik');
      return topic;
    },
    async deleteTopic(code) {
      const data = await this._post('topic_delete', { code });
      if (!data || !data.ok) throw new Error('Gagal menghapus topik');
      return true;
    },

    async listSessions() {
      const data = await this._get({ action: 'sessions' });
      return Array.isArray(data) && data.length ? data : window.SAMPLE.sessions;
    },
    async saveSession(session) {
      const data = await this._post('session_save', session);
      if (!data || !data.ok) throw new Error('Gagal menyimpan sesi');
      return session;
    },
    async deleteSession(id) {
      const data = await this._post('session_delete', { id });
      if (!data || !data.ok) throw new Error('Gagal menghapus sesi');
      return true;
    },
    async uploadImage(base64, filename, mimeType) {
      const data = await this._post('upload_image', { base64, filename, mimeType });
      if (!data || !data.ok) throw new Error('Gagal mengunggah gambar');
      return data.url;
    },
  };

  const impl = C.dataSource === 'sheets' ? sheetsApi : mockApi;

  window.API = {
    mode: C.dataSource,
    adminLogin: (password) => impl.adminLogin(password),
    findEmployee: (nik) => impl.findEmployee(nik),
    activeSessions: (emp) => impl.activeSessions(emp),
    findExisting: (nik, sessionId) => impl.findExisting(nik, sessionId),
    listHistory: (nik) => impl.listHistory(nik),
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
    uploadImage: (base64, filename, mimeType) => impl.uploadImage(base64, filename, mimeType),
  };
})();

// Ikon garis bertema K3, dipilih dari kata kunci di kode/judul topik --
// topik dibuat bebas lewat admin, jadi dicocokkan dari kata kunci umum
// (bukan per-kode tetap) supaya topik baru tetap dapat ikon yang masuk akal.
window.topicIconSvg = function (topic) {
  const text = (((topic && topic.code) || '') + ' ' + ((topic && topic.title) || '')).toLowerCase();
  const PATHS = {
    helm: '<path d="M4 13a8 8 0 0 1 16 0v1H4v-1Z"/><path d="M2.5 14h19"/><path d="M9.5 4.5C9.5 3.1 10.6 2 12 2s2.5 1.1 2.5 2.5"/>',
    moon: '<path d="M15.5 3a7.5 7.5 0 1 0 5.8 12.2A8 8 0 0 1 15.5 3Z"/><path d="M17.5 15.5h2.5M18.75 14.25v2.5"/>',
    flame: '<path d="M12 2c1.2 3-2.8 4.2-2.8 8.2a2.8 2.8 0 0 0 5.6 0c0-.9-.4-1.7-.9-1.9 1 2.8-1.3 4.7-1.9 4.7-2 0-3.9-1.9-3.9-4.7 0-3.3 2.9-4.3 3.9-6.3Z"/>',
    bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>',
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/>',
  };
  let key = 'shield';
  if (/helm|apd|pelindung/.test(text)) key = 'helm';
  else if (/lelah|fatigue|shift|kantuk|tidur/.test(text)) key = 'moon';
  else if (/api|kebakaran|fire|padam/.test(text)) key = 'flame';
  else if (/listrik|electric|kabel|setrum/.test(text)) key = 'bolt';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">' + PATHS[key] + '</svg>';
};
