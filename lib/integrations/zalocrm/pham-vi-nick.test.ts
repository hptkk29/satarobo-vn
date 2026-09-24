// Ca [PVN-*] — AI ĐƯỢC DÙNG MỘT NICK, VÀ Ở MỨC NÀO. Luật thuần, không DB, không mạng.
//
// Cổng này có hậu quả thật: sai một nhánh là người ngoài đọc được chat khách, hoặc
// người trong không đọc được chat của chính mình. Nên nó đo CẢ HAI ĐẦU của mỗi nhánh,
// không chỉ đầu "đúng" (bài học `canSearchPhone` — luật 14).
import { describe, it, expect } from "vitest";
import {
  nguoiDuocDungMotNick,
  MUC_QUYEN,
  VAI_THAY_MOI_NICK,
  MUC_MAC_DINH_CHUA_GIAO,
  type GiaoTay,
} from "./pham-vi-nick";

const TRANG = "u-trang"; // QLCS kiêm CS1 + CS2
const LOC = "u-loc"; // sale CS1
const DIEU = "u-dieu"; // sale CS1
const HA = "u-ha"; // 🔴 GIÁO VIÊN CS1 — nhân sự của cơ sở, nhưng KHÔNG thuộc tập mặc định

/** MỌI nhân sự của cơ sở — tập GIAO TAY hợp lệ (rộng, từ 24/09). */
const CA_CO_SO = [TRANG, LOC, DIEU, HA] as const;
/** Tập CON được dùng nick MẶC ĐỊNH khi nick chưa giao ai (hẹp). Cô Hà KHÔNG có mặt. */
const MAC_DINH = [TRANG, LOC, DIEU] as const;
const KHONG_GIAO: GiaoTay[] = [];

describe("[PVN-01] nick CHƯA GIAO AI → tập MẶC ĐỊNH, mức mặc định", () => {
  it("chỉ người của tập mặc định có mặt — KHÔNG phải cả cơ sở", () => {
    const ra = nguoiDuocDungMotNick({
      giaoTay: KHONG_GIAO,
      nguoiCuaCoSo: CA_CO_SO,
      macDinhDungDuoc: MAC_DINH,
      quanLyCoSo: [],
    });
    expect(ra.map((x) => x.sataUserId)).toEqual([TRANG, LOC, DIEU]);
    expect(new Set(ra.map((x) => x.mucQuyen))).toEqual(new Set([MUC_MAC_DINH_CHUA_GIAO]));
    // ĐỐI CHỨNG ÂM — giáo viên của cơ sở KHÔNG tự động đọc được nick chưa giao.
    expect(ra.map((x) => x.sataUserId), "nới quyền mặc định ra cả cơ sở").not.toContain(HA);
  });

  it("cơ sở rỗng → rỗng, không ném", () => {
    expect(
      nguoiDuocDungMotNick({
        giaoTay: KHONG_GIAO,
        nguoiCuaCoSo: [],
        macDinhDungDuoc: [],
        quanLyCoSo: [],
      }),
    ).toEqual([]);
  });
});

