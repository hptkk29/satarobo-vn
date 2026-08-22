// lib/lead/intake/misa-internal.ts — dựng payload MISA cho biểu mẫu
// `/nhap-khach-hang` (bộ 7 ô, chốt 22/08/2026).
//
// HÀM THUẦN, không chạm mạng/DB → test được không cần Postgres. Việc gửi nằm ở
// `misa-mirror.ts`.
//
// ⚠️ BẪY ĐẶT TÊN CỦA MISA — map ngược là hỏng toàn bộ dữ liệu bên đó:
//   `LastName`      = TÊN HỌC SINH (không phải họ của phụ huynh)
//   `CustomField25` = tên phụ huynh
//   `CustomField15` = SĐT phụ huynh
//   `CustomField17` = cơ sở, giá trị "1" = CS1 · "2" = CS2 (số thứ tự PHÍA MISA)
//   `CustomField26` = mã số NV nhập dữ liệu
//   `Description`   = mô tả/ghi chú
//
// Nguồn đối chiếu: `Document/0-yeucau/2-ba-phan-tich/09-ui-ux-site-sale-tuyensinh.md`
// §7 tab 6 (đã verify từ snippet "Form nhập liên hệ từ Sale" ngày 16/07/2026).
//
// 🔜 CÒN THIẾU 2 Ô PHÍA MISA (chờ chủ dự án xuất snippet mới — xem
// `docs/lead-intake/HUONG-DAN-CHON-TRUONG-MISA.md`):
//   - **Nguồn**: MISA có `LeadSourceID` nhưng là danh sách chọn (12 giá trị số),
//     mà ô "Nguồn" bên ta gõ tự do ⇒ chưa map 1-1 được.
//   - **Link Facebook**: MISA CHƯA có ô nào.
// Trong lúc chờ, hai giá trị này được ghép vào `Description` — **không mất dữ
// liệu**, chỉ là chưa lọc được bên MISA. Có mã trường thì khai vào
// `MISA_FIELD_LEAD_SOURCE` / `MISA_FIELD_FACEBOOK` là tự chuyển sang ô riêng,
// không phải sửa code.

/** Tên trường MISA của biểu mẫu nội bộ. Đổi ở đây là đổi cả đường mirror. */
export const MISA_INTERNAL_FIELDS = {
  childName: "LastName",
  parentName: "CustomField25",
  phone: "CustomField15",
  centerIndex: "CustomField17",
  employeeCode: "CustomField26",
  description: "Description",
} as const;

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

/** Mã trường tuỳ chọn khai qua env khi MISA đã có ô riêng cho 2 giá trị này. */
export type MisaOptionalFieldNames = {
  leadSource?: string;
  facebookUrl?: string;
};

/**
 * SĐT canonical nội bộ (`84905123456`) → dạng MISA đang có (`0905123456`).
 *
 * Vì sao không gửi thẳng `84…`: mọi bản ghi MISA do chính biểu mẫu này sinh ra
 * trước 22/08/2026 đều mang dạng `0…` (trình duyệt chuyển tiếp NGUYÊN chuỗi
 * người nhập gõ). Đổi định dạng giữa chừng là tra cứu/đối khớp bên MISA trượt
 * hết phần dữ liệu cũ — mà bên đó ta không kiểm soát được cách họ so khớp.
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

  // Nguồn / link FB: vào ô riêng nếu đã khai mã trường, không thì xuống mô tả.
  const extra: string[] = [];
  if (input.source) {
    if (optional.leadSource) out[optional.leadSource] = input.source;
    else extra.push(`Nguồn: ${input.source}`);
  }
  if (input.facebookUrl) {
    if (optional.facebookUrl) out[optional.facebookUrl] = input.facebookUrl;
    else extra.push(`Link Facebook: ${input.facebookUrl}`);
  }
  if (!input.phone) extra.push("(phiếu chưa có số điện thoại)");

  const description = [input.note, ...extra].filter(Boolean).join("\n");
  put(F.description, description);

  return out;
}
