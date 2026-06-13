# BẢN ĐẶC TẢ YÊU CẦU HỆ THỐNG LMS VÀ QUẢN LÝ LỚP HỌC SATAROBO

**Dự án:** SataRobo Center Management System  
**Phân hệ:** CRM tuyển sinh, LMS, quản lý lớp học, học viên và portal phụ huynh/học viên  
**Phiên bản:** v3.1 – BẢN HỢP NHẤT CHỐT CUỐI (gộp bản mô tả logic v2.0 + SRS v2.1; TGĐ xác nhận lần cuối ngày 12/06/2026: học bù liên cơ sở, Satacoin pending)  
**Trạng thái:** Đủ cơ sở để phân tích kỹ thuật, thiết kế dữ liệu và chia task phát triển  
**Stack định hướng:** Next.js / React / TypeScript / Prisma / Supabase / Auth.js  

---

## 0. Nhật ký hợp nhất v3.0

Bản v3.0 lấy bản mô tả logic v2.0 làm xương sống, hợp nhất các quyết định đã chốt từ SRS v2.1 và chỉ đạo mới nhất của TGĐ:

1. **Đánh giá giáo viên do HỌC VIÊN thực hiện** (trong profile học viên) — không phải phụ huynh, vì học viên là người tiếp xúc trực tiếp với giáo viên. **Phụ huynh làm khảo sát đánh giá trung tâm/cơ sở con đang học.** Cả hai đều dùng form builder để Admin tự cấu hình câu hỏi và phương án trả lời. (Sửa lại điểm sai trong SRS v2.1.)
2. Bổ sung **SLA chăm sóc Lead 24 giờ** (từ v2.1).
3. Bổ sung **cờ đồng ý sử dụng hình ảnh học viên** tại form convert: Sale bắt buộc trao đổi với phụ huynh trước khi tick, hệ thống ghi người tick và thời điểm; áp dụng khi hiển thị ảnh lớp học (tuân thủ NĐ 13/2023 về dữ liệu cá nhân trẻ em). (Từ v2.1.)
4. Bổ sung biện pháp **làm mờ SCORM khi phát hiện hành vi quay/chụp màn hình + watermark động** (từ v2.1, mức tối đa trình duyệt web hỗ trợ; giữ nguyên tuyên bố trung thực về giới hạn kỹ thuật).
5. **Học bù**: TGĐ xác nhận lần cuối — **cho phép học bù LIÊN CƠ SỞ (CS1 ↔ CS2)**. Hệ thống đề xuất mọi cơ sở có buổi học phù hợp, ưu tiên hiển thị cơ sở con đang học trước.
6. **Satacoin giữ trạng thái PENDING** (ngoài phạm vi go-live) — TGĐ xác nhận lần cuối ngày 12/06/2026. Thiết kế dữ liệu chuẩn bị sẵn bảng cấu hình điểm để kích hoạt nhanh khi TGĐ ban hành bảng quy đổi, danh mục quà và quy tắc cộng/trừ điểm.
7. Skill AI tạo bài tập trắc nghiệm (`tao-bai-tap-trac-nghiem-satarobo`) đã được xây dựng và bàn giao **ngoài phạm vi hệ thống** — template Word của skill phải đồng bộ với template import tại Mục 13.4.

---

## 1. Mục tiêu hệ thống

Hệ thống phải quản lý xuyên suốt vòng đời của khách hàng và học viên:

```text
Lead
→ Chăm sóc
→ Xếp lớp trải nghiệm Robosim 4 buổi
→ Học thử
→ Chờ quyết định
→ Ghi nhận thanh toán
→ Convert Lead
→ Tạo Phụ huynh
→ Tạo Học viên
→ Tạo Enrollment cho từng con
→ Xếp lớp chính thức
→ Gán khóa học và khung chương trình
→ Sinh lịch học
→ Giáo viên dạy, điểm danh, nhận xét, giao bài tập
→ Học viên làm bài
→ Phụ huynh theo dõi
→ Học bạ, khảo sát, đánh giá
→ Báo cáo học tập, lớp học và trung tâm
```

Hệ thống phải bảo đảm:

- Không convert Lead thành Phụ huynh/Học viên chính thức trước khi phụ huynh đăng ký và có ít nhất một khoản thanh toán được ghi nhận.
- Một phụ huynh có thể quản lý không giới hạn số con.
- Mỗi người con có một Enrollment riêng cho từng khóa học.
- Dữ liệu học phí, công nợ, lớp học và tiến độ được quản lý độc lập theo từng Enrollment.
- Khung chương trình dùng chung toàn hệ thống.
- Lớp học nhận đúng khung chương trình dựa trên khóa học được chọn.
- SCORM là tài liệu giảng dạy chính, chỉ xem trên website, không cho giáo viên tải file nguồn.
- Học viên không được xem SCORM; học viên chỉ xem và làm bài tập về nhà.
- Phụ huynh theo dõi toàn bộ thông tin của các con trong cùng một tài khoản.

---

## 2. Phạm vi triển khai trước khi vận hành

Toàn bộ các chức năng sau phải được hoàn thiện trước khi hệ thống LMS và quản lý lớp học được đưa vào vận hành:

1. Quản lý Lead và LeadChild.
2. Quản lý lớp trải nghiệm Robosim 4 buổi.
3. Chuyển đổi Lead thành Phụ huynh, Học viên và Enrollment.
4. Quản lý khóa học, giá, giảm giá, học bổng, ưu đãi.
5. Quản lý thanh toán, công nợ và nhắc công nợ.
6. Quản lý tài khoản phụ huynh.
7. Quản lý khung chương trình và các buổi học.
8. Upload và phát SCORM trên website.
9. Quản lý bài tập trắc nghiệm và import từ Word.
10. Quản lý lớp học chính thức và lịch học thực tế.
11. Gán giáo viên, học viên và chương trình vào lớp.
12. Điểm danh, nhận xét, giao bài tập, học bù.
13. Portal phụ huynh và dashboard từng học viên.
14. Hình ảnh lớp học theo buổi.
15. Học bạ theo khóa học.
16. Học sinh đánh giá giáo viên.
17. Phụ huynh khảo sát chất lượng trung tâm.
18. Báo cáo học tập, lớp học và trung tâm.

### Ngoài phạm vi hiện tại

- Satacoin tạm thời để trạng thái `PENDING`, chưa phát triển cho đến khi có:
  - Bảng quy đổi điểm.
  - Danh mục quà tặng.
  - Quy tắc cộng/trừ điểm.
  - Quy trình duyệt và đổi quà.
  - Ghi chú thiết kế: schema dữ liệu chuẩn bị sẵn bảng cấu hình điểm động (hành vi – điểm – trần – nguồn) để Admin tự nhập khi TGĐ ban hành bảng chuẩn, không cần sửa code khi kích hoạt. Các nguồn tích điểm dự kiến: kết quả bài tập từng buổi, học viên hoàn thành đánh giá giáo viên, phụ huynh hoàn thành khảo sát.
- AI/Claude Skill tạo bài tập không thuộc requirement hệ thống này.

---

# 3. Vai trò và phân quyền

## 3.1. Superadmin/Admin

Có toàn quyền:

- Quản trị Lead, phụ huynh, học viên, Enrollment.
- Quản trị khóa học và bảng giá.
- Quản trị khung chương trình.
- Quản trị lớp học, lịch học và giáo viên.
- Quản trị SCORM, bài tập, học bạ, khảo sát.
- Xem và xuất toàn bộ báo cáo.
- Xử lý các trường hợp dữ liệu trùng hoặc xung đột.
- Khóa/mở khóa dữ liệu.
- Cấu hình giới hạn upload và các tham số hệ thống.

## 3.2. Sale/CRM

Được phép:

- Nhận và chăm sóc Lead.
- Tạo LeadChild cho một hoặc nhiều con.
- Tạo lớp trải nghiệm Robosim 4 buổi.
- Xếp LeadChild vào lớp trải nghiệm.
- Chuyển trạng thái Lead trong phạm vi nghiệp vụ.
- Tạo hồ sơ convert khi phụ huynh đăng ký.
- Nhập thông tin phụ huynh, học viên và Enrollment.
- Chọn khóa học, ưu đãi và hình thức thanh toán.
- Ghi nhận khoản tiền phụ huynh đã thanh toán.
- Xếp học viên vào lớp chính thức.
- Upload hình ảnh lớp nếu phụ trách lớp.
- Theo dõi công nợ và lịch nhắc.
- Gửi hoặc xác nhận yêu cầu học bù theo quy trình.

Không được phép:

- Xác nhận kế toán cuối cùng cho khoản thu.
- Tạo/sửa/xóa khung chương trình gốc.
- Tạo/sửa nội dung bài tập gốc.
- Thay thế SCORM chính thức.

## 3.3. Kế toán

Được phép:

- Xem hồ sơ đăng ký, giá và ưu đãi.
- Xem khoản Sale đã ghi nhận.
- Xác nhận hoặc từ chối trạng thái thực thu.
- Quản lý phiếu thu riêng theo từng Enrollment.
- Theo dõi công nợ.
- Điều chỉnh giao dịch theo quyền được cấp.
- Xuất báo cáo doanh thu và công nợ.

