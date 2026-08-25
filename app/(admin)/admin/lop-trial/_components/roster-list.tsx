"use client";

// app/(admin)/admin/lop-trial/_components/roster-list.tsx — GĐ3.
//
// Danh sách học viên của một lớp trải nghiệm. Mỗi dòng là một "ca" trải nghiệm:
// buổi đang xếp, giáo viên, và các thao tác gỡ / dời lịch / đề xuất / phân công.
//
// Hai cổng quyền KHÁC NHAU, đừng gộp:
//   canManage       = Sale / QL cơ sở — xếp, gỡ, dời lịch, ĐỀ XUẤT giáo viên.
//   canAssignTeacher = CHỈ bộ phận Đào tạo — PHÂN CÔNG giáo viên (chốt cuối).

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarClock, X } from "lucide-react";
import {
  assignLopTrialCaseTeacherAction,
  proposeLopTrialTeacherAction,
  rescheduleLopTrialAction,
  unenrollLeadChildLopTrialAction,
} from "../_actions";
import type {
  EnrollmentRow,
  Option,
  SessionRow,
  TrialEnrollmentStatusV2,
} from "../_lib/types";

const NHAN: Record<TrialEnrollmentStatusV2, string> = {
  ACTIVE: "Đang học",
  COMPLETED: "Đã xong",
  WITHDRAWN: "Đã gỡ",
};

const MAU: Record<TrialEnrollmentStatusV2, string> = {
  ACTIVE: "bg-state-success-soft text-state-success-ink",
  COMPLETED: "bg-muted text-muted-foreground",
  WITHDRAWN: "bg-state-danger-soft text-state-danger-ink",
};

const O_SELECT =
  "rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground disabled:opacity-50";
const O_NUT_PHU =
  "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50";

/**
 * `date` là mốc UTC-midnight của NGÀY VN (cột `@db.Date`). Format theo múi giờ máy
 * người dùng sẽ lùi một ngày ở mọi múi giờ âm — nên ép `timeZone: "UTC"`.
 */
