// Server-only integration. Never import this module into a client component.
const AUTH_URL = 'https://apisandbox.whitebooks.in/einvoice/authenticate';
const FIELDS = {
  email: 'WHITEBOOKS_EMAIL',
  username: 'WHITEBOOKS_USERNAME',
  password: 'WHITEBOOKS_PASSWORD',
  ip_address: 'WHITEBOOKS_IP_ADDRESS',
  client_id: 'WHITEBOOKS_CLIENT_ID',
  client_secret: 'WHITEBOOKS_CLIENT_SECRET',
  gstin: 'WHITEBOOKS_GSTIN',
};

export class WhitebooksError extends Error {}

export async function generateWhitebooksIrn(document, authToken) {
  const url = new URL('https://apisandbox.whitebooks.in/einvoice/type/GENERATE/version/V1_03');
  url.searchParams.set('email', process.env.WHITEBOOKS_EMAIL.trim());
  const headers = Object.fromEntries(
    ['ip_address', 'client_id', 'client_secret', 'username', 'gstin'].map((field) => [field, process.env[FIELDS[field]]])
  );
  let payload;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'auth-token': authToken, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(document),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error('Upstream request failed');
    payload = await response.json();
  } catch {
    throw new WhitebooksError('IRN outcome is uncertain. Check WhiteBooks by document details before another submission.');
  }
  const data = payload?.data;
  if (!['sucess', 'success', '1'].includes(String(payload?.status_cd).toLowerCase())
      || !/^[a-f0-9]{64}$/i.test(data?.Irn || '') || !data?.AckNo) {
    throw new WhitebooksError('WhiteBooks did not return a confirmed IRN. Check the request in WhiteBooks before another submission.');
  }
  // Explicit allowlist excludes provider headers, credentials and tokens.
  return Object.fromEntries(['Irn', 'AckNo', 'AckDt', 'SignedInvoice', 'SignedQRCode', 'Status', 'EwbNo', 'EwbDt', 'EwbValidTill']
    .filter((key) => ['string', 'number'].includes(typeof data[key]))
    .map((key) => [key, data[key]]));
}

export function getWhitebooksConfigurationStatus() {
  return { configured: Object.values(FIELDS).every((key) => Boolean(process.env[key]?.trim())) };
}

export async function authenticateWhitebooks() {
  const missing = Object.values(FIELDS).filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    throw new WhitebooksError(`Configure the server environment variables: ${missing.join(', ')}.`);
  }

  const { email, ...headers } = Object.fromEntries(
    Object.entries(FIELDS).map(([field, key]) => [field, process.env[key]])
  );
  const url = new URL(AUTH_URL);
  url.searchParams.set('email', email.trim());

  let response;
  let payload;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { ...headers, Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      throw new WhitebooksError(`WhiteBooks authentication failed (HTTP ${response.status}). Check the sandbox credentials and registered IP address.`);
    }
    payload = await response.json();
  } catch (error) {
    if (error instanceof WhitebooksError) throw error;
    // Provider responses and fetch errors may contain credentials; do not expose them.
    throw new WhitebooksError('WhiteBooks could not be reached or returned an invalid response. Please try again.');
  }

  const token = payload?.data?.AuthToken;
  const status = String(payload?.status_cd ?? '').toLowerCase();
  if (!['sucess', 'success', '1'].includes(status) || typeof token !== 'string' || !token.trim()) {
    if (typeof payload?.status_desc === 'string' && /incorrect user id|user does not exist/i.test(payload.status_desc)) {
      throw new WhitebooksError('WhiteBooks rejected the sandbox API username: incorrect user ID or user does not exist. Configure the username and password from WhiteBooks e-invoice sandbox credentials; the website login may be different.');
    }
    throw new WhitebooksError('WhiteBooks did not return a valid authentication token. Check the sandbox credentials and GSTIN.');
  }

  // Keep this result on the server for subsequent e-invoice API calls.
  return { authToken: token, ...(typeof payload.irp === 'string' ? { irp: payload.irp } : {}) };
}


