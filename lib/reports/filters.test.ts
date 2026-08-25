// @vitest-environment node
/**
 * A-02 (bộ lọc phạm vi dùng chung của 4 tab dashboard) + V-17 (lệch giờ VN).
 *
 * `lib/reports/filters.ts` là file DUY NHẤT trong `lib/reports/` chưa có test
 * (`docs/plan/test-coverage.md:299`, `:915`) — trong khi nó giữ ba bất biến mà hỏng
 * thì hỏng CÂM:
 *
 *  • **L-A2 (chống IDOR).** `?center=<ngoài visibleCenterIds>` phải bị loại IM LẶNG:
 *    không throw, không 500, và tuyệt đối không có dữ liệu cơ sở đó trong kết quả.
 *  • **L-A10 (khoá cache).** Cả 4 tab sẽ gọi `safeCache(() => compute(actor, filters), keyParts)`
 *    bằng closure 0 tham số ⇒ chuỗi khoá là DISCRIMINATOR DUY NHẤT. Thiếu một trường
 *    trong khoá = hai bộ lọc khác nhau dùng chung một entry ⇒ **sai số liệu im lặng 120s**,
 *    không log, không lỗi.
 *  • **V-17 (giờ VN).** Hai đầu ngày đang được parse bằng HAI hệ quy chiếu khác nhau
 *    (`filters.ts:35-44`): đầu `from` neo UTC, đầu `to` neo TZ CỦA TIẾN TRÌNH. Máy dev
 *    (Asia/Saigon) nhìn như đúng; Vercel/CI (UTC) thì "tháng 8" mất giao dịch 00:00–07:00
 *    ngày 01/08 và ăn nhầm giao dịch cùng khung ngày 01/09.
 *
 * VÌ SAO TEST NÀY ĐỔI `process.env.TZ`: một test chạy ở đúng một múi giờ KHÔNG chứng
 * minh được gì cho V-17 — trên máy Việt Nam thì `new Date(y, m, 1)` và bản neo VN cho ra
 * cùng một con số, nên test vẫn xanh trong khi prod (UTC) đang sai. Node cho phép đổi
 * `process.env.TZ` lúc chạy và Date đọc lại ngay, nên mỗi bất biến giờ được quét qua 3
 * múi giờ (UTC / +07 / -04): CÙNG một ngày lịch VN phải cho CÙNG một `Date`.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/auth/actor";

type CenterRow = { id: string; name: string; isActive: boolean; displayOrder: number };

const h = vi.hoisted(() => {
  const state: { centers: CenterRow[]; teachingIds: string[] } = {
    centers: [],
    teachingIds: [],
  };
  // Prisma giả TÔN TRỌNG `where.isActive` + `orderBy`. Bản giả trả sẵn một mảng cố định
  // sẽ xanh y hệt khi code quên lọc — tức là không chứng minh gì cả.
  const db = {
    center: {
      findMany: vi.fn(async (args: { where?: { isActive?: boolean } }) => {
        const wantActive = args?.where?.isActive;
        return state.centers
          .filter((c) => (wantActive === undefined ? true : c.isActive === wantActive))
          .slice()
          .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))
          .map((c) => ({ id: c.id, name: c.name }));
      }),
    },
  };
  return { state, db };
});

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/org/org-service", () => ({
  getTeachingCenterIds: vi.fn(async () => h.state.teachingIds),
}));

import {
  resolveScopeFilters,
  resolveReportFilters,
  scopeFilterCacheKey,
  scopeDateWhere,
  scopeCenterWhere,
  type ScopeFilters,
} from "./filters";

// ── Fixtures ────────────────────────────────────────────────────────────────────
// REGION thứ hai là bắt buộc trong dữ liệu A (chốt 24/08): cơ sở của một QLCS CÓ THỂ
// thuộc REGION khác. Ở tầng resolver, "khác vùng" biểu hiện đúng ở chỗ `visibleCenterIds`
// không liên tục theo displayOrder — nên fixture cố ý cho QLCS giữ c1 (vùng A) + c3 (vùng B).
const CENTERS: CenterRow[] = [
  { id: "c1", name: "CS1 Nguyễn Hữu Thọ", isActive: true, displayOrder: 1 },
  { id: "c2", name: "CS2 Hoàng Diệu", isActive: true, displayOrder: 2 },
  { id: "c3", name: "CS3 Tam Kỳ (vùng khác)", isActive: true, displayOrder: 3 },
  { id: "c-off", name: "CS cũ đã đóng", isActive: false, displayOrder: 4 },
  { id: "hoi-so", name: "Hội sở", isActive: true, displayOrder: 0 },
];
// `hoi-so` là bản ghi Center MỒ CÔI (không OrgUnit type CENTER nào trỏ tới) ⇒ không
// nằm trong getTeachingCenterIds ⇒ KHÔNG được xuất hiện trong dropdown chọn cơ sở.
const TEACHING = ["c1", "c2", "c3"];

const actor = (over: Partial<Actor> = {}): Actor =>
  ({
    userId: "u-actor",
    isSuperAdmin: false,
    isHoLevel: false,
    orgRoles: [],
    permissions: [],
    visibleCenterIds: [],
    visibleOrgUnitIds: [],
    grantsAllow: new Set<string>(),
    assignedClassIds: new Set<string>(),
    ...over,
  }) satisfies Actor;

/** QLCS thuần giữ 2 cơ sở KHÁC VÙNG (c1 + c3) — fixture bắt buộc của L-A13. */
const qlcs2 = actor({ visibleCenterIds: ["c1", "c3"] });
/** QLCS chỉ 1 cơ sở — dùng để chứng minh công tắc "Tách theo cơ sở" bị tắt. */
const qlcs1 = actor({ visibleCenterIds: ["c2"] });
/** HO-level: thấy mọi cơ sở vận hành. */
const ho = actor({ isHoLevel: true, visibleCenterIds: TEACHING });