function ngayVn(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Nhãn đầy đủ của một buổi trong dropdown dời lịch. */
function nhanBuoiDayDu(s: SessionRow): string {
  return `Buổi ${s.seq} · ${ngayVn(s.date)} ${s.startTime}–${s.endTime}`;
}

export function RosterList({
  trialClassId,
  enrollments,
  sessions,
  teachers,
  canManage,
  canAssignTeacher,
}: {
  trialClassId: string;
  enrollments: EnrollmentRow[];
  sessions: SessionRow[];
  teachers: Option[];
  canManage: boolean;
  canAssignTeacher: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Gỡ hai nhịp thay cho `window.confirm`: id đang chờ xác nhận, tự huỷ sau 4 giây.
  const [choXacNhan, setChoXacNhan] = useState<string | null>(null);

  useEffect(() => {
    if (!choXacNhan) return;
    const t = window.setTimeout(() => setChoXacNhan(null), 4000);
    // Dọn timer khi đổi dòng hoặc rời màn — thiếu dòng này thì nhịp chờ của dòng CŨ
    // sẽ bắn về sau và xoá mất trạng thái chờ của dòng người dùng vừa bấm.
    return () => window.clearTimeout(t);
  }, [choXacNhan]);

  const sessionById = useMemo(
    () => new Map(sessions.map((s) => [s.id, s])),
    [sessions],
  );
  const tenGvById = useMemo(
    () => new Map(teachers.map((t) => [t.id, t.name])),
    [teachers],
  );

  function go(leadChildId: string) {
    startTransition(async () => {
      const res = await unenrollLeadChildLopTrialAction({ trialClassId, leadChildId });
      if (res.ok) {
        toast.success("Đã gỡ học viên khỏi lớp");
        setChoXacNhan(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  if (enrollments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Chưa có học viên nào trong lớp.</p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {enrollments.map((e) => (
        <RosterRow
          key={e.id}
          e={e}
          sessions={sessions}
          sessionById={sessionById}
          tenGvById={tenGvById}
          teachers={teachers}
          canManage={canManage}
          canAssignTeacher={canAssignTeacher}
          dangCho={choXacNhan === e.id}
          pendingGo={pending}
          onGoClick={(leadChildId) => {
            if (choXacNhan === e.id) go(leadChildId);
            else setChoXacNhan(e.id);
          }}
        />
      ))}
    </ul>
  );
}

function RosterRow({
  e,
  sessions,
  sessionById,
  tenGvById,
  teachers,
  canManage,
  canAssignTeacher,
  dangCho,
  pendingGo,
  onGoClick,
}: {
  e: EnrollmentRow;
  sessions: SessionRow[];
  sessionById: Map<string, SessionRow>;
  tenGvById: Map<string, string>;
  teachers: Option[];
  canManage: boolean;
  canAssignTeacher: boolean;
  dangCho: boolean;
  pendingGo: boolean;
  onGoClick: (leadChildId: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  /**
   * `null` = đang tin prop từ server. Chuỗi = lựa chọn người dùng vừa chọn (lạc quan).
   *
   * Vì sao không `useState(prop)` thẳng: state khởi tạo MỘT lần rồi không bao giờ nhận
   * prop mới, nên sau `router.refresh()` ô select sẽ đứng yên ở giá trị cũ. Kiểu
   * "đè lên prop" này cho phép hoàn tác chỉ bằng `setOverride(null)` — tức trả select
   * về đúng sự thật server đang giữ.
   */
  const [deXuatOverride, setDeXuatOverride] = useState<string | null>(null);
  const [phanCongOverride, setPhanCongOverride] = useState<string | null>(null);

  const [moKhoiDoi, setMoKhoiDoi] = useState(false);
  const [toSessionId, setToSessionId] = useState("");
  const [lyDo, setLyDo] = useState("");

  const dangHoc = e.status === "ACTIVE";
  const daPhanCong = e.gvPhanCongId !== null;

  // Ghi danh mồ côi lead (leadChildId null) không gỡ được: action định danh
  // học viên bằng leadChildId chứ không bằng id ghi danh.
  const leadChildId = e.leadChildId;
  const goDuoc = canManage && dangHoc && leadChildId !== null;

  const buoi = e.scheduledSessionId ? (sessionById.get(e.scheduledSessionId) ?? null) : null;

  // Chỉ buổi còn SCHEDULED và khác buổi hiện tại mới là đích dời hợp lệ.
  const buoiDoiDuoc = useMemo(
    () =>
      sessions.filter(
        (s) => s.status === "SCHEDULED" && s.id !== e.scheduledSessionId,
      ),
    [sessions, e.scheduledSessionId],
  );

  const deXuatValue = deXuatOverride ?? e.gvDeXuatId ?? "";
  // Mặc định đưa sẵn đề xuất của Sale lên ô phân công để Đào tạo bấm duyệt cho nhanh.
  const phanCongValue = phanCongOverride ?? e.gvPhanCongId ?? e.gvDeXuatId ?? "";

  function tenGv(id: string): string {
    // GV có thể đã rời danh sách được phép chọn (đổi cơ sở, nghỉ) — vẫn phải hiện
    // được là ca này ĐANG có người, chứ không im lặng thành "chưa có giáo viên".
    return tenGvById.get(id) ?? "(không rõ)";
  }

  function dongKhoiDoi() {
    setMoKhoiDoi(false);
    setToSessionId("");
    setLyDo("");
  }

  function luuDeXuat(next: string) {
    setDeXuatOverride(next);
    startTransition(async () => {
      const res = await proposeLopTrialTeacherAction({
        trialEnrollmentId: e.id,
        gvDeXuatId: next || null,
      });
      if (res.ok) {
        toast.success(next ? "Đã đề xuất giáo viên" : "Đã bỏ đề xuất");
        // Giữ override cho tới khi prop mới về, nếu không select sẽ nháy về giá trị
        // cũ trong lúc chờ refresh — người dùng tưởng lưu hụt.
        router.refresh();
        return;
      }
      // Thất bại mà để nguyên lựa chọn mới là màn hình nói dối.
      setDeXuatOverride(null);
      toast.error(res.error);
    });
  }

  function luuPhanCong(next: string) {
    setPhanCongOverride(next);
    startTransition(async () => {
      const res = await assignLopTrialCaseTeacherAction({
        trialEnrollmentId: e.id,
        gvPhanCongId: next || null,
      });
      if (res.ok) {
        toast.success(next ? "Đã phân công giáo viên" : "Đã bỏ phân công");
        router.refresh();
        return;
      }
      setPhanCongOverride(null);
      toast.error(res.error);
    });
  }

  function xacNhanDoi() {
    if (!toSessionId) {
      toast.error("Chọn buổi muốn dời sang");
      return;
    }
    startTransition(async () => {
      const res = await rescheduleLopTrialAction({
        trialEnrollmentId: e.id,
        toSessionId,
        reason: lyDo.trim() || null,
      });
      if (res.ok) {
        toast.success("Đã dời lịch");
        // Dời lịch GỠ phân công ở server ⇒ override lạc quan đang giữ trong máy đã
        // sai. Trả cả hai về null để select đọc lại sự thật mới sau refresh.
        setDeXuatOverride(null);
        setPhanCongOverride(null);
        dongKhoiDoi();
        router.refresh();
        return;
      }
      toast.error(res.error);
    });
  }

  const dangBan = pending || pendingGo;

  return (
    <li className="py-3">
      {/* Hàng 1 — danh tính, trạng thái, nút gỡ */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-[10rem]">
          <span className="text-sm font-semibold text-foreground">{e.childName}</span>
          <p className="text-xs text-muted-foreground">
            {e.parentName ? (
              e.leadId ? (
                <Link href={`/leads/${e.leadId}`} className="text-primary hover:underline">
                  {e.parentName}
                </Link>
              ) : (
                e.parentName
              )
            ) : (
              "—"
            )}
            {e.phone ? ` · ${e.phone}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${MAU[e.status]}`}
          >
            {NHAN[e.status]}
          </span>
          {goDuoc && leadChildId && (
            <button
              type="button"
              onClick={() => onGoClick(leadChildId)}
              disabled={dangBan}
              title="Gỡ khỏi lớp trải nghiệm"
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium disabled:opacity-50 ${
                dangCho
                  ? "border-state-danger bg-state-danger-soft text-state-danger-ink"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              <X className="h-3 w-3" />
              {dangCho ? "Bấm lần nữa để gỡ" : "Gỡ"}
            </button>
          )}
        </div>
      </div>

      {/* Hàng 2 — buổi đang xếp + giáo viên */}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className={buoi ? "text-foreground" : "text-muted-foreground"}>
          {buoi ? `Buổi ${buoi.seq} · ${ngayVn(buoi.date)}` : "Chưa xếp buổi"}
        </span>

        {e.rescheduleCount > 0 && (
          <span className="rounded-full bg-state-warning-soft px-2 py-0.5 font-medium text-state-warning-ink">
            Đã dời {e.rescheduleCount} lần
          </span>
        )}

        {/* Thứ tự ưu tiên là CHỐT của chủ dự án: đã phân công thì KHÔNG hiện đề xuất
            nữa — Sale chỉ còn thấy đúng người Đào tạo đã chốt. */}
        {daPhanCong && e.gvPhanCongId ? (
          <span className="flex items-center gap-1.5 text-foreground">
            GV: {tenGv(e.gvPhanCongId)}
            <span className="rounded-full bg-state-success-soft px-2 py-0.5 font-medium text-state-success-ink">
              Đã phân công
            </span>
          </span>
        ) : e.gvDeXuatId ? (
          <span className="flex items-center gap-1.5 text-foreground">
            Đề xuất: {tenGv(e.gvDeXuatId)}
            {/* Viền thay vì nền đặc: thang màu repo chỉ có 4 state, "chờ" và "đã dời"
                cùng họ warning nên phải tách nhau bằng hình, không bịa màu mới. */}
            <span className="rounded-full border border-state-warning px-2 py-0.5 font-medium text-state-warning-ink">
              Chờ Đào tạo duyệt
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">Chưa có giáo viên</span>
        )}
      </div>

      {/* Hàng 3 — ô đề xuất (Sale) và ô phân công (Đào tạo) */}
      {(canManage || (canAssignTeacher && dangHoc)) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {canManage && dangHoc && !daPhanCong && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Đề xuất GV
              <select
                value={deXuatValue}
                onChange={(ev) => luuDeXuat(ev.target.value)}
                disabled={dangBan}
                aria-label={`Đề xuất giáo viên cho ${e.childName}`}
                className={O_SELECT}
              >
                {/* Đề xuất KHÔNG bắt buộc — luôn có lối bỏ trống. */}
                <option value="">— không đề xuất —</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {canManage && dangHoc && daPhanCong && (
            <p className="text-xs text-muted-foreground">
              Đào tạo đã phân công — muốn đổi phải qua Đào tạo.
            </p>
          )}

          {canAssignTeacher && dangHoc && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Phân công (Đào tạo)
              <select
                value={phanCongValue}
                onChange={(ev) => luuPhanCong(ev.target.value)}
                disabled={dangBan}
                aria-label={`Phân công giáo viên cho ${e.childName}`}
                className={O_SELECT}
              >
                <option value="">— chưa phân công —</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {/* Hàng 4 — dời lịch */}
      {canManage && dangHoc && (
        <div className="mt-2">
          {!moKhoiDoi ? (
            <button
              type="button"
              onClick={() => setMoKhoiDoi(true)}
              disabled={dangBan}
              className={O_NUT_PHU}
            >
              <CalendarClock className="h-3 w-3" />
              Dời lịch
            </button>
          ) : (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={toSessionId}
                  onChange={(ev) => setToSessionId(ev.target.value)}
                  disabled={dangBan || buoiDoiDuoc.length === 0}
                  aria-label={`Buổi muốn dời sang cho ${e.childName}`}
                  className={O_SELECT}
                >
                  <option value="">— chọn buổi mới —</option>
                  {buoiDoiDuoc.map((s) => (
                    <option key={s.id} value={s.id}>
                      {nhanBuoiDayDu(s)}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  value={lyDo}
                  onChange={(ev) => setLyDo(ev.target.value)}
                  disabled={dangBan}
                  placeholder="Lý do dời (PH vắng, PH xin dời…)"
                  aria-label={`Lý do dời lịch của ${e.childName}`}
                  className="min-w-[14rem] flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground disabled:opacity-50"
                />
              </div>

              {buoiDoiDuoc.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Lớp không còn buổi trống nào để dời sang.
                </p>
              ) : (
                <p className="mt-2 text-xs text-state-warning-ink">
                  Dời lịch sẽ GỠ phân công giáo viên của ca này và báo cho giáo viên đó.
                  Bạn đề xuất lại nếu muốn.
                </p>
              )}

              <div className="mt-2 flex items-center gap-2">
                {/* Chính nút này LÀ bước xác nhận (mở khối = nhịp một), nên không
                    cần thêm vòng xác nhận nào nữa. */}
                {buoiDoiDuoc.length > 0 && (
                  <button
                    type="button"
                    onClick={xacNhanDoi}
                    disabled={dangBan}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
                  >
                    Xác nhận dời
                  </button>
                )}
                <button
                  type="button"
                  onClick={dongKhoiDoi}
                  disabled={dangBan}
                  className={O_NUT_PHU}
                >
                  Huỷ
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
