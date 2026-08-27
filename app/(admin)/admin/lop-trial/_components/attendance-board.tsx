"use client";

// app/(admin)/admin/lop-trial/_components/attendance-board.tsx — GĐ2.
//
// Lưới điểm danh của một lớp trải nghiệm: chọn buổi bằng dãy chip, đánh dấu từng em,
// lưu một lần cho cả buổi.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import {
  markLopTrialAttendanceAction,
  completeLopTrialSessionAction,
} from "../_actions";
import type {
  EnrollmentRow,
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

/** Ngày buổi học lưu ở cột `@db.Date` = UTC-midnight của ngày VN. */
function ngayVn(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function AttendanceBoard({
  sessions,
  enrollments,
  canMark,
}: {
  sessions: SessionRow[];
  enrollments: EnrollmentRow[];
  canMark: boolean;
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
            </span>
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
                    <span className="text-xs text-muted-foreground">
                      {a ? (a.status === "PRESENT" ? "Có mặt" : "Vắng") : "Chưa điểm danh"}
                      {a?.note ? ` · ${a.note}` : ""}
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
