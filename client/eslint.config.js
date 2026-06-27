import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

/** Browser + Node globals for the React client */
const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  history: 'readonly',
  WebSocket: 'readonly',
  FormData: 'readonly',
  FileReader: 'readonly',
  Blob: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  performance: 'readonly',
  MutationObserver: 'readonly',
  IntersectionObserver: 'readonly',
  ResizeObserver: 'readonly',
  AbortController: 'readonly',
  structuredClone: 'readonly',
  queueMicrotask: 'readonly',
  process: 'readonly',
};

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: browserGlobals,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: '18.3' }, // Pin version to avoid getFilename() crash in plugin-react 7.x
    },
    rules: {
      // React rules (manually listed to avoid plugin-react flat-config bug in ESLint 10)
      'react/jsx-uses-react': 'off',       // Not needed with React 17+ JSX transform
      'react/react-in-jsx-scope': 'off',   // Not needed with React 17+ JSX transform
      'react/jsx-uses-vars': 'error',
      'react/jsx-key': 'error',
      'react/no-unknown-property': 'error',
      'react/display-name': 'off',         // Crashes in eslint-plugin-react 7.37.x + ESLint 10
      'react/prop-types': 'off',           // No TypeScript, skip prop-types enforcement

      // React Hooks — standard rules kept as errors
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // React Compiler experimental rules — downgraded to avoid false positives
      // on valid async-in-useEffect patterns that are idiomatic in this codebase
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',

      // General quality
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