## 3.4. Quản lý cơ sở

Được phép:

- Xem dữ liệu thuộc cơ sở quản lý.
- Gán giáo viên/nhân sự cho lớp trải nghiệm và lớp chính thức.
- Quản lý phòng học, lịch lớp, sức chứa.
- Duyệt hoặc xử lý các thay đổi lịch học quan trọng.
- Theo dõi chất lượng lớp, tiến độ, điểm danh và học bù.
- Xem báo cáo cơ sở.
- Xử lý yêu cầu học bù.
- Upload hình ảnh lớp khi cần.

## 3.5. Bộ phận Đào tạo

Là chủ sở hữu nội dung đào tạo, được phép:

- CRUD khóa học trong phạm vi nội dung đào tạo nếu được phân quyền.
- CRUD khung chương trình.
- CRUD buổi học trong khung chương trình.
- Upload, thay thế, xuất bản, lưu trữ SCORM.
- CRUD bài tập trắc nghiệm.
- Import bài tập từ file Word.
- Gán bài tập vào từng buổi.
- Quản lý tài liệu bổ sung.
- Khóa chỉnh sửa chương trình.
- Xử lý đề xuất chỉnh sửa từ giáo viên.

## 3.6. Giáo viên

Được phép:

- Xem các lớp được phân công.
- Xem danh sách học viên.
- Xem khung chương trình của lớp.
- Mở và trình chiếu SCORM trên website.
- Xem bài tập về nhà của từng buổi.
- Cập nhật buổi đã dạy.
- Điểm danh.
- Nhập nhận xét lớp.
- Nhập nhận xét từng học viên.
- Ghi nhận lý do vắng nếu có thông tin.
- Đề xuất học bù.
- Chọn hạn làm bài hoặc trì hoãn giao bài theo quyền.
- Upload hình ảnh theo từng buổi.
- Gửi đề xuất chỉnh sửa chương trình.

Không được phép mặc định:

- Tạo/sửa/xóa khung chương trình gốc.
- Sửa mã chương trình.
- Xóa SCORM hoặc bài tập gốc.
- Upload đè SCORM chính thức.
- Tải file nguồn SCORM.
- Sửa đáp án bài tập gốc.

## 3.7. Phụ huynh

Được phép:

- Đăng nhập bằng email.
- Kích hoạt tài khoản qua email.
- Xem dashboard phụ huynh.
- Chuyển profile sang từng người con.
- Xem lịch học, lớp học, khóa học và giáo viên của con.
- Xem tiến độ, điểm danh, buổi vắng, học bù.
- Xem số bài tập đã làm/tổng số bài tập đã giao.
- Xem trạng thái hoàn thành bài tập.
- Xem nhận xét giáo viên.
- Xem hình ảnh của con trong lớp.
- Xem học phí đã được kế toán xác nhận và công nợ còn lại.
- Xem học bạ theo khóa học.
- Quản lý hồ sơ của phụ huynh và các con trong phạm vi cho phép.
- Gửi yêu cầu học bù.
- Thực hiện khảo sát đánh giá trung tâm.

Không được phép:

- Xem nội dung câu hỏi/đáp án bài tập chi tiết của con.
- Xem SCORM.
- Xem dữ liệu của gia đình khác.
- Tự sửa dữ liệu học phí, lớp học hoặc kết quả.

## 3.8. Học viên

Trong Phase hiện tại, học viên không có tài khoản độc lập.

Học viên sử dụng profile của mình trong tài khoản phụ huynh và được phép:

- Xem dashboard cá nhân.
- Xem lịch học.
- Xem tiến độ học tập.
- Xem bài tập được giao.
- Làm và nộp bài tập trắc nghiệm.
- Xem kết quả bài tập theo cấu hình.
- Xem nhận xét dành cho mình.
- Xem học bạ.
- Đánh giá giáo viên.

Không được phép:

- Xem SCORM.
- Xem dữ liệu của anh/chị/em khác khi profile đó chưa được chọn.
- Xem dữ liệu của lớp, khóa hoặc cơ sở không liên quan.

---

# 4. Mô hình nghiệp vụ tổng thể

```text
Lead
├── Parent prospect information
└── LeadChild 1..N
      └── Trial Enrollment
            └── Trial Class Robosim – 4 buổi

Sau khi phụ huynh đồng ý đăng ký và có thanh toán:
Lead
→ Convert
→ Parent
→ Parent Account
→ Student 1..N
→ Enrollment 1..N
→ Payment/Receivable
→ Official Class
→ Course
→ Program
→ Program Sessions
→ Class Sessions
→ Attendance
→ Homework Assignment
→ Homework Submission
→ Teacher Comment
→ Parent/Student Portal
→ Report Card / Survey / Reports
```

---

# 5. MODULE A – Quản lý Lead và trẻ tiềm năng

## 5.1. Lead

Lead được tạo từ:

- Facebook Messenger.
- Zalo.
- Website.
- Google Form.
- Nhập tay.
- Sale HO bàn giao.
- Các nguồn khác do Admin cấu hình.

Thông tin Lead tối thiểu:

- Mã Lead.
- Họ tên phụ huynh hoặc người liên hệ.
- Số điện thoại.
- Email nếu có.
- Nguồn Lead.
- Cơ sở quan tâm.
- Sale/CRM phụ trách.
- Trạng thái.
- Ghi chú chăm sóc.
- Ngày tạo.
- Lịch sử tương tác.

### SLA chăm sóc Lead

- Lead ở trạng thái `Mới` hoặc `Đã phân công` quá **24 giờ** không có hoạt động chăm sóc nào được ghi nhận sẽ bị highlight cảnh báo và gửi thông báo cho Quản lý cơ sở/Admin.
- Mốc 24 giờ là tham số cấu hình hệ thống, Admin điều chỉnh được.
- Mỗi hoạt động chăm sóc (gọi điện, nhắn tin, đổi trạng thái, ghi chú) cập nhật lại mốc hoạt động gần nhất của Lead.

## 5.2. LeadChild

Một Lead có thể có một hoặc nhiều `LeadChild`.

Thông tin mỗi LeadChild:

- Họ tên.
- Ngày sinh hoặc độ tuổi.
- Giới tính.
- Trường đang học.
- Lớp đang học.
- Khóa quan tâm.
- Cơ sở quan tâm.
- Ghi chú riêng.
- Trạng thái học thử.
- Lớp trải nghiệm đang tham gia.
- Điểm danh 4 buổi.
- Nhận xét học thử.

### Quy tắc

- Mặc định form hiển thị một trẻ.
- Có nút `Thêm con`.
- Khi bấm `Thêm con`, hệ thống mở thêm một nhóm trường ngay dưới người con trước.
- Không giới hạn số LeadChild.
- Mỗi LeadChild chỉ được tham gia một lớp trải nghiệm đang hoạt động tại một thời điểm.
- Nhiều LeadChild của cùng một Lead có thể học các lớp trải nghiệm khác nhau.

---

# 6. MODULE B – Lớp trải nghiệm Robosim 4 buổi

## 6.1. Mục đích

Lớp trải nghiệm là lớp Robosim gồm đúng 4 buổi riêng biệt nhằm:

- Giúp trẻ thử trải nghiệm bộ môn Robotics.
- Giúp phụ huynh đánh giá mức độ phù hợp.
- Giúp giáo viên đánh giá khả năng tiếp nhận.
- Tạo thời gian cho Sale/CRM tư vấn và chốt đăng ký.

## 6.2. Người tạo và quản lý

- Sale/CRM được tạo lớp trải nghiệm.
- Sale/CRM được xếp LeadChild vào lớp.
- Quản lý cơ sở có trách nhiệm gán giáo viên/nhân sự.
- Giáo viên thực hiện điểm danh và nhận xét.
- Lớp phải gắn cơ sở cụ thể.

## 6.3. Thông tin lớp trải nghiệm

- Mã lớp.
- Tên lớp.
- Loại lớp: `TRIAL_ROBOSIM`.
- Cơ sở.
- Phòng học.
- Ngày bắt đầu.
- Lịch 4 buổi.
- Giờ bắt đầu/kết thúc.
- Sức chứa.
- Giáo viên.
- Nhân sự hỗ trợ.
- Trạng thái.
- Danh sách LeadChild.

## 6.4. Quy tắc

- Lớp có đúng 4 buổi.
- Hệ thống tự sinh 4 lịch buổi học khi tạo lớp.
- Có thể điều chỉnh ngày, giờ, phòng hoặc giáo viên từng buổi.
- Không được xếp vượt sức chứa trừ khi người có quyền xác nhận.
- Một LeadChild không được thuộc hai lớp trải nghiệm đang hoạt động cùng lúc.
- Sau khi hoàn thành buổi 4, trạng thái LeadChild chuyển `Đã học thử`.
- Lead không tự động chuyển `Chờ quyết định`.
- Sale/CRM chỉ chuyển sang `Chờ quyết định` khi xác định phụ huynh đang cân nhắc.

---

# 7. Trạng thái Lead

Luồng trạng thái chuẩn:

