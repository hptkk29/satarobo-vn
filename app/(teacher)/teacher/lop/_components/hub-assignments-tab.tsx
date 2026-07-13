// hub-assignments-tab.tsx — Tab "Bài tập & Kiểm tra" của Class Hub.
//
// Bảng bài đã giao Ở RIÊNG lớp này (7 cột như reference) + nút "Giao bài" (AssignDialog
// khoá sẵn 1 lớp). Chi tiết/chấm → trang chuyên /teacher/cham-bai?assignmentId=… (dùng
// lại roster + GradeForm + gate của trang đó). Assignment (Loại B, không centerId) →
// cách ly qua classId ∈ assignedClassIds (guard ở caller). ⚠️ Câu 46: chỉ đếm, không PII.
import Link from "next/link";
import { Eye, Library, NotebookPen, PencilLine } from "lucide-react";
import type { SubmissionStatus } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { Badge } from "@/components/ui/badge";
import { AssignDialog } from "../../cham-bai/_components/assign-dialog";

const SUBMITTED_STATUSES: SubmissionStatus[] = ["SUBMITTED", "LATE", "GRADED"];

const ASSIGNMENT_STATUS_LABEL: Record<string, string> = {
  PUBLISHED: "Đang mở",
  CLOSED: "Đã đóng",
  DRAFT: "Nháp",
};

/** "YYYY-MM-DD" (giờ VN) cho cột Hạn nộp. */
const dueFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

export async function HubAssignmentsTab({
  actor,
  classId,
  className,
}: {
  actor: Actor;
  classId: string;
  className: string;
}) {
  const sdb = scopedDb(actor);

  const [assignments, cls, templates] = await Promise.all([
    sdb.assignment.findMany({
      where: { classId, status: { in: ["PUBLISHED", "CLOSED"] } },
      select: {
        id: true,
        title: true,
        status: true,
        dueAt: true,
        templateId: true,
        _count: {
          select: {
            questions: true, // >0 → hình thức "Kiểm tra"
            submissions: { where: { status: { in: SUBMITTED_STATUSES } } },
          },
        },
      },
      orderBy: { assignedAt: "desc" },
    }),
    sdb.class.findUnique({
      where: { id: classId },
      select: {
        _count: {
          select: {
            enrollments: { where: { status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } } },
          },
        },
      },
    }),
    sdb.assignmentTemplate.findMany({
      select: { id: true, title: true, _count: { select: { templateQuestions: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  const rosterCount = cls?._count.enrollments ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Bài tập &amp; kiểm tra đã giao cho lớp. Đầu bài lấy từ thư viện Đào tạo.
        </p>
        <AssignDialog
          classes={[{ id: classId, name: className }]}
          templates={templates.map((t) => ({
            id: t.id,
            title: t.title,
            isTest: t._count.templateQuestions > 0,
          }))}
        />
      </div>

      <div className="t-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <th scope="col" className="px-5 py-3">Nội dung</th>
                <th scope="col" className="px-5 py-3">Hình thức</th>
                <th scope="col" className="px-5 py-3">Nguồn</th>
                <th scope="col" className="px-5 py-3">Hạn nộp</th>
                <th scope="col" className="px-5 py-3">Đã nộp</th>
                <th scope="col" className="px-5 py-3">Trạng thái</th>
                <th scope="col" className="px-5 py-3 text-right">
                  <span className="sr-only">Chi tiết</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {assignments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Chưa giao bài nào cho lớp — bấm “Giao bài” để chọn đầu bài từ thư viện.
                  </td>
                </tr>
              ) : (
                assignments.map((a) => {
                  const isTest = a._count.questions > 0;
                  const fromAdmin = a.templateId != null;
                  const due =
                    a.dueAt && a.dueAt.getFullYear() >= 2000 ? dueFmt.format(a.dueAt) : "—";
                  return (
                    <tr
                      key={a.id}
                      className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-5 py-3.5 font-semibold text-foreground">{a.title}</td>
                      <td className="px-5 py-3.5">
                        {isTest ? (
                          <Badge
                            variant="outline"
                            className="border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-300"
                          >
                            Kiểm tra
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300"
                          >
                            Bài tập
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          {fromAdmin ? (
                            <>
                              <Library className="h-3.5 w-3.5" aria-hidden /> Đào tạo
                            </>
                          ) : (
                            <>
                              <PencilLine className="h-3.5 w-3.5" aria-hidden /> Tự tạo
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-foreground">{due}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap font-semibold text-foreground">
                        {a._count.submissions}/{rosterCount}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <Badge variant="outline">
                          {ASSIGNMENT_STATUS_LABEL[a.status] ?? a.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <Link
                          href={`/teacher/cham-bai?assignmentId=${a.id}`}
                          className="inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-orange-600 outline-none hover:text-orange-700 focus-visible:ring-2 focus-visible:ring-ring dark:text-orange-400"
                        >
                          <Eye className="h-4 w-4" aria-hidden />
                          {isTest ? "Chấm điểm" : "Chi tiết"}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
