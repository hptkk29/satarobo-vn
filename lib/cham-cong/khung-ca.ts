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

// ─────────────────────────────────────────────────────────────────────────────
// (b) THÊM HÀNG LOẠT — idempotent
// ─────────────────────────────────────────────────────────────────────────────

export interface KetQuaThemHangLoat {
  /** Chưa có dòng nào trong khối ⇒ tạo mới. */
  themMoi: string[];
  /** Có dòng nhưng đã đóng (`effectiveTo`) ⇒ mở lại, KHÔNG tạo dòng thứ hai. */
  hoiSinh: string[];
  /** Đang ở trong khối ⇒ bỏ qua, không lỗi. */
  boQua: string[];
}

/**
 * Chia danh sách người được chọn thành ba nhóm trước khi ghi.
 *
 * "Người đã có trong khối thì bỏ qua, không lỗi, không nhân đôi" — nhưng **đã có** có HAI
 * nghĩa, và gộp chúng lại là sinh bug:
 *
 *   · đang ở trong khối  → bỏ qua thật;
 *   · từng ở, đã bị gỡ   → **phải mở lại cụm cũ**. Khoá duy nhất
 *     `(userId, centerId, weekday, effectiveFrom)` không đổi khi gỡ mềm, nên "tạo mới"
 *     cho người này sẽ đâm khoá; và nếu đường ghi dùng `upsert` thì nó lặng lẽ rơi vào
 *     nhánh `update` — đúng chỗ phải nhớ xoá `effectiveTo`, nếu không thì thêm xong người
 *     ấy vẫn tàng hình.
 *
 * Vì sao tách thành hàm thuần thay vì viết thẳng trong action: ba nhóm này là thứ MÀN
 * HÌNH phải báo lại ("thêm 3, mở lại 1, bỏ qua 2"), và một lượt thêm hàng loạt không nói
 * rõ nó đã làm gì với từng người là đúng loại thao tác vừa xoá trắng 9 hồ sơ prod.
 *
 * @param daCo Mọi dòng hiện có CỦA KHỐI ĐÓ — chỉ cần `userId` + `effectiveTo`.
 *             ⚠️ Truyền dòng của khối khác vào là báo "bỏ qua" cho người chưa hề có mặt.
 */
export function chiaLoThem(
  chon: readonly string[],
  daCo: readonly { userId: string; effectiveTo: Date | null }[],
): KetQuaThemHangLoat {
  const dangTrong = new Set<string>();
  const daDong = new Set<string>();
  for (const d of daCo) {
    if (conTrongKhoi(d)) dangTrong.add(d.userId);
    else daDong.add(d.userId);
  }
  const kq: KetQuaThemHangLoat = { themMoi: [], hoiSinh: [], boQua: [] };
  // `new Set(chon)`: chọn trùng trong CÙNG một lượt cũng không được đẻ hai dòng.
  // ⚠️ Thứ tự kiểm quan trọng — một người có thể vừa có dòng đang mở (thứ Hai) vừa có
  // dòng đã đóng (thứ Ba) nếu ai đó sửa tay; khi đó họ ĐANG trong khối, phải bỏ qua.
  for (const u of new Set(chon)) {
    if (dangTrong.has(u)) kq.boQua.push(u);
    else if (daDong.has(u)) kq.hoiSinh.push(u);
    else kq.themMoi.push(u);
  }
  return kq;
}
