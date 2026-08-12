# Kho ảnh lớp — ai đổ ảnh vào, ai gửi cho phụ huynh

> Chốt 11/08/2026 (chủ dự án). Mở rộng luồng ảnh lớp: **Marketing** và **Giáo vụ**
> góp ảnh vào KHO của lớp, **giáo viên** là người chọn ảnh trong kho gửi phụ huynh.

## Hai cổng quyền (đừng gộp lại)

`app/(admin)/admin/media/actions.ts`

| Cổng | Cho phép | Ai qua được |
|---|---|---|
| `canStageToClass` | Đưa ảnh vào **kho** (`ClassSessionMedia.status = DRAFT`) — PH KHÔNG thấy, KHÔNG vào hàng duyệt | Ai qua `canPublishToClass`, **cộng** người giữ `media:upload-draft` (Marketing HO, Giáo vụ) với lớp trong tầm nhìn (`passesScope("Class", …)`) |
| `canPublishToClass` | Đăng thẳng 1 ảnh tới PH, **và** gửi ảnh từ kho | GV lớp (`teacherId`/`assistantId`) ∪ Sale phụ trách lớp (derive từ đơn) ∪ người có `media:approve` |

Đường ảnh rời kho **chỉ có một**: `publishClassMediaAction` → `publishClassMedia`
(gắn thẻ HS / ảnh chung lớp → `PENDING` chờ duyệt, hoặc `APPROVED` nếu người gửi có
`media:approve`). `reviewMedia` từ chối thao tác trên row `DRAFT`.

**Dọn kho** (`deleteDraftMediaAction`): ai qua `canPublishToClass` xoá được **mọi**
ảnh DRAFT của lớp đó (kho là của LỚP — GV phải dọn được ảnh rác người khác góp vào);
vai chỉ-góp-ảnh chỉ xoá được ảnh **của chính mình**.

**Chốt nguồn ảnh:** `fileUrl` phải nằm trên R2 của hệ thống (`isOwnStorageUrl`).
Không có chốt này, ai qua cổng upload cũng nhét được URL ngoài vào album lớp — nội
dung đổi được **sau khi** quản lý duyệt, và mỗi lần phụ huynh mở album là một request
lộ IP/Referer ra server lạ (`<img src>` thuần, CSP đang Report-Only nên không chặn).

⚠️ **Không dùng `canManageClass` cho vai góp ảnh** — hàm đó đòi actor là quản lý
(SUPER_ADMIN/HO/CENTER_MANAGER) hoặc GV phụ trách lớp, nên Giáo vụ
(`CENTER_CLASS_MANAGER`) bị chặn oan.

## Quyền được cấp

| Vai | `media:view` | `media:upload-draft` | `media:upload` | `media:approve` |
|---|---|---|---|---|
| SUPER_ADMIN / CENTER_MANAGER | ✅ | (không cần) | ✅ | ✅ |
| TEACHER | ✅ | ❌ **cố ý** | ✅ | ❌ |
| MARKETING (v1) / HO_MARKETING (v2) | ✅ | ✅ | ❌ | ❌ |
| CENTER_CLASS_MANAGER — Giáo vụ (chỉ v2) | ✅ | ✅ | ❌ | ❌ |

- **Vì sao GV không có `media:upload-draft`:** GV đã vào kho được qua đường "phụ
  trách lớp"; cấp thêm action GLOBAL này sẽ nới GV ra **mọi lớp cùng cơ sở**.
- **Vì sao CENTER_MANAGER không khai ở v1:** đã có `media:approve` nên qua cổng
  hẹp; khai thừa làm `rbac-parity.test.ts` đỏ (RoleDef v2 không giữ action này).
- Cả 2 action đều `GLOBAL`: `media:view` là action gác trang `/media`, mà cổng cấp
  trang gọi `checkAnyPermission` **không kèm target** → scope `CENTER` luôn false.
  Cách ly cơ sở do `scopedDb`/`passesScope` ở tầng query.

Test khoá bất biến: `lib/auth/media-draft-roles.test.ts`.

## Việc phải làm khi triển khai

1. **Seed lại RoleDef** — quyền v2 nằm trong DB, code không tự áp:
   `pnpm db:seed:roles` (dev/test) · workflow `seed-prod-roles.yml` (prod).
2. **Gán vai cho người thật** — `CENTER_CLASS_MANAGER` là RoleDef v2, gán qua
   `/admin/users/[id]/org-roles`. Nhớ: **local/dev chạy RBAC v1** nên vai chỉ-có-ở-v2
   không có hiệu lực ở máy dev, chỉ đúng trên prod (`RBAC_V2_ENABLED=true`).

## Mặt UI

- `/admin/media` và tab **Ảnh** của `/admin/classes/[id]` (cùng `MediaClient`):
  thêm chế độ **"Đưa vào kho (nhiều ảnh)"** (lô ≤ 40, worker pool 3). Người không
  được gửi PH chỉ thấy chế độ này + banner giải thích. Trong bộ lọc "Trong kho":
  hiện tên người tải lên, và nút **Xoá khỏi kho** (người có `media:approve` xoá
  mọi ảnh, người khác chỉ ảnh của chính mình — server chốt lại).
- Site GV `/teacher/anh-lop?classId=…`: panel **Kho ảnh** giờ hiện **tên người tải
  lên** từng ảnh (kho có ảnh của nhiều vai).
- `/api/admin/upload-url`: mở thêm đường ký theo **quyền** (`media:upload-draft`,
  chỉ `category: image`) — trước đó route chỉ so enum role v1 số ít nên vai chỉ có
  ở v2 (Giáo vụ) chết 403 trước cả khi tới Server Action.
