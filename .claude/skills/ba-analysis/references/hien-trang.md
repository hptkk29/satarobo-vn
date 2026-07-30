# Hiện trạng dự án — ảnh chụp **12/07/2026**

> ⚠️ **Đây là ảnh chụp, không phải sự thật vĩnh viễn.** Cửa sổ go-live 26/07/2026 sẽ đóng; flag sẽ flip; số sẽ đổi.
> **Trước khi trích bất kỳ con số / trạng thái nào ở đây, tự kiểm lại bằng lệnh trong mỗi mục.**
> Nếu hôm nay **> 26/07/2026** hoặc `docs/ke-hoach-go-live-2607/README.md` không còn được cập nhật → **HỎI PM khung hiện hành**, đừng suy từ file này.

---

## 1. Feature flag — hỏi "flag này ON ở env nào", đừng đọc default

**Default trong code ≠ giá trị trên prod.** Đây là lỗ hổng nghiệm thu số 1: AC không ghi flag → dev build xong, người nghiệm thu mở lên "không thấy gì".

Tự kiểm: `lib/flags.ts` · `.env.example`

| Flag | Default trong code | Prod (12/07) |
|---|---|---|
| `TEACHER_SITE_ENABLED` | **ON** (`!== "false"`) | **ON** — flip 10/07 |
| `SCORM_ENABLED` | OFF | **ON** — live từ 03/07 |
| `RBAC_V2_ENABLED` | OFF | **ON** — đã flip (xác minh 29/07 trên Vercel Production). Code mặc định vẫn OFF ⇒ local/dev chạy v1, **khác prod** |
| `CONVERT_V2_ENABLED` · `COMMON_LOGIN_ENABLED` · `DISPATCHER_ENABLED` | ON | ON |
| `PORTAL_V2_ENABLED` · `EVAL_V2_ENABLED` · `SESSION_LIFECYCLE_V2` · `MEDIA_SIGNED_URL` | OFF | OFF |

Mọi AC chạm tính năng có flag → ghi **tên flag + trạng thái + môi trường** + tiền đề flip.

---

## 2. RBAC — hai tầng, hai nguồn sự thật

Tự kiểm: `lib/auth/permissions.ts` (matrix tĩnh) · `lib/auth/can.ts` + `actor.ts` (v2) · `prisma/seed-roles.ts` · `lib/flags.ts`

- **Tầng QUYỀN ACTION** — matrix **tĩnh** trên enum 9 role: `SUPER_ADMIN` `CENTER_MANAGER` `HR` `SALES_CSM` `TEACHER` `TRAINING` `MARKETING` `ACCOUNTANT` `PARENT`. Đây là cái **đang enforce trên prod** (RBAC v2 chưa flip). *(CLAUDE.md còn ghi "8 roles" — sai, đã có thêm `TRAINING`.)*
- **Tầng CÁCH LY DỮ LIỆU** — luôn **động**: actor dựng từ `UserOrgRole` × `RoleDef` (seed 14 role code).

→ **AC về quyền phải ghi nghiệm thu ở tầng nào / trước hay sau flip.**

**Cảnh báo nặng (ĐÃ XẢY RA, không còn là dự báo):** `RBAC_V2_ENABLED` đã bật ⇒ **mọi `UserPermissionGrant` DENY đang bị bỏ qua trên prod** — `can()` v1 tôn trọng DENY, v2 (`lib/auth/can.ts:36-44`) chỉ lọc `ALLOW` và không có `grantsDeny`. Đừng đề xuất giải pháp dựa trên grant DENY cho tới khi `can()` v2 được vá.

**Bất biến (chưa đổi, đừng đề xuất ngược):**
- ALLOW thắng nếu ≥1 role cho phép — **không có DENY override** (OI-7).
- **Không có role `HO_MANAGER`** (OI-3). Role HO là cross-center theo chức năng.
- `EmployeeOrgAssignment` = nhân sự/lương, **không tự sinh quyền**; quyền chỉ từ `UserOrgRole`.
- Chỉ `SUPER_ADMIN` sửa `RoleDef`, bắt buộc audit + reason.

**Trong cửa sổ flip:** mọi thay đổi chạm hành vi RBAC v2 (`seed-roles.ts`, `can.ts`, gán/rút `UserOrgRole`) ⇒ phải `TRUNCATE RbacShadowDiff` + đếm lại đồng hồ shadow từ đầu → **đừng đề xuất chạm RBAC lúc này**. Cổng flip: `SELECT COUNT(*) FROM "RbacShadowDiff" = 0` + smoke 8 vai trò + diễn tập rollback bấm giờ < 10 phút.

