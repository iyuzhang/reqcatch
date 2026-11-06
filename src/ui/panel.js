import { api as browser } from '../core/platform.js';
import { getTransport } from '../core/records.js';
import { createRecord } from './record-view.js';
import { createRuleForm } from './rule-form.js';
import { initializeLanguage, translate } from './i18n.js';

const QUERY = new URLSearchParams(location.search);
const RECORDS_NODE = document.getElementById('records');
const FEEDBACK = document.getElementById('feedback');
let tabId;
let state;
let renderedKey = '';
let refreshing = false;
let ruleForm;
let feedbackTimer;

void initialize().catch(showError);

async function initialize() {
  initializeLanguage(() => render(true));
  if (QUERY.has('tabId')) {
    tabId = Number(QUERY.get('tabId'));
    document.body.classList.add('full');
    document.getElementById('open').hidden = true;
  } else {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
  }
  ruleForm = createRuleForm(settings => update('settings', settings), showError, xhrOnly => update('settings', { ...state.settings, xhrOnly }));
  document.getElementById('configure').addEventListener('click', () => {
    const settings = document.getElementById('settings');
    settings.open = !settings.open;
  });
  document.getElementById('settings').addEventListener('toggle', () => {
    document.getElementById('configure').setAttribute('aria-expanded', String(document.getElementById('settings').open));
  });
  document.getElementById('close-settings').addEventListener('click', () => {
    document.getElementById('settings').open = false;
    document.getElementById('configure').focus();
  });
  document.getElementById('search').addEventListener('input', () => render(true));
  document.getElementById('toggle').addEventListener('click', () => void update('toggle'));
  document.getElementById('clear').addEventListener('click', () => void update('clear'));
  document.getElementById('export').addEventListener('click', exportRecords);
  const hideCancelled = document.getElementById('hide-cancelled');
  const quickHideCancelled = document.getElementById('quick-hide-cancelled');
  hideCancelled.checked = quickHideCancelled.checked = localStorage.getItem('hideCancelled') !== 'false';
  for (const control of [hideCancelled, quickHideCancelled]) control.addEventListener('change', () => {
    hideCancelled.checked = quickHideCancelled.checked = control.checked;
    localStorage.setItem('hideCancelled', String(control.checked));
    render(true);
  });
  document.getElementById('open').addEventListener('click', () => {
    void browser.tabs.create({ url: browser.runtime.getURL(`panel.html?tabId=${tabId}`) });
  });
  await refresh();
  setInterval(() => void refresh(), 1000);
}

async function update(action, settings) {
  try {
    state = await browser.runtime.sendMessage({ action, tabId, ...(settings ? { settings } : {}) });
    if (state?.error) throw new Error(state.error);
    render(true);
  } catch (error) { showError(error); if (action === 'settings') throw error; }
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
  const monitorState = document.getElementById('monitor-state');
  monitorState.textContent = state.enabled ? '监控中' : '未启用';
  monitorState.classList.toggle('active', state.enabled);
  ruleForm.sync(state.settings, state.origin);
  const scope = state.settings.xhrOnly ? '仅 XHR / Fetch' : '所有请求类型';
  const businessRule = !state.settings.enabled ? '仅检查 HTTP 与网络异常' : state.settings.mode === 'auto' ? '业务异常自动识别' : `${state.settings.fieldPath} · 成功值 ${state.settings.successValues.map(value => JSON.stringify(value)).join(' / ')}`;
  document.getElementById('rule-summary').textContent = `${scope} · ${businessRule}`;
  const key = `${state.origin}:${state.revision}`;
  if (!force && renderedKey === key) return;
  renderedKey = key;
  const opened = new Set([...RECORDS_NODE.querySelectorAll('details[open][data-fold]')].map(node => node.dataset.fold));
  RECORDS_NODE.replaceChildren();
  const hiddenCancelled = document.getElementById('hide-cancelled').checked;
  const query = document.getElementById('search').value.trim().toLowerCase();
  const visible = state.records.filter(record => {
    if (hiddenCancelled && record.reasons.includes('请求已取消')) return false;
    return !query || `${record.url} ${record.method} ${record.reasons.join(' ')} ${translate(record.reasons.join(' '), document.documentElement.lang)} ${getTransport(record)}`.toLowerCase().includes(query);
  });
  document.getElementById('count').textContent = visible.length === state.records.length ? String(visible.length) : `${visible.length} / ${state.records.length}`;
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = state.records.length ? '没有匹配的请求，试试调整筛选条件。' : state.enabled ? '正在监控，暂无异常。启用后刷新网站即可捕获首屏请求。' : '启用此网站，开始检查网络请求。';
    RECORDS_NODE.append(empty);
  }
  for (const record of [...visible].reverse()) RECORDS_NODE.append(createRecord(record, opened, copy));
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); showError('已复制到剪贴板'); }
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
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => { FEEDBACK.textContent = ''; }, 5000);
}
