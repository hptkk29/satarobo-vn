# Phiếu tiếp nhận yêu cầu #01 — Ứng dụng Quản lý Học viên & LMS tích hợp

| | |
|---|---|
| **Nguồn** | `0-tai-lieu-goc/1 - Yeu cau tinh nang QL HV.pdf` (yêu cầu người sử dụng) |
| **Ngày tiếp nhận** | 2026-06-05 |
| **Người tiếp nhận (PM)** | PM |
| **Tính chất** | Wishlist tổng thể từ khách hàng — **chung chung, trộn lẫn**: tính năng đã có, tính năng mở rộng, và ý tưởng R&D dài hạn |
| **Trạng thái** | 🟡 Đã phân loại — chờ khách xác nhận ưu tiên (xem `03-cau-hoi-xac-nhan-khach-hang.md`) |

---

## 1. Tóm tắt yêu cầu (9 nhóm)

1. Quản lý hồ sơ & lớp học ·  2. LMS · 3. Kết nối & chăm sóc phụ huynh · 4. Tài chính & thanh toán · 5. Học bạ điện tử  · 6. Báo cáo & phân tích · 7. Bảo mật & quyền riêng tư · 8. Mở rộng thị trường.

## 2. Đánh giá nhanh của PM so với hệ thống hiện tại

> Đối chiếu với codebase đã quét (xem `Document/` doc 1–12). Ký hiệu: ✅ đã có · 🟡 có một phần · 🔴 chưa có · 🔬 R&D (chưa nên cam kết timeline).

