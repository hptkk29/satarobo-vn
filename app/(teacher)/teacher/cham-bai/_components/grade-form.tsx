// app/(teacher)/teacher/cham-bai/_components/grade-form.tsx — MÀN B (chấm bài).
//
// Visual PORT từ project mock satarobo-ui-giaovien (class-hub.tsx, tab "Bài tập
// & Kiểm tra" — bảng chấm + input điểm) + rubric dialog admin (submission-row.tsx).
// GIỮ NGUYÊN data contract + action THẬT: tái dùng gradeSubmission /
// gradeSubmissionRubric của admin (gate quyền nằm TRONG action — GV chỉ chấm
// lớp mình). shadcn thuần — KHÔNG Magic UI/Framer/Recharts.
//
// 2 chế độ toggle:
//   · "Chấm điểm nhanh": score 0..totalPoints + nhận xét tuỳ chọn → gradeSubmission.
//   · "Chấm rubric": 6 tiêu chí robotics × 4 mức (RUBRIC_CRITERIA/RUBRIC_LEVELS)
//     + nhận xét BẮT BUỘC (≥5 ký tự) → gradeSubmissionRubric (tự quy đổi điểm).
//
// Câu 46: props CHỈ chứa tên học viên — KHÔNG SĐT/email/tên PH.
"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RubricCriterion, RubricLevel } from "@prisma/client";
import { ExternalLink, Save } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { RUBRIC_CRITERIA, RUBRIC_LEVELS, rubricToScore } from "@/lib/rubric/criteria";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  gradeSubmission,
  gradeSubmissionRubric,
} from "@/app/(admin)/admin/assignments/_actions";

// Màu chip active theo mức rubric — bám tone màu chữ của RUBRIC_LEVELS
// (rose/amber/blue/emerald trong lib/rubric/criteria).
const LEVEL_ACTIVE: Record<RubricLevel, string> = {
  NEED_SUPPORT: "border-rose-500 bg-rose-500 text-white",
  BASIC: "border-amber-500 bg-amber-500 text-white",
  GOOD: "border-blue-500 bg-blue-500 text-white",
  EXCELLENT: "border-emerald-600 bg-emerald-600 text-white",
};

