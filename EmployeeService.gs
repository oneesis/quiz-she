function findEmployeeByNik_(nik) {
  const db = getDb_();
  const nikStr = String(nik).trim();

  const employee = findRows_(db, SHEETS.EMPLOYEES, function (row) {
    return String(row.nik).trim() === nikStr && row.status === 'aktif';
  })[0];

  if (!employee) {
    return null;
  }

  return attachCompany_(db, employee);
}

function attachCompany_(db, employee) {
  const company = employee.company_id ? findById_(db, SHEETS.COMPANIES, employee.company_id) : null;
  const withCompany = toPublic_(employee);
  withCompany.company = company ? toPublic_(company) : null;
  return withCompany;
}

function maskedNik_(nik) {
  const str = String(nik);

  if (str.length <= 6) {
    return new Array(str.length + 1).join('*');
  }

  return str.slice(0, 3) + new Array(str.length - 6 + 1).join('*') + str.slice(-3);
}
