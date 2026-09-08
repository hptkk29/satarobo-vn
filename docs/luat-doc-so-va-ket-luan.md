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
