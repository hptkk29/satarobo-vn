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
import { discountFromPercent } from "@/lib/orders/discount";
import { ensureParentAccountForOrder } from "@/lib/parents/provision";
import { ensureOrderPaymentRecorded } from "@/lib/finance/payment";
import { ensureFullOrderRequest } from "@/lib/payments/payment-request";
import { getRequestMetadata } from "@/lib/audit/headers";
import { getAuditActor } from "@/lib/audit/log";
import { writeAudit } from "@/lib/audit/audit-log";
import { soatGiaDon } from "@/lib/orders/price-guard";
import {
  hocVienTrenCacDong,
  studentIdChoDon,
  thieuHocVienODong,
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

  const items = rawItems.map((o) => ({
    ...o,
    // null = đơn tạo TRƯỚC 31/08/2026 (chưa có cột) hoặc người tạo đã bị xoá. Màn hình
    // in "—"; cố ý KHÔNG đoán bừa từ nguồn khác.
    createdByName: o.createdById ? (creatorNameById.get(o.createdById) ?? null) : null,
  }));

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
      select: { id: true },
    });
    if (thay.length !== hocVienIds.length) {
      return {
        ok: false as const,
        error:
          "Có học viên không tồn tại hoặc ngoài phạm vi của bạn — chọn lại ở dòng hàng",
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

  const subtotal = data.items.reduce(
    (s, it) => s + it.unitPrice * it.quantity,
    0,
  );

  // BGĐ 31/07 — giảm giá theo %: server tự quy ra số tiền (nguồn sự thật).
  if (data.discountPercent && data.discountPercent > 0) {
    data.discountAmount = discountFromPercent(subtotal, data.discountPercent);
  }

  const totalAmount = subtotal - data.discountAmount + data.shippingFee;
  if (totalAmount < 0) {
    return { ok: false as const, error: "Tổng tiền không thể âm" };
  }

  // ⚠️ 14/09/2026 — cơ chế DUYỆT đã gỡ, nhưng GIẢI TRÌNH thì GIỮ.
  //
  // Hai thứ này hay bị gộp làm một. "Duyệt" là một người phải bấm trước khi đơn đi tiếp
  // — đó là thứ chủ dự án bỏ. "Giải trình" là một dòng chữ nói vì sao bớt tiền — đó là
  // DẤU VẾT, và dấu vết chính là cái thay thế cổng duyệt, nên bỏ nó là bỏ cả hai.
  const coGiamGia = data.discountAmount > 0;
  if (coGiamGia && !data.discountReason?.trim()) {
    return { ok: false as const, error: "Nhập giải trình giảm giá" };
  }

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
        discountAmount: data.discountAmount,
        // Snapshot cách nhập giảm giá + giải trình.
        //
        // ⚠️ 14/09/2026 — KHÔNG còn set `discountApprovalStatus`/`discountRequestedById`:
        // đơn mới không đi vào hàng chờ duyệt nữa. Hai cột GIỮ trong schema (dữ liệu cũ
        // đang mang giá trị thật, và drop cột trên bảng có dữ liệu prod là đợt riêng —
        // luật cứng #4), chỉ không có đường GHI mới.
        discountPercent: data.discountPercent ?? null,
        discountReason: coGiamGia ? (data.discountReason?.trim() ?? null) : null,
        shippingFee: data.shippingFee,
        totalAmount,
        customerNote: data.customerNote?.trim() || null,
        internalNote: data.internalNote?.trim() || null,
        items: {
          create: data.items.map((it) => ({
            type: it.type,
            itemName: it.itemName,
            itemDescription: it.itemDescription || null,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: it.unitPrice * it.quantity,
            packageId: it.packageId || null,
            examAttemptId: it.examAttemptId || null,
            productId: it.productId || null,
            // Đã được gác ở `hocVienHopLe` bên trên — chỉ id đã tra qua `scopedDb` mới
            // lọt tới đây. Id lạ/ngoài cơ sở đã bị từ chối cả đơn, không âm thầm hoá null.
            studentId: it.studentId || null,
            metadata: (it.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
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
        discountAmount: data.discountAmount,
        discountPercent: data.discountPercent ?? null,
        discountReason: data.discountReason?.trim() || null,
        totalAmount,
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

  return { ok: true as const, id: created.id, code: created.code };
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
    select: { id: true, centerId: true },
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
  // Ngày hỏng (`Invalid Date`) quy về null rồi để `kiemKeHoachDot` từ chối với câu nói
  // được: cho `Invalid Date` đi tiếp là ghi `dueDate` rác vào DB và cron im lặng bỏ qua.
  const res = await recordInstallmentPlan({
    orderId: input.orderId,
    dots: input.dots.map((d) => {
      const ngay = d.dueDate ? new Date(d.dueDate) : null;
      return {
        amount: Math.round(d.amount),
        daThu: d.daThu === true,
        dueDate: ngay && !Number.isNaN(ngay.getTime()) ? ngay : null,
        reminderDays:
          d.reminderDays == null ? null : Math.max(0, Math.round(d.reminderDays)),
      };
    }),
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
