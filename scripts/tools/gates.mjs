// Runs the commit gates and prints one line per gate (plus the first error lines of a failing one).
// Usage: node scripts/tools/gates.mjs [--fix]   (--fix runs `npm run format` first)
// Lets an agent check a block with ~5 lines of output instead of pasting 4 full logs into its context.
import { spawnSync } from 'node:child_process';

const fix = process.argv.includes('--fix');
const gates = [
  ...(fix ? [['format', 'npm run format']] : []),
  ['lint', 'npm run lint'],
  ['typecheck', 'npm run typecheck'],
  ['tests', 'npx vitest run'],
  ['build', 'npx vite build'],
];

let failed = false;
for (const [name, cmd] of gates) {
  const t0 = Date.now();
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  if (r.status === 0) {
    console.log(`OK   ${name} (${secs}s)`);
    continue;
  }
  failed = true;
  console.log(`FAIL ${name} (${secs}s)`);
  // ponytail: first 8 non-empty lines of the output; the full log is one rerun away.
  const lines = `${r.stdout}\n${r.stderr}`.split('\n').filter((l) => l.trim());
  for (const l of lines.slice(0, 8)) console.log(`     ${l.slice(0, 160)}`);
  break; // later gates would mostly repeat the same break
}
process.exit(failed ? 1 : 0);
