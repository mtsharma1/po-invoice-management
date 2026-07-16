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
  const settings = await getWebSettings();
  const templates = [
    { id: 1, templateName: 'Purchase Order', excelTemplate: 'PO Upload Template.xlsx' },
    { id: 2, templateName: 'Dispatch', excelTemplate: 'Dispatch Upload Template.xlsx' },
  ];
  const server = {
    host: process.env.MYSQL_HOST || '',
    database: process.env.MYSQL_DATABASE || '',
    user: process.env.MYSQL_USER || '',
    port: process.env.MYSQL_PORT || '3306',
  };

  return { settings, templates, server };
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