/** Kích thước file dễ đọc cho link tài liệu nộp. */
function formatSize(bytes: number | null): string | null {
  if (bytes == null || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type GradeFormProps = {
  submissionId: string;
  studentName: string;
  totalPoints: number;
  /** Đã format vi-VN Asia/Ho_Chi_Minh ở server — tránh lệch timezone client. */
  submittedAtText: string | null;
  isLate: boolean;
  /** Đã chấm rồi (vào từ URL trực tiếp) — cho chấm lại, hiện điểm/nhận xét cũ. */
  graded: boolean;
  textAnswer: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  initialScore: number | null;
  initialFeedback: string | null;
  /** Query suffix (bắt đầu bằng "?") để quay về sau khi chấm xong — GHÉP với pathname
   * hiện tại nên host-safe (/lop vs /teacher/lop). Mặc định (undefined) = về pathname
   * trần (list trang /cham-bai). Class Hub truyền "?classId=…&tab=bai-tap&asgId=…". */
  backHref?: string;
};

export function GradeForm({
  submissionId,
  studentName,
  totalPoints,
  submittedAtText,
  isLate,
  graded,
  textAnswer,
  fileUrl,
  fileName,
  fileSize,
  initialScore,
  initialFeedback,
  backHref,
}: GradeFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const [mode, setMode] = useState<"quick" | "rubric">("quick");
  const [score, setScore] = useState(initialScore != null ? String(initialScore) : "");
  // Nhận xét dùng CHUNG 2 chế độ (đổi chế độ không mất chữ đã gõ);
  // chấm nhanh = tuỳ chọn, rubric = bắt buộc ≥5 ký tự (khớp RubricGradeSchema).
  const [feedback, setFeedback] = useState(initialFeedback ?? "");
  const [levels, setLevels] = useState<Partial<Record<RubricCriterion, RubricLevel>>>({});
  const [sendEmail, setSendEmail] = useState(false);

  // Điểm quy đổi xem trước — cùng công thức rubricToScore action dùng khi lưu.
  const chosen = RUBRIC_CRITERIA.flatMap((c) => {
    const level = levels[c.key];
    return level ? [{ criterion: c.key, level }] : [];
  });
  const previewScore =
    chosen.length === RUBRIC_CRITERIA.length ? rubricToScore(chosen) : null;

  /** Sau khi chấm OK: về list (bỏ query) + refresh để bài biến khỏi "chờ chấm".
   * Trong Class Hub, backHref trỏ về roster chi tiết bài để chấm HV tiếp theo. */
  function backToList() {
    router.replace(backHref ? `${pathname}${backHref}` : pathname);
    router.refresh();
  }

  function submitQuick() {
    const n = Number(score);
    if (score.trim() === "" || Number.isNaN(n)) {
      toast.error("Nhập điểm hợp lệ");
      return;
    }
    if (n < 0 || n > totalPoints) {
      toast.error(`Điểm trong khoảng 0–${totalPoints}`);
      return;
    }
    startTransition(async () => {
      const res = await gradeSubmission({
        submissionId,
        score: n,
        feedback: feedback.trim() || null,
      });
      if (res.ok) {
        toast.success(`Đã chấm ${n}/${totalPoints} cho ${studentName}`);
        backToList();
      } else {
        toast.error(res.error);
      }
    });
  }

  function submitRubric() {
    const missing = RUBRIC_CRITERIA.filter((c) => !levels[c.key]);
    if (missing.length > 0) {
      toast.error(`Chưa chấm: ${missing.map((m) => m.label).join(", ")}`);
      return;
    }
    if (feedback.trim().length < 5) {
      toast.error("Nhận xét là bắt buộc (tối thiểu 5 ký tự)");
      return;
    }
    startTransition(async () => {
      const res = await gradeSubmissionRubric({
        submissionId,
        scores: RUBRIC_CRITERIA.map((c) => ({
          criterion: c.key,
          level: levels[c.key] as RubricLevel,
        })),
        feedback: feedback.trim(),
        sendEmail,
      });
      if (res.ok) {
        toast.success(`Đã chấm rubric cho ${studentName}`);
        backToList();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* ── Nội dung bài nộp ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Bài nộp</CardTitle>
            <div className="flex items-center gap-2">
              {isLate && (
                <Badge
                  variant="outline"
                  className="border-amber-300 text-amber-700 dark:border-amber-500/40 dark:text-amber-300"
                >
                  Nộp muộn
                </Badge>
              )}
              {graded && (
                <Badge
                  variant="outline"
                  className="border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300"
                >
                  Đã chấm{initialScore != null ? ` — ${initialScore}/${totalPoints}` : ""}
                </Badge>
              )}
            </div>
          </div>
          {submittedAtText && (
            <p className="text-sm text-muted-foreground">Nộp lúc: {submittedAtText}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {textAnswer && (
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="whitespace-pre-wrap text-sm text-foreground">{textAnswer}</p>
            </div>
          )}
          {fileUrl && (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              {fileName ?? "Tệp đính kèm"}
              {formatSize(fileSize) && (
                <span className="font-normal text-muted-foreground">({formatSize(fileSize)})</span>
              )}
            </a>
          )}
          {!textAnswer && !fileUrl && (
            <p className="text-sm text-muted-foreground">Không có nội dung đính kèm.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Chấm điểm ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Chấm điểm</CardTitle>
            {/* Toggle 2 chế độ — chip pattern như attendance-panel */}
            <div className="flex gap-1.5">
              {(
                [
                  { key: "quick", label: "Chấm điểm nhanh" },
                  { key: "rubric", label: "Chấm rubric" },
                ] as const
              ).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  disabled={pending}
                  onClick={() => setMode(m.key)}
                  aria-pressed={mode === m.key}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    mode === m.key
                      ? "border-orange-500 bg-orange-500 text-white"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === "quick" ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">
                Điểm (0–{totalPoints})
              </span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={totalPoints}
                step={0.5}
                value={score}
                disabled={pending}
                onChange={(e) => setScore(e.target.value)}
                placeholder={`0–${totalPoints}`}
                className="w-32"
              />
            </label>
          ) : (
            <div className="space-y-3">
              {RUBRIC_CRITERIA.map((c) => (
                <div key={c.key} className="rounded-lg border border-border p-3">
                  <div className="mb-2">
                    <p className="text-sm font-semibold text-foreground">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.desc}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {RUBRIC_LEVELS.map((l) => {
                      const active = levels[c.key] === l.key;
                      return (
                        <button
                          key={l.key}
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            setLevels((prev) => ({ ...prev, [c.key]: l.key }))
                          }
                          aria-pressed={active}
                          aria-label={`${l.label} — ${c.label}`}
                          className={cn(
                            "rounded-md border px-2.5 py-1 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                            active
                              ? LEVEL_ACTIVE[l.key]
                              : "border-border bg-card text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {l.label} ({l.points})
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <p className="text-sm text-muted-foreground">
                Điểm quy đổi:{" "}
                <span className="font-semibold text-foreground">
                  {previewScore != null ? `${previewScore}/10` : "— (chấm đủ 6 tiêu chí)"}
                </span>
              </p>
            </div>
          )}

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">
              Nhận xét {mode === "rubric" ? "(bắt buộc)" : "(tuỳ chọn)"}
            </span>
            <Textarea
              rows={3}
              value={feedback}
              disabled={pending}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Nhận xét về bài làm của học viên…"
            />
          </label>

          {mode === "rubric" && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={sendEmail}
                disabled={pending}
                onChange={(e) => setSendEmail(e.target.checked)}
              />
              Gửi email kết quả cho phụ huynh
            </label>
          )}

          <div className="flex justify-end">
            <Button
              onClick={mode === "quick" ? submitQuick : submitRubric}
              disabled={pending}
            >
              <Save className="mr-1.5 h-4 w-4" />
              {pending ? "Đang lưu…" : "Lưu điểm"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
