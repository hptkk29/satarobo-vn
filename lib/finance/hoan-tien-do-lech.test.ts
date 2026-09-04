// lib/finance/hoan-tien-do-lech.test.ts — BƯỚC 1 "đo trước" của đợt vá hoàn tiền (27/08/2026).
//
// Phần THUẦN của script rà soát `scripts/hoan-tien-do-lech-cong-no.ts`. Để ở `lib/` chứ
// không ở `scripts/` là CỐ Ý: `vitest.config.ts` chỉ nhặt `lib/**`, `components/**`,
// `app/**` và 4 thư mục `tests/*` — file test nằm trong `scripts/` sẽ KHÔNG bao giờ chạy
// và CI vẫn xanh.
import { describe, it, expect } from "vitest";
import {
  doLechGhiDanh,
  tomTatDoLech,
  CANH_BAO,
  type GhiDanhCanDo,
} from "@/lib/finance/hoan-tien-do-lech";
import type { ThucThuButToan } from "@/lib/finance/thuc-thu";

/** Dựng 1 bút toán Payment phẳng. */
function bt(
  id: string,
  amount: number,
  accountantStatus: string,
  adjustmentOfId: string | null = null,
): ThucThuButToan {
  return { id, amount, accountantStatus, adjustmentOfId };
}

/** Dựng 1 ghi danh cần đo, mặc định "đang học" + chưa có đề xuất hoàn nào. */
function gd(over: Partial<GhiDanhCanDo> = {}): GhiDanhCanDo {
  return {
    enrollmentId: "e1",
    studentName: "Nguyễn Văn A",
    courseName: "Lập trình Robot",
    className: "CS1-R1",
    centerName: "CS1",
    enrollmentStatus: "STUDYING",
    finalPrice: 9_000_000,
    butToan: [],
    hoanDaDuyet: 0,
    soDeXuatHoan: 0,
    ...over,
  };
}

describe("[HT-01] doLechGhiDanh — không có hoàn tiền thì không có chênh lệch", () => {
  it("chỉ có khoản CONFIRMED → hai cách tính cho cùng một số", () => {
    const r = doLechGhiDanh(gd({ butToan: [bt("p1", 5_000_000, "CONFIRMED")] }));
    expect(r.daThuCachCu).toBe(5_000_000);
    expect(r.daThuCachDung).toBe(5_000_000);
    expect(r.chenhLechDaThu).toBe(0);
    expect(r.congNoCachCu).toBe(4_000_000);
    expect(r.congNoCachDung).toBe(4_000_000);
    expect(r.canhBao).toEqual([]);
  });

  it("ghi danh chưa thu đồng nào → mọi số 0, công nợ = học phí", () => {
    const r = doLechGhiDanh(gd({ butToan: [] }));
    expect(r.daThuCachCu).toBe(0);
    expect(r.daThuCachDung).toBe(0);
    expect(r.congNoCachDung).toBe(9_000_000);
    expect(r.soLanHoan).toBe(0);
    expect(r.canhBao).toEqual([]);
  });

  it("khoản PENDING/REJECTED không phải tiền thật ở CẢ HAI cách tính", () => {
    const r = doLechGhiDanh(
      gd({
        butToan: [
          bt("p1", 5_000_000, "CONFIRMED"),
          bt("p2", 3_000_000, "PENDING"),
          bt("p3", 1_000_000, "REJECTED"),
        ],
      }),
    );
    expect(r.daThuCachCu).toBe(5_000_000);
    expect(r.daThuCachDung).toBe(5_000_000);
  });
});

describe("[HT-02] doLechGhiDanh — hoàn toàn bộ", () => {
  const row = doLechGhiDanh(
    gd({
      enrollmentStatus: "WITHDREW",
      butToan: [bt("p1", 5_000_000, "CONFIRMED"), bt("r1", -5_000_000, "REFUNDED", "p1")],
    }),
  );

  it("cách CŨ (phụ huynh đang thấy) vẫn báo đã thu đủ 5tr — bút toán âm bị bỏ qua", () => {
    expect(row.daThuCachCu).toBe(5_000_000);
  });

  it("cách ĐÚNG trả về 0 — chênh lệch đúng bằng số đã hoàn", () => {
    expect(row.daThuCachDung).toBe(0);
    expect(row.chenhLechDaThu).toBe(-5_000_000);
    expect(row.tongDaHoan).toBe(5_000_000);
    expect(row.soLanHoan).toBe(1);
  });

  it("ghi danh ĐÃ RỜI LỚP: công nợ KHÔNG bị hoàn tiền đẩy lên", () => {
    // Đây là cái bẫy đắt nhất của đợt vá: lấy thẳng thực thu ròng làm công nợ thì
    // mọi học viên nghỉ-học-đã-hoàn-đủ bỗng "nợ" nguyên học phí.
    expect(row.congNoCachCu).toBe(4_000_000);
    expect(row.congNoCachDung).toBe(4_000_000);
  });

  it("cờ báo: phụ huynh sẽ thấy số ĐÃ THU tụt", () => {
    expect(row.canhBao).toContain(CANH_BAO.PH_THAY_SO_TUT);
  });
});

