# Luật đọc số và luật kết luận

| | |
|---|---|
| **Lập** | 07/09/2026, sau hai lần kết luận sai trong cùng một tuần |
| **Áp dụng cho** | mọi báo cáo, mọi phiên làm việc, mọi module |
| **Ai đọc** | agent và người viết báo cáo cho chủ dự án |

Hai luật dưới đây ra đời từ hai sự cố có thật, không phải từ nguyên tắc chung. Mỗi
luật kèm sự cố sinh ra nó, vì luật không có vết thương đi kèm thì lần sau không ai nhớ.

---

## Luật 1 — "0 dòng trên prod" KHÔNG được dùng để hạ mức nghiêm trọng

Một bảng rỗng nói lên **hai chuyện hoàn toàn khác nhau**, và chúng đòi hai hành động
ngược nhau. Phân biệt bằng **đường ghi còn sống hay đã chết**, không bằng số dòng.

| Đo được | Nghĩa | Phải làm |
|---|---|---|
| Đường ghi **SỐNG** + 0 dòng | **Bom hẹn giờ.** Chưa ai kích, không phải không kích được. | **Chặn ngay.** Cầu dao tính năng, không đợi lịch. |
| Đường ghi **CHẾT** + 0 dòng | Tính năng **chưa tồn tại** trên thực tế. | Xếp vào **vé xây**, không phải vé sửa. |

**Mỗi lần báo một con số 0, phải ghi kèm nó thuộc loại nào.** Không ghi = báo cáo
chưa xong.

> **Sự cố sinh ra luật (07/09/2026).** `RefundRequest` đo được 0 dòng trên prod. Đọc
> vội thành "hoàn tiền không phải việc gấp". Nhưng đường tạo đơn hoàn tiền vẫn sống, và
> `refund.ts` đọc `sessionsLearned = 0` (vì buổi kẹt ở SCHEDULED) nên nó đề xuất **hoàn
> 100% học phí** cho mọi đơn. 0 dòng ở đây nghĩa là *chưa ai bấm*, không phải *bấm cũng
> không sao*.

### Hệ quả: mọi con số phải ghi kèm phép tính sinh ra nó

Ghi **nhãn** là chưa đủ; phải ghi **cách ra số**. Số đo được và số suy ra phải tách
bạch, ở hai dòng khác nhau.

```
✅ "~16–20 tin đêm đầu — SUY RA: giả định 285 buổi phân bố đều trên 01/06→07/09
    (2,9 buổi/ngày × cửa sổ 7 ngày). CHƯA đo."
✅ "609/609 buổi có giờ khác nửa đêm — ĐO: psql trên satarobo_local,
    count(*) FILTER (WHERE date::time <> '00:00:00')."
❌ "khoảng 16–20 tin."
❌ "phần lớn buổi có giờ."
```

---

## Luật 2 — kết luận "hệ thống KHÔNG có cơ chế X" phải kiểm trên `origin/main`

Nhánh feature tụt sau `main` là trạng thái **bình thường**, không phải ngoại lệ. Đọc mã
trên nhánh đang đứng rồi kết luận về **hệ thống** là đọc một ảnh chụp quá khứ.

**Bắt buộc trước khi viết câu "không có / chưa có / không đường nào":**

```bash
git fetch origin main
git rev-list --left-right --count origin/main...HEAD   # trái = main đi trước bao nhiêu
git log origin/main --oneline -S "<từ khoá của cơ chế>" -- <đường dẫn>
git merge-base --is-ancestor <commit> origin/main       # cơ chế đó có trên prod chưa
```

Câu khẳng định phủ định phải nói rõ **đo trên ref nào, lúc nào**:
*"Không có handler nào tự đóng buổi — đo trên `origin/main` @ `6ce7ff9c`, 07/09/2026."*

> **Sự cố sinh ra luật (07/09/2026).** Báo cáo khẳng định *"không cron/handler nào tự
> đóng buổi; chỉ 2 chỗ ghi `status = COMPLETED`"*. Sai. Khối `#TU-HOAN-TAT` (commit
> `8b2ed43a`, 04/09/2026) tự đóng buổi sau khi lưu điểm danh, **đã trên `main` ⇒ đã lên
> prod**. Nhánh chấm công lúc đó tụt sau `main` **87 commit**, nên đọc mã trên nhánh là
> đọc hiện trạng của bốn ngày trước. Chẩn đoán, thứ tự ưu tiên và cả thiết kế việc C đều
> dựng trên tiền đề sai đó.

### Hệ quả: gộp `main` là việc ĐẦU TIÊN của phiên, không phải việc cuối

Độ lệch **tăng mỗi ngày** (60 → 87 trong một ngày, tại repo này). Giá phải trả tăng theo
hai đường cùng lúc: xung đột đắt hơn, **và** kết luận sai nhiều hơn. Đo trước khi gộp,
không cần chạm cây làm việc:

```bash
git merge-tree --write-tree origin/main HEAD   # thoát 1 = có xung đột
```

⚠️ Khi gộp mà `main` sửa file nhánh mình **đã xoá** (`CONFLICT (modify/delete)`), phải
mở từng bản vá của `main` ra đọc trước khi giữ việc xoá — bản vá bảo mật biến mất ở đây
thì **không để lại dấu vết nào** trong diff cuối.

---

## Luật 3 — chú thích không phải bằng chứng, schema mới là

Khi một con số phụ thuộc vào **hình dạng dữ liệu** (cột có giờ không, null nghĩa là gì,
đơn vị là gì), phải xác minh trên **schema + dữ liệu thật**, không tin chú thích.

> **Sự cố sinh ra luật (07/09/2026).** `HoanTatInput.ngayBuoi` chú thích
> *"(`@db.Date` — nửa đêm UTC của ngày VN)"*. Schema thật là `@db.Timestamptz(6)`, và
> đo trên `satarobo_local`: **609/609 buổi mang giờ thật (08:00–18:00), 0 buổi nửa đêm**.
> Cổng `ngayBuoi > vnDateOnly(now)` vì thế **luôn** trả "chưa tới ngày" trong chính ngày
> dạy ⇒ cơ chế tự đóng buổi không bao giờ nổ. Bộ test còn đóng dấu cho giả định sai: ca
> *"buổi HÔM NAY cũng đóng được"* truyền đúng nửa đêm — một hình dạng dữ liệu không tồn
> tại trong DB. **Test xanh, prod chết.**

Cách xác minh rẻ nhất, theo thứ tự:

1. đọc `prisma/schema.prisma` — kiểu cột thật;
2. một câu `psql` đếm phân bố (`count(*) FILTER (WHERE ...)`), không lấy mẫu 1 dòng;
3. chạy chính hàm đó với **một giá trị thật lấy từ DB**, in ra quyết định.

Bước 3 là bước biến "tôi nghĩ" thành "tôi đo".

---

## Luật 4 — fixture phải mang HÌNH DẠNG của dữ liệu thật

> **Dữ liệu tròn trịa trong test là dữ liệu không kiểm được gì.**

Nửa đêm đúng chằn, sĩ số 10, số tiền 100.000, chuỗi `"abc"` — chúng làm test dễ đọc và
làm test **mù đúng chỗ nguy hiểm nhất**. Hình dạng phải lấy từ phép đo, và **chú thích
kèm phép đo đó** để người sau không "dọn cho gọn".

> **Sự cố sinh ra luật (07/09/2026).** Ca `"buổi HÔM NAY cũng đóng được"` truyền
> `Date.UTC(2026,8,4)` — **đúng nửa đêm**. Trên DB không có buổi nào như vậy: đo
> `satarobo_local`, **0/609 buổi nửa đêm**, dải thật **01:00–11:00 UTC** (VN 08:00–18:00).
> Cổng `ngayBuoi > vnDateOnly(now)` vì thế xanh trong test và **luôn sai trên prod**.
> Cơ chế tự đóng buổi sống 3 ngày, đóng được đúng 1 buổi.

**Cách làm, theo thứ tự:**

1. đo hình dạng bằng một câu `psql` (`count(*) FILTER`, `min`, `max`) — **đừng lấy mẫu
   một dòng**, một dòng không nói lên phân bố;
2. dựng helper fixture theo dải đo được, **kèm số đo trong chú thích**;
3. thêm ít nhất một ca **RANH GIỚI** của dải đó (buổi muộn nhất trong ngày vs buổi sớm
   nhất ngày kế), vì lỗi lệch-một-bậc chỉ lộ ở rìa.

### Bẫy cụ thể của repo này: `date` KHÔNG cùng kiểu giữa các bảng

**9 model** có cột `date` kiểu `@db.Date` (nửa đêm là ĐÚNG):
`Holiday` · `ShiftBriefNote` · `ShiftRegistration` · `TimesheetAdjustmentRequest` ·
`TimesheetEditLog` · `TrialClassSession` · `CenterDayChecklist` · `AdsInsightDaily`.

**Đúng MỘT model** có `date` là `@db.Timestamptz(6)` — và nó là cái bận rộn nhất:

```prisma
model ClassSession {
  date  DateTime @db.Timestamptz(6)   // MANG GIỜ THẬT
}
```

Khớp theo TÊN CỘT là sai. Đáng chú ý hơn: `TrialClassSession.date` là date-only còn
`ClassSession.date` thì không — **hai loại buổi học, hai hình dạng ngày**.

Cùng họ: `workDate` (chấm công), `dob`, `fromDate`/`toDate` (đơn từ), `effectiveFrom`/
`effectiveTo` đều là `@db.Date` ⇒ nửa đêm ở đó là đúng, đừng "sửa" chúng theo luật này.

### Kết quả rà 08/09/2026

| Trạng thái | Chỗ |
|---|---|
| ❌ **Sai hình dạng — đã vá** | `lib/classes/adjust.test.ts` — `new Date(\`${s}T00:00:00\`)`: nửa đêm **và** thiếu `Z` (⇒ đọc theo múi giờ MÁY, dev +07 vs CI UTC ra hai thời điểm) |
| ✅ Đã đúng | `lib/lms/session-order.test.ts` (`T01:00:00Z`) · `lib/classes/default-session.test.ts` (`T11:00:00Z`) · `lib/portal/buoi-hoc.test.ts` · `lib/portal/feedback.test.ts` · `lib/classes/phases.test.ts` (qua `vnDateAt`) |
| ✅ Nửa đêm ĐÚNG (cột `@db.Date`) | `lib/cham-cong/generate.test.ts` · `tests/cham-cong/*.spec.ts` (`workDate`) · `lib/classes/schedule.test.ts` (`Holiday.date`) · `lib/lms/trial-row-status.test.ts` (`TrialClassSession.date`) · `lib/media-review/deadline.test.ts` · `lib/students/birthday-dates.test.ts` (`dob`) |

---

## Luật 5 — tập dựng cho mục đích A không được dùng cho mục đích B khi chưa kiểm lại định nghĩa

> **Trước khi tái sử dụng một tập/khoá có sẵn: viết ra ĐỊNH NGHĨA của nó, rồi đối chiếu
> với việc mới.** Tên gọi hợp lý không phải bằng chứng.

Đây là lỗi khó thấy nhất trong bốn luật trên, vì **không có dòng mã nào sai**. Tập được
dựng đúng, dùng đúng cú pháp, test của nó xanh. Chỉ có CÂU HỎI là khác.

