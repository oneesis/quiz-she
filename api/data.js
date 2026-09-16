// ============================================================
// Backend Sharing Session -- Google Sheets, dua spreadsheet:
// - GOOGLE_SHEET_ID: tab Topics/Session/Partisipasi (punya aplikasi ini
//   sendiri, terpisah dari workbook gabungan lintas-aplikasi).
// - GOOGLE_ROSTER_SPREADSHEET_ID: tab Master_Karyawan di spreadsheet HR
//   yang sudah ada (dipakai bareng aplikasi lain di kantor) -- read-only,
//   dibaca live tiap request supaya update roster oleh HR langsung kepakai.
//
// Auth pakai OAuth client biasa + refresh token (BUKAN service account) --
// service account tidak pernah dapat kuota Drive/Sheets sendiri tanpa
// Google Workspace + admin (Shared Drive / domain-wide delegation), yang
// tidak tersedia di sini. OAuth client biasa (login manusia sekali di
// awal, refresh_token dipakai backend seterusnya) jalan di akun apa pun.
//
// Kontrak endpoint (action-based, satu handler) TIDAK BERUBAH -- assets/api.js
// di sisi klien tidak perlu diubah sama sekali.
// ============================================================
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const ROSTER_SPREADSHEET_ID = process.env.GOOGLE_ROSTER_SPREADSHEET_ID;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const ROSTER = 'Master_Karyawan';
const RESULTS = 'Partisipasi';
const TOPICS = 'Topics';
const SESSIONS = 'Session';

function getAuth() {
  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  return oauth2; // googleapis otomatis tukar refresh_token -> access_token baru tiap perlu
}

// Klien dipakai ulang antar-invocation kalau instance function masih
// "hangat" (Vercel Fluid Compute) -- irit dibanding re-auth tiap panggilan.
let _sheets;
function clients() {
  if (!_sheets) _sheets = google.sheets({ version: 'v4', auth: getAuth() });
  return { sheets: _sheets };
}

// ---- util tanggal ----
// Sheets API balikin tanggal sebagai serial number (hari sejak 30 Des 1899,
// epoch sama dengan Excel) kalau selnya kebetulan bertipe Date -- ini bisa
// kejadian kalau seseorang edit manual & Sheets "pintar" ubah teks jadi
// tanggal. Baris yang ditulis backend ini sendiri tidak akan kena masalah
// ini (selalu pakai valueInputOption RAW di bawah).
function serialToDateStr(v) {
  if (typeof v === 'number') {
    const ms = Date.UTC(1899, 11, 30) + v * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return String(v || '');
}
function serialToISODateTime(v) {
  if (typeof v === 'number') {
    const ms = Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000;
    return new Date(ms).toISOString();
  }
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
async function getRows(sheetName, spreadsheetId = SPREADSHEET_ID) {
  const { sheets } = clients();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId, range: sheetName, valueRenderOption: 'UNFORMATTED_VALUE',
  });
  return res.data.values || [];
}

function colIndexer(header) {
  return (name) => header.indexOf(name);
}

// RAW (bukan USER_ENTERED) -- teks tanggal "2026-07-01" TETAP jadi teks,
// tidak diubah otomatis jadi sel bertipe Date.
async function appendRow(sheetName, rowValues, spreadsheetId = SPREADSHEET_ID) {
  const { sheets } = clients();
  await sheets.spreadsheets.values.append({
    spreadsheetId, range: sheetName, valueInputOption: 'RAW', requestBody: { values: [rowValues] },
  });
}

async function getSheetIdByName(name, spreadsheetId = SPREADSHEET_ID) {
  const { sheets } = clients();
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const found = meta.data.sheets.find(s => s.properties.title === name);
  return found ? found.properties.sheetId : null;
}

// Simpan (tambah/timpa) baris berdasarkan kolom kunci, mengisi tiap kolom
// sesuai NAMA header (bukan posisi) -- aman walau urutan/isi kolom sheet beda.
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
        requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 } } }] },
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

