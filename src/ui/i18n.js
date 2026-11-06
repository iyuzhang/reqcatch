import { z } from 'zod';

const LANGUAGE_SCHEMA = z.enum(['auto', 'zh-CN', 'en']);
const TEXT = new Map(Object.entries({
  '请求捕手 — API 异常监控': 'ReqCatch — API Error Monitor',
  '请求捕手': 'ReqCatch', 'ReqCatch · API 异常监控': 'API Error Monitor',
  '正在读取当前网站…': 'Loading current website…', '未启用': 'Disabled', '监控中': 'Monitoring',
  '启用此网站': 'Enable website', '停用此网站': 'Disable website',
  '独立页面': 'Open viewer', '设置': 'Settings', '导出 JSON': 'Export JSON', '清空': 'Clear',
  '此网站的设置': 'Website settings', '语言': 'Language', '跟随浏览器': 'Follow browser',
  '隐藏主动取消': 'Hide cancellations', '仅监控 XHR / Fetch': 'XHR / Fetch only',
  '记录 HTTP 异常状态码（4xx / 5xx）': 'Record HTTP errors (4xx / 5xx)',
  '监控 WebSocket': 'Monitor WebSocket', '监控 SSE': 'Monitor SSE',
  '检查 JSON 业务状态': 'Check JSON business status', '识别方式': 'Detection mode',
  '自动识别（推荐）': 'Automatic (recommended)', '自定义字段与成功值': 'Custom field and success values',
  '状态字段': 'Status field', '成功值': 'Success values', '保存规则': 'Save rules', '恢复默认': 'Restore defaults',
  '异常请求': 'Failed requests', '搜索路径、方法或错误类型': 'Search paths, methods or errors', '搜索请求': 'Search requests',
  '本地处理 · 无数据上传': 'Local processing · No uploads',
  '最多 100 条 · 单个请求体 / 响应体 256 KiB': 'Up to 100 records · 256 KiB per request / response body',
  '仅隐藏列表中的主动取消记录，不影响采集和导出；自动保存。': 'Hide cancelled requests in the list without affecting capture or export. Saved automatically.',
  '仅采集浏览器标记为 XHR / Fetch 的请求，跳过脚本、图片等其他类型；自动保存，对新请求生效，已有记录保留。': 'Capture browser-reported XHR / Fetch requests only. Skip scripts, images and other types. Saved automatically for new requests; existing records remain.',
  '以上三项默认关闭。HTTP 开关只控制状态码检查，普通请求的网络失败和业务异常仍会记录。WebSocket 检查握手异常（Chrome 还支持连接错误），SSE 检查连接异常，不解析消息内容。仅 XHR / Fetch 范围会排除 WebSocket 和浏览器单独标识的 EventSource。': 'These three options default to off. The HTTP switch controls status checks only; ordinary network and business errors remain recorded. WebSocket checks handshake errors (Chrome also supports connection errors), and SSE checks connection errors. Message contents are not parsed. XHR / Fetch-only scope excludes WebSocket and separately identified EventSource requests.',
  '内置 code（0 / 200）、errcode / errno（0）、success / succeeded / ok、status / statusCode、GraphQL / JSON:API errors 和常见错误对象识别。仅检查顶层明确标记，含义不明的值跳过；多个标记冲突时优先记录失败。特殊业务码请使用自定义规则。': 'Built-in detection covers code (0 / 200), errcode / errno (0), success / succeeded / ok, status / statusCode, GraphQL / JSON:API errors and common error objects. Only explicit top-level markers are checked. Unknown values are skipped; failures win when markers conflict. Use custom rules for other business codes.',
  '字段支持点分路径，例如 data.status。成功值填写 JSON 数组，数字与字符串分别判断。字段不存在时跳过业务检查；HTTP 和流式连接异常由对应开关控制。保存后对新请求生效。': 'Use a dotted path such as data.status and a JSON array of success values. Numbers and strings are compared by type. Missing fields are skipped. HTTP and streaming errors use their own switches. Saved rules apply to new requests.',
  '例如 data.status': 'e.g. data.status', '例如 [200,"OK",true]': 'e.g. [200,"OK",true]',
  '无法连接扩展': 'Cannot connect to the extension', '仅 XHR / Fetch': 'XHR / Fetch only', '所有请求类型': 'All request types',
  '仅检查 HTTP 与网络异常': 'HTTP and network checks only', '业务异常自动识别': 'Automatic business error detection',
  '没有匹配的请求，试试调整筛选条件。': 'No matching requests. Try changing the filters.',
  '正在监控，暂无异常。启用后刷新网站即可捕获首屏请求。': 'Monitoring, no errors yet. Reload the website to capture initial requests.',
  '启用此网站，开始检查网络请求。': 'Enable this website to start inspecting requests.',
  '已复制到剪贴板': 'Copied to clipboard', '复制失败：': 'Copy failed: ',
  '已恢复默认值，保存规则后生效': 'Defaults restored. Save rules to apply.',
  '成功值须为 JSON 数组，例如 [0,"0"]': 'Success values must be a JSON array, e.g. [0,"0"].',
  '规则已保存，对新请求生效': 'Rules saved for new requests',
  '未收到响应': 'No response', '复制请求与响应': 'Copy request + response', '复制 URL': 'Copy URL',
  '复制请求': 'Copy request', '复制响应': 'Copy response', '复制全部': 'Copy all',
  '请求体': 'Request body', '响应体': 'Response body', '请求头': 'Request headers', '响应头': 'Response headers',
  'URL 与上下文': 'URL and context', '[无请求体]': '[No request body]', '[无可用请求头或响应头]': '[No headers available]',
  '请求已取消': 'Cancelled', '网络失败': 'Network failure', 'HTTP 异常': 'HTTP error',
  '业务 code 异常': 'Business code error', '业务状态异常': 'Business status error', '流连接中断': 'Stream interrupted',
  'WebSocket 握手失败': 'WebSocket handshake failed', 'SSE 连接失败': 'SSE connection failed',
  '请提供有效的响应规则': 'Provide valid response rules', '无效操作': 'Invalid operation',
  '请在 HTTP 或 HTTPS 网站上使用': 'Use this extension on an HTTP or HTTPS website',
  '请使用 data.status 这样的字段路径': 'Use a dotted field path such as data.status',
  '字段路径包含不支持的名称': 'The field path contains an unsupported name',
}));
const SOURCES = new WeakMap();
let preference = 'auto';

