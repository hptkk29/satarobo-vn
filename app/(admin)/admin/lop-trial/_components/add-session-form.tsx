"use client";

// app/(admin)/admin/lop-trial/_components/add-session-form.tsx — GĐ2.
//
// Thêm buổi cho lớp trải nghiệm. Lớp trải nghiệm là "slot" tái sử dụng nên KHÔNG tự
// sinh buổi lúc tạo lớp: chưa thêm buổi ở đây thì không xếp được học viên và giáo
// viên cũng không thấy gì trong lịch.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";

import { addLopTrialSessionAction } from "../_actions";
import type { Option } from "../_lib/types";

export function AddSessionForm({
  trialClassId,
  teachers,
  defaultStartTime,
  defaultEndTime,
}: {
  trialClassId: string;
  teachers: Option[];
  defaultStartTime: string;
  defaultEndTime: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);
  /** "" = không chọn → buổi kế thừa GV phụ trách lớp (xem `onSubmit`). */
  const [teacherId, setTeacherId] = useState("");

  function onSubmit() {
    if (!date) {
      toast.error("Chọn ngày buổi học");
      return;
    }
    startTransition(async () => {
      const res = await addLopTrialSessionAction({
        trialClassId,
        date,
        startTime,
        endTime,
        // ⚠️ Phải là `undefined`, KHÔNG phải `null`. Service đọc hai giá trị này khác
        // nhau: undefined = kế thừa GV của lớp, null = cố ý để buổi không có GV.
        // Gửi nhầm null là buổi ra đời trắng giáo viên mà không ai báo lỗi.
        teacherId: teacherId || undefined,
      });
      if (res.ok) {
        toast.success("Đã thêm buổi");
        // Chỉ reset ngày: giờ và GV thường lặp lại cho buổi kế tiếp.
        setDate("");
        router.refresh();
        return;
      }
      toast.error(res.error);
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarPlus className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Thêm buổi học</h2>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Ngày *
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={pending}
            required
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground disabled:opacity-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Giờ bắt đầu
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={pending}
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground disabled:opacity-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Giờ kết thúc
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            disabled={pending}
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground disabled:opacity-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Giáo viên
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            disabled={pending}
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground disabled:opacity-50"
          >
            <option value="">— theo giáo viên của lớp —</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={onSubmit}
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {pending ? "Đang thêm…" : "Thêm buổi"}
        </button>
      </div>
    </div>
  );
}
