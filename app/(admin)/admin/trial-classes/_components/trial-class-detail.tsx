"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, UserCog, UserPlus, Search, X } from "lucide-react";
import {
  assignTrialTeacherAction,
  markTrialAttendanceAction,
  completeTrialSessionAction,
  enrollLeadChildAction,
  unenrollLeadChildAction,
  searchTrialCandidatesAction,
} from "../_actions";

type AttStatus = "PRESENT" | "ABSENT";

type Enrollment = {
  id: string;
  leadChildId: string | null;
  childName: string;
  parentName: string | null;
  phone: string | null;
  leadId: string | null;
  status: "ACTIVE" | "COMPLETED" | "WITHDRAWN" | string;
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
  ACTIVE: "bg-emerald-100 text-emerald-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  WITHDRAWN: "bg-amber-100 text-amber-700",
  CANCELLED: "bg-rose-100 text-rose-700",
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
  const [draft, setDraft] = useState<Record<string, { status: AttStatus; note: string }>>(
    {},
  );

  const sessionKey = selectedSessionId;
  const currentDraft = useMemo(() => {
    if (!selectedSession) return {};
    const base: Record<string, { status: AttStatus; note: string }> = {};
    for (const e of markable) {
      const existing = selectedSession.attendance[e.id];
      const override = draft[`${sessionKey}:${e.id}`];
      base[e.id] = override ?? {
        status: existing?.status ?? "PRESENT",
        note: existing?.note ?? "",
      };
    }
    return base;
  }, [selectedSession, markable, draft, sessionKey]);

  function setRow(enrollmentId: string, patch: Partial<{ status: AttStatus; note: string }>) {
    setDraft((prev) => ({
      ...prev,
      [`${sessionKey}:${enrollmentId}`]: { ...currentDraft[enrollmentId], ...patch },
    }));
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
    const records = markable.map((e) => ({
      trialEnrollmentId: e.id,
      status: currentDraft[e.id]?.status ?? "PRESENT",
      note: currentDraft[e.id]?.note?.trim() || null,
    }));
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
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-4">
          <UserCog className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Giáo viên phụ trách:</span>
          <select
            value={currentTeacherId ?? ""}
            onChange={(e) => onAssignTeacher(e.target.value)}
            disabled={pending}
            className="rounded-lg border border-gray-300 px-2 py-2 text-sm disabled:opacity-50"
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

      {/* Thêm học viên (item 4/8) — search lead + số buổi per-lead */}
      {canManage && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Thêm học viên</h2>
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50"
            >
              <UserPlus className="h-3.5 w-3.5" /> {showAdd ? "Đóng" : "Tìm & thêm học viên"}
            </button>
          </div>

          {showAdd && (
            <div className="mt-3 space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
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
                    className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-2 text-sm disabled:opacity-50"
                  />
                </div>
                <button
                  type="button"
                  onClick={runSearch}
                  disabled={pending}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  Tìm
                </button>
              </div>

              {searched && candidates.length === 0 ? (
                <p className="text-sm text-gray-400">
                  Không tìm thấy học viên phù hợp (cùng cơ sở, chưa ở lớp khác).
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {candidates.map((c) => (
                    <li
                      key={c.leadChildId}
                      className="flex flex-wrap items-center gap-2 py-2"
                    >
                      <div className="min-w-[8rem] flex-1">
                        <span className="text-sm font-medium text-gray-800">{c.childName}</span>
                        <span className="ml-2 text-xs text-gray-400">
                          {c.parentName ?? "—"}
                          {c.phone ? ` · ${c.phone}` : ""} · {c.leadStatus}
                        </span>
                      </div>
                      <label className="flex items-center gap-1 text-xs text-gray-500">
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
                          className="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => enrollCandidate(c.leadChildId, false)}
                        disabled={pending}
                        className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
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
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          Danh sách học viên ({enrollments.length})
        </h2>
        {enrollments.length === 0 ? (
          <p className="text-sm text-gray-400">
            Chưa có học viên.{canManage ? " Dùng “Tìm & thêm học viên” ở trên." : ""}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {enrollments.map((e) => {
              const inactive = e.status === "WITHDRAWN" || e.status === "CANCELLED";
              return (
                <li
                  key={e.id}
                  className={`flex flex-wrap items-center justify-between gap-2 py-2 ${
                    inactive ? "opacity-60" : ""
                  }`}
                >
                  <div>
                    <span
                      className={`font-medium ${inactive ? "text-gray-500 line-through" : "text-gray-800"}`}
                    >
                      {e.childName}
                    </span>
                    {e.parentName && (
                      <span className="ml-2 text-xs text-gray-400">
                        PH: {e.parentName}
                        {e.phone ? ` · ${e.phone}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        ENROLL_BADGE[e.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {ENROLL_LABEL[e.status] ?? e.status}
                    </span>
                    {canManage && e.status === "ACTIVE" && (
                      <button
                        type="button"
                        onClick={() => removeStudent(e.leadChildId, e.childName)}
                        disabled={pending}
                        title="Gỡ khỏi lớp"
                        className="inline-flex items-center gap-1 rounded-md border border-rose-300 px-2 py-0.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" /> Gỡ
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Sessions + attendance */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Buổi học & điểm danh</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-400">Lớp chưa có buổi nào.</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSessionId(s.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    s.id === selectedSessionId
                      ? "border-orange-500 bg-orange-50 text-orange-700"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Buổi {s.seq}
                  <span className="ml-1 text-[10px] text-gray-400">
                    {SESSION_LABEL[s.status] ?? s.status}
                  </span>
                </button>
              ))}
            </div>

            {selectedSession && (
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
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
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Hoàn tất buổi
                    </button>
                  )}
                </div>

                {markable.length === 0 ? (
                  <p className="text-sm text-gray-400">Chưa có học viên để điểm danh.</p>
                ) : !canMark ? (
                  // Read-only view (không có quyền điểm danh / không phải GV lớp).
                  <ul className="divide-y divide-gray-100 text-sm">
                    {markable.map((e) => {
                      const a = selectedSession.attendance[e.id];
                      return (
                        <li key={e.id} className="flex items-center justify-between py-2">
                          <span className="text-gray-800">{e.childName}</span>
                          <span className="text-xs text-gray-500">
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
                      const row = currentDraft[e.id] ?? { status: "PRESENT" as AttStatus, note: "" };
                      return (
                        <div
                          key={e.id}
                          className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2"
                        >
                          <span className="min-w-[8rem] flex-1 text-sm font-medium text-gray-800">
                            {e.childName}
                          </span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => setRow(e.id, { status: "PRESENT" })}
                              disabled={pending}
                              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                                row.status === "PRESENT"
                                  ? "bg-emerald-500 text-white"
                                  : "bg-white text-gray-600 ring-1 ring-gray-300"
                              }`}
                            >
                              Có mặt
                            </button>
                            <button
                              type="button"
                              onClick={() => setRow(e.id, { status: "ABSENT" })}
                              disabled={pending}
                              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                                row.status === "ABSENT"
                                  ? "bg-rose-500 text-white"
                                  : "bg-white text-gray-600 ring-1 ring-gray-300"
                              }`}
                            >
                              Vắng
                            </button>
                          </div>
                          <input
                            value={row.note}
                            onChange={(ev) => setRow(e.id, { note: ev.target.value })}
                            disabled={pending}
                            placeholder="Ghi chú…"
                            className="min-w-[10rem] flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
                          />
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={onSaveAttendance}
                      disabled={pending}
                      className="mt-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                    >
                      {pending ? "Đang lưu…" : "Lưu điểm danh"}
                    </button>
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
