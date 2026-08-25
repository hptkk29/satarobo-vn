# Quy ước nền — module đào tạo nội bộ (e-learning)

> **Đọc file này TRƯỚC KHI MỞ PR đụng module e-learning.** Hai mươi sáu quy ước dưới đây.
> Quy ước **1–4, 12, 13, 16, 21, 24** được **máy cưỡng chế** (ESLint / Vitest / CI); phần còn lại
> thì không — chúng chỉ sống nếu người ta đọc chỗ này. Đó là lý do chúng nằm ở một chỗ chứ
> không rải rác trong các ticket dùng.
>
> 1–9 thuộc ticket nền EL-07; **10–12 qua EL-05**, **13–14 qua EL-06**, **15–16 qua EL-08**
> (23/08/2026); **17–19 qua EL-10 và EL-12**, **20–23 qua vòng rà đối kháng EL-10**,
> **24–26 qua EL-13** (25/08/2026).

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

## Ba quy ước bổ sung — chốt qua EL-10 và EL-12 (25/08/2026)

### 17. Case "đường bình thường" viết TRƯỚC case "chặn được gì"

Một bộ test chỉ hỏi *"cổng có chặn đúng thứ phải chặn không"* sẽ **xanh trọn vẹn
trên một hệ chặn tất cả mọi người**.

Đã xảy ra thật ở EL-12: `chanTuaToi` so vị trí con trỏ với `maxPositionSec`, và 21
case của hợp đồng đều xanh. Nhưng mốc đó chỉ cập nhật ở cuối mỗi nhịp, nên con trỏ
luôn chạy trước nó — với nhịp 15 giây thì *mọi* nhịp bình thường, kể cả nhịp đầu
tiên của mọi bài, đều trông như "nhảy tới 15 giây chưa xem". Nếu lọt: không ai xem
nổi một video nào, và thông báo hiện ra là "khoá này không cho tua tới", một câu
chẳng liên quan gì tới việc người học vừa làm.

**Cách áp dụng:** với mọi cổng chặn, viết ít nhất một case cho người dùng ĐÚNG
LUẬT đi qua được, và một case cho **nhịp/lượt ĐẦU TIÊN** — trạng thái khởi đầu
(mốc 0, chưa có dòng dữ liệu) là chỗ điều kiện biên hay sai nhất.

### 18. Hàm KÝ và hàm KIỂM phải đối xứng về tham số thời gian

`kiemVeMedia(token, now)` có mốc kiểm, còn `kyVeMedia(input, ttl)` thì ký bằng
`Date.now()` thật. Test buộc phải ký bằng đồng hồ thật rồi kiểm bằng mốc giả ⇒ vé
xanh hay đỏ **tuỳ giờ chạy CI**. Loại đỏ chập chờn này không ai lần ra, và cách xử
thường gặp là "chạy lại cho xanh".

**Cách áp dụng:** hễ một hàm nhận `now` thì hàm đối ngẫu của nó cũng phải nhận.
Áp cho mọi cặp ký/kiểm, mã hoá/giải mã, đặt hạn/soi hạn.

### 19. Test canh CHỮ trong chú thích là guard tự vỡ

Case của EL-10 đòi mã nguồn chứa đúng một câu tiếng Việt. Nó đỏ ngay lần đầu ai đó
viết lại câu đó — **báo động giả trên một tệp không đổi hành vi**. Vài lần như vậy
là người ta học được cách sửa: xoá dòng assert.

**Cách áp dụng:** canh thứ chạy được. Thay vì đòi có câu "con số client chỉ để
chặn sớm", hãy khẳng định biến mang con số client **không xuất hiện trong lời gọi
LƯU**. Thử ngược để chắc: chèn đúng con bug vào rồi xem case có đỏ không.

---

## Bốn quy ước bổ sung — chốt qua vòng rà đối kháng EL-10 (25/08/2026)

### 20. Cổng CHẶN và đường THOẢ MÃN cổng phải về cùng một PR

Một cổng kiểm tra chỉ được bật khi đã tồn tại đường để người dùng đi qua nó. Cổng về trước,
cửa về sau ⇒ hệ **kẹt cứng**, và người ở giữa không có lối nào ngoài việc phá cổng.

**Đã vấp:** EL-10 kéo sớm cổng C10 (`kiemPhuDe` chặn xuất bản khoá bắt buộc thiếu phụ đề, ở
cả `GUI_DUYET`/`DUYET`/`XUAT_BAN`), trong khi đường **đính** phụ đề nằm ở cột IN của EL-11 và
chưa dựng: `khoaMedia` chỉ được gọi với `loai: "master"`, `kiemChuanNopPhuDe` có **0 lời gọi**
ngoài test, màn soạn không có ô nhận `.vtt`. Kết quả: **mọi khoá `MANDATORY*` có bài video
không xuất bản được, và không sửa được từ giao diện.** Hai lối thoát duy nhất đều sai — hạ
chương trình xuống `OPTIONAL` (mất tính bắt buộc) hoặc bỏ bài video khỏi dàn bài (mất nội dung
cần dạy).

