// @vitest-environment node
/**
 * EL-08 — dàn bài khoá.
 *
 * Case đắt nhất là nhóm HAI PHA. Kéo thả là thao tác người soạn khoá làm hàng
 * chục lần mỗi khoá; nếu nó thất bại với một lỗi khoá duy nhất khó hiểu thì họ
 * kết luận hệ thống hỏng — và cổng nghiệm thu GĐ1 ("tự tạo trọn một khoá, 0 lần
 * nhờ lập trình viên") trượt vì đúng chỗ này.
 */
import { describe, it, expect } from "vitest";
import {
  chuyenViTri,
  dungHaiPhaGhiThuTu,
  kiemDanBai,
  type ChuongTrongDanBai,
} from "@/lib/elearning/course-outline";

describe("đổi vị trí trong danh sách", () => {
  const ids = ["a", "b", "c", "d"];

  it("kéo lên đầu", () => {
    expect(chuyenViTri(ids, "c", 0)).toEqual(["c", "a", "b", "d"]);
  });

  it("kéo xuống cuối", () => {
    expect(chuyenViTri(ids, "a", 3)).toEqual(["b", "c", "d", "a"]);
  });

  it("giữ nguyên vị trí ⇒ danh sách không đổi", () => {
    expect(chuyenViTri(ids, "b", 1)).toEqual(ids);
  });

  it("vị trí ngoài khoảng bị kẹp vào biên, không ném lỗi", () => {
    // Kéo thả ở trình duyệt hay gửi lên chỉ số lệch một đơn vị. Ném lỗi ở đây là
    // biến một thao tác chuột thành một thông báo đỏ.
    expect(chuyenViTri(ids, "a", 99)).toEqual(["b", "c", "d", "a"]);
    expect(chuyenViTri(ids, "d", -5)).toEqual(["d", "a", "b", "c"]);
  });

  it("id không có trong danh sách ⇒ trả nguyên bản", () => {
    expect(chuyenViTri(ids, "z", 0)).toEqual(ids);
  });

  it("không làm mất hay nhân bản phần tử nào", () => {
    for (const dich of [0, 1, 2, 3]) {
      const ra = chuyenViTri(ids, "c", dich);
      expect([...ra].sort()).toEqual([...ids].sort());
    }
  });
});

describe("HAI PHA ghi thứ tự — vì khoá duy nhất chặn ngang giữa chừng", () => {
  it("pha 1 đẩy TOÀN BỘ sang dải âm", () => {
    // Chỉ đẩy những cái "có đổi chỗ" thì vẫn còn số dương nằm lại, và pha 2 va
    // đúng vào chúng.
    const { pha1 } = dungHaiPhaGhiThuTu(["a", "b", "c"]);
    expect(pha1).toHaveLength(3);
    expect(pha1.every((b) => b.orderIndex < 0)).toBe(true);
  });

  it("pha 1 không có hai số trùng nhau", () => {
    const { pha1 } = dungHaiPhaGhiThuTu(["a", "b", "c", "d"]);
    expect(new Set(pha1.map((b) => b.orderIndex)).size).toBe(4);
  });

  it("pha 2 ghi số thật từ 0, liên tục", () => {
    const { pha2 } = dungHaiPhaGhiThuTu(["c", "a", "b"]);
    expect(pha2).toEqual([
      { id: "c", orderIndex: 0 },
      { id: "a", orderIndex: 1 },
      { id: "b", orderIndex: 2 },
    ]);
  });

  it("hai pha KHÔNG bao giờ giao nhau về giá trị", () => {
    // Đây chính là điều làm cách này an toàn: mọi số dương đã rời đi trước khi
    // số dương mới được ghi.
    const { pha1, pha2 } = dungHaiPhaGhiThuTu(["a", "b", "c"]);
    const am = new Set(pha1.map((b) => b.orderIndex));
    expect(pha2.some((b) => am.has(b.orderIndex))).toBe(false);
  });

  it("danh sách rỗng ⇒ không có lệnh nào", () => {
    const { pha1, pha2 } = dungHaiPhaGhiThuTu([]);
    expect(pha1).toEqual([]);
    expect(pha2).toEqual([]);
  });
});

describe("hàng rào trước khi XUẤT BẢN", () => {
  const bai = (o: Record<string, unknown> = {}) => ({
    id: "b1",
    title: "Bài 1",
    kind: "READ",
    contentMd: "Nội dung đủ dài",
    required: true,
    ...o,
  });
  const chuong = (o: Partial<ChuongTrongDanBai> = {}): ChuongTrongDanBai => ({
    id: "c1",
    title: "Chương 1",
    lessons: [bai()],
    ...o,
  });

  it("dàn bài đủ ⇒ cho qua", () => {
    expect(kiemDanBai([chuong()]).ok).toBe(true);
  });

  it("khoá chưa có chương nào ⇒ chặn", () => {
    const r = kiemDanBai([]);
    expect(r.ok).toBe(false);
    expect(r.loi[0]?.code).toBe("KHONG_CO_CHUONG");
  });

  it("chương rỗng ⇒ chặn, và NÊU TÊN chương", () => {
    // "Có lỗi" không giúp gì; người soạn cần biết mở chương nào ra sửa.
    const r = kiemDanBai([chuong({ title: "Chương 2", lessons: [] })]);
    expect(r.ok).toBe(false);
    expect(r.loi[0]?.chiTiet).toContain("Chương 2");
  });

  it("bài ĐỌC rỗng nội dung ⇒ chặn", () => {
    // Người học mở ra thấy trang trắng — và vì tiến độ đọc tính theo số chữ, họ
    // không bao giờ đủ điều kiện hoàn thành.
    const r = kiemDanBai([chuong({ lessons: [bai({ contentMd: "   " })] })]);
    expect(r.ok).toBe(false);
    expect(r.loi.some((l) => l.code === "BAI_DOC_TRONG")).toBe(true);
  });

  it("bài dạng KHÁC không bị đòi nội dung markdown", () => {
    const r = kiemDanBai([chuong({ lessons: [bai({ kind: "VIDEO", contentMd: null })] })]);
    expect(r.ok).toBe(true);
  });

  it("không bài nào BẮT BUỘC ⇒ chặn", () => {
    // Phép cuộn tiến độ sẽ ra mẫu số 0 và KHÔNG AI từng "hoàn thành" khoá này —
    // im lặng, không có gì vỡ, và chỉ lộ ra ở báo cáo cuối tháng.
    const r = kiemDanBai([chuong({ lessons: [bai({ required: false })] })]);
    expect(r.ok).toBe(false);
    expect(r.loi.some((l) => l.code === "KHONG_CO_BAI_BAT_BUOC")).toBe(true);
  });

  it("gom ĐỦ mọi lỗi, không dừng ở lỗi đầu", () => {
    // Sửa một lỗi rồi bấm lại chỉ để gặp lỗi kế tiếp là bắt người soạn đi qua
    // năm vòng cho một dàn bài.
    const r = kiemDanBai([
      chuong({ id: "c1", title: "A", lessons: [] }),
      chuong({ id: "c2", title: "B", lessons: [bai({ contentMd: "", required: false })] }),
    ]);
    expect(r.loi.length).toBeGreaterThanOrEqual(3);
  });
});
