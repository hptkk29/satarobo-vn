/**
 * NHẬP LEAD HÀNG LOẠT — hai sự cố prod ngày 15/09/2026, cùng một lượt nhập Excel.
 *
 * ── SỰ CỐ 1: lead nhập xong KHÔNG hiện ở /leads ──────────────────────────────────────────
 * Quản lý cơ sở nhập Excel. Sổ chia lead nhảy số đúng, tìm theo SĐT hay theo nguồn thì lead
 * hiện ra — nhưng mở `/leads` thì không thấy.
 *
 * Nguyên nhân: danh sách sắp theo `lastInboundAt` với `nulls: 'last'`
 * (`app/(admin)/admin/leads/page.tsx`), mà đường import KHÔNG ghi cột đó. Lead có
 * `lastInboundAt = null` bị đẩy xuống SAU toàn bộ lead cũ — tức những trang cuối cùng.
 *
 * Hai triệu chứng khớp nhau ở đúng chỗ này: lọc theo SĐT/nguồn làm tập kết quả co lại còn
 * vài dòng nên lead null lọt vào trang 1; bỏ lọc ra thì nó chìm.
 *
 * ⚠️ Rà cả repo tìm ra 5/7 nơi tạo lead thiếu cột này — không riêng đường import. Cột là
 * `DateTime?` không có `@default`, nên quên là null, và null thì im lặng.
 *
 * ── SỰ CỐ 2: nhập 40 lead thì bắn 40 chuông ──────────────────────────────────────────────
 * Chủ dự án chốt: "nhập nhiều thì báo là có bao nhiêu lead mới chứ không gửi nhiều thông báo".
 * Đây cũng là điều đúng về kỹ thuật — 40 lần rung máy liên tiếp là "bão push" mà
 * `lib/push/allowlist.ts` nói là cái giá không lấy lại được.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const h = vi.hoisted(() => ({
  notifyStaff: vi.fn(async (_p: Record<string, unknown>) => 1),
  thuHoiThongBao: vi.fn(async () => 1),
  broadcastNotificationBump: vi.fn(async () => undefined),
}));
vi.mock("@/lib/notifications/notify", () => ({
  notifyStaff: h.notifyStaff,
  thuHoiThongBao: h.thuHoiThongBao,
  broadcastNotificationBump: h.broadcastNotificationBump,
}));

import { baoSaleNhieuLeadMoi, lenKeHoachBaoNhapHangLoat } from "./assign-lead";

const tinCuoi = () => {
  const c = h.notifyStaff.mock.calls.at(-1)?.[0];
  if (!c) throw new Error("notifyStaff chưa được gọi lần nào");
  return c;
};

beforeEach(() => {
  vi.clearAllMocks();
  h.notifyStaff.mockResolvedValue(1);
});

describe("[LEAD-T60] chuông GỘP khi nhập hàng loạt", () => {
  it("nhận nhiều lead ⇒ ĐÚNG MỘT chuông, nói rõ số lượng", async () => {
    await baoSaleNhieuLeadMoi({ ownerId: "sale_a", soLead: 12, mocLuot: 1789400000000 });
    expect(h.notifyStaff).toHaveBeenCalledTimes(1);
    expect(String(tinCuoi().title)).toContain("12");
  });

  it("chỉ tới ĐÚNG người nhận, không ai khác", async () => {
    await baoSaleNhieuLeadMoi({ ownerId: "sale_a", soLead: 5, mocLuot: 1 });
    expect(tinCuoi().userIds).toEqual(["sale_a"]);
  });

  it("⚠️ đúng MỘT lead ⇒ KHÔNG dùng tin gộp", async () => {
    // Một lead thì `baoSaleCoLeadMoi` tốt hơn hẳn: nó trỏ thẳng trang chi tiết, bấm là đọc
    // được số điện thoại. Tin gộp chỉ trỏ về danh sách.
    await baoSaleNhieuLeadMoi({ ownerId: "sale_a", soLead: 1, mocLuot: 1 });
    expect(h.notifyStaff).not.toHaveBeenCalled();
  });

  it("không lead nào ⇒ im", async () => {
    await baoSaleNhieuLeadMoi({ ownerId: "sale_a", soLead: 0, mocLuot: 1 });
    expect(h.notifyStaff).not.toHaveBeenCalled();
  });

  it("hai lượt nhập khác nhau ⇒ hai khoá khác nhau (không bị nuốt mất tin thứ hai)", async () => {
    // `@@unique([userId, dedupeKey])` nuốt lượt thứ hai nếu khoá trùng — sale sẽ không biết
    // mình vừa nhận thêm lead. Đây là lý do khoá CÓ mốc thời gian, ngược với luật chung.
    await baoSaleNhieuLeadMoi({ ownerId: "sale_a", soLead: 3, mocLuot: 1_000 });
    const k1 = tinCuoi().dedupeKey;
    await baoSaleNhieuLeadMoi({ ownerId: "sale_a", soLead: 4, mocLuot: 2_000 });
    expect(tinCuoi().dedupeKey).not.toBe(k1);
  });

  it("CÙNG một lượt ⇒ mỗi người một khoá riêng", async () => {
    await baoSaleNhieuLeadMoi({ ownerId: "sale_a", soLead: 3, mocLuot: 7 });
    const kA = tinCuoi().dedupeKey;
    await baoSaleNhieuLeadMoi({ ownerId: "sale_b", soLead: 2, mocLuot: 7 });
    expect(tinCuoi().dedupeKey).not.toBe(kA);
  });

  it("khoá mang đúng tiền tố đã khai trong danh mục", async () => {
    // Sai tiền tố thì thông báo rơi về nhóm "Hệ thống / P3" — nằm chót panel, không ai thấy.
    await baoSaleNhieuLeadMoi({ ownerId: "sale_a", soLead: 3, mocLuot: 1 });
    expect(String(tinCuoi().dedupeKey).startsWith("lead.moi_nhieu:")).toBe(true);
  });

  it("chuông hỏng ⇒ KHÔNG ném (lượt nhập vẫn phải thành công)", async () => {
    h.notifyStaff.mockRejectedValue(new Error("DB chập"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      baoSaleNhieuLeadMoi({ ownerId: "sale_a", soLead: 3, mocLuot: 1 }),
    ).resolves.toBeUndefined();
  });
});

describe("[LEAD-T62] gom tin theo NGƯỜI NHẬN", () => {
  const ke = lenKeHoachBaoNhapHangLoat;

  it("⚠️ mỗi người một tin — KHÔNG phải một tin chung cho cả lượt", () => {
    // Đây là chỗ lỗi dễ lọt nhất: đếm tổng số lead của lượt rồi bắn một tin. Sale nhận
    // "bạn có 40 lead mới" trong khi thực nhận 7.
    const kq = ke([
      { leadId: "l1", ownerId: "a" },
      { leadId: "l2", ownerId: "b" },
      { leadId: "l3", ownerId: "a" },
      { leadId: "l4", ownerId: "b" },
      { leadId: "l5", ownerId: "a" },
    ]);
    expect(kq).toEqual([
      { kieu: "gop", ownerId: "a", soLead: 3 },
      { kieu: "gop", ownerId: "b", soLead: 2 },
    ]);
  });

  it("người chỉ nhận MỘT lead ⇒ tin thường, mang đúng lead đó", () => {
    const kq = ke([
      { leadId: "l1", ownerId: "a" },
      { leadId: "l2", ownerId: "b" },
      { leadId: "l3", ownerId: "b" },
    ]);
    expect(kq).toEqual([
      { kieu: "mot", ownerId: "a", leadId: "l1" },
      { kieu: "gop", ownerId: "b", soLead: 2 },
    ]);
  });

  it("ngưỡng gộp đúng ở HAI, không phải ba", () => {
    expect(ke([{ leadId: "l1", ownerId: "a" }, { leadId: "l2", ownerId: "a" }])).toEqual([
      { kieu: "gop", ownerId: "a", soLead: 2 },
    ]);
  });

  it("mỗi người xuất hiện ĐÚNG MỘT lần trong kế hoạch", () => {
    const kq = ke(
      Array.from({ length: 20 }, (_, i) => ({ leadId: `l${i}`, ownerId: i % 3 === 0 ? "a" : "b" })),
    );
    expect(new Set(kq.map((t) => t.ownerId)).size).toBe(kq.length);
  });

  it("cùng một lead lọt hai lần ⇒ đếm MỘT", () => {
    // Con số trong tin là thứ người nhận đối chiếu với danh sách của họ. Lệch một cái là
    // họ ngừng tin cả cơ chế.
    expect(ke([
      { leadId: "l1", ownerId: "a" },
      { leadId: "l1", ownerId: "a" },
    ])).toEqual([{ kieu: "mot", ownerId: "a", leadId: "l1" }]);
  });

  it("lượt nhập không chia được cho ai ⇒ không tin nào", () => {
    expect(ke([])).toEqual([]);
  });

  it("dòng thiếu chủ hoặc thiếu lead bị bỏ, không đẻ tin rỗng", () => {
    expect(ke([
      { leadId: "l1", ownerId: "" },
      { leadId: "", ownerId: "a" },
      { leadId: "l2", ownerId: "a" },
    ])).toEqual([{ kieu: "mot", ownerId: "a", leadId: "l2" }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Cổng chống tái phát cho SỰ CỐ 1.
// ─────────────────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();

/**
 * ⚠️ GỠ CHÚ THÍCH TRƯỚC KHI SO KHỚP.
 *
 * Bản đầu của cổng này KHÔNG BITE, và phép cấy lỗi bắt được ngay ở ca đầu tiên: gỡ hẳn dòng
 * `lastInboundAt: new Date()` khỏi đường nhập mà cổng vẫn XANH — vì ngay phía trên nó là khối
 * chú thích GIẢI THÍCH bản vá, và khối đó chứa đúng chữ `lastInboundAt`.
 *
 * Đây là cái bẫy luật 11 nêu đích danh, và là lần thứ tư nó cắn trong repo này. Chú thích
 * càng viết kỹ thì cổng càng dễ tự ru ngủ.
 */
