import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const FIXTURE = createServer((request, response) => {
  if (request.url === '/auto-success' || request.url === '/auto-error') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(request.url === '/auto-success' ? { code: 200, msg: 'OK' } : { success: false, message: 'Synthetic failure' })); return; }
  if (request.url.startsWith('/static-error')) { response.writeHead(503, { 'Content-Type': 'application/javascript' }); response.end(''); return; }
  if (request.url === '/sse-error' || request.url === '/sse-ok') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write('data: {"code":7}\n\n');
    if (request.url === '/sse-error') setTimeout(() => response.destroy(), 80);
    else response.end();
    return;
  }
  if (request.url === '/empty-error') { response.writeHead(502, { 'Content-Length': '0' }); response.end(); return; }
  if (request.url === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end('<!doctype html><title>ReqCatch fixture</title>'); return; }
  let body = '';
  request.on('data', chunk => { body += chunk; });
  request.on('end', () => {
    response.statusCode = request.url === '/http-error' ? 503 : 200;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('x-trace-id', 'synthetic-trace');
    response.end(JSON.stringify({ code: request.url === '/business-error' ? 7 : 0, data: { status: request.url === '/custom-bad' ? 'FAILED' : 'OK' }, received: body }));
  });
});
FIXTURE.on('upgrade', (_request, socket) => socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
await new Promise(resolve => FIXTURE.listen(0, '127.0.0.1', resolve));
const ORIGIN = `http://127.0.0.1:${FIXTURE.address().port}`;
const EXTENSION = fileURLToPath(new URL('../dist/chrome', import.meta.url));
const context = await chromium.launchPersistentContext('', { locale: 'zh-CN', channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`] });
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
  await app.evaluate(async () => {
    await fetch('/auto-success');
    await fetch('/auto-error');
    await fetch('/http-error');
    await fetch('/sse-error').then(response => response.text()).catch(() => {});
    await new Promise(resolve => {
      const socket = new WebSocket(location.origin.replace('http', 'ws') + '/socket-error');
      socket.onerror = resolve;
    });
  });
  await panel.waitForFunction(() => document.querySelectorAll('main > details.request-card').length === 2);
  const defaults = await panel.evaluate(tabId => chrome.runtime.sendMessage({ action: 'state', tabId }), tabId);
  assert.equal(defaults.records[0].businessField, 'success');
  assert.equal(defaults.settings.mode, 'auto');
  assert.equal(defaults.settings.httpEnabled, true);
  for (const field of ['websocketEnabled', 'sseEnabled']) assert.equal(defaults.settings[field], false);
  await panel.getByRole('button', { name: '设置', exact: true }).click();
  await panel.waitForFunction(() => document.getElementById('configure').getAttribute('aria-expanded') === 'true');
  await mkdir('test-results', { recursive: true });
  await panel.emulateMedia({ colorScheme: 'light' });
  await panel.screenshot({ path: 'test-results/settings-light.png', fullPage: true });
  await panel.emulateMedia({ colorScheme: 'dark' });
  await panel.screenshot({ path: 'test-results/settings-dark.png', fullPage: true });
  await panel.locator('#close-settings').click();
  await panel.waitForFunction(() => document.getElementById('configure').getAttribute('aria-expanded') === 'false');
  assert.equal(await panel.locator('#settings').isVisible(), false);
  await panel.getByRole('button', { name: '设置', exact: true }).click();
  assert.equal(await panel.locator('#quick-xhr-only').isChecked(), true);
  await panel.locator('#quick-xhr-only').uncheck();
  assert.equal(await panel.locator('#quick-hide-cancelled').isChecked(), true);
  await panel.locator('#quick-hide-cancelled').uncheck();
  assert.equal(await panel.locator('#hide-cancelled').isChecked(), false);
  await panel.getByLabel('记录 HTTP 异常状态码（4xx / 5xx）', { exact: true }).check();
  await panel.getByLabel('监控 SSE', { exact: true }).check();
  await panel.getByLabel('监控 WebSocket', { exact: true }).check();
  await panel.getByRole('button', { name: '保存规则', exact: true }).click();
  await panel.getByText('规则已保存，对新请求生效', { exact: true }).waitFor();
  await app.evaluate(() => new Promise(resolve => {
    const socket = new WebSocket(location.origin.replace('http', 'ws') + '/socket-error');
    socket.onerror = resolve;
  }));
  await panel.waitForFunction(() => document.querySelectorAll('main > details.request-card').length === 3);
  const sockets = await panel.evaluate(tabId => chrome.runtime.sendMessage({ action: 'state', tabId }), tabId);
  assert.equal(sockets.records.at(-1).type, 'WebSocket');
  await panel.getByRole('button', { name: '清空', exact: true }).click();
  await panel.waitForFunction(() => document.querySelectorAll('main > details.request-card').length === 0);
  await panel.getByRole('button', { name: '设置', exact: true }).click();
  const received = await app.evaluate(async () => {
    await fetch('/success');
    const result = await fetch('/business-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"中文"}' });
    const text = await result.text();
    await fetch('/http-error');
    await fetch('/empty-error');
    return text;
  });
  assert.equal(JSON.parse(received).code, 7);
  await panel.waitForFunction(() => document.querySelectorAll('main > details.request-card').length === 3);
  const captured = await panel.evaluate(tabId => chrome.runtime.sendMessage({ action: 'state', tabId }), tabId);
  assert.equal(captured.records.length, 3);
  const originalPayloads = await panel.locator('pre').allTextContents();
  await panel.evaluate(() => {
    const language = document.getElementById('language');
    language.value = 'en';
    language.dispatchEvent(new Event('change'));
  });
  await panel.getByRole('button', { name: 'Settings', exact: true }).waitFor();
  await panel.waitForFunction(() => document.querySelector('.actions button').textContent === 'Copy request + response');
  assert.deepEqual(await panel.locator('pre').allTextContents(), originalPayloads);
  const mirror = await context.newPage();
  await mirror.goto(`chrome-extension://${extensionId}/panel.html?tabId=${tabId}`);
  await mirror.getByRole('button', { name: 'Settings', exact: true }).waitFor();
  await panel.evaluate(() => {
    const language = document.getElementById('language');
    language.value = 'zh-CN';
    language.dispatchEvent(new Event('change'));
  });
  await panel.getByRole('button', { name: '设置', exact: true }).waitFor();
  await mirror.getByRole('button', { name: '设置', exact: true }).waitFor();
  await mirror.close();
  const emptyResponse = captured.records.find(entry => entry.url.endsWith('/empty-error'));
  assert.equal(emptyResponse.responseBody, '');
  assert.equal(await panel.locator('.actions button').first().textContent(), '复制请求与响应');
  const record = captured.records.find(entry => entry.url.endsWith('/business-error'));
  assert.equal(JSON.parse(record.requestBody).name, '中文');
  assert.equal(JSON.parse(record.responseBody).code, 7);
  assert.ok(record.responseHeaders.some(header => header.name.toLowerCase() === 'x-trace-id'));
  await panel.locator('main > details.request-card').first().locator(':scope > summary').click();
  await panel.getByRole('button', { name: '复制全部', exact: true }).first().click();
  await panel.getByText('已复制到剪贴板', { exact: true }).waitFor();
  assert.equal(await panel.locator('.payload[open]').count(), 0);
  await panel.locator('.request-card[open] .payload').nth(2).locator(':scope > summary').click();
  assert.equal(await panel.evaluate(() => getComputedStyle(document.querySelector('main')).overflowY), 'visible');
  assert.equal(await panel.evaluate(() => getComputedStyle(document.querySelector('.payload pre')).overflowY), 'visible');
  await mkdir('test-results', { recursive: true });
  await panel.emulateMedia({ colorScheme: 'dark' });
  await panel.waitForTimeout(200);
  await panel.screenshot({ path: 'test-results/panel-dark.png', fullPage: true });
  await panel.emulateMedia({ colorScheme: 'light' });
  await panel.waitForTimeout(200);
  await panel.screenshot({ path: 'test-results/panel-light.png', fullPage: true });
  await panel.getByRole('button', { name: '设置', exact: true }).click();
  await panel.getByLabel('识别方式', { exact: true }).selectOption('custom');
  await panel.getByLabel('状态字段', { exact: true }).fill('data.status');
  await panel.getByLabel('成功值', { exact: true }).fill('["OK"]');
  await panel.waitForTimeout(1200);
  assert.equal(await panel.getByLabel('状态字段', { exact: true }).inputValue(), 'data.status');
  await panel.getByRole('button', { name: '保存规则', exact: true }).click();
  await panel.getByText('规则已保存，对新请求生效', { exact: true }).waitFor();
  await app.evaluate(async () => {
    await fetch('/custom-ok');
    await fetch('/custom-bad');
    await fetch('/sse-ok').then(response => response.text());
    await fetch('/sse-error').then(response => response.text()).catch(() => {});
  });
  await panel.waitForFunction(() => document.querySelectorAll('main > details.request-card').length === 5);
  const custom = await panel.evaluate(tabId => chrome.runtime.sendMessage({ action: 'state', tabId }), tabId);
  assert.equal(custom.records.find(record => record.url.endsWith('/custom-bad')).businessField, 'data.status');
  assert.ok(custom.records.find(record => record.url.endsWith('/sse-error')).reasons.includes('流连接中断'));
  await panel.getByRole('searchbox', { name: '搜索请求' }).fill('custom-bad');
  assert.equal(await panel.locator('main > details.request-card').count(), 1);
  await panel.getByRole('searchbox', { name: '搜索请求' }).fill('');
  await panel.getByRole('button', { name: '设置', exact: true }).click();
  await panel.locator('main > details.request-card').first().locator(':scope > summary').click();
  await panel.emulateMedia({ colorScheme: 'dark' });
  await panel.waitForTimeout(200);
  await panel.screenshot({ path: 'test-results/panel-dark.png', fullPage: true });
  await panel.emulateMedia({ colorScheme: 'light' });
  await panel.waitForTimeout(200);
  await panel.screenshot({ path: 'test-results/panel-light.png', fullPage: true });
  await app.reload();
  await panel.reload();
  await panel.waitForFunction(() => document.querySelectorAll('main > details.request-card').length === 5);
  assert.equal(await panel.getByLabel('状态字段', { exact: true }).inputValue(), 'data.status');
  await panel.getByRole('button', { name: '设置', exact: true }).click();
  await panel.locator('#quick-xhr-only').check();
  assert.equal(await panel.locator('#xhr-only').isChecked(), true);
  await panel.getByRole('button', { name: '保存规则', exact: true }).click();
  await panel.waitForFunction(() => document.getElementById('feedback').textContent === '规则已保存，对新请求生效');
  await app.evaluate(async () => {
    await new Promise(resolve => {
      const script = document.createElement('script');
      script.src = '/static-error?filtered';
      script.onload = script.onerror = resolve;
      document.head.append(script);
    });
    await fetch('/http-error');
    await new Promise(resolve => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/http-error');
      xhr.onloadend = resolve;
      xhr.send();
    });
  });
  await panel.waitForFunction(() => document.querySelectorAll('main > details.request-card').length === 7);
  const filtered = await panel.evaluate(tabId => chrome.runtime.sendMessage({ action: 'state', tabId }), tabId);
  assert.equal(filtered.settings.xhrOnly, true);
  assert.ok(!filtered.records.some(record => record.url.includes('/static-error')));
  assert.deepEqual(filtered.records.slice(-2).map(record => record.type).sort(), ['Fetch', 'XHR']);
  await panel.reload();
  await panel.getByRole('button', { name: '设置', exact: true }).click();
  assert.equal(await panel.locator('#quick-xhr-only').isChecked(), true);
  await panel.locator('#quick-xhr-only').uncheck();
  await panel.getByRole('button', { name: '保存规则', exact: true }).click();
  await panel.getByText('规则已保存，对新请求生效', { exact: true }).waitFor();
  await app.evaluate(() => new Promise(resolve => {
    const script = document.createElement('script');
    script.src = '/static-error?included';
    script.onload = script.onerror = resolve;
    document.head.append(script);
  }));
  await panel.waitForFunction(() => document.querySelectorAll('main > details.request-card').length === 8);
  await panel.getByRole('button', { name: '停用此网站' }).click();
  await panel.getByText(`${ORIGIN} · 未启用`, { exact: true }).waitFor();
  await panel.getByRole('button', { name: '清空', exact: true }).click();
  await panel.waitForFunction(() => document.querySelectorAll('main > details.request-card').length === 0);
  await panel.locator('#language').selectOption('en');
  await panel.getByRole('button', { name: 'Enable website', exact: true }).waitFor();
  assert.equal(await panel.locator('html').getAttribute('lang'), 'en');
  assert.equal(await panel.locator('#quick-xhr-only').locator('..').innerText(), 'XHR / Fetch only');
  await panel.reload();
  await panel.getByRole('button', { name: 'Enable website', exact: true }).waitFor();
  await panel.getByRole('button', { name: 'Settings', exact: true }).click();
  assert.equal(await panel.locator('#language').inputValue(), 'en');
  await panel.locator('#language').selectOption('auto');
  await panel.getByRole('button', { name: '启用此网站', exact: true }).waitFor();
  console.log('PASS Chrome: capture, filters, copy, persistence, language switching and browser language');
} finally {
  await context.close();
  FIXTURE.closeAllConnections();
  await new Promise(resolve => FIXTURE.close(resolve));
}
