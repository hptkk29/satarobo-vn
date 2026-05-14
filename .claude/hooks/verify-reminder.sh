#!/usr/bin/env bash
# Stop hook — nhắc verify khi agent kết thúc turn.
# Chỉ in nhắc nhở, không block.

echo ""
echo "💡 Verify checklist trước khi báo PASS:"
echo "   1. pnpm typecheck → 0 errors"
echo "   2. pnpm lint → 0 errors"
echo "   3. pnpm build → success (or smoke test on /admin/dashboard + /vinh-danh)"
echo "   4. Mobile responsive nếu UI changed"
echo "   5. Không log secret ra console"

exit 0
