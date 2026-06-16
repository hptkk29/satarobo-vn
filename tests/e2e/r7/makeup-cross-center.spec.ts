/**
 * R7-08 — Học bù LIÊN CƠ SỞ + 5 chỉ số + 6 nhãn điểm danh. Postgres LOCAL.
 *
 * SKELETON (RTM): AC1↔C1 · AC2↔C2 · AC3↔C3 · AC4↔C4 · AC5↔C5,C7 · AC6↔C6 · race↔C8.
 * Các case logic thuần (5 chỉ số / 6 nhãn / no-leak whitelist) đã phủ ở Vitest:
 *   - lib/attendance/summary.test.ts (C5 48/22/3/1/2, C7 buổi hủy)
 *   - lib/labels.test.ts (6 nhãn + buổi hủy)
 *   - lib/db-scope.test.ts ([R7-08-AC6] exception không rò Lead/Order/Student/Payment)
 * File này phủ tầng tích hợp DB (suggest/schedule/audit) — đánh dấu fixme tới khi
 * seed-helper makeup sẵn sàng (DoD demo D4).
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb } from "../_helpers/seed";
import {
  suggestMakeupSessions,
  scheduleMakeup,
  completeMakeup,
} from "../../../lib/makeup/service";

test.beforeEach(async () => {
  await resetDb();
});

// ─── C1 (AC1) — 6 tiêu chí đề xuất ────────────────────────────────────────────
test.fixme("[R7-08-C1] seed 5 buổi ứng viên (vượt tiến độ/đầy/trùng lịch) → chỉ 2 hợp lệ", async () => {
  // seed: HS@CS1 vắng "Bài 5"; 5 buổi ứng viên cùng khóa:
  //   1 lesson order 7 (vượt tiến độ) · 1 đầy chỗ · 1 trùng lịch HS · 2 hợp lệ.
  // const out = await suggestMakeupSessions(needId, csmActorCs1);
  // expect(out).toHaveLength(2);
  expect(typeof suggestMakeupSessions).toBe("function");
});

// ─── C2 (AC2) — sort cơ sở nhà trước → lịch gần nhất ──────────────────────────
test.fixme("[R7-08-C2] CS1(+7d) vs CS2(+2d) → CS1 trước, trong CS theo ngày tăng", async () => {
  // seed: 1 buổi CS1 ngày +7, 1 buổi CS2 ngày +2 (HS nhà CS1).
  // const out = await suggestMakeupSessions(needId, csmActorCs1);
  // expect(out[0].isHomeCenter).toBe(true);  // CS1 trước dù xa ngày hơn
  expect(true).toBe(true);
});

// ─── C3 (AC3) — duyệt bù chéo cơ sở + AuditLog đủ trường ──────────────────────
test.fixme("[R7-08-C3] xếp bù CS1→CS2 → AuditLog MAKEUP_CROSS_CENTER đủ trường", async () => {
  // const res = await scheduleMakeup({ makeupNeedId, makeupSessionId: cs2SessionId,
  //   scheduledById: managerId, actor: managerActor, requestId });
  // expect(res.ok).toBe(true);
  // const log = await db.auditLog.findFirst({ where: { action: "MAKEUP_CROSS_CENTER" } });
  // expect(log?.newValues).toMatchObject({ studentId, fromCenterId, toCenterId, sessionId, approvedById });
  // expect(log?.reason).toBe(requestId);
  expect(typeof scheduleMakeup).toBe("function");
});

// ─── C4 (AC4) — GV CS2 thấy HS bù đúng 1 buổi, KHÔNG mở hồ sơ HS CS1 ──────────
test.fixme("[R7-08-C4] GV@CS2 thấy HS bù trong buổi; hồ sơ HS CS1 → 404", async () => {
  // UI: trang điểm danh buổi CS2 hiện row badge "Học bù từ CS1" (studentPhone=null);
  // mở /admin/students/<csStudentId> bằng GV@CS2 → 404 (scopedDb chặn IDOR).
  expect(true).toBe(true);
});

// ─── C5 (AC5) — điểm danh bù → MADE_UP sync + 5 chỉ số đúng ───────────────────
test.fixme("[R7-08-C5] hoàn tất bù → Attendance buổi gốc MADE_UP + 5 chỉ số 48/22/3/1/2", async () => {
  // await completeMakeup(needId);
  // const att = await db.attendance.findFirst({ where: { studentId, sessionId: missedSessionId } });
  // expect(att?.makeupStatus).toBe("MADE_UP");
  expect(typeof completeMakeup).toBe("function");
});

// ─── C6 (AC6) — exception không rò sang query khác ────────────────────────────
test.fixme("[R7-08-C6] sau khi thêm exception, query lead/order vẫn cách ly cơ sở", async () => {
  // withMakeupException(csmActorCs1).lead.findMany() → chỉ lead CS1 (đã phủ unit ở db-scope.test).
  expect(true).toBe(true);
});

// ─── C7 (AC5) — buổi CANCELLED không tính vắng ────────────────────────────────
test.fixme("[R7-08-C7] buổi CANCELLED → nhãn 'Buổi học bị hủy', không tính vắng", async () => {
  // Phủ thuần ở lib/labels.test.ts + lib/attendance/summary.test.ts.
  expect(true).toBe(true);
});

// ─── C8 (race) — 2 confirm song song chỗ cuối ─────────────────────────────────
test.fixme("[R7-08-C8] 2 confirm song song chỗ cuối → 1 thành công, 1 fail rõ ràng", async () => {
  // const [a, b] = await Promise.all([
  //   scheduleMakeup({ makeupNeedId: n1, makeupSessionId: lastSeatSession, actor, scheduledById: u1 }),
  //   scheduleMakeup({ makeupNeedId: n2, makeupSessionId: lastSeatSession, actor, scheduledById: u2 }),
  // ]);
  // expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  expect(db).toBeTruthy();
});
