"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FlaskConical } from "lucide-react";
// GĐ6 — trỏ sang lớp action của màn "Lớp Trial". Đây là điểm bám CỨNG duy nhất từ
// ngoài vào thư mục màn cũ; quên dòng này khi gỡ màn cũ là build ĐỎ.
import { enrollLeadChildLopTrialAction } from "../../../lop-trial/_actions";

type TrialSession = {
  id: string;
  date: string; // ISO
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  seq: number;
};
type Child = {
  id: string;
  fullName: string;
  // LD3(a) — lớp trải nghiệm ĐANG học (ACTIVE) của con, null nếu chưa xếp.
  currentTrial: {
    classId: string;
    className: string;
    /** Lớp theo khung (mô hình case) — quyết định nghĩa của `session = null` bên dưới. */
    theoKhung: boolean;
    /**
     * Buổi/case đang được xếp riêng. `null` nghĩa là GÌ tuỳ loại lớp
     * (`lib/trial/nghia-null.ts`): lớp cũ = học TOÀN BỘ buổi (chốt 28/08); lớp theo
     * khung = CHƯA XẾP CASE.
     */
    session?: {
      seq: number;
      date: string;
      startTime: string;
      endTime: string;
      /** Case/buổi đã HUỶ — không phải lịch hẹn còn hiệu lực (bé "chưa xếp case"). */
      daHuy?: boolean;
    } | null;
  } | null;
};
type TrialClass = {
  id: string;
  name: string;
  code: string;
  /** `null` = KHÔNG giới hạn sĩ số (từ 28/08) — hiện "n" thay vì "n/cap". */
  capacity: number | null;
  used: number;
  /** Lớp theo khung (mô hình case, từ 22/09/2026) hay lớp slot cũ. */
  theoKhung: boolean;
  /**
   * Các buổi SCHEDULED. Lớp cũ: chỉ để hiển thị (xếp con là học CẢ LỚP, chốt 28/08).
   * Lớp theo khung: đây là các CASE — BẮT BUỘC chọn một khi xếp (23/09/2026).
   */
  sessions: TrialSession[];
};

function fmtSession(s: {
  seq: number;
  date: string;
  startTime: string;
  endTime: string;
}): string {
  const d = new Date(s.date).toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `Buổi ${s.seq} · ${d} ${s.startTime}–${s.endTime}`;
}

