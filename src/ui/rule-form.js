import { DEFAULT_RULE, RULE_SCHEMA } from '../core/rules.js';

const CUSTOM_RULE_SCHEMA = RULE_SCHEMA.pick({ fieldPath: true, successValues: true });

export function createRuleForm(submit, notify, submitScope) {
  const form = document.getElementById('rule-form');
  const enabled = document.getElementById('business-enabled');
  const xhrOnly = document.getElementById('xhr-only');
  const quickScope = document.getElementById('quick-xhr-only');
  for (const control of [xhrOnly, quickScope]) control.addEventListener('change', () => void saveScope(control.checked));
  const mode = document.getElementById('business-mode');
  const httpEnabled = document.getElementById('http-enabled');
  const websocketEnabled = document.getElementById('websocket-enabled');
  const sseEnabled = document.getElementById('sse-enabled');
  const field = document.getElementById('field-path');
  const values = document.getElementById('success-values');
  let dirty = false;
  let lastOrigin = '';
  let lastRule = '';
  form.addEventListener('input', () => { dirty = true; });
  enabled.addEventListener('change', updateDisabled);
  mode.addEventListener('change', updateDisabled);
  form.addEventListener('submit', event => { event.preventDefault(); void save(); });
  document.getElementById('reset-rule').addEventListener('click', () => {
    fill(DEFAULT_RULE);
    dirty = true;
    notify('已恢复默认值，保存规则后生效');
  });
  return { sync };

  function sync(rule, origin) {
    const json = JSON.stringify(rule);
    if (origin !== lastOrigin || (!dirty && json !== lastRule)) fill(rule);
    lastOrigin = origin;
    lastRule = json;
  }

  function fill(rule) {
    xhrOnly.checked = rule.xhrOnly;
    quickScope.checked = rule.xhrOnly;
    mode.value = rule.mode || 'custom';
    httpEnabled.checked = rule.httpEnabled;
    websocketEnabled.checked = rule.websocketEnabled;
    sseEnabled.checked = rule.sseEnabled;
    enabled.checked = rule.enabled;
    field.value = rule.fieldPath;
    values.value = JSON.stringify(rule.successValues);
    dirty = false;
    updateDisabled();
  }

  async function saveScope(value) {
    const previous = lastRule ? JSON.parse(lastRule).xhrOnly : DEFAULT_RULE.xhrOnly;
    xhrOnly.checked = quickScope.checked = value;
    xhrOnly.disabled = quickScope.disabled = true;
    try { await submitScope(value); }
    catch (error) {
      xhrOnly.checked = quickScope.checked = previous;
      notify(String(error));
    } finally { xhrOnly.disabled = quickScope.disabled = false; }
  }

  function updateDisabled() {
    mode.disabled = !enabled.checked;
    field.disabled = !enabled.checked || mode.value === 'auto';
    values.disabled = !enabled.checked || mode.value === 'auto';
    document.getElementById('custom-rule').hidden = mode.value !== 'custom';
    document.getElementById('auto-rule-hint').hidden = mode.value !== 'auto';
  }

  async function save() {
    let customRule = { fieldPath: DEFAULT_RULE.fieldPath, successValues: DEFAULT_RULE.successValues };
    const customActive = enabled.checked && mode.value === 'custom';
    try {
      const candidate = CUSTOM_RULE_SCHEMA.safeParse({ fieldPath: field.value, successValues: JSON.parse(values.value) });
      if (candidate.success) customRule = candidate.data;
      else if (customActive) { notify(candidate.error.issues[0].message); return; }
    } catch {
      if (customActive) { notify('成功值须为 JSON 数组，例如 [0,"0"]'); return; }
    }
    const parsed = RULE_SCHEMA.safeParse({ mode: mode.value, httpEnabled: httpEnabled.checked, websocketEnabled: websocketEnabled.checked, sseEnabled: sseEnabled.checked, xhrOnly: xhrOnly.checked, enabled: enabled.checked, ...customRule });
    if (!parsed.success) { notify(parsed.error.issues[0].message); return; }
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    try {
      await submit(parsed.data);
      fill(parsed.data);
      notify('规则已保存，对新请求生效');
    } catch (error) { notify(String(error)); }
    finally { button.disabled = false; }
  }
}
