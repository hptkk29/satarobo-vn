"use client";

// BẢNG CASE TRẢI NGHIỆM — vỏ của màn chi tiết lớp.
//
// ── ĐỔI HÌNH 23/09/2026 ─────────────────────────────────────────────────────────────
// Màn cũ chia ba khối rời: "Thêm buổi học" · "Học viên" (danh sách PHẲNG cấp lớp) ·
// "Buổi học & điểm danh". Hình đó giấu mất đúng quan hệ mà người dùng cần: **case nào
// có ai**. Muốn biết, họ phải bấm từng chip buổi rồi đọc lại bảng.
//
// Nay màn có MỘT trục: khung lớp → các case trong khung → học viên trong từng case.
// Mỗi case là một đơn vị công việc trọn vẹn của MỘT Sale: giờ, phòng, giáo viên, danh
// sách bé, điểm danh, gắn/gỡ — tất cả trong một chỗ, không phải đi ba khối.
//
// ── QUYỀN HIỆN RA THÀNH CHỮ, KHÔNG THÀNH NÚT BIẾN MẤT ───────────────────────────────
// Nhiều Sale dùng chung một màn. Nút "Xoá case" của người khác KHÔNG bị ẩn — nó hiện,
// bị khoá, và nói thẳng vì sao (luật 12). Ẩn đi thì người dùng tưởng chức năng không tồn
// tại; để bấm rồi mới báo lỗi thì bắt họ trả giá bằng một cú bấm để biết một điều màn
// hình đã biết sẵn. Mọi câu chữ ở đây do server tính (`lib/trial/quyen-case.ts`) và
// truyền xuống nguyên văn — client KHÔNG tự suy lại.

import type { JSX } from "react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Clock, Lock, Plus, UserMinus, Users } from "lucide-react";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { laChuaXepCase, laHocCaLop, thuocCase } from "@/lib/trial/nghia-null";
import { AttendanceBoard } from "./attendance-board";
import { EnrollPanel } from "./enroll-panel";
import { ThanhKhungGio } from "./thanh-khung-gio";
import { AddSessionForm } from "./add-session-form";
import { unenrollLeadChildLopTrialAction, xepCaseHocVienAction } from "../_actions";
import type { CheDoChonGv } from "../_lib/che-do-gv";
import type { EnrollmentRow, Option, RoomOption, SessionRow } from "../_lib/types";

/** Tên người, hoặc một câu tự khai là không tra được — KHÔNG để ô trống. */
function tenHoac(x: string | null, thay: string): string {
  const t = (x ?? "").trim();
  return t || thay;
}

