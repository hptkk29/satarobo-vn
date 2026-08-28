-- G.2 (SL-08 · SL-09 · SL-09b · SL-10) + C.6.10 (LeadTarget) + B.8 (CostCategory/CostEntry)
--
-- 🔴 ADDITIVE TOÀN BỘ — không DROP, không RENAME, không đổi kiểu cột nào đang có dữ liệu.
-- Luật cứng Nền Hệ thống #4. Trên PROD người vận hành chạy tay; trên DEV/test thì
-- "prisma migrate deploy" chạy được không cần can thiệp.
--
-- ⚠️ CỐ Ý KHÔNG dùng SQL do "prisma migrate diff" sinh ra: bản diff kéo theo DRIFT CÓ SẴN
-- giữa thư mục migrations và schema (DROP INDEX "OrgUnit_path_idx", DROP COLUMN
-- "ScopeShadowDiff"."dataScope", và ~12 lệnh đổi TIMESTAMPTZ(6) thành TIMESTAMP(3)).
-- Những lệnh đó KHÔNG thuộc story này và có lệnh phá dữ liệu ⇒ file này viết tay, chỉ
-- giữ phần thêm mới. Drift kia là nợ riêng, xử ở ticket riêng.
--
-- Mọi lệnh đều IF NOT EXISTS để chạy lại được (idempotent).

-- ── SL-09: enum phễu theo TỪNG CON. Không tái dùng "LeadStatus" (15 giá trị, cấp PH).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeadChildStatus') THEN
    CREATE TYPE "LeadChildStatus" AS ENUM ('NEW', 'CONSULTING', 'TRIAL_SCHEDULED', 'TRIAL_ATTENDED', 'ENROLLED', 'LOST');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CostEntryStatus') THEN
    CREATE TYPE "CostEntryStatus" AS ENUM ('DRAFT', 'APPROVED', 'VOID');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CostEntrySource') THEN
    CREATE TYPE "CostEntrySource" AS ENUM ('MANUAL', 'IMPORT', 'ADS_SYNC');
  END IF;
END $$;

-- ── SL-08 + SL-09 — LeadChild
ALTER TABLE "LeadChild" ADD COLUMN IF NOT EXISTS "centerId" TEXT;
ALTER TABLE "LeadChild" ADD COLUMN IF NOT EXISTS "orgUnitId" TEXT;
ALTER TABLE "LeadChild" ADD COLUMN IF NOT EXISTS "status" "LeadChildStatus" NOT NULL DEFAULT 'NEW';
ALTER TABLE "LeadChild" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMPTZ(6);
ALTER TABLE "LeadChild" ADD COLUMN IF NOT EXISTS "contractValue" INTEGER;

-- Backfill cơ sở từ Lead cha. Cách ly cũ (gián tiếp qua Lead) và cách ly mới (trực tiếp)
-- phải cho CÙNG kết quả ngay từ dòng đầu, nếu không thì bật SCOPED_MODELS là con của
-- CS2 biến mất khỏi màn CS2.
UPDATE "LeadChild" lc
SET "centerId" = l."centerId"
FROM "Lead" l
WHERE l.id = lc."leadId" AND lc."centerId" IS NULL AND l."centerId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "LeadChild_centerId_createdAt_idx" ON "LeadChild"("centerId", "createdAt");
CREATE INDEX IF NOT EXISTS "LeadChild_status_idx" ON "LeadChild"("status");
CREATE INDEX IF NOT EXISTS "LeadChild_orgUnitId_idx" ON "LeadChild"("orgUnitId");

-- ── SL-09b — Order gắn LeadChild (một đơn – một con)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "leadChildId" TEXT;
CREATE INDEX IF NOT EXISTS "Order_leadChildId_idx" ON "Order"("leadChildId");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_leadChildId_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_leadChildId_fkey"
      FOREIGN KEY ("leadChildId") REFERENCES "LeadChild"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill đơn cũ CHỈ khi lead có ĐÚNG MỘT con (A-nen-tang §10.3 SL-09b).
