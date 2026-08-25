import "server-only";
import { db } from "@/lib/db";
import { getTeachingCenterIds } from "@/lib/org/org-service";
import { parseVnYmd, vnDateAt, vnEndOfDay, vnParts, vnYmd } from "@/lib/time/vn";
import type { Actor } from "@/lib/auth/actor";

// Bộ lọc dùng chung cho /bao-cao/* — cơ sở (IDOR-safe theo tầm nhìn actor) + khoảng
// ngày. Center KHÔNG scoped (Center=db.center) nên tự lọc theo visibleCenterIds.
//
// ⚠️ HAI BỘ LỌC SỐNG CẠNH NHAU, CỐ Ý (A-02 · PRD §6.2 ràng buộc 6):
//   • `ReportFilters` / `resolveReportFilters` — ĐƠN TRỊ (`centerId: string | null`),
//     đang phục vụ 8 trang `/bao-cao/*` và lan sang cả đường GHI (form mục tiêu doanh
//     thu đọc `fc.selection`). ĐỔI KIỂU CỦA NÓ LÀ VỠ 11 CHỖ ĐỌC + 8 CHỖ GHI ⇒ KHÔNG ĐỘNG.
//   • `ScopeFilters` / `resolveScopeFilters` — ĐA TRỊ, cho 4 tab dashboard mới.
// Cái mới KHÔNG thay cái cũ trong đợt A; hai đường dùng chung hàm nạp danh sách cơ sở
// và chung quy ước giờ VN bên dưới.
//
// ⚠️ V-17 (giờ VN): mọi mốc ngày ở file này neo vào `Asia/Ho_Chi_Minh` qua `lib/time/vn.ts`.
// Trước 25/08/2026 hai đầu ngày neo hai hệ quy chiếu khác nhau — `dateFrom` là 00:00 UTC
// (= 07:00 sáng giờ VN, MẤT giao dịch nửa đêm–7h) còn `dateTo` là 23:59:59.999 theo TZ CỦA
// TIẾN TRÌNH (máy dev +07 nhìn như đúng; Vercel/CI chạy UTC nên ĂN NHẦM giao dịch
// 00:00–07:00 của ngày HÔM SAU). Đừng viết lại phép "+7 giờ" ở đây: `lib/time/vn.ts` là
// nơi duy nhất giữ quy ước đó.

export type ReportFilters = {
  /** null = toàn bộ cơ sở trong tầm nhìn. */
  centerId: string | null;
  /** null = không giới hạn. */
  dateFrom: Date | null;
  /** null = không giới hạn; đã set cuối ngày. */
  dateTo: Date | null;
};

export type ReportFilterContext = {
  filters: ReportFilters;
  visibleCenters: { id: string; name: string }[];
  /** "ALL" hoặc centerId đã chọn (cho <select> + cache key). */
  selection: string;
  isGlobalAllowed: boolean;
  /** Giá trị cho <input type=date> (YYYY-MM-DD hoặc ""). */
  dateFromStr: string;
  dateToStr: string;
};

export type ReportFilterSearchParams = {
  center?: string;
  dateFrom?: string;
  dateTo?: string;
};

/**
 * 00:00 GIỜ VN của "YYYY-MM-DD" trên URL. Không hợp lệ → null.
 *
 * ⚠️ `parseVnYmd` (`lib/time/vn.ts:106`) chỉ kiểm **ĐỊNH DẠNG** bằng regex rồi ném thẳng
 * số vào `Date.UTC`, nên `"2026-13-45"` không bị từ chối mà TRÀN sang 14/02/2027 và
 * `"2026-02-30"` thành 02/03. Bộ lọc nhận chuỗi thẳng từ URL nên phải kiểm lịch thật:
 * chuẩn hoá ngược lại và đòi khớp từng ký tự.
 */
function parseDateStart(s: string | undefined): Date | null {
  if (!s) return null;
  const d = parseVnYmd(s);
  if (!d) return null;
  return vnYmd(d) === s.trim() ? d : null;
}
/** 23:59:59.999 GIỜ VN của "YYYY-MM-DD" trên URL. Không hợp lệ → null. */
function parseDateEnd(s: string | undefined): Date | null {
  const d = parseDateStart(s);
  return d ? vnEndOfDay(d) : null;
}