export function resolveLanguage(value, browserLanguage) {
  const parsed = LANGUAGE_SCHEMA.safeParse(value);
  const selected = parsed.success ? parsed.data : 'auto';
  return selected === 'auto' ? (/^zh\b/i.test(browserLanguage) ? 'zh-CN' : 'en') : selected;
}

export function translate(text, language) {
  if (language !== 'en') return text;
  if (TEXT.has(text)) return TEXT.get(text);
  let result = text;
  for (const [source, target] of TEXT) if (result.includes(source)) result = result.replaceAll(source, target);
  return result.replace(/复制失败：/g, 'Copy failed: ').replace(/成功值/g, 'Success values')
    .replace(/展开剩余 ([\d,.]+) 字符/g, 'Show remaining $1 characters')
    .replace(/([\d,.]+) 字符/g, '$1 characters').replace(/([\d,.]+) 项/g, '$1 items');
}

export function initializeLanguage(onChange) {
  const select = document.getElementById('language');
  const saved = LANGUAGE_SCHEMA.safeParse(localStorage.getItem('language'));
  preference = saved.success ? saved.data : 'auto';
  select.value = preference;
  select.addEventListener('change', () => {
    const parsed = LANGUAGE_SCHEMA.safeParse(select.value);
    if (!parsed.success) return;
    preference = parsed.data;
    localStorage.setItem('language', preference);
    applyLanguage();
    onChange();
  });
  window.addEventListener('storage', event => {
    if (event.key !== 'language') return;
    const parsed = LANGUAGE_SCHEMA.safeParse(event.newValue);
    preference = parsed.success ? parsed.data : 'auto';
    select.value = preference;
    applyLanguage();
    onChange();
  });
  const observer = new MutationObserver(applyLanguage);
  window.addEventListener('languagechange', () => { if (preference === 'auto') { applyLanguage(); onChange(); } });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label'] });
  applyLanguage();
}

function applyLanguage() {
  const language = resolveLanguage(preference, navigator.language);
  document.documentElement.lang = language;
  document.title = language === 'en' ? 'ReqCatch — API Error Monitor' : '请求捕手 — API 异常监控';
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement.closest('pre, script, .route, .business, .card-meta')) continue;
    updateTranslation(node, 'textContent', language);
  }
  for (const node of document.querySelectorAll('[title], [placeholder], [aria-label]')) {
    if (node.closest('pre, .route')) continue;
    for (const attribute of ['title', 'placeholder', 'aria-label']) if (node.hasAttribute(attribute)) updateTranslation(node, attribute, language, true);
  }
}

function updateTranslation(node, key, language, attribute = false) {
  const values = SOURCES.get(node) || {};
  const current = attribute ? node.getAttribute(key) : node[key];
  const previous = values[key];
  const source = previous && previous.result === current ? previous.source : current;
  const result = translate(source.trim(), language);
  values[key] = { source, result };
  SOURCES.set(node, values);
  if (current === result) return;
  if (attribute) node.setAttribute(key, result);
  else node[key] = result;
}
