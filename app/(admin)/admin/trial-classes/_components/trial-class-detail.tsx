"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, CheckCircle2, UserCog, UserPlus, Search, X } from "lucide-react";
import {
  addTrialSessionAction,
  assignTrialTeacherAction,
  markTrialAttendanceAction,
  completeTrialSessionAction,
  enrollLeadChildAction,
  unenrollLeadChildAction,
  rescheduleTrialEnrollmentAction,
  searchTrialCandidatesAction,
} from "../_actions";

type AttStatus = "PRESENT" | "ABSENT";
/** Một dòng nháp điểm danh. `status: null` = CHƯA điểm danh (không có bản ghi). */
type DraftRow = { status: AttStatus | null; note: string };

type Enrollment = {
  id: string;
  leadChildId: string | null;
  childName: string;
  parentName: string | null;
  phone: string | null;
  leadId: string | null;
  status: "ACTIVE" | "COMPLETED" | "WITHDRAWN" | string;
  /** Buổi đang xếp — ô chọn "Dời lịch" loại chính buổi này ra. */
  scheduledSessionId: string | null;
  /** Đã từng bị dời (id buổi cũ) — hiện nhãn để QLCS/Sale thấy ngay. */
  rescheduledFromSessionId: string | null;
};

type Candidate = {
  leadChildId: string;
  childName: string;
  parentName: string | null;
  phone: string | null;
  leadStatus: string;
};

type SessionData = {
  id: string;
  seq: number;
  date: string;
  startTime: string;
  endTime: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | string;
  attendance: Record<string, { status: AttStatus; note: string | null }>;
};

type Teacher = { id: string; name: string };

const ENROLL_BADGE: Record<string, string> = {
  ACTIVE: "bg-state-success-soft text-state-success-ink",
  COMPLETED: "bg-state-info-soft text-state-info-ink",
  WITHDRAWN: "bg-state-warning-soft text-state-warning-ink",
  CANCELLED: "bg-state-danger-soft text-state-danger-ink",
};
const ENROLL_LABEL: Record<string, string> = {
  ACTIVE: "Đang học",
  COMPLETED: "Hoàn tất",
  WITHDRAWN: "Đã rút",
  CANCELLED: "Đã huỷ",
};
const SESSION_LABEL: Record<string, string> = {
  SCHEDULED: "Chưa học",
  COMPLETED: "Đã học",
  CANCELLED: "Đã huỷ",
};

