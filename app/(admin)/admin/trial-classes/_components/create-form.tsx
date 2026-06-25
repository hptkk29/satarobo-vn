"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createTrialClassAction } from "../_actions";

type Center = { id: string; name: string };
type Room = { id: string; label: string; centerId: string | null };
type Teacher = { id: string; name: string };

export function CreateTrialClassForm({
  centers,
  rooms,
  teachers,
  defaultSessionCount = 2,
}: {
  centers: Center[];
  rooms: Room[];
  teachers: Teacher[];
  defaultSessionCount?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [centerId, setCenterId] = useState(centers[0]?.id ?? "");
  const [sessionCount, setSessionCount] = useState(String(defaultSessionCount));
  const [roomId, setRoomId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("19:30");
  const [capacity, setCapacity] = useState("8");

  // Phòng học lọc theo cơ sở đang chọn (cách ly cơ sở ở UI).
  const roomOptions = useMemo(
    () => rooms.filter((r) => !centerId || r.centerId === centerId),
    [rooms, centerId],
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createTrialClassAction({
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
        router.push(res.id ? `/trial-classes/${res.id}` : "/trial-classes");
        router.refresh();
      } else {
        toast.error(res.error ?? "Tạo lớp thất bại");
      }
    });
  }

  const field = "rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50";
  const labelCls = "flex flex-col gap-1";
  const labelText = "text-xs font-medium text-gray-500";

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-2"
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
            setRoomId("");
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
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label className={labelCls}>
        <span className={labelText}>Giáo viên</span>
        <select
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          disabled={pending}
          className={field}
        >
          <option value="">— chưa phân công —</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
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

      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending || centers.length === 0}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {pending ? "Đang tạo…" : "Tạo lớp"}
        </button>
      </div>
    </form>
  );
}
