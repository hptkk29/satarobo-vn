// lib/cham-cong/noi-quy.ts — thống kê chấm công tháng theo NỘI QUY: số ca thực tế, số lần
// đi trễ, số ngày nghỉ không phép, và % bị trừ.
//
// THUẦN — không `@/lib/db`, không `next/*`. Nhận vào những dòng công ngày đã đọc sẵn rồi trả
// về con số; nhờ vậy luật đếm test được mà không cần Postgres, và chỉ có MỘT nơi giữ luật.
//
// ── Bốn chốt của chủ dự án (06/09/2026) ─────────────────────────────────────────────────
//  1. "Số ca thực tế" = ngày công có ĐỦ CẢ mốc vào LẪN mốc ra. Thiếu một mốc là không tính
//     ca đó, dù người ta có đi làm thật. Đây là lựa chọn siết kỷ luật quét, và hệ quả đã
//     được báo trước: ~7% ngày hiện chỉ có mốc vào sẽ rơi ra, kéo theo đơn chỉnh công.
//  2. "1 lần trễ" tính từ phút thứ 15 (`shift.latePenaltyGraceMinutes`).
//  3. "Nghỉ không phép" CHỈ tính khi quản lý đã xác nhận từng ngày — không suy tự động từ cờ
//     `KHONG_CO_LUOT`, vì cờ đó còn do quên quét, quầy hỏng, đi công tác.
//  4. Mức trừ: mỗi lần trễ 0,5% · mỗi ngày nghỉ không phép 2%. Cả ba số đều là tham số vận
//     hành, sửa ở màn Cấu hình vận hành.
//
// ── Vì sao KHÔNG lấy thẳng `dayCreditEarned` làm "ca thực tế" ────────────────────────────
// `engine.ts` gán cứng `dayCreditEarned = dayCreditExpected` (luật T-01: công đếm theo KẾ
// HOẠCH, engine không tự trừ). Lấy hai cột đó chia nhau thì bảng ra 100% cho mọi người, mọi
// tháng — vô nghĩa đúng chỗ nó phải có nghĩa. Nên "ca thực tế" là một đại lượng RIÊNG, đếm
// từ bằng chứng có mặt, và CỐ Ý không đụng tới cột công dùng để trả lương.
import type { AttendanceAbsenceStatus } from "@prisma/client";

/** Mức trừ và ngưỡng — đọc từ `getSetting`, truyền vào để hàm này ở thuần. */
export type NoiQuyRules = {
  /** Trễ quá bao nhiêu phút thì tính 1 lần. */
  latePenaltyGraceMinutes: number;
  /** % trừ mỗi lần trễ. */
  penaltyLatePercent: number;
  /** % trừ mỗi ngày nghỉ không phép. */
  penaltyAbsentPercent: number;
};

export const NOI_QUY_MAC_DINH: NoiQuyRules = {
  latePenaltyGraceMinutes: 15,
  penaltyLatePercent: 0.5,
  penaltyAbsentPercent: 2,
};

/** Một dòng công ngày, rút gọn còn đúng phần luật nội quy cần. */
export type NgayCong = {
  dayType: string;
  /** Ca kế hoạch của ngày (0 với ngày nghỉ). */
  dayCreditExpected: number;
  /** Phút đến muộn thô ở đoạn đầu ca — KHÔNG chịu dung sai gắn cờ. */
  arrivalDeltaMinutes: number;
  /** Mốc quét đã ghép cặp, do engine dựng. */
  pairs: unknown;
  flags: string[];
  absenceStatus: AttendanceAbsenceStatus | null;
};

export type ThongKeNguoi = {
  /** Ca kế hoạch cả kỳ — mẫu số. */
  caQuyDinh: number;
  /** Ca có đủ cả mốc vào lẫn mốc ra — tử số. */
  caThucTe: number;
  /** Số ngày trễ quá ngưỡng. */
  soLanTre: number;
  /** Ngày quản lý đã xác nhận là nghỉ không phép. */
  ngayKhongPhep: number;
  /** Ngày vắng mà CHƯA ai kết luận — việc còn phải làm, không phải tiền phạt. */
  ngayChoKetLuan: number;
  /** Tổng % bị trừ, đã làm tròn 2 chữ số. */
  phanTramTru: number;
};

