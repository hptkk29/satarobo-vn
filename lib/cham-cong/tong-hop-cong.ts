/**
 * lib/cham-cong/tong-hop-cong.ts — GỘP các dòng `StaffAttendanceDay` của MỘT người thành
 * một bộ số. THUẦN: không `@/lib/db`, không `next/*`, không JSX.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO TỒN TẠI
 *
 * Phép gộp này trước nằm INLINE trong `buildPeriodSummary` (`lib/cham-cong/period.ts`) —
 * đúng chỗ admin đọc, và **chỉ** admin gọi được: hàm ấy nhận `centerId`, nạp CẢ cơ sở, và
 * đọc `db` trần. Site giáo viên không có đường nào gọi nó mà không đọc dòng của người khác.
 *
 * Hệ quả đã xảy ra BA lần trong hai tuần (luật 12b): site GV cần một con số admin đã có,
 * không gọi được, nên tự cộng lại — và lệch. Lần thứ tư là mục 1 (bảng tổng hợp ở "Của tôi").
 *
 * ⇒ Tách phép gộp ra khỏi phần nạp dữ liệu. `buildPeriodSummary` gọi nó cho từng người;
 * trang "Bảng công" của site GV gọi nó cho ĐÚNG một người. Một phép tính, hai nơi đọc.
 *
 * ⚠️ Hàm này KHÔNG tính công. Nó chỉ CỘNG những cột engine đã ghi. Muốn đổi cách tính công
 * thì sửa `engine.ts`, không phải sửa đây.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BA SỐ MỚI so với bản inline cũ, và vì sao thêm
 *
 * · `latePhut` / `earlyLeavePhut` — bản cũ chỉ đếm SỐ LẦN (`lateCount`). Chủ dự án chốt
 *   13/09: phạt (mục 3) có thể tính theo lần HOẶC theo phút, nên phải bày cả hai; và một
 *   người trễ 2 lần × 3′ khác hẳn người trễ 2 lần × 90′.
 * · `ngayDaLam` / `ngayCoCa` — đếm theo NGÀY. Cặp `caThucTe`/`caQuyDinh` của
 *   `noi-quy.ts` đo bằng ĐƠN VỊ CÔNG (nửa ngày = 0,5), không phải ngày. Hai đại lượng
 *   khác nhau, để chung một nhãn là đúng lỗi mà mục 1 sinh ra để sửa.
 */
import type { AttendanceAbsenceStatus } from "@prisma/client";

/**
 * Đúng những cột phép gộp đọc. Khai tường minh thay vì nhận cả `StaffAttendanceDay`:
 * trường BẮT BUỘC biến "quên `select` cột nguồn" từ lỗi câm thành lỗi biên dịch (luật 7).
 */
export type NgayCongGop = {
  workDate: Date;
  dayType: string;
  templateCode: string | null;
  overrideUnits: number | null;
  dayCreditEarned: number;
  dayCreditExpected: number;
  leaveUnits: number;
  holidayPaidUnits: number;
  hourCredit: number;
  workedMinutes: number;
  expectedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  flags: string[];
  absenceStatus: AttendanceAbsenceStatus | null;
};

export type TongHopCong = {
  /** Σ (overrideUnits ?? dayCreditEarned) — công THỰC NHẬN. */
  units: number;
  /** Σ dayCreditExpected — công theo KẾ HOẠCH. Không phải "công chuẩn của kỳ". */
  expectedUnits: number;
  leaveUnits: number;
  holidayPaidUnits: number;
  hourCredit: number;
  workedMinutes: number;
  expectedMinutes: number;
  /** Số NGÀY có ít nhất một phút làm được ghi nhận. */
  ngayDaLam: number;
  /** Số NGÀY được xếp ca làm việc (dayType WORK và có kế hoạch công). */
  ngayCoCa: number;
  lateCount: number;
  latePhut: number;
  earlyLeaveCount: number;
  earlyLeavePhut: number;
  missingTapDays: number;
  overrideDays: number;
  flaggedDays: number;
  /** ngày "YYYY-MM-DD" → công của ngày đó. */
  unitsByDay: Record<string, number>;
};

