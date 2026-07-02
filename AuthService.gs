function hashPassword_(password) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  return digest.map(function (b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'); }).join('');
}

/**
 * ONE-TIME (or re-run anytime to reset the password): creates/updates the
 * first admin user. Run this from the Apps Script editor's function dropdown.
 */
function createAdminUser() {
  const email = 'andreanantama8888@gmail.com';
  const password = 'password'; // Change this after first login.
  const name = 'Admin SHE';

  const db = getDb_();
  const existing = findRows_(db, SHEETS.ADMIN_USERS, function (row) { return row.email === email; })[0];
  const data = { email: email, password_hash: hashPassword_(password), name: name };

  if (existing) {
    updateRow_(db, SHEETS.ADMIN_USERS, existing.id, data);
  } else {
    insertRow_(db, SHEETS.ADMIN_USERS, data);
  }

  Logger.log('Admin user ready: ' + email);
}

function adminLogin(email, password) {
  const db = getDb_();
  const user = findRows_(db, SHEETS.ADMIN_USERS, function (row) { return row.email === email; })[0];

  if (!user || user.password_hash !== hashPassword_(password)) {
    throw new Error('Email atau password salah.');
  }

  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('admin_session_' + token, String(user.id), 60 * 60 * 6);

  return { token: token, name: user.name, email: user.email };
}

function requireAdmin_(token) {
  const userId = CacheService.getScriptCache().get('admin_session_' + token);

  if (!userId) {
    throw new Error('Sesi admin tidak valid atau sudah habis. Silakan login lagi.');
  }

  return userId;
}

function adminChangePassword(token, currentPassword, newPassword) {
  const userId = requireAdmin_(token);
  const db = getDb_();
  const user = findById_(db, SHEETS.ADMIN_USERS, userId);

  if (user.password_hash !== hashPassword_(currentPassword)) {
    throw new Error('Password lama salah.');
  }

  updateRow_(db, SHEETS.ADMIN_USERS, userId, { password_hash: hashPassword_(newPassword) });
  return true;
}
