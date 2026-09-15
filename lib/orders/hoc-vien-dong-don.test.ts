import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  conChonSan,
  conCuaPhuHuynh,
  hocVienTrenCacDong,
  locConChoODon,
  MA_LOC_CON,
  studentIdChoDon,
  thieuHocVienODong,
} from "./hoc-vien-dong-don";

/**
 * MỘT ĐƠN — NHIỀU CON (15/09/2026).
 *
 * Thứ đang canh là một luật TIỀN: "khoản này của đứa trẻ nào". `Order.studentId` được
 * đọc bởi hoàn tiền, ZNS học phí và cổng phụ huynh, nên một giá trị sai ở đó không ném
 * lỗi — nó chỉ làm cả ba nơi nói sai tên một đứa trẻ.
 */
describe("[HVD] học viên của dòng đơn", () => {
  const A = "hv-a";
  const B = "hv-b";

  it("[HVD-01] một em trên các dòng ⇒ Order.studentId là chính em đó", () => {
    expect(studentIdChoDon([{ studentId: A }, { studentId: A }], null)).toBe(A);
  });

  it("[HVD-02] HAI em ⇒ Order.studentId là null, KHÔNG quy về em đầu tiên", () => {
    // Đây là ca sinh ra cả file. Trả về `A` ở đây là hợp lý về mặt kiểu dữ liệu và
    // sai hoàn toàn về mặt nghiệp vụ: đơn của hai đứa trẻ bị gán cho một đứa.
    expect(studentIdChoDon([{ studentId: A }, { studentId: B }], null)).toBeNull();
  });

  it("[HVD-03] hai em ⇒ KHÔNG nhận giá trị client gửi lên, kể cả khi client khăng khăng", () => {
    // Đường tấn công thật: gọi thẳng server action với `studentId` tự chọn. Cột trên
    // đơn phải suy từ CÁC DÒNG, nên số client gửi bị bỏ qua hoàn toàn.
    expect(studentIdChoDon([{ studentId: A }, { studentId: B }], "hv-nguoi-la")).toBeNull();
  });

  it("[HVD-04] một em trên dòng ⇒ dòng THẮNG giá trị client gửi", () => {
    expect(studentIdChoDon([{ studentId: A }], "hv-nguoi-la")).toBe(A);
  });

  it("[HVD-05] không dòng nào khai ⇒ giữ giá trị gửi lên (đường convert-lead)", () => {
    expect(studentIdChoDon([{ studentId: null }, {}], A)).toBe(A);
    expect(studentIdChoDon([{}], null)).toBeNull();
    // Chuỗi rỗng / khoảng trắng KHÔNG phải là một học viên.
    expect(studentIdChoDon([{}], "   ")).toBeNull();
  });

  it("[HVD-06] đơn MỘT con để trống ô học viên vẫn hợp lệ (khách vãng lai)", () => {
    expect(thieuHocVienODong([{ studentId: null }])).toBe(false);
    expect(thieuHocVienODong([{ studentId: A }, { studentId: A }])).toBe(false);
  });

  it("[HVD-07] đơn HAI con còn dòng trống ⇒ chặn", () => {
    expect(thieuHocVienODong([{ studentId: A }, { studentId: B }, {}])).toBe(true);
  });

  it("[HVD-08] trim + khử trùng — id có khoảng trắng không đẻ ra 'em thứ hai'", () => {
    expect(hocVienTrenCacDong([{ studentId: ` ${A} ` }, { studentId: A }])).toEqual([A]);
    // và vì thế đơn này vẫn là đơn MỘT con:
    expect(studentIdChoDon([{ studentId: ` ${A} ` }, { studentId: A }], null)).toBe(A);
  });
});

/**
 * LƯỚI GHIM MÃ NGUỒN — `createOrderManualAction` phải DÙNG hàm trên, không tự tính.
 *
 * Vì sao cần lưới: mọi ca ở trên vẫn XANH nếu action bỏ quên `studentIdChoDon(...)` và
 * quay lại ghi thẳng `data.studentId` — hàm thuần đúng, còn lời gọi thì biến mất. Đó
 * đúng là lớp bug mà mẫu này sinh ra để chặn (xem CLAUDE.md, mục LƯỚI GHIM MÃ NGUỒN).
 *
 * Đã cấy lại để thấy ĐỎ: đổi `studentId: studentIdCuaDon` về `studentId: data.studentId
 * || null` ⇒ [HVD-09] đỏ; xoá lời gọi `thieuHocVienODong(data.items)` ⇒ [HVD-10] đỏ.
 */
