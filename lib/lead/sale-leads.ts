// lib/lead/sale-leads.ts — "Khách của tôi" trên site Sale.
//
// Vì sao là module riêng chứ không dùng lại truy vấn của `/admin/leads`: trang
// admin phục vụ CẢ quản lý (xem toàn cơ sở) lẫn sale (xem của mình), nên `where`
// của nó là một cây điều kiện có nhánh. Trang này chỉ có MỘT người dùng và MỘT
// câu hỏi — "khách nào của tôi" — nên viết thẳng, ít nhánh, dễ đọc lại sau này.
//
// Cách ly cơ sở KHÔNG nằm ở đây: `Lead ∈ SCOPED_MODELS` nên `scopedDb(actor)` tự
// chèn `centerId IN visibleCenterIds`. Ở đây chỉ lọc THÊM "của tôi".
//
// ⚠️ Điều kiện "của tôi" đi qua `leadOwnershipWhere()` thay vì gõ `assignedToId`
// tại chỗ: chính sách lead độc quyền (Q8, 22/08) đổi được bằng env
// `LEAD_SHARING_ENABLED`, và nếu chỗ này gõ tay thì bật lại chính sách cũ sẽ chỉ
// đúng ở trang admin còn trang này thì không.
import "server-only";
import type { LeadStatus, Prisma } from "@prisma/client";
import { scopedDb } from "@/lib/db-scope";
import type { Actor } from "@/lib/auth/actor";
import { leadSharedOrClause } from "@/lib/lead/sharing";
import { phoneSearchTerm } from "@/lib/phone";
import { maskLeadPiiFields } from "@/lib/lead/pii";
import { LEAD_KHONG_NHAN_THEM_CON } from "@/lib/leads/status";

/** Trạng thái coi là ĐÃ ĐÓNG — mặc định không hiện trong danh sách việc đang làm. */
export const TRANG_THAI_DA_DONG: LeadStatus[] = [...LEAD_KHONG_NHAN_THEM_CON];

/**
 * Mệnh đề "lead này có phải của tôi không".
 *
 * Dùng chung một nguồn với trang admin: `leadSharedOrClause()` trả mảng RỖNG khi
 * chính sách lead độc quyền đang bật (mặc định), và trả nhánh `isSharedWithTeam`
 * khi ai đó bật lại bằng env.
 */
export function leadOwnershipWhere(userId: string): Prisma.LeadWhereInput {
  return { OR: [{ assignedToId: userId }, ...leadSharedOrClause()] };
}

export type SaleLeadRow = {
  id: string;
  parentName: string | null;
  phone: string | null;
  childName: string | null;
  status: LeadStatus;
  source: string | null;
  createdAt: Date;
  /** Lần chạm gần nhất — dùng để người xem tự thấy khách nào đang bị bỏ quên. */
  lastActivityAt: Date | null;
  /** Việc follow-up còn mở, sắp tới hạn nhất. `null` = không có việc nào. */
  viecSapToi: { id: string; title: string; dueAt: Date } | null;
};

export type SaleLeadListInput = {
  actor: Actor;
  userId: string;
  /** Lọc theo một trạng thái cụ thể. Bỏ trống = mọi trạng thái ĐANG MỞ. */
  status?: LeadStatus;
  /** Tìm theo tên phụ huynh / tên con / số điện thoại. */
  q?: string;
  /**
   * Ô tìm có được quét cột SĐT không — S-1 (26/08/2026).
   *
   * Đây là rò GIÁN TIẾP, và là chỗ site Sale quên chép mẫu của khu quản trị
   * (`/admin/leads`, `/admin/search` đều gác từ #11). Không hiện số nhưng cho DÒ:
   * gõ `0905123456`, thấy một khách hiện lên là biết ngay số đó của ai. Che cột
   * hiển thị mà để ô tìm quét cột ấy thì việc che chỉ còn là hình thức.
   *
   * Phải là KẾT QUẢ của `canViewLeadPii()` (và không bị DENY cấp trường), không
   * phải suy theo vai. Mặc định `false` — quên truyền thì mất tính năng tìm, chứ
   * không mất dữ liệu cá nhân.
   */
  canSearchPhone?: boolean;
  /** `true` = lấy cả lead đã đóng (đã ghi danh / đã mất / trùng). */
  gomDaDong?: boolean;
  take?: number;
};

