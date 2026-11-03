import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const PATHS = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const RULES = [
  ['personal absolute path', /\/(?:home|Users)\/[a-zA-Z0-9_.-]+\//],
  ['Windows user path', /[A-Za-z]:\\Users\\[^\\\s]+/],
  ['private network address', /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['access token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b/],
  ['captured traffic file', /(?:^|\/)(?:request-errors-.*\.json|.*\.har)$/],
];
let failed = false;
for (const path of PATHS) {
  if (/\.(png|ico|jpg|woff2)$/.test(path)) continue;
  const content = await readFile(path, 'utf8');
  for (const [label, pattern] of RULES) {
    if (pattern.test(label === 'captured traffic file' ? path : content)) {
      console.error(`${path}: ${label}`);
      failed = true;
    }
  }
}
if (failed) process.exitCode = 1;
else console.log(`Privacy checks passed (${PATHS.length} files). Review samples and screenshots manually before release.`);
