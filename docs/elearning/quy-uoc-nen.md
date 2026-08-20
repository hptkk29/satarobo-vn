# Quy ước nền — module đào tạo nội bộ (e-learning)

> **Đọc file này TRƯỚC KHI MỞ PR đụng module e-learning.** Chín quy ước dưới đây, bốn cái đầu được
> máy cưỡng chế (ESLint / Vitest / CI), **năm cái sau thì không** — chúng chỉ sống nếu người ta đọc
> chỗ này. Đó là lý do chúng nằm trong ticket nền EL-07 chứ không rải rác trong các ticket dùng.

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

## Ràng buộc kèm theo, không thuộc chín quy ước nhưng dễ quên

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
