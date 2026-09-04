import "server-only";
/**
 * Site Sale — TRUY VẤN màn "Leads" (`/sale/leads`).
 *
 * ══ ĐÂY LÀ BẢN ĐÔI CỦA TRUY VẤN TRONG `app/(admin)/admin/leads/page.tsx` ══════
 *
 * ── Vì sao nó tồn tại ───────────────────────────────────────────────────────
 * Chủ dự án chốt 04/09/2026: các màn site Sale TÁCH BẢN RIÊNG, không dùng chung
 * component với khu quản trị nữa — họ muốn thiết kế lại site Sale mà KHÔNG đụng
 * một pixel nào của khu quản trị (9 vai đang dùng hằng ngày). Rủi ro trôi lệch
 * đã được nêu trước khi chốt; chủ dự án vẫn chọn đường này.
 *
 * Trang admin gọi DB NGAY TRONG `page.tsx` nên không có hàm nào để gọi lại. Chép
 * truy vấn vào ĐÂY thay vì vào `page.tsx` của Sale để phần trôi lệch nằm ở MỘT
 * tệp có tên, đọc được, và sau này gộp lại được — chứ không lẫn trong JSX.
 *
 * ── NỢ TRÔI LỆCH: sửa bên nào cũng phải sửa bên kia ─────────────────────────
 *   1. `dungWhereLead()` — mọi vế lọc (q / cơ sở / sale / nguồn / khoảng ngày /
 *      scope-về-mình) và cách gói chúng trong `AND` để hai `OR` sống chung.
 *   2. Điều kiện CHO PHÉP tìm theo SĐT (nợ #11 "search-oracle").
 *   3. Bộ `include`/cột của bảng và của kanban.
 *   4. `KANBAN_TRAN` (trần 500 thẻ) và cách đếm tổng thật khi chạm trần.
 *   5. Nhánh đếm badge "Đã đăng ký" — đếm trên `baseWhere`, KHÔNG kèm `status`.
 *
 * ── KHÔNG phải nợ, vì đã dùng chung ở `lib/` ────────────────────────────────
 * `leadOwnershipWhere` · `leadSharingEnabled` · `maskLeadPiiFields` ·
 * `splitLeadNote` · `phoneSearchTerm` · `docSoDong` · `ALL_LEAD_STATUSES` ·
 * `getNonEnrollableCenterIds` · `scopedDb`.
 *
 * Cách ly cơ sở: `Lead` ∈ `SCOPED_MODELS` ⇒ `scopedDb(actor)` tự chèn
 * `centerId IN visibleCenters`. Quản lý CS1 chọn tay `centerId=CS2` thì giao tập
 * về rỗng, không lộ dữ liệu. SUPER_ADMIN / cấp Hội sở bypass.
 */
import type { LeadStatus, Prisma } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { maskLeadPiiFields } from "@/lib/lead/pii";
import { leadOwnershipWhere } from "@/lib/lead/ownership";
import { leadSharingEnabled } from "@/lib/lead/sharing";
import { splitLeadNote } from "@/lib/lead/note-view";
import { ALL_LEAD_STATUSES } from "@/lib/leads/status";
import { phoneSearchTerm } from "@/lib/phone";
import { getNonEnrollableCenterIds } from "@/lib/enrollment-flow";
import { docSoDong } from "@/lib/ui/phan-trang";

/** Trần số thẻ nạp về ở chế độ Kanban. Giữ bằng bản admin (500). */
export const KANBAN_TRAN = 500;

// ─────────────────────────────────────────────────────────────────────────────
// 1. ĐỌC THAM SỐ URL  (thuần — không chạm DB, không chạm session)
// ─────────────────────────────────────────────────────────────────────────────

