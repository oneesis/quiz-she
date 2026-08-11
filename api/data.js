// ============================================================
// Backend Sharing Session -- penyimpanan Google Drive.
// Data disimpan sbg 4 file JSON (employees/topics/sessions/participations)
// di satu folder Google Drive, di dalam SHARED DRIVE Workspace (wajib --
// service account TIDAK PERNAH dapat kuota penyimpanan sendiri di My Drive
// biasa, kebijakan Google sejak 2020; kuota Shared Drive milik organisasi,
// bukan milik akun, jadi service account bisa baca/tulis di sana selama
// jadi member Shared Drive itu).
//
// Kontrak endpoint (action-based, satu handler) TIDAK BERUBAH dari versi
// Sheets sebelumnya -- assets/api.js di sisi klien tidak perlu diubah.
// ============================================================
const { google } = require('googleapis');

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const FILES = { employees: 'employees.json', topics: 'topics.json', sessions: 'sessions.json', participations: 'participations.json' };

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}

// Klien & fileId dipakai ulang antar-invocation kalau instance function
// masih "hangat" (Vercel Fluid Compute) -- irit dibanding re-auth + re-cari
// file tiap panggilan; aman karena fileId tidak berubah selama filenya
// tidak dihapus manual dari Drive.
let _drive;
function drive() {
  if (!_drive) _drive = google.drive({ version: 'v3', auth: getAuth() });
  return _drive;
}

const _fileIds = {};
// Cari file JSON berdasarkan nama di dalam FOLDER_ID; bikin baru (isi array
// kosong) kalau belum ada -- self-heal di folder Drive baru/kosong.
async function fileId(key) {
  if (_fileIds[key]) return _fileIds[key];
  const d = drive();
  const name = FILES[key];
  const q = `name='${name}' and '${FOLDER_ID}' in parents and trashed=false`;
  const found = await d.files.list({ q, fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true });
  if (found.data.files.length) return (_fileIds[key] = found.data.files[0].id);
  const created = await d.files.create({
    requestBody: { name, parents: [FOLDER_ID] },
    media: { mimeType: 'application/json', body: '[]' },
    fields: 'id', supportsAllDrives: true,
  });
  return (_fileIds[key] = created.data.id);
}

async function readJSON(key) {
  const id = await fileId(key);
  const res = await drive().files.get({ fileId: id, alt: 'media', supportsAllDrives: true });
  let data = res.data;
  if (Buffer.isBuffer(data)) data = data.toString('utf8');
  if (Array.isArray(data)) return data; // googleapis auto-parse kalau Content-Type application/json
  try { return JSON.parse(data || '[]'); } catch (e) { return []; }
}

// Timpa SELURUH isi file dengan array baru -- Drive API tidak punya partial
// update konten file, jadi tiap tulis = baca-lengkap -> ubah -> tulis-lengkap.
// Race theoretically mungkin kalau 2 penulisan ke koleksi yg SAMA persis
// bersamaan (dua baca-lama saling menimpa tulisan satu sama lain) -- risiko
// sama seperti dulu di Sheets (LockService tidak ada di sana juga), diterima
// utk kiosk fisik yang dipakai bergantian satu per satu. File juga cuma
// tumbuh (tidak dipangkas) -- kalau participations.json jadi besar & lambat
// dlm hitungan tahun, upgrade-nya arsipkan data lama ke file terpisah per
// tahun, atau pindah ke database sungguhan.
async function writeJSON(key, arr) {
  const id = await fileId(key);
  await drive().files.update({ fileId: id, media: { mimeType: 'application/json', body: JSON.stringify(arr) }, supportsAllDrives: true });
}

async function saveByKey(key, keyField, keyVal, obj) {
  const list = await readJSON(key);
  const i = list.findIndex(x => String(x[keyField]) === String(keyVal));
  if (i === -1) list.push(obj); else list[i] = obj;
  await writeJSON(key, list);
}

async function deleteByKey(key, keyField, keyVal) {
  const list = await readJSON(key);
  await writeJSON(key, list.filter(x => String(x[keyField]) !== String(keyVal)));
}

function jakartaParts(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map(x => [x.type, x.value]));
  return p; // { year, month, day }
}

function companyCode(perusahaan) {
  return String(perusahaan || '').replace(/^PT\s+/i, '').trim().split(/\s+/)[0].toUpperCase() || 'NA';
}

// ---- logic per endpoint (nama & bentuk balikan sama persis dgn versi Sheets) ----
async function listEmployees() {
  return (await readJSON('employees')).filter(e => e.nama);
}

async function findEmployee(nik) {
  const key = String(nik || '').trim();
  return (await listEmployees()).find(e => e.nik === key) || {};
}

async function listTopics() { return readJSON('topics'); }
async function listSessions() { return readJSON('sessions'); }

