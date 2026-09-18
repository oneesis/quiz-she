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

// ── Postgres (Neon) — lazy, driver serverless HTTP ──────────────────────────
// Dipakai untuk tabel `partisipasi` (Topics/Session/roster masih Google Sheets).
let _sql = null;
function getSql() {
  if (_sql) return _sql;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum diset.');
  const { neon } = require('@neondatabase/serverless');
  _sql = neon(process.env.DATABASE_URL);
  return _sql;
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
  if (!process.env.DATABASE_URL) return new Map();
  if (_stCache && Date.now() - _stCacheTs < 30_000) return _stCache;
  try {
    // Absensi Safety Talk kini di Postgres (Neon), DB yang sama dengan ONE-SAP.
    const sql = getSql();
    const rows = bulan
      ? await sql`SELECT nik, schedule_id, status_kehadiran FROM safety_talk_absensi WHERE substr(bulan,1,7) = ${bulan}`
      : await sql`SELECT nik, schedule_id, status_kehadiran FROM safety_talk_absensi`;
    const map = new Map();
    for (const r of rows) {
      const nik = String(r.nik || '').trim();
      if (!nik) continue;
      const status = String(r.status_kehadiran || 'HADIR').trim().toUpperCase() || 'HADIR';
      const sched = String(r.schedule_id || '').trim();
      if (!map.has(nik)) map.set(nik, new Map());
      map.get(nik).set(sched, status);
    }
    _stCache = map; _stCacheTs = Date.now();
    return map;
  } catch (err) {
    console.error('[safety-talk] gagal baca Postgres, fitur exemption nonaktif:', err.message);
    return new Map();
  }
}

/** statusKerja ("aktif"|"cuti"|"wajib_reinduksi") per NIK di `roster`. Env var
 * SISTER_MINER_SPREADSHEET_ID belum diset -> Map kosong (semua "aktif"). */
async function getStatusKerjaMap(roster) {
  const now = Date.now();
  if (_statusKerjaCache && now - _statusKerjaCache.at < 30_000) return _statusKerjaCache.byNik;

  let karyawan, bridgeByNik = new Map(), records = [];
  const sql = getSql();
  if (sql) {
    // Sumber cuti kini di Neon (sheet SISTER MINER/SIMANTRA sudah beku pasca migrasi).
    try {
      karyawan = (await sql`SELECT data FROM sm."Karyawan"`).map((r) => r.data || {});
      for (const r of (await sql`SELECT data FROM simantra."akun_karyawan"`).map((x) => x.data || {})) {
        if (r.nik) bridgeByNik.set(String(r.nik).trim(), r.karyawan_id);
      }
      records = (await sql`SELECT data FROM simantra."training_records"`).map((r) => r.data || {});
    } catch (err) {
      console.error('[cuti] gagal baca Neon (sm/simantra), fitur cuti nonaktif sementara:', err.message);
      return new Map();
    }
  } else {
    // Fallback Sheets (pra-migrasi / tanpa DATABASE_URL)
    const sisterId = process.env.SISTER_MINER_SPREADSHEET_ID;
    if (!sisterId) return new Map();
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
      console.error('[cuti] gagal baca SISTER MINER/SIMANTRA, fitur cuti nonaktif sementara:', err.message);
      return new Map();
    }
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
  // Roster kini di Postgres (tabel karyawan, kolom data JSONB dgn key HEADER
  // ASLI dari Master_Karyawan). Fallback ke Sheets bila kosong/gagal.
  let list = [];
  const sql = getSql();
  if (sql) {
    try {
      const rows = await sql`SELECT data FROM karyawan`;
      list = rows.map(x => x.data || {}).map(d => ({
        nik: String(d['NIK'] || '').trim(), nama: d['NAMA'], perusahaan: d['PERUSAHAAN'],
        jabatan: d['JABATAN'], departemen: d['DEPARTEMEN'], email: String(d['EMAIL'] || '').trim(),
      })).filter(e => e.nama);
    } catch { list = []; }
  }
  if (!list.length) {
    const rows = await getRows(ROSTER, ROSTER_SPREADSHEET_ID);
    const head = rows.shift() || [];
    const c = colIndexer(head);
    list = rows.map(r => ({
      nik: String(r[c('NIK')] || '').trim(), nama: r[c('NAMA')], perusahaan: r[c('PERUSAHAAN')],
      jabatan: r[c('JABATAN')], departemen: r[c('DEPARTEMEN')], email: String(r[c('EMAIL')] || '').trim(),
    })).filter(e => e.nama);
  }

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
  const sql = getSql();
  const { year, month } = jakartaParts(new Date());
  const suffix = '/SS/' + companyCode(perusahaan) + '/' + month + '/' + year.slice(2);
  const r = await sql`SELECT count(*)::int AS n FROM partisipasi WHERE certificate_no LIKE ${'%' + suffix}`;
  return String((r[0].n || 0) + 1).padStart(3, '0') + suffix;
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
  const sql = getSql();
  const passed = !!p.passed;
  let answerBreakdown = p.answerBreakdown;
  if (typeof answerBreakdown === 'string') {
    try { answerBreakdown = JSON.parse(answerBreakdown || '[]'); } catch (e) { answerBreakdown = []; }
  }
  const durationMs = typeof p.durationMs === 'number' ? p.durationMs : null;

  // Nomor sertifikat unik & berurutan. UNIQUE index certificate_no menolak
  // duplikat (race di Sheets dulu bisa lolos) -- retry bila kebetulan bentrok.
  let certificateNo = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    certificateNo = passed ? await nextCertNo(p.perusahaan) : null;
    try {
      await sql`
        INSERT INTO partisipasi
          (waktu, nik, nama, perusahaan, topic_code, session_id, attempt_no, score, passed,
           certificate_no, verification_token, answer_breakdown, duration_ms)
        VALUES
          (now(), ${p.nik}, ${p.nama}, ${p.perusahaan}, ${p.topicCode}, ${p.sessionId},
           ${p.attemptNo}, ${p.score}, ${passed}, ${certificateNo}, ${p.verificationToken},
           ${JSON.stringify(answerBreakdown)}::jsonb, ${durationMs})`;
      break;
    } catch (e) {
      if (String(e.code) === '23505' && passed && attempt < 4) continue; // cert bentrok → ambil nomor berikutnya
      throw e;
    }
  }
  const rankInfo = passed ? computeRank(await getResultsLite(), p.topicCode, p.nik) : null;
  return { certificateNo, rank: rankInfo ? rankInfo.rank : null, total: rankInfo ? rankInfo.total : null };
}

