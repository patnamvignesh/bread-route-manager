import test from 'node:test';
import assert from 'node:assert/strict';
import { app, prisma } from '../src/index.js';

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await prisma.$disconnect();
  await new Promise(resolve => server.close(resolve));
});

test('health endpoint reports service status', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'bread-route-manager');
});

test('protected routes reject unauthenticated requests', async () => {
  const response = await fetch(`${baseUrl}/api/routes`);
  assert.equal(response.status, 401);
});