/**
 * Cơ sở CHỌN ĐƯỢC của actor: chỉ cơ sở **đang vận hành** (có OrgUnit type CENTER trỏ
 * tới — loại HO và bản ghi `Center` mồ côi như `hoi-so`) và nằm trong tầm nhìn.
 *
 * ⚠️ `Center` nằm trong `SCOPE_EXEMPT` (`lib/db-scope.ts:105-107`) nên `scopedDb` KHÔNG
 * cắt hộ: `sdb.center.findMany()` là pass-through trả MỌI cơ sở. Phép lọc tay dưới đây
 * là chốt chặn duy nhất — xoá nó là dropdown lộ danh sách cơ sở của cả hệ thống.
 */
async function loadSelectableCenters(
  actor: Actor,
  isGlobalAllowed: boolean,
): Promise<{ id: string; name: string }[]> {
  const teachingIds = new Set(await getTeachingCenterIds());
  const allCenters = (
    await db.center.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    })
  ).filter((c) => teachingIds.has(c.id));
  return isGlobalAllowed
    ? allCenters
    : allCenters.filter((c) => actor.visibleCenterIds.includes(c.id));
}

/**
 * Giải bộ lọc từ searchParams: danh sách cơ sở CHỌN ĐƯỢC (chỉ cơ sở vận hành trong tầm
 * nhìn actor — loại HO/mồ côi), center đã chọn (chống IDOR qua URL), khoảng ngày.
 */
export async function resolveReportFilters(
  actor: Actor,
  sp: ReportFilterSearchParams,
): Promise<ReportFilterContext> {
  const isGlobalAllowed = actor.isSuperAdmin || actor.isHoLevel;
  const visibleCenters = await loadSelectableCenters(actor, isGlobalAllowed);

  const requested = sp.center;
  const defaultSelection = isGlobalAllowed ? "ALL" : (visibleCenters[0]?.id ?? "ALL");
  let selection = defaultSelection;
  if (requested === "ALL" && isGlobalAllowed) selection = "ALL";
  else if (requested && visibleCenters.some((c) => c.id === requested)) selection = requested;

  const centerId = selection === "ALL" ? null : selection;
  const dateFrom = parseDateStart(sp.dateFrom);
  const dateTo = parseDateEnd(sp.dateTo);

  return {
    filters: { centerId, dateFrom, dateTo },
    visibleCenters,
    selection,
    isGlobalAllowed,
    dateFromStr: sp.dateFrom ?? "",
    dateToStr: sp.dateTo ?? "",
  };
}

/** Khoá cache theo bộ lọc (kèm sau actorScopeKey). */
export function reportFilterCacheKey(f: ReportFilters): string {
  return `${f.centerId ?? "ALL"}|${f.dateFrom?.toISOString() ?? ""}|${f.dateTo?.toISOString() ?? ""}`;
}

