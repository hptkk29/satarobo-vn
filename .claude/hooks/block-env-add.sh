#!/usr/bin/env bash
# Block `git add .env*` (except .env.example) — security hardening (Phase 4.X.2)
# Triggered by PreToolUse on Bash. Reads command from CLAUDE_COMMAND env var.

# ⚠️ ĐỌC LỆNH TỪ STDIN JSON, KHÔNG PHẢI `$CLAUDE_COMMAND` (vá 09/09/2026).
# Biến `CLAUDE_COMMAND` chưa bao giờ tồn tại — hook này đã `exit 0` im lặng suốt nhiều
# tháng trong khi CLAUDE.md ghi "ENFORCED by hooks". Chi tiết: `_doc-lenh.sh`.
source "$(dirname "${BASH_SOURCE[0]}")/_doc-lenh.sh"
[ -n "$cmd" ] || exit 0

# Only check git add commands
if ! echo "$cmd" | grep -qE '^[[:space:]]*git[[:space:]]+add[[:space:]]'; then
  exit 0
fi

# Allow .env.example
if echo "$cmd" | grep -qE '\.env\.example([[:space:]]|$)'; then
  exit 0
fi

# Block any other .env* file
if echo "$cmd" | grep -qE '\.env(\.[^[:space:]]+)?([[:space:]]|$)'; then
  echo "🚫 BLOCKED: Cannot 'git add .env*' files." >&2
  echo "   Only .env.example is allowed in the repository." >&2
  echo "   Command attempted: $cmd" >&2
  # exit 2 = CHẶN. `exit 1` chỉ là lỗi không chặn — bẫy thứ hai của hook cũ.
  exit 2
fi

exit 0