// ---- cuti (2026-08-20) ----
// Roster app ini (Master_Karyawan) tidak kenal status cuti -- SISTER MINER
// adalah source of truth. Cross-read spreadsheet SISTER MINER (+ SIMANTRA K3
// utk bridge akun_karyawan & gate Reinduksi Pasca Cuti TR_REINDUKSI), sama
// pola & bridge yang dipakai di hazard-report-sap/api/index.js.
function namaCocok(a, b) {
  const na = String(a || '').trim().toUpperCase();
  const nb = String(b || '').trim().toUpperCase();
  return Boolean(na && nb) && (na.includes(nb) || nb.includes(na));
}

function rowsToObjects(rows) {
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map(r => Object.fromEntries(header.map((h, i) => [String(h).trim(), r[i] ?? ''])));
}

let _statusKerjaCache = null; // { at, byNik: Map<nik, statusKerja> }

// ---- Safety Talk exemption (2026-09-14) ----
// Cross-read SafetyTalk_Absensi dari hazard-report-sap spreadsheet.
// Env var SAFETY_TALK_SPREADSHEET_ID harus di-set, dan spreadsheet di-share
// read-only ke OAuth account yang dipakai aplikasi ini.
// Peta NIK -> Map<SCHEDULE_ID, STATUS_KEHADIRAN> untuk bulan itu. Sejak ONE-SAP
// mencatat SEMUA status (2026-09-15), bukan cuma yang hadir, keberadaan baris
// saja TIDAK berarti hadir -- harus dilihat statusnya:
//   HADIR   -> exempt, tidak perlu kuis
//   MANGKIR -> tidak boleh ikut kuis (tidak bisa diganti capaiannya)
//   lainnya -> Cuti/Dinas Luar/Shift Malam/Libur = WAJIB kuis
// Dipetakan PER JADWAL (2026-09-16), bukan per bulan: kuis untuk jadwal B
// dinilai dari status orang itu di jadwal B saja. Sebelumnya satu nilai
// se-bulan, baris terakhir menang -- mangkir minggu lalu bisa memblokir
// kuis minggu ini tergantung urutan baris di sheet (rapuh).
// Baris lama tanpa kolom/isi STATUS_KEHADIRAN dianggap HADIR (kompat mundur).
let _stCache = null, _stCacheTs = 0;
async function getSafetyTalkStatusMap(bulan) {
  if (!process.env.SAFETY_TALK_SPREADSHEET_ID) return new Map();
  if (_stCache && Date.now() - _stCacheTs < 30_000) return _stCache;
  try {
    const rows = await getRows('SafetyTalk_Absensi', process.env.SAFETY_TALK_SPREADSHEET_ID);
    const head = rows[0] || [];
    const nikIdx    = head.indexOf('NIK');
    const bulanIdx  = head.indexOf('BULAN');
    const statusIdx = head.indexOf('STATUS_KEHADIRAN');
    const schedIdx  = head.indexOf('SCHEDULE_ID');
    if (nikIdx === -1) return new Map();
    const map = new Map();
    for (const r of rows.slice(1)) {
      if (bulan && String(r[bulanIdx] || '').slice(0, 7) !== bulan) continue;
      const nik = String(r[nikIdx] || '').trim();
      if (!nik) continue;
      const status = statusIdx === -1
        ? 'HADIR'
        : String(r[statusIdx] || 'HADIR').trim().toUpperCase() || 'HADIR';
      const sched = schedIdx === -1 ? '' : String(r[schedIdx] || '').trim();
      if (!map.has(nik)) map.set(nik, new Map());
      map.get(nik).set(sched, status); // satu baris per (nik, jadwal) -- ONE-SAP menjamin
    }
    _stCache = map; _stCacheTs = Date.now();
    return map;
  } catch (err) {
    console.error('[safety-talk] gagal cross-read, fitur exemption nonaktif:', err.message);
    return new Map();
  }
}

/** statusKerja ("aktif"|"cuti"|"wajib_reinduksi") per NIK di `roster`. Env var
 * SISTER_MINER_SPREADSHEET_ID belum diset -> Map kosong (semua "aktif"). */
