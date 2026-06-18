-- LMS-15 / W5c — ConversationMessage: nhắn 2 chiều PH↔GV theo enrollment.

CREATE TYPE "ConversationSide" AS ENUM ('PARENT', 'STAFF');

CREATE TABLE "ConversationMessage" (
  "id"             TEXT NOT NULL,
  "enrollmentId"   TEXT NOT NULL,
  "authorUserId"   TEXT NOT NULL,
  "authorSide"     "ConversationSide" NOT NULL,
  "body"           TEXT NOT NULL,
  "createdAt"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readByParentAt" TIMESTAMPTZ(6),
  "readByStaffAt"  TIMESTAMPTZ(6),
  CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConversationMessage_enrollmentId_createdAt_idx" ON "ConversationMessage"("enrollmentId", "createdAt");

ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FIX-C1 — RLS cho bảng mới.
ALTER TABLE "ConversationMessage" ENABLE ROW LEVEL SECURITY;
