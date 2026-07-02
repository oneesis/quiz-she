/**
 * Generic CRUD helpers over a Sheet acting as a "table". Every row object
 * returned includes a `_row` property (1-based sheet row index) used
 * internally by updateRow_/deleteRow_ — strip it before sending to the client.
 */

function sheet_(db, sheetName) {
  const sheet = db.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error('Sheet tidak ditemukan: ' + sheetName);
  }

  return sheet;
}

function headers_(sheet) {
  const lastCol = sheet.getLastColumn();
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
}

function getRows_(db, sheetName) {
  const sheet = sheet_(db, sheetName);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const cols = headers_(sheet);
  const values = sheet.getRange(2, 1, lastRow - 1, cols.length).getValues();

  return values.map(function (row, index) {
    const obj = { _row: index + 2 };
    cols.forEach(function (col, colIndex) {
      obj[col] = row[colIndex];
    });
    return obj;
  });
}

function findRows_(db, sheetName, predicate) {
  return getRows_(db, sheetName).filter(predicate);
}

function findById_(db, sheetName, id) {
  const rows = findRows_(db, sheetName, function (row) {
    return String(row.id) === String(id);
  });

  return rows.length ? rows[0] : null;
}

function nextId_(db, sheetName) {
  const rows = getRows_(db, sheetName);

  if (rows.length === 0) {
    return 1;
  }

  const maxId = rows.reduce(function (max, row) {
    const n = Number(row.id) || 0;
    return n > max ? n : max;
  }, 0);

  return maxId + 1;
}

/**
 * @return {number} the new row's id
 */
function insertRow_(db, sheetName, data) {
  const sheet = sheet_(db, sheetName);
  const cols = headers_(sheet);
  const id = nextId_(db, sheetName);

  const values = cols.map(function (col) {
    if (col === 'id') {
      return id;
    }
    return Object.prototype.hasOwnProperty.call(data, col) ? data[col] : '';
  });

  sheet.appendRow(values);

  return id;
}

function updateRow_(db, sheetName, id, data) {
  const sheet = sheet_(db, sheetName);
  const cols = headers_(sheet);
  const existing = findById_(db, sheetName, id);

  if (!existing) {
    throw new Error(sheetName + ' id ' + id + ' tidak ditemukan.');
  }

  const values = cols.map(function (col) {
    if (col === 'id') {
      return id;
    }
    return Object.prototype.hasOwnProperty.call(data, col) ? data[col] : existing[col];
  });

  sheet.getRange(existing._row, 1, 1, cols.length).setValues([values]);
}

function deleteRow_(db, sheetName, id) {
  const sheet = sheet_(db, sheetName);
  const existing = findById_(db, sheetName, id);

  if (!existing) {
    return;
  }

  sheet.deleteRow(existing._row);
}

/**
 * Strips the internal `_row` bookkeeping field before sending a row to the client.
 */
function toPublic_(row) {
  if (!row) {
    return row;
  }

  const copy = {};
  Object.keys(row).forEach(function (key) {
    if (key !== '_row') {
      copy[key] = row[key];
    }
  });
  return copy;
}