// Tidak ada padanan LockService di Drive API -- dua submit yang benar2
// bersamaan (beda milidetik) secara teori bisa dapat nomor sertifikat yang
// sama. Risikonya rendah untuk kiosk fisik yang dipakai bergantian satu
// per satu; kalau nanti dipakai multi-kiosk serentak dan ini jadi masalah
// nyata, upgrade-nya: tambah Vercel KV sebagai lock terdistribusi.
async function nextCertNo(perusahaan, list) {
  const { year, month } = jakartaParts(new Date());
  const suffix = '/SS/' + companyCode(perusahaan) + '/' + month + '/' + year.slice(2);
  const count = list.filter(r => r.certificateNo && String(r.certificateNo).indexOf(suffix) !== -1).length;
  return String(count + 1).padStart(3, '0') + suffix;
}

// Peringkat "ketepatan & kecepatan" per topik -- HANYA percobaan LULUS
// dipakai, 1 terbaik per NIK (skor tertinggi, lalu durasi tersinggat sbg
// tie-break). Sengaja tidak dipakai sbg leaderboard publik yg selalu tampil
// (lihat komentar di assets/app.js soal renderCertificate) -- cuma dihitung
// di sini & ditampilkan ke pemiliknya sendiri kalau top-3, supaya tidak
// mendorong semua peserta buru-buru lewatin materi K3 demi ranking (cuma
// yang KEBETULAN cepat+tepat dapat notifikasi, bukan tujuan yang dikejar).
function computeRank(list, topicCode, nik) {
  const bestPerNik = new Map();
  for (const r of list) {
    if (r.topicCode !== topicCode || !r.passed) continue;
    const key = String(r.nik || '').trim();
    const cur = bestPerNik.get(key);
    const dur = typeof r.durationMs === 'number' ? r.durationMs : Infinity;
    if (!cur || r.score > cur.score || (r.score === cur.score && dur < cur.dur)) {
      bestPerNik.set(key, { score: r.score, dur });
    }
  }
  const ranked = [...bestPerNik.entries()].sort((a, b) => b[1].score - a[1].score || a[1].dur - b[1].dur);
  const idx = ranked.findIndex(([k]) => k === String(nik || '').trim());
  return idx === -1 ? null : { rank: idx + 1, total: ranked.length };
}

async function appendResult(p) {
  const list = await readJSON('participations');
  const certificateNo = p.passed ? await nextCertNo(p.perusahaan, list) : null;
  // Klien selalu kirim answerBreakdown sbg string JSON (lihat assets/app.js) --
  // di-parse di sini supaya tersimpan sbg array asli, bukan string berlapis.
  let answerBreakdown = p.answerBreakdown;
  if (typeof answerBreakdown === 'string') {
    try { answerBreakdown = JSON.parse(answerBreakdown || '[]'); } catch (e) { answerBreakdown = []; }
  }
  const durationMs = typeof p.durationMs === 'number' ? p.durationMs : null;
  list.push({
    submittedAt: new Date().toISOString(), nik: p.nik, nama: p.nama, perusahaan: p.perusahaan,
    topicCode: p.topicCode, sessionId: p.sessionId, attemptNo: p.attemptNo, score: p.score,
    passed: p.passed, certificateNo, verificationToken: p.verificationToken, answerBreakdown: answerBreakdown || [],
    durationMs,
  });
  await writeJSON('participations', list);
  const rankInfo = p.passed ? computeRank(list, p.topicCode, p.nik) : null;
  return { certificateNo, rank: rankInfo ? rankInfo.rank : null, total: rankInfo ? rankInfo.total : null };
}

async function findByToken(token) {
  const hit = (await readJSON('participations')).find(r => r.verificationToken === token);
  return hit ? {
    nama: hit.nama, nik: hit.nik, perusahaan: hit.perusahaan, topicCode: hit.topicCode,
    certificateNo: hit.certificateNo, score: hit.score, verificationToken: token,
  } : {};
}

async function findExisting(nik, sessionId) {
  const key = String(nik).trim();
  const hits = (await readJSON('participations')).filter(r => String(r.nik).trim() === key && String(r.sessionId) === String(sessionId) && r.passed);
  if (!hits.length) return {};
  const hit = hits[hits.length - 1];
  return { score: hit.score, certificateNo: hit.certificateNo, verificationToken: hit.verificationToken, submittedAt: hit.submittedAt };
}