| # | Yêu cầu khách | Trạng thái | Ghi chú đối chiếu hiện trạng |
|---|---|---|---|
| **1. Hồ sơ & lớp học** | | | |
| 1.1 | Lưu thông tin cá nhân, ảnh| 🟡 | `Student` có đủ field + avatar; |
| 1.2 | Quá trình học, lịch sử lớp, điểm số | ✅ | Enrollment, Attendance, ExamAttempt, CourseCompletion, StudentCenterHistory |
| 1.3 | Trạng thái nhập học/chuyển lớp/bảo lưu/thôi học | ✅ | EnrollmentStatus 9 trạng thái + StudentReserve + StudentTransferRequest |
| 1.4 | PH/HV tự cập nhật thông tin qua app | 🟡 | Portal web có sửa tên/mật khẩu PH; **chưa cho sửa hồ sơ con** |
| 1.5 | Tìm kiếm, lọc | ✅ | Các trang admin đã có filter |
| 1.6 | Kế hoạch giảng dạy, phân công GV | ✅ | Class.teacherId/assistantId, Curriculum→Lesson, TeacherCourse |
| 1.7 | Phòng học, ca học, sĩ số | ✅ | Room, Class.maxStudents/schedule |
| 1.8 | **Xếp lớp tự động theo trình độ sau test** | 🔴 | Chưa có placement test + thuật toán xếp lớp |
| 1.9 | TKB trên app HV và GV | 🟡 | Admin có week calendar; portal **chưa có trang TKB** |
| 1.10 | **Cảnh báo trùng lịch / vượt sức chứa** | 🔴 | Chưa có validation conflict phòng/GV/sĩ số khi tạo lớp-buổi |
| **2. Điểm danh | | | |
| 2.2 | Cảnh báo vắng bất thường tới PH | 🟡 | Có StudentRiskAlert (vắng liên tiếp) + notify; cần định nghĩa "bất thường" + kênh Zalo live |
| 2.3 | Log điểm danh | 🔴 
| 2.4 | Điểm danh thủ công | ✅ | `/admin/attendance` |
| 2.5 | Đồng bộ học bạ điện tử & báo cáo | ✅ | Transcript/progress-report PDF |
| **3. LMS** | | | |
| 3.1 | Nội dung bài học, giáo trình | ✅ | Curriculum/Lesson/Document |
| 3.2 | Giao bài tập về nhà & chấm bài online, lưu học bạ | ✅ | Assignment + Submission + Rubric |
| 3.4 | Tiến độ + báo cáo PH | ✅ | Portal + ProgressReportLog |
| 3.6 | Gamification & Learn2Earn (SataCoin) | 🟡 | SataCoin ledger + rule đã có; **chưa có** UI gamification (badge, leaderboard, đổi quà trên portal) |
| 3.7 | Competency Management / profile năng lực | 🟡 | StudentSkillAssessment (10 kỹ năng × 4 mức) đã có; cần trang profile xuất hồ sơ |
| **4. Chăm sóc phụ huynh** | | | |
| 4.1 | Cổng PH đa nền tảng (App + Web) | 🟡 | Web portal ✅; **app mobile 🔴** (cần chốt: native / PWA) |
| 4.2 | Thông báo đa kênh (push, Zalo OA, email) | 🟡 | Email ✅, Zalo stub (`ZALO_LIVE=false`), push 🔴 |
| 4.4 | Sổ liên lạc điện tử (nhận xét, ảnh/video, phản hồi) | ✅ | StudentSessionFeedback + ClassSessionMedia + ParentFeedback |
| 4.5 | Cá nhân hóa thông tin & ưu đãi | 🟡 | Notification 4 audience; chưa có engine ưu đãi cá nhân hóa |
| 4.6 | Báo cáo học tập định kỳ | ✅ | Progress report + email |
| 4.7 | Chăm sóc sau khóa (chứng chỉ, khảo sát, gợi ý khóa) | ✅ | CourseCompletion + Survey + nextCourse |
| 4.8 | NPS định kỳ **→ KPI bộ phận CSKH** | 🟡 | Survey NPS ✅; **chưa nối NPS → KPI nhân sự** (liên quan Phiếu #02) |
| **5. Tài chính** | | | |
| 5.1 | Hóa đơn học phí + nhắc thanh toán | ✅ | Order + OrderInstallment + cron debt-reminder |
| 5.2 | Thu online qua nhiều cổng | 🔴 | Hiện VietQR đối soát tay; chưa tích hợp cổng (VNPay…) |
| 5.3 | QR thanh toán tự động, đồng bộ kế toán | 🟡 | VietQR ✅; khách ghi "đã làm trên Zalo OA + đồng bộ kế toán" — cần xác nhận luồng nào là chuẩn |
| 5.4 | **Ghi nhận doanh số/tỉ lệ tái tục → KPI/hoa hồng** | 🔴 | Trùng với SR217 (Phiếu #02) — gộp xử lý |
| 5.5 | Công nợ + nhắc nợ tự động | ✅ | debt-reminder cron |
| 5.6 | Đồng bộ CRM/doanh thu với **MISA AMIS** | 🟡 | IntegrationConfig/Log skeleton — chưa nối API thật |
| 5.7 | Chính sách phí thống nhất | 🟡 | Voucher + giá Course/Package; cần rà soát quy tắc 1 nguồn giá |
| 5.8 | SataCoin ví điểm thưởng + đổi quà; **Blockchain giai đoạn sau** | 🟡 / 🔬 | Ledger ✅; đổi quà portal 🔴; blockchain = R&D |
| **6. Học bạ điện tử & Web3** | | | |
| 6.1 | Chuẩn hóa học bạ; **1 PH nhiều con 1 user** | ✅ | Đã có: `Student.parentUserId` + SiteSwitcher portal |
| 6.2 | Đồng bộ LMS/SIS/điểm danh | ✅ | Cùng 1 DB — mặc nhiên đồng bộ |
| 6.3 | Phân tích xu hướng điểm, khuyến nghị | 🟡 | Làm **rule-based** trên dữ liệu sẵn có (điểm, skill assessment) — không dùng AI (đã loại) |
| 6.5 | Chia sẻ/thu hồi quyền xem học bạ | 🔴 | Chưa có share-link có hạn |
| **7. Báo cáo** | | | |
| 7.1 | Báo cáo chuyên cần/học tập/doanh thu/tuyển sinh | 🟡 | Dashboard + export rời rạc; cần hợp nhất theo SR217 |
| 7.2 | Dashboard đa tầng (hệ thống/cơ sở/lớp) | 🟡 | Có dashboard theo role; chưa đủ 3 tầng drill-down |
| 7.3 | Dashboard thu lead marketing từ messenger | 🔴 | Webhook Messenger → PageInboundEvent (xem BA SR217) |
| 7.4 | Dự báo doanh thu/nghỉ học/tuyển sinh | 🟡 | Làm **rule-based** mở rộng RiskAlert + trend dashboard — không dùng AI (đã loại) |
| 7.5 | Export Excel/PDF | ✅ | xlsx + @react-pdf |
| **8. Bảo mật** | | | |
| 8.1 | Mã hóa truyền + lưu | ✅ | HTTPS, Supabase at-rest, bcrypt/HMAC |
| 8.2 | **Quy trình xin quyền lưu ảnh/dữ liệu cá nhân** | 🔴 | Cookie consent web đã có; chưa có consent PH cho ảnh/giấy tờ HV (bắt buộc nếu làm 1.1, 2.1) |
| 8.3 | Log truy cập & chỉnh sửa | 🟡 | Audit log 8 domain (sửa đổi) ✅; log **truy cập đọc** chưa có |
| **9. Mở rộng** | | | |
| 9.1 | Marketplace khóa học online | 🔴 | Lớn — cần PRD riêng |
| 9.2 | Đóng gói multi-tenant cho đối tác | 🔬 | Thay đổi kiến trúc lớn (hiện multi-center 1 tenant) |

## 3. Thống kê & nhận định PM

- **✅ Đã có: ~35%** — phần lớn nhóm 1, 3, 4, 5 đã chạy trên hệ thống hiện tại → cần **demo cho khách thấy trước khi build thêm**.
- **🟡 Một phần: ~30%** — hoàn thiện nhanh, ROI cao (TKB portal, Zalo live, gamification UI, dashboard 3 tầng).
- **🔴 Chưa có: ~20%** — cần BA phân tích kỹ (xếp lớp tự động, cảnh báo trùng lịch, cổng thanh toán, consent ảnh, app mobile).
- **🔬 R&D: ~15%** — multi-tenant → tách track nghiên cứu, **không cam kết deadline**.

## 4. Đề xuất ưu tiên (MoSCoW — chờ khách duyệt)

| Mức | Hạng mục |
|---|---|
| **Must** | SR217 compliance (Phiếu #02 — văn bản đã ban hành); cảnh báo trùng lịch/sức chứa; TKB trên portal; consent dữ liệu cá nhân |
| **Should** | Zalo OA live (thông báo + nhắc nợ); gamification SataCoin trên portal (đổi quà); dashboard 3 tầng; PH cập nhật hồ sơ con; profile năng lực |
| **Could** | Xếp lớp tự động sau test; thi có giám sát; share học bạ; MISA sync thật; cổng thanh toán online |
| **Won't (giai đoạn này)** |  multi-tenant, app native (đề xuất PWA trước) |

## 5. Rủi ro PM ghi nhận

1. **Scope creep** — wishlist 8 nhóm ~45 đầu mục; phải chốt MoSCoW bằng văn bản trước khi BA viết spec.
2. **Phụ thuộc bên thứ 3** — Zalo OA token, MISA API, cổng thanh toán, FB App Review (Messenger webhook): cần tài khoản/hợp đồng từ phía khách trước khi dev.

> **Ghi chú scope (chốt 2026-06-05):** khách đã **loại toàn bộ hạng mục AI** khỏi yêu cầu (AI camera, phân tích sức khỏe, chatbot AI, AI gợi ý lộ trình/khóa học, AI phân tích/dự đoán). Các nhu cầu phân tích/dự báo còn lại làm bằng **rule-based** trên dữ liệu sẵn có.

## 6. Bước tiếp theo

1. PM gửi `03-cau-hoi-xac-nhan-khach-hang.md` cho khách → chốt MoSCoW.
2. BA phân tích chi tiết các mục Must/Should → `2-ba-phan-tich/01-gap-analysis-ql-hv-lms.md` + user stories.
3. Lập roadmap + task breakdown → `3-ke-hoach-trien-khai/`.