/** Đúng bộ khoá `searchParams` mà bản admin đọc. Bớt một khoá là mất một ô lọc. */
export type ThamSoLead = {
  page?: string;
  size?: string;
  status?: string;
  q?: string;
  view?: string;
  centerId?: string;
  assignedToId?: string;
  source?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type BoLocLead = {
  cheDo: "table" | "kanban";
  trang: number;
  soDong: number;
  q: string | undefined;
  trangThai: LeadStatus | undefined;
  coSoId: string | undefined;
  saleId: string | undefined;
  nguon: string | undefined;
  tuNgay: string | undefined;
  denNgay: string | undefined;
};

/** Nắn `searchParams` về bộ lọc đã kiểm — cùng luật với bản admin, từng dòng. */
export function docBoLocLead(sp: ThamSoLead): BoLocLead {
  const trangThai = sp.status as LeadStatus | undefined;
  // ⚠️ MỘT CHỖ CỐ Ý CHẶT HƠN BẢN ADMIN. Bản admin viết `Math.max(1, Number(page))`:
  // gõ tay `?page=abc` cho `Number` ra `NaN`, `Math.max(1, NaN)` cũng là `NaN`, rồi
  // `skip: (NaN - 1) * 20` xuống thẳng Prisma → lỗi 500. Không đổi thứ người dùng
  // nhìn thấy, chỉ là một URL nghịch không còn làm sập trang.
  const trangTho = Number(sp.page ?? 1);
  return {
    cheDo: sp.view === "kanban" ? "kanban" : "table",
    trang: Number.isFinite(trangTho) ? Math.max(1, Math.floor(trangTho)) : 1,
    soDong: docSoDong(sp.size),
    q: sp.q?.trim() || undefined,
    trangThai:
      trangThai && ALL_LEAD_STATUSES.includes(trangThai) ? trangThai : undefined,
    coSoId: sp.centerId?.trim() || undefined,
    saleId: sp.assignedToId?.trim() || undefined,
    nguon: sp.source?.trim() || undefined,
    tuNgay: sp.dateFrom?.trim() || undefined,
    denNgay: sp.dateTo?.trim() || undefined,
  };
}

/**
 * Quyền đọc của người đang xem — quyết định ở trang (cần session) rồi truyền vào.
 * Gom thành một kiểu để không có lời gọi nào lỡ truyền thiếu một vế.
 */
export type QuyenDocLead = {
  /** `leads:view-all` — thấy lead của cả cơ sở, và mở được ô lọc Cơ sở / Sale. */
  xemTatCa: boolean;
  /** Thấy SĐT/tên thật (`canViewLeadPii()` và không bị DENY cấp trường). */
  xemDuocPii: boolean;
  /**
   * CÓ ĐƯỢC lọc theo cột SĐT hay không — nợ #11 ("search-oracle").
   * Tách khỏi `xemDuocPii` vì DENY cấp trường `phone` chặn riêng đường tìm.
   * Cho tìm theo số mà không cho xem số là vẫn dò ra được số qua kết quả.
   */
  timDuocSdt: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. DỰNG `where`
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @returns `base` = mọi vế lọc TRỪ trạng thái (dùng để đếm badge "Đã đăng ký" —
 *          badge phải đếm trên scope hiện tại bất kể tab đang chọn gì);
 *          `chinh` = `base` + trạng thái, và CHỈ ở chế độ bảng (kanban hiện đủ
 *          mọi cột nên bỏ qua lọc trạng thái, y hệt bản admin).
 */
export function dungWhereLead({
  userId,
  loc,
  quyen,
}: {
  /** `session.user.id` — chỉ dùng khi phải thu về "lead của tôi". */
  userId: string;
  loc: BoLocLead;
  quyen: QuyenDocLead;
}): { base: Prisma.LeadWhereInput; chinh: Prisma.LeadWhereInput } {
  // Chỉ có `leads:view-own` ⇒ thu về lead của chính mình.
  const veMinh = !quyen.xemTatCa;
  // SĐT lưu 2 dạng (`0…` cũ / `84…` mới) — tìm theo phần lõi để không sót.
  const qSdt = loc.q ? (phoneSearchTerm(loc.q) ?? loc.q) : undefined;

  const createdAt: Prisma.DateTimeFilter | undefined =
    loc.tuNgay || loc.denNgay
      ? {
          ...(loc.tuNgay ? { gte: new Date(loc.tuNgay) } : {}),
          ...(loc.denNgay ? { lte: new Date(`${loc.denNgay}T23:59:59`) } : {}),
        }
      : undefined;

  const base: Prisma.LeadWhereInput = {
    deletedAt: null,
    // Nghĩa của "của tôi" nằm ở MỘT chỗ (`lib/lead/ownership.ts`) — ba bản chép
    // tay trước đó đã trôi lệch thật. Gói trong `AND` để không đè key `OR` của ô
    // tìm bên dưới (hai `OR` sống chung). Cách ly cơ sở vẫn do `scopedDb` lo.
    ...(veMinh ? { AND: [leadOwnershipWhere(userId)] } : {}),
    ...(loc.saleId && quyen.xemTatCa ? { assignedToId: loc.saleId } : {}),
    ...(loc.coSoId ? { centerId: loc.coSoId } : {}),
    ...(loc.nguon ? { source: { contains: loc.nguon, mode: "insensitive" } } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(loc.q
      ? {
          OR: [
            { parentName: { contains: loc.q, mode: "insensitive" as const } },
            // Chỉ quét cột SĐT khi người xem thấy được số thật (nợ #11).
            ...(quyen.timDuocSdt ? [{ phone: { contains: qSdt } }] : []),
            { childName: { contains: loc.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  return {
    base,
    chinh: {
      ...base,
      ...(loc.trangThai && loc.cheDo === "table" ? { status: loc.trangThai } : {}),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. DỮ LIỆU CHO Ô LỌC
// ─────────────────────────────────────────────────────────────────────────────

export type MucLoc = { id: string; ten: string };

/**
 * Danh sách Cơ sở + Sale cho hai ô lọc. Chỉ vai `leads:view-all` mới có hai ô đó
 * (bản admin cũng vậy) nên vai `view-own` nhận về hai mảng rỗng, không tốn truy vấn.
 *
 * ⚠️ Hội sở KHÔNG bao giờ có lead (chốt 04/08) ⇒ để nó trong ô lọc là một lựa chọn
 * luôn ra rỗng, người dùng tưởng mất dữ liệu. Nhận diện qua cây OrgUnit
 * (`getNonEnrollableCenterIds`), KHÔNG hardcode danh sách cơ sở.
 */
export async function docMucLocLead(
  actor: Actor,
  xemTatCa: boolean,
): Promise<{ coSo: MucLoc[]; sale: MucLoc[] }> {
  if (!xemTatCa) return { coSo: [], sale: [] };
  const sdb = scopedDb(actor);
  const khongGhiDanh = await getNonEnrollableCenterIds();
  const [coSo, sale] = await Promise.all([
    sdb.center
      .findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { displayOrder: "asc" },
      })
      .then((ds) => ds.filter((c) => !khongGhiDanh.includes(c.id))),
    sdb.user.findMany({
      where: { isActive: true, deletedAt: null, roles: { has: "SALES_CSM" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    coSo: coSo.map((c) => ({ id: c.id, ten: c.name })),
    sale: sale.map((u) => ({ id: u.id, ten: u.name ?? "(chưa đặt tên)" })),
  };
}

/**
 * Badge tab "Đã đăng ký".
 *
 * ⚠️ Đếm trên `base` (KHÔNG kèm trạng thái đang lọc) — nếu không thì bấm vào tab
 * xong con số tự bằng số dòng đang hiện, và tab "Tất cả" mất luôn ý nghĩa so sánh.
 * Con số này đếm CẢ lead đã convert vì `DA_DANG_KY` gộp cả hai; cố ý, để badge
 * khớp đúng thứ tab lọc ra.
 */
export async function demLeadDaDangKy(
  actor: Actor,
  base: Prisma.LeadWhereInput,
): Promise<number> {
  return scopedDb(actor).lead.count({ where: { ...base, status: "DA_DANG_KY" } });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CHẾ ĐỘ BẢNG
// ─────────────────────────────────────────────────────────────────────────────

/** Một dòng bảng — đã che PII, đã bóc dòng máy ghi khỏi ghi chú. */
export type DongLead = {
  id: string;
  parentName: string;
  phone: string;
  email: string | null;
  childName: string | null;
  childAge: number | null;
  status: string;
  source: string | null;
  note: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  eventId: string | null;
  landingPage: string | null;
  referrer: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  consentMarketing: boolean;
  createdAt: string;
  center: { name: string } | null;
  courseName: string | null;
  assignedTo: { name: string | null } | null;
  /** Chính sách "dùng chung lead" đang TẮT thì cờ này luôn `false` (cắt ở server). */
  isSharedWithTeam: boolean;
  assignedToId: string | null;
};

export async function docTrangBangLead({
  actor,
  where,
  loc,
  quyen,
}: {
  actor: Actor;
  where: Prisma.LeadWhereInput;
  loc: BoLocLead;
  quyen: QuyenDocLead;
}): Promise<{ dong: DongLead[]; tong: number }> {
  const sdb = scopedDb(actor);
  const chiaSeBat = leadSharingEnabled();

  const [tho, tong] = await Promise.all([
    sdb.lead.findMany({
      where,
      include: {
        center: { select: { name: true } },
        course: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (loc.trang - 1) * loc.soDong,
      take: loc.soDong,
    }),
    sdb.lead.count({ where }),
  ]);

  const dong: DongLead[] = tho.map((raw) => {
    // Che PII Ở SERVER — chặn rò qua gói RSC, không chỉ giấu bằng CSS.
    const l = maskLeadPiiFields(raw, quyen.xemDuocPii);
    return {
      id: l.id,
      parentName: l.parentName,
      phone: l.phone,
      email: l.email,
      childName: l.childName,
      childAge: l.childAge,
      status: l.status,
      source: l.source,
      // Ô ghi chú chỉ hiện phần NGƯỜI GÕ; `updateLeadNote` ráp lại dòng máy ghi
      // lúc lưu (`lib/lead/note-view.ts`).
      note: splitLeadNote(l.note).human,
      utmSource: l.utmSource,
      utmMedium: l.utmMedium,
      utmCampaign: l.utmCampaign,
      eventId: l.eventId,
      landingPage: l.landingPage,
      referrer: l.referrer,
      ipAddress: l.ipAddress,
      userAgent: l.userAgent,
      consentMarketing: l.consentMarketing,
      createdAt: l.createdAt.toISOString(),
      center: l.center,
      courseName: l.course?.name ?? null,
      assignedTo: l.assignedTo,
      isSharedWithTeam: chiaSeBat && l.isSharedWithTeam,
      assignedToId: l.assignedToId,
    };
  });

  return { dong, tong };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. CHẾ ĐỘ KANBAN
// ─────────────────────────────────────────────────────────────────────────────

export type TheLead = {
  id: string;
  parentName: string;
  phone: string;
  childName: string | null;
  status: LeadStatus;
  source: string | null;
  courseName: string | null;
  assignedToName: string | null;
  createdAt: string;
  /** Có việc follow-up còn mở đã quá hạn. */
  overdue: boolean;
  /** Lần học thử gần nhất của bất kỳ con nào (ISO), `null` = chưa học thử. */
  lastTrialDate: string | null;
  isSharedWithTeam: boolean;
  assignedToId: string | null;
};

export async function docTheKanbanLead({
  actor,
  where,
  quyen,
}: {
  actor: Actor;
  where: Prisma.LeadWhereInput;
  quyen: QuyenDocLead;
}): Promise<{ the: TheLead[]; tong: number }> {
  const sdb = scopedDb(actor);
  const chiaSeBat = leadSharingEnabled();
  const bayGio = new Date();

  const tho = await sdb.lead.findMany({
    where,
    include: {
      course: { select: { name: true } },
      assignedTo: { select: { name: true } },
      // Quá hạn = còn task OPEN đã qua hạn.
      tasks: {
        where: { status: "OPEN", dueAt: { lt: bayGio } },
        select: { id: true },
        take: 1,
      },
      // Lần học thử gần nhất — giữ cả khi lead đã quay lại phễu.
      children: {
        select: {
          trialHistory: {
            where: { attendedCount: { gt: 0 } },
            select: { lastAttendedAt: true },
            orderBy: { lastAttendedAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: KANBAN_TRAN,
  });

  // Tổng THẬT để câu "Tổng N lead" khớp với chế độ bảng. Chỉ đếm thêm khi đã chạm
  // trần — dưới trần thì số thẻ đang hiện chính là tổng, khỏi tốn một truy vấn.
  //
  // ⚠️ "Đã chạm trần" KHÔNG được trả ra ngoài, và đó là chủ đích: nơi gọi phải nói
  // "bị cắt" theo `the.length < tong` chứ không theo cờ này. Nạp đúng 500 trên
  // tổng 500 là chạm trần mà KHÔNG mất dòng nào — báo bị cắt lúc đó là doạ người
  // dùng có dữ liệu bị giấu trong khi không có.
  const tong = tho.length >= KANBAN_TRAN ? await sdb.lead.count({ where }) : tho.length;

  const the: TheLead[] = tho.map((raw) => {
    const l = maskLeadPiiFields(raw, quyen.xemDuocPii);
    const ngayThu = l.children
      .flatMap((c) => c.trialHistory.map((h) => h.lastAttendedAt))
      .filter((d): d is Date => d != null)
      .sort((a, b) => b.getTime() - a.getTime());
    return {
      id: l.id,
      parentName: l.parentName,
      phone: l.phone,
      childName: l.childName,
      status: l.status,
      source: l.source,
      courseName: l.course?.name ?? null,
      assignedToName: l.assignedTo?.name ?? null,
      createdAt: l.createdAt.toISOString(),
      overdue: l.tasks.length > 0,
      lastTrialDate: ngayThu[0]?.toISOString() ?? null,
      isSharedWithTeam: chiaSeBat && l.isSharedWithTeam,
      assignedToId: l.assignedToId,
    };
  });

  return { the, tong };
}
