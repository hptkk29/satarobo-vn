import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'

// Patterns chặn import sai giữa Admin và Client sites (Phase 4.X.1).
const adminBlockedImports = {
  patterns: [
    {
      group: ['@/components/magic/*', '@/components/magic'],
      message:
        '❌ Magic UI chỉ dùng cho CLIENT site. Admin dùng shadcn/ui + Recharts.',
    },
    {
      group: ['@/components/motion/*', '@/components/motion'],
      message:
        '❌ Motion wrappers chỉ cho CLIENT site. Admin dùng CSS transitions Tailwind hoặc shadcn defaults.',
    },
    {
      group: ['framer-motion', 'framer-motion/*', 'motion', 'motion/*'],
      message:
        '❌ Framer Motion / Motion KHÔNG import trực tiếp ở admin. Dùng Tailwind transitions (transition-colors, transition-all).',
    },
  ],
}

const clientBlockedImports = {
  patterns: [
    {
      group: ['@/components/charts/*', '@/components/charts'],
      message:
        '❌ Recharts wrappers chỉ cho ADMIN site. Client cần visualization → dùng SVG đơn giản hoặc Magic UI.',
    },
    {
      group: ['recharts', 'recharts/*'],
      message:
        '❌ Recharts là admin-only library. Không import ở client site.',
    },
  ],
}

export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'prisma/migrations/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },

  // Admin scope — chặn import Magic UI + Framer Motion
  {
    files: [
      'app/(admin)/**/*.{ts,tsx}',
      'components/admin/**/*.{ts,tsx}',
      'components/design-system/admin/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['error', adminBlockedImports],
    },
  },

  // Client scope — chặn import Recharts
  {
    files: [
      'app/(public)/**/*.{ts,tsx}',
      'app/(auth)/**/*.{ts,tsx}',
      'components/public/**/*.{ts,tsx}',
      'components/honors/**/*.{ts,tsx}',
      'components/blog/**/*.{ts,tsx}',
      'components/jobs/**/*.{ts,tsx}',
      'components/seo/**/*.{ts,tsx}',
      'components/magic/**/*.{ts,tsx}',
      'components/motion/**/*.{ts,tsx}',
      'components/design-system/heroes/**/*.{ts,tsx}',
      'components/design-system/sections/**/*.{ts,tsx}',
      'components/design-system/cards/**/*.{ts,tsx}',
      'components/design-system/ctas/**/*.{ts,tsx}',
      'components/design-system/decorations/**/*.{ts,tsx}',
      'components/design-system/illustrations/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['error', clientBlockedImports],
    },
  },
)