/**
 * Cờ đáng để một ngày bị gọi là "có vấn đề". Đây là DANH SÁCH ADMIN ĐANG DÙNG, chuyển
 * nguyên từ `period.ts` sang — đừng chép thêm bản thứ hai ở nơi khác.
 */
export const CO_CANH_BAO = new Set([
  "KHONG_CO_LUOT",
  "THIEU_LUOT_RA",
  "RA_KHONG_CO_VAO",
  "THIEU_BUOI_SANG",
  "THIEU_BUOI_CHIEU",
  "NGOAI_VUNG",
  "SAI_NOI_LAM",
  "THIEU_GIO",
  "DI_MUON",
  "VE_SOM",
  "CHAM_NGOAI_LICH",
  "VUOT_TRAN",
]);

function lamTron2(n: number): number {
  return Math.round(n * 100) / 100;
}

function khoaNgay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function gopNgayCong(days: readonly NgayCongGop[]): TongHopCong {
  const t: TongHopCong = {
    units: 0,
    expectedUnits: 0,
    leaveUnits: 0,
    holidayPaidUnits: 0,
    hourCredit: 0,
    workedMinutes: 0,
    expectedMinutes: 0,
    ngayDaLam: 0,
    ngayCoCa: 0,
    lateCount: 0,
    latePhut: 0,
    earlyLeaveCount: 0,
    earlyLeavePhut: 0,
    missingTapDays: 0,
    overrideDays: 0,
    flaggedDays: 0,
    unitsByDay: {},
  };

  for (const d of days) {
    const units = d.overrideUnits ?? d.dayCreditEarned;
    t.unitsByDay[khoaNgay(d.workDate)] = units;
    t.units += units;
    t.expectedUnits += d.dayCreditExpected;
    t.leaveUnits += d.leaveUnits;
    t.holidayPaidUnits += d.holidayPaidUnits;
    t.hourCredit += d.hourCredit;
    t.workedMinutes += d.workedMinutes;
    t.expectedMinutes += d.expectedMinutes;

    // "Ngày có ca" theo ĐÚNG định nghĩa `laNgayLamViec` của `noi-quy.ts`: ngày làm việc CÓ
    // kế hoạch công. Ngày nghỉ (P/X/lễ) mang dayCreditExpected = 0 nên không vào mẫu số.
    if (d.dayType === "WORK" && d.dayCreditExpected > 0) t.ngayCoCa += 1;
    // "Đã đi làm" = có bằng chứng CÓ MẶT, không phải có công. Người được ghi đè công cho một
    // ngày không đi làm vẫn phải đếm là KHÔNG đi làm, kẻo thẻ này thành thẻ đếm công thứ hai.
    if (d.workedMinutes > 0) t.ngayDaLam += 1;

    if (d.lateMinutes > 0) {
      t.lateCount += 1;
      t.latePhut += d.lateMinutes;
    }
    if (d.earlyLeaveMinutes > 0) {
      t.earlyLeaveCount += 1;
      t.earlyLeavePhut += d.earlyLeaveMinutes;
    }
    if (d.flags.includes("KHONG_CO_LUOT") && d.dayType === "WORK")
      t.missingTapDays += 1;
    if (d.overrideUnits != null) t.overrideDays += 1;
    if (d.flags.some((f) => CO_CANH_BAO.has(f))) t.flaggedDays += 1;
  }

  t.units = lamTron2(t.units);
  t.expectedUnits = lamTron2(t.expectedUnits);
  t.leaveUnits = lamTron2(t.leaveUnits);
  t.holidayPaidUnits = lamTron2(t.holidayPaidUnits);
  t.hourCredit = lamTron2(t.hourCredit);
  return t;
}
