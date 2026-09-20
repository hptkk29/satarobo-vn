"use server";

import { redirect } from "next/navigation";
import { KHOAN_DA_GHI_NHAN } from "@/lib/finance/ghi-nhan";
import { revalidatePath } from "next/cache";
import { Prisma, type OrderStatus, type OrderType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb, passesScope } from "@/lib/db-scope";
import {
  METHOD_WRONG_CENTER_ERROR,
  methodAllowsOrderType,
  methodServesCenter,
} from "@/lib/payments/method-scope";
import {
  orderCreateManualSchema,
  orderStatusChangeSchema,
} from "@/lib/validators/order";
import { generateOrderCode, withUniqueRetry } from "@/lib/orders/code";
import { checkOrderCreateOwnership } from "@/lib/orders/create-guard";
import { canTransition } from "@/lib/orders/status";
import { recordInstallmentPlan, markInstallmentPaid } from "@/lib/orders/installments";
import { getSetting } from "@/lib/settings/service";
import { expandPhoneVariants } from "@/lib/phone";
import {
  dongThieuGiaiTrinh,
  giaiTrinhGopChoDon,
  khoanVuotTran,
  loiThieuGiaiTrinh,
  loiVuotTran,
  tienDon,
  type KieuGiam,
} from "@/lib/orders/giam-gia-dong";
import { ensureParentAccountForOrder } from "@/lib/parents/provision";
import { ensureOrderPaymentRecorded } from "@/lib/finance/payment";
import { ensureFullOrderRequest } from "@/lib/payments/payment-request";
import { dotsGhiTuForm } from "@/lib/payments/ke-hoach-dot";
import { laThuTienLinhHoatBat } from "@/lib/finance/feature";
import { getRequestMetadata } from "@/lib/audit/headers";
import { getAuditActor } from "@/lib/audit/log";
import { ghiTuongTacLeadBoQuaLoi } from "@/lib/lead/tuong-tac/ghi";
import {
  taoDotChoCon,
  huyDotChoCon,
  ganKhoanDaThuChoCon,
  boGanKhoanKhoiCon,
  tachKhoanChoCon,
} from "@/lib/finance/ghi-tien-don";
import { writeAudit } from "@/lib/audit/audit-log";
import { soatGiaDon } from "@/lib/orders/price-guard";
import { congNoDon } from "@/lib/finance/cong-no-don";
import { haiTrucTheoDon, KHONG_CO_TIEN } from "@/lib/finance/hai-truc-theo-don";
import { trangThaiDon } from "@/lib/orders/trang-thai-don";
import {
  hocVienLaCuaNguoiKhac,
  hocVienTrenCacDong,
  studentIdChoDon,
  thieuHocVienODong,
  veMetadataConLead,
} from "@/lib/orders/hoc-vien-dong-don";
import { docHinhThucLop } from "@/lib/orders/hinh-thuc-lop";
import { laKhoaLoaiTruCoach } from "@/lib/finance/coach-pricing";
import { sendEmailForTrigger } from "@/lib/email/trigger";
import { notifyOrderByZnsIfNoEmail } from "@/lib/notify/order";
import { renderTemplate } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/send";

const PAGE_SIZE = 20;

async function requireOrdersView() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Gate list-level (nhiều đơn, không có 1 centerId cụ thể) — không truyền target.
  if (!(await checkPermission("orders:view"))) {
    redirect("/dashboard?error=unauthorized");
  }
  return session;
}

async function requireOrdersManage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // orders:manage chỉ HO_ACCOUNTANT (GLOBAL) — không cần target.
  if (!(await checkPermission("orders:manage"))) {
    redirect("/dashboard?error=unauthorized");
  }
  return session;
}

/**
 * G-A (biên bản chốt 4 cổng, 21/08/2026) — cổng TẠO đơn.
 *
 * Trước đây cổng này là `orders:manage`, khiến Sale không tạo được đơn ⇒ không
 * `payments:record` ⇒ không đủ điều kiện convert ⇒ **không chốt được khách**.
 * Nay cổng là `orders:create` (rộng hơn về người, hẹp hơn về phạm vi), còn phạm
 * vi "chỉ đơn gắn lead của mình" do `checkOrderCreateOwnership()` gác bên trong.
 *
 * Trả kèm `canManageAll` để action biết có phải áp ràng buộc chủ-lead hay không.
 */
async function requireOrdersCreate() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Cả 2 action đều GLOBAL ở mọi RoleDef giữ chúng ⇒ gọi trần, không cần target.
  if (!(await checkPermission("orders:create"))) {
    redirect("/dashboard?error=unauthorized");
  }
  const canManageAll = await checkPermission("orders:manage");
  return { session, canManageAll };
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ c: createdAt.toISOString(), i: id }),
  ).toString("base64");
}
function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64").toString()) as {
      c: string;
      i: string;
    };
    return { createdAt: new Date(decoded.c), id: decoded.i };
  } catch {
    return null;
  }
}

export type OrderFilters = {
  dateFrom?: string;
  dateTo?: string;
  status?: OrderStatus;
  type?: OrderType;
  search?: string;
};

