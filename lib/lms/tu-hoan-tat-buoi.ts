// lib/lms/tu-hoan-tat-buoi.ts — điểm danh đủ sĩ số thì buổi TỰ hoàn tất.
//
// ─────────────────────────────────────────────────────────────────────────────
// Vì sao (chủ dự án 04/09: "mở khoá hoàn thành buổi: chỉ cần điểm danh")
//
// "Hoàn tất buổi" là một nút RIÊNG mà giáo viên phải nhớ bấm sau khi đã điểm danh.
// Không ai bấm ⇒ `ClassSession.status` kẹt ở SCHEDULED, và mọi màn đếm theo status
// (`lib/lms/report-card-editor-data.ts`) đọc hụt so với màn đếm theo ngày. Đo 04/09
// trên DB test: 524 buổi đã qua ngày nhưng chỉ 486 buổi COMPLETED.
//
// Cổng của `completeSession` VỐN đã không chặn — thiếu điểm danh chỉ cảnh báo. Nên
// việc cần làm không phải nới cổng mà là BỎ HẲN thao tác thừa: điểm danh xong là xong.
//
// THUẦN để test được; nơi gọi (`app/(teacher)/teacher/lop/_actions.ts`) lo phần DB.
// ─────────────────────────────────────────────────────────────────────────────

export type QuyetDinhHoanTat =
  | { tuHoanTat: true }
  | {
      tuHoanTat: false;
      lyDo:
        | "DA_XONG" // đã COMPLETED / CANCELLED — không đụng
        | "CHUA_TOI_NGAY" // buổi tương lai
        | "SI_SO_RONG" // lớp không có ai để điểm danh
        | "DIEM_DANH_THIEU"; // còn học viên chưa được đánh dấu
    };

export interface HoanTatInput {
  /** Trạng thái buổi hiện tại. */
  trangThaiBuoi: string;
  /** Ngày của buổi (`@db.Date` — nửa đêm UTC của ngày VN). */
  ngayBuoi: Date;
  /** Mốc nửa đêm UTC của NGÀY hôm nay theo giờ VN. */
  homNayUtcMs: number;
  /** Số học viên đang trong sĩ số lớp. */
  siSo: number;
  /** Số học viên ĐÃ có bản ghi điểm danh cho buổi này. */
  daDanhDau: number;
}

/**
 * Buổi có được tự đóng sau lượt lưu điểm danh này không.
 *
 * Ba điều KHÔNG được bỏ:
 *
 * 1. **Phải PHỦ ĐỦ SĨ SỐ**, không phải "có ≥1 dòng". Cùng định nghĩa với
 *    `sessionsMissingAttendance` (BUG-029) — nơi mà một bản ghi lẻ do duyệt phiếu xin
 *    nghỉ của phụ huynh từng làm buổi biến mất khỏi mọi ô "chưa điểm danh".
 * 2. **Không đóng buổi TƯƠNG LAI.** Giáo viên mở buổi tuần sau ra đánh sẵn cả lớp là
 *    chuyện có thật; đóng nó lại là phát `session.taught` cho buổi chưa dạy ⇒ giao bài
 *    và bắn thông báo cho phụ huynh sớm cả tuần.
 * 3. **Sĩ số rỗng không tính là "đủ".** 0 ≥ 0 đúng về số học nhưng sai về nghĩa: lớp
 *    chưa có học viên nào thì chẳng có buổi nào để mà dạy xong.
 */
export function quyetDinhTuHoanTat(input: HoanTatInput): QuyetDinhHoanTat {
  if (input.trangThaiBuoi !== "SCHEDULED" && input.trangThaiBuoi !== "IN_PROGRESS") {
    return { tuHoanTat: false, lyDo: "DA_XONG" };
  }
  if (input.ngayBuoi.getTime() > input.homNayUtcMs) {
    return { tuHoanTat: false, lyDo: "CHUA_TOI_NGAY" };
  }
  if (input.siSo <= 0) return { tuHoanTat: false, lyDo: "SI_SO_RONG" };
  if (input.daDanhDau < input.siSo) {
    return { tuHoanTat: false, lyDo: "DIEM_DANH_THIEU" };
  }
  return { tuHoanTat: true };
}
