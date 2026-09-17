-- ============================================================================
-- quiz-she (Sharing Session / LMS K3) — Skema PostgreSQL (Neon)
-- ----------------------------------------------------------------------------
-- Migrasi dari Google Sheets (tab Topics / Session / Partisipasi).
-- Gambar materi tetap di Vercel Blob / Drive; kolom di sini simpan URL (TEXT).
--
-- ROSTER: quiz-she memakai roster yang SAMA dengan ONE-SAP. Rekomendasi:
--   satu project Neon, satu database, tabel `karyawan` dari schema ONE-SAP
--   dipakai bersama. Beri quiz-she koneksi role READ-ONLY ke tabel karyawan
--   (quiz-she tidak pernah menulis roster). Alternatif: quiz-she baca roster
--   via API ONE-SAP seperti sekarang. Tidak perlu menyalin tabel karyawan.
-- ============================================================================

-- ── Topik (bank materi + soal) ──────────────────────────────────────────────
-- code = ID jadwal Safety Talk ("ST-…") bila dibuat lewat "Import dari Safety
-- Talk"; itulah linkage ke ONE-SAP.
CREATE TABLE topik (
  code            TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  pass_threshold  INT NOT NULL DEFAULT 80,   -- ambang lulus (%)
  material        TEXT,                       -- HTML materi
  material_image  TEXT,                       -- URL gambar (Vercel Blob/Drive)
  questions       JSONB NOT NULL DEFAULT '[]',-- [{q, options[], correct}]
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Sesi (penjadwalan tampil di kiosk) ──────────────────────────────────────
CREATE TABLE sesi (
  id                TEXT PRIMARY KEY,          -- "S-…"
  topic_code        TEXT NOT NULL,             -- referensi topik (longgar, tanpa FK — migrasi bertahap)
  title             TEXT,                       -- kosong = pakai judul topik
  valid_from        TEXT,                       -- string tgl spt di app; sesi Safety Talk (ST-*) diabaikan
  valid_until       TEXT,
  target_companies  TEXT,                       -- comma-joined; kosong = semua perusahaan
  status            TEXT NOT NULL DEFAULT 'draft', -- draft/published
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_sesi_topic  ON sesi (topic_code);
CREATE INDEX ix_sesi_status ON sesi (status);

-- ── Partisipasi (hasil pengerjaan kuis) ─────────────────────────────────────
CREATE TABLE partisipasi (
  id                 BIGSERIAL PRIMARY KEY,
  waktu              TIMESTAMPTZ NOT NULL DEFAULT now(),
  nik                TEXT NOT NULL,
  nama               TEXT,
  perusahaan         TEXT,
  topic_code         TEXT,
  session_id         TEXT,          -- referensi id sesi (longgar; sesi bisa dihapus tanpa merusak riwayat)
  attempt_no         INT,
  score              INT,                       -- 0..100
  passed             BOOLEAN NOT NULL DEFAULT FALSE,
  certificate_no     TEXT,                      -- diisi hanya jika lulus
  verification_token TEXT,                      -- token QR sertifikat
  answer_breakdown   JSONB,                     -- rincian jawaban
  duration_ms        BIGINT                     -- lama pengerjaan (badge kecepatan)
);
CREATE INDEX ix_part_nik        ON partisipasi (nik);
CREATE INDEX ix_part_session    ON partisipasi (session_id);
CREATE INDEX ix_part_nik_sess   ON partisipasi (nik, session_id);      -- cek "existing" cepat
CREATE INDEX ix_part_topic      ON partisipasi (topic_code);
CREATE UNIQUE INDEX ux_part_token ON partisipasi (verification_token) WHERE verification_token IS NOT NULL;
-- Cegah nomor sertifikat dobel (race di Sheets dulu jadi masalah):
CREATE UNIQUE INDEX ux_part_certno ON partisipasi (certificate_no) WHERE certificate_no IS NOT NULL;