describe("[HT-03] doLechGhiDanh — hoàn một phần", () => {
  it("trừ đúng phần đã hoàn", () => {
    const r = doLechGhiDanh(
      gd({ butToan: [bt("p1", 5_000_000, "CONFIRMED"), bt("r1", -2_000_000, "REFUNDED", "p1")] }),
    );
    expect(r.daThuCachCu).toBe(5_000_000);
    expect(r.daThuCachDung).toBe(3_000_000);
    expect(r.chenhLechDaThu).toBe(-2_000_000);
  });

  it("ghi danh CÒN HỌC: công nợ tăng đúng phần đã trả lại (khoản đó phải đóng lại)", () => {
    const r = doLechGhiDanh(
      gd({
        enrollmentStatus: "STUDYING",
        butToan: [bt("p1", 5_000_000, "CONFIRMED"), bt("r1", -2_000_000, "REFUNDED", "p1")],
      }),
    );
    expect(r.congNoCachCu).toBe(4_000_000);
    expect(r.congNoCachDung).toBe(6_000_000);
    expect(r.canhBao).toContain(CANH_BAO.CONG_NO_TANG);
  });
});

describe("[HT-04] doLechGhiDanh — hoàn hai lần liên tiếp", () => {
  const row = doLechGhiDanh(
    gd({
      butToan: [
        bt("p1", 5_000_000, "CONFIRMED"),
        bt("r1", -2_000_000, "REFUNDED", "p1"),
        bt("r2", -2_000_000, "REFUNDED", "p1"),
      ],
      hoanDaDuyet: 4_000_000,
      soDeXuatHoan: 2,
    }),
  );

  it("đếm đủ hai lần hoàn và cộng đúng tổng đã hoàn", () => {
    expect(row.soLanHoan).toBe(2);
    expect(row.tongDaHoan).toBe(4_000_000);
    expect(row.daThuCachDung).toBe(1_000_000);
    expect(row.canhBao).toContain(CANH_BAO.HOAN_NHIEU_LAN);
  });

  it("cách CŨ vẫn báo 5tr — đây chính là số mà đề xuất hoàn lần hai đã tính trên", () => {
    expect(row.daThuCachCu).toBe(5_000_000);
    expect(row.chenhLechDaThu).toBe(-4_000_000);
  });

  it("hoàn VƯỢT số đã thu → cờ đỏ tiền đã ra khỏi két nhiều hơn số vào", () => {
    const r = doLechGhiDanh(
      gd({
        butToan: [
          bt("p1", 5_000_000, "CONFIRMED"),
          bt("r1", -5_000_000, "REFUNDED", "p1"),
          bt("r2", -3_000_000, "REFUNDED", "p1"),
        ],
        hoanDaDuyet: 8_000_000,
        soDeXuatHoan: 2,
      }),
    );
    expect(r.tongDaHoan).toBe(8_000_000);
    expect(r.daThuCachDung).toBe(-3_000_000);
    expect(r.canhBao).toContain(CANH_BAO.HOAN_QUA_SO_DA_THU);
  });
});