Nguy hiểm thật không nằm ở chỗ kẹt. Nó nằm ở chỗ **cách vá rẻ nhất trông thấy được là gỡ
cổng** — một dòng, biên dịch xanh; nếu cổng đó không có test cấp action thì CI không cản, và
người review đọc diff chỉ thấy "gỡ một khối đang chặn việc". Một lần lọt là hỏng vĩnh viễn:
bổ sung phụ đề hồi tố cho khoá đã phát là việc không ai làm nổi.

**Cách áp dụng:** trước khi thêm bất kỳ điều kiện chặn nào (xuất bản, giao bài, cấp chứng
nhận, nộp bài thi), trả lời hai câu — *đường nào tạo ra dữ liệu thoả mãn điều kiện này, và nó
đã có chưa?* Nếu chưa: dựng nốt đường đó trong cùng PR, hoặc **để cổng sau một cờ** và bật khi
đường về. Không có trạng thái thứ ba.

### 21. Route handler phải có ít nhất một case GỌI THẬT handler

Test đọc mã nguồn bằng `readFileSync` + `toContain` chứng minh **có viết**, không chứng minh
**có chạy**, và nó mù hoàn toàn với lớp lỗi tốn kém nhất của một route: **phép NỐI** giữa kết
quả tính toán và header/thân phản hồi.

**Đã vấp:** cả ba route của EL-10 chỉ được canh bằng so chuỗi. Ba đột biến đã chạy thật, cả ba
**sống sót toàn bộ 47 case**: xoá dòng gán `Content-Range` ở nhánh 206 · đổi `Content-Length`
từ `kq.contentLength` sang `coTep` · xin R2 một cửa sổ byte khác cửa sổ đã hứa trong header.
Đột biến đầu trả **206 không có `Content-Range`** — trình phát huỷ tải, khung đen, mà chỉ số
T1 ("tỉ lệ 5xx của route Range") đọc **0% lỗi** vì 206 không phải 5xx.

⛔ **Không viện lý do "route cần DB/R2/phiên đăng nhập nên không test được"** — kho này đã làm
đúng việc đó bốn lần: `app/api/chat/{unread,attachment-url,realtime-token}/route.test.ts` và
`app/api/elearning/media/[...khoa]/route.test.ts`. Khuôn: `vi.mock` + `import { GET } from
"./route"` + `await GET(req(), ctx())`. `vitest.config.ts` đã gom `app/**/*.test.{ts,tsx}`,
đặt test cạnh route là chạy.

**Cách áp dụng:** mỗi route mới kèm một tệp `route.test.ts` cạnh nó, tối thiểu canh trên
**phản hồi thật**: mã trạng thái đường thành công, mã trạng thái một đường bị chặn, và **giá
trị đúng của mọi header mang con số**. Guard so chuỗi giữ lại cho thứ mà chỉ nguồn mới nói
được (vd "route KHÔNG chứa `transformToByteArray`") — không dùng nó thay cho phép nối.

### 22. Ô kết quả nằm trong `try/catch` phải khởi tạo bằng trạng thái "CHƯA CHẠY"

Quy ước 14 nói *"số đếm của việc chưa chạy được là `null`, không phải `0`"*. Đúng, nhưng chưa
đủ: cái quyết định con số cuối cùng là **giá trị KHỞI TẠO**, vì mọi việc nền đều bọc
`try/catch` — hàm ném thì phép gán không chạy, và ô giữ nguyên thứ đã điền lúc dựng object.

**Đã vấp:** `cron-dem.ts` khởi tạo `taiDo: { daHuy: 0, conGiu: 0 }`. Khi việc dọn lượt tải dở
ném (thực tế nhất: token R2 thiếu quyền `ListMultipartUploads` — quyền riêng, khác Put/Get, và
bucket e-learning là bucket mới), lỗi rơi vào `ket.loi` còn báo cáo trả `daHuy: 0, conGiu: 0`
— đọc đúng thành *"đã quét, không có rác"*. Route trả `ok(...)` ⇒ HTTP 200 ⇒ giám sát cron
**xanh**, đêm nào cũng xanh, trong khi rác chồng lên mãi.

Mỉa mai: **cùng một object literal đã làm đúng hai lần** — `chungNhan: { chuaLamDuoc: … }` và
`examAttempt: null` — rồi phá luật ở ô thứ ba.

