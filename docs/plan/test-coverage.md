# BẢN ĐỒ TEST COVERAGE — toàn đợt (A · F · G · C/D/B · E)

**Nguồn luật:** `docs/specs/spec-dashboard-qlcs-duyet-media-lead.md` · `docs/prd/A-nen-tang.md` · `docs/prd/F-media.md` · `docs/backlog/F-media-stories.md` · `docs/prd/G-lead.md` · `docs/migration/G-lead-migration-plan.md` · `docs/prd/CDB-dashboard.md` · `docs/prd/D01-premortem.md` · `docs/prd/E-tuong-tac.md` · `docs/plan/security-media.md` · `documentation/*.md`
**Nguồn hiện trạng test:** đọc trực tiếp `tests/`, `*.test.ts` cạnh mã nguồn, `vitest.config.ts`, `playwright*.config.ts`, `package.json`, `.github/workflows/ci.yml` trên nhánh `hptkk29/runhop20_08`.

> 🔴 **Luật đọc bản đồ này.** `existing` **KHÁC** `proposed`. Một luật **chưa được phủ** cho tới khi có một test **thật, đang chạy trong repo hôm nay, assert đúng điều đó**. Test viết trong tài liệu này chưa tồn tại; đừng đếm nó vào độ phủ, và đừng báo PASS dựa trên nó.
>
> Một sắc thái thứ hai, nặng ngang: test **tồn tại** mà **không job CI nào chạy** thì cũng không phải hàng rào. Mục §1.4 liệt kê 170 case đang ở tình trạng đó.

---

## 0. Quy ước

| Cột | Giá trị | Nghĩa |
|---|---|---|
| **Loại** | `unit` | Hàm thuần, không DB, không mạng. Chạy trong `pnpm test:unit`. |
| | `integration` | Chạm Postgres **local** (Docker/scoop), tất định, không dịch vụ ngoài. Bộ `tests/chat` · `tests/nen` · `tests/lead-intake` (Vitest) và `tests/e2e/<phase>` (Playwright service-level). |
| | `guarded live` | Cần dịch vụ thật (Supabase Realtime, R2, Meta API, ZNS, prod cron). **Không** chặn merge. |
| | `manual` | Người thao tác, không tự động hoá được (nghiệm thu mắt, kiểm nhầm-lẫn giao diện, chữ ký duyệt). |
| **Trạng thái** | `existing` | Có test **THẬT** trong repo assert đúng điều đó, kèm `file:dòng`. |
| | `proposed` | Chưa tồn tại. Đặc tả ở §4. |
| | `none` | Không có, **và** không đề xuất tự động hoá được ở tầng này (lý do ghi tại chỗ). |

Mọi khẳng định hiện trạng dưới đây kèm `file:dòng`.

---

# BƯỚC 1 — KIỂM KÊ TEST ĐANG CÓ THẬT TRONG REPO

## 1.1 Con số

Đếm bằng `find` + `grep` trên nhánh khảo sát.

| Vị trí | Số **file** test | Số **case** (`it(` / `test(`) | Bộ chạy |
|---|---|---|---|
| Cạnh mã nguồn — `lib/**`, `components/**`, `app/**` | **247** | **3.014** | Vitest (`pnpm test:unit`) |
| `tests/chat/` | 6 | 94 | Vitest + Postgres local |
| `tests/nen/` | 2 | 13 | Vitest + Postgres local |
| `tests/lead-intake/` | 2 | 22 | Vitest + Postgres local |
| `tests/elearning/` | 3 | 23 | Vitest (node env, **không** chạm DB) |
| `tests/e2e/**` | **121** | **704** | Playwright (13 config) |
| `tests/acceptance/` | 12 | 13 | Playwright — **môi trường đã triển khai** |
| `tests/manual/` | 15 | 25 | Playwright — dev server cục bộ |
| **Tổng** | **408 file** | **~3.908 case** | |

Phân bố `tests/e2e/**` theo suite:

| Suite | Case | Config | Chạy trong CI? |
|---|---|---|---|
| `a0/` | 148 | `playwright.a0.config.ts` | ✅ job `e2e-a0` (`.github/workflows/ci.yml:398`) |
| `r7/` | 342 | `playwright.r7.config.ts` | ✅ job `e2e-r7` (`ci.yml:466`) |
| `fl/` | 64 | `playwright.fl.config.ts` | ✅ job `e2e-fl` (`ci.yml:559`) |
| `r6/` | 57 | `playwright.r6.config.ts` | ❌ **KHÔNG** |
| `r1/` | 35 | `playwright.r1.config.ts` | ❌ **KHÔNG** |
| `r2/` | 12 | `playwright.r2.config.ts` | ❌ **KHÔNG** |
| `r3/` | 12 | `playwright.r3.config.ts` | ❌ **KHÔNG** |
| `r4/` | 8 | `playwright.r4.config.ts` | ❌ **KHÔNG** |
| `crm/` | 7 | `playwright.crm.config.ts` | ❌ **KHÔNG** |
| `r5/` | 1 | `playwright.r5.config.ts` | ❌ **KHÔNG** |
| `smoke.spec.ts` (top-level) | 11 | `playwright.config.ts` | ✅ job `e2e` (`ci.yml:291`) |
| `smoke-lms/` | 2 | `playwright.config.ts` | ✅ cùng job |
| `elearning/` | 3 | `playwright.elearning.config.ts` | ✅ job `e2e-elearning` (`ci.yml:755`) |
| `teacher/` | 2 | `playwright.teacher.config.ts` | ✅ job `e2e-teacher` (`ci.yml:657`) |

## 1.2 Cấu hình chạy test

### Vitest — `vitest.config.ts`

`include` là **bộ lọc CỨNG** (chú thích tự khai ở `vitest.config.ts:19-21`: *"đường dẫn truyền ở dòng lệnh chỉ lọc TIẾP trong tập này chứ không mở rộng nó"*). Bảy mẫu:

| Dòng | Mẫu |
|---|---|
| `vitest.config.ts:14` | `lib/**/*.test.{ts,tsx}` |
| `:15` | `components/**/*.test.{ts,tsx}` |
| `:16` | `app/**/*.test.{ts,tsx}` |
| `:18` | `tests/chat/**/*.{test,spec}.ts` |
| `:22` | `tests/nen/**/*.{test,spec}.ts` |
| `:25` | `tests/lead-intake/**/*.{test,spec}.ts` |
| `:29` | `tests/elearning/**/*.{test,spec}.ts` |

Môi trường mặc định `jsdom` (`vitest.config.ts:9`), setup `tests/setup.ts` (`:10`), alias `@` + stub `server-only` (`:38-40`).

🔴 **Đường KHÔNG có trong `include`, tức KHÔNG BAO GIỜ chạy bằng Vitest:**

| Đường | Tình trạng |
|---|---|
| `tests/e2e/**` | Cố ý — Playwright lo. |
| `tests/acceptance/**`, `tests/manual/**` | Cố ý — Playwright lo, và không nằm trong CI (§1.4). |
| **`tests/cron/**`** | **Thư mục KHÔNG TỒN TẠI.** Không có test nào cho cron ở bất kỳ tầng nào — xem §1.4 mục (c). |

### Playwright

- Base `playwright.config.ts` chỉ chạy smoke: `testDir: ./tests/e2e`, `testIgnore` loại `**/a0/**`, `**/r[0-9]*/**`, `**/fl/**`, `**/crm/**`, `**/teacher/**`, `**/elearning/**` (`playwright.config.ts:31-38`).
- Mỗi phase một config riêng, đều `dotenv.config({ path: ".env.test" })` + `globalSetup: ./tests/e2e/a0/global-setup.ts` + `workers: 1` (mẫu `playwright.r7.config.ts:10, 14-16, 19`).
- Fail-safe DB: `resetDb()` chỉ chạy khi URL là `localhost`/`127.0.0.1`, ngược lại **throw** (`tests/e2e/_helpers/seed.ts:22`, `:32-34`).
- `playwright.acceptance.config.ts:39` — `baseURL: process.env.ACCEPT_BASE_URL ?? "https://test.satarobo.vn"`, `globalSetup` riêng (`:24`), chú thích tự khai *"Bộ này KHÔNG được chạy trong CI: nó ghi dữ liệu thật vào DB dev/test và cần Supabase Realtime + R2 thật"* (`:10-12`). ⇒ đây là bộ **guarded live**.
- `playwright.manual.config.ts:11-12` — trỏ dev server đang chạy, không reset DB, *"Chỉ dùng cục bộ"* (`:4`).

### `package.json` — script

| Dòng | Script | Được CI gọi? |
|---|---|---|
| `package.json:32` | `test:unit` | ✅ `ci.yml:118` |
| `:34` | `test:chat-db` | ✅ `ci.yml:179` |
| `:35` | `test:nen-db` | ✅ `ci.yml:184` |
| `:37` | `test:lead-intake` | ✅ `ci.yml:192` |
| `:36` | `test:elearning-db` | ❌ **KHÔNG một job nào gọi** |
| `:38` | `test:e2e` (smoke) | ✅ `ci.yml:291` |
| `:41` | `test:e2e:a0` | ✅ `ci.yml:398` |
| `:48` | `test:e2e:r7` | ✅ `ci.yml:466` |
| `:49` | `test:e2e:fl` | ✅ `ci.yml:559` |
| `:51` | `test:e2e:teacher` | ✅ `ci.yml:657` |
| `:52` | `test:e2e:elearning` | ✅ `ci.yml:755` |
| `:42`–`:47`, `:50` | `test:e2e:r1` … `r6`, `test:e2e:crm` | ❌ **KHÔNG** |
| — | *(không có)* `test:acceptance`, `test:manual` | ❌ config có, script **không có** |

## 1.3 CI — job nào chạy gì

`.github/workflows/ci.yml` chạy trên `push` + `pull_request` vào `main`, `test`, `develop` (`ci.yml:5-11`).

| Job | Tên | Nội dung | Có Postgres? |
|---|---|---|---|
| `quality` | Quality (typecheck + lint + build) | `pnpm typecheck` (`:71`) · `pnpm lint` (`:74`) · `pnpm lint:boundaries` (`:80`) · `pnpm build` (`:83`) · canary "không secret nào lọt bundle client" (`:95`) | ✅ service |
| `unit-tests` | Unit tests (Vitest) | `pnpm test:unit -- --run` (`:118`) | ❌ **không** |
| `chat-db-tests` | Chat DB invariants | `test:chat-db` (`:179`) · `test:nen-db` (`:184`) · `test:lead-intake` (`:192`), sau khi `prisma migrate deploy` (`:169`) + `seed-roles.ts` (`:175`) | ✅ |
| `e2e` | E2E smoke (Playwright) | `pnpm test:e2e` (`:291`), gate `if:` PR/main/test (`:204`) | ✅ + `pnpm db:seed` (`:244`) |
| `e2e-a0` | E2E Phase A0 | `test:e2e:a0` (`:398`) | ✅ |
| `e2e-r7` | E2E Phase R7 | `test:e2e:r7` (`:466`) | ✅ |
| `e2e-fl` | E2E Phase FL | `test:e2e:fl` (`:559`) | ✅ |
| `e2e-teacher` | E2E site GV #06 | `test:e2e:teacher` (`:657`), flag `TEACHER_SITE_ENABLED=true` | ✅ |
| `e2e-elearning` | E2E đào tạo nội bộ EL-07 | `test:e2e:elearning` (`:755`) | ✅ |

**Chú thích trong chính `ci.yml` giải thích vì sao `chat-db-tests` tồn tại** (`:122-126`): job `unit-tests` không có Postgres nên mọi spec `tests/chat` có `describe.skipIf` **skip sạch** ở đó; thiếu job này thì *"đột biến kiểu `leavers = existing.filter(() => false)` (PH bị gỡ khỏi lớp vẫn đọc được nhóm) vẫn cho CI XANH"*.

### Job nào BẮT BUỘC xanh trước khi merge?

🔴 **Không xác định được từ repo.** Không có file cấu hình branch protection trong repo (`.github/` chỉ có `workflows/`), không có `CODEOWNERS`. Branch protection nằm ở cài đặt GitHub, phải kiểm bằng `gh api repos/:owner/:repo/branches/main/protection`. **Cho tới khi kiểm được, phải giả định là KHÔNG có required status check** — tức 9 job trên là **thông tin**, không phải hàng rào. Đề xuất ở §5.

## 1.4 Cái gì KHÔNG được test — nói thẳng

### (a) 170 case tồn tại nhưng KHÔNG job CI nào chạy

| Bộ | Case | Nội dung nằm trong đó |
|---|---|---|
| `tests/e2e/r6/` | 57 | Hardening R6 |
| `tests/e2e/r1/` | 35 | CRM — gồm `ads-insights.spec.ts`, `lead-qualify.spec.ts`, `handover.spec.ts`, `cost-allocation.spec.ts` |
| `tests/e2e/r3/` | 12 | LMS — gồm **`media-consent.spec.ts`** (5 case consent media, `tests/e2e/r3/media-consent.spec.ts:28-76`) |
| `tests/e2e/r2/` | 12 | SIS + tài chính — gồm `convert-lead.spec.ts` |
| `tests/e2e/r4/` | 8 | Portal |
| `tests/e2e/crm/` | 7 | CRM |
| `tests/e2e/r5/` | 1 | HR |
| `tests/manual/` | 25 | Nhập liệu thật + tương phản màu |
| `tests/acceptance/` | 13 | Nghiệm thu chat trên `test.satarobo.vn` |

🔴 **Hệ quả cụ thể cho đợt này:** toàn bộ ràng buộc consent media hiện có (`tests/e2e/r3/media-consent.spec.ts`) **không chạy trên PR nào**. Khu vực F sửa thẳng vào vòng đời media — nếu ai đó phá bất biến C6.3 ("tag HS chưa GRANTED → từ chối"), CI vẫn xanh.

### (b) `test:elearning-db` là script mồ côi

`package.json:36` khai `test:elearning-db`, `vitest.config.ts:29` khai `tests/elearning/**` trong `include`, nhưng **không job nào gọi script đó**. Hiện vô hại vì 3 file `tests/elearning/*.test.ts` đều `// @vitest-environment node` và không chạm DB (`tests/elearning/permissions.test.ts:1`, `tests/elearning/entry.test.ts:1`) ⇒ chúng chạy trong `unit-tests`. **Bẫy:** ai đó thêm một test chạm DB vào thư mục đó kèm `skipIf(!HAS_LOCAL_DB)` thì nó **skip vĩnh viễn trong CI** mà không ai biết — đúng lớp hỏng câm mà `vitest.config.ts:26-28` đã cảnh báo cho một thư mục khác.

### (c) 0 test cho cron — 23 cron, 0 test

| Đo | Kết quả |
|---|---|
| Số route cron | **23** thư mục dưới `app/api/cron/` |
| Số file test có "cron" trong tên | **0** (`find . -name "*.test.ts" \| grep -i cron` = rỗng) |
| Thư mục `tests/cron/` | **KHÔNG TỒN TẠI** |
| `lib/cron/` có test? | **KHÔNG** — không có `lib/cron/*.test.ts` |

⇒ **Không có một test nào kiểm:** `verifyCronAuth` từ chối request thiếu `Authorization`; job chạy hai lần không nhân đôi; job ghi sổ lần chạy. Đây là vùng trắng hoàn toàn, và là **đúng vùng** mà D-01 (job ads), F-05 (job retention), F-21 (job deadline) sắp đổ vào. `docs/prd/D01-premortem.md:487` (T-01) và `docs/prd/F-media.md:149` đều nhắc lại sự cố **20 cron prod chưa từng chạy** vì header `Authorization` rụng theo redirect canonical.

### (d) Vùng trắng theo khu vực của đợt này

| Khu vực | Có test nào không? |
|---|---|
| **A-02** — bộ lọc phạm vi, chống IDOR `?center=` | ❌ **KHÔNG có `lib/reports/filters.test.ts`** — `ls lib/reports/` cho ra `filters.ts` **không kèm** file test, trong khi 8 module cùng thư mục đều có (`churn.test.ts`, `cohort.test.ts`, `dao-tao.test.ts`, `lead.test.ts`, `revenue-target.test.ts`, `teacher-performance.test.ts`, `trial.test.ts`, `trung-tam.test.ts`). Đây là **file duy nhất trong `lib/reports/` không có test**, và nó là file giữ logic chống IDOR. |
| **A-03** — quyền export lead | ❌ Không có test nào gọi đường export. `documentation/permissions.md:305` ghi: mọi hit của `leads:export` nằm trong file khai báo hoặc file test **khai danh sách quyền** (`lib/auth/active-role.test.ts:32`, `lib/auth/menu-permissions.test.ts:121,122,193,194`) — **không** test hành vi. |
| **F** — máy trạng thái media | ⚠️ Một phần: `tests/e2e/r7/media-draft.spec.ts` phủ 7 case luồng kho (DRAFT→PENDING/APPROVED, C6.2, C6.3, portal không thấy DRAFT, xoá chỉ DRAFT). **Không** case nào cho `DELETED`, xoá R2, `APPROVED→REJECTED`, `isClassWide` + consent, xem-hết-video, SLA. |
| **G** — migration lead | ❌ Không có test migration nào. `tests/e2e/r7/lead-child.spec.ts` phủ 1-N + cascade + `leadChildSchema` + guard `→REGISTERED` (7 case) nhưng **không** phủ backfill, dedup `0…`/`84…`, tìm-theo-tên-con, mask `children[].fullName`. |
| **C/D/B** | ⚠️ Chỉ tầng hàm thuần cũ: `lib/reports/lead.test.ts` (18 case, đơn vị **lead** không phải học sinh), `lib/reports/revenue-target.test.ts` (8 case, doanh thu **GỘP** không thuần), `lib/crm/marketing-metrics.test.ts` (2 case CPL/CPA/ROAS chia-0), `lib/crm/ads-insights.test.ts` (3 case parse + `canEditAds`). **Không** test nào cho: định nghĩa "đã chốt" duy nhất, doanh thu thuần (trừ hoàn/điều chỉnh), parser `SR.QD.232`, mapping override, snapshot bất biến, doanh thu theo ngày. |
| **E** | ⚠️ `lib/chat/pilot-stats-scope.test.ts` phủ rất đúng lớp luật E cần (cách ly cơ sở màn số liệu chat, chống leo rào `?center=`, fail-closed khi `centerId` NULL — `:290-346`). Nhưng **không** test nào cho `sendTarget.createdById`, panel giữ searchParams, cột SĐT theo `canViewParentContact`. |

### (e) Cái ĐANG được ghim tốt (để không phá nhầm)

