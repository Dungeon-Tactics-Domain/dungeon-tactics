// Windowless Chrome for the headless scripts, with software WebGL.
// PW_PROFILE: persistent profile folder (optional; without it, a temporary profile). PW_CHANNEL: 'chrome' (default) or 'chromium'
// (needs `npx playwright-core install chromium`).
import { chromium } from 'playwright-core';

export { chromium };
export const openChrome = (opts) => chromium.launchPersistentContext(process.env.PW_PROFILE ?? '', {
  channel: process.env.PW_CHANNEL ?? 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...opts,
});
