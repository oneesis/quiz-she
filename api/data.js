// ============================================================
// Backend Sharing Session -- pengganti Apps Script.
// Data TETAP di Google Sheet yang sama (biar gampang dicek manual),
// cuma "pintu"-nya diganti: dari Apps Script (lambat, cold-start berat)
// jadi Vercel serverless function yang bicara langsung ke Google Sheets
// API v4 + Drive API v3 lewat service account.
//
// Kontrak endpoint (action-based, satu handler) sengaja dibuat SAMA
// PERSIS dengan Apps Script lama supaya assets/api.js di sisi klien
// tidak perlu diubah sama sekali -- cuma appsScriptUrl di config.js
// yang diarahkan ke sini.
// ============================================================
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const ROSTER = 'Master_Karyawan';
const RESULTS = 'Partisipasi';
const TOPICS = 'Topics';
const SESSIONS = 'Session';
const UPLOAD_FOLDER_NAME = 'Quiz SHE Uploads';

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
}

// Klien dipakai ulang antar-invocation kalau instance function masih
// "hangat" (Vercel Fluid Compute) -- lumayan ngirit dibanding re-auth tiap
// panggilan, walau tidak dijamin selalu kepakai (instance bisa cold lagi).
let _sheets, _drive;
function clients() {
  if (!_sheets) {
    const auth = getAuth();
    _sheets = google.sheets({ version: 'v4', auth });
    _drive = google.drive({ version: 'v3', auth });
  }
  return { sheets: _sheets, drive: _drive };
}

// ---- util tanggal ----
// Sheets API balikin tanggal sebagai serial number (hari sejak 30 Des 1899,
// epoch yang sama dengan Excel) kalau selnya kebetulan bertipe Date -- ini
// bisa kejadian di baris LAMA yang ditulis Apps Script dulu (sebelum fix
// RAW input di bawah). Baris BARU dari backend ini tidak akan kena masalah
// ini sama sekali karena selalu ditulis pakai valueInputOption RAW (Sheets
// tidak akan coba "pintar" mengubah teks tanggal jadi sel bertipe Date).
function serialToDateStr(v) {
  if (typeof v === 'number') {
    // Sel legacy bertipe Date (dari sebelum tulis pakai RAW) -- jam-nya
    // tidak pernah bermakna (selalu tengah malam), jadi aman disederhanakan
    // jadi tanggal polos.
    const ms = Date.UTC(1899, 11, 30) + v * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  // String ditulis apa adanya (RAW) -- BUKAN dipotong ke 10 karakter, supaya
  // "yyyy-MM-ddTHH:mm" (sesi dengan jam spesifik) tidak kehilangan jamnya.
  return String(v || '');
}

function jakartaParts(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map(x => [x.type, x.value]));
  return p; // { year, month, day }
}

// ---- baca/tulis sheet ----
async function getRows(sheetName) {
  const { sheets } = clients();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  return res.data.values || [];
}

function colIndexer(header) {
  return (name) => header.indexOf(name);
}

// RAW (bukan USER_ENTERED) -- teks tanggal "2026-07-01" TETAP jadi teks,
// tidak diubah otomatis jadi sel bertipe Date. Ini akar masalah yang dulu
// bikin sesi "tidak terdeteksi" di versi Apps Script (lihat komentar di
// serialToDateStr di atas) -- dengan RAW, masalah itu tidak bisa terulang.
async function appendRow(sheetName, rowValues) {
  const { sheets } = clients();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
    valueInputOption: 'RAW',
    requestBody: { values: [rowValues] },
  });
}

async function getSheetIdByName(name) {
  const { sheets } = clients();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets.properties' });
  const found = meta.data.sheets.find(s => s.properties.title === name);
  return found ? found.properties.sheetId : null;
}

