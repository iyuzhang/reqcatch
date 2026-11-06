# 请求捕手 — API 异常监控

中文 | [English](README.en.md)

请求捕手（ReqCatch）是一款独立开源的 Firefox 和 Chrome 扩展，用于发现网站请求中的业务异常，方便测试与开发人员排查问题。

启用网站后即可自动识别常见 JSON 业务响应，无需先配置字段。所有处理在本地完成，无后端服务、账号系统、遥测或数据上传。

## 功能

- 默认仅监控 XHR / Fetch，跳过脚本、样式、图片等其他请求类型。
- 自动识别业务异常，也可自定义状态字段及成功值。
- HTTP 异常状态码、WebSocket 与 SSE 监控独立配置，默认全部关闭。
- 普通请求的网络失败和主动取消仍会记录；主动取消默认在列表中隐藏。
- 主界面提供「仅监控 XHR / Fetch」「隐藏主动取消」快捷选项，与设置同步并自动保存，悬停可查看说明。
- 请求体、响应体、请求头及上下文分别折叠，支持搜索及浅色、深色主题。
- 支持复制 URL、请求、响应和完整记录，以及导出 JSON。首个复制按钮合并请求方法、URL、请求体及响应，不包含请求头和响应头。

## 本地安装

需要 Node.js 22 或更高版本及 npm。

```sh
npm ci
npm run check
```

- Chrome：打开 `chrome://extensions`，开启「开发者模式」，选择「加载已解压的扩展程序」，加载 `dist/chrome`。
- Firefox：打开 `about:debugging#/runtime/this-firefox`，选择「临时载入附加组件」，加载 `dist/firefox/manifest.json`。

Firefox 临时扩展会在退出浏览器后移除；永久安装需要 Mozilla 签名。启用网站后刷新页面，可捕获首屏请求。在设置的「语言」中可选择跟随浏览器、简体中文或 English；默认跟随浏览器，中文环境使用简体中文，其他语言使用英文。手动选择自动保存在本地，弹窗与独立页面同步；切换语言不会更改原始请求、响应或导出内容。

## 监控设置

监控设置按网站来源（协议、主机名、端口）保存在本地，对新请求生效，已有记录保留。已保存的选择不会被新默认值覆盖。

「仅监控 XHR / Fetch」默认开启，按浏览器报告的请求类型判断，而非 URL 后缀。通过 Fetch / XHR 加载的资源仍会检查。该范围会排除 WebSocket 和浏览器单独标识的 EventSource；需要监控它们时，应先关闭此选项。

「隐藏主动取消」默认开启，只影响列表显示，不影响采集与导出。该显示偏好自动保存。

「记录 HTTP 异常状态码（4xx / 5xx）」只控制实际 HTTP 状态检查，不控制响应体中的业务字段。例如 HTTP 200 且 `success: false` 仍属于业务异常。

WebSocket 与 SSE 的监控开关独立于通用 HTTP 状态开关。关闭某种流式连接监控后，不记录该连接的异常；开启后记录可识别的握手或连接异常，不解析消息内容。

### 自动识别业务响应

默认选择「自动识别（推荐）」，两个浏览器使用相同规则：

| 顶层字段或结构 | 成功判断 | 异常判断 |
| --- | --- | --- |
| `code` | 数字 `0`、`200`，对应数字字符串（含 `"00000"`）或成功词 | 其他数字状态码或明确失败词 |
| `errcode` / `errno` | 数字零、对应数字字符串或成功词 | 非零数字状态码或明确失败词 |
| `success` / `succeeded` / `ok` | 布尔值 `true` | 布尔值 `false` |
| `status` / `statusCode` / `status_code` | 零、2xx 或成功词 | 4xx、5xx 或明确失败词 |
| GraphQL / JSON:API 的 `errors` | 字段缺失或空数组不产生异常 | 非空对象数组，且每项都有非空的 `message`、`detail` 或 `title` |
| OAuth 的 `error` | 字段缺失不产生异常 | 已识别的 OAuth 错误名，或字符串错误伴随 `error_description` |
| `error` 对象 | `null` 不产生异常 | 对象包含非空 `message` |
| Problem Details | 根据响应体 `status` 判断 | 响应体状态为 4xx / 5xx，即使 HTTP 状态为 200 |

