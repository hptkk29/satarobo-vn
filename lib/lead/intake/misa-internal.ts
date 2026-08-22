// lib/lead/intake/misa-internal.ts — dựng payload MISA cho biểu mẫu
// `/nhap-khach-hang` (bộ 7 ô, chốt 22/08/2026).
//
// HÀM THUẦN, không chạm mạng/DB → test được không cần Postgres. Việc gửi nằm ở
// `misa-mirror.ts`.
//
// ═══════════════════════════════════════════════════════════════════════════
// NGUỒN SỰ THẬT: webform **"Form Nhập KH v2"** (chủ dự án tạo 22/08/2026), ID
// `998e71a2-…`. Đây là form MỚI, KHÔNG phải form cũ `c53af301-…` của biểu mẫu
// tĩnh `sale.satarobo.vn` đã nghỉ — nên 3 tham số định danh trong env cũng phải
// là của form mới, đừng chép lại giá trị cũ.
//
// ⚠️ BẪY ĐẶT TÊN — map ngược là hỏng toàn bộ dữ liệu bên MISA:
//   `LastName`      = TÊN HỌC SINH (không phải họ của phụ huynh) — ô DUY NHẤT
//                     mà MISA bắt buộc (`mndFileds = ['LastName']`)
//   `CustomField25` = tên phụ huynh
//   `Mobile`        = SĐT phụ huynh — ⚠️ form v2 dùng trường CHUẨN `Mobile`,
//                     KHÁC form cũ (`CustomField15`). Gửi nhầm tên cũ thì MISA
//                     nhận phiếu nhưng KHÔNG có số, và không báo lỗi gì.
//   `CustomField17` = cơ sở, "1" = CS1 · "2" = CS2 (số thứ tự PHÍA MISA)
//   `CustomField26` = mã số NV nhập dữ liệu
//   `CustomField22` = Facebook phụ huynh
//   `LeadSourceID`  = nguồn gốc lead, danh sách 12 giá trị (xem MISA_LEAD_SOURCE)
//   `Description`   = ghi chú
// ═══════════════════════════════════════════════════════════════════════════
import { normalizeVi } from "./normalize";

/** Tên trường MISA của "Form Nhập KH v2". Đổi ở đây là đổi cả đường mirror. */
export const MISA_INTERNAL_FIELDS = {
  childName: "LastName",
  parentName: "CustomField25",
  phone: "Mobile",
  centerIndex: "CustomField17",
  employeeCode: "CustomField26",
  facebookUrl: "CustomField22",
  leadSource: "LeadSourceID",
  description: "Description",
} as const;

/**
 * 12 giá trị của `LeadSourceID` trên form v2 — chép NGUYÊN VĂN nhãn từ mã nhúng.
 *
 * Không có giá trị 5 (MISA bỏ trống số đó). Nhãn ở đây cũng chính là gợi ý hiện
 * trong ô "Nguồn" của biểu mẫu, nên hai bên dùng CHUNG một từ điển: người nhập
 * chọn gợi ý ⇒ lead bên ta và bản ghi bên MISA nói cùng một thứ tiếng.
 */
export const MISA_LEAD_SOURCE: ReadonlyArray<{ id: string; label: string }> = [
  { id: "1", label: "Nguồn từ Marketing Hội Sở từ Quảng Cáo" },
  { id: "2", label: "Nguồn Review, chia sẻ, seeding từ Trung tâm" },
  { id: "3", label: "Nguồn KH tự đến Trung Tâm" },
  { id: "4", label: "Nguồn từ phụ huynh giới thiệu" },
  { id: "6", label: "Nguồn từ sự kiện" },
  { id: "7", label: "Nguồn từ nhân viên giới thiệu" },
  { id: "8", label: "Nguồn từ Ban lãnh đạo công ty" },
  { id: "9", label: "Nguồn khác" },
  { id: "10", label: "Nguồn từ Marketing Hội Sở từ Tool quét KH" },
  { id: "11", label: "Nguồn từ Marketing Hội Sở từ Organic" },
  { id: "12", label: "Nguồn từ Marketing Hội Sở từ Seeding" },
  { id: "13", label: "Nguồn từ cộng tác viên giới thiệu" },
];

const SOURCE_BY_LABEL = new Map(
  MISA_LEAD_SOURCE.map((s) => [normalizeVi(s.label), s.id]),
);