// Simpan (tambah/timpa) baris berdasarkan kolom kunci, mengisi tiap kolom
// sesuai NAMA header (bukan posisi) -- sama seperti saveRow() Apps Script
// lama, supaya aman walau urutan/isi kolom sheet berbeda.
async function saveRowByKey(sheetName, keyCol, keyVal, valuesByName) {
  const rows = await getRows(sheetName);
  const head = rows[0] || [];
  const ci = head.indexOf(keyCol);
  const rowValues = head.map(h => (h in valuesByName ? valuesByName[h] : ''));
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][ci]) === String(keyVal)) {
      const { sheets } = clients();
      const rowNum = i + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A${rowNum}:${colLetter(rowValues.length)}${rowNum}`,
        valueInputOption: 'RAW',
        requestBody: { values: [rowValues] },
      });
      return;
    }
  }
  await appendRow(sheetName, rowValues);
}

async function deleteRowByKey(sheetName, keyCol, keyVal) {
  const rows = await getRows(sheetName);
  const head = rows[0] || [];
  const ci = head.indexOf(keyCol);
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][ci]) === String(keyVal)) {
      const sheetId = await getSheetIdByName(sheetName);
      const { sheets } = clients();
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 } } }],
        },
      });
      return;
    }
  }
}

function colLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// ---- logic per endpoint (nama & bentuk balikan sama persis dgn Apps Script lama) ----
async function findEmployee(nik) {
  const key = String(nik || '').trim();
  const list = await listEmployees();
  return list.find(e => e.nik === key) || {};
}

async function listEmployees() {
  const rows = await getRows(ROSTER);
  const head = rows.shift() || [];
  const c = colIndexer(head);
  return rows.map(r => ({
    nik: String(r[c('NIK')] || '').trim(), nama: r[c('NAMA')], perusahaan: r[c('PERUSAHAAN')],
    jabatan: r[c('JABATAN')], departemen: r[c('DEPARTEMEN')],
  })).filter(e => e.nama);
}

function companyCode(perusahaan) {
  return String(perusahaan || '').replace(/^PT\s+/i, '').trim().split(/\s+/)[0].toUpperCase() || 'NA';
}

// Tidak ada padanan LockService di Sheets API -- dua submit yang benar2
// bersamaan (beda milidetik) secara teori bisa dapat nomor sertifikat yang
// sama. Risikonya rendah untuk kiosk fisik yang dipakai bergantian satu
// per satu; kalau nanti dipakai multi-kiosk serentak dan ini jadi masalah
// nyata, upgrade-nya: tambah Vercel KV sebagai lock terdistribusi.
async function nextCertNo(perusahaan) {
  const { year, month } = jakartaParts(new Date());
  const suffix = '/SS/' + companyCode(perusahaan) + '/' + month + '/' + year.slice(2);
  const rows = await getRows(RESULTS);
  const head = rows.shift() || [];
  const ci = head.indexOf('certificateNo');
  const count = rows.filter(r => r[ci] && String(r[ci]).indexOf(suffix) !== -1).length;
  return String(count + 1).padStart(3, '0') + suffix;
}

async function appendResult(p) {
  const certificateNo = p.passed ? await nextCertNo(p.perusahaan) : null;
  await appendRow(RESULTS, [
    new Date().toISOString(), p.nik, p.nama, p.perusahaan, p.topicCode, p.sessionId,
    p.attemptNo, p.score, p.passed, certificateNo, p.verificationToken, p.answerBreakdown || '',
  ]);
  return certificateNo;
}

async function getResultsLite() {
  const rows = await getRows(RESULTS);
  const head = rows.shift() || [];
  const c = colIndexer(head);
  return rows.map(r => ({
    nik: String(r[c('nik')]), nama: r[c('nama')], perusahaan: r[c('perusahaan')],
    sessionId: String(r[c('sessionId')]), topicCode: r[c('topicCode')], passed: r[c('passed')], score: r[c('score')],
    certificateNo: r[c('certificateNo')], verificationToken: r[c('verificationToken')],
    submittedAt: r[c('waktu')],
  }));
}

async function findByToken(token) {
  const hit = (await getResultsLite()).find(r => r.verificationToken === token);
  return hit ? {
    nama: hit.nama, nik: hit.nik, perusahaan: hit.perusahaan,
    certificateNo: hit.certificateNo, score: hit.score, verificationToken: token,
  } : {};
}

async function findExisting(nik, sessionId) {
  const key = String(nik).trim();
  const hits = (await getResultsLite()).filter(r => r.nik.trim() === key && r.sessionId === String(sessionId) && r.passed);
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
  return (await getResultsLite())
    .filter(r => r.nik.trim() === key && r.passed)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

async function listParticipations() {
  const rows = await getRows(RESULTS);
  const head = rows.shift() || [];
  const c = colIndexer(head);
  return rows.map(r => {
    let answerBreakdown = [];
    try { answerBreakdown = JSON.parse(r[c('answerBreakdown')] || '[]'); } catch (e) { /* data lama/rusak -- abaikan */ }
    return {
      submittedAt: r[c('waktu')], nik: r[c('nik')], nama: r[c('nama')], perusahaan: r[c('perusahaan')],
      topicCode: r[c('topicCode')], sessionId: r[c('sessionId')], attemptNo: r[c('attemptNo')],
      score: r[c('score')], passed: r[c('passed')], certificateNo: r[c('certificateNo')],
      verificationToken: r[c('verificationToken')], answerBreakdown,
    };
  }).reverse();
}

async function listTopics() {
  const rows = await getRows(TOPICS);
  const head = rows.shift() || [];
  const c = colIndexer(head);
  return rows.map(r => ({
    code: r[c('code')], title: r[c('title')], passThreshold: r[c('passThreshold')],
    material: r[c('material')], materialImage: r[c('materialImage')],
    questions: JSON.parse(r[c('questionsJson')] || '[]'),
  }));
}

async function listSessions() {
  const rows = await getRows(SESSIONS);
  const head = rows.shift() || [];
  const c = colIndexer(head);
  return rows.map(r => ({
    id: r[c('id')], topicCode: r[c('topicCode')], title: r[c('title')],
    validFrom: serialToDateStr(r[c('validFrom')]), validUntil: serialToDateStr(r[c('validUntil')]),
    targetCompanies: String(r[c('targetCompanies')] || '').split(',').map(s => s.trim()).filter(Boolean),
    status: r[c('status')],
  }));
}

// ---- upload gambar materi ke Drive ----
async function getUploadsFolderId() {
  const { drive } = clients();
  const res = await drive.files.list({
    q: `name='${UPLOAD_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  if (res.data.files && res.data.files.length) return res.data.files[0].id;
  const created = await drive.files.create({ requestBody: { name: UPLOAD_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
  return created.data.id;
}

async function uploadImage(p) {
  const { drive } = clients();
  const folderId = await getUploadsFolderId();
  const { Readable } = require('stream');
  const buffer = Buffer.from(p.base64, 'base64');
  const file = await drive.files.create({
    requestBody: { name: p.filename || 'materi.jpg', parents: [folderId] },
    media: { mimeType: p.mimeType || 'image/jpeg', body: Readable.from(buffer) },
    fields: 'id',
  });
  await drive.permissions.create({ fileId: file.data.id, requestBody: { role: 'reader', type: 'anyone' } });
  return `https://drive.google.com/thumbnail?id=${file.data.id}&sz=w2000`;
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

      if (action === 'participation') return res.json({ ok: true, certificateNo: await appendResult(p) });
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
        await saveRowByKey(TOPICS, 'code', p.code, {
          code: p.code, title: p.title, passThreshold: p.passThreshold,
          material: p.material, materialImage: p.materialImage, questionsJson: JSON.stringify(p.questions),
        });
        return res.json({ ok: true });
      }
      if (action === 'topic_delete') { await deleteRowByKey(TOPICS, 'code', p.code); return res.json({ ok: true }); }
      if (action === 'session_save') {
        await saveRowByKey(SESSIONS, 'id', p.id, {
          id: p.id, topicCode: p.topicCode, title: p.title, validFrom: p.validFrom, validUntil: p.validUntil,
          targetCompanies: (p.targetCompanies || []).join(','), status: p.status,
        });
        return res.json({ ok: true });
      }
      if (action === 'session_delete') { await deleteRowByKey(SESSIONS, 'id', p.id); return res.json({ ok: true }); }
      if (action === 'upload_image') { return res.json({ ok: true, url: await uploadImage(p) }); }
      return res.json({ ok: false });
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
