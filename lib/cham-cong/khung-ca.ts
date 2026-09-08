// lib/cham-cong/khung-ca.ts — luật của KHUNG CA TUẦN (`ShiftWeeklyPattern`). THUẦN, test
// không cần DB.
//
// Hạt của bảng là **(userId, centerId, weekday, effectiveFrom)** — tối đa 7 dòng cho một
// người trong một khối. Ba trong bốn thao tác của màn khung ca không thao tác trên MỘT
// dòng mà trên **cả cụm 7 dòng đó**, và đó là chỗ dễ sai:
//
//   · gỡ người khỏi khối  → đóng cả cụm bằng `effectiveTo`;
//   · sắp thứ tự          → `displayOrder` phải BẰNG NHAU trên cả cụm;
//   · phân khối bộ phận   → `section` phải BẰNG NHAU trên cả cụm.
//
// Cột `displayOrder` và `section` nằm trên TỪNG DÒNG nhưng mang nghĩa CỦA NGƯỜI. Không
// có ràng buộc CSDL nào giữ chúng đồng nhất, nên luật phải nằm ở đây và có test.

/**
 * `effectiveFrom` mặc định của mọi dòng khung ca do màn admin tạo ra.
 *
 * Bảng có `@@unique([userId, centerId, weekday, effectiveFrom])`, và toàn bộ màn khung ca
 * làm việc trên MỘT mốc duy nhất này — nó không dựng lịch sử theo phiên bản. Đổi mốc là
 * đổi hạt của bảng; đó là việc khác, có migration riêng.
 */
export const KHUNG_CA_EFFECTIVE_FROM = new Date(Date.UTC(2000, 0, 1));

// ─────────────────────────────────────────────────────────────────────────────
// (a) GỠ NGƯỜI KHỎI KHỐI — mềm, bằng `effectiveTo`
// ─────────────────────────────────────────────────────────────────────────────
//
// KHÔNG xoá cứng. Ba lý do, theo thứ tự quan trọng:
//
//  1. `generate.ts:77-78` bỏ qua dòng khi `effectiveTo < ngày` — nên đóng bằng NGÀY HÔM
//     NAY nghĩa là "từ mai không xếp nữa", còn lưới tháng ĐÃ SINH của những ngày trước đó
//     giữ nguyên. Xoá cứng thì lần sinh lại kế tiếp làm rỗng cả quá khứ.
//  2. Dòng khung ca mang `sheetName` — cầu nối tên trên file Sheet với `userId`
//     (`reconcile-db.ts:23` đọc `distinct sheetName`). Xoá cứng là mất ánh xạ đó, và lần
//     đối chiếu file sau người ấy thành "không khớp ai".
//  3. Gỡ nhầm hoàn tác được: chỉ cần xoá `effectiveTo`.
//
// ⚠️ Hệ quả bắt buộc: mọi đường GHI vào cụm phải **xoá `effectiveTo`**. Khoá duy nhất
// không đổi khi gỡ mềm, nên `upsert` một ô của người đã gỡ sẽ rơi vào nhánh `update` và
// sửa đúng dòng đã đóng — không có `effectiveTo: null` thì ghi xong vẫn tàng hình, và
// người dùng thấy "bấm mà không có gì xảy ra".

/** Người này còn trong khối không? Dùng chung cho màn và cho luật thêm hàng loạt. */
export function conTrongKhoi(dong: { effectiveTo: Date | null }): boolean {
  return dong.effectiveTo === null;
}