**Cách áp dụng:** khởi tạo mọi ô kết quả bằng dạng *chưa chạy* (`{ chuaLamDuoc: "chưa chạy" }`
hoặc `null`), để **thành công là thứ phải ghi đè vào**, không phải thất bại là thứ phải nhớ
dọn. Và câu khẳng định canh nó phải **phân biệt được hai hình dạng**:
`expect("daHuy" in r.x || "chuaLamDuoc" in r.x)` trên một kiểu union đúng bằng hợp của hai
dạng đó là một **hằng đúng** — nó xanh kể cả khi hàm ném hoàn toàn.

### 23. Kết quả máy chủ đọc ra phải được RÀNG BUỘC vào lượt ghi

Một endpoint đọc dữ liệu thật (byte của tệp, kết quả chấm, số đo) rồi `return ok({…})` mà
không ghi, không ký, không cấp vé, thì kết quả đó chỉ là **khuyến nghị**. Lượt ghi sau đó
không có cách nào biết nó đã chạy, và nhận lại chính con số mà client gửi lên.

**Đã vấp:** `xac-minh` đọc header mp4 từ R2, chạy đủ `kiemCodec` + `kiemChuanNopVideo` bằng con
số **đọc từ byte** — rồi trả JSON và thôi. Đường lưu bài nhận `durationSec` như một con số
client khai chỉ bị chặn trong `[5, 900]`, và để `codec` là `.optional()` với cổng gác
`if (input.codec)` — **bỏ trống trường đó là tắt cổng, im lặng**. Ba dòng chú thích ngay trên
lại tuyên bố *"Chốt codec ở ĐÂY… đây là chỗ duy nhất mà tệp và bản ghi gắn với nhau."*

Đây **không phải lỗ hổng leo thang quyền** — người đi đường này vốn được sửa chính bài đó. Nó
hỏng ở đường **không cố ý**: bất kỳ call-site mới nào (nhập hàng loạt, lưu lại tiêu đề, một
trình soạn khác) đều đi lọt, vì mặc định là *"không kiểm"*.

⛔ **Trường đầu vào của một cổng kiểm KHÔNG được `.optional()`.** Luật này đã có sẵn trong kho,
ở `media-rules.ts`: *"để optional thì một đường gọi mới quên truyền vẫn biên dịch xanh, và
trần … im lặng không áp cho đúng đường đó. Không đo được thì phải nói ra bằng `null`."*

**Cách áp dụng:** hai lối, chọn một — (a) endpoint đọc trả kèm **vé HMAC hạn ngắn** mang các
con số đã đo (khuôn có sẵn: `lib/elearning/media-ticket.ts`, chỉ đổi tiền tố), và lượt ghi
nhận vé làm trường **bắt buộc**, lấy số **từ vé**; hoặc (b) lượt ghi **tự đo lại** ngay tại
chỗ. Không có lối thứ ba là "tin con số client gửi kèm".

---

## Ba quy ước bổ sung — chốt qua EL-13 (25/08/2026)

### 24. Khoá quyền là CHUỖI TỰ DO — sai thì không có gì đỏ

`permission: "elearning:report:view"` trong một `ActionConfig`. Khoá đó không tồn
tại trong `ROLE_SEED`. Typecheck xanh (kiểu là `string`), lint xanh, build xanh.
Hậu quả: `can()` luôn trả `false`, tính năng im lặng không dùng được với **mọi**
vai — kể cả SUPER_ADMIN. Chỉ lộ khi có người thật ngồi thử, và câu họ báo là
*"bấm không ăn gì"*.

**Cách áp dụng:** đã có guard trong `tests/elearning/permissions.test.ts` quét mọi
`permission:` trong `lib/elearning/**` và đối chiếu `ROLE_SEED`. Module mới phải
có guard tương đương — hoặc mở rộng guard này ra thư mục của mình. Guard chỉ soi
dòng **khai** quyền, không soi mọi chuỗi trong tệp: chú thích hay nhắc tên khoá
cũ, bắt cả chúng là báo động giả.

### 25. Tính năng ghi CÁO BUỘC thì bộ test phải hỏi NGƯỢC

Mọi bộ test khác trong module hỏi *"có chặn/bắt đúng thứ phải bắt không"*. Với cờ
nghi ngờ, phần lớn case phải hỏi *"có gắn NHẦM không"*.

Vì hậu quả bất đối xứng: bỏ sót một người đối phó là mất một lượt học hình thức;
gắn cờ nhầm một người học thật là cáo buộc về hành vi người lao động, có tên người
xử, có hồ sơ, và người bị gắn phải đi khiếu nại để gỡ. Một bên là lãng phí, bên
kia là tổn hại.

