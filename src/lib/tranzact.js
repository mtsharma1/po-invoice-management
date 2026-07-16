const DEFAULT_LOGIN_URL = 'https://be.letstranzact.com/main/login/password-login/';
const DEFAULT_BASE_URL = 'https://be.letstranzact.com';
const ITEM_MASTER_ENDPOINT = '/inventory/main-inventory/get-item-master/?page_number=';
const DEFAULT_PAGE_DELAY_MS = 1500;
const DEFAULT_MAX_RETRIES = 5;

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured. Add it to .env.local.`);
  }
  return value;
}

export async function getTranzactAccessToken() {
  const maxRetries = Number(process.env.TRANZACT_MAX_RETRIES || DEFAULT_MAX_RETRIES);

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const response = await fetch(process.env.TRANZACT_LOGIN_URL || DEFAULT_LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: required('TRANZACT_EMAIL'),
        password: required('TRANZACT_PASSWORD'),
      }),
    });

    const bodyText = await response.text();
    if (response.ok) {
      const json = JSON.parse(bodyText);
      const token = json?.data?.access_token || json?.obj?.data?.access_token || json?.access_token;
      if (!token) {
        throw new Error('Tranzact login response did not include access token.');
      }
      return token;
    }

    if (response.status === 429 && attempt <= maxRetries) {
      await sleep(getRetryDelayMs(response, bodyText));
      continue;
    }

    throw new Error(`Tranzact login failed: HTTP ${response.status} ${shortText(bodyText)}`);
  }

  throw new Error('Tranzact login failed after retrying.');
}

export async function getTranzactMasterItems(pageNumber, accessToken) {
  const baseUrl = process.env.TRANZACT_BASE_URL || DEFAULT_BASE_URL;
  const maxRetries = Number(process.env.TRANZACT_MAX_RETRIES || DEFAULT_MAX_RETRIES);

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const response = await fetch(`${baseUrl}${ITEM_MASTER_ENDPOINT}${pageNumber}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        Authorization: `Bearer ${accessToken}`,
        origin: 'https://app.letstranzact.com',
      },
    });

    const bodyText = await response.text();
    if (response.ok) {
      const json = JSON.parse(bodyText);
      return json?.data?.item_master_data || json?.obj?.data?.item_master_data || [];
    }

    if (response.status === 429 && attempt <= maxRetries) {
      await sleep(getRetryDelayMs(response, bodyText));
      continue;
    }

    if (response.status === 429) {
      const seconds = getRetryDelaySeconds(response, bodyText);
      throw new Error(`Tranzact is throttling requests. Please wait ${seconds} seconds and try again.`);
    }

    throw new Error(`Tranzact item master failed on page ${pageNumber}: HTTP ${response.status} ${shortText(bodyText)}`);
  }

  throw new Error(`Tranzact item master failed on page ${pageNumber} after retrying.`);
}

export async function fetchTranzactAvailableStock({ pages = 5 } = {}) {
  const token = await getTranzactAccessToken();
  const allItems = [];
  const pageDelayMs = Number(process.env.TRANZACT_PAGE_DELAY_MS || DEFAULT_PAGE_DELAY_MS);

  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    const items = await getTranzactMasterItems(pageNumber, token);
    allItems.push(...items);
    if (!items.length) break;
    if (pageNumber < pages) {
      await sleep(pageDelayMs);
    }
  }

  return allItems
    .filter((item) => item && item.itemid)
    .map((item) => ({
      uuid: item.uuid || '',
      itemId: item.itemid || '',
      productName: item.product_name || item.name || '',
      unit: item.unit || '',
      hsnCode: item.hsn_code || '',
      itemType: item.type || '',
      isService: item.is_service || '',
      price: Number(item.price || 0),
      stock: Number(item.stock || item.cal_final_stock || 0),
      categoryName: item.category_name || item.category || '',
    }));
}

function getRetryDelayMs(response, bodyText) {
  return (getRetryDelaySeconds(response, bodyText) + 1) * 1000;
}

function getRetryDelaySeconds(response, bodyText) {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter;

  const match = bodyText.match(/available in\s+(\d+)\s+seconds?/i);
  if (match) return Number(match[1]);

  return 35;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortText(value) {
  return String(value || '').replace(/\s+/g, ' ').slice(0, 250);
}
