/**
 * KHOÁ QUAN TÂM CỦA LEAD — con được ghi đè khi nào.
 *
 * Bộ này canh đúng MỘT lời hứa, và nó là lời hứa mà bản vá 17/09/2026 vừa đưa ra: ô "Khoá
 * quan tâm" ở màn sửa lead nay BẤM ĐƯỢC, và giá trị gõ vào GIỮ ĐƯỢC.
 *
 * Vế thứ hai mới là chỗ khó. Mở ô ra chỉ mất một dòng; nhưng `syncLeadCourseFromChildren`
 * chạy ở BA chỗ (`addLeadChild` · `updateLeadChild` · `deleteLeadChild`) và bản trước ghi đè
 * VÔ ĐIỀU KIỆN. Không siết nó lại thì Sale gõ đúng, lưu, thấy đã lưu — rồi lần sau ai đó
 * đụng một đứa con là giá trị biến mất, không thông báo, không dấu vết. Một ô mở ra mà không
 * giữ được giá trị còn tệ hơn một ô khoá có giải thích (luật 12).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { dongBoKhoaTuCon } from "./khoa-quan-tam";

describe("[KHOA-T10] con ĐƯỢC ghi đè khi khoá của lead trông như do con đặt", () => {
  it("lead chưa có khoá ⇒ điền theo con", () => {
    const r = dongBoKhoaTuCon({ khoaLead: null, khoaCacCon: ["kh_a"] });
    expect(r).toEqual({ doiKhoa: true, khoaMoi: "kh_a", vi: "chua-co" });
  });

  it("chuỗi rỗng cũng là chưa có", () => {
    expect(dongBoKhoaTuCon({ khoaLead: "  ", khoaCacCon: ["kh_a"] }).doiKhoa).toBe(true);
  });

  it("khoá của lead = khoá con vừa sửa (bản CŨ) ⇒ cập nhật theo con", () => {
    // Luồng thường: lead đang lấy theo con A, người dùng đổi khoá của A.
    const r = dongBoKhoaTuCon({
      khoaLead: "kh_cu",
      khoaCacCon: ["kh_moi"],
      khoaConTruocKhiSua: "kh_cu",
    });
    expect(r).toEqual({ doiKhoa: true, khoaMoi: "kh_moi", vi: "cua-con-nay" });
  });

  it("⚠️ THIẾU `khoaConTruocKhiSua` thì luồng thường GÃY — nên ca trên phải còn", () => {
    // Cùng dữ liệu, bỏ vế "khoá con trước khi sửa": khoá cũ của lead không khớp con nào
    // nữa ⇒ luật tưởng là người dùng đặt tay và GIỮ NGUYÊN, tức sửa con mà lead không đổi.
    const r = dongBoKhoaTuCon({ khoaLead: "kh_cu", khoaCacCon: ["kh_moi"] });
    expect(r.doiKhoa).toBe(false);
  });

  it("khoá của lead = khoá của MỘT con khác ⇒ vẫn là của đám con, cập nhật", () => {
    const r = dongBoKhoaTuCon({ khoaLead: "kh_b", khoaCacCon: ["kh_a", "kh_b"] });
    expect(r).toEqual({ doiKhoa: true, khoaMoi: "kh_a", vi: "cua-mot-con" });
  });

  it("chọn con ĐẦU danh sách — giữ đúng thứ tự `updatedAt desc` của bản cũ", () => {
    expect(dongBoKhoaTuCon({ khoaLead: null, khoaCacCon: [null, "kh_b", "kh_c"] }).khoaMoi).toBe(
      "kh_b",
    );
  });

  it("không con nào có khoá ⇒ xoá trắng khoá của lead (hành vi cũ)", () => {
    const r = dongBoKhoaTuCon({
      khoaLead: "kh_cu",
      khoaCacCon: [null, null],
      khoaConTruocKhiSua: "kh_cu",
    });
    expect(r).toEqual({ doiKhoa: true, khoaMoi: null, vi: "cua-con-nay" });
  });
});

describe("[KHOA-T11] ⚠️ con KHÔNG được đè giá trị người dùng đặt tay", () => {
  it("khoá của lead khác MỌI con ⇒ GIỮ NGUYÊN", () => {
    // Đây là toàn bộ điểm của bản vá. Không đoán ý ai — chỉ nói: một giá trị không khớp
    // con nào thì không thể do con sinh ra.
    const r = dongBoKhoaTuCon({ khoaLead: "kh_tay", khoaCacCon: ["kh_a", "kh_b"] });
    expect(r.doiKhoa).toBe(false);
    expect(r.vi).toBe("nguoi-dung-dat-tay");
  });

  it("giữ nguyên kể cả khi con vừa sửa có khoá mới", () => {
    const r = dongBoKhoaTuCon({
      khoaLead: "kh_tay",
      khoaCacCon: ["kh_moi"],
      khoaConTruocKhiSua: "kh_khac",
    });
    expect(r.doiKhoa).toBe(false);
  });

  it("giữ nguyên kể cả khi KHÔNG con nào có khoá", () => {
    // Xoá khoá của con cuối cùng không được kéo theo khoá người dùng tự đặt cho lead.
    const r = dongBoKhoaTuCon({ khoaLead: "kh_tay", khoaCacCon: [null] });
    expect(r.doiKhoa).toBe(false);
    expect(r.khoaMoi).toBe("kh_tay");
  });

  it("lead không có con nào ⇒ cũng giữ nguyên", () => {
    expect(dongBoKhoaTuCon({ khoaLead: "kh_tay", khoaCacCon: [] }).doiKhoa).toBe(false);
  });

  it("khoảng trắng hai đầu không làm lệch phép so", () => {
    const r = dongBoKhoaTuCon({ khoaLead: " kh_a ", khoaCacCon: ["kh_a", "kh_b"] });
    expect(r.doiKhoa).toBe(true);
  });
});

describe("[KHOA-T12] ⚠️ luật này phải được NỐI, và ô phải THẬT SỰ mở", () => {
  const doc = (p: string) => {
    const duong = path.join(process.cwd(), p);
    expect(fs.existsSync(duong), `${duong} không còn ở chỗ cũ`).toBe(true);
    return fs.readFileSync(duong, "utf8");
  };
  const goChuThich = (s: string) =>
    s
      .split("\n")
      .filter((d) => {
        const t = d.trim();
        return !(t.startsWith("//") || t.startsWith("/*") || t.startsWith("*"));
      })
      .join("\n");

  const ACTIONS = goChuThich(doc("app/(admin)/admin/leads/actions.ts"));
  const FORM = goChuThich(doc("app/(admin)/admin/leads/_components/lead-form.tsx"));

  it("phép quét tự kiểm: bộ gỡ chú thích không ăn lem vào mã", () => {
    const tho = doc("app/(admin)/admin/leads/actions.ts");
    expect(ACTIONS.length / tho.length).toBeGreaterThan(0.3);
    expect(FORM.length).toBeGreaterThan(1000);
  });

  it("⚠️ ô Khoá quan tâm KHÔNG còn bị `disabled` theo `courseFromChildren`", () => {
    // Nếu không có ca này, ai đó "dọn dẹp" trả lại `disabled` là quay về đúng màn hình chủ
    // dự án đã chụp, và bộ test vẫn xanh vì luật thuần chẳng liên quan gì tới cái ô.
    expect(FORM).not.toContain("disabled={courseFromChildren}");
  });

  it("đường đồng bộ đi qua luật thuần, không tự ghép tay", () => {
    expect(ACTIONS).toContain("dongBoKhoaTuCon(");
    // Và phải TÔN TRỌNG quyết định — gọi hàm rồi ghi bừa thì gọi để làm gì.
    expect(ACTIONS).toContain("if (!quyet.doiKhoa) return");
  });

  it("⚠️ hai chỗ biết khoá con TRƯỚC lượt sửa phải TRUYỀN nó xuống", () => {
    // Quên truyền ⇒ luồng thường gãy (xem [KHOA-T10]): sửa khoá của con mà lead không đổi
    // theo. Đây là kiểu hỏng im lặng — không lỗi, không cảnh báo, chỉ sai số.
    expect((ACTIONS.match(/child\.leadId, child\.interestedCourseId/g) ?? []).length).toBe(2);
  });
});
