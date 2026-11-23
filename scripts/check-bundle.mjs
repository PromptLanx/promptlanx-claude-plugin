// Fails if the committed bundle is not exactly what the current source builds to.

import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const committed = 'plugins/promptlanx/dist/promptlanx-hook.js';
const dir = mkdtempSync(join(tmpdir(), 'promptlanx-bundle-'));
try {
  process.env.PROMPTLANX_OUTFILE = join(dir, 'out.js');
  await import('./build.mjs');
  const fresh = readFileSync(process.env.PROMPTLANX_OUTFILE, 'utf8');
  if (fresh !== readFileSync(committed, 'utf8')) {
    console.error(`${committed} is out of date. Run \`npm run build\` and commit the result.`);
    process.exit(1);
  }
  console.log(`${committed} matches the source.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
