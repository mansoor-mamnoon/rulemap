import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'dist-web/**', 'node_modules/**', 'tmp/**', 'coverage/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly', document: 'readonly', window: 'readonly', navigator: 'readonly', fetch: 'readonly', Blob: 'readonly', HTMLElement: 'readonly', HTMLInputElement: 'readonly', HTMLSelectElement: 'readonly', HTMLTextAreaElement: 'readonly', File: 'readonly', FileReader: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', location: 'readonly', localStorage: 'readonly', requestAnimationFrame: 'readonly', Event: 'readonly', AbortController: 'readonly' } } },
);
