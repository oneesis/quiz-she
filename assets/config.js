/* ============================================================
   KONFIGURASI APLIKASI
   ============================================================
   dataSource:
     'mock'        -> pakai data contoh di file ini. Jalan langsung
                      di GitHub Pages tanpa backend apa pun.
     'apps_script' -> baca daftar karyawan & simpan hasil ke Google
                      Sheet lewat Google Apps Script Web App.
                      Isi appsScriptUrl di bawah. (lihat README)
   ============================================================ */
window.CONFIG = {
  dataSource: 'apps_script',
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbxcDx6BPcOkkbV5sytyUnxxqeH4GTaDb9KZs90Y7gYjGtYwWeTpkgSCouwATBDeNRuo/exec',

  org: {
    name: 'PT Energi Batubara Lestari',
    short: 'PT EBL',
    subtitle: 'Sharing Session',
  },

  passThresholdDefault: 80,   // % kelulusan default bila topik tidak menyetel
  questionsPerAttempt: 5,     // jumlah soal ditampilkan (diacak dari bank soal)
  minMaterialSeconds: 8,      // durasi minimum baca materi sebelum kuis terbuka
  idleResetSeconds: 120,      // auto-reset kiosk saat tidak ada aktivitas
  showDemoHint: true,         // tampilkan NIK contoh di layar login (matikan di produksi)

  admin: {
    // Gerbang login panel admin (admin.html). Ini pengecekan di sisi
    // browser saja, BUKAN autentikasi yang aman — siapa pun yang bisa
    // melihat file ini bisa melihat password-nya. Ganti sebelum deploy,
    // dan lihat catatan keamanan di README sebelum memakai ini untuk
    // data sensitif.
    password: 'ebl-admin',
  },
};

/* ============================================================
   DATA CONTOH  (hanya dipakai saat dataSource = 'mock')
   Di produksi, employees & (opsional) topics/sessions diambil
   dari Google Sheet lewat Apps Script.
   ============================================================ */
