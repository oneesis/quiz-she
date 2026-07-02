# Sharing Session Digital — PT EBL

Aplikasi statis (HTML/CSS/JS murni) untuk Sharing Session. Pekerja masuk pakai **NIK**, membaca materi, mengerjakan kuis singkat, dan bila lulus langsung mendapat **sertifikat digital ber-QR**. Cocok dipasang di tablet muster point atau dibuka via HP.

Tidak butuh server aplikasi. Bisa langsung di-hosting di **GitHub Pages**.

---

## Jalankan lokal

Buka `index.html` lewat server statis apa pun (jangan `file://` karena beberapa browser memblok modul/QR):

```bash
# pilih salah satu
python3 -m http.server 8080
npx serve .
```

Buka `http://localhost:8080`. Mode default = **demo (mock)**: pakai data contoh di `assets/config.js`.
NIK contoh: `02-010218-001` atau `SCI-001`.

---

## Deploy ke GitHub Pages

1. Commit semua file, push ke repo GitHub.
2. **Settings → Pages → Source: Deploy from a branch**, pilih `main` / `root`.
3. Situs terbit di `https://<user>.github.io/<repo>/`.

---

## Struktur file

```
index.html             Kerangka semua layar kiosk
admin.html              Panel admin (dashboard, topik, sesi, laporan, karyawan)
assets/styles.css       Tampilan kiosk (identitas hazard-stripe, kartu sertifikat)
assets/config.js        KONFIGURASI + konten kuis (topik, soal, sesi) + data contoh
assets/api.js           Lapisan data: mode 'mock' & 'apps_script'
assets/app.js           Alur aplikasi kiosk
assets/admin.js         Alur panel admin
```

