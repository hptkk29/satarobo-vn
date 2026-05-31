"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { getAuditActor } from "@/lib/audit/log";
import { createMakeupNeed } from "@/lib/makeup/service";

// Module QL học viên PHẦN 3 — tư vấn viên xử lý báo vắng:
//   (a) "Xếp học bù"  → Attendance EXCUSED + makeupStatus NEEDS_MAKEUP
//   (b) "Đánh vắng"   → Attendance ABSENT/EXCUSED + makeupStatus NONE
// Cả hai đều ghi absenceReason từ nội dung báo + duyệt yêu cầu (APPROVED).

type Result = { ok: boolean; error?: string };

export async function resolveAbsence(input: {
  requestId: string;
  action: "MAKEUP" | "ABSENT";
  excused?: boolean; // chỉ dùng cho ABSENT (true = có phép)
  response?: string | null;
}): Promise<Result> {
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

  // B1 — "Xếp học bù" → tạo MakeupNeed PENDING gắn buổi đã lỡ.
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
