"use client";

// Danh sách "Kho bài tập của tôi" — bảng đề GV tự soạn + Xem trước + Xoá (2-click
// confirm). Chỉ đề của mình (server đã lọc createdById), action vẫn tự khoá own-scope.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PreviewDialog } from "./preview-dialog";
import { deleteOwnTemplateAction } from "../_actions";
import type { KhoTemplate } from "../_types";

export function KhoList({ rows }: { rows: KhoTemplate[] }) {
  const router = useRouter();
  const [preview, setPreview] = useState<KhoTemplate | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function del(id: string) {
    start(async () => {
      const res = await deleteOwnTemplateAction(id);
      if (res.ok) {
        toast.success("Đã xoá đề");
        setConfirmId(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <div className="t-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[770px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <th scope="col" className="px-5 py-3">
                  Nội dung
                </th>
                <th scope="col" className="px-5 py-3">
                  Hình thức
                </th>
                <th scope="col" className="px-5 py-3">
                  Số câu
                </th>
                <th scope="col" className="px-5 py-3">
                  Thang điểm
                </th>
                <th scope="col" className="px-5 py-3">
                  Ngày tạo
                </th>
                <th scope="col" className="px-5 py-3 text-right">
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                >
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-foreground">{t.title}</p>
                    {t.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {t.description}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <KindBadge kind={t.kind} />
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-foreground">
                    {t.questionCount}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-foreground">
                    {t.totalPoints}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-muted-foreground">
                    {t.createdAt}
                  </td>
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary-ink hover:text-primary-ink-hover"
                        onClick={() => setPreview(t)}
                      >
                        <Eye /> Xem trước
                      </Button>
                      {confirmId === t.id ? (
                        <>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={pending}
                            onClick={() => del(t.id)}
                          >
                            {pending ? "Đang xoá…" : "Xác nhận xoá"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => setConfirmId(null)}
                          >
                            Huỷ
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmId(t.id)}
                        >
                          <Trash2 /> Xoá
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PreviewDialog
        open={preview !== null}
        onOpenChange={(v) => !v && setPreview(null)}
        template={preview}
      />
    </>
  );
}

/** Nhãn hình thức. HOMEWORK = "Bài tập" (nhạt) · CLASSWORK = "Kiểm tra" (đậm). */
function KindBadge({ kind }: { kind: KhoTemplate["kind"] }) {
  const isTest = kind === "CLASSWORK";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        isTest
          ? "bg-primary-soft text-primary-ink dark:bg-primary-soft dark:text-primary-ink"
          : "border border-primary-soft bg-primary-soft text-primary-ink dark:border-primary",
      )}
    >
      {isTest ? "Kiểm tra" : "Bài tập"}
    </span>
  );
}
