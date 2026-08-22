// PDF phiếu đánh giá trải nghiệm — bản site SALE.
//
// Luồng nghiệp vụ (chủ dự án mô tả 21/08): giáo viên chấm sau buổi thử → lưu vào
// cơ sở dữ liệu → Sale thấy phiếu nếu đã có đánh giá → bấm xuất PDF đưa phụ huynh.
//
// Khác bản site giáo viên ở đúng cái GUARD: bên kia gác own-teacher, bên này gác
// bằng **cách ly cơ sở** (Sale không dạy lớp nào). Nội dung phiếu dùng chung
// `trialEvalPdfResponse` để hai cửa không trôi khác nhau.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { checkPermission } from "@/lib/auth/check-permission";
import { getSaleTrialRubricContext } from "@/lib/trial/sale-roster";
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
  // Cùng quyền với trang danh sách trải nghiệm — xem được danh sách thì xuất
  // được phiếu của chính những học viên đó.
  if (!(await checkPermission("trials:view"))) {
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  }

  const { enrollmentId } = await params;
  const actor = await resolveActor(session.user.id);
  const ctx = await getSaleTrialRubricContext(actor, enrollmentId);
  // `null` = không tồn tại HOẶC ngoài cơ sở của mình — cố ý không phân biệt.
  if (!ctx) {
    return NextResponse.json(
      { error: "Không tìm thấy học viên trải nghiệm" },
      { status: 404 },
    );
  }
  if (!ctx.existing) {
    return NextResponse.json(
      { error: "Giáo viên chưa chấm phiếu cho học viên này" },
      { status: 404 },
    );
  }

  return trialEvalPdfResponse({
    studentName: ctx.studentName,
    courseName: ctx.courseName,
    trialClassName: ctx.trialClassName,
    existing: {
      ...ctx.existing,
      // Prisma trả `JsonValue`; hình dạng thật là criterionId → điểm, do
      // `saveTrialRubricAction` ghi và `lib/trial/rubric.ts` khoá.
      scores: ctx.existing.scores as Record<string, number>,
    },
  });
}
