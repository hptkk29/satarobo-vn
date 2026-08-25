// PDF phiếu đánh giá Trial (site GV). Chỉ HV trải nghiệm của GV + ĐÃ LƯU phiếu
// (getTeacherTrialRubricContext guard own-teacher; existing null → 404 "lưu trước").
import { createElement, type ReactElement } from "react";
import { NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { getTeacherTrialRubricContext } from "@/lib/lms/teacher-schedule";
import { withFreshFonts } from "@/lib/pdf/brand";
import { TrialEvalPdf } from "@/lib/pdf/trial-eval";

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
  req: Request,
  { params }: { params: Promise<{ enrollmentId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  const { enrollmentId } = await params;
  // GĐ4 — một ca có nhiều phiếu (mỗi buổi một phiếu). `?sessionId=` chọn buổi cần in;
  // KHÔNG truyền thì vẫn lấy buổi đang xếp như trước, để link cũ đã gửi đi không vỡ.
  const sessionId =
    new URL(req.url).searchParams.get("sessionId")?.trim() || undefined;

  const ctx = await getTeacherTrialRubricContext(
    session.user.id,
    enrollmentId,
    sessionId,
  );
  if (!ctx) {
    return NextResponse.json(
      { error: "Không tìm thấy học viên trải nghiệm" },
      { status: 404 },
    );
  }
  // Gán ra biến riêng: TS mất narrowing của `ctx.existing` khi dùng trong callback.
  const existing = ctx.existing;
  if (!existing) {
    return NextResponse.json(
      { error: "Buổi này chưa có phiếu đánh giá — hãy lưu phiếu trước khi xuất PDF" },
      { status: 404 },
    );
  }

  const dateLabel = existing.updatedAt.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });

  let pdf: Buffer;
  try {
    pdf = await withFreshFonts(() =>
      renderToBuffer(
        createElement(TrialEvalPdf, {
          data: {
            studentName: ctx.studentName,
            courseName: ctx.courseName,
            trialClassName: ctx.trialClassName,
            scores: existing.scores,
            totalScore: existing.totalScore,
            rank: existing.rank,
            generalComment: existing.generalComment,
            orientation: existing.orientation,
            evaluatedByName: existing.evaluatedByName,
            dateLabel,
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

  // Kèm số buổi vào tên file: một ca nay có nhiều phiếu, cùng tên là đè lên nhau
  // trong thư mục Tải xuống.
  const seq =
    ctx.sessions.find((s) => s.id === ctx.trialClassSessionId)?.seq ?? null;
  const filename = `PhieuTrial-${safeFilename(ctx.studentName)}${
    seq != null ? `-Buoi${seq}` : ""
  }.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
