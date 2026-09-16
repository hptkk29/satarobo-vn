/**
 * lib/cham-cong/cum-quet.test.ts — chia cụm quét kỳ vọng.
 *
 * Số giờ trong ca test lấy THẲNG từ `docs/cham-cong/BANG-MA-CA-CHOT.md`, không bịa: ca
 * thật mới phơi ra được ranh giới thật (fixture tròn trịa không kiểm được gì).
 */
import { describe, expect, it } from "vitest";
import { cumQuetKyVong, coThieuCum, type Doan } from "./cum-quet";

/** "HH:mm" → phút. Giữ ca test đọc được như bảng chốt. */
const p = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
};
const d = (a: string, b: string): Doan => ({ start: p(a), end: p(b) });

/** Ca thật, chép từ bảng chốt. */
const HC: Doan[] = [d("08:00", "11:30"), d("13:30", "17:30")]; // 1 cụm
const ST: Doan[] = [d("07:45", "11:30"), d("17:15", "21:00")]; // 2 cụm
const CT: Doan[] = [d("13:45", "16:30"), d("17:30", "21:00")]; // 1 cụm (nghỉ VẪN tính)
const S: Doan[] = [d("07:45", "11:30")]; // 1 đoạn

describe("cumQuetKyVong", () => {
  it("0 ⇒ KHÔNG cụm nào — không kiểm quét, không cờ", () => {
    expect(cumQuetKyVong(HC, 0)).toEqual([]);
    expect(cumQuetKyVong(ST, 0)).toEqual([]);
  });

  it("1 ⇒ MỘT cụm, vào = đầu đoạn đầu, ra = cuối đoạn cuối (kể cả ca gãy)", () => {
    // HC gãy giữa trưa, nhưng khai 1 cặp ⇒ quét sáng 8:00 và chiều 17:30 là đủ.
    expect(cumQuetKyVong(HC, 1)).toEqual([{ start: p("08:00"), end: p("17:30") }]);
    expect(cumQuetKyVong(CT, 1)).toEqual([{ start: p("13:45"), end: p("21:00") }]);
  });

  it("2 ⇒ HAI cụm, cắt ở khoảng hở LỚN NHẤT", () => {
    // ST: hở duy nhất 11:30→17:15 (5h45).
    expect(cumQuetKyVong(ST, 2)).toEqual([
      { start: p("07:45"), end: p("11:30") },
      { start: p("17:15"), end: p("21:00") },
    ]);
  });

  it("2 ⇒ chọn ĐÚNG khoảng hở lớn nhất khi có NHIỀU khoảng hở", () => {
    // Ba đoạn, hai khoảng hở: 30′ rồi 4h. Phải cắt ở cái 4h, không phải cái đầu tiên.
    const ba: Doan[] = [d("08:00", "10:00"), d("10:30", "12:00"), d("16:00", "20:00")];
    expect(cumQuetKyVong(ba, 2)).toEqual([
      { start: p("08:00"), end: p("12:00") },
      { start: p("16:00"), end: p("20:00") },
    ]);
  });

  it("thứ tự mảng đầu vào KHÔNG đổi kết quả", () => {
    const daoNguoc = [...ST].reverse();
    expect(cumQuetKyVong(daoNguoc, 2)).toEqual(cumQuetKyVong(ST, 2));
    expect(cumQuetKyVong(daoNguoc, 1)).toEqual(cumQuetKyVong(ST, 1));
  });

  it("hai khoảng hở BẰNG NHAU ⇒ cắt ở cái ĐẦU TIÊN, và luôn như vậy", () => {
    // Không phải vì cái đầu "đúng hơn" — mà vì phải chọn MỘT cách và giữ nguyên, kẻo
    // cùng một ca ra hai kết quả tuỳ thứ tự mảng.
    const deu: Doan[] = [d("08:00", "09:00"), d("10:00", "11:00"), d("12:00", "13:00")];
    expect(cumQuetKyVong(deu, 2)).toEqual([
      { start: p("08:00"), end: p("09:00") },
      { start: p("10:00"), end: p("13:00") },
    ]);
  });

  it("khai 2 nhưng ca chỉ có MỘT đoạn ⇒ trả MỘT cụm, KHÔNG bịa cụm thứ hai", () => {
    // Bịa là dựng một mốc quét không có trong ca, và người ta bị đòi một lượt cho khoảng
    // thời gian không tồn tại. Danh mục khai sai thì `catalog.test.ts` bắt, không phải đây.
    expect(cumQuetKyVong(S, 2)).toEqual([{ start: p("07:45"), end: p("11:30") }]);
  });

  it("không đoạn WORK nào ⇒ không cụm nào, ở MỌI giá trị", () => {
    for (const n of [0, 1, 2] as const) expect(cumQuetKyVong([], n)).toEqual([]);
  });

  it("đoạn rỗng/ngược (end ≤ start) bị loại, không làm lệch mốc", () => {
    const co: Doan[] = [d("08:00", "08:00"), d("09:00", "12:00")];
    expect(cumQuetKyVong(co, 1)).toEqual([{ start: p("09:00"), end: p("12:00") }]);
  });
});

describe("coThieuCum", () => {
  it("giữ NGUYÊN tên cờ cũ — dữ liệu prod đang mang chúng", () => {
    expect(coThieuCum(0)).toBe("THIEU_BUOI_SANG");
    expect(coThieuCum(1)).toBe("THIEU_BUOI_CHIEU");
  });
});