/** Điều kiện Prisma DateTime từ dateFrom/dateTo (undefined nếu không lọc). */
export function reportDateWhere(
  f: ReportFilters,
): { gte?: Date; lte?: Date } | undefined {
  if (!f.dateFrom && !f.dateTo) return undefined;
  return {
    ...(f.dateFrom ? { gte: f.dateFrom } : {}),
    ...(f.dateTo ? { lte: f.dateTo } : {}),
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// A-02 — bộ lọc phạm vi ĐA CƠ SỞ dùng chung cho 4 tab dashboard
// ════════════════════════════════════════════════════════════════════════════════

export type ScopeFilters = {
  /**
   * null = toàn bộ phạm vi **CHO PHÉP CỦA ACTOR** — KHÔNG phải "toàn hệ thống".
   *
   * 🔴 `null` KHÔNG tự an toàn (RT-2): `injectScope` thoát ngay với model ngoài
   * `SCOPED_MODELS` (`lib/db-scope.ts:269`) và SUPER_ADMIN đi thẳng qua `bypassesScope`.
   * Truy vấn phải đắp thêm `scopeCenterWhere(filters, actor)` — hàm đó mới là chỗ biến
   * `null` thành danh sách cơ sở thật của actor.
   */
  centerIds: string[] | null;
  /** Mặc định 00:00 GIỜ VN ngày 01 tháng hiện tại (OQ-B9). Luôn có giá trị. */
  dateFrom: Date;
  /** Mặc định 23:59:59.999 GIỜ VN của hôm nay. Luôn có giá trị. */
  dateTo: Date;
  /** OQ-4: false = gộp (mặc định) · true = tách từng cơ sở. */
  groupByCenter: boolean;
};

export type ScopeFilterContext = {
  filters: ScopeFilters;
  /** Cơ sở CHỌN ĐƯỢC (đã lọc vận hành + tầm nhìn actor). */
  visibleCenters: { id: string; name: string }[];
  /** Giá trị cho form: [] khi `centerIds === null` (nghĩa "Tất cả"). */
  selection: string[];
  /** A-02-1: hiện tuỳ chọn "Tất cả cơ sở" khi actor có ≥2 cơ sở — KHÔNG chỉ HO. */
  canSelectAll: boolean;
  /** Nhãn "toàn hệ thống" (isSuperAdmin || isHoLevel) — KHÁC `canSelectAll`. */
  isGlobalAllowed: boolean;
  /** L-A12: chỉ render công tắc "Tách theo cơ sở" khi có ≥2 cơ sở trong phạm vi đang xem. */
  canSplit: boolean;
  /** "YYYY-MM-DD" đã CHUẨN HOÁ theo giờ VN cho `<input type="date">`. */
  dateFromStr: string;
  dateToStr: string;
};

/**
 * A-02-5 chốt quy ước `?center=`: giá trị là `ALL` **hoặc** danh sách id ngăn bởi dấu
 * phẩy. (~14 trang khác vẫn dùng `?centerId=` và KHÔNG đổi trong đợt A.)
 *
 * Nhận cả `string[]` vì Next trả mảng khi tham số lặp (`?center=a&center=b`) — gọi
 * `.split()` trên mảng là TypeError ⇒ 500, đúng thứ L-A2 cấm.
 */
export type ScopeFilterSearchParams = {
  center?: string | string[];
  /**
   * ⚠️ HAI CÁCH VIẾT CÙNG TỒN TẠI, CÓ CHỦ ĐÍCH.
   * `components/admin/scope-filter-bar.tsx` (form GET của 4 tab) **ghi ra** `from`/`to`
   * (`SCOPE_PARAM`), còn 8 trang `/bao-cao/*` dùng `dateFrom`/`dateTo`. Resolver phải
   * đọc CẢ HAI: bỏ sót `from`/`to` là người dùng chọn khoảng ngày trên bar, bar hiện
   * đúng ngày đã chọn (nó đọc `from`), nhưng bảng số bên dưới lặng lẽ chạy mặc định —
   * hỏng CÂM, không lỗi, không log. `from`/`to` thắng khi có cả hai.
   */
  from?: string | string[];
  to?: string | string[];
  dateFrom?: string | string[];
  dateTo?: string | string[];
  /** "1" = tách theo cơ sở. */
  split?: string | string[];
};

function asParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v.join(",") : v;
}

/**
 * Giải bộ lọc phạm vi dùng chung của 4 tab dashboard.
 *
 * Bất biến giữ ở đây (hỏng thì hỏng CÂM, không log không lỗi):
 *  • **L-A2** — id cơ sở ngoài `visibleCenterIds` bị loại IM LẶNG. Không throw, không
 *    500. Không còn id hợp lệ nào ⇒ về `null` = toàn bộ phạm vi cho phép của actor, và
 *    `scopeCenterWhere` vẫn cắt đúng ⇒ dữ liệu cơ sở lạ không bao giờ lọt ra.
 *  • **A-02-2** — không có searchParams ⇒ `centerIds = null`. KHÁC hàm cũ: hàm cũ ép
 *    actor không-HO về **cơ sở đầu tiên**, tức QLCS 2 cơ sở chỉ thấy một nửa số liệu.
 *  • **L-A12** — `groupByCenter` chỉ bật được khi phạm vi đang xem có ≥2 cơ sở; ép
 *    `?split=1` với một cơ sở vẫn ra `false` (tách và gộp cho cùng con số).
 */
export async function resolveScopeFilters(
  actor: Actor,
  sp: ScopeFilterSearchParams,
): Promise<ScopeFilterContext> {
  const isGlobalAllowed = actor.isSuperAdmin || actor.isHoLevel;
  const visibleCenters = await loadSelectableCenters(actor, isGlobalAllowed);

  // ── Cơ sở: giao tập yêu-cầu × tập chọn-được. Phần thừa rơi im lặng (L-A2).
  const allowed = new Set(visibleCenters.map((c) => c.id));
  const raw = asParam(sp.center)?.trim() ?? "";
  let centerIds: string[] | null = null;
  if (raw !== "" && raw.toUpperCase() !== "ALL") {
    const picked = [
      ...new Set(
        raw
          .split(",")
          .map((s) => s.trim())
          .filter((s) => allowed.has(s)),
      ),
    ].sort();
    // Sắp xếp để cùng một tập gửi khác thứ tự cho ra cùng `selection` và cùng khoá cache.
    if (picked.length > 0) centerIds = picked;
  }

  // ── Ngày: mặc định 01 tháng hiện tại → hôm nay, ĐO BẰNG LỊCH VN (OQ-B9 + V-17).
  // `vnParts(now)` chứ không phải `new Date().getMonth()`: lúc 00:00–07:00 giờ VN, máy
  // chạy UTC vẫn đang ở NGÀY HÔM TRƯỚC — mỗi ngày 01 đầu tháng sẽ lệch cả một tháng.
  const now = new Date();
  const nowVn = vnParts(now);
  // `from`/`to` là cách viết mà `scope-filter-bar.tsx` GHI RA; `dateFrom`/`dateTo` là
  // bí danh của /bao-cao/*. Đọc thiếu một trong hai = bộ lọc người dùng bấm bị bỏ qua.
  const rawFrom = asParam(sp.from) ?? asParam(sp.dateFrom);
  const rawTo = asParam(sp.to) ?? asParam(sp.dateTo);
  const dateFrom = parseDateStart(rawFrom) ?? vnDateAt(nowVn.year, nowVn.month, 1);
  const dateTo = parseDateEnd(rawTo) ?? vnEndOfDay(now);

  // ── Công tắc tách: đếm trên phạm vi ĐANG XEM, không phải trên tầm nhìn tối đa.
  const effectiveCount = centerIds ? centerIds.length : visibleCenters.length;
  const canSplit = effectiveCount >= 2;
  const groupByCenter = canSplit && asParam(sp.split) === "1";

  return {
    filters: { centerIds, dateFrom, dateTo, groupByCenter },
    visibleCenters,
    selection: centerIds ?? [],
    canSelectAll: visibleCenters.length >= 2,
    isGlobalAllowed,
    canSplit,
    // Lấy từ ngày ĐÃ chuẩn hoá, không echo lại chuỗi URL (chuỗi rác sẽ vào thẳng
    // `<input type="date">` và hiện ô trống trong khi số liệu đang dùng mặc định).
    dateFromStr: vnYmd(dateFrom),
    dateToStr: vnYmd(dateTo),
  };
}

/**
 * Khoá cache của bộ lọc MỚI — đi kèm `actorScopeKey(actor)` như một keyPart RIÊNG.
 *
 * 🔴 L-A10: cả 4 tab gọi `safeCache(() => compute(actor, filters), keyParts)` bằng
 * closure 0 tham số ⇒ chuỗi này là DISCRIMINATOR DUY NHẤT. Thêm trường vào `ScopeFilters`
 * mà quên thêm vào đây = hai bộ lọc khác nhau dùng chung một entry ⇒ **sai số liệu im
 * lặng 120 giây**. Mảng được sắp xếp trên BẢN SAO nên cùng một tập gửi khác thứ tự cho
 * cùng khoá (chống nhân bản entry) mà không sửa mảng của người gọi.
 */
export function scopeFilterCacheKey(f: ScopeFilters): string {
  const centers = f.centerIds === null ? "ALL" : [...f.centerIds].sort().join(",");
  return [
    `c=${centers}`,
    `from=${f.dateFrom.toISOString()}`,
    `to=${f.dateTo.toISOString()}`,
    `g=${f.groupByCenter ? 1 : 0}`,
  ].join("|");
}

/** Điều kiện Prisma DateTime của bộ lọc mới (hai đầu luôn có, đã neo giờ VN). */
export function scopeDateWhere(f: ScopeFilters): { gte: Date; lte: Date } {
  return { gte: f.dateFrom, lte: f.dateTo };
}

/**
 * Điều kiện cơ sở đắp LÊN TRÊN `scopedDb` — `undefined` = không thêm mệnh đề.
 *
 * 🔴 Vì sao phải truyền `actor` chứ không chỉ `filters` (RT-2): `centerIds = null` nghĩa
 * là "toàn bộ phạm vi CHO PHÉP", không phải "không giới hạn". Trả `undefined` cho mọi
 * `null` là mở toang mấy model chưa cách ly được (`AdsInsightDaily`, `MarketingCostPeriod`,
 * `Conversation`, `RevenueTarget`) — `injectScope` thoát ngay ở `lib/db-scope.ts:269` với
 * model ngoài `SCOPED_MODELS`, nên không có lưới thứ hai đỡ.
 */
export function scopeCenterWhere(
  f: ScopeFilters,
  actor: Actor,
): { centerId: { in: string[] } } | undefined {
  if (f.centerIds) return { centerId: { in: f.centerIds } };
  if (actor.isSuperAdmin || actor.isHoLevel) return undefined;
  return { centerId: { in: actor.visibleCenterIds } };
}
