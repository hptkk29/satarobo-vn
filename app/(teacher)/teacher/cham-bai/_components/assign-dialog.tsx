"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreateAssignmentDialog } from "../../kho-bai-tap/_components/create-assignment-dialog";
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

/**
 * "Giao bài" — chọn NGUỒN đầu bài (Kho của tôi | Thư viện Đào tạo) → đầu bài + lớp
 * mình phụ trách + hạn nộp → sinh Assignment PUBLISHED. Có nút "+ Tạo bài tập mới"
 * mở trình soạn đề (CreateAssignmentDialog). Action tự khoá theo assignedClassIds.
 */
export function AssignDialog({
  classes,
  templates,
}: {
  classes: AssignClass[];
  templates: AssignTemplate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
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
        setOpen(false);
        setTemplateId("");
        setDue("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      {/* Dialog controlled (open/onOpenChange) theo pattern site GV — không DialogTrigger. */}
      <Button className="shrink-0" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Giao bài
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
          <DialogHeader>
            <DialogTitle>Giao bài cho lớp</DialogTitle>
            <DialogDescription>
              Chọn nguồn đầu bài, lớp bạn phụ trách và hạn nộp. Bài giao xong sẽ mở ngay
              cho học viên.
            </DialogDescription>
          </DialogHeader>

          {noClass ? (
            <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              Bạn chưa được phân công lớp nào.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Nguồn đầu bài */}
              <div className="space-y-1.5">
                <Label>Nguồn đầu bài</Label>
                <div className="flex gap-2">
                  <SourceBtn
                    active={source === "mine"}
                    onClick={() => switchSource("mine")}
                  >
                    Kho của tôi ({mineCount})
                  </SourceBtn>
                  <SourceBtn
                    active={source === "training"}
                    onClick={() => switchSource("training")}
                  >
                    Thư viện Đào tạo ({trainingCount})
                  </SourceBtn>
                </div>
              </div>

              {/* Đầu bài */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label>Đầu bài</Label>
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-semibold text-orange-600 outline-none hover:text-orange-700 focus-visible:ring-2 focus-visible:ring-ring dark:text-orange-400"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden /> Tạo bài tập mới
                  </button>
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
                        {(v: string | null) =>
                          visibleTemplates.find((t) => t.id === v)?.title ?? ""
                        }
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
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button onClick={submit} disabled={pending || noClass || noTemplate}>
              {pending ? "Đang giao…" : "Giao bài"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trình soạn đề — sau khi tạo, chuyển nguồn về "Kho của tôi", chọn đề mới + refresh. */}
      <CreateAssignmentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          setSource("mine");
          setTemplateId(id);
          router.refresh();
        }}
      />
    </>
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
