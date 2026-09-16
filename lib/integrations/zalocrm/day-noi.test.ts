// lib/integrations/zalocrm/day-noi.test.ts — LƯỚI GHIM MÃ NGUỒN cho hai DÂY NỐI của
// tích hợp ZaloCRM. Khuôn: CLAUDE.md mục "Mẫu test: LƯỚI GHIM MÃ NGUỒN".
//
// 🔴 VÌ SAO CÓ FILE NÀY — hai lỗ tự khai khi rà lượt hợp nhất `main` → `test` (16/09/2026,
// `docs/hop-nhat-main-test-1609.md`). Cả hai cùng một hình dạng: HÀM THUẦN CÓ TEST, DÂY
// NỐI THÌ KHÔNG.
//
//   · `compose-url.test.ts` có 16 ca khoá `orgCodeCuaCoSo`/`duongDanNhanZalo`. Nhưng bỏ
//     `code: true` khỏi `select` của trang phiếu, hoặc bỏ tham số thứ ba ở chỗ gọi, thì
//     16 ca ấy VẪN XANH — và nút "Nhắn Zalo" lặng lẽ mất `?org=`. Hậu quả không phải nút
//     hỏng: nút vẫn mở, chỉ mở SAI CƠ SỞ, nên Sale kiêm CS1+CS2 bấm từ phiếu CS2 lại nhắn
//     bằng nick CS1 và dòng "đặt trước" bị từ chối vì lệch cơ sở ⇒ hội thoại không tự nối
//     vào phiếu. Đó đúng là toàn bộ giá trị của cái nút.
//   · `cap-quyen-nick.test.ts` có 14 ca khoá `capQuyenNickZalocrm`. Nhưng bỏ lời gọi nó
//     khỏi route cron thì 14 ca ấy VẪN XANH, và không ai được cấp quyền nick nữa.
//
// Đây đúng lớp lỗi đã làm mất BẢY tính năng ở lượt hợp nhất vừa rồi — thứ chỉ test bắt
// được, không phải mắt. Lần này bịt trước khi mất.
//
// ⚠️ LUẬT 11 (`docs/luat-doc-so-va-ket-luan.md`) — test grep mã nguồn là loại MONG MANH
// NHẤT. Ba kỷ luật áp ở đây:
//   · neo vào DẠNG LỜI GỌI (`ten(`), không neo tên trần: trong `page.tsx` tên trần
//     `duongDanNhanZalo` xuất hiện 3 lần mà chỉ 1 là lời gọi — hai lần kia là dòng
//     `import` và một chú thích. Neo tên trần thì xoá lời gọi đi lưới vẫn xanh.
//   · khẳng định SỐ LẦN khớp, không chỉ "có khớp".
//   · KHÔNG dùng cờ `/s`.
//
// ⚠️ Đọc theo `process.cwd()`: `import.meta.url` trong cấu hình vitest của repo này không
// phải URL dạng `file://` nên `fileURLToPath` ném.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function doc(duongDan: string): string {
  return readFileSync(resolve(process.cwd(), duongDan), "utf8");
}

/** Đếm số lần khớp — dùng cho mọi khẳng định, theo luật 11. */
function demKhop(nguon: string, mau: RegExp): number {
  return (nguon.match(new RegExp(mau.source, mau.flags.includes("g") ? mau.flags : mau.flags + "g")) ?? []).length;
}

