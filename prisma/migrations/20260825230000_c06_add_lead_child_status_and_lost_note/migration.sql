-- C-06 — đánh dấu RỚT: trạng thái theo TỪNG CON, lý do ở cấp PHỤ HUYNH.
--
-- Migration ADD-ONLY (luật cứng #4): một enum MỚI + ba cột NULLABLE mới. Không đổi
-- kiểu, không bỏ, không đặt NOT NULL trên bảng đang có dữ liệu prod.
--
-- Vì sao "LeadChild"."status" KHÔNG có DEFAULT 'NEW': đặt default là ghi đè một khẳng
-- định lên toàn bộ dòng cũ ("mọi đứa trẻ đang có đều ở bước Mới"), trong khi phần lớn
-- chúng đã ghi danh hoặc đã nghỉ từ lâu. NULL = "chưa ai phân loại" — đọc ra là biết
-- mình không biết, thay vì đọc ra một con số sai mà không ai ngờ.
--
-- Tầng của lý do rớt là quyết định B5 (24/08/2026): TRẠNG THÁI rớt theo từng con,
-- LÝ DO rớt (ô ghi chú tự do — quyết định 12(b), không danh mục) ở cấp phụ huynh.

-- CreateEnum
CREATE TYPE "LeadChildStatus" AS ENUM ('NEW', 'CONSULTING', 'TRIAL_SCHEDULED', 'TRIAL_ATTENDED', 'ENROLLED', 'LOST');

-- AlterTable
ALTER TABLE "LeadChild" ADD COLUMN     "status" "LeadChildStatus";

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "lostNote" TEXT,
ADD COLUMN     "lostAt" TIMESTAMPTZ(6);
