// lib/agents/ten-cong-cu.ts — tên công cụ của Cổng dữ liệu agent (spec §3).
//
// Một công cụ có HAI tên:
//   · tên sổ   `<nhóm>.<động_từ>_<đối_tượng>` — dùng ở REST, sổ công cụ, nhật ký.
//   · tên MCP  thay "." bằng "__" — MCP và Claude API chỉ nhận [a-zA-Z0-9_-], ≤ 64 ký tự,
//     nên dấu chấm làm agent lỗi ngay lượt đầu (spec §3, dòng 106-107).
// Đổi qua lại ở MỘT chỗ này. Đừng tự `replace(".", "__")` tại chỗ gọi: `String.replace`
// với chuỗi chỉ thay LẦN ĐẦU, và tên có hai dấu chấm sẽ ra tên MCP sai mà không ai báo.

/** Tên sổ hợp lệ: đúng MỘT dấu chấm, chữ thường/số/gạch dưới, bắt đầu bằng chữ. */
export const TEN_SO_RE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

/** Tên MCP hợp lệ theo ràng buộc của Claude API. */
export const TEN_MCP_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export function laTenSoHopLe(ten: string): boolean {
  return TEN_SO_RE.test(ten) && TEN_MCP_RE.test(ten.replace(".", "__"));
}

/** "kinh_doanh.lay_leads" → "kinh_doanh__lay_leads". Ném lỗi nếu tên sổ sai khuôn. */
export function tenMcp(tenSo: string): string {
  if (!laTenSoHopLe(tenSo)) throw new Error(`Tên công cụ sai khuôn: "${tenSo}"`);
  return tenSo.replace(".", "__");
}

/** Chiều ngược lại. Trả `null` nếu không phải tên MCP của một tên sổ hợp lệ. */
export function tuTenMcp(ten: string): string | null {
  const i = ten.indexOf("__");
  if (i <= 0) return null;
  const tenSo = `${ten.slice(0, i)}.${ten.slice(i + 2)}`;
  return laTenSoHopLe(tenSo) ? tenSo : null;
}
