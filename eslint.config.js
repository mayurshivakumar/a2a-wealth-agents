import js from '@eslint/js'
import globals from 'globals'

export default [
  {
    ignores: [
      'coverage/**',
      'node_modules/**',
      '**/node_modules/**',
      '.agents/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
]
