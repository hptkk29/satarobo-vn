# Doc 12 — Test Plan

> **Ai đọc:** QA, Dev.
> 🔄 **ĐỒNG BỘ DOC 15 (2026-06-06):** thêm **mục 10 — bộ test bắt buộc cho A0** (OrgUnit/RBAC/scope) theo Doc 15 §10/§14. Khi xung đột, Doc 15 thắng.
> **Cập nhật:** 2026-06-06 · Sinh từ quét `tests/`, `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`.

---

## 1. Loại test & tool

| Loại | Tool | Phạm vi | Lệnh |
|---|---|---|---|
| Unit | **Vitest 4** + jsdom + Testing Library | Business logic thuần trong `lib/` | `pnpm test:unit` (watch: `test:unit:watch`) |
| E2E | **Playwright 1.60** | Smoke public site + auth gate + API | `pnpm test:e2e` (UI: `test:e2e:ui`, smoke: `test:e2e:smoke`) |
| Static | tsc + ESLint 10 | Type + lint (kể cả rule cross-import UI lib) | `pnpm typecheck && pnpm lint` |
| Build | next build | RSC/route hợp lệ, env wiring | `pnpm build` |
| All | | unit → e2e | `pnpm test` |

**Định nghĩa PASS (bắt buộc trước khi báo hoàn thành — CLAUDE.md quy ước 9):**
`pnpm typecheck && pnpm lint && pnpm build` PASS + smoke test localhost + mobile viewport 375px cho UI changes.

## 2. Unit tests hiện có (13 file — đều là business logic rủi ro cao)

| File | Test gì |
|---|---|
| `lib/auth/route-policy.test.ts` | decideRoute: 15+ case PARENT/staff/anon × host × path, callbackUrl sanitize |
| `lib/classes/schedule.test.ts` | Sinh buổi học theo lịch + né Holiday |
| `lib/attendance/adjust.test.ts` | Điều chỉnh điểm danh |
| `lib/attendance/shift-excel.test.ts` | Parse/export Excel ca làm |
| `lib/lead/assign-strategy.test.ts` | Round-robin / close-rate assign |
| `lib/lead/import.test.ts` | Validate/transform import lead |
| `lib/students/absence.test.ts` | Tính vắng (liên tiếp, tỉ lệ) |
| `lib/students/progress.test.ts` | Tiến độ học |
| `lib/students/renewal.test.ts` | Điều kiện nhắc gia hạn |
| `lib/survey/nps.test.ts` | Tính điểm NPS |
| `lib/shifts.test.ts`, `lib/work-schedule.test.ts` | Ca làm việc, lịch làm việc |
| `lib/cookie-consent.test.ts` | Consent state |

Config: `vitest.config.ts` — globals true, setup `tests/setup.ts` (mock storage), include `lib/**/*.test.*` + `components/**/*.test.*`, coverage reporters text/json/html.

## 3. E2E tests (Playwright)

Config: `tests/e2e/`, timeout 30s/test, retries 2 (CI), browsers **Chromium desktop + Pixel 5 mobile**, locale `vi-VN`, TZ `Asia/Ho_Chi_Minh`, screenshot/video retain-on-failure, trace on-first-retry.

`smoke.spec.ts` cover:
- Public pages render: `/`, `/khoa-hoc`, `/vinh-danh`, `/tin-tuc`, `/lien-he`, `/quyen-rieng-tu`.
- Auth gate: `/admin/*` → redirect `/login`.
- Cookie consent: banner delay 800ms + accept.
- API health: POST `/api/leads` rate limit (7 request → expect 429).

## 4. CI pipeline (GitHub Actions — chạy mỗi push/PR vào main/develop)

```
quality:    Postgres 16 → install → prisma generate + migrate deploy → typecheck → lint → build
unit-tests: (needs quality) vitest --run
e2e:        (needs quality, PR+main only) migrate + db:seed → playwright (chromium) → build + start
            → test → upload report artifact 7 ngày khi fail
```

## 5. Coverage target & chiến lược viết test mới

| Tầng | Target | Quy tắc |
|---|---|---|
| `lib/` business logic (assign, schedule, absence, renewal, voucher, coin, permissions) | **> 80%** — mọi rule mới trong Doc 9 phải có unit test | Pure function, không mock Prisma nếu tách được logic |
| Route policy / permissions | 100% nhánh (bảo mật) | Thêm case test khi thêm role/host/action |
| Server Actions | Test qua logic tách trong `lib/` + e2e | Không unit-test trực tiếp action (cần session) |
| UI components | Testing Library cho component có logic (form validate) | Không test snapshot thuần |
| E2E | Smoke mọi route nhóm chính + flow vàng | Thêm spec khi thêm flow tiền/quyền |

## 6. QA checklist trước deploy (production)

