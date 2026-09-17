"use client";

// app/(admin)/admin/lop-trial/_components/add-session-form.tsx — GĐ2.
//
// Thêm buổi cho lớp trải nghiệm. Lớp trải nghiệm là "slot" tái sử dụng nên KHÔNG tự
// sinh buổi lúc tạo lớp: chưa thêm buổi ở đây thì không xếp được học viên và giáo
// viên cũng không thấy gì trong lịch.
//
// 17/09/2026 — ô "Giáo viên" nay LỌC theo ca làm (chốt V1). Cả phép lọc lẫn note đỏ nằm
// ở `./chon-gv-buoi`, dùng CHUNG với khối "Sửa buổi" bên `attendance-board.tsx`. Prop
// `busyByTeacher` (bơm sẵn lịch bận xuống client để tự đối chiếu) đã GỠ: ngày/giờ do
// người dùng chọn tự do nên bơm sẵn là bơm cả lưới ca của mọi người mọi ngày.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";

import { addLopTrialSessionAction } from "../_actions";
import {
  CanhBaoGiaoVien,
  GiaiThichLuatGv,
  OChonGiaoVien,
  useGvChoBuoi,
} from "./chon-gv-buoi";
import type { CheDoChonGv } from "../_lib/che-do-gv";
import type { Option, RoomOption } from "../_lib/types";

export function AddSessionForm({
  trialClassId,
  teachers,
  rooms,
  defaultStartTime,
  defaultEndTime,
  cheDoChonGv,
  locGvTheoCa,
  soGvMienLoc,
}: {
  trialClassId: string;
  teachers: Option[];
  rooms: RoomOption[];
  defaultStartTime: string;
  defaultEndTime: string;
  /** Tầng quyền của người đang xem — chỉ để NÓI RA luật đang chạy, không để gác. */
  cheDoChonGv: CheDoChonGv;
  /** `trial.locGvTheoCaLamViec` — cùng mục đích: giải thích, không gác. */
  locGvTheoCa: boolean;
  /** Số giáo viên khai ở `trial.gvMienLocTheoCa`. */
  soGvMienLoc: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);
  /** "" = không chọn → buổi kế thừa GV phụ trách lớp (xem `onSubmit`). */
  const [teacherId, setTeacherId] = useState("");
  const [roomId, setRoomId] = useState("");

  // Buổi MỚI nên không có gì để loại khỏi phép so trùng.
  const nguonGv = useGvChoBuoi({ trialClassId, excludeSessionId: null });

  /**
   * Hỏi lại danh sách mỗi khi một trong ba ô đổi.
   *
   * Gọi ngay trong `onChange` chứ KHÔNG qua `useEffect`: repo cấm `useEffect` cho việc
   * lấy dữ liệu, và ở đây cũng không cần — đây là phản ứng với một thao tác của người
   * dùng, không phải đồng bộ theo vòng đời component. Phải truyền giá trị MỚI vào, vì
   * `setState` chưa kịp phản ánh trong cùng lượt xử lý sự kiện.
   */
  function doiKhung(d: string, s: string, e: string) {
    setDate(d);
    setStartTime(s);
    setEndTime(e);
    nguonGv.tai(d, s, e);
  }

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
        // Chỉ reset ngày: giờ và GV thường lặp lại cho buổi kế tiếp. Danh sách giáo viên
        // phải theo về trạng thái "chưa biết" cho khớp — giữ lại danh sách của ngày vừa
        // lưu là để một note đỏ của hôm qua nằm cạnh một ô ngày trống.
        setDate("");
        nguonGv.tai("", startTime, endTime);
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
            onChange={(e) => doiKhung(e.target.value, startTime, endTime)}
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
            onChange={(e) => doiKhung(date, e.target.value, endTime)}
            disabled={pending}
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground disabled:opacity-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Giờ kết thúc
          <input
            type="time"
            value={endTime}
            onChange={(e) => doiKhung(date, startTime, e.target.value)}
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

        <OChonGiaoVien
          teachers={teachers}
          nguon={nguonGv}
          value={teacherId}
          onChange={setTeacherId}
          disabled={pending}
          // Chỉ để biết CÓ bộ lọc nào đang chạy hay không (vẽ công tắc "Hiện tất cả" hay
          // không) — không gác gì. Quyền hỏi ở server, mỗi lượt.
          cheDo={cheDoChonGv}
          batLoc={locGvTheoCa}
        />

        <button
          type="button"
          onClick={onSubmit}
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {pending ? "Đang thêm…" : "Thêm buổi"}
        </button>
      </div>

      <CanhBaoGiaoVien nguon={nguonGv} value={teacherId} />

      <GiaiThichLuatGv
        batLoc={locGvTheoCa}
        cheDo={cheDoChonGv}
        soGvMien={soGvMienLoc}
        hienTatCa={nguonGv.hienTatCa}
        // `ds !== null` = ĐÃ có một lượt lọc cho khung giờ đang chọn. Chưa có thì câu
        // luật không được hứa danh sách đang lọc — xem prop `daLoc`.
        daLoc={nguonGv.ds !== null}
      />
    </div>
  );
}
