# Backlog LOW từ A1-verify #03 Pha B (10/07) — đã xử 3/4, còn ghi nhận

> Nguồn: verify đa-agent 10/07 (3 verifier + 6 skeptic). Không có HIGH/MEDIUM.
> Đã vá cùng ngày: un-export `staffOwnsEnrollment` · RC update không regress centerId→null ·
> 9 comment stale · gate aggregate mọi viewer · notify round global → ALL_PARENTS ·
> postMessage fallback class.centerId.

## 1. 🔴 CÒN LẠI — HV chuyển cơ sở mất liền mạch hội thoại 2 phía (design gap, cần BA)
Transfer tạo enrollment MỚI; luồng tin cũ nằm trên enrollment TRANSFERRED (centerId = CS cũ):
- Staff CS tiếp nhận mở `/admin/tin-nhan`: KHÔNG thấy luồng cũ (ngoài allowedClassIds + ngoài scope) → tiếp nhận PH không có ngữ cảnh khiếu nại/cam kết trước đó.
- PH mở `/portal/tin-nhan`: luồng cũ cũng rơi khỏi filter enrollment active.

KHÔNG phải lỗi flip #03 (tồn tại từ thiết kế transfer). Hướng xử (chọn 1, ~1d):
(a) Transfer copy con trỏ luồng: gắn `ConversationMessage.enrollmentId` mới? (đổi lịch sử — không nên);
(b) Inbox đọc theo STUDENT thay vì enrollment (gom mọi enrollment của HV mà actor thấy) — portal đã ownership theo student, admin thêm nhánh;
(c) Chấp nhận + quy trình tay (CSKH đọc note bàn giao). **Cần Kiệt/BA chọn.**

## 2. Ghi nhận thiết kế (không vá — hành vi nhất quán, theo dõi khi vận hành)
- **RC/CM `centerId=null` qua lớp HO** (Class.centerId null là thiết kế dual-write): actor HO tạo học bạ/tin nhắn trên lớp HO → row null → tàng hình với actor cấp cơ sở (nhất quán: lớp/enrollment null cũng tàng hình; KHÔNG leak vì ∉ NULL_IS_GLOBAL). Đã chặn chiều tệ nhất (update regress non-null→null). Nếu nghiệp vụ sau này có lớp HO thật dạy HV → cân nhắc buộc chọn cơ sở khi tạo lớp có ghi danh.
- **Cửa sổ nhìn thấy khi lớp chuyển cơ sở** (updateClass đổi centerId): RC/tin cũ mang centerId cũ cho tới lần ghi kế tiếp (heal). Số lượng nhỏ, tự lành; không xử thêm.