```text
Mới
→ Đã phân công
→ Đang tư vấn
→ Đã tư vấn
→ Hẹn học thử
→ Đang học thử
→ Đã học thử
→ Chờ quyết định
→ Đã đăng ký
→ Đã chuyển đổi
```

Nhánh kết thúc khác:

```text
Thất bại
Không liên hệ được
```

### Quy tắc trạng thái

- `Hẹn học thử`: LeadChild đã được xếp lớp trải nghiệm nhưng lớp chưa bắt đầu.
- `Đang học thử`: ít nhất một LeadChild đã tham dự lớp trải nghiệm đang hoạt động.
- `Đã học thử`: tất cả LeadChild được xét trong cơ hội hiện tại đã hoàn thành hoặc kết thúc học thử.
- `Chờ quyết định`: Sale/CRM tự chuyển khi phụ huynh chưa chốt.
- `Đã đăng ký`: phụ huynh đã đồng ý và form đăng ký đã được nhập.
- `Đã chuyển đổi`: đã tạo thành công Parent, Student và Enrollment.
- Không xóa Lead gốc sau convert.
- Lưu lịch sử thay đổi trạng thái, người thao tác và thời gian.

---

# 8. MODULE C – Convert Lead đã đăng ký

## 8.1. Điều kiện bắt buộc để convert

Chỉ được convert khi:

1. Phụ huynh đồng ý đăng ký.
2. Có ít nhất một Enrollment được khai báo.
3. Có ít nhất một khoản thanh toán:
   - Đợt 1; hoặc
   - Thanh toán toàn bộ.
4. Sale đã ghi nhận khoản tiền đã thu.
5. Các trường bắt buộc của phụ huynh và học viên hợp lệ.

Kế toán chưa cần xác nhận thực thu trước khi convert, nhưng khoản tiền chỉ hiển thị cho phụ huynh sau khi kế toán xác nhận.

## 8.2. Form thông tin phụ huynh

Bắt buộc:

- Họ tên phụ huynh.
- Email.
- Số điện thoại.
- Cơ sở phụ trách chính.

Tùy chọn hoặc mở rộng:

- Địa chỉ.
- Nghề nghiệp.
- Quan hệ với học viên.
- Zalo ID.
- Ghi chú.
- Người phụ huynh thứ hai.

### Cam kết sử dụng hình ảnh học viên (bắt buộc xử lý tại convert)

- Form convert có ô tick: **"Phụ huynh đồng ý cho trung tâm chụp và sử dụng hình ảnh học viên trong quá trình học"**.
- Sale **bắt buộc trao đổi trực tiếp với phụ huynh** về nội dung này trước khi tick.
- Hệ thống ghi nhận: trạng thái đồng ý, người tick, thời điểm tick (audit log).
- Trạng thái đồng ý có thể được phụ huynh thay đổi sau này qua yêu cầu chính thức; mọi thay đổi đều có log.
- Học viên không có cờ đồng ý sẽ bị loại khỏi ảnh lớp hiển thị cho phụ huynh khác hoặc được làm mờ trong ảnh chung (chi tiết tại Module N).
- Căn cứ tuân thủ: Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân, đặc biệt dữ liệu trẻ em.

## 8.3. Form thông tin học viên

Mặc định có một học viên.

Có nút `Thêm học viên`, khi bấm sẽ mở các trường tương tự học viên đầu tiên ngay bên dưới.

Mỗi học viên gồm:

- Họ tên.
- Ngày sinh.
- Giới tính.
- Trường đang học.
- Lớp đang học.
- Số điện thoại nếu có.
- Email nếu có.
- Cơ sở học.
- Mã học viên tự sinh.
- Khóa học đăng ký.
- Enrollment tương ứng.
- Ghi chú sức học hoặc nhu cầu.

Không giới hạn số học viên trong một phụ huynh.

## 8.4. Kiểm tra trùng phụ huynh

Hệ thống kiểm tra cả:

- Email phụ huynh.
- Số điện thoại phụ huynh.

### Trường hợp chưa tồn tại

```text
Tạo Parent mới
→ Tạo Student 1..N
→ Liên kết Student với Parent
→ Tạo Enrollment cho từng Student
```

### Trường hợp đã tồn tại

```text
Hiển thị hồ sơ Parent hiện có
→ Sale kiểm tra
→ Chọn Parent hiện có
→ Kiểm tra trùng Student
→ Gắn Student mới nếu chưa tồn tại
→ Tạo Enrollment mới
→ Không tạo Parent trùng
```

### Trường hợp xung đột

Nếu:

- Số điện thoại thuộc Parent A; và
- Email thuộc Parent B;

thì:

- Khóa thao tác convert.
- Không tự động chọn một hồ sơ.
- Chuyển cho Admin xử lý gộp hoặc điều chỉnh dữ liệu.
- Lưu log xung đột.

## 8.5. Kiểm tra trùng học viên

Cảnh báo trùng khi đồng thời giống:

- Parent.
- Họ tên học viên sau chuẩn hóa.
- Ngày sinh.

Nếu trùng:

- Không tạo Student mới.
- Cho phép chọn Student cũ.
- Tạo Enrollment mới cho khóa học mới.

## 8.6. Mã học viên

Định dạng:

```text
<MA_CO_SO>-<NAM_2_SO>-<CHUOI_RANDOM>
```

Ví dụ:

```text
CS1-26-A7K9P2
CS2-26-M4T8Q1
```

Quy tắc:

- Mã viết hoa.
- Mã chứa ID/mã cơ sở.
- Năm lấy theo ngày tạo học viên.
- Chuỗi random dùng ký tự không dễ nhầm.
- Phải unique toàn hệ thống.
- Nếu trùng, hệ thống tự sinh lại.
- Không cho sửa thủ công sau khi tạo, trừ Superadmin.

## 8.7. Tài khoản phụ huynh

Sau convert:

1. Tạo Parent.
2. Tạo tài khoản theo email bắt buộc.
3. Gửi email kích hoạt.
4. Phụ huynh đặt mật khẩu.
5. Đăng nhập tại cổng chung.
6. Chuyển tới `hocvien.satarobo.vn`.
7. Mặc định vào dashboard phụ huynh.
8. Cho phép chuyển profile sang từng con.

Phase sau mới tích hợp OTP/Zalo.

---

# 9. MODULE D – Khóa học, giá và Enrollment

## 9.1. Khóa học

Mỗi khóa học có:

- Mã khóa học.
- Tên khóa học.
- Mô tả.
- Độ tuổi/trình độ.
- Tổng số buổi.
- Khung chương trình mặc định.
- Giá niêm yết.
- Danh sách giảm giá/học bổng/ưu đãi.
- Trạng thái.
- Áp dụng toàn hệ thống.

Giá không khác nhau theo cơ sở và không cần ngày hiệu lực.

## 9.2. Ưu đãi

Khóa học cho phép cấu hình:

- Giảm theo số tiền.
- Giảm theo phần trăm.
- Học bổng.
- Ưu đãi theo chương trình.
- Ghi chú và điều kiện áp dụng.

Khi tạo Enrollment phải lưu snapshot:

- Giá niêm yết tại thời điểm đăng ký.
- Loại ưu đãi.
- Số tiền giảm.
- Giá phải thanh toán.

Giá Enrollment đã tạo không thay đổi khi giá khóa học được cập nhật sau này.

## 9.3. Enrollment

Mỗi người con có một Enrollment riêng cho mỗi khóa học.

Thông tin Enrollment:

- Student.
- Parent.
- Course.
- Cơ sở học.
- Ngày đăng ký.
- Giá niêm yết.
- Ưu đãi.
- Số tiền giảm.
- Giá phải thanh toán.
- Hình thức thanh toán.
- Tổng đã ghi nhận.
- Tổng đã được kế toán xác nhận.
- Công nợ còn lại.
- Trạng thái xếp lớp.
- Lớp chính thức.
- Sale/CRM phụ trách.
- Trạng thái Enrollment.

Một học viên có thể học nhiều khóa khác nhau đồng thời.

Một Enrollment chỉ thuộc một lớp chính thức đang hoạt động tại một thời điểm.

---

# 10. MODULE E – Thanh toán và công nợ

## 10.1. Thanh toán một lần

Sale nhập:

- Số tiền phụ huynh đã thanh toán.
- Ngày thanh toán.
- Phương thức.
- Ảnh/chứng từ nếu có.
- Ghi chú.

Nếu đủ giá phải thanh toán:

- Trạng thái Sale: `Đã ghi nhận đủ`.
- Chờ Kế toán xác nhận.
- Sau khi xác nhận, công nợ bằng 0.

## 10.2. Thanh toán hai đợt

Sale nhập:

- Số tiền đã thanh toán đợt 1.
- Ngày thanh toán đợt 1.
- Hệ thống tự tính số tiền còn lại cho đợt 2.
- Ngày dự kiến thanh toán đợt 2.
- Số ngày nhắc trước `X`.
- Ngày nhắc công nợ tự động:

```text
Ngày nhắc = Ngày dự kiến thanh toán đợt 2 - X ngày
```

Nếu ngày nhắc nhỏ hơn hoặc bằng ngày hiện tại:

- Tạo nhắc công nợ ngay.
- Hiển thị cảnh báo cho Sale/CRM.

