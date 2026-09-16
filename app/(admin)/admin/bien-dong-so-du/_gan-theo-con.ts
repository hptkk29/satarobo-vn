"use server";

// GẮN MỘT GIAO DỊCH, CHIA ĐÍCH DANH CHO TỪNG CON — PHIÊN B.
//
// ─────────────────────────────────────────────────────────────────────────────
// Vì sao tách khỏi `_actions.ts` mà không phải một màn mới: đây vẫn là màn
// `/admin/bien-dong-so-du`, vẫn hàng chờ ấy, vẫn nút ấy. Chỉ có phần RUỘT của việc "gán" đổi
// từ *rót vào phiếu mở sớm nhất rồi để waterfall lo* thành *người nhập nói rõ đợt nào bao
// nhiêu*. Tách tệp vì `_actions.ts` đã dài và phần này có một cụm kiểu riêng, không phải vì
// nó là một luồng khác.
//
// ⚠️ KHÔNG viết phép ghi tiền ở đây. Toàn bộ nằm ở `lib/finance/ghi-tien-don.ts` — nơi duy
// nhất giữ advisory lock của đơn và đọc công nợ BÊN TRONG khoá. Tệp này chỉ làm ba việc:
// kiểm quyền, kiểm phạm vi cơ sở, rồi chuyển tham số xuống.

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb, passesScope } from "@/lib/db-scope";
import { getAuditActor } from "@/lib/audit/log";
import { noTheoCon } from "@/lib/finance/debt";
import { ganTienTheoCon, goGanTheoCon, taoDotChoCon } from "@/lib/finance/ghi-tien-don";
import { dungDotDeChia, type DongChia } from "@/lib/finance/chia-tien-theo-con";
import { ensureParentAccountForOrder } from "@/lib/parents/provision";

export type DotTrenMan = {
  paymentRequestId: string;
  installmentNo: number;
  conLai: number;
  hanDong: string | null;
};

export type ConTrenMan = {
  orderItemId: string;
  ten: string;
  khoa: string | null;
  conNo: number;
  dot: DotTrenMan[];
};

export type ChiTietDonDeGan = {
  orderId: string;
  code: string;
  con: ConTrenMan[];
  /** Đợt của luồng CŨ (thu toàn đơn, `orderItemId` NULL) — vẫn gắn được, chỉ không thuộc bé nào. */
  dotChungChuaChiaCon: DotTrenMan[];
  /** Tiền đã vào đơn nhưng chưa gắn con nào. Hiện ra như một việc cần làm. */
  chuaGanCon: number;
};

type KetQua = { ok: true; message: string } | { ok: false; error: string };

/**
 * Cổng chung cho mọi việc GẮN: quyền `payments:record` **và** đơn phải nằm trong phạm vi cơ
 * sở của người bấm.
 *
 * ⚠️ Hai vế, không phải một. Chủ dự án chốt: *"Danh sách UNMATCHED: người có payments:record
 * thấy TOÀN BỘ (giao dịch chưa có cơ sở). Nhưng chỉ GẮN được vào đơn trong phạm vi scopedDb
 * của người đó."* Giao dịch chưa gắn thì chưa biết của cơ sở nào — lọc nó theo cơ sở là giấu
 * mất tiền của chính mình. Nhưng ĐƠN thì luôn có cơ sở, nên vế thứ hai là thứ thật sự cách ly.
 *
 * `scopedDb` KHÔNG che write, nên `passesScope` ở đây là kiểm CÓ CHỦ Ý, không phải thừa:
 * `findUnique` qua `scopedDb` đã lọc, và `passesScope` là lớp thứ hai đọc thẳng `centerId` của
 * bản ghi — bỏ một trong hai thì một thay đổi ở `SCOPED_MODELS` là lỗ IDOR im lặng.
 */
