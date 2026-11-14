import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  // Portuguese UI language in tests; excludes the agents' working copies (.claude/worktrees), which have their own tests
  test: { setupFiles: ['tests/setup.ts'], exclude: [...configDefaults.exclude, '.claude/**'] },
});
