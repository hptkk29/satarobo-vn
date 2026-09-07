/**
 * scripts/_kiem-quyen.ts — in ra AI đang kết nối và có ghi được không.
 *
 * Vì sao cần: từ 07/09/2026 workflow đo prod chạy bằng user CHỈ-ĐỌC riêng. Nhưng "chỉ đọc" là một
 * lời hứa ở tầng cấu hình — secret có thể bị đặt nhầm sang chuỗi đầy quyền mà không ai biết, vì
 * GitHub không cho đọc lại secret để đối chiếu.
 *
 * Bản thân phép kiểm này là SELECT thuần (`current_user`, `has_table_privilege`) — không thử ghi,
 * không đụng dữ liệu. Nó không CHẶN được gì; nó chỉ làm cho việc chạy nhầm user hiện ra trong log
 * ngay dòng đầu, thay vì lộ ra sau khi đã ghi.
 */
import type { PrismaClient } from "@prisma/client";

export type ThongTinKetNoi = {
  nguoiDung: string;
  /** null = không kiểm được (bảng chưa tồn tại, hoặc thiếu quyền đọc catalog). */
  ghiDuoc: boolean | null;
  docDuoc: boolean | null;
};

/**
 * Hỏi Postgres xem phiên hiện tại là ai và có quyền UPDATE trên một bảng đại diện không.
 *
 * Dùng `ClassSession` làm bảng đại diện vì cả hai script đo đều đọc nó — quyền trên chính bảng
 * mình sắp đọc mới là quyền có ý nghĩa.
 */
export async function kiemQuyen(db: PrismaClient): Promise<ThongTinKetNoi> {
  try {
    const r = await db.$queryRaw<
      { nguoi_dung: string; ghi_duoc: boolean | null; doc_duoc: boolean | null }[]
    >`
      SELECT current_user::text AS nguoi_dung,
             has_table_privilege(current_user, 'public."ClassSession"', 'UPDATE') AS ghi_duoc,
             has_table_privilege(current_user, 'public."ClassSession"', 'SELECT') AS doc_duoc
    `;
    const row = r[0];
    if (!row) return { nguoiDung: "(không đọc được)", ghiDuoc: null, docDuoc: null };
    return { nguoiDung: row.nguoi_dung, ghiDuoc: row.ghi_duoc, docDuoc: row.doc_duoc };
  } catch {
    // Không kiểm được thì nói KHÔNG BIẾT, đừng báo "an toàn".
    return { nguoiDung: "(không đọc được)", ghiDuoc: null, docDuoc: null };
  }
}

/** In một dòng tự khai ở đầu log. `chieuGhi` = script này có ý định ghi hay không. */
export function inQuyen(t: ThongTinKetNoi, chieuGhi: boolean): void {
  const nhan = t.ghiDuoc === null ? "không rõ" : t.ghiDuoc ? "CÓ QUYỀN GHI" : "chỉ đọc";
  console.log(`[quyen] user=${t.nguoiDung} · ${nhan}`);
  if (!chieuGhi && t.ghiDuoc === true) {
    console.log(
      "[quyen] ⚠️ Đang chạy ở chế độ ĐO nhưng kết nối CÓ QUYỀN GHI. Script này không ghi gì,\n" +
        "        nhưng nếu đây là workflow đo prod thì secret đang trỏ nhầm sang chuỗi đầy quyền.",
    );
  }
  if (t.docDuoc === false) {
    console.log(
      "[quyen] ⚠️ User này KHÔNG có quyền SELECT trên ClassSession — mọi số dưới đây sẽ là 0 và\n" +
        "        con số 0 đó KHÔNG phải sự thật. Xem docs/cham-cong/USER-CHI-DOC-PROD.md.",
    );
  }
}