describe("[PVN-02] quản lý cơ sở được `admin` TỰ ĐỘNG", () => {
  it("không cần dòng giao nào", () => {
    const ra = nguoiDuocDungMotNick({
      giaoTay: KHONG_GIAO,
      nguoiCuaCoSo: CA_CO_SO,
      macDinhDungDuoc: MAC_DINH,
      quanLyCoSo: [TRANG],
    });
    expect(ra.find((x) => x.sataUserId === TRANG)?.mucQuyen).toBe("admin");
    // ĐỐI CHỨNG: người thường KHÔNG được nâng lên admin theo.
    expect(ra.find((x) => x.sataUserId === LOC)?.mucQuyen).toBe(MUC_MAC_DINH_CHUA_GIAO);
  });

  it("nick ĐÃ giao cho người khác, quản lý VẪN thấy ở mức admin", () => {
    const ra = nguoiDuocDungMotNick({
      giaoTay: [{ sataUserId: LOC, mucQuyen: "chat" }],
      nguoiCuaCoSo: CA_CO_SO,
      macDinhDungDuoc: MAC_DINH,
      quanLyCoSo: [TRANG],
    });
    expect(ra).toEqual([
      { sataUserId: TRANG, mucQuyen: "admin" },
      { sataUserId: LOC, mucQuyen: "chat" },
    ]);
    // ĐỐI CHỨNG ÂM — người không được giao phải biến mất.
    expect(ra.map((x) => x.sataUserId)).not.toContain(DIEU);
  });

  it("quản lý được giao tay mức HẸP hơn → vẫn giữ admin (mức rộng thắng)", () => {
    // Chủ dự án chọn phương án "tự động admin", KHÔNG chọn phương án cho đè riêng.
    const ra = nguoiDuocDungMotNick({
      giaoTay: [{ sataUserId: TRANG, mucQuyen: "read" }],
      nguoiCuaCoSo: CA_CO_SO,
      macDinhDungDuoc: MAC_DINH,
      quanLyCoSo: [TRANG],
    });
    expect(ra).toEqual([{ sataUserId: TRANG, mucQuyen: "admin" }]);
  });
});

describe("[PVN-03] giao tay NHIỀU người, mỗi người một mức", () => {
  it("giữ đúng mức của từng người", () => {
    const ra = nguoiDuocDungMotNick({
      giaoTay: [
        { sataUserId: LOC, mucQuyen: "chat" },
        { sataUserId: DIEU, mucQuyen: "read" },
      ],
      nguoiCuaCoSo: CA_CO_SO,
      macDinhDungDuoc: MAC_DINH,
      quanLyCoSo: [],
    });
    expect(ra).toEqual([
      { sataUserId: LOC, mucQuyen: "chat" },
      { sataUserId: DIEU, mucQuyen: "read" },
    ]);
  });

  it("giao cho một người mức `admin` → đúng admin, không hạ xuống chat", () => {
    const ra = nguoiDuocDungMotNick({
      giaoTay: [{ sataUserId: DIEU, mucQuyen: "admin" }],
      nguoiCuaCoSo: CA_CO_SO,
      macDinhDungDuoc: MAC_DINH,
      quanLyCoSo: [],
    });
    expect(ra).toEqual([{ sataUserId: DIEU, mucQuyen: "admin" }]);
  });
});

describe("[PVN-04] dòng giao CŨ không được nới quyền", () => {
  it("người được giao đã rời cơ sở → bị loại, và nick coi như CHƯA GIAO", () => {
    // Loại xong mà danh sách giao rỗng ⇒ rơi về tập MẶC ĐỊNH, KHÔNG về rỗng: rỗng nghĩa
    // là hộp thư khách không ai đọc được, và không dòng lỗi nào báo.
    const ra = nguoiDuocDungMotNick({
      giaoTay: [{ sataUserId: "u-da-nghi-viec", mucQuyen: "admin" }],
      nguoiCuaCoSo: CA_CO_SO,
      macDinhDungDuoc: MAC_DINH,
      quanLyCoSo: [],
    });
    expect(ra.map((x) => x.sataUserId)).toEqual([TRANG, LOC, DIEU]);
    expect(ra.map((x) => x.sataUserId)).not.toContain("u-da-nghi-viec");
  });

  it("quản lý đã rời cơ sở → KHÔNG còn được kèm vào", () => {
    const ra = nguoiDuocDungMotNick({
      giaoTay: [{ sataUserId: LOC, mucQuyen: "chat" }],
      nguoiCuaCoSo: [LOC, DIEU],
      macDinhDungDuoc: [LOC, DIEU],
      quanLyCoSo: ["u-quanly-cu"],
    });
    expect(ra).toEqual([{ sataUserId: LOC, mucQuyen: "chat" }]);
  });
});

