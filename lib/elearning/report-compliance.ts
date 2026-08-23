/**
 * EL-06 — BÁO CÁO R1: TUÂN THỦ HẠN CHÓT (BA §14.1).
 *
 * Phần THUẦN: từ các dòng ghi danh ra bảng tổng hợp + các dòng để xuất Excel.
 * Tách khỏi truy vấn theo đúng khuôn `lib/crm/commission-export.ts`.
 *
 * ⚠️ Năm nhóm trạng thái của báo cáo KHÔNG trùng một-một với sáu giá trị của
 * `TrnEnrollmentStatus`, và đó là chỗ dễ sai nhất:
 *
 *   - "chưa học" gộp `NOT_STARTED` + những người `OVERDUE` mà chưa mở bài nào;
 *   - `REVOKED` KHÔNG nằm trong bất kỳ nhóm nào của tử số/mẫu số — người bị thu
 *     hồi không còn được yêu cầu học, nên tính họ là "chưa hoàn thành" là bịa ra
 *     một tỉ lệ tuân thủ tệ hơn sự thật.
 *   - Người ĐANG TẠM DỪNG ĐỒNG HỒ (`pausedAt`) cũng ra khỏi CẢ tử số lẫn mẫu số
 *     (C4) — họ đang nghỉ dài, không phải đang trốn học.
 */

export type DongBaoCao = {
  userId: string;
  fullName: string;
  employeeCode: string;
  departmentName: string | null;
  managerName: string | null;
  status: string;
  progressPercent: number;
  dueAtOriginal: Date | null;
  completedAt: Date | null;
  pausedAt: Date | null;
  startedAt: Date | null;
};

export type NhomTuanThu =
  | "DUNG_HAN"
  | "TRE"
  | "DANG_HOC"
  | "CHUA_HOC"
  | "THU_HOI"
  | "TAM_DUNG";

export type TongHop = {
  daGiao: number;
  dungHan: number;
  tre: number;
  dangHoc: number;
  chuaHoc: number;
  thuHoi: number;
  tamDung: number;
  /** Mẫu số = đã giao − thu hồi − tạm dừng. `null` khi mẫu số bằng 0. */
  tyLeDungHan: number | null;
};

export function phanNhom(d: DongBaoCao): NhomTuanThu {
  if (d.status === "REVOKED") return "THU_HOI";
  if (d.pausedAt) return "TAM_DUNG";
  if (d.status === "COMPLETED") return "DUNG_HAN";
  if (d.status === "COMPLETED_LATE") return "TRE";
  // Đã mở bài (có `startedAt` hoặc tiến độ > 0) thì là ĐANG HỌC, kể cả khi đang
  // quá hạn. Gộp họ vào "chưa học" là xoá mất khác biệt giữa người đã bắt đầu
  // và người chưa mở lần nào — hai nhóm cần hai cách xử lý khác hẳn.
  if (d.startedAt || d.progressPercent > 0) return "DANG_HOC";
  return "CHUA_HOC";
}

export function tongHopTuanThu(ds: DongBaoCao[]): TongHop {
  const t: TongHop = {
    daGiao: ds.length,
    dungHan: 0,
    tre: 0,
    dangHoc: 0,
    chuaHoc: 0,
    thuHoi: 0,
    tamDung: 0,
    tyLeDungHan: null,
  };
  for (const d of ds) {
    switch (phanNhom(d)) {
      case "DUNG_HAN":
        t.dungHan += 1;
        break;
      case "TRE":
        t.tre += 1;
        break;
      case "DANG_HOC":
        t.dangHoc += 1;
        break;
      case "CHUA_HOC":
        t.chuaHoc += 1;
        break;
      case "THU_HOI":
        t.thuHoi += 1;
        break;
      case "TAM_DUNG":
        t.tamDung += 1;
        break;
    }
  }
  const mau = t.daGiao - t.thuHoi - t.tamDung;
  // Mẫu số 0 ⇒ `null`, KHÔNG phải 0%. "0% tuân thủ" đọc thành thảm hoạ, còn sự
  // thật là chưa có ai để đo.
  t.tyLeDungHan = mau > 0 ? Math.round((t.dungHan / mau) * 100) : null;
  return t;
}

/** Số ngày trễ so với hạn GỐC. `null` khi không trễ hoặc không có hạn. */
export function soNgayTre(d: DongBaoCao, now: Date): number | null {
  if (!d.dueAtOriginal) return null;
  const moc = d.completedAt ?? now;
  const lech = moc.getTime() - d.dueAtOriginal.getTime();
  if (lech <= 0) return null;
  return Math.ceil(lech / (24 * 60 * 60 * 1000));
}

export const R1_COLUMNS = [
  "Họ tên",
  "Mã NV",
  "Phòng ban",
  "Quản lý trực tiếp",
  "Trạng thái",
  "Tiến độ (%)",
  "Hạn gốc",
  "Hoàn thành lúc",
  "Số ngày trễ",
] as const;

const NHAN_NHOM: Record<NhomTuanThu, string> = {
  DUNG_HAN: "Hoàn thành đúng hạn",
  TRE: "Hoàn thành trễ",
  DANG_HOC: "Đang học",
  CHUA_HOC: "Chưa học",
  THU_HOI: "Đã thu hồi",
  TAM_DUNG: "Tạm dừng đồng hồ",
};

export function nhanNhom(n: NhomTuanThu): string {
  return NHAN_NHOM[n];
}

const ngayVN = (d: Date | null) =>
  d
    ? d.toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

/** Dựng các dòng cho sheet Excel: tiêu đề + từng người. */
export function buildR1Rows(ds: DongBaoCao[], now: Date): string[][] {
  const rows: string[][] = [[...R1_COLUMNS]];
  for (const d of ds) {
    const tre = soNgayTre(d, now);
    rows.push([
      d.fullName,
      d.employeeCode,
      // Ô trống chứ KHÔNG phải chữ "null": người đọc Excel sẽ lọc theo ô trống,
      // còn "null" thì thành một giá trị giả trong bộ lọc.
      d.departmentName ?? "",
      d.managerName ?? "",
      nhanNhom(phanNhom(d)),
      String(d.progressPercent),
      ngayVN(d.dueAtOriginal),
      ngayVN(d.completedAt),
      tre === null ? "" : String(tre),
    ]);
  }
  return rows;
}
