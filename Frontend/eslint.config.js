// ESLint del frontend: reglas recomendadas de Expo (React, hooks, TypeScript) + Prettier.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expoConfig,
  prettier,
  { ignores: ['dist/*', '.expo/*', 'node_modules/*'] },
  {
    rules: {
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Lo que empieza con _ se ignora a propósito (convención).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
]);
