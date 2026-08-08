# Pre-Mortem — Nền Hệ thống satarobo (08/08/2026)

> Skill: pm-execution:pre-mortem · Input: PRD 01 · Kịch bản tưởng tượng: P4 cutover xong 14 ngày, hệ thống hỏng — vì sao?

---

## Tigers — rủi ro thật, phải hành động

| # | Rủi ro | Vì sao thật | Mức |
|---|---|---|---|
| T1 | **Một dev chạy song song chat + nền.** Chat trễ → nền khởi công chồng lấn → cả hai dở dang, PROD gánh hai nửa migration | Đội chỉ còn Kiệt; lịch chat 4 đợt chưa xong; lịch sử dự án đã có tiền lệ nhiều chương trình song song | **Chặn khởi công** |
| T2 | **Backfill `centerId→orgUnitId` sai âm thầm.** Dữ liệu điểm danh dùng chuỗi `Attendance→ClassSession→Class.centerId` — một bản ghi mồ côi là một học viên "biến mất" khỏi phạm vi đơn vị | RBAC v2 đã từng phải shadow-compare vì đúng loại rủi ro này | **Chặn cutover** |
| T3 | **Chat viết kiểm quyền ngoài `can()`.** Điều khoản adapter mới nằm trong BA, chưa chắc đã vào CLAUDE.md đợt chat | Nếu lỡ, chi phí hoà nhập nhân lên theo số Server Action đã viết | **Chặn — làm hôm nay** |
| T4 | **Resolver quyền chậm làm chậm cả hệ.** `can()` gọi ở mọi Server Action; nếu mỗi lần gọi là 3–4 query thì PROD chậm rõ sau P4 | 173 model, mọi request đi qua; chưa có số đo baseline | Fast-follow (thiết kế cache ngay từ P0, đo ở P3) |
| T5 | **Vòng lặp trong cây báo cáo `reportsToPositionId`.** Q2 vừa chốt; cây thứ hai không có ràng buộc chống vòng lặp sẽ treo luồng duyệt | Lỗi kinh điển của mọi cây tự tham chiếu | Fast-follow (constraint + test từ P2) |
| T6 | **Phạm vi phình sang Nhân sự/hợp nhất báo cáo.** "Bỏ MISA" dễ bị hiểu là ôm cả Tiền lương/BHXH | Đã phải cảnh báo hai lần trong hai phiên trước | Track (ranh giới §5 BA là cứng) |

## Paper Tigers — lo được nhắc nhưng không đáng đầu tư

| # | Lo ngại | Vì sao không đáng |
|---|---|---|
| PT1 | "Materialized path LIKE chậm khi cây lớn" | Cây thực tế < 50 node trong 2 năm tới; index prefix của Postgres thừa sức. Đo lại khi > 500 node |
| PT2 | "UserGroup làm phức tạp resolver" | Chưa tới 20 người dùng — hợp nhất grant ROLE + GROUP là một UNION; chi phí thiết kế đã trả trong BA |
| PT3 | "Phải microservice mới chịu được nhượng quyền" | Đã bác 26/07. Bài toán là mô hình dữ liệu, không phải topology hạ tầng |
| PT4 | "Cần build hợp nhất báo cáo tài chính" | Đã vẽ ranh giới: MISA Kế toán làm; satarobo chỉ làm báo cáo vận hành hợp nhất |

## Elephants — chưa ai bàn đủ, cần điều tra trước khi cam kết

| # | Con voi | Điều tra thế nào |
|---|---|---|
| E1 | **Seam kế toán chưa có định dạng.** "Chốt bảng công + doanh thu → đẩy MISA" mới là một câu, chưa là một spec. MISA nhận import định dạng gì? | 1 phiên khảo sát chức năng import của AMIS Kế toán (chỉ đọc) trước P5 |
| E2 | **Hợp đồng nhượng quyền cần pháp lý thật.** Trạng thái GRACE, phạm vi dữ liệu HO thấy — schema đang mã hoá các giả định pháp lý chưa ai duyệt | Đưa bảng vòng đời hợp đồng cho tư vấn pháp lý xem trước khi ký franchise đầu tiên; không chặn code |
| E3 | **Tài khoản phụ huynh.** BA chat chốt "PH sẽ dùng trong thời gian gần nhất" — nhưng PH nằm ngoài cây tổ chức. `OWN` scope cho PH dựa vào liên kết PH–học viên, chưa được thiết kế trong lõi | Thêm 1 mục thiết kế nhỏ ở P0: bảng liên kết Guardian–Student là nguồn của `OWN` cho vai PH |
| E4 | **Sự cố 2 account Vercel cùng domain.** Không liên quan schema nhưng là rủi ro vận hành đúng lúc cutover | Gộp về 1 account/team trước P4 |
| E5 | **Dữ liệu vận hành còn nằm sheet của Sale** (điểm danh học thử, ghi danh) — backfill P1 chỉ phủ dữ liệu trong hệ | Chốt: KHÔNG backfill sheet (đã quyết ở dự án affiliate); ghi rõ vào phạm vi P1 |

## Kế hoạch hành động cho Tigers chặn

| Rủi ro | Hành động | Ai | Hạn |
|---|---|---|---|
| T3 | Ghi điều khoản adapter `can()` + lint rule cấm kiểm quyền ngoài `can()` vào CLAUDE.md đợt chat | Dev | **Hôm nay, trước phiên chat kế tiếp** |
| T1 | Quy tắc lịch: P1 chỉ khởi công khi cả 4 đợt chat đã merge; ghi vào README bàn giao | Dev | Trước khi giao Claude Code |
| T2 | Script đối soát 2 chiều (đếm theo centerId cũ vs orgUnitId mới, từng bảng) chạy hằng đêm suốt P1→P4; cutover chỉ khi 0 lệch 7 ngày | Kiệt | Cổng P4 |

**Kết luận:** không có Tiger nào bác thiết kế — cả ba con chặn đều là kỷ luật thi công, xử được bằng quy tắc + test. Đủ điều kiện đi tiếp sang User Stories.
