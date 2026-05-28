"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, MessageSquare, StickyNote, Mail, RefreshCw, Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { addLeadActivity, addLeadTask, completeLeadTask } from "../../actions";

type Activity = {
  id: string;
  type: string;
  content: string;
  actorName: string;
  createdAt: string; // ISO
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  dueAt: string; // ISO
  status: string;
  assignedToName: string | null;
  completedAt: string | null;
};

const ACTIVITY_ICON: Record<string, typeof Phone> = {
  CALL: Phone,
  MESSAGE: MessageSquare,
  NOTE: StickyNote,
  EMAIL: Mail,
  STATUS_CHANGE: RefreshCw,
};

const ACTIVITY_LABEL: Record<string, string> = {
  CALL: "Gọi điện",
  MESSAGE: "Nhắn tin",
  NOTE: "Ghi chú",
  EMAIL: "Email",
  STATUS_CHANGE: "Đổi trạng thái",
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isOverdue(t: Task): boolean {
  return t.status === "OPEN" && new Date(t.dueAt).getTime() < Date.now();
}

export function LeadActivityPanel({
  leadId,
  activities,
  tasks,
}: {
  leadId: string;
  activities: Activity[];
  tasks: Task[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Quick activity form
  const [actType, setActType] = useState("CALL");
  const [actContent, setActContent] = useState("");

  // Task form
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");

  function submitActivity() {
    if (!actContent.trim()) {
      toast.error("Nhập nội dung hoạt động");
      return;
    }
    startTransition(async () => {
      const res = await addLeadActivity({
        leadId,
        type: actType,
        content: actContent,
      });
      if (res.ok) {
        setActContent("");
        toast.success("Đã ghi hoạt động");
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi");
      }
    });
  }

  function submitTask() {
    if (!taskTitle.trim() || !taskDue) {
      toast.error("Nhập tiêu đề + hạn");
      return;
    }
    startTransition(async () => {
      const res = await addLeadTask({ leadId, title: taskTitle, dueAt: taskDue });
      if (res.ok) {
        setTaskTitle("");
        setTaskDue("");
        toast.success("Đã thêm việc");
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi");
      }
    });
  }

  function toggleTask(id: string, done: boolean) {
    startTransition(async () => {
      const res = await completeLeadTask(id, done);
      if (res.ok) router.refresh();
      else toast.error(res.error ?? "Lỗi");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Timeline (2 cột) */}
      <div className="lg:col-span-2 space-y-4">
        {/* Quick activity */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-gray-900">Ghi nhanh hoạt động</h3>
          <div className="flex flex-wrap gap-2">
            {(["CALL", "MESSAGE", "NOTE", "EMAIL"] as const).map((t) => {
              const Icon = ACTIVITY_ICON[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActType(t)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
                    actType === t
                      ? "border-orange-400 bg-orange-50 text-orange-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Icon size={14} /> {ACTIVITY_LABEL[t]}
                </button>
              );
            })}
          </div>
          <textarea
            value={actContent}
            onChange={(e) => setActContent(e.target.value)}
            rows={2}
            placeholder="Nội dung cuộc gọi / tin nhắn / ghi chú..."
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
          />
          <button
            type="button"
            onClick={submitActivity}
            disabled={isPending}
            className="mt-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            Ghi hoạt động
          </button>
        </div>

        {/* Timeline */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-gray-900">
            Lịch sử hoạt động ({activities.length})
          </h3>
          {activities.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              Chưa có hoạt động nào.
            </p>
          ) : (
            <ol className="space-y-3">
              {activities.map((a) => {
                const Icon = ACTIVITY_ICON[a.type] ?? StickyNote;
                return (
                  <li key={a.id} className="flex gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                      <Icon size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-xs font-bold text-gray-700">
                          {ACTIVITY_LABEL[a.type] ?? a.type}
                        </span>
                        <span className="text-xs text-gray-400">
                          {a.actorName} · {fmtDateTime(a.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-line text-sm text-gray-800">
                        {a.content}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      {/* Tasks panel (1 cột) */}
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-gray-900">Việc cần làm</h3>
          <div className="space-y-2">
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="VD: Gọi lại tư vấn"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
            <input
              type="datetime-local"
              value={taskDue}
              onChange={(e) => setTaskDue(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
            <button
              type="button"
              onClick={submitTask}
              disabled={isPending}
              className="inline-flex w-full items-center justify-center gap-1 rounded-lg border-2 border-orange-300 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-60"
            >
              <Plus size={14} /> Thêm việc
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {tasks.length === 0 && (
              <p className="py-3 text-center text-xs text-gray-400">
                Chưa có việc nào.
              </p>
            )}
            {tasks.map((t) => {
              const overdue = isOverdue(t);
              const doneState = t.status === "DONE";
              return (
                <div
                  key={t.id}
                  className={`rounded-lg border p-3 ${
                    overdue
                      ? "border-red-300 bg-red-50"
                      : doneState
                        ? "border-gray-200 bg-gray-50"
                        : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => toggleTask(t.id, !doneState)}
                      disabled={isPending}
                      className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${
                        doneState
                          ? "border-green-500 bg-green-500 text-white"
                          : "border-gray-300 bg-white"
                      }`}
                      aria-label={doneState ? "Bỏ hoàn thành" : "Hoàn thành"}
                    >
                      {doneState && <Check size={12} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm font-medium ${
                          doneState ? "text-gray-400 line-through" : "text-gray-900"
                        }`}
                      >
                        {t.title}
                      </div>
                      <div className="text-xs text-gray-500">
                        Hạn: {fmtDateTime(t.dueAt)}
                        {overdue && (
                          <span className="ml-1 font-bold text-red-600">
                            · Quá hạn
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
