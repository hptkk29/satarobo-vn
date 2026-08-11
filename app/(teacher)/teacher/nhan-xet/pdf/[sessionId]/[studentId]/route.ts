// PDF phiếu nhận xét buổi học (site GV). Guard ownership BUỔI (canManageSessionRecord —
// nhận cả GV dạy thay/thực dạy, FIX #3) + ĐÃ LƯU phiếu (notes/rubric != null) → 404
// "lưu trước". ⚠️ Câu 46: chỉ tên HV.
import { createElement, type ReactElement } from "react";
import { NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { canManageSessionRecord } from "@/app/(admin)/admin/sessions/[id]/_feedback-core";
import {
  normalizeEvalNotes,
  normalizeEvalRatings,
} from "@/lib/lms/session-eval-rubric";
import { withFreshFonts } from "@/lib/pdf/brand";
import { SessionEvalPdf } from "@/lib/pdf/session-eval";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeFilename(sName: string): string {
  return sName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_.-]/g, "_")
    .replace(/_+/g, "_");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string; studentId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  const { sessionId, studentId } = await params;

  const sdb = scopedDb(await resolveActor(session.user.id));
  const sess = await sdb.classSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      centerId: true, // model scoped — findUnique lọc hậu kỳ theo field này
      classId: true,
      substituteTeacherId: true,
      actualTeacherId: true,
      date: true,
      topic: true,
      class: {
        select: {
          name: true,
          centerId: true,
          course: { select: { name: true } },
        },
      },
    },
  });
  if (!sess)
    return NextResponse.json(
      { error: "Không tìm thấy buổi học" },
      { status: 404 },
    );

  // FIX #3 — ownership theo BUỔI (lớp phân công ∪ dạy thay ∪ thực dạy), khớp gate
  // của saveSessionFeedback/saveSessionEval — GV dạy thay xuất được PDF phiếu mình lưu.
  const allowed = await canManageSessionRecord(
    {
      id: session.user.id,
      role: session.user.role,
      centerId: session.user.centerId,
    },
    sess,
  );
  if (!allowed)
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  const [fb, student] = await Promise.all([
    sdb.studentSessionFeedback.findUnique({
      where: {
        classSessionId_studentId: { classSessionId: sessionId, studentId },
      },
      select: {
        projectName: true,
        notes: true,
        rubric: true,
        updatedAt: true,
        createdById: true,
      },
    }),
    sdb.student.findUnique({
      where: { id: studentId },
      select: { name: true },
    }),
  ]);
  if (!fb || (fb.rubric == null && fb.notes == null)) {
    return NextResponse.json(
      { error: "Chưa có phiếu nhận xét — hãy lưu phiếu trước khi xuất PDF" },
      { status: 404 },
    );
  }
  if (!student)
    return NextResponse.json(
      { error: "Không tìm thấy học viên" },
      { status: 404 },
    );

  const gv = fb.createdById
    ? await sdb.user.findUnique({
        where: { id: fb.createdById },
        select: { name: true },
      })
    : null;

  const dateLabel = sess.date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });

  let pdf: Buffer;
  try {
    pdf = await withFreshFonts(() =>
      renderToBuffer(
        createElement(SessionEvalPdf, {
          data: {
            studentName: student.name,
            courseName: sess.class.course.name,
            className: sess.class.name,
            sessionTopic: sess.topic ?? "Buổi học",
            dateLabel,
            projectName: fb.projectName,
            notes: normalizeEvalNotes(fb.notes),
            ratings: normalizeEvalRatings(fb.rubric),
            evaluatedByName: gv?.name ?? null,
          },
        }) as unknown as ReactElement<DocumentProps>,
      ),
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: `Lỗi tạo PDF: ${err instanceof Error ? err.message : "Unknown"}`,
      },
      { status: 500 },
    );
  }

  const filename = `PhieuNhanXet-${safeFilename(student.name)}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