/**
 * Ngày này có ĐỦ cả mốc vào lẫn mốc ra chưa.
 *
 * Đọc `pairs` do `pairLogs` (engine) ghép: mỗi phần tử là `{inId, outId, start, end, open}`,
 * và `open: false` nghĩa là cặp ĐÃ ĐÓNG — có cả lượt vào lẫn lượt ra. Lượt vào không có lượt
 * ra vẫn được giữ trong mảng với `open: true` (kèm cờ THIEU_LUOT_RA), nên chỉ đếm số phần tử
 * là sai hẳn.
 *
 * `pairs` lưu ở cột Json nên soi kiểu tại chỗ, không tin vào khai báo.
 */
export function coDuVaoRa(pairs: unknown): boolean {
  if (!Array.isArray(pairs)) return false;
  return pairs.some((p) => {
    if (!p || typeof p !== "object") return false;
    const o = p as Record<string, unknown>;
    return o.open === false && typeof o.inId === "string" && typeof o.outId === "string";
  });
}

/** Ngày có ca kế hoạch và thuộc diện phải đi làm. */
function laNgayLamViec(d: NgayCong): boolean {
  return d.dayType === "WORK" && d.dayCreditExpected > 0;
}

export function thongKeNguoi(days: readonly NgayCong[], rules: NoiQuyRules): ThongKeNguoi {
  let caQuyDinh = 0;
  let caThucTe = 0;
  let soLanTre = 0;
  let ngayKhongPhep = 0;
  let ngayChoKetLuan = 0;

  for (const d of days) {
    // Ngày quản lý đã kết luận "có lý do" thì ra khỏi mọi phép đếm phạt, kể cả khi không có
    // mốc quét nào — đó chính là ý nghĩa của việc xác nhận.
    if (d.absenceStatus === "EXCUSED") {
      if (laNgayLamViec(d)) caQuyDinh += d.dayCreditExpected;
      continue;
    }
    if (d.absenceStatus === "UNAUTHORISED") {
      if (laNgayLamViec(d)) caQuyDinh += d.dayCreditExpected;
      ngayKhongPhep += 1;
      continue;
    }
    if (!laNgayLamViec(d)) continue;

    caQuyDinh += d.dayCreditExpected;
    if (coDuVaoRa(d.pairs)) {
      caThucTe += d.dayCreditExpected;
      if (d.arrivalDeltaMinutes > rules.latePenaltyGraceMinutes) soLanTre += 1;
    } else {
      // Có ca mà không đủ mốc: nếu KHÔNG có lượt nào thì đây là ngày vắng chờ quản lý kết
      // luận. Còn thiếu MỘT mốc (quên quét ra) thì người ta có đi làm — mất ca thực tế theo
      // chốt của chủ dự án, nhưng KHÔNG phải nghi vấn nghỉ không phép.
      if (d.flags.includes("KHONG_CO_LUOT")) ngayChoKetLuan += 1;
      else if (d.arrivalDeltaMinutes > rules.latePenaltyGraceMinutes) soLanTre += 1;
    }
  }

  const phanTramTru =
    soLanTre * rules.penaltyLatePercent + ngayKhongPhep * rules.penaltyAbsentPercent;

  return {
    caQuyDinh: lamTron(caQuyDinh),
    caThucTe: lamTron(caThucTe),
    soLanTre,
    ngayKhongPhep,
    ngayChoKetLuan,
    phanTramTru: lamTron(phanTramTru),
  };
}

function lamTron(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "22 / 26" — tử số là ca thực tế. Không có ca quy định nào thì trả "—". */
export function nhanCa(t: ThongKeNguoi): string {
  if (t.caQuyDinh === 0) return "—";
  return `${t.caThucTe} / ${t.caQuyDinh}`;
}

/** Tỷ lệ đạt, 0–1. Mẫu số 0 ⇒ null (đừng in 0% cho người không có ca nào). */
export function tyLeDat(t: ThongKeNguoi): number | null {
  if (t.caQuyDinh === 0) return null;
  return t.caThucTe / t.caQuyDinh;
}
