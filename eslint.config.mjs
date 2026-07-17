import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import { DB_IMPORT_ALLOWLIST } from './lib/eslint/db-import-allowlist.mjs'

// R6-F1 — chặn import @/lib/db TRẦN trong route group admin/portal (nơi cần cách ly
// cơ sở). Code mới PHẢI đi qua scopedDb(actor) (cổng an toàn dữ liệu, A0-04/D1).
// Public pages = read toàn cục (không có scope) → KHÔNG áp rule. API cron/webhook
// dùng SYSTEM_ACTOR + scopedDb(actor,{bypass:true}).
const dbBlockedImports = {
  patterns: [
    {
      group: ['@/lib/db'],
      message:
        '❌ R6-F1: KHÔNG import @/lib/db trần trong admin/portal. Dùng scopedDb(actor) ' +
        '(cách ly cơ sở) — vd `const sdb = scopedDb(await resolveActor(session.user.id))`. ' +
        'Cron/webhook: SYSTEM_ACTOR + scopedDb(actor,{bypass:true}).',
    },
  ],
}

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

  // Admin components (ngoài route group app) — chặn Magic UI + Framer Motion.
  {
    files: [
      'components/admin/**/*.{ts,tsx}',
      'components/design-system/admin/**/*.{ts,tsx}',
      // CMP-26: charts là admin-only → cũng chặn Magic/Motion (defensive, không vi phạm hiện tại).
      'components/charts/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['error', adminBlockedImports],
    },
  },

  // app/(admin)/** — Magic/Motion block + R6-F1 db block (gộp patterns vì
  // no-restricted-imports bị REPLACE giữa các override, không merge).
  {
    files: ['app/(admin)/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [...adminBlockedImports.patterns, ...dbBlockedImports.patterns] },
      ],
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
      'components/design-system/effects/**/*.{ts,tsx}',
      // CMP-02: các dir client trước đây KHÔNG được cover recharts-block → bổ sung.
      // (components/client đã xóa ở batch 1.1; components/lms dùng chung admin+portal → tạm chưa áp.)
      'components/home/**/*.{ts,tsx}',
      'components/sections/**/*.{ts,tsx}',
      'components/khoa-hoc/**/*.{ts,tsx}',
      'components/report-card/**/*.{ts,tsx}',
      'components/transcript/**/*.{ts,tsx}',
      'components/aceternity/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['error', clientBlockedImports],
    },
  },

  // app/(portal)/** — R6-F1 db block (portal không có Magic/Motion rule riêng).
  {
    files: ['app/(portal)/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', dbBlockedImports],
    },
  },

  // app/(teacher)/** — L5 site giáo viên: shadcn THUẦN (chặn Magic/Motion như
  // admin + Recharts như client) + db block (site MỚI đi scopedDb từ đầu,
  // KHÔNG grandfather).
  {
    files: ['app/(teacher)/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...adminBlockedImports.patterns,
            ...clientBlockedImports.patterns,
            ...dbBlockedImports.patterns,
          ],
        },
      ],
    },
  },

  // R6-F1 — grandfather: 201 file hiện trạng tạm miễn db block (whitelist→0 theo
  // từng epic). Vẫn GIỮ Magic/Motion block (chỉ bỏ pattern @/lib/db). Override này
  // đặt CUỐI để thắng. Migrate file sang scopedDb → xóa entry khỏi allowlist.
  {
    files: DB_IMPORT_ALLOWLIST,
    rules: {
      'no-restricted-imports': ['error', adminBlockedImports],
    },
  },
)