| Luật | Test ghim | Dòng |
|---|---|---|
| `injectScope` chèn `centerId IN (visible)`, model ngoài `SCOPED_MODELS` không bị inject | `lib/db-scope.test.ts` | `:49-80` |
| `passesScope` chặn IDOR chéo cơ sở cho `Order`/`Lead` | `lib/db-scope.test.ts:197` · `tests/e2e/r7/security-gate.spec.ts:63-89` | |
| Mọi model có `centerId` đều được phân loại vào `SCOPED_MODELS` ∪ `SCOPE_EXEMPT` | `lib/db-scope.test.ts:220-234` | |
| Model 2 cột không lọt khỏi `BACKFILL_SPECS` | `tests/e2e/a0/orgunit-dual-write.spec.ts:131` `[US-07-IT-08b]` | |
| Registry quyền ↔ `ALL_ACTIONS` parity hai chiều | `lib/permissions/registry.test.ts:70-88` | |
| ESLint chặn kiểm quyền inline trong `_actions.ts` — **và ghim rằng `lib/**` KHÔNG bị chặn** | `lib/eslint/inline-authz.test.ts:222-276` | |
| ESLint chặn `@/lib/db` trần trong `app/(admin|portal)/**` + allowlist | `lib/eslint/db-restriction.test.ts:22-42` · `lib/eslint/db-allowlist-freshness.test.ts` | |
| Cách ly cơ sở màn số liệu chat + chống leo rào `?center=` | `lib/chat/pilot-stats-scope.test.ts:290-346` | |
| Chuẩn hoá SĐT: `phoneVariants` trả cả `0…` và `84…`; hai cách gõ cho cùng tập tra cứu | `lib/phone.test.ts:75-88` | |
| `dedupeKey` thông báo: khớp tiền tố dài nhất, `:overdue` nâng P1, nhóm không đổi | `lib/notifications/catalog.test.ts:95-126` | |
| `SETTINGS` registry: mọi default tự thoả schema; center override; row hỏng → fallback | `lib/settings/registry.test.ts:51-102` | |

---

# BƯỚC 2 — LUẬT CHỊU LỰC RÚT TỪ PRD

Chỉ giữ luật mà **vi phạm thì vượt ranh giới tin cậy / dữ liệu / tiền / cơ sở / riêng tư**. Bỏ hết hành vi thẩm mỹ (bố cục panel, badge, animation, nhãn nút).

| Mã luật | Phát biểu | Nguồn |
|---|---|---|
| **L-A1** | Một tài khoản gán N cơ sở khác vùng ⇒ `visibleCenterIds` = **hợp đúng N**; cơ sở thứ N+1 trả **0 dòng** | `A-nen-tang.md` §5 A-01-2 · §6.1 |
| **L-A2** | `?center=<ngoài phạm vi>` bị **loại im lặng**, không 500, không trả dữ liệu | A-02-4 |
| **L-A3** | Export lead yêu cầu **CẢ HAI** `leads:view-all` **AND** `leads:export`; **cấm thay thế** — thay thế mở đường HO-level không có `leads:*` xuất toàn hệ thống | A-03-2 · §6.3 bước 1 |
| **L-A4** | Màn per-user `/admin/users/[id]/permissions` **chặn cứng** mọi key khớp `leads:*` | A-03-7 · §6.3b |
| **L-A5** | Không neo được vai `CENTER_MANAGER` tại OrgUnit type `HO`/`ROOT` | A-01-3 |
| **L-A6** | Cổng **GHI** (điểm danh, chốt buổi) chấp nhận mọi cơ sở trong `visibleCenterIds`, không so `session.user.centerId` | A-01-6 · RT-1 |
| **L-A7** | `leads:export` **không** đến từ bất kỳ role nào; key vẫn phải ở lại `PERMISSIONS` | A-03-3 · §6.3 bước 2 |
| **L-A8** | File xuất chỉ chứa lead trong `visibleCenterIds` của người xuất | A-03-4 |
| **L-A9** | Chỉ bật "Tất cả cơ sở" cho tab mà **mọi** model nó đọc đã cách ly được | A-02-7 · §9/RT-2 |
| **L-A10** | Khoá cache của bộ lọc phải gồm **mảng `centerIds` đã sắp xếp** — thiếu ⇒ hai bộ lọc dùng chung entry, sai số liệu im lặng 120s | §6.2 ràng buộc 7 · `CDB-dashboard.md` §0.1 |
| **L-A11** | Vòng thu hồi của `reconcileUserOrgRoles` **chỉ** đụng dòng `source = AUTO` | SL-01 |
| **L-F1** | Máy trạng thái media: hợp lệ T1/T2/T4/T6/T7/T9/T10; **CẤM** `APPROVED→REJECTED`, `REJECTED→APPROVED`, `DELETED→*`, `APPROVED→DRAFT`, `PENDING→DRAFT`, `DRAFT→APPROVED|REJECTED` qua `reviewMedia` | `F-media.md` §6.1.1 |
| **L-F2** | `APPROVED` **chỉ** sinh từ `reviewMedia` — gỡ `autoApprove` ở cả hai đường ghi (∅→APPROVED và DRAFT→APPROVED bị cấm) | F-03-3 · §6.1.3 |
| **L-F3** | PH chỉ xem media `APPROVED` **và đúng buổi** — thêm `classSessionId` vào cả hai đường đọc portal | F-04-1 · §6.1.4 |
| **L-F4** | Từ chối/gỡ media = **xoá object R2**, thứ tự **R2 trước, row DB sau** | F-03-2 · §6.1.5(5) |
| **L-F5** | Folder hoàn tất ⇔ `count(status = PENDING) = 0`; `DRAFT` không vào mẫu số; `REJECTED` tính như `DELETED` | F-16-1 · §6.1.2 |
| **L-F6** | "Duyệt tất cả" = **một** lời gọi cho cả folder; chỉ hiện khi folder có media | F-13-1/2 |
| **L-F7** | "Duyệt tất cả" **khoá** khi còn video chưa đạt `watchedSec/duration ≥ 0.95` theo **(user, media)** | F-18-1 · §6.2.4(5) |
| **L-F8** | **Tua nhanh không tính là đã xem** — cộng theo đoạn, `dPos ≤ dWall + 2s`; server kẹp đoạn giả mạo theo `lastFlushAt` | F-18-2 · §6.2.4(3) |
| **L-F9** | Retention: media thuộc học bạ **chưa PUBLISHED** ⇒ **không xoá**, ghi log kèm `reportCardId`; học bạ `RECALLED` ⇒ không xoá; không xác định được ⇒ **GIỮ** | F-05-2 · §6.1.5(3) · Story 18 |
| **L-F10** | Job retention **idempotent**, mặc định **dry-run**, trần lô, có `verifyCronAuth` | F-05-3 · Story 18 |
| **L-F11** | `isClassWide = true` **không được bỏ qua** kiểm tra consent | `security-media.md` §7 |
| **L-F12** | Ảnh **chưa duyệt** không có URL nào tải được khi không đăng nhập; object key **không chứa tên file người dùng** | `security-media.md` §1, §2, §6 · Story 1 · Cổng B1/B2 |
| **L-F13** | `ClassSessionMedia` + `MediaStudentTag` khai `SCOPED_MODELS` **và** `BACKFILL_SPECS`; mọi `create` tự set `centerId` | SL-02 · Story 2 |
| **L-F14** | `isOwnStorageUrl` **fail-closed** khi thiếu env R2 | `security-media.md` §8 |
| **L-F15** | Thông báo quá hạn: `dedupeKey` idempotent (chạy 5 lần → 1 dòng); người nhận theo **tầm nhìn cơ sở**, không theo `User.centerId` đơn trị | F-21-2/3 |
| **L-F16** | `deadlineAt` **đóng băng** lúc tạo dòng; đổi cấu hình không viết lại lịch sử | F-20-2 · Story 7 |
| **L-F17** | `evaluateMediaSla` trả đúng 4 trạng thái, có biên `t = deadline`; `mediaSlaNote` đúng 3 nhánh; **không** dùng `ClassSessionMedia.approvedAt` làm mốc duyệt folder | F-31-1 · F-32-1 · §6.4.2/§6.4.3 |
| **L-F18** | "Hôm nay không có ảnh" bắt buộc ghi chú; hai nút **loại trừ tuyệt đối**; server từ chối `NO_PHOTO` khi folder thực tế có media | F-14-1 · Story 15 |
| **L-F19** | Chống đua: GV upload xen giữa lúc QLCS chốt folder ⇒ server **từ chối**, không im lặng duyệt ảnh chưa ai nhìn | Story 15 · T16 |
| **L-G1** | Backfill: mỗi `Lead` thoả 3 điều kiện (`childName` không rỗng · **NOT EXISTS** `LeadChild` · `deletedAt IS NULL`) ⇒ sinh **đúng 1** `LeadChild` | `G-lead-migration-plan.md` §2.1 |
| **L-G2** | **KHÔNG tự động merge** bản ghi trùng SĐT — chỉ đánh cờ `DUP_SUSPECT` + `LeadActivity`; không xoá, không đổi `status`/`assignedToId`/`deletedAt` | §2.2 · `G05-T02` |
| **L-G3** | Lead thiếu trường bắt buộc **không làm fail cả lô** — exit code 0, bản ghi vẫn chuyển, có cờ | §2.3 · `G05-T04` |
| **L-G4** | Tìm kiếm theo **tên con** vẫn ra kết quả sau khi đổi nguồn — 4 khoá `where.OR` | §1 mục 8 · `G05-T15` |
| **L-G5** | Convert-lead **không** đặt tên học viên bằng tên phụ huynh | §1 mục 9 (`convert-lead.ts:57` fallback `lead.parentName`) |
| **L-G6** | `LeadChild` cách ly cơ sở: actor CS1 đọc `leadChild` → 0 dòng của CS2 | SL-08 · `G05-T18` |
| **L-G7** | Dedup nhập tay bắt **cả** `0…` lẫn `84…` | N-3 · `G05-T03` |
| **L-G8** | `lastActivityAt` bump ở **mọi** đường tạo `LeadActivity` (15/15) | N-4 · `CDB-dashboard.md` §C.2.5 |
| **L-G9** | Mask PII phủ **cả** `children[].fullName`, không chỉ cột phẳng | `G05-T19` |
| **L-G10** | `UserTablePreference`: `userId` **luôn từ session**; khoá lạc bỏ qua im lặng; `visible` rỗng → mặc định; JSON hỏng → mặc định **không throw** | `G-lead.md` §7.5 · G-04-1 |
| **L-G11** | Tuỳ chọn cột **không phải cổng quyền** — cột PII vẫn qua mask server | G-04-4 |
| **L-G12** | Đánh dấu rớt **bắt buộc** `lostReasonId`, và lý do phải `isActive` | C-06-1 · `CDB-dashboard.md` §C.6.8 |
| **L-G13** | `LeadChild.createdAt` của bản backfill = `Lead.createdAt`, **không** `now()` | §2.1 bảng A · `E4` |
| **L-G14** | Backfill **idempotent** + chạy lại sau khi đứt không nhân đôi | `G05-T22`, `G05-T23` |
| **L-G15** | Migration **không đụng một đồng nào**: `sum(Order.totalAmount)` và `sum(Payment.amount)` bằng trước | §3.3 B1–B3 |
| **L-C1** | "Đã chốt" có **một** định nghĩa: `LeadChild.status = 'ENROLLED'` **và** `closedAt IS NOT NULL`; **khác** `CONVERTED_STATUSES` cấp lead | §C.6.0 · C-00-1 |
| **L-C2** | C1/C2/C3/C4 và mẫu số D2/D3 đếm theo **học sinh**, không theo phụ huynh | CHUNG-2 |
| **L-C3** | Khoảng ngày là **nửa mở** `[from, to)`, neo `Asia/Ho_Chi_Minh` cả hai đầu | CHUNG-3 · §0.1 |
| **L-C4** | Mẫu số 0 ⇒ hiện `—`/`null`, **không** hiện `0%` | C-02-2 · D-03-1 · T-08 |
| **L-C5** | C5 đọc lần tiếp cận từ `LeadActivity` với `type ∈ {CALL,MESSAGE,NOTE,EMAIL}` **và** `actorId IS NOT NULL`; trừ **hai ngày lịch VN** | §C.6.5 |
| **L-B1** | Thực thu = `Payment` `accountantStatus` đã xác nhận, trục **`paidDate`** | §B.6.0 |
| **L-B2** | Doanh thu **THUẦN**: `REFUNDED` (âm) **có trừ**; bản gốc `CONFIRMED` **bị loại** khi có bản `ADJUSTED` trỏ về; `PENDING`/`REJECTED`/`deletedAt` loại | §B.6.0 bảng |
| **L-B3** | B5 theo ngày: range N ngày ⇒ **N dòng**, ngày không giao dịch vẫn `0` | B-04-1 |
| **L-B4** | B6 đọc đúng mục tiêu từng cơ sở kể cả với actor HO-level | B-02-3 · §B.2.11 |
| **L-D1** | Snapshot ads **bất biến**: chạy lại cùng ngày ⇒ **thêm** dòng, dòng cũ nguyên vẹn | D-01-1 · §D.6.2(4) |
| **L-D2** | Đọc snapshot phải `DISTINCT ON` lấy `fetchedAt` mới nhất — quên ⇒ **cộng 7 lần cùng một khoản** | §D.6.2(4) · §D.6.8 |
| **L-D3** | Parser `SR.QD.232`: mã cơ sở đứng đầu, tách bằng `_`; `MULTI` là mã riêng; không parse được ⇒ `CHƯA PHÂN BỔ`, **không đoán** | D-06-1 · §D.6.5 |
| **L-D4** | Thứ tự phân bổ: **adset override → campaign override → parser → CHƯA PHÂN BỔ**; `MULTI` chưa khai tỷ lệ ⇒ CHƯA PHÂN BỔ | D-07-1/2 · §D.6.6 |
| **L-D5** | Tổng `ratioBp` của một entity = **10000**; chia tiền giữ **bất biến tổng** | §D.6.6 B1 |
| **L-D6** | `AdsSpendSnapshot` mang `centerId` + `orgUnitId`, khai `SCOPED_MODELS` + `BACKFILL_SPECS`; actor CS2 không thấy spend CS1 | D-01-4 · B5 |
| **L-D7** | `account_currency ≠ VND` ⇒ `status = BLOCKED`, **0 dòng** ghi; **không** tự đoán tỷ giá | T-04 · IM-07 · B4 |
| **L-D8** | Token Meta gửi qua **header**, không qua query string | D-01-3 · T-06 |
| **L-D9** | Mỗi lượt chạy ghi **một** dòng `AdsSyncRun` kể cả lượt 0 dòng; `rowsFetched = 0` + HTTP 200 ⇒ `INCONCLUSIVE`, **không** `OK` | T-01 · IM-08 |
| **L-D10** | Lịch cron `"0 17 * * *"` UTC = 00:00 giờ VN; `statDate` theo timezone tài khoản QC | T-05 · IM-06 |
| **L-E1** | Panel chat **giữ nguyên** bộ lọc dashboard: đóng = xoá **đúng một** `?chat=`, mọi param A-02 nguyên vẹn | E-04-3 |
| **L-E2** | `sendTarget` phải là `{ classId, centerId, createdById }` — thiếu `createdById` ⇒ vai scope OWN bị **xám ô nhập trên prod**, không lộ ở local | E-04-6 |
| **L-E3** | Màn **số liệu** đọc `Conversation` **phải tự lọc** `centerId ∈ getVisibleCenterIds(actor)` (vì `Conversation` ∈ `SCOPE_EXEMPT`) | E-02-4 · §6.6 luật 2 |
| **L-E4** | Lọc qua `Conversation.centerId` **loại sạch DM** (DM luôn `centerId = null`) ⇒ nếu định nghĩa "đã tương tác" gồm 1-1 thì phải lọc qua cơ sở của **enrollment** | §6.6 luật 3 |
| **L-E5** | SĐT/email PH **không bao giờ** vào payload trả cho PH khác; không đạt `canViewParentContact` ⇒ **không select `phone`**, không ẩn bằng CSS | E-03-2/3 · §6.6 luật 9 |
| **L-E6** | Người không phải participant mở panel ⇒ thông điệp tiếng Việt, **không 500** | E-04-5 |
| **L-E7** | E-01 đếm theo **range ngày** và chạy đúng với QLCS đa cơ sở (`centerId: { in: … }`, không `session.user.centerId`) | E-01-1/4 |
| **L-E8** | E-02 mẫu số: PH có ≥1 enrollment `status ∈ ENROLLMENT_ACTIVE_STATUS_LIST` + 4 điều kiện `deletedAt`/`isActive`; **một PH hai con đếm là 1** | E-02-2 |
| **L-E9** | File `"use server"` **chỉ** export `async function` — vi phạm làm chết toàn bộ action trong module, và **typecheck + lint + build đều xanh** | §6.5.4 |
| **L-X1** | `resetDb()` chỉ chạy khi DB là `localhost`/`127.0.0.1`; trỏ khác ⇒ **throw** | `.claude/rules/prisma-db.md` · `G05-T24` |
| **L-X2** | Mọi kiểm quyền đi qua `can()`/`checkPermission` — cấm điều kiện quyền inline | CLAUDE.md Nền Hệ thống #1 · `E-tuong-tac.md` §6.6 luật 4 |
| **L-X3** | Bảng mới cần `scopedDb` cách ly ⇒ mang **CẢ HAI** cột `centerId` + `orgUnitId` | SL-00 |

---

# BƯỚC 3 — BẢNG COVERAGE

Một dòng = một use case. Cột **Hành vi mong đợi** luôn kèm **cả ca từ chối**.

## 3.A — Khu vực A: phạm vi & phân quyền