/**
 * Chuỗi người nhập gõ ở ô "Nguồn" → `LeadSourceID`, hoặc `null` nếu không khớp.
 *
 * Ô "Nguồn" bên ta CỐ Ý gõ tự do (chủ dự án chốt 22/08) — người nhập phải viết
 * được "chị Hoa lớp 3 giới thiệu". Nên đây là ánh xạ MỀM: gõ trùng một nhãn của
 * MISA thì phiếu bên đó vào đúng ô nguồn; gõ chữ tự do thì `LeadSourceID` để
 * trống và nguyên văn chuỗi rơi xuống `Description` — **không mất chữ nào**.
 */
export function misaLeadSourceId(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  return SOURCE_BY_LABEL.get(normalizeVi(s)) ?? null;
}

export type MisaInternalInput = {
  parentName: string;
  /** Chuỗi rỗng = phiếu chưa có số (biểu mẫu không bắt buộc ô nào). */
  phone: string;
  childName: string | null;
  source: string | null;
  facebookUrl: string | null;
  /** `Center.code` của ta, vd "CS1" — quy ra số thứ tự của MISA. */
  centerCode: string | null;
  note: string | null;
  employeeCode: string | null;
};

/**
 * Ghi đè tên trường khi MISA đổi cấu hình form mà chưa kịp sửa mã nguồn.
 * Bỏ trống ⇒ dùng `MISA_INTERNAL_FIELDS`.
 */
export type MisaOptionalFieldNames = {
  leadSource?: string;
  facebookUrl?: string;
};

/**
 * SĐT canonical nội bộ (`84905123456`) → dạng MISA đang có (`0905123456`).
 *
 * Vì sao không gửi thẳng `84…`: bản ghi MISA của Sata Robo xưa nay đều mang dạng
 * `0…` (trình duyệt chuyển tiếp NGUYÊN chuỗi người nhập gõ). Đổi định dạng giữa
 * chừng là tra cứu/đối khớp bên MISA trượt hết phần dữ liệu cũ — mà bên đó ta
 * không kiểm soát được cách họ so khớp.
 */
export function misaPhone(canonical: string): string {
  return /^84\d{9}$/.test(canonical) ? `0${canonical.slice(2)}` : canonical;
}

/** `Center.code` ("CS1") → số thứ tự phía MISA ("1"). Không khớp ⇒ bỏ ô. */
export function misaCenterIndex(code: string | null | undefined): string | null {
  const m = /^CS(\d+)$/i.exec((code ?? "").trim());
  return m ? m[1]! : null;
}

/**
 * Dựng bộ trường dữ liệu gửi MISA (CHƯA gồm 3 tham số định danh form — phần đó
 * do `misa-mirror.ts` ghép vào).
 *
 * MISA bắt buộc `LastName`. Phiếu không có tên bé thì gửi tên phụ huynh, không
 * thì gửi một nhãn nói rõ là chưa có — bỏ trống là MISA từ chối cả phiếu.
 */
export function buildMisaInternalFields(
  input: MisaInternalInput,
  optional: MisaOptionalFieldNames = {},
): Record<string, string> {
  const F = MISA_INTERNAL_FIELDS;
  const out: Record<string, string> = {};

  const put = (field: string | undefined, value: string | null | undefined) => {
    if (field && value) out[field] = value;
  };

  put(F.childName, input.childName || input.parentName || "Khách chưa rõ tên");
  put(F.parentName, input.parentName);
  put(F.phone, input.phone ? misaPhone(input.phone) : null);
  put(F.centerIndex, misaCenterIndex(input.centerCode));
  put(F.employeeCode, input.employeeCode);
  put(optional.facebookUrl ?? F.facebookUrl, input.facebookUrl);

  // Nguồn: khớp nhãn MISA thì vào ô nguồn; gõ tự do thì xuống mô tả (không mất).
  const extra: string[] = [];
  if (input.source) {
    const id = misaLeadSourceId(input.source);
    if (id) put(optional.leadSource ?? F.leadSource, id);
    else extra.push(`Nguồn: ${input.source}`);
  }
  if (!input.phone) extra.push("(phiếu chưa có số điện thoại)");

  const description = [input.note, ...extra].filter(Boolean).join("\n");
  put(F.description, description);

  return out;
}
