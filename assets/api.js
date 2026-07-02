/* ============================================================
   LAPISAN DATA (API)
   Satu antarmuka, dua sumber: 'mock' dan 'apps_script'.
   Ganti sumber di config.js tanpa menyentuh app.js.
   ============================================================ */
(function () {
  const C = window.CONFIG;

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

  // Konten kuis (topik + sesi) selalu dari repo (config.js), di kedua mode.
  // Hanya roster karyawan & hasil yang lewat Google Sheet saat mode apps_script.
  function buildActiveSessions(employee) {
    return window.SAMPLE.sessions
      .filter(s => s.status === 'published' && todayInRange(s.validFrom, s.validUntil))
      .filter(s => !s.targetCompanies.length || s.targetCompanies.includes(employee.perusahaan))
      .map(s => ({ ...s, topic: window.SAMPLE.topics.find(t => t.code === s.topicCode) }))
      .filter(s => s.topic);
  }

  // ---------------- MOCK ----------------
  const mockApi = {
    async findEmployee(nik) {
      const key = (nik || '').trim().toLowerCase();
      return window.SAMPLE.employees.find(e => e.nik.toLowerCase() === key) || null;
    },
    async activeSessions(employee) {
      return buildActiveSessions(employee);
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
    async findEmployee(nik) {
      const data = await this._get({ action: 'employee', nik: (nik || '').trim() });
      return data && data.nik ? data : null;
    },
    async activeSessions(employee) {
      return buildActiveSessions(employee); // konten dari repo (config.js)
    },
    async saveParticipation(rec) {
      const res = await fetch(C.appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // hindari preflight CORS
        body: JSON.stringify({ action: 'participation', payload: rec }),
      });
      return res.ok;
    },
    async findByToken(token) {
      const data = await this._get({ action: 'verify', token });
      return data && data.verificationToken ? data : null;
    },
  };

  const impl = C.dataSource === 'apps_script' ? scriptApi : mockApi;

  window.API = {
    mode: C.dataSource,
    findEmployee: (nik) => impl.findEmployee(nik),
    activeSessions: (emp) => impl.activeSessions(emp),
    saveParticipation: (rec) => impl.saveParticipation(rec),
    findByToken: (t) => impl.findByToken(t),
    companyCode,
    nextSeq,
  };
})();
