"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ClipboardCheck, FileText, Gavel, X } from "lucide-react";
import { DocumentUploader, type UploadedFile } from "@/components/admin/DocumentUploader";
import { gradeSubmission, recordSubmission } from "../_actions";

type Status = "NOT_SUBMITTED" | "SUBMITTED" | "LATE" | "GRADED";

const STATUS_INFO: Record<Status, { label: string; color: string }> = {
  NOT_SUBMITTED: { label: "Chưa nộp", color: "bg-gray-100 text-gray-700" },
  SUBMITTED: { label: "Đã nộp", color: "bg-blue-100 text-blue-700" },
  LATE: { label: "Nộp muộn", color: "bg-amber-100 text-amber-700" },
  GRADED: { label: "Đã chấm", color: "bg-green-100 text-green-700" },
};

export interface SubmissionRowData {
  id: string;
  status: Status;
  textAnswer: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  submittedAt: Date | null;
  score: number | null;
  feedback: string | null;
  gradedAt: Date | null;
  studentName: string;
  studentCode: string | null;
  studentParentPhone: string | null;
  totalPoints: number;
  gradedByName: string | null;
}

function fmtDateTime(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SubmissionRow({ row }: { row: SubmissionRowData }) {
  const router = useRouter();
  const statusInfo = STATUS_INFO[row.status];
  const [recordOpen, setRecordOpen] = useState(false);
  const [gradeOpen, setGradeOpen] = useState(false);

  const canRecord = row.status === "NOT_SUBMITTED";
  const canGrade = row.status === "SUBMITTED" || row.status === "LATE" || row.status === "GRADED";

  return (
    <tr className="hover:bg-neutral-50/60">
      <td className="px-3 py-3">
        <div className="font-medium text-neutral-900">{row.studentName}</div>
        {row.studentCode && (
          <div className="text-xs text-neutral-400 tabular-nums">
            {row.studentCode}
          </div>
        )}
        {row.studentParentPhone && (
          <div className="text-xs text-neutral-400 tabular-nums">
            PH: {row.studentParentPhone}
          </div>
        )}
      </td>
      <td className="px-3 py-3">
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.color}`}
        >
          {statusInfo.label}
        </span>
      </td>
      <td className="px-3 py-3 text-xs text-neutral-500 tabular-nums">
        {fmtDateTime(row.submittedAt)}
      </td>
      <td className="px-3 py-3">
        {row.textAnswer || row.fileUrl ? (
          <div className="space-y-1 max-w-[260px]">
            {row.textAnswer && (
              <p className="text-xs text-neutral-700 line-clamp-2">
                {row.textAnswer}
              </p>
            )}
            {row.fileUrl && (
              <a
                href={row.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
              >
                <FileText className="h-3 w-3" />
                {row.fileName ?? "Tải file"}
              </a>
            )}
          </div>
        ) : (
          <span className="text-neutral-300">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-right text-sm tabular-nums font-semibold text-neutral-700">
        {row.score !== null ? `${row.score}/${row.totalPoints}` : "—"}
      </td>
      <td className="px-3 py-3 text-xs text-neutral-500 max-w-[200px]">
        {row.feedback ? (
          <p className="line-clamp-2">{row.feedback}</p>
        ) : (
          <span className="text-neutral-300">—</span>
        )}
        {row.gradedByName && (
          <p className="mt-0.5 text-[10px] text-neutral-400">
            bởi {row.gradedByName}
          </p>
        )}
      </td>
      <td className="px-3 py-3 text-right">
        <div className="inline-flex gap-1">
          {canRecord && (
            <button
              type="button"
              onClick={() => setRecordOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              Ghi nhận
            </button>
          )}
          {canGrade && (
            <button
              type="button"
              onClick={() => setGradeOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-purple-300 bg-white px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-50"
            >
              <Gavel className="h-3.5 w-3.5" />
              {row.status === "GRADED" ? "Sửa điểm" : "Chấm"}
            </button>
          )}
        </div>
      </td>

      {recordOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <RecordSubmissionDialog
            submissionId={row.id}
            studentName={row.studentName}
            onClose={() => setRecordOpen(false)}
            onSuccess={() => {
              setRecordOpen(false);
              router.refresh();
            }}
          />,
          document.body,
        )}
      {gradeOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <GradeSubmissionDialog
            submissionId={row.id}
            studentName={row.studentName}
            currentScore={row.score}
            currentFeedback={row.feedback}
            totalPoints={row.totalPoints}
            onClose={() => setGradeOpen(false)}
            onSuccess={() => {
              setGradeOpen(false);
              router.refresh();
            }}
          />,
          document.body,
        )}
    </tr>
  );
}

function RecordSubmissionDialog({
  submissionId,
  studentName,
  onClose,
  onSuccess,
}: {
  submissionId: string;
  studentName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [textAnswer, setTextAnswer] = useState("");
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    onClose();
  }

  function handleSubmit() {
    setError(null);
    if (!textAnswer.trim() && !file) {
      setError("Cần điền text hoặc upload file");
      return;
    }
    startTransition(async () => {
      const res = await recordSubmission({
        submissionId,
        textAnswer: textAnswer.trim() || null,
        fileUrl: file?.url ?? null,
        fileName: file?.fileName ?? null,
        fileSize: file?.fileSize ?? null,
        mimeType: file?.mimeType ?? null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSuccess();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-8"
      onClick={close}
    >
      <div
        className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Đóng"
          className="absolute right-3 top-3 rounded-md p-1 text-neutral-500 hover:bg-neutral-100"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="flex items-center gap-2 text-lg font-bold text-neutral-900">
          <ClipboardCheck className="h-5 w-5 text-blue-500" />
          Ghi nhận bài nộp
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          HS: <strong>{studentName}</strong>
        </p>
        <p className="mt-0.5 text-xs text-neutral-400">
          Dùng cho luồng offline/Zalo — admin nhập thay HS. Nếu quá hạn sẽ tự
          set LATE.
        </p>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">
              Nội dung trả lời (text)
            </span>
            <textarea
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              rows={4}
              disabled={pending}
              placeholder="Nội dung HS gửi qua Zalo/email/giấy..."
              className="w-full resize-y rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </label>
          <div>
            <span className="mb-1 block text-xs font-semibold text-neutral-700">
              File đính kèm (tuỳ chọn)
            </span>
            <DocumentUploader
              value={file}
              onChange={setFile}
              disabled={pending}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-bold text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {pending ? "Đang lưu..." : "Lưu bài nộp"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GradeSubmissionDialog({
  submissionId,
  studentName,
  currentScore,
  currentFeedback,
  totalPoints,
  onClose,
  onSuccess,
}: {
  submissionId: string;
  studentName: string;
  currentScore: number | null;
  currentFeedback: string | null;
  totalPoints: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [score, setScore] = useState<number>(currentScore ?? 0);
  const [feedback, setFeedback] = useState(currentFeedback ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    onClose();
  }

  function handleSubmit() {
    setError(null);
    if (!Number.isFinite(score) || score < 0) {
      setError("Điểm phải là số >= 0");
      return;
    }
    if (score > totalPoints) {
      setError(`Điểm vượt tổng điểm (${totalPoints})`);
      return;
    }
    startTransition(async () => {
      const res = await gradeSubmission({
        submissionId,
        score,
        feedback: feedback.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSuccess();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={close}
    >
      <div
        className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Đóng"
          className="absolute right-3 top-3 rounded-md p-1 text-neutral-500 hover:bg-neutral-100"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="flex items-center gap-2 text-lg font-bold text-neutral-900">
          <Gavel className="h-5 w-5 text-purple-500" />
          Chấm điểm bài nộp
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          HS: <strong>{studentName}</strong> · Tổng: {totalPoints}
        </p>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">
              Điểm * (0 - {totalPoints})
            </span>
            <input
              type="number"
              min={0}
              max={totalPoints}
              step={0.1}
              value={score}
              onChange={(e) =>
                setScore(Math.max(0, parseFloat(e.target.value) || 0))
              }
              disabled={pending}
              className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">
              Nhận xét
            </span>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              disabled={pending}
              placeholder="Đã làm tốt phần... cần improve..."
              className="w-full resize-y rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-bold text-white hover:bg-purple-600 disabled:opacity-50"
          >
            {pending ? "Đang lưu..." : "Lưu điểm"}
          </button>
        </div>
      </div>
    </div>
  );
}
