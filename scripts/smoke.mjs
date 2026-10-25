// Teste de fumaça do site publicado (só estático): node scripts/smoke.mjs https://dungeon-tactics.fernandorffdev.com
// Confere a página, o bundle que ela aponta, o sprite de ícones e um modelo 3D: o que falta aqui deixa a tela branca.
const base = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');

function fail(msg) {
  console.error('SMOKE FAIL:', msg);
  process.exit(1);
}

async function get(path) {
  const r = await fetch(base + path).catch((e) => fail(`${path}: ${e.message}`));
  if (!r.ok) fail(`${path}: HTTP ${r.status}`);
  return r;
}

const html = await (await get('/')).text();
if (!html.includes('<title>Dungeon Tactics</title>')) fail('a página não é a do Dungeon Tactics');
const bundle = html.match(/\/assets\/index-[\w-]+\.js/)?.[0];
if (!bundle) fail('a página não aponta para o bundle /assets/index-*.js');
for (const path of [bundle, '/icons.svg', '/models/knight.glb', '/models/poc/quadrado/dirt.gltf']) await get(path);
console.log('SMOKE OK', base, bundle);
