# Quy ước nền — module đào tạo nội bộ (e-learning)

> **Đọc file này TRƯỚC KHI MỞ PR đụng module e-learning.** Mười sáu quy ước dưới đây.
> Quy ước **1–4, 12, 13, 16** được **máy cưỡng chế** (ESLint / Vitest / CI); **5–11, 14, 15**
> thì không — chúng chỉ sống nếu người ta đọc chỗ này. Đó là lý do chúng nằm ở một chỗ chứ
> không rải rác trong các ticket dùng.
>
> 1–9 thuộc ticket nền EL-07; **10–12 qua EL-05**, **13–14 qua EL-06**, **15–16 qua EL-08**
> (23/08/2026).

Nguồn: `02-KE-HOACH-THUC-HIEN-Elearning-v1.4.md` — ticket EL-07, quyết định QĐ-CDA-02b (biện pháp
1, 3, 4) và QĐ-CDA-13 (BP-1, BP-2).

---

## Bốn quy ước CÓ máy cưỡng chế

### 1. Glob ESLint cho route group

`eslint.config.mjs` có khối riêng cho `app/(elearning)/**` chặn: `@/lib/db` trần · `@/components/magic/*`
· `@/components/motion/*` · `framer-motion` · `motion` · `recharts`.

**Vì sao phải khai tay:** luật "cổng DB đã đóng" gắn theo **glob từng route group** (admin, portal,
teacher, elearning — bốn khối riêng biệt). Route group mới **không tự thừa hưởng luật nào**. Thiếu
khối này thì `app/(elearning)/**` import `@/lib/db` trần **hợp lệ** và không ai báo.

⛔ **Không xin entry nào trong `DB_IMPORT_ALLOWLIST`.** Module này đi `scopedDb` từ đầu, không
grandfather. Allowlist hiện còn đúng 3 exception hợp lệ và không nhận thêm.

### 2. Phạm vi lint

`package.json` khai `eslint app components lib scripts`. Thư mục `scripts/` được thêm ở EL-07 — trước
đó nó nằm **ngoài mọi cổng chất lượng**, trong khi script backfill là thứ **chạy tay trên PROD**.

Khi thêm, `scripts/` đỏ 56 lỗi. Cách xử đã dùng: khai **globals Node** cho `scripts/**` (`console`,
`process`, `__dirname`, `Buffer`, `require`) và tắt `no-require-imports` **chỉ cho `.cjs`** — vì
`require()` là cú pháp đúng của định dạng đó. Còn lại 9 lỗi thật thì **vá**, không tắt.

⛔ **Không hạ luật để cho qua.** Nếu `scripts/` đỏ vì code mới: vá, hoặc `eslint-disable-next-line`
**kèm lý do tại chỗ**.

### 3. Vitest `include`

`vitest.config.ts` khai `tests/elearning/**/*.{test,spec}.ts`.

**Vì sao phải khai:** `include` là **bộ lọc CỨNG**. Không khai thì `vitest run tests/elearning` báo
*"No test files found"* và **job CI vẫn XANH** dù test viết đúng — hỏng câm, tưởng có lưới an toàn
mà không có. Đường dẫn truyền ở dòng lệnh chỉ lọc **tiếp** trong tập này, không mở rộng nó.


> 🔴 **Đã vấp lần hai (EL-05, 23/08).** Guard đăng ký cron viết ở `tests/cron/` — thư mục
> KHÔNG có trong `include` — nên nó im lặng không chạy, đúng loại lỗi mà chính nó sinh ra để
> bắt. Đã chuyển sang `lib/cron/`. **Các thư mục test đang được phủ:** `lib/**`,
> `components/**`, `app/**`, `tests/chat/**`, `tests/elearning/**`. Viết test ngoài bốn chỗ
> đó thì phải khai thêm vào `include`, không có ngoại lệ.

### 4. Job CI có tên

Test tầng DB chạy trong job **`chat-db-tests`** (⛔ **không đổi tên job đó** — đang là required check).
Test browser chạy trong job **`e2e-elearning`** với `playwright.elearning.config.ts`, cổng 3141.

**Dòng DoD chuẩn của mọi story sau, không được viết lại:**

