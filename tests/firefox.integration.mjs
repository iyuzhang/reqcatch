import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { firefox } from '@playwright/test';
import { connectWithMaxRetries } from '../node_modules/web-ext/lib/firefox/remote.js';
const FIXTURE = createServer((request, response) => {
  let body = '';
  request.on('data', chunk => { body += chunk; });
  request.on('end', () => {
    if (request.url === '/') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><title>Request Lens fixture</title><button id="run">Run</button><pre id="result"></pre><script>window.runFixture=${makeRequests.toString()};document.getElementById('run').onclick=()=>{document.getElementById('result').textContent='';window.runFixture().then(value=>document.getElementById('result').textContent=value,error=>document.getElementById('result').textContent='ERROR:'+String(error));};</script>`);
      return;
    }
    if (request.url === '/cancel') {
      const timer = setTimeout(() => response.end('{"code":0}'), 5000);
      response.on('close', () => clearTimeout(timer));
      return;
    }
    if (request.url === '/network-error') { response.destroy(); return; }
    if (request.url === '/http-error') response.statusCode = 503;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('x-trace-id', 'fixture-trace');
    response.end(JSON.stringify({ code: request.url === '/business-error' ? 7 : 0, received: body, padding: request.url === '/large' ? 'x'.repeat(300000) : '' }));
  });
});
await new Promise(resolve => FIXTURE.listen(0, '127.0.0.1', resolve));
const ORIGIN = `http://127.0.0.1:${FIXTURE.address().port}`;
let firefoxProcess;
let remote;
const STAGING = await mkdtemp(join(tmpdir(), 'request-lens-test-'));
const PROFILE = await mkdtemp(join(tmpdir(), 'request-lens-profile-'));
let resolveReport;
const reportPromise = new Promise(resolve => { resolveReport = resolve; });
FIXTURE.on('request', (request) => {
  if (request.url !== '/report') return;
  let text = '';
  request.on('data', chunk => { text += chunk; });
  request.on('end', () => resolveReport(JSON.parse(text)));
});
try {
  await cp(fileURLToPath(new URL('../dist/firefox', import.meta.url)), STAGING, { recursive: true });
  const manifest = JSON.parse(await readFile(join(STAGING, 'manifest.json'), 'utf8'));
  manifest.background.scripts.push('test-open-panel.js');
  await writeFile(join(STAGING, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(join(STAGING, 'test-open-panel.js'), `browser.tabs.create({url:${JSON.stringify(ORIGIN)}}).then(tab => browser.tabs.create({url:browser.runtime.getURL('panel.html?tabId='+tab.id)}));`);
  const htmlPath = join(STAGING, 'panel.html');
  await writeFile(htmlPath, (await readFile(htmlPath, 'utf8')).replace('</body>', '<script src="test-panel.js"></script></body>'));
  await writeFile(join(STAGING, 'test-panel.js'), `(${runPanelTest.toString()})(${JSON.stringify(ORIGIN)});`);
  await writeFile(join(PROFILE, 'user.js'), [
    'user_pref("devtools.debugger.remote-enabled", true);',
    'user_pref("devtools.debugger.prompt-connection", false);',
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.aboutwelcome.enabled", false);',
    'user_pref("browser.download.folderList", 2);',
    `user_pref("browser.download.dir", ${JSON.stringify(PROFILE)});`,
    'user_pref("browser.download.useDownloadDir", true);',
    'user_pref("browser.helperApps.neverAsk.saveToDisk", "application/json");',
  ].join('\n'));
  const { spawn } = await import('node:child_process');
  firefoxProcess = spawn(firefox.executablePath(), ['-headless','-no-remote','-profile',PROFILE,'-start-debugger-server','6702','about:blank'], {stdio:'ignore'});
  remote = await connectWithMaxRetries({port:6702});
  await remote.installTemporaryAddon(STAGING, false);
  const timeout = setTimeout(() => resolveReport({error:'Native Firefox integration timed out'}), 45000);
  const report = await reportPromise;
  clearTimeout(timeout);
  if (report.error) console.error('Failure details', JSON.stringify(report));
  assert.equal(report.error, undefined, report.error);
  console.log('PASS Firefox:', report.checks);
} finally {
  remote?.disconnect();
  firefoxProcess?.kill();
  await new Promise(resolve => setTimeout(resolve, 500));
  await rm(STAGING, {recursive:true,force:true});
  await rm(PROFILE, {recursive:true,force:true});
  FIXTURE.closeAllConnections();
  await new Promise(resolve => FIXTURE.close(resolve));
}

async function runPanelTest(origin) {
  const tabId = Number(new URLSearchParams(location.search).get('tabId'));
  const wait = async predicate => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Timed out: ' + String(predicate));
  };
  const check = (value, message) => { if (!value) throw new Error(message); };
  const state = () => browser.runtime.sendMessage({action:'state',tabId});
  try {
    await wait(() => !document.getElementById('toggle').disabled);
    document.getElementById('toggle').click();
    await wait(async () => (await state()).enabled);
    await wait(async () => (await browser.tabs.get(tabId)).status === 'complete');
    await browser.tabs.executeScript(tabId, {code:"document.getElementById('run').click()"});
    await wait(async () => (await browser.tabs.executeScript(tabId, {code:"document.getElementById('result').textContent"}))[0]);
    const result = await browser.tabs.executeScript(tabId, {code:"document.getElementById('result').textContent"});
    check(JSON.parse(result[0]).code === 7, 'Page received modified response');
    await wait(async () => (await state()).records.length === 5);
    const records = (await state()).records;
    const business = records.find(record => record.requestBody.includes('中文'));
    check(JSON.parse(business.requestBody).id === 42, 'Missing request body');
    check(JSON.parse(business.responseBody).code === 7, 'Missing response body');
    check(business.requestHeaders.some(header => header.name.toLowerCase() === 'x-test'), 'Missing request header');
    check(business.responseHeaders.some(header => header.name.toLowerCase() === 'x-trace-id'), 'Missing response header');
    check(records.some(record => record.reasons.includes('请求已取消')), 'Cancellation not classified');
    check(records.some(record => record.reasons.includes('网络失败')), 'Network failure not classified');
    await wait(() => document.querySelectorAll('main details').length === 5);
    const first = document.querySelector('main details');
    first.open = true;
    for (const button of first.querySelectorAll('.actions button')) {
      document.getElementById('feedback').textContent = '';
      button.click();
      await wait(() => document.getElementById('feedback').textContent === '已复制到剪贴板');
    }
    const originalClick = HTMLAnchorElement.prototype.click;
    let exported;
    HTMLAnchorElement.prototype.click = function() {
      exported = { href: this.href, filename: this.download };
      return originalClick.call(this);
    };
    document.getElementById('export').click();
    HTMLAnchorElement.prototype.click = originalClick;
    check(exported.filename.startsWith('request-errors-'), 'Missing export filename');
    check((await (await fetch(exported.href)).json()).length === 5, 'Export lost records');
    const checkbox = document.getElementById('hide-cancelled');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    check(document.querySelectorAll('main details').length === 4, 'Cancellation filter failed');
    await new Promise(resolve => {
      const listener = (id, change) => {
        if (id === tabId && change.status === 'complete') {
          browser.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      browser.tabs.onUpdated.addListener(listener);
      void browser.tabs.reload(tabId);
    });
    check((await state()).records.length === 5, 'Records lost after refresh');
    document.getElementById('toggle').click();
    await wait(async () => !(await state()).enabled);
    await browser.tabs.executeScript(tabId, {code:"document.getElementById('run').click()"});
    await wait(async () => (await browser.tabs.executeScript(tabId, {code:"document.getElementById('result').textContent"}))[0]);
    check((await state()).records.length === 5, 'Disabled site still recorded');
    document.getElementById('clear').click();
    await wait(async () => (await state()).records.length === 0);
    await fetch(origin+'/report', {method:'POST',body:JSON.stringify({checks:'native request/response capture; HTTP/business/network/cancellation errors; unmodified large response; four clipboard writes; JSON export; cancellation filter; refresh persistence; disable; clear'})});
  } catch (error) {
    await fetch(origin+'/report', {method:'POST',body:JSON.stringify({error:String(error),state:await state()})});
  }
}

async function makeRequests() {
  const request = (path, options) => fetch(new URL(path, location.href).href, options);
  await request('/success');
  const response = await request('/business-error', {method:'POST',headers:{'Content-Type':'application/json','x-test':'copy-test'},body:JSON.stringify({id:42,name:'中文'})});
  const text = await response.text();
  await request('/http-error');
  const large = await request('/large');
  if ((await large.json()).padding.length !== 300000) throw new Error('Large response modified');
  await new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', new URL('/business-error',location.href).href);
    xhr.setRequestHeader('Content-Type','application/json');
    xhr.onloadend=resolve;
    xhr.send('{"xhr":true}');
  });
  const controller = new AbortController();
  const cancelled = request('/cancel',{signal:controller.signal}).catch(()=>{});
  setTimeout(()=>controller.abort(),80);
  await cancelled;
  await request('/network-error').catch(()=>{});
  return text;
}
