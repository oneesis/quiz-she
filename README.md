# Sharing Session Digital — PT EBL

Aplikasi statis (HTML/CSS/JS murni) untuk Sharing Session. Pekerja masuk pakai **NIK**, membaca materi, mengerjakan kuis singkat, dan bila lulus langsung mendapat **sertifikat digital ber-QR**. Cocok dipasang di tablet muster point atau dibuka via HP.

Tidak butuh server aplikasi. Bisa langsung di-hosting di **Vercel** (atau hosting statis lain).

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

## Deploy ke Vercel

Situs statis murni (tanpa build step), jadi Vercel bisa langsung menyajikan file apa adanya tanpa konfigurasi tambahan.

1. Commit semua file, push ke repo GitHub.
2. Di [vercel.com](https://vercel.com), **Add New → Project**, pilih repo ini dari GitHub.
3. Framework Preset: **Other** (bukan build step apa pun, biarkan Build Command & Output Directory kosong).
4. **Deploy**. Situs terbit di `https://<nama-project>.vercel.app`, dan otomatis redeploy tiap ada push ke `main`.

Kalau sebelumnya pakai GitHub Pages, matikan di **Settings → Pages → Build and deployment → Source: None** setelah Vercel dipastikan jalan normal, supaya tidak ada dua situs aktif berbeda versi.

---

## Struktur file

```
index.html             Kerangka semua layar kiosk
admin.html              Panel admin (dashboard, topik, sesi, laporan, karyawan)
assets/styles.css       Tampilan kiosk (identitas hazard-stripe, kartu sertifikat)
assets/config.js        KONFIGURASI + konten kuis (topik, soal, sesi) + data contoh
assets/api.js           Lapisan data: mode 'mock' & 'sheets'
api/data.js             Backend (Vercel serverless function) -- baca/tulis Google Sheet
assets/app.js           Alur aplikasi kiosk
assets/admin.js         Alur panel admin
```

Kiosk (`index.html`) dan Panel Admin (`admin.html`) sengaja pakai identitas visual berbeda: kiosk pakai `assets/styles.css` bertema "hazard stripe" untuk tablet muster point, sedangkan admin pakai [Tailwind CSS via CDN](https://tailwindcss.com) langsung di `admin.html` dengan tema navy/kuning ala dashboard SaaS korporat — tidak ada langkah build, tetap situs statis murni. Keduanya tetap berbagi `assets/config.js` dan `assets/api.js` yang sama.

---

## Mengubah konten kuis

Ada dua cara mengubah topik, materi, soal, dan jadwal sesi:

1. **Panel Admin** (`admin.html`) — cara sehari-hari. Login, lalu kelola topik/sesi/laporan dari browser. Lihat bagian [Panel Admin](#panel-admin) di bawah.
2. **Edit `assets/config.js` langsung** lalu commit — dipakai untuk data bawaan (`SAMPLE.topics` / `SAMPLE.sessions`) yang tampil sebelum ada perubahan dari Panel Admin, atau kalau kamu memang lebih suka konten ikut terversion di Git. Tambah topik di `SAMPLE.topics`, atur soal di `questions` (`correct` = indeks jawaban benar, mulai 0), dan terbitkan lewat `SAMPLE.sessions`.

> Di mode `mock`, perubahan dari Panel Admin tersimpan di localStorage browser itu saja — **menimpa** (bukan mengubah) `SAMPLE.topics`/`SAMPLE.sessions` di perangkat itu, dan tidak ikut ter-commit ke Git maupun tersinkron ke perangkat kiosk lain. Untuk perubahan yang berlaku di semua kiosk, pakai mode `sheets`.

Setelan umum di `CONFIG`:
- `questionsPerAttempt` — jumlah soal diacak per percobaan
- `passThresholdDefault` — ambang lulus (%)
- `minMaterialSeconds` — durasi minimum baca materi sebelum kuis terbuka
- `idleResetSeconds` — auto-reset kiosk saat idle
- `showDemoHint` — **matikan (`false`) di produksi** agar NIK contoh tak muncul
- `admin.password` — password gerbang Panel Admin. **Wajib ganti sebelum deploy** (lihat [Batasan](#batasan-yang-perlu-kamu-tahu-jujur))

---

## Panel Admin

Buka `admin.html` (mis. `http://localhost:8080/admin.html` atau `https://<nama-project>.vercel.app/admin.html`). Tidak ada tautan ke sana dari kiosk — sengaja, supaya tidak muncul di layar tablet muster point. Password diatur di `CONFIG.admin.password` (`assets/config.js`).

Navigasi lewat sidebar kiri, lima menu:
- **Dashboard** — kartu ringkasan (total karyawan, total topik, sesi aktif, total partisipasi, rata-rata skor, tingkat kelulusan) dan daftar aktivitas terbaru. Semua angka dihitung dari data nyata yang sudah tercatat — tidak ada data contoh/placeholder.
- **Topik** — tambah/edit/hapus topik: kode, judul, ambang lulus, gambar materi (opsional), materi (teks biasa), dan bank soal (ketik manual atau impor CSV). Detail di bawah.
- **Sesi** — jadwalkan topik untuk tampil di kiosk: rentang tanggal berlaku, target perusahaan (opsional), status `draft`/`published`. Hanya sesi `published` & masih dalam rentang tanggal yang muncul di kiosk.
- **Laporan** — ringkasan per perusahaan (jumlah peserta, lulus/belum, rata-rata skor, % kelulusan) di atas, lalu tabel detail per peserta yang bisa difilter per perusahaan, dengan tombol unduh CSV.
- **Karyawan** — daftar seluruh karyawan (nama, NIK, perusahaan, jabatan, departemen) dengan pencarian. Baca saja — untuk mengubah roster, edit `SAMPLE.employees` di `config.js` (mode mock) atau tab `Master_Karyawan` di Sheet (mode sheets).

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

Di editor topik ada field **Gambar Materi** (opsional) — pilih file dari perangkat, otomatis terupload ke folder Drive **"Quiz SHE Uploads"** (dibuat otomatis saat pertama kali dipakai), lalu link-nya tersimpan di kolom `materialImage`. Di kiosk, gambar tampil di atas teks materi dan bisa diketuk untuk **diperbesar** (lightbox layar penuh, ketuk gambar untuk zoom in/out). Upload hanya berfungsi di mode `sheets` — di mode `mock` tidak ada tempat penyimpanan file, jadi kontrol upload akan menampilkan pesan bahwa fitur ini tidak tersedia.

### Impor soal lewat CSV

Alih-alih mengetik soal satu per satu, admin bisa siapkan soal di Excel/Google Sheets lalu impor sekaligus:
1. Klik **Template CSV** di editor topik untuk mengunduh contoh formatnya.
2. Isi baris demi baris di Excel/Sheets, kolom: `pertanyaan, opsiA, opsiB, opsiC, opsiD, jawaban` (`jawaban` diisi huruf `A`/`B`/`C`/`D`).
3. Export/simpan sebagai `.csv`, lalu klik **Impor CSV** di editor topik dan pilih file itu.

Soal yang berhasil diparsing ditambahkan ke bank soal yang sudah ada (tidak menimpa); baris dengan data tidak lengkap atau huruf jawaban tidak valid dilewati dan dilaporkan jumlahnya.

---

## Menyambung ke Google Sheet (mode `sheets`)

Situs statis tidak bisa membaca/menulis Sheet privat sendiri secara aman. Jembatannya = **`api/data.js`**, satu serverless function di Vercel yang bicara langsung ke **Google Sheets API v4** (bukan Google Apps Script) pakai kredensial *service account*. Data tetap 100% di Google Sheet yang sama — bisa dibuka & dicek manual kapan saja seperti biasa — cuma "pintu" baca/tulisnya lewat backend sendiri yang jauh lebih cepat & konsisten dibanding Apps Script (tidak ada cold-start).

**Pembagian peran** (sama seperti sebelumnya, tidak berubah):
- **Roster karyawan** → dibaca dari Sheet (tab `Master_Karyawan`).
- **Konten kuis (topik/sesi)** → bawaan dari `config.js` (di repo), tapi begitu Panel Admin dipakai dalam mode ini, topik/sesi juga dibaca & ditulis lewat Sheet (tab `Topics` / `Session`) supaya semua kiosk melihat perubahan yang sama.
- **Hasil / partisipasi** → ditulis balik ke Sheet (tab `Partisipasi`) untuk rekap compliance & laporan di Panel Admin.

### Langkah 1 — Google Cloud (service account)

1. Buka [console.cloud.google.com](https://console.cloud.google.com), buat/pilih project.
2. **APIs & Services → Library** — enable **Google Sheets API** dan **Google Drive API** (Drive dipakai untuk upload gambar materi).
3. **APIs & Services → Credentials → Create Credentials → Service Account**. Nama bebas.
4. Masuk ke service account yang baru dibuat → tab **Keys → Add Key → Create new key → JSON**. Simpan file JSON-nya baik-baik — ini kredensial rahasia, **jangan pernah di-commit ke repo**.
5. Dari file JSON itu, catat nilai `client_email`.
6. Buka Google Sheet yang dipakai (tab `Master_Karyawan`/`Partisipasi`/`Topics`/`Session` harus sudah ada dengan header sesuai daftar di bawah) → **Share** → tempel `client_email` dari langkah 5 → beri akses **Editor**.

Header tiap tab (baris 1, persis):
- `Partisipasi`: `waktu | nik | nama | perusahaan | topicCode | sessionId | attemptNo | score | passed | certificateNo | verificationToken | answerBreakdown`
- `Topics`: `code | title | passThreshold | material | materialImage | questionsJson`
- `Session`: `id | topicCode | title | validFrom | validUntil | targetCompanies | status`

### Langkah 2 — Environment variables di Vercel

Project di Vercel → **Settings → Environment Variables**, tambah:

| Nama | Isi |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` dari file JSON |
| `GOOGLE_PRIVATE_KEY` | `private_key` dari file JSON (tempel apa adanya, termasuk `-----BEGIN PRIVATE KEY-----`) |
| `GOOGLE_SPREADSHEET_ID` | ID Sheet (bagian di URL antara `/d/` dan `/edit`) |
| `ADMIN_TOKEN` | sama persis dengan `CONFIG.admin.password` di `assets/config.js` |

Redeploy project setelah menambah env var (Vercel tidak otomatis redeploy hanya karena env var berubah).

### Langkah 3 — Aktifkan di client

Di `assets/config.js`: `dataSource: 'sheets'`, `apiUrl: '/api/data'` (relatif — otomatis mengarah ke domain Vercel yang sama, tidak perlu diisi manual per-environment).

### Cara kerja `api/data.js` (ringkas)

Kode lengkapnya ada di `api/data.js` di repo ini (bukan ditempel manual seperti Apps Script dulu — otomatis ikut ter-deploy tiap `git push`). Satu endpoint, dispatch berdasarkan `action`:

| Method | `action` | Perlu `adminToken`? | Fungsi |
|---|---|---|---|
| GET | `employee` | tidak | cari 1 karyawan by NIK |
| GET | `verify` | tidak | cari hasil by token QR sertifikat |
| GET | `topics` | tidak | daftar topik |
| GET | `sessions` | tidak | daftar sesi |
| GET | `existing` | tidak | cek karyawan sudah lulus sesi tertentu |
| GET | `history` | tidak | riwayat semua sertifikat (lulus) milik 1 NIK -- "Riwayat Sertifikat Saya" di kiosk |
| GET | `participations` | **ya** | seluruh data partisipasi (buat Laporan admin) |
| GET | `employees` | **ya** | seluruh roster karyawan (buat tab Karyawan admin) |
| POST | `participation` | tidak | simpan hasil kuis + hitung nomor sertifikat |
| POST | `admin_login` | tidak* | tukar password dengan token sesi (12 jam) |
| POST | `topic_save` / `topic_delete` | **ya** | kelola topik |
| POST | `session_save` / `session_delete` | **ya** | kelola sesi |
| POST | `upload_image` | **ya** | upload gambar materi ke Drive |

*`admin_login` tidak butuh `adminToken` (belum ada token untuk dicek), tapi tetap butuh `password` yang cocok dengan `ADMIN_TOKEN` di payload-nya.

Baca/tulis pakai `valueInputOption: RAW` (bukan `USER_ENTERED`) supaya teks tanggal ("2026-07-01") tidak diam-diam diubah Sheets jadi sel bertipe Date — akar masalah yang dulu pernah bikin sesi "tidak terdeteksi" di versi Apps Script.

Tidak ada padanan `LockService` untuk penomoran sertifikat di sini (Sheets API tidak punya lock bawaan) — risiko dua submit bersamaan-persis dapat nomor sama secara teori ada, tapi sangat kecil untuk pemakaian kiosk fisik satu-per-satu. Kalau nanti dipakai multi-kiosk serentak dan ini jadi masalah nyata, upgrade-nya: tambah lock terdistribusi (mis. Vercel KV).

`adminToken` yang dikirim setelah login **bukan** password mentah lagi, melainkan token sesi bertanda tangan HMAC (`signSession`/`verifySession` di `api/data.js`) yang menyimpan kedaluwarsanya sendiri (12 jam) — diverifikasi ulang tiap request tanpa perlu database/KV tambahan.

---

## Batasan yang perlu kamu tahu (jujur)

- **Privasi roster.** Jangan publikasikan seluruh isi Sheet karyawan ke web publik. Dengan pola di atas, aksi publik (`employee`, `verify`, `existing`) hanya membalas data 1 orang/1 sesi — bukan seluruh daftar. Aksi yang membongkar banyak data sekaligus (`employees`, `participations`) mensyaratkan `adminToken` yang cocok. Hindari menaruh NIK/no. HP di file yang di-commit publik.
- **Keamanan login rendah.** "Login" hanya pencocokan NIK, tanpa password — memang sesuai kebutuhan kiosk yang ringan, tapi bukan autentikasi kuat. Jangan pakai pola ini untuk data sensitif.
- **Panel Admin tetap satu password bersama** (bukan akun per-orang) — cukup untuk tim kecil yang saling percaya, bukan untuk banyak admin dengan hak berbeda-beda. Tapi di mode `sheets`, password aslinya **tidak lagi tersimpan/terkirim ke browser**: `CONFIG.admin.password` di `config.js` cuma dipakai mode `mock` (demo lokal). Login sungguhan mengirim password ke `api/data.js`, dicek di server terhadap `ADMIN_TOKEN` (env var Vercel, tidak pernah ke klien), dan yang dibalas ke browser cuma **token sesi** bertanda tangan (HMAC) yang kedaluwarsa sendiri dalam 12 jam — bukan passwordnya. Siapa pun yang buka "View Source" tidak akan menemukan password aslinya lagi. Kalau butuh lebih dari ini (akun per-admin, audit log siapa mengubah apa), itu perubahan lebih besar — taruh `admin.html` di balik autentikasi level hosting atau bangun sistem akun sungguhan.
- **Tanpa mode `sheets`, hasil tidak terekam terpusat.** Mode `mock` menyimpan hasil hanya di browser perangkat itu (localStorage). Untuk rekap compliance lintas perangkat, sambungkan ke Google Sheet (lihat [Menyambung ke Google Sheet](#menyambung-ke-google-sheet-mode-sheets)).
- **Verifikasi QR** di mode `mock` hanya berlaku di perangkat yang sama. Verifikasi lintas perangkat butuh mode `sheets`.
- **Kredensial service account** (`GOOGLE_PRIVATE_KEY` dkk.) tersimpan sebagai environment variable di Vercel, bukan di kode — jangan pernah commit file JSON service account ke Git.
- **PDF sertifikat** dibuat di browser (html2canvas + jsPDF); hasil mengikuti tampilan kartu di layar.

---

## Alur

Masuk (NIK) → Konfirmasi identitas → Pilih sesi aktif → Baca materi → Kuis (soal acak) → Hasil (lulus/gagal) → Sertifikat + QR → rekam partisipasi.

Kalau karyawan sudah pernah **lulus** sesi yang sama sebelumnya, kartu sesi menampilkan badge "Sudah lulus" dan langsung membuka sertifikat yang sudah ada saat diklik — tidak perlu mengulang materi/kuis. Percobaan yang belum lulus tidak dianggap "sudah selesai", jadi tetap bisa dicoba lagi seperti biasa.
