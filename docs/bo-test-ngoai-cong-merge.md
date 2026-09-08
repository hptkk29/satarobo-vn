# BỘ TEST NẰM NGOÀI CỔNG MERGE — rà 07/09/2026

> Câu hỏi: *"còn bộ test nào khác đang nằm ngoài cổng merge không? Liệt kê hết."*
> Đây là danh sách đó, đo trên nhánh `hptkk29/module-cham-cong` ngày 07/09/2026.

**Vì sao đáng rà:** `tests/cham-cong/timelog.spec.ts` **đỏ thật từ 06/09 mà không ai thấy** — nó
nằm trong `include` của Vitest nên `pnpm test:unit` có gom file, nhưng 5/6 file tự `describe.skip`
khi thiếu Postgres, và job `unit-tests` không có Postgres. CI xanh suốt trong lúc bộ test vé kiosk /
kỳ công / tính lại / ma trận duyệt đơn không chạy một dòng nào.

Đây đúng loại lỗi module chấm công đang dọn cả tuần: **thứ có thật mà không ai đọc** — cùng họ với
bút toán `ADJUSTED` bên thanh toán (tồn tại, không chỗ nào cộng) và ngày lễ toàn hệ thống (tồn tại,
tàng hình với người cấp cơ sở).

---

## 1. Chỉ có MỘT workflow chạy test

`.github/workflows/ci.yml` — `push` + `pull_request` vào `main` / `test` / `develop`.
24 workflow còn lại đều là `workflow_dispatch`/`schedule` vận hành (seed, backfill, migrate) và
**không chạy một dòng test nào**.

| Job | Chạy gì | Có Postgres |
|---|---|---|
| `quality` | typecheck · lint · lint:boundaries · build — **không test** | ✅ |
| `unit-tests` | `pnpm test:unit` (toàn bộ `include` của Vitest) | ❌ **không** |
| `chat-db-tests` | `test:chat-db` · `test:nen-db` · `test:lead-intake` · **`test:cham-cong-db` (thêm 07/09)** | ✅ |
| `e2e` | `playwright.config.ts` (smoke) | ✅ |
| `e2e-a0` · `e2e-r7` · `e2e-crm` · `e2e-fl` · `e2e-teacher` · `e2e-elearning` | 6 config tương ứng | ✅ |

### Required check — ĐO ĐƯỢC, đã đo 08/09/2026

⚠️ **Câu cũ ở đây — *"job nào là required check thì không đọc được từ repo"* — là SAI**, và cái sai
đó đã hoãn phép đo này từ 07/09 sang 08/09. Đọc được, một lệnh:

```bash
gh api repos/hptkk29/satarobo-vn/branches/main/protection \
  -q '.required_status_checks.contexts, .required_status_checks.strict, .enforce_admins.enabled'
```

Kết quả 08/09/2026, **giống hệt nhau trên `main` và `test`**:

| | |
|---|---|
| `required_status_checks.contexts` | `Quality (typecheck + lint + build)` · `Unit tests (Vitest)` — **hết** |
| `strict` | `false` — PR xanh trên base cũ vẫn merge được vào nhánh đã đổi |
| `enforce_admins` | `false` — **admin merge đè được cả hai cổng** |
| `required_pull_request_reviews` | **không có** |

⇒ Trong hai chỗ tài liệu ghi lệch nhau: `KE-HOACH-CHAM-CONG-v3.md:413` **ĐÚNG**;
`docs/elearning/quy-uoc-nen.md:59` (*`chat-db-tests` "đang là required"*) **SAI** — đã sửa 08/09.

### Bao nhiêu ca thực sự được cổng bảo vệ

