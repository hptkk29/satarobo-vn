/**
 * LUẬT GHI ĐÈ KHI NHẬP LẠI LEAD ĐÃ CÓ.
 *
 * Đây là chỗ DUY NHẤT trong repo cố ý ghi đè dữ liệu người dùng đã nhập tay — mọi đường khác
 * chỉ thêm. Một phép ghi đè viết lỏng tay không ném lỗi, không làm test đỏ, và không ai phát
 * hiện cho tới khi Sale mở lead ra và thấy ghi chú cuộc gọi của mình biến mất.
 *
 * Nên bộ này kiểm cả HAI chiều ở mọi ca: đúng thứ cần đổi ĐÃ đổi, và đúng thứ cần giữ VẪN
 * còn. Một nửa bộ test chỉ kiểm chiều thứ nhất là một nửa vô dụng — vá quá tay không đỏ.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  conMoDeChiaLai,
  dongDoiChieu,
  dungBanCapNhatLeadTrung,
  moTaLuotCapNhat,
  noiGhiChu,
} from "./nhap-trung";

const MOC = new Date("2026-09-15T10:00:00.000Z");

const CU = {
  parentName: "Chị Lan",
  email: "lan@cu.vn",
  childName: "Bé An",
  childAge: 8,
  centerId: "cs1",
  courseId: "kh_robot",
  source: "FACEBOOK",
  note: "Gọi 12/09: khách bận, hẹn gọi lại thứ 5.",
};

const ban = (file: Parameters<typeof dungBanCapNhatLeadTrung>[0]["file"]) =>
  dungBanCapNhatLeadTrung({ cu: CU, file, moc: MOC });

describe("[LEAD-T70] ô ĐANG TRỐNG thì ĐIỀN", () => {
  it("lead chưa có email ⇒ lấy email của file", () => {
    const b = dungBanCapNhatLeadTrung({
      cu: { ...CU, email: null },
      file: { email: "moi@moi.vn" },
      moc: MOC,
    });
    expect(b.data.email).toBe("moi@moi.vn");
    expect(b.daDien).toContain("email");
    expect(b.khacBiet).toEqual([]);
  });

  it("điền được mọi cột đang trống", () => {
    const b = dungBanCapNhatLeadTrung({
      cu: {},
      file: {
        parentName: "X",
        email: "e@e.vn",
        childName: "Bé B",
        childAge: 9,
        centerId: "cs2",
        courseId: "kh",
        source: "ZALO",
      },
      moc: MOC,
    });
    expect(b.daDien).toHaveLength(7);
    expect(b.khacBiet).toEqual([]);
  });

  it("cắt khoảng trắng hai đầu trước khi điền", () => {
    const b = dungBanCapNhatLeadTrung({ cu: {}, file: { parentName: "  Chị Mai  " }, moc: MOC });
    expect(b.data.parentName).toBe("Chị Mai");
  });

  it("luôn đóng mốc `lastInboundAt` — nhập lại LÀ một lần khách quay lại", () => {
    // Đây là thứ đẩy lead lên đầu `/leads` để Sale thấy mà gọi. Thiếu nó thì lead cập nhật
    // xong vẫn nằm im ở trang cũ — đúng triệu chứng "nhập xong không thấy lead đâu".
    expect(ban({}).data.lastInboundAt).toBe(MOC);
  });
});

describe("[LEAD-T71] ⚠️ ô ĐÃ CÓ giá trị thì KHÔNG BAO GIỜ bị ghi đè", () => {
  // Chốt thứ hai của chủ dự án 15/09, đảo chiều bản sáng cùng ngày: "các thông tin khác sẽ
  // ghi tiếp nối ở ghi chú, KHÔNG update thay thế hoàn toàn".
  //
  // Lý lẽ: dữ liệu đang lưu là thứ Sale đã xác minh qua điện thoại; dữ liệu trong file là thứ
  // ai đó gõ vào Excel. Cho file thắng là để bản chưa xác minh đè lên bản đã xác minh.

  it("tên phụ huynh đang có ⇒ giữ nguyên, KHÔNG lấy tên trong file", () => {
    const b = ban({ parentName: "Chị Lan Anh" });
    expect(b.data).not.toHaveProperty("parentName");
    expect(b.daDien).toEqual([]);
  });

  it("giá trị trong file được ghi lại ở `khacBiet` — không bốc hơi", () => {
    // Không ghi đè KHÔNG có nghĩa là vứt đi. Ai muốn lấy giá trị của file vẫn lấy được bằng
    // tay, sau khi tự quyết định bản nào đúng.
    const b = ban({ parentName: "Chị Lan Anh", source: "ZALO" });
    expect(b.khacBiet).toEqual([
      { cot: "tên phụ huynh", dangLuu: "Chị Lan", trongFile: "Chị Lan Anh" },
      { cot: "nguồn", dangLuu: "FACEBOOK", trongFile: "ZALO" },
    ]);
  });

  it("KHÔNG cột nào của lead đầy đủ bị ghi", () => {
    // Quét cả bảy cột cùng lúc: vá quá tay ở một cột thì ca này đỏ.
    const b = ban({
      parentName: "X",
      email: "khac@khac.vn",
      childName: "Bé Khác",
      childAge: 12,
      centerId: "cs9",
      courseId: "kh_khac",
      source: "ZALO",
    });
    expect(Object.keys(b.data).filter((k) => k !== "lastInboundAt" && k !== "note")).toEqual([]);
    expect(b.khacBiet).toHaveLength(7);
  });

  it("file ghi GIỐNG hệt ⇒ không phải khác biệt, không ghi gì", () => {
    const b = ban({ parentName: "Chị Lan", email: "lan@cu.vn" });
    expect(b.khacBiet).toEqual([]);
    expect(b.daDien).toEqual([]);
  });

  it("khác nhau chỉ ở khoảng trắng ⇒ vẫn coi là giống", () => {
    expect(ban({ parentName: "  Chị Lan " }).khacBiet).toEqual([]);
  });

  it("một lead nửa trống nửa đầy ⇒ điền nửa trống, giữ nửa đầy", () => {
    // Ca thật hay gặp nhất, và là chỗ một bản vá lười dễ làm sai một trong hai nửa.
    const b = dungBanCapNhatLeadTrung({
      cu: { parentName: "Chị Lan", email: null },
      file: { parentName: "Chị Lan Anh", email: "moi@moi.vn" },
      moc: MOC,
    });
    expect(b.data.email).toBe("moi@moi.vn");
    expect(b.data).not.toHaveProperty("parentName");
    expect(b.daDien).toEqual(["email"]);
    expect(b.khacBiet.map((k) => k.cot)).toEqual(["tên phụ huynh"]);
  });
});

describe("[LEAD-T72] ⚠️ ô TRỐNG trong file không phải lệnh xoá", () => {
  it("file để trống ⇒ không đụng cột đó", () => {
    const b = ban({ email: "", childName: null });
    expect(b.data).not.toHaveProperty("email");
    expect(b.data).not.toHaveProperty("childName");
  });

  it("chuỗi toàn khoảng trắng cũng là trống", () => {
    expect(ban({ email: "   " }).data).not.toHaveProperty("email");
  });

  it("file rỗng hoàn toàn ⇒ chỉ đóng mốc", () => {
    const b = ban({});
    expect(Object.keys(b.data)).toEqual(["lastInboundAt"]);
    expect(b.daDien).toEqual([]);
    expect(b.khacBiet).toEqual([]);
  });

  it("⚠️ tuổi con = 0 KHÔNG bị coi là trống", () => {
    // `!0` là `true` — cách kinh điển để một phép kiểm "trống" nuốt mất số 0.
    const b = dungBanCapNhatLeadTrung({ cu: { childAge: null }, file: { childAge: 0 }, moc: MOC });
    expect(b.data.childAge).toBe(0);
  });
});

describe("[LEAD-T73] ⚠️ GHI CHÚ chỉ được NỐI THÊM", () => {
  it("không bao giờ mất ghi chú cũ", () => {
    const b = ban({ note: "Gọi 15/09: đồng ý cho con học thử." });
    expect(String(b.data.note)).toContain("Gọi 12/09");
    expect(String(b.data.note)).toContain("Gọi 15/09");
    expect(b.daNoiGhiChu).toBe(true);
  });

  it("ghi chú cũ đứng TRƯỚC, mới nối xuống dưới", () => {
    expect(String(ban({ note: "MỚI" }).data.note)).toBe(`${CU.note}\nMỚI`);
  });

  it("⚠️ nhập LẠI cùng nội dung ⇒ KHÔNG nối bản sao thứ hai", () => {
    const b = ban({ note: "Gọi 12/09: khách bận, hẹn gọi lại thứ 5." });
    expect(b.data).not.toHaveProperty("note");
    expect(b.daNoiGhiChu).toBe(false);
  });

  it("lead chưa có ghi chú ⇒ lấy nguyên ghi chú của file", () => {
    expect(noiGhiChu(null, "A")).toBe("A");
    expect(noiGhiChu("", "A")).toBe("A");
  });

  it("nối ba lượt liên tiếp vẫn giữ đủ ba", () => {
    let n = noiGhiChu(null, "một");
    n = noiGhiChu(n, "hai") ?? n;
    n = noiGhiChu(n, "ba") ?? n;
    expect(n).toBe("một\nhai\nba");
  });
});

describe("[LEAD-T74] ⚠️ giá trị file bị từ chối PHẢI vào ghi chú", () => {
  // Đây là nửa còn lại của chốt: không ghi đè, nhưng cũng không được im lặng nuốt mất.

  it("ghi chú mang đủ giá trị đang lưu VÀ giá trị trong file", () => {
    // ⚠️ Phải neo vào CỤM ĐẦY ĐỦ, không phải chuỗi con.
    // Phép cấy lỗi chứng minh: bỏ hẳn vế `(đang lưu "…")` mà ca này vẫn XANH, vì
    // "Chị Lan Anh" CHỨA "Chị Lan" — `toContain` không phân biệt được hai giá trị khi một
    // cái là tiền tố của cái kia, mà đó đúng là hình dạng thật của dữ liệu tên người.
    const n = String(ban({ parentName: "Chị Lan Anh" }).data.note);
    expect(n).toContain('tên phụ huynh "Chị Lan Anh"');
    expect(n).toContain('đang lưu "Chị Lan"');
    expect(n).toContain("GIỮ");
  });

  it("có ngày tháng để tra ngược", () => {
    // Ghi chú nối thêm mà không có mốc thời gian thì đọc lại không biết lượt nào ghi.
    expect(String(ban({ parentName: "X" }).data.note)).toContain("15/09/2026");
  });

  it("không có khác biệt nào ⇒ KHÔNG thêm dòng đối chiếu rỗng", () => {
    expect(dongDoiChieu([], MOC)).toBeNull();
    expect(ban({}).daNoiGhiChu).toBe(false);
  });

  it("vừa có ghi chú của file vừa có khác biệt ⇒ ghi cả hai", () => {
    const n = String(ban({ note: "Khách hẹn thứ 3", parentName: "X" }).data.note);
    expect(n).toContain("Khách hẹn thứ 3");
    expect(n).toContain("đang lưu");
  });

  it("nhập lại LẦN HAI cùng khác biệt ⇒ không nhân đôi dòng đối chiếu", () => {
    // Người vận hành nhập lại cả file là chuyện thường; nối mù thì ghi chú phình vô hạn.
    const b1 = ban({ parentName: "X" });
    const b2 = dungBanCapNhatLeadTrung({
      cu: { ...CU, note: String(b1.data.note) },
      file: { parentName: "X" },
      moc: MOC,
    });
    expect(b2.data).not.toHaveProperty("note");
  });
});

describe("[LEAD-T75] trạng thái phễu và nhật ký", () => {
  it("bản cập nhật KHÔNG chứa `status`", () => {
    const b = dungBanCapNhatLeadTrung({
      cu: CU,
      file: { parentName: "X", status: "MOI" } as Parameters<
        typeof dungBanCapNhatLeadTrung
      >[0]["file"],
      moc: MOC,
    });
    expect(b.data).not.toHaveProperty("status");
  });

  it("cũng không đụng `convertedAt` hay `assignedToId`", () => {
    const b = ban({ parentName: "X" });
    expect(b.data).not.toHaveProperty("convertedAt");
    expect(b.data).not.toHaveProperty("assignedToId");
  });

  it("nhật ký nói rõ ĐIỀN gì và GIỮ gì", () => {
    const m = moTaLuotCapNhat(
      dungBanCapNhatLeadTrung({
        cu: { parentName: "Chị Lan", email: null },
        file: { parentName: "Khác", email: "e@e.vn" },
        moc: MOC,
      }),
      true,
    );
    expect(m).toContain("điền email");
    expect(m).toContain("GIỮ NGUYÊN");
    expect(m).toContain("tên phụ huynh");
    expect(m).not.toContain("parentName");
  });

  it("không điền được ô nào ⇒ nói thẳng ra", () => {
    expect(moTaLuotCapNhat(ban({}), true)).toContain("không ô trống nào được điền");
  });

  it("nói rõ lead có được chia lại hay không", () => {
    expect(moTaLuotCapNhat(ban({}), true)).toContain("chia lại");
    expect(moTaLuotCapNhat(ban({}), false)).toContain("GIỮ NGUYÊN người phụ trách");
  });
});

describe("[LEAD-T76] chỉ chia lại lead CHƯA chốt", () => {
  const DONG = ["DA_MAT"];

  it("lead đang chạy ⇒ chia lại", () => {
    expect(conMoDeChiaLai({ status: "DANG_TU_VAN", convertedAt: null, trangThaiDong: DONG }))
      .toBe(true);
  });

  it("lead đã mất ⇒ không chia lại", () => {
    expect(conMoDeChiaLai({ status: "DA_MAT", convertedAt: null, trangThaiDong: DONG }))
      .toBe(false);
  });

  it("⚠️ đã convert ⇒ KHÔNG chia lại, dù trạng thái trông như đang mở", () => {
    // Bẫy có sẵn trong repo: tập trạng thái đóng chỉ còn `DA_MAT`, nên lead convert xong vẫn
    // mang `DA_DANG_KY` và trông như đang mở. `convertedAt` mới là dấu "đã xong thật" —
    // hoa hồng đã tính theo người đang giữ, đổi chủ lúc này là tranh chấp tiền.
    expect(
      conMoDeChiaLai({
        status: "DA_DANG_KY",
        convertedAt: new Date("2026-09-01"),
        trangThaiDong: DONG,
      }),
    ).toBe(false);
  });

  it("DA_DANG_KY mà CHƯA convert ⇒ vẫn chia lại", () => {
    // Vế ngược của ca trên: chặn theo mỗi `status` là chặn nhầm cả lead mới chỉ đánh dấu
    // đăng ký mà chưa ai làm thủ tục.
    expect(
      conMoDeChiaLai({ status: "DA_DANG_KY", convertedAt: null, trangThaiDong: DONG }),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// CỔNG CHO ĐƯỜNG GHI THẬT.
//
// ⚠️ Phép cấy lỗi bắt được một lỗ ở chính bộ này: gỡ hẳn dòng đẩy lead vừa cập nhật vào vòng
// chia (tức quay lại hành vi cũ "lead trùng ở nguyên với sale cũ") mà KHÔNG ca nào đỏ. Mọi ca
// bên trên chỉ kiểm hàm thuần; hàm thuần đúng mà không ai gọi thì bằng không — đúng luật 9.
//
// Route handler cần auth + phân tích xlsx mới chạy tới chỗ này nên không dựng được bằng
// vitest. Luật 11 xếp test quét mã nguồn là loại mong manh nhất, nên bộ dưới tự ràng mình:
// neo hẹp, có ca TỰ KIỂM bộ chọn, và khẳng định cả số lần khớp.
// ─────────────────────────────────────────────────────────────────────────────────────────

const DUONG_NHAP = path.join(process.cwd(), "app", "api", "admin", "import", "leads", "route.ts");

/** Gỡ chú thích trước khi soi — chú thích giải thích bản vá thường chứa đúng chuỗi đang tìm. */
function goChuThich(s: string): string {
  return s.replace(/\/\*[^]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

const NGUON = fs.existsSync(DUONG_NHAP) ? goChuThich(fs.readFileSync(DUONG_NHAP, "utf8")) : "";

describe("[LEAD-T77] đường nhập Excel THẬT SỰ dùng luật ghi đè", () => {
  it("phép quét tự kiểm: đọc được tệp route", () => {
    expect(fs.existsSync(DUONG_NHAP), `${DUONG_NHAP} không còn ở chỗ cũ`).toBe(true);
    expect(NGUON.length).toBeGreaterThan(2000);
    // Bộ gỡ chú thích phải thật sự gỡ — nếu không, mọi ca dưới có thể khớp vào chú thích.
    const thu = ["a /* x */ b // y", "c"].join(String.fromCharCode(10));
    expect(goChuThich(thu)).toBe(["a   b  ", "c"].join(String.fromCharCode(10)));
  });

  it("dựng bản cập nhật bằng `dungBanCapNhatLeadTrung`, không tự ghép tay", () => {
    expect(NGUON).toContain("dungBanCapNhatLeadTrung(");
  });

  it("⚠️ lead vừa cập nhật ĐI QUA vòng chia — đúng một nơi quyết định", () => {
    // Chốt 15/09: "lead này sẽ được hệ thống chia lead chia lại lead luôn không giữ cho sale
    // cũ nữa". Gỡ mắt xích này là quay về hành vi cũ, và im lặng tuyệt đối.
    expect(NGUON).toContain("conMoDeChiaLai(");
    expect(NGUON).toContain("chiaLaiOps.push(");
    // Và phải đổ vào ĐÚNG vòng gọi `chiaChoLead`, không phải một mảng chết.
    expect(NGUON).toMatch(/for \(const \{ id, saleId \} of \[\.\.\.createdIds, \.\.\.chiaLaiOps\]\)/);
  });

  it("mốc nhập dùng CHUNG cho cả lượt, không tính lại từng chỗ", () => {
    // Hai chỗ tính `Date.now()` riêng là hai khoá chống trùng khác nhau cho cùng một lượt.
    expect((NGUON.match(/const mocNhap = new Date\(\)/g) ?? []).length).toBe(1);
    expect((NGUON.match(/Date\.now\(\)/g) ?? []).length).toBe(0);
  });
});
