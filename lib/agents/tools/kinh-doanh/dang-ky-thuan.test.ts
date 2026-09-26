// @vitest-environment node
// `kinh_doanh.lay_dang_ky` — phần THUẦN: ngày học thử, trạng thái dòng, chọn học thử, thứ tự.
import { describe, it, expect } from "vitest";
import {
  KHOA_HOC_THU,
  TRANG_THAI_DA_DANG_KY,
  TRANG_THAI_DA_HOAN,
  chonHocThu,
  danhDauDaDangKy,
  dongGhiDanh,
  ngayHocThuChoKhoa,
  ngayHocThuCua,
  ngaySomNhat,
  sapDong,
  type GhiDanhHocThu,
} from "./dang-ky-thuan";

const buoi = (id: string, ngay: string, status = "SCHEDULED") => ({ id, date: new Date(`${ngay}T00:00:00Z`), status });

function te(p: Partial<GhiDanhHocThu> = {}): GhiDanhHocThu {
  return {
    id: "te1",
    leadChildId: "be1",
    createdAt: new Date("2026-09-01T03:00:00Z"),
    scheduledSessionId: null,
    trialClassId: "lop1",
    theoKhung: false,
    sessions: [buoi("s2", "2026-09-12"), buoi("s1", "2026-09-10")],
    ...p,
  };
}

describe("[AG-DK-01] ngày học thử — bốn nguồn theo thứ tự ưu tiên", () => {
  it("1. đã học thật (điểm danh) thắng mọi thứ — theo NGÀY VN", () => {
    // 20:00Z ngày 14 = 03:00 ngày 15 ở VN.
    expect(ngayHocThuCua(te({ scheduledSessionId: "s1" }), new Date("2026-09-14T20:00:00Z"))).toBe("2026-09-15");
  });
  it("2. buổi được xếp riêng (chưa huỷ)", () => {
    expect(ngayHocThuCua(te({ scheduledSessionId: "s2" }), null)).toBe("2026-09-12");
  });
  it("2b. buổi xếp riêng đã HUỶ ⇒ không lấy ngày buổi huỷ", () => {
    const x = te({ scheduledSessionId: "s2", sessions: [buoi("s2", "2026-09-12", "CANCELLED"), buoi("s1", "2026-09-10")] });
    expect(ngayHocThuCua(x, null)).toBe("2026-09-10"); // lớp không theo khung ⇒ buổi sớm nhất còn sống
  });
  it("3. lớp KHÔNG theo khung + chưa xếp buổi = học cả lớp ⇒ buổi sớm nhất chưa huỷ", () => {
    expect(ngayHocThuCua(te(), null)).toBe("2026-09-10");
  });
  it("4. lớp THEO KHUNG chưa xếp case ⇒ null (chưa có ngày)", () => {
    expect(ngayHocThuCua(te({ theoKhung: true }), null)).toBeNull();
  });
  it("lớp chỉ còn buổi đã huỷ ⇒ null", () => {
    expect(ngayHocThuCua(te({ sessions: [buoi("s1", "2026-09-10", "CANCELLED")] }), null)).toBeNull();
  });
});

describe("[AG-DK-02] dòng ghi danh", () => {
  const coBan = {
    leadId: "L1",
    khoa: "SATA4",
    coSo: "CS1",
    ngayDangKy: "2026-09-14",
    ngayHocThu: "2026-09-12",
    giaNiemYet: 11_520_000,
    vanBan: "SR.QD.233",
    enrollmentId: "e1",
  };
  it("không hoàn ⇒ da_dang_ky, mốc = ngày đăng ký", () => {
    const d = dongGhiDanh({ ...coBan, ngayHoan: null });
    expect(d.dong).toMatchObject({ trang_thai: "da_dang_ky", ngay_dang_ky: "2026-09-14", ngay_hoc_thu: "2026-09-12" });
    expect(d.moc).toBe("2026-09-14");
  });
  it("có hoàn đã duyệt ⇒ hoan_tien, vẫn giữ ngày đăng ký; mốc = ngày hoàn", () => {
    const d = dongGhiDanh({ ...coBan, ngayHoan: "2026-09-20" });
    expect(d.dong).toMatchObject({ trang_thai: "hoan_tien", ngay_dang_ky: "2026-09-14" });
    expect(d.moc).toBe("2026-09-20");
  });
  it("giá niêm yết trống ⇒ 0 (khuôn đòi số nguyên, không null)", () => {
    expect(dongGhiDanh({ ...coBan, ngayHoan: null, giaNiemYet: null }).dong.hoc_phi_niem_yet).toBe(0);
  });
});