额外支持 `Code`；零表示成功的 `retcode`、`retCode`、`errorCode`、`error_code`；布尔标记 `isSuccess`、`Success`、`Succeeded`、`IsSuccess`；HTTP 风格状态字段 `StatusCode`。

成功词为 `ok`、`success`、`succeeded`、`successful`；失败词为 `error`、`fail`、`failed`、`failure`。比较时忽略大小写及首尾空白。多个标记冲突时，明确失败优先。

自动模式只检查顶层标记，跳过任意嵌套数据、未知字符串、空状态码及 `pending` 等业务状态。这不是所有后端通用的协议；例如以 `code: 1` 表示成功的系统，需要自定义规则。

格式参考：[GraphQL 响应](https://graphql.org/learn/response/)、[JSON:API 错误](https://jsonapi.org/format/#errors)、[OAuth 错误响应](https://www.rfc-editor.org/rfc/rfc6749#section-5.2)、[Problem Details](https://www.rfc-editor.org/rfc/rfc9457)。

### 自定义规则

选择「自定义字段与成功值」，填写 `data.status`、`data.items.0.success` 等点分路径，以及 `[0,"0"]`、`[200,"OK"]`、`[true]` 等成功值数组。

自定义规则替代自动识别；数字、字符串、布尔值和空值按类型分别比较，字段不存在时跳过。关闭业务检查后，仅保留已开启的 HTTP、流式连接检查及普通网络失败记录。

升级前已保存的字段规则仍按自定义规则处理，可切换自动模式或恢复默认值。历史记录保留采集时的规则快照。

## 浏览器支持与限制

| 浏览器 | 采集方式 | 主要限制 |
| --- | --- | --- |
| Firefox 140+ 桌面版 | 原生 `webRequest` 响应流 | 需要网站访问权限，浏览器保护页面不可采集 |
| Chrome 120+ 桌面版 | Manifest V3 的 `debugger` / CDP Network | 显示调试提示，DevTools 或其他调试器可能中断采集 |

SSE 根据响应的 `text/event-stream` 类型或浏览器报告的 EventSource 类型识别。正常结束不会自动记为异常，成功连接中途失败标为「流连接中断」，主动取消仍按取消处理。Fetch 在收到响应头之前失败时，无法可靠判断是否为 SSE。

两个浏览器均支持 WebSocket 握手异常；Chrome 还支持浏览器报告的连接或帧错误。Firefox 的 `webRequest` 只覆盖 HTTP 握手，无法检查升级成功后的错误。两者均不采集 WebSocket 消息内容或逐条解析 SSE 事件。

仅采集浏览器提供且关联到受监控标签页的请求。Chrome 暂不覆盖跨进程 iframe、独立 Worker 等子目标；Firefox 的 Service Worker 或缓存行为可能导致响应体不可用。其他流式响应在结束后才检查业务状态。

所有网站合计最多保留 100 条异常，并受约两百万个序列化字符的总量限制。单个请求体和响应体上限均为 256 KiB，截断响应不检查业务状态。二进制或文件上传可能没有可读请求体，表单按字段展示，不保证保留原始 multipart 字节。

URL 摘要会遮罩疑似凭据查询参数，但完整详情、复制和导出保留原始内容，不会自动脱敏。公开分享前请阅读[隐私政策](PRIVACY.md)。Firefox 内部扩展标识保留改名前的值，用于兼容已有安装，与发布账号无关。

## 开发与发布

运行真实浏览器集成测试：

```sh
npx playwright install --with-deps chromium firefox
npm run test:e2e
```

`npm run check` 执行代码检查、单元测试、隐私扫描和打包。`npm run package` 在 `artifacts` 中生成 Firefox 与 Chrome 的独立安装包；生成包不代表已经签名或通过商店审核。发布步骤见[发布准备说明](docs/RELEASING.md)。

| 目录 | 用途 |
| --- | --- |
| `src/core` | 共享分类、记录格式、消息校验和存储策略 |
| `src/adapters` | Firefox 与 Chrome 原生采集适配 |
| `src/ui` | 弹窗与独立查看页面 |
| `public` | 本地界面资源 |
| `scripts` | 构建、可复现压缩包和隐私扫描 |
| `tests` | 合成测试数据与浏览器集成测试 |
| `dist` / `artifacts` | 已被 Git 忽略的构建与打包产物 |

采用 [MIT 许可证](LICENSE)。项目独立维护，不包含真实业务流量或特定环境配置。