## 10.3. Hai tầng trạng thái thanh toán

### Tầng Sale

- Chưa ghi nhận.
- Sale đã ghi nhận.
- Sale xác nhận đã thu.

### Tầng Kế toán

- Chờ xác nhận.
- Đã xác nhận thực thu.
- Từ chối/xác minh lại.
- Đã hoàn tiền.
- Đã điều chỉnh.

Phụ huynh chỉ nhìn thấy các khoản `Đã xác nhận thực thu`.

## 10.4. Phiếu thu

- Mỗi Enrollment có phiếu thu riêng.
- Khi một phụ huynh đăng ký cho nhiều con, không gộp hóa đơn.
- Có thể tạo nhiều phiếu thu cho cùng một Enrollment.
- Mọi điều chỉnh phải có log.
- Không xóa cứng giao dịch đã xác nhận.
- Điều chỉnh bằng bút toán/phiếu điều chỉnh.

## 10.5. Công nợ

Công nợ hiển thị theo:

- Enrollment.
- Học viên.
- Phụ huynh.
- Cơ sở.
- Sale phụ trách.
- Ngày đến hạn.
- Mức độ quá hạn.

Công thức:

```text
Công nợ còn lại
= Giá phải thanh toán
- Tổng số tiền đã được Kế toán xác nhận thực thu
```

---

# 11. MODULE F – Khung chương trình

## 11.1. Phạm vi

Khung chương trình thuộc toàn hệ thống, không thuộc riêng cơ sở.

## 11.2. Cấu trúc

```text
Khung chương trình
├── Mã chương trình
├── Tên chương trình
├── Số buổi
├── Mô tả
├── Độ tuổi / trình độ phù hợp
├── Trạng thái
├── Phiên bản
└── Danh sách buổi
    ├── Buổi 1
    ├── Buổi 2
    ├── ...
    └── Buổi N
```

## 11.3. Thông tin từng buổi

- Số thứ tự.
- Tên buổi.
- Mục tiêu buổi học.
- Nội dung chính.
- Ghi chú cho giáo viên.
- SCORM.
- Bài tập về nhà.
- Tài liệu bổ sung.
- Trạng thái.
- Phiên bản nội dung.

## 11.4. Số buổi

Khi nhập `Số buổi = N`, hệ thống tự sinh N dòng hoặc N mục accordion/dropdown:

```text
Buổi 1
Buổi 2
...
Buổi N
```

### Khi tăng số buổi

- Thêm các buổi mới ở cuối.
- Giữ nguyên dữ liệu cũ.

### Khi giảm số buổi

- Cảnh báo rõ các buổi sẽ bị loại.
- Không xóa ngầm.
- Nếu buổi có SCORM/bài tập thì bắt buộc xác nhận.
- Ưu tiên chuyển dữ liệu sang lưu trữ thay vì xóa cứng.

## 11.5. Trạng thái chương trình

- Nháp.
- Xuất bản.
- Lưu trữ.
- Ngưng xuất bản.

## 11.6. Trạng thái buổi trong chương trình

- Chưa hoàn thiện.
- Đã hoàn thiện.
- Đang sử dụng.
- Đang cần cập nhật.
- Đã khóa chỉnh sửa.

## 11.7. Quy tắc gắn khóa học

- Mỗi khóa học có một khung chương trình mặc định đang xuất bản.
- Khi CRM tạo lớp và chọn khóa học, hệ thống tự động gắn khung chương trình của khóa đó.
- Không bắt CRM chọn lại chương trình nếu khóa học đã có chương trình mặc định.
- Nếu khóa học chưa có chương trình xuất bản, không cho kích hoạt lớp chính thức.
- Khi lớp đã tạo, hệ thống lưu phiên bản chương trình được sử dụng.

---

# 12. MODULE G – SCORM

## 12.1. Quy tắc sử dụng

- SCORM là tài liệu bài giảng chính.
- Không sử dụng PDF, PowerPoint hoặc Google Slides làm bài giảng chính.
- Giáo viên chỉ được mở SCORM trên website.
- Không cung cấp nút tải file nguồn.
- Học viên và phụ huynh không được xem SCORM.
- Không tracking SCORM theo học viên.

## 12.2. Upload SCORM

Luồng xử lý:

```text
Đào tạo upload .zip
→ Kiểm tra loại file
→ Quét an toàn
→ Kiểm tra imsmanifest.xml
→ Xác định SCORM 1.2/2004
→ Giải nén vào vùng lưu trữ riêng
→ Đọc manifest
→ Xác định launch URL
→ Kiểm tra file khởi chạy
→ Lưu metadata
→ Chuyển trạng thái chờ kiểm thử
→ Đào tạo xem thử
→ Xuất bản
```

## 12.3. Metadata

- Tên gói.
- Phiên bản SCORM.
- Program ID.
- Program Session ID.
- Storage path.
- Launch URL.
- Kích thước.
- Người upload.
- Ngày upload.
- Phiên bản tài liệu.
- Trạng thái kiểm thử.
- Trạng thái xuất bản.

## 12.4. Bảo vệ nội dung

- Storage private.
- Dùng signed URL thời hạn ngắn.
- Không public URL lâu dài.
- Chặn directory listing.
- Không hiển thị nút tải xuống.
- Chỉ người có quyền lớp hoặc quyền đào tạo mới mở được.
- Ghi log người mở, lớp, buổi, thời gian.
- Không tuyên bố chống tải tuyệt đối; hệ thống chỉ hạn chế truy cập và tải trực tiếp trong phạm vi trình duyệt.

### Biện pháp chống quay/chụp màn hình (mức tối đa web hỗ trợ — đã chốt bổ sung)

- Player tự **phủ lớp mờ và ẩn nội dung SCORM** khi:
  - Cửa sổ hoặc tab mất focus hoặc bị ẩn (`blur`/`visibilitychange`) — bao phủ phần lớn thao tác bật phần mềm quay, Alt-Tab, chia màn hình.
  - Phát hiện phím PrintScreen trên Windows (đồng thời ghi đè clipboard).
  - Phát hiện mở DevTools.
  - Phát hiện chính tab đang bị chia sẻ màn hình qua API trình duyệt.
- **Watermark động**: tên + mã giáo viên + thời gian thực, đè mờ chéo trên player, vị trí dịch chuyển ngẫu nhiên định kỳ để chống crop.
- Ghi chú trung thực: trình duyệt web không có API chặn tuyệt đối việc quay/chụp từ phần mềm ngoài hoặc quay bằng điện thoại; các biện pháp trên chặn đa số hành vi phổ biến, watermark là lớp truy vết cho phần còn lại. Nếu cần mức tuyệt đối, phương án app mobile (FLAG_SECURE/iOS capture detection) sẽ xem xét ở giai đoạn sau.

## 12.5. Phiên bản SCORM

- Upload phiên bản mới không xóa bản cũ.
- Chỉ một phiên bản được đánh dấu đang sử dụng cho một buổi.
- Lớp đã bắt đầu giữ bản snapshot/phiên bản đã gắn, trừ khi người có quyền chủ động cập nhật.
- Thay SCORM của lớp phải lưu audit log.

---

# 13. MODULE H – Bài tập trắc nghiệm

## 13.1. Chủ sở hữu

Chỉ Bộ phận Đào tạo/Admin được CRUD bài tập gốc.

Giáo viên:

- Chỉ xem bài tập.
- Không sửa câu hỏi/đáp án.
- Có thể chọn hạn nộp hoặc trì hoãn giao theo quyền.
- Có thể xem kết quả học viên.

## 13.2. Cấu trúc bài tập

Một bài tập có:

- Mã bài tập.
- Tên bài tập.
- Mô tả.
- Program Session.
- Thời lượng.
- Số lần làm.
- Hạn làm mặc định.
- Cách tính điểm.
- Điểm đạt.
- Có trộn câu hay không.
- Có trộn đáp án hay không.
- Hiển thị kết quả sau khi nộp hay không.
- Trạng thái nháp/xuất bản/lưu trữ.

## 13.3. Loại câu hỏi

Tối thiểu hỗ trợ:

- Một đáp án đúng.
- Nhiều đáp án đúng.
- Đúng/Sai.
- Câu hỏi có hình ảnh.
- Đáp án có hình ảnh.
- Câu hỏi văn bản.

Có thể mở rộng sau:

- Ghép cặp.
- Sắp xếp.
- Điền đáp án ngắn.

## 13.4. Import từ Word

Định dạng import chính là `.docx`.

Không dùng `.doc` cũ để tránh lỗi parser.

### Template Word bắt buộc

Mỗi câu hỏi được đặt trong một bảng riêng hoặc theo block có cấu trúc cố định:

```text
QUESTION_CODE: Q001
QUESTION_TYPE: SINGLE
QUESTION_TEXT: Nội dung câu hỏi
QUESTION_IMAGE: [Ảnh được chèn trực tiếp nếu có]
OPTION_A: Nội dung đáp án A
OPTION_A_IMAGE: [Ảnh nếu có]
OPTION_B: Nội dung đáp án B
OPTION_B_IMAGE: [Ảnh nếu có]
OPTION_C: Nội dung đáp án C
OPTION_D: Nội dung đáp án D
CORRECT_ANSWER: A
EXPLANATION: Giải thích
SCORE: 1
DIFFICULTY: EASY
TAGS: robosim, buoi-1
```

