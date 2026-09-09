#!/usr/bin/env bash
# .claude/hooks/chan-commit-khi-do.sh — CHẶN `git commit` khi typecheck hoặc test ĐỎ.
#
# ─────────────────────────────────────────────────────────────────────────────
# VÌ SAO CÓ FILE NÀY
#
# Luật 6 (`docs/luat-doc-so-va-ket-luan.md`) viết 07/09/2026: "không đặt lệnh kiểm sau dấu
# ống". Ngày 09/09/2026 chính người viết luật vi phạm nó, bằng đúng cái ống:
#
#     pnpm test:unit 2>&1 | grep -E "Tests " | tail -2 && git commit ...
#
# `grep` thành công ⇒ chuỗi `&&` chạy tiếp ⇒ commit `a3b833fc` mang 23 test đỏ. Dòng
# "23 failed" in ra ngay trước mắt và vẫn lọt.
#
# ⇒ LUẬT KHÔNG ĐỦ. Cần CƠ CHẾ. Đây là cơ chế đó.
#
# ─────────────────────────────────────────────────────────────────────────────
# VÌ SAO KHÔNG DÙNG HUSKY / GIT HOOK
#
#  1. `husky` là devDependency nhưng CHƯA TỪNG được khởi tạo — không có `.husky/`, không
#     có script `prepare`, `core.hooksPath` chưa đặt, `.git/hooks` chỉ còn `*.sample`.
#  2. Quan trọng hơn: cách commit đang dùng là `git commit --no-verify`, và `--no-verify`
#     BỎ QUA mọi git hook. Một pre-commit của husky sẽ không chặn được đúng lượt đã lọt.
#     Hook Claude Code chặn ở tầng TRÊN — nó soi chuỗi lệnh trước khi lệnh chạy, nên
#     `--no-verify` không thoát được.
#
# ⚠️ HAI HOOK CŨ CỦA REPO ĐỀU CHẾT: `block-env-add.sh` và `block-destructive.sh` cùng đọc
# `cmd="${CLAUDE_COMMAND:-}"` — biến đó KHÔNG TỒN TẠI, nên `cmd` rỗng, không mẫu nào khớp,
# và hook luôn `exit 0` trong im lặng. CLAUDE.md thì ghi "ENFORCED by hooks" ⇒ yên tâm
# nhầm suốt nhiều tháng. File này đọc JSON trên STDIN, là cách đúng.
#
# ─────────────────────────────────────────────────────────────────────────────
# GIỚI HẠN — NÓI RÕ RA, ĐỪNG ĐỂ AI TƯỞNG NÓ CHẶN MỌI THỨ
#
#  · Chạy `pnpm typecheck` (toàn repo) + `vitest related` cho FILE ĐÃ STAGE. KHÔNG chạy
#    cả `pnpm test:unit` (~65s) mỗi lần commit.
#  · `vitest related` chỉ tìm test import (trực tiếp hay gián tiếp) file đã stage. Test
#    QUÉT CÂY THƯ MỤC (`bang-coverage`, `affordance-coverage`, `nav-coverage`) KHÔNG import
#    file nào nên nó KHÔNG bắt được — đó chính là loại test bắt lỗi ở file bạn không sửa.
#  · Test cần Postgres (`tests/cham-cong`, `tests/nen`…) và test browser (`tests/e2e/a0`)
#    nằm ngoài phạm vi hook.
#  ⇒ Hook này là LƯỚI, không phải cổng cuối. Cổng cuối vẫn là CI. Trước khi mở PR vẫn
#    phải chạy đủ bộ.
#
# Không có đường vượt bằng biến môi trường: thêm một đường vượt mà chính tôi bật được thì
# nó quay lại thành luật, không còn là cơ chế.
set -uo pipefail

json="$(cat)"

cmd="$(printf '%s' "$json" | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d));
  process.stdin.on("end", () => {
    try { process.stdout.write(String(JSON.parse(s)?.tool_input?.command ?? "")); }
    catch { process.stdout.write(""); }
  });
' 2>/dev/null)"

# Không phải lệnh commit thì thôi. `git commit` có thể nằm giữa chuỗi `&&`/`;`.
if ! printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*commit([[:space:]]|$)'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

bao_loi() {
  echo "🚫 CHẶN COMMIT — $1 ĐỎ." >&2
  echo "" >&2
  echo "$2" >&2
  echo "" >&2
  echo "Sửa cho xanh rồi commit lại. Đừng vòng qua bằng dấu ống:" >&2
  echo "  ✗ pnpm test:unit | grep 'Tests'   ← trả mã thoát của grep (luật 6)" >&2
  echo "  ✓ pnpm test:unit > /tmp/kq.txt; echo \$?" >&2
  exit 2
}

# ── 1. typecheck — rẻ nhất và bắt được nhiều nhất ────────────────────────────
tc="$(mktemp)"
if ! pnpm typecheck >"$tc" 2>&1; then
  bao_loi "typecheck" "$(tail -25 "$tc")"
fi

# ── 2. test LIÊN QUAN tới file đã stage ──────────────────────────────────────
mapfile -t staged < <(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx)$' || true)
if [ "${#staged[@]}" -eq 0 ]; then
  exit 0
fi

vt="$(mktemp)"
if ! pnpm exec vitest related --run "${staged[@]}" >"$vt" 2>&1; then
  # `related` không tìm được test nào KHÔNG phải lỗi — nó in "No test files found".
  if grep -q "No test files found" "$vt"; then
    exit 0
  fi
  bao_loi "test liên quan tới file đã stage" "$(tail -30 "$vt")"
fi

exit 0
