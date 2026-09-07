# Workflow của repo — cái nào còn, cái nào đã xoá

## 14 workflow đang sống

| Tệp | Kích hoạt | Việc |
|---|---|---|
| `ci.yml` | push · PR | typecheck · lint · build · unit · DB tests · E2E |
| `deploy.yml` | push `main` | `prisma migrate deploy` lên **PROD** + sync permission registry |
| `migrate-test.yml` | push `test` | migrate DB của môi trường `test` |
| `backup-prod-db.yml` | hằng đêm | sao lưu PROD (Supabase free không tự backup) |
| `keep-alive-dev.yml` | định kỳ | giữ Supabase DEV khỏi bị pause vì idle |
| `cron-pump-test.yml` | 5 phút | bơm cron cho môi trường `test` (Vercel Cron không chạy ở custom env) |
| `seed-prod-roles.yml` | tay | seed `RoleDef` + `RolePermission` (RBAC v2) lên PROD — **đổi quyền ngay** |
| `seed-test-data.yml` | tay | nạp lại dữ liệu nghiệp vụ cho DB `test` |
| `patch-rbac-staff.yml` | tay | gán `UserOrgRole` cho nhân sự thật — việc LẶP LẠI mỗi khi có người mới |
| `prod-db-status.yml` | tay | xem trạng thái migration PROD, chỉ đọc |
| `shadow-report.yml` | tay · lịch | báo cáo lệch RBAC v1↔v2 trên PROD, chỉ đọc |
| `truncate-shadow-diff.yml` | tay | "bấm đồng hồ" shadow — chạy SAU `seed-prod-roles` |
| `nen-p3-bao-cao-shadow.yml` | tay · lịch | báo cáo shadow resolver dataScope, chỉ đọc |
| `cham-cong-prod-do-chi-doc.yml` | tay | đo module chấm công trên PROD, chỉ đọc |

## 10 workflow đã xoá 07/09/2026

Đều là việc **chạy một lần** đã xong, hoặc công cụ của một đợt đã đóng. Xoá vì danh
sách Actions phình tới 24 mục, tìm cái cần bấm mất thời gian.

**Mã KHÔNG mất gì cả** — mọi script vẫn nằm nguyên trong repo. Chỉ cái vỏ workflow bị
gỡ. Cần lại thì lấy về bằng:

```bash
git show <sha trước khi xoá>:.github/workflows/<tên>.yml > .github/workflows/<tên>.yml
```

| Tệp đã xoá | Đã chạy | Script còn lại trong repo |
|---|---|---|
| `backfill-chat-groups.yml` | 2 lần · 10/08 | `scripts/backfill-nhom-lop-chat.ts` |
| `backfill-noti-classification.yml` | 2 lần · 19/08 | `scripts/noti-backfill-classification.ts` |
| `import-legacy-leads.yml` | 5 lần · 27/08 (795 lead đã nhập) | `scripts/import-legacy-leads.ts` · `scripts/kiem-tra-lead-cu.ts` |
| `nen-p1-orgunit.yml` | 4 lần · 12/08 (P1 xong trên prod) | `scripts/nen-p1-*.ts` · `prisma/seed-orgunit.ts` |
| `nen-p2-position.yml` | 2 lần · 12/08 | `scripts/nen-p2-*.ts` |
| `rescale-trial-rubric-prod.yml` | 1 lần · 28/08 | `scripts/rescale-trial-rubric-10.ts` |
| `site-gv-2508-prod.yml` | 4 lần · 26/08 | `prisma/seed-curriculum-sata.ts` · `scripts/backfill-media-assets.ts` · `scripts/gop-trial-v1-sang-v2.ts` |
| `elearning-actor-audit.yml` | 3 lần · 21/08 | `scripts/elearning-actor-audit.ts` |
| `nen-p1-sua-audit.yml` | **0 lần** | `scripts/nen-p1-sua-audit-orgunit.ts` |
| `seed-prod-email-templates.yml` | **0 lần** | `prisma/seed-email-templates.ts` |

### ⚠️ Hai việc CÒN NỢ, nay không còn nút bấm

Hai workflow cuối bảng **chưa từng chạy lần nào**. Xoá vỏ workflow không làm việc đó
biến mất — nó vẫn còn nợ, chỉ là không còn ai nhắc:

1. **`nen-p1-sua-audit`** — dọn `AuditLog.orgUnitId`. Đo prod 12/08 trước khi vá:
   **246/538 dòng** mang `Center.id` thay vì `OrgUnit.id`, **290 dòng** bỏ trống. Đường
   ĐỌC lọc theo `OrgUnit.id`, nên những dòng nhật ký đó **vô hình với quản lý cơ sở** —
   im lặng, không lỗi. Đường GHI đã vá từ 12/08 (`lib/audit/audit-log.ts`), nên số này
   **không phình thêm**; chỉ là dữ liệu cũ chưa dọn.
2. **`seed-prod-email-templates`** — seed `EmailTemplate` lên PROD. Chưa chạy thì
   `/admin/email-templates` trống, và **không ai sửa được nội dung email tự động** (kích
   hoạt tài khoản, nhắc công nợ, nhận xét…) nếu không đụng vào mã. Cần kiểm prod xem
   bảng `EmailTemplate` có dòng nào chưa; nếu rỗng thì đây là việc phải làm.

Muốn làm lại: khôi phục tệp theo lệnh `git show` ở trên, hoặc chạy script qua một
workflow tạm — **đừng chạy ở máy dev**, `.env` trên máy trỏ Supabase **DEV** (cũng chính
là DB của `test.satarobo.vn`), còn chuỗi kết nối prod là secret Sensitive không đọc lại
được.

## Luật cho workflow mới

- Việc chạm **dữ liệu PROD** phải qua workflow, không chạy từ máy dev (lý do ngay trên).
- Mặc định **dry-run**; ghi thật đòi `mode=apply` + gõ đúng chuỗi xác nhận.
- Xong một đợt thì **xoá vỏ workflow** và ghi một dòng vào bảng trên — script ở lại repo.