describe("[PVN-05] hằng số — đổi ở đây là đổi CHÍNH SÁCH, phải có chủ đích", () => {
  it("ba mức, đúng thứ tự hẹp → rộng", () => {
    // `rongHon` dựa vào CHÍNH thứ tự này. Xáo nó là đảo luật mà không ai thấy.
    expect([...MUC_QUYEN]).toEqual(["read", "chat", "admin"]);
  });

  it("chỉ `CENTER_MANAGER` được admin tự động", () => {
    expect([...VAI_THAY_MOI_NICK]).toEqual(["CENTER_MANAGER"]);
  });

  it("nick chưa giao → mức `chat`, không phải `admin`", () => {
    expect(MUC_MAC_DINH_CHUA_GIAO).toBe("chat");
  });
});

describe("[PVN-06] thứ tự ỔN ĐỊNH — hai lượt liên tiếp ra cùng payload", () => {
  it("theo thứ tự `nguoiCuaCoSo`", () => {
    const t = {
      giaoTay: [{ sataUserId: DIEU, mucQuyen: "read" as const }],
      nguoiCuaCoSo: [DIEU, LOC, TRANG],
      macDinhDungDuoc: [DIEU, LOC, TRANG],
      quanLyCoSo: [TRANG],
    };
    expect(nguoiDuocDungMotNick(t).map((x) => x.sataUserId)).toEqual([DIEU, TRANG]);
    expect(nguoiDuocDungMotNick(t)).toEqual(nguoiDuocDungMotNick(t));
  });
});

describe("[PVN-07] GIAO TAY ĐƯỢC ≠ MẶC ĐỊNH DÙNG ĐƯỢC — hai tập, hai nghĩa", () => {
  // 🔴 Cả điểm của đợt 24/09: chủ dự án chốt mở rộng tập GIAO TAY ra mọi nhân sự của cơ
  // sở. Nhỡ mở luôn tập MẶC ĐỊNH thì mọi giáo viên, kế toán… của cơ sở đọc được MỌI nick
  // chưa giao — một lượt nới quyền im lặng, không ai bấm nút nào, không triệu chứng nào.

  it("giáo viên GIAO TAY ĐƯỢC — dòng giao của họ có hiệu lực", () => {
    const ra = nguoiDuocDungMotNick({
      giaoTay: [{ sataUserId: HA, mucQuyen: "chat" }],
      nguoiCuaCoSo: CA_CO_SO,
      macDinhDungDuoc: MAC_DINH,
      quanLyCoSo: [],
    });
    expect(ra).toEqual([{ sataUserId: HA, mucQuyen: "chat" }]);
  });

  it("nhưng KHÔNG tự động có mặt khi nick chưa giao ai", () => {
    // ĐỐI CHỨNG ÂM của ca ngay trên. Hai ca phải đi cùng nhau: ca trên một mình thì gỡ
    // hẳn `macDinhDungDuoc` (lặp trên `nguoiCuaCoSo`) vẫn xanh.
    const ra = nguoiDuocDungMotNick({
      giaoTay: KHONG_GIAO,
      nguoiCuaCoSo: CA_CO_SO,
      macDinhDungDuoc: MAC_DINH,
      quanLyCoSo: [],
    });
    expect(ra.map((x) => x.sataUserId)).not.toContain(HA);
  });

  it("người trong tập MẶC ĐỊNH mà KHÔNG còn là nhân sự của cơ sở ⇒ rụng", () => {
    // Vế GỠ vẫn đo bằng `nguoiCuaCoSo`. Một tập mặc định cũ (tính từ lượt trước, hoặc
    // do người gọi truyền nhầm) không được phép hồi sinh người đã rời cơ sở.
    const ra = nguoiDuocDungMotNick({
      giaoTay: KHONG_GIAO,
      nguoiCuaCoSo: [LOC],
      macDinhDungDuoc: [LOC, "u-da-chuyen-co-so"],
      quanLyCoSo: [],
    });
    expect(ra).toEqual([{ sataUserId: LOC, mucQuyen: "chat" }]);
  });
});
