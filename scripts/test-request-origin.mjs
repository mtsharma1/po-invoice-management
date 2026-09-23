import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/lib/requestOrigin.js', import.meta.url), 'utf8');
const { isSameOriginRequest } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const previous = process.env.APP_ORIGIN;
function request(origin, extra = {}) {
  return new Request('http://localhost:3000/api/whitebooks/irn', {
    headers: { ...(origin === undefined ? {} : { origin }), ...extra },
  });
}
try {
  delete process.env.APP_ORIGIN;
  assert.equal(isSameOriginRequest(request('http://localhost:3000')), true);
  assert.equal(isSameOriginRequest(request('http://localhost:8000')), false);
  process.env.APP_ORIGIN = 'http://76.13.240.119:8000';
  assert.equal(isSameOriginRequest(request('http://76.13.240.119:8000')), true);
  for (const origin of [undefined, 'null', 'http://76.13.240.119:4000', 'http://localhost:3000', 'https://attacker.example']) {
    assert.equal(isSameOriginRequest(request(origin)), false);
  }
  assert.equal(isSameOriginRequest(request('https://attacker.example', {
    'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'https',
  })), false);
  process.env.APP_ORIGIN = 'invalid';
  assert.equal(isSameOriginRequest(request('http://localhost:3000')), false);
  process.env.APP_ORIGIN = 'http://76.13.240.119:4000, http://76.13.240.119:8000';
  for (const port of [4000, 8000]) {
    assert.equal(isSameOriginRequest(request(`http://76.13.240.119:${port}`)), true);
  }
  for (const origin of ['http://76.13.240.119:9000', 'https://attacker.example', undefined, 'null']) {
    assert.equal(isSameOriginRequest(request(origin)), false);
  }
  process.env.APP_ORIGIN = 'http://76.13.240.119:4000,invalid';
  assert.equal(isSameOriginRequest(request('http://76.13.240.119:4000')), false);
  for (const route of ['authenticate', 'irn', 'ewaybill']) {
    const routeSource = await readFile(new URL(`../src/app/api/whitebooks/${route}/route.js`, import.meta.url), 'utf8');
    assert.match(routeSource, /!isSameOriginRequest\(request\)/);
  }
} finally {
  if (previous === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = previous;
}
console.log('Request origin checks passed: direct, proxy, wrong port and cross-site rejection.');
