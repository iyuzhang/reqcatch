import { z } from 'zod';
import { trimRecords } from './records.js';

const MESSAGE_SCHEMA = z.object({ action: z.enum(['state', 'toggle', 'clear']), tabId: z.number().int().nonnegative() });
const HEADER_SCHEMA = z.object({ name: z.string(), value: z.string().optional() });
const RECORD_SCHEMA = z.object({
  id: z.string(), origin: z.string().url(), page: z.string(), tabId: z.number().int(),
  url: z.string().url(), method: z.string(), time: z.string(), status: z.number().nullable(),
  statusLine: z.string(), requestHeaders: z.array(HEADER_SCHEMA), responseHeaders: z.array(HEADER_SCHEMA),
  requestBody: z.string(), requestNote: z.string(), responseBody: z.string().nullable(), responseNote: z.string(),
  networkError: z.string(), reasons: z.array(z.string()), code: z.unknown(),
}).passthrough();
const STORAGE_SCHEMA = z.object({ origins: z.array(z.string().url()).default([]), records: z.array(RECORD_SCHEMA).default([]) });

export function createRuntime(api, action, onToggle = async () => {}) {
  const origins = new Set();
  const issues = new Map();
  let records = [];
  let revision = 0;
  let queue = Promise.resolve();
  const ready = initialize();
  api.runtime.onMessage.addListener((input, sender, respond) => {
    if (sender.id !== api.runtime.id || sender.url?.split(/[?#]/)[0] !== api.runtime.getURL('panel.html')) return false;
    void handle(input).then(respond, error => respond({ error: String(error) }));
    return true;
  });
  return { origins, issues, ready, add };

  async function initialize() {
    const parsed = STORAGE_SCHEMA.safeParse(await api.storage.local.get(['origins', 'records']));
    if (!parsed.success) return;
    for (const origin of parsed.data.origins) origins.add(origin);
    records = trimRecords(parsed.data.records);
  }

  async function handle(input) {
    const parsed = MESSAGE_SCHEMA.safeParse(input);
    if (!parsed.success) return { error: '无效操作' };
    await ready;
    const { action: operation, tabId } = parsed.data;
    const tab = await api.tabs.get(tabId);
    const origin = getOrigin(tab.url);
    if (!origin) return { error: '请在 HTTP 或 HTTPS 网站上使用' };
    if (operation === 'toggle') {
      const enable = !origins.has(origin);
      await onToggle(tab, enable);
      if (enable) origins.add(origin);
      else origins.delete(origin);
      await save();
    }
    if (operation === 'clear') {
      records = records.filter(record => record.origin !== origin);
      revision += 1;
      await save();
      await action.setBadgeText({ tabId, text: '' });
    }
    return { origin, enabled: origins.has(origin), records: records.filter(record => record.origin === origin), revision, captureIssue: issues.get(tabId) || '' };
  }

  function add(record) {
    const parsed = RECORD_SCHEMA.safeParse(record);
    if (!parsed.success) { console.error('Invalid capture record'); return; }
    records = trimRecords([...records, parsed.data]);
    revision += 1;
    void save().catch(console.error);
    void action.setBadgeBackgroundColor({ tabId: record.tabId, color: '#b91c1c' }).catch(() => {});
    void action.setBadgeText({ tabId: record.tabId, text: String(records.filter(entry => entry.origin === record.origin).length) }).catch(() => {});
  }

  function save() {
    const snapshot = { origins: [...origins], records: [...records] };
    queue = queue.catch(console.error).then(() => api.storage.local.set(snapshot));
    return queue;
  }
}

export function getOrigin(url) {
  try { const parsed = new URL(url); return /^https?:$/.test(parsed.protocol) ? parsed.origin : null; }
  catch { return null; }
}
