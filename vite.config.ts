import { defineConfig } from 'vite';

export default defineConfig({
  test: { setupFiles: ['tests/setup.ts'] }, // idioma pt nos testes
});
