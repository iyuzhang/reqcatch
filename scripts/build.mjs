import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import sharp from 'sharp';

const PACKAGE = JSON.parse(await readFile('package.json', 'utf8'));
const FIREFOX_ID = 'request-lens@extensions.invalid';
await rm('dist', { recursive: true, force: true });
for (const target of ['firefox', 'chrome']) {
  const outdir = `dist/${target}`;
  await mkdir(outdir, { recursive: true });
  await build({ entryPoints: { background: `src/adapters/${target}.js`, panel: 'src/ui/panel.js' }, bundle: true, outdir, format: 'iife', target: target === 'chrome' ? 'chrome120' : 'firefox140', legalComments: 'eof' });
  for (const name of ['panel.html', 'panel.css', 'icon.svg']) await copyFile(`public/${name}`, `${outdir}/${name}`);
  for (const size of [16, 32, 48, 128]) await sharp('public/icon.svg').resize(size, size).png().toFile(`${outdir}/icon-${size}.png`);
  const icons = Object.fromEntries([16, 32, 48, 128].map(size => [String(size), `icon-${size}.png`]));
  const common = { name: '请求捕手 — API 异常监控', version: PACKAGE.version, description: 'ReqCatch — API Error Monitor. Automatically detect business errors locally and copy requests and responses.', icons };
  const action = { default_title: '请求捕手 — API 异常监控', default_icon: icons, default_popup: 'panel.html' };
  const manifest = target === 'firefox'
    ? { ...common, manifest_version: 2, permissions: ['webRequest', 'webRequestBlocking', 'storage', 'tabs', 'clipboardWrite', '<all_urls>'], background: { scripts: ['background.js'], persistent: true }, browser_action: action, browser_specific_settings: { gecko: { id: FIREFOX_ID, strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } }, gecko_android: { strict_min_version: '142.0' } } }
    : { ...common, manifest_version: 3, minimum_chrome_version: '120', permissions: ['debugger', 'storage', 'tabs', 'clipboardWrite'], background: { service_worker: 'background.js' }, action };
  await writeFile(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(`${outdir}/LICENSES.txt`, `Zod (MIT)\n\n${await readFile('node_modules/zod/LICENSE', 'utf8')}`);
  await copyFile('LICENSE', `${outdir}/LICENSE`);
}
