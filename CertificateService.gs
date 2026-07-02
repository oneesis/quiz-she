function generateCertificateNumber_(participation) {
  const db = getDb_();
  const employee = findById_(db, SHEETS.EMPLOYEES, participation.employee_id);
  const company = employee && employee.company_id ? findById_(db, SHEETS.COMPANIES, employee.company_id) : null;
  const companyCode = company ? company.code : 'NA';

  const now = new Date();
  const monthYearPrefix = Utilities.formatDate(now, 'Asia/Makassar', 'MM/yy');

  const sameMonthCount = findRows_(db, SHEETS.QUIZ_PARTICIPATIONS, function (p) {
    if (!p.certificate_no || !p.certificate_issued_at) {
      return false;
    }
    const issued = new Date(p.certificate_issued_at);
    if (issued.getMonth() !== now.getMonth() || issued.getFullYear() !== now.getFullYear()) {
      return false;
    }
    const pEmployee = findById_(db, SHEETS.EMPLOYEES, p.employee_id);
    return pEmployee && String(pEmployee.company_id) === String(employee.company_id);
  }).length;

  const seq = String(sameMonthCount + 1).padStart(3, '0');

  return seq + '/ST/' + companyCode + '/' + monthYearPrefix;
}

function findCertificateByToken_(token) {
  const db = getDb_();

  const participation = findRows_(db, SHEETS.QUIZ_PARTICIPATIONS, function (p) {
    return p.verification_token === token;
  })[0];

  if (!participation) {
    return null;
  }

  const employee = findById_(db, SHEETS.EMPLOYEES, participation.employee_id);
  const company = employee && employee.company_id ? findById_(db, SHEETS.COMPANIES, employee.company_id) : null;
  const session = findById_(db, SHEETS.QUIZ_SESSIONS, participation.session_id);
  const topic = session ? findById_(db, SHEETS.QUIZ_TOPICS, session.topic_id) : null;

  return {
    nama: employee ? employee.nama : '-',
    nikMasked: employee ? maskedNik_(employee.nik) : '-',
    companyName: company ? company.name : '-',
    topicTitle: topic ? topic.title : '-',
    tanggal: participation.certificate_issued_at ? Utilities.formatDate(new Date(participation.certificate_issued_at), 'Asia/Makassar', 'dd MMM yyyy') : '-',
    score: participation.score,
    certificateNo: participation.certificate_no,
  };
}

/**
 * Public QR image URL for a verification link (uses the free goqr.me API —
 * no key needed). Kept as one small external dependency in place of a
 * server-side QR library, to keep the Apps Script rebuild lean.
 */
function qrImageUrl_(verifyUrl) {
  return 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(verifyUrl);
}