> **Sự cố sinh ra luật (08/09/2026).** `actor.assignedClassIds` dựng bằng
> `OR: [{ teacherId }, { assistantId }]` (`lib/auth/actor.ts:453`) — **đúng cho QUYỀN**:
> trợ giảng phải mở được lớp mình phụ giảng. Nhưng `/teacher/bang-cong` lấy chính tập đó
> làm mẫu cho ô **"Buổi dạy"**, nên trợ giảng nhận về mình TOÀN BỘ buổi của lớp. Đo trên
> prod: **76 buổi**. Không dòng nào sai; tập chỉ đang trả lời câu "lớp nào tôi được vào"
> trong khi màn hình hỏi "buổi nào tôi đã dạy".

Cùng hình dạng, hai ví dụ khác trong repo:

- `attendance.count({ sessionId })` dựng để hỏi *"buổi này có bản ghi điểm danh nào chưa"*,
  bị dùng làm *"điểm danh đã phủ đủ sĩ số chưa"*. Học viên **học bù từ lớp khác** cũng
  sinh dòng ⇒ tử số phồng và bù chỗ cho em chưa được đánh dấu (vá `a94e5aa7`).
- Khoá quyền `sessions:*` mang hai nghĩa ở nhánh module Hệ thống.

**Ví dụ làm ĐÚNG, để đối chiếu:** `KHOAN_DA_XAC_NHAN` / `laKhoanDaXacNhan`
(`lib/finance/debt.ts`) — một predicate dùng chung cho MỌI phép cộng tiền trục A, kèm
chú thích tại chỗ nói rõ **không được** lọc thêm `paymentType`, và nói rõ trục B là câu
hỏi KHÁC với khoá KHÁC (đơn, không phải ghi danh). Tập được tái sử dụng **có kiểm lại
định nghĩa**, và định nghĩa đó được viết ra ngay cạnh nó.

**Minh hoạ ngược — TÁCH hạng để định nghĩa lộ ra (08/09/2026).** Script đo in gộp
*"buổi bị loại: lớp đã xoá / chưa có GV chính: 27"*. Một con số, hai nghĩa trái ngược:
lớp đã xoá là dọn dẹp bình thường, lớp còn sống thiếu GV chính là lỗi dữ liệu chặn cả
việc chốt buổi. Tách ra rồi đo lại trên prod: **27 / 0** — toàn bộ là lớp đã xoá, KHÔNG
có lớp nào thiếu giáo viên. Số gộp trông đáng lo suốt hai ngày; tách hạng vừa đóng được
vấn đề vừa chứng minh nó chưa từng tồn tại.

**Dấu hiệu nhận biết khi đọc mã:** một tập tên theo *chủ thể* (`assignedClassIds`,
`visibleCenterIds`) đang được dùng làm mẫu số của một *phép đo* (số buổi, số giờ, số
tiền). Quyền và thước đo gần như không bao giờ cùng một tập.

---

## Luật 6 — không đặt lệnh kiểm sau dấu ống

> **`pnpm test | grep` trả mã thoát của `grep`, không phải của `pnpm test`.**
> Hạ tầng chết cũng thành "xanh".

Rộng hơn: **một cổng kiểm im lặng khi hạ tầng hỏng thì TỆ HƠN không có cổng** — không
có cổng thì người ta còn tự kiểm; có cổng xanh giả thì người ta thôi kiểm. Nó cấp sự
tin tưởng sai.

> **Sự cố sinh ra luật (08/09/2026).** Lệnh kiểm trước khi commit là
> `pnpm test:finance-db 2>&1 | grep -E "Tests "`, nối trong một chuỗi `&&`. Postgres
> local vừa chết (`Can't reach database server`), bộ test ĐỎ — nhưng `grep` tìm thấy
> dòng nên trả 0, chuỗi `&&` đi tiếp, và commit được tạo trên một lượt kiểm đỏ. Phát
> hiện sau đó bằng mắt, không phải bằng cổng.

**Cùng họ với hai lỗi tuần này** — cổng luôn cho qua vì điều kiện không bao giờ đúng:

- `photoDone` không bao giờ `true` (ảnh tải lên không mang thẻ học viên) ⇒ điều kiện
  chặn hoá ra là cái khoá chết;
- nhãn "Hoàn tất" suy từ ba việc thay vì đọc `ClassSession.status` ⇒ màn hình báo xong
  cho một buổi chưa hề đóng.

### Cách làm

```bash
pnpm test:finance-db                      # để mã thoát đi thẳng
pnpm test:finance-db > out.log 2>&1; rc=$?; tail -5 out.log; [ $rc -eq 0 ]
set -o pipefail                           # trong shell script / run-block CI
```

Trong GitHub Actions, shell mặc định là `bash -e` — **KHÔNG có `-o pipefail`**. Mỗi
`run:` block có ống phải tự bật.

### Kết quả rà 08/09/2026

| Chỗ | Trạng thái |
|---|---|
| `patch-rbac-staff.yml` (ghi PROD) · `shadow-report.yml` | ✅ đã có `set -euo pipefail`; `shadow-report.yml` còn chú thích đúng lý do |
| `package.json` scripts | ✅ không script nào có ống |
| `scripts/*.sh`, `.claude/hooks/*.sh` | ✅ không có ống quanh lệnh kiểm |
| `backup-prod-db.yml` — dọn bản cũ trên R2 | ❌ **đã vá**: `aws s3 ls \| while` — `ls` hỏng thì vòng lặp không chạy lần nào, ống trả 0, bước XANH mà không xoá bản nào |
| `backup-prod-db.yml` — 3 ống còn lại | ✅ an toàn CÓ LÝ DO, đừng "vá" thêm: `pg_dump --version \| grep -q` có `\|\|` xử lỗi; hai chỗ kia nằm trong `$( )` của `echo` (chỉ hiển thị), và cổng toàn vẹn thật là dòng `pg_restore --list > /dev/null` **không có ống** ngay phía trên |

Chỗ hở duy nhất tìm được nằm ở CI. Chỗ hở thật sự gây ra sự cố nằm ở **thói quen gõ
lệnh của agent** — nên luật này áp cho cả hai.

---

## Luật 7 — tham số có mặc định NGUY HIỂM thì bỏ mặc định

> **Bỏ mặc định, để trình biên dịch liệt kê call site.**
> Rà bằng mắt rồi tin là đã hết là cách bỏ sót có hệ thống.

Một mặc định chỉ vô hại khi giá trị của nó là **lựa chọn an toàn**. Khi giá trị mặc
định gây **tác dụng phụ ra ngoài** — gửi tin, ghi tiền, giao bài, xoá, hay **mở rộng
phạm vi nhìn thấy** — thì mọi đường quên truyền đều sai theo hướng nguy hiểm nhất, và
"quên truyền" là chuyện chắc chắn xảy ra.

> **Sự cố sinh ra luật (08/09/2026).** `completeSession` có
> `assignMode: opts.assignMode ?? "NOW"`, mà "NOW" nghĩa thật là *giao bài tập cho cả
> lớp + bắn tin "Bài tập mới" tới phụ huynh*. Đọc mã bằng mắt tôi thấy **2** call site
> quên truyền. Bỏ mặc định, trình biên dịch chỉ ra **6** — gồm hai đường đang chết sau
> cờ mà mắt bỏ qua vì "đằng nào cũng không chạy", và hai file test.

**Cách làm:** đổi `x?: T` thành `x: T`, xoá `?? <mặc định>`, rồi để `tsc` liệt kê. Sửa
từng call site **kèm lý do chọn giá trị đó ngay tại chỗ** — nếu không, lần đọc sau
không phân biệt được "chọn NOW" với "chép của dòng trên".

### Kết quả rà 08/09/2026

**🔴 Cùng lớp, chưa sửa — `lib/lms/assignment.ts:105`**
```ts
const assignMode: AssignMode = opts.assignMode ?? "NOW";
```
`assignHomeworkForSession` lặp lại đúng mặc định vừa gỡ ở `completeSession`, **một tầng
dưới**. Hai caller hiện đều truyền tường minh nên chưa nổ — nhưng cái bẫy còn nguyên,
và nó ở đúng nơi thực sự tạo `HomeworkAssignment`.

**⚠️ Nguy hiểm hơn về chất — `lib/lead-handover/service.ts:89`**
```ts
resolveWhere(params.fromUserId, params.filters, params.visibleCenterIds ?? "ALL")
```
Mặc định của một tham số **PHẠM VI NHÌN THẤY** là `"ALL"` — tức **fail-open**. Quên
truyền là bàn giao lead trên **mọi cơ sở**. Mặc định của scope phải luôn là tập RỖNG
(fail-closed), không bao giờ là "tất cả".

**✅ Mặc định ĐÚNG HƯỚNG — giữ nguyên, đừng "chuẩn hoá" theo luật này:**

| Chỗ | Mặc định | Vì sao an toàn |
|---|---|---|
| `audit/audit-log.ts:368` | `unmask ?? false` | quên truyền ⇒ **che** PII |
| `audit/legacy-log.ts:69` | `canViewPii ?? false` | quên ⇒ không xem được PII |
| `lead/auto-assign.ts:358` | `actorIsHoLevel ?? false` | quên ⇒ **ít quyền hơn** |
| `trial/service.ts:316` | `allowOverride ?? false` | quên ⇒ không ghi đè |
| `classes/generate.ts:33` | `onlyIfEmpty ?? true` | quên ⇒ **không** ghi đè lịch đã có |

Khác biệt nằm ở **hướng của giá trị mặc định**, không ở việc có mặc định hay không.

### Điểm cộng ngoài dự kiến: nó còn kéo theo chỗ QUÊN SELECT

Ghi 08/09/2026, khi vá ba chỗ đếm buổi dạy (`giaoVienDuocQuyCong`).

Hàm mới nhận `substituteTeacherId` là trường **bắt buộc** trong tham số. Hệ quả không chỉ
là "mỗi call site phải nói ý định" — `tsc` còn bắt luôn
`dashboard/_components/manager-dashboard.tsx` **thiếu cột đó trong `select` của Prisma**:

```
error TS2345: Property 'substituteTeacherId' is missing in type
'{ class: { teacherId: string | null; }; actualTeacherId: string | null; }'
```

Đây đúng là hình dạng bug nguy hiểm nhất của lớp này: hàm quy công thì đúng, nhưng dữ
liệu nuôi nó thiếu một cột ⇒ nó nhận `undefined` và **rơi về nhánh cũ, im lặng**. Không
exception, không cảnh báo, chỉ là một con số sai.

Trường tuỳ chọn thì `tsc` cho qua. **Trường bắt buộc biến "quên select" từ lỗi câm thành
lỗi biên dịch.** Đó là lý do thứ hai để bỏ mặc định, ngoài lý do liệt kê call site.

### 09/09/2026 — chính người viết luật 6 vi phạm luật 6, và LUẬT KHÔNG ĐỦ

Commit `a3b833fc` mang **23 test đỏ**. Cách nó lọt:

```bash
pnpm test:unit 2>&1 | grep -E "Tests " | tail -2 && git commit ...
```

`grep` thành công ⇒ `&&` chạy tiếp ⇒ commit. Dòng `23 failed` **in ra ngay trước mắt** và
vẫn lọt. Luật 6 viết 07/09, vi phạm 09/09, bằng đúng cái ống nó cấm.

> **Một luật đã bị chính tác giả vi phạm trong hai ngày thì nó không phải luật — nó là
> một lời nhắc. Đổi nó thành CƠ CHẾ.**

Cơ chế: `.claude/hooks/chan-commit-khi-do.sh` — hook `PreToolUse` soi chuỗi lệnh, thấy
`git commit` thì chạy `typecheck` + `vitest related` cho file đã stage, đỏ thì `exit 2`.

