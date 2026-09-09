import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dist-desktop', 'dev-dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'error', // : 안정 deps는 추가, 내용 키·의도적 제외는 이유 있는 disable
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
      // 미사용 인자·변수는 _ 접두어로 의도 표시 가능
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // : 8개 대상 규칙 모두 error. 의도된 외부 동기화·내용 키 등의 예외는 소스에 한 줄 이유를 남긴다.
      '@typescript-eslint/no-explicit-any': 'error',
      'no-useless-assignment': 'error',
      'react-hooks/refs': 'error',
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/immutability': 'error',
      'react-hooks/purity': 'error'
    }
  },
  {
    // 진입점: Root 컴포넌트를 export하지 않고 createRoot로 바로 렌더한다 — Fast Refresh 단위가 아니라 규칙 예외 .
    files: ['src/app/*/main.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' }
  }
);
