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
api/data.js             Backend (Vercel serverless function) -- baca/tulis Google Sheets
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
- **Karyawan** — daftar seluruh karyawan (nama, NIK, perusahaan, jabatan, departemen) dengan pencarian. Baca saja — untuk mengubah roster, edit `SAMPLE.employees` di `config.js` (mode mock) atau tab `Master_Karyawan` di spreadsheet HR (mode sheets, lihat [Menyambung ke Google Sheets](#menyambung-ke-google-sheets-mode-sheets)) — dibaca langsung/live tiap request.

### Format materi

Materi diketik lewat editor WYSIWYG (toolbar Bold/Italic/Underline, Subjudul/Teks, bullet/angka list, perataan) — hasilnya disimpan sebagai **HTML**, dirender apa adanya ke peserta. Karena admin adalah satu-satunya penulis materi (di balik login Panel Admin) dan bukan input publik, ini bukan celah XSS — sama posisi kepercayaannya dengan gambar materi yang juga di-set bebas oleh admin.

Topik LAMA yang materinya masih format teks-polos (`## ` subjudul, `- ` bullet, dari sebelum editor ini ada) tetap terbaca normal — dikonversi otomatis ke HTML begitu dibuka lagi di editor, tidak perlu migrasi data manual di Sheet.

### Gambar materi

Di editor topik ada field **Gambar Materi** (opsional) — pilih file dari perangkat, otomatis terupload ke **Vercel Blob** (terpisah dari Sheets di bawah — lihat [Menyambung ke Google Sheets](#menyambung-ke-google-sheets-mode-sheets)), lalu link-nya tersimpan di kolom `materialImage`. Di kiosk, gambar tampil di atas teks materi dan bisa diketuk untuk **diperbesar** (lightbox layar penuh, ketuk gambar untuk zoom in/out). Upload hanya berfungsi di mode `sheets` — di mode `mock` tidak ada tempat penyimpanan file, jadi kontrol upload akan menampilkan pesan bahwa fitur ini tidak tersedia.

### Impor soal lewat CSV

Alih-alih mengetik soal satu per satu, admin bisa siapkan soal di Excel/Google Sheets lalu impor sekaligus:
1. Klik **Template CSV** di editor topik untuk mengunduh contoh formatnya.
2. Isi baris demi baris di Excel/Sheets, kolom: `pertanyaan, opsiA, opsiB, opsiC, opsiD, jawaban` (`jawaban` diisi huruf `A`/`B`/`C`/`D`).
3. Export/simpan sebagai `.csv`, lalu klik **Impor CSV** di editor topik dan pilih file itu.

Soal yang berhasil diparsing ditambahkan ke bank soal yang sudah ada (tidak menimpa); baris dengan data tidak lengkap atau huruf jawaban tidak valid dilewati dan dilaporkan jumlahnya.

---

## Menyambung ke Google Sheets (mode `sheets`)

Situs statis tidak bisa membaca/menulis Sheets privat sendiri secara aman. Jembatannya = **`api/data.js`**, satu serverless function di Vercel yang bicara ke **Google Sheets API v4**. Dua spreadsheet dipakai:

- **`GOOGLE_SHEET_ID`** — spreadsheet milik aplikasi ini sendiri, tab `Topics` / `Session` / `Partisipasi`. Aplikasi baca & tulis penuh ke sini.
- **`GOOGLE_ROSTER_SPREADSHEET_ID`** — spreadsheet HR yang sudah ada, dipakai bareng aplikasi lain di kantor (mis. inspeksi/hazard report) — tab `Master_Karyawan` dibaca **live** tiap request (read-only, tidak pernah ditulis). Begitu HR update roster di sana, otomatis kepakai di kiosk tanpa redeploy/migrasi ulang.

Kenapa dua spreadsheet, bukan satu: roster sumber kebenarannya ada di luar aplikasi ini (dikelola HR, dipakai aplikasi lain juga) — dibaca live dari tempat aslinya. Topik/sesi/partisipasi murni milik aplikasi ini sendiri — spreadsheet terpisah, tidak campur dengan tab-tab aplikasi lain.

Nama mode di kode masih `'sheets'` (di `assets/config.js`/`assets/api.js`).

**Auth pakai OAuth client biasa + refresh token — BUKAN service account.** Service account tidak pernah dapat kuota/akses tulis mandiri tanpa Google Workspace + admin (Shared Drive/domain-wide delegation, dua-duanya butuh admin). OAuth client biasa (login manusia sungguhan **sekali** di awal buat kasih izin, lalu backend pakai *refresh token* seterusnya tanpa perlu login ulang) jalan di akun Google **apa pun** — Gmail pribadi, Google One, atau Workspace.

### Langkah 1 — Google Cloud (OAuth client)

1. Buka [console.cloud.google.com](https://console.cloud.google.com), buat/pilih project.
2. **APIs & Services → Library** — enable **Google Sheets API**.
3. **APIs & Services → OAuth consent screen** — kalau belum pernah diisi: User Type **External**, isi nama app & email kontak seadanya, lalu di bagian **Test users** tambahkan email akun Google yang akan dipakai (langkah 5). Status **Testing** saja sudah cukup, tidak perlu publish/verifikasi Google.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** — Application type **Desktop app**, nama bebas. Setelah dibuat, catat **Client ID** & **Client Secret** (atau unduh JSON-nya).
5. Jalankan skrip otorisasi satu-kali (lihat di bawah), scope **`.../auth/spreadsheets`** (baca-tulis) — minta login lewat browser & klik "Allow", lalu keluar `refresh_token`. Login pakai akun Google yang punya akses **edit** ke spreadsheet langkah 6 dan akses **baca** ke spreadsheet roster langkah 7.
6. Buat/pakai 1 spreadsheet untuk topik/sesi/partisipasi (boleh spreadsheet kosong — tab `Topics`/`Session`/`Partisipasi` dibuat otomatis kalau belum ada). Catat ID-nya (bagian URL antara `/d/` dan `/edit`).
7. Catat ID spreadsheet HR yang punya tab `Master_Karyawan` — ini spreadsheet yang SUDAH ADA, dipakai bersama, bukan dibuat baru.

Header (baris 1) tab `Master_Karyawan` di spreadsheet roster, persis: `NIK | NAMA | PERUSAHAAN | JABATAN | DEPARTEMEN` — read-only, tidak pernah ditulis aplikasi ini, jadi harus sudah terisi duluan.

**Skrip otorisasi satu-kali** (dapat `refresh_token`) — minta dibuatkan & dijalankan bareng lewat chat kalau butuh; intinya generate URL consent Google pakai Client ID/Secret dari langkah 4 dengan scope `.../auth/spreadsheets`, buka di browser, login & Allow, lalu tukar `code` hasil redirect jadi `refresh_token` lewat endpoint token Google. Sekali jalan saja — hasilnya disimpan sbg env var (langkah 2), bukan dijalankan tiap request.

**Pembagian peran:**
- **Roster karyawan** → dibaca live dari tab `Master_Karyawan`, spreadsheet roster (langkah 1.7).
- **Konten kuis (topik/sesi)** → bawaan dari `config.js` (di repo), tapi begitu Panel Admin dipakai dalam mode ini, topik/sesi juga dibaca & ditulis lewat tab `Topics`/`Session` di spreadsheet aplikasi (langkah 1.6) supaya semua kiosk melihat perubahan yang sama.
- **Hasil / partisipasi** → ditulis ke tab `Partisipasi` untuk rekap compliance & laporan di Panel Admin.

Header (baris 1) tiap tab di spreadsheet aplikasi, persis:
- `Topics`: `code | title | passThreshold | material | materialImage | questionsJson`
- `Session`: `id | topicCode | title | validFrom | validUntil | targetCompanies | status`
- `Partisipasi`: `waktu | nik | nama | perusahaan | topicCode | sessionId | attemptNo | score | passed | certificateNo | verificationToken | answerBreakdown | durationMs` — `durationMs` (lama pengerjaan kuis dlm milidetik) dipakai buat badge "peringkat ketepatan & kecepatan" di layar hasil kiosk, lihat [Peringkat ketepatan & kecepatan](#peringkat-ketepatan--kecepatan) di bawah. Tab ini diisi otomatis oleh backend, tidak perlu diisi manual.

### Langkah 2 — Environment variables di Vercel

Project di Vercel → **Settings → Environment Variables**, tambah:

| Nama | Isi |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID dari langkah 1.4 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Client Secret dari langkah 1.4 |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | hasil skrip otorisasi di langkah 1.5 |
| `GOOGLE_SHEET_ID` | ID spreadsheet dari langkah 1.6 (topik/sesi/partisipasi) |
| `GOOGLE_ROSTER_SPREADSHEET_ID` | ID spreadsheet HR dari langkah 1.7 (roster karyawan, live) |
| `ADMIN_TOKEN` | sama persis dengan `CONFIG.admin.password` di `assets/config.js` |

Kalau sebelumnya sempat pakai versi Google Drive (JSON) atau percobaan service account, `GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` boleh dihapus — tidak dipakai lagi oleh `api/data.js`.

Redeploy project setelah menambah/mengubah env var (Vercel tidak otomatis redeploy hanya karena env var berubah).

Upload gambar materi topik **tetap** pakai Vercel Blob (terpisah dari Sheets di atas, lihat [Gambar materi](#gambar-materi)) — sudah aktif kalau `BLOB_READ_WRITE_TOKEN` sudah ada.

### Langkah 3 — Aktifkan di client

Di `assets/config.js`: `dataSource: 'sheets'`, `apiUrl: '/api/data'` (relatif — otomatis mengarah ke domain Vercel yang sama, tidak perlu diisi manual per-environment). Tidak pernah perlu diubah lintas migrasi backend — kontrak endpoint sama persis, cuma isi `api/data.js` yang berubah.

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

Baca/tulis pakai `valueInputOption: RAW` (bukan `USER_ENTERED`) supaya teks tanggal ("2026-07-01") tidak diam-diam diubah Sheets jadi sel bertipe Date. Tidak ada padanan `LockService` di Sheets API — dua submit yang benar-benar bersamaan (beda milidetik) secara teori bisa dapat nomor sertifikat yang sama. Risikonya rendah untuk kiosk fisik yang dipakai bergantian satu per satu; kalau nanti dipakai multi-kiosk serentak dan ini jadi masalah nyata, upgrade-nya: tambah lock terdistribusi (mis. Vercel KV).

`adminToken` yang dikirim setelah login **bukan** password mentah lagi, melainkan token sesi bertanda tangan HMAC (`signSession`/`verifySession` di `api/data.js`) yang menyimpan kedaluwarsanya sendiri (12 jam) — diverifikasi ulang tiap request tanpa perlu database/KV tambahan.

---

## Batasan yang perlu kamu tahu (jujur)

- **Privasi roster.** Jangan publikasikan seluruh isi tab `Master_Karyawan` (spreadsheet HR) ke web publik. Dengan pola di atas, aksi publik (`employee`, `verify`, `existing`) hanya membalas data 1 orang/1 sesi — bukan seluruh daftar. Aksi yang membongkar banyak data sekaligus (`employees`, `participations`) mensyaratkan `adminToken` yang cocok. Hindari menaruh NIK/no. HP di file yang di-commit publik.
- **Keamanan login rendah.** "Login" hanya pencocokan NIK, tanpa password — memang sesuai kebutuhan kiosk yang ringan, tapi bukan autentikasi kuat. Jangan pakai pola ini untuk data sensitif.
- **Panel Admin tetap satu password bersama** (bukan akun per-orang) — cukup untuk tim kecil yang saling percaya, bukan untuk banyak admin dengan hak berbeda-beda. Tapi di mode `sheets`, password aslinya **tidak lagi tersimpan/terkirim ke browser**: `CONFIG.admin.password` di `config.js` cuma dipakai mode `mock` (demo lokal). Login sungguhan mengirim password ke `api/data.js`, dicek di server terhadap `ADMIN_TOKEN` (env var Vercel, tidak pernah ke klien), dan yang dibalas ke browser cuma **token sesi** bertanda tangan (HMAC) yang kedaluwarsa sendiri dalam 12 jam — bukan passwordnya. Siapa pun yang buka "View Source" tidak akan menemukan password aslinya lagi. Kalau butuh lebih dari ini (akun per-admin, audit log siapa mengubah apa), itu perubahan lebih besar — taruh `admin.html` di balik autentikasi level hosting atau bangun sistem akun sungguhan.
- **Tanpa mode `sheets`, hasil tidak terekam terpusat.** Mode `mock` menyimpan hasil hanya di browser perangkat itu (localStorage). Untuk rekap compliance lintas perangkat, sambungkan ke Google Sheets (lihat [Menyambung ke Google Sheets](#menyambung-ke-google-sheets-mode-sheets)).
- **Verifikasi QR** di mode `mock` hanya berlaku di perangkat yang sama. Verifikasi lintas perangkat butuh mode `sheets`.
- **Kredensial OAuth** (`GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`) tersimpan sebagai environment variable di Vercel, bukan di kode — jangan pernah commit ke Git. `refresh_token` setara "kunci masuk selamanya" ke akun Google yang dipakai; kalau bocor, cabut aksesnya di [myaccount.google.com/permissions](https://myaccount.google.com/permissions) (cari nama app OAuth-nya) lalu ulangi skrip otorisasi buat dapat token baru.
- **PDF sertifikat** dibuat di browser (html2canvas + jsPDF); hasil mengikuti tampilan kartu di layar.

---

## Peringkat ketepatan & kecepatan

Di layar Hasil (setelah kuis, sebelum sertifikat), peserta yang **lulus** dan termasuk **3 tercepat+tertepat** untuk topik itu (skor tertinggi, durasi pengerjaan sbg pembeda kalau skor sama) dapat badge kecil: *"Kamu terbaik ke-1 untuk ketepatan & kecepatan menjawab topik ini!"* (atau ke-2/ke-3). Dihitung per NIK terbaik (bukan tiap percobaan) supaya orang yang mencoba berkali-kali tidak numpuk sendiri di ranking, dan per topik (lintas semua sesi/waktu — bukan per sesi tunggal).

Sengaja **bukan leaderboard publik yang selalu tampil ke semua orang** (mis. "kamu peringkat ke-47") — kalau semua orang melihat peringkatnya, itu bisa mendorong buru-buru lewatin materi K3 demi ranking, yang bertentangan dengan tujuan aplikasi ini (materi keselamatan kerja). Dengan cuma memunculkan badge ke top-3 yang KEBETULAN cepat & tepat, sebagian besar peserta tidak pernah melihat sinyal kompetitif apa pun. Kalau ternyata pola pakainya justru mendorong buru-buru meski dibatasi begini, opsinya: matikan badge ini sepenuhnya, atau ganti jadi murni berbasis skor (tanpa `durationMs`) — tinggal ubah `computeRank` di `assets/api.js` & `api/data.js`.

Butuh kolom `durationMs` di tab `Partisipasi` (lihat header tab di [Menyambung ke Google Sheets](#menyambung-ke-google-sheets-mode-sheets) di atas) — dihitung di klien (`Date.now()` saat kuis dibuka sampai disubmit, lihat `assets/app.js`), jadi tidak akurat kalau ada jeda tanpa aktivitas yang tidak sampai memicu `idleResetSeconds` (kiosk di-reset otomatis kalau idle lebih lama dari itu).

---

## Alur

Masuk (NIK) → Konfirmasi identitas → Pilih sesi aktif → Baca materi → Kuis (soal acak) → Hasil (lulus/gagal, badge ranking kalau top-3) → Sertifikat + QR → rekam partisipasi.

Kalau karyawan sudah pernah **lulus** sesi yang sama sebelumnya, kartu sesi menampilkan badge "Sudah lulus" dan langsung membuka sertifikat yang sudah ada saat diklik — tidak perlu mengulang materi/kuis. Percobaan yang belum lulus tidak dianggap "sudah selesai", jadi tetap bisa dicoba lagi seperti biasa.
