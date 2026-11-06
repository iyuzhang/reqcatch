import { DEFAULT_RULE, inspectBusinessResponse } from './rules.js';

export const MAX_BODY_BYTES = 256 * 1024;
export const MAX_RECORDS = 100;
export const MAX_TOTAL_CHARS = 2 * 1024 * 1024;

export function classify(status, body, networkError = '', rule = DEFAULT_RULE) {
  const reasons = [];
  if (networkError && !(status >= 400 && networkError === 'NS_ERROR_NET_ERROR_RESPONSE')) reasons.push(/ABORT|CANCEL/i.test(networkError) ? '请求已取消' : '网络失败');
  if (rule.httpEnabled && status >= 400) reasons.push('HTTP 异常');
  const business = inspectBusinessResponse(body, rule);
  if (business.found && !business.success) reasons.push(business.field === 'code' ? '业务 code 异常' : '业务状态异常');
  return { reasons, code: business.value, businessField: business.field, businessPreset: business.preset, businessChecked: business.found };
}

export function classifyRecord(record) {
  const rule = record.rule || DEFAULT_RULE;
  const transport = getTransport(record);
  if ((transport === 'SSE' && !rule.sseEnabled) || (transport === 'WebSocket' && !rule.websocketEnabled)) {
    return { reasons: [], code: null, businessField: '', businessPreset: '', businessChecked: false };
  }
  let body;
  if (!record.truncated && record.responseBody && getTransport(record) !== 'SSE') {
    try { body = JSON.parse(record.responseBody); } catch { /* Ignore non-JSON payloads. */ }
  }
  const result = classify(record.status, body, record.networkError, rule);
  if (transport === 'WebSocket' && record.status >= 400 && !result.reasons.includes('HTTP 异常')) result.reasons.push('WebSocket 握手失败');
  if (transport === 'SSE' && record.status >= 400 && !result.reasons.includes('HTTP 异常')) result.reasons.push('SSE 连接失败');
  if (getTransport(record) === 'SSE' && record.status >= 200 && record.status < 300) {
    result.reasons = result.reasons.map(reason => reason === '网络失败' ? '流连接中断' : reason);
  }
  return result;
}

export function getTransport(record) {
  const contentType = record.responseHeaders?.find(header => header.name.toLowerCase() === 'content-type')?.value || record.mimeType || '';
  if (/text\/event-stream/i.test(contentType) || record.type?.toLowerCase() === 'eventsource') return 'SSE';
  if (/^wss?:/i.test(record.url || '') || record.type?.toLowerCase() === 'websocket') return 'WebSocket';
  return 'HTTP';
}

export function captureRequestBody(requestBody) {
  if (!requestBody) return { text: '', note: '' };
  if (requestBody.error) return { text: '', note: requestBody.error };
  if (requestBody.formData) {
    const text = JSON.stringify(requestBody.formData, null, 2);
    return { text: text.slice(0, MAX_BODY_BYTES), note: text.length > MAX_BODY_BYTES ? '表单过大，已截断' : '表单字段（非原始 multipart 字节）' };
  }
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  let note = '';
  for (const part of requestBody.raw || []) {
    if (part.file) note = '文件上传仅记录路径，不读取文件内容';
    if (!part.bytes) continue;
    const data = new Uint8Array(part.bytes);
    const remaining = Math.max(0, MAX_BODY_BYTES - size);
    text += decoder.decode(data.subarray(0, remaining), { stream: true });
    size += data.byteLength;
  }
  text += decoder.decode();
  if (size > MAX_BODY_BYTES) note = '请求体超过 256 KiB，已截断';
  return { text, note };
}

export function trimRecords(records) {
  let size = 0;
  const kept = [];
  for (const record of records.slice(-MAX_RECORDS).reverse()) {
    size += JSON.stringify(record).length;
    if (size > MAX_TOTAL_CHARS) break;
    kept.push(record);
  }
  return kept.reverse();
}

export function formatRequest(record) {
  return `${record.method} ${record.url}\n${formatHeaders(record.requestHeaders)}\n\n${record.requestBody || ''}${record.requestNote ? `\n\n[${record.requestNote}]` : ''}`;
}

export function formatResponse(record) {
  return `${record.statusLine || '未收到 HTTP 响应'}\n${formatHeaders(record.responseHeaders)}\n\n${formatResponseContent(record)}`;
}

export function formatRequestAndResponse(record) {
  return `请求\n${record.method} ${record.url}\n\n请求体\n${record.requestBody || '[无请求体]'}${record.requestNote ? `\n[${record.requestNote}]` : ''}\n\n响应\n${record.statusLine || '未收到 HTTP 响应'}\n${formatResponseContent(record)}`;
}

export function hasEmptyResponse(record) {
  if (record.method === 'HEAD' || [204, 205, 304].includes(record.status)) return true;
  const headers = record.responseHeaders || [];
  if (headers.some(header => header.name.toLowerCase() === 'transfer-encoding')) return false;
  return headers.some(header => header.name.toLowerCase() === 'content-length' && header.value?.trim() === '0');
}

function formatResponseContent(record) {
  const empty = record.responseBody === '' || (record.responseBody === null && hasEmptyResponse(record));
  const body = empty ? '[响应体为空]' : (record.responseBody ?? '[未获取响应体]');
  const note = empty ? '' : record.responseNote;
  return `${body}${note ? `\n\n[${note}]` : ''}${record.networkError ? `\n\n${record.networkError}` : ''}`;
}

function formatHeaders(headers = []) {
  return headers.map(header => `${header.name}: ${header.value || ''}`).join('\n');
}