### Quy tắc parser Word

- Chỉ nhận `.docx`.
- Ảnh phải được chèn trực tiếp trong file.
- Không nhận ảnh qua link internet.
- Hệ thống trích ảnh từ package DOCX.
- Map ảnh theo vị trí trong block câu hỏi.
- Kiểm tra mã câu hỏi trùng.
- Kiểm tra đáp án đúng có tồn tại.
- Kiểm tra câu hỏi thiếu nội dung.
- Kiểm tra loại câu hỏi.
- Hiển thị màn hình preview trước khi import.
- Cho phép người dùng sửa lỗi từng dòng/câu trước khi xác nhận.
- Import thành bản nháp trước.
- Chỉ Đào tạo có quyền xuất bản.

### Lưu ý kỹ thuật

Import Word có ảnh phức tạp hơn Excel. Template phải được khóa cấu trúc và không cho người dùng tự thay đổi tên field. Nên cung cấp file mẫu chuẩn để Đào tạo tải về và điền.

## 13.5. Tự động giao bài

Bài tập được gắn sẵn vào Program Session.

Luồng:

```text
Giáo viên đánh dấu buổi đã dạy
→ Hệ thống kiểm tra bài tập đã xuất bản
→ Tự động tạo Homework Assignment cho lớp/học viên
→ Áp dụng hạn nộp mặc định hoặc hạn giáo viên chọn
→ Học viên thấy bài tập
```

Giáo viên có thể:

- Trì hoãn giao.
- Chọn hạn nộp.
- Giao lại trong trường hợp được cấp quyền.

Giáo viên không được thay đổi câu hỏi gốc.

## 13.6. Phân quyền hiển thị

- Giáo viên: xem nội dung bài tập và kết quả.
- Học viên: xem và làm bài tập của chính mình.
- Phụ huynh: không xem câu hỏi/đáp án chi tiết.
- Phụ huynh chỉ xem:
  - Đã giao hay chưa.
  - Đã làm hay chưa.
  - Số bài đã làm/tổng số bài đến thời điểm hiện tại.
  - Trạng thái hoàn thành.
  - Điểm hoặc kết quả tổng quan nếu trung tâm bật hiển thị.

---

# 14. MODULE I – Tạo và quản lý lớp chính thức

## 14.1. Tạo lớp

CRM nhập:

- Mã lớp.
- Tên lớp.
- Khóa học.
- Ngày bắt đầu.
- Các thứ học trong tuần.
- Số buổi mỗi tuần.
- Giờ bắt đầu.
- Giờ kết thúc.
- Tổng số buổi.
- Giáo viên.
- Cơ sở.
- Phòng học.
- Sức chứa.
- Trạng thái.

## 14.2. Tự động nhận chương trình

Khi chọn khóa học:

```text
Course
→ Program mặc định đang xuất bản
→ Program Version
→ Sao chép logic các Program Session
→ Tạo Class Program Snapshot
→ Sinh Class Session
```

Ví dụ:

```text
Chọn khóa SATA 3
→ Tự động gắn khung chương trình SATA 3
→ Tự động lấy tổng số buổi SATA 3
→ Sinh lịch và nội dung buổi tương ứng
```

## 14.3. Sinh lịch học

Hệ thống dùng:

- Ngày bắt đầu.
- Các thứ học trong tuần.
- Giờ học.
- Tổng số buổi.

để sinh lịch từng buổi.

Ví dụ:

```text
Ngày bắt đầu: 10/08/2026
Lịch: Thứ 2, Thứ 4
Tổng số buổi: 48
→ Sinh đủ 48 Class Session
```

## 14.4. Thay đổi lịch lặp

Khi thay đổi các thứ học hoặc số buổi học mỗi tuần:

- Các buổi đã hoàn thành không thay đổi.
- Các buổi đã khóa không thay đổi.
- Hệ thống tính lại các buổi tương lai chưa diễn ra.
- Hiển thị preview lịch mới.
- Hiển thị danh sách buổi bị thay đổi.
- Người dùng xác nhận trước khi áp dụng.
- Gửi thông báo lịch mới cho phụ huynh/giáo viên.
- Không tự động làm mất buổi.
- Vẫn phải bảo đảm đủ tổng số buổi của chương trình.

## 14.5. Điều chỉnh từng buổi

Cho phép:

- Đổi ngày.
- Đổi giờ.
- Đánh dấu nghỉ lễ.
- Hủy buổi.
- Tạo buổi bù.
- Đổi giáo viên.
- Đổi phòng.
- Đổi thứ tự bài học nếu có quyền.

Mọi thay đổi phải:

- Lưu lịch sử.
- Ghi người thay đổi.
- Gửi thông báo cho bên liên quan nếu ảnh hưởng lịch học.

## 14.6. Bản sao logic chương trình

Một Program dùng cho nhiều lớp.

Khi gắn vào lớp:

- Tạo ClassProgramSnapshot hoặc quan hệ phiên bản cố định.
- Tạo danh sách ClassSession riêng.
- Lớp có thể đổi thứ tự, thêm ghi chú, đổi lịch hoặc học bù mà không sửa Program gốc.
- Nội dung SCORM/bài tập vẫn tham chiếu phiên bản đã gắn.
- Muốn nhận phiên bản mới phải có thao tác cập nhật chủ động.

---

# 15. MODULE J – Gán học viên vào lớp

## 15.1. Dropdown học viên

Khi CRM thêm học viên vào lớp, dropdown chỉ hiển thị các Enrollment:

- Đúng khóa học của lớp.
- Đúng cơ sở của lớp.
- Trạng thái `Chờ xếp lớp` hoặc trạng thái hợp lệ.
- Chưa thuộc lớp chính thức nào của Enrollment đó.
- Enrollment còn hiệu lực.
- Không bị bảo lưu/tạm dừng nếu rule không cho phép.

## 15.2. Nút Thêm toàn bộ

`Thêm toàn bộ` chỉ thêm toàn bộ Enrollment đang hiển thị sau bộ lọc, không thêm toàn bộ học viên trong hệ thống.

Trước khi thêm:

- Kiểm tra sức chứa.
- Hiển thị số lượng sẽ thêm.
- Cảnh báo nếu vượt sức chứa.
- Yêu cầu người có quyền xác nhận nếu vẫn muốn thêm.

## 15.3. Sau khi gán lớp

Hệ thống:

- Liên kết Enrollment với lớp.
- Chuyển trạng thái `Đã xếp lớp`.
- Sinh tiến độ theo từng Class Session.
- Sinh quyền truy cập bài tập.
- Hiển thị lịch trong portal.
- Gửi thông báo cho phụ huynh.

---

# 16. MODULE K – Giáo viên vận hành buổi học

## 16.1. Luồng buổi học

```text
Giáo viên mở lớp
→ Chọn buổi hôm nay
→ Mở SCORM để dạy
→ Đánh dấu nội dung hoàn thành/chưa hoàn thành
→ Điểm danh
→ Ghi nhận vắng và lý do
→ Ghi nhận nhu cầu học bù
→ Nhập nhận xét lớp
→ Nhập nhận xét từng học viên
→ Upload hình ảnh
→ Đánh dấu đã dạy
→ Hệ thống giao bài tập
→ Cập nhật tiến độ
→ Thông báo cho phụ huynh/học viên
```

## 16.2. Dữ liệu sau mỗi buổi

- Nội dung đã dạy.
- Trạng thái hoàn thành bài học.
- Giáo viên thực dạy.
- Thời gian thực tế.
- Phòng thực tế.
- Danh sách điểm danh.
- Lý do vắng.
- Có cần học bù không.
- Nhận xét lớp.
- Nhận xét từng học viên.
- Bài tập đã giao.
- Hạn làm bài.
- Hình ảnh lớp.
- Ghi chú nội bộ.

---

# 17. MODULE L – Điểm danh và học bù

## 17.1. Trạng thái điểm danh

- Có mặt.
- Vắng có phép.
- Vắng không phép.
- Đi muộn.
- Học bù.
- Buổi học bị hủy.

## 17.2. Trạng thái tiến độ học viên theo buổi

- Đã điểm danh.
- Vắng.
- Cần học bù.
- Đã học bù.

## 17.3. Luồng học bù

Khi học viên vắng:

```text
Attendance = Vắng
→ Đánh dấu Cần học bù
→ Hệ thống tìm lớp phù hợp
→ Phụ huynh gửi yêu cầu
→ CRM/Quản lý xác nhận
→ Tạo Makeup Enrollment/Makeup Session
→ Học viên tham gia lớp khác đúng buổi
→ Điểm danh Học bù
→ Cập nhật tiến độ
```

## 17.4. Điều kiện đề xuất lớp học bù

Lớp đề xuất phải:

