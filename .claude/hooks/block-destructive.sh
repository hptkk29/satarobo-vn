#!/usr/bin/env bash
# Block destructive operations without explicit user confirmation.
# Phase 4.X.2 security hardening.

cmd="${CLAUDE_COMMAND:-}"

# Patterns blocked unless user typed them directly (Claude Code shouldn't auto-run)
patterns=(
  'rm[[:space:]]+-rf[[:space:]]+/'              # rm -rf at root
  'rm[[:space:]]+-rf[[:space:]]+~'              # rm -rf home
  'git[[:space:]]+push.*--force.*main'          # force push main
  'git[[:space:]]+push.*--force.*master'        # force push master
  'git[[:space:]]+reset[[:space:]]+--hard'      # hard reset
  'git[[:space:]]+clean[[:space:]]+-fd'         # clean force deep
  'DROP[[:space:]]+TABLE'                       # SQL drop table
  'DROP[[:space:]]+DATABASE'                    # SQL drop db
  'TRUNCATE[[:space:]]+TABLE'                   # SQL truncate
)

for pattern in "${patterns[@]}"; do
  if echo "$cmd" | grep -qE "$pattern"; then
    echo "🚫 BLOCKED: Destructive command requires explicit user confirmation." >&2
    echo "   Pattern matched: $pattern" >&2
    echo "   Command: $cmd" >&2
    echo "   If you really mean this, ask user to authorize in chat first." >&2
    exit 1
  fi
done

# ── prisma migrate diff --shadow-database-url ────────────────────────────────
#
# 26/08/2026 — lệnh này XOÁ SẠCH DB dev/test một lần. Tên nó nghe như chỉ đọc, nhưng
# `--from-migrations` bắt Prisma RESET shadow database rồi replay toàn bộ migration
# vào đó. Ai truyền `--shadow-database-url "$DIRECT_URL"` là đang đưa dao cho chính DB
# thật: 233 bảng còn nguyên, mọi bảng 0 dòng, `_prisma_migrations` biến mất.
#
# Chặn khi shadow URL KHÔNG trỏ Postgres local. Cần so drift thì dựng Postgres
# 127.0.0.1:5432 rồi trỏ vào đó — xem .claude/rules/prisma-db.md.
if echo "$cmd" | grep -qE 'prisma[[:space:]]+migrate[[:space:]]+diff' && echo "$cmd" | grep -qE '\-\-shadow-database-url'; then
  # Lấy giá trị ngay sau cờ (chấp nhận cả `--shadow-database-url=…` lẫn cách nhau dấu cách).
  # Dùng grep -o chứ không sed: `.*` của sed tham lam, nuốt luôn cờ khi dòng lệnh dài.
  shadow=$(echo "$cmd" | grep -oE -- '--shadow-database-url[= ]+"?[^" ]+' | head -1            | sed -E 's/^--shadow-database-url[= ]+"?//')
  if echo "$shadow" | grep -qE '(localhost|127\.0\.0\.1|satarobo_test|ci_test)'; then
    exit 0   # shadow DB local — an toàn
  fi
  echo "🚫 BLOCKED: 'prisma migrate diff --shadow-database-url' trỏ DB KHÔNG phải local." >&2
  echo "   Lệnh này RESET database đích trước khi replay — nó đã xoá sạch DB dev/test 26/08/2026." >&2
  echo "   Shadow URL đọc được: ${shadow:-(không tách được — vẫn chặn)}" >&2
  echo "   Dựng Postgres local rồi trỏ shadow vào 127.0.0.1:5432 (xem .claude/rules/prisma-db.md)." >&2
  exit 1
fi

# ── prisma db push --force-reset ─────────────────────────────────────────────
# Cùng họ với lệnh trên: drop toàn bộ schema rồi dựng lại theo schema.prisma đang có
# trên đĩa. Không có bảng `_prisma_migrations` nào được dựng lại ⇒ lần deploy sau đỏ P3005.
if echo "$cmd" | grep -qE 'prisma[[:space:]]+db[[:space:]]+push' && echo "$cmd" | grep -qE '\-\-force-reset|\-\-accept-data-loss'; then
  if echo "$cmd" | grep -qE '(localhost|127\.0\.0\.1|\.env\.test|satarobo_test|ci_test)'; then
    exit 0
  fi
  echo "🚫 BLOCKED: 'prisma db push --force-reset' chỉ được phép trên DB test local." >&2
  echo "   Thiếu marker local (localhost / 127.0.0.1 / .env.test / satarobo_test) trong command." >&2
  echo "   Command: $cmd" >&2
  exit 1
fi

# prisma migrate reset: cho phép CHỈ KHI target là DB test/local; chặn mọi trường hợp khác (prod).
if echo "$cmd" | grep -qE 'prisma[[:space:]]+migrate[[:space:]]+reset'; then
  if echo "$cmd" | grep -qE '(localhost|127\.0\.0\.1|\.env\.test|satarobo_test)'; then
    exit 0   # local/test DB — an toàn
  fi
  echo "🚫 BLOCKED: 'prisma migrate reset' chỉ được phép trên DB test local." >&2
  echo "   Thiếu marker local (localhost / 127.0.0.1 / .env.test / satarobo_test) trong command." >&2
  echo "   Command: $cmd" >&2
  echo "   Set DATABASE_URL về Postgres local rồi chạy lại (xem .claude/rules/prisma-db.md)." >&2
  exit 1
fi

exit 0
