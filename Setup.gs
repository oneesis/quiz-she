/**
 * ONE-TIME SETUP. Run this once from the Apps Script editor (select this
 * function in the toolbar dropdown, click Run) before deploying the web app.
 * It creates the spreadsheet database, an uploads folder on Drive, and
 * stores their IDs in Script Properties for every other file to use.
 */
function setupDatabase() {
  const props = PropertiesService.getScriptProperties();

  if (props.getProperty('SPREADSHEET_ID')) {
    Logger.log('Sudah pernah di-setup. SPREADSHEET_ID: ' + props.getProperty('SPREADSHEET_ID'));
    return;
  }

  const ss = SpreadsheetApp.create('Quiz SHE Database');

  Object.keys(SCHEMA).forEach(function (sheetName) {
    const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, SCHEMA[sheetName].length).setValues([SCHEMA[sheetName]]);
    sheet.setFrozenRows(1);
  });

  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet) {
    ss.deleteSheet(defaultSheet);
  }

  const uploadsFolder = DriveApp.createFolder('Quiz SHE Uploads');
  uploadsFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  props.setProperties({
    SPREADSHEET_ID: ss.getId(),
    UPLOADS_FOLDER_ID: uploadsFolder.getId(),
  });

  Logger.log('Setup selesai.');
  Logger.log('Spreadsheet: ' + ss.getUrl());
  Logger.log('Uploads folder: ' + uploadsFolder.getUrl());
}

/**
 * Seeds one sample company, topic, questions, and a published session so
 * there is something to try in the kiosk right after setup.
 */
function seedSampleData() {
  const db = getDb_();

  const companyId = insertRow_(db, SHEETS.COMPANIES, { name: 'PT Energi Batubara Lestari', code: 'EBL' });

  const topicId = insertRow_(db, SHEETS.QUIZ_TOPICS, {
    code: 'ST-LOTO',
    title: 'Lock Out Tag Out (LOTO)',
    description: 'Prosedur keselamatan isolasi energi sebelum perawatan peralatan.',
    material: '<p>Materi contoh tentang prosedur LOTO untuk Safety Talk harian.</p>',
    media: '',
    pass_threshold: 80,
    questions_per_attempt: 3,
    min_material_seconds: '',
    time_limit_minutes: '',
    is_active: true,
  });

  const options = JSON.stringify([
    { key: 'A', text: 'Mencegah kecelakaan kerja dan penyakit akibat kerja' },
    { key: 'B', text: 'Mempercepat proses produksi' },
    { key: 'C', text: 'Mengurangi jumlah karyawan' },
    { key: 'D', text: 'Menghemat biaya operasional' },
  ]);

  for (let i = 0; i < 3; i++) {
    insertRow_(db, SHEETS.QUIZ_QUESTIONS, {
      topic_id: topicId,
      question: 'Contoh soal nomor ' + (i + 1) + ': Tujuan utama K3 adalah?',
      options: options,
      correct_key: 'A',
      is_active: true,
    });
  }

  insertRow_(db, SHEETS.QUIZ_SESSIONS, {
    topic_id: topicId,
    title: '',
    valid_from: new Date(),
    valid_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    target_company_ids: '',
    target_area: '',
    status: 'published',
    created_by: '',
  });

  insertRow_(db, SHEETS.EMPLOYEES, {
    nik: '1234567890123456',
    nama: 'Contoh Karyawan',
    company_id: companyId,
    subcont: 'N/A',
    jabatan: 'Operator',
    departemen: 'Produksi',
    phone: '081234567890',
    status: 'aktif',
  });

  Logger.log('Seed selesai.');
}
