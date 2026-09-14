// Ca [PN-*] — pháp nhân phát hành + thuế theo loại đơn.
import { describe, it, expect } from "vitest";
import { KIEU_GIA } from "@/lib/finance/hoa-don/tinh-hoa-don";
import {
  CAU_HINH_HOA_DON_MAC_DINH,
  kiemCauHinhHoaDon,
  phapNhanChoDon,
  thueChoLoaiDon,
  type CauHinhHoaDon,
} from "@/lib/finance/hoa-don/phap-nhan";

const sao = (): CauHinhHoaDon =>
  JSON.parse(JSON.stringify(CAU_HINH_HOA_DON_MAC_DINH)) as CauHinhHoaDon;

describe("[PN-01] mặc định phải KHỚP hoá đơn thật", () => {
  it("hai pháp nhân, đúng tên và mã số thuế in trên giấy", () => {
    const c = CAU_HINH_HOA_DON_MAC_DINH;
    const sata = c.phapNhan.find((p) => p.ma === "SATA_ROBO");
    const nv = c.phapNhan.find((p) => p.ma === "NEW_VISION");
    expect(sata?.ten).toBe("CÔNG TY CỔ PHẦN CÔNG NGHỆ GIÁO DỤC SATA ROBO");
    expect(sata?.maSoThue).toBe("0402301783");
    expect(sata?.kyHieu).toBe("1C26TSR");
    expect(nv?.ten).toBe("CÔNG TY CỔ PHẦN CÔNG NGHỆ GIÁO DỤC NEW VISION");
    expect(nv?.maSoThue).toBe("0402341070");
    expect(nv?.kyHieu).toBe("1C26MNV");
  });

  it("bản mặc định TỰ NÓ phải hợp lệ — không giao hàng một cấu hình sai sẵn", () => {
    expect(kiemCauHinhHoaDon(CAU_HINH_HOA_DON_MAC_DINH)).toEqual([]);
  });

  it("KHÔNG đoán ánh xạ cơ sở → pháp nhân", () => {
    // Ba tờ mẫu không nói cơ sở nào phát hành qua pháp nhân nào. Đoán ở đây là in sai
    // mã số thuế lên hoá đơn thật. Kế toán khai; mã để rỗng.
    expect(CAU_HINH_HOA_DON_MAC_DINH.macDinhTheoCoSo).toEqual([]);
  });
});

describe("[PN-02] thueChoLoaiDon", () => {
  it("dòng khai ĐÍCH DANH thắng dòng TAT_CA", () => {
    const c = sao();
    c.thue.push({
      loaiDon: "COURSE",
      thueSuat: 8,
      kieuGia: KIEU_GIA.CHUA_GOM_THUE,
    });
    // Đúng ca 1C26TSR-127: học phí tính thuế CỘNG THÊM, trong khi mặc định là đã-gồm.
    expect(thueChoLoaiDon("COURSE", c)).toEqual({
      thueSuat: 8,
      kieuGia: KIEU_GIA.CHUA_GOM_THUE,
    });
    expect(thueChoLoaiDon("PRODUCT", c)).toEqual({
      thueSuat: 8,
      kieuGia: KIEU_GIA.DA_GOM_THUE,
    });
  });

  it("không có dòng nào ⇒ 8% / đã gồm thuế, KHÔNG phải 0%", () => {
    // Hoá đơn in nhầm 0% là sai tờ khai thuế và không có gì báo lỗi.
    expect(thueChoLoaiDon("COURSE", { thue: [] })).toEqual({
      thueSuat: 8,
      kieuGia: KIEU_GIA.DA_GOM_THUE,
    });
  });
});

describe("[PN-03] phapNhanChoDon", () => {
  it("theo cơ sở trước, rồi mặc định chung", () => {
    const c = sao();
    c.macDinhTheoCoSo = [{ maCoSo: "CS2", maPhapNhan: "NEW_VISION" }];
    expect(phapNhanChoDon("CS2", c)?.ma).toBe("NEW_VISION");
    expect(phapNhanChoDon("CS1", c)?.ma).toBe("SATA_ROBO");
    expect(phapNhanChoDon(null, c)?.ma).toBe("SATA_ROBO");
  });

  it("pháp nhân TẮT thì không được chọn, kể cả khi cơ sở trỏ đích danh vào nó", () => {
    const c = sao();
    c.macDinhTheoCoSo = [{ maCoSo: "CS2", maPhapNhan: "NEW_VISION" }];
    c.phapNhan = c.phapNhan.map((p) =>
      p.ma === "NEW_VISION" ? { ...p, bat: false } : p,
    );
    expect(phapNhanChoDon("CS2", c)?.ma).toBe("SATA_ROBO");
  });

  it("không còn pháp nhân nào bật ⇒ null, KHÔNG bịa ra một cái", () => {
    // Màn phải bắt chọn tay. Im lặng in một mã số thuế nào đó lên hoá đơn là sai pháp lý.
    const c = sao();
    c.phapNhan = c.phapNhan.map((p) => ({ ...p, bat: false }));
    expect(phapNhanChoDon("CS1", c)).toBeNull();
  });
});

describe("[PN-04] kiemCauHinhHoaDon — luật nghiệp vụ", () => {
  it("mã số thuế phải 10 hoặc 13 chữ số", () => {
    const c = sao();
    c.phapNhan[0].maSoThue = "04023017";
    expect(kiemCauHinhHoaDon(c).join(" ")).toContain("Mã số thuế");
    c.phapNhan[0].maSoThue = "0402301783-001";
    expect(kiemCauHinhHoaDon(c)).toEqual([]); // 13 số sau khi bỏ gạch
  });

  it("mã pháp nhân trùng nhau", () => {
    const c = sao();
    c.phapNhan[1].ma = c.phapNhan[0].ma;
    expect(kiemCauHinhHoaDon(c).join(" ")).toContain("bị trùng");
  });

  it("cơ sở trỏ tới pháp nhân không tồn tại", () => {
    const c = sao();
    c.macDinhTheoCoSo = [{ maCoSo: "CS9", maPhapNhan: "KHONG_CO" }];
    expect(kiemCauHinhHoaDon(c).join(" ")).toContain("không tồn tại");
  });

  it("thiếu dòng thuế TAT_CA", () => {
    const c = sao();
    c.thue = [];
    expect(kiemCauHinhHoaDon(c).join(" ")).toContain("TAT_CA");
  });

  it("khai thuế hai lần cho cùng một loại đơn", () => {
    const c = sao();
    c.thue.push({ loaiDon: "TAT_CA", thueSuat: 10, kieuGia: KIEU_GIA.DA_GOM_THUE });
    expect(kiemCauHinhHoaDon(c).join(" ")).toContain("hai lần");
  });

  it("tắt hết pháp nhân", () => {
    const c = sao();
    c.phapNhan = c.phapNhan.map((p) => ({ ...p, bat: false }));
    expect(kiemCauHinhHoaDon(c).join(" ")).toContain("đang bật");
  });

  it("KHÔNG chặn thuế suất lạ trong 0–100 — mức thuế là chính sách, không phải hằng", () => {
    const c = sao();
    c.thue[0].thueSuat = 2;
    expect(kiemCauHinhHoaDon(c)).toEqual([]);
    c.thue[0].thueSuat = 101;
    expect(kiemCauHinhHoaDon(c).join(" ")).toContain("0–100%");
  });
});
