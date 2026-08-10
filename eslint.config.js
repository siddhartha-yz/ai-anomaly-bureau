import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', '.tooling/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts', 'e2e/**/*.ts', '*.config.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/App.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: './story/StoryCase001Runtime', message: 'App must select formal cases through story/registry.' },
          { name: './training/TrainingCase000Runtime', message: 'App must select training cases through training/registry.' },
          { name: './game/session', message: 'Formal-case checkpoint internals belong behind story/registry.' },
        ],
      }],
    },
  },
  {
    files: ['src/components/BureauHub.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: '../story/StoryCase001Runtime', message: 'BureauHub consumes formal-case summaries and catalog metadata, not case runtimes.' },
          { name: '../training/TrainingCase000Runtime', message: 'BureauHub opens training IDs through App, not training runtimes.' },
          { name: '../game/session', message: 'BureauHub must not read Story checkpoints directly.' },
          { name: '../endless/session', message: 'BureauHub must receive Duty resume summaries instead of reading Duty sessions.' },
          { name: '../endless/generator', message: 'BureauHub must use bureau/duty symptom-safe previews instead of the full generator surface.' },
        ],
      }],
    },
  },
)
