-- SL-01 (docs/prd/A-nen-tang.md §10.1 · OQ-5 chốt 24/08/2026) — ghi NGUỒN GỐC của dòng
-- `UserOrgRole`: "AUTO" (do `reconcileUserOrgRoles` suy từ bảng ánh xạ vai↔đơn vị) hay
-- "MANUAL" (người gán tay ở /admin/users/[id]/org-roles).
--
-- VÌ SAO GẤP: trên prod ĐANG có cấu hình QLCS đa cơ sở gán tay. Hôm nay reconcile phân biệt
-- máy-sinh với gán-tay bằng cách SUY LẠI `prevPlan` từ MỘT đơn vị neo — suy luận, không phải
-- bằng chứng. Khi đơn vị neo cũ trùng đúng cơ sở được gán tay, dòng gán tay bị `EXPIRED` bởi
-- một thao tác KHÔNG nhằm thu hồi quyền (chỉ sửa ô "Đơn vị" ở `users/_actions.ts:363-380`
-- hoặc `nhan-su/actions.ts:377`). Cột này biến suy luận thành bằng chứng.
--
-- THUẦN THÊM CỘT trên bảng đang có dữ liệu PROD. KHÔNG đổi kiểu, KHÔNG bỏ cột, KHÔNG
-- RENAME (luật cứng Nền Hệ thống #4). Cột nullable + có DEFAULT ⇒ code CŨ đang chạy song
-- song vẫn INSERT được, không cần dừng app; rollback = bỏ đọc cột, không cần migration ngược.
--
-- VÌ SAO `VARCHAR(16)` CHỨ KHÔNG PHẢI `CREATE TYPE ... AS ENUM`: miền giá trị được ép bằng
-- CHECK constraint ở khối (3) — cùng khuôn với `20260617040000_check_constraints`. Đổi lại
-- được hai thứ: (a) không phải khai thêm một khối `enum` trong `schema.prisma` (giữ diff
-- đúng trong model `UserOrgRole`), (b) `ALTER TYPE ... ADD VALUE` sau này là thao tác KHÔNG
-- đảo ngược được của Postgres, còn nới CHECK thì chỉ là DROP + ADD constraint. Muốn siết
-- thành enum thật thì làm ở phase sau, additive.
--
-- MỌI KHỐI ĐỀU IDEMPOTENT (chạy lại phải no-op, không được fail): DB dev dùng chung nhiều
-- nhánh và có thể đã được áp bằng `prisma db execute` trước khi `migrate deploy` ghi nhận
-- migration này — cùng lý do đã ghi ở `20260808183000` / `20260809120000` / `20260811020000`.
--
-- ⚠️ NGƯỜI VẬN HÀNH CHẠY TAY, SAU DRY-RUN (luật cứng Nền #4). Agent KHÔNG chạy migration.

-- (1) Thêm cột. Nullable + DEFAULT 'AUTO'.
--     `null` KHÔNG phải giá trị chết: `lib/auth/org-role-sync.ts` đối xử với nó NHƯ "AUTO"
--     (tương thích ngược cho dòng sinh trước migration này, và cho bất kỳ đường ghi SQL thô
--     nào set null tường minh). Không lọc cứng `source = 'AUTO'` ở tầng DB, vì dòng null sẽ
--     trượt khỏi bộ lọc và không bao giờ thu hồi được nữa — quyền kẹt vĩnh viễn.
ALTER TABLE "UserOrgRole"
  ADD COLUMN IF NOT EXISTS "source" VARCHAR(16) DEFAULT 'AUTO';

-- (2) Backfill dòng cũ về 'AUTO'.
--     Postgres 11+ đã tự điền DEFAULT cho dòng sẵn có ở bước (1); câu này chỉ để lo ca
--     migration được áp lại trên DB mà cột đã tồn tại ở dạng nullable KHÔNG có default.
--
--     ⚠️ CỐ Ý ĐỂ NGUYÊN "TẤT CẢ = AUTO", KHÔNG ĐOÁN dòng nào là gán tay. Nền AUTO giữ đúng
--     hành vi thu hồi đang có (đổi vai xong là mất quyền cũ — không được làm liệt đường này).
--     Việc đánh dấu 'MANUAL' cho các cấu hình đa cơ sở ĐANG gán tay trên prod là một script
--     backfill RIÊNG, chạy SAU khi đã đo prod theo §6.9 (truy vấn Đ1–Đ4) — thứ tự bắt buộc
--     ghi ở `docs/prd/A-nen-tang.md:508` là: ĐO → SL-01 → BACKFILL. Nhét phỏng đoán vào đây
--     là khoá cứng một quyết định chưa có dữ liệu, trên bảng đang có dữ liệu prod.
UPDATE "UserOrgRole" SET "source" = 'AUTO' WHERE "source" IS NULL;

-- (3) Ép miền giá trị ở tầng DB (thay cho enum). NULL vẫn hợp lệ — xem chú thích khối (1).
--     `NOT VALID` + `VALIDATE` tách đôi để không khoá bảng lâu khi bảng đã lớn; bảng này
--     hiện rất nhỏ nên chỉ là thói quen an toàn, không phải tối ưu cần thiết.
DO $$
BEGIN
  ALTER TABLE "UserOrgRole"
    ADD CONSTRAINT userorgrole_source_domain
    CHECK ("source" IS NULL OR "source" IN ('AUTO', 'MANUAL')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

ALTER TABLE "UserOrgRole" VALIDATE CONSTRAINT userorgrole_source_domain;

-- KHÔNG thêm index: bảng nhỏ, và mọi truy vấn đọc cột này đều đã lọc kèm `userId`
-- (đã có `UserOrgRole_userId_idx`). Thêm index ở đây chỉ là chi phí ghi, không có lợi đọc.
