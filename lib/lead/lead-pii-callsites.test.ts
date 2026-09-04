// lib/lead/lead-pii-callsites.test.ts — S-1 (26/08/2026). Test viết TRƯỚC hiện
// thực (luật cứng #5).
//
// VÌ SAO CÓ FILE NÀY. `lib/auth/lead-pii-policy.test.ts` đã khoá *chính sách*
// (ai có `leads:view-pii`), `lib/lead/pii.test.ts` đã khoá *hàm che*. Cả hai
// vẫn xanh trong khi số điện thoại thật chảy ra bốn màn hình — vì không ai khoá
// **chỗ gọi**. Q9 (22/08) gỡ quyền xem SĐT của Quản lý cơ sở, nhưng gỡ quyền chỉ
// có tác dụng ở những màn CHỊU HỎI quyền đó.
//
// Ba loại rò được khoá ở đây:
//   (a) màn in thẳng `lead.phone` ra JSX, hoặc tự chế mặt nạ riêng;
//   (b) vai không có quyền lead vẫn rơi vào bảng "Leads mới nhất" của dashboard;
//   (c) ô TÌM theo SĐT không gác quyền — không hiện số nhưng cho DÒ: gõ đủ số là
//       biết khách đó của ai. Rò gián tiếp, và là loại dễ bỏ sót nhất.
//
// Cách khoá: phần THUẦN (hàm dựng `where`, hàm che) test bằng gọi hàm; phần nằm
// trong Server Component (không dựng được trong vitest vì kéo theo next-auth +
// Prisma) khoá bằng **chốt chặn nguồn** — đọc file, bỏ chú thích, soi mẫu. Cùng
// kiểu đã dùng ở `lib/lead/sale-leads.test.ts`.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ROLE_SEED } from "../../prisma/seed-roles";
import { maskLeadPiiFields } from "@/lib/lead/pii";
import { buildBookingListWhere } from "@/app/(admin)/admin/lop-trial/_lib/filters";

const v2Perms = (code: string) =>
  new Set((ROLE_SEED.find((r) => r.code === code)?.perms ?? []).map((p) => p.action));

/** Đọc mã nguồn, BỎ chú thích — chú thích nhắc tới `phone` rất nhiều, soi cả
 *  chú thích thì test đỏ/xanh theo văn phong chứ không theo hành vi.
 *
 *  ⚠️ THỨ TỰ QUAN TRỌNG: bỏ chú thích DÒNG trước, chú thích KHỐI sau. Ngược lại
 *  thì một dòng `//` có chứa `/*` (rất hay gặp: `@/components/charts/*`) sẽ mở
 *  một khối giả, và mọi thứ cho tới dấu `*` `/` kế tiếp — có thể là hàng trăm dòng
 *  mã thật — biến mất im lặng. Bản đầu của chính test này dính đúng bẫy đó và
 *  báo "chưa che" cho một trang đã che. */
function nguon(duongDan: string): string {
  return fs
    .readFileSync(duongDan, "utf8")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) VAI NÀO THẤY GÌ — bảng sự thật, cả hai tầng RBAC
// ─────────────────────────────────────────────────────────────────────────────
// v1 chạy local/dev/CI, v2 chạy PROD. Sửa một tầng quên tầng kia = local xanh mà
// prod rò. `null` ở cột v1 = vai chỉ tồn tại ở RBAC v2 (gán tay), không có dòng
// tương ứng trong matrix tĩnh — đó là đúng, không phải sót.
const VAI = [
  { ten: "SUPER_ADMIN", v1: "SUPER_ADMIN", v2: "SUPER_ADMIN", thayySdt: true },
  { ten: "Quản lý cơ sở", v1: "CENTER_MANAGER", v2: "CENTER_MANAGER", thayySdt: false },
  { ten: "Sale cơ sở", v1: "SALES_CSM", v2: "CENTER_SALES_CSM", thayySdt: true },
  { ten: "Sale Hội sở", v1: null, v2: "HO_SALE", thayySdt: true },
  { ten: "Đào tạo", v1: "TRAINING", v2: "TRAINING", thayySdt: false },
  { ten: "Marketing", v1: "MARKETING", v2: "HO_MARKETING", thayySdt: true },
] as const;

