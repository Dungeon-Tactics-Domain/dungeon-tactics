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
  // Nov 18: `any` and `maskable` apart, so the whole icon is not shrunk for a crop it may never get
  it('has the 192 and 512 px icons whole and a 512 px maskable one, and the files exist', () => {
    const icons = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`);
    expect(icons).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
    for (const i of manifest.icons) expect(existsSync(new URL(`public${i.src}`, root))).toBe(true);
  });
  it('gives iOS its own icon and full screen from the home screen', () => {
    const html = readFileSync(new URL('index.html', root), 'utf8');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes">');
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">');
    expect(existsSync(new URL('public/apple-touch-icon.png', root))).toBe(true);
  });
  it('is linked from index.html', () => {
    expect(readFileSync(new URL('index.html', root), 'utf8')).toContain(
      '<link rel="manifest" href="/manifest.webmanifest">',
    );
  });
});
