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
index.html            Kerangka semua layar
assets/styles.css      Tampilan (identitas hazard-stripe, kartu sertifikat)
assets/config.js       KONFIGURASI + konten kuis (topik, soal, sesi) + data contoh
assets/api.js          Lapisan data: mode 'mock' & 'apps_script'
assets/app.js          Alur aplikasi
```

---

## Mengubah konten kuis

Konten kuis (topik, materi, soal, jadwal sesi) diedit di **`assets/config.js`** lalu di-commit — jadi konten ikut terversion di Git. Tambah topik di `SAMPLE.topics`, atur soal di `questions` (`correct` = indeks jawaban benar, mulai 0), dan terbitkan lewat `SAMPLE.sessions`.

Setelan umum di `CONFIG`:
- `questionsPerAttempt` — jumlah soal diacak per percobaan
- `passThresholdDefault` — ambang lulus (%)
- `minMaterialSeconds` — durasi minimum baca materi sebelum kuis terbuka
- `idleResetSeconds` — auto-reset kiosk saat idle
- `showDemoHint` — **matikan (`false`) di produksi** agar NIK contoh tak muncul

---

## Menyambung ke Google Sheet (mode `apps_script`)

Situs statis tidak bisa membaca/menulis Sheet privat sendiri secara aman. Jembatannya = **Google Apps Script Web App** yang menempel pada Sheet-mu. Repo tetap murni HTML/CSS/JS.

**Pembagian peran:**
- **Roster karyawan** → dibaca dari Sheet (tab `Master_Karyawan`).
- **Konten kuis** → tetap di `config.js` (di repo).
- **Hasil / partisipasi** → ditulis balik ke Sheet (tab `Partisipasi`) untuk rekap compliance.

### Langkah
1. Di Google Sheet: **Ekstensi → Apps Script**, tempel skrip di bawah, isi `SS_ID`.
2. Buat tab `Partisipasi` dengan header baris 1:
   `waktu | nik | nama | perusahaan | topicCode | sessionId | attemptNo | score | passed | certificateNo | verificationToken`
3. **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access: Anyone*. Salin URL.
4. Di `assets/config.js`: set `dataSource: 'apps_script'` dan tempel URL ke `appsScriptUrl`.

### Contoh Apps Script

```javascript
const SS_ID   = 'ISI_ID_SPREADSHEET';
const ROSTER  = 'Master_Karyawan';
const RESULTS = 'Partisipasi';

function doGet(e) {
  const a = e.parameter.action;
  if (a === 'employee') return json(findEmployee(e.parameter.nik));
  if (a === 'verify')   return json(findByToken(e.parameter.token));
  return json({});
}
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.action === 'participation') { appendResult(body.payload); return json({ ok: true }); }
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
function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
```

> Jika muncul error CORS, pastikan deployment memakai *Who has access: Anyone* dan URL yang dipakai adalah URL `/exec` (bukan `/dev`).

---

## Batasan yang perlu kamu tahu (jujur)

- **Privasi roster.** Jangan publikasikan seluruh isi Sheet karyawan ke web publik. Dengan pola Apps Script di atas, yang keluar hanya data 1 orang saat NIK dicari — bukan seluruh daftar. Hindari menaruh NIK/no. HP di file yang di-commit publik.
- **Keamanan login rendah.** "Login" hanya pencocokan NIK, tanpa password — memang sesuai kebutuhan P5M yang ringan, tapi bukan autentikasi kuat. Jangan pakai pola ini untuk data sensitif.
- **Tanpa Apps Script, hasil tidak terekam terpusat.** Mode `mock` menyimpan hasil hanya di browser perangkat itu (localStorage). Untuk rekap compliance lintas perangkat, sambungkan Apps Script.
- **Verifikasi QR** di mode `mock` hanya berlaku di perangkat yang sama. Verifikasi lintas perangkat butuh Apps Script.
- **PDF sertifikat** dibuat di browser (html2canvas + jsPDF); hasil mengikuti tampilan kartu di layar.

---

## Alur

Masuk (NIK) → Konfirmasi identitas → Pilih sesi aktif → Baca materi → Kuis (soal acak) → Hasil (lulus/gagal) → Sertifikat + QR → rekam partisipasi.
