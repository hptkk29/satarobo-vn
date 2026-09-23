/**
 * QUYỀN TRÊN MỘT CASE TRẢI NGHIỆM — hàm THUẦN, một chỗ duy nhất.
 *
 * Chủ dự án 23/09/2026: "sale được tuỳ thích gỡ gắn học viên vào case của mình, sale 1
 * cũng được gắn vào case của sale 2 được, nhưng sale 1 không thể gỡ học viên của sale 2
 * được, và sale cũng không thể xoá hoặc huỷ lớp".
 *
 * ── VÌ SAO TRẢ VỀ LÝ DO, KHÔNG PHẢI BOOLEAN ──────────────────────────────────────────
 * Một nút bị ẩn im lặng và một nút bấm vào thì báo lỗi đều để người dùng tự đoán. Luật
 * 12 của repo: affordance phải NÓI THẬT. Nên mỗi câu trả lời "không" mang theo câu chữ
 * mà giao diện in thẳng ra — và chính câu đó cũng là thông báo của Server Action, nên
 * hai cửa không thể nói hai kiểu.
 *
 * ── VÌ SAO "CỦA TÔI" ĐO BẰNG LEAD, KHÔNG BẰNG NGƯỜI GẮN ──────────────────────────────
 * Chủ dự án chốt: "chủ của lead thì gắn gỡ, ngoài ra qlcs/đào tạo hoặc admin gắn thì
 * sale chủ lead vẫn gỡ bth". Tức `TrialEnrollment.addedById` KHÔNG phải nguồn — nếu đo
 * bằng nó thì Quản lý cơ sở gắn hộ một lần là Sale chủ lead mất quyền gỡ chính khách
 * của mình, phải đi nhờ lại. Nguồn là `laLeadCuaToi` — cùng định nghĩa "lead của tôi"
 * mà `/admin/leads` và cửa GẮN đang dùng, không phải bản chép thứ hai.
 *
 * ⚠️ Hai câu hỏi KHÁC NHAU, đừng gộp:
 *   · Sửa/xoá CASE  → đo bằng NGƯỜI TẠO CASE (`TrialClassSession.createdById`).
 *   · Gỡ HỌC VIÊN   → đo bằng CHỦ LEAD của bé đó.
 * Một Sale có thể gỡ bé của mình ra khỏi case của người khác (đúng: đó là khách của
 * họ), nhưng không được sửa giờ case đó (đúng: đó là lịch hẹn của người khác).
 */
import { laLeadCuaToi } from "@/lib/lead/sharing";

export type KetQuyen = { duoc: true } | { duoc: false; lyDo: string };

const DUOC: KetQuyen = { duoc: true };

/**
 * Sửa giờ / phòng / giáo viên của một case, hoặc huỷ case đó.
 *
 * `nguoiTaoId === null` là case tạo TRƯỚC 23/09/2026 (cột `createdById` không backfill).
 * Những case đó **chỉ Quản lý cơ sở / Đào tạo đụng được**: không biết ai tạo thì cho
 * bất kỳ Sale nào sửa là mở toang, còn khoá hết mọi người thì lớp cũ không sửa nổi.
 */
export function quyenSuaCase(input: {
  nguoiTaoId: string | null;
  userId: string;
  /** Có `trials:create-class` — Quản lý cơ sở · Đào tạo · Quản trị tối cao. */
  laQuanLy: boolean;
}): KetQuyen {
  if (input.laQuanLy) return DUOC;
  if (input.nguoiTaoId === null) {
    return {
      duoc: false,
      lyDo:
        "Case này tạo trước 23/09/2026 nên hệ thống không biết của ai — " +
        "nhờ Quản lý cơ sở hoặc Đào tạo sửa hộ.",
    };
  }
  if (input.nguoiTaoId === input.userId) return DUOC;
  return {
    duoc: false,
    lyDo: "Case này do người khác tạo. Bạn xem được, nhưng chỉ người tạo hoặc Quản lý cơ sở mới sửa được giờ, phòng và giáo viên.",
  };
}

/**
 * Gỡ một học viên khỏi lớp / khỏi case.
 *
 * `lead === null` = bé không còn lead nào trỏ tới (lead đã xoá). Không suy ra chủ được
 * nên chỉ Quản lý cơ sở gỡ — fail-closed, và nói rõ vì sao.
 */
export function quyenGoHocVien(input: {
  lead: { assignedToId: string | null; createdById: string | null; isSharedWithTeam: boolean } | null;
  userId: string;
  /** Có `leads:view-all` — Quản lý cơ sở · Đào tạo · Marketing Hội sở. */
  laQuanLy: boolean;
  /** Tên Sale đang phụ trách lead, CHỈ để viết câu lỗi. Không tham gia phép quyết định. */
  tenSale?: string | null;
}): KetQuyen {
  if (input.laQuanLy) return DUOC;
  if (!input.lead) {
    return {
      duoc: false,
      lyDo: "Không tra được lead của bé này (lead đã xoá) — nhờ Quản lý cơ sở gỡ hộ.",
    };
  }
  if (laLeadCuaToi(input.lead, input.userId)) return DUOC;
  const ten = (input.tenSale ?? "").trim();
  return {
    duoc: false,
    lyDo: ten
      ? `Bé này thuộc lead của ${ten}. Bạn gắn thêm bé vào case được, nhưng chỉ người phụ trách lead hoặc Quản lý cơ sở mới gỡ được.`
      : "Bé này thuộc lead của Sale khác. Bạn gắn thêm bé vào case được, nhưng chỉ người phụ trách lead hoặc Quản lý cơ sở mới gỡ được.",
  };
}

/**
 * Xoá cả một case khi trong đó CÓ học viên của người khác.
 *
 * Vì sao phải hỏi riêng: `quyenSuaCase` chỉ nhìn người tạo case, nên chủ case sẽ xoá
 * được một case đang chứa khách của Sale khác — và bé đó rơi ra khỏi lịch hẹn mà người
 * phụ trách không hề biết. Xoá case là một lượt gỡ hàng loạt trá hình.
 *
 * `soHocVienNguoiKhac` đếm những bé mà NGƯỜI ĐANG BẤM không có quyền gỡ (tính bằng
 * `quyenGoHocVien` ở đường gọi — đừng đếm bằng luật thứ hai).
 */
export function quyenXoaCase(input: {
  nguoiTaoId: string | null;
  userId: string;
  laQuanLy: boolean;
  soHocVienNguoiKhac: number;
}): KetQuyen {
  const sua = quyenSuaCase(input);
  if (!sua.duoc) return sua;
  if (input.laQuanLy) return DUOC;
  if (input.soHocVienNguoiKhac > 0) {
    return {
      duoc: false,
      lyDo:
        `Case đang có ${input.soHocVienNguoiKhac} học viên của Sale khác. ` +
        "Xoá case là gỡ luôn lịch hẹn của họ — nhờ họ gỡ bé ra trước, hoặc nhờ Quản lý cơ sở xoá.",
    };
  }
  return DUOC;
}
