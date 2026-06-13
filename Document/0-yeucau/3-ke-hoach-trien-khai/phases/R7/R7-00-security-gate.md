# R7-00 — Tiền đề bảo mật C1–C3 (gate khởi động R7)

**ID** R7-00 · **PR** 1 PR (hoặc 0 nếu R6 đã đóng đủ) · **Ưu tiên** P0 — chặn toàn phase · **Ước lượng** M (verify) → L (nếu phải tự vá) · **Phụ thuộc** R6 (epic hardening) · **Trạng thái** TODO · **Feature flag** `RBAC_V2_ENABLED`

## 1. Mục tiêu & bối cảnh
R7 mở rộng dữ liệu trẻ em + tiền + thao tác chéo cơ sở (học bù). Audit `Document/3-hien-trang/06-audit-lo-hong.md` chỉ ra 3 lỗ mức CAO: C1 scopedDb chưa enforce (~236/238 file import `@/lib/db` trần, IDOR theo center), C2 RBAC_V2 OFF (matrix v1), C3 webhook fail-open. R7 KHÔNG được code tính năng nào đụng dữ liệu cơ sở khi gate này đỏ.

## 2. Phạm vi
- **In:** verify 4 tiêu chí gate (mục 4); nếu R6 chưa đóng mục nào → thực hiện ngay trong ticket này: (a) áp `scopedDb(actor)` cho module lead/order/student/class/enrollment + đổi rule dependency-cruiser `app-no-direct-prisma` warn→error; (b) bật `RBAC_V2_ENABLED=true` staging sau khi shadow-log sạch 48h → prod; (c) `verifyWebhookSecret`/`verifyMetaSignature` fail-CLOSED ở production (thiếu secret → 503) + checklist secret go-live; (d) sửa 2 IDOR đã nêu đích danh (`leads/actions.ts updateLeadStatus`, `orders/_actions.ts`).
- **Out:** chuẩn hóa 27 action dùng mảng role inline (T1 audit — đưa vào R6); cron timing-safe (T3 audit — R6).

## 3. Thiết kế kỹ thuật
Theo đúng khuyến nghị audit 06: `where:{id, centerId:{in: actor.visibleCenterIds}}` hoặc `passesScope()` cho action sửa-theo-id; flag đọc từ env; webhook guard theo `NODE_ENV==='production'`. Không model mới.

## 4. Acceptance Criteria
- AC1: CI đỏ khi file mới trong `app/**` import `@/lib/db` trần (rule = error).
- AC2: `RBAC_V2_ENABLED=true` trên staging + prod; shadow-compare log 0 lệch chưa giải thích trong 48h cuối.
- AC3: Production thiếu `WEBHOOK_*_SECRET`/`META_APP_SECRET` → endpoint trả 503, không tạo lead.
- AC4: CENTER_MANAGER@CS1 gọi action sửa lead/order của CS2 bằng id → 404/denied, có test.

## 5. Files dự kiến
`.dependency-cruiser.cjs` · `lib/flags.ts`/env · `lib/lead/webhook.ts` · `app/(admin)/admin/leads/actions.ts` · `app/(admin)/admin/orders/_actions.ts` · các file áp scopedDb theo danh sách module · `tests/e2e/r7/security-gate.spec.ts`.

## 6. Edge cases & xử lý lỗi
Webhook secret có ở dev nhưng thiếu ở prod (guard theo NODE_ENV) · user đa role nhiều cơ sở (visibleCenterIds là union) · nested include chưa auto-scope (T2 audit — thêm `where` tay + test).

## 7. Rollback / Feature flag
RBAC v2 tắt được bằng env (về v1 matrix). Rule ESLint error có thể hạ về warn bằng 1 dòng config (chỉ khi sự cố CI). Webhook fail-closed KHÔNG rollback (an toàn > tiện).

## 8. Test plan
| Case ID | Nhóm | B/E | Bước | Kết quả | Tool |
|---|---|---|---|---|---|
| R7-00-C1 | T11 | B | thêm file import db trần → chạy lint:boundaries | CI fail | CI |
| R7-00-C2 | T12 | B | bật flag, login từng role cũ | hành vi quyền không lệch v1 (theo shadow log) | Playwright |
| R7-00-C3 | T10 | B | unset secret (env test prod-mode), POST webhook | 503, không tạo record | Vitest/route test |
| R7-00-C4 | T5/T10 | B | CM@CS1 updateLeadStatus(leadId CS2) | denied/404 | Playwright |
| R7-00-C5 | T5 | E | 6 góc T5 (list/get/search/export/aggregate/relation) cho leads + orders | không lộ chéo | Playwright |

## 9. Test data
Seed 2 cơ sở CS1/CS2 + lead/order mỗi bên + user CM@CS1, SALES@CS2 (helper `tests/e2e/_helpers/seed.ts` hiện có).

## 10. RTM
AC1↔C1 · AC2↔C2 · AC3↔C3 · AC4↔C4/C5 — file `security-gate.spec.ts`.

## 11. DoD
Theo DoD chuẩn 00-quy-trinh + cập nhật `06-audit-lo-hong.md` đánh dấu C1/C2/C3 = CLOSED kèm ngày + commit.