> *"Test của story đã chạy trong job CI **`e2e-elearning`** (hoặc `chat-db-tests` với test tầng DB)
> và job đó đã xanh trên nhánh `test`."*

Repo có **15 file `playwright.*.config.ts`** nhưng CI chỉ gọi 5 — 10 cấu hình chết. Viết cấu hình mà
không nối vào CI thì y hệt không viết.

---

## Năm quy ước KHÔNG có máy cưỡng chế — chỉ sống nếu đọc

### 5. Khối `Trn*` nằm liền một mạch ở CUỐI `prisma/schema.prisma`

38 model `Trn*` nằm liền nhau ở cuối file, phân cách bằng banner.

**Vì sao:** `schema.prisma` là **một file 6.736 dòng / 207 model** và có **bốn luồng** cùng đụng
(chat, AUTH-SĐT, Nền Hệ thống P3/P4, parity site giáo viên). Đặt ở cuối để xung đột merge luôn rơi
vào **vùng append** thay vì giữa file.

⛔ **E-learning không tự khởi xướng việc tách multi-file `prisma/schema/*.prisma`** ở bất kỳ giai
đoạn nào — đó là việc của Nền Hệ thống theo Doc 15 Q5.

### 6. Migration chỉ ADD, và tên có tiền tố `el_`

Chỉ `CREATE TABLE`, cột **nullable** mới, index mới. Mọi `DROP`/`RENAME` đi **hai pha** cách nhau ít
nhất một lần deploy ổn định.

**Vì sao gắt:** `.github/workflows/deploy.yml` chạy `prisma migrate deploy` **ngay khi merge `main`**.
**Không có cổng người nào** đứng trước schema prod. "Người vận hành chạy tay" chỉ đúng với script
backfill và workflow seed quyền — **không** đúng với migration.

Tiền tố `el_` để đối soát nhanh khi ba luồng cùng có migration chờ.

### 7. Không merge lên `test` khi bộ test của luồng khác đang đỏ

Nhánh `test` là **làn nghiệm thu duy nhất** dùng chung cho mọi luồng. Quy tắc lịch sự dùng chung làn.

### 8. PR chạm `lib/auth/route-policy.ts` phải là PR ĐỘC LẬP NHỎ NHẤT — đúng 4 file *(BP-1)*

`proxy.ts` · `lib/auth/route-policy.ts` · `lib/auth/route-policy.test.ts` · `lib/flags.ts`.
**0 file `.tsx`, 0 mã tính năng, 0 migration.**

**Vì sao đây là ràng buộc kỹ thuật chứ không phải sở thích quy trình:** file này là **chỗ va chạm số
một** giữa e-learning (thêm host thứ 6) và parity site giáo viên (giữ host thứ 5) — hai luồng sửa
**cùng một hàm `decideRoute()`** và **cùng một bảng test 990 dòng**. Bó chung vào PR lớn là biến một
**rebase mười phút** thành một buổi gỡ xung đột. Và xung đột trên `decideRoute()` là loại nguy hiểm
nhất: git nối hai nửa lại thành một bảng định tuyến **vẫn biên dịch được nhưng sai**.

**Điều kiện merge:** tại thời điểm merge, nhánh site giáo viên **không có thay đổi đang mở** trên hai
file đó — kiểm bằng danh sách PR đang mở, ghi kết quả vào ticket. Thứ tự ai trước ai sau **không
quan trọng**; **kích thước PR mới quan trọng**.

### 9. ⛔ CẤM chạy `seed-prod-roles.yml` từ nhánh feature — chỉ từ `main` sau merge *(BP-2)*

Quyền e-learning khai ở **file module riêng** `lib/permissions/registry/elearning.ts`, nên bề mặt
xung đột với chat thu về đúng **một dòng import** trong `registry/index.ts`.

Nhưng workflow seed thì không có hàng rào nào: chạy nó từ một nhánh feature có thể **ghi đè phần
quyền chưa merge của luồng kia**. Đây là kiểu hỏng **im lặng** — không ai thấy cho tới khi một vai
mất quyền trên prod.

---

## Ba quy ước bổ sung — chốt qua EL-05 (23/08/2026)

### 10. Cấu hình action đặt ở `lib/elearning/*`, `_actions.ts` chỉ bọc một dòng

