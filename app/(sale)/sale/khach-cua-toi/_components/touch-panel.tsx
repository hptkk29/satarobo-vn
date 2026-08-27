"use client";

// Nhật ký chạm + việc follow-up của một khách.
//
// Dùng LẠI nguyên `addLeadActivity` / `addLeadTask` / `completeLeadTask` của khu
// quản trị — chúng đã gác `leads:edit` + `passesScope('Lead')` ngay đầu hàm và
// reset `Lead.lastActivityAt` trong cùng transaction. Viết action thứ hai cho
// site Sale là mở đường cho hai luật khác nhau trên cùng một bảng.
//
// ⚠️ Các action đó gọi `revalidatePath('/leads/…')` — clean URL của host ADMIN,
// không phải đường của trang này. Nên sau khi gọi phải `router.refresh()`: nó
// dựng lại đúng route đang mở, không phụ thuộc đường nào được khai trong action.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  addLeadActivity,
  addLeadTask,
  completeLeadTask,
} from "@/app/(admin)/admin/leads/actions";
import { formatDateVN } from "@/lib/format/date";
import { Badge } from "@/components/ui/badge";

type Activity = {
  id: string;
  type: string;
  content: string;
  actorName: string | null;
  createdAt: string;
};
type Task = {
  id: string;
  title: string;
  description: string | null;
  dueAt: string;
  status: string;
};

const LOAI: { value: string; label: string }[] = [
  { value: "CALL", label: "Gọi điện" },
  { value: "MESSAGE", label: "Nhắn tin" },
  { value: "EMAIL", label: "Email" },
  { value: "NOTE", label: "Ghi chú" },
];
const NHAN_LOAI: Record<string, string> = Object.fromEntries(
  LOAI.map((l) => [l.value, l.label]),
);

export function LeadTouchPanel({
  leadId,
  activities,
  tasks,
}: {
  leadId: string;
  activities: Activity[];
  tasks: Task[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [type, setType] = useState("CALL");
  const [content, setContent] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");

  function ghiHoatDong() {
    if (!content.trim()) return;
    start(async () => {
      const r = await addLeadActivity({ leadId, type, content });
      if (r.ok) {
        setContent("");
        // S-9 — phiếu do mình NHẬP nhưng người khác phụ trách vẫn nằm trong
        // "khách của tôi", nên màn này gặp ca đó thường xuyên. Nói thẳng ra để
        // người ghi không tưởng mình vừa tắt được chuông nhắc.
        if (r.dongHoKhongDoi) {
          toast.success("Đã ghi nhận", {
            description:
              "Bạn không phụ trách khách này nên đồng hồ nhắc chăm sóc giữ nguyên — người phụ trách vẫn được nhắc.",
          });
        } else {
          toast.success("Đã ghi nhận");
        }
        router.refresh();
      } else {
        toast.error(r.error ?? "Không ghi được");
      }
    });
  }

  function themViec() {
    if (!taskTitle.trim() || !taskDue) return;
    start(async () => {
      // `<input type="datetime-local">` cho chuỗi giờ ĐỊA PHƯƠNG không kèm múi;
      // `new Date(...)` phía server đọc đúng vì cả hai cùng giờ Việt Nam, nhưng
      // gửi ISO có múi thì không phải đoán.
      const r = await addLeadTask({
        leadId,
        title: taskTitle,
        dueAt: new Date(taskDue).toISOString(),
      });
      if (r.ok) {
        setTaskTitle("");
        setTaskDue("");
        toast.success("Đã thêm việc");
        router.refresh();
      } else {
        toast.error(r.error ?? "Không thêm được");
      }
    });
  }

  function xongViec(id: string) {
    start(async () => {
      const r = await completeLeadTask(id);
      if (r.ok) {
        toast.success("Đã đánh dấu xong");
        router.refresh();
      } else {
        toast.error(r.error ?? "Không cập nhật được");
      }
    });
  }

  const viecMo = tasks.filter((t) => t.status === "OPEN");
  const viecXong = tasks.filter((t) => t.status !== "OPEN");

  return (
    <>
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Ghi lại một lần chạm</h2>
        <div className="flex flex-wrap gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
          >
            {LOAI.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Nội dung trao đổi…"
            className="h-9 min-w-[14rem] flex-1 rounded-lg border border-border bg-background px-3 text-sm"
          />
          <button
            type="button"
            onClick={ghiHoatDong}
            disabled={pending || !content.trim()}
            className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Ghi nhận
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Việc cần làm</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="Vd: gọi lại xác nhận lịch học thử"
            className="h-9 min-w-[14rem] flex-1 rounded-lg border border-border bg-background px-3 text-sm"
          />
          <input
            type="datetime-local"
            value={taskDue}
            onChange={(e) => setTaskDue(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
          />
          <button
            type="button"
            onClick={themViec}
            disabled={pending || !taskTitle.trim() || !taskDue}
            className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted disabled:opacity-50"
          >
            Thêm việc
          </button>
        </div>

        {viecMo.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {viecMo.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm"
              >
                <div>
                  <div className="font-medium text-foreground">{t.title}</div>
                  <div className="text-xs text-muted-foreground">
                    hạn {formatDateVN(new Date(t.dueAt))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => xongViec(t.id)}
                  disabled={pending}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
                >
                  Xong
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Không có việc nào đang mở.</p>
        )}

        {viecXong.length > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {viecXong.length} việc đã xong.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Nhật ký ({activities.length})</h2>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có lần chạm nào được ghi lại.
          </p>
        ) : (
          <ul className="space-y-3">
            {activities.map((a) => (
              <li key={a.id} className="border-b border-border/50 pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Badge variant="outline">{NHAN_LOAI[a.type] ?? a.type}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDateVN(new Date(a.createdAt))}
                    {a.actorName ? ` · ${a.actorName}` : ""}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{a.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