Vì sao **không** dùng husky: `husky` là devDependency nhưng **chưa từng khởi tạo** (không
có `.husky/`, không script `prepare`, `core.hooksPath` chưa đặt). Và quan trọng hơn — cách
commit đang dùng là `git commit --no-verify`, mà `--no-verify` **bỏ qua mọi git hook**.
Hook Claude Code chặn ở tầng trên nên `--no-verify` không thoát được.

### 🔴 Phát hiện kèm theo: HAI hook an toàn của repo ĐỀU CHẾT

`block-env-add.sh` **và** `block-destructive.sh` cùng mở đầu bằng:

```bash
cmd="${CLAUDE_COMMAND:-}"
```

Biến đó **không tồn tại**. `cmd` rỗng ⇒ không mẫu nào khớp ⇒ hook luôn `exit 0` trong im
lặng. Trong khi CLAUDE.md ghi **"Security (ENFORCED by hooks)"**.

Nghĩa là suốt nhiều tháng: `git add .env` không bị chặn, `git reset --hard` không bị chặn,
`DROP TABLE` không bị chặn — và tài liệu nói ngược lại. Đây là **luật 12 áp cho hạ tầng**:
dòng chữ "ENFORCED by hooks" là một affordance, và nó nói dối.

Cách đúng: PreToolUse nhận **JSON trên STDIN**, đọc `.tool_input.command`.

**Giới hạn của hook mới, nói rõ để không ai tưởng nó chặn mọi thứ:** nó chạy `typecheck`
toàn repo + `vitest related` cho file đã stage. Test **quét cây thư mục**
(`bang-coverage`, `affordance-coverage`, `nav-coverage`) không import file nào nên
`related` **không bắt được** — mà đó đúng là loại test bắt lỗi ở file bạn không sửa. Test
cần Postgres và test browser cũng ngoài phạm vi. **Hook là lưới, CI vẫn là cổng cuối.**

---

## Luật 8 — test canh lỗi chỉ được tin sau khi CẤY LẠI lỗi và thấy nó ĐỎ

> **Test xanh không chứng minh gì.**
> Xanh có thể nghĩa là "lỗi không còn", cũng có thể nghĩa là "test không chạm tới lỗi".
> Hai thứ đó nhìn từ ngoài giống hệt nhau.

Quy trình bắt buộc cho MỌI test viết ra để canh một lỗi cụ thể:

1. viết test, chạy → **xanh**;
2. **cấy lại chính lỗi đó** vào mã (một dòng, `cp` file ra `/tmp` trước);
3. chạy lại → **phải ĐỎ, và đỏ ĐÚNG ca mình nhắm**;
4. khôi phục, chạy lại → xanh;
5. **ghi cả bốn bước vào commit** — người sau không chạy lại được bước 2.

Đỏ ở ca khác cũng là tín hiệu: test đang canh thứ khác với thứ mình nghĩ.

> **Sự cố sinh ra luật (08/09/2026).** Bộ test DB viết để canh lỗi
> `update: base` (nhập nhân sự ghi đè trọn hồ sơ) chạy **xanh 15/15 trong khi lỗi vẫn
> nằm nguyên trong mã**. Fixture dựng `giaTri` từ CHÍNH hàng cũ (`{ ...truoc }`), nên
> "ghi đè trọn hồ sơ" ghi lại đúng giá trị cũ — không có gì đổi để mà phát hiện.
> Chỉ bước 2 lộ ra điều đó. Sửa fixture theo hình dạng thật (luật 4) rồi cấy lại lỗi →
> đỏ đúng ca.

### Vì sao không dựa vào việc nhớ

Cùng ngày, quy trình này bắt được hai thứ ở hai chỗ khác nhau — cầu dao hoàn tiền và ca
trên — và **bỏ sót một lần** cho tới khi chạy bước 2. Một quy trình chỉ chạy khi người
làm nhớ ra thì nó không phải quy trình.

**Liên hệ với các luật khác:** đây là luật 6 (*cổng im lặng tệ hơn không có cổng*) áp cho
chính bộ test. Một test không bao giờ đỏ được là một cổng luôn cho qua — cùng họ với
`photoDone` không bao giờ true, và nhãn "Hoàn tất" suy ra.

---

### Luật 8 áp cho một CON SỐ, không chỉ cho một ca test

> **Một cột phân loại cũng phải được cấy thử.** Trước khi tin nó, hỏi đúng một câu:
> **"nếu cả hai nhánh đều rơi vào cùng một giá trị thì cột này in ra cái gì?"**
> Trả lời được là "vẫn ra hai nhóm" ⇒ cột đó không phân loại gì cả, nó chỉ trông giống thế.

Ca test xanh có thể nghĩa là "lỗi không còn" hoặc "test không chạm tới lỗi". Một con số
cũng vậy: nó có thể nghĩa là "thực tế đúng như vậy" hoặc **"phép đo không đo trúng thứ
mình nghĩ"**. Hai vế đó nhìn từ ngoài giống hệt nhau — cùng là một bảng số gọn gàng.

#### Sự cố 09/09/2026 — cột "tự động / người bấm" không phân biệt được gì

Câu hỏi: cổng tự đóng buổi có nổ không. Tôi chia buổi đã chốt thành hai nhóm theo
`ClassSession.completedById = null`, chạy trên prod, và ra:

```
  Tổng 40 buổi · tự động 1 · người bấm 39
```

Bảng gọn, số cụ thể, và **sai hoàn toàn**. Đường tự đóng gọi `completeSession` với
`actorId` của **chính giáo viên vừa lưu điểm danh**, nên `completedById` có giá trị ở
**cả hai** nhánh. Đọc thêm: cả hai còn cùng `action: "COMPLETE_SESSION"`, cùng
`assignMode: "DEFER"` — không trường nào khác nhau.

Suýt đọc *"tự động = 0 kể từ bản vá"* thành *"cổng không nổ"*, rồi đi đào một chỗ vốn đúng.

#### Câu hỏi rẻ đáng lẽ đã chặn được

Trước khi chạy, chỉ cần hỏi: *"đường tự đóng đặt `completedById` bằng gì?"* — mở đúng một
file là thấy. Phép đo tốn 40 giây chạy trên prod; câu hỏi tốn 10 giây đọc.

Dạng tổng quát, dùng được cho mọi cột phân loại:

| Trước khi tin cột X | |
|---|---|
| 1 | Nhánh A ghi gì vào X? **Đọc mã, đừng suy từ tên cột.** |
| 2 | Nhánh B ghi gì vào X? |
| 3 | Hai câu trả lời có khác nhau không? |
| 4 | Nếu không — **cột X chưa tồn tại.** Phải THÊM một dấu, không phải diễn giải khéo hơn. |

Ở đây bước 4 là trường `nguonChot: "TU_DONG" | "TAY"` bắt buộc ở `completeSession`, ghi
vào `newValues` của AuditLog (`lib/lms/nguon-chot.test.ts`). **Bắt buộc chứ không mặc
định** — mặc định nào cũng dán nhãn sai cho một trong hai đường, và nhãn sai không nổ lỗi,
không làm test đỏ; nó chỉ làm mọi phép đo về sau nói dối. Đó là luật 7 gặp luật 8.

#### Liên hệ

- **Luật 15** — ở đó một triệu chứng có nhiều nguyên nhân đủ. Ở đây một phép đo có nhiều
  cách sai. Cùng một gốc: **câu chuyện tự nó tròn không phải bằng chứng.**
- **Luật 12** — một cột tên là "tự động" là một LỜI HỨA với người đọc số, y như mũi tên là
  lời hứa với người dùng. Lời hứa suông không ném lỗi.
- Xem thêm ghi chú "Một lượt cấy không đỏ phải hỏi 'mình có cấy trúng không'" ở trên: cùng
  một phản xạ, áp cho hai thứ khác nhau.

---

## Luật 9 — cổng phải được cho ăn bằng thứ đường THẬT cho nó ăn

> Một ca test **tự dựng đầu vào cho cổng** thì nó kiểm cổng, không kiểm hệ thống. Nếu đầu
> vào ấy do một tầng khác tính ra, **tầng đó là chỗ bug sẽ nằm** — và ca test phải gọi
> nó, hoặc ít nhất mang đúng hình dạng thứ nó phát ra.

Sinh ra từ sự cố nhập nhân sự 08/09/2026 — chi tiết đầy đủ ở mục **Sổ sự cố** cuối file.
Tóm tắt: ca test cũ gọi
`dungPatchNhanSu(DAY_DU, new Set(["employeeCode", "centerSlug"]))`, tức **gõ tay `coMat`**
— đúng cái biến chứa lỗi. Test xanh, và nó xanh CHÍNH XÁC: nó đo hàm dựng patch, không đo
đường dẫn dữ liệu tới hàm đó. Ba cột ngày vẫn bị xoá trắng trên 9 hồ sơ prod.

**Câu hỏi để tự kiểm:** *đầu vào của cổng này do AI tính ra, và tôi có gọi kẻ đó không?*

Luật 11 ngay dưới là luật này ở quy mô một dòng `expect`.

---

## Luật 10 — một ca đỏ mà không ai bị chặn thì bằng không có ca

> **Trước khi tin một bộ test đang bảo vệ thứ gì, kiểm nó có nằm trong required check
> không.** "Bộ test có canh chuyện đó" và "bộ test chặn được người merge chuyện đó" là
> hai câu khác nhau, và chỉ câu thứ hai mới bảo vệ được gì.

**Hai lần trong hai ngày, cùng một họ:**

| Ngày | Ca đỏ | Nằm ở đâu | Hậu quả |
|---|---|---|---|
| 06–07/09 | `tests/cham-cong/timelog.spec.ts` | trong `include` của Vitest, nhưng 5/6 file tự `describe.skip` vì job `unit-tests` **không có Postgres** | đỏ thật từ 06/09, CI xanh suốt; bộ vé kiosk / kỳ công / tính lại / ma trận duyệt đơn không chạy một dòng |
| 08/09 | `tests/e2e/r7/withdraw-student-legacy-active.spec.ts` `[W5]` | job `e2e-r7` chạy đầy đủ và **báo đỏ đúng**, nhưng job đó **không phải required check** | cầu dao hoàn tiền `fb7f8422` merge lên main rồi lên PROD với ca đỏ; main đỏ liên tục từ `c78d0ae0` tới `2bfea6eb` |

Hai kiểu hỏng khác nhau — một cái **không chạy**, một cái **chạy mà không ai bị chặn** —
nhưng người đọc thấy y hệt nhau: một dấu tích xanh trên PR.

### Cách đo (đừng hỏi, đo)

Tài liệu từng ghi *"job nào là required check thì không đọc được từ repo"*. **Sai.** Đọc
được, một lệnh:

```bash
gh api repos/<owner>/<repo>/branches/main/protection \
  -q '.required_status_checks.contexts, .required_status_checks.strict, .enforce_admins.enabled'
```

Câu "không đọc được" là lý do câu hỏi này bị treo từ 07/09 sang 08/09 — **một tiền đề sai
về công cụ đã hoãn một phép đo mất 5 giây.** Cùng họ với tiền đề "file có 2 cột" trong sổ
sự cố ngay dưới.

### Số đo 08/09/2026 (nhánh `main`)