```ts
// lib/elearning/assignment-create.ts
export const cauHinhTaoLuotGiao: ActionConfig<Input, KetQua> = { ... };

// app/(elearning)/elearning/giao-bai/_actions.ts
"use server";
export const taoLuotGiaoAction = defineAction(cauHinhTaoLuotGiao);
```

**Vì sao:** tệp `"use server"` không nạp được trong vitest, nên khuôn cũ của repo là **chép
cấu hình sang tệp test** kèm một guard so nguồn (xem `lib/elearning/mark-lesson-read.test.ts`).
Hai bản chép tay sớm muộn cũng trôi khỏi nhau, và guard chỉ bắt được phần chữ nó nghĩ tới.
Đặt cấu hình ở lib thì test chạy **đúng cái máy chủ chạy** — không bản sao, không guard.

Khuôn cũ vẫn còn ở vài tệp EL-04; **không viết thêm cái mới theo khuôn đó**.

### 11. Cột `orgUnitId` NOT NULL ⇒ gọi `orgUnitIdForCenter()` TƯỜNG MINH

CLAUDE.md nói "code mới không phải tự gọi `orgUnitIdForCenter()`" — câu đó đúng cho cột
**bỏ trống được**, vì `lib/org/dual-write.ts` điền hộ ở tầng `db`.

Với cột **NOT NULL** (`TrnAssignment.orgUnitId`, `TrnEnrollment.orgUnitId`) thì trình biên
dịch đòi giá trị, và **ép kiểu để né sẽ giấu mất mọi lỗi cột khác của cùng lời gọi**. Gọi
tường minh; dual-write tôn trọng giá trị đã set nên không có nguồn ghi thứ hai.

⚠️ **Không suy được đơn vị thì LOẠI dòng đó, không lấy đơn vị khác điền đại.** `orgUnitId`
là cột quyết định **ai nhìn thấy**; điền đại là xếp hồ sơ vào nhầm đơn vị mà không có thông
báo nào.

### 12. Guard soi `where` theo `Prisma.dmmf` cho mọi hàm dựng truy vấn

Xem `tests/elearning/assignment-rule.test.ts`.

**Vì sao cần dù đã có `pnpm typecheck`:** object nằm trong spread hoặc trong nhánh điều kiện
**không bị TS kiểm thừa thuộc tính**. Một quan hệ Prisma KHÔNG TỒN TẠI vẫn biên dịch xanh và
chỉ nổ **lúc chạy, trên màn hình người dùng**. Đã xảy ra thật ở EL-05 PR1
(`userAccount.trnEnrollments` — `TrnEnrollment.userId` là cột trần, không có quan hệ).

⚠️ Guard phải chạy qua **mọi nhánh** của hàm. Bản đầu của chính guard này bỏ lọt con bug nó
sinh ra để bắt, vì chỉ phủ một nhánh của điều kiện.

---

## Hai quy ước bổ sung — chốt qua EL-06 (23/08/2026)

### 13. Ngân sách cron của module là ĐÚNG HAI KHE, không xin thêm

`/api/cron/elearning-reminders` (mỗi 15 phút, lệch pha) và `/api/cron/elearning-dem` (00:47
giờ VN). Mọi việc nền khác **gộp vào một trong hai**, kể cả việc dọn dữ liệu (QĐ-CDA-14 điểm
2). Sau PR EL-06, `vercel.json` có **đúng 25** cron — con số này là AC11.

**Đã vấp một lần:** EL-05 thêm `elearning-dynamic-audience` thành khe thứ ba, trong khi việc
nó làm chính là **việc (2) của `elearning-dem`**. Đã gộp lại và trả khe.

⚠️ **Mọi lịch cron mới phải MỞ `vercel.json` đối chiếu trước khi đặt**, không suy từ trí nhớ:
mọi phút chia hết cho 5 đã bị `email-queue`/`sla-check`/`chat-zns-notify` chiếm, và `0 20 * * *`
đã bị `orgunit-drift` chiếm. Guard `lib/cron/dang-ky-cron.test.ts` canh bốn chiều (route thiếu
lịch · lịch trỏ vào hư không · lịch trùng · route không có cổng xác thực).

### 14. Việc nền chưa làm được phải NÓI RA trong phản hồi, không bỏ trống