Số dưới đây đo từ log lượt CI xanh `34210965196` (PR #230), không phải ước lượng.

| Job | Chạy bộ nào | Số ca | Required |
|---|---|---|---|
| `quality` | typecheck · lint · lint:boundaries · build | **0 ca test** | ✅ |
| `unit-tests` | `pnpm test:unit` | **400 file / 5 718 ca** (+191 skip) | ✅ |
| `chat-db-tests` | chat 6f/94 · nen 3f/15 · lead-intake 2f/28 · cham-cong 6f/37 · finance 1f/24 | **18 file / 198 ca** | ❌ |
| `e2e-a0` | `playwright.a0.config.ts` | **153 ca** | ❌ |
| `e2e-r7` (2 shard) | `playwright.r7.config.ts` | **370 ca** (+2 skip) | ❌ |
| `e2e-fl` | `playwright.fl.config.ts` | **54 ca** (+17 skip) | ❌ |
| `e2e-crm` | `playwright.crm.config.ts` | **32 ca** | ❌ |
| `e2e` | `playwright.config.ts` (smoke) | **26 ca** | ❌ |
| `e2e-elearning` | `playwright.elearning.config.ts` | **3 ca** (+2 skip) | ❌ |
| `e2e-teacher` | `playwright.teacher.config.ts` | **2 ca** | ❌ |

**Tổng chạy trên PR: 6 384 ca. Được cổng bảo vệ: 5 718 (89,6%). Ngoài cổng: 666 (10,4%)** — trong đó
**370 ca R7** (gỡ học viên · hoàn tiền · ghi danh) và **198 ca tầng DB thật** (bút toán điều chỉnh ·
nhập nhân sự).

⚠️ **Đây không phải lý thuyết.** Ca `[W5]` trong `e2e-r7` đỏ thật từ `fb7f8422` (PR #228, cầu dao
hoàn tiền) và **main đỏ liên tục** từ `c78d0ae0` tới `2bfea6eb` — merge lên prod bình thường, vì
`e2e-r7` không phải required. Xem luật 10 trong `docs/luat-doc-so-va-ket-luan.md`.

---

## 2. Danh sách bộ test KHÔNG chạy ở CI

| Bộ | Số spec | Có config? | Có script? | Có job CI? | Ghi chú |
|---|---|---|---|---|---|
| `tests/cham-cong/**` | 6 file | — | ✅ | ✅ **ĐÃ VÁ 07/09** | 5/6 skip im lặng ở `unit-tests`; nay có bước riêng ở `chat-db-tests`. Chạy hết 35 test / ~11 giây |
| `tests/e2e/r1` | 12 | ✅ | ✅ | ❌ | 1 spec (`crm-ui.spec.ts`) dùng fixture `page` ⇒ cần browser |
| `tests/e2e/r2` | 2 | ✅ | ✅ | ❌ | |
| `tests/e2e/r3` | 3 | ✅ | ✅ | ❌ | |
| `tests/e2e/r4` | 2 | ✅ | ✅ | ❌ | |
| `tests/e2e/r5` | 1 | ✅ | ✅ | ❌ | 🔴 **`checkin-scope` — đúng vùng chấm công đang sửa** |
| `tests/e2e/r6` | 10 | ✅ | ✅ | ❌ | 🔴 có `shift-category` — cũng vùng chấm công |
| `tests/acceptance` | 12 | ✅ | ❌ | ❌ | Chạy vào `test.satarobo.vn`, không phải localhost |
| `tests/manual` | 15 | ✅ | ❌ | ❌ | |
| | **57 spec** | | | | **chưa từng chạy trong cổng merge** |

**9 cấu hình Playwright chết:** `r1` `r2` `r3` `r4` `r5` `r6` `acceptance` `manual` `smoke`
(repo có 15 file `playwright.*.config.ts`, CI gọi 7 script).

---

## 3. Chi phí đưa từng bộ vào cổng merge

| Bộ | Cách | Ước lượng | Cần browser? |
|---|---|---|---|
| `tests/cham-cong` | ✅ đã làm — thêm 1 bước vào `chat-db-tests`, dùng lại Postgres + migrate + seed-roles sẵn có | ~11 giây thật đo | ❌ |
| `r2`–`r6` (18 spec) | Gộp MỘT job `e2e-r2-r6` với `R*_SKIP_WEBSERVER=1`, `workers=1`, không build | ~6–12 phút | ❌ |
| `r1` (12 spec) | Như trên, nhưng **tách riêng** `crm-ui.spec.ts` hoặc thêm `playwright install chromium` (**chỉ binary, KHÔNG `--with-deps`**) | +3–5 phút | ⚠️ 1 spec |
| `tests/acceptance` | **Không đưa vào cổng merge được**: phụ thuộc site đang chạy + dữ liệu thật + creds, timeout 22 phút/test. Nếu muốn thì làm job `schedule` **sau** khi deploy `test`, không phải required check | 20–40 phút | ✅ |
| `tests/manual` | Đúng như tên — chạy tay. Không đưa vào cổng | — | — |

⚠️ **Bẫy đã ăn thật:** `playwright install --with-deps` từng treo ở bước `apt` và giết cả job —
GitHub báo **cancelled** chứ không phải failed, nên nhìn qua tưởng là lỗi hạ tầng ngẫu nhiên. Job
`e2e-r7` và `e2e-crm` đã cố ý bỏ `--with-deps` (r7) hoặc bỏ hẳn bước cài (crm). Bộ nào thêm mới mà
cần browser thì theo đúng cách đó.

---

## 4. Đề xuất thứ tự

1. ✅ **`tests/cham-cong`** — xong 07/09. Rẻ nhất, và là bộ đang có test đỏ thật.
2. **`r5` + `r6`** — 11 spec, đúng vùng chấm công đang sửa, không cần browser. Rẻ và trúng đích.
3. **`r2` `r3` `r4`** — 7 spec, gộp chung job với bước 2.
4. **`r1`** — cần tách spec browser, làm sau.
5. `acceptance` / `manual` — **không** đưa vào cổng merge; nếu cần thì lịch chạy sau deploy.

---

## 5. Luật cho người viết test mới

- `vitest.config.ts` `include` là **bộ lọc CỨNG**: đường dẫn gõ ở dòng lệnh chỉ lọc *tiếp* trong tập
  đó, **không mở rộng nó**. Thư mục không khai vào `include` sẽ không bao giờ chạy, dù gõ đúng đường
  dẫn.
- Spec cần Postgres thì **phải có bước riêng ở job `chat-db-tests`**. Chỉ khai `include` là chưa đủ:
  ở `unit-tests` không có DB nên nó `describe.skip` **im lặng** và CI vẫn xanh.
- Spec dùng fixture `page`/`browser` mà bỏ vào thư mục không có bước `playwright install` thì CI đỏ
  chắc chắn.
- Viết test cho chấm công xong vẫn nên tự chạy một lượt:
  `pnpm vitest run lib/cham-cong tests/cham-cong` — nhanh hơn chờ CI, và bắt được đúng thứ CI từng
  bỏ sót.