Kiosk (`index.html`) dan Panel Admin (`admin.html`) sengaja pakai identitas visual berbeda: kiosk pakai `assets/styles.css` bertema "hazard stripe" untuk tablet muster point, sedangkan admin pakai [Tailwind CSS via CDN](https://tailwindcss.com) langsung di `admin.html` dengan tema navy/kuning ala dashboard SaaS korporat — tidak ada langkah build, tetap situs statis murni. Keduanya tetap berbagi `assets/config.js` dan `assets/api.js` yang sama.

---

## Mengubah konten kuis

Ada dua cara mengubah topik, materi, soal, dan jadwal sesi:

1. **Panel Admin** (`admin.html`) — cara sehari-hari. Login, lalu kelola topik/sesi/laporan dari browser. Lihat bagian [Panel Admin](#panel-admin) di bawah.
2. **Edit `assets/config.js` langsung** lalu commit — dipakai untuk data bawaan (`SAMPLE.topics` / `SAMPLE.sessions`) yang tampil sebelum ada perubahan dari Panel Admin, atau kalau kamu memang lebih suka konten ikut terversion di Git. Tambah topik di `SAMPLE.topics`, atur soal di `questions` (`correct` = indeks jawaban benar, mulai 0), dan terbitkan lewat `SAMPLE.sessions`.

> Di mode `mock`, perubahan dari Panel Admin tersimpan di localStorage browser itu saja — **menimpa** (bukan mengubah) `SAMPLE.topics`/`SAMPLE.sessions` di perangkat itu, dan tidak ikut ter-commit ke Git maupun tersinkron ke perangkat kiosk lain. Untuk perubahan yang berlaku di semua kiosk, pakai mode `apps_script`.

Setelan umum di `CONFIG`:
- `questionsPerAttempt` — jumlah soal diacak per percobaan
- `passThresholdDefault` — ambang lulus (%)
- `minMaterialSeconds` — durasi minimum baca materi sebelum kuis terbuka
- `idleResetSeconds` — auto-reset kiosk saat idle
- `showDemoHint` — **matikan (`false`) di produksi** agar NIK contoh tak muncul
- `admin.password` — password gerbang Panel Admin. **Wajib ganti sebelum deploy** (lihat [Batasan](#batasan-yang-perlu-kamu-tahu-jujur))

---

## Panel Admin

Buka `admin.html` (mis. `http://localhost:8080/admin.html` atau `https://<user>.github.io/<repo>/admin.html`). Tidak ada tautan ke sana dari kiosk — sengaja, supaya tidak muncul di layar tablet muster point. Password diatur di `CONFIG.admin.password` (`assets/config.js`).

Navigasi lewat sidebar kiri, lima menu:
- **Dashboard** — kartu ringkasan (total karyawan, total topik, sesi aktif, total partisipasi, rata-rata skor, tingkat kelulusan) dan daftar aktivitas terbaru. Semua angka dihitung dari data nyata yang sudah tercatat — tidak ada data contoh/placeholder.
- **Topik** — tambah/edit/hapus topik: kode, judul, ambang lulus, gambar materi (opsional), materi (teks biasa), dan bank soal (ketik manual atau impor CSV). Detail di bawah.
- **Sesi** — jadwalkan topik untuk tampil di kiosk: rentang tanggal berlaku, target perusahaan (opsional), status `draft`/`published`. Hanya sesi `published` & masih dalam rentang tanggal yang muncul di kiosk.
- **Laporan** — ringkasan per perusahaan (jumlah peserta, lulus/belum, rata-rata skor, % kelulusan) di atas, lalu tabel detail per peserta yang bisa difilter per perusahaan, dengan tombol unduh CSV.
- **Karyawan** — daftar seluruh karyawan (nama, NIK, perusahaan, jabatan, departemen) dengan pencarian. Baca saja — untuk mengubah roster, edit `SAMPLE.employees` di `config.js` (mode mock) atau tab `Master_Karyawan` di Sheet (mode apps_script).

### Format materi

Materi ditulis sebagai **teks biasa**, bukan HTML — aman dari kesalahan tag dan tidak bisa disalahgunakan untuk menyuntik HTML/script. Format ringan:
- Setiap baris = satu paragraf.
- Baris diawali `- ` = butir bullet (baris berurutan yang diawali `- ` otomatis jadi satu daftar).
- Baris diawali `## ` = subjudul.

Contoh:
```
Alat Pelindung Diri (APD) adalah pertahanan terakhir ketika bahaya tidak bisa dihilangkan dari sumbernya.
## APD wajib di area operasi tambang
- Helm keselamatan — lindungi kepala dari benturan.
- Sepatu safety — pelindung ujung baja.
## Prinsip pemakaian
Periksa kondisi APD sebelum dipakai.
```

### Gambar materi

Di editor topik ada field **Gambar Materi** (opsional) — pilih file dari perangkat, otomatis terupload ke folder Drive **"Quiz SHE Uploads"** (dibuat otomatis saat pertama kali dipakai) lewat Apps Script, lalu link-nya tersimpan di kolom `materialImage`. Di kiosk, gambar tampil di atas teks materi dan bisa diketuk untuk **diperbesar** (lightbox layar penuh, ketuk gambar untuk zoom in/out). Upload hanya berfungsi di mode `apps_script` — di mode `mock` tidak ada tempat penyimpanan file, jadi kontrol upload akan menampilkan pesan bahwa fitur ini tidak tersedia.

### Impor soal lewat CSV

Alih-alih mengetik soal satu per satu, admin bisa siapkan soal di Excel/Google Sheets lalu impor sekaligus:
1. Klik **Template CSV** di editor topik untuk mengunduh contoh formatnya.
2. Isi baris demi baris di Excel/Sheets, kolom: `pertanyaan, opsiA, opsiB, opsiC, opsiD, jawaban` (`jawaban` diisi huruf `A`/`B`/`C`/`D`).
3. Export/simpan sebagai `.csv`, lalu klik **Impor CSV** di editor topik dan pilih file itu.

Soal yang berhasil diparsing ditambahkan ke bank soal yang sudah ada (tidak menimpa); baris dengan data tidak lengkap atau huruf jawaban tidak valid dilewati dan dilaporkan jumlahnya.

---

## Menyambung ke Google Sheet (mode `apps_script`)

Situs statis tidak bisa membaca/menulis Sheet privat sendiri secara aman. Jembatannya = **Google Apps Script Web App** yang menempel pada Sheet-mu. Repo tetap murni HTML/CSS/JS.

**Pembagian peran:**
- **Roster karyawan** → dibaca dari Sheet (tab `Master_Karyawan`).
- **Konten kuis (topik/sesi)** → bawaan dari `config.js` (di repo), tapi begitu Panel Admin dipakai dalam mode ini, topik/sesi juga dibaca & ditulis lewat Sheet (tab `Topics` / `Sessions`) supaya semua kiosk melihat perubahan yang sama.
- **Hasil / partisipasi** → ditulis balik ke Sheet (tab `Partisipasi`) untuk rekap compliance & laporan di Panel Admin.

### Langkah
1. Di Google Sheet: **Ekstensi → Apps Script**, tempel skrip di bawah, isi `SS_ID`.
2. Buat tab-tab berikut dengan header persis di baris 1:
   - `Partisipasi`: `waktu | nik | nama | perusahaan | topicCode | sessionId | attemptNo | score | passed | certificateNo | verificationToken`
   - `Topics`: `code | title | passThreshold | material | materialImage | questionsJson`
   - `Sessions`: `id | topicCode | title | validFrom | validUntil | targetCompanies | status`
3. **Project Settings → Script Properties**, tambah `ADMIN_TOKEN` dengan nilai **sama persis** dengan `CONFIG.admin.password` di `assets/config.js`. Ini dipakai server-side untuk menolak aksi admin (simpan/hapus topik & sesi, lihat daftar karyawan) dari siapa pun yang tidak login lewat `admin.html`.
4. **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access: Anyone*. Salin URL.
5. Di `assets/config.js`: set `dataSource: 'apps_script'` dan tempel URL ke `appsScriptUrl`.

### Contoh Apps Script

```javascript
const SS_ID   = 'ISI_ID_SPREADSHEET';
const ROSTER  = 'Master_Karyawan';
const RESULTS = 'Partisipasi';
const TOPICS  = 'Topics';
const SESSIONS = 'Sessions';

function isAdmin(token) {
  return !!token && token === PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
}

// Cache singkat (script-wide) untuk data yang jarang berubah -- tiap
// panggilan Apps Script itu lambat (~1-3 detik) karena overhead platform,
// jadi hindari scan ulang sheet penuh kalau data yang sama baru diminta.
function cacheGet_(key) {
  try { return CacheService.getScriptCache().get(key); } catch (e) { return null; }
}
function cachePut_(key, value, ttlSeconds) {
  try { CacheService.getScriptCache().put(key, value, ttlSeconds); } catch (e) { /* diabaikan */ }
}
function cacheClear_(key) {
  try { CacheService.getScriptCache().remove(key); } catch (e) { /* diabaikan */ }
}

// Sheet mengetik ulang teks "2026-07-01" yang ditulis lewat form admin
// menjadi sel bertipe Date secara otomatis -- getValues() lalu mengembalikan
// objek Date asli (bukan teksnya), yang kalau dikirim sebagai JSON jadi
// "2026-07-01T07:00:00.000Z". Kode kiosk/admin menempelkan "T00:00:00" di
// belakang validFrom/validUntil untuk parsing tanggal; ditempel ke string
// yang sudah lengkap begini jadi Invalid Date, sesi pun dianggap tidak aktif
// selamanya. Normalisasi ke "yyyy-MM-dd" polos di sini, satu tempat, supaya
// semua pemanggil (kiosk & admin) selalu terima format yang konsisten.
function toDateStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v || '').slice(0, 10);
}

function doGet(e) {
  const a = e.parameter.action;
  if (a === 'employee')       return json(findEmployee(e.parameter.nik));
  if (a === 'verify')         return json(findByToken(e.parameter.token));
  if (a === 'topics')         return json(listTopics());
  if (a === 'sessions')       return json(listSessions());
  if (a === 'existing')       return json(findExisting(e.parameter.nik, e.parameter.sessionId));
  // 'participations' berisi nama+NIK+skor semua karyawan -- hanya untuk admin,
  // beda dengan 'employee'/'existing' yang cuma balas data 1 orang.
  if (a === 'participations') return isAdmin(e.parameter.adminToken) ? json(listParticipations()) : json([]);
  if (a === 'employees')      return isAdmin(e.parameter.adminToken) ? json(listEmployees()) : json([]);
  return json({});
}
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const p = body.payload;
  if (body.action === 'participation') { return json({ ok: true, certificateNo: appendResult(p) }); }
  if (!isAdmin(body.adminToken)) return json({ ok: false, error: 'unauthorized' });
  if (body.action === 'topic_save')     { saveRow(TOPICS, 'code', p.code, { code: p.code, title: p.title, passThreshold: p.passThreshold, material: p.material, materialImage: p.materialImage, questionsJson: JSON.stringify(p.questions) }); cacheClear_('topics_v1'); return json({ ok: true }); }
  if (body.action === 'topic_delete')   { deleteRow(TOPICS, 'code', p.code); cacheClear_('topics_v1'); return json({ ok: true }); }
  if (body.action === 'session_save')   { saveRow(SESSIONS, 'id', p.id, { id: p.id, topicCode: p.topicCode, title: p.title, validFrom: p.validFrom, validUntil: p.validUntil, targetCompanies: (p.targetCompanies || []).join(','), status: p.status }); cacheClear_('sessions_v1'); return json({ ok: true }); }
  if (body.action === 'session_delete') { deleteRow(SESSIONS, 'id', p.id); cacheClear_('sessions_v1'); return json({ ok: true }); }
  if (body.action === 'upload_image')   { return json({ ok: true, url: uploadImage_(p) }); }
  return json({ ok: false });
}

// Simpan gambar materi ke folder Drive "Quiz SHE Uploads" (dibuat otomatis
// saat pertama kali dipakai) dan kembalikan URL yang bisa dipakai langsung
// sebagai <img src>. Pakai endpoint "thumbnail" (bukan "uc?export=view") --
// yang terakhir sering gagal dimuat sebagai <img> karena Drive menampilkan
// halaman peringatan alih-alih gambar langsung, apalagi kalau file sering
// diakses (kasus khas kiosk banyak karyawan). "thumbnail" redirect ke CDN
// gambar Google (lh3.googleusercontent.com) yang jauh lebih andal.
function uploadImage_(p) {
  const folder = getUploadsFolder_();
  const bytes = Utilities.base64Decode(p.base64);
  const blob = Utilities.newBlob(bytes, p.mimeType || 'image/jpeg', p.filename || 'materi.jpg');
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w2000';
}
function getUploadsFolder_() {
  const name = 'Quiz SHE Uploads';
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function listEmployees() {
  const cached = cacheGet_('employees_v1');
  if (cached) return JSON.parse(cached);
  const rows = SpreadsheetApp.openById(SS_ID).getSheetByName(ROSTER).getDataRange().getValues();
  const head = rows.shift(); const c = n => head.indexOf(n);
  // Sengaja tidak menyertakan "NO WHATSAPP" — daftar ini sudah lebih sensitif
  // daripada lookup 1-NIK biasa, jangan tambah data pribadi yang tidak perlu.
  // Karyawan tanpa NIK TETAP disertakan (bukan difilter) supaya admin bisa
  // melihat & melengkapi datanya lewat tab Karyawan di panel admin.
  const out = rows.map(r => ({
    nik: String(r[c('NIK')] || '').trim(), nama: r[c('NAMA')], perusahaan: r[c('PERUSAHAAN')],
    jabatan: r[c('JABATAN')], departemen: r[c('DEPARTEMEN')],
  })).filter(e => e.nama);
  cachePut_('employees_v1', JSON.stringify(out), 120);
  return out;
}

function findEmployee(nik) {
  const rows = SpreadsheetApp.openById(SS_ID).getSheetByName(ROSTER).getDataRange().getValues();
  const head = rows.shift(); const c = n => head.indexOf(n);
  const hit = rows.find(r => String(r[c('NIK')]).trim() === String(nik).trim());
  return hit ? {
    nik: String(hit[c('NIK')]), nama: hit[c('NAMA')], perusahaan: hit[c('PERUSAHAAN')],
    jabatan: hit[c('JABATAN')], departemen: hit[c('DEPARTEMEN')],
  } : {};
}
// Nomor sertifikat dihitung & baris ditulis dalam satu lock supaya dua
// kiosk yang submit bersamaan tidak pernah dapat nomor yang sama.
function appendResult(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName(RESULTS);
    const certificateNo = p.passed ? nextCertNo_(sheet, p.perusahaan) : null;
    sheet.appendRow([
      new Date(), p.nik, p.nama, p.perusahaan, p.topicCode, p.sessionId,
      p.attemptNo, p.score, p.passed, certificateNo, p.verificationToken, p.answerBreakdown || '',
    ]);
    return certificateNo;
  } finally {
    lock.releaseLock();
  }
}
function nextCertNo_(sheet, perusahaan) {
  const tz = Session.getScriptTimeZone();
  const suffix = '/SS/' + companyCode_(perusahaan) + '/' + Utilities.formatDate(new Date(), tz, 'MM/yy');
  const rows = sheet.getDataRange().getValues();
  const head = rows.length ? rows.shift() : [];
  const ci = head.indexOf('certificateNo');
  const count = rows.filter(r => r[ci] && String(r[ci]).indexOf(suffix) !== -1).length;
  return Utilities.formatString('%03d', count + 1) + suffix;
}
function companyCode_(perusahaan) {
  return String(perusahaan || '').replace(/^PT\s+/i, '').trim().split(/\s+/)[0].toUpperCase() || 'NA';
}
function findByToken(token) {
  const rows = SpreadsheetApp.openById(SS_ID).getSheetByName(RESULTS).getDataRange().getValues();
  const head = rows.shift(); const c = n => head.indexOf(n);
  const hit = rows.find(r => r[c('verificationToken')] === token);
  return hit ? {
    nama: hit[c('nama')], nik: hit[c('nik')], perusahaan: hit[c('perusahaan')],
    certificateNo: hit[c('certificateNo')], score: hit[c('score')], verificationToken: token,
  } : {};
}

// Percobaan LULUS paling baru milik satu NIK untuk satu sesi -- dipakai kiosk
// supaya karyawan yang sudah lulus tidak perlu mengulang kuis, cukup lihat
// sertifikat lamanya. Hanya balas data 1 orang (bukan seluruh tabel).
function findExisting(nik, sessionId) {
  const rows = SpreadsheetApp.openById(SS_ID).getSheetByName(RESULTS).getDataRange().getValues();
  const head = rows.shift(); const c = n => head.indexOf(n);
  const hits = rows.filter(r =>
    String(r[c('nik')]).trim() === String(nik).trim() &&
    String(r[c('sessionId')]) === String(sessionId) &&
    r[c('passed')]);
  if (!hits.length) return {};
  const hit = hits[hits.length - 1];
  return {
    score: hit[c('score')], certificateNo: hit[c('certificateNo')],
    verificationToken: hit[c('verificationToken')], submittedAt: hit[c('waktu')],
  };
}
function listParticipations() {
  const rows = SpreadsheetApp.openById(SS_ID).getSheetByName(RESULTS).getDataRange().getValues();
  const head = rows.shift(); const c = n => head.indexOf(n);
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
function listTopics() {
  const cached = cacheGet_('topics_v1');
  if (cached) return JSON.parse(cached);
  const rows = SpreadsheetApp.openById(SS_ID).getSheetByName(TOPICS).getDataRange().getValues();
  const head = rows.shift(); const c = n => head.indexOf(n);
  const out = rows.map(r => ({
    code: r[c('code')], title: r[c('title')], passThreshold: r[c('passThreshold')],
    material: r[c('material')], materialImage: r[c('materialImage')],
    questions: JSON.parse(r[c('questionsJson')] || '[]'),
  }));
  cachePut_('topics_v1', JSON.stringify(out), 60);
  return out;
}
function listSessions() {
  const cached = cacheGet_('sessions_v1');
  if (cached) return JSON.parse(cached);
  const rows = SpreadsheetApp.openById(SS_ID).getSheetByName(SESSIONS).getDataRange().getValues();
  const head = rows.shift(); const c = n => head.indexOf(n);
  const out = rows.map(r => ({
    id: r[c('id')], topicCode: r[c('topicCode')], title: r[c('title')],
    validFrom: toDateStr_(r[c('validFrom')]), validUntil: toDateStr_(r[c('validUntil')]),
    targetCompanies: String(r[c('targetCompanies')] || '').split(',').map(s => s.trim()).filter(Boolean),
    status: r[c('status')],
  }));
  cachePut_('sessions_v1', JSON.stringify(out), 60);
  return out;
}
// Simpan (tambah/timpa) baris berdasarkan kolom kunci, mengisi tiap kolom
// sesuai NAMA header (bukan posisi). valuesByName: { namaKolom: nilai, ... }
function saveRow(sheetName, keyCol, keyVal, valuesByName) {
  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName(sheetName);
  const rows = sheet.getDataRange().getValues();
  const head = rows[0]; const ci = head.indexOf(keyCol);
  const rowValues = head.map(h => (h in valuesByName ? valuesByName[h] : ''));
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][ci]) === String(keyVal)) { sheet.getRange(i + 1, 1, 1, rowValues.length).setValues([rowValues]); return; }
  }
  sheet.appendRow(rowValues);
}
function deleteRow(sheetName, keyCol, keyVal) {
  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName(sheetName);
  const rows = sheet.getDataRange().getValues();
  const head = rows[0]; const ci = head.indexOf(keyCol);
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][ci]) === String(keyVal)) { sheet.deleteRow(i + 1); return; }
  }
}
function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
```

> Jika muncul error CORS, pastikan deployment memakai *Who has access: Anyone* dan URL yang dipakai adalah URL `/exec` (bukan `/dev`).

---

## Batasan yang perlu kamu tahu (jujur)

- **Privasi roster.** Jangan publikasikan seluruh isi Sheet karyawan ke web publik. Dengan pola Apps Script di atas, aksi publik (`employee`, `verify`, `existing`) hanya membalas data 1 orang/1 sesi — bukan seluruh daftar. Aksi yang membongkar banyak data sekaligus (`employees`, `participations`) mensyaratkan `adminToken` yang cocok. Hindari menaruh NIK/no. HP di file yang di-commit publik.
- **Keamanan login rendah.** "Login" hanya pencocokan NIK, tanpa password — memang sesuai kebutuhan kiosk yang ringan, tapi bukan autentikasi kuat. Jangan pakai pola ini untuk data sensitif.
- **Panel Admin bukan autentikasi aman.** `admin.html` dikunci dengan satu password yang dicek di browser (`CONFIG.admin.password` di `assets/config.js`) — siapa pun yang membuka file itu (mis. lewat "View Source" di GitHub Pages) bisa melihat password-nya. Mode `apps_script` menambah pengecekan `ADMIN_TOKEN` di sisi server untuk aksi tulis & daftar karyawan, tapi karena token yang dikirim **adalah** password yang sama yang tersimpan di `config.js` publik, ini hanya menaikkan sedikit dari "bisa ditulis siapa saja" menjadi "perlu tahu password yang sudah terpampang di source" — bukan keamanan yang sebenarnya. Cukup untuk mencegah orang iseng, bukan untuk melindungi data sensitif. Kalau butuh keamanan sungguhan, taruh `admin.html` di balik autentikasi level hosting (bukan GitHub Pages publik) atau bangun alur login yang tidak menyimpan rahasianya di kode klien.
- **Tanpa Apps Script, hasil tidak terekam terpusat.** Mode `mock` menyimpan hasil hanya di browser perangkat itu (localStorage). Untuk rekap compliance lintas perangkat, sambungkan Apps Script.
- **Verifikasi QR** di mode `mock` hanya berlaku di perangkat yang sama. Verifikasi lintas perangkat butuh Apps Script.
- **PDF sertifikat** dibuat di browser (html2canvas + jsPDF); hasil mengikuti tampilan kartu di layar.

---

## Alur

Masuk (NIK) → Konfirmasi identitas → Pilih sesi aktif → Baca materi → Kuis (soal acak) → Hasil (lulus/gagal) → Sertifikat + QR → rekam partisipasi.

Kalau karyawan sudah pernah **lulus** sesi yang sama sebelumnya, kartu sesi menampilkan badge "Sudah lulus" dan langsung membuka sertifikat yang sudah ada saat diklik — tidak perlu mengulang materi/kuis. Percobaan yang belum lulus tidak dianggap "sudah selesai", jadi tetap bisa dicoba lagi seperti biasa.
