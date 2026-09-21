import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/lib/permissions.js', import.meta.url), 'utf8');
const { canAccessPath } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

for (const path of ['/api/whitebooks/authenticate', '/api/whitebooks/irn']) {
  assert.equal(canAccessPath({ admin: true, access: 5 }, path), true);
  assert.equal(canAccessPath(null, path), false);
  assert.equal(canAccessPath({ access: 1 }, path), false);
  assert.equal(canAccessPath({ access: 6 }, path), false);
}
assert.equal(canAccessPath({ access: 8 }, '/api/whitebooks/irn'), true);
assert.equal(canAccessPath({ access: 8 }, '/api/whitebooks/authenticate'), false);
assert.equal(canAccessPath({ admin: true }, '/api/whitebooks/unknown'), false);
assert.equal(canAccessPath({ admin: true }, '/api/whitebooks/irn-other'), false);
console.log('WhiteBooks route permission checks passed.');