describe("[S-1] ai được thấy SĐT lead — 6 vai, hai tầng RBAC", () => {
  it.each(VAI)("$ten: quyền leads:view-pii = $thayySdt ở CẢ v1 lẫn v2", (vai) => {
    if (vai.v1) {
      const coV1 = (PERMISSIONS["leads:view-pii"] as readonly string[]).includes(vai.v1);
      expect(coV1, `${vai.ten}: v1 matrix`).toBe(vai.thayySdt);
    }
    // SUPER_ADMIN bypass toàn cục ở can() v2 → seed không liệt kê từng action.
    const coV2 = vai.v2 === "SUPER_ADMIN" ? true : v2Perms(vai.v2).has("leads:view-pii");
    expect(coV2, `${vai.ten}: seed RoleDef v2`).toBe(vai.thayySdt);
  });

  it.each(VAI)("$ten: một phiếu đi qua tầng che ra đúng thứ vai đó được thấy", (vai) => {
    const phieu = {
      parentName: "Nguyễn Thị Lan",
      phone: "0905123456",
      email: "lan@gmail.com",
      childName: "Nguyễn Minh Khôi",
      note: "Hẹn gọi lại chiều thứ 5",
    };
    const ra = maskLeadPiiFields(phieu, vai.thayySdt);
    if (vai.thayySdt) {
      expect(ra.phone).toBe("0905123456");
      expect(ra.parentName).toBe("Nguyễn Thị Lan");
    } else {
      expect(ra.phone).not.toBe("0905123456");
      // Không đủ 4 số đầu: mặt nạ chuẩn giữ 3 đầu + 3 cuối. Ca này khoá đúng lỗi
      // đã có thật ở dashboard (mặt nạ tự chế giữ 4 số đầu ⇒ lộ cả đầu số + 1).
      expect(ra.phone).not.toContain("0905");
      expect(ra.parentName).not.toBe("Nguyễn Thị Lan");
      expect(ra.note).not.toContain("thứ 5");
    }
  });

  it("Đào tạo không có quyền xem lead nào — nên không được rơi vào bảng lead của dashboard", () => {
    for (const key of ["leads:view-all", "leads:view-own"] as const) {
      expect((PERMISSIONS[key] as readonly string[]).includes("TRAINING")).toBe(false);
      expect(v2Perms("TRAINING").has(key)).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2) (a) MÀN ADMIN IN SĐT — chốt chặn nguồn
// ─────────────────────────────────────────────────────────────────────────────
const MAN_ADMIN: { ten: string; file: string }[] = [
  {
    ten: "Dashboard — bảng Leads mới nhất",
    file: "app/(admin)/admin/dashboard/_components/manager-dashboard.tsx",
  },
  {
    ten: "Báo cáo chuyển lead liên cơ sở",
    file: "app/(admin)/admin/leads/bao-cao-chuyen/page.tsx",
  },
  {
    ten: "Chốt hàng loạt (bulk-convert)",
    file: "app/(admin)/admin/leads/bulk-convert/page.tsx",
  },
  {
    ten: "Lớp trải nghiệm — tầng truy vấn",
    file: "app/(admin)/admin/lop-trial/_lib/queries.ts",
  },
  {
    ten: "Chuyển đổi lead (convert v2)",
    file: "app/(admin)/admin/leads/[id]/convert/page.tsx",
  },
  {
    // `orders:create` = SUPER_ADMIN + QL cơ sở + **Kế toán** + Sale. Kế toán chưa
    // bao giờ có `leads:view-pii`, mà `/orders/new?leadId=…` in tên + SĐT phiếu.
    ten: "Tạo đơn hàng gắn lead",
    file: "app/(admin)/admin/orders/new/page.tsx",
  },
];

describe("[S-1] màn admin in SĐT lead phải đi qua tầng che duy nhất", () => {
  it.each(MAN_ADMIN)("$ten: dùng maskLeadPiiFields", ({ file }) => {
    expect(nguon(file)).toContain("maskLeadPiiFields");
  });

  it.each(MAN_ADMIN)("$ten: quyết định che bằng canViewLeadPii, không suy từ vai", ({ file }) => {
    const s = nguon(file);
    // Hoặc tự hỏi quyền, hoặc nhận `canViewPii` từ chỗ gọi — cả hai đều là một
    // nguồn. Cái bị cấm là tự so vai/centerId tại chỗ (lint no-inline-authz).
    expect(s).toMatch(/canViewLeadPii|canViewPii/);
  });

  it("dashboard: KHÔNG còn mặt nạ tự chế (mặt nạ riêng lộ 4 số đầu, nhiều hơn mặt nạ chuẩn)", () => {
    const s = nguon("app/(admin)/admin/dashboard/_components/manager-dashboard.tsx");
    expect(s).not.toContain("$1xxx$3");
    expect(s).not.toMatch(/phone\.replace\(/);
  });

  it("dashboard: bảng lead chỉ hiện cho người có quyền xem lead (Đào tạo rơi vào panel này)", () => {
    const s = nguon("app/(admin)/admin/dashboard/_components/manager-dashboard.tsx");
    expect(s).toMatch(/leads:view-all/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2b) KHÔNG BAO GIỜ ĐIỀN SẴN BẢN CHE VÀO Ô GHI
// ─────────────────────────────────────────────────────────────────────────────
// Che rồi vẫn hỏng được, theo hướng ngược lại: hai màn chốt đơn đẩy
// `defaultParentName`/`defaultParentPhone` vào `<ConvertForm>`, và
// `submitConvertV2` nhận thẳng giá trị đó từ trình duyệt. SĐT có lưới đỡ (schema
// `phoneVn` từ chối chuỗi đã đục); TÊN thì KHÔNG — bấm Lưu là đẻ ra một phụ huynh
// tên "Nguyễn T. L." trong hồ sơ thật. Nên khi thiếu quyền thì ô phải TRỐNG.
const MAN_CHOT = [
  {
    ten: "Chuyển đổi (admin)",
    file: "app/(admin)/admin/leads/[id]/convert/page.tsx",
    tienTo: "defaultParent",
  },
  {
    ten: "Ghi danh (site Sale)",
    file: "app/(sale)/sale/ghi-danh/[leadId]/page.tsx",
    tienTo: "defaultParent",
  },
  {
    ten: "Tạo đơn (site Sale)",
    file: "app/(sale)/sale/chot-don/[leadId]/page.tsx",
    tienTo: "defaultCustomer",
  },
  {
    ten: "Tạo đơn (admin)",
    file: "app/(admin)/admin/orders/new/page.tsx",
    tienTo: "defaultCustomer",
  },
];

describe("[S-1] màn chốt đơn: thiếu quyền ⇒ ô nhập TRỐNG, không phải bản che", () => {
  it.each(MAN_CHOT)("$ten: prefill rẽ nhánh theo canViewPii", ({ file, tienTo }) => {
    const s = nguon(file);
    const dong = s.split("\n").filter((l) => l.includes(tienTo));
    expect(dong.length).toBeGreaterThan(0);
    for (const l of dong) {
      // Mỗi dòng prefill hoặc tự rẽ nhánh theo quyền, hoặc lấy từ một biến đã rẽ
      // nhánh sẵn (`dienSan` / `khachDienSan`). Cái bị cấm là lấy thẳng từ đối
      // tượng ĐÃ CHE — chuỗi đục sẽ được ghi xuống hồ sơ thật.
      expect(l, l.trim()).toMatch(/canViewPii|DienSan|dienSan/);
      expect(l, l.trim()).not.toMatch(/piiLead|masked/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3) (c) Ô TÌM THEO SĐT — rò GIÁN TIẾP, phải gác bằng chính quyền xem SĐT
// ─────────────────────────────────────────────────────────────────────────────
describe("[S-1] buildBookingListWhere — ô tìm buổi hẹn học thử", () => {
  const layOr = (w: ReturnType<typeof buildBookingListWhere>) =>
    ((w.lead as { OR?: unknown[] } | undefined)?.OR ?? []) as Record<string, unknown>[];

  it("có quyền xem SĐT → tìm được theo SĐT", () => {
    const or = layOr(buildBookingListWhere("all", { q: "0905123456", canSearchPhone: true }));
    expect(or.some((c) => "phone" in c)).toBe(true);
  });

  it("KHÔNG có quyền xem SĐT → mệnh đề SĐT biến mất (không dò được số)", () => {
    const or = layOr(buildBookingListWhere("all", { q: "0905123456", canSearchPhone: false }));
    expect(or.some((c) => "phone" in c)).toBe(false);
    // Vẫn tìm được theo tên — che SĐT không được biến ô tìm thành vô dụng.
    expect(or.some((c) => "parentName" in c)).toBe(true);
  });

  it("mặc định (không truyền cờ) là ĐÓNG — quên truyền phải fail-closed", () => {
    const or = layOr(buildBookingListWhere("all", { q: "0905123456" }));
    expect(or.some((c) => "phone" in c)).toBe(false);
  });
});

describe("[S-1] site Sale — ô tìm 'Khách của tôi' gác bằng quyền xem SĐT", () => {
  it("getMyLeads nhận cờ và chỉ thêm mệnh đề phone khi cờ bật", () => {
    const s = nguon("lib/lead/sale-leads.ts");
    expect(s).toMatch(/canSearchPhone/);
  });

  it("trang Khách của tôi TRUYỀN cờ xuống — tính rồi bỏ quên là y như không gác", () => {
    const s = nguon("app/(sale)/sale/khach-cua-toi/page.tsx");
    expect(s).toMatch(/canSearchPhone/);
  });

  it("bảng việc site Sale che tên khách theo cùng một tầng", () => {
    const s = nguon("app/(sale)/sale/page.tsx");
    // Danh sách "việc đến hạn" in tên phụ huynh; trước S-1 chỉ khối 'cần chạm'
    // được che, khối việc thì không.
    expect(s).toMatch(/tenKhach: canViewPii \? [\w.]+ : maskPersonName\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4) Ô tìm ứng viên xếp lớp trải nghiệm (Server Action)
// ─────────────────────────────────────────────────────────────────────────────
describe("[S-1] /sale/trial — cột Phụ huynh là SĐT của PHIẾU, không phải của HV đã ghi danh", () => {
  it("gác bằng CẢ canViewParentContact lẫn canViewLeadPii", () => {
    const s = nguon("app/(sale)/sale/trial/page.tsx");
    // `canViewParentContact` một mình vẫn cho Quản lý cơ sở + Kế toán đi qua —
    // hai vai không có `leads:view-pii`. Phải là phép VÀ.
    expect(s).toMatch(/canViewParentContact\(session\.user\) && \(await canViewLeadPii\(\)\)/);
  });
});

describe("[S-1] searchLopTrialCandidatesAction — ô tìm ứng viên", () => {
  it("mệnh đề phone gác bằng quyền xem SĐT, không đứng trần", () => {
    const s = nguon("app/(admin)/admin/lop-trial/_actions.ts");
    expect(s).toMatch(/canViewLeadPii|canSearchPhone/);
    expect(s).not.toMatch(/^\s*\{ phone: \{ contains: qPhone \} \},\s*$/m);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4) SITE SALE — QUÉT, KHÔNG GHIM DANH SÁCH
// ─────────────────────────────────────────────────────────────────────────────
// Vì sao khối này ra đời (04/09/2026): khối (2) ở trên ghim một DANH SÁCH TỆP
// `app/(admin)/**` gõ tay. Từ 04/09 site Sale tách bản riêng và có đường đọc PII
// lead của CHÍNH NÓ (`lib/sale/*.ts`) — bài kiểm cũ mù hoàn toàn với chúng. Một
// danh sách gõ tay chỉ canh được những tệp người viết nhớ thêm vào; tệp thứ mười
// thì không ai nhớ.
//
// Nên khối này QUÉT: bất kỳ tệp nào của site Sale ĐỌC số điện thoại từ CSDL đều
// phải đi qua tầng che. Thêm màn mới mà quên che ⇒ đỏ ngay, không cần ai nhớ.
describe("[S-1] site Sale: mọi đường đọc SĐT lead đều đi qua tầng che", () => {
  /** Lý do miễn trừ phải viết ra — miễn trừ không lời giải thích là một lỗ ngủ. */
  const MIEN_TRU: Record<string, string> = {
    // 04/09/2026 — `phone: true` ở đây là `Center.phone`: SỐ ĐIỆN THOẠI CỦA CƠ SỞ
    // (211 Nguyễn Hữu Thọ / 114 Hoàng Diệu), thứ đang in công khai trên
    // satarobo.vn và trên mọi phiếu thu. Không phải SĐT phụ huynh, không phải SĐT
    // lead — không có gì để che, và `maskPhone` một số hotline công khai chỉ làm
    // người dùng tưởng mình thiếu quyền.
    //
    // Phép dò ở đây soi CHUỖI `phone: true` nên không phân biệt được nguồn; khối
    // dữ liệu duy nhất của màn này là hồ sơ CHÍNH NGƯỜI ĐANG ĐĂNG NHẬP (tên,
    // email, vai trò) + danh sách cơ sở cho super admin. Không có đường nào chạm
    // tới lead.
    //
    // ⚠️ ĐÂY LÀ MỘT CHỖ MÙ, không phải một chỗ được phép rò: thêm bất cứ truy vấn
    //    lead/học viên nào vào tệp đó thì bài kiểm này KHÔNG bắt được nữa. Nếu màn
    //    "Hồ sơ của tôi" lớn ra tới mức đọc dữ liệu khách, hãy tách phần ấy sang
    //    tệp riêng rồi XOÁ dòng miễn trừ này.
    "app/(sale)/sale/ho-so/page.tsx":
      "Center.phone (SĐT cơ sở, công khai) chứ không phải SĐT lead/phụ huynh; màn chỉ đọc hồ sơ của chính người đăng nhập",
  };

  function quetTep(thuMuc: string): string[] {
    const ra: string[] = [];
    if (!fs.existsSync(thuMuc)) return ra;
    for (const ten of fs.readdirSync(thuMuc)) {
      const d = path.join(thuMuc, ten);
      if (fs.statSync(d).isDirectory()) ra.push(...quetTep(d));
      else if (/\.tsx?$/.test(ten) && !ten.includes(".test.")) ra.push(d);
    }
    return ra;
  }

  const TEP_SALE = [...quetTep("lib/sale"), ...quetTep("app/(sale)")];

  it("có tệp để soi (0 tệp thì bài kiểm này đang tự lừa mình)", () => {
    expect(TEP_SALE.length).toBeGreaterThan(10);
  });

  it("🔴 tệp nào ĐỌC SĐT từ CSDL cũng phải nhắc tới tầng che", () => {
    // Dấu hiệu ĐỌC: `phone: true` / `parentPhone: true` trong khối `select`, hoặc
    // đọc `phone` ra khỏi bản ghi lead. KHÔNG tính chuỗi trong chú thích (đã bỏ).
    const doc = /\b(parentPhone|phone)\s*:\s*true\b/;
    // Dấu hiệu CHE: đi qua đúng một trong các cửa đã có, không tự chế mặt nạ.
    const che = /maskLeadPiiFields|maskPhone|canViewLeadPii|canViewPii/;

    const pham = TEP_SALE.filter((t) => {
      if (t.split(path.sep).join("/") in MIEN_TRU) return false;
      const s = nguon(t);
      return doc.test(s) && !che.test(s);
    }).map((t) => t.split(path.sep).join("/"));

    expect(
      pham,
      `Đọc SĐT lead mà không qua tầng che (dùng maskLeadPiiFields + canViewLeadPii):\n  - ${pham.join("\n  - ")}\n`,
    ).toEqual([]);
  });

  it("🔴 không tệp nào tự chế mặt nạ SĐT", () => {
    // Mặt nạ tự chế từng lộ 4 số đầu, nhiều hơn mặt nạ chuẩn — lỗi đã bắt được ở
    // dashboard admin. Một site có hai mặt nạ là có hai mức lộ.
    const pham = TEP_SALE.filter((t) => /phone[A-Za-z]*\.replace\(/.test(nguon(t))).map((t) =>
      t.split(path.sep).join("/"),
    );
    expect(pham, `Dùng maskPhone dùng chung, đừng tự chế:\n  - ${pham.join("\n  - ")}\n`).toEqual(
      [],
    );
  });
});