window.SAMPLE = {
  // Cocok dengan kolom tab Master_Karyawan: PERUSAHAAN, SUBCONT, NAMA, NIK, JABATAN, DEPARTEMEN, NO WHATSAPP
  employees: [
    { nik: '02-010218-001', nama: 'YUDI SASTERA GUNAWAN', perusahaan: 'PT OFN', jabatan: 'Operational', departemen: 'Operational' },
    { nik: '02-030218-002', nama: 'MUHAMAD KHUSEN',       perusahaan: 'PT OFN', jabatan: 'Foreman Plant', departemen: 'Plant CCP' },
    { nik: '02-051023-324', nama: 'RIZAL PRANOWO',        perusahaan: 'PT OFN', jabatan: 'Paramedic',    departemen: 'SHE' },
    { nik: 'SCI-001',       nama: 'RIZKY RAHMATULLAH',    perusahaan: 'PT SCI', jabatan: 'PJO',          departemen: 'Management' },
    { nik: 'SCI-002',       nama: 'MUCHAMAD RYO MEDYANTORO', perusahaan: 'PT SCI', jabatan: 'QSHE Officer', departemen: 'QSHE' },
  ],

  topics: [
    {
      code: 'ST-APD',
      title: 'Alat Pelindung Diri (APD) di Area Tambang',
      passThreshold: 80,
      materialImage: '',
      material: `Alat Pelindung Diri (APD) adalah pertahanan terakhir ketika bahaya tidak bisa dihilangkan dari sumbernya. APD tidak menghilangkan bahaya, tapi mengurangi tingkat keparahan cedera bila terjadi kontak.
## APD wajib di area operasi tambang
- Helm keselamatan — lindungi kepala dari benturan & benda jatuh.
- Sepatu safety — pelindung ujung baja, alas anti-selip.
- Rompi reflektif — agar terlihat oleh operator alat berat.
- Kacamata & sarung tangan — sesuai jenis pekerjaan.
- Pelindung telinga — di area kebisingan tinggi.
## Prinsip pemakaian
Periksa kondisi APD sebelum dipakai. APD yang rusak, retak, atau sudah lewat masa pakai harus diganti — bukan dipaksakan. Pakai APD sepanjang berada di area kerja, bukan hanya saat ada pengawas.`,
      questions: [
        { q: 'APD berfungsi sebagai pengendali bahaya tingkat…', options: ['Pertama (eliminasi)', 'Terakhir', 'Administratif', 'Substitusi'], correct: 1 },
        { q: 'Sepatu safety di area tambang wajib memiliki…', options: ['Warna cerah', 'Pelindung ujung baja & alas anti-selip', 'Hak tinggi', 'Bahan kanvas'], correct: 1 },
        { q: 'Fungsi utama rompi reflektif adalah…', options: ['Menahan panas', 'Agar pekerja terlihat operator alat berat', 'Menyimpan alat', 'Gaya'], correct: 1 },
        { q: 'Jika helm ditemukan retak sebelum bekerja, tindakan yang benar…', options: ['Tetap dipakai', 'Ditambal lakban', 'Diganti dengan yang layak', 'Dipakai terbalik'], correct: 2 },
        { q: 'Pelindung telinga wajib dipakai di area dengan…', options: ['Debu tinggi', 'Kebisingan tinggi', 'Cahaya terang', 'Suhu dingin'], correct: 1 },
        { q: 'APD sebaiknya dipakai…', options: ['Hanya saat ada pengawas', 'Hanya saat inspeksi', 'Sepanjang berada di area kerja', 'Saat foto'], correct: 2 },
      ],
    },
    {
      code: 'ST-FTG',
      title: 'Manajemen Kelelahan (Fatigue) untuk Pekerja Shift',
      passThreshold: 80,
      materialImage: '',
      material: `Kelelahan (fatigue) menurunkan kewaspadaan, memperlambat reaksi, dan meningkatkan risiko kecelakaan — terutama bagi operator alat berat dan pengemudi. Kelelahan berat setara dampaknya dengan pengaruh alkohol terhadap konsentrasi.
## Tanda-tanda kelelahan
- Sering menguap, mata berat, sulit fokus.
- Melamun / kehilangan beberapa detik tanpa sadar (microsleep).
- Mudah tersinggung dan reaksi melambat.
## Yang harus dilakukan
Tidur cukup sebelum shift, manfaatkan waktu istirahat, dan hindari kafein berlebihan sebagai pengganti tidur. Bila merasa mengantuk saat mengoperasikan unit, berhenti di tempat aman dan lapor pengawas — jangan memaksakan diri.`,
      questions: [
        { q: 'Kelelahan berat berdampak pada konsentrasi setara dengan…', options: ['Olahraga', 'Pengaruh alkohol', 'Sarapan', 'Peregangan'], correct: 1 },
        { q: 'Kehilangan kesadaran beberapa detik tanpa sadar disebut…', options: ['Microsleep', 'Refleks', 'Istirahat aktif', 'Fokus'], correct: 0 },
        { q: 'Jika mengantuk saat mengoperasikan unit, tindakan yang benar…', options: ['Percepat agar cepat selesai', 'Berhenti di tempat aman & lapor pengawas', 'Buka jendela lalu lanjut', 'Diamkan saja'], correct: 1 },
        { q: 'Cara terbaik mencegah kelelahan sebelum shift adalah…', options: ['Kafein banyak', 'Tidur cukup', 'Begadang', 'Lewati istirahat'], correct: 1 },
        { q: 'Kafein berlebihan sebagai pengganti tidur bersifat…', options: ['Solusi jangka panjang', 'Bukan pengganti tidur', 'Wajib', 'Aman tanpa batas'], correct: 1 },
      ],
    },
  ],

  // Session = jadwal terbit dari sebuah topik. Hanya 'published' & masih berlaku yang tampil.
  sessions: [
    { id: 'S-001', topicCode: 'ST-APD', title: 'Sharing Session Hari Ini — APD di Area Tambang', validFrom: '2025-01-01', validUntil: '2030-12-31', targetCompanies: [], status: 'published' },
    { id: 'S-002', topicCode: 'ST-FTG', title: 'Sharing Session Hari Ini — Manajemen Kelelahan', validFrom: '2025-01-01', validUntil: '2030-12-31', targetCompanies: [], status: 'published' },
  ],
};
