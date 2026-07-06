import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  DocumentForm,
  type DocumentFormValue,
} from "../../_components/document-form";
import { checkPermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditDocumentPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("documents:upload"))) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;

  const [document, lessons] = await Promise.all([
    db.document.findUnique({ where: { id } }),
    db.lesson.findMany({
      where: { curriculum: { isActive: true } },
      include: { curriculum: { select: { name: true } } },
      orderBy: [{ curriculumId: "asc" }, { order: "asc" }],
      take: 500,
    }),
  ]);

  if (!document) notFound();

  const formValue: DocumentFormValue = {
    id: document.id,
    documentCode: document.documentCode,
    title: document.title,
    description: document.description,
    fileUrl: document.fileUrl,
    fileName: document.fileName,
    fileSize: document.fileSize,
    mimeType: document.mimeType,
    lessonId: document.lessonId,
    isPublic: document.isPublic,
    tags: document.tags,
    notes: document.notes,
  };

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
          Sửa tài liệu giảng dạy:{" "}
          <span className="font-bold text-orange-600">{document.title}</span>
        </h1>
      </div>

      <DocumentForm
        document={formValue}
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