**Cách áp dụng:** ở loại tính năng này, ngưỡng để RỘNG và mỗi luật chỉ bắt thứ gần
như bất khả thi khi làm thật. Viết case cho từng dạng người dùng ĐÚNG LUẬT trông
giống kẻ gian: dùng hết quyền được cấp (xem đúng trần tốc độ), làm nhiều lần một
việc tốt (tua lùi xem lại), hạ tầng kém (mạng chậm), mẫu dữ liệu quá nhỏ.

Và mọi đường ghi cáo buộc phải có **đường nói lại** dựng cùng lúc, không hẹn ticket
sau — cùng lý do khiến `evidenceJson` phải đóng băng con số: hai bên phải nhìn
cùng một thứ.

### 26. Hạn của người phải tính bằng NGÀY LÀM VIỆC

Khiếu nại gửi chiều thứ Sáu, cộng 5 ngày lịch ra thứ Tư ⇒ người xử chỉ có 3 ngày
làm việc thật, và mỗi lần rơi vào cuối tuần lại ra một con số khác. Họ trễ hạn vì
**cách tính**, không phải vì chậm.

**Cách áp dụng:** hạn ràng buộc MÁY (dọn dữ liệu, hết hiệu lực vé) tính bằng ngày
lịch; hạn ràng buộc NGƯỜI tính bằng ngày làm việc. Ngày lễ thì đừng đoán — repo
chưa có bảng lịch nghỉ, và chế một danh sách lễ không ai duyệt là dựng nguồn sự
thật thứ hai.

---
## Ràng buộc kèm theo, không thuộc hai mươi sáu quy ước nhưng dễ quên

- **Ngân sách cron: tối đa 2 khe** cho cả module. Bảy mốc nhắc gộp vào **một** cron quét
  (`elearning-reminders`, nhịp 15 phút); việc dọn dữ liệu thô 90 ngày gộp vào cron đêm
  (`elearning-dem`). ⛔ Không xin khe thứ ba. Mọi lịch cron mới phải mở `vercel.json` **đối chiếu khe
  trống thật** — và nhớ giờ trong đó là **UTC**, cộng 7 ra giờ Việt Nam.
- **Cờ `ORG_SCOPE_CUTOVER_ENABLED` của Nền Hệ thống P4 không được bật giữa GĐ2** — đó là lúc dữ liệu
  đo xem bắt đầu tích; đổi trục cách ly giữa chừng làm một phần dữ liệu nằm trục cũ, phần còn lại
  trục mới. Nếu P4 cần bật trong cửa sổ đó thì là quyết định chung của hai luồng.
- **Video đào tạo nội bộ không bao giờ nằm trong bucket gắn `cdn.satarobo.vn`** (bucket công khai).
  Nằm ở đó thì mọi cơ chế chống học đối phó của GĐ2 chỉ là trang trí.
- **Lượt gọi kho tệp chỉ để hỏi siêu dữ liệu phải dùng `HeadObject`, không phải `GetObject`
  với `Range: "bytes=0-0"`.** Một phản hồi luồng lấy về mà không đọc hết và không `destroy()`
  sẽ **giữ một khe socket** trong pool của SDK (mặc định 50 khe, `keepAlive` bật, **không có
  hạn chờ**) cho tới khi phía kho đóng nối rỗi — một hằng số bên ngoài, không có trong đặc tả,
  không đo được từ mã. Cách hỏng của nó là **request treo, không phải 5xx**, nên mọi chỉ số
  đếm 5xx đều mù với nó. Tiền lệ đúng: `app/(admin)/admin/scorm/_actions.ts:205`.
- **AC ĐO LƯỜNG không đóng được bằng unit test — nó đóng bằng một hiện vật đo có ghi lại.**
  Tách rõ hai loại khi lập DoD: AC *cấu trúc* (vd "mọi phản hồi là 206 với `Content-Range`
  đúng") đóng bằng test; AC *đo lường* (vd "p95 tới byte đầu ≤ 3 giây với 8 phiên đồng thời,
  tỉ lệ lỗi ≤ 1%") đóng bằng một lượt chạy tay trên hệ thật, **có số và có ngày**. Ghi cả hai
  vào ticket, đừng để loại thứ hai đội lốt loại thứ nhất rồi coi như xong khi CI xanh.
- **Cờ `ELEARNING_ENABLED` dùng `=== "true"`**, cố ý ngược khuôn `isTeacherSiteEnabled()` (dùng
  `!== "false"`, mặc định ON vì đã qua kỳ flip). Chép nguyên khuôn đó sang sẽ cho cờ **bật sẵn ngay
  khi merge**.
