"use server";

// ĐỐI SOÁT TAY giao dịch tiền về — hàng chờ `BankTransaction.status = UNMATCHED`.
//
// VÌ SAO TRANG NÀY CẦN NÚT (chủ dự án hỏi 21/08: "chỉ view ra nhìn vậy thôi hả?").
// Trước đây màn này cố ý CHỈ ĐỌC, với lý do "xử lý tay làm ở trang đơn nơi có đủ
// ngữ cảnh". Lý do đó chỉ đúng khi đã BIẾT tiền của đơn nào — mà cả hàng chờ này
// tồn tại chính vì KHÔNG biết. Bắt kế toán đoán mã đơn rồi đi tìm ở màn khác là
// đẩy việc khó nhất sang chỗ không có dữ liệu để làm.
//
// ⚠️ KHÔNG viết lại phép rót tiền ở đây. Mọi thứ đi qua `allocateToOrder`
// (lib/payments/payos-ingest.ts) — CÙNG hàm mà webhook cổng thanh toán dùng. Rót
// tiền không chỉ là ghi `PaymentAllocation`: còn khoá đơn, tính lại trạng thái
// phiếu từ sổ, ghi tiền dư sang `CreditBalance`, ghi song song sổ CŨ (`Payment`)
// vì công nợ hiển thị vẫn đọc ở đó, rồi mới tới chốt đơn + cấp tài khoản phụ
// huynh + gửi biên nhận. Bản thứ hai chắc chắn bỏ sót vài bước.

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor, type Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { getAuditActor } from "@/lib/audit/log";
import { writeAudit } from "@/lib/audit/audit-log";
import { extractVnPhoneCandidates } from "@/lib/payments/payos-ingest";
import { phoneVariants } from "@/lib/phone";

export type DonUngVien = {
  id: string;
  code: string;
  customerName: string;
  studentName: string | null;
  customerPhone: string | null;
  courseName: string | null;
  /** Tổng phần còn thiếu của mọi phiếu chưa đóng đủ. */
  conThieu: number;
  /** Phiếu sẽ được rót vào (chưa đóng đủ, sớm nhất). */
  phieuId: string;
  soDot: number;
};

type KetQua = { ok: true; message: string } | { ok: false; error: string };

/**
 * Ai được ĐỘNG vào tiền ở màn này. `payments:view` chỉ để nhìn — không đủ.
 *
 * Union có cờ `ok` làm khoá phân biệt. Để TypeScript tự suy kiểu thì nhánh thành
 * công bị gắn thêm `error?: undefined`, và khi đó không cách nào thu hẹp kiểu được —
 * `ctx.actor` cứ là `Actor | undefined` ở mọi nhánh.
 */
type CongGhi =
  | { ok: false; error: string }
  | { ok: true; session: Session; actor: Actor };

/**
 * ⚠️ HAI CỔNG VIẾT ĐẦY ĐỦ, KHÔNG gọi qua một hàm chung nhận `quyen` làm tham số — dù bản gộp
 * ngắn hơn 12 dòng. Lý do là một cổng THẬT: luật lint `authz/require-can-in-write-action`
 * (TS-03) chỉ nhận ra `checkPermission()` khi nó nằm trong thân action hoặc trong wrapper cục
 * bộ ĐÚNG MỘT CẤP. Bản gộp là hai cấp (`action → gateKeToan → cong`) ⇒ lint báo
 * *"có lời gọi GHI nhưng không thấy kiểm quyền"*, và cách "sửa" nhanh nhất lúc đó là thêm một
 * dòng `eslint-disable` — tức tắt đúng cái cổng đang làm việc.
 *
 * GẮN tiền vào đơn — `payments:record`.
 *
 * Chủ dự án chốt 17/09: sale phải gắn được, mà sale (`CENTER_SALES_CSM`) chỉ có
 * `payments:record`. Đây KHÔNG phải nới quyền mới: `payments:record` vốn đã là quyền "ghi
 * nhận một khoản tiền" mà sale dùng ở màn đơn — gắn một giao dịch vào đợt đúng là việc đó.
 * Tiền vẫn dừng ở `accountantStatus = PENDING`; trục kế toán không bị đụng tới.
 */
async function gateGan(): Promise<CongGhi> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("payments:record"))) {
    return { ok: false, error: "Không có quyền ghi nhận tiền" };
  }
  const actor = await resolveActor(session.user.id);
  return { ok: true, session, actor };
}

/**
 * BỎ QUA và GỠ GẮN — `payments:manage`, tức CHỈ kế toán (`HO_ACCOUNTANT` ·
 * `CENTER_ACCOUNTANT`; đã đo `prisma/seed-roles.ts`, không vai nào khác giữ quyền này).
 *
 * Hai việc này khác hẳn việc gắn: một cái đưa tiền RA KHỎI hàng chờ đối soát, một cái đảo
 * lại bút toán đã ghi. Cả hai đều là quyết định kế toán, và cả hai đều khó phát hiện khi làm
 * sai — giao dịch bị bỏ qua nhầm thì không màn nào còn hiện nó ra để ai đó thắc mắc.
 */
async function gateKeToan(): Promise<CongGhi> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("payments:manage"))) {
    return { ok: false, error: "Chỉ kế toán mới làm được việc này" };
  }
  const actor = await resolveActor(session.user.id);
  return { ok: true, session, actor };
}