---

## 3. scopedDb — cái khiên có lỗ

Tự kiểm: `lib/db-scope.ts` (xem `SCOPED_MODELS`) · `lib/eslint/db-import-allowlist.mjs`

Skill cũ dạy "scopedDb ép cách ly CS1 ≠ CS2" — **đọc như một bảo đảm toàn diện, và đó là ảo tưởng**. Năm sự thật:

1. **Chỉ che ĐỌC.** `$extends` chỉ hook 7 method đọc (`findMany` `findFirst` `findUnique` `count` `aggregate` `groupBy` `findFirstOrThrow`). `create` / `update` / `delete` **KHÔNG được scope** → mọi write phải tự gọi `passesScope()` (IDOR write đã từng xảy ra thật).
2. **Model đã scoped ⇒ mọi `create` PHẢI set `centerId`.** `SCOPED_MODELS` hiện có **15 model** — trong đó `Enrollment`, `ClassSession`, `Attendance`, `ReportCard`, `ConversationMessage`, `EvaluationRound` **mới được đưa vào** (trước kia phải scope tay qua `class.centerId`). Quên set `centerId` khi create = record vô hình với actor cấp cơ sở.
3. **`include` lồng nhau KHÔNG tự scope** — extension chỉ chạy cho query **top-level**; include một model scoped khác thì phải tự thêm `where` (`lib/db-scope.ts:4-5`).
   Ngoài ra còn 3 tập ngoại lệ phải biết: `NULL_IS_GLOBAL_MODELS` (`centerId = null` ⇒ toàn hệ thống) · `SCOPE_EXEMPT` (có `centerId` nhưng cố ý không scope) · `MAKEUP_EXCEPTION_MODELS` (đọc chéo cơ sở trong luồng học bù — **không** gồm Lead/Order/Student).
4. **`SUPER_ADMIN` bypass, actor cấp HO nhận `ALL`** → test cách ly **phải chạy bằng actor cấp cơ sở**, không phải admin.
5. **Portal không dùng `scopedDb` mà dùng `portalDb`** (PARENT không có `UserOrgRole` → `visibleCenterIds = []` → mất sạch dữ liệu con). `portalDb` cũng chỉ hook READ.

→ **AC cách ly phải phủ CS1 ↔ CS2 cho cả ĐỌC lẫn GHI.**

**Cổng ESLint đã đóng:** import `@/lib/db` trần trong `app/(admin|portal|teacher)` = **error**. Allowlist còn đúng **3 file** exception hợp lệ. *(Comment "grandfather 201 file" trong `eslint.config.mjs` và dòng "~221 file" trong README go-live đều lỗi thời — đừng trích.)* Code mới **không xin thêm vào allowlist**.

---

## 4. Scope — cái gì trong, cái gì ngoài

Tự kiểm: Doc 15 §0 (đọc **cả phần gạch ngang + `[ĐẢO ...]`**) · `docs/ke-hoach-go-live-2607/README.md`

**Đã ĐẢO — nay LÀ in-scope:**
- **Site giáo viên riêng** `giaovien.satarobo.vn` — đảo **04/07/2026** (phiếu BGĐ câu 7). Đã live, flag ON từ 10/07. GV **thuần** (role nhân sự duy nhất = `TEACHER`) đăng nhập `admin.` bị đá sang `giaovien.`; GV kiêm nhiệm vẫn ở admin.
- **SCORM** — trong core theo SRS LMS v3.1 CHOT-CUOI (TGĐ 12/06, **mới hơn Doc 15**). Live prod từ 03/07. Ràng buộc: **học viên KHÔNG xem SCORM**; GV không tải được file nguồn; blur khi quay/chụp màn hình + watermark động; player có vé HMAC 10 phút. Nợ: CSP trên player + e2e blur/watermark/IDOR.

**Vẫn LOẠI (Doc 15 §0):**
- AI camera / nhận diện khuôn mặt / sinh trắc / định vị **học sinh** (geofence chỉ cho **nhân viên**).
- Web3 / NFT / IPFS / SataCoin blockchain / Learn2Earn / Marketplace / SaaS-White-label-Franchise billing.
- **Toàn bộ AI** (Tutor / CRM assistant / reporting / learning path / prediction) → thay bằng **rule-based**: `nextCourseId`, `RiskAlert`, Class Health Score.
- **"Online video LMS cho học viên tự học"** → trỏ Sataworld. *(Khác SCORM — SCORM là courseware phía GV, học viên không truy cập.)*
- Sai quyết định cũ: FB Lead Form là main flow · student login riêng · route có `studentId` · `User.centerId`.