describe("[HVD] lưới ghim: action không được tự tính lại luật này", () => {
  const nguon = readFileSync(
    resolve(process.cwd(), "app/(admin)/admin/orders/_actions.ts"),
    "utf8",
  );

  it("[HVD-09] cột studentId của đơn ghi bằng giá trị SUY RA, không phải data.studentId", () => {
    // Chuỗi hẹp: chính dòng `data` của `order.create`. Không cờ /s.
    expect(nguon).toMatch(/studentId: studentIdCuaDon,/);
    // Và không còn đường ghi thẳng giá trị client gửi vào cột đó.
    expect(nguon).not.toMatch(/studentId: data\.studentId \|\| null,/);
    // `studentIdCuaDon` phải đến TỪ hàm dùng chung, không phải một phép tính chép lại.
    expect(nguon).toMatch(/const studentIdCuaDon = studentIdChoDon\(data\.items, data\.studentId\);/);
  });

  it("[HVD-10] cổng 'đơn nhiều con thì mọi dòng phải khai' có mặt ở SERVER", () => {
    // Form cũng gọi hàm này, nhưng form chạy ở client — cổng thật phải ở action.
    const goi = nguon.match(/thieuHocVienODong\(data\.items\)/g) ?? [];
    expect(goi.length).toBe(1);
  });

  it("[HVD-11] mọi studentId client gửi đều đi qua cổng scope trước khi ghi", () => {
    // Bao gồm CẢ `data.studentId` cấp đơn — trước 15/09/2026 cột đó chưa từng được tra.
    expect(nguon).toMatch(
      /\.\.\.\(data\.studentId\?\.trim\(\) \? \[data\.studentId\.trim\(\)\] : \[\]\)/,
    );
    expect(nguon).toMatch(/where: \{ id: \{ in: hocVienIds \}, deletedAt: null \}/);
  });
});

// ═══ CON CỦA MỘT SỐ ĐIỆN THOẠI [15/09/2026] ═══════════════════════════════════
//
// Chủ dự án: *"ở dưới khoá học thì tên học viên được chọn sẵn 1 trong số con của PH luôn"*.
//
// ⚠️ Số liệu trong các ca dưới là HÌNH DẠNG THẬT của DB, không phải số tròn trịa: đo trên
// `satarobo_local` thì `Lead.phone` mẫu là `84930000001` còn ô nhập của người bán cho ra
// `0930000001`. Đây đúng là chỗ so chuỗi thô sẽ lọc mất bản ghi cần tìm.
const HV = [
  { id: "hv1", parentPhone: "84930000001" },
  { id: "hv2", parentPhone: "0930000001" },   // cùng một phụ huynh, ghi kiểu khác
  { id: "hv3", parentPhone: "0905123456" },
  { id: "hv4", parentPhone: null },
];

describe("[CON-01] khớp theo SĐT ĐÃ CHUẨN HOÁ, không so chuỗi thô", () => {
  it("84… và 0… của cùng một số là MỘT phụ huynh", () => {
    expect(conCuaPhuHuynh(HV, "0930000001").map((h) => h.id)).toEqual(["hv1", "hv2"]);
    expect(conCuaPhuHuynh(HV, "84930000001").map((h) => h.id)).toEqual(["hv1", "hv2"]);
    expect(conCuaPhuHuynh(HV, "+84 930 000 001").map((h) => h.id)).toEqual(["hv1", "hv2"]);
  });

  it("phụ huynh khác thì không lẫn sang", () => {
    expect(conCuaPhuHuynh(HV, "0905123456").map((h) => h.id)).toEqual(["hv3"]);
  });

  it("học viên không có SĐT phụ huynh KHÔNG bao giờ khớp", () => {
    expect(conCuaPhuHuynh(HV, "0930000001").some((h) => h.id === "hv4")).toBe(false);
  });
});