| # | Use case | Luật (nguồn PRD) | Hành vi mong đợi (kèm ca từ chối) | Bằng chứng (doc + mã) | Loại | Trạng thái |
|---|---|---|---|---|---|---|
| A-1 | QLCS gán 2 cơ sở **khác REGION** đăng nhập | L-A1 · `A-nen-tang.md` §5 A-01-2 | ✅ `visibleCenterIds` = đúng `[c1, c2]`, không nhân bản. ❌ **Từ chối:** đọc `Lead`/`Payment`/`Student` của cơ sở thứ ba → **0 dòng**, không lỗi | Doc: A-01-2, §6.1. Mã: `lib/auth/actor.test.ts:34-46` chỉ phủ `CS1` đơn và `HO+CS1`; **không có case 2 CENTER** | integration | **proposed** |
| A-2 | Truyền `?center=<id ngoài phạm vi>` vào tab dashboard | L-A2 | ✅ id lạ bị loại im lặng, trả phạm vi hợp lệ còn lại. ❌ **Từ chối:** không 500, **không** trả dữ liệu cơ sở đó | Doc: A-02-4. Mã: **không có `lib/reports/filters.test.ts`** — file duy nhất trong `lib/reports/` thiếu test | unit | **proposed** |
| A-3 | Gọi endpoint export lead khi chỉ có `leads:view-all` | L-A3 | ✅ có **cả hai** quyền → 200 + file. ❌ **Từ chối:** thiếu `leads:export` → **403**; thiếu `leads:view-all` → **403** | Doc: A-03-2 + §6.3 bước 1. Mã: `documentation/permissions.md:305` — **không một `checkPermission("leads:export")` nào tồn tại** | integration | **proposed** |
| A-4 | Thành viên nhóm mang vai neo tại HO **không** có `leads:*` gọi export | L-A3 (nhánh AND) | ❌ **Từ chối:** 403. Nếu gate bị viết thành THAY THẾ thì actor này rơi vào nhánh `isHoLevel` → `"ALL"` → xuất lead toàn hệ thống | Doc: §6.3 bước 1 (câu cảnh báo nguyên văn) | integration | **proposed** |
| A-5 | Admin thử cấp `leads:export` qua `/admin/users/[id]/permissions` | L-A4 | ❌ **Từ chối:** action trả lỗi, **không** ghi `UserPermissionGrant`. Lý do: grant per-user `leads:*` bật `hasAll = true` → tắt cách ly cơ sở toàn model `Lead` | Doc: A-03-7 + §6.3b. Mã: `documentation/permissions.md:315-317` xác nhận blocklist hiện chỉ chặn `roles:*` + `users:manage` | integration | **proposed** |
| A-6 | Gán vai `CENTER_MANAGER` tại OrgUnit type `HO` | L-A5 | ❌ **Từ chối:** form chặn cứng kèm giải thích. Lý do: `isHoLevel` bật chỉ cần 1 dòng ⇒ thấy **mọi** cơ sở | Doc: A-01-3 | integration | **proposed** |
| A-7 | QLCS 2 cơ sở **điểm danh + chốt buổi** một lớp ở cơ sở thứ hai | L-A6 | ✅ thành công ở cả hai cơ sở. ❌ **Từ chối:** lớp ở cơ sở thứ ba → 403 | Doc: A-01-6, RT-1 (~10 cổng `record.centerId === user.centerId`) | integration | **proposed** |
| A-8 | Seed vai sau khi gỡ `leads:export` | L-A7 | ✅ không role nào có `leads:export`. ❌ **Từ chối:** key **vẫn** phải nằm trong `ALL_ACTIONS` — mất key ⇒ `buildActor` vứt im lặng mọi grant mang key đó | Doc: §6.3 bước 2/3, RT-4. Mã ghim một nửa: `lib/permissions/registry.test.ts:76-88` bắt descriptor ↔ `ALL_ACTIONS` | unit | **proposed** |
| A-9 | Nội dung file export của QLCS 2 cơ sở | L-A8 | ✅ chỉ lead của `[c1,c2]`. ❌ **Từ chối:** 0 dòng của cơ sở thứ ba, kể cả khi tổng vượt trần 5000 | Doc: A-03-4, A-03-6 (trần `take: 5000` im lặng) | integration | **proposed** |
| A-10 | Bật "Tất cả cơ sở" cho tab đọc `AdsInsightDaily` / `Conversation` / `RevenueTarget` | L-A9 | ❌ **Từ chối:** tab chưa được bật cho tới khi model đó cách ly được hoặc có đường lọc tay + test | Doc: A-02-7 · §9/RT-2. Mã liên quan đã ghim: `lib/db-scope.test.ts:220-234` (phân loại model) | unit | **proposed** |
| A-11 | Hai bộ lọc khác nhau, cùng thời điểm, cùng `safeCache` | L-A10 | ✅ hai khoá cache khác nhau. ❌ **Từ chối:** cùng tập `centerIds` khác **thứ tự** phải cho **cùng** khoá (chống nhân bản entry) | Doc: §6.2 ràng buộc 7 · `CDB-dashboard.md` §0.1. Mã: `lib/cache/scope-key.test.ts` tồn tại nhưng cho khoá cache scope, không cho `ScopeFilters` | unit | **proposed** |
| A-12 | Sửa ô "Đơn vị" trên hồ sơ nhân sự của QLCS đa cơ sở | L-A11 · SL-01 | ✅ dòng `source = AUTO` bị thu hồi. ❌ **Từ chối:** dòng `source = MANUAL` **giữ nguyên**, không bị `EXPIRED` | Doc: SL-01 (§10.1) + §6.1 phần "dòng gán tay". Mã: `lib/hr/sync-employee-unit.test.ts` có nhưng không phủ ca này | integration | **proposed** |
| A-13 | `injectScope` với model ngoài `SCOPED_MODELS` | nền của L-A9 | ✅ trả `args` nguyên vẹn (được ghim là hành vi cố ý) | `lib/db-scope.test.ts:70-73` `[A0-04-T1-01]` | unit | **existing** |
| A-14 | `passesScope` với record chéo cơ sở | nền của L-A6 | ❌ **Từ chối:** `Lead`/`Order` CS2 với actor CS1 → `false` | `lib/db-scope.test.ts:197-201` · `tests/e2e/r7/security-gate.spec.ts:63-89` | unit + integration | **existing** |
| A-15 | Model mới có 2 cột phạm vi mà quên khai `BACKFILL_SPECS` | L-X3 | ❌ **Từ chối:** test đỏ | `tests/e2e/a0/orgunit-dual-write.spec.ts:131` `[US-07-IT-08b]` | integration | **existing** ⚠️ (job `e2e-a0` chạy — OK) |

## 3.F — Khu vực F: media

| # | Use case | Luật (nguồn PRD) | Hành vi mong đợi (kèm ca từ chối) | Bằng chứng (doc + mã) | Loại | Trạng thái |
|---|---|---|---|---|---|---|
| F-1 | T1 ∅→`DRAFT` (đưa vào kho) | L-F1 | ✅ tạo N dòng DRAFT, gắn buổi, `takenAt` fallback ngày buổi, 1 audit | `tests/e2e/r7/media-draft.spec.ts:81` `[KHO-01]` | integration | **existing** ⚠️ |
| F-2 | T4 `DRAFT`→`PENDING` (gửi tới PH) | L-F1 | ✅ tag đúng + `PENDING` | `tests/e2e/r7/media-draft.spec.ts:115` `[KHO-02]` | integration | **existing** ⚠️ |
| F-3 | T2 ∅→`PENDING` (đăng thẳng) | L-F1 | ✅ `PENDING`; ❌ ảnh không tag & không class-wide → reject | `tests/e2e/r7/media-draft.spec.ts:172` `[KHO-04]` (C6.2) | integration | **existing** ⚠️ |
| F-4 | T3 ∅→`APPROVED` và T5 `DRAFT`→`APPROVED` (autoApprove) | **L-F2 — phải CẤM** | ❌ **Từ chối:** người có `media:approve` upload → trạng thái **`PENDING`**, không `APPROVED` | 🔴 Test hiện có ghim **hành vi NGƯỢC LẠI**: `tests/e2e/r7/media-draft.spec.ts:146` `[KHO-03]` assert *"publish autoApprove=true (QL) → APPROVED luôn"*. **Phải sửa test này cùng lúc với mã, nếu không F.1b không merge được** | integration | **proposed** (kèm sửa test cũ) |
| F-5 | T7 `PENDING`→`APPROVED` qua `reviewMedia` | L-F1 | ✅ ghi `approvedBy*` + audit; ❌ media đang `DRAFT` → từ chối | Doc §6.1.1 T7. Mã: chặn DRAFT có nhưng **không test** — `[KHO-07]` chỉ phủ `deleteDraftMedia` | integration | **proposed** |
| F-6 | T9 `PENDING`→`DELETED` (từ chối) | L-F1 · L-F4 | ✅ gọi `DeleteObjectCommand` **trước**, rồi set `DELETED` + `deletedAt/By/Reason`, row giữ lại. ❌ **Từ chối:** R2 lỗi 500 → row **không** bị mất, object **không** bị bỏ rơi | Doc §6.1.1 T9, §6.1.5(5); Story 4 tiêu chí "thứ tự ngược". Mã: trạng thái `DELETED` **CHƯA CÓ** | integration | **proposed** |
| F-7 | T10 `APPROVED`→`DELETED` (gỡ) | L-F1 · L-F4 | ✅ như T9 + cảnh báo "PH có thể đã xem" | Doc §6.1.1 T10 | integration | **proposed** |
| F-8 | `APPROVED`→`REJECTED` gửi thẳng payload | **L-F1 — CẤM** | ❌ **Từ chối ở SERVER**, không chỉ ẩn nút. Hiện tại **đang lọt**: `reviewMedia` chỉ chặn `DRAFT` | Doc §6.1.1 bảng "Chuyển tiếp BỊ CẤM" (đánh dấu 🔴 ĐANG LỌT) | integration | **proposed** |
| F-9 | `REJECTED`→`APPROVED` | **L-F1 — CẤM** | ❌ **Từ chối ở server** | Doc §6.1.1 (🔴 ĐANG LỌT) | integration | **proposed** |
| F-10 | `DELETED`→ bất kỳ | **L-F1 — CẤM tuyệt đối** | ❌ **Từ chối:** terminal, object đã mất | Doc §6.1.1 | integration | **proposed** |
| F-11 | `APPROVED`→`DRAFT` / `PENDING`→`DRAFT` | L-F1 — CẤM | ❌ **Từ chối** (đã cấm sẵn: `publishClassMedia` chỉ nhận row `DRAFT`) | Doc §6.1.1 ghi ✅ đã cấm; **không có test** khẳng định | integration | **proposed** |
| F-12 | `DRAFT`→`APPROVED`/`REJECTED` qua `reviewMedia` | L-F1 — CẤM | ❌ **Từ chối** | Doc §6.1.1 ✅ đã cấm; test gián tiếp `[KHO-07]` (`media-draft.spec.ts:255`) chỉ phủ đường xoá | integration | **proposed** |
| F-13 | **F-04**: PH mở album | L-F3 | ✅ chỉ media `APPROVED` **và** `classSessionId != null` thuộc buổi HV có mặt. ❌ **Từ chối:** HV ghi danh lớp X nhưng **không có `Attendance`** ở buổi S → **không thấy** media gắn `S`, kể cả `isClassWide = true` | Doc F-04-1 §6.1.4; Story 10 tiêu chí 1. Mã hiện có phủ **vế `APPROVED`** (`tests/e2e/r7/media-draft.spec.ts:216` `[KHO-06]`) nhưng **không** vế "đúng buổi" | integration | **proposed** |
| F-14 | Media prod có `classSessionId = null` khi bật F-04 | L-F3 (hệ quả di sản) | ✅ theo quyết định OQ-F5 (backfill hoặc miễn trừ). ❌ **Từ chối:** **không** được bật mù — media cũ biến mất khỏi portal | Doc §6.1.4 🔴 OQ-F5 | manual | **none** (quyết định người, đo trên prod) |
| F-15 | Consent: thu hồi rồi ⇒ ảnh tag con ẩn | nền L-F11 | ✅ ẩn ngay | `tests/e2e/r3/media-consent.spec.ts:46` `[R3-06-C6.4]` · `tests/e2e/r7/portal-media.spec.ts:272` | integration | **existing** 🔴 (r3 **không chạy CI**; r7 có chạy) |
| F-16 | Consent: tag HV chưa GRANTED | nền L-F11 | ❌ **Từ chối:** reject, không ghi tag | `tests/e2e/r3/media-consent.spec.ts:34` · `tests/e2e/r7/media-draft.spec.ts:191` `[KHO-05]` | integration | **existing** ⚠️ |
| F-17 | **`isClassWide = true`** khi lớp còn HV **đã thu hồi** consent | **L-F11** | ❌ **Từ chối:** publish bị chặn kèm danh sách tên; hoặc phải ghi nhận xác nhận đã xử lý ảnh + audit | `security-media.md` §7 nêu thẳng: *"Bộ test cũng chỉ phủ nhánh tag … không có case nào cho `isClassWide` + trẻ thu hồi consent"* | integration | **proposed** |
| F-18 | Ghép `https://cdn.satarobo.vn/<key>` của media `PENDING`, không cookie | **L-F12** | ❌ **Từ chối:** 403/404. Hiện tại: 200 (bucket công khai) | `security-media.md` §1, §2; Story 1 tiêu chí 2-3; Cổng B1 | guarded live | **proposed** |
| F-19 | Object key của media lớp | L-F12 | ✅ key vô danh dạng `class-media/<sessionId>/<mediaId>.<ext>`. ❌ **Từ chối:** key **không chứa** tên file người dùng nhập | `security-media.md` §6; Cổng B2 (`keyContainsName`); Story 1 | unit | **proposed** |
| F-20 | `getClassMediaBucket()` khi env trống / trùng bucket công khai | L-F12 | ❌ **Từ chối:** **throw**, fail-closed. Luồng upload trả 503, **không** rơi về bucket công khai | Story 1 tiêu chí 1 + "Biên/lỗi". Mẫu đã có test: `lib/storage/chat-storage.test.ts` | unit | **proposed** |
| F-21 | `isOwnStorageUrl` khi thiếu env R2 | **L-F14** | ❌ **Từ chối:** trả `false` (hiện `catch { return true }` = fail-open) | `security-media.md` §8 | unit | **proposed** |
| F-22 | Folder có 1 ảnh `PENDING` + 3 `APPROVED` + 2 `DRAFT` | L-F5 | ✅ chưa hoàn tất (`pending = 1`). ❌ **Từ chối:** `DRAFT` **không** được tính vào mẫu số; ảnh `REJECTED` di sản tính như `DELETED` | Doc §6.1.2 `UNREVIEWED_STATUSES` / `RESOLVED_STATUSES`; `isClassFolderClosed` §6.2.3 | unit | **proposed** |
| F-23 | "Duyệt tất cả" trên folder 40 ảnh | L-F6 | ✅ **một** action, một revalidate, một `writeAudit`, ghi `ClassMediaReviewDay` | Doc F-13-2; Success metric *"1 lời gọi / folder"* | integration | **proposed** |
| F-24 | "Duyệt tất cả" khi folder rỗng | L-F6 · L-F18 | ❌ **Từ chối:** nút không hiện; thay bằng "Hôm nay không có ảnh" | Doc F-13-1, F-14-1; Story 12 "Biên/lỗi folder rỗng" | integration | **proposed** |
| F-25 | Folder có 2 video: watched 0.90 và 0.96 | **L-F7** | ✅ `0.96` đủ. ❌ **Từ chối:** còn video `0.90` ⇒ nút **khoá** + hiện lý do *"còn 1 video chưa xem hết"*, không khoá câm | Doc F-18-1, §6.2.4(5); Success metric *"`0.9` khoá; `0.96` mở"* | unit + integration | **proposed** |
| F-26 | Video thiếu `durationSec` (transcode chưa xong / metadata lỗi) | L-F7 đường thoát | ✅ **loại khỏi mẫu số**, folder hiện cảnh báo riêng. ❌ **Từ chối:** không được khoá nút vĩnh viễn | Doc §6.2.4(5) 🔴 "Đường thoát bắt buộc"; Story 6 + 14 "Biên/lỗi" | unit | **proposed** |
| F-27 | Chuỗi sự kiện `seek 0 → duration` rồi phát 2 giây | **L-F8** | ✅ `watchedSec` tăng đúng **2**. ❌ **Từ chối:** `completedAt` vẫn `null`; đoạn tua **không** được cộng | Doc F-18-2 §6.2.4(3); Story 6 "Chống tua"; Success metric *"`seek 0→duration` → `watchedSec = 0`"* | unit | **proposed** |
| F-28 | Client POST `segments = [[0, duration]]` ngay sau khi mở video | L-F8 (chống giả mạo) | ❌ **Từ chối:** server cắt theo `(now − lastFlushAt) × 1.5 + 5`; `watchedSec = min(covered, durationSec)`; `completedAt` không set | Doc §6.2.4(3) bước 4; Story 6 "Chống giả mạo" | unit + integration | **proposed** |
| F-29 | Hai QLCS cùng duyệt một folder | L-F7 (theo user) | ✅ `@@unique([mediaId, userId])` — mỗi người một sổ. ❌ **Từ chối:** QLCS A xem xong **không** làm QLCS B đủ điều kiện | Doc §6.2.4(4); Story 14 tiêu chí "theo người" | integration | **proposed** |
| F-30 | Media > 12 tháng, học bạ liên kết `PENDING_REVIEW` | **L-F9** | ❌ **Từ chối xoá:** `decision = KEPT_REPORT_CARD_UNPUBLISHED` + `reportCardId` + `reportCardStatus` đọc được | Doc F-05-2 §6.1.5(3); Story 18 | unit | **proposed** |
| F-31 | Media > 12 tháng, học bạ `RECALLED` | L-F9 | ❌ **Từ chối xoá** — có test riêng | Story 8 + Story 18 "Biên/lỗi RECALLED" | unit | **proposed** |
| F-32 | Media > 12 tháng, **không** liên kết học bạ nào | L-F9 | 🔴 Hai PRD **mâu thuẫn**: `F-media.md` §6.1.5(3) nói rơi vào `DELETED` *(hành vi cố ý)*; `F-media-stories.md` Story 18 nói **mặc định fail-safe là GIỮ**. **Test không viết được cho tới khi OQ-F4 chốt** | Doc §6.1.5(3) vs Story 18 "Biên/lỗi điều kiện không trả lời được" | — | **none** (chặn bởi OQ-F4) |
| F-33 | Job retention chạy 3 lần liên tiếp | L-F10 | ✅ lần 2, 3 không xoá thêm, không sinh log trùng | Doc F-05-3; Story 18 "idempotent theo `mediaId`" | integration | **proposed** |
| F-34 | Gọi cron retention không có `Authorization: Bearer` | L-F10 | ❌ **Từ chối:** 401 | Doc §6.1.5(6) `verifyCronAuth`; Story 16 "Biên/lỗi xác thực cron". **Không có test cron nào trong repo** (§1.4c) | integration | **proposed** |
| F-35 | Chạy cron deadline 5 lần liên tiếp | **L-F15** | ✅ đúng **1** dòng `StaffNotification` (dedupe theo `@@unique([userId, dedupeKey])`) | Doc F-21-2; Story 16 tiêu chí "không trùng" | integration | **proposed** |
| F-36 | Người nhận cảnh báo quá hạn của lớp CS2 | L-F15 | ✅ QLCS giữ CS2 nhận. ❌ **Từ chối:** QLCS chỉ giữ CS1 **không** nhận; và **không** được lọc bằng `User.centerId` đơn trị | Doc F-21-3 🔴 (cấm sao chép `getParentRequestRecipients`); Story 16 tiêu chí 4 | integration | **proposed** |
| F-37 | Đổi `media.reviewDeadlineHour` sau khi đã có folder cũ | **L-F16** | ✅ ngày **mới** dùng giờ mới. ❌ **Từ chối:** `deadlineAt` của folder cũ **không đổi** — báo cáo SLA quá khứ bất biến | Doc F-20-2; Story 7 tiêu chí "đóng băng"; Story 16 tiêu chí 1 | unit + integration | **proposed** |
| F-38 | `evaluateMediaSla` 4 trạng thái + biên `reviewedAt == deadlineAt` | **L-F17** | ✅ `NO_PHOTO→Không có ảnh`; `OPEN→Chưa duyệt` (kể cả quá hạn); `APPROVED_ALL` + `reviewedAt ≤ deadline → Đã duyệt`; `> deadline → Phê duyệt trễ`. ❌ **Từ chối:** biên `==` phải chốt tường minh trong test | Doc §6.4.2 bảng suy diễn; Story 17 tiêu chí 1. Mẫu đã có: `lib/crm/sla.test.ts` | unit | **proposed** |
| F-39 | `mediaSlaNote` 3 nhánh | L-F17 | ✅ trễ → `<thời điểm duyệt> / <deadline>`; `Chưa duyệt`/`Đã duyệt` → chuỗi rỗng; `Không có ảnh` → ghi chú F-14. ❌ **Từ chối:** không nhánh nào rơi vào rỗng ngoài ý muốn | Doc §6.4.3; Story 17 tiêu chí 2 | unit | **proposed** |
| F-40 | Bảng SLA dùng `ClassSessionMedia.approvedAt` làm mốc duyệt | L-F17 | ❌ **Từ chối:** cấm — trường đó ghi **cả cho bản bị từ chối**; mốc đúng là `ClassMediaReviewDay.reviewedAt` | Doc §6.4.2 🔴; Story 17 tiêu chí 5 | unit | **proposed** |
| F-41 | Bấm "Hôm nay không có ảnh" trên folder thực tế **có** media | **L-F18** | ❌ **Từ chối ở server**, không chỉ ẩn nút; ghi chú < 10 ký tự cũng từ chối | Story 15 tiêu chí "loại trừ tuyệt đối" + "ghi chú ≥ 10 ký tự" | integration | **proposed** |
| F-42 | GV upload ảnh **trong lúc** popup "Duyệt tất cả" đang mở | **L-F19** | ❌ **Từ chối:** server phát hiện số media đã đổi → yêu cầu tải lại (mẫu `DRAFT_RACE`). **Không** im lặng duyệt ảnh chưa ai nhìn | Story 15 "Biên/lỗi (đua)"; T16. Mẫu đã có trong mã: guard `DRAFT_RACE` | integration | **proposed** |
| F-43 | `closeMediaReviewDay` lỗi giữa chừng | L-F6 (transaction) | ❌ **Từ chối:** **không** media nào đổi trạng thái **và không** dòng `ClassMediaReviewDay` nào được tạo | Story 15 tiêu chí "một transaction" | integration | **proposed** |
| F-44 | Actor CS1 truy vấn `classSessionMedia.findMany()` không `where` | **L-F13** | ❌ **Từ chối:** **0 dòng** thuộc CS2 | Story 2 tiêu chí 2; Doc §6.2.1. Mã: `ClassSessionMedia` hiện **không** trong `SCOPED_MODELS` — bảo vệ nền đã ghim ở `lib/db-scope.test.ts:220-234` sẽ bắt khi thêm cột | integration | **proposed** |
| F-45 | Tạo media thiếu `centerId` | L-F13 | ❌ **Từ chối:** test bắt lỗi. Lý do: `scopedDb` **không che write**, quên = row vô hình với chính QLCS cơ sở đó | Story 2 tiêu chí 4; Doc F-01-2 🔴 | integration | **proposed** |
| F-46 | Backfill `centerId` cho media có `classId` trỏ lớp **đã xoá** | L-F13 biên | ✅ `centerId = NULL`, **không crash**; dòng như vậy liệt kê ra file cho người vận hành | Story 2 "Biên/lỗi" | integration | **proposed** |
| F-47 | Lớp có 500 media, mở trang duyệt | Doc F-10/F-12 (chống trần im lặng) | ✅ số đếm folder = số ô lưới, mọi ảnh tới được. ❌ **Từ chối:** không còn trần 100 dòng im lặng | Story 11 tiêu chí 3 + Story 12 tiêu chí 1; T6; Cổng A6 | integration | **proposed** |
| F-48 | QLCS CS1 truyền `?date=&classId=` của lớp CS2 vào trang duyệt | L-F13 | ❌ **Từ chối:** 404/redirect, **không** 500, **không** lộ tên lớp | Story 11 tiêu chí 4; Cổng C1 | integration | **proposed** |
| F-49 | Diễn tập khôi phục 1 ảnh đã xoá | Cổng A3 | ✅ khôi phục thành công, có biên bản | Story 4 + Go/No-Go A3. **Không tự động hoá được** — cần R2 thật + người ký | manual | **none** |
| F-50 | 3 QLCS × 20 lượt vuốt, nút "X lớn" | Cổng A8 / T2 | ✅ **0** lần từ chối nhầm không hoàn tác được | Go/No-Go A8; Story 13 tiêu chí 3 | manual | **none** |
| F-51 | Cron media chạy thật **trên prod** | Cổng C2 / T11 | ✅ có chỉ số "lần chạy cuối". ❌ 401 do header rụng theo redirect canonical | Story 16 "Biên/lỗi xác thực cron" ⚠️; Cổng C2 | guarded live | **proposed** |

