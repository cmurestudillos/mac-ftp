const globals = require('globals');
const pluginPrettier = require('eslint-plugin-prettier');
const configPrettier = require('eslint-config-prettier');
module.exports = [
  {
    ignores: ['node_modules/**', 'release/**', '*.min.js'],
  },

  // Proceso principal y preload — entorno Node.js
  {
    files: ['main.js', 'preload.js'],
    plugins: {
      prettier: pluginPrettier,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...configPrettier.rules,
      'prettier/prettier': 'error',
      'no-console': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      curly: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  // Renderer — entorno browser + variables globales de Electron (window.electronAPI)
  {
    files: ['renderer.js'],
    plugins: {
      prettier: pluginPrettier,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...configPrettier.rules,
      'prettier/prettier': 'error',
      'no-console': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      curly: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
];
