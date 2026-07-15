"use client";

// Giao bài cho lớp — FULL PAGE (không popup). Chọn NGUỒN đầu bài (Kho của tôi | Thư
// viện Đào tạo) → đầu bài + lớp mình phụ trách + hạn nộp → sinh Assignment PUBLISHED.
// Nút "Tạo bài tập mới" ĐIỀU HƯỚNG sang trang soạn đề (/teacher/kho-bai-tap?compose=tao),
// soạn xong quay lại đúng trang giao bài này (back=selfHref). Action tự khoá assignedClassIds.
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assignTemplateAction } from "../_actions";

export interface AssignClass {
  id: string;
  name: string;
}
export interface AssignTemplate {
  id: string;
  title: string;
  /** true = có câu hỏi (kiểm tra); dùng để hiện nhãn phụ. */
  isTest: boolean;
  /** true = đề GV tự soạn (Kho của tôi); false = thư viện Đào tạo/admin. */
  isMine: boolean;
}

type Source = "mine" | "training";

export function AssignForm({
  classes,
  templates,
  /** URL quay về sau khi giao xong / bấm Huỷ. */
  back,
  /** URL trang giao bài hiện tại — để trang soạn đề quay lại đúng chỗ. */
  selfHref,
}: {
  classes: AssignClass[];
  templates: AssignTemplate[];
  back: string;
  selfHref: string;
}) {
  const router = useRouter();
  const [source, setSource] = useState<Source>("training");
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [templateId, setTemplateId] = useState("");
  const [due, setDue] = useState("");
  const [pending, start] = useTransition();

  const mineCount = useMemo(() => templates.filter((t) => t.isMine).length, [templates]);
  const trainingCount = templates.length - mineCount;

  const visibleTemplates = useMemo(
    () => templates.filter((t) => (source === "mine" ? t.isMine : !t.isMine)),
    [templates, source],
  );

  const noClass = classes.length === 0;
  const noTemplate = visibleTemplates.length === 0;
  const createHref = `/teacher/kho-bai-tap?compose=tao&back=${encodeURIComponent(selfHref)}`;

  function switchSource(next: Source) {
    if (next === source) return;
    setSource(next);
    setTemplateId(""); // đề của nguồn cũ không còn trong danh sách → bỏ chọn
  }

  function submit() {
    if (!classId) return toast.error("Hãy chọn lớp");
    if (!templateId) return toast.error("Hãy chọn một đầu bài");
    start(async () => {
      const res = await assignTemplateAction({ templateId, classId, due: due || null });
      if (res.ok) {
        toast.success("Đã giao bài cho lớp");
        router.push(back);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  if (noClass) {
    return (
      <p className="t-card px-4 py-3 text-sm text-muted-foreground">
        Bạn chưa được phân công lớp nào.
      </p>
    );
  }

  return (
    <div className="t-card max-w-2xl space-y-5 p-5">
      {/* Nguồn đầu bài */}
      <div className="space-y-1.5">
        <Label>Nguồn đầu bài</Label>
        <div className="flex gap-2">
          <SourceBtn active={source === "mine"} onClick={() => switchSource("mine")}>
            Kho của tôi ({mineCount})
          </SourceBtn>
          <SourceBtn active={source === "training"} onClick={() => switchSource("training")}>
            Thư viện Đào tạo ({trainingCount})
          </SourceBtn>
        </div>
      </div>

      {/* Đầu bài */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label>Đầu bài</Label>
          <Link
            href={createHref}
            className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-semibold text-orange-600 outline-none hover:text-orange-700 focus-visible:ring-2 focus-visible:ring-ring dark:text-orange-400"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Tạo bài tập mới
          </Link>
        </div>
        {noTemplate ? (
          <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            {source === "mine"
              ? 'Kho của bạn chưa có đề nào. Bấm "Tạo bài tập mới" để soạn.'
              : "Thư viện Đào tạo chưa có đầu bài nào."}
          </p>
        ) : (
          <Select value={templateId} onValueChange={(v) => v !== null && setTemplateId(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Chọn đầu bài">
                {(v: string | null) => visibleTemplates.find((t) => t.id === v)?.title ?? ""}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {visibleTemplates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                  {t.isTest ? " · Kiểm tra" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Lớp */}
      <div className="space-y-1.5">
        <Label>Lớp</Label>
        <Select value={classId} onValueChange={(v) => v !== null && setClassId(v)}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {(v: string | null) => classes.find((c) => c.id === v)?.name ?? ""}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Hạn nộp */}
      <div className="space-y-1.5">
        <Label htmlFor="assign-due">Hạn nộp (không bắt buộc)</Label>
        <input
          id="assign-due"
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button asChild variant="outline">
          <Link href={back}>Huỷ</Link>
        </Button>
        <Button onClick={submit} disabled={pending || noTemplate}>
          {pending ? "Đang giao…" : "Giao bài"}
        </Button>
      </div>
    </div>
  );
}

/** Nút chọn nguồn đầu bài — cam-only segmented. */
function SourceBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-orange-500 bg-orange-500 text-white"
          : "border-input bg-background text-muted-foreground hover:border-orange-400 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