## 3.G — Khu vực G: lead & migration

| # | Use case | Luật (nguồn PRD) | Hành vi mong đợi (kèm ca từ chối) | Bằng chứng (doc + mã) | Loại | Trạng thái |
|---|---|---|---|---|---|---|
| G-1 | Backfill lead cũ có `childName`, chưa có `LeadChild` | **L-G1** | ✅ sinh **đúng 1** `LeadChild`, `fullName` đã `btrim` | `G05-T01` nhánh (i-b); §2.1 | integration | **proposed** |
| G-2 | Lead đã có 2 `LeadChild` + `childName` trùng con thứ nhất | L-G1 (chống nhân đôi) | ❌ **Từ chối:** **KHÔNG** tạo dòng thứ ba; 2 dòng cũ chỉ được cập nhật cột mới, `fullName`/`ageYears` không đụng | `G05-T01` nhánh (i-a); `G05-T09` (kể cả khác hoa/thường, 2 dấu cách) | integration | **proposed** |
| G-3 | `childName` = `""` / `"   "` / `NULL` | L-G1 | ❌ **Từ chối:** 0 `LeadChild`; **không** tạo placeholder `"(chưa rõ)"`; cờ `MISSING_CHILD_NAME` | `G05-T07` | integration | **proposed** |
| G-4 | Lead đã **xoá mềm** có `childName` | L-G1 | ❌ **Từ chối:** không tạo `LeadChild` (bảng con không có `deletedAt` ⇒ sẽ đếm nhầm) | `G05-T11` | integration | **proposed** |
| G-5 | 3 lead cùng SĐT (`ENROLLED` / `NEW` / `LOST`) | **L-G2** | ✅ vẫn **3** `Lead`, 2 `LeadChild` mới, cả 3 mang `DUP_SUSPECT` + `DUP_GROUP:<lõi>`, mỗi lead 1 `LeadActivity`. ❌ **Từ chối:** **không** merge, `assignedToId`/`status`/`centerId`/`deletedAt` **không đổi**, **không** `LeadChild` nào bị chuyển lead | `G05-T02` bảng kiểm | integration | **proposed** |
| G-6 | Nhóm trùng gồm `0905123456`, `84905123456`, `0905 123 456` | **L-G2 + L-G7** | ✅ **1 nhóm 3 lead** (khoá gom = phần lõi `905123456`). ❌ **Từ chối:** gom theo `phone` thô cho 3 nhóm 1-lead ⇒ **test PHẢI FAIL** | `G05-T03`; §2.2 lớp 1. Nền đã ghim: `lib/phone.test.ts:75-88` (`phoneVariants`, `phoneSearchTerm`) | integration | **proposed** |
| G-7 | Lead xoá mềm trùng SĐT với lead sống | L-G2 | ❌ **Từ chối:** nhóm chỉ đếm lead sống ⇒ `n = 1` ⇒ **không** cờ `DUP_SUSPECT` | `G05-T12` | integration | **proposed** |
| G-8 | 10.000 lead sạch + 5 lead thiếu trường, trộn lẫn | **L-G3** | ✅ exit code **0**; 10.000 lead chuyển đủ; 5 lead lỗi được đánh cờ + in log từng dòng kèm lý do. ❌ **Từ chối:** **không** nuốt im lặng, **không** fail cả lô | `G05-T04` bảng kiểm chung | integration | **proposed** |
| G-9 | Tuổi con ngoài 3–18 | L-G3 | ✅ `LeadChild` vẫn tạo, `ageYears = NULL` + cờ `AGE_OUT_OF_RANGE` | `G05-T04` M2 | integration | **proposed** |
| G-10 | Nguồn lead `"tiktok-livestream-t7"` không có trong danh mục | L-G3 | ✅ `sourceId = NULL`, `Lead.source` **giữ nguyên**, sinh `LeadSource{isActive:false}` + cờ `SOURCE_UNMAPPED` | `G05-T04` M5 | integration | **proposed** |
| G-11 | Gõ `"Bảo Trâm"` vào 4 ô tìm (`/admin/leads`, `/admin/search`, export `?q=`, lọc `/admin/trials`) | **L-G4** | ✅ **cả 4** trả về lead. ❌ **Từ chối:** trước khi vá, cả 4 trả **0 kết quả** — test phải **ĐỎ trước, xanh sau** | `G05-T15`; §1 mục 8 (4 khoá `where.OR`) | integration | **proposed** |
| G-12 | Mở màn convert của lead cũ sau backfill | **L-G5** | ✅ `prefillStudents` lấy tên từ `lead.children`, không rơi vào fallback. ❌ **Từ chối:** tuyệt đối **không** đặt `Student.name = lead.parentName` | `G05-T25`; §1 mục 9 (đường `convert-lead.ts:57` là mã chết nhưng nguy hiểm nếu nối lại) | integration | **proposed** |
| G-13 | Actor QLCS chỉ CS1 gọi `scopedDb(actor).leadChild.findMany({})` | **L-G6** | ✅ đúng 2 dòng của CS1. ❌ **Từ chối:** 0 dòng của CS2 — quên khai `SCOPED_MODELS` ⇒ trả **cả 3** (rò ở đúng bảng doanh thu) | `G05-T18`; `G-lead.md` §6.7 | integration | **proposed** |
| G-14 | Sale nhập tay SĐT `0905123456` khi DB đã có `84905123456` | **L-G7** | ❌ **Từ chối:** báo trùng. Hiện tại **tạo được lead thứ tư** (bug có sẵn) — test này ghim bug rồi ghim bản vá | `G05-T03` bước 3; N-3 | integration | **proposed** |
| G-15 | Mỗi đường tạo `LeadActivity` (15 đường) | **L-G8** | ✅ `lastActivityAt` bump ở **15/15**. ❌ **Từ chối:** hiện chỉ 3/15 | `CDB-dashboard.md` §C.2.5 (liệt kê đủ 15 vị trí); `G-lead.md` G-06-8 | integration | **proposed** |
| G-16 | `evaluateSla` với lead `updatedAt = now`, `lastActivityAt = 3 ngày trước` | L-G8 (hệ quả) | ✅ trả `["SLA-4"]`. ❌ **Từ chối:** hiện `sla.ts:132` truyền nhầm `updatedAt` ⇒ **SLA-4 không bao giờ nổ** | `CDB-dashboard.md` C-05-4; §C.2.5 lỗi 2. Mã: `lib/crm/sla.test.ts` tồn tại nhưng không phủ ca này | unit | **proposed** |
| G-17 | Actor có `leads:view-all` nhưng **không** `leads:view-pii` mở danh sách / chi tiết / export | **L-G9** | ✅ `childName` bị mask. ❌ **Từ chối:** `children[].fullName` **cũng phải** bị mask — hiện chỉ mask cột phẳng | `G05-T19`; §1 mục 4 (`lib/lead/pii.ts`). Mã hiện có: `lib/lead/pii.test.ts:17` phủ **đúng 5 field cột phẳng**, không phủ `children[]` | unit | **proposed** (mở rộng test có sẵn) |
| G-18 | Danh sách trường PII dạng **chuỗi** ở 2 file | L-G9 | ✅ `instrumentation-client.ts` + `registry/crm.ts` liệt kê trường tên con mới. ❌ **Từ chối:** `pnpm typecheck` **KHÔNG** bắt — phải có test/lint riêng | `G05-T20`; §1 mục 10 | unit | **proposed** |
| G-19 | Lưu cấu hình cột: client gửi `userId` khác | **L-G10** | ❌ **Từ chối:** server **luôn** lấy `userId` từ session, bỏ qua payload | `G-lead.md` G-04-1, §7.2 cuối | integration | **proposed** |
| G-20 | `columns` chứa khoá **không có** trong catalog | L-G10 | ✅ **bỏ qua im lặng** khi render, **giữ nguyên** trong DB, **không log lỗi** (là trạng thái hợp lệ) | §7.5 bảng dòng 1 | unit | **proposed** |
| G-21 | `columns` JSON hỏng / `v` lạ / không phải object | L-G10 | ✅ dùng bộ mặc định. ❌ **Từ chối:** **không throw** — một dòng JSON hỏng không được làm chết trang lead | §7.5 dòng 4 | unit | **proposed** |
| G-22 | Sau khi lọc, `visible` rỗng | L-G10 | ✅ dùng nguyên bộ mặc định — **không bao giờ** render bảng 0 cột | §7.5 dòng 3 | unit | **proposed** |
| G-23 | User bật cột `phone` mà **không** có `leads:view-pii` | **L-G11** | ✅ thấy `090•••`. ❌ **Từ chối:** tuỳ chọn cột **không** là cổng quyền | G-04-4; §7.5 dòng cuối | integration | **proposed** |
| G-24 | Đánh dấu rớt thiếu `lostReasonId` | **L-G12** | ❌ **Từ chối:** Server Action trả lỗi *"Bắt buộc chọn lý do rớt"* | `CDB-dashboard.md` §C.6.8 (`markChildLostSchema`) | integration | **proposed** |
| G-25 | Đánh dấu rớt với `lostReasonId` đã `isActive = false` | L-G12 | ❌ **Từ chối:** *"Lý do rớt không hợp lệ hoặc đã ngừng dùng"* | §C.6.8 | integration | **proposed** |
| G-26 | Chuyển con khỏi trạng thái `LOST` | L-G12 (dọn dữ liệu bẩn) | ✅ **xoá** `lostReasonId`/`lostNote`/`lostAt` trong cùng transaction | §C.6.8 bẫy B4 | integration | **proposed** |
| G-27 | `createdAt` của `LeadChild` sinh từ backfill | **L-G13** | ✅ = `Lead.createdAt`. ❌ **Từ chối:** dùng `now()` ⇒ mọi lead cũ có tuổi 0 ngày, C-03 tính sai "thời gian chốt" | §2.1 bảng A; §3.3 E4 | integration | **proposed** |
| G-28 | Chạy `--apply` **ba** lần liên tiếp | **L-G14** | ✅ lần 2, 3: 0 `LeadChild` mới, 0 `LeadActivity` mới, `migrationFlags` không nhân bản phần tử | `G05-T23` | integration | **proposed** |
| G-29 | Kill script ở ~50% lô rồi chạy lại | L-G14 | ✅ tổng cuối = tổng của lần chạy liền mạch, không nhân đôi | `G05-T22` | integration | **proposed** |
| G-30 | Đối soát tiền trước/sau migration | **L-G15** | ✅ `sum(Order.totalAmount)`, `sum(Payment.amount)`, `sum(totalAmount) WHERE leadId NOT NULL` **bằng chính xác tuyệt đối**. ❌ **Từ chối:** lệch 1 đồng ⇒ **rollback ngay** | §3.3 B1–B3 | integration | **proposed** |
| G-31 | 200.000 lead, backfill `BATCH = 500` | hiệu năng + an toàn transaction | ✅ chạy trọn, không timeout. ❌ **Từ chối:** **không** bọc 120.000 dòng trong một transaction | `G05-T21` | integration | **proposed** |
| G-32 | Trỏ `DATABASE_URL` sang host không phải localhost rồi gọi `resetDb()` | **L-X1** | ❌ **Từ chối:** ném lỗi và dừng | `G05-T24`. Mã: `tests/e2e/_helpers/seed.ts:22, :32-34` đã hiện thực đúng — **nhưng chưa có test khẳng định nhánh throw** | unit | **proposed** |
| G-33 | 1 `Lead` có N `LeadChild`, xoá lead | nền L-G1 | ✅ đọc kèm `children`; xoá lead → cascade xoá con | `tests/e2e/r7/lead-child.spec.ts:20, :41` | integration | **existing** ⚠️ |
| G-34 | `leadChildSchema` thiếu `fullName` | nền L-G1 | ❌ **Từ chối:** invalid; hợp lệ → `trialStatus` mặc định `NONE` | `tests/e2e/r7/lead-child.spec.ts:51` | unit | **existing** ⚠️ |
| G-35 | Trùng SĐT khác tên con qua đường intake công khai | nền L-G2 (QĐ-D1) | ✅ gắn thêm `LeadChild` vào lead sẵn có | `tests/lead-intake/ingest.spec.ts` (job `chat-db-tests`, `ci.yml:192`) | integration | **existing** |
| G-36 | Đơn hàng của PH 2 con, hỏi "doanh số theo học sinh" | giới hạn đã biết | ❌ **Từ chối:** trả `NULL`/"chưa phân bổ". **Cấm** chia đều 6tr/con — chia đều là **bịa số** | `G05-T26` | unit | **proposed** |

## 3.CDB — Khu vực C · D · B: số liệu

