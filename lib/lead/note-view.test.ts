import { describe, it, expect } from "vitest";
import { buildNote } from "@/lib/lead/intake/normalize";
import { hasSystemLines, mergeLeadNote, splitLeadNote } from "@/lib/lead/note-view";

// Chuỗi THẬT chủ dự án chụp lại 24/08/2026 trên phiếu prod — giữ nguyên từng ký
// tự để test này còn bắt được nếu ai đổi câu chữ ở `ingest.ts` mà quên nơi đây.
const REAL_NOTE = [
  "Nhân viên nhập: SR.NV.002",
  "con 6 tuổi, muốn học trải nghiệm, nhắn Zalo cho mẹ",
  '⚠️ "SR.NV.002" không giữ vai Sale nên không nhận lead — đã chia tự động, công nhập vẫn ghi nhận cho "SR.NV.002".',
].join("\n");

describe("splitLeadNote", () => {
  it("chỉ trả về chữ NGƯỜI NHẬP gõ — đúng ca chủ dự án báo", () => {
    const view = splitLeadNote(REAL_NOTE);
    expect(view.human).toBe("con 6 tuổi, muốn học trải nghiệm, nhắn Zalo cho mẹ");
    expect(view.info).toEqual(["Nhân viên nhập: SR.NV.002"]);
    expect(view.warnings).toHaveLength(1);
    expect(view.warnings[0]).toContain("không giữ vai Sale");
  });

  it("phiếu chỉ có dòng máy ghi ⇒ human = null (Sale thấy ô trống, không thấy nhiễu)", () => {
    const view = splitLeadNote("Nhân viên nhập: SR.NV.002\n⚠️ Phiếu chưa có số điện thoại.");
    expect(view.human).toBeNull();
    expect(hasSystemLines(view)).toBe(true);
  });

  it("ghi chú người gõ nhiều dòng thì giữ nguyên xuống dòng", () => {
    const view = splitLeadNote("Nhân viên nhập: NV1\ndòng 1\ndòng 2");
    expect(view.human).toBe("dòng 1\ndòng 2");
  });

  it("nhận ra mọi nhãn máy ghi của 4 mapper đang chạy", () => {
    const view = splitLeadNote(
      [
        "Nhân viên nhập: NV1",
        "Người nhập (đã đăng nhập): Trần A",
        "Link Facebook (chưa đọc được): abc",
        "Tỉnh/TP: Đà Nẵng",
        "Địa chỉ: 211 Nguyễn Hữu Thọ",
        "NV giới thiệu: Lê B",
        "Mã link giới thiệu: L123",
        "Aff clickId: c1",
        "UTM: fb/cpc",
        "khách hẹn gọi lại chiều mai",
      ].join("\n"),
    );
    expect(view.info).toHaveLength(9);
    expect(view.human).toBe("khách hẹn gọi lại chiều mai");
  });

  it("note rỗng/null ⇒ ba phần đều rỗng", () => {
    for (const v of [null, undefined, ""]) {
      const view = splitLeadNote(v);
      expect(view.human).toBeNull();
      expect(hasSystemLines(view)).toBe(false);
    }
  });
});

describe("mergeLeadNote — chống xoá mất dấu vết khi Sale sửa ghi chú", () => {
  it("giữ nguyên dòng máy ghi khi người dùng sửa phần của mình", () => {
    const merged = mergeLeadNote("đã gọi, hẹn thứ 5", REAL_NOTE);
    expect(merged).toContain("Nhân viên nhập: SR.NV.002");
    expect(merged).toContain("không giữ vai Sale");
    expect(merged).toContain("đã gọi, hẹn thứ 5");
    expect(merged).not.toContain("con 6 tuổi");
  });

  it("người dùng xoá trắng ô ghi chú ⇒ dấu vết máy VẪN còn", () => {
    const merged = mergeLeadNote("", REAL_NOTE);
    expect(merged).toContain("Nhân viên nhập: SR.NV.002");
    expect(splitLeadNote(merged).human).toBeNull();
  });

  it("round-trip: tách rồi ráp lại chuỗi không đổi", () => {
    const view = splitLeadNote(REAL_NOTE);
    expect(mergeLeadNote(view.human, REAL_NOTE)).toBe(REAL_NOTE);
  });

  it("phiếu chưa có note nào ⇒ chỉ lưu chữ người gõ; rỗng thì null", () => {
    expect(mergeLeadNote("ghi chú đầu tiên", null)).toBe("ghi chú đầu tiên");
    expect(mergeLeadNote("   ", null)).toBeNull();
  });

  it("khớp bố cục buildNote(): dấu vết → người → cảnh báo", () => {
    const built = buildNote(["Nhân viên nhập: NV1", "người gõ"], ["Cảnh báo X"]);
    expect(mergeLeadNote("người gõ", built)).toBe(built);
  });
});
