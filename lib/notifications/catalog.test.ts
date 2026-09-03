import { describe, it, expect } from "vitest";
import {
  classifyNotification,
  catalogPrefixes,
  isNotiGroupKey,
  notiGroupLabel,
  NOTI_GROUPS,
} from "./catalog";
import { PENDING_SYNC_TYPES, pendingSyncKey } from "./pending-sync";

// Danh sách này là ẢNH CHỤP mọi dedupeKey đang được sinh thật trong repo (audit 19/08/2026).
// Nó tồn tại để bắt đúng một lỗi: thêm nguồn sinh thông báo mới mà quên khai vào catalog ⇒
// thông báo đó rơi về "Hệ thống / P3", nằm chót panel và không ai nhìn thấy.
// Thêm producer mới → thêm một dòng ở đây VÀ một dòng trong catalog.
const KHOA_DANG_CHAY: ReadonlyArray<[key: string, file: string]> = [
  ["class.session_changed:evt1", "lib/_handlers/r7-notifications.ts"],
  ["class.cancelled:evt1", "lib/_handlers/r7-notifications.ts"],
  ["lead.trialAttended:lead1", "lib/_handlers/r7-notifications.ts"],
  ["session.taught:s1", "lib/_handlers/r7-lifecycle.ts"],
  ["trial.assigned:te1", "lib/_handlers/trial-notif.ts"],
  ["trial.schedule_changed:t1:2026-08-19T00:00:00.000Z", "lib/_handlers/trial-schedule-notif.ts"],
  ["trial.evaluated:te1:ts1", "lib/_handlers/trial-eval-notif.ts"],
  // 3 khoá dưới cùng đi qua helper `notifyTrialTeacherAssigned` (lib/trial/service.ts) nhưng
  // dedupeKey do NƠI GỌI dựng — ghi đúng nơi gọi để lần sau còn tìm ra.
  ["trial-v1.assigned:t1", "app/(admin)/admin/trials/actions.ts"],
  ["trial-class.assigned:tc1", "app/(admin)/admin/trial-classes/_actions.ts"],
  ["trial-session.assigned:ts1", "lib/trial/service.ts"],
  ["conversation.message_posted:m1", "lib/_handlers/conversation-notif.ts"],
  ["reserve.expired:r1:2026-08-19", "app/api/cron/reserve-expiry/route.ts"],
  ["reserve-expiry:r1", "lib/students/reserve-expiry.ts"],
  ["payment-reconcile:unmatched:2026-08-19", "app/api/cron/payment-reconcile/route.ts"],
  ["payment-reconcile:overdue-partial:2026-08-19", "app/api/cron/payment-reconcile/route.ts"],
  ["sla:first_touch:lead1", "lib/crm/sla.ts"],
  ["sla:idle24:lead1", "lib/crm/sla.ts"],
  ["cost-unconfirmed:2026-08", "lib/crm/marketing-alerts.ts"],
  ["report-missing:2026-08", "lib/crm/marketing-alerts.ts"],
  ["session.substitute:s1", "lib/lms/session-teacher-notify.ts"],
  ["session.close-reminder:s1", "lib/lms/session-teacher-notify.ts"],
  ["intake-failing:facebook:2026-08-19-10", "lib/lead/intake/health.ts"],
  ["intake-silent:zalo:2026-08-19", "lib/lead/intake/health.ts"],
  ["parent_request.created:pr1", "lib/portal/parent-request-notify.ts"],
  ["parent_request.reminder:pr1", "lib/portal/parent-request-notify.ts"],
  ["attendance.edited:s1", "lib/notify/attendance.ts"],
  ["birthday:g1", "lib/students/birthday-notify.ts"],
  // GĐ6 — nhắc Sale trước buổi trải nghiệm (2 mốc: 1 ngày và 2 giờ).
  ["trial.reminder:1-ngay:e1:s1", "app/api/cron/trial-reminder/route.ts"],
  ["trial.reminder:2-gio:e1:s1", "app/api/cron/trial-reminder/route.ts"],
];

