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

describe("[LEAD-T70] file THẮNG ở ô file có giá trị", () => {
  it("ghi đè tên phụ huynh khi file ghi khác", () => {
    const b = ban({ parentName: "Chị Lan Anh" });
    expect(b.data.parentName).toBe("Chị Lan Anh");
    expect(b.daDoi).toContain("tên phụ huynh");
  });

  it("ghi đè được mọi cột đã khai là ghi đè được", () => {
    const b = ban({
      parentName: "X",
      email: "moi@moi.vn",
      childName: "Bé Bình",
      childAge: 9,
      centerId: "cs2",
      courseId: "kh_robosim",
      source: "ZALO",
    });
    expect(b.data).toMatchObject({
      parentName: "X",
      email: "moi@moi.vn",
      childName: "Bé Bình",
      childAge: 9,
      centerId: "cs2",
      courseId: "kh_robosim",
      source: "ZALO",
    });
    expect(b.daDoi).toHaveLength(7);
  });

  it("cắt khoảng trắng hai đầu trước khi ghi", () => {
    expect(ban({ parentName: "  Chị Mai  " }).data.parentName).toBe("Chị Mai");
  });

  it("luôn đóng mốc `lastInboundAt` — nhập lại LÀ một lần khách quay lại", () => {
    // Đây là thứ đẩy lead lên đầu `/leads` để Sale thấy mà gọi. Thiếu nó thì lead cập nhật
    // xong vẫn nằm im ở trang cũ — đúng triệu chứng "nhập xong không thấy lead đâu".
    expect(ban({}).data.lastInboundAt).toBe(MOC);
  });
});

describe("[LEAD-T71] ⚠️ ô TRỐNG không phải lệnh xoá", () => {
  // Người nhập bỏ trống vì họ KHÔNG BIẾT, không phải vì họ muốn xoá. Đây là khác biệt quan
  // trọng nhất của cả tệp: hiểu ngược là mỗi lượt nhập lại bào mòn dữ liệu đang có.
  it("ô trống ⇒ không đụng cột đó", () => {
    const b = ban({ parentName: "Chị Lan Anh", email: "", childName: null });
    expect(b.data).not.toHaveProperty("email");
    expect(b.data).not.toHaveProperty("childName");
  });

  it("chuỗi toàn khoảng trắng cũng là trống", () => {
    expect(ban({ email: "   " }).data).not.toHaveProperty("email");
  });

  it("file rỗng hoàn toàn ⇒ chỉ đóng mốc, không đổi gì", () => {
    const b = ban({});
    expect(Object.keys(b.data)).toEqual(["lastInboundAt"]);
    expect(b.daDoi).toEqual([]);
  });

  it("⚠️ tuổi con = 0 KHÔNG bị coi là trống", () => {
    // `!0` là `true` — đây là cách kinh điển để một phép kiểm "trống" nuốt mất số 0.
    // Tuổi 0 ngoài khoảng 3–18 nên tầng phân tích chặn trước, nhưng luật ở đây phải đúng
    // theo giá trị chứ không dựa vào tầng khác đứng chắn.
    expect(ban({ childAge: 0 }).data.childAge).toBe(0);
  });
});

describe("[LEAD-T72] không ghi cột không đổi", () => {
  it("giá trị giống hệt ⇒ không đưa vào bản cập nhật", () => {
    // Ghi lại y nguyên giá trị cũ vẫn làm `updatedAt` nhảy, và nhật ký báo "đã cập nhật tên
    // phụ huynh" trong khi không có gì đổi — người đi tra sau này mất công vô ích.
    const b = ban({ parentName: "Chị Lan", email: "lan@cu.vn" });
    expect(b.data).not.toHaveProperty("parentName");
    expect(b.daDoi).toEqual([]);
  });

  it("khác nhau chỉ ở khoảng trắng ⇒ vẫn coi là không đổi", () => {
    expect(ban({ parentName: "  Chị Lan " }).data).not.toHaveProperty("parentName");
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
    const b = ban({ note: "MỚI" });
    expect(String(b.data.note)).toBe(`${CU.note}\nMỚI`);
  });

  it("file không ghi chú ⇒ không đụng cột ghi chú", () => {
    expect(ban({ note: "" }).data).not.toHaveProperty("note");
    expect(ban({}).daNoiGhiChu).toBe(false);
  });

  it("⚠️ nhập LẠI cùng nội dung ⇒ KHÔNG nối bản sao thứ hai", () => {
    // Người vận hành sửa vài dòng rồi nhập lại cả file là chuyện thường. Nối mù thì sau ba
    // lượt ô ghi chú không đọc được nữa.
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

describe("[LEAD-T74] ⚠️ TRẠNG THÁI PHỄU không bao giờ bị đụng", () => {
  it("bản cập nhật KHÔNG chứa `status`", () => {
    // Đẩy một lead đang ở L3 về MOI là làm lệch báo cáo phễu và hoa hồng. File nhập không có
    // cột này, nhưng cổng phải nằm ở tầng luật chứ không dựa vào "file không có cột đó".
    const b = dungBanCapNhatLeadTrung({
      cu: CU,
      // Ép kiểu để dựng đúng ca người sau thêm cột: nếu ai đó nối `status` vào đường này thì
      // ca test phải đỏ, chứ không phải không biên dịch được rồi thôi.
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
});

describe("[LEAD-T75] nhật ký nói ĐÚNG cái gì đã đổi", () => {
  it("liệt kê tên cột bằng tiếng Việt người vận hành đọc được", () => {
    const m = moTaLuotCapNhat(ban({ parentName: "X", email: "e@e.vn" }), true);
    expect(m).toContain("tên phụ huynh");
    expect(m).toContain("email");
    // Không được lộ tên cột kỹ thuật ra màn hình người vận hành.
    expect(m).not.toContain("parentName");
  });

  it("không có gì đổi ⇒ nói thẳng là không có gì đổi", () => {
    // Một dòng "Cập nhật từ import Excel" trống rỗng là thứ tệ nhất: chứng minh có người đụng
    // vào mà không nói đụng cái gì, nên ai nghi mất dữ liệu cũng không tra được.
    expect(moTaLuotCapNhat(ban({}), true)).toContain("không có gì để cập nhật");
  });

  it("nói rõ có nối ghi chú hay không", () => {
    expect(moTaLuotCapNhat(ban({ note: "mới" }), true)).toContain("không ghi đè ghi chú cũ");
    expect(moTaLuotCapNhat(ban({}), true)).not.toContain("ghi chú");
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