| # | Use case | Luật (nguồn PRD) | Hành vi mong đợi (kèm ca từ chối) | Bằng chứng (doc + mã) | Loại | Trạng thái |
|---|---|---|---|---|---|---|
| C-1 | 1 PH – 2 con, con A convert, con B chưa | **L-C1 + L-C2** | ✅ C1 = **2**, C3 tử số = **1**. ❌ **Từ chối:** không đếm theo phụ huynh | Doc §C.6.0 điều kiện 3 (nêu thẳng là test đỏ bắt buộc) | integration | **proposed** |
| C-2 | `isChildClosed` vs `CONVERTED_STATUSES` | **L-C1** | ✅ `CLOSED_CHILD_STATUSES = ["ENROLLED"]` **và** `closedAt != null`. ❌ **Từ chối:** test khẳng định nó **KHÁC** `CONVERTED_STATUSES` (`ENROLLED`+`REGISTERED`, cấp lead) | Doc C-00-1 §C.6.0 (yêu cầu test khẳng định khác nhau). Mã: `lib/reports/lead.test.ts:66` chỉ phủ `leadSummary` cũ cấp lead | unit | **proposed** |
| C-3 | Lead `status = REGISTERED` do `ensureOrderPayment` nâng, `convertedAt = NULL` | L-C1 | ❌ **Từ chối:** **không** tính vào C3 | Doc §C.6.0 điều kiện 2; §C.2.3 (bằng chứng lệch 3 định nghĩa) | unit | **proposed** |
| C-4 | Bộ lọc "tháng 8", giao dịch lúc 00:30 ngày 01/08 giờ VN | **L-C3** | ✅ **được đếm**. ❌ **Từ chối:** giao dịch 00:30 ngày 01/09 giờ VN **không** được đếm | Doc §0.1 🔴 "Bẫy giờ VN" (mô tả đúng lỗi `parseDateStart`/`parseDateEnd` hiện tại) | unit | **proposed** |
| C-5 | Kỳ chưa đặt mục tiêu | **L-C4** | ✅ trả `null` → UI hiện "Chưa đặt mục tiêu". ❌ **Từ chối:** **không** hiện `0%` | Doc C-02-2. Mã đã ghim một nửa: `lib/reports/revenue-target.test.ts:38, :45` (`target null` / `target 0` → `rate null`) | unit | **existing** (cho `RevenueTarget`) / **proposed** (cho `LeadTarget`) |
| C-6 | C4 thời gian chốt | L-C1 | ✅ trả `avg` + `median` + `p90` (1 chữ số thập phân). ❌ **Từ chối:** dòng `closedAt < createdAt` **đếm riêng** vào `invalid_rows`, không im lặng bỏ | Doc C-04-1 §C.6.4 | unit | **proposed** |
| C-7 | C5 lần tiếp cận gần nhất | **L-C5** | ✅ chỉ tính `type ∈ {CALL,MESSAGE,NOTE,EMAIL}` **và** `actorId IS NOT NULL`. ❌ **Từ chối:** `STATUS_CHANGE`/`HANDOVER` **không** reset đồng hồ; hoạt động do hệ thống sinh (dedup) **không** reset | Doc §C.6.5 + khối 🔴 bổ sung cuối mục | unit | **proposed** |
| C-8 | Tiếp cận lúc 23:00 hôm qua, xem hôm nay | L-C5 | ✅ hiện **1 ngày**. ❌ **Từ chối:** không được ra `0` (trừ hai **ngày lịch VN**, không trừ hai thời điểm) | Doc §C.6.5 bẫy B4 | unit | **proposed** |
| C-9 | Bảng C-05 với actor không có `leads:view-pii` | L-G11 / L-G9 | ✅ `parentName`/`phone` qua mask **ở server** | Doc §C.6.5 bẫy B6 | integration | **proposed** |
| B-1 | Thu 5tr rồi hoàn 2tr | **L-B2** | ✅ B1 = **3tr**. ❌ **Từ chối:** hiện tại `REFUNDED` bị loại hoàn toàn ⇒ B1 = 5tr | Doc §B.2.3 + Success metric *"thu 5tr rồi hoàn 2tr → B1 = 3tr"* | unit | **proposed** |
| B-2 | Thu 5tr rồi điều chỉnh còn 4tr | **L-B2** | ✅ B1 = **4tr** (bản gốc `CONFIRMED` bị **loại**, bản `ADJUSTED` được tính). ❌ **Từ chối:** hiện tại lấy số **cũ**, bỏ số đúng | Doc §B.2.4 + Success metric | unit | **proposed** |
| B-3 | `refundPayment` cũng set `adjustmentOfId` | L-B2 biên | ❌ **Từ chối:** `NOT EXISTS` chỉ tìm con `ADJUSTED`, **không** tìm con `REFUNDED` (bút toán bổ sung, không thay thế) | Doc §B.6.1 chú thích trong SQL | unit | **proposed** |
| B-4 | `PENDING` (tiền đã về bank, kế toán chưa xác nhận) | L-B1 | ❌ **Từ chối:** không vào doanh thu | Doc §B.2.5 + §B.6.0 bảng | unit | **proposed** |
| B-5 | Range 7 ngày, 2 ngày có giao dịch | **L-B3** | ✅ trả **7 dòng**, 5 dòng giá trị `0` | Doc B-04-1 + Success metric *"range 7 ngày, 2 ngày có giao dịch → trả 7 dòng"* | unit | **proposed** |
| B-6 | Actor HO-level, 2 cơ sở đã đặt mục tiêu + 1 mục tiêu công ty | **L-B4** | ✅ đọc đủ, **không đếm đôi**. ❌ **Từ chối:** hiện `getRevenueTargets` khi `scope === "ALL"` chỉ lấy `centerId = null` ⇒ báo "chưa đặt mục tiêu" | Doc §B.2.11 🔴 + B-02-3 | unit + integration | **proposed** |
| B-7 | `buildRevenueTargetReport` gom theo `monthKeyVN(paidDate)` | nền L-B1 | ✅ gom đúng tháng VN; kỳ có doanh thu không mục tiêu → `target null` | `lib/reports/revenue-target.test.ts:55, :78` | unit | **existing** |
| B-8 | Import chi phí bằng file mẫu, file có 3 dòng lỗi | B-05-1 | ✅ báo **đủ 3 dòng lỗi**. ❌ **Từ chối:** không dừng ở dòng đầu | Doc B-05-1 (khuôn `import/holidays` 2 stage + mảng `errors`) | unit | **proposed** |
| D-1 | Chạy job ads **hai lần** cùng ngày | **L-D1** | ✅ số dòng **tăng**, **không** dòng nào đổi giá trị. ❌ **Từ chối:** cấm `upsert` (ghi đè lịch sử) | Doc D-01-1 + Success metric *"chạy job 2 lần cùng ngày → số dòng tăng, không dòng nào đổi giá trị"*; T-02; Cổng B3 | integration | **proposed** |
| D-2 | 3 snapshot cùng khoá tự nhiên, khác `fetchedAt` | **L-D2** | ✅ resolver trả **một** số (bản mới nhất). ❌ **Từ chối:** quên `DISTINCT ON` ⇒ cộng 7 lần cùng một khoản | Doc §D.6.2(4) rào cản + §D.6.8 | unit | **proposed** |
| D-3 | Parser `SR.QD.232` — 18 chuỗi vào | **L-D3** | ✅ 6 case ra `CENTER`/`MULTI` (kể cả viết thường, khoảng trắng, chỉ mã). ❌ **Từ chối:** `CS3` chưa mở → `CODE_NOT_FOUND`; mã **không** đứng đầu → `CODE_NOT_FOUND`; dùng `-` thay `_` → `NO_PREFIX`; có dấu tiếng Việt → `CODE_NOT_FOUND`; `null`/rỗng → `EMPTY` | Doc §D.6.5 **bảng 18 test-case viết sẵn**; `knownCodes` không hardcode | unit | **proposed** |
| D-4 | Campaign parse ra `MULTI` **chưa** khai tỷ lệ | **L-D4** | ❌ **Từ chối:** toàn bộ chi tiêu vào `CHƯA PHÂN BỔ`. **Không** chia đều, **không** đoán | Doc D-07-2 + §D.6.6 chú thích trong `resolveAllocation` | unit | **proposed** |
| D-5 | Có override cấp ADSET **và** cấp CAMPAIGN **và** parser đều ra kết quả | **L-D4** | ✅ **adset thắng**. Thứ tự: adset → campaign → parser → CHƯA PHÂN BỔ | Doc D-07-1 (*"Có test khẳng định thứ tự này"*) | unit | **proposed** |
| D-6 | Mapping có `effectiveTo` = hôm qua, `statDate` = hôm nay | L-D4 | ❌ **Từ chối:** mapping hết hiệu lực không áp; số quá khứ **không đổi** khi sửa mapping từ hôm nay | Doc §D.6.1 đánh đổi 2 + §D.6.6 B3/B5 | unit | **proposed** |
| D-7 | Lưu mapping với tổng `ratioBp` = 9.900 | **L-D5** | ❌ **Từ chối:** *"Tổng tỷ lệ phải bằng 100% (đang là 99,00%)"* | Doc §D.6.6 ràng buộc tổng + bẫy B1 | unit | **proposed** |
| D-8 | Chia `spend` theo tỷ lệ cho 3 cơ sở | **L-D5** | ✅ `Σ phần chia = spend` với **mọi** bộ tỷ lệ (dùng lại `allocateByWeight`). ❌ **Từ chối:** không được viết phép chia thứ hai | Doc §D.6.6 bẫy B1. Mã nền đã ghim: `lib/finance/allocate.test.ts` | unit | **proposed** (bọc lại hàm có sẵn) |
| D-9 | Actor CS2 đọc chi tiêu | **L-D6** | ❌ **Từ chối:** 0 dòng của CS1; hai actor cho **hai** con số chi phí khác nhau | Doc D-01-4 + Success metric; Cổng B5 | integration | **proposed** |
| D-10 | Meta trả `account_currency = "USD"` | **L-D7** | ❌ **Từ chối:** `AdsSyncRun.status = BLOCKED`, **0 dòng** `AdsSpendDaily`; **không** tự đoán tỷ giá | Doc T-04 · IM-07 · Cổng B4 | integration | **proposed** |
| D-11 | Gọi Meta | **L-D8** | ✅ token trong header `Authorization`. ❌ **Từ chối:** `grep "access_token="` trong `lib/` = **0** | Doc D-01-3 + Success metric; Cổng B6 | unit | **proposed** (test kiểu grep nguồn) |
| D-12 | Job chạy, Meta trả 0 dòng, HTTP 200 | **L-D9** | ✅ ghi **1** dòng `AdsSyncRun` với `rowsFetched = 0`. ❌ **Từ chối:** trạng thái là `INCONCLUSIVE`, **không** `OK` | Doc IM-08 + T-01 + Cổng B2/C1 | integration | **proposed** |
| D-13 | Lỗi ở bản ghi thứ k giữa lô | L-D9 | ✅ trạng thái `PARTIAL` **tách riêng** khỏi `FAILED`; `rowsFetched`/`rowsParsed`/`rowsWritten`/`rowsSkipped` đều ghi | Doc IM-08 | integration | **proposed** |
| D-14 | Lịch cron + timezone tài khoản QC | **L-D10** | ✅ `"0 17 * * *"` UTC = 00:00 VN; `accountTimezone` khác kỳ vọng ⇒ `BLOCKED`. ❌ **Từ chối:** đối soát phải có mẫu **ngày cuối tháng** (mẫu duy nhất phân biệt IM-06) | Doc T-05 · IM-06 · Cổng B7/C3 | unit + manual | **proposed** (phần đối soát ngày cuối tháng là `manual`) |
| D-15 | CPL/CPA khi mẫu số = 0 | **L-C4** | ✅ hiện `—` + lý do, hiện mẫu số cạnh tỷ số. ❌ **Từ chối:** **không bao giờ** hiện `0` | Doc T-08 + Cổng C7. Mã hiện có ghim ngược: `lib/crm/marketing-metrics.test.ts:15` assert *"chia 0 an toàn"* → trả **0** | unit | **proposed** (kèm sửa kỳ vọng cũ) |
| D-16 | CPL lấy mẫu số từ đâu | L-C2 | ✅ mẫu số = **C1** (học sinh). ❌ **Từ chối:** **không** dùng `qualifiedAt IS NOT NULL` — trường đó gần như không có dữ liệu (đường ghi duy nhất chỉ được test gọi) | Doc D-04-1 + §C.2.4 | unit | **proposed** |
| D-17 | `parseMetaInsights` với payload hợp lệ / không hợp lệ | nền D | ✅ ra records; ❌ payload sai → rỗng | `lib/crm/ads-insights.test.ts:6, :19` | unit | **existing** ⚠️ (nhưng parser này **thiếu** `campaign_id`/`adset_id` ⇒ không dùng được cho D-06) |

## 3.E — Khu vực E: tương tác KH

| # | Use case | Luật (nguồn PRD) | Hành vi mong đợi (kèm ca từ chối) | Bằng chứng (doc + mã) | Loại | Trạng thái |
|---|---|---|---|---|---|---|
| E-1 | Mở panel chat rồi đóng | **L-E1** | ✅ URL vẫn `/dashboard`; `?center=`, `?dateFrom=`, `?dateTo=`, `?tab=` **nguyên vẹn từng ký tự**. ❌ **Từ chối:** đóng chỉ được xoá **đúng một** khoá `?chat=` | Doc E-04-3 + §6.5.2 bảng luồng | integration | **proposed** |
| E-2 | Vai scope `OWN` (Sale) mở nhóm lớp trong panel | **L-E2** | ✅ ô nhập tin **gõ được**. ❌ **Từ chối:** thiếu `createdById` trong `sendTarget` ⇒ xám ô nhập **trên prod** trong khi Server Action vẫn cho gửi — **và không lộ ở local** (local chạy RBAC v1) | Doc E-04-6 + §6.4.5 (4 khối chú thích "đã trả giá"). Mã nền: `lib/auth/can.ts` nhánh `OWN` đã có test ở `lib/auth/can.test.ts` | integration | **proposed** |
| E-3 | Màn số liệu E-02/E-03 đọc `Conversation` | **L-E3** | ✅ tự lọc `centerId ∈ getVisibleCenterIds(actor)`. ❌ **Từ chối:** QLCS CS1 → **0 dòng** của CS2, kể cả khi truyền `?center=cs2` | Doc E-02-4 + §6.6 luật 2. **Mẫu tương đương đã có test thật:** `lib/chat/pilot-stats-scope.test.ts:290, :301, :308, :315` | integration | **proposed** (nhân bản mẫu đã có cho tab E) |
| E-4 | Nhóm lớp có `centerId = NULL` | L-E3 fail-closed | ✅ **bị bỏ**, không rơi vào bất kỳ cơ sở nào | `lib/chat/pilot-stats-scope.test.ts:346` | integration | **existing** (cho chat-pilot) / **proposed** (cho tab E) |
| E-5 | Định nghĩa "đã tương tác" **gồm** kênh 1-1 | **L-E4** | ❌ **Từ chối:** **không** được lọc qua `Conversation.centerId` (DM luôn `centerId = null` ⇒ loại sạch DM); phải lọc qua cơ sở của **enrollment** | Doc §6.2 "bẫy chung" + §6.6 luật 3 | integration | **proposed** |
| E-6 | GV / PH gọi endpoint E-03 | **L-E5** | ❌ **Từ chối:** 403 **hoặc** payload **không có trường `phone`**. Không ẩn bằng CSS | Doc E-03-2/3 + Success metric *"SĐT PH lọt sang người không có quyền → 0"*; `canViewParentContact` loại `TEACHER` có chủ đích | integration | **proposed** |
| E-7 | Payload `members` truyền xuống client | L-E5 | ✅ đúng 3 khoá `userId`/`displayName`/`roleLabel`. ❌ **Từ chối:** **không** kèm `contact` — *"MỌI khoá của nó đi xuống trình duyệt trong payload RSC, kể cả khoá không component nào render"* | Doc E-03-3 + §6.4.4 mục 4 | unit | **proposed** |
| E-8 | QLCS bấm kênh 1-1 mình không thuộc | **L-E6** | ❌ **Từ chối:** thông điệp tiếng Việt + lối đi thay thế; **không** 500, **không** stack trace | Doc E-04-5 + Success metric *"Panel mở kênh không được phép → báo lỗi rõ, không 500"* | integration | **proposed** |
| E-9 | E-01 đổi range ngày | **L-E7** | ✅ số đổi theo. ❌ **Từ chối:** **không** dùng lại `sessionIncomplete` (cứng `date < startOfToday`, scope đơn trị) | Doc E-01-1 + Success metric *"tạo 3 buổi ở 3 ngày, đổi range → số đổi theo"* | integration | **proposed** |
| E-10 | E-01 với QLCS giữ CS1 + CS2 | L-E7 + L-A1 | ✅ đếm **gộp cả hai**. ❌ **Từ chối:** không đọc `session.user.centerId` | Doc E-01-4 + Success metric | integration | **proposed** |
| E-11 | Con số E-01 vs danh sách khi bấm vào | L-E7 | ✅ khớp — cùng hàm phân bậc, cùng bộ lọc | Doc E-01-3. Mã nền đã ghim: `lib/lms/attendance-queue.test.ts` (34 case, hàm thuần) | unit | **existing** (hàm thuần) / **proposed** (khớp con số ↔ danh sách) |
| E-12 | E-02 mẫu số | **L-E8** | ✅ PH có ≥1 enrollment `status ∈ ENROLLMENT_ACTIVE_STATUS_LIST` + `deletedAt IS NULL` ×3 + `isActive = true`. ❌ **Từ chối:** một PH hai con đếm là **1**; PH có con `WITHDREW`/`COMPLETED` **không** vào mẫu số | Doc E-02-2 + OQ-2. Mã nền: `lib/enrollments/status.test.ts` | integration | **proposed** |
| E-13 | Mẫu số = 0 | L-C4 | ✅ hiện `—`, **không** `0%` | Doc E-02-1. Mẫu đã có: `lib/chat/pilot-stats-scope.test.ts:371` (*"mẫu số 0 → '—' chứ không phải 0% hay 100%"*) | unit | **existing** (cho chat-pilot) / **proposed** (cho E-02) |
| E-14 | File `"use server"` mới của E-04 | **L-E9** | ✅ mọi `export` là `async function`. ❌ **Từ chối:** `export type` / `export const` / re-export ⇒ `ReferenceError` lúc eval module ⇒ chết **toàn bộ** action trong module — **mà `typecheck` + `lint` + `build` đều XANH** | Doc §6.5.4 (nêu thẳng đây là 1 trong 5 bug lọt mọi cổng test) | unit | **proposed** (test kiểu quét nguồn) |
| E-15 | Chiều rộng/cao panel ở 375px / 768px / 1440px | Doc §8.4 mục 1 | ✅ vùng cuộn tin cuộn **bên trong** panel | Doc §6.5.1 cảnh báo 1 & 2 + §8.4 (*"xanh hết ở typecheck + lint + build + unit test mà vẫn hỏng thật"*) | manual | **none** |
| E-16 | Ô nhập tin có xám không, với vai QLCS **thật trên prod/test** | L-E2 (tầng người) | ✅ gõ được | Doc §8.4 mục 2 (chỉ lộ trên v2, không lộ ở local) | guarded live | **proposed** |

---

# BƯỚC 4 — PROPOSED TESTS

Nguyên tắc: **test nhỏ nhất ghim đúng một ranh giới**. Ưu tiên `unit` cho mọi thứ tách được thành hàm thuần; chỉ lên `integration` khi ranh giới **là** truy vấn/transaction. Mỗi test nêu rõ **case từ chối phải bắt được** — đó mới là phần chịu lực.

## 4.A — Khu vực A

