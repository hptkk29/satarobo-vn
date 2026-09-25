#!/usr/bin/env bash
# =============================================================================
# SessionStart — MỌI worktree của repo này phải có chỉ mục CodeGraph (chốt 25/09/2026).
#
# Chỉ mục `.codegraph/` (~134 MB) KHÔNG đi theo git (đã gitignore) và mỗi worktree là một
# nhánh khác nhau ⇒ mỗi worktree, trên mỗi máy, phải tự dựng một bản. Hook này làm việc
# đó mỗi lần mở một phiên Claude Code:
#   · chưa có `.codegraph/` ở GỐC worktree  → `codegraph init -y` (chạy NỀN)
#   · đã có                                  → `codegraph sync`    (chạy NỀN)
#   · máy chưa cài codegraph                 → in một dòng hướng dẫn cài, thoát 0
#   · không phải repo git                    → thoát 0, không làm gì
#
# ⚠️ Kiểm `.codegraph/` ĐÚNG Ở GỐC worktree (`git rev-parse --show-toplevel`), KHÔNG leo lên
# thư mục cha. CodeGraph tự tra `.codegraph/` gần nhất TỪ DƯỚI LÊN; một worktree lồng trong
# checkout chính (vd `E:\satarobo-vn\fix-bug-rt`) mà thiếu chỉ mục riêng sẽ âm thầm dùng
# chỉ mục của NHÁNH KHÁC — số dòng sai, hàm không tồn tại, mà trông vẫn đáng tin.
#
# Hook KHÔNG BAO GIỜ chặn phiên: mọi nhánh đều `exit 0`. Việc dựng chỉ mục chạy nền để mở
# phiên không phải chờ vài phút; phiên đầu ở một worktree mới vì thế chưa tra được ngay.
#
# `CODEGRAPH_BIN` chỉ để test cắm bản giả (`.claude/hooks/hooks.test.ts`, `[CG-..]`).
# =============================================================================
set -u

goc="${CLAUDE_PROJECT_DIR:-$PWD}"
top="$(git -C "$goc" rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -n "$top" ] || exit 0

cg="${CODEGRAPH_BIN:-codegraph}"
if ! command -v "$cg" >/dev/null 2>&1; then
  echo "[codegraph] Máy này chưa cài CodeGraph. Cài một lần: npm i -g @colbymchenry/codegraph — phiên sau hook sẽ tự dựng chỉ mục cho worktree này."
  exit 0
fi

log="${TMPDIR:-/tmp}/codegraph-$(printf '%s' "$top" | cksum | cut -d' ' -f1).log"

if [ -d "$top/.codegraph" ]; then
  viec="sync"
  set -- sync "$top"
else
  viec="init"
  set -- init -y "$top"
fi

# stdin/stdout/stderr đều tách khỏi hook — nếu tiến trình nền còn giữ ống ra của hook thì
# Claude Code sẽ đợi nó chạy xong mới mở phiên.
nohup "$cg" "$@" >"$log" 2>&1 </dev/null &

if [ "$viec" = "init" ]; then
  echo "[codegraph] Worktree này chưa có chỉ mục — đang dựng nền (vài phút, log: $log). Trong lúc chờ, tra bằng Grep/Read."
fi
exit 0