1. ☐ CI 3 job xanh trên commit deploy.
2. ☐ `pnpm typecheck && pnpm lint && pnpm build` local PASS.
3. ☐ Migration mới đã `migrate deploy` được trên DB CI (tự động) — không edit migration cũ.
4. ☐ Smoke thủ công: login 3 host (public/admin/portal), 1 mutation chính của feature mới, mobile 375px.
5. ☐ Form lead hoạt động + nhận notification.
6. ☐ Không secret mới trong diff (hook đã chặn nhưng vẫn review).
7. ☐ Nếu đổi schema: dev server prod build dùng Prisma Client mới (build lại), seed cần thiết đã chạy.
8. ☐ Nếu đổi route-policy/permissions: unit test mới cover + thử bằng tài khoản role thật.
9. ☐ Sentry không có error mới sau deploy 15 phút.

## 7. Test data

- Seed CI: `pnpm db:seed` (idempotent) — user mỗi role, centers, classes, students.
- Dữ liệu test thủ công trên môi trường thật: prefix `ZZTEST_` → dọn bằng `scripts/cleanup-zztest.ts --apply` (mặc định DRY-RUN).
- Không bao giờ test bằng dữ liệu phụ huynh/học viên thật ngoài prod.

## 8. Load test (chưa triển khai — kế hoạch)

| Hạng mục | Kế hoạch |
|---|---|
| Tool | k6 (script trong `tests/load/` — chưa có) |
| Kịch bản 1 | 1000 concurrent đọc public pages (ISR phải hấp thụ — kỳ vọng p95 < 500ms từ cache) |
| Kịch bản 2 | 100 req/s POST `/api/leads` (kỳ vọng 429 đúng, không 5xx, DB không quá tải) |
| Kịch bản 3 | 50 staff đồng thời thao tác admin (liveness query + Prisma pool 6543 chịu tải) |
| Ngưỡng go/no-go | error rate < 1%, p95 admin < 2s |

## 9. Gaps & việc cần làm tiếp

1. E2E cho portal (login PARENT, làm bài thi, gửi yêu cầu) — hiện smoke chỉ cover public + auth gate.
2. E2E cho flow tiền (order → confirm → enrollment) — flow rủi ro cao nhất chưa có automation.
3. Coverage report chưa gate CI (có reporter nhưng không threshold) — thêm `coverage.thresholds` cho `lib/`.
4. Load test chưa có (mục 8).
5. Husky pre-commit chưa wiring (đã cài dep) — cân nhắc lint-staged để bắt lỗi sớm.

## 10. 🔄 Bộ test BẮT BUỘC cho A0 (đồng bộ Doc 15 §10 DoD + §14 test pyramid)

### 10.1 OrgUnit & tổ chức

- ☐ Seed tạo đúng **ROOT/HO/CS1/CS2** (HO/CS1/CS2 ngang hàng dưới ROOT).
- ☐ **HO và CS2 cùng address nhưng là 2 OrgUnit khác nhau** (khác id/code/type).
- ☐ **Không có logic nào suy ra quan hệ quản lý từ address** (test: đổi address HO không ảnh hưởng scope/quyền).
- ☐ Validate unique code + chặn parent cycle + soft delete.
- ☐ **Thêm CS3 mới → không cần đổi core permission logic** (chỉ thêm data).

### 10.2 Quản lý nhân sự HO × Center (OI-6)

- ☐ HO staff **chỉ ngồi tại địa điểm CS2, không có assignment/role CS2** → Center Manager CS2 **không** quản lý.
- ☐ HO staff **có EmployeeOrgAssignment tại CS2** → Center Manager CS2 quản lý **phần assignment CS2** (không quản lý vai trò HO).
- ☐ HO staff có **UserOrgRole tại CS1/CS2** → có quyền đúng theo role đó tại center đó.
- ☐ `EmployeeOrgAssignment` đơn thuần (không UserOrgRole) → **không sinh quyền hệ thống**.
- ☐ `effectiveTo` quá hạn → role/assignment hết hiệu lực tự động.

### 10.3 Permission & scope

- ☐ User nhiều role: **một role ALLOW đúng scope → được phép** (không DENY override).
- ☐ `HO_ACCOUNTANT` xem/sửa finance **toàn hệ thống** (CS1 + CS2).
- ☐ `HO_HR` xem/sửa HR toàn hệ thống.
- ☐ `HO_MARKETING`: thấy marketing toàn hệ thống; **PII chỉ khi được cấp permission** (mặc định mask).
- ☐ `HO_SALE`: thấy lead scope **A&B** (mình tạo/giao + kênh HO/ads/Messenger); **không sửa được** lead đã thuộc cơ sở.
- ☐ **CS1 không xem CS2 · CS2 không xem CS1** (scopedDb — cả query list lẫn get-by-id).
- ☐ Đổi role/permission → hiệu lực request kế tiếp; mọi thay đổi có AuditLog + reason.

### 10.4 Vận hành (theo OI-13/14/15/21)

- ☐ Idempotency: webhook cùng `externalEventId` → không tạo trùng; confirm payment gọi 2 lần → 1 kết quả.
- ☐ Export: file thường hết hạn 7 ngày, file nhạy cảm 3 ngày; export nhạy cảm có watermark/metadata + được audit lại.
- ☐ Session: staff hết hạn 24h; parent 30 ngày + thao tác nhạy cảm yêu cầu OTP/xác thực lại.

> Bộ test này map 1-1 với DoD A0 (Doc 15 §10) — CI phải xanh toàn bộ trước khi đóng A0.
