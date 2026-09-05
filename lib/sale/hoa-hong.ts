import "server-only";
/**
 * Site Sale — truy vấn bảng "Hoa hồng theo kỳ".
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚠️ ĐÂY LÀ CÔNG THỨC TIỀN DUY NHẤT PHẢI CHÉP TRONG CẢ ĐỢT TÁCH 04/09/2026.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ── CHÉP TỪ ĐÂU ─────────────────────────────────────────────────────────────
 * `app/(admin)/admin/crm/commission/page.tsx`, dòng 44–91: khối dựng `lineWhere`
 * + `sdb.commissionStatement.findMany(...)` + phép cộng
 * `s.lines.reduce((sum, l) => sum + l.amount, 0)`.
 *
 * ── VÌ SAO KHÔNG GỌI LẠI (đã soi kỹ trước khi chép, không chép cho tiện) ────
 *   · `lib/crm/commission.ts`        — bậc thang tỉ lệ + `computeCommission()`;
 *                                      tính hoa hồng cho MỘT bút toán, không có
 *                                      hàm nào đọc bảng kê theo kỳ.
 *   · `lib/crm/commission-run.ts`    — `chotKyHoaHong()`: đường GHI, sinh
 *                                      `CommissionLine`. Có `tongTien:
 *                                      lines.reduce((s,l) => s + l.amount, 0)`
 *                                      nhưng trên các dòng nó VỪA TÍNH RA, chưa
 *                                      lọc theo tầm nhìn cơ sở của người xem, và
 *                                      chỉ tồn tại trong một transaction chốt kỳ.
 *   · `lib/crm/commission-statement.ts` — duyệt / mở lại kỳ, không đọc tổng.
 *   ⇒ Không tồn tại hàm dùng chung nào cho "liệt kê bảng kê + cộng tổng theo tầm
 *     nhìn của người đang xem". Truy vấn ấy sống DUY NHẤT trong trang admin.
 *   ⇒ Và `lib/crm/commission*` nằm trong danh sách KHÔNG ĐƯỢC ĐỤNG của đợt này,
 *     nên không được nâng nó thành hàm dùng chung ở đây.
 *
 * ── NỢ TRÔI LỆCH CÓ GHI SỔ ──────────────────────────────────────────────────
 * Đây là chỗ nguy hiểm nhất của cả đợt: hai bản của một phép cộng TIỀN. Sửa cách
 * lọc / cách cộng ở trang admin mà quên tệp này ⇒ hai màn cùng tên đưa ra hai con
 * số hoa hồng khác nhau, và **không có gì báo**. Chủ dự án đã được nêu rủi ro và
 * vẫn chọn tách bản. Chỗ ĐÚNG để trả nợ là nâng chính hàm này thành hàm dùng
 * chung rồi cho trang admin gọi vào — việc đó sửa `app/(admin)/**` và
 * `lib/crm/commission*`, cả hai đều ngoài phạm vi đợt này.
 *
 * ⚠️ KHÔNG "sửa cho đúng" một con số nào ở đây. Chép ĐÚNG như bản gốc, kể cả chỗ
 *    trông có vẻ lạ. Hai chỗ đã soi và cố ý giữ nguyên:
 *      (a) `lines.reduce` cộng CẢ dòng âm (`isClawback` → `amount` âm). Đó là
 *          đúng: tổng kỳ là tiền THỰC CHI, thu hồi phải trừ đi.
 *      (b) "Số dòng" đếm `s.lines.length` SAU khi đã lọc theo người hưởng, nên
 *          hai người ở hai cơ sở nhìn cùng một kỳ sẽ thấy hai số dòng khác nhau.
 *          Đó cũng là đúng — con số ấy mô tả phần kỳ mà người xem được phép thấy.
 *
 * ── CÁCH LY CƠ SỞ (chép nguyên cả lời giải thích của bản gốc) ───────────────
 * `CommissionStatement` là bảng KỲ toàn hệ thống (`period` @unique, KHÔNG có
 * `centerId`) → `scopedDb` pass-through. Hoa hồng "theo cơ sở" đi qua NGƯỜI
 * HƯỞNG (`CommissionLine.recipientId` → `User.centerId`): actor không phải
 * SUPER_ADMIN / Hội sở chỉ thấy dòng của user thuộc cơ sở trong tầm nhìn.
 */
import type { CommissionStatus } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { scopedDb, getModelVisibleCenterIds } from "@/lib/db-scope";

/** Một dòng của bảng — chỉ gồm thứ hiển thị, không mang khoá nội bộ nào. */
export type DongKyHoaHong = {
  /** Kỳ dạng "2026-06" — cũng là khoá của mọi Server Action chốt/duyệt/mở lại. */
  ky: string;
  trangThai: CommissionStatus;
  /** Số dòng hoa hồng TRONG TẦM NHÌN của người xem (xem ghi chú (b) đầu tệp). */
  soDong: number;
  /** Tổng VND, đã trừ dòng thu hồi (xem ghi chú (a) đầu tệp). */
  tong: number;
};

export async function layBangHoaHong(actor: Actor): Promise<DongKyHoaHong[]> {
  const sdb = scopedDb(actor);

  const visibleCenters = getModelVisibleCenterIds("CommissionStatement", actor);
  const lineWhere =
    visibleCenters === "ALL"
      ? undefined
      : {
          recipientId: {
            in: (
              await sdb.user.findMany({
                where: { centerId: { in: visibleCenters } },
                select: { id: true },
              })
            ).map((u) => u.id),
          },
        };

  const statements = await sdb.commissionStatement.findMany({
    orderBy: { period: "desc" },
    include: { lines: { where: lineWhere, select: { amount: true } } },
  });

  return statements.map((s) => ({
    ky: s.period,
    trangThai: s.status,
    soDong: s.lines.length,
    tong: s.lines.reduce((sum, l) => sum + l.amount, 0),
  }));
}
