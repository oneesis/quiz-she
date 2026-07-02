function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'kiosk';

  let template;

  if (page === 'verify') {
    template = HtmlService.createTemplateFromFile('Verify');
    template.token = e.parameter.token || '';
    template.cert = template.token ? findCertificateByToken_(template.token) : null;
    template.qrImageUrl = qrImageUrl_(getScriptUrl_() + '?page=verify&token=' + encodeURIComponent(template.token));
    template.pdfUrl = template.cert ? getCertificatePdfUrl_(template.token) : null;
  } else if (page === 'admin') {
    template = HtmlService.createTemplateFromFile('Admin');
  } else {
    template = HtmlService.createTemplateFromFile('Kiosk');
  }

  return template.evaluate()
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setTitle('Quiz SHE — Safety Talk Digital')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getScriptUrl_() {
  return ScriptApp.getService().getUrl();
}

/* ---- Client-callable functions for the kiosk (google.script.run) ---- */

function kioskFindEmployee(nik) {
  const employee = findEmployeeByNik_(nik);

  if (!employee) {
    throw new Error('NIK tidak ditemukan atau tidak aktif. Periksa kembali.');
  }

  return employee;
}

function kioskGetEligibleSessions(employeeId) {
  return getEligibleSessions_(employeeId);
}

function kioskGetTopicForSession(sessionId) {
  return getTopicForSession_(sessionId);
}

function kioskGetExistingResult(sessionId, employeeId) {
  return getExistingPassedResult_(sessionId, employeeId);
}

function kioskStartQuiz(sessionId, employeeId) {
  return startQuizAttempt_(sessionId, employeeId, {});
}

function kioskSubmitQuiz(participationId, answers) {
  return submitQuizAttempt_(participationId, answers);
}

function kioskGetCertificatePdfUrl(token) {
  return getCertificatePdfUrl_(token);
}