- Cùng khóa học.
- Cùng nội dung/buổi chương trình mà học viên bị vắng.
- Cơ sở: **cho phép liên cơ sở (CS1 ↔ CS2)** — hệ thống đề xuất mọi cơ sở có buổi học phù hợp, sắp xếp ưu tiên cơ sở con đang học trước, sau đó đến cơ sở khác theo lịch gần nhất.
- Có lịch phù hợp.
- Chưa diễn ra hoặc còn cho phép tham gia.
- Còn sức chứa.
- Không trùng lịch khác của học viên.

Có thể hiển thị nhiều lựa chọn theo ngày/giờ gần nhất.

## 17.5. Cách tính số buổi trên portal

Dashboard hiển thị riêng:

- Tổng số buổi chương trình.
- Số buổi chính thức đã tham gia.
- Số buổi vắng.
- Số buổi cần học bù.
- Số buổi đã học bù.

Buổi học bù:

- Được cộng vào số buổi học viên đã hoàn thành nội dung.
- Đồng thời vẫn được thống kê riêng là `Đã học bù`.
- Không làm tăng tổng số buổi của chương trình.

---

# 18. MODULE M – Portal phụ huynh và học viên

## 18.1. Đăng nhập

- Email là bắt buộc.
- Tài khoản phụ huynh được tạo sau convert.
- Kích hoạt qua email.
- Phase hiện tại dùng email + mật khẩu.
- OTP/Zalo phát triển sau.
- Một tài khoản phụ huynh quản lý nhiều con.
- Không có tài khoản học viên riêng trong Phase hiện tại.

## 18.2. Chuyển profile

Sau đăng nhập:

```text
Dashboard phụ huynh
├── Profile Phụ huynh
├── Học viên 1
├── Học viên 2
└── Học viên N
```

Khi chọn Học viên 1:

- Toàn bộ dashboard chuyển sang dữ liệu Học viên 1.
- Menu và chức năng chỉ hiển thị dữ liệu Học viên 1.
- Route không lộ `studentId`.
- Active profile lưu trong session.
- Không trộn dữ liệu giữa các con.

## 18.3. Dashboard phụ huynh

Hiển thị:

- Tổng quan các con.
- Lịch học sắp tới.
- Thông báo.
- Học phí đã xác nhận.
- Công nợ còn lại.
- Ngày đến hạn.
- Yêu cầu học bù.
- Khảo sát đang mở.
- Hồ sơ gia đình.

## 18.4. Dashboard học viên

Hiển thị:

- Khóa học đang học.
- Lớp đang học.
- Giáo viên phụ trách.
- Lịch học.
- Tổng số buổi.
- Số buổi đã hoàn thành.
- Số buổi còn lại.
- Số buổi vắng.
- Số buổi cần học bù.
- Số buổi đã học bù.
- Danh sách buổi học.
- Nhận xét giáo viên.
- Bài tập đã giao.
- Số bài đã làm/tổng số bài đến hiện tại.
- Kết quả học tập.
- Hình ảnh lớp.
- Học bạ.
- Đánh giá giáo viên.

## 18.5. Quy tắc bảo mật nội dung

Học viên:

- Không xem SCORM.
- Chỉ xem bài tập được giao cho Enrollment/lớp của mình.
- Không xem bài tập lớp khác.
- Không xem khóa khác nếu chưa đăng ký.
- Không xem dữ liệu cơ sở khác không liên quan.
- Không xem dữ liệu của anh/chị/em khác khi chưa chuyển profile.

Phụ huynh:

- Không xem câu hỏi/đáp án bài tập chi tiết.
- Chỉ xem tiến độ và kết quả tổng quan.
- Không xem dữ liệu gia đình khác.

---

# 19. MODULE N – Hình ảnh lớp học

## 19.1. Người upload

- Giáo viên của lớp.
- CRM/Sale phụ trách lớp.
- Quản lý/Admin.

## 19.2. Cấu trúc

Ảnh phải gắn với:

- Lớp.
- Buổi học.
- Ngày chụp.
- Người upload.
- Danh sách học viên được tag nếu có.
- Quyền hiển thị.
- Trạng thái duyệt nếu trung tâm áp dụng.

## 19.3. Hiển thị

- Phụ huynh chỉ xem ảnh của lớp con đang học.
- Có thể ưu tiên hiển thị ảnh có tag con.
- Không cho truy cập ảnh lớp khác qua URL.
- Dùng signed URL.
- Cho phép ẩn ảnh nhạy cảm hoặc ảnh bị phản ánh.
- Học viên **không có cờ đồng ý sử dụng hình ảnh** (xem Mục 8.2): không được tag, bị loại khỏi ảnh hiển thị hoặc làm mờ trong ảnh chung; hệ thống cảnh báo người upload khi lớp có học viên chưa đồng ý.

---

# 20. MODULE O – Học bạ theo khóa học

Mỗi học viên có một học bạ cho mỗi Enrollment/khóa học.

Học bạ gồm:

- Thông tin học viên.
- Khóa học.
- Lớp.
- Thời gian học.
- Tỷ lệ tham gia.
- Số buổi vắng.
- Số buổi học bù.
- Kết quả bài tập.
- Nhận xét theo giai đoạn.
- Năng lực/kỹ năng theo tiêu chí khóa học.
- Nhận xét tổng kết.
- Trạng thái hoàn thành.
- Giáo viên phụ trách.
- Ngày phát hành.

Quy tắc:

- Giáo viên nhập đánh giá.
- Quản lý/Đào tạo có thể duyệt.
- Chỉ học bạ đã phát hành mới hiển thị cho phụ huynh.
- Học bạ gắn với Enrollment, không gắn chung toàn bộ học viên.

---

# 21. MODULE P – Đánh giá giáo viên và khảo sát trung tâm

## 21.1. Học sinh đánh giá giáo viên

Nguyên tắc đã chốt: **học viên là người đánh giá giáo viên** (không phải phụ huynh) vì học viên là người tiếp xúc trực tiếp với giáo viên trong lớp.

- Học sinh thực hiện trong profile học viên (qua tài khoản phụ huynh).
- Có thể mở giữa khóa hoặc cuối khóa theo cấu hình đợt đánh giá.
- Đánh giá gắn với Enrollment, lớp và giáo viên.
- Chỉ được đánh giá giáo viên đang/đã dạy mình.
- Chống gửi trùng theo đợt đánh giá.
- **Form builder cho Admin**: Admin tự cấu hình bộ câu hỏi và phương án trả lời (câu hỏi thang mức, câu hỏi lựa chọn, câu hỏi mở); ngôn ngữ và hình thức câu hỏi phù hợp lứa tuổi học viên (gợi ý dùng biểu tượng cảm xúc/mức độ đơn giản cho trẻ nhỏ).
- Giáo viên chỉ xem dữ liệu tổng hợp nếu được phân quyền; Quản lý/Admin xem chi tiết.
- Kết quả tổng hợp vào báo cáo trung tâm và hồ sơ chất lượng giáo viên.

## 21.2. Phụ huynh khảo sát trung tâm

Nguyên tắc đã chốt: **phụ huynh làm khảo sát để đánh giá trung tâm/cơ sở mà con đang học** (không trực tiếp đánh giá giáo viên).

- Phụ huynh đánh giá trung tâm/cơ sở con đang học.
- **Form builder cho Admin**: Admin tự cấu hình câu hỏi và phương án trả lời cho từng đợt khảo sát (thang mức hài lòng, lựa chọn, câu hỏi mở).
- Khảo sát có thể gồm:
  - Chất lượng chăm sóc.
  - Cơ sở vật chất.
  - Lịch học.
  - Thông tin phản hồi.
  - Mức độ hài lòng.
  - Ý kiến cải thiện.
- Admin/Quản lý tạo đợt khảo sát.
- Hệ thống chỉ gửi khảo sát cho phụ huynh đủ điều kiện.
- Kết quả dùng cho báo cáo chất lượng trung tâm.

---

# 22. Trạng thái học viên và Enrollment

## 22.1. Trạng thái học viên

- Tiềm năng.
- Học thử.
- Đang học.
- Tạm nghỉ.
- Bảo lưu.
- Hoàn thành.
- Tái tục.

`Student` là hồ sơ con người lâu dài; trạng thái chi tiết theo khóa nên ưu tiên lưu ở Enrollment.

## 22.2. Trạng thái Enrollment đề xuất

- Chờ thanh toán.
- Đã ghi nhận thanh toán.
- Chờ kế toán xác nhận.
- Chờ xếp lớp.
- Đã xếp lớp.
- Đang học.
- Tạm dừng.
- Bảo lưu.
- Hoàn thành.
- Hủy.
- Tái tục.

---

# 23. Thông báo hệ thống

Hệ thống cần hỗ trợ thông báo trong app và email đối với:

- Kích hoạt tài khoản.
- Xếp lớp trải nghiệm.
- Thay đổi lịch trải nghiệm.
- Xếp lớp chính thức.
- Thay đổi lịch học.
- Đổi giáo viên/phòng.
- Bài tập mới.
- Bài tập sắp hết hạn.
- Nhận xét mới.
- Buổi vắng.
- Đề xuất/yêu cầu học bù.
- Xác nhận lịch học bù.
- Khoản thanh toán đã được kế toán xác nhận.
- Nhắc công nợ.
- Công nợ quá hạn.
- Học bạ được phát hành.
- Khảo sát/đánh giá đang mở.

