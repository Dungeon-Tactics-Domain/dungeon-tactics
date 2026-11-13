import { configDefaults } from 'vitest/config';
import { defineConfig } from 'vite';

export default defineConfig({
  // idioma pt nos testes; fora as cópias de trabalho dos agentes (.claude/worktrees), que têm os próprios testes
  test: { setupFiles: ['tests/setup.ts'], exclude: [...configDefaults.exclude, '.claude/**'] },
});
