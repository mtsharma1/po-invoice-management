// Server-only integration. Never import this module into a client component.
const FIELDS = {
  email: 'WHITEBOOKS_EMAIL',
  username: 'WHITEBOOKS_USERNAME',
  password: 'WHITEBOOKS_PASSWORD',
  ip_address: 'WHITEBOOKS_IP_ADDRESS',
  client_id: 'WHITEBOOKS_CLIENT_ID',
  client_secret: 'WHITEBOOKS_CLIENT_SECRET',
  gstin: 'WHITEBOOKS_GSTIN',
};

export function getEInvoiceEnvironment() {
  const environment = process.env.WHITEBOOKS_EINVOICE_ENV || 'sandbox';
  if (!['sandbox', 'production'].includes(environment)) throw new Error('Invalid WhiteBooks e-invoice environment.');
  return environment;
}

export function getEInvoiceConfig(environment = getEInvoiceEnvironment()) {
  if (!['sandbox', 'production'].includes(environment)) throw new Error('Invalid WhiteBooks environment.');
  const prefix = environment === 'production' ? 'WHITEBOOKS_PRODUCTION_' : 'WHITEBOOKS_';
  const values = Object.fromEntries(Object.keys(FIELDS).map(field => [field, process.env[prefix + field.toUpperCase()]]));
  return { environment, baseUrl: environment === 'production' ? 'https://api.whitebooks.in' : 'https://apisandbox.whitebooks.in', values };
}

export class WhitebooksError extends Error {}