describe("[HT-05] doLechGhiDanh — hoàn sau khi đã điều chỉnh", () => {
  it("bản điều chỉnh thay bản gốc, rồi hoàn trên bản điều chỉnh", () => {
    const r = doLechGhiDanh(
      gd({
        butToan: [
          bt("p1", 5_000_000, "CONFIRMED"),
          bt("a1", 3_000_000, "ADJUSTED", "p1"),
          bt("r1", -1_000_000, "REFUNDED", "a1"),
        ],
      }),
    );
    // Cách CŨ chỉ thấy bản gốc CONFIRMED 5tr: vừa giữ số đã bị điều chỉnh bỏ, vừa
    // bỏ qua khoản hoàn ⇒ lệch 3tr.
    expect(r.daThuCachCu).toBe(5_000_000);
    expect(r.daThuCachDung).toBe(2_000_000);
    expect(r.chenhLechDaThu).toBe(-3_000_000);
    expect(r.canhBao).toContain(CANH_BAO.CO_DIEU_CHINH);
  });

  it("chỉ điều chỉnh, không hoàn → vẫn lệch (bản gốc bị đếm) nhưng không có cờ hoàn", () => {
    const r = doLechGhiDanh(
      gd({ butToan: [bt("p1", 5_000_000, "CONFIRMED"), bt("a1", 3_000_000, "ADJUSTED", "p1")] }),
    );
    expect(r.daThuCachCu).toBe(5_000_000);
    expect(r.daThuCachDung).toBe(3_000_000);
    expect(r.soLanHoan).toBe(0);
    expect(r.canhBao).not.toContain(CANH_BAO.HOAN_NHIEU_LAN);
  });
});

describe("[HT-06] doLechGhiDanh — đề xuất đã duyệt nhưng chưa ghi sổ", () => {
  it("duyệt 3tr, kế toán chưa ghi bút toán âm → cờ báo đề xuất kế tiếp sẽ phồng", () => {
    const r = doLechGhiDanh(
      gd({ butToan: [bt("p1", 5_000_000, "CONFIRMED")], hoanDaDuyet: 3_000_000, soDeXuatHoan: 1 }),
    );
    expect(r.tongDaHoan).toBe(0);
    expect(r.hoanChuaGhiSo).toBe(3_000_000);
    expect(r.canhBao).toContain(CANH_BAO.DUYET_HOAN_CHUA_GHI_SO);
  });

  it("đã ghi sổ đủ → không còn cờ", () => {
    const r = doLechGhiDanh(
      gd({
        butToan: [bt("p1", 5_000_000, "CONFIRMED"), bt("r1", -3_000_000, "REFUNDED", "p1")],
        hoanDaDuyet: 3_000_000,
        soDeXuatHoan: 1,
      }),
    );
    expect(r.hoanChuaGhiSo).toBe(0);
    expect(r.canhBao).not.toContain(CANH_BAO.DUYET_HOAN_CHUA_GHI_SO);
  });

  it("kế toán ghi hoàn thẳng, không qua đề xuất → KHÔNG coi là chưa ghi sổ (không âm)", () => {
    const r = doLechGhiDanh(
      gd({
        butToan: [bt("p1", 5_000_000, "CONFIRMED"), bt("r1", -2_000_000, "REFUNDED", "p1")],
        hoanDaDuyet: 0,
        soDeXuatHoan: 0,
      }),
    );
    expect(r.hoanChuaGhiSo).toBe(0);
  });
});

describe("[HT-07] tomTatDoLech", () => {
  it("cộng đúng số dòng lệch, tổng chênh lệch và đếm cờ", () => {
    const rows = [
      doLechGhiDanh(gd({ enrollmentId: "e1", butToan: [bt("p1", 5_000_000, "CONFIRMED")] })),
      doLechGhiDanh(
        gd({
          enrollmentId: "e2",
          butToan: [bt("p2", 5_000_000, "CONFIRMED"), bt("r2", -2_000_000, "REFUNDED", "p2")],
        }),
      ),
      doLechGhiDanh(
        gd({
          enrollmentId: "e3",
          butToan: [bt("p3", 4_000_000, "CONFIRMED"), bt("r3", -4_000_000, "REFUNDED", "p3")],
        }),
      ),
    ];
    const t = tomTatDoLech(rows);
    expect(t.soGhiDanh).toBe(3);
    expect(t.soGhiDanhLech).toBe(2);
    expect(t.tongDaThuCachCu).toBe(14_000_000);
    expect(t.tongDaThuCachDung).toBe(8_000_000);
    expect(t.tongChenhLech).toBe(-6_000_000);
    expect(t.demCanhBao[CANH_BAO.PH_THAY_SO_TUT]).toBe(2);
  });

  it("danh sách rỗng → mọi tổng bằng 0, không chia cho 0", () => {
    const t = tomTatDoLech([]);
    expect(t.soGhiDanh).toBe(0);
    expect(t.tongChenhLech).toBe(0);
    expect(t.demCanhBao).toEqual({});
  });
});