/**
 * Danh sách khách của một tư vấn viên.
 *
 * Sắp theo `lastActivityAt` GIẢM DẦN chứ không theo `createdAt`: câu hỏi mở đầu
 * ngày của sale là "hôm nay chạm ai", và khách mới tạo mà chưa chạm thì
 * `lastActivityAt` rỗng nên tự rơi xuống cuối — đúng chỗ cần nhìn lại.
 */
export async function getMyLeads(input: SaleLeadListInput): Promise<SaleLeadRow[]> {
  const {
    actor,
    userId,
    status,
    q,
    gomDaDong = false,
    take = 200,
    canSearchPhone = false,
  } = input;
  const sdb = scopedDb(actor);

  const timKiem = q?.trim();
  // SĐT lưu 2 dạng (`0…` cũ / `84…` mới) — tìm theo phần lõi để không sót.
  const loiSdt = canSearchPhone && timKiem ? (phoneSearchTerm(timKiem) ?? timKiem) : undefined;

  const rows = await sdb.lead.findMany({
    where: {
      deletedAt: null,
      // Gói trong AND để nhánh "của tôi" và nhánh "tìm kiếm" không đè key OR của nhau.
      AND: [
        leadOwnershipWhere(userId),
        ...(status ? [{ status }] : gomDaDong ? [] : [{ status: { notIn: TRANG_THAI_DA_DONG } }]),
        ...(timKiem
          ? [
              {
                OR: [
                  { parentName: { contains: timKiem, mode: "insensitive" as const } },
                  { childName: { contains: timKiem, mode: "insensitive" as const } },
                  ...(loiSdt ? [{ phone: { contains: loiSdt } }] : []),
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ lastActivityAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take,
    select: {
      id: true,
      parentName: true,
      phone: true,
      childName: true,
      status: true,
      source: true,
      createdAt: true,
      lastActivityAt: true,
      // Chỉ lấy MỘT việc còn mở gần hạn nhất — danh sách không cần cả sổ việc,
      // và lấy hết là kéo theo hàng nghìn dòng cho một cột hiển thị.
      tasks: {
        where: { status: "OPEN" },
        orderBy: { dueAt: "asc" },
        take: 1,
        select: { id: true, title: true, dueAt: true },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    parentName: r.parentName,
    phone: r.phone,
    childName: r.childName,
    status: r.status,
    source: r.source,
    createdAt: r.createdAt,
    lastActivityAt: r.lastActivityAt,
    viecSapToi: r.tasks[0] ?? null,
  }));
}

export type SaleLeadDetail = NonNullable<Awaited<ReturnType<typeof getMyLeadDetail>>>;

/**
 * Chi tiết một khách — chỉ trả khi khách đó THẬT SỰ của người đang xem.
 *
 * Trả `null` cho cả hai ca "không tồn tại" và "không phải của bạn", cố ý không
 * phân biệt: phân biệt ra là biến trang này thành công cụ dò xem lead nào tồn tại.
 */
export async function getMyLeadDetail(
  actor: Actor,
  userId: string,
  leadId: string,
  canViewPii: boolean,
) {
  const sdb = scopedDb(actor);
  const lead = await sdb.lead.findFirst({
    where: { id: leadId, deletedAt: null, AND: [leadOwnershipWhere(userId)] },
    select: {
      id: true,
      parentName: true,
      phone: true,
      email: true,
      childName: true,
      note: true,
      status: true,
      source: true,
      facebookUrl: true,
      createdAt: true,
      lastActivityAt: true,
      assignedToId: true,
      centerId: true,
      center: { select: { name: true } },
      course: { select: { name: true } },
      children: {
        select: { id: true, fullName: true, ageYears: true, gradeLevel: true, trialStatus: true },
        orderBy: { createdAt: "asc" },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, type: true, content: true, actorName: true, createdAt: true },
      },
      tasks: {
        orderBy: [{ status: "asc" }, { dueAt: "asc" }],
        take: 50,
        select: { id: true, title: true, description: true, dueAt: true, status: true },
      },
    },
  });
  if (!lead) return null;

  // Mask PII ở SERVER trước khi xuống client — che ở UI là vẫn lộ qua payload RSC.
  // Sale vốn có `leads:view-pii`, nhưng quyền có thể bị thu bằng grant cấp người.
  const masked = maskLeadPiiFields(lead, canViewPii);
  return { ...lead, ...masked };
}