| Tên test | Arrange / Act / Assert | Ca TỪ CHỐI phải bắt được | Loại |
|---|---|---|---|
| `[A-01] buildActor — 2 UserOrgRole tại 2 CENTER khác REGION → union đúng 2` | **A:** `ORG` có `ho → region-A → cs1`, `ho → region-B → cs3`; 2 dòng `CENTER_MANAGER` tại `cs1` + `cs3`. **Act:** `buildActor`. **Assert:** `visibleCenterIds.sort() === ["c1","c3"]`, `isHoLevel === false` | Thêm cơ sở thứ ba `cs2` vào ORG ⇒ `visibleCenterIds` **không** chứa `c2` | unit |
| `[A-01] neo vai tại HO → isHoLevel bật, thấy MỌI cơ sở (đối chứng âm)` | Một dòng `CENTER_MANAGER` tại `ho` ⇒ `visibleCenterIds` = mọi center | Đây là ca **phải chặn ở form** (A-6) — test này chứng minh vì sao | unit |
| `[A-02] resolveScopeFilters — id ngoài phạm vi bị loại im lặng` | **A:** actor `visibleCenterIds = ["c1","c2"]`. **Act:** `resolveScopeFilters(actor, { center: "c1,c9" })`. **Assert:** `centerIds === ["c1"]` | `center: "c9"` (chỉ id lạ) ⇒ `centerIds === []` **hoặc** phạm vi actor — **không** throw, **không** `null` nghĩa "tất cả" | unit |
| `[A-02] mặc định — không searchParams` | `dateFrom` = 00:00 ngày 01 tháng hiện tại **giờ VN**; `dateTo` = 00:00 ngày **mai** giờ VN (nửa mở) | Giao dịch 00:30 ngày 01 giờ VN **phải** nằm trong khoảng | unit |
| `[A-02] khoá cache gồm centerIds đã sắp xếp` | `key(["c2","c1"]) === key(["c1","c2"])` và `key(["c1"]) !== key(["c1","c2"])` | Hai bộ lọc khác nhau **không** ra cùng khoá | unit |
| `[A-03] export lead: AND hai quyền` | Ma trận 4 ô: (view-all ✓, export ✓) → 200; (✓,✗) → 403; (✗,✓) → 403; (✗,✗) → 403 | Ô (✗,✓): actor HO-level không có `leads:*` **không** xuất được — đây là ô mà cách viết "THAY THẾ" sẽ cho 200 | integration |
| `[A-03] leads:export không đến từ role nào` | Duyệt `ROLE_SEED` + ma trận v1 ⇒ 0 vai có `leads:export`; **đồng thời** `ALL_ACTIONS` **vẫn chứa** key | Xoá key khỏi `PERMISSIONS` ⇒ test đỏ (bảo vệ RT-4) | unit |
| `[A-03] màn per-user chặn leads:*` | Gọi action cấp grant với 10 key `leads:*` lần lượt | **Cả 10** bị từ chối; `roles:*`/`users:manage` vẫn bị chặn (không hồi quy) | integration |
| `[A-03] file export chỉ chứa lead trong visibleCenterIds` | Seed 3 lead: CS1, CS2, CS3. Actor giữ CS1+CS2 | 0 dòng CS3; và khi số dòng chạm trần ⇒ file/UI **báo bị cắt** | integration |
| `[A-01-6] QLCS 2 cơ sở điểm danh + chốt buổi ở cơ sở thứ hai` | Lớp ở CS2, actor giữ CS1+CS2 | Lớp ở CS3 → 403 | integration |
| `[SL-01] reconcile chỉ thu hồi dòng source=AUTO` | Seed 1 dòng `AUTO` + 1 dòng `MANUAL` **cùng orgUnit**; chạy `reconcileUserOrgRoles` | Dòng `MANUAL` **không** bị `EXPIRED` — đây đúng ca va chạm mà §6.1 mô tả | integration |

## 4.F — Khu vực F

### Nhóm hàm thuần (rẻ nhất, làm trước)

| Tên test | Arrange / Act / Assert | Ca TỪ CHỐI phải bắt được | Loại |
|---|---|---|---|
| `[F-16] isClassFolderClosed` | Bộ đếm `{PENDING:1, APPROVED:3, DRAFT:2}` → `false`; `{APPROVED:3, DELETED:1, DRAFT:2}` → `true`; `{}` (total 0) → `false` | `DRAFT` **không** được vào mẫu số; folder rỗng **không** bị coi là đã đóng (đó là ca cần nút F-14) | unit |
| `[F-16] RESOLVED_STATUSES gồm REJECTED` | `RESOLVED_STATUSES` chứa `APPROVED`, `DELETED`, **và** `REJECTED` | Bỏ `REJECTED` ⇒ mọi lớp cũ có ảnh bị từ chối **không bao giờ đóng được** | unit |
| `[F-18] mergeSegments` | `[[0,5],[3,8]]` → `[[0,8]]`; `[[0,5],[6,9]]` với `GAP=1` → `[[0,9]]`; `[[0,5],[8,9]]` → 2 đoạn | Đoạn `b <= a` bị loại; đầu vào không sắp xếp vẫn ra kết quả đúng | unit |
| `[F-18] coveredSeconds không vượt duration` | Xem lại nhiều lần cùng đoạn ⇒ tổng không tăng | `watchedSec` không bao giờ > `durationSec` | unit |
| `[F-18] isWatchComplete` | `(95,100)` → `true`; `(94,100)` → `false`; `(x, null)` → **`false`** | `durationSec = null` ⇒ **không bao giờ** hoàn thành (nền của F-26) | unit |
| `[F-18] chống tua — chuỗi sự kiện` | Chuỗi: `tick(pos=0)`, `seek(pos=duration)`, `tick(pos=duration+2, wall+2s)` | `watchedSec` tăng đúng **2**, `completedAt` vẫn `null`. Bước nhảy `dPos > dWall + 2` **không** được cộng | unit |
| `[F-18] server kẹp đoạn giả mạo` | `lastFlushAt = now - 3s`, client gửi `[[0, 600]]` | Đoạn bị cắt về `(3 × 1.5 + 5) = 9.5s`; `completedAt` **không** set | unit |
| `[F-31] evaluateMediaSla — 4 trạng thái + biên` | Ma trận: `NO_PHOTO` → `KHONG_CO_ANH`; `OPEN` (kể cả quá hạn) → `CHUA_DUYET`; `APPROVED_ALL` + `reviewedAt < deadline` → `DA_DUYET`; `> deadline` → `PHE_DUYET_TRE` | Biên `reviewedAt === deadlineAt` — chốt tường minh **trong test**, không để mã tự quyết | unit |
| `[F-32] mediaSlaNote — 3 nhánh` | Trễ → `"<duyệt> / <deadline>"`; `CHUA_DUYET`/`DA_DUYET` → `""`; `KHONG_CO_ANH` → `noPhotoNote` | `noPhotoNote = null` ở nhánh `KHONG_CO_ANH` → `""`, không `undefined`, không crash | unit |
| `[F-20] computeReviewDeadline` | `reviewDate` + `offsetDays=1`, `hour=10` giờ VN → UTC đúng | Ngày chuyển tháng / cuối tháng vẫn đúng | unit |
| `[F-05] decideMediaRetention` | 4 ca: chưa tới hạn → `KEPT_NOT_DUE`; có học bạ `PENDING_REVIEW` → `KEPT_REPORT_CARD_UNPUBLISHED` + `reportCardId`; có học bạ `RECALLED` → **giữ**; mọi học bạ `PUBLISHED` → `DELETED` | Ca `linkedReportCards = []` — 🔴 **chặn bởi OQ-F4**, không viết cho tới khi chốt (xem F-32 ở §3.F) | unit |
| `[F-12] getClassMediaBucket fail-closed` | env trống → throw; env = `R2_BUCKET_NAME` → throw; env hợp lệ → trả tên | **Không** rơi về bucket công khai ở bất kỳ nhánh nào (khuôn `lib/storage/chat-storage.test.ts`) | unit |
| `[F-12] buildMediaObjectKey không chứa tên người dùng` | 50 tên file mẫu (gồm `be-an-lop-3a.jpg`) → key sinh ra **không chứa** chuỗi gốc | Hàm `keyContainsName` trả `false` cho mọi mẫu | unit |
| `[F-14] isOwnStorageUrl fail-closed` | Thiếu env R2 → **`false`**; URL `https://cdn.satarobo.vn.evil.com/x` → `false`; URL hợp lệ → `true` | Nhánh `catch` **không** được trả `true` | unit |

### Nhóm integration (Postgres local)

| Tên test | Arrange / Act / Assert | Ca TỪ CHỐI phải bắt được | Loại |
|---|---|---|---|
| `[F-03] máy trạng thái — bảng chuyển tiếp đầy đủ` | Bảng tham số hoá: mỗi cặp `(từ, đến)` × `(được phép?)`. Chạy action tương ứng | **7 cặp bị cấm** đều throw/`fail`: `APPROVED→REJECTED`, `REJECTED→APPROVED`, `DELETED→*`, `APPROVED→DRAFT`, `PENDING→DRAFT`, `DRAFT→APPROVED` (qua reviewMedia), `∅→APPROVED` | integration |
| `[F-03] không ai bỏ qua bước duyệt` | Actor `SUPER_ADMIN` (có `media:approve`) upload 1 ảnh | Trạng thái là **`PENDING`**. ⚠️ Phải **sửa** `[KHO-03]` (`tests/e2e/r7/media-draft.spec.ts:146`) đang assert ngược | integration |
| `[F-03] từ chối → object R2 biến mất` | Fake S3 client đếm `DeleteObjectCommand`; từ chối 1 media | `HeadObject` trả 404; row **còn** với `status = DELETED` + `deletedAt/By/Reason` | integration |
| `[F-03] R2 lỗi 500 khi xoá` | Fake client throw ở `DeleteObject` | **0** row bị mất mà object còn; **0** object bị xoá mà row còn. Đếm trước/sau khớp | integration |
| `[F-04] PH chỉ thấy media APPROVED + đúng buổi` | Ma trận **3 HV × 3 buổi × 2 loại media** (tag / class-wide) so với bảng kỳ vọng viết trước | HV không có `Attendance` ở buổi S → **không** thấy media gắn `S`, **kể cả** `isClassWide = true` | integration |
| `[F-04] media classSessionId = null` | Theo quyết định OQ-F5 | Nếu chọn "lọc" ⇒ test khẳng định media cũ **biến mất** (để không ai bật mù) | integration |
| `[F-11] isClassWide + HV thu hồi consent` | Lớp 3 HV, 1 HV `REVOKED`; publish với `isClassWide = true` | ❌ **reject** kèm danh sách tên. Đây là ca `security-media.md` §7 nói thẳng là **chưa có test nào** | integration |
| `[F-13] duyệt cả folder = 1 lời gọi` | Folder 40 ảnh `PENDING` | Sau action: 40 ảnh `APPROVED`, **1** `writeAudit`, **1** `ClassMediaReviewDay` `APPROVED_ALL` | integration |
| `[F-13] khoá nút khi còn video chưa xem hết` | 2 video: `watched 0.90` và `0.96`, cùng `userId` | `canApproveAll === false` + **lý do cụ thể**. Đổi `0.90 → 0.96` ⇒ `true` | integration |
| `[F-18] tiến độ theo NGƯỜI` | QLCS A xem hết; QLCS B chưa | `canApproveAll` của B = `false` | integration |
| `[F-14] hai nút loại trừ tuyệt đối` | Folder có media, gọi `closeMediaReviewDay(NO_PHOTO)` | ❌ **từ chối ở server**; ghi chú < 10 ký tự cũng từ chối | integration |
| `[F-13] chống đua GV-upload vs QLCS-chốt` | Chụp `mediaCount` rồi chèn 1 media mới trước khi commit | ❌ server **từ chối** (mẫu `DRAFT_RACE`), **không** duyệt kèm ảnh mới | integration |
| `[F-13] transaction toàn vẹn` | Ném lỗi giữa `closeMediaReviewDay` | **0** media đổi trạng thái **và 0** dòng `ClassMediaReviewDay` | integration |
| `[SL-02] cách ly media theo cơ sở` | Seed media CS1 + CS2; actor CS1 gọi `sdb.classSessionMedia.findMany()` **không** `where` | **0** dòng CS2 | integration |
| `[SL-02] create media thiếu centerId` | Gọi đường tạo mà không set `centerId` | Test **bắt lỗi** (không cho lọt row vô hình) | integration |
| `[SL-02] backfill media có classId trỏ lớp đã xoá` | 1 media mồ côi | `centerId = NULL`, **không crash**, dòng được liệt kê ra báo cáo | integration |
| `[F-10] 500 media / 3 ngày` | Seed 500 media ở 3 ngày | Số đếm folder = số ô lưới; **mọi** ảnh tới được; không truy vấn nào nạp > 500 dòng | integration |
| `[F-21] cron deadline idempotent` | Chạy handler **5 lần** | Đúng **1** `StaffNotification` (unique `[userId, dedupeKey]`) | integration |
| `[F-21] người nhận theo tầm nhìn cơ sở` | Lớp CS2 quá hạn; QLCS-A giữ CS1, QLCS-B giữ CS1+CS2 | A **không** nhận, B nhận. Cấm lọc bằng `User.centerId` đơn trị | integration |
| `[F-05] retention idempotent` | Chạy `--apply` 3 lần | Lần 2, 3: 0 xoá thêm, 0 log trùng | integration |
| `[cron] verifyCronAuth` | Gọi mọi route cron mới **không** header | **401** — và một test tham số hoá chạy cho **cả 23 route hiện có** (vá §1.4c) | integration |

### Guarded live / manual (không chặn merge)

| Tên | Nội dung | Loại |
|---|---|---|
| `curl không cookie vào 5 object key (2 PENDING, 3 APPROVED)` | Phải **403/404** cả 5 (Cổng A1/B1) | guarded live |
| `signed URL hết hạn → 403` | Ghim TTL thật (Cổng B6). ⚠️ `security-media.md` §12 ghi: test hiện tại **được đặt tên** là bằng chứng cho điều này nhưng **không kiểm điều đó** — sửa hoặc đổi tên | guarded live |
| `cron media chạy thật trên prod` | Có chỉ số "lần chạy cuối" (Cổng C2) | guarded live |
| `diễn tập khôi phục 1 ảnh đã xoá` | Có biên bản (Cổng A3) | manual |
| `3 QLCS × 20 lượt vuốt nút X lớn` | 0 lần nhầm không hoàn tác được (Cổng A8) | manual |

## 4.G — Khu vực G

| Tên test | Arrange / Act / Assert | Ca TỪ CHỐI phải bắt được | Loại |
|---|---|---|---|
| `[G05-T01a] lead đã có 2 con + childName → KHÔNG tạo con thứ ba` | Seed đúng dữ liệu §3.1 (i-a); chạy backfill | Số `LeadChild` vẫn **2**; `fullName`/`ageYears` **không đổi**; `Lead.childName` **giữ nguyên** | integration |
| `[G05-T01b] 2 lead cùng SĐT mỗi lead 1 con → KHÔNG gộp` | Dữ liệu §3.1 (i-b) | 2 `Lead` + 2 `LeadChild`; **cả hai** mang `DUP_SUSPECT`; `status`/`assignedToId`/`deletedAt` **không đổi** | integration |
| `[G05-T02] 3 lead trùng SĐT` | Bảng kiểm §3.1 (ii) | `LeadChild` mới = **2** (D3 `childName NULL` không tạo); 3 `LeadActivity`; **0** `Order`/`Note` bị đụng | integration |
| `[G05-T03] khoá gom là phần LÕI SĐT` | 3 dạng `0905123456` / `84905123456` / `0905 123 456` | **1 nhóm 3 lead**. Gom theo `phone` thô ⇒ **test PHẢI FAIL** | integration |
| `[G05-T03b] dedup nhập tay bắt 0…/84…` | DB có `84905123456`, nhập tay `0905123456` | ❌ **bị chặn**. Trước khi vá: tạo được lead thứ tư (test ghim bug rồi ghim bản vá) | integration |
| `[G05-T04] 10.000 sạch + 5 thiếu` | Bảng M1–M5 §3.1 (iii) | Exit code **0**; 10.000 lead chuyển đủ; log in **từng** lead bị cờ kèm lý do | integration |
| `[G05-T07/T08] childName rỗng` | `""`, `"   "`, `NULL`; có/không có `LeadChild` sẵn | 0 dòng mới; **không** placeholder; cờ `MISSING_CHILD_NAME` chỉ đặt khi lead **chưa** có con | integration |
| `[G05-T09] chống nhân đôi theo tên` | `childName = "Cao Minh Thư"` + `LeadChild "cao minh thư"` và `"Cao  Minh  Thư"` | **0** dòng mới ở cả hai biến thể | integration |
| `[G05-T11/T12] lead xoá mềm` | `deletedAt != null` | Không tạo con; nhóm trùng chỉ đếm lead sống | integration |
| `[G05-T15] 4 khoá tìm kiếm theo tên con` | Lead có con thứ hai `"Ngô Bảo Trâm"`; gõ `"Bảo Trâm"` | **Cả 4** đường trả về lead. **ĐỎ trước, xanh sau** | integration |
| `[G05-T18] cách ly LeadChild` | Lead CS1 (2 con) + Lead CS2 (1 con); actor CS1 | **Đúng 2** dòng; 0 dòng CS2 | integration |
| `[G05-T19] mask PII phủ children[]` | Actor `leads:view-all` không `leads:view-pii` | `childName` **và** `children[].fullName` đều mask. Mở rộng `lib/lead/pii.test.ts:17` | unit |
| `[G05-T20] danh sách PII dạng chuỗi` | Quét `instrumentation-client.ts` + `registry/crm.ts` | Trường tên con mới **có mặt** ở cả hai. `typecheck` không bắt được ⇒ phải là test | unit |
| `[G05-T22/T23] idempotent + đứt giữa chừng` | Kill ở 50%; chạy lại; chạy `--apply` ×3 | 0 nhân đôi, `migrationFlags` không nhân bản phần tử | integration |
| `[G05-T25] convert prefill từ children` | Lead cũ sau backfill | `prefillStudents` lấy `lead.children`, **không** fallback `childName`; **không bao giờ** dùng `parentName` | integration |
| `[G05-T26] doanh số PH 2 con` | Lead 2 con + 1 `Order` 12tr | Trả `NULL`/"chưa phân bổ". ❌ **Cấm** chia đều 6tr/con | unit |
| `[G-04] preference — userId từ session` | Payload mang `userId` khác | Server bỏ qua payload, dùng session | integration |
| `[G-04] khoá lạc / JSON hỏng / visible rỗng` | 3 ca §7.5 | Bỏ qua im lặng · dùng mặc định **không throw** · không render bảng 0 cột | unit |
| `[C-06] rớt bắt buộc lý do` | Thiếu `lostReasonId`; `lostReasonId` đã `isActive=false` | Cả hai **từ chối**, thông điệp tiếng Việt khác nhau | integration |
| `[N-4] lastActivityAt bump ở 15/15 đường` | Test tham số hoá theo 15 vị trí liệt kê ở `CDB-dashboard.md` §C.2.5 | Mỗi đường tạo `LeadActivity` ⇒ `lastActivityAt` bump | integration |
| `[SLA-4] evaluateSla đọc lastActivityAt` | `updatedAt = now`, `lastActivityAt = now - 3d` | Trả `["SLA-4"]`. Hiện tại **không bao giờ nổ** | unit |
| `[đối soát] tiền không đổi qua migration` | Chạy B1–B3 trước/sau | Bằng **chính xác tuyệt đối**; lệch 1 đồng ⇒ đỏ | integration |
| `[G05-T24] resetDb fail-safe` | `DATABASE_URL` trỏ host lạ | **Throw**, không xoá gì | unit |

