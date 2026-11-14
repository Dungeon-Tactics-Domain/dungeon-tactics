import { configDefaults } from 'vitest/config';
import { defineConfig } from 'vite';

export default defineConfig({
  // Portuguese UI language in tests; excludes the agents' working copies (.claude/worktrees), which have their own tests
  test: { setupFiles: ['tests/setup.ts'], exclude: [...configDefaults.exclude, '.claude/**'] },
});
