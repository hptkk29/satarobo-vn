-- EL-16 — khoá ngoại `TrnCertificate.enrollmentId` → `TrnEnrollment.id`.
--
-- `onDelete: Restrict` là điểm chính, không phải phần trang trí: xoá một lượt ghi
-- danh đã sinh chứng nhận là làm mồ côi một chứng từ đã phát ra tay người ta và đã
-- có người ngoài quét QR để kiểm. Chặn cứng ở DB chứ không trông vào việc mã gọi nhớ
-- kiểm — `TrnSubmission.enrollmentId` không có khoá ngoại và đó là một khoản nợ đã
-- ghi nhận; không nhân thêm cái thứ hai.
--
-- ⚠️ CHỈ ADD, và bảng đích là bảng RỖNG vừa tạo ở migration trước — thêm ràng buộc
-- không thể vướng dữ liệu sẵn có. Các dòng trôi dạt có sẵn của kho đã lọc bỏ.

-- AddForeignKey
ALTER TABLE "TrnCertificate" ADD CONSTRAINT "TrnCertificate_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "TrnEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

