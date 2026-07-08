// R7-17 — Báo cáo Lead (THUẦN, không cần DB). Pure fixtures + assert từng chỉ số.
import { describe, it, expect } from "vitest";
import {
  buildLeadReport,
  buildFunnel,
  funnelConversionRates,
  countByStatus,
  groupBySource,
  groupByCenter,
  groupByCommissionSource,
  groupByMonth,
  groupByWeek,
  leadSummary,
  monthKeyVN,
  type LeadReportRecord,
} from "@/lib/reports/lead";

const d = (s: string) => new Date(s);

// Fixture: 10 lead phủ nhiều status / nguồn / cơ sở / tháng.
const records: LeadReportRecord[] = [
  { status: "NEW", source: "facebook", centerId: "c1", commissionSource: "MARKETING_ADMIN", createdAt: d("2026-05-02T03:00:00Z") },
  { status: "ASSIGNED", source: "facebook", centerId: "c1", commissionSource: "MARKETING_ADMIN", createdAt: d("2026-05-10T03:00:00Z") },
  { status: "CONTACTED", source: "zalo", centerId: "c1", commissionSource: "SALE_SELF", createdAt: d("2026-05-15T03:00:00Z") },
  { status: "CONSULTING", source: "zalo", centerId: "c2", commissionSource: "SALE_SELF", createdAt: d("2026-06-01T03:00:00Z") },
  { status: "TRIAL_SCHEDULED", source: "facebook", centerId: "c2", commissionSource: "REFERRAL", createdAt: d("2026-06-03T03:00:00Z") },
  { status: "TRIAL_ATTENDED", source: "facebook", centerId: "c2", commissionSource: "REFERRAL", createdAt: d("2026-06-05T03:00:00Z") },
  { status: "AWAITING_DECISION", source: null, centerId: "c2", commissionSource: null, createdAt: d("2026-06-06T03:00:00Z") },
  { status: "ENROLLED", source: "facebook", centerId: "c1", commissionSource: "MARKETING_ADMIN", createdAt: d("2026-06-07T03:00:00Z"), convertedAt: d("2026-06-08T03:00:00Z") },
  { status: "REGISTERED", source: "zalo", centerId: "c2", commissionSource: "SALE_SELF", createdAt: d("2026-06-08T03:00:00Z"), convertedAt: d("2026-06-09T03:00:00Z") },
  { status: "LOST", source: "zalo", centerId: "c1", commissionSource: "SALE_SELF", createdAt: d("2026-06-09T03:00:00Z") },
];

describe("[R7-17] monthKeyVN", () => {
  it("đổi sang giờ VN (UTC+7) trước khi lấy YYYY-MM", () => {
    // 2026-05-31T18:00:00Z = 2026-06-01 01:00 giờ VN → tháng 06.
    expect(monthKeyVN(d("2026-05-31T18:00:00Z"))).toBe("2026-06");
    expect(monthKeyVN(d("2026-05-02T03:00:00Z"))).toBe("2026-05");
  });
});

describe("[#10] groupByWeek — phễu lead theo tuần", () => {
  const now = d("2026-07-08T00:00:00Z");
  it("bucket 7 ngày, đếm tổng + chuyển đổi (REGISTERED/ENROLLED); ngoài cửa sổ → bỏ", () => {
    const recs: LeadReportRecord[] = [
      { status: "NEW", source: null, centerId: null, commissionSource: null, createdAt: d("2026-07-07T00:00:00Z") }, // tuần cuối (idx7)
      { status: "REGISTERED", source: null, centerId: null, commissionSource: null, createdAt: d("2026-07-06T00:00:00Z") }, // idx7, converted
      { status: "NEW", source: null, centerId: null, commissionSource: null, createdAt: d("2026-06-30T00:00:00Z") }, // idx6
      { status: "ENROLLED", source: null, centerId: null, commissionSource: null, createdAt: d("2026-05-01T00:00:00Z") }, // ngoài 8 tuần → bỏ
    ];
    const w = groupByWeek(recs, 8, now);
    expect(w).toHaveLength(8);
    expect(w.reduce((s, x) => s + x.total, 0)).toBe(3); // 3 trong cửa sổ, ENROLLED cũ bị loại
    expect(w[7]).toMatchObject({ total: 2, converted: 1 });
    expect(w[6]).toMatchObject({ total: 1, converted: 0 });
  });

  it("mảng rỗng → vẫn đủ N bucket số 0", () => {
    const w = groupByWeek([], 8, now);
    expect(w).toHaveLength(8);
    expect(w.every((x) => x.total === 0 && x.converted === 0)).toBe(true);
  });
});

describe("[R7-17] leadSummary", () => {
  it("tổng / chốt / tỷ lệ / hoạt động / thất bại", () => {
    const s = leadSummary(records);
    expect(s.total).toBe(10);
    expect(s.converted).toBe(2); // ENROLLED + REGISTERED
    expect(s.conversionRate).toBeCloseTo(0.2);
    expect(s.lost).toBe(1); // LOST
    expect(s.active).toBe(7); // 10 - 2 - 1
  });

  it("mảng rỗng → toàn số 0, không lỗi", () => {
    expect(leadSummary([])).toEqual({ total: 0, converted: 0, conversionRate: 0, active: 0, lost: 0 });
  });
});

