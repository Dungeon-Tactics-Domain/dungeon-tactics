// Servidor estático da POC: a pasta web e os modelos do jogo em /models (sem copiar). node web/serve.mjs [porta]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const here = import.meta.dirname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.png': 'image/png', '.bin': 'application/octet-stream' };
createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname).slice(1) || 'index.html';
  if (path.includes('..')) return res.writeHead(400).end();
  const file = path.startsWith('models') ? join(here, '../../../public', path) : join(here, path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'content-length': body.length }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(Number(process.argv[2] ?? 4183));