async function getStatusKerjaMap(roster) {
  const sisterId = process.env.SISTER_MINER_SPREADSHEET_ID;
  if (!sisterId) return new Map();
  const now = Date.now();
  if (_statusKerjaCache && now - _statusKerjaCache.at < 30_000) return _statusKerjaCache.byNik;

  let karyawan, bridgeByNik = new Map(), records = [];
  try {
    karyawan = rowsToObjects(await getRows('Karyawan', sisterId));
    const simantraId = process.env.SIMANTRA_SPREADSHEET_ID;
    if (simantraId) {
      for (const r of rowsToObjects(await getRows('akun_karyawan', simantraId))) {
        if (r.nik) bridgeByNik.set(String(r.nik).trim(), r.karyawan_id);
      }
      records = rowsToObjects(await getRows('training_records', simantraId));
    }
  } catch (err) {
    // Fail-open (2026-08-20): salah ID / akun OAuth belum di-share akses ke
    // spreadsheet SISTER MINER TIDAK BOLEH bikin listEmployees() (dipakai di
    // mana-mana) patah -- cuma bikin fitur cuti mati sementara.
    console.error('[cuti] gagal baca SISTER MINER/SIMANTRA, fitur cuti nonaktif sementara:', err.message);
    return new Map();
  }

  const byNik = new Map();
  // Bug (2026-08-21): bandingin Date lengkap (dgn jam) ke new Date(tanggal)
  // (selalu jam 00:00 UTC) bikin cutiSelesai cuma "cuti" di milidetik pertama
  // harinya. Fix: banding string tanggal kalender (YYYY-MM-DD) di zona WIB.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  for (const emp of roster) {
    if (!emp.nik) continue;
    let match;
    const bridgedId = bridgeByNik.get(emp.nik);
    if (bridgedId) match = karyawan.find(r => r.id === bridgedId);
    if (!match) match = karyawan.find(r => r.status === 'approved' && String(r.nrp || '').trim() === emp.nik && namaCocok(r.nama, emp.nama));
    if (!match || !match.cutiMulai || !match.cutiSelesai) { byNik.set(emp.nik, 'aktif'); continue; }
    if (today < match.cutiMulai) { byNik.set(emp.nik, 'aktif'); continue; }
    if (today <= match.cutiSelesai) { byNik.set(emp.nik, 'cuti'); continue; }
    const done = records.some(r => r.karyawan_id === match.id && r.training_id === 'TR_REINDUKSI'
      && r.status === 'Hadir' && (r.tanggal_selesai || '') >= match.cutiSelesai);
    byNik.set(emp.nik, done ? 'aktif' : 'wajib_reinduksi');
  }
  _statusKerjaCache = { at: now, byNik };
  return byNik;
}

// ---- logic per endpoint ----
async function listEmployees() {
  const rows = await getRows(ROSTER, ROSTER_SPREADSHEET_ID);
  const head = rows.shift() || [];
  const c = colIndexer(head);
  const list = rows.map(r => ({
    nik: String(r[c('NIK')] || '').trim(), nama: r[c('NAMA')], perusahaan: r[c('PERUSAHAAN')],
    jabatan: r[c('JABATAN')], departemen: r[c('DEPARTEMEN')],
  })).filter(e => e.nama);

  const statusByNik = await getStatusKerjaMap(list);
  return list.map(e => ({ ...e, statusKerja: statusByNik.get(e.nik) || 'aktif' }));
}

async function findEmployee(nik) {
  const key = String(nik || '').trim();
  const list = await listEmployees();
  const emp  = list.find(e => e.nik === key) || {};
  if (!emp.nik) return emp;
  // Status Safety Talk bulan ini, per jadwal
  const { year, month } = jakartaParts(new Date());
  const bulan = `${year}-${month}`;
  const bySched = (await getSafetyTalkStatusMap(bulan)).get(key) || new Map();
  const statuses = [...bySched.values()];
  // { 'ST-1789...': 'MANGKIR', 'ST-1790...': 'LIBUR' } -- dipakai klien untuk
  // menilai tiap sesi kuis Safety Talk dari jadwal yang bersangkutan saja.
  emp.safetyTalkBySchedule = Object.fromEntries(bySched);
  // Ringkasan bulanan, untuk sesi Sharing Session biasa (bukan kuis Safety Talk)
  // dan pesan di layar kosong. Hadir di jadwal mana pun = hadir bulan ini.
  emp.safetyTalkHadir  = statuses.includes('HADIR');
  emp.safetyTalkStatus = emp.safetyTalkHadir ? 'HADIR'
    : statuses.includes('MANGKIR') ? 'MANGKIR'
    : (statuses[statuses.length - 1] || ''); // '' = belum diabsen sama sekali
  return emp;
}

