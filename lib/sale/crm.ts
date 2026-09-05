import "server-only";
/**
 * Site Sale — SỐ LIỆU màn "CRM" (`/sale/crm`).
 *
 * ══ ĐÂY LÀ BẢN ĐÔI CỦA TRUY VẤN TRONG `app/(admin)/admin/crm/page.tsx` ═══════
 *
 * ── Vì sao nó tồn tại ───────────────────────────────────────────────────────
 * Chủ dự án chốt 04/09/2026: các màn site Sale TÁCH BẢN RIÊNG, không dùng chung
 * component với khu quản trị nữa. Rủi ro trôi lệch đã được nêu; chủ dự án vẫn
 * chọn đường này. Trang admin gọi DB ngay trong `page.tsx` nên không có hàm nào
 * để gọi lại; chép vào đây để phần trùng nằm ở MỘT tệp có tên chứ không lẫn JSX.
 *
 * ── NỢ TRÔI LỆCH: sửa bên nào cũng phải sửa bên kia ─────────────────────────
 *   1. Tám truy vấn trong `Promise.all` và ĐIỀU KIỆN của từng cái.
 *   2. Định nghĩa "Đang xử lý" — `status NOT IN LEAD_CLOSED_STATUSES` **VÀ**
 *      `convertedAt: null`. Bỏ vế thứ hai là con số chỉ có tăng, không bao giờ
 *      giảm (xem chú thích tại chỗ).
 *   3. Mẫu số của tỉ lệ chuyển đổi = TOÀN BỘ lead, không trừ nhóm nào.
 *   4. Trần 8 nguồn của biểu đồ "Lead theo nguồn".
 * Những thứ KHÔNG phải nợ vì đã ở `lib/` dùng chung: `LEAD_FUNNEL_STAGES` ·
 * `LEAD_CLOSED_STATUSES` · `LEAD_STATUS_LABEL` · `scopedDb`.
 *
 * Cách ly cơ sở: `Lead` ∈ `SCOPED_MODELS` ⇒ `groupBy`/`count` qua `scopedDb` tự
 * chèn `centerId IN visibleCenters`. `User` là SCOPE_EXEMPT (danh tính toàn cục)
 * nên `sdb.user` là pass-through.
 */
import type { LeadStatus } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import {
  LEAD_CLOSED_STATUSES,
  LEAD_FUNNEL_STAGES,
  LEAD_STATUS_LABEL,
} from "@/lib/leads/status";

/** Trần số nguồn vẽ trên biểu đồ. Giữ bằng bản admin (8). */
export const TRAN_NGUON = 8;

export type SoLieuCrm = {
  /** Lead tạo từ đầu tháng tới giờ. */
  leadThangNay: number;
  /** Việc còn mở của đội sale. */
  dangXuLy: number;
  /** Lead chốt trong tháng. */
  chotThangNay: number;
  /** Phần trăm, đã làm tròn 1 chữ số ở tầng hiển thị. */
  tiLeChuyenDoi: number;
  /** Tổng lead (mẫu số của tỉ lệ) — cũng dùng để biết có dữ liệu hay chưa. */
  tongLead: number;
  /** Năm bậc phễu, đúng thứ tự `LEAD_FUNNEL_STAGES`. */
  phieu: Array<{ ten: string; soLuong: number }>;
  /** Top nguồn, đã xếp giảm dần và cắt ở `TRAN_NGUON`. */
  nguon: Array<{ ten: string; soLuong: number }>;
  /** Hiệu suất từng tư vấn viên, xếp theo số đã chốt giảm dần. */
  doiSale: Array<{
    id: string;
    ten: string;
    duocGiao: number;
    daChot: number;
    tiLe: number;
  }>;
  /** Chi tiết theo trạng thái, xếp giảm dần theo số lượng. */
  theoTrangThai: Array<{ trangThai: LeadStatus; nhan: string; soLuong: number }>;
};

