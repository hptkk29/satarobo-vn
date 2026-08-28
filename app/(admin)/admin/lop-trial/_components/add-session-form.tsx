"use client";

// app/(admin)/admin/lop-trial/_components/add-session-form.tsx — GĐ2.
//
// Thêm buổi cho lớp trải nghiệm. Lớp trải nghiệm là "slot" tái sử dụng nên KHÔNG tự
// sinh buổi lúc tạo lớp: chưa thêm buổi ở đây thì không xếp được học viên và giáo
// viên cũng không thấy gì trong lịch.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";

import { addLopTrialSessionAction } from "../_actions";
import { trungKhungGio } from "@/lib/trial/lop-moi";
import type { BuoiBan } from "../_lib/queries";
import type { Option, RoomOption } from "../_lib/types";

export function AddSessionForm({
  trialClassId,
  teachers,
  rooms,
  busyByTeacher,
  defaultStartTime,
  defaultEndTime,
}: {
  trialClassId: string;
  teachers: Option[];
  rooms: RoomOption[];
  /**
   * teacherId → các buổi người đó đã nhận. Dùng để ĐÁNH DẤU, KHÔNG lọc (chốt 28/08:
   * "hiện tất cả nhưng đánh dấu"). Lọc cứng là những hôm phải xếp gấp thì không còn
   * ai để chọn.
   */
  busyByTeacher: Record<string, BuoiBan[]>;
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
  const [roomId, setRoomId] = useState("");

  /**
   * Buổi đang vướng của từng giáo viên, tính lại mỗi khi đổi ngày/giờ.
   *
   * Chỉ tính khi đã có ĐỦ ngày + hai mốc giờ: thiếu một trong ba thì mọi so sánh đều
   * vô nghĩa, và hiện cảnh báo dựa trên giờ mặc định là nói sai về một buổi người dùng
   * chưa đặt xong.
   */
  const trungTheoGv = useMemo(() => {
    const out: Record<string, BuoiBan> = {};
    if (!date || !startTime || !endTime) return out;
    for (const [gv, buoi] of Object.entries(busyByTeacher)) {
      const cham = buoi.find(
        (b) => b.date === date && trungKhungGio(b, { startTime, endTime }),
      );
      if (cham) out[gv] = cham;
    }
    return out;
  }, [busyByTeacher, date, startTime, endTime]);

  const gvDangChonBiTrung = teacherId ? trungTheoGv[teacherId] : undefined;

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
        roomId: roomId || undefined,
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
          Phòng
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            disabled={pending}
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground disabled:opacity-50"
          >
            <option value="">— chưa xếp phòng —</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.centerId === null ? " (dùng chung)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Giáo viên
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            disabled={pending}
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground disabled:opacity-50"
          >
            <option value="">— chưa xếp giáo viên —</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {trungTheoGv[t.id] ? " · ĐANG BẬN" : ""}
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

      {/* Cảnh báo, KHÔNG chặn: người xếp lịch có thể biết điều mà hệ thống không biết
          (đổi buổi bên kia, dạy ghép…). Chặn cứng ở đây là bắt họ đi đường vòng. */}
      {gvDangChonBiTrung && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Giáo viên này đã có buổi <strong>{gvDangChonBiTrung.label}</strong>{" "}
          {gvDangChonBiTrung.startTime}–{gvDangChonBiTrung.endTime} cùng ngày. Vẫn thêm
          được nếu bạn đã sắp xếp khác.
        </p>
      )}

      {/* Giới hạn đã biết, nói ra để không ai tin nhầm là đã phủ hết lịch. */}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Dấu &quot;đang bận&quot; chỉ đối chiếu buổi của <strong>lớp trải nghiệm</strong>;
        chưa tính buổi lớp chính.
      </p>
    </div>
  );
}
