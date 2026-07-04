import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { Star } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { FeedbackReply } from "./_components/feedback-reply";

export const metadata = { title: "Đánh giá phụ huynh | Admin" };
export const dynamic = "force-dynamic";

export default async function AdminParentFeedbackPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "parent-feedback:view")) redirect("/dashboard");

  // L8.1 — ParentFeedback.studentId là cột phẳng (KHÔNG có relation `student` trong
  // schema) → không thể lọc `where: { student: { centerId: ... } }`. Cách ly 2 bước:
  // lấy id HV trong tầm nhìn actor (qua scopedDb, tái dùng cổng cách ly chuẩn), rồi
  // lọc feedback theo studentId IN [...]. Feedback studentId=null (góp ý chung) chỉ
  // actor global (SUPER_ADMIN/HO) mới thấy — tự rớt khỏi kết quả non-global.
  const actor = await resolveActor(session.user.id);
  const isGlobal = actor.isSuperAdmin || actor.isHoLevel;

  let where: Prisma.ParentFeedbackWhereInput = {};
  if (!isGlobal) {
    const visibleStudents = await scopedDb(actor).student.findMany({
      select: { id: true },
    });
    where = { studentId: { in: visibleStudents.map((s) => s.id) } };
  }

  const [rows, agg] = await Promise.all([
    db.parentFeedback.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
    db.parentFeedback.aggregate({ where, _avg: { rating: true }, _count: true }),
  ]);

  const avg = agg._avg.rating ? agg._avg.rating.toFixed(1) : "—";

  return (
    <div className="max-w-4xl p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Đánh giá phụ huynh</h1>
          <p className="mt-1 text-sm text-gray-500">
            Phản hồi gửi từ portal hocvien.satarobo.vn.
          </p>
          {!isGlobal && (
            <p className="mt-1 text-xs text-gray-400">
              Chỉ hiển thị đánh giá của học viên thuộc cơ sở bạn quản lý. Góp ý chung
              (không gắn học viên) chỉ hiển thị cho Hội sở.
            </p>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-center">
          <p className="flex items-center gap-1 text-2xl font-bold text-gray-900">
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" /> {avg}
          </p>
          <p className="text-xs text-gray-400">{agg._count} đánh giá</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          Chưa có đánh giá nào.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((f) => (
            <li key={f.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < f.rating
                          ? "fill-amber-400 text-amber-400"
                          : "text-gray-300"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs text-gray-400">
                  {f.createdAt.toLocaleDateString("vi-VN")}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                {f.content}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {f.parentName ?? "Phụ huynh"}
                {f.studentName
                  ? ` · HV: ${f.studentName}`
                  : isGlobal
                    ? " · Góp ý chung (chỉ Hội sở thấy)"
                    : ""}
              </p>
              <FeedbackReply
                id={f.id}
                existing={f.adminResponse}
                respondedAt={f.respondedAt ? f.respondedAt.toISOString() : null}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
