-- W3-1 / W5b — RefundRequest: hoàn tiền theo lifecycle (đề xuất → duyệt → ghi sổ).

CREATE TYPE "RefundTrigger" AS ENUM ('WITHDRAW', 'TRANSFER', 'CLASS_CANCELLED', 'MANUAL');
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID');

CREATE TABLE "RefundRequest" (
  "id"              TEXT NOT NULL,
  "enrollmentId"    TEXT NOT NULL,
  "centerId"        TEXT,
  "trigger"         "RefundTrigger" NOT NULL,
  "reason"          TEXT NOT NULL,
  "paidConfirmed"   INTEGER NOT NULL,
  "sessionsTotal"   INTEGER NOT NULL,
  "sessionsLearned" INTEGER NOT NULL,
  "unitPrice"       INTEGER NOT NULL,
  "proposedAmount"  INTEGER NOT NULL,
  "approvedAmount"  INTEGER,
  "status"          "RefundStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById"   TEXT,
  "approvedById"    TEXT,
  "approvedAt"      TIMESTAMPTZ(6),
  "note"            TEXT,
  "createdAt"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RefundRequest_enrollmentId_idx" ON "RefundRequest"("enrollmentId");
CREATE INDEX "RefundRequest_status_idx" ON "RefundRequest"("status");
CREATE INDEX "RefundRequest_centerId_idx" ON "RefundRequest"("centerId");

ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FIX-C1 — bật RLS cho bảng mới (đồng nhất erd-fix; Prisma owner không bị chặn).
ALTER TABLE "RefundRequest" ENABLE ROW LEVEL SECURITY;