async function getResultsLite() {
  const sql = getSql();
  const rows = await sql`
    SELECT nik, nama, perusahaan, session_id, topic_code, passed, score,
           certificate_no, verification_token, waktu, duration_ms FROM partisipasi`;
  return rows.map(r => ({
    nik: String(r.nik || ''), nama: r.nama, perusahaan: r.perusahaan,
    sessionId: String(r.session_id || ''), topicCode: r.topic_code, passed: r.passed, score: r.score,
    certificateNo: r.certificate_no, verificationToken: r.verification_token,
    submittedAt: r.waktu ? new Date(r.waktu).toISOString() : '',
    durationMs: r.duration_ms != null ? Number(r.duration_ms) : null,
  }));
}

async function findByToken(token) {
  const sql = getSql();
  const rows = await sql`
    SELECT nama, nik, perusahaan, topic_code, certificate_no, score
    FROM partisipasi WHERE verification_token = ${token} LIMIT 1`;
  if (!rows.length) return {};
  const h = rows[0];
  return { nama: h.nama, nik: h.nik, perusahaan: h.perusahaan, topicCode: h.topic_code,
           certificateNo: h.certificate_no, score: h.score, verificationToken: token };
}

async function findExisting(nik, sessionId) {
  const sql = getSql();
  const rows = await sql`
    SELECT score, certificate_no, verification_token, waktu FROM partisipasi
    WHERE nik = ${String(nik).trim()} AND session_id = ${String(sessionId)} AND passed = true
    ORDER BY waktu DESC LIMIT 1`;
  if (!rows.length) return {};
  const h = rows[0];
  return { score: h.score, certificateNo: h.certificate_no, verificationToken: h.verification_token,
           submittedAt: h.waktu ? new Date(h.waktu).toISOString() : '' };
}

