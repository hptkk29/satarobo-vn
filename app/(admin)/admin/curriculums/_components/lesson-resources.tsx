"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileBox,
  Plus,
  Star,
  X,
} from "lucide-react";
import type { AssignmentKind, AssignmentStatus, ScormPackageStatus } from "@prisma/client";
// SCORM gắn-buổi tái dùng action ở /admin/scorm (đặt 1 bản active/buổi).
// R2-LMS-3 — upload gói SCORM INLINE ngay trong editor buổi (LessonScormUpload tái
// dùng createScormPackage/confirmUpload), không cần rời sang /admin/scorm.
import { activateForLesson } from "@/app/(admin)/admin/scorm/_actions";
import { attachAssignmentToLesson, detachAssignmentFromLesson } from "../_actions";
import { LessonScormUpload } from "./lesson-scorm-upload";

export type ScormPkgRow = {
  id: string;
  name: string;
  version: number;
  status: ScormPackageStatus;
  isActiveForLesson: boolean;
};

export type AssignmentRow = {
  id: string;
  title: string;
  kind: AssignmentKind;
  status: AssignmentStatus;
  className: string;
};

export type LessonResourceRow = {
  lessonId: string;
  order: number;
  title: string;
  scorm: ScormPkgRow[];
  assignments: AssignmentRow[];
};

const SCORM_STATUS_LABEL: Record<ScormPackageStatus, string> = {
  UPLOADING: "Đang tải lên",
  PROCESSING: "Đang xử lý",
  FAILED: "Lỗi",
  TESTING: "Đang xem thử",
  PUBLISHED: "Đã phát hành",
  ARCHIVED: "Đã lưu trữ",
};

const KIND_LABEL: Record<AssignmentKind, string> = {
  CLASSWORK: "Trên lớp",
  HOMEWORK: "Về nhà",
};