function companyCode(perusahaan) {
  return String(perusahaan || '').replace(/^PT\s+/i, '').trim().split(/\s+/)[0].toUpperCase() || 'NA';
}

// Tidak ada padanan LockService di Sheets API -- dua submit yang benar2
// bersamaan (beda milidetik) secara teori bisa dapat nomor sertifikat yang
// sama. Risikonya rendah untuk kiosk fisik yang dipakai bergantian satu
// per satu; kalau nanti dipakai multi-kiosk serentak dan ini jadi masalah
// nyata, upgrade-nya: tambah lock terdistribusi (mis. Vercel KV).
async function nextCertNo(perusahaan) {
  const { year, month } = jakartaParts(new Date());
  const suffix = '/SS/' + companyCode(perusahaan) + '/' + month + '/' + year.slice(2);
  const rows = await getRows(RESULTS);
  const head = rows.shift() || [];
  const ci = head.indexOf('certificateNo');
  const count = rows.filter(r => r[ci] && String(r[ci]).indexOf(suffix) !== -1).length;
  return String(count + 1).padStart(3, '0') + suffix;
}

// Peringkat "ketepatan & kecepatan" per topik -- HANYA percobaan LULUS
// dipakai, 1 terbaik per NIK (skor tertinggi, lalu durasi tersingkat sbg
// tie-break). Cuma dihitung di sini & ditampilkan ke pemiliknya sendiri
// kalau top-3 (lihat assets/app.js renderResult), bukan leaderboard publik.
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

const SAP_SYNC_URL = 'https://sap-ebl.vercel.app/api?action=syncSafetyTalkQuiz';
async function notifySafetyTalkQuiz(topicCode, nik) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(SAP_SYNC_URL + '&schedule_id=' + encodeURIComponent(topicCode) + '&nik=' + encodeURIComponent(nik), { signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    console.log('[safety-talk sync]', topicCode, nik, j.updated ? 'QUIZ_DONE=YA' : ('skip: ' + (j.reason || j.message || r.status)));
  } catch (e) {
    console.error('[safety-talk sync] gagal (kuis tetap tersimpan):', e.message);
  } finally { clearTimeout(t); }
}

async function appendResult(p) {
  const certificateNo = p.passed ? await nextCertNo(p.perusahaan) : null;
  let answerBreakdown = p.answerBreakdown;
  if (typeof answerBreakdown === 'string') {
    try { answerBreakdown = JSON.parse(answerBreakdown || '[]'); } catch (e) { answerBreakdown = []; }
  }
  const durationMs = typeof p.durationMs === 'number' ? p.durationMs : '';
  await appendRow(RESULTS, [
    new Date().toISOString(), p.nik, p.nama, p.perusahaan, p.topicCode, p.sessionId,
    p.attemptNo, p.score, p.passed, certificateNo, p.verificationToken, JSON.stringify(answerBreakdown), durationMs,
  ]);
  const rankInfo = p.passed ? computeRank(await getResultsLite(), p.topicCode, p.nik) : null;
  return { certificateNo, rank: rankInfo ? rankInfo.rank : null, total: rankInfo ? rankInfo.total : null };
}

async function getResultsLite() {
  const rows = await getRows(RESULTS);
  const head = rows.shift() || [];
  const c = colIndexer(head);
  return rows.map(r => ({
    nik: String(r[c('nik')]), nama: r[c('nama')], perusahaan: r[c('perusahaan')],
    sessionId: String(r[c('sessionId')]), topicCode: r[c('topicCode')], passed: r[c('passed')], score: r[c('score')],
    certificateNo: r[c('certificateNo')], verificationToken: r[c('verificationToken')],
    submittedAt: serialToISODateTime(r[c('waktu')]),
    durationMs: typeof r[c('durationMs')] === 'number' ? r[c('durationMs')] : null,
  }));
}

