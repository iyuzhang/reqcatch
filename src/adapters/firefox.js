import { api as browser } from '../core/platform.js';
import { createRuntime, getOrigin } from '../core/runtime.js';
import { MAX_BODY_BYTES, classify, captureRequestBody } from '../core/records.js';

const FILTER = { urls: ['http://*/*', 'https://*/*'] };
const PENDING = new Map();
const TABS = new Map();
const runtime = createRuntime(browser, browser.browserAction);
void runtime.ready.then(async () => {
  for (const tab of await browser.tabs.query({})) TABS.set(tab.id, tab.url);
});
browser.webRequest.onBeforeRequest.addListener(beforeRequest, FILTER, ['requestBody']);
browser.webRequest.onBeforeSendHeaders.addListener(beforeHeaders, FILTER, ['requestHeaders']);
browser.webRequest.onHeadersReceived.addListener(receiveHeaders, FILTER, ['blocking', 'responseHeaders']);
browser.webRequest.onCompleted.addListener(completeRequest, FILTER);
browser.webRequest.onErrorOccurred.addListener(failRequest, FILTER);
browser.webRequest.onBeforeRedirect.addListener(redirectRequest, FILTER);
browser.tabs.onUpdated.addListener((id, change, tab) => { if (change.url) TABS.set(id, tab.url); });
browser.tabs.onRemoved.addListener(id => TABS.delete(id));

function beforeRequest(details) {
  if (details.tabId < 0) return;
  if (details.type === 'main_frame') TABS.set(details.tabId, details.url);
  const page = TABS.get(details.tabId) || details.documentUrl || details.originUrl;
  const origin = getOrigin(page);
  if (!origin || !runtime.origins.has(origin)) return;
  const body = captureRequestBody(details.requestBody);
  PENDING.set(details.requestId, {
    id: `${details.requestId}-${details.timeStamp}`, origin, page,
    tabId: details.tabId, url: details.url, method: details.method,
    type: details.type, started: details.timeStamp,
    time: new Date(details.timeStamp).toISOString(),
    status: null, statusLine: '', requestHeaders: [], responseHeaders: [],
    requestBody: body.text, requestNote: body.note,
    responseBody: null, responseNote: '', networkError: '',
  });
}

function beforeHeaders(details) {
  const record = PENDING.get(details.requestId);
  if (record) record.requestHeaders = details.requestHeaders || [];
}

function receiveHeaders(details) {
  const record = PENDING.get(details.requestId);
  if (!record) return;
  record.status = details.statusCode;
  record.statusLine = details.statusLine;
  record.responseHeaders = details.responseHeaders || [];
  const contentType = record.responseHeaders.find(header => header.name.toLowerCase() === 'content-type')?.value || '';
  if (!/json|text\/|xml|javascript/i.test(contentType) && details.type !== 'xmlhttprequest') {
    record.responseNote = '非文本响应，未采集响应体';
    return;
  }
  if (/event-stream/i.test(contentType)) {
    record.responseNote = '流式事件响应，未采集响应体';
    return;
  }
  attachResponseFilter(details.requestId, record, contentType);
}

function attachResponseFilter(requestId, record, contentType) {
  let filter;
  try { filter = browser.webRequest.filterResponseData(requestId); }
  catch (error) { record.responseNote = `无法读取响应体：${String(error)}`; return; }
  let decoder;
  try { decoder = new TextDecoder(/charset=([^;\s]+)/i.exec(contentType)?.[1] || 'utf-8'); }
  catch { decoder = new TextDecoder(); }
  let size = 0;
  let text = '';
  record.filtering = true;
  filter.ondata = event => {
    filter.write(event.data);
    try {
      const data = new Uint8Array(event.data);
      const remaining = Math.max(0, MAX_BODY_BYTES - size);
      text += decoder.decode(data.subarray(0, remaining), { stream: true });
      size += data.byteLength;
      if (size > MAX_BODY_BYTES) {
        record.responseNote = '响应体超过 256 KiB，已截断，未检查业务 code';
        record.truncated = true;
        filter.disconnect();
        record.filtering = false;
        record.responseBody = text + decoder.decode();
      }
    } catch (error) {
      record.responseNote = `响应检查失败：${String(error)}`;
      filter.disconnect();
      record.filtering = false;
    }
  };
  filter.onstop = () => {
    filter.close();
    record.filtering = false;
    record.responseBody = text + decoder.decode();
    if (record.completed) finalize(requestId, record);
  };
  filter.onerror = () => {
    record.filtering = false;
    record.responseNote = `响应体读取失败：${filter.error}`;
    if (record.completed) finalize(requestId, record);
  };
}

function completeRequest(details) {
  const record = PENDING.get(details.requestId);
  if (!record) return;
  record.completed = true;
  record.durationMs = Math.round(details.timeStamp - record.started);
  if (!record.filtering) finalize(details.requestId, record);
}

function failRequest(details) {
  const record = PENDING.get(details.requestId);
  if (!record) return;
  record.networkError = details.error;
  record.durationMs = Math.round(details.timeStamp - record.started);
  finalize(details.requestId, record);
}

function redirectRequest(details) {
  PENDING.delete(details.requestId);
}

function finalize(requestId, record) {
  if (PENDING.get(requestId) !== record) return;
  PENDING.delete(requestId);
  let body;
  if (!record.truncated && record.responseBody) {
    try { body = JSON.parse(record.responseBody); } catch { /* Ignore non-JSON payloads. */ }
  }
  const result = classify(record.status, body, record.networkError);
  if (!result.reasons.length) return;
  delete record.filtering;
  delete record.completed;
  runtime.add({ ...record, ...result });
}
