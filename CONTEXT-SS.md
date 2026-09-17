# CONTEXT-SS.md

Dokumen fakta, disusun dari pembacaan langsung kode di repo ini. Tidak ada angka
dikarang — kalau tidak bisa diverifikasi dari kode/README, ditulis eksplisit
**PERLU INPUT USER**. Setiap poin menyertakan path file sebagai referensi.

Diambil dari commit `ab35bab` (HEAD saat dokumen ini dibuat), 65 commit total,
remote `https://github.com/oneesis/quiz-she.git`.

---

## 1. Identitas Aplikasi

- **Nama tampil**: "Sharing Session Digital — PT EBL" ([README.md:1](README.md#L1)). Judul tab browser kiosk: "Sharing Session — PT EBL" ([index.html:6](index.html#L6)); judul tab admin: "Panel Admin — LMS K3 EBL" ([admin.html:6](admin.html#L6)) — dua judul beda antara kiosk & admin. Nama internal package: `quiz-she-gas` ([package.json:2](package.json#L2)). Nama project Vercel: `quiz-she` (diamati langsung lewat `vercel project ls` di sesi ini, bukan dari file di repo).
- **Organisasi**: "PT Energi Batubara Lestari" / singkatan "PT EBL", subtitle "Sharing Session" ([assets/config.js:17-21](assets/config.js#L17-L21)).
- **Tujuan**: pekerja login pakai NIK, membaca materi K3 (Keselamatan & Kesehatan Kerja), mengerjakan kuis singkat, dan bila lulus mendapat sertifikat digital ber-QR ([README.md:3](README.md#L3)).
- **Riwayat nama**: sempat bernama "Safety Talk" / "P5M" sebelum di-rebrand jadi "Sharing Session" ([git log commit `0e34d08`](https://github.com/oneesis/quiz-she/commit/0e34d08), pesan persis: "Rebrand from Safety Talk / P5M to Sharing Session"). Repo **tidak mendefinisikan** apa itu "P5M" — kode/README tidak pernah menjelaskan kepanjangannya. (Di luar isi repo: "P5M" umum dikenal sebagai singkatan "Pertemuan 5 Menit", briefing K3 singkat sebelum kerja di industri tambang/konstruksi Indonesia — ini pengetahuan umum saya, BUKAN sesuatu yang tertulis di kode, jadi jangan dianggap terverifikasi dari repo.) Lihat §4 dan §8 soal keterkaitan ini dengan proses yang digantikan.
- **Pengguna**: dua peran berbeda, dua halaman terpisah tanpa tautan silang:
  - **Peserta/pekerja** — `index.html`, login pakai NIK saja (tanpa password) ([assets/api.js:183](assets/api.js#L183), [README.md:180](README.md#L180)). Dirancang untuk "tablet muster point atau HP" ([README.md:3](README.md#L3)).
  - **Admin** — `admin.html`, login pakai 1 password bersama (bukan akun per-orang) ([README.md:75](README.md#L75), [README.md:181](README.md#L181)). Tidak ada tautan dari kiosk ke admin, sengaja ([README.md:75](README.md#L75)).
- **Perusahaan di data contoh (mode `mock` saja, [assets/config.js:41-44](assets/config.js#L41-L44) menyatakan eksplisit array ini hanya dipakai kalau `dataSource:'mock'`)**: "PT OFN" dan "PT SCI" sebagai `perusahaan` karyawan ([assets/config.js:48-52](assets/config.js#L48-L52)). Karena `dataSource` produksi saat ini `'sheets'` ([assets/config.js:14](assets/config.js#L14)), nama perusahaan SUNGGUHAN dibaca dari Google Sheet, bukan array ini — apakah "PT OFN"/"PT SCI" sekadar nama contoh atau memang mencerminkan perusahaan/subkontraktor asli yang ada di Sheet produksi, **PERLU INPUT USER**.
- **Status (prod/dev)**: `assets/config.js:14` diset `dataSource: 'sheets'` (bukan `'mock'`) — artinya kode saat ini dikonfigurasi untuk backend Google Sheets sungguhan, bukan mode demo. Di sesi kerja ini, saya juga mengonfirmasi langsung (bukan dari file repo) bahwa project Vercel `quiz-she` sudah live di `quiz-she.vercel.app`, dengan environment variable `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SPREADSHEET_ID`, `ADMIN_TOKEN`, dan `BLOB_READ_WRITE_TOKEN` sudah terisi di Production. **Volume pemakaian nyata (berapa karyawan, seberapa sering dipakai) PERLU INPUT USER** — tidak bisa disimpulkan dari kode.
- **Catatan konsistensi**: `assets/config.js:27` — `showDemoHint: true`, padahal komentar di baris yang sama & [README.md:68](README.md#L68) bilang ini "matikan di produksi". Ini kondisi aktual di kode saat ini, bukan asumsi saya.

## 2. Stack & Arsitektur

- **Frontend**: HTML/CSS/JS murni, tanpa build step, tanpa framework JS ([README.md:3](README.md#L3), [README.md:26](README.md#L26)). Dua entry point: `index.html` (kiosk) dan `admin.html` (panel admin), keduanya memuat `assets/config.js`, `assets/api.js`, lalu skrip alurnya masing-masing (`assets/app.js` / `assets/admin.js`) — lihat tag `<script>` di akhir tiap file HTML.
- **Styling**: kiosk pakai `assets/styles.css` tulisan tangan (tema hijau-limau, lihat komentar di [README.md:50](README.md#L50) dan riwayat rebrand di §6). Admin pakai Tailwind CSS via CDN (`https://cdn.tailwindcss.com`, [admin.html:8](admin.html#L8)) + sedikit CSS custom inline di `<style>` ([admin.html:36-67](admin.html#L36-L67)).
- **Hosting**: Vercel, situs statis tanpa build command ([README.md:24-31](README.md#L24-L31)). Tidak ada `vercel.json` di repo (dicek langsung, tidak ada file itu) — konfigurasi Vercel murni lewat dashboard/env var.
- **Backend**: satu serverless function `api/data.js`, endpoint tunggal `/api/data`, dispatch berdasarkan query `action` (GET) atau body `{action, payload, adminToken}` (POST) — lihat tabel lengkap di [README.md:151-165](README.md#L151-L165) dan implementasi di [api/data.js:342-403](api/data.js#L342-L403).
- **Database/storage**:
  - **Google Sheets** (via Google Sheets API v4, bukan Apps Script) — 4 tab: `Master_Karyawan`, `Partisipasi`, `Topics`, `Session` ([api/data.js:17-20](api/data.js#L17-L20)). Autentikasi pakai *service account* JWT ([api/data.js:22-28](api/data.js#L22-L28)).
  - **Vercel Blob** — penyimpanan gambar materi topik, publik, nama file diberi random suffix ([api/data.js:294-309](api/data.js#L294-L309)). Menggantikan Google Drive (dipakai sebelumnya, lihat komentar di baris yang sama & [README.md:141](README.md#L141)) karena service account tidak pernah dapat kuota penyimpanan Drive biasa.
  - **localStorage** (browser) — progres jawaban kuis per NIK+sesi, kunci `quizProgress:<nik>:<sessionId>` ([assets/app.js:301](assets/app.js#L301), [assets/app.js:281](assets/app.js#L281)), berumur maks 4 jam ([assets/app.js:280](assets/app.js#L280)). Di mode `mock`, juga dipakai buat override `admin_topics`/`admin_sessions`/nomor sertifikat lokal ([assets/api.js:57-63](assets/api.js#L57-L63)).
- **Integrasi eksternal (semua lewat CDN, tanpa `npm install` sisi klien):**
  - `cdn.tailwindcss.com` — styling admin ([admin.html:8](admin.html#L8)).
  - Google Fonts (`Inter`, `Material Symbols Outlined`) ([admin.html:9-10](admin.html#L9-L10)).
  - `qrcodejs` (cdnjs) — generate QR code sertifikat ([assets/app.js:61](assets/app.js#L61)).
  - `html2canvas` + `jsPDF` (cdnjs) — render kartu sertifikat jadi PDF di browser ([assets/app.js:62-63](assets/app.js#L62-L63), dipakai di [assets/app.js:555](assets/app.js#L555)).
- **Dependency npm (backend only, dipakai `api/data.js`)**: `googleapis` ^144.0.0, `@vercel/blob` ^2.5.0 — satu-satunya isi `dependencies` di [package.json](package.json). Tidak ada dependency frontend (tidak ada React/Vue/rich-text-editor library dsb — editor "Materi" di admin adalah `contenteditable` + `document.execCommand` bawaan browser, lihat [assets/admin.js:227-291](assets/admin.js#L227-L291)).
- **Autentikasi admin**: bukan akun per-user. Password dicek server-side terhadap env var `ADMIN_TOKEN`; yang dikembalikan ke browser adalah token sesi bertanda tangan HMAC-SHA256 yang kedaluwarsa sendiri dalam 12 jam ([api/data.js:319-336](api/data.js#L319-L336), [README.md:181](README.md#L181)). Auto-logout browser tambahan setelah 15 menit idle ([assets/admin.js:75](assets/admin.js#L75)).

## 3. Fitur (daftar lengkap)

### Sisi peserta (`index.html`, 9 layar — lihat `id="screen-*"` di [index.html](index.html))

| Fitur | Alur input → proses → output | File/fungsi utama |
|---|---|---|
| Login NIK | Input NIK → `API.findEmployee(nik)` cari di roster → tampil data diri buat konfirmasi | [assets/app.js:113-144](assets/app.js#L113-L144) (`renderLogin`, `doLogin`) |
| Konfirmasi identitas | Tampilkan nama/perusahaan hasil login → user konfirmasi ya/tidak | [assets/app.js:146](assets/app.js#L146) (`renderConfirm`) |
| Pilih sesi | `API.activeSessions(employee)` ambil sesi `published` & masih dalam rentang tanggal & cocok `targetCompanies` → daftar kartu sesi, sesi yg sudah pernah lulus tandai badge & langsung ke sertifikat kalau diklik | [assets/app.js:160-206](assets/app.js#L160-L206) (`renderSessions`), filter di [assets/api.js:65-70](assets/api.js#L65-L70) (`buildActiveSessions`) |
| Riwayat Sertifikat Saya | `API.listHistory(nik)` → semua topik yg PERNAH lulus (lintas sesi) → per kartu: tombol "Lihat Materi" (baca-saja) & "Lihat Sertifikat" | [assets/app.js:207-253](assets/app.js#L207-L253) (`renderHistory`) |
| Baca Materi | Render `topic.material` (HTML dari editor WYSIWYG, atau teks-markup lama) + gambar materi opsional (bisa di-zoom) → tombol "Mulai Kuis" (disembunyikan kalau dibuka dari Riwayat) | [assets/app.js:257-299](assets/app.js#L257-L299) (`renderMaterial`), parser di [assets/app.js:73-89](assets/app.js#L73-L89) (`renderMaterialText`) |
| Lightbox zoom gambar | Scroll mouse = zoom manual (transform translate+scale, zoom ke arah kursor); klik-seret = geser; khusus desktop. Mobile pakai pinch-zoom native browser (viewport dilonggarkan sementara) | [assets/app.js:627-698](assets/app.js#L627-L698) |
| Kuis | Ambil `questionsPerAttempt` soal acak dari bank soal topik, urutan opsi diacak, progres tersimpan ke localStorage tiap jawab → skor & `passed` dihitung dari `passThreshold` topik | [assets/app.js:322-484](assets/app.js#L322-L484) (`startQuiz`, `renderQuestion`, `grade`) |
| Navigasi soal | Grid tombol nomor soal, warna beda utk terjawab/soal aktif, klik lompat ke soal itu | [assets/app.js:377-398](assets/app.js#L377-L398) (`renderNavGrid`) |
| Hasil | Tampilkan skor, lulus/tidak, opsi retry kalau gagal | [assets/app.js:490-526](assets/app.js#L490-L526) (`renderResult`) |
| Sertifikat + QR | Generate QR (`qrcodejs`) berisi link `?verify=<token>`, kartu sertifikat dgn nomor unik | [assets/app.js:527-554](assets/app.js#L527-L554) (`renderCertificate`) |
| Unduh PDF sertifikat | `html2canvas` render kartu jadi gambar → `jsPDF` bungkus jadi PDF, orientasi ikut aspek rasio kartu | [assets/app.js:555-579](assets/app.js#L555-L579) (`downloadPdf`) |
| Verifikasi QR | Buka `?verify=<token>` → `API.findByToken(token)` → tampilkan status sah/tidak + data pemilik & topik | [assets/app.js:580-626](assets/app.js#L580-L626) (`tryVerifyFromUrl`) |
| Auto-reset idle | Tidak ada aktivitas `idleResetSeconds` detik → kembali ke layar login (buat kiosk bersama) | [assets/app.js:103-112](assets/app.js#L103-L112) |
| Auto-retry submit | Submit hasil kuis gagal (jaringan putus) → retry otomatis | [assets/app.js:431-443](assets/app.js#L431-L443) (`submitWithRetry`) |

### Sisi admin (`admin.html`, 5 tab menu + 2 editor — lihat `id="panel-*"` di [admin.html](admin.html))

| Fitur | Alur input → proses → output | File/fungsi utama |
|---|---|---|
| Login admin | Password → `API.adminLogin` → token sesi HMAC tersimpan di `sessionStorage` | [assets/admin.js:45-63](assets/admin.js#L45-L63) |
| Dashboard | Hitung dari `listParticipations()`+`listEmployees()`+topik/sesi nyata: total karyawan, topik, sesi aktif, partisipasi, rata skor, tingkat lulus, tren 6 bulan, aktivitas terbaru | [assets/admin.js:145-225](assets/admin.js#L145-L225) |
| Kelola Topik | Tambah/edit/hapus: kode, judul, ambang lulus, gambar (upload ke Blob), materi (WYSIWYG), bank soal | [assets/admin.js:294-433](assets/admin.js#L294-L433) |
| Editor Materi WYSIWYG | `contenteditable` + `document.execCommand` — Bold/Italic/Underline, Subjudul/Teks, bullet/angka list, perataan. Paste teks polos dgn `"## "`/`"- "`/`"1. "` otomatis dikonversi jadi elemen HTML terkait (bukan literal) | [assets/admin.js:227-291](assets/admin.js#L227-L291) |
| Upload gambar materi | Resize gambar di browser (`<canvas>`, maks 1600px, [assets/admin.js:445](assets/admin.js#L445) `resizeImageToBase64`) sebelum kirim → `action: upload_image` ([assets/admin.js:463](assets/admin.js#L463) `handleImageFileChange`) → Vercel Blob ([api/data.js:300](api/data.js#L300) `uploadImage`) → URL tersimpan di `topic.materialImage` | [assets/admin.js:445-490](assets/admin.js#L445-L490) |
| Impor soal CSV | Unduh template → isi Excel/Sheets (`pertanyaan, opsiA-D, jawaban`) → parse & tambah ke bank soal (tidak menimpa), baris tak lengkap dilewati & dilaporkan | [assets/admin.js:491-545](assets/admin.js#L491-L545), format di [README.md:94-101](README.md#L94-L101) |
| Kelola Sesi | Jadwalkan topik: rentang tanggal(+jam), target perusahaan (checkbox dari roster), status draft/published | [assets/admin.js:584-701](assets/admin.js#L584-L701) |
| Laporan — ringkasan per perusahaan/topik | Agregat jumlah peserta, lulus/gagal, rata skor, % kelulusan | [assets/admin.js:739-776](assets/admin.js#L739-L776) |
| Laporan — Kelulusan per Perusahaan & Departemen (grafik) | Dari scope karyawan 1 sesi terpilih + status lulus/tidak → bar hijau per departemen per perusahaan | [assets/admin.js:897-929](assets/admin.js#L897-L929) (`renderDeptChart`) |
| Laporan — Belum Lulus per Sesi | Bandingkan roster (sesuai `targetCompanies` sesi) vs yg sudah `passed` utk sesi itu → daftar yg belum, bisa unduh CSV | [assets/admin.js:931-998](assets/admin.js#L931-L998) |
| Analitik Soal | Per sesi (wajib pilih, tidak auto-gabung), dari `answerBreakdown` tiap partisipasi: tingkat salah per soal + jawaban salah terbanyak dipilih vs jawaban benar | [assets/admin.js:777-844](assets/admin.js#L777-L844) |
| Detail per Peserta + filter + expor CSV | Tabel semua partisipasi, filter perusahaan/topik/tanggal, unduh CSV | [assets/admin.js:702-882](assets/admin.js#L702-L882) |
| Riwayat per Karyawan (modal) | Klik nama di tabel manapun → semua attempt NIK itu | [assets/admin.js:1000-1023](assets/admin.js#L1000-L1023) |
| Karyawan | Baca-saja: daftar + pencarian nama/NIK/perusahaan/jabatan/departemen | [assets/admin.js:1030-1077](assets/admin.js#L1030-L1077) |

## 4. Proses Manual yang Digantikan

Bagian ini hanya berisi yang **eksplisit tersirat dari kode/README/pesan commit**. Detail proses lama yang sesungguhnya (kertas? Excel? sistem lain? siapa yang mengerjakan?) tidak pernah ditulis di repo — ditandai PERLU INPUT USER.

- **Kuis + sertifikat digital ber-QR** — nama lama proyek "Safety Talk / P5M" ([commit `0e34d08`](https://github.com/oneesis/quiz-she/commit/0e34d08)) dan istilah "muster point" ([README.md:3](README.md#L3)) mengindikasikan ini menggantikan briefing K3 tatap muka + pencatatan kehadiran manual. **Bagaimana persisnya proses lama (kertas absen? tanda tangan? tidak ada sama sekali) — PERLU INPUT USER.**
- **Verifikasi sertifikat via QR** ([assets/app.js:580-626](assets/app.js#L580-L626)) — menggantikan verifikasi manual (telepon HR / cek buku besar) untuk membuktikan seseorang benar sudah lulus training tertentu. Tidak ada bukti langsung di kode soal proses "sebelum"-nya — **PERLU INPUT USER**.
- **Impor soal CSV** ([README.md:94](README.md#L94)) — README eksplisit bilang "**Alih-alih** mengetik soal satu per satu" → ini secara langsung menggantikan input manual satu-per-satu di form. Fakta ini didukung teks README, bukan tebakan.
- **Laporan Belum Lulus per Sesi + grafik per Perusahaan/Departemen** ([assets/admin.js:897-998](assets/admin.js#L897-L998)) — menggantikan proses cross-check manual antara daftar roster dan daftar yang sudah ikut training (mis. cocokkan Excel HR vs catatan training satu-satu) untuk tahu siapa yang belum comply. Kesimpulan ini dari FUNGSI fitur itu sendiri (bandingkan `scope` roster vs `passedNiks`), bukan pernyataan eksplisit di kode/README.
- **Ekspor CSV Laporan/Belum Lulus** ([assets/admin.js:871-882](assets/admin.js#L871-L882), [assets/admin.js:990-998](assets/admin.js#L990-L998)) — memungkinkan data dibawa ke Excel utk diolah lebih lanjut/dilaporkan ke pihak lain; ini pola umum tapi **tujuan spesifik laporan itu dipakai untuk apa (audit? kirim ke klien? kirim ke Kemnaker?) — PERLU INPUT USER.**
- **Roster karyawan dari Google Sheet `Master_Karyawan`** ([README.md:110](README.md#L110)) — aplikasi hanya MEMBACA sheet ini, tidak menulis. Berarti proses pemeliharaan data karyawan (siapa yang input, dari sistem HR apa) sudah ada SEBELUM aplikasi ini dan tetap berjalan terpisah — **detail sistem HR sumbernya PERLU INPUT USER.**

## 5. Data & Metrik yang Tersedia

Field-field berikut ada di data nyata (Google Sheet, mode `sheets`) dan bisa dipakai sebagai bukti before/after:

**Tab `Partisipasi`** (header persis di [README.md:124](README.md#L124), dibaca/ditulis di [api/data.js:207-269](api/data.js#L207-L269)):
- `waktu` — timestamp submit (ISO string sejak backend Vercel; baris lama dari era Apps Script berupa serial number Excel, dikonversi di [api/data.js:70-76](api/data.js#L70-L76)).
- `nik`, `nama`, `perusahaan` — identitas peserta saat submit (snapshot, bukan live-join ke roster).
- `topicCode`, `sessionId` — topik & sesi yang diikuti.
- `attemptNo` — ke berapa kali NIK itu mencoba topik ini.
- `score` — persentase skor (angka).
- `passed` — boolean lulus/tidak (dibanding `passThreshold` topik saat kuis dikerjakan).
- `certificateNo` — nomor sertifikat unik, format `NNN/SS/<KODEPERUSAHAAN>/<bulan>/<tahun-2digit>` ([api/data.js:197-205](api/data.js#L197-L205)), diisi HANYA kalau `passed`.
- `verificationToken` — token acak dipakai di URL QR (`?verify=`).
- `answerBreakdown` — JSON per-soal: `{q, correct, chosen, correctText}` (dipakai Analitik Soal, [assets/admin.js:793-844](assets/admin.js#L793-L844)); baris lama sebelum fitur ini ada tidak punya field ini.

**Tab `Topics`** ([README.md:125](README.md#L125), [api/data.js:271-280](api/data.js#L271-L280)): `code`, `title`, `passThreshold`, `material` (HTML/teks), `materialImage` (URL Blob), `questionsJson` (array soal).

**Tab `Session`** ([README.md:126](README.md#L126), [api/data.js:282-292](api/data.js#L282-L292)): `id`, `topicCode`, `title`, `validFrom`, `validUntil`, `targetCompanies` (CSV string→array), `status` (`draft`/`published`).

**Tab `Master_Karyawan`** (kolom yang DIBACA aplikasi — [api/data.js:182-185](api/data.js#L182-L185)): `NIK`, `NAMA`, `PERUSAHAAN`, `JABATAN`, `DEPARTEMEN`. Komentar di [assets/config.js:46](assets/config.js#L46) menyebut sheet aslinya juga punya kolom `SUBCONT` dan `NO WHATSAPP` yang **tidak dipakai/dibaca** oleh aplikasi ini saat ini.

**Metrik turunan yang sudah dihitung di admin** (bukan field mentah, tapi angka jadi):
- Tingkat kelulusan per perusahaan/topik/departemen (`buildSummary`/`renderDeptChart`, [assets/admin.js:739](assets/admin.js#L739), [assets/admin.js:897](assets/admin.js#L897)).
- Tren bulanan 6 bulan terakhir ([assets/admin.js:196-225](assets/admin.js#L196-L225)).
- Tingkat salah per soal + jawaban terbanyak dipilih ([assets/admin.js:793-844](assets/admin.js#L793-L844)).

**Yang TIDAK ada di data**: tidak ada field durasi pengerjaan kuis per soal, tidak ada log klik/aktivitas selain jawaban final, tidak ada data biometrik/lokasi.

## 6. Timeline

Sumber: `git log`, 65 commit, semua di branch `main`, rentang **2026-07-02 s/d 2026-07-14**.

| Tanggal | Yang dikerjakan (ringkas per hari) |
|---|---|
| 2026-07-02 | Commit awal (`ddba69f`, "Initial Apps Script rebuild"). Hari ini saja: 17 commit — bangun fondasi kiosk+admin di atas **Google Apps Script** (backend awal, belakangan diganti), sinkron roster karyawan, sertifikat PDF, redesign admin (sidebar+dashboard data nyata), redesign layar kuis (navigasi soal), koneksi ke Sheet HR, materi teks+gambar upload+import CSV soal, rebrand nama dari "Safety Talk/P5M" ke "Sharing Session", laporan non-partisipasi. |
| 2026-07-03 | 8 commit — perbaikan PDF sertifikat di HP, simpan progres jawaban per NIK, percepat load kiosk, pinch-zoom native gambar materi, analitik per-soal, auto-retry submit, cache endpoint kiosk, **ganti backend dari Apps Script ke Vercel serverless function** (`06876f5` — migrasi arsitektur besar). |
| 2026-07-04 | 5 commit — sembunyikan password admin dari kode klien (token sesi HMAC, `2b2c428`), pisah password demo vs produksi, tambah jam ke jadwal sesi, tambah fitur "Riwayat Sertifikat Saya", tombol kembali dari riwayat + fix bug tanggal 1970 pada data lama. |
| 2026-07-04–05 | Tambah pengakuan "Skor Sempurna" (personal), samakan palet warna kiosk↔admin (navy+gold — tema transisi, lihat `stitch_lms_k3_ebl_dashboard/` untuk referensi desainnya). |
| 2026-07-05 | 7 commit — fix badge "Sempurna" ketiban tombol di HP, tampilkan topik/sesi di layar cek keaslian, **rebrand visual penuh ke tema hijau-limau** (`d075804`, `aa6ea47` — menimpa rebrand navy+emas sebelumnya lewat merge), sentuhan artistik (blob ambient, watermark, ikon topik K3, confetti skor sempurna), kurangi warna hitam di panel gelap, fix kolom Analitik Soal. |
| 2026-07-07 | 8 commit — tampilkan pesan error asli dari server (bukan generik), **ganti upload gambar dari Google Drive ke Vercel Blob** (`e168800` — Drive tidak pernah beri kuota ke service account), resize gambar client-side sebelum upload, tambah drag-to-pan & zoom manual scroll-mouse di lightbox (beberapa iterasi perbaikan sampai `c3eb237`), naikkan `questionsPerAttempt` 5→10, perkecil kotak navigasi soal. |
| 2026-07-14 | 6 commit — tambah grafik kelulusan per perusahaan & departemen di Laporan, **ganti input Materi dari textarea+markup ke editor WYSIWYG** (`7f87b73`), update README, konversi otomatis markup saat paste ke editor, fix bullet/heading tidak kelihatan (konflik CSS Tailwind Preflight), izinkan lihat materi lagi dari Riwayat Sertifikat (`ab35bab`, HEAD saat ini). |

**Tanggal deploy**: tidak ada file/log deploy tersimpan di repo. Yang bisa saya konfirmasi (dari tindakan langsung di sesi kerja ini, bukan dari isi repo): project Vercel `quiz-she` sudah punya riwayat deployment produksi berumur beberapa hari sebelum sesi ini dimulai, dan terus ter-redeploy otomatis tiap push ke `main` ([README.md:31](README.md#L31)). **Tanggal deploy PERTAMA ke Vercel — PERLU INPUT USER** (tidak tercatat di repo; kemungkinan berdekatan dengan commit `06876f5` tanggal 2026-07-03 yang memperkenalkan `api/data.js`, tapi ini indikasi bukan bukti langsung).

## 7. Aset Visual

- [assets/Logo EBL.png](assets/Logo%20EBL.png) — logo, dipakai sbg favicon & header (dicek referensinya lewat `<link rel="icon">` dan elemen logo di `index.html`/`admin.html`).
- [assets/Logo Hasnur.png](assets/Logo%20Hasnur.png) — logo kedua, ada di folder `assets/` tapi **saya tidak menemukan referensi pemakaiannya di index.html/admin.html/CSS** lewat pencarian teks — kemungkinan belum/tidak dipakai di kode saat ini, atau dipakai lewat cara yang tidak saya temukan. Perlu dicek manual kalau butuh kepastian.
- [assets/Nilai Inti - Indonesia.png](assets/Nilai%20Inti%20-%20Indonesia.png) — sama seperti di atas, ada di folder tapi tidak ketemu referensi pemakaian langsung di kode yang saya baca.
- `stitch_lms_k3_ebl_dashboard/` — **folder ini di-gitignore** ([.gitignore:4](.gitignore#L4)), artinya TIDAK ikut ter-commit/ter-deploy, murni file lokal di mesin ini saat dokumen ini dibuat:
  - `stitch_lms_k3_ebl_dashboard/lms_k3_ebl_core/DESIGN.md` — spesifikasi design system (palet navy+kuning "Deep Corporate Blue"/"Safety Yellow", tipografi Inter, dst.) — tampaknya draft desain AWAL yang TIDAK dipakai di versi final (versi final kode pakai tema hijau-limau, lihat §6 tanggal 2026-07-05).
  - `stitch_lms_k3_ebl_dashboard/admin_dashboard_lms_k3_ebl/code.html` + `screen.png`
  - `stitch_lms_k3_ebl_dashboard/exam_management_lms_k3_ebl/code.html` + `screen.png`
  - `stitch_lms_k3_ebl_dashboard/question_bank_lms_k3_ebl/code.html` + `screen.png`
  - `stitch_lms_k3_ebl_dashboard/training_analytics_lms_k3_ebl/code.html` + `screen.png`
  - Karena tidak ter-tracked git, **saya tidak bisa memastikan file-file ini akan tetap ada di clone/checkout lain dari repo ini.**

## 8. Yang TIDAK Bisa Dijawab dari Kode

- Proses manual/legacy spesifik yang digantikan aplikasi ini (kertas? Excel? sistem lama? nama sistemnya apa?) — kode hanya menyiratkan lewat nama lama "Safety Talk/P5M" dan istilah "muster point", tidak menyatakan eksplisit.
- Volume pemakaian nyata: jumlah karyawan aktif, jumlah sesi/topik yang benar-benar berjalan, frekuensi pemakaian kiosk.
- Siapa pemilik bisnis/PIC di sisi PT EBL, siapa admin yang benar-benar memegang password panel admin.
- Apakah "PT OFN"/"PT SCI" di data contoh (`assets/config.js`) adalah nama perusahaan asli (mis. kontraktor/subkontraktor PT EBL) atau sekadar contoh fiktif.
- Apakah ada regulasi/kepatuhan spesifik (K3, Kemnaker, atau lainnya) yang mewajibkan pencatatan training ini — tidak ada referensi regulasi di kode/README.
- Tanggal deploy produksi PERTAMA kali ke Vercel (tidak tercatat di repo).
- Alasan bisnis di balik tiga kali rebrand visual (hazard-stripe → navy/gold → hijau-limau) — commit message menjelaskan APA yang berubah, bukan MENGAPA.
- Status pemakaian folder `stitch_lms_k3_ebl_dashboard/` — apakah masih dipakai sbg referensi desain aktif, atau sisa eksperimen yang boleh dihapus (folder ini gitignored, jadi keputusan itu murni di sisi developer lokal).
- Biaya operasional (Vercel plan, kuota Google Sheets API, kuota Vercel Blob) dan siapa yang menanggungnya.
- Rencana roadmap/fitur yang belum dikerjakan — tidak ada file TODO/roadmap di repo.
