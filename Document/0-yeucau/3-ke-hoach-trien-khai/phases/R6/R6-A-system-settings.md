# R6-A — Cấu hình hệ thống 2 tầng (SystemSetting + CenterSetting)

| | |
|---|---|
| **ID** | R6-A |
| **PR** | r6/a-system-settings |
| **Ưu tiên** | Must (đợt 1 — nền mọi epic) |
| **Phụ thuộc** | A0-01 (OrgUnit), A0-06 (AuditLog) |
| **Trạng thái** | ✅ DONE (14 Vitest + 9 Playwright PASS · typecheck/lint PASS) |
| **Feature flag** | không (additive; DB trống → default trong code) |

## 1. Mục tiêu & bối cảnh
Giải V1.1/V1.4/V1.5 (BA #04): tham số vận hành hardcode → mở CS/đổi ngưỡng phải sửa code. Đưa về `SystemSetting` (GLOBAL) + `CenterSetting` (override theo OrgUnit), đọc qua 1 service, đổi không cần deploy.

## 2. Phạm vi
- **In:** 2 model + migration additive · registry key (schema Zod + default) · service resolve (Center→Global→default) + cache TTL 60s · guard quyền · audit · UI admin `/cau-hinh-van-hanh`.
- **Out:** wiring tất cả 219 call-site (làm dần theo epic khi chạm); hằng số kỹ thuật KHÔNG đưa vào setting (AC4 US-R6A-2).

## 3. Thiết kế kỹ thuật
- `model SystemSetting { key @id, valueJson, updatedBy*, timestamps }`.
- `model CenterSetting { @@id([orgUnitId,key]), valueJson, ... }`.
- `lib/settings/registry.ts` — `SETTINGS` map key→{schema,default,centerOverridable,label,group}. 11 key (BA AC3): student.nearEndThreshold, risk.careTaskDueDays, class.min/maxStudents.default, shift.toleranceMinutes/emergencyMonthlyLimit/proposalWindow, contact.hotlines/emails, finance.debtReminderDaysBefore, enrollment.suspendMaxMonths.
- `lib/settings/resolve.ts` — `resolveSettingValue()` thuần; DB value hỏng schema → fallback tầng dưới.
- `lib/settings/service.ts` — `getSetting(key,{orgUnitId})`, `setGlobalSetting` (SUPER_ADMIN), `setCenterSetting` (CENTER_MANAGER cơ sở/SUPER, chỉ key centerOverridable). Mutation: validate + reason bắt buộc + `writeAudit` + `clearSettingsCache`.
- UI: `app/(admin)/admin/cau-hinh-van-hanh/` (page + actions + client editor JSON + reason).

## 4. Acceptance Criteria
- AC1 (US-R6A-1): GLOBAL chỉ SUPER_ADMIN sửa; CENTER_MANAGER xem. ✅
- AC2: override CS1 → CS1 nhận, CS2 vẫn GLOBAL/default (isolation). ✅
- AC3: mỗi sửa ghi AuditLog (actor/key/old→new/reason bắt buộc). ✅
- AC4: sai kiểu/khoảng / key không schema → từ chối, lỗi rõ field. ✅
- AC2 (US-R6A-2): DB trống → default trong code (không lỗi runtime). ✅

## 5. Files
- `prisma/schema.prisma` (+2 model), migration `20260613..._r6a_system_settings`.
- `lib/settings/{registry,resolve,service}.ts` + `registry.test.ts`.
- `app/(admin)/admin/cau-hinh-van-hanh/{page.tsx,actions.ts,_components/settings-editor.tsx}`.
- `components/admin/sidebar.tsx` (+nav item).
- `tests/e2e/r6/system-settings.spec.ts` · `playwright.r6.config.ts` · `package.json` (script).

## 6. Edge cases
- center row hỏng schema → fallback global; global hỏng → default (T8).
- key không centerOverridable mà set center → VALIDATION.
- reason rỗng/space → từ chối.

## 7. Rollback
DB trống = hành vi cũ (default = hằng số hiện hành). Xoá row → quay về default. Không drop cột cũ.

## 8. Test plan (đã viết)
| Case | Nhóm | B/E | Tool |
|---|---|---|---|
| R6-A-T2-01..04, T3-01/02 | validation/boundary | B | Vitest |
| R6-A-T1-01..05, T8-01/02, T12-01 | resolve/default | B | Vitest |
| R6-A-T9-01 audit | audit | B | Playwright |
| R6-A-T4-01 RBAC GLOBAL | rbac | B | Playwright |
| R6-A-T5-01/02 isolation cơ sở | isolation | B | Playwright |
| R6-A-T2-01/02/03 reject | validation | B | Playwright |
| R6-A-T1-06/07 resolve | functional | B | Playwright |

## 9. Test data
seedOrg(HO/CS1/CS2) + seedRoles + seedUser + assignUserOrgRole (CENTER_MANAGER@CS1, SUPER_ADMIN@HO).

## 10. RTM
AC1→T4-01 · AC2→T5-01/02,T1-07 · AC3→T9-01,T2-01 · AC4→T2-02/03,registry T2/T3 · US-R6A-2 AC2→T1-06,resolve T8.

## 11. DoD
- [x] Code đúng spec · scopedDb không bắt buộc (settings không có centerId model riêng, isolation enforce qua guard + orgUnitId) · audit đủ
- [x] Test bắt buộc có + xanh (14 Vitest + 9 Playwright)
- [x] typecheck PASS · lint PASS · build (đang xác nhận)
- [x] Migration additive tên rõ · không secret
- [x] Cập nhật bảng phase R6