// Read-only full EWB lookup. This wrapper uses the documented GSP headers,
// not an e-invoice auth-token. Never call generation to fill missing PDF fields.
export async function getWhitebooksEwayBillDetails(ewbNo, environment = getEwayBillEnvironment()) {
  if (!/^\d{12}$/.test(String(ewbNo))) throw new WhitebooksError('A valid e-way bill number is required.');
  const config = getEwayBillConfig(environment);
  const shared = getEInvoiceConfig(environment).values;
  const values = { ...config.values };
  // Email, IP and taxpayer identity are shared account metadata. API keys stay
  // together: use the dedicated EWB pair when supplied, otherwise the shared pair.
  for (const key of ['email', 'ip_address', 'gstin']) values[key] ||= shared[key];
  if (!values.client_id && !values.client_secret) {
    values.client_id = shared.client_id; values.client_secret = shared.client_secret;
  }
  const keys = ['ip_address', 'client_id', 'client_secret', 'gstin'];
  if (['email', ...keys].some(key => !values[key]?.trim())) throw new WhitebooksError('Configure the e-way bill API email, IP, GSTIN and API keys to download complete bill details.');
  if (!values.username?.trim() || !values.password?.trim()) throw new WhitebooksError('Configure the e-way bill API username and password to download complete bill details.');
  const url = new URL('/ewaybillapi/v1.03/ewayapi/getewaybill', config.baseUrl);
  url.searchParams.set('email', values.email.trim()); url.searchParams.set('ewbNo', String(ewbNo));
  let payload;
  try {
    const authUrl = new URL('/ewaybillapi/v1.03/authenticate', config.baseUrl);
    for (const key of ['email', 'username', 'password']) authUrl.searchParams.set(key, values[key].trim());
    if (config.irp) authUrl.searchParams.set('irp', config.irp);
    const headers = Object.fromEntries(keys.map(key => [key, values[key]]));
    const authResponse = await fetch(authUrl, { method: 'GET', headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!authResponse.ok) throw new Error('Authentication failed');
    const auth = await authResponse.json();
    if (!['1', 'success', 'sucess'].includes(String(auth?.status_cd ?? auth?.status).toLowerCase())) throw new Error('Authentication failed');
    const response = await fetch(url, { method: 'GET', headers: Object.fromEntries(keys.map(key => [key, values[key]])), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Lookup failed');
    payload = await response.json();
  } catch { throw new WhitebooksError('Unable to retrieve full e-way bill details from WhiteBooks. Check the e-way bill API credentials and retry. No bill was changed.'); }
  const data = payload?.data;
  if (!['1', 'success', 'sucess'].includes(String(payload?.status_cd ?? payload?.status).toLowerCase()) || !data || String(data.ewbNo ?? data.ewayBillNo) !== String(ewbNo)) {
    throw new WhitebooksError('WhiteBooks did not return matching full e-way bill details. Check e-way bill API access and retry. No bill was changed.');
  }
  // Allowlist: never carry credentials or provider headers into the PDF model.
  const fields = ['ewbNo', 'ewayBillNo', 'ewayBillDate', 'userGstin', 'fromGstin', 'fromTrdName', 'toGstin', 'toTrdName', 'transporterId', 'transporterName', 'docNo', 'validFrom', 'validUpto', 'actualDist', 'status'];
  const result = Object.fromEntries(fields.filter(key => ['string', 'number'].includes(typeof data[key])).map(key => [key, data[key]]));
  if (Array.isArray(data.VehiclListDetails)) result.VehiclListDetails = data.VehiclListDetails.map(row => Object.fromEntries(['vehicleNo', 'fromPlace', 'fromState', 'tripshtNo', 'userGSTINTransin', 'enteredDate', 'transMode', 'transDocNo', 'transDocDate', 'groupNo'].filter(key => ['string', 'number'].includes(typeof row?.[key])).map(key => [key, row[key]])));
  return result;
}

export async function generateWhitebooksIrn(document, authToken, environment = getEInvoiceEnvironment()) {
  const { baseUrl, values } = getEInvoiceConfig(environment);
  const url = new URL('/einvoice/type/GENERATE/version/V1_03', baseUrl);
  url.searchParams.set('email', values.email.trim());
  const headers = Object.fromEntries(
    ['ip_address', 'client_id', 'client_secret', 'username', 'gstin'].map((field) => [field, values[field]])
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
  const config = getEInvoiceConfig();
  return { environment: config.environment, configured: Object.values(config.values).every(value => Boolean(value?.trim())) };
}

export async function authenticateWhitebooks(environment = getEInvoiceEnvironment()) {
  const { baseUrl, values } = getEInvoiceConfig(environment);
  const missing = Object.entries(values).filter(([, value]) => !value?.trim()).map(([field]) => field);
  if (missing.length) throw new WhitebooksError(`Configure WhiteBooks ${environment} credentials: ${missing.join(', ')}.`);
  const { email, ...headers } = values;
  const url = new URL('/einvoice/authenticate', baseUrl);
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
      throw new WhitebooksError(`WhiteBooks authentication failed (HTTP ${response.status}). Check the configured credentials and registered IP address.`);
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
      throw new WhitebooksError('WhiteBooks rejected the API username: incorrect user ID or user does not exist. Configure the username and password from WhiteBooks e-invoice credentials; the website login may be different.');
    }
    throw new WhitebooksError('WhiteBooks did not return a valid authentication token. Check the configured credentials and GSTIN.');
  }

  // Keep this result on the server for subsequent e-invoice API calls.
  return { authToken: token, ...(typeof payload.irp === 'string' ? { irp: payload.irp } : {}) };
}


export async function getWhitebooksEwayBillByIrn(irn, { authToken, irp }, environment = 'production', { allowMissing = false } = {}) {
  const { baseUrl, values } = getEInvoiceConfig(environment);
  const url = new URL('/einvoice/type/GETIRN/version/V1_03', baseUrl);
  url.searchParams.set('param1', irn);
  url.searchParams.set('email', values.email.trim());
  if (irp) url.searchParams.set('irp', irp);
  const headers = Object.fromEntries(['ip_address', 'client_id', 'client_secret', 'username', 'gstin'].map(field => [field, values[field]]));
  let payload;
  try {
    const response = await fetch(url, { method: 'GET', headers: { ...headers, 'auth-token': authToken }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Lookup failed');
    payload = await response.json();
  } catch { throw new WhitebooksError('WhiteBooks status lookup failed. The previous submission remains protected; no new bill was generated.'); }
  const data = payload?.data;
  if (!['1', 'success', 'sucess'].includes(String(payload?.status_cd).toLowerCase())
      || String(data?.Irn || '').toLowerCase() !== irn.toLowerCase() || data?.Status !== 'ACT') {
    throw new WhitebooksError('WhiteBooks lookup did not confirm an active IRN with an e-way bill. Check the portal; no new bill was generated.');
  }
  if (!/^\d{12}$/.test(String(data?.EwbNo || ''))) {
    if (allowMissing && Object.hasOwn(data, 'EwbNo') && data.EwbNo === null) return null;
    throw new WhitebooksError('WhiteBooks lookup did not confirm whether an e-way bill exists. No new bill was generated.');
  }
  return Object.fromEntries(['EwbNo', 'EwbDt', 'EwbValidTill'].filter(key => ['string', 'number'].includes(typeof data[key])).map(key => [key, data[key]]));
}

export async function generateWhitebooksEwayBill(document, { authToken, irp }, environment = 'sandbox') {
  const { baseUrl, values } = getEInvoiceConfig(environment);
  const selectedIrp = irp || process.env[environment === 'production' ? 'WHITEBOOKS_PRODUCTION_IRP' : 'WHITEBOOKS_IRP']?.trim();
  if (!selectedIrp) throw new WhitebooksError('WhiteBooks authentication did not identify the IRP. Configure the e-invoice IRP setting before generating an e-way bill.');
  if (!authToken) throw new WhitebooksError('E-invoice authentication is required.');
  const url = new URL('/einvoice/type/GENERATE_EWAYBILL/version/V1_03', baseUrl);
  url.searchParams.set('email', values.email.trim());
  url.searchParams.set('irp', selectedIrp);
  const headers = Object.fromEntries(['ip_address', 'client_id', 'client_secret', 'username', 'gstin'].map(field => [field, values[field]]));
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
    throw new WhitebooksError('WhiteBooks did not confirm an e-way bill. Use Check WhiteBooks status to recover any existing bill before trying again.');
  }
  return Object.fromEntries(['EwbNo', 'EwbDt', 'EwbValidTill'].filter(key => ['string', 'number'].includes(typeof data[key])).map(key => [key, data[key]]));
}


export function getEwayBillEnvironment() {
  const value = process.env.WHITEBOOKS_EWAYBILL_ENV || 'sandbox';
  if (!['sandbox', 'production'].includes(value)) throw new WhitebooksError('Invalid e-way bill environment.');
  return value;
}

export function getEwayBillConfig(environment = getEwayBillEnvironment()) {
  if (!['sandbox', 'production'].includes(environment)) throw new WhitebooksError('Invalid e-way bill environment.');
  const prefix = environment === 'production' ? 'WHITEBOOKS_EWAYBILL_PRODUCTION_' : 'WHITEBOOKS_';
  return {
    environment,
    baseUrl: environment === 'production' ? 'https://api.whitebooks.in' : 'https://apisandbox.whitebooks.in',
    values: Object.fromEntries(Object.keys(FIELDS).map(field => [field, process.env[prefix + field.toUpperCase()]])),
    irp: process.env[prefix + 'IRP']?.trim(),
  };
}

// Standalone EWB authentication. Do not pair this token with IRP/e-invoice endpoints.
export async function authenticateWhitebooksEwayBill(environment = getEwayBillEnvironment()) {
  const { values: config, baseUrl, irp } = getEwayBillConfig(environment);
  const prefix = environment === 'production' ? 'WHITEBOOKS_EWAYBILL_PRODUCTION_' : 'WHITEBOOKS_';
  const missing = Object.entries(config).filter(([, value]) => !value?.trim()).map(([key]) => prefix + key.toUpperCase());
  if (!irp) missing.push(prefix + 'IRP');
  if (missing.length) {
    throw new WhitebooksError(`Configure all ${environment} e-way bill credentials. Missing settings: ${missing.join(', ')}. Restart the app after updating the server environment.`);
  }
  const url = new URL('/ewaybillapi/v1.03/authenticate', baseUrl);
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


export async function generateStandaloneWhitebooksEwayBill(document, { irp }, environment = getEwayBillEnvironment()) {
  const { baseUrl, values } = getEwayBillConfig(environment);
  const url = new URL('/ewaybillapi/v1.03/ewayapi/genewaybill', baseUrl);
  url.searchParams.set('email', values.email.trim());
  url.searchParams.set('irp', irp);
  const headers = Object.fromEntries(['ip_address', 'client_id', 'client_secret', 'gstin'].map(key => [key, values[key]]));
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
