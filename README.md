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
api/data.js             Backend (Vercel serverless function) -- baca/tulis Google Drive
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
- **Topik** — tambah/edit/hapus topik: kode, judul, ambang lulus, gambar materi (opsional), materi (editor WYSIWYG), dan bank soal (ketik manual atau impor CSV). Detail di bawah.
- **Sesi** — jadwalkan topik untuk tampil di kiosk: rentang tanggal berlaku, target perusahaan (opsional), status `draft`/`published`. Hanya sesi `published` & masih dalam rentang tanggal yang muncul di kiosk.
- **Laporan** — ringkasan per perusahaan (jumlah peserta, lulus/belum, rata-rata skor, % kelulusan) di atas, lalu tabel detail per peserta yang bisa difilter per perusahaan, dengan tombol unduh CSV.
- **Karyawan** — daftar seluruh karyawan (nama, NIK, perusahaan, jabatan, departemen) dengan pencarian. Baca saja — untuk mengubah roster, edit `SAMPLE.employees` di `config.js` (mode mock) atau file `employees.json` di folder Google Drive (mode sheets, lihat [Menyambung ke Google Drive](#menyambung-ke-google-drive-mode-sheets)).

### Format materi

Materi diketik lewat editor WYSIWYG (toolbar Bold/Italic/Underline, Subjudul/Teks, bullet/angka list, perataan) — hasilnya disimpan sebagai **HTML**, dirender apa adanya ke peserta. Karena admin adalah satu-satunya penulis materi (di balik login Panel Admin) dan bukan input publik, ini bukan celah XSS — sama posisi kepercayaannya dengan gambar materi yang juga di-set bebas oleh admin.

Topik LAMA yang materinya masih format teks-polos (`## ` subjudul, `- ` bullet, dari sebelum editor ini ada) tetap terbaca normal — dikonversi otomatis ke HTML begitu dibuka lagi di editor, tidak perlu migrasi data manual di Sheet.

### Gambar materi

Di editor topik ada field **Gambar Materi** (opsional) — pilih file dari perangkat, otomatis terupload ke **Vercel Blob** (bukan folder Drive di bawah — lihat [Menyambung ke Google Drive](#menyambung-ke-google-drive-mode-sheets) soal kenapa dipisah), lalu link-nya tersimpan di kolom `materialImage`. Di kiosk, gambar tampil di atas teks materi dan bisa diketuk untuk **diperbesar** (lightbox layar penuh, ketuk gambar untuk zoom in/out). Upload hanya berfungsi di mode `sheets` — di mode `mock` tidak ada tempat penyimpanan file, jadi kontrol upload akan menampilkan pesan bahwa fitur ini tidak tersedia.

### Impor soal lewat CSV

Alih-alih mengetik soal satu per satu, admin bisa siapkan soal di Excel/Google Sheets lalu impor sekaligus:
1. Klik **Template CSV** di editor topik untuk mengunduh contoh formatnya.
2. Isi baris demi baris di Excel/Sheets, kolom: `pertanyaan, opsiA, opsiB, opsiC, opsiD, jawaban` (`jawaban` diisi huruf `A`/`B`/`C`/`D`).
3. Export/simpan sebagai `.csv`, lalu klik **Impor CSV** di editor topik dan pilih file itu.

Soal yang berhasil diparsing ditambahkan ke bank soal yang sudah ada (tidak menimpa); baris dengan data tidak lengkap atau huruf jawaban tidak valid dilewati dan dilaporkan jumlahnya.

---

## Menyambung ke Google Drive (mode `sheets`)

Situs statis tidak bisa membaca/menulis Drive privat sendiri secara aman. Jembatannya = **`api/data.js`**, satu serverless function di Vercel yang bicara langsung ke **Google Drive API v3** pakai kredensial *service account*. Data disimpan sebagai **4 file JSON** (`employees.json`, `topics.json`, `sessions.json`, `participations.json`) di satu folder Google Drive — bisa dibuka/diunduh manual kapan saja lewat Drive, mirip semangatnya dengan Sheet sebelumnya, cuma bentuknya JSON bukan grid.

Nama mode di kode masih `'sheets'` (peninggalan versi sebelumnya, di `assets/config.js`/`assets/api.js`) — sengaja tidak diganti supaya diff migrasi minimal; secara fungsi backend-nya sekarang 100% Google Drive, bukan Google Sheets lagi.

**Butuh Google Workspace + Shared Drive** — service account biasa **tidak pernah** dapat kuota penyimpanan di My Drive pribadi (kebijakan Google sejak 2020). Kuota Shared Drive milik organisasi (bukan milik satu akun), jadi service account bisa baca/tulis di sana selama terdaftar sebagai *member*-nya. Kalau organisasi belum punya Google Workspace, pola di dokumen ini **tidak akan jalan** — alternatifnya OAuth delegation ke akun Gmail asli, jauh lebih rumit dari service account biasa dan di luar cakupan dokumen ini.

**Pembagian peran** (sama seperti sebelumnya, cuma tempat simpannya beda):
- **Roster karyawan** → dibaca dari `employees.json`.
- **Konten kuis (topik/sesi)** → bawaan dari `config.js` (di repo), tapi begitu Panel Admin dipakai dalam mode ini, topik/sesi juga dibaca & ditulis lewat `topics.json` / `sessions.json` supaya semua kiosk melihat perubahan yang sama.
- **Hasil / partisipasi** → ditulis ke `participations.json` untuk rekap compliance & laporan di Panel Admin.

### Langkah 1 — Google Cloud (service account) + Shared Drive

1. Buka [console.cloud.google.com](https://console.cloud.google.com), buat/pilih project.
2. **APIs & Services → Library** — enable **Google Drive API**.
3. **APIs & Services → Credentials → Create Credentials → Service Account**. Nama bebas.
4. Masuk ke service account yang baru dibuat → tab **Keys → Add Key → Create new key → JSON**. Simpan file JSON-nya baik-baik — ini kredensial rahasia, **jangan pernah di-commit ke repo**.
5. Dari file JSON itu, catat nilai `client_email`.
6. Di Google Drive (akun Workspace), buat **Shared Drive** baru (atau pakai yang sudah ada) — mis. "Quiz SHE" — lalu **Manage members** → tempel `client_email` dari langkah 5 → beri akses **Content Manager** (cukup untuk baca/tulis/buat file, tidak perlu Manager penuh).
7. Di dalam Shared Drive itu, buat 1 folder baru (mis. "Data") untuk data aplikasi. Buka folder itu, salin ID-nya dari URL (bagian setelah `/folders/`). File `employees.json`/`topics.json`/`sessions.json`/`participations.json` **dibuat otomatis** (isi `[]`) di folder ini saat pertama kali dipakai — tidak perlu dibuat manual.

Kalau sebelumnya sudah punya data produksi di Google Sheet (mode Sheets versi lama) dan mau dipindahkan, itu migrasi data satu-kali yang perlu dikerjakan manual (unduh tiap tab sebagai JSON lalu upload ke folder ini dengan nama file di atas) — bilang kalau mau dibuatkan skrip migrasinya, belum dibuat di sini karena belum tentu dibutuhkan.

Bentuk tiap file (array of object):
- `employees.json`: `{ nik, nama, perusahaan, jabatan, departemen }`
- `topics.json`: `{ code, title, passThreshold, material, materialImage, questions }` — `questions` array asli (bukan string `questionsJson` seperti versi Sheet lama)
- `sessions.json`: `{ id, topicCode, title, validFrom, validUntil, targetCompanies, status }` — `targetCompanies` array string (bukan CSV)
- `participations.json`: diisi otomatis oleh backend saat ada kuis selesai, tidak perlu diisi manual. Field `durationMs` (lama pengerjaan kuis dlm milidetik) dipakai buat badge "peringkat ketepatan & kecepatan" di layar hasil kiosk — lihat [Peringkat ketepatan & kecepatan](#peringkat-ketepatan--kecepatan) di bawah.

### Langkah 2 — Environment variables di Vercel

Project di Vercel → **Settings → Environment Variables**, tambah:

| Nama | Isi |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` dari file JSON |
| `GOOGLE_PRIVATE_KEY` | `private_key` dari file JSON (tempel apa adanya, termasuk `-----BEGIN PRIVATE KEY-----`) |
| `GOOGLE_DRIVE_FOLDER_ID` | ID folder dari langkah 1.7 |
| `ADMIN_TOKEN` | sama persis dengan `CONFIG.admin.password` di `assets/config.js` |

Kalau sebelumnya sempat pakai mode Sheets, `GOOGLE_SPREADSHEET_ID` boleh dihapus — tidak dipakai lagi oleh `api/data.js`.

Redeploy project setelah menambah/mengubah env var (Vercel tidak otomatis redeploy hanya karena env var berubah).

Upload gambar materi topik **tetap** pakai Vercel Blob (terpisah dari folder data Drive di atas, lihat [Gambar materi](#gambar-materi)) — sudah aktif kalau `BLOB_READ_WRITE_TOKEN` sudah ada, tidak berubah oleh migrasi ini.

### Langkah 3 — Aktifkan di client

Di `assets/config.js`: `dataSource: 'sheets'`, `apiUrl: '/api/data'` (relatif — otomatis mengarah ke domain Vercel yang sama, tidak perlu diisi manual per-environment). Tidak berubah dari sebelumnya — kontrak endpoint sama persis, cuma isi `api/data.js` yang diganti isinya dari Sheets ke Drive.

### Cara kerja `api/data.js` (ringkas)

Kode lengkapnya ada di `api/data.js` di repo ini — otomatis ikut ter-deploy tiap `git push`. Satu endpoint, dispatch berdasarkan `action`:

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
| POST | `upload_image` | **ya** | upload gambar materi ke Vercel Blob |

*`admin_login` tidak butuh `adminToken` (belum ada token untuk dicek), tapi tetap butuh `password` yang cocok dengan `ADMIN_TOKEN` di payload-nya.

Tiap tulis (`topic_save`, `session_save`, `participation`, dll.) membaca seluruh file JSON koleksi terkait, mengubahnya di memori, lalu menimpa seluruh file dengan `files.update` — Drive API tidak punya partial-update konten file atau padanan `LockService`. Risiko race (dua tulisan ke koleksi yang SAMA persis bersamaan saling menimpa) secara teori ada, sama seperti keterbatasan versi Sheets sebelumnya — kecil dampaknya untuk pemakaian kiosk fisik satu-per-satu. Kalau nanti dipakai multi-kiosk serentak dan ini jadi masalah nyata, upgrade-nya: tambah lock terdistribusi (mis. Vercel KV). File `participations.json` juga cuma tumbuh, tidak pernah dipangkas — kalau dalam hitungan tahun jadi besar & lambat, upgrade-nya arsipkan data lama ke file terpisah per tahun.

`adminToken` yang dikirim setelah login **bukan** password mentah lagi, melainkan token sesi bertanda tangan HMAC (`signSession`/`verifySession` di `api/data.js`) yang menyimpan kedaluwarsanya sendiri (12 jam) — diverifikasi ulang tiap request tanpa perlu database/KV tambahan.

---

## Batasan yang perlu kamu tahu (jujur)

- **Privasi roster.** Jangan publikasikan seluruh isi `employees.json` ke web publik. Dengan pola di atas, aksi publik (`employee`, `verify`, `existing`) hanya membalas data 1 orang/1 sesi — bukan seluruh daftar. Aksi yang membongkar banyak data sekaligus (`employees`, `participations`) mensyaratkan `adminToken` yang cocok. Hindari menaruh NIK/no. HP di file yang di-commit publik.
- **Keamanan login rendah.** "Login" hanya pencocokan NIK, tanpa password — memang sesuai kebutuhan kiosk yang ringan, tapi bukan autentikasi kuat. Jangan pakai pola ini untuk data sensitif.
- **Panel Admin tetap satu password bersama** (bukan akun per-orang) — cukup untuk tim kecil yang saling percaya, bukan untuk banyak admin dengan hak berbeda-beda. Tapi di mode `sheets`, password aslinya **tidak lagi tersimpan/terkirim ke browser**: `CONFIG.admin.password` di `config.js` cuma dipakai mode `mock` (demo lokal). Login sungguhan mengirim password ke `api/data.js`, dicek di server terhadap `ADMIN_TOKEN` (env var Vercel, tidak pernah ke klien), dan yang dibalas ke browser cuma **token sesi** bertanda tangan (HMAC) yang kedaluwarsa sendiri dalam 12 jam — bukan passwordnya. Siapa pun yang buka "View Source" tidak akan menemukan password aslinya lagi. Kalau butuh lebih dari ini (akun per-admin, audit log siapa mengubah apa), itu perubahan lebih besar — taruh `admin.html` di balik autentikasi level hosting atau bangun sistem akun sungguhan.
- **Tanpa mode `sheets`, hasil tidak terekam terpusat.** Mode `mock` menyimpan hasil hanya di browser perangkat itu (localStorage). Untuk rekap compliance lintas perangkat, sambungkan ke Google Drive (lihat [Menyambung ke Google Drive](#menyambung-ke-google-drive-mode-sheets)).
- **Verifikasi QR** di mode `mock` hanya berlaku di perangkat yang sama. Verifikasi lintas perangkat butuh mode `sheets`.
- **Kredensial service account** (`GOOGLE_PRIVATE_KEY` dkk.) tersimpan sebagai environment variable di Vercel, bukan di kode — jangan pernah commit file JSON service account ke Git.
- **PDF sertifikat** dibuat di browser (html2canvas + jsPDF); hasil mengikuti tampilan kartu di layar.

---

## Peringkat ketepatan & kecepatan

Di layar Hasil (setelah kuis, sebelum sertifikat), peserta yang **lulus** dan termasuk **3 tercepat+tertepat** untuk topik itu (skor tertinggi, durasi pengerjaan sbg pembeda kalau skor sama) dapat badge kecil: *"Kamu terbaik ke-1 untuk ketepatan & kecepatan menjawab topik ini!"* (atau ke-2/ke-3). Dihitung per NIK terbaik (bukan tiap percobaan) supaya orang yang mencoba berkali-kali tidak numpuk sendiri di ranking, dan per topik (lintas semua sesi/waktu — bukan per sesi tunggal).

Sengaja **bukan leaderboard publik yang selalu tampil ke semua orang** (mis. "kamu peringkat ke-47") — kalau semua orang melihat peringkatnya, itu bisa mendorong buru-buru lewatin materi K3 demi ranking, yang bertentangan dengan tujuan aplikasi ini (materi keselamatan kerja). Dengan cuma memunculkan badge ke top-3 yang KEBETULAN cepat & tepat, sebagian besar peserta tidak pernah melihat sinyal kompetitif apa pun. Kalau ternyata pola pakainya justru mendorong buru-buru meski dibatasi begini, opsinya: matikan badge ini sepenuhnya, atau ganti jadi murni berbasis skor (tanpa `durationMs`) — tinggal ubah `computeRank` di `assets/api.js` & `api/data.js`.

Butuh `durationMs` di `participations.json` (lihat [Bentuk tiap file](#langkah-1--google-cloud-service-account--shared-drive) di atas) — dihitung di klien (`Date.now()` saat kuis dibuka sampai disubmit, lihat `assets/app.js`), jadi tidak akurat kalau ada jeda tanpa aktivitas yang tidak sampai memicu `idleResetSeconds` (kiosk di-reset otomatis kalau idle lebih lama dari itu).

---

## Alur

Masuk (NIK) → Konfirmasi identitas → Pilih sesi aktif → Baca materi → Kuis (soal acak) → Hasil (lulus/gagal, badge ranking kalau top-3) → Sertifikat + QR → rekam partisipasi.

Kalau karyawan sudah pernah **lulus** sesi yang sama sebelumnya, kartu sesi menampilkan badge "Sudah lulus" dan langsung membuka sertifikat yang sudah ada saat diklik — tidak perlu mengulang materi/kuis. Percobaan yang belum lulus tidak dianggap "sudah selesai", jadi tetap bisa dicoba lagi seperti biasa.
