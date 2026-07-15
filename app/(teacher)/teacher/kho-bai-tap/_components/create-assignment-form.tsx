"use client";

// Trình soạn đề GV tự tạo — FULL PAGE (không popup). Nhiều câu; mỗi câu: Trắc nghiệm
// (N lựa chọn + đánh dấu đáp án đúng) hoặc Tự luận (đáp án mẫu tuỳ chọn). Lưu →
// createOwnTemplateAction → điều hướng về `back` (mặc định /teacher/kho-bai-tap; nếu
// vào từ trang Giao bài thì quay lại đúng trang đó). Cam-only.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createOwnTemplateAction } from "../_actions";

type QType = "MULTIPLE_CHOICE" | "ESSAY";
// AssignmentKind chỉ có HOMEWORK | CLASSWORK (enum FROZEN — không có TEST/QUIZ).
// Nhãn GV: "Bài tập" = HOMEWORK · "Kiểm tra" = CLASSWORK.
type Kind = "HOMEWORK" | "CLASSWORK";

interface DraftChoice {
  text: string;
  isCorrect: boolean;
}
interface DraftQuestion {
  type: QType;
  text: string;
  choices: DraftChoice[];
  correctAnswer: string; // đáp án mẫu tự luận
}

function makeMcq(): DraftQuestion {
  return {
    type: "MULTIPLE_CHOICE",
    text: "",
    choices: [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
    ],
    correctAnswer: "",
  };
}
function makeEssay(): DraftQuestion {
  return { type: "ESSAY", text: "", choices: [], correctAnswer: "" };
}

/** Chỉ nhận URL nội bộ /teacher/* để tránh open-redirect qua param `back`. */
function safeBack(raw: string | null): string {
  if (raw && raw.startsWith("/teacher/")) return raw;
  return "/teacher/kho-bai-tap";
}

