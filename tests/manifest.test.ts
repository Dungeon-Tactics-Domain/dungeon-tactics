/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('public/manifest.webmanifest', root), 'utf8'));

// The web app manifest (Nov 18): without it a phone opened the game under Chrome's bar and it could not be played
describe('web app manifest', () => {
  it('opens fullscreen and landscape, from the site root', () => {
    expect(manifest).toMatchObject({ display: 'fullscreen', orientation: 'landscape', start_url: '/' });
  });
  it('has the 192 and 512 px icons, and the files exist', () => {
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(['192x192', '512x512']);
    for (const i of manifest.icons) expect(existsSync(new URL(`public${i.src}`, root))).toBe(true);
  });
  it('is linked from index.html', () => {
    expect(readFileSync(new URL('index.html', root), 'utf8')).toContain(
      '<link rel="manifest" href="/manifest.webmanifest">',
    );
  });
});