function lamMoi() {
  revalidatePath("/bien-dong-so-du");
  revalidatePath("/admin/bien-dong-so-du");
}

/**
 * Tìm đơn để gán một giao dịch vào. Tìm theo mã đơn, SĐT phụ huynh, tên người
 * mua hoặc tên học viên — kế toán cầm sao kê trong tay thường chỉ có một trong
 * mấy thứ đó.
 *
 * CHỈ trả đơn CÒN PHIẾU CHƯA ĐÓNG ĐỦ: đơn đã thu xong không phải đích rót tiền,
 * hiện ra chỉ tổ bấm nhầm. Đọc qua `scopedDb` nên kế toán cơ sở 1 không thấy đơn
 * cơ sở 2 — cách ly cơ sở áp cả ở đường gán tay, không riêng đường đọc.
 */
export async function timDonDeGan(tuKhoa: string): Promise<DonUngVien[]> {
  const ctx = await gateGan();
  if (!ctx.ok) return [];

  const q = tuKhoa.trim();
  if (q.length < 2) return [];

  // SĐT có thể nằm LẪN trong nội dung CK (`NGUYEN VAN A 0905123456 HOC PHI`), không đứng
  // một mình. Bóc ra rồi nở cả hai dạng `0…`/`84…` — nếu chỉ `phoneVariants(q)` thì cả chuỗi
  // 25 ký tự được coi là một số điện thoại và không khớp gì, tức ô tìm đổ sẵn nội dung CK
  // (đúng thứ tiện nhất) lại là ô không bao giờ ra kết quả theo SĐT.
  //
  // ⚠️ Đây là GỢI Ý, không phải đối khớp: kết quả vẫn phải người bấm chọn. SĐT một mình chưa
  // bao giờ đủ để rót tiền — xem `decideByPhoneCandidates`.
  const sdt = [...new Set([...phoneVariants(q), ...extractVnPhoneCandidates(q).flatMap(phoneVariants)])];
  const rows = await scopedDb(ctx.actor).order.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ["DRAFT", "CANCELLED", "REFUNDED"] },
      paymentRequests: { some: { status: { in: ["PENDING", "PARTIAL"] } } },
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { customerPhone: { in: sdt } },
        { student: { name: { contains: q, mode: "insensitive" } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: {
      id: true,
      code: true,
      customerName: true,
      customerPhone: true,
      student: { select: { name: true } },
      items: { orderBy: { createdAt: "asc" }, take: 1, select: { itemName: true } },
      paymentRequests: {
        where: { status: { in: ["PENDING", "PARTIAL"] } },
        orderBy: [{ sortOrder: "asc" }, { installmentNo: "asc" }],
        select: { id: true, installmentNo: true, amountDue: true, allocations: { select: { amount: true } } },
      },
    },
  });

  return rows.flatMap((o) => {
    const phieu = o.paymentRequests[0];
    if (!phieu) return [];
    const conThieu = o.paymentRequests.reduce((s, r) => {
      const daRot = r.allocations.reduce((x, a) => x + a.amount, 0);
      return s + Math.max(0, r.amountDue - daRot);
    }, 0);
    return [
      {
        id: o.id,
        code: o.code,
        customerName: o.customerName,
        studentName: o.student?.name ?? null,
        customerPhone: o.customerPhone,
        courseName: o.items[0]?.itemName ?? null,
        conThieu,
        phieuId: phieu.id,
        soDot: phieu.installmentNo,
      },
    ];
  });
}

/**
 * Đánh dấu giao dịch KHÔNG PHẢI học phí (tiền nhà, hoàn ứng, chuyển nhầm…) →
 * `IGNORED`, ra khỏi hàng chờ.
 *
 * Bắt buộc có lý do: hàng chờ đối soát mà cho dọn im lặng thì chỉ vài tuần là
 * không ai biết những giao dịch đã biến mất kia là gì. KHÔNG xoá bản ghi — tiền
 * vẫn nằm nguyên trong sổ, chỉ đổi nhãn.
 */
export async function boQuaGiaoDich(
  bankTransactionId: string,
  lyDo: string,
): Promise<KetQua> {
  const ctx = await gateKeToan();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const ghiChu = lyDo.trim();
  if (!ghiChu) return { ok: false, error: "Cần ghi lý do bỏ qua" };

  const sdb = scopedDb(ctx.actor);
  const txn = await sdb.bankTransaction.findUnique({
    where: { id: bankTransactionId },
    select: { id: true, status: true, amount: true },
  });
  if (!txn) return { ok: false, error: "Không tìm thấy giao dịch" };
  if (txn.status === "MATCHED") {
    return { ok: false, error: "Giao dịch đã rót vào phiếu thu — không bỏ qua được" };
  }

  const { actorId, actorName } = getAuditActor(ctx.session);
  await sdb.bankTransaction.update({
    where: { id: txn.id },
    data: { status: "IGNORED", unmatchedNote: `Bỏ qua: ${ghiChu} (${actorName})` },
  });
  await writeAudit({
    actor: { id: actorId ?? "", name: actorName },
    module: "finance",
    entityType: "BankTransaction",
    entityId: txn.id,
    action: "TXN_IGNORED",
    oldValues: { status: txn.status },
    newValues: { status: "IGNORED" },
    reason: ghiChu,
    orgUnitId: null,
  });

  lamMoi();
  return { ok: true, message: "Đã đưa giao dịch ra khỏi hàng chờ đối soát." };
}
