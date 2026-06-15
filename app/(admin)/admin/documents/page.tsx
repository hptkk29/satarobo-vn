import Link from "next/link";
import {
  File as FileIcon,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileVideo,
  FolderOpen,
  Image as ImageIcon,
  Plus,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { DocumentType, type Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const TYPE_INFO: Record<DocumentType, { label: string; color: string }> = {
  PDF: { label: "PDF", color: "bg-red-100 text-red-700" },
  IMAGE: { label: "Ảnh", color: "bg-blue-100 text-blue-700" },
  VIDEO: { label: "Video", color: "bg-purple-100 text-purple-700" },
  SLIDE: { label: "Slide", color: "bg-amber-100 text-amber-700" },
  WORKSHEET: { label: "Worksheet", color: "bg-emerald-100 text-emerald-700" },
  AUDIO: { label: "Audio", color: "bg-pink-100 text-pink-700" },
  OTHER: { label: "Khác", color: "bg-neutral-100 text-neutral-700" },
};

function getTypeIcon(type: DocumentType) {
  switch (type) {
    case "PDF":
    case "SLIDE":
      return FileText;
    case "VIDEO":
      return FileVideo;
    case "AUDIO":
      return FileAudio;
    case "IMAGE":
      return ImageIcon;
    case "WORKSHEET":
      return FileSpreadsheet;
    default:
      return FileIcon;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

const VALID_TYPES = Object.values(DocumentType);

interface SearchParams {
  searchParams: Promise<{
    q?: string;
    type?: string;
    lessonId?: string;
    isPublic?: string;
  }>;
}

export default async function DocumentsPage({ searchParams }: SearchParams) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "documents:view")) {
    redirect("/dashboard?error=unauthorized");
  }

  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const typeFilter =
    sp.type && VALID_TYPES.includes(sp.type as DocumentType)
      ? (sp.type as DocumentType)
      : undefined;
  const lessonFilter = sp.lessonId?.trim() || undefined;
  const publicFilter =
    sp.isPublic === "true" ? true : sp.isPublic === "false" ? false : undefined;

  const where: Prisma.DocumentWhereInput = {
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(lessonFilter ? { lessonId: lessonFilter } : {}),
    ...(publicFilter !== undefined ? { isPublic: publicFilter } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { fileName: { contains: q, mode: "insensitive" as const } },
            { documentCode: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [documents, lessons] = await Promise.all([
    db.document.findMany({
      where,
      include: {
        lesson: {
          select: { order: true, title: true, curriculum: { select: { name: true } } },
        },
        uploadedBy: { select: { fullName: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    db.lesson.findMany({
      where: { curriculum: { isActive: true } },
      include: { curriculum: { select: { name: true } } },
      orderBy: [{ curriculumId: "asc" }, { order: "asc" }],
      take: 500,
    }),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <FolderOpen className="h-6 w-6 text-[#7C3AED]" />
            Tài liệu
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {documents.length > 0
              ? `${documents.length} tài liệu`
              : "Chưa có tài liệu nào"}
          </p>
        </div>
        <Link
          href="/documents/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Tải lên tài liệu
        </Link>
      </div>

      <form
        method="GET"
        className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Tìm tiêu đề / tên file / mã..."
          className="lg:col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
        />
        <select
          name="type"
          defaultValue={typeFilter ?? ""}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Mọi loại</option>
          {Object.entries(TYPE_INFO).map(([v, { label }]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="lessonId"
          defaultValue={lessonFilter ?? ""}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Mọi bài học</option>
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.curriculum.name} — Bài {l.order}: {l.title}
            </option>
          ))}
        </select>
        <select
          name="isPublic"
          defaultValue={sp.isPublic ?? ""}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Mọi quyền truy cập</option>
          <option value="true">Public</option>
          <option value="false">Private (chỉ admin/GV)</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 sm:col-span-2 lg:col-span-5"
        >
          Áp dụng bộ lọc
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Tài liệu
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Loại
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Bài học
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Kích thước
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Public
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Tags
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Người tải
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Hành động
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {documents.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-sm text-gray-400"
                  >
                    Chưa có tài liệu nào khớp bộ lọc.{" "}
                    <Link
                      href="/documents/new"
                      className="text-[#7C3AED] hover:underline"
                    >
                      Tải lên →
                    </Link>
                  </td>
                </tr>
              ) : (
                documents.map((d) => {
                  const typeInfo = TYPE_INFO[d.type];
                  const Icon = getTypeIcon(d.type);
                  return (
                    <tr key={d.id} className="hover:bg-gray-50/60">
                      <td className="px-3 py-3">
                        <div className="flex items-start gap-2">
                          <Icon className="h-5 w-5 flex-shrink-0 text-neutral-400 mt-0.5" />
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 line-clamp-1">
                              {d.title}
                            </div>
                            <div className="text-xs text-gray-400 line-clamp-1">
                              {d.fileName}
                            </div>
                            {d.documentCode && (
                              <div className="text-[10px] text-gray-400 tabular-nums">
                                {d.documentCode}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeInfo.color}`}
                        >
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600 max-w-[180px]">
                        {d.lesson ? (
                          <>
                            <div className="font-medium">
                              {d.lesson.curriculum.name}
                            </div>
                            <div className="text-gray-400">
                              Bài {d.lesson.order}: {d.lesson.title}
                            </div>
                          </>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm tabular-nums text-gray-700">
                        {formatBytes(d.fileSize)}
                      </td>
                      <td className="px-3 py-3">
                        {d.isPublic ? (
                          <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                            Public
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                            Private
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {d.tags.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="inline-flex rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600"
                            >
                              {t}
                            </span>
                          ))}
                          {d.tags.length > 3 && (
                            <span className="text-[10px] text-neutral-400">
                              +{d.tags.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500">
                        {d.uploadedBy?.fullName ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <a
                            href={d.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            Mở
                          </a>
                          <Link
                            href={`/documents/${d.id}/edit`}
                            className="rounded-md border border-purple-200 px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-50"
                          >
                            Sửa
                          </Link>
                        </div>
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