describe("catalog — phủ hết nguồn sinh đang chạy", () => {
  it.each(KHOA_DANG_CHAY)("%s (%s) đã được khai", (key) => {
    expect(classifyNotification(key).known).toBe(true);
  });

  it("cả 14 loại việc tồn đều được khai, cả pending lẫn overdue", () => {
    for (const type of PENDING_SYNC_TYPES) {
      expect(classifyNotification(pendingSyncKey(type, "pending")).known).toBe(true);
      expect(classifyNotification(pendingSyncKey(type, "overdue")).known).toBe(true);
    }
  });

  it("khoá lạ rơi về Hệ thống/P3 và được đánh dấu chưa khai", () => {
    const r = classifyNotification("mot-thu-chua-tung-co:x");
    expect(r.known).toBe(false);
    expect(r.groupKey).toBe("system");
    expect(r.priority).toBe(3);
  });
});

describe("catalog — nhóm và mức", () => {
  it("mọi khai báo trả về nhóm hợp lệ và mức trong 1..3", () => {
    for (const [key] of KHOA_DANG_CHAY) {
      const r = classifyNotification(key);
      expect(isNotiGroupKey(r.groupKey)).toBe(true);
      expect([1, 2, 3]).toContain(r.priority);
    }
  });

  it("tin nhắn phụ huynh vào đúng nhóm parent_message", () => {
    expect(classifyNotification("conversation.message_posted:m1").groupKey).toBe("parent_message");
  });

  it("nhắc chốt buổi là Đến hạn mức khẩn", () => {
    const r = classifyNotification("session.close-reminder:s1");
    expect(r.groupKey).toBe("due_date");
    expect(r.priority).toBe(1);
  });

  it("điểm danh bị sửa hồi tố là việc phải làm, không phải tin tham khảo", () => {
    expect(classifyNotification("attendance.edited:s1").groupKey).toBe("action_required");
  });

  it("sinh nhật học viên là nhóm Hệ thống mức thấp — không được chen lên trên việc gấp", () => {
    expect(classifyNotification("birthday:g1").priority).toBe(3);
  });
});

describe("catalog — quy tắc nâng mức khi quá hạn", () => {
  it(":overdue của việc tồn luôn lên P1 dù mức khai là P2/P3", () => {
    // student_birthday khai P3, renewal khai P2 — cả hai phải thành P1 khi quá hạn.
    expect(classifyNotification("student_birthday:pending").priority).toBe(3);
    expect(classifyNotification("student_birthday:overdue").priority).toBe(1);
    expect(classifyNotification("renewal:pending").priority).toBe(2);
    expect(classifyNotification("renewal:overdue").priority).toBe(1);
  });

  it("nhóm KHÔNG đổi khi quá hạn — chỉ mức đổi", () => {
    expect(classifyNotification("student_care:overdue").groupKey).toBe("new_task");
    expect(classifyNotification("student_care:pending").groupKey).toBe("new_task");
  });

  it("khoá sự kiện kết thúc bằng ':overdue' KHÔNG bị nâng oan (không thuộc vòng việc tồn)", () => {
    // Không có loại việc nào tên "sla:first_touch" nên đây không phải khoá việc tồn.
    expect(classifyNotification("sla:first_touch:overdue").priority).toBe(1); // vốn đã P1 theo khai báo
    expect(classifyNotification("birthday:overdue").priority).toBe(3); // vẫn P3, không bị nâng
  });
});

describe("catalog — khớp tiền tố dài nhất", () => {
  it("payment-reconcile:unmatched: không bị nuốt bởi tiền tố ngắn hơn", () => {
    expect(classifyNotification("payment-reconcile:unmatched:2026-08-19").entityType).toBe("payment");
  });

  it("danh sách tiền tố được sắp dài trước", () => {
    const p = catalogPrefixes();
    for (let i = 1; i < p.length; i++) {
      expect(p[i - 1]!.length).toBeGreaterThanOrEqual(p[i]!.length);
    }
  });
});

describe("catalog — 5 nhóm theo PRD", () => {
  it("đúng 5 nhóm, đúng thứ tự hiển thị", () => {
    expect(NOTI_GROUPS.map((g) => g.key)).toEqual([
      "action_required",
      "parent_message",
      "new_task",
      "due_date",
      "system",
    ]);
  });

  it("nhãn tiếng Việt tra được, nhóm lạ trả 'Khác'", () => {
    expect(notiGroupLabel("parent_message")).toBe("Tin nhắn PH");
    expect(notiGroupLabel("khong_co")).toBe("Khác");
  });
});
