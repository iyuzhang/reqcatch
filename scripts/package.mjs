import { zipSync, strToU8 } from 'fflate';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const PACKAGE = JSON.parse(await readFile('package.json', 'utf8'));
await mkdir('artifacts', { recursive: true });
const archives = [];
for (const target of ['firefox', 'chrome']) {
  const files = {};
  for (const name of (await readdir(`dist/${target}`)).sort()) files[name] = [new Uint8Array(await readFile(`dist/${target}/${name}`)), { mtime: new Date('2020-01-01T00:00:00Z') }];
  files['BUILD.txt'] = [strToU8(`ReqCatch ${PACKAGE.version}\nTarget: ${target}\n`), { mtime: new Date('2020-01-01T00:00:00Z') }];
  await writeArchive(`reqcatch-${target}-${PACKAGE.version}.zip`, files);
}

const sources = {};
for (const directory of ['src', 'public', 'scripts', 'tests']) await collectSources(directory, sources);
for (const name of ['package.json', 'package-lock.json', 'README.md', 'README.en.md', 'LICENSE', 'PRIVACY.md', 'SECURITY.md', 'CONTRIBUTING.md', 'eslint.config.js']) await addSource(name, sources);
sources['BUILDING.txt'] = [strToU8(`ReqCatch ${PACKAGE.version}\n\nBuild environment used for this archive:\nNode.js: ${process.version}\nPlatform: ${process.platform}\nArchitecture: ${process.arch}\n\nReproduction (Node.js 22 or later, npm):\n1. Extract this source ZIP into an empty directory.\n2. Run: npm ci\n3. Run: npm run build\n4. Firefox extension files are generated in dist/firefox.\n5. Run: node scripts/package.mjs to generate upload archives in artifacts.\n\nDependencies are downloaded from the official npm registry using package-lock.json.\nNo private services or credentials are needed. The source ZIP does not include Git metadata.\nThe privacy scanner requires a Git checkout; it is not part of the reproduction steps above.\n`), { mtime: new Date('2020-01-01T00:00:00Z') }];
await writeArchive(`reqcatch-source-${PACKAGE.version}.zip`, sources);
await writeFile('artifacts/SHA256SUMS.txt', archives.map(([name, digest]) => `${digest}  ${name}\n`).join(''));

async function writeArchive(name, files) {
  const data = zipSync(files, { level: 9 });
  await writeFile(`artifacts/${name}`, data);
  archives.push([name, createHash('sha256').update(data).digest('hex')]);
}

async function collectSources(directory, files) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await collectSources(path, files);
    else if (entry.isFile()) await addSource(path, files);
  }
}

async function addSource(path, files) {
  files[path] = [new Uint8Array(await readFile(path)), { mtime: new Date('2020-01-01T00:00:00Z') }];
}