## 4.CDB — Khu vực C · D · B

| Tên test | Arrange / Act / Assert | Ca TỪ CHỐI phải bắt được | Loại |
|---|---|---|---|
| `[C-00] isChildClosed KHÁC CONVERTED_STATUSES` | So hai hằng số + hàm | `{status:"ENROLLED", closedAt:null}` → **`false`**; `REGISTERED` → `false` | unit |
| `[C1/C3] 1 PH 2 con, con A chốt` | Seed; gọi `countLeadStudents` + `getSuccessRate` | C1 = **2**, tử số = **1**. Đếm theo PH ⇒ đỏ | integration |
| `[C3] cohort — mẫu số neo createdAt` | Lead vào T7 chốt T8 | Tỷ lệ của **lứa T7**, không phải "chốt trong T8 / vào T8". Không vượt 100% | unit |
| `[C4] avg/median/p90 + dòng bẩn` | 5 dòng gồm 1 dòng `closedAt < createdAt` | `invalid_rows = 1` **đếm riêng**, không im lặng bỏ; median/p90 tính trên 4 dòng còn lại | unit |
| `[C5] lọc type + actorId` | `LeadActivity` gồm `STATUS_CHANGE`, `HANDOVER`, và `NOTE` với `actorId = null` (do dedup) | **Không** cái nào reset đồng hồ | unit |
| `[C5] trừ hai NGÀY lịch VN` | Tiếp cận 23:00 hôm qua | Ra **1**, không phải `0` | unit |
| `[C3] khoảng nửa mở + giờ VN` | Giao dịch 00:30 ngày 01 và 00:30 ngày 01 tháng sau | Cái đầu **vào**, cái sau **ra** | unit |
| `[B-00] netRevenueOf — 5 ca` | (a) chỉ `CONFIRMED` → tổng; (b) `CONFIRMED` + `ADJUSTED` trỏ về → **chỉ** `ADJUSTED`; (c) `CONFIRMED` + `REFUNDED` → tổng có trừ (âm); (d) `PENDING`/`REJECTED` → loại; (e) `deletedAt` → loại | Ca (b): bản gốc **bị loại**, không cộng đôi. Ca (c): `REFUNDED` cũng set `adjustmentOfId` nhưng **không** làm bản gốc bị loại | unit |
| `[B-00] grossRevenueOf ≠ netRevenueOf` | Cùng bộ dữ liệu | Hai số **khác nhau** — ghim rằng đây là hai khái niệm, để người sau không gộp | unit |
| `[B5] range 7 ngày, 2 ngày có giao dịch` | `generate_series` | **7 dòng**, 5 dòng `0` | unit |
| `[B6] actor HO đọc mục tiêu cơ sở` | 2 mục tiêu cơ sở + 1 mục tiêu công ty | Đọc đủ theo chế độ đang chọn, **không đếm đôi** | integration |
| `[B-05] import chi phí — file 3 dòng lỗi` | File mẫu hỏng 3 dòng | Báo **đủ 3** `{row, error}`, không dừng ở dòng đầu | unit |
| `[D-06] parseCenterCodeFromCampaignName — 18 case` | Bảng 18 dòng chép nguyên từ `CDB-dashboard.md` §D.6.5, `knownCodes = {"CS1","CS2"}` | 12/18 là ca **từ chối**: `CS3` → `CODE_NOT_FOUND`; mã không đứng đầu → `CODE_NOT_FOUND`; dấu `-` → `NO_PREFIX`; dấu tiếng Việt → `CODE_NOT_FOUND`; `null` → `EMPTY`; `_CS1_…` → `CODE_NOT_FOUND` | unit |
| `[D-07] thứ tự ưu tiên phân bổ` | Cùng lúc có override ADSET + CAMPAIGN + parser hợp lệ | **ADSET thắng**; bỏ ADSET ⇒ CAMPAIGN thắng; bỏ cả hai ⇒ parser; parser `UNKNOWN` ⇒ `[]` (CHƯA PHÂN BỔ) | unit |
| `[D-07] MULTI chưa khai tỷ lệ` | Campaign parse `MULTI`, 0 dòng mapping | Trả `[]` — **không** chia đều | unit |
| `[D-07] effectiveFrom/To` | `statDate` ngoài khoảng hiệu lực | Mapping **không** áp; số quá khứ không đổi | unit |
| `[D-07] tổng ratioBp = 10000` | Bộ 3 dòng tổng 9.900 và bộ tổng 10.100 | **Cả hai từ chối**, thông điệp nêu % đang là bao nhiêu | unit |
| `[D-07] bất biến tổng khi chia tiền` | `spend = 1.000.001` chia `[3333, 3333, 3334]` | `Σ phần chia === spend` (dùng lại `allocateByWeight`) | unit |
| `[D-01] append-only` | Chạy handler 2 lần cùng ngày với Meta giả | Số dòng **tăng**; **không** dòng nào đổi giá trị | integration |
| `[D-01] resolver DISTINCT ON` | 3 snapshot cùng khoá, `fetchedAt` khác nhau | Trả **một** số (bản mới nhất). Bỏ `DISTINCT ON` ⇒ đỏ | integration |
| `[D-01] currency ≠ VND` | Meta giả trả `USD` | `AdsSyncRun.status = BLOCKED`, **0 dòng** `AdsSpendDaily` | integration |
| `[D-01] sổ lần chạy` | Handler chạy, Meta trả 0 dòng, HTTP 200 | **1** dòng `AdsSyncRun` với `rowsFetched = 0` và trạng thái **`INCONCLUSIVE`** (không `OK`) | integration |
| `[D-01] lỗi giữa lô` | Lỗi ở bản ghi thứ k | Trạng thái `PARTIAL` **tách khỏi** `FAILED`; 4 con số `rowsFetched/Parsed/Written/Skipped` đều ghi | integration |
| `[D-01] token không vào URL` | Quét nguồn `lib/` | `grep "access_token="` = **0 hit** | unit |
| `[D-01] cách ly chi tiêu theo cơ sở` | Spend chỉ gắn CS1; đọc bằng actor CS2 | **0** | integration |
| `[D] CPL/CPA mẫu số 0` | `leads = 0` | Trả `null` → UI `—`. ⚠️ **Phải sửa** kỳ vọng cũ ở `lib/crm/marketing-metrics.test.ts:15` (đang assert trả `0`) | unit |

## 4.E — Khu vực E

| Tên test | Arrange / Act / Assert | Ca TỪ CHỐI phải bắt được | Loại |
|---|---|---|---|
| `[E-04] mở/đóng panel giữ searchParams` | URL `?center=c2&dateFrom=…&dateTo=…&tab=tuong-tac`; mở `?chat=X`; đóng | Sau khi đóng: **mọi** param cũ nguyên vẹn, chỉ mất `chat` | integration |
| `[E-04] sendTarget đủ 3 khoá` | Dựng `ThreadPanel` cho DM và cho `CLASS_GROUP` | `sendTarget` luôn có `createdById`; với DM thì `classId` đến từ `dmWitnessClassId` (thiếu ⇒ ô nhập xám) | unit |
| `[E-04] không phải participant` | Actor không thuộc hội thoại | Thông điệp tiếng Việt; **không** 500; không stack trace | integration |
| `[E-02/E-03] cách ly Conversation` | Nhân bản `lib/chat/pilot-stats-scope.test.ts:290-346` cho tab E | QLCS CS1 → 0 dòng CS2; `?center=cs2` của người chỉ thấy CS1 → **rỗng**, không phải số của CS2; nhóm `centerId = NULL` **bị bỏ** | integration |
| `[E-02] DM không bị lọc mất` | Định nghĩa "đã tương tác" gồm 1-1 | Lọc qua `enrollment.centerId`, **không** qua `Conversation.centerId` (nếu lọc sai ⇒ tử số rơi về 0 với PH chỉ chat 1-1) | integration |
| `[E-02] mẫu số PH đang có con học` | PH có 2 con cùng lớp; PH có con `WITHDREW`; PH có `isActive = false` | Lần lượt: đếm **1** · **không** đếm · **không** đếm | integration |
| `[E-03] cột SĐT theo canViewParentContact` | Actor `TEACHER` và actor `CENTER_MANAGER` | TEACHER: payload **không có khoá `phone`** (không phải `phone: null`, không ẩn CSS) | integration |
| `[E-03] payload members không có contact` | Dựng props cho `ChatThread` | Object chỉ có `userId`/`displayName`/`roleLabel` | unit |
| `[E-01] đếm theo range` | 3 buổi ở 3 ngày; đổi range | Số đổi theo; buổi `CANCELLED` **không** tính | integration |
| `[E-01] QLCS 2 cơ sở` | Buổi ở CS1 + CS2 | Đếm gộp cả hai; buổi CS3 không tính | integration |
| `[E-04] file "use server" chỉ export async function` | Quét mọi file `"use server"` mới của E | Bất kỳ `export type`/`export const`/re-export ⇒ **đỏ**. (Ba cổng build đều xanh khi vi phạm) | unit |

---

# BƯỚC 5 — CỔNG CI ĐỀ XUẤT

> 🔴 **Đây là ĐỀ XUẤT, cần người duyệt.** Không tự cài. Việc bật branch protection là thao tác trên GitHub, ngoài repo.

## 5.1 Nguyên tắc

| # | Luật | Lý do |
|---|---|---|
| 1 | Bộ **deterministic** (unit + integration chạy được **không cần dịch vụ thật**) chạy trên **MỌI** pull request | Đây là thứ duy nhất chặn được hồi quy trước khi merge |
| 2 | **Guarded-live tách riêng**, `workflow_dispatch` / lịch, **không chặn merge** | Chúng cần Meta API, R2 thật, Supabase Realtime, prod cron — đỏ vì lý do ngoài mã sẽ làm người ta bỏ qua cả cổng |
| 3 | Chặn merge vào `main` bằng **required status check + branch protection** | Xem 5.4 |
| 4 | **DB test là Postgres LOCAL** — service container trong runner, **KHÔNG BAO GIỜ** trỏ Supabase | `.claude/rules/prisma-db.md`; `resetDb()` đã fail-safe ở `tests/e2e/_helpers/seed.ts:22` nhưng đừng dựa vào một lớp bảo vệ |

## 5.2 Lỗ hổng cần vá ngay trong `ci.yml`

| # | Lỗ | Vá đề xuất |
|---|---|---|
| **G1** | 132 case e2e (`r1`–`r6`, `crm`) **không** job nào chạy — gồm **toàn bộ** consent media (`tests/e2e/r3/media-consent.spec.ts`) | Gộp thành **một** job `e2e-regression` chạy tuần tự các suite còn lại trên cùng một service Postgres |
| **G2** | `test:elearning-db` (`package.json:36`) mồ côi | Thêm bước vào job `chat-db-tests` (chi phí ~10 giây, cùng service, cùng seed) |
| **G3** | **0 test cron** cho 23 route | Thêm suite `tests/cron/` + khai vào `vitest.config.ts` `include` **cùng lúc** (nếu quên khai, `vitest run tests/cron` báo "No test files found" và job **vẫn xanh** — đúng bẫy đã ghi ở `vitest.config.ts:19-21`) |
| **G4** | Không có required status check (chưa kiểm chứng được) | 5.4 |

## 5.3 Workflow đề xuất

**(a) Thêm hai bước vào job `chat-db-tests` đang có** — không dựng job mới, tái dùng service + seed:

```yaml
# .github/workflows/ci.yml — job `chat-db-tests`, THÊM sau bước "Run lead-intake DB tests" (:192)

      # ĐỀ XUẤT G2 — `package.json:36` khai script này nhưng KHÔNG job nào gọi.
      # Hôm nay 3 file tests/elearning/*.test.ts đều @vitest-environment node và không
      # chạm DB nên chúng chạy ở job `unit-tests`. Bước này là RÀO CHẶN cho tương lai:
      # thêm một test chạm DB vào thư mục đó kèm skipIf sẽ skip VĨNH VIỄN nếu thiếu.
      - name: Run e-learning DB tests
        run: pnpm test:elearning-db

      # ĐỀ XUẤT G3 — bộ test cron. 23 route dưới app/api/cron/, hiện 0 test.
      # ⚠️ PHẢI khai "tests/cron/**/*.{test,spec}.ts" vào `include` của vitest.config.ts
      #    TRONG CÙNG PR. Thiếu dòng đó thì lệnh dưới báo "No test files found" và job
      #    VẪN XANH — hỏng câm, đúng lớp bẫy vitest.config.ts:19-21 đã ghi.
      - name: Run cron auth + idempotency tests
        run: pnpm exec vitest run tests/cron --reporter=verbose --no-file-parallelism
```

**(b) Job mới `e2e-regression`** — gom 132 case đang không ai chạy:

```yaml
# .github/workflows/ci.yml — ĐỀ XUẤT: job MỚI. Cần người duyệt trước khi thêm.
#
# VÌ SAO: 7 suite dưới đây có config + script trong package.json (:42-47, :50) nhưng
# KHÔNG job nào gọi. Trong đó có tests/e2e/r3/media-consent.spec.ts — 5 bất biến consent
# media mà khu vực F sửa thẳng vào. Không chạy = phá bất biến vẫn XANH.
#
# Chạy TUẦN TỰ trong một job để dùng chung một service Postgres và một lần `pnpm install`.
# Nếu tổng thời gian vượt ~25 phút thì tách r6 + r1 ra job thứ hai chạy song song.
  e2e-regression:
    name: E2E hồi quy (r1–r6 + crm — các suite hiện KHÔNG ai chạy)
    runs-on: ubuntu-latest
    timeout-minutes: 30
    needs: quality

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: ci
          POSTGRES_PASSWORD: ci
          POSTGRES_DB: ci_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      # Postgres LOCAL của runner. TUYỆT ĐỐI không trỏ Supabase (.claude/rules/prisma-db.md).
      # resetDb() ở tests/e2e/_helpers/seed.ts:22 chỉ chấp nhận localhost/127.0.0.1 —
      # đặt sai ở đây thì globalSetup dừng ngay, không âm thầm xoá DB thật.
      DATABASE_URL: postgresql://ci:ci@localhost:5432/ci_test
      DIRECT_URL: postgresql://ci:ci@localhost:5432/ci_test
      NEXTAUTH_SECRET: "ci-build-only-secret-do-not-use-in-prod-32chars"
      # Các suite này test ở tầng service (không cần dev server) — cùng cơ chế r7.
      R7_SKIP_WEBSERVER: "1"

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 11 }
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Generate Prisma client
        run: pnpm exec prisma generate

      - name: Migrate DB schema (local CI Postgres)
        run: pnpm exec prisma migrate deploy

      # RBAC v2 đọc quyền từ DỮ LIỆU. Không seed thì mọi assert quyền của r1/r3/r6 sai
      # vì thiếu RoleDef, không phải vì mã sai.
      - name: Seed RoleDef + RolePermission
        run: pnpm exec tsx prisma/seed-roles.ts

      # Tuần tự, dừng ở suite đỏ đầu tiên. Mỗi config tự nạp .env.test + globalSetup.
      - name: r1 (CRM)
        run: pnpm test:e2e:r1
      - name: r2 (SIS + tài chính)
        run: pnpm test:e2e:r2
      - name: r3 (LMS — gồm media-consent)
        run: pnpm test:e2e:r3
      - name: r4 (Portal)
        run: pnpm test:e2e:r4
      - name: r5 (HR)
        run: pnpm test:e2e:r5
      - name: r6 (hardening)
        run: pnpm test:e2e:r6
      - name: crm
        run: pnpm test:e2e:crm

      - name: Upload báo cáo khi đỏ
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-regression
          path: playwright-report/
          retention-days: 7
```

**(c) Workflow riêng cho guarded-live — KHÔNG chặn merge:**

```yaml
# .github/workflows/live-checks.yml — ĐỀ XUẤT, workflow MỚI. Cần người duyệt.
#
# Bộ này chạm dịch vụ THẬT (R2, Supabase Realtime, Meta API, cron trên prod).
# Nó KHÔNG được nằm trong required status check: đỏ vì token hết hạn hay mạng chập
# là chuyện thường, và một cổng hay đỏ vì lý do ngoài mã sẽ bị người ta bỏ qua —
# rồi lần đỏ THẬT cũng bị bỏ qua theo.
name: Kiểm tra môi trường thật (không chặn merge)

on:
  workflow_dispatch:
    inputs:
      suite:
        description: "acceptance | media-public-read | cron-smoke"
        required: true
  schedule:
    # 02:00 giờ VN = 19:00 UTC hôm trước. Cùng quy ước với các cron trong vercel.json.
    - cron: "0 19 * * *"

jobs:
  live:
    name: Guarded live
    runs-on: ubuntu-latest
    timeout-minutes: 40
    # Môi trường GitHub mang secret riêng + có thể đặt required reviewer.
    environment: test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 11 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile

      # Nghiệm thu chat trên môi trường đã triển khai.
      # playwright.acceptance.config.ts:39 mặc định https://test.satarobo.vn.
      # ⚠️ Bộ này GHI dữ liệu thật — chỉ chạy khi được gọi tay.
      - name: Nghiệm thu chat (tay)
        if: github.event.inputs.suite == 'acceptance'
        run: pnpm exec playwright test -c playwright.acceptance.config.ts
        env:
          ACCEPT_BASE_URL: ${{ vars.ACCEPT_BASE_URL }}

      # Cổng B1 của khu vực F: ảnh CHƯA DUYỆT không được tải bằng URL vô danh.
      # Không mock được — phải curl thật vào CDN.
      - name: Ảnh chưa duyệt không tải được vô danh
        if: github.event.inputs.suite == 'media-public-read' || github.event_name == 'schedule'
        run: pnpm exec tsx scripts/kiem-anh-cong-khai.ts   # ĐỀ XUẤT — script chưa tồn tại

      # Tiền lệ: 20 cron prod CHƯA TỪNG CHẠY vì Authorization rụng theo redirect canonical.
      - name: Cron smoke (đúng 401 khi thiếu header, 200 khi có)
        if: github.event.inputs.suite == 'cron-smoke' || github.event_name == 'schedule'
        run: pnpm exec tsx scripts/kiem-cron-smoke.ts      # ĐỀ XUẤT — script chưa tồn tại
```

