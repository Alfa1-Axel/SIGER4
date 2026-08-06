import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'

export default [
  { ignores: ['dist', 'dev-dist', 'node_modules', 'scripts/**', 'supabase/functions/**', 'public/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        File: 'readonly',
        fetch: 'readonly',
        FileReader: 'readonly',
        URL: 'readonly',
        KeyboardEvent: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        AudioContext: 'readonly',
        BufferSource: 'readonly',
        atob: 'readonly',
        Notification: 'readonly',
        NotificationPermission: 'readonly',
        PushSubscription: 'readonly',
        ServiceWorkerRegistration: 'readonly',
        crypto: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Navigator: 'readonly',
        ErrorEvent: 'readonly',
        PromiseRejectionEvent: 'readonly',
        PageTransitionEvent: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLPreElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLElement: 'readonly',
        Event: 'readonly',
        caches: 'readonly',
        __SIGER4_BUILD_VERSION__: 'readonly',
        __SIGER4_BUILD_TIME__: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // vite.config.ts corre en Node en tiempo de build (no en el navegador,
    // a diferencia de todo lo demás en src/) — bloque separado en vez de
    // sumar "process" al set de globals de browser de arriba, para no
    // mezclar dos entornos de ejecución distintos bajo el mismo config.
    files: ['vite.config.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        process: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/sw.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        self: 'readonly',
        ServiceWorkerGlobalScope: 'readonly',
        WindowClient: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
]
