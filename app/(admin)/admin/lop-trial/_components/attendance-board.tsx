"use client";

// app/(admin)/admin/lop-trial/_components/attendance-board.tsx — GĐ2.
//
// Lưới điểm danh của một lớp trải nghiệm: chọn buổi bằng dãy chip, đánh dấu từng em,
// lưu một lần cho cả buổi.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Pencil } from "lucide-react";
import {
  markLopTrialAttendanceAction,
  completeLopTrialSessionAction,
  updateLopTrialSessionAction,
  cancelLopTrialSessionAction,
} from "../_actions";
import type {
  EnrollmentRow,
  Option,
  RoomOption,
  SessionRow,
  TrialAttendanceMark,
} from "../_lib/types";

/**
 * Một dòng nháp. `status: null` = CHƯA điểm danh — KHÁC hẳn "vắng".
 * Xem comment ở `duNgChoBuoi` để biết vì sao null phải là giá trị hạng nhất.
 */
type DraftRow = { status: TrialAttendanceMark | null; note: string };

// Hàm đếm nằm ở ../_lib/attendance để test được mà không phải nạp cả cây next-auth
// (component này kéo theo ../_actions → @/lib/auth, vitest không nạp nổi).
import { demSoEmChuaDanhDau } from "../_lib/attendance";
import {
  duongDanPdfPhieu,
  nhanNutPhieu,
  LOI_CHUA_DANH_GIA,
} from "../_lib/phieu-danh-gia";

