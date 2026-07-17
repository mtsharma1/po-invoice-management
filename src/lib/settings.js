import { query, withTransaction } from './db';

const defaultSettings = {
  accountNo: '6811361613',
  bankName: 'KOTAK MAHINDRA BANK LTD.',
  branchName: 'SEC-14, GURGAON',
  ifscCode: 'KKBK0000287',
  billFromName: 'TEAKWOOD',
  dispatchFromName: 'TEAKWOOD',
};

export async function ensureWebSettingsTable(run = query) {
  await run(
    `CREATE TABLE IF NOT EXISTS webSettings (
       SettingKey VARCHAR(100) NOT NULL,
       SettingValue TEXT NULL,
       UpdatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (SettingKey)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  const values = Object.entries(defaultSettings);
  await run(
    `INSERT IGNORE INTO webSettings (SettingKey, SettingValue)
     VALUES ?`,
    [values]
  );
}

export async function getWebSettings() {
  await ensureWebSettingsTable();
  const rows = await query('SELECT SettingKey, SettingValue FROM webSettings ORDER BY SettingKey');
  return rows.reduce((settings, row) => {
    settings[row.SettingKey] = row.SettingValue || '';
    return settings;
  }, { ...defaultSettings });
}

export async function getSettingsScreenData() {
  const [users, accessTypes] = await Promise.all([
    query(
      `SELECT
         u.ID,
         u.UserID,
         u.Access,
         COALESCE(u.isActive, 1) AS isActive,
         u.PwdLastChanged,
         COALESCE(a.AccessDescription, 'User') AS AccessDescription,
         COALESCE(a.AdminPane, 0) AS AdminPane
       FROM tblUsers u
       LEFT JOIN tblAccessType a ON a.AccessType = u.Access
       ORDER BY u.ID`
    ),
    query(
      `SELECT AccessType, AccessDescription, COALESCE(AdminPane, 0) AS AdminPane
       FROM tblAccessType
       ORDER BY AccessType`
    ),
  ]);

  return { users, accessTypes };
}

export async function saveSettingsUser(payload) {
  const id = Number(payload?.id || 0);
  const userId = String(payload?.userId || '').trim();
  const password = String(payload?.password || '');
  const access = Number(payload?.access);

  if (!userId) throw new Error('User name is required.');
  if (!Number.isInteger(access)) throw new Error('Please select an access level.');
  if (!id && !password) throw new Error('Password is required for a new user.');

  return withTransaction(async (run) => {
    const accessRows = await run(
      'SELECT AccessType FROM tblAccessType WHERE AccessType = ? LIMIT 1',
      [access]
    );
    if (!accessRows.length) throw new Error('The selected access level is not valid.');

    const duplicateRows = await run(
      'SELECT ID FROM tblUsers WHERE UserID = ? AND ID <> ? LIMIT 1',
      [userId, id]
    );
    if (duplicateRows.length) throw new Error('That user name already exists.');

    if (id) {
      const existingRows = await run('SELECT ID FROM tblUsers WHERE ID = ? LIMIT 1', [id]);
      if (!existingRows.length) throw new Error('The selected user no longer exists.');

      if (password) {
        await run(
          `UPDATE tblUsers
           SET UserID = ?, PWD = ?, Access = ?, PwdLastChanged = NOW()
           WHERE ID = ?`,
          [userId, password, access, id]
        );
      } else {
        await run('UPDATE tblUsers SET UserID = ?, Access = ? WHERE ID = ?', [userId, access, id]);
      }
      return { id, message: 'User updated successfully.' };
    }

    const result = await run(
      `INSERT INTO tblUsers (UserID, PWD, Access, isActive, PwdLastChanged)
       VALUES (?, ?, ?, 1, NOW())`,
      [userId, password, access]
    );
    return { id: result.insertId, message: 'User added successfully.' };
  });
}

export async function deleteSettingsUser(id) {
  const userId = Number(id || 0);
  if (!userId) throw new Error('Please select a user to delete.');
  const result = await query('DELETE FROM tblUsers WHERE ID = ?', [userId]);
  if (!result.affectedRows) throw new Error('The selected user no longer exists.');
  return { message: 'User deleted successfully.' };
}

export async function saveWebSettings(payload) {
  const allowedKeys = Object.keys(defaultSettings);
  const entries = allowedKeys.map((key) => [key, String(payload?.[key] || '')]);

  return withTransaction(async (run) => {
    await ensureWebSettingsTable(run);
    for (const [key, value] of entries) {
      await run(
        `INSERT INTO webSettings (SettingKey, SettingValue)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE SettingValue = VALUES(SettingValue)`,
        [key, value]
      );
    }
    return { message: 'Settings saved successfully.' };
  });
}
