import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', '.claude/', 'conformance/cypress/screenshots/', 'conformance/cypress/debug/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // The recorder runs in the page, as is, from Cypress or pasted in a console
  { files: ['conformance/recorder.js'], languageOptions: { globals: globals.browser } },
  // The probe page runs in the browser, bundled by scripts/build-probe.ts
  { files: ['src/probe/page/**/*.ts'], languageOptions: { globals: globals.browser } },
  // Formatting is Prettier's: its own check runs next to this one
  prettier,
);
