// Allowlist tiền tố `dedupeKey` — loại thông báo nào được rung điện thoại nhân viên.
// THUẦN, không DB.

import { describe, expect, it } from "vitest";
import { duocDayPush, TIEN_TO_DUOC_DAY } from "./allowlist";

describe("[PUSH-D4-T10] allowlist tiền tố", () => {
  it("đợt này ĐÚNG một tiền tố: lead.moi:", () => {
    // Ca này là một cái CHỐT, không phải phép lặp lại hằng số: thêm một tiền tố là quyết định
    // vận hành (một loại thông báo mới bắt đầu rung máy của người ta), nên nó phải làm đỏ một
    // test và buộc người thêm đọc chú thích ở `allowlist.ts` trước khi sửa dòng này.
    expect(TIEN_TO_DUOC_DAY).toEqual(["lead.moi:"]);
  });

  it("lead.moi:<id> ⇒ được đẩy", () => {
    expect(duocDayPush("lead.moi:clx123")).toBe(true);
  });

  it("lead.nhap_lai: ⇒ KHÔNG — khoá của nó có Date.now(), 10 lần điền form là 10 lần rung máy", () => {
    expect(duocDayPush("lead.nhap_lai:clx123:1757325600000")).toBe(false);
  });

  it("lead.pool_rong: ⇒ KHÔNG, dù cùng họ `lead.`", () => {
    // Khớp phải theo TIỀN TỐ đầy đủ. Nếu ai đó nới thành `startsWith("lead.")` thì cả ba loại
    // lead cùng lọt, gồm loại không có trần ở trên.
    expect(duocDayPush("lead.pool_rong:cs1")).toBe(false);
  });

  it("dấu hai chấm là BẮT BUỘC — `lead.moi_gi_do` không được lọt", () => {
    // Bỏ dấu hai chấm là khớp cả những khoá chỉ tình cờ bắt đầu giống nhau, và luật khớp sẽ
    // lệch với `lib/notifications/catalog.ts` (cũng khoá theo tiền tố CÓ dấu hai chấm) — hai
    // bảng cùng đọc một khoá mà luật khớp khác nhau là loại lệch không ai nhìn thấy.
    expect(duocDayPush("lead.moi_gi_do:x")).toBe(false);
    expect(duocDayPush("lead.moi")).toBe(false);
  });

  it("mọi loại khác đang chạy thật ⇒ KHÔNG", () => {
    for (const k of [
      "sla:SLA-1:lead1",
      "shift.brief:u1:2026-09-08",
      "conversation.message_posted:c1",
      "attendance.edited:s1",
      "trial.assigned:t1",
      "session.close-reminder:s1",
      "el.done:e1",
      "parent_request.created:p1",
    ]) {
      expect(duocDayPush(k), k).toBe(false);
    }
  });

  it("chuỗi rỗng ⇒ KHÔNG, không ném", () => {
    expect(duocDayPush("")).toBe(false);
  });
});
