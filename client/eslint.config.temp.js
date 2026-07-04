import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

const browserGlobals = { window: 'readonly', document: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly', navigator: 'readonly', location: 'readonly', history: 'readonly', WebSocket: 'readonly', FormData: 'readonly', FileReader: 'readonly', Blob: 'readonly', requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly', performance: 'readonly', MutationObserver: 'readonly', IntersectionObserver: 'readonly', ResizeObserver: 'readonly', AbortController: 'readonly', structuredClone: 'readonly', queueMicrotask: 'readonly', process: 'readonly' };

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: browserGlobals, parserOptions: { ecmaFeatures: { jsx: true } } },
    settings: { react: { version: '18.3' } },
    rules: {
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-vars': 'error',
      'react/jsx-key': 'error',
      'react/no-unknown-property': 'error',
      'react/display-name': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
  { ignores: ['dist/**', 'node_modules/**'] }
];