describe("[CON-02] chưa biết SĐT ⇒ RỖNG, KHÔNG phải 'tất cả'", () => {
  it("rỗng / khoảng trắng / null / undefined", () => {
    for (const x of ["", "   ", null, undefined]) {
      expect(conCuaPhuHuynh(HV, x), `sdt=${JSON.stringify(x)}`).toEqual([]);
    }
  });

  it("chuỗi không phải số điện thoại", () => {
    for (const x of ["abc", "123", "0000000000"]) {
      expect(conCuaPhuHuynh(HV, x), `sdt=${x}`).toEqual([]);
    }
  });

  it("SĐT hợp lệ nhưng không ai là con ⇒ rỗng", () => {
    expect(conCuaPhuHuynh(HV, "0988888888")).toEqual([]);
  });
});

describe("[CON-03] con CHỌN SẴN = em đầu tiên của danh sách", () => {
  it("đúng em đầu, theo thứ tự danh sách đang bày", () => {
    expect(conChonSan(HV, "0930000001")).toBe("hv1");
    expect(conChonSan([...HV].reverse(), "0930000001")).toBe("hv2");
  });

  it("một con ⇒ chính em đó", () => {
    expect(conChonSan(HV, "0905123456")).toBe("hv3");
  });

  it("không khớp ai / chưa có SĐT ⇒ null, KHÔNG đoán bừa một em", () => {
    expect(conChonSan(HV, "0988888888")).toBeNull();
    expect(conChonSan(HV, "")).toBeNull();
    expect(conChonSan([], "0930000001")).toBeNull();
  });
});

// ═══ [LOC] Ô CHỌN HỌC VIÊN BÀY RA TẬP NÀO — 16/09/2026 ════════════════════════
//
// Chủ dự án nêu lỗi LẦN THỨ HAI: *"bộ lọc học viên khi đã lọc sđt ph vẫn hiển thị full
// chứ không hiển thị chỉ con của PH đó, dẫn đến loạn, có thể chọn sai con"*.
//
// Vì sao bộ test CŨ không bắt được: mọi ca ở trên kiểm `conCuaPhuHuynh` — HÀM THUẦN, và
// hàm đó VỐN ĐÚNG (fail-closed, trả `[]` khi không khớp). Lỗi nằm ở màn hình, một dòng
// biến `[]` thành "cả danh sách":
//
//     const dung = conCuaSdt.length > 0 ? conCuaSdt : students;   // fail-open
//
// Đúng luật 9 của repo: cổng được cho ăn bằng đầu vào gõ tay thì nó kiểm cổng, không kiểm
// hệ thống. Nay quyết định "bày ai" đã ra khỏi màn hình nên nó KIỂM ĐƯỢC — và lưới dưới
// đây canh chính cái quyết định đó, không canh phép so SĐT.
const DS_LOC = [
  { id: "a", parentPhone: "84930000001" },
  { id: "b", parentPhone: "0930000001" }, // cùng nhà, viết dạng nội địa
  { id: "c", parentPhone: "84930000002" },
  { id: "d", parentPhone: null },
];

describe("[LOC-01] SĐT đọc được mà KHÔNG con nào khớp ⇒ ô chọn RỖNG", () => {
  it("không bày lại cả danh sách — đây là toàn bộ mục đích của bản vá", () => {
    const r = locConChoODon(DS_LOC, "0999888777", false);
    expect(r.ma).toBe(MA_LOC_CON.KHONG_CO_CON);
    expect(r.ds).toEqual([]);
    // Ghim đúng con số làm hại: trước bản vá giá trị này là 4 (cả danh sách).
    expect(r.ds.length).not.toBe(DS_LOC.length);
    expect(r.soCon).toBe(0);
    expect(r.tong).toBe(4);
  });
});

