/**
 * Mirrors employees from the company's HR-managed "Database Coding HR"
 * spreadsheet (tab Master_Karyawan) into our own Employees sheet, matching
 * the same rules as the earlier Laravel sync:
 * - Upsert by NIK.
 * - Skip rows whose NIK has no digits at all (catches "-"/"N/A" placeholders,
 *   not just truly empty cells — see [[project-quiz-she-overview]] for why).
 * - PERUSAHAAN values not already in our Companies sheet are logged as a
 *   warning, never auto-created.
 * - Employees no longer present in the source are set to status=nonaktif,
 *   never deleted.
 */
const HR_SPREADSHEET_ID = '1IpUFy-uCPo5OPQUOxUkOxMn7F79-wq989cV3_SL5CJc';
const HR_SHEET_NAME = 'Master_Karyawan';

function syncEmployeesFromHR_() {
  const hrSheet = SpreadsheetApp.openById(HR_SPREADSHEET_ID).getSheetByName(HR_SHEET_NAME);

  if (!hrSheet) {
    throw new Error('Tab "' + HR_SHEET_NAME + '" tidak ditemukan di spreadsheet HR.');
  }

  const values = hrSheet.getDataRange().getValues();
  const header = values[0].map(function (h) { return String(h).trim().toUpperCase(); });
  const rows = values.slice(1);

  const col = function (name) { return header.indexOf(name); };
  const idx = {
    perusahaan: col('PERUSAHAAN'),
    subcont: col('SUBCONT'),
    nama: col('NAMA'),
    nik: col('NIK'),
    jabatan: col('JABATAN'),
    departemen: col('DEPARTEMEN'),
    phone: col('NO WHATSAPP'),
  };

  if (idx.nik === -1 || idx.nama === -1) {
    throw new Error('Kolom NIK/NAMA tidak ditemukan di header sheet HR.');
  }

  const db = getDb_();
  const companies = getRows_(db, SHEETS.COMPANIES);
  const existingEmployees = getRows_(db, SHEETS.EMPLOYEES);

  let created = 0, updated = 0, skipped = 0;
  const warnings = [];
  const seenNiks = [];

  rows.forEach(function (row) {
    const nik = String(idx.nik !== -1 ? row[idx.nik] : '').trim();
    const nama = String(idx.nama !== -1 ? row[idx.nama] : '').trim();

    if (!nik || !/\d/.test(nik)) {
      skipped++;
      warnings.push('Baris dilewati: NIK kosong/tidak valid (nama: ' + (nama || '-') + ')');
      return;
    }

    const companyName = String(idx.perusahaan !== -1 ? row[idx.perusahaan] : '').trim();
    let company = companyName ? companies.filter(function (c) { return c.name === companyName; })[0] : null;

    if (companyName && !company) {
      warnings.push('Perusahaan belum terdaftar di master: "' + companyName + '" (NIK ' + nik + ')');
    }

    const data = {
      nik: nik,
      nama: nama,
      company_id: company ? company.id : '',
      subcont: idx.subcont !== -1 ? row[idx.subcont] : '',
      jabatan: idx.jabatan !== -1 ? row[idx.jabatan] : '',
      departemen: idx.departemen !== -1 ? row[idx.departemen] : '',
      phone: idx.phone !== -1 ? row[idx.phone] : '',
      status: 'aktif',
    };

    const existing = existingEmployees.filter(function (e) { return String(e.nik) === nik; })[0];

    if (existing) {
      updateRow_(db, SHEETS.EMPLOYEES, existing.id, data);
      updated++;
    } else {
      insertRow_(db, SHEETS.EMPLOYEES, data);
      created++;
    }

    seenNiks.push(nik);
  });

  existingEmployees.forEach(function (e) {
    if (e.status === 'aktif' && seenNiks.indexOf(String(e.nik)) === -1) {
      updateRow_(db, SHEETS.EMPLOYEES, e.id, { status: 'nonaktif' });
    }
  });

  return { created: created, updated: updated, skipped: skipped, warnings: warnings };
}

function adminSyncEmployees(token) {
  requireAdmin_(token);
  return syncEmployeesFromHR_();
}
