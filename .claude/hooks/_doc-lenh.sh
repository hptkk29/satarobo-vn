#!/usr/bin/env bash
# .claude/hooks/_doc-lenh.sh — ĐỌC CHUỖI LỆNH mà PreToolUse đang xét. Source file này.
#
# ─────────────────────────────────────────────────────────────────────────────
# VÌ SAO CÓ FILE NÀY — sự cố 09/09/2026
#
# `block-env-add.sh` và `block-destructive.sh` cùng mở đầu bằng:
#
#     cmd="${CLAUDE_COMMAND:-}"
#
# Biến đó KHÔNG TỒN TẠI. `cmd` rỗng ⇒ không mẫu nào khớp ⇒ hook luôn `exit 0` trong im
# lặng. Suốt nhiều tháng: `git add .env` không bị chặn, `git reset --hard` không bị chặn,
# `DROP TABLE` không bị chặn — trong khi CLAUDE.md ghi "Security (ENFORCED by hooks)".
#
# PreToolUse nhận JSON trên STDIN, chuỗi lệnh nằm ở `.tool_input.command`.
#
# Một file dùng chung thay vì chép ba lần: chép là ba cơ hội để một bản lệch đi rồi chết
# lại mà không ai biết.
#
# Cách dùng:
#     source "$(dirname "${BASH_SOURCE[0]}")/_doc-lenh.sh"    # đặt sẵn biến $cmd
#     [ -n "$cmd" ] || exit 0

cmd="$(cat | node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d));
  process.stdin.on("end", () => {
    try {
      const j = JSON.parse(s);
      process.stdout.write(String(j?.tool_input?.command ?? ""));
    } catch {
      process.stdout.write("");
    }
  });
' 2>/dev/null)"
