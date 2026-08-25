"use client";

// app/(admin)/admin/lop-trial/_components/create-form.tsx — GĐ2.
//
// Form tạo lớp trải nghiệm cho màn gộp "Lớp Trial". Bố cục và giá trị mặc định
// giữ nguyên như màn cũ; chỉ đổi server action sang mặt phẳng V2 của màn này.

import type { JSX } from "react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createLopTrialClassAction } from "../_actions";
import type { Option } from "../_lib/types";

type RoomOption = Option & { centerId: string | null };

export function CreateForm({
  centers,
  rooms,
  teachers,
}: {
  centers: Option[];
  rooms: RoomOption[];
  teachers: Option[];
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [centerId, setCenterId] = useState(centers[0]?.id ?? "");
  // Giữ dạng chuỗi cho mọi ô number: `<input>` trả chuỗi, và schema đã `z.coerce`
  // nên đổi sang number ở client chỉ tạo thêm chỗ để lệch (ô rỗng → NaN).
  const [sessionCount, setSessionCount] = useState("8");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("19:30");
  const [capacity, setCapacity] = useState("8");
  const [teacherId, setTeacherId] = useState("");
  const [roomId, setRoomId] = useState("");

  // Phòng lọc theo cơ sở đang chọn (cách ly cơ sở ngay ở UI). Phòng chưa gắn cơ sở
  // (`centerId === null`) là phòng dùng chung nên luôn hiện.
  const roomOptions = useMemo(
    () => rooms.filter((r) => r.centerId === null || !centerId || r.centerId === centerId),
    [rooms, centerId],
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createLopTrialClassAction({
        name,
        centerId,
        roomId: roomId || null,
        teacherId: teacherId || null,
        sessionCount,
        startTime,
        endTime,
        capacity,
      });
      if (res.ok) {
        toast.success("Đã tạo lớp trải nghiệm");
        router.push(res.id ? `/lop-trial/${res.id}` : "/lop-trial");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const field = "rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50";
  const labelCls = "flex flex-col gap-1";
  const labelText = "text-xs font-medium text-muted-foreground";

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2"
    >
      <label className={`${labelCls} sm:col-span-2`}>
        <span className={labelText}>Tên lớp *</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
          className={field}
          placeholder="VD: Lớp trải nghiệm RoboSim — Sáng T7"
          required
        />
      </label>

      <label className={labelCls}>
        <span className={labelText}>Cơ sở *</span>
        <select
          value={centerId}
          onChange={(e) => {
            setCenterId(e.target.value);
            setRoomId(""); // Đổi cơ sở → phòng đã chọn có thể không còn thuộc cơ sở mới.
          }}
          disabled={pending}
          className={field}
          required
        >
          {centers.length === 0 && <option value="">(không có cơ sở)</option>}
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {/* KHÔNG có ô ngày khai giảng: lớp trải nghiệm là slot tái sử dụng,
          ngày cụ thể nằm ở từng buổi (xem tab Buổi học). */}
      <label className={labelCls}>
        <span className={labelText}>Số buổi trải nghiệm *</span>
        <input
          type="number"
          min={1}
          max={20}
          value={sessionCount}
          onChange={(e) => setSessionCount(e.target.value)}
          disabled={pending}
          className={field}
          required
        />
      </label>

      <label className={labelCls}>
        <span className={labelText}>Giờ bắt đầu *</span>
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          disabled={pending}
          className={field}
          required
        />
      </label>

      <label className={labelCls}>
        <span className={labelText}>Giờ kết thúc *</span>
        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          disabled={pending}
          className={field}
          required
        />
      </label>

      <label className={labelCls}>
        <span className={labelText}>Sĩ số tối đa *</span>
        <input
          type="number"
          min={1}
          max={100}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          disabled={pending}
          className={field}
          required
        />
      </label>

      <label className={labelCls}>
        <span className={labelText}>Giáo viên</span>
        <select
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          disabled={pending}
          className={field}
        >
          <option value="">— chưa gán —</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <label className={labelCls}>
        <span className={labelText}>Phòng học</span>
        <select
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          disabled={pending}
          className={field}
        >
          <option value="">— chưa chọn —</option>
          {roomOptions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending || centers.length === 0}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {pending ? "Đang tạo…" : "Tạo lớp"}
        </button>
      </div>
    </form>
  );
}