// Riwayat sertifikat milik SATU karyawan -- cuma percobaan yang LULUS,
// terbaru dulu. Publik (tidak butuh adminToken), tapi cuma pernah balas
// data 1 NIK, bukan seluruh tabel.
async function findHistory(nik) {
  const sql = getSql();
  const rows = await sql`
    SELECT nik, nama, perusahaan, topic_code, session_id, score, certificate_no,
           verification_token, waktu, duration_ms FROM partisipasi
    WHERE nik = ${String(nik || '').trim()} AND passed = true ORDER BY waktu DESC`;
  return rows.map(r => ({
    nik: String(r.nik || ''), nama: r.nama, perusahaan: r.perusahaan, topicCode: r.topic_code,
    sessionId: String(r.session_id || ''), passed: true, score: r.score,
    certificateNo: r.certificate_no, verificationToken: r.verification_token,
    submittedAt: r.waktu ? new Date(r.waktu).toISOString() : '',
    durationMs: r.duration_ms != null ? Number(r.duration_ms) : null,
  }));
}

async function listParticipations() {
  const sql = getSql();
  const rows = await sql`
    SELECT waktu, nik, nama, perusahaan, topic_code, session_id, attempt_no, score, passed,
           certificate_no, verification_token, answer_breakdown, duration_ms
    FROM partisipasi ORDER BY waktu DESC`;
  return rows.map(r => ({
    submittedAt: r.waktu ? new Date(r.waktu).toISOString() : '', nik: r.nik, nama: r.nama, perusahaan: r.perusahaan,
    topicCode: r.topic_code, sessionId: r.session_id, attemptNo: r.attempt_no,
    score: r.score, passed: r.passed, certificateNo: r.certificate_no,
    verificationToken: r.verification_token, answerBreakdown: r.answer_breakdown || [],
    durationMs: r.duration_ms != null ? Number(r.duration_ms) : null,
  }));
}

async function listTopics() {
  const sql = getSql();
  const rows = await sql`SELECT code, title, pass_threshold, material, material_image, questions FROM topik`;
  return rows.map(r => ({
    code: r.code, title: r.title, passThreshold: r.pass_threshold,
    material: r.material, materialImage: r.material_image,
    questions: Array.isArray(r.questions) ? r.questions : (r.questions || []),
  }));
}

