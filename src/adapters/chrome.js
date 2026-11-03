import { z } from 'zod';
import { createRuntime, getOrigin } from '../core/runtime.js';
import { MAX_BODY_BYTES, classify } from '../core/records.js';

const API = globalThis.chrome;
const ATTACHED = new Set();
const ATTACHING = new Map();
const PENDING = new Map();
const QUEUES = new Map();
const HEADERS_SCHEMA = z.record(z.string(), z.string());
const REQUEST_SCHEMA = z.object({
  requestId: z.string(), timestamp: z.number(), wallTime: z.number(), type: z.string().optional(),
  request: z.object({ url: z.string().url(), method: z.string(), headers: HEADERS_SCHEMA, postData: z.string().optional(), hasPostData: z.boolean().optional() }),
});
const RESPONSE_SCHEMA = z.object({ requestId: z.string(), response: z.object({ status: z.number(), statusText: z.string(), headers: HEADERS_SCHEMA, mimeType: z.string() }) });
const FINISH_SCHEMA = z.object({ requestId: z.string(), timestamp: z.number() });
const FAILURE_SCHEMA = FINISH_SCHEMA.extend({ errorText: z.string(), canceled: z.boolean().optional() });
const BODY_SCHEMA = z.object({ body: z.string(), base64Encoded: z.boolean() });
const runtime = createRuntime(API, API.action, toggle);

API.debugger.onEvent.addListener((source, method, params) => {
  const task = (QUEUES.get(source.tabId) || Promise.resolve()).then(() => onEvent(source, method, params));
  QUEUES.set(source.tabId, task.catch(error => runtime.issues.set(source.tabId, String(error))));
});
API.debugger.onDetach.addListener(source => {
  ATTACHED.delete(source.tabId);
  void persistAttached().catch(console.error);
  for (const [key, record] of PENDING) if (record.tabId === source.tabId) PENDING.delete(key);
  runtime.issues.set(source.tabId, '采集已中断。关闭 DevTools 后，停用再启用此网站以恢复。');
});
API.tabs.onUpdated.addListener((id, change, tab) => {
  if (change.url) void reconcile(tab).catch(error => runtime.issues.set(id, String(error)));
});
API.tabs.onRemoved.addListener(id => { ATTACHED.delete(id); runtime.issues.delete(id); });
void runtime.ready.then(async () => {
  const saved = await API.storage.session.get('attachedTabs');
  const parsed = z.array(z.number().int()).safeParse(saved.attachedTabs);
  const ownTabs = new Set(parsed.success ? parsed.data : []);
  for (const target of await API.debugger.getTargets()) if (ownTabs.has(target.tabId) && target.attached) ATTACHED.add(target.tabId);
  for (const tab of await API.tabs.query({})) await reconcile(tab).catch(error => runtime.issues.set(tab.id, String(error)));
}).catch(console.error);

async function toggle(tab, enable) {
  if (enable) {
    await attach(tab.id);
    for (const candidate of await API.tabs.query({})) {
      if (candidate.id !== tab.id && getOrigin(candidate.url) === getOrigin(tab.url)) {
        await attach(candidate.id).catch(error => runtime.issues.set(candidate.id, String(error)));
      }
    }
  }
  else {
    const origin = getOrigin(tab.url);
    for (const candidate of await API.tabs.query({})) {
      if (getOrigin(candidate.url) === origin && ATTACHED.has(candidate.id)) await detach(candidate.id);
    }
  }
}

async function reconcile(tab) {
  await runtime.ready;
  if (runtime.origins.has(getOrigin(tab.url))) await attach(tab.id);
  else if (ATTACHED.has(tab.id)) await detach(tab.id);
}

async function attach(tabId) {
  if (ATTACHED.has(tabId)) return;
  if (ATTACHING.has(tabId)) return ATTACHING.get(tabId);
  const task = (async () => {
    await API.debugger.attach({ tabId }, '1.3');
    try {
      await API.debugger.sendCommand({ tabId }, 'Network.enable', { maxTotalBufferSize: 8 * 1024 * 1024, maxResourceBufferSize: 1024 * 1024, maxPostDataSize: MAX_BODY_BYTES });
      ATTACHED.add(tabId);
      await persistAttached();
      runtime.issues.delete(tabId);
    } catch (error) { await API.debugger.detach({ tabId }); throw error; }
  })();
  ATTACHING.set(tabId, task);
  try { await task; } finally { ATTACHING.delete(tabId); }
}

