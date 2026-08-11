// student-eval-dialog.tsx — Phiếu "Nhận xét buổi học" 1 HV (port TeachUI StudentEvalDialog).
//
// Dự án + ① 4 mục nhận xét văn xuôi (Kiến thức/Kỹ năng/Thái độ/Đề xuất) + ② rubric 9
// tiêu chí (dropdown 5 mức). Lưu qua saveSessionEval (self-gated own-class). Dialog
// CONTROLLED + Button onClick (pattern site GV — KHÔNG DialogTrigger render).
// ⚠️ Câu 46: props CHỈ tên HV — không SĐT/email/tên PH.
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronRight,
  CircleCheck,
  ClipboardPen,
  FileDown,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DEFAULT_EVAL_LEVEL,
  DEFAULT_PROJECT_NAME,
  EMPTY_NOTES,
  EVAL_CRITERIA,
  EVAL_NOTE_FIELDS,
  groupedEvalCriteria,
  type EvalNotes,
} from "@/lib/lms/session-eval-rubric";
import { saveSessionEval } from "@/app/(admin)/admin/sessions/[id]/_actions";

export type StudentEvalExisting = {
  projectName: string | null;
  notes: EvalNotes;
  rubric: Record<string, number>;
} | null;

const GROUPS = groupedEvalCriteria();

const inputCls =
  "w-full rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary-soft focus:ring-2 focus:ring-primary-soft dark:focus:ring-primary";

export function StudentEvalDialog({
  sessionId,
  studentId,
  studentName,
  courseName,
  sessionTopic,
  sessionDate,
  existing,
  done,
  pdfHref,
}: {
  sessionId: string;
  studentId: string;
  studentName: string;
  courseName: string;
  sessionTopic: string;
  sessionDate: string;
  existing: StudentEvalExisting;
  done: boolean;
  pdfHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(done);

  const [projectName, setProjectName] = useState(
    existing?.projectName ?? DEFAULT_PROJECT_NAME,
  );
  const [notes, setNotes] = useState<EvalNotes>(existing?.notes ?? EMPTY_NOTES);
  const [ratings, setRatings] = useState<Record<string, number>>(() => {
    const seed: Record<string, number> = {};
    for (const c of EVAL_CRITERIA)
      seed[c.id] = existing?.rubric?.[c.id] ?? DEFAULT_EVAL_LEVEL;
    return seed;
  });

  function submit() {
    start(async () => {
      const res = await saveSessionEval({
        sessionId,
        studentId,
        projectName,
        notes,
        rubric: ratings,
      });
      if (res.ok) {
        toast.success(`Đã lưu phiếu nhận xét — ${studentName}`);
        setSaved(true);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        size="sm"
        variant={saved ? "outline" : "default"}
        onClick={() => setOpen(true)}
      >
        <ClipboardPen className="h-4 w-4" aria-hidden />
        {saved ? "Xem phiếu" : "Nhận xét"}
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </Button>
      {saved && (
        <a
          href={pdfHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FileDown className="h-3.5 w-3.5" aria-hidden /> Xuất PDF
        </a>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        {/* base DialogContent mặc định sm:max-w-sm (384px) → PHẢI override ở CHÍNH
            modifier sm: nếu không phiếu bị bó hẹp; 2 cột cần ~896px. */}
        <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto p-5 sm:max-w-4xl">
          <DialogHeader className="mb-3">
            <DialogTitle>Nhận xét buổi học</DialogTitle>
            <DialogDescription>
              {studentName} · {courseName} · {sessionTopic} ({sessionDate})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Dự án */}
            <div>
              <label className="mb-1 block text-sm font-semibold text-foreground">
                Dự án
              </label>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className={inputCls}
              />
            </div>

            <div className="grid items-start gap-4 md:grid-cols-2">
              {/* ① Nhận xét của giáo viên */}
              <section>
                <SectionTitle num={1} title="Nhận xét của giáo viên" />
                <div className="space-y-2 rounded-xl border border-border border-l-4 border-l-primary bg-muted/40 p-3.5">
                  {EVAL_NOTE_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="mb-0.5 block text-xs font-bold text-primary-ink">
                        {f.label}
                      </label>
                      <textarea
                        value={notes[f.key]}
                        onChange={(e) =>
                          setNotes((n) => ({ ...n, [f.key]: e.target.value }))
                        }
                        rows={1}
                        placeholder={`Nhận xét về ${f.label.toLowerCase()}...`}
                        className="w-full resize-y rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary-soft focus:ring-2 focus:ring-primary-soft dark:focus:ring-primary"
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* ② Đánh giá chi tiết năng lực */}
              <section className="space-y-3">
                <SectionTitle num={2} title="Đánh giá chi tiết năng lực" />
                <div className="space-y-3">
                  {GROUPS.map(([group, items]) => (
                    <div
                      key={group}
                      className="rounded-xl border border-border p-3.5"
                    >
                      <p className="mb-2 text-sm font-bold text-primary-ink">
                        {group}
                      </p>
                      <div className="space-y-2">
                        {items.map((c) => (
                          <div
                            key={c.id}
                            className="grid grid-cols-[1fr_1.2fr] items-center gap-1"
                          >
                            <label
                              htmlFor={`ev-${c.id}`}
                              className="line-clamp-2 text-xs font-semibold text-foreground"
                            >
                              {c.name}
                            </label>
                            <select
                              id={`ev-${c.id}`}
                              value={ratings[c.id]}
                              onChange={(e) =>
                                setRatings((r) => ({
                                  ...r,
                                  [c.id]: Number(e.target.value),
                                }))
                              }
                              className="w-full rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground outline-none focus:border-primary-soft focus:ring-2 focus:ring-primary-soft dark:focus:ring-primary"
                            >
                              {c.levels.map((lv) => (
                                <option key={lv.value} value={lv.value}>
                                  {lv.text}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Thao tác */}
            <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
              {saved && (
                <Badge
                  variant="outline"
                  className="border-state-success-soft bg-state-success-soft text-state-success-ink dark:border-state-success"
                >
                  <CircleCheck className="h-3.5 w-3.5" aria-hidden /> Đã lưu
                  nhận xét
                </Badge>
              )}
              <Button
                variant={saved ? "outline" : "default"}
                onClick={submit}
                disabled={pending}
              >
                <Save className="mr-1.5 h-4 w-4" aria-hidden />
                {pending ? "Đang lưu…" : "Lưu nhận xét"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionTitle({ num, title }: { num: number; title: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-extrabold text-white">
        {num}
      </span>
      <h3 className="text-sm font-bold uppercase tracking-wide text-primary-ink">
        {title}
      </h3>
    </div>
  );
}
