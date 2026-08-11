"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ListChecks, Plus, Save, X } from "lucide-react";
import { setTemplateQuestions } from "../_actions";

export interface QSummary {
  id: string;
  questionCode: string | null;
  type: string;
  text: string;
}

const TYPE_LABEL: Record<string, string> = {
  MULTIPLE_CHOICE: "Trắc nghiệm",
  TRUE_FALSE: "Đúng / Sai",
  SHORT_ANSWER: "Trả lời ngắn",
  ESSAY: "Tự luận",
  CODE: "Lập trình",
};

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="mt-0.5 inline-flex shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
      {TYPE_LABEL[type] ?? type}
    </span>
  );
}

/**
 * FL1-06 (R2) — soạn câu hỏi cho MẪU bài tập.
 * Chọn câu hỏi từ ngân hàng (đã lọc theo khung CT của mẫu, chỉ public) và LƯU thành
 * AssignmentTemplateQuestion. Khi sinh bài giao cho lớp, mỗi câu được CLONE sang bài
 * → bài giao có câu hỏi thật, đáp được (không còn vỏ rỗng).
 */
export function TemplateQuestionPicker({
  templateId,
  hasCurriculum,
  bank,
  attached,
}: {
  templateId: string;
  hasCurriculum: boolean;
  bank: QSummary[];
  attached: QSummary[];
}) {
  const router = useRouter();

  // Map tra cứu hợp nhất (câu đã gắn có thể không còn trong bank nếu mất public/quá take).
  const byId = useMemo(() => {
    const m = new Map<string, QSummary>();
    for (const q of bank) m.set(q.id, q);
    for (const q of attached) m.set(q.id, q);
    return m;
  }, [bank, attached]);

  const [selected, setSelected] = useState<string[]>(() => attached.map((q) => q.id));
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedSet = new Set(selected);
  const available = bank.filter((q) => !selectedSet.has(q.id));

  function add(id: string) {
    setInfo(null);
    setSelected((s) => (s.includes(id) ? s : [...s, id]));
  }
  function remove(id: string) {
    setInfo(null);
    setSelected((s) => s.filter((x) => x !== id));
  }
  function move(index: number, dir: -1 | 1) {
    setInfo(null);
    setSelected((s) => {
      const j = index + dir;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function save() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await setTemplateQuestions({ templateId, questionIds: selected });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInfo("Đã lưu danh sách câu hỏi cho mẫu.");
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 p-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-700">
            <ListChecks className="h-4 w-4 text-primary" />
            Câu hỏi của mẫu ({selected.length})
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            {hasCurriculum
              ? "Chọn câu hỏi từ ngân hàng (lọc theo khung CT của mẫu, chỉ public). Khi sinh bài giao cho lớp, các câu này được sao chép vào bài."
              : "Gắn khung chương trình cho mẫu để chọn câu hỏi từ ngân hàng."}
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md hover:opacity-90 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {pending ? "Đang lưu..." : "Lưu câu hỏi"}
        </button>
      </header>

      {(error || info) && (
        <div className="px-4 pt-4">
          {error && (
            <div className="rounded-lg border border-state-danger-soft bg-state-danger-soft px-4 py-3 text-sm text-state-danger-ink">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-lg border border-state-success-soft bg-state-success-soft px-4 py-3 text-sm text-state-success-ink">
              {info}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
        {/* Đã chọn (có thứ tự) */}
        <div className="rounded-lg border border-neutral-200">
          <div className="border-b border-neutral-100 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-600">
            Đã chọn — theo thứ tự
          </div>
          {selected.length === 0 ? (
            <div className="p-6 text-center text-sm text-neutral-400">
              Chưa chọn câu hỏi nào.
            </div>
          ) : (
            <ul className="divide-y divide-neutral-50">
              {selected.map((id, i) => {
                const q = byId.get(id);
                return (
                  <li key={id} className="flex items-start gap-2 px-3 py-2.5">
                    <span className="mt-0.5 w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-neutral-400">
                      {i + 1}.
                    </span>
                    {q ? <TypeBadge type={q.type} /> : null}
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-sm text-neutral-800">
                        {q?.text ?? <span className="italic text-neutral-400">Câu hỏi #{id}</span>}
                      </div>
                      {q?.questionCode && (
                        <div className="text-xs tabular-nums text-neutral-400">
                          {q.questionCode}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={pending || i === 0}
                        title="Lên"
                        className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={pending || i === selected.length - 1}
                        title="Xuống"
                        className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(id)}
                        disabled={pending}
                        title="Bỏ"
                        className="rounded-md p-1 text-state-danger-ink hover:bg-state-danger-soft hover:text-state-danger-ink disabled:opacity-30"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Ngân hàng (chưa chọn) */}
        <div className="rounded-lg border border-neutral-200">
          <div className="border-b border-neutral-100 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-600">
            Ngân hàng câu hỏi ({available.length})
          </div>
          {!hasCurriculum ? (
            <div className="p-6 text-center text-sm text-neutral-400">
              Gắn khung chương trình để xem câu hỏi.
            </div>
          ) : available.length === 0 ? (
            <div className="p-6 text-center text-sm text-neutral-400">
              {bank.length === 0
                ? "Chưa có câu hỏi public nào trong khung chương trình này."
                : "Đã chọn hết câu hỏi khả dụng."}
            </div>
          ) : (
            <ul className="divide-y divide-neutral-50">
              {available.map((q) => (
                <li key={q.id} className="flex items-start gap-2 px-3 py-2.5">
                  <TypeBadge type={q.type} />
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm text-neutral-800">{q.text}</div>
                    {q.questionCode && (
                      <div className="text-xs tabular-nums text-neutral-400">
                        {q.questionCode}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => add(q.id)}
                    disabled={pending}
                    title="Thêm vào mẫu"
                    className="shrink-0 rounded-md p-1 text-primary hover:bg-primary-soft disabled:opacity-30"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