export function TrialClassDetail({
  trialClassId,
  currentTeacherId,
  classSessionCount,
  classStartTime,
  classEndTime,
  enrollments,
  sessions,
  teacherOptions,
  canAssignTeacher,
  canManage,
  canOverride,
  canMark,
}: {
  trialClassId: string;
  currentTeacherId: string | null;
  classSessionCount: number;
  classStartTime: string;
  classEndTime: string;
  enrollments: Enrollment[];
  sessions: SessionData[];
  teacherOptions: Teacher[];
  canAssignTeacher: boolean;
  canManage: boolean;
  canOverride: boolean;
  canMark: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // ── #1 — Thêm buổi ad-hoc (QĐ-R2-1: lớp slot không tự sinh buổi) ──
  const [sessionDate, setSessionDate] = useState("");
  const [sessionStart, setSessionStart] = useState(classStartTime);
  const [sessionEnd, setSessionEnd] = useState(classEndTime);
  // "" = kế thừa GV phụ trách lớp (mặc định).
  const [sessionTeacherId, setSessionTeacherId] = useState("");

  function onAddSession() {
    if (!sessionDate) {
      toast.error("Chọn ngày buổi học");
      return;
    }
    startTransition(async () => {
      const res = await addTrialSessionAction({
        trialClassId,
        date: sessionDate,
        startTime: sessionStart,
        endTime: sessionEnd,
        // không chọn → undefined = GV phụ trách lớp.
        teacherId: sessionTeacherId || undefined,
      });
      if (res.ok) {
        toast.success("Đã thêm buổi trải nghiệm");
        setSessionDate("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Thêm buổi thất bại");
      }
    });
  }

  // ── Thêm học viên (item 4/8): search lead + số buổi RIÊNG từng lead (QĐ-2) ──
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searched, setSearched] = useState(false);
  // số buổi nhập per-candidate (mặc định = số buổi lớp).
  const [sessionDraft, setSessionDraft] = useState<Record<string, string>>({});

  function runSearch() {
    startTransition(async () => {
      const res = await searchTrialCandidatesAction({ trialClassId, query: query.trim() });
      if (res.ok) {
        setCandidates(res.candidates);
        setSearched(true);
      } else {
        toast.error(res.error ?? "Tìm học viên thất bại");
      }
    });
  }

  function enrollCandidate(leadChildId: string, allowOverride: boolean) {
    const raw = sessionDraft[leadChildId];
    const totalSessions = raw && raw.trim() ? Number(raw) : classSessionCount;
    if (!Number.isInteger(totalSessions) || totalSessions < 1 || totalSessions > 60) {
      toast.error("Số buổi phải là số nguyên từ 1 đến 60");
      return;
    }
    startTransition(async () => {
      const res = await enrollLeadChildAction({
        trialClassId,
        leadChildId,
        allowOverride,
        totalSessions,
      });
      if (res.ok) {
        toast.success("Đã thêm học viên vào lớp");
        setCandidates((prev) => prev.filter((c) => c.leadChildId !== leadChildId));
        router.refresh();
        return;
      }
      if (res.overCapacity && canOverride) {
        if (window.confirm(`${res.error}. Bạn có quyền vượt sĩ số — vẫn thêm?`)) {
          enrollCandidate(leadChildId, true);
        }
        return;
      }
      toast.error(res.error ?? "Thêm học viên thất bại");
    });
  }

  // ── Dời 1 học viên trải nghiệm sang buổi khác (25/08) ───────────────────────
  // Trước đây buổi của học viên là BẤT BIẾN sau khi xếp: muốn đổi phải gỡ con ra rồi
  // xếp lại, và dấu vết "đã từng hẹn buổi nào" mất sạch. Nay dời tại chỗ; buổi cũ được
  // ghi lại để bảng Trial của site GV in được trạng thái "Bị dời lịch".
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [moveReason, setMoveReason] = useState("");

  /**
   * Buổi được phép dời TỚI: chỉ buổi chưa học (SCHEDULED). Dời vào buổi đã COMPLETED
   * thì điểm danh buổi đó đã chốt — học viên mới vào mang tiếng vắng mặt vĩnh viễn.
   */
  const movableSessions = useMemo(
    () => sessions.filter((sx) => sx.status === "SCHEDULED"),
    [sessions],
  );

  /** Nhãn buổi cho ô chọn: "Buổi 2 · 05/07/2026 · 09:00-10:30". */
  function sessionPickLabel(sx: SessionData): string {
    const d = new Date(sx.date);
    const dmy = [
      String(d.getUTCDate()).padStart(2, "0"),
      String(d.getUTCMonth() + 1).padStart(2, "0"),
      d.getUTCFullYear(),
    ].join("/");
    return `Buổi ${sx.seq} · ${dmy} · ${sx.startTime}-${sx.endTime}`;
  }

  function startMove(enrollmentId: string) {
    setMovingId(enrollmentId);
    setMoveTo("");
    setMoveReason("");
  }

  function submitMove(enrollmentId: string) {
    startTransition(async () => {
      const res = await rescheduleTrialEnrollmentAction({
        enrollmentId,
        toSessionId: moveTo,
        reason: moveReason,
      });
      if (res.ok) {
        toast.success("Đã dời lịch học thử");
        setMovingId(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "Dời lịch thất bại");
      }
    });
  }

  function removeStudent(leadChildId: string | null, childName: string) {
    if (!leadChildId) return;
    if (!window.confirm(`Gỡ ${childName} khỏi lớp trải nghiệm? Lịch sử học thử (nếu có) vẫn được giữ.`)) {
      return;
    }
    startTransition(async () => {
      const res = await unenrollLeadChildAction({ trialClassId, leadChildId });
      if (res.ok) {
        toast.success("Đã gỡ học viên");
        router.refresh();
      } else {
        toast.error(res.error ?? "Gỡ học viên thất bại");
      }
    });
  }

  // Học viên tham gia điểm danh = đang học / đã hoàn tất (loại rút/huỷ).
  const markable = useMemo(
    () => enrollments.filter((e) => e.status === "ACTIVE" || e.status === "COMPLETED"),
    [enrollments],
  );

  const [selectedSessionId, setSelectedSessionId] = useState(
    sessions[0]?.id ?? "",
  );
  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null;

  // Bản nháp điểm danh cho buổi đang chọn (khởi tạo từ dữ liệu đã lưu).
  // status = null ⇒ CHƯA điểm danh (xem comment ở currentDraft).
  const [draft, setDraft] = useState<Record<string, DraftRow>>({});

  const sessionKey = selectedSessionId;
  const currentDraft = useMemo(() => {
    if (!selectedSession) return {};
    const base: Record<string, DraftRow> = {};
    for (const e of markable) {
      const existing = selectedSession.attendance[e.id];
      const override = draft[`${sessionKey}:${e.id}`];
      base[e.id] = override ?? {
        // ⚠️ 07/08/2026 — trước đây fallback "PRESENT": mở buổi chưa điểm danh lên là
        // cả lớp đã sáng "Có mặt", bấm Lưu (hoặc lỡ tay) là ghi có mặt cho tất cả.
        // Ở lớp trải nghiệm cái giá còn đắt hơn lớp chính: syncTrialProgress đếm số
        // buổi PRESENT để tự đẩy Kanban lead (TRIAL_IN_PROGRESS → AWAITING_DECISION),
        // nên điểm danh khống là đẩy nhầm trạng thái lead luôn.
        status: existing?.status ?? null,
        note: existing?.note ?? "",
      };
    }
    return base;
  }, [selectedSession, markable, draft, sessionKey]);

  /** Số em chưa được đánh dấu ở buổi đang chọn. */
  const unmarked = useMemo(
    () => markable.filter((e) => !currentDraft[e.id]?.status).length,
    [markable, currentDraft],
  );

  function setRow(enrollmentId: string, patch: Partial<DraftRow>) {
    setDraft((prev) => ({
      ...prev,
      [`${sessionKey}:${enrollmentId}`]: { ...currentDraft[enrollmentId], ...patch },
    }));
  }

  /**
   * Bấm nhãn: bấm lại đúng nhãn đang chọn = BỎ chọn (về "chưa điểm danh") — lỡ tay còn
   * gỡ được. CHỈ cho em CHƯA có bản ghi trong DB: markAttendance chỉ upsert chứ không
   * xoá, nên bỏ chọn em đã lưu rồi bấm Lưu sẽ không xoá được gì — màn hình nói dối.
   */
  function toggleStatus(enrollmentId: string, status: AttStatus) {
    const saved = Boolean(selectedSession?.attendance[enrollmentId]);
    const cur = currentDraft[enrollmentId]?.status ?? null;
    setRow(enrollmentId, { status: cur === status && !saved ? null : status });
  }

  function onAssignTeacher(teacherId: string) {
    startTransition(async () => {
      const res = await assignTrialTeacherAction(trialClassId, teacherId || null);
      if (res.ok) {
        toast.success("Đã cập nhật giáo viên");
        router.refresh();
      } else {
        toast.error(res.error ?? "Gán giáo viên thất bại");
      }
    });
  }

  function onSaveAttendance() {
    if (!selectedSession) return;
    // Phải đánh dấu đủ cả lớp mới cho lưu — giống lưới lớp chính và site GV. Lưu dở
    // dang thì buổi hiện "đã điểm danh" trong khi vài em không có bản ghi nào, mà
    // tiến độ trải nghiệm của lead lại tính theo số buổi PRESENT đã ghi.
    if (unmarked > 0) {
      toast.error(`Còn ${unmarked} em chưa đánh dấu — điểm danh đủ cả lớp rồi mới lưu được.`);
      return;
    }
    // Chỉ gửi em đã bấm trạng thái (không bản ghi = chưa điểm danh).
    const records = markable.flatMap((e) => {
      const row = currentDraft[e.id];
      if (!row?.status) return [];
      return [
        {
          trialEnrollmentId: e.id,
          status: row.status,
          note: row.note?.trim() || null,
        },
      ];
    });
    if (records.length === 0) return;
    startTransition(async () => {
      const res = await markTrialAttendanceAction({
        trialSessionId: selectedSession.id,
        records,
      });
      if (res.ok) {
        toast.success("Đã lưu điểm danh");
        router.refresh();
      } else {
        toast.error(res.error ?? "Điểm danh thất bại");
      }
    });
  }

  function onCompleteSession() {
    if (!selectedSession) return;
    startTransition(async () => {
      const res = await completeTrialSessionAction(selectedSession.id);
      if (res.ok) {
        toast.success("Đã hoàn tất buổi");
        router.refresh();
      } else {
        toast.error(res.error ?? "Hoàn tất buổi thất bại");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Assign teacher (QL) */}
      {canAssignTeacher && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
          <UserCog className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Giáo viên phụ trách:</span>
          <select
            value={currentTeacherId ?? ""}
            onChange={(e) => onAssignTeacher(e.target.value)}
            disabled={pending}
            className="rounded-lg border border-border px-2 py-2 text-sm disabled:opacity-50"
          >
            <option value="">— chưa phân công —</option>
            {teacherOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* #1 — Thêm buổi (nguồn TrialClassSession — thiếu là GV không nhận được gì) */}
      {canManage && (
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
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                disabled={pending}
                className="rounded-lg border border-border px-2 py-1.5 text-sm disabled:opacity-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Bắt đầu
              <input
                type="time"
                value={sessionStart}
                onChange={(e) => setSessionStart(e.target.value)}
                disabled={pending}
                className="rounded-lg border border-border px-2 py-1.5 text-sm disabled:opacity-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Kết thúc
              <input
                type="time"
                value={sessionEnd}
                onChange={(e) => setSessionEnd(e.target.value)}
                disabled={pending}
                className="rounded-lg border border-border px-2 py-1.5 text-sm disabled:opacity-50"
              />
            </label>
            {teacherOptions.length > 0 && (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Giáo viên
                <select
                  value={sessionTeacherId}
                  onChange={(e) => setSessionTeacherId(e.target.value)}
                  disabled={pending}
                  className="rounded-lg border border-border px-2 py-1.5 text-sm disabled:opacity-50"
                >
                  <option value="">— GV phụ trách lớp —</option>
                  {teacherOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={onAddSession}
              disabled={pending || !sessionDate}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              Thêm buổi
            </button>
          </div>
          {sessions.length === 0 && (
            <p className="mt-2 text-xs text-state-warning-ink">
              Lớp chưa có buổi nào — phải thêm buổi thì mới xếp được học viên và giáo
              viên mới thấy lịch/danh sách Trial.
            </p>
          )}
        </div>
      )}

      {/* Thêm học viên (item 4/8) — search lead + số buổi per-lead */}
      {canManage && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Thêm học viên</h2>
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary-soft"
            >
              <UserPlus className="h-3.5 w-3.5" /> {showAdd ? "Đóng" : "Tìm & thêm học viên"}
            </button>
          </div>

          {showAdd && (
            <div className="mt-3 space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        runSearch();
                      }
                    }}
                    disabled={pending}
                    placeholder="Tên con, tên phụ huynh hoặc SĐT…"
                    className="w-full rounded-lg border border-border py-2 pl-8 pr-2 text-sm disabled:opacity-50"
                  />
                </div>
                <button
                  type="button"
                  onClick={runSearch}
                  disabled={pending}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
                >
                  Tìm
                </button>
              </div>

              {searched && candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Không tìm thấy học viên phù hợp (cùng cơ sở, chưa ở lớp khác).
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {candidates.map((c) => (
                    <li
                      key={c.leadChildId}
                      className="flex flex-wrap items-center gap-2 py-2"
                    >
                      <div className="min-w-[8rem] flex-1">
                        <span className="text-sm font-medium text-foreground">{c.childName}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {c.parentName ?? "—"}
                          {c.phone ? ` · ${c.phone}` : ""} · {c.leadStatus}
                        </span>
                      </div>
                      <label className="flex items-center gap-1 text-xs text-muted-foreground">
                        Số buổi
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={sessionDraft[c.leadChildId] ?? String(classSessionCount)}
                          onChange={(e) =>
                            setSessionDraft((p) => ({ ...p, [c.leadChildId]: e.target.value }))
                          }
                          disabled={pending}
                          className="w-16 rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => enrollCandidate(c.leadChildId, false)}
                        disabled={pending}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
                      >
                        Thêm
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Roster */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Danh sách học viên ({enrollments.length})
        </h2>
        {enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có học viên.{canManage ? " Dùng “Tìm & thêm học viên” ở trên." : ""}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {enrollments.map((e) => {
              const inactive = e.status === "WITHDRAWN" || e.status === "CANCELLED";
              return (
                <li key={e.id} className={inactive ? "py-2 opacity-60" : "py-2"}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span
                        className={`font-medium ${inactive ? "text-muted-foreground line-through" : "text-foreground"}`}
                      >
                        {e.childName}
                      </span>
                      {e.parentName && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          PH: {e.parentName}
                          {e.phone ? ` · ${e.phone}` : ""}
                        </span>
                      )}
                      {e.rescheduledFromSessionId && (
                        <span className="ml-2 rounded-full bg-state-warning-soft px-2 py-0.5 text-xs font-semibold text-state-warning-ink">
                          Đã dời lịch
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ ENROLL_BADGE[e.status] ?? "bg-muted text-muted-foreground" }`}
                      >
                        {ENROLL_LABEL[e.status] ?? e.status}
                      </span>
                      {canManage && e.status === "ACTIVE" && movableSessions.length > 0 && (
                        <button
                          type="button"
                          onClick={() => (movingId === e.id ? setMovingId(null) : startMove(e.id))}
                          disabled={pending}
                          title="Dời sang buổi khác"
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                        >
                          Dời lịch
                        </button>
                      )}
                      {canManage && e.status === "ACTIVE" && (
                        <button
                          type="button"
                          onClick={() => removeStudent(e.leadChildId, e.childName)}
                          disabled={pending}
                          title="Gỡ khỏi lớp"
                          className="inline-flex items-center gap-1 rounded-md border border-state-danger px-2 py-0.5 text-xs font-medium text-state-danger-ink hover:bg-state-danger-soft disabled:opacity-50"
                        >
                          <X className="h-3 w-3" /> Gỡ
                        </button>
                      )}
                    </div>
                  </div>

                  {movingId === e.id && (
                    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/40 p-2">
                      <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
                        Buổi mới
                        <select
                          value={moveTo}
                          onChange={(ev) => setMoveTo(ev.target.value)}
                          disabled={pending}
                          className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                        >
                          <option value="">— Chọn buổi —</option>
                          {movableSessions
                            .filter((sx) => sx.id !== e.scheduledSessionId)
                            .map((sx) => (
                              <option key={sx.id} value={sx.id}>
                                {sessionPickLabel(sx)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="flex min-w-[220px] flex-[2] flex-col gap-1 text-xs font-medium text-muted-foreground">
                        Lý do dời (bắt buộc)
                        <input
                          value={moveReason}
                          onChange={(ev) => setMoveReason(ev.target.value)}
                          disabled={pending}
                          placeholder="Phụ huynh xin đổi buổi, con ốm…"
                          className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => submitMove(e.id)}
                        disabled={pending || !moveTo || moveReason.trim().length < 3}
                        className="h-8 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        Dời
                      </button>
                      <button
                        type="button"
                        onClick={() => setMovingId(null)}
                        disabled={pending}
                        className="h-8 rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                      >
                        Huỷ
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Sessions + attendance */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Buổi học & điểm danh</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Lớp chưa có buổi nào.</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSessionId(s.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${ s.id === selectedSessionId ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:bg-muted" }`}
                >
                  Buổi {s.seq}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {SESSION_LABEL[s.status] ?? s.status}
                  </span>
                </button>
              ))}
            </div>

            {selectedSession && (
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>
                    Buổi {selectedSession.seq} ·{" "}
                    {new Date(selectedSession.date).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} ·{" "}
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
                  // Read-only view (không có quyền điểm danh / không phải GV lớp).
                  <ul className="divide-y divide-border text-sm">
                    {markable.map((e) => {
                      const a = selectedSession.attendance[e.id];
                      return (
                        <li key={e.id} className="flex items-center justify-between py-2">
                          <span className="text-foreground">{e.childName}</span>
                          <span className="text-xs text-muted-foreground">
                            {a
                              ? a.status === "PRESENT"
                                ? "Có mặt"
                                : "Vắng"
                              : "Chưa điểm danh"}
                            {a?.note ? ` · ${a.note}` : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="space-y-2">
                    {markable.map((e) => {
                      const row: DraftRow = currentDraft[e.id] ?? { status: null, note: "" };
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
                              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${ row.status === "PRESENT" ? "bg-state-success text-white" : "bg-card text-muted-foreground ring-1 ring-border" }`}
                            >
                              Có mặt
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleStatus(e.id, "ABSENT")}
                              disabled={pending}
                              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${ row.status === "ABSENT" ? "bg-state-danger text-white" : "bg-card text-muted-foreground ring-1 ring-border" }`}
                            >
                              Vắng
                            </button>
                          </div>
                          <input
                            value={row.note}
                            onChange={(ev) => setRow(e.id, { note: ev.target.value })}
                            disabled={pending}
                            placeholder="Ghi chú…"
                            className="min-w-[10rem] flex-1 rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50"
                          />
                        </div>
                      );
                    })}
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={onSaveAttendance}
                        disabled={pending}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
                      >
                        {pending ? "Đang lưu…" : "Lưu điểm danh"}
                      </button>
                      {unmarked > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Còn <span className="font-semibold text-foreground">{unmarked}</span> em
                          chưa đánh dấu
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
