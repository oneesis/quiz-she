/* ---------------- Dashboard ---------------- */

function adminGetDashboard(token) {
  requireAdmin_(token);
  const db = getDb_();

  const participations = getRows_(db, SHEETS.QUIZ_PARTICIPATIONS).filter(function (p) { return p.submitted_at; });
  const employees = getRows_(db, SHEETS.EMPLOYEES);
  const companies = getRows_(db, SHEETS.COMPANIES);

  const passed = participations.filter(function (p) { return p.passed === true; }).length;

  const perCompany = companies.map(function (c) {
    const empIds = employees.filter(function (e) { return String(e.company_id) === String(c.id); }).map(function (e) { return e.id; });
    const companyParticipations = participations.filter(function (p) { return empIds.indexOf(p.employee_id) !== -1; });
    return {
      name: c.name,
      total: companyParticipations.length,
      passed: companyParticipations.filter(function (p) { return p.passed === true; }).length,
    };
  });

  return {
    totalEmployees: employees.filter(function (e) { return e.status === 'aktif'; }).length,
    totalParticipations: participations.length,
    totalPassed: passed,
    passRate: participations.length ? Math.round((passed / participations.length) * 100) : 0,
    perCompany: perCompany,
  };
}

/* ---------------- Companies ---------------- */

function adminListCompanies(token) {
  requireAdmin_(token);
  return getRows_(getDb_(), SHEETS.COMPANIES).map(toPublic_);
}

function adminSaveCompany(token, data) {
  requireAdmin_(token);
  const db = getDb_();
  if (data.id) {
    updateRow_(db, SHEETS.COMPANIES, data.id, data);
    return data.id;
  }
  return insertRow_(db, SHEETS.COMPANIES, data);
}

function adminDeleteCompany(token, id) {
  requireAdmin_(token);
  deleteRow_(getDb_(), SHEETS.COMPANIES, id);
}

/* ---------------- Employees ---------------- */

function adminListEmployees(token) {
  requireAdmin_(token);
  const db = getDb_();
  const companies = getRows_(db, SHEETS.COMPANIES);

  return getRows_(db, SHEETS.EMPLOYEES).map(function (e) {
    const out = toPublic_(e);
    const company = companies.filter(function (c) { return String(c.id) === String(e.company_id); })[0];
    out.company_name = company ? company.name : '';
    return out;
  });
}

function adminSaveEmployee(token, data) {
  requireAdmin_(token);
  const db = getDb_();
  if (data.id) {
    updateRow_(db, SHEETS.EMPLOYEES, data.id, data);
    return data.id;
  }
  return insertRow_(db, SHEETS.EMPLOYEES, data);
}

function adminDeleteEmployee(token, id) {
  requireAdmin_(token);
  updateRow_(getDb_(), SHEETS.EMPLOYEES, id, { status: 'nonaktif' });
}

/* ---------------- Quiz Topics ---------------- */

function adminListTopics(token) {
  requireAdmin_(token);
  const db = getDb_();
  return getRows_(db, SHEETS.QUIZ_TOPICS).map(function (t) {
    const out = toPublic_(t);
    out.questions_count = findRows_(db, SHEETS.QUIZ_QUESTIONS, function (q) { return String(q.topic_id) === String(t.id); }).length;
    return out;
  });
}

function adminSaveTopic(token, data) {
  requireAdmin_(token);
  const db = getDb_();
  if (data.id) {
    updateRow_(db, SHEETS.QUIZ_TOPICS, data.id, data);
    return data.id;
  }
  return insertRow_(db, SHEETS.QUIZ_TOPICS, data);
}

function adminDeleteTopic(token, id) {
  requireAdmin_(token);
  deleteRow_(getDb_(), SHEETS.QUIZ_TOPICS, id);
}

/* ---------------- Quiz Questions ---------------- */

function adminListQuestions(token, topicId) {
  requireAdmin_(token);
  return findRows_(getDb_(), SHEETS.QUIZ_QUESTIONS, function (q) {
    return String(q.topic_id) === String(topicId);
  }).map(toPublic_);
}

function adminSaveQuestion(token, data) {
  requireAdmin_(token);
  const db = getDb_();
  const payload = Object.assign({}, data, { options: JSON.stringify(data.options) });
  if (data.id) {
    updateRow_(db, SHEETS.QUIZ_QUESTIONS, data.id, payload);
    return data.id;
  }
  return insertRow_(db, SHEETS.QUIZ_QUESTIONS, payload);
}

function adminDeleteQuestion(token, id) {
  requireAdmin_(token);
  deleteRow_(getDb_(), SHEETS.QUIZ_QUESTIONS, id);
}

/* ---------------- Quiz Sessions ---------------- */

function adminListSessions(token) {
  requireAdmin_(token);
  const db = getDb_();
  const topics = getRows_(db, SHEETS.QUIZ_TOPICS);

  return getRows_(db, SHEETS.QUIZ_SESSIONS).map(function (s) {
    const out = toPublic_(s);
    const topic = topics.filter(function (t) { return String(t.id) === String(s.topic_id); })[0];
    out.topic_title = topic ? topic.title : '';
    return out;
  });
}

function adminSaveSession(token, data) {
  requireAdmin_(token);
  const db = getDb_();
  const payload = Object.assign({}, data, {
    target_company_ids: JSON.stringify(data.target_company_ids || []),
    valid_from: new Date(data.valid_from),
    valid_until: new Date(data.valid_until),
  });
  if (data.id) {
    updateRow_(db, SHEETS.QUIZ_SESSIONS, data.id, payload);
    return data.id;
  }
  return insertRow_(db, SHEETS.QUIZ_SESSIONS, payload);
}

function adminDeleteSession(token, id) {
  requireAdmin_(token);
  deleteRow_(getDb_(), SHEETS.QUIZ_SESSIONS, id);
}

/* ---------------- Participations (read-only) ---------------- */

function adminListParticipations(token) {
  requireAdmin_(token);
  const db = getDb_();
  const employees = getRows_(db, SHEETS.EMPLOYEES);
  const sessions = getRows_(db, SHEETS.QUIZ_SESSIONS);
  const topics = getRows_(db, SHEETS.QUIZ_TOPICS);
  const companies = getRows_(db, SHEETS.COMPANIES);

  return getRows_(db, SHEETS.QUIZ_PARTICIPATIONS).filter(function (p) { return p.submitted_at; }).map(function (p) {
    const employee = employees.filter(function (e) { return String(e.id) === String(p.employee_id); })[0];
    const company = employee ? companies.filter(function (c) { return String(c.id) === String(employee.company_id); })[0] : null;
    const session = sessions.filter(function (s) { return String(s.id) === String(p.session_id); })[0];
    const topic = session ? topics.filter(function (t) { return String(t.id) === String(session.topic_id); })[0] : null;

    return {
      id: p.id,
      employee_name: employee ? employee.nama : '-',
      company_name: company ? company.name : '-',
      topic_title: topic ? topic.title : '-',
      score: p.score,
      passed: p.passed,
      submitted_at: p.submitted_at,
      certificate_no: p.certificate_no,
    };
  }).sort(function (a, b) { return new Date(b.submitted_at) - new Date(a.submitted_at); });
}

/* ---------------- Media upload (Drive) ---------------- */

function adminUploadMedia(token, base64Data, mimeType, filename) {
  requireAdmin_(token);
  const folder = getUploadsFolder_();
  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, filename);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/uc?export=view&id=' + file.getId();
}