---

# 24. Báo cáo

## 24.1. Báo cáo Lead

- Lead theo nguồn.
- Lead theo Sale/CRM.
- Lead theo cơ sở.
- Lead theo trạng thái.
- Số Lead có nhiều con.
- Số Lead được xếp học thử.
- Tỷ lệ tham gia đủ 4 buổi.
- Tỷ lệ học thử → đăng ký.
- Thời gian trung bình từ Lead đến đăng ký.
- Lead thất bại và lý do.

## 24.2. Báo cáo lớp trải nghiệm

- Số lớp.
- Sức chứa và số thực tế.
- Tỷ lệ đi học.
- Tỷ lệ hoàn thành 4 buổi.
- Tỷ lệ chuyển đổi theo lớp.
- Tỷ lệ chuyển đổi theo giáo viên/Sale.
- Nhận xét học thử.

## 24.3. Báo cáo học viên

- Học viên theo cơ sở.
- Học viên theo khóa.
- Học viên theo trạng thái.
- Học viên chưa xếp lớp.
- Học viên vắng nhiều.
- Học viên cần học bù.
- Học viên tái tục.
- Học viên hoàn thành.

## 24.4. Báo cáo lớp học

- Danh sách lớp.
- Sĩ số.
- Tỷ lệ chuyên cần.
- Tiến độ chương trình.
- Buổi đã dạy/chưa dạy.
- Lịch thay đổi.
- Số lượt học bù.
- Tình trạng bài tập.
- Kết quả trung bình.
- Chất lượng nhận xét giáo viên.

## 24.5. Báo cáo đào tạo

- Chương trình nháp/xuất bản/lưu trữ.
- Buổi thiếu SCORM.
- Buổi thiếu bài tập.
- Phiên bản SCORM.
- Tỷ lệ hoàn thành nội dung lớp.
- Kết quả bài tập theo buổi/khóa.
- Học bạ đã phát hành/chưa phát hành.

## 24.6. Báo cáo tài chính

- Giá trị Enrollment.
- Đã ghi nhận bởi Sale.
- Đã xác nhận bởi Kế toán.
- Công nợ còn lại.
- Công nợ đến hạn/quá hạn.
- Doanh thu theo khóa.
- Doanh thu theo cơ sở.
- Doanh thu theo Sale.
- Ưu đãi/học bổng.
- Phiếu thu theo Enrollment.

## 24.7. Báo cáo trung tâm

- Số học viên đang học.
- Công suất phòng/lớp.
- Tỷ lệ chuyển đổi.
- Tỷ lệ chuyên cần.
- Tỷ lệ hoàn thành bài tập.
- Tỷ lệ học bù.
- Mức độ hài lòng khảo sát.
- Đánh giá giáo viên.
- Doanh thu và công nợ.
- Tỷ lệ tái tục.

---

# 25. Mô hình dữ liệu khái niệm

Các entity chính:

```text
Lead
LeadChild
LeadStatusHistory
TrialClass
TrialClassSession
TrialEnrollment
TrialAttendance
TrialComment

Parent
UserAccount
Student
ParentStudentRelation

Course
CourseDiscount
Program
ProgramVersion
ProgramSession
ScormPackage
Homework
Question
QuestionOption

Enrollment
EnrollmentPriceSnapshot
Payment
Receipt
ReceivableReminder

Class
ClassProgramSnapshot
ClassSession
ClassTeacherAssignment
ClassStudent
Attendance
MakeupRequest
MakeupEnrollment

HomeworkAssignment
HomeworkSubmission
HomeworkAnswer

TeacherComment
ClassComment
ClassPhoto
PhotoStudentTag

ReportCard
ReportCardCriterion
TeacherEvaluation
CenterSurvey
SurveyResponse

Notification
AuditLog
```

## 25.1. Quan hệ chính

```text
Lead 1 ── N LeadChild
LeadChild N ── 1 TrialClass tại một thời điểm
LeadChild 1 ── N TrialAttendance

Parent 1 ── N Student
Student 1 ── N Enrollment
Course 1 ── N Enrollment
Course 1 ── 1 Program mặc định đang xuất bản

Program 1 ── N ProgramVersion
ProgramVersion 1 ── N ProgramSession
ProgramSession 1 ── 0..N ScormPackage
ProgramSession 1 ── 0..N Homework

Class 1 ── 1 Course
Class 1 ── 1 ClassProgramSnapshot
Class 1 ── N ClassSession
Class 1 ── N Enrollment
ClassSession 1 ── N Attendance
ClassSession 1 ── N HomeworkAssignment

Enrollment 1 ── N Payment
Enrollment 1 ── 1 ReportCard
Enrollment 1 ── N HomeworkSubmission
```

---

# 26. Quy tắc dữ liệu quan trọng

1. Email phụ huynh là bắt buộc và unique.
2. Số điện thoại phụ huynh là bắt buộc và unique.
3. Xung đột email/số điện thoại phải chuyển Admin xử lý.
4. Lead không bị xóa sau convert.
5. Student không được tạo trùng theo Parent + họ tên + ngày sinh.
6. Mỗi con có Enrollment riêng.
7. Mỗi Enrollment có học phí, thanh toán và phiếu thu riêng.
8. Giá Enrollment là snapshot, không cập nhật theo bảng giá mới.
9. Convert yêu cầu ít nhất một khoản tiền được Sale ghi nhận.
10. Phụ huynh chỉ thấy khoản Kế toán xác nhận.
11. Một Enrollment chỉ thuộc một lớp chính thức đang hoạt động.
12. Một LeadChild chỉ thuộc một lớp trải nghiệm đang hoạt động.
13. Course dùng toàn trung tâm.
14. Program dùng toàn hệ thống.
15. Lớp nhận Program tự động từ Course.
16. Lớp giữ snapshot chương trình.
17. Học viên không xem SCORM.
18. Giáo viên không tải SCORM nguồn.
19. Chỉ Đào tạo/Admin CRUD bài tập gốc.
20. Phụ huynh không xem chi tiết câu hỏi.
21. Mọi thay đổi lịch, thanh toán, chương trình và dữ liệu quan trọng phải có audit log.
22. Không xóa cứng giao dịch tài chính đã xác nhận.
23. Không xóa cứng lịch sử điểm danh và tiến độ.
24. Dữ liệu luôn gắn phạm vi cơ sở khi nghiệp vụ có liên quan.

---

# 27. Yêu cầu phi chức năng

## 27.1. Bảo mật

- RBAC theo vai trò và cơ sở.
- Kiểm tra quyền ở cả UI và API.
- Signed URL cho SCORM, ảnh và file riêng tư.
- Không public bucket.
- Chống truy cập chéo dữ liệu.
- Audit log.
- Rate limit các endpoint nhạy cảm.
- Mã hóa dữ liệu nhạy cảm khi phù hợp.
- Quản lý session an toàn.
- Tuân thủ yêu cầu bảo vệ dữ liệu cá nhân và dữ liệu trẻ em.

## 27.2. Hiệu năng

- Danh sách lớn phải phân trang.
- Upload SCORM có progress.
- Giải nén và kiểm tra SCORM qua job queue.
- Import Word chạy dưới dạng job nếu file lớn.
- Lịch lớp dài phải sinh theo transaction/job an toàn.
- Báo cáo nặng dùng snapshot hoặc cache.

## 27.3. Truy vết

Lưu:

- Người tạo.
- Người sửa.
- Thời gian.
- Giá trị trước/sau.
- IP/device khi cần.
- Lý do điều chỉnh.
- Đối tượng liên quan.

## 27.4. Tính toàn vẹn

- Dùng transaction cho convert Lead.
- Nếu một bước convert lỗi thì rollback toàn bộ.
- Dùng idempotency để tránh tạo Parent/Student/Payment trùng khi bấm nhiều lần.
- Dùng unique constraint cho email, số điện thoại, mã học viên.
- Không sinh lịch trùng.
- Không xếp học viên trùng lớp.

## 27.5. Khả năng sử dụng

- Form dài phải chia section.
- `Thêm con` mở inline.
- Có autosave draft cho form convert.
- Có cảnh báo trước thao tác mất dữ liệu.
- Có preview trước khi đổi lịch hàng loạt.
- Có preview trước khi import Word.
- Giao diện responsive.

---

# 28. Tiêu chí nghiệm thu chính

## 28.1. Lead và lớp trải nghiệm

- Tạo được Lead có nhiều LeadChild.
- Tạo được lớp trải nghiệm đúng 4 buổi.
- Sale/CRM xếp LeadChild vào lớp.
- Không cho một LeadChild vào hai lớp trải nghiệm hoạt động.
- Quản lý gán giáo viên.
- Giáo viên điểm danh và nhận xét.
- Sau 4 buổi, LeadChild chuyển `Đã học thử`.
- Sale có thể chuyển Lead sang `Chờ quyết định`.

## 28.2. Convert

- Không cho convert nếu chưa có thanh toán được ghi nhận.
- Kiểm tra trùng email/số điện thoại.
- Hiển thị Parent cũ nếu đã tồn tại.
- Không tạo Student trùng.
- Tạo được nhiều Student.
- Tạo Enrollment riêng cho từng Student.
- Tạo mã học viên đúng mẫu.
- Tạo tài khoản phụ huynh.
- Gửi email kích hoạt.
- Toàn bộ convert chạy transaction.