export function CreateAssignmentForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const back = safeBack(sp.get("back"));

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Kind>("HOMEWORK");
  const [description, setDescription] = useState("");
  const [totalPoints, setTotalPoints] = useState("10");
  const [questions, setQuestions] = useState<DraftQuestion[]>([makeMcq()]);
  const [pending, start] = useTransition();

  // ── mutators (immutable) ──────────────────────────────────────────────────
  function patchQuestion(i: number, patch: Partial<DraftQuestion>) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function setType(i: number, type: QType) {
    setQuestions((qs) =>
      qs.map((q, idx) => {
        if (idx !== i) return q;
        if (type === "MULTIPLE_CHOICE") {
          return { ...q, type, choices: q.choices.length >= 2 ? q.choices : makeMcq().choices };
        }
        return { ...q, type };
      }),
    );
  }
  function patchChoice(qi: number, ci: number, patch: Partial<DraftChoice>) {
    setQuestions((qs) =>
      qs.map((q, idx) =>
        idx === qi
          ? { ...q, choices: q.choices.map((c, cIdx) => (cIdx === ci ? { ...c, ...patch } : c)) }
          : q,
      ),
    );
  }
  function addChoice(qi: number) {
    setQuestions((qs) =>
      qs.map((q, idx) =>
        idx === qi ? { ...q, choices: [...q.choices, { text: "", isCorrect: false }] } : q,
      ),
    );
  }
  function removeChoice(qi: number, ci: number) {
    setQuestions((qs) =>
      qs.map((q, idx) =>
        idx === qi ? { ...q, choices: q.choices.filter((_, cIdx) => cIdx !== ci) } : q,
      ),
    );
  }

  function validate(): string | null {
    if (!title.trim()) return "Nhập tiêu đề bài";
    if (!description.trim()) return "Nhập mô tả bài";
    const tp = Number(totalPoints);
    if (!Number.isFinite(tp) || tp <= 0) return "Tổng điểm phải lớn hơn 0";
    if (questions.length === 0) return "Cần ít nhất 1 câu hỏi";
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]!;
      if (!q.text.trim()) return `Câu ${i + 1}: chưa nhập nội dung`;
      if (q.type === "MULTIPLE_CHOICE") {
        const filled = q.choices.filter((c) => c.text.trim());
        if (filled.length < 2) return `Câu ${i + 1}: cần ít nhất 2 lựa chọn`;
        if (!q.choices.some((c) => c.isCorrect && c.text.trim()))
          return `Câu ${i + 1}: hãy đánh dấu đáp án đúng`;
      }
    }
    return null;
  }

  function submit() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    const payload = {
      title: title.trim(),
      kind,
      description: description.trim(),
      totalPoints: Number(totalPoints),
      questions: questions.map((q) =>
        q.type === "MULTIPLE_CHOICE"
          ? {
              type: "MULTIPLE_CHOICE" as const,
              text: q.text.trim(),
              choices: q.choices
                .filter((c) => c.text.trim())
                .map((c) => ({ text: c.text.trim(), isCorrect: c.isCorrect })),
            }
          : {
              type: "ESSAY" as const,
              text: q.text.trim(),
              correctAnswer: q.correctAnswer.trim() || null,
            },
      ),
    };
    start(async () => {
      const res = await createOwnTemplateAction(payload);
      if (res.ok) {
        toast.success("Đã lưu bài vào kho của bạn");
        router.push(back);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="t-card max-w-2xl space-y-5 p-5">
      {/* Thông tin chung */}
      <div className="space-y-1.5">
        <Label htmlFor="tpl-title">Tiêu đề</Label>
        <Input
          id="tpl-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Vd: Ôn tập cảm biến siêu âm — Sata 3"
          maxLength={200}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Hình thức</Label>
        <div className="flex gap-2">
          <SegBtn active={kind === "HOMEWORK"} onClick={() => setKind("HOMEWORK")}>
            Bài tập
          </SegBtn>
          <SegBtn active={kind === "CLASSWORK"} onClick={() => setKind("CLASSWORK")}>
            Kiểm tra
          </SegBtn>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <div className="space-y-1.5">
          <Label htmlFor="tpl-desc">Mô tả</Label>
          <Textarea
            id="tpl-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mô tả ngắn về bài / yêu cầu chung."
            rows={2}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tpl-points">Tổng điểm</Label>
          <Input
            id="tpl-points"
            type="number"
            min={0.1}
            step={0.5}
            value={totalPoints}
            onChange={(e) => setTotalPoints(e.target.value)}
          />
        </div>
      </div>

      {/* Danh sách câu hỏi */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Câu hỏi ({questions.length})</Label>
        </div>

        {questions.map((q, qi) => (
          <div key={qi} className="rounded-xl border border-border bg-muted/30 p-3.5">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">Câu {qi + 1}</span>
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <SegBtn
                    size="sm"
                    active={q.type === "MULTIPLE_CHOICE"}
                    onClick={() => setType(qi, "MULTIPLE_CHOICE")}
                  >
                    Trắc nghiệm
                  </SegBtn>
                  <SegBtn size="sm" active={q.type === "ESSAY"} onClick={() => setType(qi, "ESSAY")}>
                    Tự luận
                  </SegBtn>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={questions.length <= 1}
                  onClick={() => setQuestions((qs) => qs.filter((_, idx) => idx !== qi))}
                  aria-label={`Xoá câu ${qi + 1}`}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>

            <Textarea
              value={q.text}
              onChange={(e) => patchQuestion(qi, { text: e.target.value })}
              placeholder="Nhập nội dung câu hỏi..."
              rows={2}
              className="bg-background"
            />

            {q.type === "MULTIPLE_CHOICE" ? (
              <div className="mt-3 space-y-2">
                {q.choices.map((c, ci) => (
                  <div key={ci} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => patchChoice(qi, ci, { isCorrect: !c.isCorrect })}
                      aria-pressed={c.isCorrect}
                      aria-label={c.isCorrect ? "Đáp án đúng" : "Đánh dấu đáp án đúng"}
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                        c.isCorrect
                          ? "border-orange-500 bg-orange-500 text-white"
                          : "border-input bg-background text-transparent hover:border-orange-400",
                      )}
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <Input
                      value={c.text}
                      onChange={(e) => patchChoice(qi, ci, { text: e.target.value })}
                      placeholder={`Lựa chọn ${ci + 1}`}
                      className="bg-background"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      disabled={q.choices.length <= 2}
                      onClick={() => removeChoice(qi, ci)}
                      aria-label={`Xoá lựa chọn ${ci + 1}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addChoice(qi)}
                  className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm font-medium text-orange-600 outline-none hover:text-orange-700 focus-visible:ring-2 focus-visible:ring-ring dark:text-orange-400"
                >
                  <Plus className="h-4 w-4" aria-hidden /> Thêm lựa chọn
                </button>
                <p className="text-xs text-muted-foreground">
                  Bấm vòng tròn để đánh dấu đáp án đúng (có thể chọn nhiều).
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Đáp án mẫu (không bắt buộc)</Label>
                <Textarea
                  value={q.correctAnswer}
                  onChange={(e) => patchQuestion(qi, { correctAnswer: e.target.value })}
                  placeholder="Gợi ý đáp án / barem để chấm nhanh."
                  rows={2}
                  className="bg-background"
                />
              </div>
            )}
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setQuestions((qs) => [...qs, makeMcq()])}
          >
            <Plus /> Câu trắc nghiệm
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setQuestions((qs) => [...qs, makeEssay()])}
          >
            <Plus /> Câu tự luận
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button asChild variant="outline">
          <Link href={back}>Huỷ</Link>
        </Button>
        <Button onClick={submit} disabled={pending}>
          {pending ? "Đang lưu…" : "Lưu vào kho"}
        </Button>
      </div>
    </div>
  );
}

/** Nút segmented cam-only (chọn hình thức / loại câu). */
function SegBtn({
  active,
  onClick,
  children,
  size = "md",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  size?: "md" | "sm";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg border font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
        active
          ? "border-orange-500 bg-orange-500 text-white"
          : "border-input bg-background text-muted-foreground hover:border-orange-400 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