// Riwayat sertifikat milik SATU karyawan (NIK dipilih sendiri lewat kiosk,
// bukan admin) -- cuma percobaan yang LULUS, terbaru dulu. Publik (tidak
// butuh adminToken), tapi sama seperti findExisting, cuma pernah balas
// data 1 NIK, bukan seluruh tabel.
async function findHistory(nik) {
  const key = String(nik || '').trim();
  return (await readJSON('participations'))
    .filter(r => String(r.nik).trim() === key && r.passed)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

async function listParticipations() {
  return (await readJSON('participations')).slice().reverse();
}

// ---- upload gambar materi (Vercel Blob) ----
// Bukan ke folder Drive di atas -- Vercel Blob sudah cukup & satu ekosistem
// dgn hosting-nya, jadi dibiarkan seperti semula. Shared Drive sekarang
// tersedia (lihat atas), jadi kalau nanti mau konsolidasi ke Drive juga
// bisa -- belum dilakukan di sini karena tidak diminta.
async function uploadImage(p) {
  const { put } = require('@vercel/blob');
  const buffer = Buffer.from(p.base64, 'base64');
  const blob = await put(p.filename || 'materi.jpg', buffer, {
    access: 'public',
    contentType: p.mimeType || 'image/jpeg',
    addRandomSuffix: true,
  });
  return blob.url;
}

// Sesi admin lewat token bertanda tangan (HMAC), bukan password mentah.
// Sebelumnya CONFIG.admin.password di assets/config.js -- file publik yang
// bisa dibaca siapa saja lewat "View Source" -- dikirim balik apa adanya
// sebagai adminToken. Sekarang password asli (ADMIN_TOKEN) HANYA pernah
// dicek di sini, di server; klien cuma pernah pegang token sesi yang
// kedaluwarsa sendiri, tidak pernah pegang passwordnya.
// Tidak butuh Vercel KV/database -- token menyimpan kedaluwarsanya sendiri
// dan tanda tangannya diverifikasi ulang tiap request (stateless).
const crypto = require('crypto');
function signSession(expiresAt) {
  const body = Buffer.from(JSON.stringify({ exp: expiresAt })).toString('base64url');
  const sig = crypto.createHmac('sha256', ADMIN_TOKEN).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifySession(token) {
  if (!token || typeof token !== 'string' || !ADMIN_TOKEN) return false;
  const [body, sig] = token.split('.');
  if (!body || !sig) return false;
  const expected = crypto.createHmac('sha256', ADMIN_TOKEN).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
    return typeof exp === 'number' && Date.now() < exp;
  } catch (e) { return false; }
}

function isAdmin(token) {
  return verifySession(token);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    if (req.method === 'GET') {
      const a = req.query.action;
      if (a === 'employee')       return res.json(await findEmployee(req.query.nik));
      if (a === 'verify')         return res.json(await findByToken(req.query.token));
      if (a === 'topics')         return res.json(await listTopics());
      if (a === 'sessions')       return res.json(await listSessions());
      if (a === 'existing')       return res.json(await findExisting(req.query.nik, req.query.sessionId));
      if (a === 'history')        return res.json(await findHistory(req.query.nik));
      if (a === 'participations') return res.json(isAdmin(req.query.adminToken) ? await listParticipations() : []);
      if (a === 'employees')      return res.json(isAdmin(req.query.adminToken) ? await listEmployees() : []);
      return res.json({});
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body || '{}');
      const { action, payload: p, adminToken } = body || {};

      if (action === 'participation') return res.json({ ok: true, ...await appendResult(p) });
      // admin_login sengaja di luar gerbang isAdmin -- ini justru tempat
      // token sesi PERTAMA KALI diterbitkan, belum ada token buat dicek.
      // 12 jam cukup buat satu shift kerja; auto-logout idle (15 menit,
      // lihat assets/admin.js) akan lebih dulu memutus sesi di kasus normal.
      if (action === 'admin_login') {
        const ok = !!ADMIN_TOKEN && p && p.password === ADMIN_TOKEN;
        return res.json(ok ? { ok: true, token: signSession(Date.now() + 12 * 3600 * 1000) } : { ok: false });
      }
      if (!isAdmin(adminToken)) return res.json({ ok: false, error: 'unauthorized' });

      if (action === 'topic_save') {
        await saveByKey('topics', 'code', p.code, {
          code: p.code, title: p.title, passThreshold: p.passThreshold,
          material: p.material, materialImage: p.materialImage, questions: p.questions,
        });
        return res.json({ ok: true });
      }
      if (action === 'topic_delete') { await deleteByKey('topics', 'code', p.code); return res.json({ ok: true }); }
      if (action === 'session_save') {
        await saveByKey('sessions', 'id', p.id, {
          id: p.id, topicCode: p.topicCode, title: p.title, validFrom: p.validFrom, validUntil: p.validUntil,
          targetCompanies: p.targetCompanies || [], status: p.status,
        });
        return res.json({ ok: true });
      }
      if (action === 'session_delete') { await deleteByKey('sessions', 'id', p.id); return res.json({ ok: true }); }
      if (action === 'upload_image') { return res.json({ ok: true, url: await uploadImage(p) }); }
      return res.json({ ok: false });
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
