# Ticket A0-05 — Common login `satarobo.vn/login` + redirect

| | |
|---|---|
| **PR** | PR-A0-05 | **Ưu tiên** | P0 | **Ước lượng** | 3 ngày |
| **Phụ thuộc** | A0-03 | **Feature flag** | `common_login_enabled` | **Trạng thái** | TODO |
| **Nguồn** | Doc 15 §3.1, Q9 | | | |

---

## 1. Mục tiêu & bối cảnh
Hợp nhất login về 1 cổng `satarobo.vn/login`, tự nhận diện role → điều hướng đúng host (staff→admin, parent→portal). Hiện login giữ theo host → cần sửa `decideRoute()` + `route-policy.test.ts`.

## 2. Phạm vi
**In:** cổng login chung; logic redirect theo role sau đăng nhập; gate anonymous vào admin/portal → `/login?callbackUrl=`; sanitize callbackUrl; cập nhật `route-policy`.
**Out:** giao diện portal (R4); OTP activation (R2-04).

## 3. Thiết kế kỹ thuật
- `app/(auth)/login` phục vụ trên cả 3 host (qua middleware) hoặc canonical về `satarobo.vn/login`.
- Sau `signIn` thành công → resolve Actor (A0-03) → `hasStaffRole` ? redirect `admin.satarobo.vn` : (PARENT) `hocvien.satarobo.vn`.
- `decideRoute(host, path, actor)`:
  - anonymous + path admin/portal → redirect `/login?callbackUrl=<sanitized>`.
  - staff @ portal host → redirect admin; parent @ admin host → redirect portal.
- `sanitizeCallbackUrl`: chỉ path nội bộ bắt đầu `/`, chặn `//`, `http(s)://`, `\`.

## 4. Acceptance Criteria
- **AC1** Staff login → tới admin.
- **AC2** Parent login → tới portal.
- **AC3** Anonymous mở trang admin → redirect `/login`, giữ callbackUrl; login xong quay lại đúng trang.
- **AC4** Parent cố vào admin → redirect portal (không lọt).
- **AC5** Staff cố vào portal host → redirect admin.
- **AC6** `sanitizeCallbackUrl` chặn open-redirect.
- **AC7** Sai mật khẩu → ở lại form, thông báo lỗi tiếng Việt, không lộ "email tồn tại hay không".

## 5. Files dự kiến
```
app/(auth)/login/page.tsx + login-form.tsx
lib/auth/route-policy.ts (decideRoute, sanitizeCallbackUrl)
lib/auth/route-policy.test.ts
tests/e2e/a0/login-redirect.spec.ts
```

## 6. Edge cases
- callbackUrl = `//evil.com`, `https://x`, `/admin/..%2f`, rỗng → fallback `/`.
- User đa vai (staff + parent) → ưu tiên staff (vào admin).
- Session hết hạn giữa chừng → redirect login giữ callbackUrl.
- tokenVersion/sessionVersion lệch → buộc login lại.

## 7. Rollback / flag
`common_login_enabled=false` → giữ login theo host (hành vi cũ).

## 8. Test plan
### T1 — Functional
| Case | B/E | | Mong đợi |
| A0-05-T1-01 | B | staff login | tới admin (AC1) |
| A0-05-T1-02 | B | parent login | tới portal (AC2) |
| A0-05-T1-03 | B | anonymous→admin→login→back | quay lại trang gốc (AC3) |
### T4 — Cross-host gate
| A0-05-T4-01 | B | parent vào admin | redirect portal (AC4) |
| A0-05-T4-02 | B | staff vào portal | redirect admin (AC5) |
| A0-05-T4-03 | E | đa vai (staff+parent) | vào admin |
### T2/T10 — Validation / Security
| A0-05-T2-01 | B | sai mật khẩu | lỗi tiếng Việt, ở lại form (AC7) |
| A0-05-T2-02 | E | email không tồn tại | cùng thông báo chung (không lộ) |
| A0-05-T10-01 | B | callbackUrl `//evil.com` | fallback `/` (AC6) |
| A0-05-T10-02 | E | callbackUrl `http://x` | fallback `/` |
| A0-05-T10-03 | E | callbackUrl encode trick `%2f..` | an toàn |
### T8/T12
| A0-05-T8-01 | E | session hết hạn → mở admin | redirect login giữ callback |
| A0-05-T12-01 | B | route-policy.test cũ vẫn xanh sau sửa | true |

## 9. Test data
users: staff(@satarobo.vn), parent(phone), multiRole.

## 10. RTM
AC1→T1-01 · AC2→T1-02 · AC3→T1-03 · AC4→T4-01 · AC5→T4-02 · AC6→T10-01 · AC7→T2-01.

## 11. DoD
```
[ ] AC1–AC7 case (B) PASS · route-policy.test mở rộng xanh
[ ] T10 open-redirect PASS · typecheck+lint+build PASS · board+RTM cập nhật
```
