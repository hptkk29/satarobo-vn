"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
}

/**
 * "Giao bài" — chọn đầu bài (thư viện admin) + lớp mình phụ trách + hạn nộp →
 * sinh Assignment PUBLISHED. Action tự khoá theo assignedClassIds (cấp lớp).
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
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [templateId, setTemplateId] = useState("");
  const [due, setDue] = useState("");
  const [pending, start] = useTransition();

  const noClass = classes.length === 0;
  const noTemplate = templates.length === 0;

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
            Chọn đầu bài từ thư viện, lớp bạn phụ trách và hạn nộp. Bài giao xong sẽ mở
            ngay cho học viên.
          </DialogDescription>
        </DialogHeader>

        {noClass ? (
          <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            Bạn chưa được phân công lớp nào.
          </p>
        ) : noTemplate ? (
          <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            Thư viện chưa có đầu bài nào để giao. Bộ phận Đào tạo soạn kho đầu bài trước.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Đầu bài</Label>
              <Select value={templateId} onValueChange={(v) => v !== null && setTemplateId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Chọn đầu bài từ thư viện">
                    {(v: string | null) => templates.find((t) => t.id === v)?.title ?? ""}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                      {t.isTest ? " · Kiểm tra" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
    </>
  );
}
