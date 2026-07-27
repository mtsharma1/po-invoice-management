const { loadEnvConfig } = require('@next/env');
const mysql = require('mysql2/promise');
const {
  createDecipheriv,
  createHash,
} = require('node:crypto');

loadEnvConfig(process.cwd());

function decryptRefreshToken(value) {
  const [version, ivText, tagText, encryptedText, extra] = String(value || '').split('.');
  if (version !== 'v1' || !ivText || !tagText || !encryptedText || extra) {
    throw new Error('The stored Dropbox connection is invalid.');
  }
  const key = createHash('sha256').update(process.env.APP_SESSION_SECRET).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

async function responseJson(response, fallback) {
  const result = await response.json();
  if (!response.ok) {
    throw new Error(
      result.error_description ||
      result.error_summary ||
      (typeof result.error === 'string' ? result.error : '') ||
      fallback
    );
  }
  return result;
}

async function getAccessToken(refreshToken) {
  const response = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.DROPBOX_APP_KEY,
      client_secret: process.env.DROPBOX_APP_SECRET,
    }),
  });
  const result = await responseJson(response, 'Dropbox access-token refresh failed.');
  return result.access_token;
}

async function firstDropboxImage(accessToken, vendorArticleName) {
  const response = await fetch('https://api.dropboxapi.com/2/files/search_v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: vendorArticleName,
      options: {
        filename_only: true,
        file_status: 'active',
        max_results: 20,
        file_extensions: ['jpg', 'jpeg', 'png', 'webp'],
      },
    }),
  });
  const result = await responseJson(response, 'Dropbox image search failed.');
  const files = (result.matches || [])
    .map((match) => match?.metadata?.metadata)
    .filter((metadata) => metadata?.['.tag'] === 'file' && metadata.path_display);
  return files[0] || null;
}

async function listSharedUrl(accessToken, path) {
  const response = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path, direct_only: true }),
  });
  const result = await responseJson(response, 'Dropbox shared links could not be checked.');
  return result.links?.[0]?.url || '';
}

async function reusableImageUrl(accessToken, path) {
  let sharedUrl = await listSharedUrl(accessToken, path);
  if (!sharedUrl) {
    const response = await fetch(
      'https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path }),
      }
    );
    const result = await responseJson(response, 'Dropbox shared link could not be created.');
    sharedUrl = result.url;
  }

  const url = new URL(sharedUrl);
  url.searchParams.delete('dl');
  url.searchParams.set('raw', '1');
  return url.toString();
}

async function main() {
  const required = [
    'MYSQL_HOST',
    'MYSQL_DATABASE',
    'MYSQL_USER',
    'MYSQL_PASSWORD',
    'APP_SESSION_SECRET',
    'DROPBOX_APP_KEY',
    'DROPBOX_APP_SECRET',
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing environment values: ${missing.join(', ')}`);

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
  });

  try {
    const [integrationRows] = await connection.query(
      `SELECT SecretValue
       FROM webIntegrations
       WHERE IntegrationKey = 'dropbox'
       LIMIT 1`
    );
    if (!integrationRows.length) throw new Error('Dropbox is not connected.');

    const accessToken = await getAccessToken(
      decryptRefreshToken(integrationRows[0].SecretValue)
    );
    const [articles] = await connection.query(
      `SELECT VendorArticleName, COUNT(*) AS rowCount
       FROM tblPODetails
       WHERE NULLIF(TRIM(VendorArticleName), '') IS NOT NULL
       GROUP BY VendorArticleName
       ORDER BY VendorArticleName`
    );
    console.log(`Syncing ${articles.length} distinct vendor articles...`);

    let synced = 0;
    let updatedRows = 0;
    const failures = [];

    for (let index = 0; index < articles.length; index += 1) {
      const article = String(articles[index].VendorArticleName).trim();
      try {
        const file = await firstDropboxImage(accessToken, article);
        if (!file) throw new Error('No matching Dropbox image found.');
        const ImageUrl = await reusableImageUrl(accessToken, file.path_display);
        const [result] = await connection.query(
          `UPDATE tblPODetails
           SET path_display = ?, ImageUrl = ?, ModifiedDate = NOW()
           WHERE VendorArticleName = ?`,
          [file.path_display, ImageUrl, article]
        );
        synced += 1;
        updatedRows += Number(result.affectedRows || 0);
        console.log(`[${index + 1}/${articles.length}] ${article}: ${file.path_display}`);
      } catch (error) {
        failures.push({ article, error: error.message });
        console.error(`[${index + 1}/${articles.length}] ${article}: ${error.message}`);
      }
    }

    console.log(
      `Dropbox image sync complete: ${synced} articles, ${updatedRows} rows updated, ${failures.length} failures.`
    );
    if (failures.length) {
      console.log('Articles without saved links:');
      for (const failure of failures) {
        console.log(`- ${failure.article}: ${failure.error}`);
      }
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
