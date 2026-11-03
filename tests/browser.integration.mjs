import { spawnSync } from 'node:child_process';

for (const target of ['firefox', 'chrome']) {
  const result = spawnSync(process.execPath, [`tests/${target}.integration.mjs`], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