describe("[LOC-02] SĐT có con ⇒ bày ĐÚNG các con đó, khớp cả hai dạng SĐT", () => {
  it("84… và 0… của cùng một nhà đều vào tập", () => {
    const r = locConChoODon(DS_LOC, "0930000001", false);
    expect(r.ma).toBe(MA_LOC_CON.DANG_LOC);
    expect(r.ds.map((h) => h.id)).toEqual(["a", "b"]);
    expect(r.soCon).toBe(2);
  });

  it("gõ dạng 84… cho ra ĐÚNG cùng tập — bẫy hình dạng SĐT không được tái sinh", () => {
    const a = locConChoODon(DS_LOC, "84930000001", false);
    const b = locConChoODon(DS_LOC, "0930000001", false);
    expect(a.ds.map((h) => h.id)).toEqual(b.ds.map((h) => h.id));
  });
});

describe("[LOC-03] CHƯA đọc được SĐT ⇒ bày ĐỦ, cố ý", () => {
  it("trống / null / đang gõ dở đều bày đủ — chặn lúc đang gõ là ô chọn nhảy loạn", () => {
    for (const sdt of ["", null, undefined, "093", "0930"]) {
      const r = locConChoODon(DS_LOC, sdt, false);
      expect(r.ma).toBe(MA_LOC_CON.CHUA_CO_SDT);
      expect(r.ds.length).toBe(4);
    }
  });

  it("số CỐ ĐỊNH cũng là 'chưa đọc được' — không được biến thành ô rỗng", () => {
    // `canonicalPhone` chỉ nhận di động; số bàn trả null. Nếu ca này ra KHONG_CO_CON thì
    // người bán gõ nhầm số cơ sở vào là ô chọn trống trơn mà không hiểu vì sao.
    const r = locConChoODon(DS_LOC, "02363123456", false);
    expect(r.ma).toBe(MA_LOC_CON.CHUA_CO_SDT);
    expect(r.ds.length).toBe(4);
  });
});

describe("[LOC-04] BÀY TAY thắng mọi nhánh — cú bấm của người không được hệ thống huỷ", () => {
  it("đã xin cả danh sách thì SĐT khớp 1 con cũng KHÔNG thu ô lại", () => {
    const r = locConChoODon(DS_LOC, "84930000002", true);
    expect(r.ma).toBe(MA_LOC_CON.BAY_TAY);
    expect(r.ds.length).toBe(4);
    // Vẫn phải nói THẬT số con khớp, để câu nhắc không nói dối.
    expect(r.soCon).toBe(1);
  });

  it("bày tay lúc chưa có SĐT vẫn là BAY_TAY, không phải CHUA_CO_SDT", () => {
    // Hai nhánh này cùng bày đủ danh sách nhưng câu nhắc KHÁC nhau; trộn mã là màn hình
    // nói "đang lọc theo SĐT" trong lúc không lọc gì.
    expect(locConChoODon(DS_LOC, "", true).ma).toBe(MA_LOC_CON.BAY_TAY);
  });
});

describe("[LOC-05] không trả về CHÍNH mảng nguồn — tránh người gọi lỡ tay sắp xếp tại chỗ", () => {
  it("mảng trả về là bản sao ở hai nhánh bày-đủ", () => {
    expect(locConChoODon(DS_LOC, "", false).ds).not.toBe(DS_LOC);
    expect(locConChoODon(DS_LOC, "", true).ds).not.toBe(DS_LOC);
  });
});