Cron đêm có hai việc chưa chạy được vì bảng thuộc ticket khác chưa tồn tại (`TrnCertificate`
— EL-16; `TrnExamAttempt` — EL-14). Cả hai trả về một trường nói rõ **bảng nào, ticket nào**.

**Số đếm của việc chưa chạy được là `null`, KHÔNG phải `0`.** `0` đọc thành *"đã chạy và không
có gì để làm"* — tức nói dối; `null` đọc thành *"chưa chạy được"*. Một cron báo "xong" trong
khi có việc chưa chạy là thứ khó phát hiện nhất, vì không có gì vỡ.

---

## Hai quy ước bổ sung — chốt qua EL-08 (23/08/2026)

### 15. ĐỌC enum trong `prisma/schema.prisma` trước khi viết máy trạng thái

**Đã vấp:** EL-08 viết máy trạng thái phiên bản với `PENDING_APPROVAL` và một hành động
`DUYET_VA_XUAT_BAN` gộp. Schema thật có `TrnVersionStatus` = `DRAFT · PENDING_REVIEW ·
APPROVED · PUBLISHED · ARCHIVED` và `TrnLessonKind` = `READ · VIDEO · SCORM · QUIZ · TASK ·
LIVE_SESSION`. Ba chỗ sai, typecheck bắt cả ba.

Sửa xong hoá ra **bản schema đúng hơn bản bịa**: duyệt và xuất bản là hai bước, và tách ra
mới cho người duyệt nói được *"đúng rồi, nhưng chờ tới đầu quý hãy phát"*. Enum trong schema
là kết quả của một vòng thiết kế đã có lý do — đoán lại từ đầu là bỏ mất lý do đó.

### 16. Ghi lại `orderIndex` dưới khoá duy nhất phải đi HAI PHA

`TrnModule` có `@@unique([courseId, orderIndex])`, `TrnLesson` có
`@@unique([moduleId, orderIndex])`. Ghi thẳng thứ tự mới sẽ **va khoá ngay bước đầu** vì còn
phần tử mang số đích.

Khuôn đúng ở `lib/elearning/course-outline.ts` (`dungHaiPhaGhiThuTu`): pha 1 đẩy **toàn bộ**
sang dải âm, pha 2 ghi số thật — cả hai trong CÙNG một transaction. Pha 1 phải phủ mọi phần
tử kể cả cái không đổi chỗ; chỉ đẩy "cái có đổi" thì vẫn còn số dương nằm lại và pha 2 va
đúng vào chúng.

Đây không phải lỗi mất dữ liệu — nó chỉ làm thao tác kéo thả thất bại với một lỗi khó hiểu,
và người dùng kết luận hệ thống hỏng.

---

## Ràng buộc kèm theo, không thuộc mười sáu quy ước nhưng dễ quên

- **Ngân sách cron: tối đa 2 khe** cho cả module. Bảy mốc nhắc gộp vào **một** cron quét
  (`elearning-reminders`, nhịp 15 phút); việc dọn dữ liệu thô 90 ngày gộp vào cron đêm
  (`elearning-dem`). ⛔ Không xin khe thứ ba. Mọi lịch cron mới phải mở `vercel.json` **đối chiếu khe
  trống thật** — và nhớ giờ trong đó là **UTC**, cộng 7 ra giờ Việt Nam.
- **Cờ `ORG_SCOPE_CUTOVER_ENABLED` của Nền Hệ thống P4 không được bật giữa GĐ2** — đó là lúc dữ liệu
  đo xem bắt đầu tích; đổi trục cách ly giữa chừng làm một phần dữ liệu nằm trục cũ, phần còn lại
  trục mới. Nếu P4 cần bật trong cửa sổ đó thì là quyết định chung của hai luồng.
- **Video đào tạo nội bộ không bao giờ nằm trong bucket gắn `cdn.satarobo.vn`** (bucket công khai).
  Nằm ở đó thì mọi cơ chế chống học đối phó của GĐ2 chỉ là trang trí.
- **Cờ `ELEARNING_ENABLED` dùng `=== "true"`**, cố ý ngược khuôn `isTeacherSiteEnabled()` (dùng
  `!== "false"`, mặc định ON vì đã qua kỳ flip). Chép nguyên khuôn đó sang sẽ cho cờ **bật sẵn ngay
  khi merge**.
