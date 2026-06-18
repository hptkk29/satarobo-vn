-- W5a — additive schema cho schedule-conflict per-buổi (roomId), skill gắn buổi, thi lại.
-- Tất cả additive; ExamAttempt.attemptNo default 1 nên unique mới giữ với row cũ (mỗi (examId,studentId) vốn unique → (…,1) unique).

-- ── ClassSession.roomId ──────────────────────────────────────────────────────
ALTER TABLE "ClassSession" ADD COLUMN "roomId" TEXT;
CREATE INDEX "ClassSession_roomId_idx" ON "ClassSession"("roomId");
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── StudentSkillAssessment.classSessionId + lessonId ─────────────────────────
ALTER TABLE "StudentSkillAssessment" ADD COLUMN "classSessionId" TEXT;
ALTER TABLE "StudentSkillAssessment" ADD COLUMN "lessonId" TEXT;
CREATE INDEX "StudentSkillAssessment_classSessionId_idx" ON "StudentSkillAssessment"("classSessionId");
ALTER TABLE "StudentSkillAssessment" ADD CONSTRAINT "StudentSkillAssessment_classSessionId_fkey" FOREIGN KEY ("classSessionId") REFERENCES "ClassSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentSkillAssessment" ADD CONSTRAINT "StudentSkillAssessment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── ExamAttempt.attemptNo + đổi unique (thi lại) ─────────────────────────────
ALTER TABLE "ExamAttempt" ADD COLUMN "attemptNo" INTEGER NOT NULL DEFAULT 1;
DROP INDEX "ExamAttempt_examId_studentId_key";
CREATE UNIQUE INDEX "ExamAttempt_examId_studentId_attemptNo_key" ON "ExamAttempt"("examId", "studentId", "attemptNo");