const TZS = ["UTC", "Asia/Ho_Chi_Minh", "America/New_York"] as const;

/** Chạy `fn` dưới một múi giờ tiến trình cụ thể rồi trả TZ về như cũ. */
async function withTz<T>(tz: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.TZ;
    else process.env.TZ = prev;
  }
}

const iso = (d: Date) => d.toISOString();

beforeEach(() => {
  h.state.centers = CENTERS.map((c) => ({ ...c }));
  h.state.teachingIds = [...TEACHING];
  h.db.center.findMany.mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════════════════════
// A-02-2 / OQ-B9 — mặc định "ngày 01 tháng hiện tại → hôm nay", GIỜ VN
// ═══════════════════════════════════════════════════════════════════════════════
describe("[A-02-2] resolveScopeFilters — khoảng ngày mặc định neo giờ VN", () => {
  it("không có searchParams ⇒ 01 tháng hiện tại 00:00 VN → hôm nay cuối ngày VN", async () => {
    // 2026-08-25T02:00Z = 09:00 sáng 25/08 giờ VN.
    vi.setSystemTime(new Date("2026-08-25T02:00:00.000Z"));
    const ctx = await resolveScopeFilters(qlcs2, {});
    expect(iso(ctx.filters.dateFrom)).toBe("2026-07-31T17:00:00.000Z"); // 01/08 00:00 VN
    expect(iso(ctx.filters.dateTo)).toBe("2026-08-25T16:59:59.999Z"); // 25/08 23:59:59.999 VN
    expect(ctx.dateFromStr).toBe("2026-08-01");
    expect(ctx.dateToStr).toBe("2026-08-25");
  });

  it("[V-17] mốc 00:00–07:00 giờ VN: 31/08 18:00Z ĐÃ LÀ 01/09 ở VN ⇒ tháng 09", async () => {
    // Đây là ca giết bản cài đặt dùng `new Date()` + getMonth() theo TZ máy: trên UTC
    // máy vẫn thấy 31/08 ⇒ mặc định ra tháng 08, lệch cả một tháng.
    vi.setSystemTime(new Date("2026-08-31T18:00:00.000Z"));
    for (const tz of TZS) {
      const ctx = await withTz(tz, () => resolveScopeFilters(qlcs2, {}));
      expect(iso(ctx.filters.dateFrom), `TZ=${tz}`).toBe("2026-08-31T17:00:00.000Z"); // 01/09 00:00 VN
      expect(iso(ctx.filters.dateTo), `TZ=${tz}`).toBe("2026-09-01T16:59:59.999Z"); // 01/09 cuối ngày VN
      expect(ctx.dateFromStr, `TZ=${tz}`).toBe("2026-09-01");
      expect(ctx.dateToStr, `TZ=${tz}`).toBe("2026-09-01");
    }
  });

  it("[V-17] cùng một ngày lịch VN ⇒ cùng kết quả bất kể giờ máy (3 múi giờ)", async () => {
    vi.setSystemTime(new Date("2026-08-25T02:00:00.000Z"));
    const seen = new Set<string>();
    for (const tz of TZS) {
      const ctx = await withTz(tz, () =>
        resolveScopeFilters(qlcs2, { dateFrom: "2026-08-01", dateTo: "2026-08-31" }),
      );
      seen.add(`${iso(ctx.filters.dateFrom)}|${iso(ctx.filters.dateTo)}`);
    }
    expect(seen.size, "3 múi giờ phải cho ĐÚNG MỘT kết quả").toBe(1);
    expect([...seen][0]).toBe("2026-07-31T17:00:00.000Z|2026-08-31T16:59:59.999Z");
  });

  it("[V-17] hai đầu ngày phải neo CÙNG một hệ quy chiếu — khoảng đúng 31 ngày VN", async () => {
    vi.setSystemTime(new Date("2026-08-25T02:00:00.000Z"));
    const ctx = await resolveScopeFilters(qlcs2, { dateFrom: "2026-08-01", dateTo: "2026-08-31" });
    const days = (ctx.filters.dateTo.getTime() + 1 - ctx.filters.dateFrom.getTime()) / 86_400_000;
    expect(days).toBe(31);
  });

  it("chuỗi ngày sai định dạng ⇒ quay về mặc định, KHÔNG sinh Invalid Date", async () => {
    vi.setSystemTime(new Date("2026-08-25T02:00:00.000Z"));
    const ctx = await resolveScopeFilters(qlcs2, { dateFrom: "hôm-qua", dateTo: "" });
    expect(Number.isNaN(ctx.filters.dateFrom.getTime())).toBe(false);
    expect(Number.isNaN(ctx.filters.dateTo.getTime())).toBe(false);
    expect(iso(ctx.filters.dateFrom)).toBe("2026-07-31T17:00:00.000Z");
    expect(iso(ctx.filters.dateTo)).toBe("2026-08-25T16:59:59.999Z");
  });

  it("ngày ĐÚNG ĐỊNH DẠNG nhưng KHÔNG CÓ THẬT ⇒ bị từ chối, không tràn sang tháng khác", async () => {
    // `parseVnYmd` (lib/time/vn.ts:106) chỉ kiểm regex: "2026-13-45" lọt qua rồi tràn
    // thành 14/02/2027, "2026-02-30" thành 02/03. Bộ lọc phải chặn ở cửa của mình.
    vi.setSystemTime(new Date("2026-08-25T02:00:00.000Z"));
    for (const bad of ["2026-13-45", "2026-02-30", "2026-00-10", "2026-08-32"]) {
      const ctx = await resolveScopeFilters(qlcs2, { dateFrom: bad, dateTo: bad });
      expect(iso(ctx.filters.dateFrom), `dateFrom=${bad}`).toBe("2026-07-31T17:00:00.000Z");
      expect(iso(ctx.filters.dateTo), `dateTo=${bad}`).toBe("2026-08-25T16:59:59.999Z");
    }
    const old = await resolveReportFilters(ho, { dateFrom: "2026-13-45", dateTo: "2026-02-30" });
    expect(old.filters.dateFrom).toBeNull();
    expect(old.filters.dateTo).toBeNull();
  });

  it("đọc CẢ `?from=/?to=` (bar ghi ra) LẪN `?dateFrom=/?dateTo=` (bí danh /bao-cao/*)", async () => {
    // `components/admin/scope-filter-bar.tsx` GHI ra `from`/`to` (SCOPE_PARAM:36-42).
    // Resolver chỉ đọc `dateFrom`/`dateTo` ⇒ người dùng bấm chọn khoảng ngày, bar hiện
    // đúng ngày đã chọn (nó đọc `from`), còn bảng số lặng lẽ chạy MẶC ĐỊNH. Hỏng câm.
    vi.setSystemTime(new Date("2026-08-25T02:00:00.000Z"));
    const viaBar = await resolveScopeFilters(qlcs2, { from: "2026-08-01", to: "2026-08-31" });
    const viaReport = await resolveScopeFilters(qlcs2, {
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
    });
    expect(iso(viaBar.filters.dateFrom)).toBe("2026-07-31T17:00:00.000Z");
    expect(iso(viaBar.filters.dateTo)).toBe("2026-08-31T16:59:59.999Z");
    expect(iso(viaReport.filters.dateFrom)).toBe(iso(viaBar.filters.dateFrom));
    expect(iso(viaReport.filters.dateTo)).toBe(iso(viaBar.filters.dateTo));
    // Cùng khoảng ngày ⇒ CÙNG khoá cache dù URL viết kiểu nào (chống nhân bản entry).
    expect(scopeFilterCacheKey(viaBar.filters)).toBe(scopeFilterCacheKey(viaReport.filters));
  });

  it("có cả hai cách viết ⇒ `from`/`to` thắng (là thứ bar vừa ghi ra)", async () => {
    vi.setSystemTime(new Date("2026-08-25T02:00:00.000Z"));
    const ctx = await resolveScopeFilters(qlcs2, {
      from: "2026-08-10",
      dateFrom: "2026-08-01",
      to: "2026-08-20",
      dateTo: "2026-08-31",
    });
    expect(ctx.dateFromStr).toBe("2026-08-10");
    expect(ctx.dateToStr).toBe("2026-08-20");
  });

  it("hai ô ngày trả về UI là chuỗi ĐÃ CHUẨN HOÁ, không echo lại chuỗi URL", async () => {
    vi.setSystemTime(new Date("2026-08-25T02:00:00.000Z"));
    const ctx = await resolveScopeFilters(qlcs2, { dateFrom: " 2026-08-03 ", dateTo: "rác" });
    expect(ctx.dateFromStr).toBe("2026-08-03");
    expect(ctx.dateToStr).toBe("2026-08-25");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// L-A2 / A-02-4 — chống IDOR: cơ sở ngoài phạm vi bị LOẠI IM LẶNG
// ═══════════════════════════════════════════════════════════════════════════════
describe("[L-A2] resolveScopeFilters — cơ sở ngoài phạm vi bị loại im lặng", () => {
  beforeEach(() => vi.setSystemTime(new Date("2026-08-25T02:00:00.000Z")));

  it("?center=<cơ sở của người khác> ⇒ không throw, KHÔNG có id đó trong kết quả", async () => {
    const ctx = await resolveScopeFilters(qlcs2, { center: "c2" }); // c2 ngoài [c1,c3]
    expect(ctx.filters.centerIds ?? []).not.toContain("c2");
    expect(ctx.selection).not.toContain("c2");
    expect(ctx.visibleCenters.map((c) => c.id)).toEqual(["c1", "c3"]);
    // Và where đắp lên truy vấn không được chứa c2 dù filters.centerIds là null.
    expect(scopeCenterWhere(ctx.filters, qlcs2)).toEqual({ centerId: { in: ["c1", "c3"] } });
  });

  it("danh sách trộn hợp lệ + ngoài phạm vi ⇒ giữ phần hợp lệ, bỏ phần lạ", async () => {
    const ctx = await resolveScopeFilters(qlcs2, { center: "c1,c2,khong-ton-tai" });
    expect(ctx.filters.centerIds).toEqual(["c1"]);
  });

  it("cơ sở KHÔNG vận hành (hoi-so) và cơ sở đã đóng không bao giờ chọn được", async () => {
    const ctx = await resolveScopeFilters(ho, { center: "hoi-so,c-off,c2" });
    expect(ctx.filters.centerIds).toEqual(["c2"]);
    expect(ctx.visibleCenters.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("chuỗi rác / rỗng / khoảng trắng ⇒ không throw, quay về toàn bộ phạm vi cho phép", async () => {
    for (const center of ["", "   ", ",,,", "<script>", "c9".repeat(200)]) {
      const ctx = await resolveScopeFilters(qlcs2, { center });
      expect(ctx.filters.centerIds).toBeNull();
      expect(scopeCenterWhere(ctx.filters, qlcs2)).toEqual({ centerId: { in: ["c1", "c3"] } });
    }
  });

  it("id lặp và sai thứ tự ⇒ khử trùng + sắp xếp (khoá cache mới ổn định)", async () => {
    const ctx = await resolveScopeFilters(qlcs2, { center: "c3,c1,c3" });
    expect(ctx.filters.centerIds).toEqual(["c1", "c3"]);
  });

  it("?center=ALL ⇒ centerIds = null (toàn bộ phạm vi CHO PHÉP, không phải toàn hệ thống)", async () => {
    const ctx = await resolveScopeFilters(qlcs2, { center: "ALL" });
    expect(ctx.filters.centerIds).toBeNull();
    expect(ctx.selection).toEqual([]);
    // Với QLCS: null vẫn phải bị cắt về đúng 2 cơ sở của họ.
    expect(scopeCenterWhere(ctx.filters, qlcs2)).toEqual({ centerId: { in: ["c1", "c3"] } });
    // Với HO-level: null nghĩa là không thêm điều kiện cơ sở.
    const ctxHo = await resolveScopeFilters(ho, { center: "ALL" });
    expect(scopeCenterWhere(ctxHo.filters, ho)).toBeUndefined();
  });

  it("dropdown KHÔNG bao giờ là danh sách Center thô (Center nằm trong SCOPE_EXEMPT)", async () => {
    const ctx = await resolveScopeFilters(qlcs1, {});
    expect(ctx.visibleCenters.map((c) => c.id)).toEqual(["c2"]);
    expect(ctx.canSelectAll).toBe(false); // chỉ 1 cơ sở ⇒ không có tuỳ chọn "Tất cả"
  });

  it("[A-02-1] tuỳ chọn 'Tất cả' mở cho MỌI người có ≥2 cơ sở, không chỉ HO", async () => {
    const ctx = await resolveScopeFilters(qlcs2, {});
    expect(ctx.canSelectAll).toBe(true);
    expect(ctx.isGlobalAllowed).toBe(false); // nhãn "toàn hệ thống" vẫn chỉ của HO/super
    const ctxHo = await resolveScopeFilters(ho, {});
    expect(ctxHo.canSelectAll).toBe(true);
    expect(ctxHo.isGlobalAllowed).toBe(true);
  });

  it("[A-02-2] QLCS 2 cơ sở mở dashboard trắng ⇒ thấy CẢ HAI, không bị ép về cơ sở đầu", async () => {
    const ctx = await resolveScopeFilters(qlcs2, {});
    expect(ctx.filters.centerIds).toBeNull();
    expect(scopeCenterWhere(ctx.filters, qlcs2)).toEqual({ centerId: { in: ["c1", "c3"] } });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// L-A12 / OQ-4 — công tắc "Tách theo cơ sở" đọc từ ?split=1
// ═══════════════════════════════════════════════════════════════════════════════
describe("[L-A12] groupByCenter đọc từ ?split=1", () => {
  beforeEach(() => vi.setSystemTime(new Date("2026-08-25T02:00:00.000Z")));

  it("mặc định (không có ?split) ⇒ false = gộp", async () => {
    const ctx = await resolveScopeFilters(qlcs2, {});
    expect(ctx.filters.groupByCenter).toBe(false);
  });

  it("?split=1 với ≥2 cơ sở trong phạm vi ⇒ true", async () => {
    const ctx = await resolveScopeFilters(qlcs2, { split: "1" });
    expect(ctx.filters.groupByCenter).toBe(true);
    expect(ctx.canSplit).toBe(true);
  });

  it("giá trị khác '1' ⇒ false (không đoán bừa)", async () => {
    for (const split of ["0", "", "true", "yes", "2"]) {
      const ctx = await resolveScopeFilters(qlcs2, { split });
      expect(ctx.filters.groupByCenter, `split=${split}`).toBe(false);
    }
  });

  it("chỉ 1 cơ sở trong phạm vi ⇒ công tắc tắt CỨNG kể cả khi URL ép ?split=1", async () => {
    const ctx = await resolveScopeFilters(qlcs1, { split: "1" });
    expect(ctx.canSplit).toBe(false);
    expect(ctx.filters.groupByCenter).toBe(false);
  });

  it("chọn đúng 1 cơ sở trong số nhiều ⇒ công tắc cũng tắt (tách = gộp)", async () => {
    const ctx = await resolveScopeFilters(qlcs2, { center: "c3", split: "1" });
    expect(ctx.filters.centerIds).toEqual(["c3"]);
    expect(ctx.canSplit).toBe(false);
    expect(ctx.filters.groupByCenter).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// L-A10 — khoá cache là discriminator DUY NHẤT của safeCache
// ═══════════════════════════════════════════════════════════════════════════════
describe("[L-A10] scopeFilterCacheKey", () => {
  const D1 = new Date("2026-07-31T17:00:00.000Z");
  const D2 = new Date("2026-08-25T16:59:59.999Z");
  const base: ScopeFilters = {
    centerIds: ["c1", "c3"],
    dateFrom: D1,
    dateTo: D2,
    groupByCenter: false,
  };

  it("hai TẬP cơ sở khác nhau ⇒ hai khoá khác nhau", () => {
    expect(scopeFilterCacheKey({ ...base, centerIds: ["c1"] })).not.toBe(
      scopeFilterCacheKey({ ...base, centerIds: ["c1", "c3"] }),
    );
    expect(scopeFilterCacheKey({ ...base, centerIds: ["c1"] })).not.toBe(
      scopeFilterCacheKey({ ...base, centerIds: ["c3"] }),
    );
  });

  it("CÙNG tập, KHÁC thứ tự ⇒ CÙNG khoá (chống nhân bản entry)", () => {
    expect(scopeFilterCacheKey({ ...base, centerIds: ["c3", "c1"] })).toBe(
      scopeFilterCacheKey({ ...base, centerIds: ["c1", "c3"] }),
    );
  });

  it("khoá không được biến đổi mảng đầu vào của người gọi", () => {
    const centerIds = ["c3", "c1"];
    scopeFilterCacheKey({ ...base, centerIds });
    expect(centerIds).toEqual(["c3", "c1"]);
  });

  it("null (toàn phạm vi) KHÁC một tập cụ thể", () => {
    expect(scopeFilterCacheKey({ ...base, centerIds: null })).not.toBe(
      scopeFilterCacheKey({ ...base, centerIds: ["c1", "c3"] }),
    );
  });

  it("đổi bất kỳ đầu ngày nào ⇒ khoá đổi", () => {
    const later = new Date(D2.getTime() + 1);
    expect(scopeFilterCacheKey({ ...base, dateTo: later })).not.toBe(scopeFilterCacheKey(base));
    expect(
      scopeFilterCacheKey({ ...base, dateFrom: new Date(D1.getTime() - 86_400_000) }),
    ).not.toBe(scopeFilterCacheKey(base));
  });

  it("groupByCenter nằm TRONG khoá — thiếu là hai bảng số dùng chung entry 120s", () => {
    expect(scopeFilterCacheKey({ ...base, groupByCenter: true })).not.toBe(
      scopeFilterCacheKey({ ...base, groupByCenter: false }),
    );
  });

  it("không có cặp trường nào ghép nhập nhằng thành cùng một chuỗi", () => {
    const keys = [
      scopeFilterCacheKey({ ...base, centerIds: ["c1", "c3"] }),
      scopeFilterCacheKey({ ...base, centerIds: ["c1"] }),
      scopeFilterCacheKey({ ...base, centerIds: null }),
      scopeFilterCacheKey({ ...base, groupByCenter: true }),
      scopeFilterCacheKey({ ...base, dateFrom: new Date("2026-08-01T00:00:00.000Z") }),
      scopeFilterCacheKey({ ...base, dateTo: new Date("2026-08-26T16:59:59.999Z") }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// where helpers
// ═══════════════════════════════════════════════════════════════════════════════
describe("[A-02] scopeDateWhere / scopeCenterWhere", () => {
  it("scopeDateWhere trả đúng hai mốc của bộ lọc", () => {
    const f: ScopeFilters = {
      centerIds: null,
      dateFrom: new Date("2026-07-31T17:00:00.000Z"),
      dateTo: new Date("2026-08-25T16:59:59.999Z"),
      groupByCenter: false,
    };
    expect(scopeDateWhere(f)).toEqual({
      gte: new Date("2026-07-31T17:00:00.000Z"),
      lte: new Date("2026-08-25T16:59:59.999Z"),
    });
  });

  it("[RT-2] scopeCenterWhere với centerIds=null KHÔNG tự an toàn — vẫn cắt theo actor", () => {
    const f: ScopeFilters = {
      centerIds: null,
      dateFrom: new Date("2026-07-31T17:00:00.000Z"),
      dateTo: new Date("2026-08-25T16:59:59.999Z"),
      groupByCenter: false,
    };
    // QLCS ⇒ phải có mệnh đề `in` dù filters nói "null".
    expect(scopeCenterWhere(f, qlcs2)).toEqual({ centerId: { in: ["c1", "c3"] } });
    // HO/super ⇒ mới được bỏ mệnh đề.
    expect(scopeCenterWhere(f, ho)).toBeUndefined();
    expect(scopeCenterWhere(f, actor({ isSuperAdmin: true }))).toBeUndefined();
  });

  it("scopeCenterWhere ưu tiên tập đã chọn", () => {
    const f: ScopeFilters = {
      centerIds: ["c3"],
      dateFrom: new Date("2026-07-31T17:00:00.000Z"),
      dateTo: new Date("2026-08-25T16:59:59.999Z"),
      groupByCenter: false,
    };
    expect(scopeCenterWhere(f, qlcs2)).toEqual({ centerId: { in: ["c3"] } });
    expect(scopeCenterWhere(f, ho)).toEqual({ centerId: { in: ["c3"] } });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V-17 trên hàm CŨ — 8 trang /bao-cao/* đang sai NGAY BÂY GIỜ
// ═══════════════════════════════════════════════════════════════════════════════
describe("[V-17] resolveReportFilters — vá lệch giờ, giữ nguyên chữ ký", () => {
  beforeEach(() => vi.setSystemTime(new Date("2026-08-25T02:00:00.000Z")));

  it("dateFrom '2026-08-01' = 00:00 giờ VN, không phải 00:00 UTC", async () => {
    for (const tz of TZS) {
      const ctx = await withTz(tz, () => resolveReportFilters(ho, { dateFrom: "2026-08-01" }));
      expect(iso(ctx.filters.dateFrom!), `TZ=${tz}`).toBe("2026-07-31T17:00:00.000Z");
    }
  });

  it("dateTo '2026-08-31' = 23:59:59.999 giờ VN, không theo TZ của tiến trình", async () => {
    for (const tz of TZS) {
      const ctx = await withTz(tz, () => resolveReportFilters(ho, { dateTo: "2026-08-31" }));
      expect(iso(ctx.filters.dateTo!), `TZ=${tz}`).toBe("2026-08-31T16:59:59.999Z");
    }
  });

  it("khoảng 'tháng 8' bao đúng 31 ngày VN — không mất 01/08, không ăn nhầm 01/09", async () => {
    const ctx = await resolveReportFilters(ho, { dateFrom: "2026-08-01", dateTo: "2026-08-31" });
    const from = ctx.filters.dateFrom!;
    const to = ctx.filters.dateTo!;
    // Giao dịch lúc 03:00 sáng 01/08 giờ VN (= 2026-07-31T20:00Z) PHẢI nằm trong khoảng.
    const early = new Date("2026-07-31T20:00:00.000Z");
    expect(early >= from && early <= to).toBe(true);
    // Giao dịch lúc 03:00 sáng 01/09 giờ VN (= 2026-08-31T20:00Z) PHẢI nằm NGOÀI.
    const spill = new Date("2026-08-31T20:00:00.000Z");
    expect(spill > to).toBe(true);
    expect((to.getTime() + 1 - from.getTime()) / 86_400_000).toBe(31);
  });

  it("giữ nguyên hợp đồng cũ: không truyền ngày ⇒ null (không giới hạn)", async () => {
    const ctx = await resolveReportFilters(ho, {});
    expect(ctx.filters.dateFrom).toBeNull();
    expect(ctx.filters.dateTo).toBeNull();
    expect(ctx.selection).toBe("ALL");
    expect(typeof ctx.selection).toBe("string");
  });

  it("giữ nguyên hợp đồng cũ: chống IDOR đơn trị + mặc định cơ sở đầu cho non-HO", async () => {
    const ctx = await resolveReportFilters(qlcs2, { center: "c2" });
    expect(ctx.selection).toBe("c1");
    expect(ctx.filters.centerId).toBe("c1");
  });
});
