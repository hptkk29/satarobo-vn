-- LMS-18 / W5f phase A — thêm centerId denormalized + backfill cho ClassSession/Enrollment/
-- Attendance. ADDITIVE, nullable. CHƯA flip SCOPED_MODELS (3 model vẫn SCOPE_EXEMPT, cách ly
-- qua classId IN scopedClassIds như cũ → KHÔNG đổi hành vi đọc). Phase B (flip) làm sau,
-- có shadow-rollout + e2e cách ly cơ sở.
-- ⚠️ VẬN HÀNH PROD: UPDATE backfill quét toàn bảng (Attendance lớn) → chạy giờ thấp điểm.

-- ── ClassSession.centerId ────────────────────────────────────────────────────
ALTER TABLE "ClassSession" ADD COLUMN "centerId" TEXT;
UPDATE "ClassSession" cs SET "centerId" = c."centerId" FROM "Class" c WHERE cs."classId" = c."id";
CREATE INDEX "ClassSession_centerId_idx" ON "ClassSession"("centerId");

-- ── Enrollment.centerId ──────────────────────────────────────────────────────
ALTER TABLE "Enrollment" ADD COLUMN "centerId" TEXT;
UPDATE "Enrollment" e SET "centerId" = c."centerId" FROM "Class" c WHERE e."classId" = c."id";
CREATE INDEX "Enrollment_centerId_idx" ON "Enrollment"("centerId");

-- ── Attendance.centerId (qua session→class) ──────────────────────────────────
ALTER TABLE "Attendance" ADD COLUMN "centerId" TEXT;
UPDATE "Attendance" a SET "centerId" = c."centerId"
  FROM "ClassSession" cs, "Class" c
  WHERE a."sessionId" = cs."id" AND cs."classId" = c."id";
CREATE INDEX "Attendance_centerId_idx" ON "Attendance"("centerId");
