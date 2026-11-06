# ReqCatch — API Error Monitor

[中文](README.md) | English

**ReqCatch — API Error Monitor**, an independent open-source extension for Firefox and Chrome. Automatically detect common JSON business errors without configuring field paths. HTTP 4xx/5xx checks, WebSocket monitoring, and SSE monitoring have separate per-site switches, all off by default. Ordinary request network failures and cancellations remain visible.

ReqCatch runs locally. It has no backend, analytics, account system, telemetry, or remote executable code. Enable a website explicitly, inspect its errors, and copy a URL, request, response, or complete record. The first copy action combines the method, URL, request body, and response content while omitting request and response headers.

## Development

Chrome users can download `reqcatch-chrome-VERSION.zip` from [GitHub Releases](https://github.com/iyuzhang/reqcatch/releases), extract it, open `chrome://extensions`, enable Developer mode, and choose Load unpacked with the extracted directory containing `manifest.json`. Keep that directory; download a newer archive and reload to update. No development tools are needed for this installation. Firefox store submission is being prepared; an unsigned ZIP is not a permanent installation package.

Requires Node.js 22 or later and npm.

```sh
npm ci
npm run check
```

For native browser integration tests, install the test browsers and run:

```sh
npx playwright install --with-deps chromium firefox
npm run test:e2e
```

Load `dist/chrome` at `chrome://extensions` using **Developer mode → Load unpacked**. In Firefox, use `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → `dist/firefox/manifest.json`. Temporary Firefox installations are removed when Firefox exits; permanent installations need Mozilla signing.

The interface supports Simplified Chinese and English. Under Settings → Language, choose Follow browser, 简体中文, or English. The default follows the browser: Chinese locales use Simplified Chinese; other locales use English. Manual choices are saved locally and synchronized between the popup and independent viewer. Language changes do not modify raw requests, responses, clipboard payloads, or exports.

### Website settings

Enable **XHR / Fetch only** under **Settings** to skip scripts, stylesheets, images, documents, and other request types before capturing bodies or storing errors. This setting is saved per origin and applies to new requests; existing records remain. It defaults to on for new websites; explicitly saved preferences are preserved. Filtering uses browser resource types, not URL extensions: resources loaded via Fetch/XHR still qualify, while native EventSource connections are excluded when identified separately by the browser.

Use **Settings** to enable **Record HTTP errors (4xx / 5xx)**, **Monitor WebSocket**, and **Monitor SSE** independently. The HTTP switch controls actual HTTP status checks, not JSON business-status fields: HTTP 200 with `success: false` is still a business failure. Disabling a stream switch excludes that transport even when its HTTP status is an error. XHR/Fetch-only scope takes precedence over WebSocket and separately identified EventSource requests. Settings apply to newly started requests; existing records remain.

Business checks default to **Automatic detection (recommended)**. Built-in response patterns are shared by both browsers:

| Top-level response pattern | Success | Failure |
| --- | --- | --- |
| `code` | Numeric `0` / `200`, numeric strings including `"00000"`, success words | Other numeric codes or explicit failure words |
| `errcode` / `errno` | Numeric zero or success words | Nonzero numeric codes or explicit failure words |
| `success` / `succeeded` / `ok` | Boolean `true` | Boolean `false` |
| `status` / `statusCode` / `status_code` | Zero, 2xx, success words | 4xx / 5xx, explicit failure words |
| GraphQL / JSON:API `errors` | Empty or absent array adds no error | Nonempty array of objects, each containing a nonempty `message`, `detail`, or `title` |
| OAuth `error` | Absent adds no error | Recognized OAuth error name or string error with `error_description` |
| `error` object | Null adds no error | Object containing a nonempty `message` |
| Problem Details | Checked via `status` | 4xx / 5xx body status, even if HTTP status is 200 |

Aliases include `Code` for `code`, `retcode` / `retCode` / `errorCode` / `error_code` for zero-success codes, `isSuccess` / `Success` / `Succeeded` / `IsSuccess` for boolean markers, and `StatusCode` for HTTP-style body status.

Success words are `ok`, `success`, `succeeded`, `successful`; failure words are `error`, `fail`, `failed`, `failure` (case-insensitive, ignoring surrounding whitespace). Multiple recognized markers are checked together; an explicit failure wins over success. Only top-level markers are inspected automatically. Arbitrary nested data, unknown strings, null codes, and domain statuses such as `pending` are skipped. These are documented heuristics, not universal backend conventions: a system using `code: 1` for success needs a custom rule. The project does not claim every framework uses the same response envelope.

Select **Custom field and success values** for a dot-separated path such as `data.status` or `data.items.0.success` and a JSON array such as `[0,"0"]`, `[200,"OK"]`, or `[true]`. Custom rules replace automatic detection. Numbers, strings, booleans, and null are compared by type. Missing fields are skipped. Disable the business check to retain only enabled HTTP/transport checks and ordinary network failures. Existing saved field rules remain custom after upgrading; choose automatic mode or restore defaults to opt in. Rules are stored locally per origin; historical records keep their original rule snapshot.

Format references: [GraphQL response](https://graphql.org/learn/response/), [JSON:API errors](https://jsonapi.org/format/#errors), [OAuth error response](https://www.rfc-editor.org/rfc/rfc6749#section-5.2), [Problem Details](https://www.rfc-editor.org/rfc/rfc9457).

The viewer uses collapsible request cards and separately collapsible bodies, headers, and context. Long text can be expanded without nested scrolling panes. Light/dark colors follow the browser theme. Search filters paths, methods, reasons, and transport types. Credential-like query parameters are masked in the compact URL summary; complete details, copies, and exports retain the original values.

When enabled, SSE is identified from the response's `text/event-stream` content type, not a URL containing `stream`. Successful SSE connections are not errors. Interrupted successful SSE connections are labeled **Stream interrupted**. Aborted connections remain cancellations. WebSocket monitoring records failed handshakes in both browsers; Chrome also exposes connection/frame errors through CDP. Firefox only exposes the HTTP handshake through webRequest, so errors after a successful upgrade are outside its coverage. Normal stream closure is not automatically an error. Neither browser build captures WebSocket message contents or inspects individual SSE events for business status.

Known SSE and WebSocket handshake failures are recorded when their own monitoring switch is enabled, independently of the general HTTP status switch. Browser-reported EventSource types also identify SSE before headers are available. A Fetch request that fails before receiving headers cannot reliably be recognized as SSE. The Firefox internal extension ID retains its original pre-rename value to preserve existing local installations; it is not a publisher account.

## Browser behavior

| Browser | Capture mechanism | Important limit |
| --- | --- | --- |
| Firefox 140+ desktop | Native `webRequest` response stream | Requires website access; browser-protected pages are excluded |
| Chrome 120+ desktop | Manifest V3 `debugger` / CDP Network | Displays Chrome's debugging banner; DevTools or another debugger can interrupt capture |

After enabling a site, reload it to include initial requests. Settings apply to the website origin (scheme, hostname, and port). Captures cover browser-provided HTTP/HTTPS traffic and optionally WebSocket handshake/connection metadata associated with a monitored tab. Chrome child targets such as out-of-process iframes and independent workers are currently outside the adapter's scope. Firefox service-worker/cache behavior may prevent a response body from being available. SSE bodies and WebSocket frames are skipped. Other streaming responses are not inspected for business status until they finish.

All sites together retain up to 100 errors and approximately two million serialized characters. Request and response bodies are capped at 256 KiB. Truncated responses are not parsed for business codes. Binary/file uploads may have no readable body; forms are represented as fields rather than original multipart bytes. See [privacy](PRIVACY.md) before sharing exports.

## Layout

- `src/core`: classification, record formatting, validated messages, local storage, and browser API selection.
- `src/adapters`: native Firefox capture and Chrome CDP capture.
- `src/ui`: shared popup and independent viewer.
- `public`: packaged local UI assets.
- `scripts`: build, deterministic ZIP packaging, and privacy checks.
- `tests`: synthetic fixtures and browser integration tests.
- `dist` / `artifacts`: ignored generated browser builds and upload ZIPs.

`npm run package` creates separate Firefox and Chrome archives in `artifacts`. These are build artifacts, not reviewed or published store releases. [Release preparation](docs/RELEASING.md) covers remaining submission work.

MIT licensed. This project is independent and contains no captured customer traffic or environment-specific configuration.
