// PDF phiếu đánh giá Trial (site GV). Chỉ HV trải nghiệm của GV + ĐÃ LƯU phiếu
// (getTeacherTrialRubricContext guard own-teacher; existing null → 404 "lưu trước").
//
// Đợt C (22/08/2026) — phần DỰNG phiếu chuyển sang `lib/pdf/trial-eval-response.ts`
// dùng chung với site Sale. Cùng một loại phiếu mà hai bản sao là hai bản sẽ trôi
// khác nhau. Guard thì KHÔNG dùng chung: bên này own-teacher, bên kia cách ly cơ sở.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTeacherTrialRubricContext } from "@/lib/lms/teacher-schedule";
import { trialEvalPdfResponse } from "@/lib/pdf/trial-eval-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ enrollmentId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  const { enrollmentId } = await params;

  const ctx = await getTeacherTrialRubricContext(session.user.id, enrollmentId);
  if (!ctx) {
    return NextResponse.json(
      { error: "Không tìm thấy học viên trải nghiệm" },
      { status: 404 },
    );
  }
  if (!ctx.existing) {
    return NextResponse.json(
      { error: "Chưa có phiếu đánh giá — hãy lưu phiếu trước khi xuất PDF" },
      { status: 404 },
    );
  }

  return trialEvalPdfResponse({
    studentName: ctx.studentName,
    courseName: ctx.courseName,
    trialClassName: ctx.trialClassName,
    existing: ctx.existing,
  });
}