---

## 5. Khung thực thi — truy vết yêu cầu MỚI vào đâu

Tự kiểm: `docs/ke-hoach-go-live-2607/README.md` + `KIET.md` / `LUAN.md` / `VY.md`

- **A0 → R5** (đóng 10/06), **R6**, **R7**, **FL / FL-R2** = **lịch sử kiến trúc**. Chỉ dùng để truy vết cái ĐÃ xây / regression. **Tuyệt đối không gán yêu cầu mới vào "Phase A0–R5"** (skill cũ dạy sai chỗ này).
- **Khung đang lập lịch:** sprint go-live **GĐ0 → GĐ4** (01/07 → **26/07/2026**) + ticket **K\*/H\*** (Kiệt) · **L\*/T\*** (Luân) · **V\*** (Vy) + **lane `#NN`**.
- Team còn **3 người** (Huy & Trí rời 03/07; mã `H*`/`T*` giữ lại cho MISA). Tải ~103 ngày-công / ~20 ngày làm việc → **quá tải ~2x**.
- **Không có registry lane `#NN` trong repo** (nó sống ở MISA). Đã thấy dùng: `#01 #03 #04 #05 #06 #07 #09 #10 #11 #12 #13 #15 #16 #17`. **Đừng tự đánh số lane mới — hỏi trước.**

**Chuỗi truy vết mới:**
`Nguồn quyết định (phiếu BGĐ câu N / TBD-n / SRS §)` → `Doc 15 §/OI (+ addendum ĐẢO)` → `GĐ<0–4> + ticket/lane` → `P0/P1/P2` → `suite test + case ID` → `PR`

**Hệ ưu tiên khác nhau theo artefact:** go-live dùng **P0/P1/P2** + *TRONG/NGOÀI MVP 26/07 (cuốn chiếu sau)*; gap-analysis nhiều epic vẫn dùng **Must/Should** + cột **Phức tạp** (Thấp/TB/Cao/Rất cao). MoSCoW **không** dùng trong kế hoạch go-live.

---

## 6. Test — AC gắn vào đâu

Tự kiểm: `package.json` (script `test:*`) · `playwright.*.config.ts` · `tests/e2e/` · `.github/workflows/`

- **T1–T12 không phải cách map test.** Nó chỉ là cột "Nhóm" trong bảng test-plan của ticket — giữ lại như **checklist độ phủ** khi thiết kế case, không phải địa chỉ để gắn AC.
- Test tổ chức theo **suite**: 14 playwright config → `tests/e2e/<suite>` → chạy bằng `pnpm test:e2e:<suite>`.
- **Vitest** chỉ chạy `lib/**` + `components/**` co-located, **không có DB** trong CI.
- **CI chỉ gate:** `quality` · `unit-tests` · `e2e` (smoke) · `e2e-a0` · `e2e-r7` · `e2e-fl` · `e2e-teacher`.
  **KHÔNG có job CI cho:** `r1`–`r6`, `crm`, manual → AC gắn vào các suite này phải **ghi rõ "chạy tay, không có CI gate"**.
- **Case ID:** `[<ticket>-C<n>]`, `describe` mang ticket ID. (Suite a0/r6 nhúng T-group vào ID theo lịch sử — suite mới thì không.)

**Chọn tầng test cho AC:**
- Logic thuần, không DB → **Vitest**, `lib/<domain>/*.test.ts` co-located.
- Chạm DB / `scopedDb` / RBAC / ownership / IDOR → **Playwright service-level**, `tests/e2e/<suite>`.
- Chạm UI → **Playwright browser**.

**Guard CI mà AC về quyền phải sống chung:** `rbac-parity` · `rbac-scope` · `page-gates` · `menu-permissions` · `action-registry` · `db-restriction` · `db-allowlist-freshness`.

---

## 7. API contract & event — mục tiêu vs hiện thực

Tự kiểm: `lib/actions/factory.ts` · `lib/events/` · `prisma/schema.prisma` (model `DomainEvent`)

