// lib/lead/note-view.ts — tách `Lead.note` thành phần NGƯỜI GÕ và phần MÁY GHI.
//
// Vì sao cần (chủ dự án báo 24/08/2026): `Lead.note` là MỘT ô chữ, nhưng thực
// tế có hai tác giả. Đường nhập (`lib/lead/intake/*`) ghép bằng `buildNote()`:
//
//     Nhân viên nhập: SR.NV.002          ← máy ghi (dấu vết)
//     con 6 tuổi, muốn học trải nghiệm   ← NGƯỜI nhập gõ
//     ⚠️ "SR.NV.002" không giữ vai Sale nên không nhận lead — đã chia tự động…
//                                        ← máy ghi (chẩn đoán vận hành)
//
// Sale mở phiếu ra chỉ cần đọc câu giữa. Hai dòng kia là chuyện nội bộ của hệ
// thống — với người chăm khách nó vừa nhiễu vừa khó hiểu ("tôi làm sai gì?"),
// nên chỉ người có `leads:view-all` (quản lý/quản trị) mới thấy.
//
// ⚠️ Tách để HIỂN THỊ thôi thì chưa đủ, còn đường SỬA. Ô ghi chú ở màn sửa và ở
// ngăn kéo danh sách đều nạp thẳng `Lead.note` rồi ghi đè nguyên chuỗi. Nếu chỉ
// đưa phần người gõ vào ô đó mà lúc lưu không ráp lại, thì lần sửa đầu tiên sẽ
// XOÁ SẠCH dấu vết người nhập — thứ mà cột `createdById` mới thay thế được từ
// 23/08, còn 101 phiếu cũ thì chỉ có dòng chữ này. Vì vậy file có `mergeLeadNote`
// và MỌI đường ghi `note` phải đi qua nó.
//
// Cách phân loại: dòng máy ghi luôn mở đầu bằng một nhãn cố định (danh sách dưới)
// hoặc bằng "⚠️ " (`buildNote` gắn cho mọi warning). Còn lại là của người.

/**
 * Nhãn mở đầu của các dòng do MÁY ghi vào `Lead.note`.
 *
 * Nguồn: mọi chỗ `noteLines.push(...)` trong repo —
 * `map-internal-form.ts`, `map-sale-form.ts`, `map-quatang.ts`,
 * `app/api/public/lead-intake/sale-form/route.ts`.
 *
 * Thêm dòng máy ghi mới ở đâu thì khai vào đây, không thì nó rơi sang phần
 * "người gõ" và hiện lại đúng chỗ ta vừa dọn.
 */
const SYSTEM_LINE_PREFIXES = [
  "Nhân viên nhập:",
  "Người nhập (đã đăng nhập):",
  "Link Facebook (chưa đọc được):",
  "Tỉnh/TP:",
  "Địa chỉ:",
  "NV giới thiệu:",
  "Mã link giới thiệu:",
  "Aff clickId:",
  "UTM:",
] as const;

/** Tiền tố `buildNote()` gắn cho mọi cảnh báo. */
const WARNING_PREFIX = "⚠️";

export type LeadNoteView = {
  /** Đúng những gì người nhập gõ. `null` khi phiếu không có chữ nào của người. */
  human: string | null;
  /** Dòng dấu vết máy ghi (mã NV, tỉnh/TP, attribution…). */
  info: string[];
  /** Dòng cảnh báo, GIỮ NGUYÊN tiền tố "⚠️ " như đang lưu. */
  warnings: string[];
};

function isSystemInfoLine(line: string): boolean {
  return SYSTEM_LINE_PREFIXES.some((p) => line.startsWith(p));
}

/**
 * Bổ `Lead.note` thành 3 phần. Không bao giờ ném lỗi và không bao giờ làm rơi
 * chữ: mọi dòng đều rơi vào đúng một trong ba nhóm.
 */
export function splitLeadNote(note: string | null | undefined): LeadNoteView {
  if (!note) return { human: null, info: [], warnings: [] };

  const info: string[] = [];
  const warnings: string[] = [];
  const humanLines: string[] = [];

  for (const line of note.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(WARNING_PREFIX)) warnings.push(line);
    else if (isSystemInfoLine(trimmed)) info.push(line);
    else humanLines.push(line);
  }

  // Cắt dòng trống thừa ở hai đầu — sau khi bốc dòng máy ra, phần người gõ hay
  // còn lại một dòng trắng ở đầu trông như ghi chú rỗng.
  while (humanLines.length > 0 && humanLines[0]!.trim() === "") humanLines.shift();
  while (humanLines.length > 0 && humanLines[humanLines.length - 1]!.trim() === "") {
    humanLines.pop();
  }

  return {
    human: humanLines.length > 0 ? humanLines.join("\n") : null,
    info,
    warnings,
  };
}

/** Phiếu này có gì để khoe với quản lý không (dùng để ẩn hẳn khối rỗng). */
export function hasSystemLines(view: LeadNoteView): boolean {
  return view.info.length > 0 || view.warnings.length > 0;
}

/**
 * Ráp phần người vừa gõ lại với phần máy ghi của bản CŨ → chuỗi để lưu.
 *
 * Thứ tự dựng lại đúng bố cục `buildNote()` (dấu vết → nội dung người → cảnh
 * báo) để phiếu cũ và phiếu mới trông giống nhau.
 *
 * @param human    nội dung ô ghi chú người dùng vừa nhập (đã là phần của họ).
 * @param previous chuỗi `Lead.note` đang lưu trong DB — nguồn của phần máy ghi.
 */
export function mergeLeadNote(
  human: string | null | undefined,
  previous: string | null | undefined,
): string | null {
  const { info, warnings } = splitLeadNote(previous);
  const body = (human ?? "").trim();

  const lines = [...info, ...(body ? [body] : []), ...warnings];
  return lines.length > 0 ? lines.join("\n") : null;
}
