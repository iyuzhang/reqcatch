export const MAX_BODY_BYTES = 256 * 1024;
export const MAX_RECORDS = 100;
export const MAX_TOTAL_CHARS = 2 * 1024 * 1024;

export function classify(status, body, networkError = '') {
  const reasons = [];
  if (networkError) reasons.push(/ABORT|CANCEL/i.test(networkError) ? '请求已取消' : '网络失败');
  if (status >= 400) reasons.push('HTTP 异常');
  const hasCode = body !== null && typeof body === 'object' && Object.hasOwn(body, 'code');
  if (hasCode && body.code !== 0 && body.code !== '0') reasons.push('业务 code 异常');
  return { reasons, code: hasCode ? body.code : null };
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
  return `${record.statusLine || '未收到 HTTP 响应'}\n${formatHeaders(record.responseHeaders)}\n\n${record.responseBody ?? '[未获取响应体]'}${record.responseNote ? `\n\n[${record.responseNote}]` : ''}${record.networkError ? `\n\n${record.networkError}` : ''}`;
}

function formatHeaders(headers = []) {
  return headers.map(header => `${header.name}: ${header.value || ''}`).join('\n');
}
