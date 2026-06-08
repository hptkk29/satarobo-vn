# Ticket A0-00 — Test infrastructure & CI gate

| | |
|---|---|
| **PR** | PR-A0-00 | **Ưu tiên** | P0 (chặn mọi task có test) | **Ước lượng** | 2 ngày |
| **Phụ thuộc** | — | **Trạng thái** | 🟡 IN PROGRESS — harness DONE (2026-06-08) |

> ⚙️ **Tiến độ (2026-06-08):**
> - ✅ **DONE (typecheck 0, lint 0, `playwright --list` 6 spec ✓):** hạ tầng harness — `docker-compose.test.yml` (Postgres 16 local), `.env.test` (gitignored), `tests/e2e/_helpers/{fixtures,seed,auth}.ts`, `tests/e2e/a0/{global-setup,_setup.spec}.ts`, `playwright.a0.config.ts` (load `.env.test`, webServer dùng DB test), scripts `test:e2e:a0`/`test:phase`/`db:test:up`/`db:test:down`, CI job `e2e-a0` (Postgres service). `playwright.config.ts` (smoke) `testIgnore: **/a0/**`.
> - ✅ **Helper chạy được ngay:** `resetDb()` (TRUNCATE CASCADE + `assertTestDb()` chặn non-localhost — fail-safe chống prod), `seedUser()` (multi-role theo model User hiện có), `loginAs()`/`login()` (đăng nhập THẬT qua form `/login`).
> - ⏳ **CHỜ ENV CÓ DOCKER (chưa chạy được tại đây — không có Docker/Postgres):** thực thi `pnpm db:test:up && pnpm test:e2e:a0` để PASS AC1–AC4. Code đã sẵn, chỉ cần máy/CI có Postgres.
> - ⏳ **CHỜ MODEL DB:** `seedOrg()` (A0-01 `OrgUnit`) + `seedRoles()` (A0-02 `RoleDef`) hiện ném lỗi PENDING rõ ràng; spec tương ứng để `test.fixme` (C0.5/C0.6). API đã ổn định để A0-01/02 fill body. Con số "11 role" (AC2) chốt ở A0-02 theo Doc 15 §2.

---

## 1. Mục tiêu
Dựng hạ tầng test để mọi ticket A0 viết Playwright/Vitest được ngay + CI gate theo phase. Không có cái này thì các ticket sau không "đóng" được.

## 2. Phạm vi
**In:** helpers test (auth/seed/fixtures); scripts `test:e2e:a0`, `test:phase`; CI job `e2e-a0` (Postgres service + migrate + seed + playwright); cấu trúc `tests/e2e/a0/`.
**Out:** test nghiệp vụ (thuộc từng ticket).

## 3. Thiết kế kỹ thuật
- `tests/e2e/_helpers/seed.ts`: `resetDb()`, `seedOrg(codes)`, `seedRoles()`, `seedUser({email,roles:[{role,orgUnit}]})`.
- `tests/e2e/_helpers/auth.ts`: `loginAs(page,{role,orgUnit})` — tạo session test (qua API auth test-only hoặc storageState).
- `playwright.config`: project `a0` trỏ `tests/e2e/a0`, baseURL, retries CI.
- `package.json`: scripts mục 5.3 của file quy trình.
- CI `.github/workflows/ci.yml`: job `e2e-a0` (chỉ chạy file a0) → mở rộng dần.

## 4. Acceptance Criteria
- **AC1** `loginAs` tạo được session role/orgUnit, vào trang admin.
- **AC2** `resetDb()+seedOrg(["HO","CS1","CS2"])` → đúng 4 OrgUnit; `seedRoles()` → 11 role.
- **AC3** `pnpm test:e2e:a0` chạy (kể cả 0 test) + CI job xanh.
- **AC4** `seedUser` gán được multi-role/multi-org cho 1 user.

## 5. Files
```
tests/e2e/_helpers/{auth,seed,fixtures}.ts
playwright.config.ts (project a0)
package.json (scripts)
.github/workflows/ci.yml (job e2e-a0)
tests/e2e/a0/_setup.spec.ts (smoke helpers)
```

## 6. Edge cases
- DB test bẩn giữa các test → `resetDb` trong beforeEach hoặc transaction rollback.
- Song song nhiều worker → mỗi worker DB/schema riêng hoặc serial cho test đụng seed chung.

## 7. Test plan
| Case | B/E | | Mong đợi |
| A0-00-C0.1 | B | loginAs + vào admin | OK (AC1) |
| A0-00-C0.2 | B | resetDb+seedOrg | 4 OrgUnit (AC2) |
| A0-00-C0.3 | E | seedUser multi-role | đọc lại đủ role (AC4) |
| A0-00-C0.4 | E | test isolation giữa 2 spec | không rò dữ liệu |

## 8. DoD
```
[ ] AC1–AC4 PASS · CI job e2e-a0 xanh · helpers tái dùng được cho mọi ticket
```
