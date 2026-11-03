# Request Lens

Inspect failed website requests in Firefox and Chrome. Filter HTTP 4xx/5xx responses, network failures, cancellations, and JSON responses whose top-level `code` is neither `0` nor `"0"`.

Request Lens runs locally. It has no backend, analytics, account system, telemetry, or remote executable code. Enable a website explicitly, inspect its errors, and copy a URL, request, response, or complete record.

## Development

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

The current interface is in Chinese. English documentation describes the available controls: enable/disable website, independent viewer, JSON export, clear records, hide cancellations, and four copy actions on each expanded error.

## Browser behavior

| Browser | Capture mechanism | Important limit |
| --- | --- | --- |
| Firefox 140+ desktop | Native `webRequest` response stream | Requires website access; browser-protected pages are excluded |
| Chrome 120+ desktop | Manifest V3 `debugger` / CDP Network | Displays Chrome's debugging banner; DevTools or another debugger can interrupt capture |

After enabling a site, reload it to include initial requests. Settings apply to the website origin (scheme, hostname, and port). Captures are limited to browser-provided HTTP/HTTPS traffic associated with a monitored tab. Chrome child targets such as out-of-process iframes and independent workers are currently outside the adapter's scope. Firefox service-worker/cache behavior may prevent a response body from being available. Streaming responses are not inspected for business codes until they finish; Firefox skips SSE bodies.

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