// ⚠️ LƯỚI GHIM MÃ NGUỒN — canh chính dòng đã sinh ra lỗi, ở CHÍNH tệp màn hình.
// Bộ test cũ có một lưới ghim nhưng nó chỉ soi `_actions.ts` (server); không ca nào chạm
// `order-create-form.tsx`, nên dòng fail-open sống qua hai bản vá. Theo luật 11 (test grep
// mã nguồn là loại mong manh nhất): neo chuỗi HẸP, không dùng cờ `/s`, và khẳng định cả SỐ
// LẦN khớp — chú thích giải thích bản vá có chứa đúng chuỗi đang cấm, nên phải đếm.
describe("[LOC-06] lưới ghim: màn hình KHÔNG được tự quyết 'bày ai'", () => {
  const THO = readFileSync(
    resolve(process.cwd(), "app/(admin)/admin/orders/_components/order-create-form.tsx"),
    "utf8",
  );

  /**
   * ⚠️ BỎ CHÚ THÍCH TRƯỚC KHI SOI — bước này KHÔNG phải cho gọn, nó là điều kiện để lưới
   * có nghĩa. Viết xong lưới lần đầu tôi thấy nó ĐỎ ngay trên bản ĐÃ VÁ: chú thích tôi
   * vừa đặt trong `order-create-form.tsx` giải thích bản vá bằng cách TRÍCH NGUYÊN chuỗi
   * đang cấm, nên bộ so khớp tìm thấy chú thích chứ không tìm thấy mã.
   *
   * CLAUDE.md đã ghi đúng bẫy này ("chú thích giải thích bản vá thường chứa đúng chuỗi
   * đang cấm" — luật 11, và `affordance-coverage.test.ts` phải viết lại BA lần vì nó).
   * Cách vá bằng "neo chuỗi hẹp hơn" chỉ đẩy vấn đề sang lần sau; bỏ chú thích thì lưới
   * soi đúng thứ nó tuyên bố là soi.
   */
  const FORM = THO
    // Khối /* … */ trước, rồi // đến hết dòng. `.` KHÔNG khớp ký tự xuống dòng khi không
    // có cờ `s`, nên `//.*` tự dừng ở cuối dòng — không cần tách dòng, và cố ý không dùng
    // cờ `s` (luật 11: `/s` biến bộ so khớp hẹp thành bộ so khớp cả tệp).
    // Vế `[^:]` giữ lại `https://…` trong chuỗi, kẻo cắt nhầm giữa một URL.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*/g, "$1");

  it("bước bỏ chú thích PHẢI thật sự bỏ được — CẢ HAI kiểu chú thích", () => {
    // Nếu bộ bỏ chú thích hỏng, ba ca dưới xanh vĩnh viễn mà không ai biết. Ca này là
    // lưới-canh-lưới: mỗi chuỗi mồi CÓ trong bản thô và KHÔNG còn trong bản đã lọc.
    //
    // ⚠️ PHẢI CÓ MỒI CHO CẢ HAI BỘ LỌC. Bản đầu của ca này chỉ mồi bằng chuỗi `/D/g`, mà
    // chuỗi đó nằm trong chú thích KHỐI `{/* … */}` — nên lúc cấy thử "bộ bỏ chú thích
    // DÒNG hoá no-op" thì ca này vẫn XANH (đo thật: 7/8 ca cấy cắn, đúng ca này không).
    // Một canary chỉ canh một nửa thứ nó tuyên bố canh thì nửa kia không có lưới.

    // (1) mồi nằm trong chú thích KHỐI
    expect(THO).toMatch(/replace\(\/D\/g/);
    expect(FORM).not.toMatch(/replace\(\/D\/g/);

    // (2) mồi nằm trong chú thích DÒNG `//`
    expect(THO).toMatch(/Dòng cũ ở đây là/);
    expect(FORM).not.toMatch(/Dòng cũ ở đây là/);

    // (3) và bản lọc phải NGẮN HƠN thật — chặn ca cả hai bộ lọc cùng hoá no-op.
    expect(FORM.length).toBeLessThan(THO.length * 0.95);
  });

  it("dòng fail-open không được sống lại ở vị trí GÁN", () => {
    // Trước bản vá: `const dung = conCuaSdt.length > 0 ? conCuaSdt : students;`
    // Chú thích nay CÓ nhắc lại chuỗi đó để người đọc sau biết lưới chặn gì, nên khẳng
    // định phải là "không xuất hiện ở dạng GÁN", không phải "không xuất hiện".
    expect(FORM).not.toMatch(/const\s+dung\s*=\s*conCuaSdt\.length\s*>\s*0/);
  });

  it("ô chọn lấy tập từ `locConChoODon`, đúng MỘT lần", () => {
    expect(FORM.match(/locConChoODon\(/g)?.length).toBe(1);
    expect(FORM).toMatch(/const\s+dung\s*=\s*loc\.ds;/);
  });

  it("biểu thức `/D/g` thiếu gạch chéo không được tái sinh", () => {
    // Lỗi câm đã sống suốt đời dòng cũ: `customerPhone.replace(/D/g, "")` xoá chữ "D" hoa
    // chứ không xoá ký tự không-phải-số. Dòng 498 cùng tệp viết đúng `/\D/g`.
    expect(FORM).not.toMatch(/replace\(\/D\/g/);
  });
});