async function congGanVaoDon(orderId: string) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "Chưa đăng nhập" };
  if (!(await checkPermission("payments:record"))) {
    return { ok: false as const, error: "Không có quyền ghi nhận tiền" };
  }
  const actor = await resolveActor(session.user.id);
  const order = await scopedDb(actor).order.findUnique({
    where: { id: orderId },
    select: { id: true, code: true, centerId: true, orgUnitId: true },
  });
  if (!order || !passesScope("Order", order, actor)) {
    // Câu chữ cố ý KHÔNG phân biệt "không có" với "không thuộc cơ sở bạn": biết đơn tồn tại
    // ở cơ sở khác đã là một mẩu thông tin không nên rò.
    return { ok: false as const, error: "Không tìm thấy đơn hàng" };
  }
  return { ok: true as const, session, actor, order };
}

function lamMoi(orderId: string) {
  revalidatePath("/admin/bien-dong-so-du");
  revalidatePath("/bien-dong-so-du");
  revalidatePath(`/orders/${orderId}`);
}

/**
 * Nạp chi tiết một đơn để dựng bảng chia: mỗi con một khối, kèm các đợt đang mở.
 *
 * Số liệu lấy từ `noTheoCon` — CÙNG hàm mà màn đơn dùng. Dựng lại phép tính ở đây là mở đường
 * cho hai màn in hai con số khác nhau cho cùng một bé.
 */
export async function taiChiTietDonDeGan(
  orderId: string,
): Promise<ChiTietDonDeGan | { error: string }> {
  const cong = await congGanVaoDon(orderId);
  if (!cong.ok) return { error: cong.error };

  const so = await noTheoCon(orderId);
  const dot = dungDotDeChia(so.con);
  const dotCuaCon = new Map<string, DotTrenMan[]>();
  for (const c of so.con) {
    dotCuaCon.set(
      c.orderItemId,
      c.dotDangMo.map((d) => ({
        paymentRequestId: d.id,
        installmentNo: d.installmentNo,
        conLai: Math.max(0, d.amountDue - d.daRot),
        hanDong: d.dueDate ? d.dueDate.toISOString() : null,
      })),
    );
  }

  return {
    orderId,
    code: cong.order.code,
    con: so.con.map((c) => ({
      orderItemId: c.orderItemId,
      ten: c.ten,
      khoa: c.khoa,
      conNo: c.conNo,
      dot: dotCuaCon.get(c.orderItemId) ?? [],
    })),
    // Đợt luồng cũ không thuộc bé nào — `dungDotDeChia` chỉ đi qua `so.con` nên chúng không
    // lọt vào đó; tra riêng để màn hình vẫn gắn được tiền cho đơn chưa chia con.
    dotChungChuaChiaCon: dot.filter((d) => d.orderItemId == null).map((d) => ({
      paymentRequestId: d.id,
      installmentNo: d.installmentNo,
      conLai: d.conLai,
      hanDong: null,
    })),
    chuaGanCon: so.chuaGanCon,
  };
}

/**
 * Gắn một giao dịch, chia đích danh theo đợt.
 *
 * `dong` tới TỪ CLIENT và không được tin: mọi phép kiểm (Σ đúng số tiền, mỗi đợt ≤ còn lại,
 * mỗi con ≤ còn nợ, đợt có thuộc đơn không) chạy LẠI ở `ganTienTheoCon`, bên trong khoá, trên
 * số đọc từ DB. Màn hình chỉ chặn sớm cho đỡ mất công bấm.
 */
export async function ganGiaoDichTheoConAction(input: {
  bankTransactionId: string;
  orderId: string;
  dong: DongChia[];
}): Promise<KetQua> {
  const cong = await congGanVaoDon(input.orderId);
  if (!cong.ok) return { ok: false, error: cong.error };
  const { actorId, actorName } = getAuditActor(cong.session);

  const kq = await ganTienTheoCon({
    bankTransactionId: input.bankTransactionId,
    orderId: input.orderId,
    dong: input.dong,
    actor: { id: actorId ?? "", name: actorName },
  });
  if (!kq.ok) return { ok: false, error: kq.error };

  // Đơn vừa đủ tiền ⇒ cấp tài khoản phụ huynh, y như đường webhook. Idempotent, và chạy SAU
  // commit (không gọi việc ngoài trong transaction đang giữ khoá).
  if (kq.daDuTien) {
    await ensureParentAccountForOrder(input.orderId).catch((err) =>
      console.error("[gan-theo-con] cấp tài khoản phụ huynh:", err),
    );
  }

  lamMoi(input.orderId);
  return {
    ok: true,
    message: `Đã chia ${kq.daChia.toLocaleString("vi-VN")}đ vào ${kq.soDong} đợt của đơn ${cong.order.code}.`,
  };
}

