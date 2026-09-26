// lib/agents/tools/trang.ts — phân trang dùng chung cho mọi công cụ trả DANH SÁCH (spec §7.2, §9).
//
// Spec: "Mọi công cụ nhận thêm `gioi_han?` và `con_tro?` nếu trả danh sách" — `gioi_han` mặc
// định 200, tối đa 500; `meta.tiep_theo` là con trỏ trang sau, `null` nếu hết.
//
// ── VÌ SAO CON TRỎ LÀ VỊ TRÍ (offset) CHỨ KHÔNG PHẢI KHOÁ ─────────────────────────────
// Các công cụ Đợt 1 hoặc là danh mục nhỏ (vài chục dòng), hoặc GỘP nhiều nguồn khác bảng
// (`lay_dang_ky`: ghi danh + học thử + hoàn tiền) — không có một cột khoá chung để làm con trỏ
// keyset. Mỗi công cụ tự sắp THỨ TỰ ỔN ĐỊNH (có cột phá hoà là id) rồi mới cắt, nên offset
// cho ra đúng trang kế miễn là dữ liệu không đổi giữa hai lượt. Dữ liệu đổi giữa chừng thì
// agent có thể thấy lặp/lỡ một dòng — chấp nhận được cho việc ĐỌC báo cáo, và ghi rõ trong
// README. Công cụ nào sau này cần chính xác tuyệt đối (lead, hội thoại) thì đổi sang keyset.
//
// Con trỏ là chuỗi mờ (base64url) để agent không tự chế số; sai khuôn ⇒ THAM_SO_SAI kèm TÊN
// trường `con_tro`, không lặp lại giá trị đã gửi (ca B7).
import { z } from "zod";

export const GIOI_HAN_MAC_DINH = 200;
export const GIOI_HAN_TOI_DA = 500;
/** Chặn con trỏ trỏ tới vị trí vô lý (không ai đọc 1 triệu dòng qua cổng này). */
const VI_TRI_TOI_DA = 1_000_000;

/** Hai tham số phân trang — trộn vào `z.object({...})` của công cụ. */
export const thamSoTrang = {
  gioi_han: z.number().int().min(1).max(GIOI_HAN_TOI_DA).optional(),
  con_tro: z.string().min(1).max(64).optional(),
};

export type ThamSoTrang = { gioi_han?: number; con_tro?: string };

export function maHoaConTro(viTri: number): string {
  return Buffer.from(JSON.stringify({ o: viTri }), "utf8").toString("base64url");
}

/** Con trỏ → vị trí. Sai khuôn ⇒ null (người gọi báo THAM_SO_SAI). */
export function giaiMaConTro(conTro: string): number | null {
  if (!/^[A-Za-z0-9_-]+$/.test(conTro)) return null;
  try {
    const v: unknown = JSON.parse(Buffer.from(conTro, "base64url").toString("utf8"));
    if (!v || typeof v !== "object") return null;
    const o = (v as { o?: unknown }).o;
    if (typeof o !== "number" || !Number.isInteger(o) || o < 0 || o > VI_TRI_TOI_DA) return null;
    return o;
  } catch {
    return null;
  }
}

/** Dùng trong `kiemThem` của công cụ: trả `["con_tro"]` nếu con trỏ hỏng. */
export function kiemConTro(i: ThamSoTrang): string[] {
  return i.con_tro !== undefined && giaiMaConTro(i.con_tro) === null ? ["con_tro"] : [];
}

/**
 * Cắt một trang từ danh sách ĐÃ SẮP THỨ TỰ ỔN ĐỊNH. Cỡ trang = min(gioi_han ?? 200, trần
 * `maxRowsPerCall` của cổng) — trần cổng thắng, không thì bước 12 sẽ từ chối cả lượt vì
 * vượt trần (LECH_KHUON) trong khi lỗi nằm ở chỗ công cụ tự cắt quá tay.
 */
export function catTrang<T>(
  ds: readonly T[],
  i: ThamSoTrang,
  hanMuc: { maxRowsPerCall: number },
): { duLieu: T[]; tiepTheo: string | null } {
  const co = Math.max(1, Math.min(i.gioi_han ?? GIOI_HAN_MAC_DINH, hanMuc.maxRowsPerCall));
  const batDau = i.con_tro === undefined ? 0 : (giaiMaConTro(i.con_tro) ?? 0);
  const duLieu = ds.slice(batDau, batDau + co);
  const ke = batDau + co;
  return { duLieu, tiepTheo: ke < ds.length ? maHoaConTro(ke) : null };
}