function goChuThich(s: string): string {
  return s.replace(/\/\*[^]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Cắt đúng đối số của một lời gọi bắt đầu tại dấu `(`. */
function khoiGoi(src: string, i: number): string {
  let sau = 0;
  for (let k = i; k < Math.min(src.length, i + 20000); k++) {
    if (src[k] === "(") sau++;
    else if (src[k] === ")") {
      sau--;
      if (sau === 0) return src.slice(i, k + 1);
    }
  }
  return src.slice(i, i + 4000);
}

function quetTep(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const ten of fs.readdirSync(dir)) {
    const p = path.join(dir, ten);
    if (fs.statSync(p).isDirectory()) {
      if (ten === "node_modules" || ten === ".next") continue;
      quetTep(p, out);
    } else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const NOI_TAO_LEAD: { tep: string; coCot: boolean }[] = [];
for (const p of [...quetTep(path.join(ROOT, "lib")), ...quetTep(path.join(ROOT, "app"))]) {
  const src = fs.readFileSync(p, "utf8");
  for (const m of src.matchAll(/\blead\.create\s*(?=\()/g)) {
    const i = src.indexOf("(", m.index! + m[0].length - 1);
    NOI_TAO_LEAD.push({
      tep: path.relative(ROOT, p).split(path.sep).join("/"),
      // Không chỉ gỡ chú thích — còn đòi ĐÚNG hình dạng gán trường (`lastInboundAt:`), để
      // một chuỗi trần lọt vào đâu đó cũng không đánh lừa được.
      coCot: /\blastInboundAt\s*:/.test(goChuThich(khoiGoi(src, i))),
    });
  }
}

describe("[LEAD-T61] mọi nơi TẠO lead đều phải ghi `lastInboundAt`", () => {
  it("phép quét tự kiểm: tìm được nơi tạo lead", () => {
    // Regex hỏng thì danh sách rỗng và ca dưới xanh giả.
    expect(NOI_TAO_LEAD.length, "không tìm thấy lời gọi `lead.create` nào").toBeGreaterThanOrEqual(5);
  });

  it("⚠️ không nơi nào bỏ trống cột quyết định thứ tự danh sách", () => {
    // Cột là `DateTime?` KHÔNG có `@default`, mà `/leads` sắp theo nó với `nulls: 'last'`.
    // Quên ghi ⇒ lead chìm xuống trang cuối ⇒ "nhập xong không thấy lead đâu".
    //
    // Đo 15/09/2026 TRƯỚC bản vá: 5/7 nơi thiếu — gồm cả form công khai và màn nhập tay,
    // không riêng đường import. Tức đây là lớp lỗi lặp lại, không phải một lần sơ ý.
    const thieu = NOI_TAO_LEAD.filter((x) => !x.coCot).map((x) => x.tep);
    expect(
      thieu,
      "Thêm `lastInboundAt: new Date()` vào khối `data` — xem chú thích ở " +
        "`lib/tables/lead-columns.ts` về quy ước lúc tạo:\n  - " + thieu.join("\n  - "),
    ).toEqual([]);
  });
});