// ─── QUERY ORDERS LIST ──────────────────────────────────────────────
export async function queryOrders(
  filters: OrderFilters,
  cursor: string | null,
) {
  const session = await requireOrdersView();
  // Cách ly cơ sở: Order ∈ SCOPED_MODELS → findMany tự inject `centerId IN visibleCenterIds`.
  const sdb = scopedDb(await resolveActor(session.user.id));

  const AND: Array<Record<string, unknown>> = [];
  if (filters.dateFrom)
    AND.push({ createdAt: { gte: new Date(filters.dateFrom) } });
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    AND.push({ createdAt: { lte: to } });
  }
  if (filters.status) AND.push({ status: filters.status });
  if (filters.type) AND.push({ type: filters.type });
  if (filters.search) {
    const s = filters.search.trim();
    AND.push({
      OR: [
        { code: { contains: s, mode: "insensitive" } },
        { customerName: { contains: s, mode: "insensitive" } },
        { customerPhone: { contains: s } },
      ],
    });
  }

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      AND.push({
        OR: [
          { createdAt: { lt: decoded.createdAt } },
          {
            AND: [{ createdAt: decoded.createdAt }, { id: { lt: decoded.id } }],
          },
        ],
      });
    }
  }

  const rows = await sdb.order.findMany({
    where: AND.length ? { AND } : undefined,
    include: {
      paymentMethod: { select: { code: true, name: true } },
      _count: { select: { items: true } },
      // G5 — badge suy diễn "Đã đóng đợt 1" cho danh sách (chỉ cần soDot + status).
      installments: { select: { soDot: true, status: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
  });

  const hasMore = rows.length > PAGE_SIZE;
  const rawItems = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = rawItems[rawItems.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  // "Người tạo đơn" — `Order.createdById` là String THUẦN (không quan hệ Prisma, cùng
  // lối với `confirmedByUserId` / `Payment.recordedById`) → tra tên bằng MỘT query User.
  // Khuôn mẫu chép từ `queryPayments` (admin/payments/_actions.ts).
  // User ∈ SCOPE_EXEMPT nên đọc toàn cục OK — và cần vậy: đơn của cơ sở mình có thể do
  // người Hội sở tạo, scope theo cơ sở sẽ làm mất tên chính người đó.
  const creatorIds = [
    ...new Set(rawItems.map((r) => r.createdById).filter((v): v is string => !!v)),
  ];
  const creators = creatorIds.length
    ? await sdb.user.findMany({
        where: { id: { in: creatorIds } },
        select: { id: true, name: true },
      })
    : [];
  const creatorNameById = new Map(creators.map((u) => [u.id, u.name]));

  /**
   * HAI TRỤC cho cả trang — MỘT lượt tra, không N+1 [16/09/2026].
   *
   * Chủ dự án chốt trạng thái đơn suy từ TIỀN và hiển thị hai trục. Trang chi tiết đã đổi;
   * danh sách mà không đổi thì CÙNG MỘT ĐƠN mang hai nhãn khác nhau ở hai màn — đo trên
   * `satarobo_local`: lọc "Đã xác nhận đơn" trả 81 đơn mà **0/81** đơn nào còn mang nhãn
   * đó ở trang chi tiết (77 hoá "Đang đóng", 4 hoá "Đã đóng đủ").
   *
   * ⚠️ Truyền `sdb` (đã scope), KHÔNG phải `db` trần — `Payment` ∈ SCOPED_MODELS.
   */
  const tienTheoDon = await haiTrucTheoDon(sdb, rawItems.map((o) => o.id));

  const items = rawItems.map((o) => {
    const t = tienTheoDon.get(o.id) ?? KHONG_CO_TIEN;
    const so = congNoDon({
      totalAmount: o.totalAmount,
      daGhiNhan: t.daGhiNhan,
      daXacNhan: t.daXacNhan,
    });
    return {
      ...o,
      // null = đơn tạo TRƯỚC 31/08/2026 (chưa có cột) hoặc người tạo đã bị xoá. Màn hình
      // in "—"; cố ý KHÔNG đoán bừa từ nguồn khác.
      createdByName: o.createdById ? (creatorNameById.get(o.createdById) ?? null) : null,
      /**
       * Trạng thái SUY TỪ TIỀN — tính ở SERVER và gửi xuống nguyên vẹn.
       *
       * Cố ý không gửi hai con số thô rồi để client tự gọi `trangThaiDon`: client cũng
       * gọi được (hàm thuần), nhưng như thế là hai chỗ quyết định cùng một nhãn, và
       * trang chi tiết đã tính ở client rồi. Một trong hai phải là nơi duy nhất — chọn
       * server cho danh sách vì `congNoDon` cần số tiền mà chỉ server có.
       */
      trangThai: trangThaiDon({ status: o.status, so }),
      /** Bộ số thô đi kèm, để bảng in được "còn thiếu" mà không phải suy lại. */
      congNo: so,
    };
  });

  return { items, nextCursor };
}

// ─── CREATE MANUAL ORDER ────────────────────────────────────────────
export async function createOrderManualAction(input: unknown) {
  const { session, canManageAll } = await requireOrdersCreate();
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const parsed = orderCreateManualSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Dữ liệu không hợp lệ",
      issues: parsed.error.flatten(),
    };
  }

  const data = parsed.data;

  // G-A — người chỉ có `orders:create` (Sale) phải gắn đơn vào lead CỦA MÌNH.
  // Lead nạp qua `scopedDb` ⇒ lead ngoài cơ sở trả null ⇒ guard từ chối.
  // Kiểm TRƯỚC mọi truy vấn khác để không rò rỉ thông tin qua thông báo lỗi.
  if (!canManageAll) {
    const leadId = data.leadId?.trim() || null;
    const lead = leadId
      ? await sdb.lead.findFirst({
          where: { id: leadId, deletedAt: null },
          select: { id: true, assignedToId: true, centerId: true },
        })
      : null;
    const guard = checkOrderCreateOwnership({
      canManageAll,
      leadId,
      lead,
      actorUserId: session.user.id,
    });
    if (!guard.ok) return { ok: false as const, error: guard.message };
    // Cơ sở của đơn lấy theo lead (guard trả về), không tin giá trị client gửi.
    data.centerId = guard.enforcedCenterId ?? null;
  }

  // Cách ly cơ sở (ghi): nếu form chọn cơ sở, cơ sở đó phải thuộc tầm nhìn actor
  // (orders:manage hiện là GLOBAL — guard này chỉ chặn khi role bị thu hẹp sau này).
  if (data.centerId && !passesScope("Order", { centerId: data.centerId }, actor)) {
    return { ok: false as const, error: "Không có quyền tạo đơn cho cơ sở này" };
  }

  // ── HỌC VIÊN CỦA TỪNG DÒNG HÀNG (15/09/2026 — đơn nhiều con) ────────────────
  //
  // `OrderItem.studentId` là một quan hệ TIỀN ("khoản này của con nào"), nên id client
  // gửi KHÔNG BAO GIỜ được tin thẳng: tra lại qua `scopedDb` (học viên ngoài tầm nhìn
  // trả rỗng) rồi đối chiếu đủ số. `scopedDb` KHÔNG che write — đây là chỗ tự gác.
  //
  // ⚠️ TỪ CHỐI CẢ ĐƠN, không âm thầm hoá null cái id lạ. Hoá null thì đơn vẫn tạo ra
  // nhưng mất thông tin "của con nào" — và mất im lặng, đúng lúc người nhập tin là đã
  // khai xong. Thà báo lỗi để họ chọn lại.
  const hocVienTrenDong = hocVienTrenCacDong(data.items);
  // Đơn hai con mà còn dòng bỏ trống ô học viên → chặn. Form đã chặn, nhưng form
  // chặn ở CLIENT; cổng thật phải ở đây (luật "scopedDb không che write").
  if (thieuHocVienODong(data.items)) {
    return {
      ok: false as const,
      error:
        "Đơn có nhiều học viên thì mọi dòng phải chọn rõ học viên — nếu không sau này không ai biết khoản tiền là của ai",
    };
  }
  // `data.studentId` (cột trên ĐƠN) đi cùng một cổng — trước đợt này nó chưa từng
  // được tra scope lần nào, tức một lời gọi action tự chế gắn được đơn vào học viên
  // của cơ sở khác. Gộp vào cùng tập để chỉ phải viết cổng MỘT lần.
  const hocVienIds = [
    ...new Set([...hocVienTrenDong, ...(data.studentId?.trim() ? [data.studentId.trim()] : [])]),
  ];
  if (hocVienIds.length > 0) {
    const thay = await sdb.student.findMany({
      where: { id: { in: hocVienIds }, deletedAt: null },
      select: { id: true, name: true, parentPhone: true },
    });
    if (thay.length !== hocVienIds.length) {
      return {
        ok: false as const,
        error:
          "Có học viên không tồn tại hoặc ngoài phạm vi của bạn — chọn lại ở dòng hàng",
      };
    }

    /**
     * ── BƯỚC A1 [16/09/2026]: EM TRÊN DÒNG PHẢI LÀ CON CỦA KHÁCH TRÊN ĐƠN ──
     *
     * Chủ dự án: *"mọi OrderItem khi tạo/sửa phải có học viên thuộc đúng lead/phụ huynh
     * của đơn, sai → từ chối"*.
     *
     * Cổng scope ở TRÊN chỉ hỏi "em này có thật và có thuộc cơ sở bạn nhìn thấy không" —
     * mà cả 247 em của cơ sở đều qua được câu đó. Nó KHÔNG hỏi "em này có phải con của
     * người đang mua không". Đơn `ORD-260915-000007` lọt đúng khe đó: đơn của chị Diễm
     * (`84941000002`) mà hai dòng ghi con của hai gia đình khác.
     *
     * Ô chọn đã vá sáng nay, nhưng vá ở CLIENT. Đây là vế SERVER — luật thật nằm ở
     * `hocVienLaCuaNguoiKhac` (thuần, có test + đã cấy lỗi), dùng chung với màn hình.
     */
    const sdtLead = data.leadId?.trim()
      ? ((await sdb.lead.findUnique({
          where: { id: data.leadId.trim() },
          select: { phone: true },
        }))?.phone ?? null)
      : null;
    const nhaKhac = hocVienLaCuaNguoiKhac(thay, data.customerPhone, sdtLead);
    if (nhaKhac.length > 0) {
      return {
        ok: false as const,
        error:
          `Không tạo được đơn: ${nhaKhac.map((h) => h.name).join(", ")} không phải con của ` +
          `số điện thoại trên đơn. Chọn lại học viên ở dòng hàng, hoặc cập nhật SĐT phụ ` +
          `huynh của em đó trước.`,
      };
    }
  }

  /**
   * CON LEAD trên các dòng — phải THẬT thuộc lead của đơn này [16/09/2026].
   *
   * Chủ dự án: *"lead này đa số là lead chưa chốt nên chưa phải là học viên nên sẽ lấy
   * thông tin con của PH lead đó chứ"*. Nên ô chọn học viên nay bày cả `LeadChild`.
   *
   * ⚠️ CỔNG NÀY KHÔNG PHẢI THỦ TỤC. `leadChildId` client gửi là một quan hệ TIỀN ("khoản
   * này của con nào"), y như `studentId`. Không tra lại thì một lời gọi action tự chế gắn
   * được dòng đơn vào con của gia đình KHÁC — và `LeadChild` KHÔNG thuộc `SCOPED_MODELS`
   * nên `scopedDb` không tự lọc giúp. Vì thế tra theo `leadId` của ĐƠN, chứ không tra
   * "con này có tồn tại không".
   *
   * ⚠️ Không có `leadId` trên đơn mà lại khai con lead ⇒ TỪ CHỐI. Đơn walk-in không gắn
   * lead thì không có cơ sở nào để nói đứa trẻ đó là con của khách này.
   */
  const conLeadTrenDong = [
    ...new Set(
      data.items
        .map((it) => it.leadChildId?.trim())
        .filter((v): v is string => !!v),
    ),
  ];
  if (conLeadTrenDong.length > 0) {
    const leadIdCuaDon = data.leadId?.trim() || null;
    if (!leadIdCuaDon) {
      return {
        ok: false as const,
        error:
          "Đơn không gắn lead nào mà lại chọn con khai trong lead — mở lại trang tạo đơn từ lead, hoặc chọn học viên đã có hồ sơ",
      };
    }
    const thayCon = await sdb.leadChild.findMany({
      where: { id: { in: conLeadTrenDong }, leadId: leadIdCuaDon },
      select: { id: true },
    });
    if (thayCon.length !== conLeadTrenDong.length) {
      return {
        ok: false as const,
        error:
          "Có con không thuộc lead của đơn này — chọn lại ở dòng hàng",
      };
    }
  }

  /**
   * `Order.studentId` — SUY TỪ CÁC DÒNG, không nhận từ client.
   *
   * Cột này chỉ có nghĩa khi cả đơn về ĐÚNG MỘT em; đơn hai con phải để NULL, vì
   * "con nào" lúc đó là thuộc tính của từng dòng chứ không của đơn. Form đã tính
   * đúng như vậy, nhưng nó tính ở CLIENT: gọi thẳng action vẫn gửi được một đơn có
   * hai dòng của hai em mà cột đơn trỏ vào em thứ ba. Từ đó mọi thứ đọc
   * `Order.studentId` — hoàn tiền, ZNS học phí, cổng phụ huynh — nói sai tên một
   * đứa trẻ, và không có lỗi nào nổ ra để ai biết.
   *
   * Không có dòng nào khai học viên thì giữ nguyên giá trị client gửi (đường
   * convert-lead vẫn dựa vào nó) — nhưng nay giá trị ấy đã qua cổng scope ở trên.
   */
  const studentIdCuaDon = studentIdChoDon(data.items, data.studentId);

  // ── DẤU VẾT GIÁ ──────────────────────────────────────────────────────────────
  // Hôm nay server tin tuyệt đối `unitPrice` client gửi, và vì `needsDiscountApproval`
  // chỉ xét `discountAmount > 0` nên đơn HẠ ĐƠN GIÁ không vào hàng chờ duyệt, không ghi
  // log nào, mà vẫn tự chốt được qua webhook — cổng duyệt chỉ che ô "Giảm giá".
  //
  // Ở đây CHỈ SO VÀ GHI DẤU, cố ý không từ chối và cố ý không quy lệch thành
  // `discountAmount` — lý do đầy đủ ở đầu `lib/orders/price-guard.ts` (tóm tắt: bán Coach
  // 1-1 ×2,0 và bán theo học phần ÷4 đều HỢP LỆ theo công văn, còn quy thành giảm giá là
  // bật cổng `sepay.ts` vốn làm tiền về không vào sổ nào).
  const courseIds = [
    ...new Set(
      data.items
        .map((it) => {
          const m = it.metadata as Record<string, unknown> | null | undefined;
          const v = m?.courseId;
          return typeof v === "string" && v ? v : null;
        })
        .filter((v): v is string => v != null),
    ),
  ];
  const productIds = [
    ...new Set(data.items.map((it) => it.productId).filter((v): v is string => !!v)),
  ];
  const [giaKhoa, giaSanPham] = await Promise.all([
    courseIds.length > 0
      ? sdb.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, price: true } })
      : Promise.resolve([]),
    productIds.length > 0
      ? sdb.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, salePrice: true },
        })
      : Promise.resolve([]),
  ]);
  const bangGia = new Map<string, number | null>([
    ...giaKhoa.map((c) => [c.id, c.price] as const),
    ...giaSanPham.map((p) => [p.id, p.salePrice] as const),
  ]);
  // ── HÌNH THỨC LỚP (SR.QD.219 Điều 5) ────────────────────────────────────────
  // Gác đúng MỘT điều server kiểm được: khoá mà công văn LOẠI khỏi Coach thì không được
  // bán Coach. Những thứ còn lại (`coachFormat` có khớp lớp học thật không, `soBuoi` có
  // đúng số buổi khách mua không) server KHÔNG suy ra được — model `Class` không có cột
  // hình thức lớp — nên chúng chỉ được GHI LẠI, không được dùng để định giá.
  //
  // ⚠️ CỐ Ý KHÔNG đưa hình thức lớp vào `giaNiemYet` của `soatGiaDon` bên dưới. Hôm nay
  // `giaNiemYet` là `Course.price` tra từ DB nên client không chạm được; nếu giá kỳ vọng
  // tính từ `coachFormat` + `soBuoi` (vốn nằm trong payload client) thì client cầm CẢ HAI
  // VẾ của phép so — khai `soBuoi` nhỏ là mọi đơn bán rẻ thành "khớp". Đo + phản biện
  // 14/09/2026; chi tiết ở đầu `lib/orders/hinh-thuc-lop.ts`.
  const hinhThucDong = data.items.map((it) => docHinhThucLop(it.metadata));
  const idKhoaCoach = [
    ...new Set(
      hinhThucDong
        .filter((h) => h.coachFormat !== "GROUP" && h.courseId)
        .map((h) => h.courseId as string),
    ),
  ];
  if (idKhoaCoach.length > 0) {
    const khoaCoach = await sdb.course.findMany({
      where: { id: { in: idKhoaCoach } },
      select: { id: true, name: true, slug: true, code: true },
    });
    const biLoai = khoaCoach.find((c) => laKhoaLoaiTruCoach(c));
    if (biLoai) {
      return {
        ok: false as const,
        error:
          `Khoá "${biLoai.name}" không áp dụng hình thức Coach (SR.QD.219 Điều 5 — gói ` +
          "cam kết 5 buổi, giá cố định Điều 3). Chọn lớp nhóm, hoặc chọn khoá khác.",
      };
    }
  }

  const soatGia = soatGiaDon(
    data.items.map((it) => {
      const m = it.metadata as Record<string, unknown> | null | undefined;
      const courseId = typeof m?.courseId === "string" ? m.courseId : null;
      const khoa = courseId ?? it.productId ?? null;
      return {
        itemName: it.itemName,
        soLuong: it.quantity,
        giaGhi: it.unitPrice,
        giaNiemYet: khoa ? (bangGia.get(khoa) ?? null) : null,
      };
    }),
  );

  // ── TIỀN CỦA ĐƠN: SUY TỪ CÁC DÒNG (15/09/2026) ───────────────────────────────
  //
  // Giảm giá nay khai theo TỪNG DÒNG. Server TÍNH LẠI toàn bộ bằng `tienDon` chứ không
  // nhận con số nào từ client: `discountAmount` client gửi là Ý ĐỊNH, không phải kết
  // quả. Tin nó là để client cầm cả hai vế của phép trừ — gửi `unitPrice` 10.000.000 và
  // `discountAmount` 9.999.999 thì đơn ra 1đ mà không cổng nào thấy gì bất thường.
  const khaiDong = data.items.map((it) => ({
    unitPrice: it.unitPrice,
    quantity: it.quantity,
    // DANH SÁCH khoản giảm của dòng, đúng thứ tự người bán gõ. Validator đã chặn cách
    // khai cũ (một khoản/dòng) cho ra tiếng, nên ở đây chỉ còn MỘT hình dạng.
    giam: (it.discounts ?? []).map((k) => ({
      kieu: k.kieu as KieuGiam,
      giaTri: k.giaTri,
      lyDo: k.lyDo ?? null,
    })),
  }));

  // Giải trình BẮT BUỘC cho từng dòng có giảm. Validator đã gác từng dòng một, nhưng
  // gác lại ở đây để thông báo nói được DÒNG NÀO — với đơn bốn dòng thì "thiếu giải
  // trình" không đủ để người bán biết đi sửa ở đâu.
  // TRẦN % lấy từ THAM SỐ VẬN HÀNH, không phải hằng trong mã. Người vận hành sửa ở màn
  // "Cấu hình vận hành" (`orders.maxDiscountPercent`, mặc định 50 — chốt 15/09/2026) và
  // đường ghi này phải đi theo ngay. Đây đúng là cái bẫy CLAUDE.md đã ghi cho
  // `crm.commissionMaxTotalRate`: nới trần ở màn cấu hình mà đường ghi vẫn chặn theo số
  // cũ thì không lỗi nào báo, chỉ có sale gọi điện hỏi vì sao không lưu được đơn.
  const tranPhanTram = await getSetting("orders.maxDiscountPercent");

  // Vượt trần ⇒ TỪ CHỐI, không kẹp im lặng. `gopGiamGia` có kẹp như lưới an toàn cho
  // con SỐ, nhưng người bán vừa hứa với phụ huynh một mức bớt khác — để đơn lưu được
  // với 50% trong khi sale gõ 80% là dựng sẵn một cuộc tranh cãi mà hệ thống có đủ dữ
  // kiện để chặn ngay lúc bấm Lưu.
  const vuotTran = khoanVuotTran(khaiDong, tranPhanTram);
  if (vuotTran.length > 0) {
    return { ok: false as const, error: loiVuotTran(vuotTran, tranPhanTram) };
  }

  const thieuLyDo = dongThieuGiaiTrinh(khaiDong, tranPhanTram);
  if (thieuLyDo.length > 0) {
    return { ok: false as const, error: loiThieuGiaiTrinh(thieuLyDo) };
  }

  const tien = tienDon(khaiDong, { phiVanChuyen: data.shippingFee, tranPhanTram });
  const subtotal = tien.tamTinh;
  const totalAmount = tien.tongDon;
  // `tienDong` đã kẹp giảm ≤ tạm tính TỪNG DÒNG, nên tổng không thể âm trừ khi
  // `shippingFee` âm — mà validator đã chặn `min(0)`. Giữ cổng vì nó rẻ và vì mất nó
  // thì một đổi thay ở `tienDon` sẽ đi thẳng ra đơn âm mà không ai chặn.
  if (totalAmount < 0) {
    return { ok: false as const, error: "Tổng tiền không thể âm" };
  }

  // `Order.discountReason` vẫn được hoá đơn · nhật ký đọc, nên nó phải nói được điều gì
  // đó mà không cần biết về cột JSON. Ghép ở MỘT chỗ dùng chung với form.
  const giaiTrinhGop = giaiTrinhGopChoDon(tien.dong);

  // 30/08/2026 — PaymentMethod ∈ SCOPED_MODELS: câu này nay TỰ LỌC theo tầm nhìn cơ sở
  // của người tạo đơn.
  const pm = await sdb.paymentMethod.findUnique({
    where: { id: data.paymentMethodId },
    select: {
      id: true,
      name: true,
      isActive: true,
      centerId: true,
      canBuyCourse: true,
      canBuyPackage: true,
      canBuyExam: true,
      canBuyProduct: true,
    },
  });
  if (!pm)
    return {
      ok: false as const,
      error: "Phương thức thanh toán không tồn tại",
    };
  if (!pm.isActive)
    return {
      ok: false as const,
      error: "Phương thức thanh toán đã bị vô hiệu hoá",
    };

  // ⚠️ CỔNG SERVER cho luật "cơ sở nào dùng ngân hàng của cơ sở đó".
  // Dropdown ở form đã lọc rồi, nhưng lọc client KHÔNG phải lớp bảo vệ: mỗi Server
  // Action là một endpoint HTTP riêng, gọi thẳng với id phương thức của cơ sở khác vẫn
  // tới được đây. Hệ quả nếu thiếu: đơn của CS2 mang phương thức của CS1 ⇒ mã QR dựng
  // theo `order.centerId` nên vẫn trỏ tài khoản CS2, còn sổ sách ghi phương thức CS1 —
  // hai bên lệch nhau đúng ở chỗ đối soát tiền.
  if (!methodServesCenter(pm, data.centerId || null)) {
    return { ok: false as const, error: METHOD_WRONG_CENTER_ERROR };
  }

  if (!methodAllowsOrderType(pm, data.type)) {
    return {
      ok: false as const,
      error: `Phương thức này không hỗ trợ loại đơn "${data.type}"`,
    };
  }

  // Phase 5.10.1 — PRODUCT order validation (single-item v1).
  // Verify product exists, is ACTIVE, has enough stock. The actual stock
  // decrement happens inside the tx below to keep create + decrement atomic.
  let productSnapshot: {
    productId: string;
    name: string;
    salePrice: number;
    currentStock: number;
    quantityRequested: number;
  } | null = null;

  if (data.type === "PRODUCT") {
    const item = data.items[0];
    if (!item || !item.productId) {
      return {
        ok: false as const,
        error: "Đơn PRODUCT phải chọn sản phẩm",
      };
    }
    const product = await sdb.product.findUnique({
      where: { id: item.productId },
      select: {
        id: true,
        name: true,
        salePrice: true,
        stockOnHand: true,
        status: true,
      },
    });
    if (!product) {
      return { ok: false as const, error: "Sản phẩm không tồn tại" };
    }
    if (product.status !== "ACTIVE") {
      return {
        ok: false as const,
        error: `Sản phẩm "${product.name}" không đang bán (status=${product.status})`,
      };
    }
    if (product.stockOnHand < item.quantity) {
      return {
        ok: false as const,
        error: `Tồn kho không đủ. Hiện có ${product.stockOnHand}, yêu cầu ${item.quantity}`,
      };
    }
    productSnapshot = {
      productId: product.id,
      name: product.name,
      salePrice: product.salePrice,
      currentStock: product.stockOnHand,
      quantityRequested: item.quantity,
    };
  }

  const { actorId, actorName } = getAuditActor(session);

  // FIX-C5 — codegen atomic BÊN TRONG tx (`generateOrderCode(tx)`) + retry khi
  // đụng unique-violation (P2002) như backstop. Cả tx re-run khi retry.
  // A0-04: tx từ scopedDb — cast vì extended client không structurally-assignable
  // vào Prisma.TransactionClient (tiền lệ students/classes). Cấu trúc tx GIỮ NGUYÊN.
  const created = await withUniqueRetry(() =>
    sdb.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Prisma.TransactionClient;
      const code = await generateOrderCode(tx);
      const order = await tx.order.create({
      data: {
        code,
        type: data.type,
        status: data.status,
        customerName: data.customerName.trim(),
        customerPhone: data.customerPhone.trim(),
        // P5 — validator đã trim + lowercase + đưa ô trống về null.
        customerEmail: data.customerEmail,
        customerCccd: data.customerCccd?.trim() || null,
        customerAddress: data.customerAddress?.trim() || null,
        customerWard: data.customerWard?.trim() || null,
        customerCity: data.customerCity?.trim() || null,
        // Suy từ các dòng — xem `studentIdCuaDon` bên trên. KHÔNG dùng `data.studentId`.
        studentId: studentIdCuaDon,
        leadId: data.leadId || null,
        centerId: data.centerId || null,
        // Người tạo đơn — cột danh sách /admin/orders. Lấy từ phiên, KHÔNG nhận từ
        // client: đây là thứ dùng để quy trách nhiệm, để client gửi lên là tự mở đường
        // ghi tên người khác vào đơn của mình.
        createdById: session.user.id ?? null,
        paymentMethodId: data.paymentMethodId,
        subtotal,
        // TỔNG các dòng — không phải một số nhập độc lập. Hai đường nhập cho cùng một
        // con tiền là định nghĩa của sổ lệch.
        discountAmount: tien.tongGiam,
        // Snapshot cách nhập giảm giá + giải trình.
        //
        // ⚠️ 14/09/2026 — KHÔNG còn set `discountApprovalStatus`/`discountRequestedById`:
        // đơn mới không đi vào hàng chờ duyệt nữa. Hai cột GIỮ trong schema (dữ liệu cũ
        // đang mang giá trị thật, và drop cột trên bảng có dữ liệu prod là đợt riêng —
        // luật cứng #4), chỉ không có đường GHI mới.
        // % nay là thuộc tính của DÒNG (mỗi dòng một mức), nên ở cấp đơn nó vô nghĩa.
        discountPercent: null,
        discountReason: giaiTrinhGop,
        shippingFee: data.shippingFee,
        totalAmount,
        customerNote: data.customerNote?.trim() || null,
        internalNote: data.internalNote?.trim() || null,
        items: {
          create: data.items.map((it, i) => ({
            type: it.type,
            itemName: it.itemName,
            itemDescription: it.itemDescription || null,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            // TẠM TÍNH của dòng (trước giảm) — `Order.subtotal` = Σ cột này.
            totalPrice: tien.dong[i]!.tamTinh,
            // Số SERVER tính, không phải số client gửi.
            //
            // `discountAmount` là TỔNG của dòng (cột tiền, `Order.discountAmount` = Σ nó);
            // `discountPercent` chỉ có nghĩa khi dòng có ĐÚNG MỘT khoản kiểu %;
            // `discountReason` là bản ghép để đường đọc cũ không phải biết về JSON;
            // `discounts` là bản chi tiết — nguồn sự thật cho hiển thị.
            discountAmount: tien.dong[i]!.giam,
            discountPercent: tien.dong[i]!.phanTram,
            discountReason:
              tien.dong[i]!.khoan
                .filter((k) => k.giam > 0 && k.lyDo)
                .map((k) => k.lyDo)
                .join(" · ") || null,
            discounts:
              tien.dong[i]!.khoan.length > 0
                ? (tien.dong[i]!.khoan as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            packageId: it.packageId || null,
            examAttemptId: it.examAttemptId || null,
            productId: it.productId || null,
            // Đã được gác ở `hocVienHopLe` bên trên — chỉ id đã tra qua `scopedDb` mới
            // lọt tới đây. Id lạ/ngoài cơ sở đã bị từ chối cả đơn, không âm thầm hoá null.
            studentId: it.studentId || null,
            // CON LEAD đi vào `metadata.leadChildId` (đã gác bằng `conLeadTrenDong` bên
            // trên). Vì sao metadata chứ không một cột riêng: `LeadChild` KHÔNG có cột
            // `studentId`, và cầu nối THẬT giữa hai thế giới là `Enrollment.leadChildId`
            // do `convert-lead-v2` ghi lúc chốt — nên giá trị này chỉ cần sống tới lúc
            // convert rồi ráp lại. Thêm một cột + migration trên bảng có dữ liệu prod cho
            // một giá trị tạm là không xứng, và `metadata` vốn đã giữ `courseId` cùng họ.
            metadata:
              (veMetadataConLead(
                (it.metadata as Record<string, unknown> | null) ?? null,
                it.leadChildId || null,
              ) as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
          })),
        },
      },
      select: { id: true, code: true },
    });

    // 03/08 — đơn nào cũng phải có phiếu thu để xuất được QR. Đơn mới = chưa trả
    // góp ⇒ đúng MỘT phiếu "thu toàn đơn" (installmentNo=0, amountDue=totalAmount).
    // Phiếu theo đợt chỉ ra đời khi QLCS duyệt kế hoạch (lib/payments/payment-request.ts).
    // Cùng transaction với order.create: có đơn là có phiếu, không có nửa vời.
    await ensureFullOrderRequest(tx, {
      id: order.id,
      code: order.code,
      totalAmount,
      centerId: data.centerId || null,
    });

    // Phase 5.10.1 — Stock decrement + SALE movement for PRODUCT orders.
    // Inside same tx so order + stock move atomically. Defensive guard:
    // if a concurrent order race makes stock < 0, throw to rollback.
    if (productSnapshot) {
      const updated = await tx.product.update({
        where: { id: productSnapshot.productId },
        data: {
          stockOnHand: { decrement: productSnapshot.quantityRequested },
        },
        select: { stockOnHand: true },
      });

      if (updated.stockOnHand < 0) {
        throw new Error("PRODUCT_STOCK_INSUFFICIENT_RACE");
      }

      await tx.productMovement.create({
        data: {
          productId: productSnapshot.productId,
          type: "SALE",
          quantity: -productSnapshot.quantityRequested,
          reason: `Bán theo đơn ${order.code}`,
          orderId: order.id,
          stockBeforeMovement: productSnapshot.currentStock,
          stockAfterMovement: updated.stockOnHand,
          createdByUserId: actorId,
          createdByName: actorName,
        },
      });
    }

    // ⚠️ TRONG CÙNG TRANSACTION — "có đơn là có log", không nửa vời. Trước bản này
    // đường tạo đơn KHÔNG ghi một dòng AuditLog nào (đo trên DB: chỉ có
    // DISCOUNT_APPROVED), nên hạ giá là tuyệt đối vô dấu.
    //
    // Ghi CẢ đơn khớp giá lẫn đơn lệch giá: chỉ ghi đơn lệch thì "không có log"
    // trở thành hai nghĩa khác nhau (chưa từng ghi / đã soát và không lệch), và
    // người soát sau không phân biệt được.
    await writeAudit({
      actor: { id: actorId, name: actorName },
      module: "orders",
      entityType: "Order",
      entityId: order.id,
      action: "CREATE",
      newValues: {
        orderCode: order.code,
        subtotal,
        discountAmount: tien.tongGiam,
        discountReason: giaiTrinhGop,
        totalAmount,
        // Giảm giá theo TỪNG DÒNG (15/09/2026). Ghi cả bản chi tiết chứ không chỉ tổng:
        // tổng không nói được bớt cho ĐỨA NÀO, mà đó đúng là câu hỏi sẽ được hỏi lúc
        // hoàn tiền hoặc lúc phụ huynh thắc mắc.
        giamTungDong: tien.dong.map((d, i) => ({
          dong: i + 1,
          hocVienId: data.items[i]?.studentId ?? null,
          tamTinh: d.tamTinh,
          giam: d.giam,
          thanhTien: d.thanhTien,
          // TỪNG KHOẢN, không chỉ tổng: tổng không nói được bớt theo chương trình nào.
          khoan: d.khoan.map((k) => ({
            kieu: k.kieu,
            giaTri: k.giaTri,
            giam: k.giam,
            lyDo: k.lyDo,
          })),
        })),
        // Dấu vết giá — đủ để soát lại mà không phải mở lại payload.
        giaLech: soatGia.coLech,
        giaTongLechThap: soatGia.tongLechThap,
        giaDongLech: soatGia.dongLech,
        // Hình thức lớp đã KHAI trên từng dòng. Ghi ở đây để đơn bán Coach có lời giải
        // thích đi kèm ngay cạnh `giaLech` — bán 1-1 ×2,0 là HỢP LỆ theo công văn nhưng
        // vẫn rơi vào CAO_HON, và người soát sau cần biết vì sao mà không phải mở payload.
        hinhThucLop: hinhThucDong.map((h) => h.coachFormat),
        soBuoiKhai: hinhThucDong.map((h) => h.soBuoi),
      },
      orgUnitId: data.centerId || null,
      tx,
    });

      return order;
    }),
  );

  // ── KẾ HOẠCH THANH TOÁN LẬP NGAY LÚC TẠO ĐƠN [15/09/2026] ───────────────────
  //
  // Chủ dự án: *"đưa phần kế hoạch thanh toán ra trang tạo đơn hàng luôn đi"*. Từ đây
  // người bán chia đợt NGAY trên form tạo đơn, và mở trang chi tiết là đã có sẵn phiếu
  // thu + QR cho từng đợt.
  //
  // ⚠️ NGOÀI transaction tạo đơn, CÓ CHỦ ĐÍCH. `recordInstallmentPlan` mở `db.$transaction`
  // của riêng nó (`lib/orders/installments.ts`) và đọc lại đơn qua `db` — lồng nó vào tx ở
  // trên là đọc một bản ghi CHƯA COMMIT bằng một kết nối khác, tức luôn "Không tìm thấy
  // đơn". Nhét nó vào trong sẽ đòi mổ cả hàm đó, mà hàm đó là đường ghi tiền của 3 chỗ gọi
  // khác; đợt này không mở việc ấy ra.
  //
  // ⚠️ THẤT BẠI Ở ĐÂY KHÔNG ĐƯỢC LÀM HỎNG CÂU TRẢ LỜI "đã tạo đơn". Đơn ĐÃ nằm trong DB;
  // trả `ok: false` là để người bán tin là chưa tạo được rồi bấm lại — và có hai đơn thật
  // cho một khách. Trả kèm CẢNH BÁO để form nói đúng: đơn xong, kế hoạch thì mở trang chi
  // tiết mà đặt lại (khối kế hoạch ở đó vẫn làm được đúng việc ấy).
  //
  // `try/catch` vì `materializeInstallmentRequests` NÉM (`InstallmentMoneyBlocked`) chứ
  // không trả lỗi. Đơn vừa sinh ra thì không thể có phân bổ nào nên cổng A6 không thể nổ ở
  // đây — nhưng một ngoại lệ lọt ra là mất luôn mã đơn vừa tạo khỏi câu trả lời, nên bọc.
  let canhBaoKeHoach: string | null = null;
  const keHoach = data.keHoachDot ?? [];
  if (keHoach.length > 0) {
    try {
      const resKh = await recordInstallmentPlan({
        orderId: created.id,
        // Quy đổi ở BIÊN bằng hàm dùng chung với `recordOrderInstallmentsAction` — hai
        // bản quy đổi ngày/cờ đã-thu là hai cách ghi lệch sổ.
        dots: dotsGhiTuForm(keHoach),
        actorId: session.user.id ?? null,
      });
      if (!resKh.ok) canhBaoKeHoach = resKh.error ?? "Không lưu được kế hoạch thanh toán";
    } catch (err) {
      console.error("[orders] luu ke hoach luc tao don that bai:", err);
      canhBaoKeHoach =
        err instanceof Error ? err.message : "Không lưu được kế hoạch thanh toán";
    }
    revalidatePath(`/orders/${created.id}`);
  }

  // Dòng lịch sử trên hồ sơ lead — chỉ khi đơn có gắn lead (đơn bán lẻ tạo tay thì
  // `leadId` là null và không có hồ sơ nào để kể).
  //
  // ⚠️ ĐẶT SAU TRANSACTION và dùng cửa BỎ QUA LỖI: đây là đường CHẠM TIỀN. Nhét lời gọi
  // này vào trong `$transaction` ở trên là để một lỗi ghi LỊCH SỬ cuộn lại cả cái ĐƠN,
  // cả phiếu thu, cả trừ kho — luật rollback của repo: `throw` trong callback là cuộn
  // toàn bộ. Lịch sử không bao giờ được quyền giết nghiệp vụ tiền.
  if (data.leadId) {
    await ghiTuongTacLeadBoQuaLoi({
      leadId: data.leadId,
      actorId,
      actorName,
      moc: new Date(),
      sk: { viec: "don.tao", maDon: created.code, tongTien: totalAmount },
    });
  }

  revalidatePath("/orders");
  if (productSnapshot) {
    revalidatePath("/products");
    revalidatePath(`/products/${productSnapshot.productId}`);
  }

  sendEmailForTrigger({
    trigger: "ORDER_CONFIRMATION",
    recipient: {
      email: data.customerEmail,
      name: data.customerName,
    },
    vars: {
      customer_name: data.customerName,
      order_code: created.code,
      total_amount: totalAmount,
      payment_method: pm.name ?? "—",
      order_date: new Date(),
      items_list: renderItemsListHtml(data.items),
    },
    context: { type: "Order", id: created.id },
    triggerType: "SYSTEM",
    actor: { userId: actorId, name: actorName },
  }).catch((err) => {
    console.error("[email] ORDER_CONFIRMATION trigger error:", err);
  });

  // P5 — khách không có email thì email trigger ở trên tự bỏ qua; ZNS lo phần đó.
  void notifyOrderByZnsIfNoEmail(created.id);

  return {
    ok: true as const,
    id: created.id,
    code: created.code,
    // Đơn ĐÃ tạo nhưng kế hoạch thì chưa — form phải nói ra, không được im.
    canhBaoKeHoach,
  };
}