describe("[ZC-DN-01] dây nối nút \"Nhắn Zalo\" — trang phiếu lead", () => {
  const DUONG_DAN = "app/(admin)/admin/leads/[id]/page.tsx";
  const nguon = doc(DUONG_DAN);

  it("`select` của `center` phải lấy `code` — thiếu nó là `?org=` biến mất", () => {
    // Bản HỎNG cần bắt: `center: { select: { name: true } },`
    // `[^}]*` cố ý KHÔNG vượt qua dấu `}`, nên phép khớp nằm gọn trong khối `select`
    // của riêng `center` — không mượn `code: true` của một khối khác trong cùng file
    // (file này có 4 chỗ `code: true`).
    const mau = /center:\s*\{\s*select:\s*\{[^}]*\bcode:\s*true/;
    expect(
      demKhop(nguon, mau),
      `${DUONG_DAN}: khối \`center: { select: … }\` phải khai \`code: true\``,
    ).toBe(1);
  });

  it("chỗ gọi `duongDanNhanZalo` phải truyền THAM SỐ THỨ BA dựng bằng `orgCodeCuaCoSo`", () => {
    // Bản HỎNG cần bắt: `duongDanNhanZalo(lead.phone, lead.id)` — hai tham số, hợp lệ
    // về kiểu (tham số thứ ba là tuỳ chọn) nên `tsc` KHÔNG kêu và mọi ca của
    // `compose-url.test.ts` vẫn xanh.
    const mau = /duongDanNhanZalo\(\s*[^)]*,\s*[^)]*,\s*orgCodeCuaCoSo\(/;
    expect(
      demKhop(nguon, mau),
      `${DUONG_DAN}: phải gọi \`duongDanNhanZalo(sdt, leadId, orgCodeCuaCoSo(…))\``,
    ).toBe(1);
  });

  it("`orgCodeCuaCoSo` phải đọc `Center.code` CỦA CHÍNH PHIẾU, không phải nguồn khác", () => {
    // Bản HỎNG cần bắt: truyền hằng, truyền cơ sở của người đang đăng nhập, hay
    // `orgCodeCuaCoSo(undefined, …)` — đều dựng ra URL không mang đúng cơ sở của phiếu.
    const mau = /orgCodeCuaCoSo\(\s*lead\.center\?\.code\s*,/;
    expect(
      demKhop(nguon, mau),
      `${DUONG_DAN}: tham số đầu của \`orgCodeCuaCoSo\` phải là \`lead.center?.code\``,
    ).toBe(1);
  });
});

describe("[ZC-DN-02] dây nối cấp quyền nick — route cron 5 phút", () => {
  const DUONG_DAN = "app/api/cron/zalocrm-doi-soat/route.ts";
  const nguon = doc(DUONG_DAN);

  it("route PHẢI gọi `capQuyenNickZalocrm()`", () => {
    // Bản HỎNG cần bắt: route chỉ còn `doiSoatZalocrm()`. Không có lỗi biên dịch, không
    // có ca nào đỏ, và triệu chứng ngoài đời là "nick có tin mà không ai đọc được".
    // Neo dạng LỜI GỌI: tên trần `capQuyenNickZalocrm` có 2 lần trong file (1 là `import`).
    expect(
      demKhop(nguon, /capQuyenNickZalocrm\(\)/),
      `${DUONG_DAN}: khe cron 5 phút phải chạy cấp quyền nick`,
    ).toBe(1);
  });

  it("THỨ TỰ: cấp quyền TRƯỚC, nạp bù tin SAU", () => {
    // Thứ tự có nghĩa, không phải sở thích: nạp bù tin cho một nick mà người ta chưa
    // được cấp quyền đọc thì tin về nằm đó không ai thấy — lưới bù mất tác dụng đúng
    // lượt nó cần có tác dụng. Đảo hai dòng là hỏng câm hoàn hảo: cùng số lời gọi, cùng
    // kết quả trả về, chỉ sai ở thứ tự.
    const iQuyen = nguon.search(/capQuyenNickZalocrm\(\)/);
    const iTin = nguon.search(/doiSoatZalocrm\(\)/);
    expect(iQuyen, `${DUONG_DAN}: không tìm thấy lời gọi cấp quyền nick`).toBeGreaterThan(-1);
    expect(iTin, `${DUONG_DAN}: không tìm thấy lời gọi đối soát tin`).toBeGreaterThan(-1);
    expect(
      iQuyen,
      `${DUONG_DAN}: \`capQuyenNickZalocrm()\` phải đứng TRƯỚC \`doiSoatZalocrm()\``,
    ).toBeLessThan(iTin);
  });
});
