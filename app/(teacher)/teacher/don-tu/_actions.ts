// app/(teacher)/teacher/don-tu/_actions.ts — Đơn từ GV.
// submitWorkRequest: GV gửi đơn (PENDING). reviewWorkRequest: CENTER_MANAGER duyệt/từ
// chối đơn của các cơ sở MÌNH ĐANG QUẢN LÝ (UI ở /admin/don-tu). WorkRequest ∉
// SCOPED_MODELS → scopedDb pass-through; own-scope qua requesterId, review-scope qua
// `roleManagesCenter(actor, "CENTER_MANAGER", …)` — xem chú thích tại chỗ kiểm.
"use server";

import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { roleManagesCenter } from "@/lib/auth/managed-centers";
import { scopedDb } from "@/lib/db-scope";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasRole } from "@/lib/auth/permissions";
import {
  WORK_REQUEST_KINDS,
  diffHours,
  isClassKind,
  isRangeKind,
} from "@/lib/work-request";
import { applyApprovedWorkRequest } from "@/lib/work-request-apply";

type Result = { ok: true } | { ok: false; error: string };
/** Duyệt đơn: kèm thông báo phụ về việc áp dụng lên lịch (BGĐ 31/07). */
type ReviewResult = { ok: true; note?: string } | { ok: false; error: string };

