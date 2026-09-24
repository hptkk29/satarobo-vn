// Ca [PVN-*] — AI ĐƯỢC DÙNG MỘT NICK. Luật thuần, không DB, không mạng.
//
// Cổng này giữ một thứ có hậu quả thật: sai một nhánh là người ngoài đọc được chat
// khách, hoặc người trong không đọc được chat của chính mình. Nên nó đo CẢ HAI ĐẦU của
// mỗi nhánh, không chỉ đầu "đúng" (bài học `canSearchPhone` — luật 14: một cổng chỉ thử
// nhánh `true` là một cổng không có khoá).
import { describe, it, expect } from "vitest";
import { nguoiDuocDungMotNick, VAI_THAY_MOI_NICK } from "./pham-vi-nick";

const VAN = "u-van";
const LIEN = "u-lien";
const QL = "u-quanly";
const CA_CO_SO = [VAN, LIEN, QL] as const;

describe("[PVN-01] nick CHƯA GIAO → cả cơ sở (giữ nguyên hành vi cũ)", () => {
  it("trả đủ mọi người của cơ sở", () => {
    expect(
      nguoiDuocDungMotNick({ daGiaoCho: null, nguoiCuaCoSo: CA_CO_SO, quanLyCoSo: [QL] }),
    ).toEqual([VAN, LIEN, QL]);
  });

  it("cơ sở rỗng → rỗng, không ném", () => {
    expect(nguoiDuocDungMotNick({ daGiaoCho: null, nguoiCuaCoSo: [], quanLyCoSo: [] })).toEqual([]);
  });
});

describe("[PVN-02] nick ĐÃ GIAO → chỉ người đó + quản lý cơ sở", () => {
  it("người được giao có mặt, người KIA không", () => {
    const ra = nguoiDuocDungMotNick({ daGiaoCho: LIEN, nguoiCuaCoSo: CA_CO_SO, quanLyCoSo: [QL] });
    expect(ra).toContain(LIEN);
    expect(ra).toContain(QL);
    // ĐỐI CHỨNG ÂM — đây mới là vế tính năng này sinh ra để làm.
    expect(ra).not.toContain(VAN);
  });

  it("không có quản lý nào → đúng một mình người được giao", () => {
    expect(
      nguoiDuocDungMotNick({ daGiaoCho: LIEN, nguoiCuaCoSo: CA_CO_SO, quanLyCoSo: [] }),
    ).toEqual([LIEN]);
  });

  it("giao cho CHÍNH quản lý → không nhân đôi", () => {
    expect(
      nguoiDuocDungMotNick({ daGiaoCho: QL, nguoiCuaCoSo: CA_CO_SO, quanLyCoSo: [QL] }),
    ).toEqual([QL]);
  });
});

describe("[PVN-03] con trỏ `sataUserId` CŨ không được nới quyền", () => {
  it("người được giao đã rời cơ sở → rơi về CẢ CƠ SỞ, không phải về rỗng", () => {
    // Rỗng nghĩa là hộp thư khách không ai đọc được, và không dòng lỗi nào báo.
    const ra = nguoiDuocDungMotNick({
      daGiaoCho: "u-da-nghi-viec",
      nguoiCuaCoSo: CA_CO_SO,
      quanLyCoSo: [QL],
    });
    expect(ra).toEqual([VAN, LIEN, QL]);
  });

  it("quản lý đã rời cơ sở → KHÔNG còn được kèm vào", () => {
    // GIAO chứ không HỢP: `quanLyCoSo` mang một id không còn trong `nguoiCuaCoSo`.
    const ra = nguoiDuocDungMotNick({
      daGiaoCho: LIEN,
      nguoiCuaCoSo: [VAN, LIEN],
      quanLyCoSo: ["u-quanly-cu"],
    });
    expect(ra).toEqual([LIEN]);
    expect(ra).not.toContain("u-quanly-cu");
  });
});

describe("[PVN-04] thứ tự ỔN ĐỊNH — hai lượt liên tiếp ra cùng payload", () => {
  it("theo thứ tự `nguoiCuaCoSo`, không theo thứ tự tập hợp", () => {
    const t = { daGiaoCho: VAN, nguoiCuaCoSo: [QL, LIEN, VAN], quanLyCoSo: [QL] } as const;
    expect(nguoiDuocDungMotNick(t)).toEqual([QL, VAN]);
    expect(nguoiDuocDungMotNick(t)).toEqual(nguoiDuocDungMotNick(t));
  });
});

describe("[PVN-05] danh sách vai thấy-mọi-nick", () => {
  it("chỉ `CENTER_MANAGER` — thêm vai vào đây là NỚI quyền, phải có chủ đích", () => {
    expect([...VAI_THAY_MOI_NICK]).toEqual(["CENTER_MANAGER"]);
  });
});