-- Lead nhiều con để NULL — báo cáo C-03 phải hiện dòng "chưa quy được về con" chứ
-- không được đoán. Đoán ở đây là gán tiền cho nhầm đứa trẻ.
UPDATE "Order" o
SET "leadChildId" = sub."childId"
FROM (
  SELECT lc."leadId", min(lc.id) AS "childId"
  FROM "LeadChild" lc
  GROUP BY lc."leadId"
  HAVING count(*) = 1
) sub
WHERE o."leadId" = sub."leadId" AND o."leadChildId" IS NULL;

-- ── SL-10 — Lead: lý do rớt (ô ghi chú tự do) + mốc rớt
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lostNote" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lostAt" TIMESTAMPTZ(6);

-- ── C.6.10 — LeadTarget (centerId NULL = chỉ tiêu TOÀN HỆ THỐNG)
CREATE TABLE IF NOT EXISTS "LeadTarget" (
  "id"          TEXT NOT NULL,
  "centerId"    TEXT,
  "orgUnitId"   TEXT,
  "period"      TEXT NOT NULL,
  "targetCount" INTEGER NOT NULL,
  "note"        TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "LeadTarget_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LeadTarget_period_idx" ON "LeadTarget"("period");
CREATE INDEX IF NOT EXISTS "LeadTarget_orgUnitId_idx" ON "LeadTarget"("orgUnitId");
-- ⚠️ Postgres coi NULL là DISTINCT ⇒ ràng buộc này KHÔNG chặn hai dòng toàn hệ thống
-- cùng kỳ. Đường ghi phải findFirst + create/update tay (xem chú thích trong schema).
CREATE UNIQUE INDEX IF NOT EXISTS "LeadTarget_centerId_period_key" ON "LeadTarget"("centerId", "period");

-- ── B.8 — sổ chi phí
CREATE TABLE IF NOT EXISTS "CostCategory" (
  "id"           TEXT NOT NULL,
  "code"         TEXT NOT NULL,
  "label"        TEXT NOT NULL,
  "isSystemFed"  BOOLEAN NOT NULL DEFAULT false,
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "CostCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CostCategory_code_key" ON "CostCategory"("code");
CREATE INDEX IF NOT EXISTS "CostCategory_isActive_displayOrder_idx" ON "CostCategory"("isActive", "displayOrder");

CREATE TABLE IF NOT EXISTS "CostEntry" (
  "id"           TEXT NOT NULL,
  "centerId"     TEXT,
  "orgUnitId"    TEXT,
  "categoryId"   TEXT NOT NULL,
  "spentDate"    DATE NOT NULL,
  "amount"       INTEGER NOT NULL,
  "vendor"       TEXT,
  "note"         TEXT,
  "evidenceUrl"  TEXT,
  "status"       "CostEntryStatus" NOT NULL DEFAULT 'DRAFT',
  "source"       "CostEntrySource" NOT NULL DEFAULT 'MANUAL',
  "dedupeKey"    TEXT,
  "createdById"  TEXT,
  "approvedById" TEXT,
  "approvedAt"   TIMESTAMPTZ(6),
  "createdAt"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMPTZ(6) NOT NULL,
  "deletedAt"    TIMESTAMPTZ(6),
  CONSTRAINT "CostEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CostEntry_dedupeKey_key" ON "CostEntry"("dedupeKey");
CREATE INDEX IF NOT EXISTS "CostEntry_centerId_spentDate_idx" ON "CostEntry"("centerId", "spentDate");
CREATE INDEX IF NOT EXISTS "CostEntry_status_spentDate_idx" ON "CostEntry"("status", "spentDate");
CREATE INDEX IF NOT EXISTS "CostEntry_categoryId_idx" ON "CostEntry"("categoryId");
CREATE INDEX IF NOT EXISTS "CostEntry_orgUnitId_idx" ON "CostEntry"("orgUnitId");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CostEntry_categoryId_fkey') THEN
    ALTER TABLE "CostEntry" ADD CONSTRAINT "CostEntry_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "CostCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