const submitSchema = z.object({
  kind: z.enum(WORK_REQUEST_KINDS),
  fromDate: z.string().optional().nullable(),
  toDate: z.string().optional().nullable(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  hours: z.coerce.number().min(0).max(24).optional().nullable(),
  className: z.string().max(200).optional().nullable(),
  classId: z.string().max(60).optional().nullable(),
  targetUserId: z.string().max(60).optional().nullable(),
  targetShiftId: z.string().max(60).optional().nullable(),
  detail: z.string().max(500).optional().nullable(),
  reason: z.string().trim().min(1, "Nhập lý do").max(3000),
});

export async function submitWorkRequest(input: unknown): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const d = parsed.data;
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const from = d.fromDate ? new Date(d.fromDate) : null;
  const to = isRangeKind(d.kind)
    ? d.toDate
      ? new Date(d.toDate)
      : from
    : from;
  const hours =
    d.kind === "OT"
      ? diffHours(d.startTime, d.endTime)
      : d.kind === "TIMESHEET_FIX"
        ? (d.hours ?? null)
        : null;

  try {
    await sdb.workRequest.create({
      data: {
        requesterId: session.user.id,
        centerId: session.user.centerId ?? null,
        kind: d.kind,
        fromDate: from,
        toDate: to,
        startTime: d.startTime || null,
        endTime: d.endTime || null,
        hours,
        className: isClassKind(d.kind) ? d.className || null : null,
        classId: isClassKind(d.kind) ? d.classId || null : null,
        targetUserId:
          d.kind === "SUB_TEACH" || d.kind === "SHIFT_SWAP"
            ? d.targetUserId || null
            : null,
        targetShiftId: d.kind === "SHIFT_SWAP" ? d.targetShiftId || null : null,
        detail: d.detail || null,
        reason: d.reason,
      },
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi gửi đơn: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath("/teacher/don-tu");
  return { ok: true };
}

const reviewSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().max(1000).optional().nullable(),
});

/**
 * CENTER_MANAGER duyệt/từ chối đơn của cơ sở MÌNH ĐANG QUẢN LÝ — có thể là nhiều cơ sở
 * (SUPER_ADMIN: mọi cơ sở).
 *
 * BGĐ 31/07 — DUYỆT CÓ HIỆU LỰC THẬT: đơn nghỉ dạy/dạy thay được duyệt sẽ cập nhật
 * luôn ClassSession (huỷ buổi / gán GV dạy thay) qua lib/work-request-apply.ts.
 */
export async function reviewWorkRequest(input: unknown): Promise<ReviewResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  const isManager = hasRole(session.user, "CENTER_MANAGER");
  const isSuper = hasRole(session.user, "SUPER_ADMIN");
  if (!isManager && !isSuper)
    return { ok: false, error: "Không có quyền duyệt đơn" };

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const { id, decision, note } = parsed.data;
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const req = await sdb.workRequest.findUnique({
    where: { id },
    select: {
      id: true,
      centerId: true,
      status: true,
      kind: true,
      classId: true,
      fromDate: true,
      targetUserId: true,
      reason: true,
      requesterId: true,
    },
  });
  if (!req) return { ok: false, error: "Không tìm thấy đơn" };
  // ── A-01-6 · bất biến L-A6 (26/08/2026) ────────────────────────────────────────
  // Trước đây: `req.centerId !== (session.user.centerId ?? null)` — so với ĐÚNG MỘT cơ
  // sở neo trên JWT. Quản lý giữ hai cơ sở XEM được đơn của cơ sở thứ hai (trang
  // /admin/don-tu liệt kê theo cùng một biến) nhưng bấm Duyệt thì "Đơn thuộc cơ sở khác".
  //
  // Nay đo bằng tập cơ sở người này đang giữ CHÍNH vai `CENTER_MANAGER` — suy từ
  // `PermEntry.roleCode` + `PermEntry.centerScope`, tức từ đúng dòng `UserOrgRole` đẻ ra
  // quyền. Vai đúng ở đây là `CENTER_MANAGER` vì cổng vai ngay trên gác bằng
  // `hasRole(session.user, "CENTER_MANAGER")` (enum `Role` v1) và bảng ánh xạ
  // `lib/auth/legacy-role-map.ts:24` đưa nó về RoleDef cùng tên.
  //
  // ⚠️ KHÔNG dùng `actor.visibleCenterIds` (và cũng không AND thêm nó): vế đó nở theo vai
  // KIÊM NHIỆM — QLCS@CS1 kiêm kế toán/marketing sẽ duyệt được đơn của cơ sở họ chỉ có
  // quyền XEM. Lý lẽ đầy đủ: khối chú thích đầu `lib/auth/managed-centers.ts`.
  //
  // ⚠️ Đây là cổng GHI nên phải TỰ kiểm: `WorkRequest` ∈ `SCOPE_EXEMPT` (lib/db-scope.ts)
  // ⇒ `sdb.workRequest.findUnique` KHÔNG lọc cơ sở hộ. Test ghim điều đó bằng client giả
  // không lọc gì (`./_actions.test.ts`).
  //
  // Đơn chưa gắn cơ sở (`centerId` null) nay TỪ CHỐI với quản lý (fail-closed, chỉ
  // SUPER_ADMIN xử được) — trước đây quản lý cũng `centerId` null thì lọt.
  if (!isSuper && !roleManagesCenter(actor, "CENTER_MANAGER", req.centerId)) {
    return { ok: false, error: "Đơn thuộc cơ sở khác" };
  }
  if (req.status !== "PENDING")
    return { ok: false, error: "Đơn đã được xử lý" };

  try {
    await sdb.workRequest.update({
      where: { id },
      data: {
        status: decision,
        reviewedById: session.user.id,
        reviewedByName: session.user.name ?? null,
        reviewedAt: new Date(),
        reviewNote: note?.trim() || null,
      },
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi duyệt đơn: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  // BGĐ 31/07 — duyệt xong thì ÁP LÊN LỊCH THẬT (huỷ buổi / gán GV dạy thay).
  // Lỗi áp dụng KHÔNG lật lại quyết định duyệt — báo để quản lý xử lý tay.
  let applyNote: string | undefined;
  if (decision === "APPROVED") {
    try {
      const res = await applyApprovedWorkRequest({
        request: {
          id: req.id,
          kind: req.kind,
          classId: req.classId,
          fromDate: req.fromDate,
          targetUserId: req.targetUserId,
          reason: req.reason,
          requesterId: req.requesterId,
        },
        actorId: session.user.id,
        actorName: session.user.name ?? "Quản lý",
      });
      applyNote = res.message;
    } catch (err) {
      console.error("[reviewWorkRequest] apply:", err);
      applyNote =
        "Đã duyệt đơn nhưng CHƯA cập nhật được lịch — vui lòng chỉnh buổi học thủ công.";
    }
  }

  revalidatePath("/teacher/don-tu");
  revalidatePath("/don-tu");
  revalidatePath("/lich");
  return { ok: true, ...(applyNote ? { note: applyNote } : {}) };
}