## 5.4 Branch protection đề xuất (thao tác trên GitHub, không phải file)

Nhánh nhận code là `test`, nhánh prod là `main` (CLAUDE.md). Đề xuất **hai** mức:

| Nhánh | Required status check | Ghi chú |
|---|---|---|
| `test` | `Quality (typecheck + lint + build)` · `Unit tests (Vitest)` · `Chat DB invariants (Vitest + Postgres local)` · `E2E smoke (Playwright)` · `E2E Phase A0` · `E2E Phase R7` · `E2E Phase FL` · `E2E hồi quy (r1–r6 + crm)` | Đây là **cổng nghiệm thu** — đỏ thì không vào `test.satarobo.vn` |
| `main` | **Toàn bộ danh sách trên** + `E2E site GV #06` + `E2E đào tạo nội bộ EL-07` + `Require branches to be up to date before merging` + `Require a pull request before merging` | Merge vào `main` = **prod đổi ngay** + `deploy.yml` chạy `prisma migrate deploy` lên Supabase prod |

**Không** đưa vào required check: `Kiểm tra môi trường thật` (5.3c) và mọi bộ `tests/acceptance` / `tests/manual`.

Lệnh kiểm trạng thái hiện tại (chạy tay, chỉ đọc):

```bash
gh api repos/:owner/:repo/branches/main/protection --jq '.required_status_checks.contexts'
gh api repos/:owner/:repo/branches/test/protection --jq '.required_status_checks.contexts'
```

---

# BƯỚC 6 — KẾT LUẬN

## Coverage đang có (test THẬT trong repo hôm nay)

| Vùng | Có gì | Bằng chứng |
|---|---|---|
| **Nền cách ly cơ sở** | `injectScope` chèn `centerId IN (visible)`, model ngoài `SCOPED_MODELS` không bị inject, `visibleCenterIds` rỗng → `IN []` không lộ, mọi model có `centerId` đều được phân loại | `lib/db-scope.test.ts:49-80`, `:220-234` |
| **Chống IDOR theo id** | `passesScope` chặn `Lead`/`Order` chéo cơ sở; `scopedDb.findUnique` trả `null` | `lib/db-scope.test.ts:197` · `tests/e2e/r7/security-gate.spec.ts:63-89` |
| **Hai cột phạm vi cho bảng mới** | Không bảng nào có đủ 2 cột mà lọt khỏi `BACKFILL_SPECS` | `tests/e2e/a0/orgunit-dual-write.spec.ts:131` |
| **Nền RBAC** | `visibleCenterIds` cho CS đơn / HO / multi-role; lọc hiệu lực `effectiveFrom/To`/`status`/`isActive`; vai quan hệ `PARENT`; `WorkScope` | `lib/auth/actor.test.ts:33-46`, `:71-96`, `:118-172`, `:229-290` |
| **Parity registry quyền** | Registry ↔ `ALL_ACTIONS` hai chiều; chặn key trùng | `lib/permissions/registry.test.ts:16-112` |
| **Lint là hàng rào thật** | `no-inline-authz` chặn kiểm quyền inline trong action file — **và ghim rằng `lib/**` KHÔNG bị chặn**; chặn `@/lib/db` trần trong admin/portal + allowlist | `lib/eslint/inline-authz.test.ts:222-276` · `lib/eslint/db-restriction.test.ts:22-42` |
| **Cách ly màn số liệu chat** | 9 case: CS1 không thấy CS2, đối xứng, lọc **đi xuống DB**, chống leo rào `?center=`, `centerId NULL` fail-closed, mẫu số 0 → `—` | `lib/chat/pilot-stats-scope.test.ts:290-346`, `:371` |
| **Vòng đời media (một phần)** | 7 case luồng kho: DRAFT → PENDING/APPROVED, C6.2, C6.3, portal không thấy DRAFT, xoá chỉ DRAFT | `tests/e2e/r7/media-draft.spec.ts:81-273` |
| **Consent media** | 5 case grant/revoke/tag + audit | `tests/e2e/r3/media-consent.spec.ts:28-76` 🔴 **không chạy CI** · `tests/e2e/r7/portal-media.spec.ts:234-336` (chạy CI) |
| **Lead 1-N + guard trạng thái** | 1-N, cascade, `leadChildSchema`, chặn `→REGISTERED` sai đường | `tests/e2e/r7/lead-child.spec.ts:20-79` |
| **Intake trùng SĐT khác con** | Gắn thêm `LeadChild`, không tạo lead trùng (QĐ-D1) | `tests/lead-intake/ingest.spec.ts` (`ci.yml:192`) |
| **Chuẩn hoá SĐT** | `phoneVariants` trả cả `0…`/`84…`; hai cách gõ cho cùng tập tra cứu | `lib/phone.test.ts:75-88` |
| **Mask PII lead (cột phẳng)** | 5 field bị mask khi `canViewPii = false` | `lib/lead/pii.test.ts:17-39` |
| **Dashboard scope (FL)** | 7 case: mục tiêu, doanh thu thực, GV hôm nay, phễu lead, công nợ, việc cần xử lý — đều chỉ CS1; + đối chứng SUPER_ADMIN | `tests/e2e/fl/dashboard-scope.spec.ts:146-207` |
| **Hàm thuần báo cáo cũ** | `monthKeyVN`, `groupByWeek`, `leadSummary`, `buildFunnel`, `computeAchievement`, `buildRevenueTargetReport` | `lib/reports/lead.test.ts:34-176` · `lib/reports/revenue-target.test.ts:26-101` |
| **Hạ tầng dùng lại** | `SETTINGS` registry (validate + resolve + fallback), `catalog` thông báo (tiền tố dài nhất, `:overdue` nâng P1), `attendance-queue` (34 case thuần) | `lib/settings/registry.test.ts:14-102` · `lib/notifications/catalog.test.ts:95-126` · `lib/lms/attendance-queue.test.ts` |

**Điểm mạnh có thật:** tầng **nền** (scope, RBAC, registry, lint) được ghim rất chắc, và nhiều test kèm chú thích giải thích *vì sao* — đó là tài sản, đừng phá khi refactor.

**Điểm yếu có thật ngay trong danh sách trên:**
1. 🔴 `tests/e2e/r3/media-consent.spec.ts` — **tồn tại nhưng không job CI nào chạy**.
2. 🔴 `tests/e2e/r7/media-draft.spec.ts:146` `[KHO-03]` — ghim **hành vi mà khu vực F sắp gỡ** (`autoApprove → APPROVED`). Phải sửa test **cùng PR** với F.1b, nếu không PR đó không merge được.
3. 🔴 `lib/crm/marketing-metrics.test.ts:15` — ghim `CPL = 0` khi mẫu số 0, trong khi PRD D (T-08, Cổng C7) đòi `—`.
4. 🔴 `lib/reports/filters.ts` — **file duy nhất trong `lib/reports/` không có test**, và nó giữ logic chống IDOR mà A-02 xây tiếp lên.

## Test đề xuất (CHƯA TỒN TẠI)

| Khu vực | Số test đề xuất | Rẻ nhất làm trước (unit thuần, không DB) |
|---|---|---|
| **A** | 11 | `resolveScopeFilters` (loại id ngoài phạm vi · mặc định giờ VN · khoá cache sắp xếp) · `leads:export` không thuộc role nào |
| **F** | 34 (14 unit + 20 integration) + 5 live/manual | `isClassFolderClosed` · `mergeSegments` · `isWatchComplete` · chống tua · `evaluateMediaSla` · `mediaSlaNote` · `computeReviewDeadline` · `decideMediaRetention` · `getClassMediaBucket` · `buildMediaObjectKey` · `isOwnStorageUrl` |
| **G** | 24 | mask `children[]` · quét 2 file PII dạng chuỗi · preference (khoá lạc / JSON hỏng / visible rỗng) · `evaluateSla` đọc `lastActivityAt` · `G05-T26` |
| **C/D/B** | 28 | **`parseCenterCodeFromCampaignName` — 18 case đã viết sẵn trong PRD, chép thẳng** · `netRevenueOf` 5 ca · `isChildClosed` · thứ tự phân bổ D-07 · tổng `ratioBp` |
| **E** | 11 | `sendTarget` đủ 3 khoá · payload `members` không `contact` · quét file `"use server"` |
| **Chung** | 1 suite `tests/cron/` tham số hoá cho **23 route** | `verifyCronAuth` 401 |
| **Tổng** | **~109 test tự động** + 5 manual/live | |

**Thứ tự làm, theo tỷ lệ "chặn được thiệt hại / công bỏ ra":**

| Ưu tiên | Việc | Vì sao đứng đây |
|---|---|---|
| 1 | Vá **cổng CI** (§5.2 G1) — cho `r1`–`r6` + `crm` chạy lại | 132 case **đã viết rồi**, chi phí = một job YAML. Không có test mới nào rẻ bằng |
| 2 | Bộ **hàm thuần** của F (14 test) + parser `SR.QD.232` (18 case chép sẵn) | Không cần DB, chạy trong `unit-tests`, ghim đúng những chỗ tính sai là mất tiền/mất ảnh |
| 3 | `netRevenueOf` + `isChildClosed` | Hai định nghĩa mà **5 màn hình** đang hiểu khác nhau; sai ở đây là sai mọi con số hạ nguồn |
| 4 | Suite `tests/cron/` | Vùng trắng 23 route, và 3 job mới của đợt này (D-01, F-05, F-21) đều đổ vào đó |
| 5 | Cách ly cơ sở cho `LeadChild` + `ClassSessionMedia` + `AdsSpendSnapshot` | Ba bảng **mới** mang tiền và ảnh trẻ em, cả ba đều rò im lặng nếu quên khai `SCOPED_MODELS` |
| 6 | Ma trận F-04 (3 HV × 3 buổi × 2 loại media) + `isClassWide` + consent | Lỗ **đang mở trên prod**, không phải rủi ro tương lai |

## Khoảng trống — luật có trong PRD mà KHÔNG có gì kiểm chứng

Xếp theo **hậu quả nếu vi phạm**, nặng trước.

| # | Luật không được phủ | Hậu quả nếu vi phạm | Nguồn | Vì sao chưa có test |
|---|---|---|---|---|
| **1** | **L-F12** — ảnh trẻ em (kể cả **chưa duyệt**) tải được vô danh qua `https://cdn.satarobo.vn/<key>` | Không hoàn tác được: file có thể đã bị lưu. Vi phạm bảo vệ dữ liệu trẻ em; ra mắt F là **đổ thêm** vào lỗ đã biết | `security-media.md` §1–§2; T1; Cổng A1/B1 | Cần `curl` thật vào CDN — chỉ `guarded live` được. Cũng **chưa có** bucket riêng để test |
| **2** | **L-F11** — `isClassWide` bỏ qua **hoàn toàn** kiểm tra consent | Ảnh trẻ **đã thu hồi đồng ý** được phát cho **mọi** phụ huynh của lớp; gia đình đó không thấy nên không phát hiện | `security-media.md` §7 | Bộ test hiện có chỉ phủ nhánh **tag** — nêu thẳng trong tài liệu |
| **3** | **L-F9** — retention xoá ảnh trẻ em trên điều kiện "học bạ đã xuất" mà điều kiện đó **hiện không trả lời được** | Xoá hàng loạt, **không hoàn tác**; hoặc không xoá gì mà tưởng đã tuân thủ | `F-media.md` §6.1.5(1); T4; Story 8 trước Story 18 | Chưa có mốc "đã xuất" (4 route PDF không ghi gì) và **OQ-F4 mâu thuẫn** giữa 2 PRD |
| **4** | **L-F4** — xoá media **không bao giờ** chạm R2; đường nối R2 là **đường mới hoàn toàn, chưa từng chạy** | Xoá row trước → object mồ côi sống vĩnh viễn trên CDN công khai; xoá R2 trước → row trỏ 404 | `F-media.md` §6.1.5(5); T3 | Trạng thái `DELETED` chưa tồn tại; cần fake S3 client |
| **5** | **L-A4** — màn per-user không chặn `leads:*`; cấp key này **tắt cách ly cơ sở toàn model `Lead`** | Một thao tác quản trị vô hại về mặt giao diện làm rò **toàn bộ lead của mọi cơ sở**, cả trên UI lẫn file xuất | `A-nen-tang.md` §6.3b; `documentation/permissions.md:315-317` | Chưa có blocklist, chưa có test |
| **6** | **L-A3** — endpoint export gác bằng `leads:view-all`; `leads:export` là **key chết** | Bất kỳ ai xem được danh sách lead đều xuất được file PII. Và nếu vá bằng cách **THAY THẾ**, actor HO-level không có `leads:*` xuất được **toàn hệ thống** | `A-nen-tang.md` §6.3 + `documentation/permissions.md:305` | Không có `checkPermission("leads:export")` nào để test |
| **7** | **L-B2** — hoàn tiền **không** trừ doanh thu; bản điều chỉnh **bị loại**, bản gốc số **cũ** vẫn được tính | Ba màn hình tài chính đang hiện số **cao hơn thực tế**, và điều chỉnh của kế toán **không có tác dụng gì** lên báo cáo | `CDB-dashboard.md` §B.2.3, §B.2.4 | Chưa có `lib/finance/revenue.ts`; `lib/reports/revenue-target.test.ts` chỉ phủ bản **gộp** |
| **8** | **L-D1/L-D2** — ghi ads bằng `upsert` (**đè lịch sử**) và đọc **không** `DISTINCT ON` | Đè: mất bằng chứng của 5 rủi ro khác, **vĩnh viễn**. Không `DISTINCT ON`: **cộng 7 lần** cùng một khoản | `CDB-dashboard.md` §D.2.2, §D.6.2(4); T-02 | Toàn bộ đường ghi ads là **mã chết** — chưa có gì để test |
| **9** | **L-D7** — không đọc `account_currency`; `spend` là `Float` | USD cộng thẳng vào thang VND: sai **~26.000 lần**, **theo hướng làm ROAS đẹp lên** — nên dễ bị đọc là "cuối cùng cũng có số" | `CDB-dashboard.md` IM-07; T-04 | Chưa có job thật |
| **10** | **L-F3** — F-04 vế "đúng buổi" **chưa tồn tại trong mã** | Lộ hình ảnh chéo **trong cùng lớp**: HV chỉ dự buổi 5 vẫn thấy ảnh buổi 3. **Đang mở trên prod** | `F-media.md` §6.1.4; T9 | Không có điều kiện `classSessionId` nào để test |
| **11** | **L-G2** — migration tự động merge lead trùng SĐT | Mất hồ sơ, mất tranh chấp hoa hồng, không rollback được nếu đã xoá | `G-lead-migration-plan.md` §2.2 | Script backfill chưa tồn tại |
| **12** | **L-G15** — migration đụng vào tiền | Lệch sổ, và lệch **âm thầm** | §3.3 B1–B3 | Chưa có bảng đối soát chạy tự động |
| **13** | **L-F7/L-F8** — "đã xem hết video" và chống tua | Toàn bộ **giá trị pháp lý** của bước duyệt nằm ở câu "QLCS đã xem rồi mới duyệt". Không có gì đo được ⇒ câu đó là lời hứa suông trong biên bản nghiệm thu | `F-media.md` §6.2.4; Story 6/14 | `MediaWatchProgress` chưa tồn tại |
| **14** | **L-A1/L-A6** — QLCS đa cơ sở: đọc được cơ sở thứ hai nhưng **không điểm danh / chốt buổi được** | Tính năng nghiệm thu "xanh hết chỉ số" mà người thật không làm việc được ở cơ sở thứ hai | `A-nen-tang.md` RT-1 (~10 cổng so `session.user.centerId`) | Chưa có QLCS đa cơ sở nào trong dữ liệu test |
| **15** | **L-E5** — SĐT PH trong payload E-03 | Rò PII sang vai không được xem (`TEACHER` bị loại **có chủ đích**) | `E-tuong-tac.md` E-03-2/3 | E-03 chưa tồn tại |
| **16** | **L-E2** — `sendTarget` thiếu `createdById` | Vai scope OWN bị **khoá ô nhập trên prod**, trong khi Server Action vẫn cho gửi — **và không tái hiện được ở local** (local chạy RBAC v1) | `E-tuong-tac.md` E-04-6 + §6.4.5 | Panel chưa tồn tại |
| **17** | **L-E9** — file `"use server"` export non-async | Chết **toàn bộ** action trong module lúc runtime, **mà `typecheck` + `lint` + `build` đều XANH** | `E-tuong-tac.md` §6.5.4 (1 trong 5 bug lọt mọi cổng) | Không có test/lint nào quét điều này |
| **18** | **Cron** — 23 route, 0 test | Tiền lệ đã xảy ra: **20 cron prod chưa từng chạy** vì `Authorization` rụng theo redirect canonical. **Không log lỗi, không ai biết** | `F-media.md:149`; `CDB-dashboard.md` §D.2.6 | Thư mục `tests/cron/` không tồn tại |
| **19** | **L-A2** — chống IDOR bộ lọc phạm vi | `?center=` của cơ sở khác trả dữ liệu cơ sở đó | `A-nen-tang.md` A-02-4 | `lib/reports/filters.ts` là file **duy nhất** trong thư mục không có test |
| **20** | **L-A10** — khoá cache thiếu `centerIds` | **Hai bộ lọc khác nhau dùng chung một entry, sai số liệu im lặng 120 giây** | `A-nen-tang.md` §6.2 ràng buộc 7 | Hàm chưa tồn tại |
| **21** | **L-F19** — đua GV-upload vs QLCS-chốt | QLCS ký "đã xem toàn bộ" cho ảnh **chưa ai nhìn** — đúng loại lỗi mà F sinh ra để chặn | Story 15 "Biên/lỗi (đua)"; T16 | Action chốt folder chưa tồn tại |
| **22** | **L-G10/L-G11** — tuỳ chọn cột biến thành cổng quyền, hoặc JSON hỏng làm chết trang | Rò PII (nếu bật cột bỏ qua mask) hoặc mất trang lead của một user | `G-lead.md` §7.5, G-04-4 | Model chưa tồn tại |

### Ba câu chốt

1. **`proposed` KHÁC `existing`.** Bảng §3 có **109 dòng `proposed`** và chúng **không** đóng góp một chút độ phủ nào cho tới khi có mã test thật.
2. **`existing` mà không chạy CI cũng không phải hàng rào.** 170 case đang ở tình trạng đó (§1.4a), gồm toàn bộ consent media.
3. **Ba `existing` đang ghim hành vi mà đợt này sẽ đổi** — `[KHO-03]` (`tests/e2e/r7/media-draft.spec.ts:146`), `lib/crm/marketing-metrics.test.ts:15`, và các assert doanh thu **gộp** ở `lib/reports/revenue-target.test.ts`. Chúng phải được sửa **trong cùng PR** với thay đổi mã, và việc sửa test cũ **không** được tính là "đã có test cho luật mới".