| | |
|---|---|
| Required | `Quality (typecheck + lint + build)` · `Unit tests (Vitest)` — **hết** |
| Chạy trên PR | 11 job, **6 384 ca** |
| Được cổng bảo vệ | **5 718 ca (89,6%)** |
| Ngoài cổng | **666 ca (10,4%)** — gồm 370 ca R7 và 198 ca tầng DB thật |
| Chưa từng chạy ở CI | thêm ~147 ca (`r1`–`r6`, `manual`, `acceptance`) |
| `enforce_admins` | `false` — **admin merge đè được cả hai cổng đang có** |
| `strict` | `false` — PR xanh trên base cũ vẫn merge được vào main đã đổi |

Hai cờ cuối đáng nhớ ngang danh sách `contexts`: **một cổng bỏ qua được không phải cổng**,
và `strict=false` chính là cơ chế đã để một nhánh tụt sau main mà vẫn xanh.

### Liên hệ với luật 8, 9 và 11

Bốn luật là bốn câu hỏi nối tiếp về **cùng một bộ test**, hỏi thiếu câu nào cũng ra một
dấu tích xanh vô nghĩa:

| | Câu hỏi | Hỏng nếu bỏ qua |
|---|---|---|
| **Luật 8** | ca này **đỏ được không**? | test không bao giờ đỏ — cổng luôn cho qua |
| **Luật 9** | nó đỏ ở **đúng chỗ bug nằm** không? | đỏ ở tầng mình tự gõ đầu vào, không phải tầng có bug |
| **Luật 11** | nó **soi đúng chuỗi** không? | với test grep: khớp nhầm chú thích, nhầm hàm khác, hoặc nuốt cả file vì cờ `/s` |
| **Luật 10** | ai đó **bị chặn** khi nó đỏ không? | đỏ đúng chỗ, và merge lên prod bình thường |

Thứ tự hỏi không quan trọng; **hỏi thiếu** mới quan trọng. Ngày 08/09/2026 đủ bốn ca:
luật 9 (nhập nhân sự xoá 3 cột ngày), luật 10 (cầu dao hoàn tiền merge với ca đỏ), luật
11 (ba ca grep soi nhầm chỗ), và luật 8 là thứ duy nhất phát hiện ra cả ba.

---

## Luật 11 — test grep mã nguồn là loại MONG MANH NHẤT

> **Ưu tiên khẳng định HÀNH VI.** Khi buộc phải canh bằng văn bản mã — chống một dấu `?`
> quay lại, chống một chuỗi bị chép sang chỗ khác — thì:
>
> · **neo vào chuỗi hẹp nhất có thể, KHÔNG dùng cờ `/s`;**
> · **khẳng định cả SỐ LẦN khớp, không chỉ có/không** — chú thích giải thích bản vá
>   thường chứa đúng chuỗi mà ta đang cấm;
> · **bắt buộc cấy lại lỗi (luật 8).** Một ca grep chưa cấy thử thì mặc định coi là **vô
>   dụng**, không phải "chắc là ổn".

### Ba lần trong MỘT ngày — 08/09/2026

Ba ca test khác nhau, ba cách soi nhầm chỗ, cùng một loại:

| Ca | Viết gì | Vì sao vô dụng |
|---|---|---|
| Q-04, khối Hội sở trên màn điểm chấm | `toMatch(/Hội sở.*Q-04/s)` | Cờ `s` cho `.` khớp cả xuống dòng ⇒ nó khớp **bất kỳ cặp nào trong cả file**. Xoá đúng lời giải thích vẫn XANH |
| `assignMode` bắt buộc | `not.toContain('?? "NOW"')` | Bắt trúng **chính chú thích giải thích bản vá** — chú thích nhắc lại chuỗi đang cấm ⇒ ĐỎ ngay lần chạy đầu, mà lỗi là của test |
| `assignMode` bắt buộc | `indexOf("assignMode: AssignMode;")` | Bắt trúng chữ ký của **`computeHomeworkDueAt` ở trên**, không phải chỗ vừa vá |

Hai ca đầu **suýt thành test xanh vĩnh viễn**. Cả ba chỉ lộ ra khi cấy lại lỗi.

### Vì sao đây là luật 9 ở quy mô nhỏ

Luật 9 nói *cổng phải được cho ăn bằng thứ đường thật cho nó ăn*. Một ca grep tự chọn
chuỗi để soi cũng đang tự dựng đầu vào cho chính nó — và nếu chọn nhầm chuỗi thì **xanh
hay đỏ đều không nói lên gì**. Khác biệt duy nhất là quy mô: luật 9 nói về một tầng của hệ
thống, luật 11 nói về một dòng `expect`.

### Cách viết cho đỡ mong manh

```ts
// ❌ khớp bất kỳ đâu trong file, và cờ `s` nuốt cả xuống dòng
expect(src).toMatch(/Hội sở.*Q-04/s);

// ✅ chỉ soi vùng NGAY CẠNH thứ đang canh
const i = src.indexOf("b.id !== HO_CENTER_ID");
expect(i).toBeGreaterThan(-1);
expect(src.slice(Math.max(0, i - 300), i)).toContain("Q-04");
```

```ts
// ❌ chú thích giải thích bản vá cũng chứa chuỗi này
expect(src).not.toContain('?? "NOW"');

// ✅ soi MÃ, không soi văn xuôi
expect(src).not.toContain('opts.assignMode ?? "NOW"');
expect(src).toContain("const assignMode: AssignMode = opts.assignMode;");
```

```ts
// ✅ đếm SỐ LẦN, không chỉ có/không — `dungPatchNhanSu` phải được gọi ĐÚNG một lần
expect(src.split("dungPatchNhanSu(").length - 1).toBe(1);
```

### Khi nào thì grep mã nguồn là ĐÚNG lựa chọn

Không phải lúc nào cũng sai. Nó đúng khi thứ cần canh **là hợp đồng chứ không phải hành
vi**, và hành vi sau khi vá **không đổi**:

· `assignMode` thành bắt buộc — mọi call site vốn đã truyền đủ, `tsc` xanh ngay lần đầu.
  Thứ đã đổi là **chữ ký**, và chữ ký chỉ đọc được ở văn bản;
· một bộ lọc bảo vệ một quyết định (`b.id !== HO_CENTER_ID`) — gỡ nó không làm test hành
  vi nào đỏ, vì hành vi đúng của nó là *không có gì xảy ra*;
· một luật "chỉ được gọi ở một chỗ" — không có cách nào quan sát bằng hành vi.

Trong cả ba ca đó, ba gạch đầu dòng ở đầu mục này là bắt buộc, không phải khuyến nghị.

---

## Luật 12 — affordance phải NÓI THẬT

> **Một phần tử giao diện gợi ý điều gì thì phải làm được điều đó.** Con trỏ, mũi tên,
> nhãn trạng thái, nút — tất cả đều là **lời hứa**. Lời hứa suông **không ném lỗi, không
> làm test đỏ, và người dùng sẽ tin nó**.

### Ba lần trong một tuần, cùng một họ

| Lời hứa | Sự thật | Người dùng thấy |
|---|---|---|
| Nhãn **"Hoàn tất"** trên site GV, suy ra từ ba điều kiện | `ClassSession.status` vẫn `SCHEDULED` | Buổi đã xong — trong khi hệ thống coi là chưa |
| **`photoDone`** đứng làm điều kiện chặn | Không bao giờ `true` được | Một cổng không bao giờ mở |
| **Chevron `>`** cuối mỗi dòng `/cham-cong` | `<svg aria-hidden>` trần, chưa từng được nối | Bấm mãi không có gì xảy ra |

Cả ba **không ném lỗi**, **không test nào đỏ**, và **console sạch**. Ca thứ ba đo tận nơi
trên prod 09/09/2026: 0 lỗi JS, 0 message, DOM xác nhận chevron không nằm trong
`button`/`a` nào. Không có gì *hỏng* — đơn giản là nó chưa bao giờ được nối.

Đó là lý do lớp bug này sống lâu: **mọi công cụ đều báo bình thường.** Thứ duy nhất phát
hiện được là một người dùng thật bấm vào và thấy im lặng.

### Cách kiểm

Với mỗi thứ trông-như-tương-tác, hỏi đúng một câu: **"cái này hứa gì, và nó làm được
không?"**

· mũi tên / chevron cuối dòng → có nằm trong `<button>`/`<a>`/trigger không? nếu không,
  cả hàng có phải vùng bấm không?
· `cursor-pointer` → thứ dưới con trỏ có bấm được thật không? **con trỏ một mình là lời
  hứa, không phải cơ chế**;
· nhãn trạng thái → nó đọc từ CỘT thật, hay suy ra từ mấy điều kiện? (xem luật 3)
· nút bị vô hiệu → có nói vì sao không? "không bấm được và không biết tại sao" cũng là
  một lời hứa gãy.

### Cách vá đúng: mở rộng vùng bấm, đừng gỡ mũi tên

Gỡ mũi tên đi là **mất một chỉ dẫn đúng**. Người dùng đã đọc đúng ý đồ; cái sai là hệ
thống chưa nối. Ở `/cham-cong` vá bằng cách cho **cả hàng** thành vùng bấm:

```tsx
<tr className="relative h-11 cursor-pointer group">      // neo + con trỏ nói thật
  <SheetTrigger className="… after:absolute after:inset-0 after:content-['']">
```

`after:inset-0` kéo vùng bấm của chính nút đó phủ kín hàng. **Không** bọc `<tr>` trong
`<button>` (HTML không cho) và **không** gắn `onClick` lên `<tr>` (hàng không nhận được
focus bàn phím). Mũi tên giữ `aria-hidden` — điều khiển có nhãn là `SheetTrigger` với
`aria-label="Chi tiết <tên>"`; đọc thêm "chevron right" chỉ là nhiễu.

⚠️ Chỉ an toàn khi hàng **không có phần tử tương tác nào khác** — lớp phủ sẽ nuốt chúng.
Đã rà trước khi vá: `ShiftCodeChip`, `DayTypePill`, `FlagList` đều 0 nút / 0 link.

### Cổng canh — và bài học cay nhất của ngày 09/09

`components/ui/affordance-coverage.test.ts` quét toàn repo: icon chỉ hướng trong `<td>`
phải nằm trong phần tử tương tác, hoặc hàng phải là vùng bấm (đủ **hai** mảnh
`cursor-pointer` + `after:inset-0`).

**Bản đầu của cổng này VÔ DỤNG, và phải viết lại BA lần** — mỗi lần chỉ lộ ra vì cấy lại
lỗi (luật 8):

| Lần | Vì sao vô dụng |
|---|---|
| 1 | Dò `<td` trong cửa sổ 12 dòng phía trên icon. Prettier tách dòng, khối chú thích đẩy `<td` ra xa hơn ⇒ **bỏ qua luôn** cái icon |
| 2 | `TUONG_TAC` khớp chữ trần `Trigger`, mà **chú thích của bản vá** có nhắc `SheetTrigger` ⇒ ô bị coi là có tương tác |
| 3 | `hangLaVungBam()` chạy trên cả file **kể cả chú thích**, mà chú thích ở `page.tsx:678` nhắc `` `after:inset-0` `` ⇒ file được miễn trừ **vĩnh viễn** |

Ba lần, cùng một cơ chế: **văn xuôi giải thích bản vá chứa đúng chuỗi mà bộ so khớp đang
tìm.** Đó là gạch đầu dòng thứ hai của luật 11, và nó cắn ngay chính cái cổng viết ra để
canh luật này. Bản dùng được phải `boChuThich()` **trước** mọi phép so, và tách
`iconTranTrongNguon` thành hàm THUẦN để anti-vacuity kiểm bằng đầu vào giả.

