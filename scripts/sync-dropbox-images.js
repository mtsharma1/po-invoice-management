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

async function firstDropboxImages(accessToken, vendorArticleName) {
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
  return files.slice(0, 3);
}

async function downloadDropboxImage(accessToken, path) {
  const response = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path }),
    },
  });
  if (!response.ok) {
    throw new Error(`Dropbox image download failed for "${path}".`);
  }
  const image = Buffer.from(await response.arrayBuffer());
  if (!image.length) throw new Error(`Dropbox returned an empty image for "${path}".`);
  if (image.length > 5 * 1024 * 1024) throw new Error(`Dropbox image "${path}" is larger than 5 MB.`);
  return image;
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
    let savedImages = 0;
    let updatedRows = 0;
    const failures = [];

    for (let index = 0; index < articles.length; index += 1) {
      const article = String(articles[index].VendorArticleName).trim();
      try {
        const files = await firstDropboxImages(accessToken, article);
        if (!files.length) throw new Error('No matching Dropbox image found.');
        const images = await Promise.all(
          files.map((file) => downloadDropboxImage(accessToken, file.path_display))
        );
        const [ownerRows] = await connection.query(
          `SELECT POID
           FROM tblPODetails
           WHERE VendorArticleName = ?
           ORDER BY CASE
             WHEN ImageData IS NOT NULL AND OCTET_LENGTH(ImageData) > 0 THEN 0
             ELSE 1
           END, POID
           LIMIT 1`,
          [article]
        );
        const ownerPoid = Number(ownerRows[0].POID);
        await connection.query(
          `UPDATE tblPODetails
           SET ImageData = ?, ImageData2 = ?, ImageData3 = ?, ModifiedDate = NOW()
           WHERE POID = ?`,
          [images[0] || null, images[1] || null, images[2] || null, ownerPoid]
        );
        const [result] = await connection.query(
          `UPDATE tblPODetails
           SET path_display = ?,
               ImageUrl = CONCAT('/api/master/images/', POID),
               ModifiedDate = NOW()
           WHERE VendorArticleName = ?`,
          [files[0].path_display, article]
        );
        synced += 1;
        savedImages += images.length;
        updatedRows += Number(result.affectedRows || 0);
        console.log(`[${index + 1}/${articles.length}] ${article}: ${images.length} image(s) saved`);
      } catch (error) {
        failures.push({ article, error: error.message });
        console.error(`[${index + 1}/${articles.length}] ${article}: ${error.message}`);
      }
    }

    console.log(
      `Dropbox image sync complete: ${synced} articles, ${savedImages} images saved, ${updatedRows} rows updated, ${failures.length} failures.`
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