async function listSessions() {
  const sql = getSql();
  const rows = await sql`SELECT id, topic_code, title, valid_from, valid_until, target_companies, status FROM sesi`;
  return rows.map(r => ({
    id: r.id, topicCode: r.topic_code, title: r.title,
    validFrom: r.valid_from || '', validUntil: r.valid_until || '',
    targetCompanies: String(r.target_companies || '').split(',').map(s => s.trim()).filter(Boolean),
    status: r.status,
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
      // Migrasi sekali-pakai: salin sheet Partisipasi → Neon. Aman & idempoten:
      // hanya jalan bila tabel partisipasi MASIH KOSONG (kalau sudah terisi =
      // no-op), jadi tak bisa dipakai menimpa/menghapus data. Baca dari Sheets
      // pakai kredensial runtime (yang tidak bisa diambil dari luar).
      // Endpoint migrasi (sekali-pakai, sudah selesai) kini DIKUNCI — butuh sesi admin.
      if (typeof a === 'string' && a.startsWith('migrate_') && !isAdmin(req.query.adminToken))
        return res.status(401).json({ error: 'unauthorized' });
      if (a === 'migrate_partisipasi') {
        const sql = getSql();
        const cur = await sql`SELECT count(*)::int AS n FROM partisipasi`;
        if (cur[0].n > 0) return res.json({ ok: true, already: true, count: cur[0].n });
        const rows = await getRows(RESULTS);
        const head = rows.shift() || [];
        const c = colIndexer(head);
        const toInt = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
        const toBool = v => v === true || String(v).trim().toUpperCase() === 'TRUE';
        const nz = v => { const s = String(v ?? '').trim(); return s === '' ? null : s; };
        const toJson = v => { try { return JSON.stringify(JSON.parse(String(v || '[]'))); } catch { return '[]'; } };
        let ok = 0;
        for (const r of rows) {
          const nik = nz(r[c('nik')]); if (!nik) continue;
          await sql`
            INSERT INTO partisipasi
              (waktu, nik, nama, perusahaan, topic_code, session_id, attempt_no, score, passed,
               certificate_no, verification_token, answer_breakdown, duration_ms)
            VALUES
              (${serialToISODateTime(r[c('waktu')]) || new Date().toISOString()}, ${nik}, ${nz(r[c('nama')])},
               ${nz(r[c('perusahaan')])}, ${nz(r[c('topicCode')])}, ${nz(r[c('sessionId')])},
               ${toInt(r[c('attemptNo')])}, ${toInt(r[c('score')])}, ${toBool(r[c('passed')])},
               ${nz(r[c('certificateNo')])}, ${nz(r[c('verificationToken')])},
               ${toJson(r[c('answerBreakdown')])}::jsonb, ${toInt(r[c('durationMs')])})`;
          ok++;
        }
        const after = await sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE passed) AS lulus FROM partisipasi`;
        return res.json({ ok: true, migrated: ok, total: after[0].n, lulus: after[0].lulus });
      }
      // Migrasi sekali-pakai topik + sesi (Sheets → Neon). Per-tabel empty-guard.
      if (a === 'migrate_topik_sesi') {
        const sql = getSql();
        const toInt = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
        const nz = v => { const s = String(v ?? '').trim(); return s === '' ? null : s; };
        const okJson = v => { try { JSON.parse(String(v || '[]')); return String(v || '[]'); } catch { return '[]'; } };
        let tMig = 0, sMig = 0;
        if ((await sql`SELECT count(*)::int n FROM topik`)[0].n === 0) {
          const rows = await getRows(TOPICS); const head = rows.shift() || []; const c = colIndexer(head);
          for (const r of rows) {
            const code = nz(r[c('code')]); if (!code) continue;
            await sql`
              INSERT INTO topik (code, title, pass_threshold, material, material_image, questions)
              VALUES (${code}, ${nz(r[c('title')])}, ${toInt(r[c('passThreshold')]) ?? 80}, ${nz(r[c('material')])},
                      ${nz(r[c('materialImage')])}, ${okJson(r[c('questionsJson')])}::jsonb)
              ON CONFLICT (code) DO NOTHING`;
            tMig++;
          }
        }
        if ((await sql`SELECT count(*)::int n FROM sesi`)[0].n === 0) {
          const rows = await getRows(SESSIONS); const head = rows.shift() || []; const c = colIndexer(head);
          for (const r of rows) {
            const id = nz(r[c('id')]); if (!id) continue;
            await sql`
              INSERT INTO sesi (id, topic_code, title, valid_from, valid_until, target_companies, status)
              VALUES (${id}, ${nz(r[c('topicCode')])}, ${nz(r[c('title')])},
                      ${serialToDateStr(r[c('validFrom')]) || ''}, ${serialToDateStr(r[c('validUntil')]) || ''},
                      ${String(r[c('targetCompanies')] || '')}, ${nz(r[c('status')]) || 'draft'})
              ON CONFLICT (id) DO NOTHING`;
            sMig++;
          }
        }
        const cnt = await sql`SELECT (SELECT count(*)::int FROM topik) AS topik, (SELECT count(*)::int FROM sesi) AS sesi`;
        return res.json({ ok: true, topik_migrated: tMig, sesi_migrated: sMig, topik_total: cnt[0].topik, sesi_total: cnt[0].sesi });
      }
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
        const sql = getSql();
        await sql`
          INSERT INTO topik (code, title, pass_threshold, material, material_image, questions)
          VALUES (${p.code}, ${p.title}, ${p.passThreshold}, ${p.material}, ${p.materialImage}, ${JSON.stringify(p.questions || [])}::jsonb)
          ON CONFLICT (code) DO UPDATE SET
            title = EXCLUDED.title, pass_threshold = EXCLUDED.pass_threshold,
            material = EXCLUDED.material, material_image = EXCLUDED.material_image, questions = EXCLUDED.questions`;
        return res.json({ ok: true });
      }
      if (action === 'topic_delete') { await getSql()`DELETE FROM topik WHERE code = ${p.code}`; return res.json({ ok: true }); }
      if (action === 'session_save') {
        const sql = getSql();
        await sql`
          INSERT INTO sesi (id, topic_code, title, valid_from, valid_until, target_companies, status)
          VALUES (${p.id}, ${p.topicCode}, ${p.title}, ${p.validFrom}, ${p.validUntil}, ${(p.targetCompanies || []).join(',')}, ${p.status})
          ON CONFLICT (id) DO UPDATE SET
            topic_code = EXCLUDED.topic_code, title = EXCLUDED.title,
            valid_from = EXCLUDED.valid_from, valid_until = EXCLUDED.valid_until,
            target_companies = EXCLUDED.target_companies, status = EXCLUDED.status`;
        return res.json({ ok: true });
      }
      if (action === 'session_delete') { await getSql()`DELETE FROM sesi WHERE id = ${p.id}`; return res.json({ ok: true }); }
      if (action === 'upload_image') { return res.json({ ok: true, url: await uploadImage(p) }); }
      return res.json({ ok: false });
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