/**
 * Tạo thêm một đợt cho con NGAY TRONG màn gắn.
 *
 * Có mặt vì ca thật: tiền về mà bé chưa có đợt nào phù hợp. Bắt người dùng rời màn, mở đơn,
 * tạo đợt, quay lại tìm đúng giao dịch ấy là bốn bước cho một việc — và ở bước thứ ba người ta
 * quên mất mình đang làm gì.
 */
export async function taoDotChoConTaiChoAction(input: {
  orderId: string;
  orderItemId: string;
  soTien: number;
  dueDate?: string | null;
}): Promise<KetQua> {
  const cong = await congGanVaoDon(input.orderId);
  if (!cong.ok) return { ok: false, error: cong.error };
  const { actorId, actorName } = getAuditActor(cong.session);

  const han = input.dueDate ? new Date(input.dueDate) : null;
  if (han && Number.isNaN(han.getTime())) return { ok: false, error: "Hạn đóng không hợp lệ" };

  const kq = await taoDotChoCon({
    orderId: input.orderId,
    orderItemId: input.orderItemId,
    soTien: input.soTien,
    dueDate: han,
    centerId: cong.order.centerId,
    actor: { id: actorId ?? "", name: actorName },
  });
  if (!kq.ok) return { ok: false, error: kq.error };

  lamMoi(input.orderId);
  return { ok: true, message: `Đã tạo đợt ${kq.installmentNo}.` };
}

/**
 * GỠ một giao dịch đã gắn — CHỈ kế toán (`payments:manage`).
 *
 * `orderId` KHÔNG nhận từ client: suy ra từ chính các phân bổ của giao dịch. Nhận từ client
 * là mở đường cho "gỡ giao dịch A nhưng khai đơn B" — khoá sẽ giữ đơn B trong khi tay đụng
 * vào đơn A, tức chạy ngoài khoá mà trông như có khoá.
 */
export async function goGanGiaoDichAction(input: {
  bankTransactionId: string;
  lyDo: string;
}): Promise<KetQua> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("payments:manage"))) {
    return { ok: false, error: "Chỉ kế toán mới gỡ được giao dịch đã gắn" };
  }
  const lyDo = input.lyDo.trim();
  if (!lyDo) return { ok: false, error: "Cần ghi lý do gỡ" };

  const actor = await resolveActor(session.user.id);
  const phanBo = await scopedDb(actor, { bypass: true }).paymentAllocation.findFirst({
    where: { bankTransactionId: input.bankTransactionId },
    select: { paymentRequest: { select: { orderId: true } } },
  });
  if (!phanBo) return { ok: false, error: "Giao dịch này chưa gắn vào đâu" };
  const orderId = phanBo.paymentRequest.orderId;

  // Kế toán cơ sở không gỡ được giao dịch của đơn cơ sở khác — cùng luật với đường gắn.
  const order = await scopedDb(actor).order.findUnique({
    where: { id: orderId },
    select: { id: true, centerId: true },
  });
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false, error: "Không tìm thấy đơn hàng" };
  }

  const { actorId, actorName } = getAuditActor(session);
  const kq = await goGanTheoCon({
    bankTransactionId: input.bankTransactionId,
    orderId,
    lyDo,
    actor: { id: actorId ?? "", name: actorName },
  });
  if (!kq.ok) return { ok: false, error: kq.error };

  lamMoi(orderId);
  return {
    ok: true,
    message: `Đã gỡ ${kq.tienDao.toLocaleString("vi-VN")}đ (${kq.soDongDao} bút toán đảo). Giao dịch về hàng chờ.`,
  };
}
