// Where does a session's context go? Usage: node scripts/tools/transcript-stats.mjs <session.jsonl> [capTokens]
// Prints chars (≈ tokens × 3.5) per category and the reread cost (sum of context size over all turns).
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const file = process.argv[2];
if (!file) {
  console.error('usage: transcript-stats.mjs <session.jsonl>');
  process.exit(1);
}

const cat = new Map(); // category -> {n, chars}
const add = (k, chars) => {
  const c = cat.get(k) ?? { n: 0, chars: 0 };
  c.n++;
  c.chars += chars;
  cat.set(k, c);
};
const toolById = new Map();
let turns = 0;
let reread = 0; // tokens read from cache summed over turns
let created = 0;
let peak = 0;
const band = { '<200k': 0, '200-500k': 0, '>500k': 0 }; // cost units per context band
const bandTurns = { '<200k': 0, '200-500k': 0, '>500k': 0 };
let totalUnits = 0;
let outTokens = 0;
const cap = Number(process.argv[3] ?? 0); // optional: simulate a context cap (tokens), e.g. 300000
let cappedUnits = 0;
const size = (x) => (typeof x === 'string' ? x.length : JSON.stringify(x ?? '').length);

const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
for await (const line of rl) {
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    continue;
  }
  const m = e.message;
  if (!m) continue;
  const u = m.usage;
  if (e.type === 'assistant' && u) {
    turns++;
    const ctx = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    reread += u.cache_read_input_tokens ?? 0;
    created += u.cache_creation_input_tokens ?? 0;
    peak = Math.max(peak, ctx);
    // relative price: input 1, cache write 1.25, cache read 0.1, output 5 (docs: platform.claude.com prompt caching pricing)
    const units =
      (u.input_tokens ?? 0) +
      1.25 * (u.cache_creation_input_tokens ?? 0) +
      0.1 * (u.cache_read_input_tokens ?? 0) +
      5 * (u.output_tokens ?? 0);
    outTokens += u.output_tokens ?? 0;
    totalUnits += units;
    if (cap) cappedUnits += units * Math.min(1, cap / ctx); // approximation: cost of input side scales with context; output kept

    const b = ctx < 200e3 ? '<200k' : ctx < 500e3 ? '200-500k' : '>500k';
    band[b] += units;
    bandTurns[b]++;
  }
  const parts = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : (m.content ?? []);
  for (const p of parts) {
    if (p.type === 'tool_use') {
      toolById.set(p.id, p.name);
      add(`call:${p.name}`, size(p.input));
    } else if (p.type === 'tool_result') {
      const name = toolById.get(p.tool_use_id) ?? '?';
      const inner = Array.isArray(p.content) ? p.content : [{ type: 'text', text: p.content }];
      for (const c of inner) {
        if (c.type === 'image') add(`result:${name}:image`, size(c.source?.data));
        else add(`result:${name}`, size(c.text));
      }
    } else if (p.type === 'text') {
      const t = p.text ?? '';
      const k =
        e.type === 'assistant'
          ? 'assistant-text'
          : t.includes('<system-reminder>')
            ? 'user:system-reminder'
            : 'user-text';
      add(k, t.length);
    } else if (p.type === 'image') add('user:image', size(p.source?.data));
  }
}

if (cap) console.log(`cap ${cap}: ${Math.round((100 * cappedUnits) / (totalUnits || 1))}% of the real cost`);
console.log(`output=${outTokens} costUnits=${Math.round(totalUnits)}`);
for (const b of Object.keys(band))
  console.log(`band ${b}: ${bandTurns[b]} turns, ${Math.round((100 * band[b]) / (totalUnits || 1))}% of cost`);
const rows = [...cat].sort((a, b) => b[1].chars - a[1].chars).slice(0, 25);
console.log(`turns=${turns} peakContext=${peak} cacheRead=${reread} cacheCreate=${created}`);
for (const [k, v] of rows) console.log(`${String(v.chars).padStart(10)} chars  ${String(v.n).padStart(6)}x  ${k}`);
