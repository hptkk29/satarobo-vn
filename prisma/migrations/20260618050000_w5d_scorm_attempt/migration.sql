-- LMS-14 / W5d — ScormAttempt: theo dõi GV hoàn thành GIẢNG tài liệu SCORM (delivery).
-- learner = GV/staff, KHÔNG phải HV. Lưu cmi runtime để resume + ghi nhận đã giảng.

CREATE TYPE "ScormCompletion" AS ENUM ('NOT_ATTEMPTED', 'INCOMPLETE', 'COMPLETED', 'PASSED', 'FAILED', 'BROWSED');

CREATE TABLE "ScormAttempt" (
  "id"             TEXT NOT NULL,
  "packageId"      TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "classSessionId" TEXT,
  "completion"     "ScormCompletion" NOT NULL DEFAULT 'NOT_ATTEMPTED',
  "scoreRaw"       DOUBLE PRECISION,
  "lessonLocation" TEXT,
  "suspendData"    TEXT,
  "totalTimeSec"   INTEGER NOT NULL DEFAULT 0,
  "sessionCount"   INTEGER NOT NULL DEFAULT 0,
  "lastAccessedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ScormAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScormAttempt_packageId_idx" ON "ScormAttempt"("packageId");
CREATE INDEX "ScormAttempt_userId_idx" ON "ScormAttempt"("userId");
CREATE INDEX "ScormAttempt_classSessionId_idx" ON "ScormAttempt"("classSessionId");

ALTER TABLE "ScormAttempt" ADD CONSTRAINT "ScormAttempt_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ScormPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FIX-C1 — RLS cho bảng mới.
ALTER TABLE "ScormAttempt" ENABLE ROW LEVEL SECURITY;
