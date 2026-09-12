# VÉ — rà test đọc đồng hồ thật (luật 19)

> **Trạng thái:** MỞ. Ghi 13/09/2026 sau khi vá hai ca trong `tests/cham-cong`.
> **Đây là danh sách CẦN ĐO, không phải danh sách LỖI.** Bộ quét chỉ thấy HÌNH DẠNG
> (ngày tuyệt đối + gọi hàm có `now?`); nó **không** biết hàm ấy dùng `now` để kiểm điều kiện
> hay chỉ để đóng dấu thời gian. Phép đo thật là đọc từng chỗ.

---

## Luật

`docs/luat-doc-so-va-ket-luan.md` — **luật 19**: *test không được đọc đồng hồ thật.*

Hình dạng nhận biết: **ca đỏ mà `git log` của file liên quan không có commit nào trong nhiều
ngày ⇒ nghi đồng hồ trước khi nghi mã.**

---

## Đã vá

| ca | vá ở | mốc chốt |
|---|---|---|
| `tests/cham-cong/requests.spec.ts` › `LEAVE 2 ngày duyệt` | **#244** (phiên khác) | `2026-09-09T03:00:00Z` tại chính ca đó |
| cùng file — hàng rào thứ hai cho cả khối | PR #243 | `base.now = 2026-09-10T03:00:00Z` |
| `tests/cham-cong/period.spec.ts` | PR #243 | `NOW = 2026-07-01T03:00:00Z`, truyền vào mọi lời gọi `lockPeriod`/`reopenPeriod`/`setDayOverride` |

`period.spec.ts` **chưa nổ** — fixture cố ý chọn kỳ đã qua (`2026-06`) và kỳ còn xa
(`2099-01`). Vá vì đó là lý do *chưa* nổ, không phải lý do *không* nổ: `lockPeriod` có điều
kiện thời gian thật (`to > now ⇒ "Kỳ chưa kết thúc"`).

Cấy lại để chắc `now` thật sự được tiêu thụ: dời `NOW` vào **giữa** kỳ `2026-06` ⇒ 2 ca đỏ.

---

## Còn phải đo — quét `tests/ · lib/ · app/ · components/`

Điều kiện lọc: có ngày tuyệt đối **và** gọi một hàm rơi về `new Date()` khi thiếu `now`
**và** trong file không thấy chỗ nào truyền `now`.

### 🔴 Ưu tiên cao — hàm rõ ràng có luật phụ thuộc thời gian

| file | ngày tuyệt đối | hàm |
|---|---:|---|
| `lib/finance/debt.test.ts` | 17 | `isReminderDue` · `effectiveReminderDays` |
| `lib/lms/assignment.test.ts` | 3 | `isLateSubmission` |
| `lib/lms/lms-r3-rest.test.ts` | 8 | `isLateSubmission` |
| `tests/e2e/r2/finance-debt.spec.ts` | 3 | `getOverdueOrders` · `remindOverdueSingleOrders` |
| `tests/e2e/r3/lms-rest.spec.ts` | 2 | `submitAssignment` |
| `tests/e2e/r7/assignment-fixes.spec.ts` | 1 | `submitAssignment` |
| `tests/e2e/r7/homework-auto-assign.spec.ts` | 1 | `assignHomeworkForSession` · `completeSession` |

*"Quá hạn"*, *"nộp muộn"*, *"đến hạn nhắc"* — cả ba đều là luật so với **hôm nay**. Đây là
đúng họ với ca `LEAVE` đã nổ.

### 🟡 Ưu tiên thấp — nhiều khả năng vô hại, vẫn nên liếc

| file | ngày tuyệt đối | hàm |
|---|---:|---|
| `lib/audit/audit-log.test.ts` · `lib/auth/check-permission.test.ts` · `lib/db-scope.test.ts` | 1 mỗi file | `buildActor` |
| `tests/e2e/r7/delete-student-cascade.spec.ts` · `withdraw-student-legacy-active.spec.ts` | 1 · 4 | `buildActor` |
| `tests/e2e/r7/convert-v2.spec.ts` | 2 | `normalizePhone` |

`buildActor` dùng `now` để lọc `UserOrgRole` theo `effectiveFrom/To`. Vô hại **nếu** fixture
không đặt hạn hiệu lực gần hôm nay — phải mở ra xem, không suy.

### 🟡 Có truyền `now` ở đâu đó — phải soi TỪNG CHỖ

Bộ quét thấy chuỗi `now:` trong file nên không xếp vào nhóm đỏ, nhưng *có một chỗ truyền*
không có nghĩa là *mọi chỗ đều truyền* — đúng cái bẫy của `requests.spec.ts` trước #244.

Đáng xem nhất: `lib/chat/announcements.test.ts` (21 ngày tuyệt đối) ·
`lib/lms/attendance-queue.test.ts` (`sessionWorkState`, `resolveAttendanceQueuePhase`) ·
`lib/lms/homework-assign.test.ts` (`computeHomeworkDueAt`) ·
`tests/e2e/r7/installment-reminder.spec.ts` (`remindOverdueInstallments`).

---

## Giới hạn của bộ quét — đọc trước khi tin danh sách

- Nó khớp **tên hàm** trong văn bản file, nên một hàm cùng tên ở nơi khác cũng tính.
- Nó coi **bất kỳ** chuỗi `now:` / `now =` nào là "có truyền", kể cả trong chú thích.
- Nó **không** phân biệt `now` dùng để kiểm điều kiện với `now` chỉ để đóng dấu.

⇒ Danh sách này để **chọn thứ tự đi đo**, không để kết luận. Kịch bản quét:
`scratchpad/ra-bom-v2.py` của phiên 13/09 (chạy lại được, không phụ thuộc phiên).

---

## Cổng tự động?

Chưa có, và chưa rõ nên có hình gì. Ý tưởng chưa chốt: một ca test quét mã nguồn theo đúng
điều kiện trên — nhưng đó là **test grep** (luật 11, loại mong manh nhất) và nó sẽ báo nhầm
ở nhóm 🟡. Cách chắc hơn là **chạy CI với `TZ` và ngày giả lùi/tiến vài tháng** trong một job
hằng tuần, rồi đọc ca nào đỏ. Chưa làm, chưa hứa.
