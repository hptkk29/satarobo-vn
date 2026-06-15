import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { Badge } from "@/components/ui/badge";
import { CourseBasicsForm } from "./_components/course-basics-form";
import { DiscountSection, type DiscountRow } from "./_components/discount-section";

export const dynamic = "force-dynamic";

function toDateInput(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "courses:view")) {
    redirect("/dashboard?error=unauthorized");
  }
  const canEdit = can(session.user, "courses:edit");

  // Course là catalog toàn hệ thống (không center-scoped); scopedDb pass-through.
  const sdb = scopedDb(await resolveActor(session.user.id));
  const course = await sdb.course.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      ageRange: true,
      level: true,
      price: true,
      isActive: true,
      discounts: {
        orderBy: [{ active: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          type: true,
          value: true,
          note: true,
          conditions: true,
          active: true,
          validFrom: true,
          validTo: true,
        },
      },
    },
  });

  if (!course) notFound();

  const discounts: DiscountRow[] = course.discounts.map((d) => ({
    id: d.id,
    type: d.type,
    value: d.value,
    note: d.note,
    conditions: d.conditions,
    active: d.active,
    validFrom: toDateInput(d.validFrom),
    validTo: toDateInput(d.validTo),
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/courses"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Danh sách khoá dạy
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{course.name}</h1>
          {course.isActive ? (
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Hoạt động</Badge>
          ) : (
            <Badge className="bg-gray-200 text-gray-700 hover:bg-gray-200">Tắt</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500">/{course.slug}</p>
      </div>

      {canEdit ? (
        <CourseBasicsForm course={course} />
      ) : (
        <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Thông tin khoá học</h2>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-500">Độ tuổi</dt>
              <dd className="font-medium">{course.ageRange || "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Trình độ</dt>
              <dd className="font-medium">{course.level || "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Giá niêm yết</dt>
              <dd className="font-medium">
                {course.price != null ? `${course.price.toLocaleString("vi-VN")}đ` : "—"}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <DiscountSection courseId={course.id} discounts={discounts} canEdit={canEdit} />
    </div>
  );
}