function renderItemsListHtml(
  items: Array<{ itemName: string; quantity: number; unitPrice: number }>,
): string {
  const rows = items
    .map((it) => {
      const lineTotal = it.unitPrice * it.quantity;
      return `<li>${escapeHtml(it.itemName)} × ${it.quantity} = ${lineTotal.toLocaleString("vi-VN")} đ</li>`;
    })
    .join("");
  return `<ul>${rows}</ul>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── CHANGE STATUS ──────────────────────────────────────────────────
export async function changeOrderStatusAction(
  orderId: string,
  input: unknown,
  // FIX-H9 — optimistic lock: Order.updatedAt (ISO) client đã thấy. Lệch → STALE_WRITE.
  expectedUpdatedAt?: string,
) {
  const session = await requireOrdersManage();
  const parsed = orderStatusChangeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Dữ liệu không hợp lệ" };
  }

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  // findUnique qua scopedDb đã chống IDOR (ngoài scope → null); giữ passesScope làm belt-and-suspenders.
  const order = await sdb.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      // Mã đơn cho dòng lịch sử trên hồ sơ lead — người đọc cần biết ĐƠN NÀO đổi trạng
      // thái, `id` (cuid) thì không nói gì với họ.
      code: true,
      status: true,
      centerId: true,
      leadId: true,
      totalAmount: true,
      discountApprovalStatus: true,
    },
  });
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false as const, error: "Không tìm thấy đơn hàng" };
  }

  // ⚠️ ĐÃ GỠ [14/09/2026] — cổng "giảm giá chưa duyệt thì chưa xác nhận đơn" (BGĐ 31/07).
  // Gỡ CÙNG LÚC với cổng máy chốt ở `lib/payments/payos-ingest.ts`: lệch nhịp thì webhook
  // chốt được mà người không chốt được (hoặc ngược lại), và không ai đọc ra vì sao.
  // Thay cho nó là dấu vết `lib/orders/price-guard.ts` + AuditLog ORDER_CREATED.

  if (order.status === parsed.data.toStatus) {
    return {
      ok: false as const,
      error: "Trạng thái mới giống trạng thái hiện tại",
    };
  }

  if (!canTransition(order.status, parsed.data.toStatus)) {
    return {
      ok: false as const,
      error: `Không thể chuyển từ "${order.status}" sang "${parsed.data.toStatus}"`,
    };
  }

  const { actorId, actorName } = getAuditActor(session);
  const metadata = await getRequestMetadata();
  const expectedAt = expectedUpdatedAt ? new Date(expectedUpdatedAt) : null;

  // A0-04: tx từ scopedDb — cast (tiền lệ). Cấu trúc transaction tiền GIỮ NGUYÊN
  // (updateMany optimistic-lock + history + ensureOrderPaymentRecorded atomic).
  const txResult = await sdb.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Prisma.TransactionClient;
    const updateData: Prisma.OrderUpdateInput = {
      status: parsed.data.toStatus,
    };

    if (
      parsed.data.toStatus === "CONFIRMED" &&
      order.status === "PENDING_PAYMENT"
    ) {
      updateData.confirmedByUserId = actorId;
      updateData.confirmedAt = new Date();
      updateData.paidAt = new Date();
    }

    // FIX-H9 — ghi có điều kiện updatedAt; 0 row ⇒ người khác vừa sửa → STALE_WRITE.
    const upd = await tx.order.updateMany({
      where: { id: orderId, ...(expectedAt ? { updatedAt: expectedAt } : {}) },
      data: updateData as Prisma.OrderUpdateManyMutationInput,
    });
    if (upd.count === 0) return { stale: true as const };

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: parsed.data.toStatus,
        changedByUserId: actorId,
        changedByName: actorName,
        reason: parsed.data.reason?.trim() || null,
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });

    // ── PHIÊN A (16/09/2026) · HUỶ ĐƠN PHẢI VOID PHIẾU THU ────────────────────
    //
    // Trước bản này, huỷ đơn chỉ đổi `Order.status` — **phiếu thu ở nguyên `PENDING`**. Cộng
    // với việc tầng đối khớp không kiểm trạng thái đơn (đã vá cùng phiên ở
    // `payos-ingest.ts`), hai lỗ ghép lại thành: đơn huỷ → phiếu vẫn sống → phụ huynh quét lại
    // ảnh QR cũ trong điện thoại → `matchKey` bền theo đời phiếu nên khớp ngay → tiền vào một
    // đơn không còn tồn tại. Không ai thấy, vì màn đơn đã huỷ thì chẳng ai mở.
    //
    // ⚠️ VOID mọi phiếu CHƯA PAID, kể cả `PARTIAL` (đã có một phần tiền). VOID **không xoá**
    // đồng nào: `PaymentAllocation` còn nguyên, tiền vẫn truy được. Nó chỉ thôi làm ĐÍCH RÓT.
    // Bỏ `PARTIAL` ra khỏi danh sách là để lại đúng cái phiếu nguy hiểm nhất — phiếu mà khách
    // đã từng quét thành công một lần.
    //
    // ⚠️ Phiếu `PAID` KHÔNG đụng: nó là bằng chứng một lần thu đã hoàn tất. Huỷ đơn không xoá
    // lịch sử tiền; phần xử lý tiền của đơn huỷ là việc của kế toán (hoàn), không phải của một
    // lệnh đổi trạng thái.
    if (parsed.data.toStatus === "CANCELLED") {
      await tx.paymentRequest.updateMany({
        where: { orderId, status: { in: ["PENDING", "PARTIAL"] } },
        data: { status: "VOID" },
      });
      // Mã QR đang sống của các phiếu đó cũng phải chết theo — nếu không thì màn hình vẫn
      // hiện một mã bấm được, và affordance đó nói dối (luật 12).
      await tx.qrSession.updateMany({
        where: { paymentRequest: { orderId }, status: "ACTIVE" },
        data: { status: "EXPIRED" },
      });
    }

    // S1 — xác nhận đơn (thu offline): nếu CHƯA có khoản RECORDED nào (đơn không đi qua
    // installments) → ghi 1 Payment(RECORDED) cho phần đã thu (idempotent theo marker
    // [auto:order-confirm]). Tránh double-count khi installments đã ghi sổ.
    if (parsed.data.toStatus === "CONFIRMED" && order.status === "PENDING_PAYMENT") {
      const recorded = await tx.payment.aggregate({
        where: { orderId, ...KHOAN_DA_GHI_NHAN },
        _count: { _all: true },
      });
      if (recorded._count._all === 0) {
        await ensureOrderPaymentRecorded(tx, {
          orderId,
          amount: order.totalAmount,
          leadId: order.leadId,
          centerId: order.centerId,
          actor: { id: actorId, name: actorName },
        });
      }
    }
    return { stale: false as const };
  });

  if (txResult.stale) return { ok: false as const, error: "STALE_WRITE" };

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  // S6 — đồng bộ trang lead/convert (đổi trạng thái đơn ảnh hưởng "đủ điều kiện chốt").
  if (order.leadId) {
    // Dòng lịch sử — SAU transaction, cửa BỎ QUA LỖI (đường chạm tiền: transaction trên
    // vừa ghi `Payment`, VOID phiếu thu, hết hạn mã QR).
    await ghiTuongTacLeadBoQuaLoi({
      leadId: order.leadId,
      actorId,
      actorName,
      moc: new Date(),
      sk: {
        viec: "don.doi-trang-thai",
        maDon: order.code,
        tu: order.status,
        den: parsed.data.toStatus,
      },
    });
    revalidatePath(`/leads/${order.leadId}`);
    revalidatePath(`/leads/${order.leadId}/convert`);
  }

  // BGĐ 31/07 — xác nhận thanh toán → tự cấp tài khoản phụ huynh theo SĐT + báo ZNS.
  // Fire-and-forget, idempotent (đã có tài khoản → không tạo/gửi lại).
  if (parsed.data.toStatus === "CONFIRMED") {
    ensureParentAccountForOrder(orderId).catch((err) =>
      console.error("[order-confirm] provision parent:", err),
    );
  }

  // Fire PAYMENT_RECEIPT when order transitions to CONFIRMED (paidAt set).
  if (parsed.data.toStatus === "CONFIRMED") {
    const orderForEmail = await sdb.order.findUnique({
      where: { id: orderId },
      include: { paymentMethod: { select: { name: true } } },
    });
    if (orderForEmail) {
      sendEmailForTrigger({
        trigger: "PAYMENT_RECEIPT",
        recipient: {
          email: orderForEmail.customerEmail,
          name: orderForEmail.customerName,
        },
        vars: {
          customer_name: orderForEmail.customerName,
          order_code: orderForEmail.code,
          total_amount: orderForEmail.totalAmount,
          payment_method: orderForEmail.paymentMethod?.name ?? "—",
          paid_at: orderForEmail.paidAt ?? new Date(),
        },
        context: { type: "Order", id: orderForEmail.id },
        triggerType: "SYSTEM",
        actor: { userId: actorId, name: actorName },
      }).catch((err) => {
        console.error("[email] PAYMENT_RECEIPT trigger error:", err);
      });

      // P5 — biên nhận qua ZNS cho khách không có email (xem lib/notify/order.ts).
      void notifyOrderByZnsIfNoEmail(orderForEmail.id);
    }
  }

  return { ok: true as const };
}

// ─── UPDATE NOTES (admin internal note) ─────────────────────────────
export async function updateOrderNoteAction(
  orderId: string,
  internalNote: string,
  // FIX-H9 — optimistic lock: Order.updatedAt (ISO) client đã thấy. Lệch → STALE_WRITE.
  expectedUpdatedAt?: string,
) {
  const session = await requireOrdersManage();

  if (internalNote.length > 2000) {
    return { ok: false as const, error: "Ghi chú quá dài (max 2000 ký tự)" };
  }

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const order = await sdb.order.findUnique({
    where: { id: orderId },
    // `leadId` + `code` cho dòng lịch sử trên hồ sơ lead.
    select: { id: true, centerId: true, leadId: true, code: true },
  });
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false as const, error: "Không tìm thấy đơn hàng" };
  }

  const expectedAt = expectedUpdatedAt ? new Date(expectedUpdatedAt) : null;
  // FIX-H9 — ghi có điều kiện updatedAt; 0 row ⇒ người khác vừa sửa → STALE_WRITE.
  const upd = await sdb.order.updateMany({
    where: { id: orderId, ...(expectedAt ? { updatedAt: expectedAt } : {}) },
    data: { internalNote: internalNote.trim() || null },
  });
  if (upd.count === 0) return { ok: false as const, error: "STALE_WRITE" };

  if (order.leadId) {
    await ghiTuongTacLeadBoQuaLoi({
      leadId: order.leadId,
      ...getAuditActor(session),
      moc: new Date(),
      sk: { viec: "don.sua-ghi-chu", maDon: order.code },
    });
  }

  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

// ─── UPDATE PAYMENT METHOD (G4 — chỉ khi đơn CHƯA xác nhận thanh toán) ─
export async function updateOrderPaymentMethodAction(
  orderId: string,
  paymentMethodId: string,
  // FIX-H9 — optimistic lock: Order.updatedAt (ISO) client đã thấy. Lệch → STALE_WRITE.
  expectedUpdatedAt?: string,
) {
  const session = await requireOrdersManage();

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const order = await sdb.order.findUnique({
    where: { id: orderId },
    select: { id: true, centerId: true, status: true, type: true },
  });
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false as const, error: "Không tìm thấy đơn hàng" };
  }
  // G4 (chốt): chỉ cho sửa phương thức khi đơn còn DRAFT/PENDING_PAYMENT (chưa chốt tiền).
  if (order.status !== "DRAFT" && order.status !== "PENDING_PAYMENT") {
    return {
      ok: false as const,
      error: "Chỉ sửa phương thức khi đơn chưa xác nhận thanh toán",
    };
  }

  const pm = await sdb.paymentMethod.findUnique({
    where: { id: paymentMethodId },
    select: {
      id: true,
      isActive: true,
      centerId: true,
      canBuyCourse: true,
      canBuyPackage: true,
      canBuyExam: true,
      canBuyProduct: true,
    },
  });
  if (!pm) {
    return { ok: false as const, error: "Phương thức thanh toán không tồn tại" };
  }
  if (!pm.isActive) {
    return { ok: false as const, error: "Phương thức thanh toán đã bị vô hiệu hoá" };
  }
  // ĐƯỜNG GHI THỨ HAI của cùng một luật. Thiếu vế này thì cách né rất rẻ: tạo đơn đúng
  // phương thức rồi bấm "đổi phương thức" sang phương thức của cơ sở khác.
  // `order.centerId` đã có sẵn trong câu đọc ngay trên, không tốn thêm truy vấn nào.
  if (!methodServesCenter(pm, order.centerId)) {
    return { ok: false as const, error: METHOD_WRONG_CENTER_ERROR };
  }
  if (!methodAllowsOrderType(pm, order.type)) {
    return {
      ok: false as const,
      error: `Phương thức này không hỗ trợ loại đơn "${order.type}"`,
    };
  }

  const expectedAt = expectedUpdatedAt ? new Date(expectedUpdatedAt) : null;
  const upd = await sdb.order.updateMany({
    where: { id: orderId, ...(expectedAt ? { updatedAt: expectedAt } : {}) },
    data: { paymentMethodId },
  });
  if (upd.count === 0) return { ok: false as const, error: "STALE_WRITE" };

  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

// ─── HELPER: load form data cho create page ─────────────────────────
export async function loadCreateOrderFormData() {
  // G-A — dữ liệu nạp form tạo đơn: cổng theo `orders:create` (không phải
  // `orders:manage`), nếu không Sale mở trang sẽ bị đá về dashboard.
  const { session } = await requireOrdersCreate();
  // PaymentMethod/Course/Product là catalog, Center exempt — scopedDb pass-through.
  const sdb = scopedDb(await resolveActor(session.user.id));

  const [paymentMethods, courses, products, centers, students] = await Promise.all([
    // Nạp CẢ phương thức của mọi cơ sở trong tầm nhìn (scopedDb đã lọc) + phương thức
    // dùng chung, rồi để client lọc lại theo cơ sở ĐANG CHỌN trên form. Cố ý không nạp
    // lại qua server action mỗi lần đổi cơ sở: hàm này chạy MỘT LẦN ở RSC trước khi
    // người dùng chọn gì, và thứ lọt xuống client chỉ là tên + cờ của phương thức —
    // không có số tài khoản nào (tài khoản nằm ở kho VietQR, không ở bảng này).
    sdb.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        centerId: true,
        canBuyCourse: true,
        canBuyPackage: true,
        canBuyExam: true,
        canBuyProduct: true,
      },
    }),
    sdb.course.findMany({
      // O1/O3: chỉ khoá DẠY thật (Sata 1–8 + combo teachable), loại 2 "danh mục"
      // Lập trình Robot / Luyện thi RoboSim (isTeachable=false). Combo 1&2 là course
      // teachable nên tự nằm trong danh sách "Khoá học".
      // O4: KHÔNG lọc isPublished — khoá Sata teachable bị seed để isPublished=false
      // (publish chỉ dùng cho trang marketing công khai). Đơn hàng gate theo isTeachable.
      where: { isActive: true, isTeachable: true },
      orderBy: { displayOrder: "asc" },
      // `totalSessions` + `slug`: hai thứ màn tạo đơn cần để GỢI Ý giá theo hình thức
      // lớp (SR.QD.219 Điều 5) — giá/buổi = price ÷ totalSessions, và `slug` để nhận ra
      // khoá công văn LOẠI khỏi Coach. Cả hai chỉ phục vụ gợi ý; cổng soát giá vẫn so
      // với `Course.price` như cũ.
      select: {
        id: true,
        code: true,
        name: true,
        price: true,
        type: true,
        slug: true,
        totalSessions: true,
      },
    }),
    sdb.product.findMany({
      // O3: đơn "Sản phẩm" chỉ gồm KIT_ROBOT + SENSOR.
      where: { status: "ACTIVE", category: { in: ["KIT_ROBOT", "SENSOR"] } },
      orderBy: { name: "asc" },
      take: 200,
      select: {
        id: true,
        sku: true,
        name: true,
        salePrice: true,
        stockOnHand: true,
        category: true,
      },
    }),
    sdb.center.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // ── HỌC VIÊN cho ô "của con nào" trên từng dòng hàng (15/09/2026) ──────────
    //
    // Chủ dự án: "phụ huynh có 2 con và học 2 khoá khác nhau thì phải tạo 2 đơn à?"
    // Một đơn nhiều dòng thì mỗi dòng phải nói được nó mua cho ai
    // (`OrderItem.studentId`).
    //
    // `Student` là SCOPED_MODEL ⇒ `scopedDb` đã tự lọc theo cơ sở của actor; cổng ghi
    // `createOrderManualAction` vẫn tra lại độc lập (scopedDb KHÔNG che write).
    //
    // `parentPhone` đi kèm vì đó là thứ người nhập đối chiếu: một trung tâm có nhiều em
    // trùng tên, và người bán đang cầm SĐT của phụ huynh trước mặt. Chỉ SĐT phụ huynh,
    // KHÔNG kèm gì thêm — danh sách này rơi xuống client.
    sdb.student.findMany({
      where: { deletedAt: null, status: { not: "INACTIVE" } },
      orderBy: { name: "asc" },
      take: 1000,
      select: { id: true, name: true, parentName: true, parentPhone: true },
    }),
  ]);

  return { paymentMethods, courses, products, centers, students };
}

// ─── MANUAL SEND EMAIL từ template (Phase 5.13.1) ───────────────────
export async function sendManualOrderEmailAction(input: {
  orderId: string;
  templateId: string;
  toEmail: string;
  toName?: string | null;
}) {
  const session = await requireOrdersManage();

  if (!input.toEmail?.trim()) {
    return { ok: false as const, error: "Vui lòng nhập email người nhận" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.toEmail)) {
    return { ok: false as const, error: "Email không hợp lệ" };
  }

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const [template, order] = await Promise.all([
    sdb.emailTemplate.findUnique({ where: { id: input.templateId } }),
    sdb.order.findUnique({
      where: { id: input.orderId },
      include: {
        items: true,
        paymentMethod: { select: { name: true } },
      },
    }),
  ]);
  if (!template)
    return { ok: false as const, error: "Template không tồn tại" };
  if (!template.isActive)
    return { ok: false as const, error: "Template đã bị tắt" };
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false as const, error: "Đơn hàng không tồn tại" };
  }

  const itemsListInner = order.items
    .map(
      (it) =>
        `<li>${it.itemName} × ${it.quantity} = ${(it.unitPrice * it.quantity).toLocaleString("vi-VN")} đ</li>`,
    )
    .join("");

  const vars = {
    customer_name: order.customerName,
    order_code: order.code,
    total_amount: order.totalAmount,
    payment_method: order.paymentMethod?.name ?? "—",
    order_date: order.createdAt,
    paid_at: order.paidAt ?? "",
    items_list: itemsListInner ? `<ul>${itemsListInner}</ul>` : "",
  };

  const subject = renderTemplate(template.subject, vars);
  const bodyText = renderTemplate(template.bodyText, vars);
  const bodyHtml = renderTemplate(template.bodyHtml, vars);

  const { actorId, actorName } = getAuditActor(session);

  const result = await sendEmail({
    to: input.toEmail.trim(),
    toName: input.toName ?? undefined,
    subject,
    bodyText,
    bodyHtml,
    fromName: template.fromName ?? undefined,
    replyTo: template.replyTo ?? undefined,
    templateId: template.id,
    contextType: "Order",
    contextId: order.id,
    triggeredByUserId: actorId,
    triggeredByName: actorName,
    triggerType: "MANUAL",
  });

  if (!result.ok) {
    return { ok: false as const, error: result.error };
  }

  revalidatePath(`/orders/${input.orderId}`);
  return { ok: true as const, logId: result.logId };
}

// ─── TÌM PHỤ HUYNH THEO SĐT (15/09/2026) ─────────────────────────────────────
//
// Chủ dự án: *"ở phần khách hàng thì khi nhập sđt sẽ thấy lead của sđt đó ... chọn sđt xong
// thì tự điền tên PH, và ở dưới khoá học thì tên học viên được chọn sẵn 1 trong số con của
// PH luôn."*
//
// SĐT LÀ NEO của cả form: từ nó suy ra tên phụ huynh, cơ sở, và danh sách con. Trước bản
// này sale phải gõ tay tên PH rồi tự tìm con trong danh sách 250 học viên của cả cơ sở.
//
// ⚠️ TÌM THEO YÊU CẦU, KHÔNG NẠP CẢ BẢNG vào form. Đo 15/09: 122 lead / 123 con — nạp
// hết vẫn chạy được HÔM NAY, nhưng bảng lead là bảng phình theo thời gian (mỗi quảng cáo
// một đợt lead mới), nên một form nạp-tất-cả là bom hẹn giờ không ai nhớ đã cài. Học viên
// thì vẫn dùng danh sách đã nạp sẵn (đã có `parentPhone`, lọc ở client là đủ).
//
// ⚠️ `phoneVariants` BẮT BUỘC: DB đang có CẢ HAI dạng `0…` và `84…` (xem lib/phone.ts —
// 6 hàm chuẩn hoá khác nhau thời trước). Tra bằng đúng chuỗi người dùng gõ là trượt hết
// bản ghi dạng kia.
export async function timPhuHuynhTheoSdtAction(sdt: string): Promise<{
  ok: boolean;
  leads?: Array<{
    id: string;
    parentName: string;
    phone: string;
    email: string | null;
    centerId: string | null;
    /**
     * Con LEAD KHAI — có thể CHƯA có hồ sơ `Student` nào.
     *
     * ⚠️ MANG CẢ `id` từ 16/09/2026. Bản cũ chỉ trả TÊN, nên ô chọn học viên ở dòng đơn
     * không có gì để lưu và con của lead chưa convert KHÔNG chọn được — dù tên em đang
     * hiện ngay trên dòng gợi ý. Chủ dự án: *"lead này đa số là lead chưa chốt nên chưa
     * phải là học viên nên sẽ lấy thông tin con của PH lead đó chứ"*.
     */
    conKhai: Array<{ id: string; fullName: string }>;
  }>;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  // Cùng cổng với trang tạo đơn: ai tạo được đơn thì tra được SĐT khách của mình.
  if (!(await checkPermission("orders:create"))) return { ok: false, error: "Không có quyền" };

  const so = (sdt ?? "").replace(/\D/g, "");
  // Dưới 6 chữ số thì mọi SĐT đều khớp — trả rỗng thay vì đổ nửa bảng lead lên màn.
  if (so.length < 6) return { ok: true, leads: [] };

  const actor = await resolveActor(session.user.id);
  const bienThe = expandPhoneVariants([so]);
  const rows = await scopedDb(actor).lead.findMany({
    where: {
      deletedAt: null,
      // Gõ đủ số → khớp chính xác theo mọi biến thể; gõ thiếu → khớp phần đuôi.
      OR: [{ phone: { in: bienThe } }, { phone: { contains: so } }],
    },
    select: {
      id: true,
      parentName: true,
      phone: true,
      email: true,
      centerId: true,
      children: { select: { id: true, fullName: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
    // Trần 8: danh sách gợi ý dài hơn thì người bán không đọc, chỉ bấm bừa.
    take: 8,
  });

  return {
    ok: true,
    leads: rows.map((l) => ({
      id: l.id,
      parentName: l.parentName,
      phone: l.phone,
      email: l.email,
      centerId: l.centerId,
      // ⚠️ MANG CẢ `id`, không chỉ tên [16/09/2026]. Trước bản này gợi ý lead chỉ trả về
      // TÊN con, nên ô chọn học viên không có gì để lưu và con của lead chưa convert
      // không chọn được — chủ dự án: *"lead này đa số là lead chưa chốt… sẽ lấy thông tin
      // con của PH lead đó chứ"*. Dòng đơn nay lưu `leadChildId`.
      conKhai: l.children.map((c) => ({ id: c.id, fullName: c.fullName })),
    })),
  };
}

// ─── THANH TOÁN LINH HOẠT — kế hoạch n đợt ───────────────────────────
//
// Chủ dự án chốt đổi "thanh toán 2 đợt" thành đóng theo 1/2/3/4 học phần. Luật chia tiền,
// hạn từng đợt và phép kiểm nằm ở `lib/payments/ke-hoach-dot.ts` (thuần, có test) —
// action này chỉ gác quyền/scope rồi chuyển tiếp.
export async function recordOrderInstallmentsAction(input: {
  orderId: string;
  dots: Array<{
    amount: number;
    daThu: boolean;
    dueDate: string | null;
    reminderDays?: number | null;
  }>;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  // orders:manage chỉ HO_ACCOUNTANT (GLOBAL) — không cần target.
  if (!(await checkPermission("orders:manage"))) return { ok: false, error: "Không có quyền" };

  const actor = await resolveActor(session.user.id);
  const order = await scopedDb(actor).order.findUnique({
    where: { id: input.orderId },
    select: { id: true, centerId: true, leadId: true },
  });
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false, error: "Không tìm thấy đơn hàng" };
  }

  // Ngày từ client là chuỗi — quy về Date ở BIÊN, để phần trong chỉ có một kiểu.
  // Phép quy đổi ở `dotsGhiTuForm` (thuần, có test): từ 15/09/2026 có HAI đường ghi kế
  // hoạch (đây + `createOrderManualAction`) nên nó không được viết tại chỗ nữa.
  const res = await recordInstallmentPlan({
    orderId: input.orderId,
    dots: dotsGhiTuForm(input.dots),
    actorId: session.user.id ?? null,
  });
  if (res.ok) {
    revalidatePath(`/orders/${input.orderId}`);
    // S6 — ghi sổ đợt 1 sinh Payment(RECORDED) → đồng bộ trang lead/convert.
    if (order.leadId) {
      revalidatePath(`/leads/${order.leadId}`);
      revalidatePath(`/leads/${order.leadId}/convert`);
    }
  }
  return res;
}

export async function markOrderInstallmentPaidAction(
  installmentId: string,
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  // orders:manage chỉ HO_ACCOUNTANT (GLOBAL) — không cần target.
  if (!(await checkPermission("orders:manage"))) return { ok: false, error: "Không có quyền" };

  // R7-00 AC4 — chặn IDOR chéo cơ sở: xác nhận đơn nằm trong scope trước khi mutate.
  const actor = await resolveActor(session.user.id);
  const order = await scopedDb(actor).order.findUnique({
    where: { id: orderId },
    select: { id: true, centerId: true, leadId: true },
  });
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false, error: "Không tìm thấy đơn hàng" };
  }

  // Truyền orderId ĐÃ scope-check để lib đối chiếu installment thuộc đúng đơn
  // (chống IDOR: installmentId của đơn khác cơ sở).
  const res = await markInstallmentPaid(installmentId, session.user.id ?? null, order.id);
  if (res.ok) {
    revalidatePath(`/orders/${orderId}`);
    // S6 — đóng đợt sinh Payment(RECORDED, nếu đã duyệt) → đồng bộ trang lead/convert.
    if (order.leadId) {
      revalidatePath(`/leads/${order.leadId}`);
      revalidatePath(`/leads/${order.leadId}/convert`);
    }
  }
  return res;
}

// ─── Row type for client ─────────────────────────────────────────────
export type OrderRow = Awaited<ReturnType<typeof queryOrders>>["items"][number];

// ─── THÔNG TIN NGƯỜI MUA TRÊN HOÁ ĐƠN (14/09/2026) ──────────────────────────
//
// Chủ dự án: "thiếu các trường thông tin của khách hàng để xuất hoá đơn khi kế toán duyệt".
// Bốn ô đo từ ba tờ hoá đơn thật mà `Order` chưa có — xem migration
// 20260914120000_hoa_don_thong_tin_nguoi_mua và `lib/finance/hoa-don/nguoi-mua.ts`.
//
// ⚠️ CHUỖI RỖNG GHI THÀNH `null`, KHÔNG ghi "". Đường đọc phân biệt "chưa khai" (rơi về
// cột `customer*`) với "đã khai"; một chuỗi rỗng lọt vào DB là "đã khai bằng ô trắng" —
// tên người mua biến mất khỏi tờ hoá đơn mà không ai thấy lỗi.
//
// KHÔNG chặn khi còn thiếu ô bắt buộc: người nhập thường có thông tin nhỏ giọt (gọi khách
// hỏi mã số thuế mất một buổi). Cổng "đủ chưa" nằm ở khâu XUẤT, và màn hiện rõ còn thiếu
// gì — chặn ở đây chỉ khiến người ta không lưu được phần đã có.
export async function luuThongTinHoaDonAction(
  orderId: string,
  input: {
    invoiceBuyerName?: string | null;
    invoiceCompanyName?: string | null;
    invoiceTaxCode?: string | null;
    invoiceEmail?: string | null;
  },
  expectedUpdatedAt?: string,
) {
  const session = await requireOrdersManage();

  const sach = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return t.length > 0 ? t : null;
  };
  const dulieu = {
    invoiceBuyerName: sach(input.invoiceBuyerName),
    invoiceCompanyName: sach(input.invoiceCompanyName),
    invoiceTaxCode: sach(input.invoiceTaxCode),
    invoiceEmail: sach(input.invoiceEmail),
  };
  for (const [k, v] of Object.entries(dulieu)) {
    if (v && v.length > 200) {
      return { ok: false as const, error: `Trường ${k} quá dài (tối đa 200 ký tự)` };
    }
  }
  if (dulieu.invoiceEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dulieu.invoiceEmail)) {
    return { ok: false as const, error: "Email nhận hoá đơn không hợp lệ" };
  }

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const order = await sdb.order.findUnique({
    where: { id: orderId },
    select: { id: true, centerId: true },
  });
  // `scopedDb` KHÔNG che write — gác lại lần nữa trước khi ghi.
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false as const, error: "Không tìm thấy đơn hàng" };
  }

  const expectedAt = expectedUpdatedAt ? new Date(expectedUpdatedAt) : null;
  const upd = await sdb.order.updateMany({
    where: { id: orderId, ...(expectedAt ? { updatedAt: expectedAt } : {}) },
    data: dulieu,
  });
  if (upd.count === 0) return { ok: false as const, error: "STALE_WRITE" };

  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

// ═════════════════════════════════════════════════════════════════════════════
// PHIÊN A (16/09/2026) — ĐỢT THU THEO TỪNG CON
//
// Chủ dự án chốt: *"Sale trên đơn: chọn con → nhập số tiền → hạn → 'Tạo đợt'. Số tiền ≤ học
// phí thực của con − đã thu − đợt đang mở của con. Không bắt lên lịch cả khoá."*
//
// ⚠️ HAI ĐIỂM KHÁC HẲN kế hoạch trả góp cũ (`recordInstallmentPlan`), và cả hai là chủ ý:
//   1. **Không đẻ dòng `Payment` nào.** Đợt chỉ là một khoản PHẢI THU; tiền vào sổ khi và chỉ
//      khi có giao dịch ngân hàng thật. Đó là lý do "Lưu kế hoạch xoá mềm Payment" không thể
//      tái diễn ở đường này — không có gì để dọn.
//   2. **Không đụng `OrderInstallment`.** Sổ kế hoạch cũ đóng băng theo quyết định của chủ dự
//      án; đợt theo con sống ở `PaymentRequest.orderItemId`.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Tạo MỘT đợt thu cho MỘT con.
 *
 * Cổng số tiền nằm ở `kiemTaoDot` (thuần, có test) — ở đây chỉ nạp dữ liệu và ghi.
 */
export async function taoDotChoConAction(input: {
  orderId: string;
  orderItemId: string;
  soTien: number;
  dueDate?: string | null;
}) {
  const session = await requireOrdersManage();
  const actor = await resolveActor(session.user.id);
  const { actorId, actorName } = getAuditActor(session);
  const sdb = scopedDb(actor);

  const order = await sdb.order.findUnique({
    where: { id: input.orderId },
    select: { id: true, centerId: true, orgUnitId: true, status: true },
  });
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false as const, error: "Không tìm thấy đơn hàng" };
  }
  if (!(await laThuTienLinhHoatBat(order.orgUnitId))) {
    return { ok: false as const, error: "Tính năng thu học phí linh hoạt chưa bật cho cơ sở này" };
  }

  const han = input.dueDate ? new Date(input.dueDate) : null;
  if (han && Number.isNaN(han.getTime())) {
    return { ok: false as const, error: "Hạn đóng không hợp lệ" };
  }

  // PHIÊN B — toàn bộ phần TIỀN chuyển vào `taoDotChoCon`: nó đọc công nợ BÊN TRONG transaction
  // đang giữ advisory lock của đơn. Bản PHIÊN A đọc `noTheoCon` ở ngay đây, ngoài khoá, nên hai
  // sale bấm cùng lúc đều thấy "chưa có đợt nào" và cùng tạo một đợt bằng trọn số nợ.
  //
  // Cổng "đơn còn nhận tiền không" cũng bỏ khỏi đây: `taoDotChoCon` hỏi bằng `locDonNhanTien()`,
  // đúng mảnh lọc mà tầng đối khớp dùng. Hai bản chép tay của một danh sách trạng thái là hai
  // bản sẵn sàng lệch nhau.
  const kq = await taoDotChoCon({
    orderId: order.id,
    orderItemId: input.orderItemId,
    soTien: input.soTien,
    dueDate: han,
    centerId: order.centerId,
    actor: { id: actorId ?? "", name: actorName },
  });
  if (!kq.ok) return kq;

  revalidatePath(`/orders/${input.orderId}`);
  return { ok: true as const };
}

/** Huỷ một đợt CHƯA CÓ TIỀN. Đợt đã nhận đồng nào thì không huỷ — xem `kiemHuyDot`. */
export async function huyDotChoConAction(input: { orderId: string; paymentRequestId: string }) {
  const session = await requireOrdersManage();
  const actor = await resolveActor(session.user.id);
  const { actorId, actorName } = getAuditActor(session);
  const sdb = scopedDb(actor);

  const order = await sdb.order.findUnique({
    where: { id: input.orderId },
    select: { id: true, centerId: true, orgUnitId: true },
  });
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false as const, error: "Không tìm thấy đơn hàng" };
  }
  if (!(await laThuTienLinhHoatBat(order.orgUnitId))) {
    return { ok: false as const, error: "Tính năng thu học phí linh hoạt chưa bật cho cơ sở này" };
  }

  const kq = await huyDotChoCon({
    orderId: order.id,
    paymentRequestId: input.paymentRequestId,
    centerId: order.centerId,
    actor: { id: actorId ?? "", name: actorName },
  });
  if (!kq.ok) return kq;

  revalidatePath(`/orders/${input.orderId}`);
  return { ok: true as const };
}

/**
 * Cổng chung cho ĐƯỜNG B (gắn / bỏ gắn khoản đã thu vào một bé).
 *
 * ⚠️ QUYỀN Ở ĐÂY KHÁC `taoDotChoConAction` NGAY TRÊN, và đó là chủ ý của chủ dự án
 * (chốt 18/09/2026): *"payments:record để gắn, payments:manage để bỏ gắn."*
 *
 * `taoDotChoConAction` gác bằng `requireOrdersManage()` (`orders:manage`, chỉ HO_ACCOUNTANT).
 * Đường B **không** dùng lại nó: tạo một khoản phải thu là việc của kế toán, còn gắn một
 * khoản ĐÃ THU cho đúng bé là việc thường ngày của sale — nó không sinh thêm nghĩa vụ tiền
 * nào, chỉ nói rõ tiền có sẵn thuộc về ai.
 *
 * ⚠️ `requireOrdersManage` còn `redirect()` khi thiếu quyền. Đường B **trả `{ ok: false }`**
 * chứ không redirect: nó được gọi từ một nút trong trang đang mở, và đá người dùng ra
 * `/dashboard` giữa lúc họ đang gắn tiền là mất luôn ngữ cảnh lẫn thao tác dở.
 *
 * Ba vế, thiếu vế nào cũng từ chối:
 *   1. quyền (`payments:record` để gắn / `payments:manage` để bỏ gắn);
 *   2. đơn nằm trong phạm vi cơ sở của người bấm (`passesScope`);
 *   3. **công tắc BẬT cho cơ sở GIỮ ĐƠN** — không phải cơ sở của người bấm. Cùng một sale mở
 *      hai đơn ở hai cơ sở thì phải thấy hai luồng khác nhau; đọc theo người bấm là pilot một
 *      cơ sở hoá ra bật cho mọi đơn mà người đó chạm vào.
 */
async function congDuongB(orderId: string, quyen: "payments:record" | "payments:manage") {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "Chưa đăng nhập" };
  if (!(await checkPermission(quyen))) {
    return { ok: false as const, error: "Không có quyền" };
  }

  const actor = await resolveActor(session.user.id);
  const order = await scopedDb(actor).order.findUnique({
    where: { id: orderId },
    select: { id: true, centerId: true, orgUnitId: true },
  });
  if (!order || !passesScope("Order", order, actor)) {
    // Câu chữ cố ý KHÔNG phân biệt "không có" với "không thuộc cơ sở bạn".
    return { ok: false as const, error: "Không tìm thấy đơn hàng" };
  }

  if (!(await laThuTienLinhHoatBat(order.orgUnitId))) {
    return {
      ok: false as const,
      error: "Tính năng thu học phí linh hoạt chưa bật cho cơ sở này",
    };
  }

  const { actorId, actorName } = getAuditActor(session);
  return { ok: true as const, order, actor: { id: actorId ?? "", name: actorName } };
}

/**
 * ĐƯỜNG B — gắn MỘT khoản đã thu cho MỘT bé.
 *
 * ⚠️ Một khoản gắn cho ĐÚNG MỘT bé. Chia một khoản cho nhiều bé đi đường RIÊNG —
 * `tachKhoanChoConAction` ngay dưới (mục 6 của `lib/finance/ghi-tien-don.ts`). Hàm này KHÔNG
 * bao giờ được chia tiền: "chỉ điền một cột đang trống" là toàn bộ lý do nó an toàn.
 */
export async function ganKhoanChoConAction(input: {
  orderId: string;
  paymentId: string;
  orderItemId: string;
}) {
  const cong = await congDuongB(input.orderId, "payments:record");
  if (!cong.ok) return { ok: false as const, error: cong.error };

  const kq = await ganKhoanDaThuChoCon({
    orderId: cong.order.id,
    paymentId: input.paymentId,
    orderItemId: input.orderItemId,
    actor: cong.actor,
  });
  if (!kq.ok) return kq;

  revalidatePath(`/orders/${input.orderId}`);
  return { ok: true as const, soTien: kq.soTien, tenCon: kq.tenCon };
}

/** ĐƯỜNG B — bỏ gắn. CHỈ kế toán (`payments:manage`), và BẮT BUỘC ghi lý do. */
export async function boGanKhoanChoConAction(input: {
  orderId: string;
  paymentId: string;
  lyDo: string;
}) {
  const cong = await congDuongB(input.orderId, "payments:manage");
  if (!cong.ok) return { ok: false as const, error: cong.error };

  const kq = await boGanKhoanKhoiCon({
    orderId: cong.order.id,
    paymentId: input.paymentId,
    lyDo: input.lyDo,
    actor: cong.actor,
  });
  if (!kq.ok) return kq;

  revalidatePath(`/orders/${input.orderId}`);
  return { ok: true as const, soTien: kq.soTien };
}

/**
 * ĐƯỜNG B · TÁCH — chia MỘT khoản đã thu cho NHIỀU bé [20/09/2026].
 *
 * ⚠️ QUYỀN: `payments:record`, **cùng quyền với "Gắn cho bé…"**, không phải `payments:manage`.
 *
 * Cân nhắc đã làm, vì lệnh này CÓ sinh một bút toán `ADJUSTMENT` — thứ trước nay chỉ kế toán
 * tạo. Nhưng bút toán ấy **đúng bằng −số tiền dòng gốc và trỏ thẳng vào dòng gốc**: nó không
 * đổi tổng tiền của đơn một đồng nào (`tongDaVe` trước = sau), và không tồn tại đầu vào nào
 * khiến nó đổi. Nó là CƠ CHẾ của phép ghi, không phải một quyết định về giá trị.
 *
 * Việc thật mà người bấm đang làm vẫn là ATTRIBUTION — *"9.530.000đ này của bé nào"* — đúng
 * việc thường ngày của sale, và là lý do chủ dự án đặt "Gắn cho bé…" ở `payments:record`.
 * Bắt nó lên `payments:manage` nghĩa là mỗi đơn hai con phải chờ kế toán mới nhập được tiền.
 *
 * Nếu sau này muốn siết: đổi MỘT chuỗi ở dòng `congDuongB(...)` dưới đây. Cổng đã tách sẵn.
 */
export async function tachKhoanChoConAction(input: {
  orderId: string;
  paymentId: string;
  phan: { orderItemId: string; soTien: number }[];
}) {
  const cong = await congDuongB(input.orderId, "payments:record");
  if (!cong.ok) return { ok: false as const, error: cong.error };

  // Chuẩn hoá đầu vào TRƯỚC khi đưa vào cổng. `kiemTachKhoan` đã chặn `NaN`/`Infinity` bằng
  // `tron()`, nhưng một `phan` không phải mảng sẽ ném ở `.filter` bên trong và biến một lỗi
  // dữ liệu thành lỗi 500 — người dùng nhận trang lỗi thay vì một câu tiếng Việt.
  if (!Array.isArray(input.phan) || input.phan.length === 0) {
    return { ok: false as const, error: "Chưa nhập số tiền cho bé nào" };
  }
  const phan = input.phan.map((p) => ({
    orderItemId: String(p?.orderItemId ?? ""),
    soTien: Number(p?.soTien ?? 0),
  }));

  const kq = await tachKhoanChoCon({
    orderId: cong.order.id,
    paymentId: input.paymentId,
    phan,
    actor: cong.actor,
  });
  if (!kq.ok) return kq;

  revalidatePath(`/orders/${input.orderId}`);
  return { ok: true as const, soTien: kq.soTien, soPhan: kq.soPhan, tenCon: kq.tenCon };
}
