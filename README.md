# Safety Talk Digital — PT EBL

Aplikasi statis (HTML/CSS/JS murni) pengganti Safety Talk / P5M. Pekerja masuk pakai **NIK**, membaca materi, mengerjakan kuis singkat, dan bila lulus langsung mendapat **sertifikat digital ber-QR**. Cocok dipasang di tablet muster point atau dibuka via HP.

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
admin.html              Panel admin (topik, sesi, laporan)
assets/styles.css       Tampilan (identitas hazard-stripe, kartu sertifikat)
assets/config.js        KONFIGURASI + konten kuis (topik, soal, sesi) + data contoh
assets/api.js           Lapisan data: mode 'mock' & 'apps_script'
assets/app.js           Alur aplikasi kiosk
assets/admin.js         Alur panel admin
```

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

Tiga tab:
- **Topik** — tambah/edit/hapus topik: kode, judul, ambang lulus, materi (HTML), dan bank soal (pertanyaan + 4 opsi + jawaban benar).
- **Sesi** — jadwalkan topik untuk tampil di kiosk: rentang tanggal berlaku, target perusahaan (opsional), status `draft`/`published`. Hanya sesi `published` & masih dalam rentang tanggal yang muncul di kiosk.
- **Laporan** — rekap semua partisipasi (nama, NIK, topik, skor, lulus/tidak, no. sertifikat), dengan tombol unduh CSV.

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
   - `Topics`: `code | title | passThreshold | material | questionsJson`
   - `Sessions`: `id | topicCode | title | validFrom | validUntil | targetCompanies | status`
3. **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access: Anyone*. Salin URL.
4. Di `assets/config.js`: set `dataSource: 'apps_script'` dan tempel URL ke `appsScriptUrl`.

### Contoh Apps Script

```javascript
const SS_ID   = 'ISI_ID_SPREADSHEET';
const ROSTER  = 'Master_Karyawan';
const RESULTS = 'Partisipasi';
const TOPICS  = 'Topics';
const SESSIONS = 'Sessions';

function doGet(e) {
  const a = e.parameter.action;
  if (a === 'employee')       return json(findEmployee(e.parameter.nik));
  if (a === 'verify')         return json(findByToken(e.parameter.token));
  if (a === 'topics')         return json(listTopics());
  if (a === 'sessions')       return json(listSessions());
  if (a === 'participations') return json(listParticipations());
  return json({});
}
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const p = body.payload;
  if (body.action === 'participation')  { appendResult(p); return json({ ok: true }); }
  if (body.action === 'topic_save')     { saveRow(TOPICS, 'code', p.code, [p.code, p.title, p.passThreshold, p.material, JSON.stringify(p.questions)]); return json({ ok: true }); }
  if (body.action === 'topic_delete')   { deleteRow(TOPICS, 'code', p.code); return json({ ok: true }); }
  if (body.action === 'session_save')   { saveRow(SESSIONS, 'id', p.id, [p.id, p.topicCode, p.title, p.validFrom, p.validUntil, (p.targetCompanies || []).join(','), p.status]); return json({ ok: true }); }
  if (body.action === 'session_delete') { deleteRow(SESSIONS, 'id', p.id); return json({ ok: true }); }
  return json({ ok: false });
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
function appendResult(p) {
  SpreadsheetApp.openById(SS_ID).getSheetByName(RESULTS).appendRow([
    new Date(), p.nik, p.nama, p.perusahaan, p.topicCode, p.sessionId,
    p.attemptNo, p.score, p.passed, p.certificateNo, p.verificationToken,
  ]);
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
function listParticipations() {
  const rows = SpreadsheetApp.openById(SS_ID).getSheetByName(RESULTS).getDataRange().getValues();
  const head = rows.shift(); const c = n => head.indexOf(n);
  return rows.map(r => ({
    submittedAt: r[c('waktu')], nik: r[c('nik')], nama: r[c('nama')], perusahaan: r[c('perusahaan')],
    topicCode: r[c('topicCode')], sessionId: r[c('sessionId')], attemptNo: r[c('attemptNo')],
    score: r[c('score')], passed: r[c('passed')], certificateNo: r[c('certificateNo')],
    verificationToken: r[c('verificationToken')],
  })).reverse();
}
function listTopics() {
  const rows = SpreadsheetApp.openById(SS_ID).getSheetByName(TOPICS).getDataRange().getValues();
  const head = rows.shift(); const c = n => head.indexOf(n);
  return rows.map(r => ({
    code: r[c('code')], title: r[c('title')], passThreshold: r[c('passThreshold')],
    material: r[c('material')], questions: JSON.parse(r[c('questionsJson')] || '[]'),
  }));
}
function listSessions() {
  const rows = SpreadsheetApp.openById(SS_ID).getSheetByName(SESSIONS).getDataRange().getValues();
  const head = rows.shift(); const c = n => head.indexOf(n);
  return rows.map(r => ({
    id: r[c('id')], topicCode: r[c('topicCode')], title: r[c('title')],
    validFrom: r[c('validFrom')], validUntil: r[c('validUntil')],
    targetCompanies: String(r[c('targetCompanies')] || '').split(',').map(s => s.trim()).filter(Boolean),
    status: r[c('status')],
  }));
}
// Simpan (tambah/timpa) baris berdasarkan kolom kunci; hapus baris via deleteRow.
function saveRow(sheetName, keyCol, keyVal, rowValues) {
  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName(sheetName);
  const rows = sheet.getDataRange().getValues();
  const head = rows[0]; const ci = head.indexOf(keyCol);
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

- **Privasi roster.** Jangan publikasikan seluruh isi Sheet karyawan ke web publik. Dengan pola Apps Script di atas, yang keluar hanya data 1 orang saat NIK dicari — bukan seluruh daftar. Hindari menaruh NIK/no. HP di file yang di-commit publik.
- **Keamanan login rendah.** "Login" hanya pencocokan NIK, tanpa password — memang sesuai kebutuhan P5M yang ringan, tapi bukan autentikasi kuat. Jangan pakai pola ini untuk data sensitif.
- **Panel Admin bukan autentikasi aman.** `admin.html` dikunci dengan satu password yang dicek di browser (`CONFIG.admin.password` di `assets/config.js`) — siapa pun yang membuka file itu (mis. lewat "View Source" di GitHub Pages) bisa melihat password-nya. Cukup untuk mencegah orang iseng, bukan untuk melindungi data sensitif. Ganti passwordnya, dan kalau butuh keamanan lebih, taruh `admin.html` di balik autentikasi level hosting (bukan GitHub Pages publik) atau jangan sertakan di deployment publik sama sekali.
- **Tanpa Apps Script, hasil tidak terekam terpusat.** Mode `mock` menyimpan hasil hanya di browser perangkat itu (localStorage). Untuk rekap compliance lintas perangkat, sambungkan Apps Script.
- **Verifikasi QR** di mode `mock` hanya berlaku di perangkat yang sama. Verifikasi lintas perangkat butuh Apps Script.
- **PDF sertifikat** dibuat di browser (html2canvas + jsPDF); hasil mengikuti tampilan kartu di layar.

---

## Alur

Masuk (NIK) → Konfirmasi identitas → Pilih sesi aktif → Baca materi → Kuis (soal acak) → Hasil (lulus/gagal) → Sertifikat + QR → rekam partisipasi.
