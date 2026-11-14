import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

export default defineConfig({
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