describe("[AG-DK-03] chọn dòng học thử", () => {
  const x = (id: string, be: string, moc: string, courseId: string | null = null) => ({ id, leadChildId: be, courseId, moc });
  it("ngoài khoảng ⇒ bỏ; hai đầu khoảng TÍNH", () => {
    const r = chonHocThu([x("a", "b1", "2026-09-01"), x("b", "b2", "2026-09-30"), x("c", "b3", "2026-10-01")], "2026-09-01", "2026-09-30", new Set());
    expect(r.map((v) => v.id).sort()).toEqual(["a", "b"]);
  });
  it("lớp trải nghiệm CHUNG + bé đã có dòng ghi danh bất kỳ ⇒ không ra thêm dòng học thử", () => {
    const da = danhDauDaDangKy([{ leadChildId: "b1", courseId: "sata4" }]);
    expect(chonHocThu([x("a", "b1", "2026-09-05")], "2026-09-01", "2026-09-30", da)).toEqual([]);
  });
  it("một bé hai lượt xếp lớp CÙNG khoá ⇒ MỘT dòng, lượt sớm nhất", () => {
    const r = chonHocThu([x("b", "b1", "2026-09-09"), x("a", "b1", "2026-09-05")], "2026-09-01", "2026-09-30", new Set());
    expect(r.map((v) => v.id)).toEqual(["a"]);
  });
  it("[AG-DK-03b] lớp gắn khoá: ghi danh KHOÁ KHÁC không xoá cuộc hẹn học thử khoá này (rà 26/09, AGT-02)", () => {
    const da = danhDauDaDangKy([{ leadChildId: "b1", courseId: "sata4" }]);
    expect(chonHocThu([x("a", "b1", "2026-09-05", "robosim")], "2026-09-01", "2026-09-30", da).map((v) => v.id)).toEqual(["a"]);
    // Đối chứng: ghi danh ĐÚNG khoá của lớp trải nghiệm thì dòng học thử được bỏ.
    expect(chonHocThu([x("a", "b1", "2026-09-05", "sata4")], "2026-09-01", "2026-09-30", da)).toEqual([]);
  });
  it("[AG-DK-03c] một bé học thử HAI KHOÁ khác nhau ⇒ HAI dòng (rà 26/09, AGT-03)", () => {
    const r = chonHocThu([x("a", "b1", "2026-09-05", "sata4"), x("b", "b1", "2026-09-06", "robosim")], "2026-09-01", "2026-09-30", new Set());
    expect(r.map((v) => v.id).sort()).toEqual(["a", "b"]);
  });
});

describe("[AG-DK-05] ngày học thử của một dòng ghi danh — theo ĐÚNG khoá (rà 26/09, AGT-01)", () => {
  it("chỉ lấy lượt học thử của đúng khoá hoặc lớp chung; bỏ học thử khoá khác", () => {
    const luot = [
      { courseId: "robosim", ngay: "2026-08-01" }, // khoá KHÁC — không được gán sang
      { courseId: "sata4", ngay: "2026-09-10" },
      { courseId: null, ngay: "2026-09-12" },
    ];
    expect(ngayHocThuChoKhoa(luot, "sata4")).toBe("2026-09-10");
    expect(ngayHocThuChoKhoa([{ courseId: "robosim", ngay: "2026-08-01" }], "sata4")).toBeNull();
    expect(ngayHocThuChoKhoa([{ courseId: null, ngay: "2026-09-12" }], "sata4")).toBe("2026-09-12");
  });
});

describe("[AG-DK-04] thứ tự + tập trạng thái", () => {
  it("sắp theo mốc rồi lead rồi khoá nội bộ — ổn định cho phân trang", () => {
    const mk = (lead: string, moc: string, k: string) => ({
      dong: {
        lead_id: lead, khoa: KHOA_HOC_THU, trang_thai: "da_hen_hoc_thu" as const, ngay_hoc_thu: null,
        ngay_dang_ky: null, hoc_phi_niem_yet: 0, van_ban_khuyen_mai: null, co_so: "CS1",
      },
      moc,
      khoaSap: k,
    });
    const r = sapDong([mk("L2", "2026-09-02", "t:2"), mk("L1", "2026-09-02", "t:9"), mk("L9", "2026-09-01", "t:1"), mk("L1", "2026-09-02", "t:3")]);
    expect(r.map((d) => d.lead_id)).toEqual(["L9", "L1", "L1", "L2"]);
  });
  it("ngày học thử sớm nhất bỏ qua null", () => {
    expect(ngaySomNhat([null, "2026-09-12", "2026-09-10", null])).toBe("2026-09-10");
    expect(ngaySomNhat([null])).toBeNull();
  });
  it("'đã đăng ký' GỒM ACTIVE (đường convert chính không đặt status) — KHÔNG gồm PENDING/CANCELLED/WITHDREW/TRANSFERRED", () => {
    expect(TRANG_THAI_DA_DANG_KY).toContain("ACTIVE");
    for (const s of ["PENDING", "CANCELLED", "WITHDREW", "TRANSFERRED"]) {
      expect((TRANG_THAI_DA_DANG_KY as readonly string[]).includes(s), s).toBe(false);
    }
  });
  it("'đã hoàn' GỒM APPROVED (PAID chưa có đường ghi nào)", () => {
    expect(TRANG_THAI_DA_HOAN).toContain("APPROVED");
    expect((TRANG_THAI_DA_HOAN as readonly string[]).includes("PENDING")).toBe(false);
    expect((TRANG_THAI_DA_HOAN as readonly string[]).includes("REJECTED")).toBe(false);
  });
});