export function BangCase({
  trialClassId,
  khungLop,
  ngayLop,
  sessions,
  enrollments,
  teachers,
  rooms,
  meId,
  canMark,
  canManage,
  canOverride,
  canThemCase,
  full,
  maxSessions,
  cheDoChonGv,
  locGvTheoCa,
  soGvMienLoc,
  lopDaKetThuc,
}: {
  trialClassId: string;
  khungLop: { startTime: string; endTime: string } | null;
  ngayLop: string | null;
  sessions: SessionRow[];
  enrollments: EnrollmentRow[];
  teachers: Option[];
  rooms: RoomOption[];
  meId: string;
  canMark: boolean;
  canManage: boolean;
  canOverride: boolean;
  /** `trials:manage` — ai cũng thêm được case của mình vào lớp đang mở. */
  canThemCase: boolean;
  full: boolean;
  maxSessions: number;
  cheDoChonGv: CheDoChonGv;
  locGvTheoCa: boolean;
  soGvMienLoc: number;
  /**
   * Lớp đã COMPLETED/CANCELLED. Bắt buộc (luật 7): thiếu nó thì ô thêm case / thêm học
   * viên vẫn hiện trên lớp đã huỷ, và gắn vào là sinh lại ghi danh ACTIVE trong lớp
   * đã huỷ (server nay từ chối — nút phải nói trước chứ không đợi bị từ chối).
   */
  lopDaKetThuc: boolean;
}): JSX.Element {
  const router = useRouter();
  // Nghĩa của `scheduledSessionId = NULL` theo loại lớp — `lib/trial/nghia-null.ts`.
  // `khungLop` do trang dựng từ ĐÚNG hai cột `startTime`+`endTime` nên null ⇔ lớp cũ.
  const lopTheoKhung = khungLop !== null;
  const [pending, startTransition] = useTransition();
  // Mở sẵn case đầu tiên còn SCHEDULED: người vào màn này gần như luôn để làm việc với
  // case sắp diễn ra, không phải để xem lại case đã đóng.
  const [dangMo, setDangMo] = useState<string | null>(
    () => (sessions.find((s) => s.status === "SCHEDULED") ?? sessions[0])?.id ?? null,
  );
  const [moThemCase, setMoThemCase] = useState(false);

  const tenGv = useMemo(() => new Map(teachers.map((t) => [t.id, t.name])), [teachers]);
  const tenPhong = useMemo(() => new Map(rooms.map((r) => [r.id, r.name])), [rooms]);

  /**
   * Bé còn học nhưng không có case SỐNG nào để điểm danh: NULL ở lớp theo khung, hoặc
   * trỏ vào một case ĐÃ HUỶ (ở mọi loại lớp). Luật ở `laChuaXepCase`.
   *
   * ~~chỉ `scheduledSessionId === null`~~ **[SỬA 23/09/2026]** thiếu vế "case đã huỷ":
   * huỷ case không đụng ghi danh, nên bé kẹt trong thẻ case đã huỷ — không khối nào
   * nhận, không ô nào để chuyển đi, trong khi chính chú thích này hứa bé về đây.
   */
  const idCaseDaHuy = useMemo(
    () => new Set(sessions.filter((s) => s.status === "CANCELLED").map((s) => s.id)),
    [sessions],
  );
  const chuaXep = useMemo(
    () => enrollments.filter((e) => laChuaXepCase(e, lopTheoKhung, idCaseDaHuy)),
    [enrollments, lopTheoKhung, idCaseDaHuy],
  );
  /**
   * Bé HỌC CẢ LỚP — chỉ có ở lớp slot cũ (chốt 28/08). Liệt kê MỘT lần ở khối riêng, vì
   * nhân bản vào bảng gỡ của từng buổi là N nút gỡ cho cùng một bé.
   */
  const hocCaLop = useMemo(
    () =>
      enrollments.filter(
        (e) => (e.status === "ACTIVE" || e.status === "COMPLETED") && laHocCaLop(e, lopTheoKhung),
      ),
    [enrollments, lopTheoKhung],
  );

  /**
   * Số bé ĐI HỌC case này — theo `thuocCase`, cùng tập mà bảng điểm danh vẽ.
   *
   * Case ĐÃ HUỶ đếm 0: bé còn học đã sang khối "Chưa xếp case". Đếm cả ở đầu thẻ case
   * huỷ là một bé hai chỗ, và tổng các ô lệch sĩ số của lớp (đo được 23/09: 9 vs 8).
   */
  function demTrongCase(sessionId: string): number {
    if (idCaseDaHuy.has(sessionId)) return 0;
    return enrollments.filter(
      (e) => e.status === "ACTIVE" && thuocCase(e, sessionId, lopTheoKhung),
    ).length;
  }

  function xepVaoCase(trialEnrollmentId: string, toSessionId: string) {
    startTransition(async () => {
      const res = await xepCaseHocVienAction({
        trialClassId,
        trialEnrollmentId,
        toSessionId,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Đã xếp học viên vào case");
      setDangMo(toSessionId);
      router.refresh();
    });
  }

  function go(e: EnrollmentRow) {
    if (!e.quyenGo.duoc) {
      toast.error(e.quyenGo.lyDo);
      return;
    }
    if (!e.leadChildId) {
      toast.error("Ca này không còn hồ sơ lead — nhờ Quản lý cơ sở gỡ hộ.");
      return;
    }
    const leadChildId = e.leadChildId;
    startTransition(async () => {
      const res = await unenrollLeadChildLopTrialAction({ trialClassId, leadChildId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Đã gỡ ${e.childName} khỏi lớp`);
      router.refresh();
    });
  }

  const caseConSong = sessions.filter((s) => s.status !== "CANCELLED");

  return (
    <div className="space-y-4">
      <ThanhKhungGio
        khung={khungLop}
        oCase={caseConSong.map((s) => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          cuaToi: s.createdById === meId,
          daHuy: false,
          soHocVien: demTrongCase(s.id),
          nguoiTao: s.nguoiTao,
        }))}
        dangMo={dangMo}
        onChon={(id) => setDangMo((cu) => (cu === id ? null : id))}
      />

      {/* ── Thêm case ─────────────────────────────────────────────────────────────── */}
      {canThemCase && !lopDaKetThuc && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Case trải nghiệm</h2>
            <button
              type="button"
              onClick={() => setMoThemCase((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft"
            >
              <Plus className="h-3.5 w-3.5" />
              {moThemCase ? "Đóng" : "Thêm case trial"}
            </button>
          </div>

          {/* Ràng buộc khung giờ nói TRƯỚC khi người dùng gõ, không đợi server từ chối. */}
          {khungLop ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Lớp mở{" "}
              <strong className="tabular-nums text-foreground">
                {khungLop.startTime}–{khungLop.endTime}
              </strong>
              {ngayLop ? <> ngày {ngayLop}</> : null}. Case phải nằm trọn trong khung này —
              cần khung khác thì nhờ Quản lý cơ sở mở thêm lớp.
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Lớp này tạo trước 22/09/2026 nên không có khung giờ cố định — case đặt giờ tự do.
            </p>
          )}

          {moThemCase && (
            <div className="mt-3">
              <AddSessionForm
                trialClassId={trialClassId}
                teachers={teachers}
                rooms={rooms}
                defaultStartTime={khungLop?.startTime ?? "18:00"}
                defaultEndTime={khungLop?.endTime ?? "19:30"}
                cheDoChonGv={cheDoChonGv}
                locGvTheoCa={locGvTheoCa}
                soGvMienLoc={soGvMienLoc}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Chưa xếp case ─────────────────────────────────────────────────────────── */}
      {chuaXep.length > 0 && (
        <section className="rounded-xl border border-state-warning ring-1 ring-state-warning-soft">
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold text-foreground">
              Chưa xếp case ({chuaXep.length})
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Các bé đã ở trong lớp nhưng chưa thuộc case nào, nên chưa ai điểm danh được.
              Chọn case để xếp vào.
            </p>
          </div>
          {/* Bo góc ở vỏ NGOÀI, cuộn ở lớp TRONG: một thẻ vừa `overflow-x-auto` vừa
              `rounded-*` sẽ vạt mất góc khi kéo ngang.

              CÓ phân trang ở khối này và KHÔNG có ở bảng học viên trong từng case —
              khác nhau có chủ đích: số dòng ở đây là TỒN ĐỌNG (bé cũ chưa ai xếp, bé
              vừa bị huỷ case) nên không có trần, còn bảng trong case bị chặn bởi sức
              chứa một case trải nghiệm (thực tế 1–6 bé) — cùng lý do đã khai cho
              `app/(sale)/sale/trial/_components/trial-list.tsx` trong MIEN_TRU.

              ⚠️ Cổng `bang-coverage` đếm theo TỆP chứ không theo từng `<table>`, nên
              một thẻ `<PhanTrangBang>` ở đây làm cả tệp qua cửa. Nói ra để người sau
              biết bảng kia KHÔNG được cổng nào canh, chứ không phải nó đã qua. */}
          <PhanTrangBang khoaGhiNho="lop-trial-chua-xep-case" tenDonVi="học viên">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="whitespace-nowrap px-5 py-3.5 font-semibold">Học viên</th>
                  <th className="whitespace-nowrap px-5 py-3.5 font-semibold">Phụ huynh</th>
                  <th className="whitespace-nowrap px-5 py-3.5 font-semibold">Sale</th>
                  <th className="whitespace-nowrap px-5 py-3.5 font-semibold">Xếp vào case</th>
                  <th className="whitespace-nowrap px-5 py-3.5 text-right font-semibold">Gỡ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {chuaXep.map((e) => (
                  <tr key={e.id} className="transition-colors hover:bg-muted">
                    <td className="whitespace-nowrap px-5 py-3.5 font-medium text-foreground">
                      {e.childName}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-muted-foreground">
                      {tenHoac(e.parentName, "—")}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-muted-foreground">
                      {tenHoac(e.saleTen, "chưa ai phụ trách")}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      {caseConSong.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          Lớp chưa có case nào
                        </span>
                      ) : (
                        <select
                          value=""
                          disabled={pending || !e.quyenChuyen.duoc || lopDaKetThuc}
                          title={
                            lopDaKetThuc
                              ? "Lớp đã kết thúc — không xếp case được nữa"
                              : e.quyenChuyen.duoc
                                ? undefined
                                : e.quyenChuyen.lyDo
                          }
                          onChange={(ev) => {
                            if (ev.target.value) xepVaoCase(e.id, ev.target.value);
                          }}
                          aria-label={`Xếp ${e.childName} vào case`}
                          className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <option value="">Chọn case…</option>
                          {caseConSong
                            .filter((s) => s.status === "SCHEDULED")
                            .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.startTime}–{s.endTime} ·{" "}
                              {tenHoac(tenGv.get(s.teacherId ?? "") ?? null, "chưa có GV")}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right">
                      <NutGo row={e} pending={pending} onGo={() => go(e)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </PhanTrangBang>
        </section>
      )}

      {/* ── Học cả lớp (chỉ lớp slot cũ) ──────────────────────────────────────────────
          Chốt 28/08: ở lớp slot cũ, bé xếp vào lớp mà không ghim buổi là học MỌI buổi.
          Bé đó hiện trong bảng điểm danh của từng buổi (như trước), còn ở đây liệt kê
          MỘT lần để gỡ — thay vì N nút gỡ cho cùng một bé ở N buổi. */}
      {hocCaLop.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold text-foreground">
              Học cả lớp ({hocCaLop.length})
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Lớp này mở trước khi có khung giờ, nên các bé dưới đây học mọi buổi của lớp
              và có mặt trong bảng điểm danh của từng buổi.
            </p>
          </div>
          <PhanTrangBang khoaGhiNho="lop-trial-hoc-ca-lop" tenDonVi="học viên">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="whitespace-nowrap px-5 py-3.5 font-semibold">Học viên</th>
                  <th className="whitespace-nowrap px-5 py-3.5 font-semibold">Phụ huynh</th>
                  <th className="whitespace-nowrap px-5 py-3.5 font-semibold">Sale</th>
                  <th className="whitespace-nowrap px-5 py-3.5 font-semibold">Trạng thái</th>
                  <th className="whitespace-nowrap px-5 py-3.5 text-right font-semibold">Gỡ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {hocCaLop.map((e) => (
                  <tr key={e.id} className="transition-colors hover:bg-muted">
                    <td className="whitespace-nowrap px-5 py-3.5 font-medium text-foreground">
                      {e.childName}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-muted-foreground">
                      {tenHoac(e.parentName, "—")}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-muted-foreground">
                      {tenHoac(e.saleTen, "chưa ai phụ trách")}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <NhanTrangThaiGhiDanh status={e.status} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right">
                      <NutGo row={e} pending={pending} onGo={() => go(e)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </PhanTrangBang>
        </section>
      )}

      {/* ── Các case ──────────────────────────────────────────────────────────────── */}
      {sessions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-5 py-10 text-center">
          <Clock className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">Lớp chưa có case nào</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {canThemCase
              ? 'Bấm "Thêm case trial" ở trên để đặt giờ, phòng và giáo viên. Có case rồi mới xếp được học viên và điểm danh.'
              : "Bạn chưa có quyền thêm case trong lớp này — nhờ Quản lý cơ sở hoặc Đào tạo mở case."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <TheCase
              key={s.id}
              s={s}
              mo={dangMo === s.id}
              onMo={() => setDangMo((cu) => (cu === s.id ? null : s.id))}
              soHocVien={demTrongCase(s.id)}
              tenGv={tenHoac(tenGv.get(s.teacherId ?? "") ?? null, "chưa có GV")}
              tenPhong={tenHoac(tenPhong.get(s.roomId ?? "") ?? null, "chưa có phòng")}
              cuaToi={s.createdById === meId}
              trialClassId={trialClassId}
              enrollments={enrollments}
              teachers={teachers}
              rooms={rooms}
              canMark={canMark}
              canManage={canManage}
              canOverride={canOverride}
              full={full}
              maxSessions={maxSessions}
              cheDoChonGv={cheDoChonGv}
              locGvTheoCa={locGvTheoCa}
              soGvMienLoc={soGvMienLoc}
              pending={pending}
              onGo={go}
              lopTheoKhung={lopTheoKhung}
              ngayLop={ngayLop}
              khungLop={khungLop}
              lopDaKetThuc={lopDaKetThuc}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Trạng thái ghi danh bằng CHỮ — không mã hoá trạng thái chỉ bằng màu. */
function NhanTrangThaiGhiDanh({ status }: { status: EnrollmentRow["status"] }): JSX.Element {
  if (status === "COMPLETED") {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full bg-state-success-soft px-2 py-0.5 text-[11px] font-semibold text-state-success-ink">
        Đã học xong
      </span>
    );
  }
  if (status === "WITHDRAWN") {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
        Đã rút
      </span>
    );
  }
  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-state-info-soft px-2 py-0.5 text-[11px] font-semibold text-state-info-ink">
      Đang học thử
    </span>
  );
}

/**
 * Nút gỡ một học viên.
 *
 * Không có quyền thì nút VẪN HIỆN, đổi sang hình khoá và mang `title` là lý do. Đây là
 * chỗ luật 12 áp dụng rõ nhất trên màn này: ẩn nút đi thì Sale 1 tưởng hệ thống không
 * cho gỡ ai cả, và sẽ đi hỏi người khác một câu mà màn hình trả lời được.
 */
function NutGo({
  row,
  pending,
  onGo,
}: {
  row: EnrollmentRow;
  pending: boolean;
  onGo: () => void;
}): JSX.Element {
  const duoc = row.quyenGo.duoc;
  return (
    <button
      type="button"
      onClick={onGo}
      disabled={pending || !duoc}
      title={duoc ? `Gỡ ${row.childName} khỏi lớp` : row.quyenGo.lyDo}
      aria-label={duoc ? `Gỡ ${row.childName} khỏi lớp` : `Không gỡ được: ${row.quyenGo.lyDo}`}
      className={[
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold ring-1 transition-colors",
        duoc
          ? "text-state-danger-ink ring-state-danger-soft hover:bg-state-danger-soft"
          : "cursor-not-allowed text-muted-foreground ring-border",
      ].join(" ")}
    >
      {duoc ? <UserMinus className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
      Gỡ
    </button>
  );
}

function TheCase({
  s,
  mo,
  onMo,
  soHocVien,
  tenGv,
  tenPhong,
  cuaToi,
  trialClassId,
  enrollments,
  teachers,
  rooms,
  canMark,
  canManage,
  canOverride,
  full,
  maxSessions,
  cheDoChonGv,
  locGvTheoCa,
  soGvMienLoc,
  pending,
  onGo,
  lopTheoKhung,
  ngayLop,
  khungLop,
  lopDaKetThuc,
}: {
  s: SessionRow;
  mo: boolean;
  onMo: () => void;
  soHocVien: number;
  tenGv: string;
  tenPhong: string;
  cuaToi: boolean;
  trialClassId: string;
  enrollments: EnrollmentRow[];
  teachers: Option[];
  rooms: RoomOption[];
  canMark: boolean;
  canManage: boolean;
  canOverride: boolean;
  full: boolean;
  maxSessions: number;
  cheDoChonGv: CheDoChonGv;
  locGvTheoCa: boolean;
  soGvMienLoc: number;
  pending: boolean;
  onGo: (e: EnrollmentRow) => void;
  lopTheoKhung: boolean;
  ngayLop: string | null;
  khungLop: { startTime: string; endTime: string } | null;
  lopDaKetThuc: boolean;
}): JSX.Element {
  const daHuy = s.status === "CANCELLED";
  // Bảng gỡ của case: chỉ bé GHIM vào case này (bé "học cả lớp" ở lớp cũ có khối riêng).
  // Case ĐÃ HUỶ: bé còn học đã sang khối "Chưa xếp case"; ở đây chỉ còn bé đã học xong,
  // như một dòng lịch sử — liệt kê bé ACTIVE ở cả hai chỗ là hai nút gỡ cho một bé.
  const trongCase = enrollments.filter(
    (e) =>
      e.scheduledSessionId === s.id &&
      (daHuy ? e.status === "COMPLETED" : e.status === "ACTIVE" || e.status === "COMPLETED"),
  );

  return (
    <section
      className={[
        "overflow-hidden rounded-xl border bg-card transition-colors",
        daHuy ? "border-border opacity-70" : cuaToi ? "border-primary" : "border-border",
      ].join(" ")}
    >
      {/* Đầu case là một NÚT trọn hàng: vùng bấm lớn, và trên điện thoại không phải trỏ
          trúng đúng cái mũi tên 16px. */}
      <button
        type="button"
        onClick={onMo}
        aria-expanded={mo}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3.5 text-left transition-colors hover:bg-muted"
      >
        <span className="whitespace-nowrap text-sm font-bold tabular-nums text-foreground">
          {s.startTime}–{s.endTime}
        </span>

        {cuaToi && (
          <span className="inline-flex whitespace-nowrap rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary-ink">
            Case của tôi
          </span>
        )}
        {daHuy && (
          <span className="inline-flex whitespace-nowrap rounded-full bg-state-danger-soft px-2 py-0.5 text-[11px] font-semibold text-state-danger-ink">
            Đã huỷ
          </span>
        )}
        {s.status === "COMPLETED" && (
          <span className="inline-flex whitespace-nowrap rounded-full bg-state-success-soft px-2 py-0.5 text-[11px] font-semibold text-state-success-ink">
            Đã xong
          </span>
        )}

        {/* `min-w-0` + `truncate` để tên giáo viên và tên phòng dài không đẩy vỡ hàng. */}
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {tenGv} · {tenPhong} ·{" "}
          {s.nguoiTao ? `mở bởi ${s.nguoiTao}` : "không rõ người mở (case cũ)"}
        </span>

        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-foreground">
          <Users className="h-3.5 w-3.5" />
          <span className="tabular-nums">{soHocVien}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${mo ? "rotate-180" : ""}`}
        />
      </button>

      {mo && (
        <div className="space-y-4 border-t border-border p-4">
          {/* Bảng điểm danh của ĐÚNG case này. `goiTat` bỏ vỏ thẻ + tiêu đề + dãy chip
              chọn buổi — vỏ và tiêu đề đã có ở đầu case ngay trên. */}
          <AttendanceBoard
            trialClassId={trialClassId}
            sessions={[s]}
            enrollments={enrollments}
            canMark={canMark}
            canManage={canManage}
            teachers={teachers}
            rooms={rooms}
            cheDoChonGv={cheDoChonGv}
            locGvTheoCa={locGvTheoCa}
            soGvMienLoc={soGvMienLoc}
            goiTat
            lopTheoKhung={lopTheoKhung}
            ngayLop={ngayLop}
            khungLop={khungLop}
          />

          {/* Gỡ từng bé — đặt NGAY trong case, không phải ở một danh sách phẳng cách đó
              hai khối. Cột "Sale" nói bé thuộc ai, nên nút khoá không phải câu đố. */}
          {trongCase.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Học viên</th>
                      <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Phụ huynh</th>
                      <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Sale</th>
                      <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Trạng thái</th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">
                        Gỡ khỏi lớp
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trongCase.map((e) => (
                      <tr key={e.id} className="transition-colors hover:bg-muted">
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium text-foreground">
                          {e.childName}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                          {tenHoac(e.parentName, "—")}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                          {tenHoac(e.saleTen, "chưa ai phụ trách")}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <NhanTrangThaiGhiDanh status={e.status} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          <NutGo row={e} pending={pending} onGo={() => onGo(e)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 23/09 — chỉ case SCHEDULED của lớp CHƯA kết thúc (khớp cổng server ở
              `enrollLeadChild`). Bản cũ ẩn mỗi case đã huỷ: case đã xong vẫn nhận bé, lớp
              đã huỷ vẫn nhận bé. */}
          {s.status === "SCHEDULED" && !lopDaKetThuc && canManage && (
            <div className="rounded-lg border border-dashed border-border p-3">
              <EnrollPanel
                trialClassId={trialClassId}
                sessionId={s.id}
                canManage={canManage}
                canOverride={canOverride}
                full={full}
                maxSessions={maxSessions}
                nhan={`Thêm học viên vào case ${s.startTime}–${s.endTime}`}
              />
              {trongCase.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Case này chưa có học viên nào. Chỉ tìm được con thuộc lead bạn phụ trách —
                  khách của Sale khác thì chính họ xếp vào đây.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
