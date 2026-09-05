import "server-only";
/**
 * Site Sale — dữ liệu màn "Bàn giao lead".
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA TỆP NÀO, VÀ VÌ SAO ───────────────────────────────────
 * Bản gốc: khối `Promise.all([sdb.user.findMany, sdb.lead.findMany])` nằm THẲNG
 * trong `app/(admin)/admin/ban-giao-lead/page.tsx`, cộng hằng `LEAD_STATUSES`
 * khai ở đầu tệp đó.
 *
 * Chủ dự án chốt 04/09/2026: màn site Sale **tách bản riêng**, không mount lại
 * và không dùng chung component với khu quản trị, để thiết kế lại giao diện Sale
 * mà **không đụng một pixel nào** của khu quản trị. Rủi ro trôi lệch đã được nêu
 * và chủ dự án vẫn chọn đường này ⇒ tệp này là **nợ trôi lệch có ghi sổ**.
 *
 * ⚠️ Đổi bộ lọc / đổi cột chọn / đổi điều kiện `centerScope` ở trang admin mà
 *    quên tệp này ⇒ hai màn cùng tên cho hai danh sách sale khác nhau, và không
 *    có gì báo. Chỗ ĐÚNG để trả nợ là nâng chính hàm này thành hàm dùng chung
 *    rồi cho trang admin gọi vào — việc đó sửa `app/(admin)/**`, ngoài phạm vi.
 *
 * ── DÙNG LẠI ĐƯỢC, KHÔNG CHÉP ───────────────────────────────────────────────
 * `previewHandover` / `bulkReassignLeads` (`lib/lead-handover/service.ts`) và
 * hai Server Action bọc chúng (`app/(admin)/admin/ban-giao-lead/_actions.ts`)
 * đều là logic THẬT của việc bàn giao — KHÔNG nhân bản. Xem lý do đầy đủ ở
 * `app/(sale)/sale/dang-ky-hoc/_components/nut-xoa.tsx`: nhân bản logic là cách
 * chắc chắn nhất để hai khu có hai luật khác nhau; nhân bản cái nút thì tệ nhất
 * chỉ là hai cái nút trông khác nhau.
 *
 * `ALL_LEAD_STATUSES` / `LEAD_CLOSED_STATUSES` cũng dùng thẳng nguồn chung —
 * suy ra danh sách thay vì gõ tay, y hệt bản admin (xem chú thích dài của nó:
 * danh sách gõ tay từng thiếu `DANG_HOC_THU` và `DA_DANG_KY`, làm sale nghỉ việc
 * bàn giao xong vẫn còn ôm nguyên nhóm lead đang học thử).
 *
 * Cách ly cơ sở: `Lead` ∈ `SCOPED_MODELS` nên `scopedDb(actor)` tự chèn
 * `centerId IN visibleCenters` cho truy vấn chiến dịch. `User` là `SCOPE_EXEMPT`
 * (identity, đọc toàn cục) → sdb pass-through, nên phải lọc `centerId` THỦ CÔNG
 * đúng như bản admin.
 */
import type { LeadStatus } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { hasRole } from "@/lib/auth/permissions";
import { ALL_LEAD_STATUSES, LEAD_CLOSED_STATUSES } from "@/lib/leads/status";

/**
 * Hình dạng tối thiểu mà `hasRole` cần. Khai lại ở đây vì `RoleHolder` của
 * `lib/auth/permissions.ts` KHÔNG được export — và tệp đó nằm ngoài phạm vi đợt
 * này (đụng ma trận quyền là việc riêng, có kiểm duyệt riêng).
 */
type NguoiGiuVai = {
  role?: string | null;
  roles?: string[] | null;
  centerId?: string | null;
};

/**
 * Trạng thái được phép lọc khi bàn giao — CHÉP nguyên cách suy của bản admin.
 *
 * Chỉ loại `DA_MAT`: lead đã mất không cần chuyển cho ai. Bộ lọc "chỉ lead chưa
 * đóng" của form cũng dùng đúng tập `LEAD_CLOSED_STATUSES` đó ở
 * `lib/lead-handover/service.ts`.
 *
 * Kiểu `LeadStatus[]` có chủ ý (không phải `string[]`): đổi tên giá trị enum mà
 * mảng này không được kiểm kiểu thì tsc không đỏ dòng nào, màn hình chỉ lặng lẽ
 * hiện các ô lọc ra 0 lead — đúng thứ đã xảy ra ở đợt đổi enum GĐ5.
 */
export const TRANG_THAI_BAN_GIAO: LeadStatus[] = ALL_LEAD_STATUSES.filter(
  (s) => !LEAD_CLOSED_STATUSES.includes(s),
);

export type MucSale = { id: string; label: string };

export type DuLieuBanGiaoLead = {
  sale: MucSale[];
  chienDich: string[];
};

export async function layDuLieuBanGiaoLead({
  actor,
  user,
}: {
  actor: Actor;
  /** `session.user` — để biết người xem có bị bó vào đúng cơ sở của mình không. */
  user: NguoiGiuVai;
}): Promise<DuLieuBanGiaoLead> {
  const sdb = scopedDb(actor);

  // Chép nguyên điều kiện của bản admin: Quản lý cơ sở (mà KHÔNG kiêm
  // SUPER_ADMIN) chỉ thấy sale cùng cơ sở với mình.
  const centerScope =
    hasRole(user, "CENTER_MANAGER") && !hasRole(user, "SUPER_ADMIN")
      ? (user.centerId ?? null)
      : null;

  const [sales, campaigns] = await Promise.all([
    sdb.user.findMany({
      where: {
        roles: { has: "SALES_CSM" },
        deletedAt: null,
        ...(centerScope ? { centerId: centerScope } : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, isActive: true },
    }),
    sdb.lead.findMany({
      where: { utmCampaign: { not: null }, deletedAt: null },
      distinct: ["utmCampaign"],
      select: { utmCampaign: true },
      take: 100,
    }),
  ]);

  return {
    // Nhãn dựng y như bản admin, kể cả hậu tố " (đã nghỉ)" — người dùng phải
    // nhận ra tài khoản đã vô hiệu NGAY trong ô chọn, không phải sau khi bấm.
    sale: sales.map((s) => ({
      id: s.id,
      label: (s.name ?? s.email ?? s.id) + (s.isActive ? "" : " (đã nghỉ)"),
    })),
    chienDich: campaigns
      .map((c) => c.utmCampaign)
      .filter((x): x is string => !!x),
  };
}