describe("[R7-17] buildFunnel cumulative", () => {
  it("đếm lead đã chạm tới ít nhất mỗi bước; LOST không tính", () => {
    const f = buildFunnel(records);
    // 9 lead trong pipeline (loại LOST). NEW = mọi lead rank>=0 = 9.
    expect(f[0]).toMatchObject({ status: "NEW", count: 9 });
    // ASSIGNED rank>=1: tất cả trừ NEW → 8.
    expect(f[1].count).toBe(8);
    // CONTACTED rank>=2 → 7.
    expect(f[2].count).toBe(7);
    // CONSULTING rank>=3 → 6.
    expect(f[3].count).toBe(6);
    // TRIAL_SCHEDULED rank>=4 → 5.
    expect(f[4].count).toBe(5);
    // TRIAL_ATTENDED rank>=5 → 4.
    expect(f[5].count).toBe(4);
    // AWAITING_DECISION rank>=6 → 3.
    expect(f[6].count).toBe(3);
    // ENROLLED rank>=7 → ENROLLED + REGISTERED = 2.
    expect(f[7]).toMatchObject({ status: "ENROLLED", count: 2 });
  });
});

describe("[R7-17] funnelConversionRates", () => {
  it("tỷ lệ chuyển từng bước = count[i+1]/count[i]", () => {
    const rates = funnelConversionRates(buildFunnel(records));
    expect(rates).toHaveLength(7);
    expect(rates[0]).toMatchObject({ rate: 8 / 9 }); // NEW→ASSIGNED
    expect(rates[6]).toMatchObject({ rate: 2 / 3 }); // AWAITING→ENROLLED
  });

  it("chia 0 an toàn khi bước trước = 0", () => {
    const rates = funnelConversionRates(buildFunnel([]));
    expect(rates.every((r) => r.rate === 0)).toBe(true);
  });
});

describe("[R7-17] countByStatus", () => {
  it("đếm theo status hiện tại, sắp xếp giảm dần", () => {
    const counts = countByStatus(records);
    const map = Object.fromEntries(counts.map((c) => [c.status, c.count]));
    expect(map.NEW).toBe(1);
    expect(map.LOST).toBe(1);
    expect(map.ENROLLED).toBe(1);
    expect(counts.reduce((a, c) => a + c.count, 0)).toBe(10);
  });
});

describe("[R7-17] groupBySource", () => {
  it("nhóm theo nguồn + số chốt + tỷ lệ; null → Không rõ", () => {
    const g = groupBySource(records);
    const fb = g.find((x) => x.key === "facebook")!;
    expect(fb.total).toBe(5); // NEW, ASSIGNED, TRIAL_SCHEDULED, TRIAL_ATTENDED, ENROLLED
    expect(fb.converted).toBe(1); // chỉ ENROLLED
    const unknown = g.find((x) => x.label === "Không rõ");
    expect(unknown?.total).toBe(1); // AWAITING_DECISION source null
  });
});

describe("[R7-17] groupByCenter", () => {
  it("nhóm theo cơ sở + map tên", () => {
    const g = groupByCenter(records, { c1: "CS1", c2: "CS2" });
    const c1 = g.find((x) => x.key === "c1")!;
    const c2 = g.find((x) => x.key === "c2")!;
    expect(c1.total).toBe(5); // 5 lead ở c1
    expect(c2.total).toBe(5); // 5 lead ở c2
    expect(c1.label).toBe("CS1");
    expect(c2.converted).toBe(1); // REGISTERED ở c2
  });
});

describe("[R7-17] groupByCommissionSource", () => {
  it("nhóm theo nguồn hoa hồng + nhãn VI", () => {
    const g = groupByCommissionSource(records);
    const sale = g.find((x) => x.key === "SALE_SELF")!;
    expect(sale.label).toBe("Sale tự khai thác");
    expect(sale.total).toBe(4); // CONTACTED, CONSULTING, REGISTERED, LOST
    expect(sale.converted).toBe(1); // REGISTERED
  });
});

describe("[R7-17] groupByMonth", () => {
  it("nhóm theo tháng VN, tăng dần", () => {
    const g = groupByMonth(records);
    expect(g.map((x) => x.month)).toEqual(["2026-05", "2026-06"]);
    expect(g[0].total).toBe(3); // 3 lead tháng 5
    expect(g[1].total).toBe(7); // 7 lead tháng 6
    expect(g[1].converted).toBe(2); // ENROLLED + REGISTERED tháng 6
  });
});

describe("[R7-17] buildLeadReport tổng hợp", () => {
  it("gộp đủ các nhóm; rỗng → không lỗi", () => {
    const r = buildLeadReport(records, { c1: "CS1", c2: "CS2" });
    expect(r.summary.total).toBe(10);
    expect(r.funnel).toHaveLength(8);
    expect(r.byCenter).toHaveLength(2);
    const empty = buildLeadReport([]);
    expect(empty.summary.total).toBe(0);
    expect(empty.funnel.every((f) => f.count === 0)).toBe(true);
    expect(empty.byMonth).toEqual([]);
  });
});
