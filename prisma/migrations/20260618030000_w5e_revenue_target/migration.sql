-- LMS-16 / W5e — RevenueTarget: mục tiêu doanh thu theo kỳ (báo cáo doanh-thu-vs-mục-tiêu).

CREATE TABLE "RevenueTarget" (
  "id"           TEXT NOT NULL,
  "centerId"     TEXT,
  "period"       TEXT NOT NULL,
  "targetAmount" INTEGER NOT NULL,
  "note"         TEXT,
  "createdById"  TEXT,
  "createdAt"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "RevenueTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RevenueTarget_centerId_period_key" ON "RevenueTarget"("centerId", "period");
CREATE INDEX "RevenueTarget_centerId_idx" ON "RevenueTarget"("centerId");

ALTER TABLE "RevenueTarget" ENABLE ROW LEVEL SECURITY;
