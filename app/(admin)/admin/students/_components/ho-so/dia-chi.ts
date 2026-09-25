// app/(admin)/admin/students/_components/ho-so/dia-chi.ts — phần THUẦN của ô địa chỉ 2 cấp
// trên hồ sơ học viên (25/09/2026). Tách khỏi `dia-chi-picker.tsx` để test không cần React.
//
// Hồ sơ học viên LƯU TÊN (`Student.city` / `Student.ward`), picker chạy bằng MÃ tỉnh (phải
// có mã mới tra được danh sách phường). Mở hồ sơ cũ = một lượt dịch ngược tên → mã, và dữ
// liệu học viên CŨ là chữ gõ tay thời form còn ô tự do ("TP Đà Nẵng", "Q. Hải Châu", phường
// đã sáp nhập…) — không khớp danh mục 2 cấp nào.
//
// Nếu picker chỉ nhận option trong danh mục thì ô hiện TRỐNG cho các hồ sơ đó, và lượt bấm
// "Lưu thay đổi" kế tiếp gửi `city=""` ⇒ form mới XOÁ THẬT (doc-form: có mặt + rỗng = xoá).
// Hai hàm dưới giữ tên đang lưu thành một option tạm để giá trị cũ đi nguyên xuống DB cho
// tới khi người dùng CHỦ ĐỘNG chọn lại. Lưới: `dia-chi.test.ts` ([DC-01..05]).

import type { ComboboxOption } from "@/components/ui/combobox";
import { provinceIdByName } from "@/lib/address/vn-address";

/** Tiền tố value của option "tên tỉnh đang lưu nhưng không có trong danh mục". */
export const TIEN_TO_TINH_CU = "__tinh-cu__:";

export function laTinhCu(value: string | null | undefined): value is string {
  return !!value && value.startsWith(TIEN_TO_TINH_CU);
}

/**
 * Option cho ô Tỉnh/Thành + giá trị đang chọn lúc mở form.
 *  · tên khớp danh mục (y hệt hoặc bỏ dấu) ⇒ chọn đúng mã tỉnh, KHÔNG thêm option;
 *  · tên không khớp ⇒ thêm option tạm mang đúng tên đó lên đầu và chọn nó;
 *  · trống ⇒ không chọn gì.
 */
export function luaChonTinh(
  provinces: readonly ComboboxOption[],
  cityDangLuu: string | null | undefined,
): { options: ComboboxOption[]; chon: string | null } {
  const ten = (cityDangLuu ?? "").trim();
  if (!ten) return { options: [...provinces], chon: null };
  const ma = provinceIdByName(
    provinces.map((p) => ({ id: p.value, name: p.label })),
    ten,
  );
  if (ma) return { options: [...provinces], chon: ma };
  const tam: ComboboxOption = { value: TIEN_TO_TINH_CU + ten, label: `${ten} (dữ liệu cũ)` };
  return { options: [tam, ...provinces], chon: tam.value };
}

/** Tên tỉnh THẬT cần lưu ứng với một value của ô tỉnh. */
export function tenTinhTuGiaTri(
  provinces: readonly ComboboxOption[],
  value: string | null,
): string {
  if (!value) return "";
  if (laTinhCu(value)) return value.slice(TIEN_TO_TINH_CU.length);
  return provinces.find((p) => p.value === value)?.label ?? "";
}

/**
 * Option cho ô Phường/Xã: danh mục của tỉnh đang chọn, CỘNG tên phường đang lưu nếu nó
 * không có trong danh mục (phường đã sáp nhập, chữ gõ tay thời 3 cấp). Value = CHÍNH TÊN
 * (xem `toNameOptions`) nên option tạm lưu xuống đúng chuỗi cũ.
 */
export function luaChonPhuong(
  wards: readonly ComboboxOption[],
  wardDangChon: string | null | undefined,
): ComboboxOption[] {
  const ten = (wardDangChon ?? "").trim();
  if (!ten || wards.some((w) => w.value === ten)) return [...wards];
  return [{ value: ten, label: `${ten} (dữ liệu cũ)` }, ...wards];
}
