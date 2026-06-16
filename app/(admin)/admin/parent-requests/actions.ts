"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { getAuditActor } from "@/lib/audit/log";
import { createMakeupNeed } from "@/lib/makeup/service";

// =============================================================================
// ADMIN PARENT REQUESTS — Phase NHÓM 3
// Duyệt / từ chối yêu cầu phụ huynh. KHÔNG tự động thực thi nghiệp vụ (chuyển
// lớp/bảo lưu) — staff xử lý thủ công ở module tương ứng rồi đánh dấu APPROVED.
// =============================================================================

const handleSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  response: z.string().trim().max(2000).optional().nullable(),
});

export async function handleParentRequest(input: {
  id: string;
  decision: "APPROVED" | "REJECTED";
  response?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "parent-requests:manage")) {
    return { ok: false, error: "Không có quyền" };
  }

  const parsed = handleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const req = await db.parentRequest.findUnique({
    where: { id: parsed.data.id },
    select: { status: true },
  });
  if (!req) return { ok: false, error: "Không tìm thấy yêu cầu" };
  if (req.status !== "PENDING") {
    return { ok: false, error: "Yêu cầu đã được xử lý" };
  }

  const { actorId, actorName } = getAuditActor(session);
  await db.parentRequest.update({
    where: { id: parsed.data.id },
    data: {
      status: parsed.data.decision,
      response: parsed.data.response?.trim() || null,
      handledById: actorId,
      handledByName: actorName,
      handledAt: new Date(),
    },
  });

  revalidatePath("/parent-requests");
  revalidatePath("/portal/yeu-cau");
  return { ok: true };
}

// =============================================================================
// RESOLVE ABSENCE — xử lý báo vắng (gộp từ /parent-requests/bao-vang)
//   (a) "Xếp học bù"  → Attendance EXCUSED + makeupStatus NEEDS_MAKEUP
//   (b) "Đánh vắng"   → Attendance ABSENT/EXCUSED + makeupStatus NONE
// Cả hai đều ghi absenceReason từ nội dung báo + duyệt yêu cầu (APPROVED).
// =============================================================================

export async function resolveAbsence(input: {
  requestId: string;
  action: "MAKEUP" | "ABSENT";
  excused?: boolean; // chỉ dùng cho ABSENT (true = có phép)
  response?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "parent-requests:manage")) {
    return { ok: false, error: "Không có quyền" };
  }

  const req = await db.parentRequest.findUnique({
    where: { id: input.requestId },
    select: { id: true, type: true, status: true, studentId: true, sessionId: true, content: true },
  });
  if (!req) return { ok: false, error: "Không tìm thấy yêu cầu" };
  if (req.type !== "ABSENCE") return { ok: false, error: "Không phải yêu cầu báo vắng" };
  if (req.status !== "PENDING") return { ok: false, error: "Yêu cầu đã được xử lý" };
  if (!req.sessionId) {
    return { ok: false, error: "Yêu cầu không gắn buổi học cụ thể — xử lý thủ công" };
  }

  const status = input.action === "MAKEUP" ? "EXCUSED" : input.excused ? "EXCUSED" : "ABSENT";
  const makeupStatus = input.action === "MAKEUP" ? "NEEDS_MAKEUP" : "NONE";
  const absenceReason = req.content.slice(0, 1000);
  const { actorId, actorName } = getAuditActor(session);

  try {
    await db.$transaction([
      db.attendance.upsert({
        where: { sessionId_studentId: { sessionId: req.sessionId, studentId: req.studentId } },
        create: {
          sessionId: req.sessionId,
          studentId: req.studentId,
          status,
          makeupStatus,
          absenceReason,
        },
        update: { status, makeupStatus, absenceReason },
      }),
      db.parentRequest.update({
        where: { id: req.id },
        data: {
          status: "APPROVED",
          response:
            input.response?.trim() ||
            (input.action === "MAKEUP" ? "Đã xếp học bù." : "Đã ghi nhận vắng."),
          handledById: actorId,
          handledByName: actorName,
          handledAt: new Date(),
        },
      }),
    ]);
  } catch (err) {
    console.error("[resolveAbsence]", err);
    return { ok: false, error: "Lỗi cơ sở dữ liệu" };
  }

  // "Xếp học bù" → tạo MakeupNeed PENDING gắn buổi đã lỡ.
  if (input.action === "MAKEUP") {
    await createMakeupNeed({
      studentId: req.studentId,
      missedSessionId: req.sessionId,
      createdById: actorId,
      note: absenceReason,
    }).catch(() => {});
  }

  revalidatePath("/parent-requests/bao-vang");
  revalidatePath("/parent-requests");
  revalidatePath("/attendance");
  revalidatePath("/hoc-bu");
  revalidatePath("/portal/yeu-cau");
  return { ok: true };
}
