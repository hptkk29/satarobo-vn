# GHI CHÚ — BA CHỖ ĐẾM "BUỔI DẠY" NGHI SAI

| | |
|---|---|
| **Ngày** | 07/09/2026 |
| **Trạng thái** | 📋 **KHÔNG SỬA trong phạm vi đợt này.** Ghi lại để không trôi |
| **Script đo** | `scripts/do-lech-buoi-day.ts` — chỉ đọc, không có chế độ ghi |
| **Chạy trên prod** | Workflow `Chấm công — ĐO trên prod (chỉ đọc)`, chọn `viec = buoi-day` |

**Chuẩn so sánh (K-05):** chuỗi ưu tiên người đứng lớp của module chấm công —
`actualTeacherId ?? substituteTeacherId ?? class.teacherId`
(`lib/cham-cong/period.ts` · `lib/cham-cong/cong-day-db.ts`).

---

## 0. 🔴 Thứ nghiêm trọng nhất KHÔNG nằm trong ba chỗ được hỏi

**`lib/lms/session-lifecycle.ts` — trước 07/09, mọi lần "Hoàn tất buổi" ghi
`actualTeacherId = class.teacherId`, nuốt mất người dạy thay.**

Chú thích tại chỗ đã ghi rõ nguyên nhân: ô chọn giáo viên ở form hoàn tất buổi là **tuỳ chọn**, nên
bỏ trống là ghi đè `substituteTeacherId` — mà đó chính là thứ `lib/classes/adjust.ts` vừa gán khi
duyệt đơn dạy thay.

**Vì sao nó nặng hơn cả ba chỗ dưới:** `actualTeacherId` là bậc **ưu tiên cao nhất**, nên dữ liệu cũ
sai ở **cả chuỗi đúng** — tức **kỳ công và công dạy cũng đang trả buổi về nhầm người**. Và kỳ công
thì **chạm tiền**: `teachingSessions` đi vào file Excel của Kế toán và đóng băng trong `summaryJson`
khi chốt kỳ.

**Ba hệ quả phải nhớ:**

1. **Vá ba chỗ dưới mà không backfill sẽ ra đúng 0 thay đổi**, và rất dễ bị kết luận nhầm là "không
   có bug". Số thật nằm ở dòng `ĐÃ BỊ NUỐT người dạy thay lúc hoàn tất` trong bản đo.
2. **Bản vá 07/09 mới chỉ có trên nhánh `hptkk29/module-cham-cong`** — `git branch --contains`
   không thấy `main` hay `test`. **Prod và test vẫn đang sinh thêm dòng hỏng mỗi lần hoàn tất một
   buổi có dạy thay.** Đây là lý do nên đưa nhánh này lên sớm.
3. Cột `substituteTeacherId` **chưa bị xoá** nên thiệt hại đo được và backfill được.

❓ **Câu chưa có lời:** có backfill `actualTeacherId` cho nhóm đã bị nuốt không, và có được chạm vào
**kỳ đã CHỐT** không? `summaryJson` đóng băng lúc khoá, nên backfill sẽ làm số lịch sử lệch với file
Excel Kế toán đã xuất. Đây là quyết định nghiệp vụ.

---

## 1. Ba chỗ, xếp theo mức nghiêm trọng đo được

### 🥇 #1 — `app/(admin)/admin/teachers/[id]/page.tsx:153-169`

| | |
|---|---|
| **Bộ lọc thật** | `{ classId: { in: mainClassIds }, date: { gte: monthStart, lt: monthEnd, lte: now } }` — **không có điều kiện `status` nào** |
| **Nhãn in ra** | "Đã dạy **N** buổi trong tháng" (`:315`), tiêu đề mục "Số buổi đã dạy trong tháng" |
| **Là bug?** | ✅ **Có.** Không comment nào biện minh; nhãn nói "đã dạy" còn bộ lọc chỉ nói "ngày đã qua" |
| **Chênh lệch** | = số buổi **ĐÃ HUỶ** + số buổi giáo viên **quên bấm Hoàn tất**, đều **dấu dương** |
| **Chạm tiền?** | Không ghi tiền — nhưng đây là ô số Quản lý cơ sở / HR nhìn để **đánh giá giáo viên**, và nó nằm ngay trong hồ sơ nhân sự |

**Xếp #1 vì:** chênh lệch là **số đo trực tiếp** (`SELECT status, COUNT(*)` ra ngay), không phải suy
luận. Cũng là mã cũ nhất trong ba chỗ (29/05/2026) — ra đời trước cả luật K-05.

⚠️ **Bẫy khi đo, phải khử trước:** mốc tháng ở màn này dựng bằng **giờ máy** (`new Date(year, m, 1)`),
trong khi `period.ts` dùng `Date.UTC`. Vercel chạy UTC, máy dev +07 ⇒ biên tháng lệch 7 giờ và lệch
**khác nhau giữa hai môi trường**. So hai số phải dùng **cùng một quy ước biên**, kẻo quy nhầm một
buổi rơi vào khe 7 giờ thành lỗi đếm.

### 🥈 #2 — `lib/reports/teacher-performance.ts` + `app/(admin)/admin/bao-cao/hieu-suat-gv/page.tsx`

