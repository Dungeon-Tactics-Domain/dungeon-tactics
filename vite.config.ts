import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

// The labs site (public domain) reads the bench scenes from the dev server on localhost: Vite's own CORS is off and this
// plugin allows that one origin, including Chrome's Private Network Access preflight (it must answer before Vite's CORS)
const LABS_ORIGIN = 'https://dungeon-tactics-lab.fernandorffdev.com';

export default defineConfig({
  server: { cors: false },
  plugins: [
    {
      name: 'labs-cors',
      configureServer: (server) => {
        server.middlewares.use((req, res, next) => {
          if (req.headers.origin !== LABS_ORIGIN) return next();
          res.setHeader('Access-Control-Allow-Origin', LABS_ORIGIN);
          res.setHeader('Access-Control-Allow-Private-Network', 'true');
          res.setHeader('Vary', 'Origin');
          if (req.method !== 'OPTIONS') return next();
          res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', String(req.headers['access-control-request-headers'] ?? ''));
          res.statusCode = 204;
          res.end();
        });
      },
    },
  ],
  // Portuguese UI language in tests; excludes the agents' working copies (.claude/worktrees), which have their own tests
  test: {
    setupFiles: ['tests/setup.ts'],
    exclude: [...configDefaults.exclude, '.claude/**'],
    // npm run coverage: the game code only; fft/ is a reference study and types.ts has no runtime code
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/shared/battle/fft/**', 'src/shared/battle/types.ts'],
      reporter: ['text-summary', 'lcov'],
    },
  },
});
