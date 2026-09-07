// app/(teacher)/teacher/don-tu/_actions.ts — Đơn từ GV.
// submitWorkRequest: GV gửi đơn (PENDING). reviewWorkRequest: CENTER_MANAGER cơ sở
// duyệt/từ chối (UI quản lý ở admin — action sẵn sàng). WorkRequest ∉ SCOPED_MODELS
// → scopedDb pass-through; own-scope qua requesterId, review-scope qua centerId.
"use server";

import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasRole } from "@/lib/auth/permissions";
import {
  WORK_REQUEST_KINDS,
  diffHours,
  isClassKind,
  isRangeKind,
  kiemKhoangNgayDon,
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
  // Kiểm ở SERVER, không tin form: form đã chặn đúng, nhưng Server Action là một
  // endpoint riêng và gọi thẳng vào nó thì bỏ qua mọi thứ form làm.
  const loiNgay = kiemKhoangNgayDon(d.kind, from, to);
  if (loiNgay) return { ok: false, error: loiNgay };

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
 * CENTER_MANAGER duyệt/từ chối đơn cùng cơ sở (SUPER_ADMIN: mọi cơ sở).
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
  if (!isSuper && req.centerId !== (session.user.centerId ?? null)) {
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
