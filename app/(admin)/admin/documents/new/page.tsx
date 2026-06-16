import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { DocumentForm } from "../_components/document-form";

export const dynamic = "force-dynamic";

export default async function NewDocumentPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "documents:upload")) {
    redirect("/dashboard?error=unauthorized");
  }

  const lessons = await db.lesson.findMany({
    where: { curriculum: { isActive: true } },
    include: { curriculum: { select: { name: true } } },
    orderBy: [{ curriculumId: "asc" }, { order: "asc" }],
    take: 500,
  });

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/documents"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">
          Tải lên tài liệu giảng dạy
        </h1>
      </div>

      <DocumentForm
        lessons={lessons.map((l) => ({
          id: l.id,
          order: l.order,
          title: l.title,
          curriculumName: l.curriculum.name,
        }))}
      />
    </div>
  );
}
