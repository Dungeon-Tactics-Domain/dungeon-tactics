import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateRoom, type RoomOptions } from '../src/shared/crawl/generate.ts';
import { verifyRoom } from '../src/shared/crawl/verify.ts';

// Usage: node scripts/crawl-sheet.ts [out folder]. Screenshots of 12 crawl rooms (src/shared/crawl), depths 1 to 4 in the
// three themes plus one boss room, through the sandbox (its own Vite and headless Chrome, muted). Each file name ends in the
// verifier's verdict; verifier.json keeps the room, its group and the problems.
const out = process.argv[2] ?? 'crawl-sheet';
const ROOMS: (RoomOptions & { seed: number })[] = [
  { seed: 1, depth: 1, theme: 'dungeon' },
  { seed: 2, depth: 1, theme: 'dungeon' },
  { seed: 3, depth: 1, theme: 'forest' },
  { seed: 4, depth: 2, theme: 'dungeon' },
  { seed: 5, depth: 2, theme: 'mountain' },
  { seed: 6, depth: 2, theme: 'forest' },
  { seed: 7, depth: 2, theme: 'dungeon' },
  { seed: 8, depth: 3, theme: 'dungeon' },
  { seed: 9, depth: 3, theme: 'forest' },
  { seed: 10, depth: 3, theme: 'mountain' },
  { seed: 11, depth: 4, theme: 'dungeon' },
  { seed: 12, depth: 3, boss: true, theme: 'dungeon' },
];
mkdirSync(out, { recursive: true });
const report = ROOMS.map(({ seed, ...opts }) => {
  const room = generateRoom(seed, opts);
  const problems = verifyRoom(room);
  const name = `d${opts.depth}-${opts.theme}-s${seed}${opts.boss ? '-boss' : ''}-${problems.length ? `${problems.length}-problems` : 'ok'}`;
  const spec = { name, crawl: { seed, ...opts }, lang: 'pt', camera: { angle: 0, zoom: 1 }, hide: ['all'] };
  return {
    name,
    room: room.id,
    group: room.name,
    enemies: room.spawns.filter((s) => s.team === 'enemy').map((s) => s.def),
    problems,
    spec,
  };
});
writeFileSync(
  join(out, 'specs.json'),
  `${JSON.stringify(
    report.map((r) => r.spec),
    null,
    2,
  )}\n`,
);
writeFileSync(
  join(out, 'verifier.json'),
  `${JSON.stringify(
    report.map(({ spec: _, ...r }) => r),
    null,
    2,
  )}\n`,
);
for (const r of report)
  console.log(`${r.problems.length ? 'FAIL' : 'ok  '} ${r.name}  ${r.group}  ${r.problems.join('; ')}`);
execFileSync('node', ['scripts/sandbox.mjs', join(out, 'specs.json'), '--sheet', '--out', out], { stdio: 'inherit' });