/** Ngày buổi học lưu ở cột `@db.Date` = UTC-midnight của ngày VN. */
function ngayVn(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Nút lấy phiếu đánh giá của MỘT em ở MỘT buổi — đặt ngay trước ô ghi chú.
 *
 * Thay cho khối "Phiếu đánh giá buổi học" (hệ SESSION_EVAL) đã gỡ khỏi màn này: khối
 * đó đọc một kho KHÁC với kho giáo viên thật sự chấm (`TrialRubricEval` từ site giáo
 * viên), nên Sale mở ra luôn thấy trống dù đã có phiếu.
 *
 * Đã chấm thì là thẻ <a> mở file thật, KHÔNG phải nút bấm rồi mới điều hướng: người
 * dùng bấm giữa chừng vẫn mở được tab mới, và không tốn một vòng gọi server chỉ để
 * biết một điều màn hình đã biết sẵn.
 */
function NutPhieu({
  enrollmentId,
  sessionId,
  daDanhGia,
}: {
  enrollmentId: string;
  sessionId: string;
  daDanhGia: boolean;
}) {
  const nhan = nhanNutPhieu(daDanhGia);
  const lop =
    "rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-border whitespace-nowrap";
  if (!daDanhGia) {
    return (
      <button
        type="button"
        onClick={() => toast.error(LOI_CHUA_DANH_GIA)}
        className={`${lop} bg-card text-muted-foreground hover:bg-muted`}
      >
        {nhan}
      </button>
    );
  }
  return (
    <a
      href={duongDanPdfPhieu(enrollmentId, sessionId)}
      target="_blank"
      rel="noopener noreferrer"
      className={`${lop} bg-card text-primary hover:bg-primary-soft`}
    >
      {nhan}
    </a>
  );
}

/**
 * Sửa hoặc huỷ MỘT buổi. Cả hai đường đều BẮT BUỘC ghi lý do, và chính lý do đó là nội
 * dung thông báo đẩy sang giáo viên (chốt 28/08). Không có ô lý do thì giáo viên nhận
 * một tin "buổi đã đổi" trống rỗng rồi phải đi hỏi lại từng người.
 */
function SuaBuoiForm({
  session,
  teachers,
  rooms,
  onXong,
}: {
  session: SessionRow;
  teachers: Option[];
  rooms: RoomOption[];
  onXong: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // `date` của buổi là UTC-midnight của NGÀY VN → cắt 10 ký tự đầu ra đúng giá trị mà
  // `<input type="date">` cần. Đừng đổi múi giờ ở đây, sẽ lùi một ngày.
  const [date, setDate] = useState(session.date.slice(0, 10));
  const [startTime, setStartTime] = useState(session.startTime);
  const [endTime, setEndTime] = useState(session.endTime);
  const [roomId, setRoomId] = useState(session.roomId ?? "");
  const [teacherId, setTeacherId] = useState(session.teacherId ?? "");
  const [lyDo, setLyDo] = useState("");
  const [choHuy, setChoHuy] = useState(false);

  function luu() {
    startTransition(async () => {
      const res = await updateLopTrialSessionAction({
        sessionId: session.id,
        date,
        startTime,
        endTime,
        roomId: roomId || null,
        teacherId: teacherId || null,
        reason: lyDo.trim(),
      });
      if (res.ok) {
        toast.success("Đã lưu buổi học và báo giáo viên");
        onXong();
        router.refresh();
        return;
      }
      toast.error(res.error);
    });
  }

  function huy() {
    startTransition(async () => {
      const res = await cancelLopTrialSessionAction({
        sessionId: session.id,
        reason: lyDo.trim(),
      });
      if (res.ok) {
        toast.success("Đã huỷ buổi và báo giáo viên");
        onXong();
        router.refresh();
        return;
      }
      toast.error(res.error);
    });
  }

  return (
    <div className="mb-3 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Ngày
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={pending}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Giờ bắt đầu
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={pending}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Giờ kết thúc
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            disabled={pending}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Phòng
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            disabled={pending}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground disabled:opacity-50"
          >
            <option value="">— chưa xếp phòng —</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
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
            className="rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground disabled:opacity-50"
          >
            <option value="">— chưa xếp giáo viên —</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
        Lý do dời / huỷ *
        <input
          type="text"
          value={lyDo}
          onChange={(e) => setLyDo(e.target.value)}
          disabled={pending}
          placeholder="Vd: phụ huynh báo bận, xin dời sang thứ 5…"
          className="rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground disabled:opacity-50"
        />
        <span>Nội dung này được gửi thẳng cho giáo viên.</span>
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={luu}
          disabled={pending}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {pending ? "Đang lưu…" : "Lưu & báo giáo viên"}
        </button>
        {/* Huỷ đi hai nhịp: một cú bấm nhầm là buổi biến khỏi lịch giáo viên. */}
        <button
          type="button"
          onClick={() => (choHuy ? huy() : setChoHuy(true))}
          disabled={pending}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
            choHuy
              ? "border-state-danger bg-state-danger-soft text-state-danger-ink"
              : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          {choHuy ? "Bấm lần nữa để huỷ buổi" : "Huỷ buổi"}
        </button>
        <button
          type="button"
          onClick={onXong}
          disabled={pending}
          className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
        >
          Đóng
        </button>
      </div>
    </div>
  );
}

export function AttendanceBoard({
  sessions,
  enrollments,
  canMark,
  canManage,
  teachers,
  rooms,
}: {
  sessions: SessionRow[];
  enrollments: EnrollmentRow[];
  canMark: boolean;
  /** Sửa / huỷ buổi là việc quản lý, KHÁC quyền điểm danh (GĐ4 tách hai cổng). */
  canManage: boolean;
  teachers: Option[];
  rooms: RoomOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Buổi mở sẵn = buổi SCHEDULED đầu tiên: người dùng vào đây gần như luôn để điểm danh
  // buổi sắp/đang diễn ra, không phải để xem lại buổi đã đóng.
  const [selectedSessionId, setSelectedSessionId] = useState(
    () => (sessions.find((s) => s.status === "SCHEDULED") ?? sessions[0])?.id ?? "",
  );
  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null;

  // Học viên tham gia điểm danh của BUỔI ĐANG CHỌN.
  //
  // Hai điều kiện, đừng bỏ điều kiện thứ hai:
  //   1. Ca còn sống (loại ca đã rút, đã huỷ).
  //   2. Ca ĐANG được xếp vào ĐÚNG buổi này.
  //
  // ⚠️ Không lọc theo buổi thì sau khi dời lịch, bé vẫn đứng ở buổi cũ — mà nút Lưu
  // bị chặn tới khi đủ sĩ số, nên Sale buộc phải đánh có mặt (thổi số buổi đã dự, tự
  // đẩy trạng thái lead) hoặc đánh vắng khống. Ca chưa xếp buổi nào (dữ liệu cũ) vẫn
  // hiện ở mọi buổi để không ai bị bỏ quên.
  const markable = useMemo(
    () =>
      enrollments.filter(
        (e) =>
          (e.status === "ACTIVE" || e.status === "COMPLETED") &&
          (e.scheduledSessionId === null || e.scheduledSessionId === selectedSessionId),
      ),
    [enrollments, selectedSessionId],
  );

  // Nháp lưu theo khoá "sessionId:enrollmentId" để đổi chip qua lại không mất thao tác
  // đang dở ở buổi kia.
  const [draft, setDraft] = useState<Record<string, DraftRow>>({});
  const sessionKey = selectedSessionId;
  const [moSuaBuoi, setMoSuaBuoi] = useState(false);

  const tenGv = useMemo(
    () => new Map(teachers.map((t) => [t.id, t.name])),
    [teachers],
  );
  /** Tên GV của một buổi. GV đã rời danh sách vẫn phải hiện là "có người", không im
   *  lặng thành "chưa có giáo viên" — xem cùng lý do ở `includeIds` của trang. */
  function tenGvBuoi(id: string | null): string | null {
    if (!id) return null;
    return tenGv.get(id) ?? "(không rõ)";
  }

  /** Bản đồ hiển thị của buổi đang chọn: nháp đè lên giá trị đã lưu ở DB. */
  const duNgChoBuoi = useMemo(() => {
    const base: Record<string, DraftRow> = {};
    if (!selectedSession) return base;
    for (const e of markable) {
      const saved = selectedSession.attendance[e.id];
      base[e.id] = draft[`${sessionKey}:${e.id}`] ?? {
        // ⚠️ Vá 07/08/2026 — KHÔNG fallback "PRESENT". Trước đây mở buổi chưa điểm danh
        // lên là cả lớp đã sáng "Có mặt", bấm Lưu (hoặc lỡ tay) là ghi có mặt khống.
        // Ở lớp trải nghiệm cái giá đắt hơn lớp chính: tiến độ trải nghiệm đếm số buổi
        // PRESENT để tự đẩy trạng thái lead trên Kanban, nên điểm danh khống là đẩy
        // nhầm lead luôn.
        status: saved?.status ?? null,
        note: saved?.note ?? "",
      };
    }
    return base;
  }, [selectedSession, markable, draft, sessionKey]);

  const chuaDanhDau = demSoEmChuaDanhDau(markable, duNgChoBuoi);

  function setRow(enrollmentId: string, patch: Partial<DraftRow>) {
    setDraft((prev) => ({
      ...prev,
      [`${sessionKey}:${enrollmentId}`]: {
        ...(duNgChoBuoi[enrollmentId] ?? { status: null, note: "" }),
        ...patch,
      },
    }));
  }

  /**
   * Bấm lại đúng nhãn đang chọn = bỏ chọn, để lỡ tay còn gỡ được. CHỈ cho em CHƯA có
   * bản ghi trong DB: action chỉ upsert chứ không xoá, nên bỏ chọn một em đã lưu rồi
   * bấm Lưu sẽ chẳng xoá được gì — màn hình sẽ nói dối người dùng.
   */
  function toggleStatus(enrollmentId: string, status: TrialAttendanceMark) {
    const daLuu = Boolean(selectedSession?.attendance[enrollmentId]);
    const hienTai = duNgChoBuoi[enrollmentId]?.status ?? null;
    setRow(enrollmentId, { status: hienTai === status && !daLuu ? null : status });
  }

  function onSave() {
    if (!selectedSession) return;
    // Phải đủ cả lớp mới cho lưu: lưu dở dang thì buổi trông như "đã điểm danh" trong
    // khi vài em không có bản ghi nào, mà tiến độ lead lại tính theo số bản ghi PRESENT.
    if (chuaDanhDau > 0) {
      toast.error(`Còn ${chuaDanhDau} em chưa đánh dấu`);
      return;
    }
    const records = markable.flatMap((e) => {
      const row = duNgChoBuoi[e.id];
      if (!row?.status) return [];
      return [
        {
          trialEnrollmentId: e.id,
          status: row.status,
          note: row.note.trim() || null,
        },
      ];
    });
    if (records.length === 0) return;

    const sessionId = selectedSession.id;
    startTransition(async () => {
      const res = await markLopTrialAttendanceAction({
        trialSessionId: sessionId,
        records,
      });
      if (res.ok) {
        toast.success("Đã lưu điểm danh");
        // Xoá nháp của buổi vừa lưu để lần render sau đọc thẳng từ DB — giữ nháp lại
        // là màn hình tiếp tục hiện giá trị client kể cả khi server sửa khác đi.
        setDraft((prev) =>
          Object.fromEntries(
            Object.entries(prev).filter(([k]) => !k.startsWith(`${sessionId}:`)),
          ),
        );
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function onCompleteSession() {
    if (!selectedSession) return;
    const sessionId = selectedSession.id;
    startTransition(async () => {
      const res = await completeLopTrialSessionAction(sessionId);
      if (res.ok) {
        toast.success("Đã hoàn tất buổi");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Buổi học &amp; điểm danh</h2>
        <p className="text-sm text-muted-foreground">
          Lớp chưa có buổi nào. Thêm buổi trước khi điểm danh.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Buổi học &amp; điểm danh</h2>

      <div className="mb-4 flex flex-wrap gap-2">
        {sessions.map((s) => {
          const active = s.id === selectedSessionId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedSessionId(s.id)}
              aria-pressed={active}
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                active
                  ? "border-primary bg-primary-soft font-bold text-primary"
                  : "border-border font-medium text-muted-foreground hover:bg-muted"
              }`}
            >
              Buổi {s.seq} · {ngayVn(s.date)}
              {s.status === "COMPLETED" && (
                <span className="ml-1 text-state-success-ink">✓</span>
              )}
              {s.status === "CANCELLED" && (
                <span className="ml-1 text-state-danger-ink">đã huỷ</span>
              )}
              {/* Giáo viên hiện NGAY trên chip: người xếp lịch nhìn một lượt là biết
                  buổi nào chưa có ai dạy, không phải bấm từng buổi để dò. */}
              <span className="ml-1 font-normal opacity-70">
                · {tenGvBuoi(s.teacherId) ?? "chưa có GV"}
              </span>
            </button>
          );
        })}
      </div>

      {selectedSession && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              Buổi {selectedSession.seq} · {ngayVn(selectedSession.date)} ·{" "}
              {selectedSession.startTime}–{selectedSession.endTime}
              {" · "}
              <span className="font-medium text-foreground">
                GV: {tenGvBuoi(selectedSession.teacherId) ?? "chưa có"}
              </span>
            </span>
            {/* Hai nút thao tác của buổi đứng CẠNH NHAU ở mép phải. `justify-between`
                của hàng cha đẩy mỗi con ra một góc, nên phải bọc chúng lại — nếu không
                "Sửa buổi học" bị hất vào giữa, đọc như một phần của dòng thông tin. */}
            <div className="flex flex-wrap items-center gap-2">
              {canManage && selectedSession.status === "SCHEDULED" && (
                <button
                  type="button"
                  onClick={() => setMoSuaBuoi((v) => !v)}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {moSuaBuoi ? "Đóng" : "Sửa buổi học"}
                </button>
              )}
              {canMark && selectedSession.status !== "COMPLETED" && (
                <button
                  type="button"
                  onClick={onCompleteSession}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-state-success px-3 py-1.5 text-xs font-semibold text-state-success-ink hover:bg-state-success-soft disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Hoàn tất buổi
                </button>
              )}
            </div>
          </div>

          {moSuaBuoi && selectedSession.status === "SCHEDULED" && (
            <SuaBuoiForm
              key={selectedSession.id}
              session={selectedSession}
              teachers={teachers}
              rooms={rooms}
              onXong={() => setMoSuaBuoi(false)}
            />
          )}

          {markable.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có học viên để điểm danh.</p>
          ) : !canMark ? (
            <ul className="divide-y divide-border text-sm">
              {markable.map((e) => {
                const a = selectedSession.attendance[e.id];
                return (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span className="text-foreground">{e.childName}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {a ? (a.status === "PRESENT" ? "Có mặt" : "Vắng") : "Chưa điểm danh"}
                        {a?.note ? ` · ${a.note}` : ""}
                      </span>
                      <NutPhieu
                        enrollmentId={e.id}
                        sessionId={selectedSession.id}
                        daDanhGia={Boolean(selectedSession.danhGia[e.id])}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="space-y-2">
              {markable.map((e) => {
                const row = duNgChoBuoi[e.id] ?? { status: null, note: "" };
                return (
                  <div
                    key={e.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2"
                  >
                    <span className="min-w-[8rem] flex-1 text-sm font-medium text-foreground">
                      {e.childName}
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => toggleStatus(e.id, "PRESENT")}
                        disabled={pending}
                        aria-pressed={row.status === "PRESENT"}
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${
                          row.status === "PRESENT"
                            ? "bg-state-success text-white"
                            : "bg-card text-muted-foreground ring-1 ring-border"
                        }`}
                      >
                        Có mặt
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatus(e.id, "ABSENT")}
                        disabled={pending}
                        aria-pressed={row.status === "ABSENT"}
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${
                          row.status === "ABSENT"
                            ? "bg-state-danger text-white"
                            : "bg-card text-muted-foreground ring-1 ring-border"
                        }`}
                      >
                        Vắng
                      </button>
                    </div>
                    <NutPhieu
                      enrollmentId={e.id}
                      sessionId={selectedSession.id}
                      daDanhGia={Boolean(selectedSession.danhGia[e.id])}
                    />
                    <input
                      type="text"
                      value={row.note}
                      onChange={(ev) => setRow(e.id, { note: ev.target.value })}
                      disabled={pending}
                      placeholder="Ghi chú…"
                      aria-label={`Ghi chú điểm danh cho ${e.childName}`}
                      className="min-w-[10rem] flex-1 rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50"
                    />
                  </div>
                );
              })}

              <div className="mt-1 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onSave}
                  disabled={pending}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
                >
                  {pending ? "Đang lưu…" : "Lưu điểm danh"}
                </button>
                {chuaDanhDau > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Còn <span className="font-semibold text-foreground">{chuaDanhDau}</span> em
                    chưa đánh dấu
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
