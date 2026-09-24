// lib/integrations/zalocrm/pham-vi-nick.ts — AI ĐƯỢC DÙNG MỘT NICK CỤ THỂ.
//
// ── CHÍNH SÁCH (chủ dự án chốt 24/09/2026) ─────────────────────────────────
// Nick ĐÃ GIAO cho một người  → chỉ người đó + QUẢN LÝ CƠ SỞ.
// Nick CHƯA GIAO              → cả cơ sở, y như trước.
//
// Vế "quản lý cơ sở luôn thấy" là lựa chọn có chủ đích, không phải nới quyền cho tiện:
// người giữ nick nghỉ ốm thì khách của họ vẫn có người trả lời, mà KHÔNG ai phải vào
// sửa cấu hình giữa lúc gấp. Phương án "tuyệt đối — chỉ đúng người đó" đã được cân và
// bị loại vì đúng ca đó: 92 hội thoại thật nằm im cho tới khi có người nhớ ra.
//
// ── VÌ SAO TÁCH RA FILE THUẦN ──────────────────────────────────────────────
// `capQuyenMotOrg` chạm DB + gọi mạng, nên test nó phải dựng cả hạ tầng. Luật "ai thấy
// nick nào" thì KHÔNG cần gì cả — nó là một phép trên ba danh sách. Tách ra là cấy lỗi
// được: sửa một dòng ở đây phải làm ca test ĐỎ, và ca ấy chạy trong `test:unit`.
//
// ── 🔴 GIAO NHAU VỚI "CÒN THUỘC CƠ SỞ", KHÔNG PHẢI HỢP ─────────────────────
// `sataUserId` là một con trỏ ĐƯỢC LƯU LẠI — nó không tự đúng mãi. Người được giao nick
// có thể đã nghỉ việc, đổi cơ sở, hoặc bị khoá tài khoản; dòng `ZaloCrmNick` thì vẫn
// nguyên (đường đồng bộ CỐ Ý không bao giờ xoá `sataUserId` — `nick-admin.ts`).
// Nên kết quả phải GIAO với danh sách người còn hợp lệ của cơ sở, không phải cộng vào.
// Cộng vào là biến vế GỠ của hệ thống thành vô hiệu: người nghỉ việc vẫn đọc được chat
// khách, và KHÔNG có triệu chứng nào báo.

/** Vai được thấy MỌI nick của cơ sở, kể cả nick đã giao cho người khác. */
export const VAI_THAY_MOI_NICK: readonly string[] = ["CENTER_MANAGER"];

export type ThamSoPhamViNick = {
  /** Người được giao nick này (`ZaloCrmNick.sataUserId`). `null` = chưa giao. */
  daGiaoCho: string | null;
  /** MỌI người còn hợp lệ của cơ sở (đã lọc vai + tài khoản còn hiệu lực). */
  nguoiCuaCoSo: readonly string[];
  /** Tập con của `nguoiCuaCoSo` đang giữ vai quản lý cơ sở. */
  quanLyCoSo: readonly string[];
};

/**
 * Danh sách người được dùng MỘT nick, để đẩy sang ZaloCRM.
 *
 * THUẦN: không DB, không mạng, không đồng hồ. Thứ tự trả về ỔN ĐỊNH (theo
 * `nguoiCuaCoSo`) để hai lượt chạy liên tiếp sinh ra cùng một payload — lượt đối soát
 * so danh sách chứ không so tập hợp, và một payload xáo thứ tự làm nhật ký đầy tiếng ồn.
 */
export function nguoiDuocDungMotNick(t: ThamSoPhamViNick): string[] {
  const hopLe = new Set(t.nguoiCuaCoSo);

  // CHƯA GIAO → giữ nguyên hành vi cũ. Đây là nhánh của MỌI nick cho tới khi có người
  // vào giao, nên nó phải là nhánh an toàn nhất: không ai mất quyền vì một tính năng mới.
  if (!t.daGiaoCho) return [...t.nguoiCuaCoSo];

  // ĐÃ GIAO nhưng người ấy KHÔNG còn thuộc cơ sở (nghỉ việc / chuyển / khoá tài khoản):
  // rơi về cả cơ sở, KHÔNG phải về rỗng. Rỗng là hộp thư của khách không ai đọc được, và
  // không một dòng lỗi nào báo — đúng kiểu hỏng câm mà repo này đã trả giá nhiều lần.
  if (!hopLe.has(t.daGiaoCho)) return [...t.nguoiCuaCoSo];

  const duoc = new Set<string>([t.daGiaoCho, ...t.quanLyCoSo]);

  // Lọc theo `nguoiCuaCoSo` là chỗ DUY NHẤT ép "còn thuộc cơ sở" — cho cả người được
  // giao lẫn quản lý. Bản đầu còn một vế `if (hopLe.has(ql))` ở vòng trên; phép cấy lỗi
  // chứng minh nó là MÃ CHẾT (gỡ đi, 0 ca đỏ) vì dòng này đã làm đúng việc ấy rồi. Đã gỡ:
  // một cổng không có tác dụng nhưng trông như có là thứ người sau sẽ tin nhầm.
  return t.nguoiCuaCoSo.filter((id) => duoc.has(id));
}
