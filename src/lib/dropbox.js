import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { query } from './db';

const DROPBOX_INTEGRATION_KEY = 'dropbox';
const globalForDropbox = globalThis;

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function encryptionKey() {
  return createHash('sha256')
    .update(requiredEnv('APP_SESSION_SECRET'))
    .digest();
}

function encryptSecret(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(value), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return ['v1', iv, tag, encrypted]
    .map((part) => (Buffer.isBuffer(part) ? part.toString('base64url') : part))
    .join('.');
}

function decryptSecret(value) {
  const [version, ivText, tagText, encryptedText, extra] = String(value || '').split('.');
  if (version !== 'v1' || !ivText || !tagText || !encryptedText || extra) {
    throw new Error('The stored Dropbox connection is invalid.');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivText, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

async function ensureIntegrationTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS webIntegrations (
       IntegrationKey VARCHAR(100) NOT NULL,
       SecretValue LONGTEXT NOT NULL,
       MetadataJson LONGTEXT NULL,
       UpdatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (IntegrationKey)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

function parseMetadata(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

function dropboxError(result, fallback) {
  return String(
    result?.error_description ||
    result?.error_summary ||
    (typeof result?.error === 'string' ? result.error : '') ||
    fallback
  );
}

export function getDropboxRedirectUri(requestUrl) {
  const explicit = String(process.env.DROPBOX_REDIRECT_URI || '').trim();
  if (explicit) return explicit;

  const appUrl = String(process.env.NEXT_PUBLIC_APP_URL || '').trim();
  const origin = appUrl || new URL(requestUrl).origin;
  return new URL('/api/dropbox/oauth/callback', origin).toString();
}

export function createDropboxAuthorizationUrl({ redirectUri, state }) {
  const url = new URL('https://www.dropbox.com/oauth2/authorize');
  url.searchParams.set('client_id', requiredEnv('DROPBOX_APP_KEY'));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('token_access_type', 'offline');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeDropboxAuthorizationCode({ code, redirectUri, connectedBy }) {
  const response = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: requiredEnv('DROPBOX_APP_KEY'),
      client_secret: requiredEnv('DROPBOX_APP_SECRET'),
      redirect_uri: redirectUri,
    }),
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(dropboxError(result, 'Dropbox authorization failed.'));
  }
  if (!result.refresh_token) {
    throw new Error('Dropbox did not return a refresh token. Reconnect with offline access.');
  }

  await ensureIntegrationTable();
  const metadata = {
    accountId: result.account_id || '',
    uid: result.uid || '',
    scope: result.scope || '',
    connectedBy: String(connectedBy || ''),
    connectedAt: new Date().toISOString(),
  };
  await query(
    `INSERT INTO webIntegrations (IntegrationKey, SecretValue, MetadataJson)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       SecretValue = VALUES(SecretValue),
       MetadataJson = VALUES(MetadataJson)`,
    [
      DROPBOX_INTEGRATION_KEY,
      encryptSecret(result.refresh_token),
      JSON.stringify(metadata),
    ]
  );

  globalForDropbox.__teakwoodDropboxToken = result.access_token || null;
  globalForDropbox.__teakwoodDropboxTokenExpiresAt =
    result.access_token
      ? Date.now() + Number(result.expires_in || 14400) * 1000
      : 0;

  return metadata;
}

export async function getDropboxConnectionStatus() {
  const configured = Boolean(
    process.env.DROPBOX_APP_KEY &&
    process.env.DROPBOX_APP_SECRET
  );
  const redirectUri = String(
    process.env.DROPBOX_REDIRECT_URI ||
    (process.env.NEXT_PUBLIC_APP_URL
      ? new URL('/api/dropbox/oauth/callback', process.env.NEXT_PUBLIC_APP_URL).toString()
      : '')
  );
  if (!configured) return { configured: false, connected: false, redirectUri };

  await ensureIntegrationTable();
  const rows = await query(
    `SELECT MetadataJson, UpdatedAt
     FROM webIntegrations
     WHERE IntegrationKey = ?
     LIMIT 1`,
    [DROPBOX_INTEGRATION_KEY]
  );
  if (!rows.length) return { configured: true, connected: false, redirectUri };

  const metadata = parseMetadata(rows[0].MetadataJson);
  return {
    configured: true,
    connected: true,
    redirectUri,
    accountId: metadata.accountId || '',
    scope: metadata.scope || '',
    connectedBy: metadata.connectedBy || '',
    connectedAt: metadata.connectedAt || rows[0].UpdatedAt || '',
  };
}

export async function getDropboxAccessToken() {
  const cachedToken = globalForDropbox.__teakwoodDropboxToken;
  const expiresAt = Number(globalForDropbox.__teakwoodDropboxTokenExpiresAt || 0);
  if (cachedToken && Date.now() < expiresAt - 60_000) return cachedToken;

  await ensureIntegrationTable();
  const rows = await query(
    `SELECT SecretValue
     FROM webIntegrations
     WHERE IntegrationKey = ?
     LIMIT 1`,
    [DROPBOX_INTEGRATION_KEY]
  );
  if (!rows.length) {
    throw new Error('Dropbox is not connected. Connect it from Settings.');
  }

  const response = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: decryptSecret(rows[0].SecretValue),
      client_id: requiredEnv('DROPBOX_APP_KEY'),
      client_secret: requiredEnv('DROPBOX_APP_SECRET'),
    }),
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error(dropboxError(result, 'Dropbox access-token refresh failed.'));
  }

  globalForDropbox.__teakwoodDropboxToken = result.access_token;
  globalForDropbox.__teakwoodDropboxTokenExpiresAt =
    Date.now() + Number(result.expires_in || 14400) * 1000;
  return result.access_token;
}

