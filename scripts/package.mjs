import { zipSync, strToU8 } from 'fflate';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';

const PACKAGE = JSON.parse(await readFile('package.json', 'utf8'));
await mkdir('artifacts', { recursive: true });
for (const target of ['firefox', 'chrome']) {
  const files = {};
  for (const name of (await readdir(`dist/${target}`)).sort()) files[name] = [new Uint8Array(await readFile(`dist/${target}/${name}`)), { mtime: new Date('2020-01-01T00:00:00Z') }];
  files['BUILD.txt'] = [strToU8(`ReqCatch ${PACKAGE.version}\nTarget: ${target}\n`), { mtime: new Date('2020-01-01T00:00:00Z') }];
  await writeFile(`artifacts/reqcatch-${target}-${PACKAGE.version}.zip`, zipSync(files, { level: 9 }));
}
