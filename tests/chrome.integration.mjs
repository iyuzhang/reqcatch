import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const FIXTURE = createServer((request, response) => {
  if (request.url === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end('<!doctype html><title>Request Lens fixture</title>'); return; }
  let body = '';
  request.on('data', chunk => { body += chunk; });
  request.on('end', () => {
    response.statusCode = request.url === '/http-error' ? 503 : 200;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('x-trace-id', 'synthetic-trace');
    response.end(JSON.stringify({ code: request.url === '/business-error' ? 7 : 0, received: body }));
  });
});
await new Promise(resolve => FIXTURE.listen(0, '127.0.0.1', resolve));
const ORIGIN = `http://127.0.0.1:${FIXTURE.address().port}`;
const EXTENSION = fileURLToPath(new URL('../dist/chrome', import.meta.url));
const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`] });
context.setDefaultTimeout(15000);
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const app = await context.newPage();
  await app.goto(ORIGIN);
  const tabId = await worker.evaluate(async origin => (await chrome.tabs.query({})).find(tab => tab.url.startsWith(origin)).id, ORIGIN);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/panel.html?tabId=${tabId}`);
  await panel.getByRole('button', { name: '启用此网站', exact: true }).click();
  await panel.getByText(`${ORIGIN} · 监控中`, { exact: true }).waitFor();
  const received = await app.evaluate(async () => {
    await fetch('/success');
    const result = await fetch('/business-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"中文"}' });
    const text = await result.text();
    await fetch('/http-error');
    return text;
  });
  assert.equal(JSON.parse(received).code, 7);
  await panel.waitForFunction(() => document.querySelectorAll('main details').length === 2);
  const captured = await panel.evaluate(tabId => chrome.runtime.sendMessage({ action: 'state', tabId }), tabId);
  assert.equal(captured.records.length, 2);
  const record = captured.records.find(entry => entry.url.endsWith('/business-error'));
  assert.equal(JSON.parse(record.requestBody).name, '中文');
  assert.equal(JSON.parse(record.responseBody).code, 7);
  assert.ok(record.responseHeaders.some(header => header.name.toLowerCase() === 'x-trace-id'));
  await panel.locator('details').first().locator('summary').click();
  await panel.getByRole('button', { name: '复制全部', exact: true }).first().click();
  await panel.getByText('已复制到剪贴板', { exact: true }).waitFor();
  await app.reload();
  await panel.reload();
  await panel.waitForFunction(() => document.querySelectorAll('main details').length === 2);
  await panel.getByRole('button', { name: '停用此网站' }).click();
  await panel.getByText(`${ORIGIN} · 未启用`, { exact: true }).waitFor();
  await panel.getByRole('button', { name: '清空', exact: true }).click();
  await panel.waitForFunction(() => document.querySelectorAll('main details').length === 0);
  console.log('PASS Chrome: native capture, request/response bodies, HTTP/business filtering, copy, refresh, disable, clear');
} finally {
  await context.close();
  FIXTURE.closeAllConnections();
  await new Promise(resolve => FIXTURE.close(resolve));
}