export function TrialEnrollWidget({
  children,
  openClasses,
  canOverride,
}: {
  children: Child[];
  openClasses: TrialClass[];
  canOverride: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Chọn lớp theo từng con. Khởi tạo SẴN bằng lớp con đang học: mở khối ra là thấy
  // ngay con đang ở lớp nào, và thao tác mặc định thành "sửa" chứ không phải "xếp mới".
  const [picked, setPicked] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      children.filter((c) => c.currentTrial).map((c) => [c.id, c.currentTrial!.classId]),
    ),
  );
  // Case đã chọn theo từng con — chỉ dùng khi lớp đã chọn là lớp THEO KHUNG.
  const [pickedCase, setPickedCase] = useState<Record<string, string>>({});
  const lopTheoId = new Map(openClasses.map((cl) => [cl.id, cl]));

  function enroll(childId: string, allowOverride: boolean) {
    const trialClassId = picked[childId];
    if (!trialClassId) {
      toast.error("Chọn lớp trải nghiệm trước");
      return;
    }
    // ~~KHÔNG gửi `sessionId`: xếp con vào lớp là con học TOÀN BỘ buổi của lớp đó (chốt
    // 28/08).~~ **[ĐẢO 23/09/2026 cho lớp THEO KHUNG]** Một lớp theo khung chứa nhiều
    // case song song của nhiều Sale; "học toàn bộ buổi" ở đó nghĩa là dự cả case của
    // người khác. Không gửi case thì bé rơi vào khối "Chưa xếp case" — đo được 23/09:
    // ô này là nguồn sinh bé "chưa xếp" MỚI mỗi ngày, trong khi banner của chính nó
    // vẫn in "học toàn bộ buổi của lớp". Lớp CŨ giữ nguyên hành vi 28/08.
    const lop = lopTheoId.get(trialClassId);
    const sessionId = lop?.theoKhung ? (pickedCase[childId] ?? "") : "";
    if (lop?.theoKhung && !sessionId) {
      toast.error("Lớp này chia theo case — chọn case (giờ) cho bé trước");
      return;
    }
    startTransition(async () => {
      const res = await enrollLeadChildLopTrialAction({
        trialClassId,
        leadChildId: childId,
        allowOverride,
        ...(sessionId ? { sessionId } : {}),
      });
      if (res.ok) {
        toast.success("Đã xếp con vào lớp trải nghiệm");
        router.refresh();
        return;
      }
      if (res.overCapacity && canOverride) {
        // QL được mời xác nhận vượt sĩ số.
        if (window.confirm(`${res.error}. Bạn có quyền vượt sĩ số — vẫn xếp?`)) {
          enroll(childId, true);
        }
        return;
      }
      toast.error(res.error ?? "Xếp chỗ thất bại");
    });
  }

  if (children.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          Xếp con vào lớp trải nghiệm
        </h2>
      </div>

      {openClasses.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa có lớp trải nghiệm đang mở (cùng cơ sở). Tạo lớp ở mục &quot;Lớp trải
          nghiệm&quot;.
        </p>
      ) : (
        <ul className="space-y-3">
          {children.map((c) => {
            const daXep = c.currentTrial !== null;
            return (
              <li
                key={c.id}
                className="rounded-lg bg-muted px-3 py-2"
              >
                {/* LD3(a) — banner lớp hiện tại của con */}
                <div className="mb-2 text-xs">
                  {c.currentTrial ? (
                    <span className="font-medium text-state-info-ink">
                      {c.fullName} đang học thử lớp {c.currentTrial.className}
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        ·{" "}
                        {/* 23/09 — case ĐÃ HUỶ không phải lịch hẹn: in nó như "xếp riêng
                            Buổi 3 · 15:30" là bảo Sale báo phụ huynh một giờ không còn diễn
                            ra (đo được). Hai ca "chưa có case" kèm LINK sang màn lớp — câu
                            bảo "mở màn lớp" mà không có đường đi thì người dùng phải tự tìm. */}
                        {c.currentTrial.session?.daHuy ? (
                          <>
                            case {c.currentTrial.session.startTime}–{c.currentTrial.session.endTime} đã
                            huỷ — chưa xếp case ·{" "}
                            <a
                              href={`/lop-trial/${c.currentTrial.classId}`}
                              className="font-semibold text-primary underline"
                            >
                              mở màn lớp để xếp lại
                            </a>
                          </>
                        ) : c.currentTrial.session ? (
                          `xếp riêng ${fmtSession(c.currentTrial.session)}`
                        ) : c.currentTrial.theoKhung ? (
                          <>
                            chưa xếp case ·{" "}
                            <a
                              href={`/lop-trial/${c.currentTrial.classId}`}
                              className="font-semibold text-primary underline"
                            >
                              mở màn lớp để xếp
                            </a>
                          </>
                        ) : (
                          "học toàn bộ buổi của lớp"
                        )}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {c.fullName}: Chưa xếp lớp
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-[7rem] flex-1 text-sm font-medium text-foreground">
                    {c.fullName}
                  </span>
                  <select
                    value={picked[c.id] ?? ""}
                    onChange={(e) =>
                      setPicked((p) => ({ ...p, [c.id]: e.target.value }))
                    }
                    disabled={pending}
                    className="min-w-[12rem] flex-1 rounded-md border border-border px-2 py-1.5 text-sm disabled:opacity-50"
                  >
                    <option value="">— chọn lớp —</option>
                    {/* Lớp con ĐANG học có thể đã đầy hoặc đã đóng nên không nằm trong
                        `openClasses`; thiếu dòng này thì <select> không khớp value và
                        hiện TRỐNG, trông như con chưa được xếp lớp nào. */}
                    {c.currentTrial &&
                      !openClasses.some((cl) => cl.id === c.currentTrial!.classId) && (
                        <option value={c.currentTrial.classId}>
                          {c.currentTrial.className} (đang học)
                        </option>
                      )}
                    {openClasses.map((cl) => (
                      <option key={cl.id} value={cl.id}>
                        {cl.name} ({cl.used}
                        {cl.capacity === null ? "" : `/${cl.capacity}`})
                      </option>
                    ))}
                  </select>
                  {(() => {
                    const lop = picked[c.id] ? lopTheoId.get(picked[c.id]!) : undefined;
                    if (!lop?.theoKhung) return null;
                    // 23/09 — bé ĐÃ Ở chính lớp này: đổi case là việc của màn lớp (có luật chuyển
                    // case + báo giáo viên). Bày ô case + nút "Sửa lớp" ở đây là hứa suông —
                    // server luôn trả "đang ở lớp trải nghiệm khác" vì bé đã có ghi danh ACTIVE.
                    if (c.currentTrial?.classId === lop.id) {
                      return (
                        <a
                          href={`/lop-trial/${lop.id}`}
                          className="text-xs font-semibold text-primary underline"
                        >
                          Mở màn lớp để xếp / đổi case
                        </a>
                      );
                    }
                    if (lop.sessions.length === 0) {
                      return (
                        <span role="note" className="text-xs text-state-warning-ink">
                          Lớp chưa có case nào —{" "}
                          <a href={`/lop-trial/${lop.id}`} className="font-semibold underline">
                            mở lớp để thêm case
                          </a>
                        </span>
                      );
                    }
                    return (
                      <select
                        value={pickedCase[c.id] ?? ""}
                        onChange={(e) =>
                          setPickedCase((p) => ({ ...p, [c.id]: e.target.value }))
                        }
                        disabled={pending}
                        aria-label={`Chọn case cho ${c.fullName}`}
                        className="min-w-[9rem] rounded-md border border-border px-2 py-1.5 text-sm disabled:opacity-50"
                      >
                        <option value="">— chọn case —</option>
                        {lop.sessions.map((se) => (
                          <option key={se.id} value={se.id}>
                            {se.startTime}–{se.endTime}
                          </option>
                        ))}
                      </select>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => enroll(c.id, false)}
                    disabled={
                      pending ||
                      !picked[c.id] ||
                      Boolean(lopTheoId.get(picked[c.id] ?? "")?.theoKhung && !pickedCase[c.id]) ||
                      // Cùng lớp theo khung ⇒ đổi case ở màn lớp (link bên cạnh), không ở đây.
                      Boolean(
                        lopTheoId.get(picked[c.id] ?? "")?.theoKhung &&
                          c.currentTrial?.classId === picked[c.id],
                      )
                    }
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
                  >
                    {daXep ? "Sửa lớp" : "Xếp vào lớp"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
