/**
 * Ca test cho lõi dựng dòng sửa giờ quét.
 *
 * Hàm THUẦN nên kiểm được mọi tổ hợp không cần Postgres. Bốn cổng của Server Action
 * (quyền · lý do · kỳ đã chốt · audit) kiểm ở `tests/cham-cong/sua-gio-quet-tay.spec.ts`
 * trên Postgres thật — đó là chỗ chúng THẬT SỰ sống (luật 9).
 */
import { describe, expect, it } from "vitest";

import { CO_CHINH_TAY, dungDongChinhTay, vnTimeOn } from "./sua-gio-quet";

/** 09/09/2026, mốc `@db.Date` = nửa đêm UTC. */
const NGAY = new Date(Date.UTC(2026, 8, 9));
const LUC = new Date(Date.UTC(2026, 8, 9, 10, 0));

const CO_BAN = {
  userId: "u1",
  centerId: "cs1",
  orgUnitId: "ou1",
  workDate: NGAY,
  actorId: "quanly",
  now: LUC,
  lyDo: "Quầy hỏng, người này có mặt",
  canCu: { kieu: "SUA_TAY" } as const,
};

describe("vnTimeOn — 'HH:mm' giờ VN → thời điểm tuyệt đối", () => {
  it("trừ đúng 7 giờ: 08:00 VN = 01:00 UTC cùng ngày", () => {
    expect(vnTimeOn(NGAY, "08:00")?.toISOString()).toBe("2026-09-09T01:00:00.000Z");
  });

  it("giờ sáng sớm lùi sang NGÀY TRƯỚC theo UTC — đúng, đừng 'sửa'", () => {
    // 05:00 VN = 22:00 UTC hôm trước. Đây là hành vi đúng của một mốc tuyệt đối; ai thấy
    // ngày lệch mà đi kẹp lại là làm sai giờ thật.
    expect(vnTimeOn(NGAY, "05:00")?.toISOString()).toBe("2026-09-08T22:00:00.000Z");
  });

  it("nhận '8:00' thiếu số 0 đầu", () => {
    expect(vnTimeOn(NGAY, "8:00")?.toISOString()).toBe("2026-09-09T01:00:00.000Z");
  });

  it("cắt khoảng trắng hai đầu", () => {
    expect(vnTimeOn(NGAY, "  08:00 ")).not.toBeNull();
  });

  it.each(["", "8h00", "08:60", "24:00", "abc", "08", "08:0", "-1:00"])(
    "từ chối chuỗi giờ hỏng: %s",
    (s) => {
      expect(vnTimeOn(NGAY, s)).toBeNull();
    },
  );

  it("nhận 23:59 nhưng từ chối 24:00 — ngưỡng là <= 23, không phải < 24 rồi làm tròn", () => {
    expect(vnTimeOn(NGAY, "23:59")).not.toBeNull();
    expect(vnTimeOn(NGAY, "24:00")).toBeNull();
  });
});

