/**
 * Sheet (table) names used as the data store.
 */
const SHEETS = {
  COMPANIES: 'Companies',
  EMPLOYEES: 'Employees',
  QUIZ_TOPICS: 'QuizTopics',
  QUIZ_QUESTIONS: 'QuizQuestions',
  QUIZ_SESSIONS: 'QuizSessions',
  QUIZ_PARTICIPATIONS: 'QuizParticipations',
  QUIZ_ANSWERS: 'QuizAnswers',
  ADMIN_USERS: 'AdminUsers',
};

/**
 * Column headers per sheet, in order. Row 1 of each sheet must match this.
 */
const SCHEMA = {
  Companies: ['id', 'name', 'code'],
  Employees: ['id', 'nik', 'nama', 'company_id', 'subcont', 'jabatan', 'departemen', 'phone', 'status'],
  QuizTopics: ['id', 'code', 'title', 'description', 'material', 'media', 'pass_threshold', 'questions_per_attempt', 'min_material_seconds', 'time_limit_minutes', 'is_active'],
  QuizQuestions: ['id', 'topic_id', 'question', 'options', 'correct_key', 'is_active'],
  QuizSessions: ['id', 'topic_id', 'title', 'valid_from', 'valid_until', 'target_company_ids', 'target_area', 'status', 'created_by'],
  QuizParticipations: ['id', 'session_id', 'employee_id', 'attempt_no', 'started_at', 'submitted_at', 'score', 'passed', 'certificate_no', 'certificate_issued_at', 'verification_token', 'meta'],
  QuizAnswers: ['id', 'participation_id', 'question_id', 'selected_key', 'is_correct'],
  AdminUsers: ['id', 'email', 'password_hash', 'name'],
};

function getDb_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');

  if (!id) {
    throw new Error('SPREADSHEET_ID belum di-set. Jalankan fungsi setupDatabase() dulu dari editor Apps Script.');
  }

  return SpreadsheetApp.openById(id);
}

function getUploadsFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty('UPLOADS_FOLDER_ID');

  if (!id) {
    throw new Error('UPLOADS_FOLDER_ID belum di-set. Jalankan fungsi setupDatabase() dulu dari editor Apps Script.');
  }

  return DriveApp.getFolderById(id);
}