## 28.3. Học phí

- Chọn Course tự hiện giá.
- Áp dụng giảm giá/học bổng/ưu đãi.
- Lưu snapshot giá.
- Thanh toán 2 đợt tự tính số còn lại.
- Tính ngày nhắc theo X ngày.
- Sale ghi nhận được tiền.
- Kế toán xác nhận được thực thu.
- Phụ huynh chỉ thấy khoản đã xác nhận.
- Phiếu thu tách theo Enrollment.

## 28.4. Chương trình và SCORM

- Tạo Program.
- Nhập N buổi và tự sinh N mục.
- Gắn SCORM cho từng buổi.
- Kiểm tra `imsmanifest.xml`.
- Mở SCORM trong website.
- Giáo viên không có nút tải.
- Học viên không mở được SCORM.
- Program được gắn tự động khi chọn Course.
- Lớp giữ snapshot.

## 28.5. Bài tập

- Import được DOCX đúng template.
- Trích được ảnh chèn trong Word.
- Preview được câu hỏi.
- Báo lỗi câu sai.
- Import thành nháp.
- Đào tạo xuất bản.
- Bài tập tự giao sau khi giáo viên đánh dấu đã dạy.
- Học viên làm được bài.
- Phụ huynh chỉ thấy trạng thái và tổng quan.

## 28.6. Lớp và lịch

- Tạo lớp theo Course.
- Tự sinh lịch đủ số buổi.
- Đổi số buổi/tuần và preview lịch mới.
- Không thay đổi buổi đã hoàn thành.
- Đổi ngày, giờ, giáo viên, phòng.
- Gửi thông báo.
- Dropdown chỉ hiển thị Enrollment phù hợp.
- `Thêm toàn bộ` hoạt động theo bộ lọc.
- Không vượt sức chứa nếu không có xác nhận.

## 28.7. Giáo viên

- Xem đúng lớp.
- Mở đúng SCORM.
- Điểm danh.
- Nhận xét.
- Upload ảnh.
- Đánh dấu đã dạy.
- Giao bài tự động.
- Gửi đề xuất chỉnh sửa.
- Không sửa/xóa nội dung gốc.

## 28.8. Portal

- Phụ huynh kích hoạt bằng email.
- Chuyển được giữa nhiều con.
- Không lộ Student ID trên URL.
- Không trộn dữ liệu.
- Xem lịch, tiến độ, bài tập, nhận xét, ảnh, học phí, công nợ, học bạ.
- Gửi yêu cầu học bù.
- Học sinh đánh giá giáo viên.
- Phụ huynh làm khảo sát trung tâm.

## 28.9. Học bù

- Hệ thống tìm đúng lớp cùng Course và cùng Program Session.
- Đề xuất lớp học bù liên cơ sở (CS1 ↔ CS2), ưu tiên hiển thị cơ sở con đang học trước.
- Kiểm tra sức chứa và trùng lịch.
- Phụ huynh gửi yêu cầu.
- CRM/Quản lý xác nhận.
- Điểm danh học bù.
- Tiến độ được cập nhật đúng.
- Thống kê riêng số buổi học bù.

## 28.10. Báo cáo

- Báo cáo Lead.
- Báo cáo lớp trải nghiệm.
- Báo cáo học viên.
- Báo cáo lớp.
- Báo cáo đào tạo.
- Báo cáo tài chính/công nợ.
- Báo cáo trung tâm.
- Dữ liệu báo cáo đúng phạm vi vai trò và cơ sở.

---

# 29. Luồng logic cuối cùng đã thống nhất

```text
[Lead từ Messenger/Zalo/Web/Form/Nhập tay/Sale HO bàn giao]
        ↓
[Sale/CRM tiếp nhận và chăm sóc]
        ↓
[Tạo 1..N LeadChild]
        ↓
[Tạo lớp trải nghiệm Robosim 4 buổi]
        ↓
[Sale/CRM xếp LeadChild vào lớp]
        ↓
[Quản lý gán giáo viên/nhân sự]
        ↓
[Giáo viên dạy, điểm danh, nhận xét 4 buổi]
        ↓
[LeadChild = Đã học thử]
        ↓
[Sale tiếp tục tư vấn]
        ↓
[Nếu phụ huynh đang cân nhắc: Sale chuyển Chờ quyết định]
        ↓
[Nếu phụ huynh đồng ý đăng ký]
        ↓
[Nhập hồ sơ Parent + 1..N Student + Enrollment riêng]
        ↓
[Chọn Course → hiện giá → áp dụng ưu đãi]
        ↓
[Chọn thanh toán 1 lần hoặc 2 đợt]
        ↓
[Sale ghi nhận ít nhất đợt 1 hoặc full]
        ↓
[Kiểm tra trùng email/số điện thoại Parent]
        ↓
[Kiểm tra trùng Student]
        ↓
[Nếu chưa có Parent: tạo Parent mới]
[Nếu đã có Parent: gắn vào Parent cũ]
        ↓
[Tạo Student và mã CS-NĂM-RANDOM]
        ↓
[Tạo Enrollment riêng cho từng Student]
        ↓
[Tạo tài khoản Parent và gửi email kích hoạt]
        ↓
[Kế toán xác nhận thực thu]
        ↓
[CRM tạo lớp chính thức và chọn Course]
        ↓
[Hệ thống tự gắn Program của Course]
        ↓
[Sinh Class Program Snapshot + lịch đủ số buổi]
        ↓
[CRM chọn Enrollment chưa có lớp]
        ↓
[Gán giáo viên + học viên vào lớp]
        ↓
[Giáo viên mở SCORM để dạy]
        ↓
[Điểm danh + nhận xét + hình ảnh + đánh dấu đã dạy]
        ↓
[Hệ thống tự giao bài tập]
        ↓
[Học viên làm bài trong profile]
        ↓
[Phụ huynh theo dõi lịch, tiến độ, bài tập, nhận xét, ảnh, học phí, công nợ]
        ↓
[Nếu vắng: hệ thống đề xuất lớp học bù]
        ↓
[Học bạ + đánh giá giáo viên + khảo sát trung tâm]
        ↓
[Báo cáo học tập + lớp học + tài chính + trung tâm]
```

---

# 30. Các quyết định đã chốt

1. LeadChild được dùng trong giai đoạn trước convert.
2. Lớp trải nghiệm là Robosim 4 buổi.
3. Một Lead có nhiều con.
4. Convert bắt buộc có ít nhất một khoản thanh toán được Sale ghi nhận.
5. Mỗi con có Enrollment riêng.
6. Email và số điện thoại phụ huynh đều bắt buộc.
7. Kiểm tra trùng Student theo Parent + tên + ngày sinh.
8. Mã học viên theo cơ sở + năm + random.
9. Course dùng giá chung toàn trung tâm.
10. Thanh toán hai đợt tự tính số còn lại; ngày nhắc dùng X ngày do Sale nhập.
11. Kế toán xác nhận thực thu; Parent chỉ thấy khoản đã xác nhận.
12. Phiếu thu tách riêng theo từng con/Enrollment.
13. Lớp tự nhận Program theo Course.
14. Lịch học tương lai tự tính lại khi thay đổi lịch lặp.
15. Import bài tập bằng Word DOCX có ảnh nhúng.
16. Bài tập gốc chỉ do Đào tạo CRUD.
17. SCORM chỉ dùng cho giáo viên dạy trên web.
18. Không tracking SCORM theo học viên.
19. Học bù do hệ thống đề xuất, Parent yêu cầu, CRM/Quản lý xác nhận.
20. Satacoin để pending.
21. Một tài khoản Parent, chuyển profile giữa các con.
22. Giáo viên và CRM/Sale phụ trách lớp được upload ảnh.
23. Học bạ theo Course/Enrollment.
24. Học sinh đánh giá giáo viên.
25. Phụ huynh khảo sát trung tâm.
26. Toàn bộ phạm vi LMS, lớp học và học viên phải hoàn thiện trước khi go-live.
27. Học viên đánh giá giáo viên; phụ huynh khảo sát trung tâm; cả hai dùng form builder do Admin cấu hình câu hỏi và phương án trả lời.
28. SLA chăm sóc Lead 24 giờ (cấu hình được).
29. Form convert bắt buộc xử lý cờ đồng ý sử dụng hình ảnh học viên; Sale trao đổi với phụ huynh trước khi tick; có audit log.
30. SCORM bổ sung làm mờ khi phát hiện hành vi quay/chụp màn hình và watermark động, trong giới hạn trình duyệt web hỗ trợ.
31. Học bù cho phép liên cơ sở (CS1 ↔ CS2); danh sách đề xuất ưu tiên cơ sở con đang học trước. (TGĐ xác nhận lần cuối 12/06/2026.)
32. Satacoin pending (TGĐ xác nhận lần cuối 12/06/2026); schema cấu hình điểm thiết kế sẵn để kích hoạt nhanh.
33. Template Word của skill AI tạo bài tập phải đồng bộ với template import tại Mục 13.4.