describe("dungDongChinhTay", () => {
  it("dựng ĐỦ hai mốc, đúng hình dạng dòng MANUAL_ADJUST", () => {
    const r = dungDongChinhTay({ ...CO_BAN, gioVao: "08:00", gioRa: "17:30" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(2);
    const vao = r.rows.find((x) => x.direction === "CHECK_IN")!;
    expect(vao).toMatchObject({
      userId: "u1",
      centerId: "cs1",
      orgUnitId: "ou1",
      source: "MANUAL_ADJUST",
      result: "ACCEPTED",
      reviewStatus: "CONFIRMED",
      reviewedById: "quanly",
      adjustRequestId: null,
      flags: [CO_CHINH_TAY],
    });
    expect(vao.reviewedAt).toEqual(LUC);
    expect(vao.workDate).toEqual(NGAY);
    expect((vao.loggedAt as Date).toISOString()).toBe("2026-09-09T01:00:00.000Z");
  });

  // ── KHÁC BIỆT DUY NHẤT giữa hai đường ───────────────────────────────────────
  it("đường qua ĐƠN mang adjustRequestId; đường SỬA TAY mang null", () => {
    const qua = dungDongChinhTay({
      ...CO_BAN,
      gioVao: "08:00",
      gioRa: null,
      canCu: { kieu: "DON", requestId: "req-9" },
    });
    const tay = dungDongChinhTay({ ...CO_BAN, gioVao: "08:00", gioRa: null });
    expect(qua.ok && qua.rows[0]?.adjustRequestId).toBe("req-9");
    expect(tay.ok && tay.rows[0]?.adjustRequestId).toBeNull();
  });

  it("hai đường GIỐNG NHAU ở mọi trường còn lại — đó là lý do có file này", () => {
    const qua = dungDongChinhTay({
      ...CO_BAN,
      gioVao: "08:00",
      gioRa: "17:30",
      canCu: { kieu: "DON", requestId: "req-9" },
    });
    const tay = dungDongChinhTay({ ...CO_BAN, gioVao: "08:00", gioRa: "17:30" });
    expect(qua.ok && tay.ok).toBe(true);
    if (!qua.ok || !tay.ok) return;
    const boCanCu = (r: (typeof qua.rows)[number]) => ({ ...r, adjustRequestId: undefined });
    expect(qua.rows.map(boCanCu)).toEqual(tay.rows.map(boCanCu));
  });

  // ── sửa lẻ một mốc ──────────────────────────────────────────────────────────
  it("chỉ giờ VÀO ⇒ đúng một dòng CHECK_IN, KHÔNG dựng dòng ra rỗng", () => {
    const r = dungDongChinhTay({ ...CO_BAN, gioVao: "08:15", gioRa: null });
    expect(r.ok && r.rows).toHaveLength(1);
    expect(r.ok && r.rows[0]?.direction).toBe("CHECK_IN");
  });

  it("chỉ giờ RA ⇒ đúng một dòng CHECK_OUT", () => {
    const r = dungDongChinhTay({ ...CO_BAN, gioVao: null, gioRa: "17:45" });
    expect(r.ok && r.rows).toHaveLength(1);
    expect(r.ok && r.rows[0]?.direction).toBe("CHECK_OUT");
  });

  it("không mốc nào ⇒ từ chối, và câu báo KHÁC nhau theo căn cứ", () => {
    const tay = dungDongChinhTay({ ...CO_BAN, gioVao: null, gioRa: null });
    expect(tay.ok).toBe(false);
    expect(!tay.ok && tay.error).toContain("ít nhất một mốc");

    const don = dungDongChinhTay({
      ...CO_BAN, gioVao: null, gioRa: null, canCu: { kieu: "DON", requestId: "r" },
    });
    expect(!don.ok && don.error).toContain("Đơn không có giờ");
  });

  // ── thứ tự hai mốc ──────────────────────────────────────────────────────────
  it("giờ ra TRƯỚC giờ vào ⇒ từ chối, không để engine tính ra số âm rồi kẹp về 0", () => {
    const r = dungDongChinhTay({ ...CO_BAN, gioVao: "17:00", gioRa: "08:00" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("phải sau giờ vào");
  });

  it("giờ ra BẰNG giờ vào ⇒ từ chối (ngưỡng là <=, không phải <)", () => {
    const r = dungDongChinhTay({ ...CO_BAN, gioVao: "08:00", gioRa: "08:00" });
    expect(r.ok).toBe(false);
  });

  it("sửa LẺ một mốc thì KHÔNG kiểm thứ tự — bức tranh đúng nằm ở DB, không ở đây", () => {
    // Hàm này cố ý không chạm DB, nên nó không biết mốc còn lại là mấy giờ. Kiểm bừa ở đây
    // là chặn nhầm những lượt sửa hợp lệ.
    expect(dungDongChinhTay({ ...CO_BAN, gioVao: null, gioRa: "05:00" }).ok).toBe(true);
  });

  // ── lý do ───────────────────────────────────────────────────────────────────
  it("lý do vào `reviewNote`, và khoảng trắng thuần ⇒ null chứ không phải chuỗi rỗng", () => {
    const co = dungDongChinhTay({ ...CO_BAN, gioVao: "08:00", gioRa: null });
    expect(co.ok && co.rows[0]?.reviewNote).toBe("Quầy hỏng, người này có mặt");

    const khong = dungDongChinhTay({ ...CO_BAN, lyDo: "   ", gioVao: "08:00", gioRa: null });
    expect(khong.ok && khong.rows[0]?.reviewNote).toBeNull();
  });

  it("giờ hỏng ⇒ từ chối CẢ LƯỢT, không ghi nửa vời một dòng", () => {
    // Ghi được dòng vào rồi mới phát hiện dòng ra hỏng là để lại một ngày méo.
    const r = dungDongChinhTay({ ...CO_BAN, gioVao: "08:00", gioRa: "25:00" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("25:00");
  });

  it("orgUnitId null được giữ nguyên là null, không đổi thành chuỗi rỗng", () => {
    const r = dungDongChinhTay({ ...CO_BAN, orgUnitId: null, gioVao: "08:00", gioRa: null });
    expect(r.ok && r.rows[0]?.orgUnitId).toBeNull();
  });
});