- **`{ok, data, meta}` + `error.requestId` là MỤC TIÊU (Doc 15 §13.5), chưa phải hiện trạng.** API route thật vẫn trả JSON trần. Nền có sẵn: `lib/actions/factory.ts` — `ActionResult<T>` + `ActionError` + pipeline `auth → resolveActor → zod → can → scopedDb → writeAudit`, nhưng **thiếu `requestId`/`meta`** và mới có ~2 call-site thật.
  → Viết AC theo contract này = **tạo việc mới, phải ước lượng**, không phải conformance miễn phí.
- **`modules/` KHÔNG TỒN TẠI.** Cấm viết AC tham chiếu `modules/integration`.
- **Hạ tầng event có thật:** model `DomainEvent` (`dedupeKey @unique`) + `lib/events/{publish,dispatcher,registry,handlers}`; `publishEvent(type, payload, { tx, dedupeKey })` ghi **cùng transaction**.
- **Quy tắc atomic vs event (Doc 15 §4.5) còn nguyên:** tiền / invoice / enrollment / kho → **transaction**; thông báo / stats / sync ngoài → **DomainEvent**, handler idempotent.

---

## 8. Nguồn bẫy — file trong repo mà BA hay trích nhầm

Trích những chỗ này để "chứng minh" điều gì đó = **sai**:

| File | Bẫy |
|---|---|
| `docs/ke-hoach-go-live-2607/bien-ban-chot-tbd-k7.md` | ghi "⬜ CHỜ CHỐT", ô quyết định trống — nhưng bản `.docx` **đã chốt 03/07**. Đây là template rỗng. |
| `docs/ke-hoach-go-live-2607/README.md` §7 | còn liệt "teacher domain riêng" là **đã loại** — mâu thuẫn với chính mục #9 của nó. |
| `Document/0-yeucau/2-ba-phan-tich/00-tieu-chuan-...md` §8 | bảng loại-trừ cũ + chuỗi "Phase A0–R5". |
| `Document/0-yeucau/3-ke-hoach-trien-khai/phases/README.md` | ảnh chụp 12/06, không index FL / FL-R2. |
| `Document/0-yeucau/4-inputnew/satarobo-final-project-blueprint-v1.md` | còn liệt `HO_MANAGER` là role — **role này không tồn tại**. |
| `eslint.config.mjs` (comment) | "grandfather: 201 file" — thực tế allowlist còn **3**. |
| `docs/ke-hoach-go-live-2607/spec-13-...md` | "flag `TEACHER_SITE_ENABLED` đang OFF" — ảnh chụp 09/07, lỗi thời đúng 1 ngày. |
| `CLAUDE.md` | "8 roles" (thật ra **9**) và "TEACHER_SITE_ENABLED default OFF; host giaovien chưa wire" (**đã ON + đã wire**). |

**Quy tắc rút ra:** mọi bảng loại-trừ / trạng thái ghi ngày **≤ 05/06/2026** là tồn dư — phải đối chiếu quyết định mới hơn trước khi dùng để bác một yêu cầu.

---

## 9. Quyết định đã ký nằm NGOÀI repo

- **9 phiếu khảo sát ký 04–06/07** không có dưới dạng file trong repo. Chúng chỉ được **trích lại gián tiếp** trong `Document/0-yeucau/3-ke-hoach-trien-khai/phases/rolepermission-mapping-proposal.md` (bảng 9 phiếu) và trong `spec-11` / `de-xuat-*`.
- **Biên bản TBD-K7** chỉ tồn tại ở bản `.docx` (untracked).

→ Cần trích "câu N phiếu \<bộ phận\>": đọc `rolepermission-mapping-proposal.md` để biết phiếu nào tồn tại, rồi **xin bản gốc từ PM/tech-lead**.
**KHÔNG tự suy nội dung phiếu. KHÔNG kết luận "chưa chốt" chỉ vì không thấy file.**

**Đã chốt (biên bản 03/07, TGĐ Hồ Đắc Phúc):** không hoàn tiền — chỉ hoàn 100% nếu HV không học tiếp sau buổi đầu, clawback hoa hồng tự sinh dòng âm · migrate: chỉ Kiệt chạy, sau 21h, backup 24h giữ 7 ngày, khôi phục 4–8h · SCORM chọn mức (b) = có CSP trên player.

**Còn treo thật (ô trống trong biên bản) — phải hỏi, đừng bịa công thức:** phí hành chính khấu trừ · thời hiệu được hoàn + chênh lệch khi chuyển lớp khác mức phí.
