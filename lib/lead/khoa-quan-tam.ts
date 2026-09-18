/**
 * KHOÁ QUAN TÂM CỦA LEAD — khi nào con được phép ghi đè lên nó. Hàm THUẦN.
 *
 * ── CHỐT 17/09/2026 ──────────────────────────────────────────────────────────────────────
 * Chủ dự án bấm vào ô "Khoá quan tâm" ở màn sửa lead (vai Tư vấn & CSKH) và thấy nó xám,
 * kèm dòng "Lấy theo khoá quan tâm của con — sửa ở khối Con của phụ huynh bên dưới". Yêu
 * cầu: "làm hướng sửa được đi".
 *
 * ⚠️ MỞ KHOÁ Ô THÔI LÀ CHƯA ĐỦ — và nếu chỉ làm thế thì tệ hơn hiện trạng.
 *
 * Đo trước khi sửa: `Lead.courseId` đang là BẢN SAO được suy ra từ con.
 * `syncLeadCourseFromChildren` ghi đè nó VÔ ĐIỀU KIỆN bằng khoá của đứa con sửa gần nhất,
 * và chạy ở BA chỗ (`addLeadChild`, `updateLeadChild`, `deleteLeadChild`). Nên nếu chỉ bỏ
 * `disabled` khỏi ô: Sale gõ khoá đúng, lưu, thấy đã lưu — rồi lần sau ai đó đụng vào một
 * đứa con là giá trị ấy biến mất, không thông báo, không dấu vết. Ô mở ra mà không giữ được
 * giá trị là một lời hứa suông, đúng thứ luật 12 cấm.
 *
 * ── LUẬT ─────────────────────────────────────────────────────────────────────────────────
 * Con chỉ được ghi đè khoá của lead khi khoá đó TRÔNG NHƯ DO CON ĐẶT RA:
 *
 *   lead chưa có khoá                       → ĐIỀN theo con
 *   khoá của lead = khoá con vừa sửa (bản cũ) → CẬP NHẬT theo con  (đúng là của nó)
 *   khoá của lead = khoá của MỘT con nào đó  → CẬP NHẬT theo con  (vốn suy ra từ đám con)
 *   khoá của lead KHÁC mọi con               → GIỮ NGUYÊN          (người dùng đặt tay)
 *
 * Vế cuối là toàn bộ điểm của tệp này. Nó không đoán ý ai; nó chỉ nói: một giá trị không
 * khớp con nào thì không thể do con sinh ra, nên đừng đụng vào.
 *
 * Nếp này KHÔNG mới — `updateLeadChild` vốn đã dùng đúng phép so ấy cho ca "gỡ trắng khoá
 * của con" (`child.lead?.courseId === child.interestedCourseId`). Ở đây chỉ mở rộng nó ra
 * cho mọi ca, và đưa vào một hàm có tên, có test, có chỗ cấy lỗi.
 */

export interface DauVaoDongBoKhoa {
  /** Khoá quan tâm đang lưu trên lead. */
  khoaLead: string | null | undefined;
  /**
   * Khoá của các con SAU khi sửa, xếp con mới đụng gần nhất lên trước.
   * Dùng cho cả hai việc: chọn giá trị mới, và nhận ra khoá của lead có phải của con không.
   */
  khoaCacCon: readonly (string | null | undefined)[];
  /**
   * Khoá của đứa con vừa bị sửa, GIÁ TRỊ TRƯỚC KHI SỬA. `undefined` khi không áp dụng
   * (thêm con mới, hoặc gọi từ chỗ không biết).
   *
   * ⚠️ Không có vế này thì luồng thường bị gãy: lead đang lấy khoá theo con A, người dùng
   * đổi khoá của A sang cái khác ⇒ khoá cũ của lead không còn khớp con nào ⇒ luật trên
   * tưởng là "đặt tay" và GIỮ NGUYÊN, tức sửa con mà lead không đổi theo.
   */
  khoaConTruocKhiSua?: string | null | undefined;
}

export interface KetQuaDongBoKhoa {
  /** Có ghi `Lead.courseId` không. */
  doiKhoa: boolean;
  /** Giá trị mới — chỉ có nghĩa khi `doiKhoa`. */
  khoaMoi: string | null;
  /** Vì sao — để nhật ký và test nói được cùng một ngôn ngữ. */
  vi: "chua-co" | "cua-con-nay" | "cua-mot-con" | "nguoi-dung-dat-tay";
}

function sach(v: string | null | undefined): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

/**
 * Đám con có được ghi đè khoá của lead lúc này không, và ghi giá trị gì.
 *
 * Giá trị chọn là khoá của con ĐẦU TIÊN trong `khoaCacCon` có khoá — giữ đúng hành vi cũ
 * (`orderBy: { updatedAt: "desc" }` ⇒ con vừa đụng thắng). Không con nào có khoá ⇒ `null`,
 * tức xoá trắng khoá của lead, cũng đúng hành vi cũ.
 */
export function dongBoKhoaTuCon(dv: DauVaoDongBoKhoa): KetQuaDongBoKhoa {
  const khoaLead = sach(dv.khoaLead);
  const con = dv.khoaCacCon.map(sach);
  const khoaMoi = con.find((k) => k !== null) ?? null;

  if (khoaLead === null) return { doiKhoa: true, khoaMoi, vi: "chua-co" };

  const truoc = sach(dv.khoaConTruocKhiSua);
  if (truoc !== null && khoaLead === truoc) {
    return { doiKhoa: true, khoaMoi, vi: "cua-con-nay" };
  }

  if (con.includes(khoaLead)) return { doiKhoa: true, khoaMoi, vi: "cua-mot-con" };

  // Khác mọi con ⇒ không thể do con sinh ra ⇒ của người dùng. KHÔNG ĐỤNG.
  return { doiKhoa: false, khoaMoi: khoaLead, vi: "nguoi-dung-dat-tay" };
}