async function detach(tabId) {
  ATTACHED.delete(tabId);
  await API.debugger.detach({ tabId });
  await persistAttached();
  runtime.issues.delete(tabId);
}

async function onEvent(source, method, params) {
  if (!source.tabId || source.sessionId || !ATTACHED.has(source.tabId)) return;
  const key = `${source.tabId}:${params?.requestId}`;
  if (method === 'Network.requestWillBeSent') {
    const parsed = REQUEST_SCHEMA.safeParse(params);
    if (!parsed.success) return;
    const tab = await API.tabs.get(source.tabId);
    const origin = getOrigin(tab.url);
    if (!runtime.origins.has(origin) || !getOrigin(parsed.data.request.url)) return;
    const { request, timestamp, wallTime } = parsed.data;
    PENDING.set(key, {
      id: `${key}:${wallTime}`, origin, page: tab.url, tabId: tab.id, url: request.url, method: request.method,
      started: timestamp, time: new Date(wallTime * 1000).toISOString(), status: null, statusLine: '',
      requestHeaders: headers(request.headers), requestBody: (request.postData || '').slice(0, MAX_BODY_BYTES),
      requestNote: request.hasPostData && !request.postData ? '浏览器未提供请求体（文件或流式数据）' : '',
      responseHeaders: [], responseBody: null, responseNote: '', networkError: '',
    });
    return;
  }
  const record = PENDING.get(key);
  if (!record) return;
  if (method === 'Network.responseReceived') {
    const parsed = RESPONSE_SCHEMA.safeParse(params);
    if (!parsed.success) return;
    const response = parsed.data.response;
    Object.assign(record, { status: response.status, statusLine: `${response.status} ${response.statusText}`, responseHeaders: headers(response.headers), mimeType: response.mimeType });
  } else if (method === 'Network.loadingFailed') {
    const parsed = FAILURE_SCHEMA.safeParse(params);
    if (!parsed.success) return;
    record.networkError = parsed.data.canceled ? `CANCELLED: ${parsed.data.errorText}` : parsed.data.errorText;
    finish(key, record, parsed.data.timestamp);
  } else if (method === 'Network.loadingFinished') {
    const parsed = FINISH_SCHEMA.safeParse(params);
    if (!parsed.success) return;
    try {
      if (/json|text|xml|javascript/i.test(record.mimeType || '')) {
        const result = BODY_SCHEMA.parse(await API.debugger.sendCommand(source, 'Network.getResponseBody', { requestId: parsed.data.requestId }));
        const text = result.base64Encoded ? new TextDecoder().decode(Uint8Array.from(atob(result.body), char => char.charCodeAt(0))) : result.body;
        record.truncated = new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES;
        record.responseBody = record.truncated ? new TextDecoder().decode(new TextEncoder().encode(text).subarray(0, MAX_BODY_BYTES)) : text;
        if (record.truncated) record.responseNote = '响应体超过 256 KiB，已截断，未检查业务 code';
      } else record.responseNote = '非文本响应，未采集响应体';
    } catch (error) { record.responseNote = `浏览器未提供响应体：${String(error)}`; }
    finish(key, record, parsed.data.timestamp);
  }
}

function finish(key, record, timestamp) {
  if (PENDING.get(key) !== record) return;
  PENDING.delete(key);
  let body;
  if (!record.truncated && record.responseBody) {
    try { body = JSON.parse(record.responseBody); } catch { /* Ignore non-JSON payloads. */ }
  }
  const result = classify(record.status, body, record.networkError);
  if (result.reasons.length) runtime.add({ ...record, ...result, durationMs: Math.round((timestamp - record.started) * 1000) });
}

function headers(values) {
  return Object.entries(values).map(([name, value]) => ({ name, value }));
}

function persistAttached() {
  return API.storage.session.set({ attachedTabs: [...ATTACHED] });
}