export function LessonResources({
  lessons,
  availableAssignments,
  scormEnabled,
  canActivateScorm,
}: {
  lessons: LessonResourceRow[];
  // Bài tập cùng khoá học, chưa gắn buổi nào — nguồn để gắn vào buổi.
  availableAssignments: AssignmentRow[];
  // SCORM_ENABLED — off thì ẩn section SCORM (không vỡ trang, AC3).
  scormEnabled: boolean;
  // training:manage — quyền đặt bản SCORM đang dùng cho buổi.
  canActivateScorm: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [picks, setPicks] = useState<Record<string, string>>({});

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Có lỗi xảy ra");
        return;
      }
      router.refresh();
    });
  }

  function handleActivate(pkg: ScormPkgRow, hasOtherActive: boolean) {
    let reason: string | undefined;
    if (hasOtherActive) {
      const r = window.prompt(
        "Đổi bản SCORM đang dùng của buổi — nhập lý do (bắt buộc):",
      );
      if (r === null) return; // huỷ
      reason = r.trim();
      if (!reason) {
        setError("Đổi bản đang dùng cần nêu lý do");
        return;
      }
    }
    run(() => activateForLesson(pkg.id, reason));
  }

  if (lessons.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 p-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-700">
            Học liệu &amp; bài tập theo buổi
          </h2>
          <p className="text-xs text-neutral-500">
            Gắn gói SCORM (đặt bản đang dùng) và bài tập cho từng buổi — không cần
            rời trang.
          </p>
        </div>
      </header>

      {error && (
        <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <ul className="divide-y divide-neutral-100">
        {lessons.map((lesson) => {
          const activePkg = lesson.scorm.find((p) => p.isActiveForLesson);
          const pick = picks[lesson.lessonId] ?? "";
          return (
            <li key={lesson.lessonId} className="p-4">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-neutral-800">
                  <span className="tabular-nums text-neutral-500">
                    Bài {lesson.order}
                  </span>
                  <span className="truncate">{lesson.title}</span>
                  <span className="ml-auto flex items-center gap-2 text-xs font-medium text-neutral-400">
                    {scormEnabled && (
                      <span className="inline-flex items-center gap-1">
                        <FileBox className="h-3.5 w-3.5" />
                        {activePkg ? "SCORM ✓" : `${lesson.scorm.length} gói`}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" />
                      {lesson.assignments.length} bài tập
                    </span>
                  </span>
                </summary>

                <div className="mt-3 space-y-4 pl-1">
                  {/* ── SCORM ─────────────────────────────────────────── */}
                  {scormEnabled && (
                    <div className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-3">
                      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-neutral-600">
                        <FileBox className="h-3.5 w-3.5" /> Tài liệu giảng dạy (SCORM)
                      </h3>
                      {lesson.scorm.length === 0 ? (
                        <p className="mt-2 text-xs text-neutral-500">
                          Chưa có gói SCORM cho buổi.{" "}
                          <Link
                            href="/admin/scorm"
                            className="inline-flex items-center gap-0.5 font-semibold text-[#7C3AED] hover:underline"
                          >
                            Tải gói lên <ExternalLink className="h-3 w-3" />
                          </Link>
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-1.5">
                          {lesson.scorm.map((pkg) => (
                            <li
                              key={pkg.id}
                              className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-sm"
                            >
                              <span className="font-medium text-neutral-800">
                                {pkg.name}{" "}
                                <span className="text-neutral-400">v{pkg.version}</span>
                              </span>
                              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">
                                {SCORM_STATUS_LABEL[pkg.status]}
                              </span>
                              {pkg.isActiveForLesson ? (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Đang dùng
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleActivate(pkg, Boolean(activePkg))
                                  }
                                  disabled={
                                    pending ||
                                    !canActivateScorm ||
                                    pkg.status !== "PUBLISHED"
                                  }
                                  title={
                                    !canActivateScorm
                                      ? "Chỉ Đào tạo mới đặt bản dùng"
                                      : pkg.status !== "PUBLISHED"
                                        ? "Chỉ gói đã phát hành mới đặt được"
                                        : "Đặt làm bản đang dùng của buổi"
                                  }
                                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-0.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                                >
                                  <Star className="h-3.5 w-3.5" /> Đặt bản dùng
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {/* R2-LMS-3 — upload gói SCORM inline (chỉ Đào tạo: training:manage). */}
                      {canActivateScorm && <LessonScormUpload lessonId={lesson.lessonId} />}
                      <Link
                        href="/admin/scorm"
                        className="mt-2 inline-flex items-center gap-0.5 text-xs font-semibold text-neutral-500 hover:text-[#7C3AED]"
                      >
                        Quản lý gói SCORM <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  )}

                  {/* ── Bài tập của buổi ──────────────────────────────── */}
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-3">
                    <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-neutral-600">
                      <BookOpen className="h-3.5 w-3.5" /> Bài tập của buổi
                    </h3>
                    {lesson.assignments.length === 0 ? (
                      <p className="mt-2 text-xs text-neutral-500">
                        Chưa gắn bài tập nào.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {lesson.assignments.map((a) => (
                          <li
                            key={a.id}
                            className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-sm"
                          >
                            <span className="font-medium text-neutral-800">
                              {a.title}
                            </span>
                            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">
                              {KIND_LABEL[a.kind]} · {a.className}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                run(() =>
                                  detachAssignmentFromLesson({ assignmentId: a.id }),
                                )
                              }
                              disabled={pending}
                              title="Gỡ bài tập khỏi buổi"
                              className="ml-auto inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-0.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                            >
                              <X className="h-3.5 w-3.5" /> Gỡ
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        value={pick}
                        onChange={(e) =>
                          setPicks((s) => ({
                            ...s,
                            [lesson.lessonId]: e.target.value,
                          }))
                        }
                        disabled={pending || availableAssignments.length === 0}
                        className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs outline-none focus:border-[#7C3AED] disabled:opacity-60"
                      >
                        <option value="">
                          {availableAssignments.length === 0
                            ? "Không còn bài tập trống để gắn…"
                            : "— Chọn bài tập đã có để gắn —"}
                        </option>
                        {availableAssignments.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.title} ({KIND_LABEL[a.kind]} · {a.className})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (!pick) return;
                          run(() =>
                            attachAssignmentToLesson({
                              lessonId: lesson.lessonId,
                              assignmentId: pick,
                            }),
                          );
                          setPicks((s) => ({ ...s, [lesson.lessonId]: "" }));
                        }}
                        disabled={pending || !pick}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#7C3AED] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" /> Gắn
                      </button>
                    </div>
                    <p className="mt-1.5 text-[11px] text-neutral-400">
                      Chỉ liệt kê bài tập cùng khoá học, chưa gắn buổi nào. Tạo bài
                      tập mới ở{" "}
                      <Link
                        href="/admin/assignments"
                        className="font-semibold text-neutral-500 hover:text-[#7C3AED]"
                      >
                        Quản lý bài tập
                      </Link>
                      .
                    </p>
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
