import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', '.claude/', 'conformance/cypress/screenshots/', 'conformance/cypress/debug/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Formatting is Prettier's: its own check runs next to this one
  prettier,
);
