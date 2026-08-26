-- Đợt D (vá 26/08/2026) — TÁCH điểm xuất phát ra khỏi số lượt đã nhận.
--
-- LỖI ĐANG VÁ: `takeRotationTurns` chỉ tạo dòng khi ai đó THẮNG. Người có mặt
-- trong vòng từ đầu nhưng chưa thắng lần nào thì chưa có dòng, nên lúc thắng lần
-- đầu bị xử như "người mới gia nhập" và được cộng khống `seedTurnsForNewcomer`:
--
--   lượt 1: chưa ai có dòng → seed 0 → r1 thắng → sổ r1 = 1
--   lượt 2: seed = min(r1) = 1   → r2 thắng → sổ r2 = 1+1 = 2   ← nhận 1, sổ ghi 2
--   lượt 3: seed = 1             → r3 thắng → sổ r3 = 2         ← nhận 1, sổ ghi 2
--
-- Đo được trên Postgres local: 30 lead/3 sale → sổ 32 (10/11/11); 6 lead → [2,3,3];
-- 20 lượt gọi thẳng → 22. Việc CHIA vẫn đúng (10/10/10) — sai là ở SỔ, và sổ chính
-- là thứ trang /admin/leads/so-luot dựng ra để người ta hết nghi thiên vị.
--
-- THUẦN THÊM MỚI: một cột mới, DEFAULT 0, không đụng cột nào đang có dữ liệu
-- (luật cứng Nền Hệ thống #4 — vẫn phải Dev chạy tay trên PROD). Quay lui =
-- DROP COLUMN, không mất gì khác.
--
-- ⚠️ KHÔNG BACKFILL dòng cũ. Phần cộng khống đã hoà vào `turns` của các dòng có
-- trước bản vá và KHÔNG suy ngược được (không có sổ nào ghi lại từng lượt). Để
-- `seedTurns = 0` cho dòng cũ nghĩa là: vị trí trong vòng (`seedTurns + turns`)
-- GIỮ NGUYÊN như hôm nay ⇒ apply migration này KHÔNG làm xáo trộn thứ tự chia
-- đang chạy. Chỉ các dòng sinh RA SAU mới có sổ sạch.

ALTER TABLE "LeadRotationTurn"
  ADD COLUMN IF NOT EXISTS "seedTurns" INTEGER NOT NULL DEFAULT 0;