async function findByToken(token) {
  const hit = (await getResultsLite()).find(r => r.verificationToken === token);
  return hit ? {
    nama: hit.nama, nik: hit.nik, perusahaan: hit.perusahaan, topicCode: hit.topicCode,
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

// Riwayat sertifikat milik SATU karyawan -- cuma percobaan yang LULUS,
// terbaru dulu. Publik (tidak butuh adminToken), tapi cuma pernah balas
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
      submittedAt: serialToISODateTime(r[c('waktu')]), nik: r[c('nik')], nama: r[c('nama')], perusahaan: r[c('perusahaan')],
      topicCode: r[c('topicCode')], sessionId: r[c('sessionId')], attemptNo: r[c('attemptNo')],
      score: r[c('score')], passed: r[c('passed')], certificateNo: r[c('certificateNo')],
      verificationToken: r[c('verificationToken')], answerBreakdown,
      durationMs: typeof r[c('durationMs')] === 'number' ? r[c('durationMs')] : null,
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

// ---- upload gambar materi (Vercel Blob) ----
// Terpisah dari Sheets di atas -- Vercel Blob sudah cukup & satu ekosistem
// dgn hosting-nya, tidak diubah oleh migrasi backend data ini.
async function uploadImage(p) {
  const { put } = require('@vercel/blob');
  const buffer = Buffer.from(p.base64, 'base64');
  const blob = await put(p.filename || 'materi.jpg', buffer, {
    access: 'public', contentType: p.mimeType || 'image/jpeg', addRandomSuffix: true,
  });
  return blob.url;
}

// Sesi admin lewat token bertanda tangan (HMAC), bukan password mentah.
// Password asli (ADMIN_TOKEN) HANYA pernah dicek di sini, di server;
// klien cuma pernah pegang token sesi yang kedaluwarsa sendiri (12 jam).
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
      // Dulu balas array kosong diam-diam kalau adminToken tidak valid/kedaluwarsa
      // -- di UI itu keliatan PERSIS sama dengan "memang belum ada data", jadi
      // sesi admin yang habis bikin seluruh Laporan/Karyawan keliatan kosong
      // tanpa penjelasan. Sekarang 401 dengan error jelas, supaya klien bisa
      // bedakan "kedaluwarsa" dari "kosong beneran" (lihat onUnauthorized di
      // assets/api.js).
      if (a === 'participations') {
        if (!isAdmin(req.query.adminToken)) return res.status(401).json({ error: 'unauthorized' });
        return res.json(await listParticipations());
      }
      if (a === 'employees') {
        if (!isAdmin(req.query.adminToken)) return res.status(401).json({ error: 'unauthorized' });
        return res.json(await listEmployees());
      }
      if (a === 'safetyTalkStatuses') {
        // Status kehadiran Safety Talk per NIK per jadwal (semua bulan) untuk
        // Laporan admin: sesi hasil "Import dari Safety Talk" (topicCode = ID
        // jadwal) mengecualikan yang HADIR/MANGKIR dari "belum lulus".
        if (!isAdmin(req.query.adminToken)) return res.status(401).json({ error: 'unauthorized' });
        const map = await getSafetyTalkStatusMap(null); // null = semua bulan
        const out = {};
        for (const [nik, bySched] of map) out[nik] = Object.fromEntries(bySched);
        return res.json(out);
      }
      return res.json({});
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body || '{}');
      const { action, payload: p, adminToken } = body || {};

      if (action === 'participation') {
        const result = await appendResult(p);
        // Kuis Safety Talk (kode topik = ID jadwal ONE-SAP) yang LULUS: minta
        // ONE-SAP menandai QUIZ_DONE sekarang juga supaya capaian karyawan itu
        // langsung +1 -- tidak menunggu admin menyimpan ulang absensi. ONE-SAP
        // memverifikasi balik ke sini sebelum menulis, jadi tidak perlu rahasia.
        // Gagal/lambat TIDAK boleh menggagalkan submit kuis -- fire & forget
        // dengan batas 5 detik, hasilnya cuma dicatat di log.
        if (p && p.passed && /^ST-/.test(String(p.topicCode || ''))) {
          await notifySafetyTalkQuiz(p.topicCode, p.nik);
        }
        return res.json({ ok: true, ...result });
      }
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
