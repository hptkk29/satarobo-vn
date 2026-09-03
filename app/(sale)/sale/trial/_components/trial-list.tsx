"use client";

import { useMemo, useState } from "react";
import type { SaleTrialStudent } from "@/lib/trial/sale-roster";

type SlotDto = {
  sessionId: string;
  trialClassName: string;
  /** ISO — server chuyển Date sang chuỗi để qua ranh giới máy chủ ↔ trình duyệt. */
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  students: SaleTrialStudent[];
};

/**
 * `@db.Date` lưu UTC 00:00 của ngày VN ⇒ format PHẢI ép `timeZone: "UTC"`.
 * Không ép là múi giờ máy người xem kéo ngày lùi một hôm.
 */
function nhanNgay(iso: string): string {
  const d = new Date(iso);
  const thu = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    timeZone: "UTC",
  }).format(d);
  const ngay = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
  return `${thu.charAt(0).toUpperCase()}${thu.slice(1)}, ${ngay}`;
}

const TRANG_THAI: Record<string, string> = {
  SCHEDULED: "Đã xếp lịch",
  COMPLETED: "Đã học xong",
  CANCELLED: "Đã huỷ",
};

export function SaleTrialList({
  slots,
  unassigned,
  laPhamViMacDinh = true,
}: {
  slots: SlotDto[];
  unassigned: (SaleTrialStudent & { trialClassName: string })[];
  /** Đang ở phạm vi "Sắp tới" — để khung rỗng chỉ đường sang "Đã diễn ra". */
  laPhamViMacDinh?: boolean;
}) {
  const [tim, setTim] = useState("");
  const [loc, setLoc] = useState<"tat-ca" | "chua-danh-gia" | "da-danh-gia" | "da-nhap-hoc">(
    "tat-ca",
  );

  const hopVoiLoc = useMemo(() => {
    const q = tim.trim().toLowerCase();
    return (s: SaleTrialStudent) => {
      if (q) {
        const trong = [s.studentName, s.parentName ?? "", s.courseName ?? ""]
          .join(" ")
          .toLowerCase();
        if (!trong.includes(q)) return false;
      }
      if (loc === "chua-danh-gia") return !s.evaluated;
      if (loc === "da-danh-gia") return s.evaluated;
      if (loc === "da-nhap-hoc") return s.enrolled;
      return true;
    };
  }, [tim, loc]);

  const theoNgay = useMemo(() => {
    const map = new Map<string, SlotDto[]>();
    for (const s of slots) {
      const loc2 = { ...s, students: s.students.filter(hopVoiLoc) };
      if (loc2.students.length === 0) continue;
      const key = s.date;
      map.set(key, [...(map.get(key) ?? []), loc2]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [slots, hopVoiLoc]);

  const unassignedLoc = unassigned.filter(hopVoiLoc);
  const rong = theoNgay.length === 0 && unassignedLoc.length === 0;

  const oNhap =
    "rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-3">
        <input
          className={`${oNhap} min-w-56 flex-1`}
          placeholder="Tìm theo tên bé, phụ huynh, khoá…"
          value={tim}
          onChange={(e) => setTim(e.target.value)}
        />
        <select
          className={oNhap}
          value={loc}
          onChange={(e) => setLoc(e.target.value as typeof loc)}
        >
          <option value="tat-ca">Tất cả</option>
          <option value="chua-danh-gia">Chưa có phiếu</option>
          <option value="da-danh-gia">Đã có phiếu</option>
          <option value="da-nhap-hoc">Đã nhập học</option>
        </select>
      </div>

      {rong ? (
        <div className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <p>Không có học viên trải nghiệm nào khớp bộ lọc.</p>
          {/* Phạm vi mặc định chỉ nhìn về TƯƠNG LAI, mà phiếu đánh giá thì luôn nằm ở
              buổi ĐÃ QUA — không chỉ đường thì người dùng kết luận "hệ thống mất phiếu". */}
          {laPhamViMacDinh && (
            <p className="mt-1">
              Phiếu đánh giá của giáo viên nằm ở buổi đã học — chọn{" "}
              <strong className="font-medium text-foreground">Đã diễn ra</strong> ở trên.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {theoNgay.map(([ngay, dsSlot]) => (
            <section key={ngay}>
              <div className="mb-3 flex items-baseline gap-3">
                <h2 className="text-base font-semibold">{nhanNgay(ngay)}</h2>
                <span className="text-xs text-muted-foreground">
                  {dsSlot.reduce((n, s) => n + s.students.length, 0)} học viên
                </span>
              </div>
              <div className="space-y-4">
                {dsSlot.map((s) => (
                  <BangKhungGio key={s.sessionId} slot={s} />
                ))}
              </div>
            </section>
          ))}

          {unassignedLoc.length > 0 && (
            <section>
              <h2 className="mb-1 text-base font-semibold">Chưa xếp buổi</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Đã vào lớp trải nghiệm nhưng chưa gắn buổi cụ thể — cần xếp buổi
                để phụ huynh biết đi lúc nào.
              </p>
              <BangHocVien students={unassignedLoc} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function BangKhungGio({ slot }: { slot: SlotDto }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-5 py-3">
        <span className="font-semibold">
          {slot.startTime}–{slot.endTime}
        </span>
        <span className="text-sm text-muted-foreground">{slot.trialClassName}</span>
        <span className="text-sm text-muted-foreground">
          {slot.students.length} học viên
        </span>
        <span className="ml-auto rounded-full bg-muted px-2.5 py-1 text-xs">
          {TRANG_THAI[slot.status] ?? slot.status}
        </span>
      </div>
      <BangHocVien students={slot.students} />
    </div>
  );
}

function BangHocVien({ students }: { students: SaleTrialStudent[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-5 py-2">Học viên</th>
            <th className="px-5 py-2">Phụ huynh</th>
            <th className="px-5 py-2">Khoá quan tâm</th>
            <th className="px-5 py-2">Phiếu đánh giá</th>
            <th className="px-5 py-2">Nhập học</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.enrollmentId} className="border-b border-border/60 last:border-0">
              <td className="px-5 py-3">
                <div className="font-medium">{s.studentName}</div>
                {s.birthYear && (
                  <div className="text-xs text-muted-foreground">Sinh {s.birthYear}</div>
                )}
              </td>
              <td className="px-5 py-3">
                <div>{s.parentName ?? "—"}</div>
                {s.parentPhone && (
                  <div className="text-xs text-muted-foreground">{s.parentPhone}</div>
                )}
              </td>
              <td className="px-5 py-3">{s.courseName ?? "—"}</td>
              <td className="px-5 py-3">
                {s.evaluated ? (
                  <a
                    href={`/sale/trial/pdf/${s.enrollmentId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
                  >
                    Xem / Xuất PDF
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Giáo viên chưa chấm
                  </span>
                )}
              </td>
              <td className="px-5 py-3">
                {s.enrolled ? (
                  <span className="rounded-full bg-state-success-soft px-2.5 py-1 text-xs font-medium text-state-success-ink">
                    Đã nhập học
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
