// lib/agents/tools/danh-muc/vai-nguoi.ts — "vai nào là CHỨC DANH của một người". THUẦN.
//
// Chủ dự án chốt 26/09/2026: chức danh = mã VAI phân quyền (`RoleDef.code`). Hai công cụ dùng
// chung luật này — `lay_chuc_danh` (danh mục) và `lay_nhan_su` (chức danh của từng người) —
// để mã agent thấy ở hai nơi luôn khớp nhau.
import { RELATIONSHIP_ROLE_CODES } from "@/lib/auth/actor";

/** Tiền tố vai của USER DỊCH VỤ (`lib/agents/quan-tri/client.ts` chỉ nhận vai `AGENT_…`). */
export const TIEN_TO_VAI_DICH_VU = "AGENT_";

/**
 * Vai có phải chức danh của NGƯỜI không. Loại:
 *   · vai quan hệ (Phụ huynh) — không đứng trong cây tổ chức, không phải nhân sự;
 *   · vai dịch vụ `AGENT_*` — gán cho tài khoản máy, không bao giờ cho người.
 */
export function laVaiCuaNguoi(code: string): boolean {
  if ((RELATIONSHIP_ROLE_CODES as readonly string[]).includes(code)) return false;
  return !code.startsWith(TIEN_TO_VAI_DICH_VU);
}

/**
 * Thứ tự chọn khi một người giữ nhiều vai — CHỈ để hiển thị một chức danh, KHÔNG phải luật
 * quyền (quyền = hợp mọi vai, `can()`). Vai quản lý/chức năng trước vai tác nghiệp; hai vai
 * hệ thống (`KY_THUAT`, `SUPER_ADMIN`) cuối cùng vì chúng là quyền quản trị phần mềm chứ
 * không nói người đó làm nghề gì. Vai mới chưa có ở đây xếp sau, theo mã (ổn định).
 */
const THU_TU: readonly string[] = [
  "GIAM_DOC",
  "CENTER_MANAGER",
  "HO_ACCOUNTANT",
  "HO_HR",
  "HO_MARKETING",
  "HO_SALE",
  "TRAINING",
  "CENTER_CLASS_MANAGER",
  "CENTER_SALES_CSM",
  "CENTER_ACCOUNTANT",
  "CENTER_HR",
  "TEACHER",
  "ASSISTANT_TEACHER",
  "AUDITOR",
  "KY_THUAT",
  "SUPER_ADMIN",
];

function hang(code: string): number {
  const i = THU_TU.indexOf(code);
  return i === -1 ? THU_TU.length : i;
}

/**
 * Chọn MỘT chức danh cho một người từ các vai đang hiệu lực.
 *   1. Vai neo tại ĐÚNG đơn vị làm việc của người đó thắng vai neo nơi khác (vai neo Hội sở
 *      của một nhân sự cơ sở thường là quyền chức năng chồng thêm, không phải nghề chính).
 *   2. Hoà thì theo `THU_TU`, rồi theo mã.
 * Không vai nào hợp lệ ⇒ "" (khuôn đòi chuỗi; rỗng = chưa gán vai, nói thật là không có).
 */
export function chonChucDanh(
  vai: readonly { code: string; orgUnitId: string }[],
  donViLamViec: string | null,
): string {
  const hopLe = vai.filter((v) => laVaiCuaNguoi(v.code));
  if (hopLe.length === 0) return "";
  const sap = [...hopLe].sort((a, b) => {
    const neoA = donViLamViec !== null && a.orgUnitId === donViLamViec ? 0 : 1;
    const neoB = donViLamViec !== null && b.orgUnitId === donViLamViec ? 0 : 1;
    if (neoA !== neoB) return neoA - neoB;
    const h = hang(a.code) - hang(b.code);
    return h !== 0 ? h : a.code.localeCompare(b.code);
  });
  return sap[0]!.code;
}