> **Nếu một cổng grep cần viết lại ba lần mới bite, hãy cân nhắc rằng công cụ đúng là một
> test HÀNH VI.** Ở đây hành vi thật ("bấm vào hàng có mở panel không") chỉ đo được bằng
> trình duyệt — `tests/e2e/a0` là chỗ của nó. Cổng grep hiện tại canh CẤU TRÚC, và nó chỉ
> đáng tin vì đã bị cấy lỗi bốn lần và đỏ đúng chỗ.

---

## Luật 12b — site GV đọc số của admin, không dựng lại

> **Trước khi thêm bất kỳ cột SỐ nào lên site giáo viên, tìm hàm admin đang dùng và GỌI
> nó.** Hai bản tính cho cùng một con số thì sớm muộn cũng lệch, và người dùng tin bản
> mình đang nhìn.

Đây là hệ quả trực tiếp của luật 12 — nhãn là lời hứa — nhưng đủ tái phát để đứng riêng.

### Ba lần trong hai tuần

| Lần | Site GV in gì | Admin in gì cho CÙNG ngày/ô | Nguồn của cái sai |
|---|---|---|---|
| Nhãn "Hoàn tất" trên màn buổi dạy | "Hoàn tất" suy từ ba điều kiện | `ClassSession.status` vẫn `SCHEDULED` | tự suy thay vì đọc `status` |
| Bảng công: cột Trạng thái | "Đã làm" cho MỌI dòng quá khứ | `6h51` + cờ `Thiếu lượt ra` | `done = dateKey < todayKey` — so ngày, không đọc dữ liệu |
| Bảng công: ngày nghỉ | "Ca làm · theo nơi làm" | (mã `X`/`P`, không giờ) | lọc bằng `isLeave`, mà `X` mang `isLeave: false` |

Lần thứ hai đáng nhớ nhất vì **hàm đúng ĐÃ ĐƯỢC GỌI SẴN**: `getMyAttendanceDays` nằm ngay
trong trang, đọc đúng `StaffAttendanceDay` mà admin đọc — nhưng kết quả chỉ dùng để cộng
**một con tổng** ở đầu trang, còn từng dòng vẫn tự suy từ ngày. Nghĩa là: *gọi đúng nguồn
là chưa đủ, phải để nó quyết định thứ hiển thị.*

### Cách làm

1. Tìm màn admin hiển thị cùng con số đó. Ghi ra **tên hàm** và **cột DB** nó đọc.
2. Nếu site GV không gọi được vì ranh giới thư mục/quyền → **nói rõ ranh giới đó là gì
   trước** khi đề xuất đường vòng. (10/09/2026: đo ra **không có** ranh giới nào —
   `lib/cham-cong/my-schedule.ts` đã dùng chung cho cả hai màn từ đầu.)
3. Phép nối "dữ liệu × hiển thị" **không được nằm inline trong một trang RSC** — ở đó
   không có chỗ nào cấy lỗi vào để thấy đỏ. Đưa ra hàm thuần
   (`lib/cham-cong/bang-cong-gv.ts`), trang chỉ chuyển hình dạng rồi in.
4. Nhãn suy ra từ dữ liệu để ở **một** chỗ (`lib/cham-cong/nhan-ca.ts`), cả hai màn cùng gọi.

### Cổng canh, và giới hạn của nó

| Cổng | Bắt được | KHÔNG bắt được |
|---|---|---|
| `lib/cham-cong/bang-cong-gv.test.ts` (hành vi) | mọi lỗi trong phép nối: hardcode trạng thái, bỏ ngày nghỉ, rơi mất ngày không còn ca | chuỗi gõ thẳng trong JSX |
| `lib/cham-cong/nhan-mot-nguon.test.ts` (grep, hẹp) | `"Đã làm"` / `"theo nơi làm"` gõ thẳng trong màn chấm công | mọi nhãn khác |

Cả hai đã bị **cấy lại lỗi** và đỏ đúng bộ (luật 8). Giới hạn còn lại phải nói ra: một ô
bảng in `{"Đã làm"}` chỉ bị cổng grep bắt — không có test hành vi nào chạm tới JSX của
trang RSC nếu không dựng trình duyệt. Đừng đọc "hai bộ xanh" thành "không thể sai".

---

## Luật 13 — trước khi tin một lượt "chỉ thêm", đọc `git diff --stat`

> **`Write` lên một file đang tồn tại là GHI ĐÈ, không phải thêm vào.** Một lượt sửa mà
> trong đầu là "tôi bổ sung mấy ca test" nhưng trên đĩa là "tôi thay cả file" trông giống
> hệt nhau ở màn hình — trừ một chỗ: **số dòng bị XOÁ trong `git diff --stat`.**

### Sự cố 09/09/2026 — 90 dòng test biến mất trong một lượt "thêm ca"

Việc đang làm: thêm 3 ca đối chiếu `SHIFT_CATALOG` với bảng chốt trong docs. Công cụ
dùng: `Write` lên `lib/cham-cong/catalog.test.ts`. File đó **đã có sẵn 26 ca**.

```
lib/cham-cong/catalog.test.ts | 196 +++++++++++++++++--------------------
1 file changed, 106 insertions(+), 90 deletions(-)
```

`90 deletions(-)` trong một lượt tự nhận là "chỉ thêm". Đó là toàn bộ bộ test cũ. Không
có lỗi nào ném ra, `tsc` xanh, `vitest` xanh — vì 106 dòng mới **tự nó** là một bộ test
hợp lệ. Thứ duy nhất nói ra sự thật là con số `90`.

Khôi phục bằng `git show HEAD:<file>` rồi gộp tay; diff cuối còn **+106 / −1**.

### Vì sao nó nguy hiểm hơn vẻ ngoài

Cùng cơ chế với sự cố nhập nhân sự 08/09 (Sổ sự cố): **mất dữ liệu im lặng vì "vắng mặt"
được hiểu thành "cố ý"**. Ở đó là ô trống trong file Excel; ở đây là ca test không có
trong chuỗi tôi vừa gõ. Cả hai đều không ném lỗi, và cả hai chỉ lộ khi có người **so với
trạng thái TRƯỚC ĐÓ**.

| Hình dạng | Đọc là |
|---|---|
| `N insertions(+), 0 deletions(-)` | đúng là chỉ thêm |
| `N insertions(+), M deletions(-)` với M lớn | **DỪNG** — đọc `git diff` đầy đủ trước khi commit |

Ba việc phải làm, không phải một:

1. **Ưu tiên `Edit`** (chèn vào chỗ neo) hơn `Write` khi file đã tồn tại. `Edit` không thể
   xoá thứ mình không nhắc tên.
2. Buộc phải `Write` thì **đọc file trước** và gộp bằng tay — "tôi nhớ file đó có gì" không
   phải là đọc.
3. **`git diff --stat` trước mỗi commit.** Rẻ, và nó là thứ duy nhất phát hiện được ca này.

> Luật 6 chặn commit khi test ĐỎ. Luật 13 chặn commit khi test **BIẾN MẤT** — mà test biến
> mất thì bộ vẫn XANH, nên luật 6 và cơ chế của nó không thấy gì cả.

---

## Luật 14 — lưới an toàn phải có TEST CỦA CHÍNH NÓ

> **Một hook, một cổng, một cầu dao mà không ai cấy thử thì mặc định coi là ĐÃ CHẾT.** Và
> tài liệu nói nó đang sống chỉ làm mọi người yên tâm nhầm lâu hơn.
>
> Đây là **luật 12 áp cho hạ tầng**: dòng chữ `ENFORCED` cũng là một affordance, và
> affordance phải nói thật.

### Sự cố 09/09/2026 — hai hook an toàn chết nhiều tháng dưới dòng chữ "ENFORCED"

`.claude/hooks/block-env-add.sh` và `.claude/hooks/block-destructive.sh` **cùng lúc mang
HAI lỗi**, mỗi lỗi một mình đã đủ giết chúng:

| # | Lỗi | Vì sao câm |
|---|---|---|
| 1 | `cmd="${CLAUDE_COMMAND:-}"` | biến đó **không tồn tại**. PreToolUse đưa JSON qua **STDIN**, chuỗi lệnh ở `.tool_input.command`. `cmd` rỗng ⇒ không mẫu nào khớp ⇒ `exit 0` |
| 2 | chặn bằng `exit 1` | Claude Code chỉ coi **`exit 2`** là CHẶN. `exit 1` là "lỗi không chặn" ⇒ kể cả khi đọc đúng lệnh, nó vẫn cho qua |

Trong khi `CLAUDE.md` mục 8 ghi **"Security (ENFORCED by hooks)"** và `.claude/rules/prisma-db.md`
ghi *"hook `block-destructive.sh` CHẶN (bảo vệ prod)"*. Cả hai câu đều sai, cả hai đều
được đọc và tin.

**Vì sao không ai phát hiện:** không có ca test nào **cấy thử một lệnh phải bị chặn**.
Hook viết đúng ý, chú thích đầy đủ, danh sách mẫu chặn dài — và không chặn nổi thứ gì.

### Điều đáng sợ nhất: lỗi #2 khiến lỗi #1 KHÔNG THỂ bị phát hiện bằng mắt

Giả sử ai đó nghi ngờ và sửa lỗi #1. Hook đọc đúng lệnh, khớp đúng mẫu, **in ra đúng dòng
`🚫 BLOCKED`** — rồi `exit 1`, và lệnh vẫn chạy. Người sửa thấy chữ BLOCKED hiện lên và
kết luận "xong rồi". Hai lỗi che nhau.

⇒ **Chỉ MÃ THOÁT mới là bằng chứng.** Không phải dòng chữ hook in ra.

### Hình dạng của ca test đúng

`.claude/hooks/hooks.test.ts` — 27 ca, mỗi ca **chạy thật** cái hook bằng `execFileSync`,
đưa **JSON thật** trên stdin, và đọc **mã thoát**:

```ts
const json = JSON.stringify({ tool_name: "Bash", tool_input: { command } });
execFileSync("bash", [join(HOOKS, hook)], { input: json, ... });
// bắt lỗi ⇒ err.status; kỳ vọng === 2
```

Grep nội dung file hook **không chứng minh được gì** (luật 11): bản chết chứa đủ mọi mẫu
chặn, đủ mọi dòng `BLOCKED`, và vẫn cho qua tất cả.

### Bốn lượt cấy (luật 8) — đo 09/09/2026

