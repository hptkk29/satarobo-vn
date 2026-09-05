// Test khoá thanh điều hướng site Sale — quét NGUỒN, không render.
//
// Vì sao cần: hai lớp lỗi mà `lib/auth/page-gates.ts` sinh ra để diệt đều bắt đầu
// từ việc menu và cổng trang mỗi bên tự khai một danh sách action. Site Sale là
// site thứ tư dựng nav; ba site trước đều đã dính ít nhất một lần.
//
// Test này rẻ và bắt đúng lớp lỗi đó ở dạng sớm nhất: nav gõ action bằng tay.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PAGE_GATES } from "@/lib/auth/page-gates";

const ROOT = process.cwd();
const NAV = path.join(ROOT, "components/sale/sale-nav.tsx");
const LAYOUT = path.join(ROOT, "app/(sale)/sale/layout.tsx");

const doc = (p: string) => fs.readFileSync(p, "utf8");
// Bỏ chú thích. Thứ tự DÒNG trước, KHỐI sau — và đây không phải chuyện gu.
//
// `app/(sale)/sale/layout.tsx` có một dòng `//` nhắc tới glob "app/(sale)/**",
// và dấu sao-kép trong đó trông y hệt chỗ MỞ một chú thích khối. Bỏ khối trước
// thì regex nuốt từ đó tới chỗ ĐÓNG khối gần nhất; ngày ai đó thêm một chú thích
// JSX xuống dưới là cả cụm `import` biến mất khỏi bản quét ⇒ test báo "layout
// không import sale.css" trong khi nó có. Đã xảy ra đúng một lần. Bỏ dòng trước
// là hết chuyện.
const boChuThich = (s: string) =>
  s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("[site Sale] thanh điều hướng ≡ cổng trang", () => {
  it("mọi mục có quyền đều lấy `perm` TỪ PAGE_GATES, không gõ action rời", () => {
    const src = boChuThich(doc(NAV));
    // Bắt dạng `perm: ["leads:create"]` — gõ tay. Dạng đúng là
    // `perm: PAGE_GATES["/sale/..."]`.
    const goTay = [...src.matchAll(/perm:\s*\[/g)];
    expect(
      goTay.length,
      'nav còn mục khai `perm: [...]` bằng tay — phải dùng PAGE_GATES["/sale/..."]',
    ).toBe(0);
    expect(src).toContain('PAGE_GATES["/sale/trial"]');
    expect(src).toContain('PAGE_GATES["/sale/nhap-khach-hang"]');
  });

  it("mọi href trong nav đều có trang thật", () => {
    const src = boChuThich(doc(NAV));
    const hrefs = [...src.matchAll(/href:\s*"(\/sale[^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length, "nav rỗng — chắc chắn là hỏng").toBeGreaterThan(0);
    for (const h of hrefs) {
      // "/sale" → app/(sale)/sale/page.tsx ; "/sale/trial" → .../trial/page.tsx
      const f = path.join(ROOT, "app/(sale)", h, "page.tsx");
      expect(fs.existsSync(f), `nav trỏ tới ${h} nhưng không có ${f}`).toBe(true);
    }
  });

  it("mọi route /sale/* trong PAGE_GATES đều có mặt trên nav (không có màn mồ côi)", () => {
    // Màn dựng xong mà không có lối vào thì với người dùng nó không tồn tại —
    // đúng tình trạng của /sale/trial suốt từ 22/08 tới 23/08.
    //
    // Ngoại lệ phải khai TƯỜNG MINH kèm lý do, không nới thành "bỏ qua route
    // động": một trang động vẫn có thể cần mục menu (vd danh sách rồi lọc).
    const VAO_TU_NOI_KHAC: Record<string, string> = {
      "/sale/chot-don":
        "luôn gắn với MỘT khách cụ thể → vào từ trang khách. Mục menu trần sẽ dẫn tới câu hỏi 'đơn cho ai?' mà không trả lời được.",
    };
    const src = boChuThich(doc(NAV));
    const thieu = Object.keys(PAGE_GATES)
      .filter((h) => h.startsWith("/sale/"))
      .filter((h) => !(h in VAO_TU_NOI_KHAC))
      .filter((h) => !src.includes(`href: "${h}"`));
    expect(thieu, `Route có gate nhưng không có lối vào trên nav:\n  - ${thieu.join("\n  - ")}\n`).toEqual([]);
    for (const [h, lyDo] of Object.entries(VAO_TU_NOI_KHAC)) {
      expect(lyDo.trim().length, `${h} thiếu lý do`).toBeGreaterThan(20);
    }
  });

  it("route vào-từ-nơi-khác vẫn phải có ai đó dẫn tới — không được mồ côi thật", () => {
    // Khai ngoại lệ mà rồi không trang nào link tới thì vẫn là màn chết, chỉ là
    // chết có giấy phép.
    const detail = fs.readFileSync(
      path.join(ROOT, "app/(sale)/sale/khach-cua-toi/_components/order-panel.tsx"),
      "utf8",
    );
    expect(detail).toContain("/sale/chot-don/");
    expect(detail).toContain("/sale/ghi-danh/");
  });

  it("có nút đăng xuất", () => {
    // Site GV và admin đều có; thiếu nó thì người dùng kẹt trong site, phải xoá
    // cookie bằng tay. `/dang-xuat` là trang công khai có chủ đích.
    expect(boChuThich(doc(NAV))).toContain('href="/dang-xuat"');
  });

  it("layout tính quyền bằng grantedMenuActions, KHÔNG tự gọi can()", () => {
    // Menu phải hỏi đúng hàm quyết định mà cổng trang dùng. Tự gọi can() ở
    // component là cách chắc chắn để menu và cổng nói hai câu chuyện khác nhau
    // khi cờ RBAC đổi — bài học 10/07 của site admin.
    const src = boChuThich(doc(LAYOUT));
    expect(src).toContain("grantedMenuActions");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S-10 (27/08/2026) — bản sắc site Sale: tím thương hiệu + điều hướng 8 NHÓM.
//
// Hai chốt của chủ dự án, và cả hai đều có một cái bẫy giống nhau: chúng dễ được
// "làm cho xong" bằng cách gõ giá trị vào chỗ nào đó rồi tin là đúng.
//
//   · Màu: `.sale-root` đã được gắn vào layout từ 23/08 nhưng KHÔNG file CSS nào
//     định nghĩa nó — một class chết. Site Sale suốt thời gian đó mượn cam
//     `:root` của trang public, tức trông y hệt… không giống ai. Test dưới đây
//     đòi đúng ba mảnh phải khớp nhau: file CSS tồn tại, layout import nó, và
//     token `--primary` mang đúng mã tím đã chốt.
//   · 8 nhóm: tên nhóm phải LẤY TỪ tài liệu yêu cầu (§5 của
//     `Document/0-yeucau/2-ba-phan-tich/09-ui-ux-site-sale-tuyensinh.md`), không
//     phải do người viết code tự đặt cho gọn. Nên test đọc thẳng tài liệu đó và
//     so từng chữ — tài liệu đổi thì nav đỏ, và ngược lại.
// ─────────────────────────────────────────────────────────────────────────────
const CSS = path.join(ROOT, "app/(sale)/sale/sale.css");
const YEU_CAU = path.join(
  ROOT,
  "Document/0-yeucau/2-ba-phan-tich/09-ui-ux-site-sale-tuyensinh.md",
);

/** 8 tên nhóm, đọc thẳng từ §5 của tài liệu yêu cầu FINAL 16/07. */
function nhomTheoTaiLieu(): string[] {
  return [...doc(YEU_CAU).matchAll(/^\*\*(\d)\.\s+(.+?)\*\*\s*$/gm)].map((m) => m[2].trim());
}

describe("[S-10] site Sale mang màu tím thương hiệu, không mượn màu nơi khác", () => {
  it("có file token riêng và layout import nó", () => {
    // Thiếu một trong hai thì `.sale-root` là class chết và site âm thầm dùng
    // token của `:root` — không hỏng gì, chỉ là sai nhận diện, nên không ai báo.
    expect(fs.existsSync(CSS), "thiếu app/(sale)/sale/sale.css").toBe(true);
    expect(boChuThich(doc(LAYOUT))).toContain('import "./sale.css"');
  });

  it("token đặt dưới `.sale-root`, KHÔNG đụng `:root` toàn cục", () => {
    // Đụng `:root` là đổi màu cả trang public, portal và khu quản trị.
    const css = doc(CSS);
    expect(css).toContain(".sale-root");
    expect(css).not.toMatch(/^\s*:root\s*\{/m);
  });

  it("`--primary` đúng mã tím đã chốt (#7C3AED)", () => {
    const css = doc(CSS).toLowerCase();
    expect(css).toMatch(/--primary:\s*#7c3aed/);
  });

  it("tím KHÔNG trùng tím của khu quản trị — hai nơi làm việc phải phân biệt được", () => {
    // Khu quản trị dùng #610B8A (tím rất sẫm). Site GV cố ý lấy cam. Nếu site
    // Sale lấy đúng mã của admin thì cả việc đổi màu này thành vô nghĩa.
    const admin = doc(path.join(ROOT, "app/globals.css")).toLowerCase();
    expect(admin).toContain("--primary: #610b8a");
    // So phần KHAI BÁO, không so chú thích: đầu `sale.css` có nhắc mã của admin
    // để giải thích vì sao ba site ba màu — nhắc tới không phải là dùng.
    const khaiBao = doc(CSS).replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase();
    expect(khaiBao).not.toContain("#610b8a");
  });
});

describe("[S-10] điều hướng gom thành 8 nhóm theo tài liệu yêu cầu", () => {
  it("tài liệu §5 vẫn khai đúng 8 nhóm (nếu đổi, nav phải đổi theo)", () => {
    expect(nhomTheoTaiLieu()).toHaveLength(8);
  });

  /**
   * ⚠️ NỚI CÓ CHỦ ĐÍCH 28/08/2026 — ghi rõ nới cái gì và giữ lại cái gì.
   *
   * Bản trước đòi nav khai ĐÚNG 8 nhóm của tài liệu, không hơn không kém
   * (`toEqual`). Chủ dự án 28/08 yêu cầu đưa 32 mục về site Sale và chốt:
   * *"thêm các mục tôi nói nhưng không cần cập nhật tài liệu"*. Tám nhóm gốc
   * không chứa nổi tám mục học viên/lớp và năm mục chấm công, nên nav có thêm
   * hai nhóm mà tài liệu không có.
   *
   * VẪN GIỮ, và đây mới là phần đáng giá của bài kiểm: **cả 8 nhóm của tài liệu
   * phải có mặt, đúng tên từng chữ, và đúng THỨ TỰ TƯƠNG ĐỐI với nhau.** Đổi tên
   * một nhóm trong tài liệu, hay đảo thứ tự chúng trong nav, vẫn đỏ.
   * NỚI: cho phép nhóm lạ chen vào giữa.
   *
   * Nếu sau này tài liệu được cập nhật cho khớp thì siết `toEqual` trở lại.
   */
  it("8 nhóm của tài liệu đều có mặt, đúng tên và đúng thứ tự tương đối", () => {
    const src = boChuThich(doc(NAV));
    const nhomTrongNav = [...src.matchAll(/nhom:\s*"([^"]+)"/g)].map((m) => m[1]);
    const cuaTaiLieu = nhomTheoTaiLieu();

    for (const n of cuaTaiLieu) {
      expect(nhomTrongNav, `nav thiếu nhóm "${n}" của tài liệu`).toContain(n);
    }
    // Lọc bỏ nhóm mới rồi so thứ tự — nhóm tài liệu không được đảo chỗ nhau.
    const chiNhomTaiLieu = nhomTrongNav.filter((n) => cuaTaiLieu.includes(n));
    expect(chiNhomTaiLieu).toEqual(cuaTaiLieu);
  });

  it("mọi mục đều thuộc về một nhóm — không mục nào lơ lửng", () => {
    const src = boChuThich(doc(NAV));
    const soMuc = [...src.matchAll(/href:\s*"/g)].length;
    const soNhom = [...src.matchAll(/nhom:\s*"/g)].length;
    const soMangMuc = [...src.matchAll(/muc:\s*\[/g)].length;
    expect(soMuc).toBeGreaterThan(0);
    // Mỗi nhóm phải có đúng một mảng `muc` — thiếu là có nhóm khai hụt, thừa là
    // có mảng mục nằm ngoài nhóm nào.
    expect(soMangMuc).toBe(soNhom);
    expect(soNhom).toBeGreaterThanOrEqual(nhomTheoTaiLieu().length);
  });

  it("nhóm rỗng KHÔNG được vẽ ra — nhãn nhóm không có mục nào là rác trên màn hình", () => {
    // 21/28 tab của tài liệu chưa dựng. Khai trước cho đúng bản đồ là được,
    // nhưng vẽ một nhãn "Ghi danh & Thu phí" rồi bên dưới trống không thì người
    // dùng tưởng mình thiếu quyền.
    const src = boChuThich(doc(NAV));
    expect(src).toMatch(/muc\.length\s*>\s*0/);
  });
});
