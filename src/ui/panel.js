import { api as browser } from '../core/platform.js';
import { formatRequest, formatResponse } from '../core/records.js';

const QUERY = new URLSearchParams(location.search);
const RECORDS_NODE = document.getElementById('records');
const FEEDBACK = document.getElementById('feedback');
let tabId;
let state;
let renderedKey = '';
let refreshing = false;

void initialize().catch(showError);

async function initialize() {
  if (QUERY.has('tabId')) {
    tabId = Number(QUERY.get('tabId'));
    document.body.classList.add('full');
    document.getElementById('open').hidden = true;
  } else {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
  }
  document.getElementById('toggle').addEventListener('click', () => void update('toggle'));
  document.getElementById('clear').addEventListener('click', () => void update('clear'));
  document.getElementById('export').addEventListener('click', exportRecords);
  document.getElementById('hide-cancelled').addEventListener('change', () => render(true));
  document.getElementById('open').addEventListener('click', () => {
    void browser.tabs.create({ url: browser.runtime.getURL(`panel.html?tabId=${tabId}`) });
  });
  await refresh();
  setInterval(() => void refresh(), 1000);
}

async function update(action) {
  try {
    state = await browser.runtime.sendMessage({ action, tabId });
    render(true);
  } catch (error) { showError(error); }
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    state = await browser.runtime.sendMessage({ action: 'state', tabId });
    render();
  } catch (error) { showError(error); }
  finally { refreshing = false; }
}

function render(force = false) {
  if (!state || state.error) {
    FEEDBACK.textContent = state?.error || '无法连接扩展';
    return;
  }
  document.getElementById('adapter-status').textContent = state.captureIssue || '';
  document.getElementById('site').textContent = `${state.origin} · ${state.enabled ? '监控中' : '未启用'}`;
  document.getElementById('toggle').disabled = false;
  document.getElementById('toggle').textContent = state.enabled ? '停用此网站' : '启用此网站';
  document.getElementById('count').textContent = String(state.records.length);
  const key = `${state.origin}:${state.revision}`;
  if (!force && renderedKey === key) return;
  renderedKey = key;
  const opened = new Set([...RECORDS_NODE.querySelectorAll('details[open]')].map(node => node.dataset.id));
  RECORDS_NODE.replaceChildren();
  const hiddenCancelled = document.getElementById('hide-cancelled').checked;
  const visible = state.records.filter(record => !hiddenCancelled || !record.reasons.includes('请求已取消'));
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = state.enabled ? '暂无异常，正常操作网站即可。' : '启用此网站后开始监控。';
    RECORDS_NODE.append(empty);
  }
  for (const record of [...visible].reverse()) RECORDS_NODE.append(createRecord(record, opened.has(record.id)));
}

function createRecord(record, opened) {
  const details = document.createElement('details');
  details.dataset.id = record.id;
  details.open = opened;
  const summary = document.createElement('summary');
  const reason = document.createElement('strong');
  reason.textContent = record.reasons.join(' / ');
  summary.append(reason, document.createTextNode(` · ${record.method} · ${record.status === null ? '无 HTTP 响应' : `HTTP ${record.status}`} · code ${String(record.code)} · ${record.url}`));
  const actions = document.createElement('div');
  actions.className = 'actions';
  for (const [label, value] of [
    ['复制 URL', record.url], ['复制请求', formatRequest(record)],
    ['复制响应', formatResponse(record)], ['复制全部', JSON.stringify(record, null, 2)],
  ]) {
    const button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', () => void copy(value));
    actions.append(button);
  }
  details.append(summary, actions);
  for (const [title, text] of [['请求', formatRequest(record)], ['响应', formatResponse(record)], ['上下文', JSON.stringify({ time: record.time, page: record.page, durationMs: record.durationMs }, null, 2)]]) {
    const heading = document.createElement('h2');
    heading.textContent = title;
    const pre = document.createElement('pre');
    pre.textContent = text;
    details.append(heading, pre);
  }
  return details;
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); FEEDBACK.textContent = '已复制到剪贴板'; }
  catch (error) { showError(`复制失败：${String(error)}`); }
}

function exportRecords() {
  if (!state?.records) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(state.records, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `request-errors-${Date.now()}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showError(error) {
  FEEDBACK.textContent = String(error);
}
