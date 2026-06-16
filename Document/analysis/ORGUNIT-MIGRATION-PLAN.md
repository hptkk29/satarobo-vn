# Kế hoạch migrate Center → OrgUnit (HO hiển thị + gán được) + LMS

> **Ngày:** 2026-06-15 · **Bối cảnh:** tiếp nối `HARDCODE-AUDIT.md`. Người dùng yêu cầu "fix R6 từ FE đến BE để hiển thị HO và LMS". Đã chốt scope: **(A) HO theo hướng chuẩn OrgUnit (migrate đầy đủ)**, **(B) LMS: thêm trang vào sidebar + wire portal media (signed URL)**.

## Vấn đề gốc (vì sao HO không hiện)
- HO tồn tại dưới dạng **OrgUnit** (`code=HO`, `type=HO`, `centerId=null`) nhưng **KHÔNG có row `Center`**.
- **31 chỗ** dựng dropdown/filter cơ sở đọc `db.center.findMany()` → đều sót HO.
- Mọi entity (Lead/Student/Class/Employee/User) tham chiếu `centerId → Center.id`. HO không có Center ⇒ **không gán được** HO kể cả khi hiện trong dropdown.
- `scopedDb` (cổng cách ly dữ liệu) cách ly **hoàn toàn theo `centerId`** (`injectScope: centerId IN visibleCenterIds`).
- Helper `getSelectableOrgUnits(actor)` (gồm HO) **đã có** tại `lib/org/org-service.ts` nhưng **chưa dùng**.

## Nguyên tắc
- **Additive 2-phase** (thêm mới → backfill → dual-write → flip read → drop sau). KHÔNG big-bang.
- KHÔNG bao giờ nới lỏng isolation giữa chừng (không dùng `OR centerId/orgUnitId`). Flip nguyên tử, revert được tức thì.
- HO độc lập dưới ROOT (Doc 15 OI-1) — `getSubtreeOrgUnitIds(HO) = [HO]`.

## Các pha & chunking (mỗi pha = 1+ PR riêng)

| PR | Nội dung | Rủi ro | Rollback |
|---|---|---|---|
| **PR-0 ✅ (đã làm)** | `getSubtreeOrgUnitIds` (lib/org/org-tree.ts) + `Actor.visibleOrgUnitIds` (lib/auth/actor.ts) + tests. Field song song, **chưa ai đọc** → zero behavior change. | none | revert |
| **PR-A** | Schema: thêm `orgUnitId String?` (+ `Student.preferredOrgUnitId`, `User.orgUnitId`) cho ~25 model trong `SCOPED_MODELS` + assignment entities; `@@index([orgUnitId])`. Giữ `centerId`. Migration + **backfill SQL** (`UPDATE T SET orgUnitId = OrgUnit.id WHERE OrgUnit.centerId = T.centerId`). `Class.orgUnitId` để **nullable** ở pha này. | low (additive) | drop cột, data intact |
| **PR-B1/2/3** | Dual-write: helper `orgUnitIdForCenter`/`centerIdForOrgUnit` (org-service). Mọi create/update set CẢ `centerId` + `orgUnitId`: `lib/lead/auto-assign.ts`, students/classes/nhan-su/rooms/holidays/orders/inventory actions, **7 import routes**, `messenger-service`. | medium | revert (orgUnitId chỉ ngừng được ghi) |
| **PR-C (×6-7)** | Pickers: đổi 31 `db.center.findMany()` → `getSelectableOrgUnits(actor, {types})`. Form/filter lưu theo `orgUnitId`, label = `OrgUnit.name` (HO hiện). Thread `resolveActor(session.user.id)` mỗi page. Mặc định **gồm HO** trừ page lý do vật lý (Room). | medium (độc lập từng mảng) | revert từng mảng |
| **PR-D** ⚠️ | **Flip `scopedDb` sang orgUnitId**: `injectScope`/`passesScope` dùng `orgUnitId IN visibleOrgUnitIds`. Viết lại `lib/db-scope.test.ts` + `tests/e2e/a0/scoped-db.spec.ts`. **Cổng tiền điều kiện:** assert `centerId NOT NULL ⇒ orgUnitId NOT NULL` (xanh mới flip). | **cao nhất** | revert 1 commit → centerId scope trở lại tức thì |
| **PR-E (sau, soak 2-3 ngày)** | Promote `Class.orgUnitId` NOT NULL; bỏ dual-write; **drop `centerId`** + `Center` relations; quyết số phận model `Center` (giữ thành profile 1:1 OrgUnit hay gộp). | cao (destructive) | forward-fix |

### LMS (song song, độc lập migration)
| PR | Nội dung | Trạng thái |
|---|---|---|
| **LMS-1 ✅ (đã làm)** | Thêm nhóm sidebar "Đào tạo (LMS)": Giáo trình/Tài liệu/Ngân hàng câu hỏi/Đề thi/Bài tập (gate `can()`). | xong |
| **LMS-2** | Wire portal media signed URL (R7-09): thêm `createPresignedGetUrl(key, ttl)` vào `lib/storage`, đổi `portal/hinh-anh` + admin media phục vụ ảnh qua signed URL thay `fileUrl` thô. **Cần khảo sát:** `classSessionMedia.fileUrl` đang lưu key hay public URL + bucket private hay không. | chưa |

## Test bắt buộc
- Vitest: `getSubtreeOrgUnitIds` ✅, `visibleOrgUnitIds` ✅; sau PR-D: `injectScope/passesScope` theo orgUnitId + introspection model có `orgUnitId`.
- Playwright isolation (cổng CI): CS1 ≠ CS2; HO lead (`orgUnitId=HO`) → CM@CS1 KHÔNG thấy, HO/SUPER_ADMIN thấy; import code `HO` → ghi `orgUnitId` không cần Center.

## File mấu chốt
- `lib/db-scope.ts` (PR-D — cổng an toàn) · `lib/auth/actor.ts` (visibleOrgUnitIds) · `lib/org/org-tree.ts` + `lib/org/org-service.ts` (helpers) · `prisma/schema.prisma` (PR-A) · `lib/lead/auto-assign.ts` + `app/api/admin/import/*/route.ts` (dual-write).
