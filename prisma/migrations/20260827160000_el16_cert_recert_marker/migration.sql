-- EL-16 — cột `recertAssignedAt` + chỉ mục cho nhánh giao lại vòng tái chứng nhận.
--
-- Vì sao cần: không có cột này thì cửa sổ quét của cron KHÔNG BAO GIỜ DRAIN. Nhánh
-- "giao lại" quét `status = EXPIRED` với `take 200` sắp theo hạn cũ nhất; chứng nhận
-- hết hạn thì `EXPIRED` vĩnh viễn, nên sau khi tích đủ 200 bản đã xử lý xong chúng
-- chiếm trọn mỗi lượt quét và bản vừa hết hạn không tới lượt. Cron vẫn chạy, vẫn báo
-- 0 lỗi. Đúng lỗi này đã xảy ra một lần ở EL-15d — không dựng lại nó.
--
-- ⚠️ CHỈ ADD, và bảng vẫn RỖNG trên prod (hai migration EL-16 trước chưa chạy tay).
-- Các dòng trôi dạt có sẵn của kho đã lọc bỏ.

-- AlterTable
ALTER TABLE "TrnCertificate" ADD COLUMN     "recertAssignedAt" TIMESTAMPTZ(6);


-- CreateIndex
CREATE INDEX "TrnCertificate_status_recertAssignedAt_idx" ON "TrnCertificate"("status", "recertAssignedAt");

