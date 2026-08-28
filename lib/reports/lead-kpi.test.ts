import { describe, expect, it } from "vitest";
import {
  CLOSED_CHILD_STATUSES,
  CONTACT_ACTIVITY_TYPES,
  describeDurations,
  formatDaysToClose,
  isChildClosed,
  safeRate,
  summariseChildFunnel,
} from "./lead-kpi";
import { CONVERTED_STATUSES } from "./lead";
import { daysBetweenVN, vnMonthKey } from "@/lib/time/vn";

const child = (status: string, closedAt: Date | null) =>
  ({ status, closedAt }) as { status: never; closedAt: Date | null };

describe("§C.6.0 — định nghĩa 'đã chốt'", () => {
  it("[C-KPI-01] đòi CẢ HAI vế: status ENROLLED VÀ closedAt != null", () => {
    expect(isChildClosed(child("ENROLLED", new Date()))).toBe(true);
    // Đây là ca dễ lọt nhất: trạng thái đúng nhưng thiếu mốc ⇒ C3 đếm được mà C4 không
    // trừ được. Nếu ai đó nới hàm này thành "chỉ xét status", test này phải đỏ.
    expect(isChildClosed(child("ENROLLED", null))).toBe(false);
    expect(isChildClosed(child("TRIAL_ATTENDED", new Date()))).toBe(false);
  });

  it("[C-KPI-02] REGISTERED KHÔNG tính là chốt (QĐ B2 24/08)", () => {
    // Enum LeadChildStatus cố ý không có REGISTERED. Test ghim ở tầng tập hằng số để
    // ai thêm giá trị đó vào enum rồi nhét vào đây cũng bị chặn.
    expect(CLOSED_CHILD_STATUSES).toEqual(["ENROLLED"]);
    expect(CLOSED_CHILD_STATUSES as readonly string[]).not.toContain("REGISTERED");
  });

  it("[C-KPI-03] KHÔNG được trùng CONVERTED_STATUSES của cấp lead", () => {
    // Hai tập cố ý khác nhau: cấp lead gồm cả REGISTERED. Nếu tương lai ai đó "dọn"
    // bằng cách trỏ hằng số này sang hằng số kia, phễu theo con lập tức đếm sai.
    expect([...CONVERTED_STATUSES].sort()).not.toEqual([...CLOSED_CHILD_STATUSES].sort());
  });

  it("[C-KPI-04] STATUS_CHANGE và HANDOVER không phải 'tiếp cận' (OQ-C4)", () => {
    expect(CONTACT_ACTIVITY_TYPES).toEqual(["CALL", "MESSAGE", "NOTE", "EMAIL"]);
    expect(CONTACT_ACTIVITY_TYPES as readonly string[]).not.toContain("STATUS_CHANGE");
    expect(CONTACT_ACTIVITY_TYPES as readonly string[]).not.toContain("HANDOVER");
  });
});

describe("C3 — tỷ lệ theo lứa", () => {
  it("[C-KPI-05] 1 PH 2 con, con A chốt con B chưa → tổng 2, chốt 1", () => {
    // Đúng ca test mà §C.6.0 điều kiện 3 đòi phải có trước khi viết Server Action.
    const s = summariseChildFunnel([
      child("ENROLLED", new Date("2026-08-10T03:00:00Z")),
      child("CONSULTING", null),
    ]);
    expect(s.total).toBe(2);
    expect(s.closed).toBe(1);
    expect(s.successRate).toBe(0.5);
  });

  it("[C-KPI-06] mẫu số 0 ⇒ null, KHÔNG phải 0", () => {
    // "0%" đọc là *đã đo, kết quả bằng không*; "—" đọc là *chưa đo được*. Trả 0 ở ô
    // "tỷ lệ đạt mục tiêu" khi chưa đặt mục tiêu là báo tin xấu không có thật.
    expect(summariseChildFunnel([]).successRate).toBeNull();
    expect(safeRate(3, 0)).toBeNull();
    expect(safeRate(0, 5)).toBe(0);
  });

  it("[C-KPI-07] đếm rớt tách khỏi đếm chốt", () => {
    const s = summariseChildFunnel([
      child("LOST", null),
      child("LOST", null),
      child("ENROLLED", new Date()),
    ]);
    expect(s).toMatchObject({ total: 3, closed: 1, lost: 2 });
  });
});

describe("C4 — avg / median / p90", () => {
  it("[C-KPI-08] khớp percentile_cont của Postgres (nội suy tuyến tính)", () => {
    const r = describeDurations([1, 2, 3, 4]);
    expect(r.avg).toBe(2.5);
    expect(r.median).toBe(2.5);
    // (n-1)*0.9 = 2.7 ⇒ giữa phần tử 3 và 4, nghiêng 0.7 → 3.7
    expect(r.p90).toBeCloseTo(3.7, 10);
  });

  it("[C-KPI-09] KHÔNG sửa mảng của người gọi", () => {
    // Người gọi thường map thẳng từ kết quả DB rồi dùng lại mảng đó để hiển thị;
    // Array.sort sửa tại chỗ nên bảng sẽ đổi thứ tự mà không ai đụng vào nó.
    const xs = [5, 1, 3];
    describeDurations(xs);
    expect(xs).toEqual([5, 1, 3]);
  });

  it("[C-KPI-10] dãy rỗng ⇒ cả ba null", () => {
    expect(describeDurations([])).toEqual({ avg: null, median: null, p90: null });
  });

  it("[C-KPI-11] dưới 1 ngày hiện '< 1 ngày', không làm tròn thành 0", () => {
    expect(formatDaysToClose(0.4)).toBe("< 1 ngày");
    expect(formatDaysToClose(2.25)).toBe("2,3 ngày");
    expect(formatDaysToClose(null)).toBe("—");
  });
});

describe("C5 — đếm ngày theo LỊCH VN", () => {
  it("[C-KPI-12] 23:00 hôm qua giờ VN → hôm nay là 1 ngày, không phải 0", () => {
    // 2026-08-10T16:00Z = 23:00 ngày 10/08 giờ VN.
    // 2026-08-11T01:00Z = 08:00 ngày 11/08 giờ VN.
    // Hiệu thời điểm chỉ 9 giờ ⇒ phép chia cho 86.400.000 ra 0, làm cột cảnh báo lead
    // treo trông sạch hơn thực tế đúng một ngày.
    const from = new Date("2026-08-10T16:00:00Z");
    const to = new Date("2026-08-11T01:00:00Z");
    expect(daysBetweenVN(from, to)).toBe(1);
    expect(Math.floor((to.getTime() - from.getTime()) / 86_400_000)).toBe(0);
  });

  it("[C-KPI-13] cùng ngày VN ⇒ 0, kể cả cách nhau 23 giờ", () => {
    expect(
      daysBetweenVN(new Date("2026-08-10T17:00:00Z"), new Date("2026-08-11T15:59:00Z")),
    ).toBe(0);
  });

  it("[C-KPI-14] vnMonthKey lấy tháng theo giờ VN, không theo UTC", () => {
    // 2026-07-31T18:00Z = 01:00 ngày 01/08 giờ VN ⇒ phải là kỳ "2026-08".
    expect(vnMonthKey(new Date("2026-07-31T18:00:00Z"))).toBe("2026-08");
    expect(vnMonthKey(new Date("2026-08-15T03:00:00Z"))).toBe("2026-08");
  });
});