export async function findDropboxImage(productName) {
  const files = await findDropboxImageFiles(productName, 1);
  const file = files[0];
  const accessToken = await getDropboxAccessToken();
  const ImageUrl = await getDropboxSharedImageUrl(accessToken, file.path_display);

  return {
    path_display: file.path_display,
    ImageUrl,
    fileName: file.name || '',
  };
}

export async function findDropboxImageFiles(productName, maximum = 3) {
  const searchText = String(productName || '').trim();
  if (!searchText) throw new Error('Enter a product name to search in Dropbox.');

  const accessToken = await getDropboxAccessToken();
  const searchResponse = await fetch('https://api.dropboxapi.com/2/files/search_v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: searchText,
      options: {
        filename_only: true,
        file_status: 'active',
        max_results: 20,
        file_extensions: ['jpg', 'jpeg', 'png', 'webp'],
      },
    }),
    cache: 'no-store',
  });
  const searchResult = await searchResponse.json();
  if (!searchResponse.ok) {
    throw new Error(dropboxError(searchResult, 'Dropbox image search failed.'));
  }

  const files = (searchResult.matches || [])
    .map((match) => match?.metadata?.metadata)
    .filter((metadata) => metadata?.['.tag'] === 'file' && metadata.path_display);
  if (!files.length) {
    throw new Error(`No Dropbox image was found for "${searchText}".`);
  }

  return files.slice(0, Math.max(1, Math.min(3, Number(maximum) || 3)));
}

export async function downloadDropboxImage(path) {
  const accessToken = await getDropboxAccessToken();
  const response = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path }),
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    let result = {};
    try {
      result = JSON.parse(await response.text());
    } catch {
      // Dropbox may return a non-JSON gateway error.
    }
    throw new Error(dropboxError(result, `Dropbox image download failed for "${path}".`));
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error(`Dropbox returned an empty image for "${path}".`);
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error(`Dropbox image "${path}" is larger than 5 MB.`);
  }
  return buffer;
}

async function getDropboxSharedImageUrl(accessToken, path) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  const listResponse = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
    method: 'POST',
    headers,
    body: JSON.stringify({ path, direct_only: true }),
    cache: 'no-store',
  });
  const listResult = await listResponse.json();
  if (!listResponse.ok) {
    throw new Error(dropboxError(listResult, 'Existing Dropbox shared links could not be checked.'));
  }

  let sharedUrl = listResult.links?.[0]?.url || '';
  if (!sharedUrl) {
    const createResponse = await fetch(
      'https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ path }),
        cache: 'no-store',
      }
    );
    const createResult = await createResponse.json();
    if (!createResponse.ok || !createResult.url) {
      throw new Error(dropboxError(createResult, 'Dropbox shared image URL could not be created.'));
    }
    sharedUrl = createResult.url;
  }

  const rawUrl = new URL(sharedUrl);
  rawUrl.searchParams.delete('dl');
  rawUrl.searchParams.set('raw', '1');
  return rawUrl.toString();
}
