/**
 * lib/address/vn-address.ts — G-01: chỗ DUY NHẤT dịch giữa danh mục hành chính
 * và ô địa chỉ của phiếu lead.
 *
 * ⚠️ Danh mục tỉnh/phường KHÔNG nằm ở đây và đừng chép vào đây. Nguồn là gói
 * `vietnam-address-data` (mô hình 2 cấp, hiệu lực 01/07/2025) — đã có sẵn trong
 * kho và đang chạy ở màn tạo đơn (`orders/_components/order-create-form.tsx`).
 * Hàm dưới nhận danh sách qua THAM SỐ nên test được mà không phải nạp cả bộ dữ
 * liệu, và quan trọng hơn: chỉ có một bảng danh mục trong toàn hệ thống. Bảng
 * thứ hai sẽ lệch ngay lần sáp nhập tỉnh kế tiếp.
 *
 * ⚠️ `lib/lead/intake/misa-provinces.ts` KHÔNG phải danh mục hành chính — nó là
 * bảng mã PHÍA MISA của 63 tỉnh CŨ (trước sáp nhập 07/2025), chỉ để đổi id trong
 * phiếu MISA cũ ra tên đọc được. Đừng lấy nó nuôi picker này.
 *
 * Phiếu lưu TÊN chứ không lưu mã (giống `Order.customerCity`/`customerWard`):
 * tên đọc được ngay khi xuất Excel/đối soát, và không chết khi mã hành chính đổi.
 * Đổi lại, mỗi lần mở phiếu phải dịch ngược tên → mã cho picker — việc của
 * {@link provinceIdByName}.
 */

export type AddressOption = { value: string; label: string };

/** Mục danh mục tối thiểu — khớp cả `Province` lẫn `Ward` của gói. */
type CatalogItem = { id: string; name: string };

/**
 * Bỏ dấu + hạ chữ thường để so tên "gần đúng".
 *
 * Repo đã có ~15 bản sao của phép này rải khắp nơi (slug hoá, tìm kiếm chat,
 * đối soát ngân hàng). Không gom được ở đây vì mỗi bản có luật riêng (bản của
 * ngân hàng còn xoá cả chữ Đ). Bản này chỉ phục vụ so tên tỉnh/phường.
 */
function chuanHoaTen(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Danh mục → option cho `<Combobox>`, VALUE = MÃ.
 *
 * Dùng cho ô TỈNH, vì phải có mã tỉnh mới tra được danh sách phường
 * (`getWardsByProvince`). Đổi lại, mỗi lượt lưu phải dịch mã → tên và mỗi lượt mở
 * phiếu phải dịch ngược (xem {@link provinceIdByName}).
 */
export function toAddressOptions(list: readonly CatalogItem[]): AddressOption[] {
  return list.map((x) => ({ value: x.id, label: x.name }));
}

/**
 * Danh mục → option cho `<Combobox>`, VALUE = CHÍNH TÊN.
 *
 * Dùng cho ô PHƯỜNG/XÃ. Không có gì cần mã phường cả, nên gắn mã vào chỉ tạo thêm
 * một lượt dịch mã ↔ tên ở mỗi chiều — và mỗi lượt dịch là một chỗ để đánh rơi dữ
 * liệu. Đúng lỗi đã xảy ra hai lần ở khu vực này: ô "Cơ sở quan tâm" lưu nhầm
 * `OrgUnit.id` vào cột chứa `Center.id` (V-4 · G-01b), và bản nháp đầu của chính
 * hàm này suýt ghi mã phường 8 chữ số vào cột `Lead.ward` vốn để chứa tên.
 *
 * Đánh đổi đã biết: hai phường TRÙNG TÊN trong cùng một tỉnh sẽ chung một option.
 * Tên phường là định danh hành chính nên chuyện đó không xảy ra; và nếu có, hậu
 * quả chỉ là ô sáng nhầm một trong hai dòng giống hệt nhau — giá trị lưu xuống
 * vẫn đúng.
 */
export function toNameOptions(list: readonly CatalogItem[]): AddressOption[] {
  return list.map((x) => ({ value: x.name, label: x.name }));
}

/**
 * Tên tỉnh đã lưu trong phiếu → mã tỉnh, để mở lại form còn nạp đúng danh sách
 * phường.
 *
 * Khớp y hệt trước, rồi mới hạ xuống so không-dấu. Không đoán mờ (fuzzy): trả
 * sai một tỉnh còn tệ hơn trả null, vì người dùng sẽ không nhận ra.
 */
export function provinceIdByName(
  list: readonly CatalogItem[],
  name: string | null | undefined,
): string | null {
  const ten = (name ?? "").trim();
  if (!ten) return null;
  const yHet = list.find((p) => p.name === ten);
  if (yHet) return yHet.id;
  const khongDau = chuanHoaTen(ten);
  return list.find((p) => chuanHoaTen(p.name) === khongDau)?.id ?? null;
}

/**
 * Ghép 3 mẩu địa chỉ thành một dòng đọc được (hẹp → rộng).
 *
 * Trả `null` khi không có mẩu nào, để trang chi tiết ẩn hẳn ô thay vì vẽ một
 * nhãn "Địa chỉ" bên cạnh khoảng trắng.
 */
export function formatVnAddress(parts: {
  addressLine?: string | null;
  ward?: string | null;
  city?: string | null;
}): string | null {
  const manh = [parts.addressLine, parts.ward, parts.city]
    .map((x) => (x ?? "").trim())
    .filter((x) => x.length > 0);
  return manh.length > 0 ? manh.join(", ") : null;
}
