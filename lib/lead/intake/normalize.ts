import type { CenterHint } from "./types";

// =============================================================================
// LEAD INTAKE — các hàm THUẦN dùng chung giữa các mapper.
// Không import DB, không import server-only → test được bằng unit test thuần.
// =============================================================================

/**
 * Chuẩn hoá chuỗi tiếng Việt để SO KHỚP (không phải để hiển thị):
 * bỏ dấu, về chữ thường, gộp mọi khoảng trắng thành 1 dấu cách.
 *
 * Cần vì cùng một cơ sở được ghi mỗi nơi một kiểu — dữ liệu thật của sheet
 * quatang có cả `"114 Hoàng Diệu"` (bản cũ) lẫn
 * `"Cơ sở 2 - 114 Hoàng Diệu, Đà Nẵng"` (bản mới).
 */
export function normalizeVi(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // dấu thanh + dấu mũ
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Trim + rỗng thành `null` (đừng ghi chuỗi rỗng xuống DB). */
export function str(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return s.length > 0 ? s : null;
}

/**
 * Tên phụ huynh hiển thị khi phiếu KHÔNG có ô tên PH hoặc PH bỏ trống.
 *
 * Có thật ở CẢ HAI nguồn: form MISA chỉ bắt buộc `LastName` (tên HỌC SINH),
 * còn sheet quatang có cả một đợt bỏ trống hẳn cột tên PH. `Lead.parentName`
 * là NOT NULL ⇒ không có fallback thì lead rụng hết ngay ngày đầu.
 */
export function parentNameFallback(childName: string | null): string {
  return childName ? `PH của ${childName}` : "Phụ huynh (chưa rõ tên)";
}

/** Cơ sở nguồn gửi dạng số thứ tự ("1", "2") → mã cơ sở của repo ("CS1"). */
export function centerHintFromIndex(raw: unknown): CenterHint | null {
  const s = String(raw ?? "").trim();
  return /^[1-9][0-9]*$/.test(s) ? { kind: "code", value: `CS${s}` } : null;
}

/** Cơ sở nguồn gửi dạng chuỗi tự do → giữ nguyên để tầng ingest so khớp DB. */
export function centerHintFromText(raw: unknown): CenterHint | null {
  const s = str(raw);
  return s ? { kind: "text", value: s } : null;
}

export type CenterRow = {
  id: string;
  code: string | null;
  name: string;
  address: string;
};

/**
 * Khớp gợi ý cơ sở với danh sách cơ sở ĐỌC TỪ DB → trả `Center.id`.
 *
 * Hàm thuần (nhận sẵn `centers`) để test không cần DB, và để việc "mở CS3 chỉ
 * là thêm data" thành thật: không có danh sách cơ sở nào hardcode ở đây.
 *
 * Thứ tự khớp — chặt trước, lỏng sau:
 *   1. `code` bằng nhau (đường của form Sale: "1" → "CS1").
 *   2. `name` bằng nhau.
 *   3. `address` của cơ sở là CHUỖI CON của chuỗi nguồn gửi. Đây là đường của
 *      quatang: `"Cơ sở 2 - 114 Hoàng Diệu, Đà Nẵng"` chứa `"114 Hoàng Diệu"`.
 *      So bằng `===` sẽ trượt toàn bộ — dữ liệu thật đã đổi cách ghi 1 lần rồi.
 *
 * Khớp được ĐÚNG 1 cơ sở mới nhận; mơ hồ (≥2) ⇒ `null`, để lead rơi về
 * auto-chia thay vì đoán bừa rồi giao nhầm cơ sở.
 */
export function matchCenter(
  hint: CenterHint | null | undefined,
  centers: readonly CenterRow[],
): string | null {
  if (!hint) return null;
  const needle = normalizeVi(hint.value);
  if (!needle) return null;

  if (hint.kind === "code") {
    const hit = centers.filter((c) => c.code && normalizeVi(c.code) === needle);
    return hit.length === 1 ? hit[0]!.id : null;
  }

  const byCode = centers.filter((c) => c.code && normalizeVi(c.code) === needle);
  if (byCode.length === 1) return byCode[0]!.id;

  const byName = centers.filter((c) => normalizeVi(c.name) === needle);
  if (byName.length === 1) return byName[0]!.id;

  const byAddress = centers.filter((c) => {
    const addr = normalizeVi(c.address);
    return addr.length >= 5 && needle.includes(addr);
  });
  return byAddress.length === 1 ? byAddress[0]!.id : null;
}

/**
 * Hai tên con có phải CÙNG một đứa không (so sánh đã bỏ dấu/hoa-thường).
 * Dùng cho luật "trùng SĐT nhưng khác con thì gắn thêm `LeadChild`".
 */
export function isSameChildName(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return normalizeVi(a) === normalizeVi(b);
}

/** Ghép các dòng ghi chú + cảnh báo thành `Lead.note`. Rỗng ⇒ `null`. */
export function buildNote(
  noteLines: readonly string[],
  warnings: readonly string[],
): string | null {
  const lines = [
    ...noteLines.filter(Boolean),
    ...warnings.filter(Boolean).map((w) => `⚠️ ${w}`),
  ];
  return lines.length > 0 ? lines.join("\n") : null;
}