export async function generateWhitebooksEwayBill(document, { authToken, irp }) {
  if (!irp) throw new WhitebooksError('WhiteBooks authentication did not identify the IRP. Configure WHITEBOOKS_IRP for this sandbox account.');
  const url = new URL('https://apisandbox.whitebooks.in/einvoice/type/GENERATE_EWAYBILL/version/V1_03');
  url.searchParams.set('email', process.env.WHITEBOOKS_EMAIL.trim());
  url.searchParams.set('irp', irp);
  const headers = Object.fromEntries(['ip_address', 'client_id', 'client_secret', 'username', 'gstin'].map(field => [field, process.env[FIELDS[field]]]));
  let payload;
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { ...headers, 'auth-token': authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(document), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error('Upstream failure');
    payload = await response.json();
  } catch {
    throw new WhitebooksError('E-way bill outcome is uncertain. Check WhiteBooks before another submission.');
  }
  const data = payload?.data;
  if (!['1', 'success', 'sucess'].includes(String(payload?.status_cd).toLowerCase()) || !/^\d{12}$/.test(String(data?.EwbNo || ''))) {
    throw new WhitebooksError('WhiteBooks did not confirm an e-way bill. Check the submission in WhiteBooks before trying again.');
  }
  return Object.fromEntries(['EwbNo', 'EwbDt', 'EwbValidTill'].filter(key => ['string', 'number'].includes(typeof data[key])).map(key => [key, data[key]]));
}


// Standalone EWB authentication. Do not pair this token with IRP/e-invoice endpoints.
export async function authenticateWhitebooksEwayBill() {
  const config = Object.fromEntries(Object.entries(FIELDS).map(([field, key]) => [field, process.env[key]]));
  const irp = process.env.WHITEBOOKS_IRP?.trim();
  if (Object.values(config).some(value => !value?.trim()) || !irp) {
    throw new WhitebooksError('Configure WhiteBooks credentials and WHITEBOOKS_IRP before standalone e-way bill authentication.');
  }
  const url = new URL('https://apisandbox.whitebooks.in/ewaybillapi/v1.03/authenticate');
  for (const [key, value] of Object.entries({ email: config.email, username: config.username, password: config.password, irp })) url.searchParams.set(key, value);
  const headers = Object.fromEntries(['ip_address', 'client_id', 'client_secret', 'gstin'].map(key => [key, config[key]]));
  let payload;
  try {
    const response = await fetch(url, { method: 'GET', headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Authentication rejected');
    payload = await response.json();
  } catch {
    // The query contains a password: never return or log the URL or fetch error.
    throw new WhitebooksError('Standalone e-way bill authentication failed or returned an invalid response.');
  }
  const token = payload?.data?.authtoken ?? payload?.data?.AuthToken ?? payload?.authtoken;
  const status = String(payload?.status_cd ?? payload?.status ?? '').toLowerCase();
  if (!['1', 'success', 'sucess'].includes(status) || typeof token !== 'string' || !token.trim()) {
    throw new WhitebooksError('WhiteBooks did not return a valid standalone e-way bill token. Check the e-way bill API credentials.');
  }
  return { authToken: token, irp };
}


export async function generateStandaloneWhitebooksEwayBill(document, { irp }) {
  const url = new URL('https://apisandbox.whitebooks.in/ewaybillapi/v1.03/ewayapi/genewaybill');
  url.searchParams.set('email', process.env.WHITEBOOKS_EMAIL.trim());
  url.searchParams.set('irp', irp);
  const headers = Object.fromEntries(['ip_address', 'client_id', 'client_secret', 'gstin'].map(key => [key, process.env[FIELDS[key]]]));
  let payload;
  try {
    // WhiteBooks' supplied wrapper uses the authenticated session, with no token header.
    const response = await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(document), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('Upstream failure');
    payload = await response.json();
  } catch {
    throw new WhitebooksError('Standalone e-way bill outcome is uncertain. Check WhiteBooks before resubmitting.');
  }
  const data = payload?.data;
  if (!['1', 'success', 'sucess'].includes(String(payload?.status_cd ?? payload?.status).toLowerCase()) || !/^\d{12}$/.test(String(data?.ewayBillNo || ''))) {
    throw new WhitebooksError('WhiteBooks did not confirm a standalone e-way bill. Check the submission in WhiteBooks before resubmitting.');
  }
  return { EwbNo: data.ewayBillNo, EwbDt: typeof data.ewayBillDate === 'string' ? data.ewayBillDate : '', EwbValidTill: typeof data.validUpto === 'string' ? data.validUpto : '' };
}
