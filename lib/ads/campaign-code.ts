/**
 * D-06 — bóc mã cơ sở từ TIỀN TỐ tên campaign, theo quy ước `SR.QD.232`
 * (ban hành, áp dụng từ 23/08/2026).
 *
 * Khuôn tên:
 *   [MÃ CƠ SỞ]_[MỤC TIÊU]_[KHOÁ HỌC]_[ĐỊNH DẠNG]_[MMYY]_[MÃ NỘI DUNG]
 *   ví dụ:   CS1_LEAD_ROBOTICS-L1_VIDEO_0826_A03
 *
 * ⚠️ Hàm THUẦN: không gọi DB, không đọc env. Danh mục mã cơ sở **truyền vào**
 * (nguồn thật là `Center.code`) chứ không chôn trong tệp này — giữ đúng luật của kho
 * "mở cơ sở mới = thêm dữ liệu, không sửa mã".
 *
 * ⚠️ Nguyên tắc quan trọng nhất: **KHÔNG ĐOÁN.** Không khớp mờ, không nhặt mã ở giữa
 * chuỗi, không rơi về một cơ sở mặc định. Đoán sai một campaign là gán nhầm **toàn bộ**
 * chi tiêu của nó sang cơ sở khác, và sai kiểu đó không ai phát hiện được vì con số vẫn
 * ra một con số trông hợp lý. Mọi ca mập mờ về `UNKNOWN` — tức nhóm "CHƯA PHÂN BỔ",
 * chỗ mà người ta nhìn thấy và gán tay được ở D-07.
 */

/** Mã đặc biệt cho campaign chạy chung nhiều cơ sở. BẮT BUỘC khai tỷ lệ ở D-07. */
export const MULTI_CENTER_CODE = "MULTI";

/** Nhãn nhóm gom chi tiêu không quy được về cơ sở nào — hiện đúng chữ này trên màn hình. */
export const UNALLOCATED_LABEL = "CHƯA PHÂN BỔ";

export type CampaignCodeParse =
  | { kind: "CENTER"; centerCode: string }
  | { kind: "MULTI" }
  | { kind: "UNKNOWN"; reason: "EMPTY" | "NO_PREFIX" | "CODE_NOT_FOUND"; token: string };

/**
 * @param campaignName Tên campaign lấy từ Meta. Có thể `null` — Meta không phải lúc nào
 *                     cũng trả `campaign_name`.
 * @param knownCodes   Danh mục mã cơ sở đang có, vd `new Set(["CS1","CS2"])`.
 *
 * Luật, đúng thứ tự:
 *  1. Cắt khoảng trắng hai đầu; rỗng ⇒ `EMPTY`.
 *  2. Tách bằng `_` — **chỉ** `_`, KHÔNG tách thêm bằng `-`: dấu `-` được dùng bên
 *     trong một trường theo chính ví dụ chuẩn (`ROBOTICS-L1`), tách nó ra là bẻ gãy
 *     đúng cái khuôn mà quy ước yêu cầu.
 *  3. Lấy phần tử đầu, cắt khoảng trắng, viết HOA (nhận cả `cs1`).
 *  4. `MULTI` ⇒ campaign chung. 5. Có trong danh mục ⇒ ra cơ sở. 6. Còn lại ⇒ `UNKNOWN`.
 *
 * Phân biệt `NO_PREFIX` với `CODE_NOT_FOUND` để D-08 nói được "tên sai quy ước" khác
 * với "mã cơ sở lạ" — hai việc cần hai cách xử lý khác nhau của Marketing.
 */
export function parseCenterCodeFromCampaignName(
  campaignName: string | null | undefined,
  knownCodes: ReadonlySet<string>,
): CampaignCodeParse {
  const ten = (campaignName ?? "").trim();
  if (ten === "") return { kind: "UNKNOWN", reason: "EMPTY", token: "" };

  const phan = ten.split("_");
  const token = (phan[0] ?? "").trim().toUpperCase();

  if (token === MULTI_CENTER_CODE) return { kind: "MULTI" };
  if (knownCodes.has(token)) return { kind: "CENTER", centerCode: token };

  // Không có dấu `_` nào ⇒ tên không theo quy ước chút nào, khác hẳn ca "đúng khuôn
  // nhưng mã lạ".
  const reason = phan.length === 1 ? "NO_PREFIX" : "CODE_NOT_FOUND";
  return { kind: "UNKNOWN", reason, token };
}
