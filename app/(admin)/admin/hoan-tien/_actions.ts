"use server";

import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb, passesScope } from "@/lib/db-scope";
import {
  approveRefund,
  rejectRefund,
  createRefundRequest,
  RefundError,
} from "@/lib/finance/refund";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Kế toán/SUPER_ADMIN duyệt hoàn tiền (quyết định tiền → quyền payments:confirm). */
export async function approveRefundAction(
  id: string,
  approvedAmount?: number | null,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("payments:confirm"))) {
    return { ok: false, error: "Không có quyền duyệt hoàn tiền" };
  }
  const uid = session.user.id;
  if (!uid) return { ok: false, error: "Thiếu thông tin người duyệt" };
  const actorName = session.user.name ?? session.user.email ?? "Quản lý";

  try {
    await approveRefund(id, uid, approvedAmount ?? null, actorName);
  } catch (err) {
    if (err instanceof RefundError) return { ok: false, error: err.message };
    return { ok: false, error: "Lỗi duyệt hoàn tiền" };
  }
  revalidatePath("/hoan-tien");
  return { ok: true };
}

/** Từ chối hoàn tiền (note bắt buộc ≥5 ký tự). */
export async function rejectRefundAction(
  id: string,
  note: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("payments:confirm"))) {
    return { ok: false, error: "Không có quyền từ chối hoàn tiền" };
  }
  const uid = session.user.id;
  if (!uid) return { ok: false, error: "Thiếu thông tin người duyệt" };
  const actorName = session.user.name ?? session.user.email ?? "Quản lý";

  try {
    await rejectRefund(id, uid, note, actorName);
  } catch (err) {
    if (err instanceof RefundError) return { ok: false, error: err.message };
    return { ok: false, error: "Lỗi từ chối hoàn tiền" };
  }
  revalidatePath("/hoan-tien");
  return { ok: true };
}

/**
 * Tạo đề xuất hoàn tiền cho MỘT ghi danh đã nghỉ học mà lượt gỡ đã bỏ qua phần tiền.
 *
 * VÌ SAO CẦN HÀNH ĐỘNG TAY. `createRefundRequest` chạy trong transaction gỡ học viên và
 * trả `null` khi không đề xuất được (sổ buổi lớp chưa chốt; hoặc trước 14/09 là cầu dao
 * `REFUND_REQUEST_DISABLED` chặn MỌI ca). Lượt gỡ đã chạy xong rồi và **không có cron nào
 * quét lại**, nên những ghi danh đó treo vĩnh viễn. Đo `satarobo_local` 14/09: 18 ghi danh
 * / 69.698.000đ đang treo như vậy.
 *
 * BA LỚP GÁC — `scopedDb` KHÔNG che write:
 *   1. `payments:confirm` — đây là đường sinh ra một con số tiền, không phải đường xem.
 *   2. `passesScope` trên LỚP của ghi danh — ghi danh không thuộc `SCOPED_MODELS`, cách ly
 *      cơ sở của nó đi qua `class.centerId` (xem memory "Enrollments page no scopedDb").
 *   3. `createRefundRequest` tự gác tiếp: lưới sổ buổi + idempotent theo (ghi danh, trigger)
 *      + bỏ qua khi chưa thu đồng nào. Bấm hai lần KHÔNG sinh hai đề xuất.
 *
 * KHÔNG gác thêm "đề xuất phải > 0" ở đây — CÓ CHỦ ĐÍCH. Ca hoàn-ra-0đ (học hết khoá) bị
 * `laViecConLam` loại khỏi danh sách nên nút không bao giờ hiện cho nó; gác lần nữa ở đây
 * bắt buộc phải ĐẾM LẠI buổi trong action, tức là bản chép thứ ba của cùng phép đếm —
 * đúng thứ mà lưới ghim `[CDX-08]` được viết ra để chặn. Đường duy nhất tới đây mà lách
 * được lọc là gọi thẳng action với quyền `payments:confirm`, và hậu quả tệ nhất là một
 * dòng PENDING 0đ mà chính người đó từ chối được.
 */
export async function taoDeXuatHoanTienAction(
  enrollmentId: string,
): Promise<ActionResult & { lyDo?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("payments:confirm"))) {
    return { ok: false, error: "Không có quyền tạo đề xuất hoàn tiền" };
  }
  const uid = session.user.id;
  if (!uid) return { ok: false, error: "Thiếu thông tin người thao tác" };
  const actorName = session.user.name ?? session.user.email ?? "Quản lý";

  const actor = await resolveActor(uid);
  const sdb = scopedDb(actor);

  const ghiDanh = await sdb.enrollment.findFirst({
    where: { id: enrollmentId, deletedAt: null },
    select: { id: true, status: true, class: { select: { centerId: true } } },
  });
  if (!ghiDanh) return { ok: false, error: "Không tìm thấy ghi danh" };
  if (!passesScope("Class", { centerId: ghiDanh.class?.centerId }, actor)) {
    return { ok: false, error: "Ghi danh không thuộc phạm vi của bạn" };
  }
  if (ghiDanh.status !== "WITHDREW") {
    // Cổng này KHÔNG phải để tạo hoàn tiền cho học viên đang học — đường đó là nghỉ học /
    // chuyển lớp / huỷ lớp, và nó tự gọi `createRefundRequest`.
    return {
      ok: false,
      error: "Chỉ tạo đề xuất cho ghi danh đã nghỉ học (WITHDREW)",
    };
  }

  const tao = await createRefundRequest({
    enrollmentId,
    trigger: "WITHDRAW",
    reason: `Tạo tay từ màn Hoàn tiền (lượt nghỉ học trước đó chưa sinh được đề xuất) — ${actorName}`,
    requestedById: uid,
    actorName,
  });
  if (!tao) {
    // `null` ở đây gần như chắc chắn là lưới sổ buổi — hai đường còn lại (chưa thu đồng
    // nào / đã có đề xuất) đã bị lọc khỏi danh sách trước khi hiện nút.
    return {
      ok: false,
      error:
        "Chưa tạo được đề xuất — nhiều khả năng lớp còn buổi đã qua ngày mà chưa chốt sổ. Chốt sổ buổi cho lớp rồi quay lại.",
    };
  }
  revalidatePath("/hoan-tien");
  return { ok: true };
}
