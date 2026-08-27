"use server";
// app/(sale)/sale/hop-thu/actions.ts — thao tác của người trực hộp thư.
//
// Ba cổng, theo thứ tự, KHÔNG bỏ cổng nào:
//   1. `auth()`            — có phiên không.
//   2. `assertPermission()` — có quyền không (luật cứng #1: mọi kiểm quyền qua
//      `can()`; `assertPermission` là bọc async chuẩn của nó).
//   3. `passesInboxScope()` — hội thoại này có thuộc tầm nhìn của người đó không.
//
// Cổng 3 KHÔNG bỏ được: ba bảng `Inbox*` mang `orgUnitId` chứ không `centerId`, mà
// `scopedDb` chỉ lọc `centerId` ⇒ ở đây KHÔNG có cách ly tự động. Bỏ cổng 3 là Sale
// CS1 thao tác được lên hội thoại của CS2 chỉ bằng cách đoán một id.
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { assertPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { getAuditActor, logLeadAudit } from "@/lib/audit/log";
import {
  layHoiThoaiDeThaoTac,
  ganNguoiPhuTrach,
  doiTrangThaiHoiThoai,
  noiHoiThoaiVaoLead,
  xoaMemTin,
  guiTraLoi,
  type KetQuaThaoTac,
} from "@/lib/inbox/thao-tac";

/** Kết quả chuẩn của mọi action ở màn này. `daGui = false` ⇒ giao diện PHẢI nói thật. */
export type KetQuaAction =
  | { ok: true; thongBao: string; daGui?: boolean }
  | { ok: false; error: string };

async function moCong(quyen: "inbox:view" | "inbox:reply" | "inbox:assign") {
  const session = await auth();
  if (!session?.user) return null;
  await assertPermission(quyen);
  const actor = await resolveActor(session.user.id);
  return { session, actor };
}

function loi(err: unknown): KetQuaAction {
  const ma = (err as { code?: string })?.code;
  if (ma === "PERMISSION_DENIED") return { ok: false, error: "Bạn không có quyền làm việc này." };
  if (ma === "TRUNG_LUOT_GUI") return { ok: false, error: "Lượt gửi này đã được ghi nhận." };
  if (ma === "KHONG_TIM_THAY_HOI_THOAI" || ma === "NGOAI_TAM_NHIN") {
    // Cùng một câu cho "không tồn tại" và "không thuộc tầm nhìn": phân biệt hai ca
    // đó là biến id hội thoại thành công cụ dò.
    return { ok: false, error: "Không tìm thấy hội thoại." };
  }
  console.error("[hop-thu] action lỗi:", err);
  return { ok: false, error: "Lỗi hệ thống. Thử lại sau." };
}

function xong(kq: KetQuaThaoTac, conversationId: string): KetQuaAction {
  revalidatePath("/sale/hop-thu");
  revalidatePath(`/sale/hop-thu?id=${conversationId}`);
  return { ok: true, thongBao: kq.thongBao, daGui: kq.daGui };
}

/**
 * Gửi tin trả lời.
 *
 * 🔴 `daGui` có thể là `false` mà action VẪN `ok: true`. Đó là chủ đích: tin đã
 * được ghi vào hội thoại (có vết, có người gửi) nhưng CHƯA tới khách vì kênh đang
 * mô phỏng. Giao diện phải nói đúng câu trong `thongBao`, KHÔNG được rút gọn thành
 * "Đã gửi" — đó chính là lỗi mà `lib/crm/messenger-send-gate.ts` phải đi dẹp.
 */
export async function guiTraLoiAction(
  conversationId: string,
  noiDung: string,
  outboundKey?: string,
): Promise<KetQuaAction> {
  try {
    const ctx = await moCong("inbox:reply");
    if (!ctx) return { ok: false, error: "Chưa đăng nhập" };

    const noi = noiDung.trim();
    if (!noi) return { ok: false, error: "Nội dung trống" };
    if (noi.length > 4000) return { ok: false, error: "Nội dung quá dài (tối đa 4000 ký tự)" };

    await layHoiThoaiDeThaoTac(ctx.actor, conversationId);
    const kq = await guiTraLoi({
      conversationId,
      body: noi,
      sentByUserId: ctx.session.user.id,
      // Khoá giành chỗ: client truyền để bấm-hai-lần va vào UNIQUE; không truyền
      // thì sinh mới (vẫn có vết, chỉ mất khả năng chặn bấm đúp).
      outboundKey: outboundKey?.trim() || randomUUID(),
    });
    return xong(kq, conversationId);
  } catch (err) {
    return loi(err);
  }
}

/** Nhận việc / giao việc. `userId = null` là trả hội thoại về hàng đợi chung. */
export async function ganNguoiPhuTrachAction(
  conversationId: string,
  userId: string | null,
): Promise<KetQuaAction> {
  try {
    const ctx = await moCong("inbox:assign");
    if (!ctx) return { ok: false, error: "Chưa đăng nhập" };
    await layHoiThoaiDeThaoTac(ctx.actor, conversationId);
    const kq = await ganNguoiPhuTrach({
      conversationId,
      assigneeId: userId,
      boiUserId: ctx.session.user.id,
    });
    return xong(kq, conversationId);
  } catch (err) {
    return loi(err);
  }
}

/** Đóng / mở lại hội thoại. */
export async function doiTrangThaiAction(
  conversationId: string,
  trangThai: "OPEN" | "SNOOZED" | "CLOSED",
): Promise<KetQuaAction> {
  try {
    const ctx = await moCong("inbox:assign");
    if (!ctx) return { ok: false, error: "Chưa đăng nhập" };
    await layHoiThoaiDeThaoTac(ctx.actor, conversationId);
    const kq = await doiTrangThaiHoiThoai({ conversationId, trangThai });
    return xong(kq, conversationId);
  } catch (err) {
    return loi(err);
  }
}

/**
 * Nối hội thoại mồ côi vào một phiếu khách.
 *
 * Có AUDIT vì đây là thao tác đổi CHỦ của dữ liệu: sau khi nối, hội thoại rời nhóm
 * mồ côi và chỉ còn cơ sở của lead đó thấy. Nối nhầm là vừa mất hội thoại khỏi mắt
 * người đang cần, vừa đặt nội dung của khách A vào hồ sơ khách B.
 */
export async function noiVaoLeadAction(
  conversationId: string,
  leadId: string,
): Promise<KetQuaAction> {
  try {
    const ctx = await moCong("inbox:assign");
    if (!ctx) return { ok: false, error: "Chưa đăng nhập" };
    const hoi = await layHoiThoaiDeThaoTac(ctx.actor, conversationId);

    const kq = await noiHoiThoaiVaoLead({
      actor: ctx.actor,
      identityId: hoi.identityId,
      leadId,
      boiUserId: ctx.session.user.id,
    });
    if (!kq.ok) return { ok: false, error: kq.error };

    const { actorId, actorName } = getAuditActor(ctx.session);
    await logLeadAudit({
      leadId,
      action: "UPDATE",
      actorId,
      actorName,
      newValues: { hopThuConversationId: conversationId, kenh: hoi.channel },
      changedFields: ["hopThu"],
      reason: "Nối hội thoại hộp thư đa kênh vào phiếu khách",
    });
    return xong(kq, conversationId);
  } catch (err) {
    return loi(err);
  }
}

/** Xoá MỀM một tin (luật cứng module chat #3: không hard delete). */
export async function xoaMemTinAction(
  conversationId: string,
  messageId: string,
  lyDo: string,
): Promise<KetQuaAction> {
  try {
    const ctx = await moCong("inbox:assign");
    if (!ctx) return { ok: false, error: "Chưa đăng nhập" };
    if (lyDo.trim().length < 10) {
      return { ok: false, error: "Lý do phải từ 10 ký tự — đây là thao tác có vết." };
    }
    await layHoiThoaiDeThaoTac(ctx.actor, conversationId);
    const kq = await xoaMemTin({
      conversationId,
      messageId,
      boiUserId: ctx.session.user.id,
      lyDo: lyDo.trim(),
    });
    return xong(kq, conversationId);
  } catch (err) {
    return loi(err);
  }
}
