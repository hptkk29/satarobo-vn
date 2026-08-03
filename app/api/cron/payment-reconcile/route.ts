import { db } from "@/lib/db";
import { withCron } from "@/lib/cron/handler";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

// =============================================================================
// 03/08 — ĐỐI SOÁT CUỐI NGÀY (sổ thu mới).
//
// Quét 2 thứ và chỉ 2 thứ, rồi báo chuông cho người có quyền `payments:manage`:
//   1. `BankTransaction` UNMATCHED — tiền ĐÃ VỀ nhưng chưa rót được vào phiếu nào.
//      Đây là hàng chờ xử lý tay DUY NHẤT được phép tồn tại; để qua đêm là khách đã
//      trả tiền mà hệ thống vẫn coi như còn nợ.
//   2. `PaymentRequest` PARTIAL quá hạn — khách trả thiếu và đã qua ngày đến hạn.
//      (PENDING quá hạn KHÔNG báo ở đây: đó là công nợ thường, đã có
//      /api/cron/order-debt-reminder + debt-reminder lo nhắc khách.)
//      ⚠️ Chỉ bắt được phiếu CÓ `dueDate`. Phiếu toàn đơn (`installmentNo=0`) do
//      backfill/đơn không trả góp sinh ra có `dueDate = null` (đơn lẻ không có mốc
//      hạn trong dữ liệu) ⇒ trả thiếu ở đơn lẻ KHÔNG lên chuông này; đường nhắc của
//      nhóm đó vẫn là /api/cron/order-debt-reminder (theo tuổi đơn).
//
// ⚠️ KHÔNG quét `QrSession` hết hạn: trạng thái đó SUY RA được lúc đọc
// (`expiresAt < now`) nên một job đi ghi đè `status=EXPIRED` chỉ tạo thêm đường ghi
// có thể sai mà không thêm thông tin nào. Chủ dự án đã chốt bỏ.
//
// Chống spam: StaffNotification neo `dedupeKey` theo NGÀY → mỗi người tối đa 1 thông
// báo/loại/ngày; nội dung (số đếm) được cập nhật nhưng trạng thái đã-đọc giữ nguyên.
// =============================================================================

const CATEGORY = "PAYMENT_RECONCILE";
const HREF = "/bien-dong-so-du";

/**
 * Người nhận = có quyền `payments:manage`.
 * Hợp NHẤT hai nguồn có chủ đích: RBAC v2 động (đang enforce trên prod) + matrix v1
 * tĩnh (thứ chạy ở local/dev/CI). Cron chạy ở cả hai nơi; lấy hợp để không có môi
 * trường nào im lặng không báo cho ai.
 */
async function getReconcileRecipients(now: Date): Promise<string[]> {
  const ids = new Set<string>();

  // v2 — RoleDef có quyền payments:manage → người đang giữ role đó.
  const roleRows = await db.rolePermission.findMany({
    where: { action: "payments:manage" },
    select: { roleId: true },
  });
  if (roleRows.length > 0) {
    const assignments = await db.userOrgRole.findMany({
      where: {
        roleId: { in: roleRows.map((r) => r.roleId) },
        status: "ACTIVE",
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      select: { userId: true },
    });
    for (const a of assignments) ids.add(a.userId);
  }

  // v1 — vai trò tĩnh trên User.roles[].
  const legacyRoles = PERMISSIONS["payments:manage"];
  const legacyUsers = await db.user.findMany({
    where: { isActive: true, deletedAt: null, roles: { hasSome: legacyRoles } },
    select: { id: true },
  });
  for (const u of legacyUsers) ids.add(u.id);

  // Chỉ giữ tài khoản còn hoạt động (người ở v2 có thể đã nghỉ).
  if (ids.size === 0) return [];
  const active = await db.user.findMany({
    where: { id: { in: [...ids] }, isActive: true, deletedAt: null },
    select: { id: true },
  });
  return active.map((u) => u.id);
}

async function notifyAll(
  userIds: string[],
  dedupeKey: string,
  title: string,
  body: string,
): Promise<number> {
  let n = 0;
  for (const userId of userIds) {
    await db.staffNotification.upsert({
      where: { userId_dedupeKey: { userId, dedupeKey } },
      update: { body }, // cập nhật số đếm, GIỮ trạng thái đã đọc
      create: { userId, category: CATEGORY, title, body, href: HREF, dedupeKey },
    });
    n++;
  }
  return n;
}

const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

type ReconcileResult = {
  unmatchedTxns: number;
  unmatchedAmount: number;
  overduePartial: number;
  overdueOutstanding: number;
  recipients: number;
  notified: number;
};

// KHÔNG export (ngoài GET + `dynamic`): Next.js validate export của `route.ts`, thêm
// symbol lạ là gãy build. Cần tái dùng ở nơi khác thì tách sang lib/ rồi import vào.
async function runPaymentReconcile(now: Date = new Date()): Promise<ReconcileResult> {
  const day = now.toISOString().slice(0, 10);

  // 1. Tiền về chưa rót được vào phiếu nào.
  const unmatched = await db.bankTransaction.findMany({
    where: { status: "UNMATCHED" },
    select: { id: true, amount: true },
  });
  const unmatchedAmount = unmatched.reduce((s, t) => s + t.amount, 0);

  // 2. Phiếu thu trả thiếu ĐÃ quá hạn.
  const partial = await db.paymentRequest.findMany({
    where: { status: "PARTIAL", dueDate: { not: null, lt: now } },
    select: { id: true, amountDue: true, allocations: { select: { amount: true } } },
  });
  const overdueOutstanding = partial.reduce(
    (s, r) => s + Math.max(0, r.amountDue - r.allocations.reduce((x, a) => x + a.amount, 0)),
    0,
  );

  if (unmatched.length === 0 && partial.length === 0) {
    return {
      unmatchedTxns: 0,
      unmatchedAmount: 0,
      overduePartial: 0,
      overdueOutstanding: 0,
      recipients: 0,
      notified: 0,
    };
  }

  const recipients = await getReconcileRecipients(now);
  let notified = 0;

  if (unmatched.length > 0) {
    notified += await notifyAll(
      recipients,
      `payment-reconcile:unmatched:${day}`,
      "Tiền về chưa khớp đơn",
      `${unmatched.length} giao dịch (${fmt(unmatchedAmount)}đ) chưa rót được vào phiếu thu nào — cần đối soát tay.`,
    );
  }
  if (partial.length > 0) {
    notified += await notifyAll(
      recipients,
      `payment-reconcile:overdue-partial:${day}`,
      "Phiếu thu trả thiếu đã quá hạn",
      `${partial.length} phiếu thu còn thiếu ${fmt(overdueOutstanding)}đ và đã qua ngày đến hạn.`,
    );
  }

  return {
    unmatchedTxns: unmatched.length,
    unmatchedAmount,
    overduePartial: partial.length,
    overdueOutstanding,
    recipients: recipients.length,
    notified,
  };
}

// withCron = verifyCronAuth (CRON_SECRET) + try/catch → JSON lỗi có cấu trúc (API-18).
export const GET = withCron("payment-reconcile", async () => ({
  ok: true,
  data: await runPaymentReconcile(),
}));