| Cấy | Số ca đỏ |
|---|---|
| trả `block-env-add` về đọc biến môi trường (lỗi gốc #1) | **3** |
| hạ mã thoát chặn `2 → 1` ở `block-destructive` (lỗi gốc #2) | **11** |
| gỡ **một** mẫu khỏi danh sách chặn | **1** |
| viết hook nhưng **không cắm** vào `settings.json` | **1** |
| _(gỡ hết cấy)_ | 0 — 27/27 xanh |

Lượt cấy thứ tư quan trọng riêng: **viết ra mà không cắm thì cũng như chết**, và đó là một
đường chết khác hẳn hai đường trên.

### Ba việc phải làm khi dựng một lưới an toàn mới

1. **Ca test cấy lỗi** — không có thì lưới coi như chưa tồn tại.
2. **Ca test kiểm nó ĐƯỢC CẮM** — file đúng mà không khai trong `settings.json` /
   `vitest.config.ts` `include` / required check là câm hoàn toàn.
3. **Ghi vào tài liệu ĐÚNG hiện trạng, có ngày.** Câu "ENFORCED" không kèm ngày và không
   kèm ca test là câu không kiểm được.

### Ba đường chết đã gặp, cùng một hình dạng

| Lưới | Chết vì | Ngày |
|---|---|---|
| `block-env-add` / `block-destructive` | đọc sai nguồn + mã thoát sai | 09/09 |
| `tests/cham-cong/**` (2 bộ) | không khai trong `vitest.config.ts` `include` ⇒ *"No test files found"*, CI vẫn xanh | 08/09 |
| 666 ca R7 + tầng DB | job không phải **required check**, `enforce_admins=false` | 08/09 |

Cả ba đều là **cổng im lặng khi hạ tầng hỏng** — tệ hơn không có cổng, vì nó mua sự yên
tâm bằng không có gì.

### Bẫy kèm: chính hook mới cắn ngay lượt đầu

Lệnh đo bốn lượt cấy bị `block-destructive` chặn — vì **nhãn `echo` tiếng Việt của nó**
viết nguyên văn chuỗi đang bị cấm để mô tả việc mình sắp làm. Đây là **lần thứ sáu** trong
hai ngày cùng một bẫy (luật 11, gạch đầu dòng 2): *văn xuôi giải thích bản vá chứa đúng
chuỗi mà bộ so khớp đang tìm* — lần này ở hạ tầng chứ không ở test. Cách đi vòng: đưa
kịch bản ra file rồi `bash <file>`.

⚠️ **Đó cũng là một GIỚI HẠN THẬT của hook, phải nói ra:** nó chỉ soi chuỗi lệnh ở tầng
trên. `bash mot-file.sh` thì nội dung file **không** đi qua hook.

---

## Luật 15 — một triệu chứng có thể có NHIỀU nguyên nhân ĐỦ

> **Tìm ra một nguyên nhân giải thích được triệu chứng KHÔNG có nghĩa là đã tìm hết.**
> Mỗi nguyên nhân "đủ" một mình đã tạo ra đúng triệu chứng đó, nên vá một cái thì triệu
> chứng **vẫn y nguyên** — và phép quan sát sau khi vá sẽ nói dối rằng bản vá không chạy.

Khác với "nguyên nhân góp phần": ở đó vá một cái thì số nhúc nhích, ta biết mình đúng
hướng. Ở đây số **không nhúc nhích một li**, và đó chính là cái bẫy.

### Sự cố 09/09/2026 — "công dạy = 0" có HAI nguyên nhân đủ

| # | Nguyên nhân | Tình trạng |
|---|---|---|
| 1 | Buổi đã qua ngày mà chưa chốt ⇒ không vào phép đếm | **đã vá**, định quan sát 3 ngày để xác nhận |
| 2 | Bảng `TeachingCreditType` **RỖNG** trên prod | phát hiện 09/09 khi đo danh mục nền |

Nguyên nhân 2 một mình đủ tạo ra số 0. Đường đi:

```
loadLoaiCongDay()  → []            (bảng rỗng)
loaiCua(buoi, [])  → null          (không dòng nào khớp)
congDayCuaNguoi()  → continue      (bỏ MỌI buổi)
                   → tongCong = 0, tongBuoi = 0
```

Không exception, không cảnh báo, console sạch.

**Nếu không phát hiện kịp:** ba ngày nữa mở màn Công dạy, thấy vẫn 0, và kết luận *"bản vá
buổi chưa đóng không chạy"*. Rồi đi đào lại một chỗ vốn đã đúng — trong khi chỗ sai nằm ở
một bảng không ai nhìn.

### Vì sao dễ dính: ta dừng lại ngay khi câu chuyện KHỚP

Nguyên nhân 1 giải thích được 100% triệu chứng. Nó đúng. Nó đã được đo. Cảm giác "xong
rồi" đến từ chỗ **câu chuyện tự nó đã tròn**, không phải từ chỗ ta đã quét hết đường đi.

### Việc phải làm

1. **Đi HẾT đường từ triệu chứng ngược về nguồn**, kể cả sau khi đã tìm ra một nguyên
   nhân đủ. Ở đây đường là: màn → hàm tổng → hàm khớp loại → **danh mục** → DB.
2. **Ở mỗi mắt xích, hỏi "nếu chỗ này rỗng/null thì triệu chứng có y hệt không?"**
   Trả lời "có" ⇒ đó là một nguyên nhân đủ nữa, phải đo chứ không được suy.
3. **Trước khi mở phép quan sát xác nhận bản vá, liệt kê những gì KHÁC có thể giữ số ở 0.**
   Không làm bước này thì phép quan sát không phân biệt được "vá hỏng" với "còn nguyên
   nhân khác", và nó sẽ được đọc thành vế thứ nhất.

### Liên hệ

- **Luật 1** — bảng rỗng + đường đọc còn sống = số 0 im lặng. Luật 15 là chuyện gì xảy ra
  khi số 0 đó đứng cạnh một bug khác đã được vá.
- **Luật 8** — cấy lại lỗi rồi xem có đỏ không. Ở đây phép "cấy" tương ứng là: **làm rỗng
  bảng danh mục trên bản sao và xem con số có về 0 không** — đó là cách chứng minh nguyên
  nhân 2 là đủ, thay vì chỉ đọc mã rồi tin.
- **Luật 6/14** — cùng một họ: cái hỏng không kêu. Ở luật 14 là cổng chết mà tài liệu bảo
  đang sống; ở đây là một nguyên nhân còn sống mà câu chuyện bảo đã xong.

---

## Luật 16 — mọi cổng CHẶN phải có ca khẳng định đường KHÔNG bị chặn vẫn chạy

> **Không có nó thì "chặn nhầm tất cả" cũng XANH, và bộ test sẽ khen một hệ thống đã tắt.**

Một cổng có hai nửa nghĩa vụ:

| Nửa | Ca test | Hỏng mà không có ca này thì sao |
|---|---|---|
| CHẶN đúng thứ phải chặn | `PHAI_CHAN` | lỗ mở, dữ liệu hỏng — **ồn ào**, sớm muộn có người thấy |
| CHO QUA đúng thứ phải cho qua | `PHAI_CHO_QUA` | **hệ thống tắt trong im lặng**, và bộ test báo xanh |

Nửa thứ hai bị bỏ quên thường xuyên hơn vì nó nghe như "test cái không xảy ra". Nhưng nó
mới là nửa canh cái hỏng ĐẮT hơn: một cổng chặn hụt làm rò một đường; một cổng chặn thừa
làm chết mọi đường, và không ai biết vì mọi phép kiểm vẫn xanh.

### Ca cụ thể — 09/09/2026, cổng chặn `session.taught` cho lượt backfill

Lượt backfill KHÔNG được phát `session.taught` (ba người nghe: giao bài tập hồi tố · gửi
tin cho phụ huynh · hệ quả R7). Cổng viết ra, ca `[BACKFILL-1]` xanh.

Nhưng cấy thử `if (true) { return; }` — tức **chặn CẢ lượt đóng thật** — thì
`[BACKFILL-1]` **vẫn xanh**. Nó chỉ hỏi "backfill có bị chặn không", và câu trả lời vẫn là
có. Nếu bản vá đó lọt, ta vừa tắt đường giao bài tập của **toàn hệ thống** với một bộ test
toàn xanh.

Thứ bắt được nó là `[BACKFILL-3]`: *"lượt đóng THẬT vẫn phát sự kiện và vẫn ghi SNAPSHOT"*.

### Cách viết nửa thứ hai cho đúng

1. **Cho ăn thứ GẦN NHẤT với thứ bị chặn**, không phải một đầu vào bất kỳ. Cổng chặn
   `git commit` khi đỏ thì ca cho-qua phải là **một lượt `git commit` trên cây XANH**, chứ
   không phải `ls -la` — `ls` chỉ chứng minh cổng không chặn mọi lệnh, nó không chứng minh
   cổng còn cho commit đi qua.
2. **Cấy đúng lỗi "chặn nhầm tất cả"** và xem ca đó có đỏ không (luật 8). Ở đây phép cấy
   là ép điều kiện chặn thành `true`.
3. Cổng có **đường vượt** thì đường vượt cũng cần cả hai nửa: vượt hợp lệ ⇒ qua; vượt
   không đủ điều kiện ⇒ vẫn chặn.

### Kết quả rà 09/09/2026 — 11 cổng dựng trong tuần

| Cổng | Nửa CHO QUA | |
|---|---|---|
| `block-destructive.sh` | `PHAI_CHO_QUA` 5 ca (lệnh thường · xoá một file · đẩy thường · reset trên DB local · shadow trỏ local) | ✅ |
| `block-env-add.sh` | `.env.example` · lệnh không phải `git add` | ✅ |
| `chanSuaKyDaChot` | `OPEN`/`REOPENED`/`CLOSING`/chưa có kỳ ⇒ qua; TỪ CHỐI đơn cũ vẫn làm được | ✅ |
| `chanChotKyThieuBuoi` | kỳ không có buổi nào ⇒ qua, KHÔNG khoá vĩnh viễn | ✅ |
| cổng sức khoẻ danh mục | hình dạng lành mạnh ⇒ im lặng; đủ điểm chấm ⇒ im lặng | ✅ |
| `cotCoMat` (nhập nhân sự) | ô ngày CÓ giá trị thì VẪN ghi | ✅ |
| `roster-guard` | số đo lúc dạy ⇒ qua; lô sạch không ném | ✅ |
| `affordance-coverage` | bỏ qua mũi tên trong `<button>`; bỏ qua khi cả hàng là vùng bấm | ✅ |
| `suaGioQuetTayAction` (4 cổng) | lượt hợp lệ vẫn ghi thêm dòng; đường vượt HO ⇒ qua | ✅ |
| chặn `session.taught` cho backfill | `[BACKFILL-3]` — đường đóng THẬT vẫn phát sự kiện | ✅ |
| **`chan-commit-khi-do.sh`** | chỉ có `ls -la` ⇒ qua. **KHÔNG có ca "`git commit` trên cây XANH ⇒ qua"** | 🔴 **THIẾU** |

Và một cổng CHẶN **không có test nào của chính nó** (luật 14, chưa phải luật 16):
`tests/_helpers/db-gate.ts` — cổng `ALLOW_DB_RESET` chặn `resetDb()` chạy sai lúc. Không
có file test nào cho nó; nếu nó chặn nhầm luôn cả các bộ `test:*-db` thì triệu chứng là
"bộ DB đỏ hết", dễ bị đọc thành lỗi khác.

### Liên hệ

- **Luật 14** — lưới an toàn phải có test của chính nó. Luật 16 nói cái test đó phải có
  MẤY nửa.
- **Luật 8** — cách chứng minh nửa thứ hai đáng tin: cấy "chặn nhầm tất cả" và xem nó đỏ.
- **Luật 15** — cùng gốc: một kết quả xanh có nhiều cách để đúng vì lý do sai.

---

## Luật 17 — tài liệu KHÔNG ghi số lượng, ghi TÊN FILE và CÁCH ĐỌC RA con số

> **Số trong docs không có gì giữ cho đúng, và nó sai theo cách thuyết phục** — người đọc
> dừng lại ở con số thay vì đi mở file. Một câu sai mà nghe chắc chắn tệ hơn không có câu nào.

Phân biệt hai loại số, luật này chỉ nhắm loại thứ nhất:

| Loại | Ví dụ | Luật 17 |
|---|---|---|
| **ĐẾM cấu trúc repo** — ai cũng đếm lại được, và nó đổi mỗi lần có người thêm một dòng | "`include` có 4 chỗ" · "27 ca test" · "bảng test 990 dòng" | ❌ **đừng ghi** |
| **ĐO một thời điểm** — có ngày, có nguồn, không ai kỳ vọng nó còn đúng | "đo prod 09/09: 90 buổi THOẢ" · "666 ca ngoài cổng (08/09)" | ✅ giữ, **bắt buộc kèm ngày + lệnh đo** |

Loại thứ hai là thứ luật 1 và luật 3 ĐÒI phải có. Loại thứ nhất là thứ tự nó mục ruỗng.

### Viết thế nào thay vì ghi số

| Đừng | Viết |
|---|---|
| "`include` có 4 chỗ" | "danh sách đầy đủ ở `vitest.config.ts`, mảng `include`" |
| "hooks.test.ts có 27 ca" | "`.claude/hooks/hooks.test.ts` — chạy `pnpm exec vitest run .claude/hooks` để biết số ca" |
| "16 role × 245 quyền" | "nguồn là `prisma/seed-roles.ts`; đếm bằng `SELECT count(*) FROM \"RolePermission\"`" |
| "bảng test 990 dòng" | "bảng test ở `lib/auth/route-policy.test.ts` — file lớn, đọc trước khi sửa" |

Câu thay thế **dài hơn một chút và không bao giờ sai**. Nó cũng làm được việc mà con số
không làm được: chỉ người đọc tới đúng chỗ.

### Ba lần trong MỘT tuần, cùng hình dạng

| Câu | Thực tế | Hậu quả |
|---|---|---|
| `.claude/rules/prisma-db.md`: *"Env riêng cho test: `.env.test`"* rồi liệt kê **2 dòng** | cần **6 biến** | Bộ R7 đầy đủ đỏ giả **9 ca**. Mất một buổi đi tìm hồi quy không có thật |
| `docs/elearning/quy-uoc-nen.md`: *"include có bốn chỗ"* | **12 mục** (đo 09/09) | Người viết test mới tin là đã được phủ; đúng loại hỏng câm mà chính mục đó sinh ra để chặn |
| BA: *"16 role × 245 quyền"* | `main` có **188** | Con số đi vào một tài liệu bàn giao và không ai kiểm lại |

Điều đáng chú ý nhất ở ca thứ hai: file đó **đã tự sửa một lần** — có hẳn dòng *"⚠️ Sửa
08/09/2026: dòng này từng viết 'bốn chỗ', nay có 10 mục"*. Một ngày sau, **10 cũng sai**
(nay 12). Con số không sống sót nổi một ngày trong một repo đang chạy. Sửa nó không phải
là giải pháp; **bỏ nó đi** mới là.

### Kết quả rà 09/09/2026 — `CLAUDE.md` + `docs/`

**Đang SAI:**

| Chỗ | Ghi | Đo được |
|---|---|---|
| `CLAUDE.md` mục 8 | `hooks.test.ts` "27 ca" | **31** — lệch trong cùng ngày, do chính lượt thêm ca của tôi |
| `docs/bo-test-ngoai-cong-merge.md` | "CI gọi 7 script" playwright | CI gọi **5** config |
| `docs/elearning/quy-uoc-nen.md` §3 | "thư mục được phủ: 5 chỗ" / ghi chú sửa "10 mục" | **12** mục |
| `docs/elearning/quy-uoc-nen.md` §8 | "bảng test 990 dòng" | **1.513** dòng |

**Đang ĐÚNG hôm nay — nhưng vẫn là số lượng, vẫn sẽ trôi:**
`CLAUDE.md` "3 file allowlist" (=3) · "ba hook `PreToolUse`" (=3) · "9 roles" (=9) ·
`bo-test-ngoai-cong-merge.md` "15 file `playwright.*.config.ts`" (=15).

⚠️ Ngay cả **phép đếm** cũng mơ hồ: đếm mục `include` bằng hai câu grep khác nhau cho ra
15 và 17; chỉ khi tách đúng mảng mới ra 12. Nếu người viết docs còn đếm ra ba số khác
nhau thì con số trong docs lại càng không đáng tin.

### Liên hệ

- **Luật 3** — chú thích không phải bằng chứng. Luật 17 là hệ quả: **con số trong văn xuôi
  cũng không phải bằng chứng**, kể cả khi nó từng đúng.
- **Luật 1** — mọi số báo ra phải kèm phép tính sinh ra nó. Trong docs, "phép tính" chính
  là câu chỉ đường tới file — và nó thay được luôn con số.

---

## Luật 18 — mỗi ca test phải XANH khi chạy MỘT MÌNH

> **Bộ xanh khi chạy đủ không chứng minh gì về cách ly** — nó chỉ chứng minh **thứ tự hiện
> tại đang cứu nhau.** Ca nào mượn trạng thái của ca trước sẽ đỏ vào đúng ngày runner chậm,
> và triệu chứng sẽ chỉ vào **ca vô tội đứng sau**.

### Hình dạng nhận biết

Cấy lỗi vào rồi đọc HAI mã thoát:

| chạy 1 ca | chạy cả bộ | nghĩa |
|---|---|---|
| ĐỎ | XANH | 🔴 **ca đang mượn trạng thái** — đúng chữ ký của lớp lỗi này |
| ĐỎ | ĐỎ | lỗi thật trong ca đó, không phải chuyện cách ly |
| XANH | XANH | cách ly ổn (với phép cấy ấy) |

Vế "cả bộ XANH" chính là lý do lớp lỗi này sống lâu: **không công cụ nào kêu**. Nó chỉ nổ
khi có thứ khác xô lệch thứ tự — một ca timeout, một lần `--shard` chia khác, một ca mới
chèn vào giữa.

### Vì sao "một ca chậm" biến thành "một lượt đỏ"

Đo được 10/09/2026 trên PR #242:

1. `tests/cham-cong/import.spec.ts` ca *"áp T09"* vượt trần 5 000 ms.
2. Vitest báo ca đó **fail** nhưng **KHÔNG huỷ được promise** — `applyImport` của nó **vẫn
   ghi tiếp** trong khi ca sau đã bắt đầu.
3. Ca sau (*"import lại y hệt"*) cũng gọi `applyImport`. Hai lượt cùng đọc `existing = null`
   rồi cùng `create` ⇒ `P2002` trên chỉ mục **partial**
   `ShiftAssignment_user_date_active_key … WHERE status = 'ACTIVE'`.
   (Cancel→create **tuần tự** vốn hợp lệ; chỉ hai lượt CHỒNG nhau mới nổ.)

⇒ **Nâng trần chỉ làm chuyện này hiếm đi, không hết.** Thứ biến một ca chậm thành một lượt
đỏ là **cách ly hỏng**, không phải trần thấp. Vá trần trước là vá triệu chứng.

### Hai lỗ tìm được ngay hôm đó, cả hai đều CÓ SẴN

Không cần runner chậm nào — chạy riêng là đỏ luôn:

| ca | chạy một mình |
|---|---|
| `import.spec.ts` › *import lại y hệt → không tạo mới* | `expected 486 to be +0` |
| `permission-matrix.spec.ts` › *[AC3] mở khoá LopA* | `expected undefined to match object { locked: false, status: "ACTIVE" }` |

Ca thứ hai đáng nhớ: LopA vốn ACTIVE ⇒ `setConversationLock(false)` là **no-op**, không phát
sự kiện nào, nên `ev` là `undefined`. Nó chờ ca **trước** khoá LopA hộ.

**Vá:** ca tự dựng thứ nó cần (ARRANGE của chính nó). Chạy sau ca kia thì lượt arrange là
no-op, trạng thái y hệt — nên vá kiểu này không đổi hành vi khi chạy đủ bộ.
⚠️ Arrange **không được để lại dấu vết mà chính ca đó đang khẳng định**: ca "mở khoá" đọc
`AuditLog` theo `orderBy createdAt desc`, nên bước arrange ghi **thẳng DB** thay vì gọi lại
hành động có audit — hai dòng rơi cùng một giây thì thứ tự bấp bênh.

### Bẫy của chính phép kiểm này

Bản ĐẦU của script rà cách ly **vô dụng**: nó truyền cả chuỗi `describe > describe > it` cho
`-t`, không khớp ca nào, và **cả 20 lượt đều "xanh" với 0 ca chạy**. Chỉ lộ ra vì script có
dòng đếm **số ca ĐÃ CHẠY**. Cùng họ với luật 10 (ca đỏ mà không ai bị chặn) và luật 6 (mã
thoát của `grep`):

> **Bộ đo phải tự khẳng định nó CÓ đo được thứ gì.** Ép đúng **1** ca chạy; 0 hoặc >1 đều
> phải báo "không kết luận", không được tính là xanh.

Và bản đầu của script rà diện rộng **bỏ sót đúng file có lỗ** (`permission-matrix.spec.ts`)
vì lọc theo chuỗi `PrismaClient`, mà file đó lấy `db` từ helper. Bộ lọc hẹp quá thì danh
sách "sạch" chỉ nói lên bộ lọc, không nói lên mã.

### Liên hệ

- **Luật 8** — cấy lại lỗi. Ở đây phép cấy có **hai** mã thoát phải đọc, không phải một.
- **Luật 6** — không đặt lệnh kiểm sau dấu ống. Cùng một bệnh: cổng im lặng khi nó hỏng.
- **Sổ quan sát**, mục `tests/nen/position-permission.spec.ts` đỏ một lần 08/09: dòng
  *"chưa loại trừ: rò trạng thái giữa hai lượt"* — luật 18 chính là phép kiểm còn thiếu ở đó.

---

## Luật 19 — test KHÔNG được đọc đồng hồ thật

> **Ngày TUYỆT ĐỐI trong fixture + một hàm rơi về `new Date()` = một ca HẸN GIỜ NỔ.**
> Mã không đổi, tờ lịch đổi, và triệu chứng chỉ tới ngày nó tới.
>
> Mọi hàm có luật phụ thuộc thời gian phải nhận `now` **tiêm được** — và **test phải truyền**.

### Hình dạng nhận biết

> **Ca đỏ mà `git log` của file liên quan không có commit nào trong nhiều ngày ⇒ NGHI ĐỒNG HỒ
> TRƯỚC KHI NGHI MÃ.**

Đó là dấu hiệu rẻ nhất, và nó đúng vì lớp lỗi này **không có diff để soi**. Vài dấu đi kèm:

- cùng một commit: CI hôm trước **xanh**, chạy lại hôm sau **đỏ** (xem sổ dưới);
- lỗi báo ở một dòng **sớm hơn** dòng mà tên ca gợi ý — điều kiện thời gian chặn ngay từ
  bước dựng, chưa tới bước khẳng định;
- ca đỏ nằm cạnh một fixture có ngày cứng gần với hôm nay.

### Sự cố 13/09/2026 — ca `LEAVE` của `tests/cham-cong/requests.spec.ts`

Ca nộp đơn nghỉ cho 11–12/09/2026; `submitAttendanceRequest` mặc định rơi về `new Date()`;
loại nghỉ `NGHI_PHEP` có `noticeDays: 1`. ⇒ **xanh tới 10/09, đỏ mãi mãi từ 11/09.**

Phép đo dứt điểm — **cùng một commit, hai thời điểm**:

| | |
|---|---|
| main `507ff13b`, CI ngày 10/09 | `Chat DB invariants` **XANH** |
| main `507ff13b`, chạy lại 12/09 | `Chat DB invariants` **ĐỎ** |

Không có diff nào giữa hai lượt. (Vá ở #244.)

⚠️ **Hai chẩn đoán SAI mà phép đo này bác bỏ** — cùng ghi lại vì chúng nghe rất hợp lý:

1. *"Bộ này nằm ngoài required check nên đỏ im lặng"* — **SAI**. Đo bằng
   `gh api repos/<o>/<r>/branches/main/protection`: `Chat DB invariants` **đang là required**
   và `enforce_admins` đã bật. Cổng làm đúng việc; lượt CI hôm merge xanh **thật**.
   👉 Bài học phụ: **required check gác lúc MERGE, không gác trạng thái của `main` về sau.**
   Một ca phụ thuộc đồng hồ đỏ lên mà không ai đẩy gì cả, và không cổng nào bắt được.
2. *"Ba hàm kia chỉ dùng `now` cho dấu thời gian audit, không kiểm điều kiện"* — **SAI**.
   `lockPeriod` có `if (to > now) → "Kỳ chưa kết thúc"`. Lý do `period.spec.ts` chưa nổ là
   fixture cố ý chọn kỳ **đã qua** (`2026-06`) và kỳ **còn xa** (`2099-01`) — tức **chưa nổ**,
   không phải **không nổ**.

### Luật 1 áp cho test: bom ĐÃ BIẾT + đường nổ còn sống = vá NGAY

Đừng để lại một ca "chưa nổ". Ai thêm một điều kiện đọc `now` vào hàm ấy là nó nổ, và người
đó sẽ đi soi sai chỗ — đúng như lượt 13/09 suýt đi soi `isLeave` trong khi lỗi nằm ở dòng
nộp đơn.

### Cách vá, và cách kiểm bản vá

1. Hàm **đã** nhận `now?: Date` (repo có sẵn nhiều hàm như vậy — luật 7 trả tiền lần nữa):
   test chỉ việc truyền.
2. Đóng băng ở **mức khối** khi được (`base.now`, hằng `NOW` của `describe`), để ca người sau
   thêm vào không phải nhớ lại bài học.
3. Chọn mốc **có lý do viết ra được**: "trước `d11` đúng 2 ngày, thoả hạn báo trước 1 ngày",
   "sau ngày cuối `KEY` nên chốt được, và trước `2099-01` nên kỳ tương lai vẫn bị từ chối".
4. **Cấy lại** (luật 8): dời mốc sang phía sai ⇒ phải ĐỎ. Thêm `now` mà ca vẫn xanh ở mọi
   mốc nghĩa là hàm chưa thật sự đọc nó.

### Liên hệ

- **Luật 4** — fixture phải mang hình dạng dữ liệu thật. Luật 19 là một mặt khác của nó:
  fixture cũng không được mang **thời điểm** của máy chạy.
- **Luật 7** — tham số có mặc định nguy hiểm thì bỏ mặc định. `now?: Date` rơi về
  `new Date()` đúng là một mặc định nguy hiểm, chỉ là nó nguy hiểm **theo lịch**.
- **Luật 10** — nhưng đọc kèm đính chính ở trên: lần này cổng KHÔNG thủng.

---

## Sổ sự cố

### 08/09/2026 — nhập nhân sự xoá trắng ba cột ngày trên 9 hồ sơ PROD

| | |
|---|---|
| **Cái đã mất** | `dateOfBirth` của SR.NV.001 (`1985-07-18`) và SR.NV.010 (`2008-10-20`); `endDate` của SR.NV.001 (`2030-12-31`) |
| **Không mất** | 7 hồ sơ còn lại chỉ mất mốc `1970-01-01` — thứ vốn đang định dọn |
| **Phát hiện bởi** | ảnh chụp bảng nhân sự TRƯỚC khi nhập, do người vận hành tự làm |
| **Phát hiện bởi test** | KHÔNG. Bộ test xanh trước, trong và sau sự cố |
| **Khôi phục** | gõ tay từ ảnh chụp |

**Chuỗi ba mắt** (đo từ mã, xác nhận bằng `AuditLog` của chính lượt nhập đó):

1. `ExcelImporter` đọc sheet với `{ defval: null }` ⇒ **ô trống thành `null`**, không
   phải vắng mặt;
2. màn nhập cho `dateOfBirth`/`joinedAt`/`endDate` đi thẳng (`row.joinedAt as …`) trong
   khi **mọi cột khác** qua `asString()` — hàm trả `undefined`, và `JSON.stringify`
   **rụng `undefined` nhưng giữ `null`**;
3. route dựng `coMat` bằng `Object.keys(row)` — `null` là khoá **có mặt** ⇒ patch mang
   `dateOfBirth: null` ⇒ `update` ghi NULL.

Mắt 2 giải thích vì sao **đúng ba cột ngày** chết còn `department`/`status`/`email` để
trống thì không: chúng rụng khỏi payload từ trước. Đối chứng có sẵn trong audit prod
cùng ngày — một lượt nhập khác có 6 cột trống kiểu `asString` chỉ đổi mỗi `phone`.

**Tiền đề sai đã suýt dẫn lạc:** cả hai bên đều tin file có **2 cột**. Audit nói nó có
**9 cột**, ba cột ngày nằm trong header với ô để trống. Nếu đã đi tìm bug trong "đường
2 cột" thì không bao giờ tìm ra.

#### Vì sao bản vá `7f9e0348` — vốn dựng ĐÚNG để chặn việc này — không chặn được

Ca test của nó gọi:

```ts
dungPatchNhanSu(DAY_DU, new Set(["employeeCode", "centerSlug"]))
```

Nó **gõ tay `coMat`**. Mà `coMat` là thứ duy nhất quyết định patch gồm gì, và trong đời
thật nó do route dựng từ payload. Tức là gõ tay đúng cái biến chứa lỗi rồi khẳng định
hàm nhận nó chạy đúng. Test xanh, và nó xanh **chính xác** — nó đo hàm dựng patch,
không đo đường dẫn dữ liệu tới hàm đó.

> **Luật 9 — cổng phải được cho ăn bằng thứ đường thật cho nó ăn.**
> Một ca test tự dựng đầu vào cho cổng thì nó kiểm cổng, không kiểm hệ thống. Nếu đầu
> vào ấy do một tầng khác tính ra, **tầng đó là chỗ bug sẽ nằm** — và ca test phải gọi
> nó, hoặc ít nhất mang đúng hình dạng thứ nó phát ra (ở đây: object đã qua
> `JSON.stringify`, nơi `undefined` rụng còn `null` sống).

Phụ thêm, và đó là **luật 4 lần thứ ba trong hai ngày**: fixture cũ không set và không
assert `endDate`, nên riêng cột đó "bị xoá" và "vốn trống" nhìn giống hệt nhau.

#### Điều đáng nhớ nhất

**Quy trình chụp trước/sau là thứ duy nhất hoạt động.** Bộ test xanh, `typecheck` xanh,
`lint` xanh, bản vá vừa được duyệt và merge — và dữ liệu vẫn mất. Thứ bắt được là một
người chụp màn hình bảng nhân sự trước khi bấm.

**Đừng bỏ nó kể cả khi test đã xanh.** Test xanh chứng minh những gì test chạm tới;
sự cố này là định nghĩa của "test không chạm tới".

#### Đã vá gì (08/09/2026)

| Vá | Ở đâu | Chặn cái gì |
|---|---|---|
| `cotCoMat()` — ô trống (`null`/`undefined`/chuỗi rỗng) **không tính là có cột** | `lib/hr/import-patch.ts`, cắm ở route | Cổng theo **giá trị** nên kín cho **mọi họ cột**: enum, quan hệ, JSON, boolean, chuỗi, ngày. Vá riêng ba cột ngày là để nguyên bẫy cho cột thứ tư ai đó thêm sau |
| `asDate()` ở màn nhập | `app/(admin)/admin/nhan-su/import/page.tsx` | Đối xứng client — không client nào nên phát ra `null` cho ô người dùng bỏ trống |
| **CHẠY THỬ** — in ra sẽ đổi cột nào của ai, trước → sau, không ghi gì | route (`dryRun`) + màn nhập | Biến việc chụp trước/sau thành **một bước của chính công cụ**. Màn mặc định chạy thử; ghi thật là xác nhận thứ hai. **Endpoint** thì mặc định ghi thật — nếu không, một client cũ sẽ im lặng không ghi gì mà báo OK |

Kế hoạch ghi được tính **một lần** (`keHoach`) rồi dùng chung cho cả chạy thử lẫn ghi
thật. Tính hai đường thì bản xem trước trả lời *"cái tôi TƯỞNG sẽ ghi"* — đúng loại
khoảng lệch vừa gây ra sự cố này, chỉ ở tầng khác.

Ca test mới dựng payload bằng cách cho object client-shaped đi qua `JSON.parse(JSON.
stringify(...))`, dựng `coMat` bằng chính `cotCoMat`, và hồ sơ đích mang **ba giá trị
ngày thật khác nhau**. Cấy lại cả hai lỗi (bỏ lọc `null`; route quay về `Object.keys`)
đều thấy đỏ đúng chỗ, gỡ ra xanh lại (luật 8).

#### Hệ quả có chủ đích

**Không có cách nào XOÁ một trường qua file nhập.** Đó là chiều an toàn đã chọn, và màn
nhập nói thẳng ra: muốn xoá thì sửa ở màn hồ sơ.

#### Số đo kèm theo

Lượt nhập hỏng vô tình dọn phần lớn mốc 1970: `joinedAt` **13 → 5**, `endDate`
**14 → 5** (đo prod 08/09 sau sự cố). Migration dọn 1970 vì thế **thu nhỏ**, nhưng cổng
chặn ghi (`boMocUnix`) vẫn giữ — luật 1.

---

## Sổ quan sát chưa giải thích được

Chỗ ghi những lần đỏ/lạ **không tái hiện được**. Ghi chứ không đoán: một lần là quan
sát, hai lần mới là tín hiệu. Có mục ở đây thì lần sau người khác không phải bắt đầu lại
từ con số không.

### 08/09/2026 — `tests/nen/position-permission.spec.ts` đỏ một lần

| | |
|---|---|
| **Bộ** | `pnpm test:nen-db` (Postgres local `ci_test`, đã `migrate deploy` + `seed-roles`) |
| **Ca** | `TS-08 · quyền theo Position (Postgres thật) > [AC3] người KẾ NHIỆM nhận cùng vị trí ⇒ có đúng bộ quyền đó, vị trí không phải cấu hình lại` |
| **Thông điệp** | `AssertionError: expected false to be true // Object.is equality` |
| **Điều kiện quan sát** | **lượt 2** của phép chạy hai lượt trên cùng DB (không dọn giữa hai lượt); máy đang tải nặng — thư mục `.next` 603MB còn sót, Postgres vừa khởi động lại. Cùng lượt đó, 4 test quét-cây khác timeout ở ngưỡng 5s |
| **Tái hiện** | **KHÔNG** — 3 lượt chạy ngay sau đó đều xanh 15/15 |
| **Đã loại trừ** | không phải timeout (là assertion); spec này nhánh chấm công **không đụng tới**; nó gọi `disconnectDb()` trong `afterAll` **đúng khuôn** hai spec còn lại trong bộ |
| **Chưa loại trừ** | rò trạng thái giữa hai lượt trên cùng DB; đua giữa `disconnectDb()` của file chạy trước và file chạy sau (`fileParallelism: false` nên chúng nối tiếp, nhưng cùng tiến trình) |

**Nếu đỏ lần thứ hai:** chạy riêng `vitest run tests/nen/position-permission.spec.ts` hai
lượt liên tiếp trên DB **không dọn** để tách "rò trạng thái" khỏi "tải máy".
