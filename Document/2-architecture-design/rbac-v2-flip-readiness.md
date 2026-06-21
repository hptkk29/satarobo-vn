# RBAC v2 — Đánh giá sẵn sàng "flip global" (2026-06-18)

> Kết luận: **CHƯA AN TOÀN để flip**. Bật RBAC v2 toàn cục lúc này sẽ **khoá quyền hàng loạt**
> (users mất tính năng). Dưới đây là bằng chứng + lộ trình bật an toàn. KHÔNG flip trong đợt này.

## 1. Hiện trạng (đọc code)

| Thành phần | Trạng thái |
|---|---|
| `lib/auth/can.ts` (v2, actor-based) | ✅ có, đúng chữ ký `can(actor, action, target?)` |
| `lib/auth/check-permission.ts` (`checkPermission`) — bridge v1+v2 theo cờ | ✅ có, NHƯNG **0 call-site import** (chưa nối) |
| `lib/auth/permissions.ts` (v1 matrix) | ✅ **135 action-grant** — ~240 file gọi `can(user, action)` trực tiếp |
| `RBAC_V2_ENABLED` | OFF (.env.example) |
| v2 data (`RolePermission` seed) | ⚠️ **19 perm "mẫu"** — chưa đầy đủ |

## 2. Vì sao flip = nguy hiểm

1. **Thiếu dữ liệu:** v1 cấp **135** action-grant; v2 seed chỉ **19** → flip = phần lớn quyền biến mất.
2. **Lệch mô hình role:** v1 = enum phẳng (`SUPER_ADMIN, CENTER_MANAGER, HR, SALES_CSM, TEACHER, MARKETING, ACCOUNTANT, PARENT`). v2 = org-role (`HO_ACCOUNTANT, HO_HR, HO_MARKETING, HO_SALE, CENTER_ACCOUNTANT, CENTER_SALES_CSM, ASSISTANT_TEACHER, …`). Không ánh xạ 1-1 → cần quyết định nghiệp vụ "user HR cũ → org-role nào".
3. **Chưa nối call-site:** flip cờ KHÔNG đổi hành vi (không ai gọi `checkPermission`); "flip thật" = migrate ~240 call-site → rủi ro cao nếu (1)(2) chưa xong.
4. **Chưa có shadow-diff thực:** cờ chưa từng ON trên prod có dữ liệu → chưa có báo cáo lệch v1≠v2 để tin tưởng.

## 3. Lộ trình flip AN TOÀN (đề xuất — Phase C riêng)

1. **Chốt ánh xạ role** (nghiệp vụ): mỗi user v1-role → 1+ `UserOrgRole` (org-role). Migrate `UserOrgRole` cho mọi user thật.
2. **Hoàn thiện `RolePermission`**: map đủ 135 grant của v1 sang các org-role (seed/đầy đủ, không "mẫu"). Thêm test parity: với mỗi user thật, tập action v2 ⊇ v1.
3. **Nối bridge + shadow:** đổi call-site `can(user, …)` → `checkPermission(action, target)` (hoặc cho v1 `can` ủy quyền bridge). Giữ cờ OFF → chạy shadow, thu `recordPermissionShadow` (lib/auth/shadow-report).
4. **Phân tích shadow-diff** tới khi v1≈v2 (0 lệch ngoài dự kiến) trên prod/canary.
5. **Flip cờ** `RBAC_V2_ENABLED=true` → canary 1 cơ sở → toàn hệ. Có đường lùi (tắt cờ).

## 4. Quyết định đợt này

- **KHÔNG** flip (tránh khoá quyền). Giữ v2 ở **shadow**; vá bảo mật đã làm bằng **owner-scope per-action** (`lib/auth/lms-scope.ts`) — không phụ thuộc flip.
- Gate để flip = mục §3 hoàn tất (đặc biệt #1, #2 cần quyết định nghiệp vụ + migrate data thật).