export async function docSoLieuCrm(actor: Actor): Promise<SoLieuCrm> {
  const sdb = scopedDb(actor);
  const bayGio = new Date();
  const dauThang = new Date(bayGio.getFullYear(), bayGio.getMonth(), 1);

  const [
    theoTrangThaiTho,
    theoNguon,
    theoNguoiPhuTrach,
    daChotTheoNguoi,
    danhSachSale,
    leadThangNay,
    chotThangNay,
    dangXuLy,
  ] = await Promise.all([
    sdb.lead.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    sdb.lead.groupBy({
      by: ["source"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    sdb.lead.groupBy({
      by: ["assignedToId"],
      where: { deletedAt: null, assignedToId: { not: null } },
      _count: { _all: true },
    }),
    sdb.lead.groupBy({
      by: ["assignedToId"],
      where: { deletedAt: null, assignedToId: { not: null }, status: "DA_DANG_KY" },
      _count: { _all: true },
    }),
    sdb.user.findMany({
      where: { roles: { has: "SALES_CSM" }, isActive: true, deletedAt: null },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    sdb.lead.count({ where: { deletedAt: null, createdAt: { gte: dauThang } } }),
    sdb.lead.count({
      where: { deletedAt: null, status: "DA_DANG_KY", updatedAt: { gte: dauThang } },
    }),
    // "Đang xử lý" — phải ĐẾM RIÊNG, không cộng dồn từ `theoTrangThaiTho` được.
    //
    // ⚠️ `LEAD_CLOSED_STATUSES` chỉ còn `DA_MAT` (cố ý: lead đã đăng ký mà chưa
    // xếp lớp vẫn là việc đang mở). Nhưng lead đã convert XONG cũng mang
    // `DA_DANG_KY`, nên gộp theo status thì mọi hồ sơ đã khép từ đời nào vẫn nằm
    // mãi trong ô này — con số chỉ có tăng, không bao giờ giảm. `convertedAt` là
    // mốc do chính lượt convert ghi, tách được hai nhóm đó; `groupBy` theo status
    // thì không.
    sdb.lead.count({
      where: {
        deletedAt: null,
        status: { notIn: LEAD_CLOSED_STATUSES },
        convertedAt: null,
      },
    }),
  ]);

  const dem = new Map<string, number>();
  let tongLead = 0;
  let tongDaChot = 0;
  for (const g of theoTrangThaiTho) {
    const c = g._count._all;
    dem.set(g.status, c);
    tongLead += c;
    if (g.status === "DA_DANG_KY") tongDaChot += c;
  }

  // Mẫu số là TOÀN BỘ lead. Không trừ `DA_MAT`: lead mất là kết quả tư vấn thật,
  // phải nằm trong mẫu số — khác hẳn bản ghi trùng (nhóm đã bị gỡ khỏi enum, nên
  // hôm nay không còn nhóm nào để trừ).
  const tiLeChuyenDoi = tongLead > 0 ? (tongDaChot / tongLead) * 100 : 0;

  const mapGiao = new Map(theoNguoiPhuTrach.map((g) => [g.assignedToId, g._count._all]));
  const mapChot = new Map(daChotTheoNguoi.map((g) => [g.assignedToId, g._count._all]));

  return {
    leadThangNay,
    dangXuLy,
    chotThangNay,
    tiLeChuyenDoi,
    tongLead,
    phieu: LEAD_FUNNEL_STAGES.map((bac) => ({
      ten: bac.name,
      soLuong: bac.statuses.reduce((s, tt) => s + (dem.get(tt) ?? 0), 0),
    })),
    nguon: theoNguon
      .map((g) => ({ ten: g.source ?? "Không rõ", soLuong: g._count._all }))
      .sort((a, b) => b.soLuong - a.soLuong)
      .slice(0, TRAN_NGUON),
    doiSale: danhSachSale
      .map((u) => {
        const duocGiao = mapGiao.get(u.id) ?? 0;
        const daChot = mapChot.get(u.id) ?? 0;
        return {
          id: u.id,
          // ⚠️ Thêm một bậc lùi so với bản admin (`u.name ?? u.email`): `User.email`
          // nullable từ đợt chuyển xác thực sang SĐT, nên bản admin có thể in ra một
          // Ô TÊN TRỐNG — người đọc không biết đó là ai, mà cũng không biết là đang
          // hỏng. Câu chữ mượn đúng chỗ đã dùng cho cùng tình huống ở ô lọc Sale.
          ten: u.name ?? u.email ?? "(chưa đặt tên)",
          duocGiao,
          daChot,
          tiLe: duocGiao > 0 ? (daChot / duocGiao) * 100 : 0,
        };
      })
      .sort((a, b) => b.daChot - a.daChot),
    theoTrangThai: [...dem.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tt, soLuong]) => ({
        trangThai: tt as LeadStatus,
        nhan: LEAD_STATUS_LABEL[tt as LeadStatus] ?? tt,
        soLuong,
      })),
  };
}
