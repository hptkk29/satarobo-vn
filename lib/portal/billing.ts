import "server-only";
import { db } from "@/lib/db";
import { WHERE_THUC_THU, butToanThucThu, tinhThucThu } from "@/lib/finance/thuc-thu";
import { computeEnrollmentDebt } from "@/lib/finance/debt";

// =============================================================================
// PORTAL BILLING — Phase NHÓM 3
// Đơn hàng/học phí của các con (read-only). Lọc theo Student.parentUserId.
// =============================================================================

export type OrderRow = {
  id: string;
  code: string;
  type: string;
  status: string;
  totalAmount: number;
  paidAt: string | null;
  createdAt: string;
  studentName: string | null;
  items: string[];
};

export async function getParentOrders(parentUserId: string): Promise<OrderRow[]> {
  const children = await db.student.findMany({
    where: { parentUserId, deletedAt: null },
    select: { id: true },
  });
  const childIds = children.map((c) => c.id);
  if (childIds.length === 0) return [];

  const orders = await db.order.findMany({
    where: { studentId: { in: childIds }, deletedAt: null }, // FIX-C3
    select: {
      id: true,
      code: true,
      type: true,
      status: true,
      totalAmount: true,
      paidAt: true,
      createdAt: true,
      student: { select: { name: true } },
      items: { select: { itemName: true }, take: 10 },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return orders.map((o) => ({
    id: o.id,
    code: o.code,
    type: o.type,
    status: o.status,
    totalAmount: o.totalAmount,
    paidAt: o.paidAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
    studentName: o.student?.name ?? null,
    items: o.items.map((i) => i.itemName),
  }));
}

// =============================================================================
// R7-04 — PH chỉ thấy khoản đã được KẾ TOÁN chốt sổ. Khoản Sale mới ghi nhận (PENDING)
// và khoản bị từ chối (REJECTED) KHÔNG hiện tiền cho phụ huynh (AC1) — chỉ đếm làm chỉ
// dấu trạng thái.
//
// HT (27/08/2026) — "kế toán đã chốt sổ" đi qua đúng công thức thực thu dùng chung
// (`lib/finance/thuc-thu.ts`), KHÔNG còn lọc cứng `accountantStatus = "CONFIRMED"`.
// Lọc cứng như cũ bỏ sót hai loại bút toán mà chính hệ thống này ghi ra:
//   • REFUNDED — `refundPayment()` ghi bản MỚI số ÂM, không xoá bản gốc ⇒ PH hoàn tiền
//     xong vẫn thấy nguyên số đã đóng;
//   • ADJUSTED — `adjustPayment()` ghi bản MỚI mang số đúng, bản gốc giữ nguyên ⇒ PH
//     thấy số CŨ đã bị kế toán sửa bỏ.
// =============================================================================

/**
 * Nhãn tiếng Việt cho Payment.method (DB lưu mã thô: METHOD_OPTIONS admin +
 * "auto" từ lib/finance/payment.ts). UI portal B2C dùng
 * `PAYMENT_METHOD_LABEL[method] ?? method` — method lạ fallback nguyên văn.
 */
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "Tiền mặt",
  BANK_TRANSFER: "Chuyển khoản",
  VNPAY: "VNPAY",
  TINGEE: "Tingee",
  COD: "COD",
  auto: "Tự động",
};

/**
 * Loại bút toán, để màn học phí gọi đúng tên thay vì dán "Đã xác nhận" lên mọi dòng.
 * Một dòng ÂM mang nhãn "Đã xác nhận" là thứ khiến phụ huynh gọi điện lên hỏi.
 */
export type LoaiButToan = "THU" | "HOAN" | "DIEU_CHINH";

export const LOAI_BUT_TOAN_LABEL: Record<LoaiButToan, string> = {
  THU: "Đã xác nhận",
  HOAN: "Hoàn tiền",
  DIEU_CHINH: "Đã điều chỉnh",
};

export type ConfirmedPaymentRow = {
  id: string;
  orderId: string;
  orderCode: string | null;
  enrollmentId: string | null;
  studentName: string | null;
  /** ÂM với dòng hoàn tiền. */
  amount: number;
  method: string;
  paidDate: string;
  confirmedAt: string | null;
  receiptCode: string | null;
  loai: LoaiButToan;
};

/** Ánh xạ trạng thái kế toán → nhãn dòng cho phụ huynh. */
function loaiCua(accountantStatus: string): LoaiButToan {
  if (accountantStatus === "REFUNDED") return "HOAN";
  if (accountantStatus === "ADJUSTED") return "DIEU_CHINH";
  return "THU";
}

/** Resolve childIds: nhận sẵn mảng studentIds, hoặc tra theo parentUserId. */
async function resolveChildIds(
  client: typeof db,
  parentUserIdOrStudentIds: string | string[],
): Promise<string[]> {
  if (Array.isArray(parentUserIdOrStudentIds)) return parentUserIdOrStudentIds;
  const children = await client.student.findMany({
    where: { parentUserId: parentUserIdOrStudentIds, deletedAt: null },
    select: { id: true },
  });
  return children.map((c) => c.id);
}

/**
 * Sổ thu/hoàn của các con (read-only, cho portal). Đúng những bút toán mà kế toán đã
 * chốt và được tính vào "đã thanh toán" — `WHERE_THUC_THU`.
 *
 * ⚠️ DANH SÁCH NÀY PHẢI CỘNG RA ĐÚNG TỔNG "đã thanh toán" ở `getParentBilling`. Đổi tổng
 * mà không đổi danh sách là để phụ huynh nhìn thấy một bảng không cộng được — đúng loại
 * chi tiết sinh ra cuộc gọi khiếu nại. Vì vậy dòng HOÀN (số âm) và dòng ĐIỀU CHỈNH có
 * mặt ở đây, còn bản gốc đã bị điều chỉnh thay thế thì không.
 *
 * Dùng db trần: ràng buộc theo childIds là cổng sở hữu; PARENT actor không có center-role
 * nên KHÔNG center-scope (scopedDb sẽ lọc rỗng). `client` mặc định db.
 */
export async function getParentConfirmedPayments(
  client: typeof db,
  parentUserIdOrStudentIds: string | string[],
): Promise<ConfirmedPaymentRow[]> {
  const childIds = await resolveChildIds(client, parentUserIdOrStudentIds);
  if (childIds.length === 0) return [];

  const rows = await client.payment.findMany({
    where: {
      ...WHERE_THUC_THU,
      enrollment: { studentId: { in: childIds }, deletedAt: null },
    },
    select: {
      id: true,
      orderId: true,
      amount: true,
      accountantStatus: true,
      adjustmentOfId: true,
      method: true,
      paidDate: true,
      confirmedAt: true,
      enrollmentId: true,
      order: { select: { code: true } },
      enrollment: { select: { student: { select: { name: true } } } },
      receipts: {
        where: { status: "ACTIVE", deletedAt: null }, // FIX-C3

        select: { code: true },
        orderBy: { issuedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { paidDate: "desc" },
    take: 200,
  });

  // Lớp chắn: `WHERE_THUC_THU` đã loại bản gốc bị thay thế ở tầng SQL, hàm thuần lọc lại
  // để caller nào quên mảnh `where` vẫn không cộng đôi.
  const payments = butToanThucThu(rows);

  return payments.map((p) => ({
    id: p.id,
    orderId: p.orderId,
    orderCode: p.order?.code ?? null,
    enrollmentId: p.enrollmentId,
    studentName: p.enrollment?.student?.name ?? null,
    amount: p.amount,
    method: p.method,
    paidDate: p.paidDate.toISOString(),
    confirmedAt: p.confirmedAt?.toISOString() ?? null,
    receiptCode: p.receipts[0]?.code ?? null,
    loai: loaiCua(p.accountantStatus),
  }));
}

// =============================================================================
// R7-04 — TRANG HỌC PHÍ PORTAL (P0): nguồn sự thật = Payment 2 tầng, KHÔNG đọc Order cũ.
// Học phí mỗi ghi danh = finalPrice (snapshot tại convert) − THỰC THU (HT 27/08/2026).
// PARENT không có center-role → cổng sở hữu là studentId thuộc parentUserId (db trần).
// =============================================================================

export type EnrollmentBillingRow = {
  enrollmentId: string;
  status: string;
  studentName: string | null;
  className: string | null;
  finalPrice: number;
  confirmedPaid: number;
  /** finalPrice − confirmedPaid; có thể âm (đóng thừa). */
  outstanding: number;
  /**
   * D5/G.6 — chỉ dấu TRẠNG THÁI (KHÔNG lộ số tiền, giữ AC1): số khoản đang chờ kế
   * toán xác nhận / số khoản bị từ chối, để PH biết có hoạt động đang xử lý.
   */
  pendingCount: number;
  rejectedCount: number;
};

export type ParentBilling = {
  enrollments: EnrollmentBillingRow[];
  /** Lịch sử biên lai đã được kế toán xác nhận. */
  receipts: ConfirmedPaymentRow[];
  totals: { tuition: number; paid: number; outstanding: number };
  /** D5/G.6 — tổng chỉ dấu trạng thái (không kèm số tiền). */
  flags: { pendingCount: number; rejectedCount: number };
};

/**
 * Tổng hợp học phí + công nợ + biên lai cho phụ huynh, từ Payment 2 tầng (R7-04).
 * Chỉ tính ghi danh đã chốt giá (finalPrice != null tại convert R7-05). "Đã thanh toán"
 * đi qua `tinhThucThu` (HT 27/08/2026) — khoản Sale mới ghi nhận (PENDING) vẫn KHÔNG
 * hiện tiền (AC1), khoản hoàn được trừ ra, bản điều chỉnh thay bản gốc.
 */
export async function getParentBilling(parentUserId: string): Promise<ParentBilling> {
  const empty: ParentBilling = {
    enrollments: [],
    receipts: [],
    totals: { tuition: 0, paid: 0, outstanding: 0 },
    flags: { pendingCount: 0, rejectedCount: 0 },
  };
  const childIds = await resolveChildIds(db, parentUserId);
  if (childIds.length === 0) return empty;

  const enrollments = await db.enrollment.findMany({
    where: { studentId: { in: childIds }, finalPrice: { not: null }, deletedAt: null }, // FIX-C3
    select: {
      id: true,
      status: true,
      finalPrice: true,
      tuition: true,
      student: { select: { name: true } },
      class: { select: { name: true } },
      // Lấy MỌI bút toán còn sống của ghi danh; `tinhThucThu` tự chọn ra khoản được
      // tính, PENDING/REJECTED chỉ dùng để ĐẾM (không kèm amount xuống client) — giữ
      // AC1: không lộ số tiền khoản chưa xác nhận cho PH.
      // FIX-C3: nested include không auto-scope → tự lọc payment đã xóa mềm.
      // `id` + `adjustmentOfId` là BẮT BUỘC: thiếu chúng `butToanThucThu` không biết bản
      // gốc nào đã bị bản ADJUSTED thay thế và sẽ cộng đôi.
      payments: {
        where: { deletedAt: null },
        select: { id: true, accountantStatus: true, amount: true, adjustmentOfId: true },
      },
    },
    orderBy: { enrolledAt: "desc" },
    take: 100,
  });

  const rows: EnrollmentBillingRow[] = enrollments.map((e) => {
    const finalPrice = e.finalPrice ?? e.tuition ?? 0;
    const confirmedPaid = tinhThucThu(e.payments);
    const pendingCount = e.payments.filter((p) => p.accountantStatus === "PENDING").length;
    const rejectedCount = e.payments.filter((p) => p.accountantStatus === "REJECTED").length;
    return {
      enrollmentId: e.id,
      status: e.status,
      studentName: e.student?.name ?? null,
      className: e.class?.name ?? null,
      finalPrice,
      confirmedPaid,
      // MỘT công thức công nợ cho cả admin lẫn portal — `lib/finance/debt.ts`. Ở đây nó
      // còn lo cả việc ghi danh ĐÃ RỜI LỚP không bị khoản hoàn đẩy công nợ lên.
      outstanding: computeEnrollmentDebt(finalPrice, e.payments, e.status),
      pendingCount,
      rejectedCount,
    };
  });

  const receipts = await getParentConfirmedPayments(db, childIds);

  const totals = rows.reduce(
    (acc, r) => {
      acc.tuition += r.finalPrice;
      acc.paid += r.confirmedPaid;
      acc.outstanding += Math.max(0, r.outstanding);
      return acc;
    },
    { tuition: 0, paid: 0, outstanding: 0 },
  );

  const flags = rows.reduce(
    (acc, r) => {
      acc.pendingCount += r.pendingCount;
      acc.rejectedCount += r.rejectedCount;
      return acc;
    },
    { pendingCount: 0, rejectedCount: 0 },
  );

  return { enrollments: rows, receipts, totals, flags };
}