| | |
|---|---|
| **Bộ lọc thật** | `COMPLETED`, người dạy = `actualTeacherId ?? class.teacherId` — **bỏ sót `substituteTeacherId`** |
| **Là bug?** | ✅ **Có**, nhưng **không cố ý** — file tạo 18/06/2026, còn luật K-05 ra đời 06–07/09/2026. Luật ra đời SAU mã |
| **Chênh lệch đo được HÔM NAY** | Nhiều khả năng **rất nhỏ hoặc bằng 0** — vì lỗi thượng nguồn (§0) đã ghi đè mất dấu |
| **Chạm tiền?** | Không — chỉ bảng + biểu đồ |

**Xếp trên #3 vì nó QUY SAI NGƯỜI** (chuyển buổi từ người dạy thay sang giáo viên chính), chứ không
chỉ đếm dư. Và đây là biểu đồ dùng để **so sánh giáo viên với nhau**.

⚠️ Test hiện có (`lib/reports/teacher-performance.test.ts`) chỉ kiểm hàm thuần đã nhận sẵn
`teacherId`, nên **không khoá hành vi sai này lại**.

### 🥉 #3 — `app/(teacher)/teacher/bang-cong/page.tsx:185`

| | |
|---|---|
| **Bộ lọc thật** | `status: { not: "CANCELLED" }` + lớp mình (kể cả lớp mình làm **trợ giảng**) hoặc `actualTeacherId = mình` |
| **Là bug?** | ⚠️ **Nhiều khả năng KHÔNG.** Chú thích tại chỗ, mô tả đầu file và phụ đề in ra cho giáo viên đều khai đây là màn **LỊCH/ca**, mỗi dòng có cờ "Đã làm / Sắp tới", và tự tách khỏi "công chính thức" |
| **Việc cần làm** | Đổi **NHÃN** ô "Buổi dạy" (`:354`) cho khỏi đọc nhầm là số buổi đã dạy — **không** đổi bộ lọc |
| **Chênh lệch** | Phụ thuộc **thời điểm xem**: giữa tháng thì phần lớn buổi còn `SCHEDULED` ⇒ chênh có thể xấp xỉ 100% |

Một khuyết nhỏ đi kèm: bộ lọc **thiếu nhánh `substituteTeacherId`**, nên giáo viên dạy thay ở lớp
người khác mà buổi chưa hoàn tất thì **không thấy buổi đó** — trong khi `/teacher/lich` thì có.

---

## 2. Đo thế nào

```bash
pnpm tsx scripts/do-lech-buoi-day.ts                 # 4 tháng gần nhất
pnpm tsx scripts/do-lech-buoi-day.ts 2026-06 2026-10 # khoảng chỉ định
```

Trên **prod**: bấm workflow `Chấm công — ĐO trên prod (chỉ đọc)`, chọn `viec = buoi-day`.

**Đọc số theo thứ tự này:**

1. **`ĐÃ BỊ NUỐT người dạy thay lúc hoàn tất`** — đọc TRƯỚC. Bằng 0 thì hai số ở §1 #2 cũng sẽ gần 0,
   và điều đó **không** nghĩa là không có bug.
2. `Số giáo viên có số lệch` — độ lớn của #2.
3. `PHỒNG (mọi buổi không COMPLETED, đã qua ngày)` — độ lớn của #1, và là số quyết định thứ tự sửa.

---

## 3. Nợ nền: chuỗi ưu tiên có ít nhất 8 bản sao

`actualTeacherId ?? substituteTeacherId ?? class.teacherId` đang được chép tay ở ít nhất 8 nơi:
`period.ts` · `cong-day-db.ts` · `session-teacher-notify.ts` · `media-review/tree.ts` (2 chỗ) ·
`schedule-conflict.ts` · `birthday-notify.ts` · `seed-uat-media-review.ts`.

🔴 **Hai bản trong đó ĐẢO THỨ TỰ** — `substituteTeacherId ?? actualTeacherId ?? …` ở
`lib/lms/schedule-conflict.ts` và `lib/students/birthday-notify.ts` — nên chúng cho **kết quả khác**
ở những buổi có cả hai cột. Chưa xác minh được là cố ý hay chép sai.

Sửa ba chỗ ở §1 mà không gom về **một helper dùng chung** là tạo ra bản sao thứ chín. Đây là việc
riêng, cần làm trước hoặc cùng lúc.

---

## 4. Bốn câu cần trả lời trước khi sửa

| # | Câu hỏi |
|---|---|
| **1** | Ba màn này có cần thống nhất về K-05 không, hay chấp nhận ba định nghĩa khác nhau vì ba mục đích khác nhau? |
| **2** | Ở `/admin/teachers/[id]`, "Số buổi đã dạy" nên đếm theo **lớp giáo viên chính** (như hiện nay) hay theo **người thực dạy** (như K-05)? Hai cách cho kết quả khác nhau với giáo viên dạy thay nhiều, và câu trả lời quyết định phần lớn thiết kế bản vá |
| **3** | Ô "Buổi dạy" ở `/teacher/bang-cong` nên **đổi tên** (vd "Ca dạy trong tháng") hay **tách thành hai số** ("đã dạy" / "sắp tới")? |
| **4** | Có backfill `actualTeacherId` cho nhóm đã bị nuốt không, và có được chạm vào **kỳ đã chốt** không? (xem §0) |
