// lib/crm/funnel-query.ts — R1-08: đếm funnel L1→L2→L3 + chi phí QC + doanh thu
// (nguồn số cho `computeFunnelMetrics`).
//
// ⚠️ ĐỌC BẰNG `db` TRẦN, cách ly cơ sở lọc TAY theo `getModelVisibleCenterIds("Lead", actor)`
// — cùng khuôn `lib/chat/pilot-stats.ts`. Lý do không dùng `scopedDb`: hàm này gộp 5 truy vấn
// trên 4 model khác họ (`MessengerConversation`/`Lead` ∈ SCOPED_MODELS, `Order` ∈ SCOPED_MODELS,
// `AdsInsightDaily` KHÔNG có cột `centerId` nên scopedDb không với tới), và cả bảng số phải
// dùng CHUNG MỘT tầm nhìn thì tử số/mẫu số mới cùng phạm vi. Tầm nhìn đó lấy theo model
// `Lead` (đúng như trang /admin/marketing/funnel vẫn làm từ bản vá 24/07), KHÔNG tách theo
// từng model — tách ra là CPL lấy L2 của 1 cơ sở chia cho tiền của 2 cơ sở.
//
// V-02 (25/08/2026) — LỖ ĐÃ BỊT: trước đây 4/5 truy vấn nhận mệnh đề lọc cơ sở, riêng
// `adsInsightDaily.aggregate` chạy TRẦN ⇒ quản lý cơ sở (có `leads:view-all`, vào được trang)
// đọc được chi phí quảng cáo TOÀN CÔNG TY. Nặng hơn cả lộ tiền: CPL/CPA/ROAS lấy tử số là
// chi phí toàn hệ thống chia cho mẫu số L2/L3 của RIÊNG cơ sở ⇒ ba con số đó SAI.
//
// `AdsInsightDaily` (prisma/schema.prisma:948-961) chỉ có `@@unique([date, channel])`, KHÔNG
// có `centerId` ⇒ hôm nay chi phí QC KHÔNG chia được về cơ sở. Nên với actor bị giới hạn cơ
// sở, hàm KHÔNG hỏi bảng đó nữa và trả `spendAvailable: false`. Số `spend` kèm theo là 0 vì
// kiểu `FunnelCounts.spend` là `number`, nhưng 0 đó nghĩa là "KHÔNG ĐO ĐƯỢC ở phạm vi này",
// KHÔNG phải "0 đồng" — chỗ hiển thị phải đọc `spendAvailable` để ẩn thẻ Chi phí QC/CPL/CPA/
// ROAS thay vì in số 0. Muốn QLCS thấy chi phí thật thì phải thêm cột `centerId`+`orgUnitId`
// cho `AdsInsightDaily` và đổi unique thành `[date, channel, centerId]` (quyết định NGHIỆP VỤ:
// chi phí QC có đo được theo cơ sở không — chưa ai chốt, nên chưa làm).
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/can";
import { getModelVisibleCenterIds } from "@/lib/db-scope";
import type { FunnelCounts } from "@/lib/crm/marketing-metrics";

/** Quyền để xem bảng số funnel — đúng action mà trang /admin/marketing/funnel gate. */
export const FUNNEL_VIEW_ACTION = "leads:view-all";

export type ScopedFunnelCounts = FunnelCounts & {
  /**
   * `false` ⇒ `spend` (và mọi số dẫn xuất từ nó: CPL/CPA/ROAS) KHÔNG khả dụng ở phạm vi
   * này — hiển thị "—", TUYỆT ĐỐI không in `0 đ`.
   */
  spendAvailable: boolean;
};

/** Chữ ký cũ, còn 2 call-site chưa migrate (xem `@deprecated` ở overload). */
type LegacyOptions = { centerIds?: string[] };

/** "ALL" = toàn hệ thống · `string[]` = danh sách cơ sở · `null` = không được xem gì. */
type FunnelScope = "ALL" | string[] | null;

function isActor(arg: Actor | LegacyOptions): arg is Actor {
  return "userId" in arg && "visibleCenterIds" in arg;
}

function resolveScope(arg: Actor | LegacyOptions): FunnelScope {
  if (!isActor(arg)) {
    // Đường quá độ: `undefined` = toàn hệ thống (giữ nguyên hành vi cũ cho e2e R1-08),
    // mảng rỗng = không cơ sở nào ⇒ rỗng chứ không phải "tất cả".
    if (arg.centerIds === undefined) return "ALL";
    return arg.centerIds.length > 0 ? arg.centerIds : null;
  }
  // Luật Nền Hệ thống #1: kiểm quyền đi qua `can()`, không so role/centerId tay.
  // Không có quyền ⇒ RỖNG, KHÔNG throw: đây là hàm số liệu, chỗ chặn lối vào là gate trang.
  if (!can(arg, FUNNEL_VIEW_ACTION)) return null;
  const scope = getModelVisibleCenterIds("Lead", arg);
  if (scope === "ALL") return "ALL";
  // Tầm nhìn rỗng ⇒ fail-closed. KHÔNG được rơi về "không lọc" — đó đúng là hình dạng
  // fail-open mà V-02 đang vá.
  return scope.length > 0 ? scope : null;
}

const emptyCounts = (): ScopedFunnelCounts => ({
  l1: 0,
  l2: 0,
  l3: 0,
  spend: 0,
  revenue: 0,
  spendAvailable: false,
});

/** Bảng số funnel trong tầm nhìn của actor (fail-closed). */
export async function getFunnelCounts(actor: Actor): Promise<ScopedFunnelCounts>;
/**
 * @deprecated ĐƯỜNG QUÁ ĐỘ — truyền `Actor` thay vì `centerIds`.
 * Còn 2 call-site: `app/(admin)/admin/marketing/funnel/page.tsx` và
 * `tests/e2e/r1/funnel.spec.ts`. Chữ ký này FAIL-OPEN (quên tham số = lấy toàn hệ thống);
 * xoá overload này ngay khi 2 chỗ đó migrate xong.
 */
export async function getFunnelCounts(opts?: LegacyOptions): Promise<ScopedFunnelCounts>;
export async function getFunnelCounts(
  arg: Actor | LegacyOptions = {},
): Promise<ScopedFunnelCounts> {
  const scope = resolveScope(arg);
  if (scope === null) return emptyCounts();

  const centerFilter = scope === "ALL" ? {} : { centerId: { in: scope } };

  const [l1, l2, l3, spendAgg, revenueAgg] = await Promise.all([
    db.messengerConversation.count({ where: centerFilter }), // L1 = hội thoại
    db.lead.count({ where: { deletedAt: null, qualifiedAt: { not: null }, ...centerFilter } }), // L2
    db.lead.count({ where: { deletedAt: null, convertedAt: { not: null }, ...centerFilter } }), // L3
    // Chi phí QC không chia được về cơ sở ⇒ actor cấp cơ sở thì KHÔNG HỎI (xem đầu file).
    scope === "ALL" ? db.adsInsightDaily.aggregate({ _sum: { spend: true } }) : null,
    // Doanh thu = đơn đã chốt/hoàn tất (CONFIRMED/COMPLETED). V-02 chỉ vá PHẠM VI —
    // công thức giữ nguyên.
    db.order.aggregate({
      _sum: { totalAmount: true },
      where: { status: { in: ["CONFIRMED", "COMPLETED"] }, ...centerFilter },
    }),
  ]);

  return {
    l1,
    l2,
    l3,
    spend: spendAgg?._sum.spend ?? 0,
    spendAvailable: spendAgg !== null,
    revenue: revenueAgg._sum.totalAmount ?? 0,
  };
}
