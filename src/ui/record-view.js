import { formatRequest, formatResponse, formatRequestAndResponse, getTransport } from '../core/records.js';

const PREVIEW_CHARS = 1400;
const PRIVATE_PARAMETER = /token|password|secret|authorization|api[_-]?key/i;

export function createRecord(record, opened, copy) {
  const card = element('details', 'request-card');
  card.dataset.id = record.id;
  card.dataset.fold = record.id;
  card.open = opened.has(record.id);
  const summary = element('summary', 'card-header');
  const line = element('div', 'card-badges');
  const transport = getTransport(record);
  const reasons = record.reasons.map(reason => transport === 'SSE' && reason === '网络失败' && record.status >= 200 && record.status < 300 ? '流连接中断' : reason);
  line.append(element('span', 'method', record.method), element('span', `status ${record.status >= 400 ? 'bad' : ''}`, record.status === null ? '未收到响应' : String(record.status)), element('span', `protocol ${transport.toLowerCase()}`, transport));
  if (record.businessChecked || (record.businessChecked === undefined && record.code !== null)) {
    const value = JSON.stringify(record.code) ?? '';
    line.append(element('span', 'business', `${record.businessField || 'code'}: ${value.length > 80 ? `${value.slice(0, 80)}…` : value}`));
  }
  line.append(element('span', 'reason', reasons.join(' · ')));
  const route = element('div', 'route', displayUrl(record.url));
  route.title = displayUrl(record.url, true);
  const duration = Number.isFinite(record.durationMs) ? ` · ${record.durationMs >= 1000 ? `${(record.durationMs / 1000).toFixed(1)} s` : `${record.durationMs} ms`}` : '';
  summary.append(line, route, element('div', 'card-meta', `${new Date(record.time).toLocaleTimeString('zh-CN', { hour12: false })}${duration}`));
  const content = element('div', 'card-content');
  const actions = element('div', 'actions');
  for (const [label, text] of [
    ['复制请求与响应', formatRequestAndResponse(record)], ['复制 URL', record.url],
    ['复制请求', formatRequest(record)], ['复制响应', formatResponse(record)], ['复制全部', JSON.stringify(record, null, 2)],
  ]) {
    const button = element('button', label === '复制请求与响应' ? 'primary-copy' : '', label);
    button.type = 'button';
    button.addEventListener('click', () => void copy(text));
    actions.append(button);
  }
  content.append(actions);
  const responseText = formatResponse(record).split('\n\n').slice(1).join('\n\n');
  for (const [key, title, text, info] of [
    ['request-body', '请求体', prettyBody(record.requestBody) || '[无请求体]', record.requestNote],
    ['response-body', '响应体', prettyBody(record.responseBody) || responseText, record.responseNote],
    ['request-headers', '请求头', headersText(record.requestHeaders), `${record.requestHeaders?.length || 0} 项`],
    ['response-headers', '响应头', headersText(record.responseHeaders), `${record.responseHeaders?.length || 0} 项`],
    ['context', 'URL 与上下文', JSON.stringify({ url: record.url, page: record.page, time: record.time, durationMs: record.durationMs, networkError: record.networkError || undefined, businessField: record.businessField, businessPreset: record.businessPreset }, null, 2), ''],
  ]) content.append(createPayload(`${record.id}:${key}`, title, text, info, opened));
  card.append(summary, content);
  return card;
}

export function displayUrl(value, full = false) {
  try {
    const url = new URL(value);
    for (const name of [...url.searchParams.keys()]) if (PRIVATE_PARAMETER.test(name)) url.searchParams.set(name, '••••');
    return `${full ? url.origin : ''}${url.pathname}${decodeURI(url.search)}`;
  } catch { return value; }
}

function createPayload(id, title, text, info, opened) {
  const details = element('details', 'payload');
  details.dataset.fold = id;
  details.open = opened.has(id);
  const summary = document.createElement('summary');
  summary.append(element('span', 'payload-title', title), element('span', 'payload-info', info || `${text.length.toLocaleString()} 字符`));
  const body = element('div', 'payload-content');
  body.append(element('pre', '', text.slice(0, PREVIEW_CHARS)));
  if (text.length > PREVIEW_CHARS) {
    const more = element('details', 'text-more');
    more.dataset.fold = `${id}:more`;
    more.open = opened.has(more.dataset.fold);
    more.append(element('summary', '', `展开剩余 ${(text.length - PREVIEW_CHARS).toLocaleString()} 字符`), element('pre', '', text.slice(PREVIEW_CHARS)));
    body.append(more);
  }
  details.append(summary, body);
  return details;
}

function headersText(headers = []) {
  return headers.map(header => `${header.name}: ${header.value || ''}`).join('\n') || '[无可用请求头或响应头]';
}

function prettyBody(text) {
  if (!text) return '';
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
}

function element(tag, className, text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
