// lib/lead/intake/map-internal-form.ts — G-D (biên bản chốt 4 cổng, 21/08/2026).
//
// Mapper cho biểu mẫu "Nhập khách hàng" bản CÓ ĐĂNG NHẬP (`/admin/nhap-khach-hang`).
//
// Khác biểu mẫu tĩnh `public/sale/nhap-lieu.html` ở đúng một điểm bản chất:
// **mã nhân viên không còn là một ô để gõ**, mà lấy từ phiên đăng nhập. Người
// nhập không gõ sai được, không gõ hộ nhau được, và không cần nhớ mã của mình.
//
// Giữ nguyên mọi thứ còn lại của đường nhập đang chạy: vẫn trả `MappedLead` để
// `ingestIntakeLead()` xử lý (chuẩn hoá SĐT, chống trùng, tra cơ sở, tra người
// phụ trách theo mã NV, tự chia). KHÔNG mở đường ghi lead thứ hai.
import { canonicalPhone } from "@/lib/phone";
import { centerHintFromCode, parentNameFallback, str } from "./normalize";
import type { MapResult } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Dữ liệu người nhập gõ trên biểu mẫu (đã qua zod ở tầng action). */
export type InternalFormInput = {
  /** Có thể rỗng: mapper suy từ tên bé + cảnh báo, chỉ từ chối khi thiếu cả hai. */
  parentName: string | null;
  phone: string;
  childName?: string | null;
  schoolName?: string | null;
  gradeLevel?: string | null;
  /** Mã cơ sở thật (`Center.code`), vd "CS1" — không phải số thứ tự của form cũ. */
  centerCode?: string | null;
  email?: string | null;
  note?: string | null;
};

/** Danh tính người nhập, lấy từ phiên đăng nhập — KHÔNG lấy từ payload. */
export type InternalFormStaff = {
  /** `Employee.employeeCode` của tài khoản đang đăng nhập; null nếu chưa gắn. */
  employeeCode: string | null;
  /** Tên hiển thị để ghi vết khi chưa có mã nhân viên. */
  displayName: string;
};

export function mapInternalForm(
  input: InternalFormInput,
  staff: InternalFormStaff,
): MapResult {
  const phone = canonicalPhone(str(input.phone) ?? "");
  if (!phone) return { ok: false, error: "Số điện thoại không hợp lệ" };

  const warnings: string[] = [];
  const noteLines: string[] = [];

  const childName = str(input.childName);
  let parentName = str(input.parentName) ?? "";
  if (!parentName) {
    // Khác biểu mẫu công khai: đây là người NHÀ MÌNH đang ngồi gõ và hỏi được
    // khách ngay. Phiếu không có cả tên phụ huynh lẫn tên bé thì trả lại để hỏi
    // tiếp, thay vì đẻ ra một lead "Phụ huynh (chưa rõ tên)" không ai gọi nổi.
    if (!childName) {
      return { ok: false, error: "Cần ít nhất tên phụ huynh hoặc tên bé" };
    }
    parentName = parentNameFallback(childName);
    warnings.push("Phiếu không có tên phụ huynh — cần hỏi lại khi gọi.");
  }

  // Email là ô phụ: sai định dạng thì bỏ qua + nói ra, không chặn cả phiếu.
  const rawEmail = str(input.email);
  let email: string | null = null;
  if (rawEmail) {
    if (EMAIL_RE.test(rawEmail)) email = rawEmail;
    else warnings.push(`Email "${rawEmail}" sai định dạng — chưa lưu, hỏi lại giúp.`);
  }

  // Dấu vết người nhập. Có mã NV thì tầng ingest còn dùng nó để tra người phụ
  // trách; chưa có mã thì ít nhất phải biết ai đã nhập, nếu không là mất dấu.
  if (staff.employeeCode) {
    noteLines.push(`Nhân viên nhập: ${staff.employeeCode}`);
  } else {
    noteLines.push(`Nhân viên nhập: ${staff.displayName} (chưa gắn mã nhân viên)`);
    warnings.push(
      "Tài khoản người nhập chưa gắn mã nhân viên — lead không tự giao cho người nhập được.",
    );
  }

  const note = str(input.note);
  if (note) noteLines.push(note);

  return {
    ok: true,
    lead: {
      parentName,
      phone,
      email,
      centerHint: centerHintFromCode(input.centerCode),
      child: childName
        ? {
            fullName: childName,
            schoolName: str(input.schoolName),
            gradeLevel: str(input.gradeLevel),
          }
        : null,
      // ⭐ Điểm khác biệt của G-D: danh tính đến từ phiên, không từ ô nhập.
      employeeCode: staff.employeeCode,
      noteLines,
      // Giữ đúng hành vi của phiếu Sale đang chạy (nhân viên nhập hộ khi tư vấn
      // trực tiếp, không có ô tick). Đổi giá trị này là đổi nghiệp vụ consent —
      // phải là một quyết định riêng, không kèm lén vào đây.
      consentMarketing: true,
      // Phiếu nội bộ không mang mã từ hệ ngoài ⇒ chống trùng dựa trên SĐT.
      externalId: null,
      warnings,
    },
  };
}
