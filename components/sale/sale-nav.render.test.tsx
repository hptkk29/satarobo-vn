/**
 * SaleNav — kiểm bằng cách RENDER THẬT, bù cho `sale-nav.test.ts` (quét nguồn).
 *
 * Quét nguồn bắt được "khai sai" (gõ action bằng tay, tên nhóm lệch tài liệu),
 * nhưng mù với "khai đúng mà vẽ sai": nhóm rỗng vẫn hiện nhãn, mục người dùng
 * không có quyền vẫn lọt ra, hoặc mục đang đứng không sáng. Ba thứ đó chỉ thấy
 * được khi cho component chạy.
 *
 * S-10 (27/08/2026) — điều hướng gom thành 8 nhóm theo §5 tài liệu yêu cầu, mà
 * hôm nay repo mới có 5 trang vào được từ menu ⇒ 3 nhóm rỗng. Vẽ nhãn nhóm rồi
 * bên dưới trống không thì người dùng tưởng mình thiếu quyền — nên "nhóm rỗng
 * biến mất" là hành vi phải khoá, không phải chi tiết cài đặt.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let pathname = "/sale";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { SaleNav } from "@/components/sale/sale-nav";
import { PAGE_GATES } from "@/lib/auth/page-gates";

/** Quyền của một tư vấn viên đủ tiêu chuẩn: mọi action mà nav có thể hỏi. */
const QUYEN_DAY_DU = [
  ...PAGE_GATES["/sale/khach-cua-toi"],
  ...PAGE_GATES["/sale/nhap-khach-hang"],
  ...PAGE_GATES["/sale/trial"],
  ...PAGE_GATES["/sale/tra-cuu"],
];

/** Tám tên nhóm của tài liệu; ba nhóm giữa hôm nay chưa có mục nào. */
const NHOM_RONG = ["Ghi danh & Thu phí", "Chăm sóc & Tái tục (CSKH)", "Kinh doanh của tôi"];

describe("[S-10] SaleNav vẽ ra màn hình", () => {
  it("hiện nhãn của mọi nhóm CÓ mục", () => {
    render(<SaleNav granted={QUYEN_DAY_DU} userLabel="Tư vấn viên A" />);

    for (const nhom of ["Tổng quan", "Lead & Tư vấn", "Học thử / Trải nghiệm", "Danh mục & Tra cứu"]) {
      expect(screen.getByText(nhom)).toBeTruthy();
    }
    // "Cá nhân" là khối cuối (tên + đăng xuất) — luôn có, kể cả khi chưa có
    // trang hồ sơ, vì thiếu nó thì người dùng kẹt trong site.
    expect(screen.getByText("Cá nhân")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Đăng xuất/ })).toBeTruthy();
  });

  it("KHÔNG vẽ nhãn của nhóm rỗng", () => {
    render(<SaleNav granted={QUYEN_DAY_DU} userLabel="Tư vấn viên A" />);

    for (const nhom of NHOM_RONG) {
      expect(screen.queryByText(nhom), `nhóm rỗng "${nhom}" không được hiện`).toBeNull();
    }
  });

  it("thiếu quyền → mục ẩn, và nhóm chỉ có mục đó cũng biến mất theo", () => {
    // Ẩn mục mà giữ nhãn nhóm là để lại một tiêu đề trống — trông như lỗi tải dở.
    render(<SaleNav granted={[]} userLabel="Tư vấn viên A" />);

    expect(screen.queryByText("Khách của tôi")).toBeNull();
    expect(screen.queryByText("Lead & Tư vấn")).toBeNull();
    expect(screen.queryByText("Tra cứu")).toBeNull();
    expect(screen.queryByText("Danh mục & Tra cứu")).toBeNull();

    // "Bảng việc hôm nay" không gác quyền (layout đã gác ai vào được site).
    expect(screen.getByText("Bảng việc hôm nay")).toBeTruthy();
    expect(screen.getByText("Tổng quan")).toBeTruthy();
  });

  it("mục đang đứng được đánh dấu, và CHỈ mục đó", () => {
    pathname = "/sale/khach-cua-toi";
    render(<SaleNav granted={QUYEN_DAY_DU} userLabel="Tư vấn viên A" />);

    const dangDung = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current"));
    expect(dangDung).toHaveLength(1);
    expect(dangDung[0].textContent).toContain("Khách của tôi");
    pathname = "/sale";
  });

  it("trang chủ KHÔNG sáng theo mọi trang con", () => {
    // `/sale` là tiền tố của mọi đường khác; so bằng `startsWith` là làm trang
    // chủ sáng ở khắp nơi và thanh điều hướng hết chỉ được chỗ đang đứng.
    pathname = "/sale/trial";
    render(<SaleNav granted={QUYEN_DAY_DU} userLabel="Tư vấn viên A" />);

    const dangDung = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current"));
    expect(dangDung).toHaveLength(1);
    expect(dangDung[0].textContent).toContain("Lớp trải nghiệm");
    pathname = "/sale";
  });

  it("hiện tên người đang đăng nhập", () => {
    render(<SaleNav granted={QUYEN_DAY_DU} userLabel="Nguyễn Văn A" />);
    expect(screen.getByText("Nguyễn Văn A")).toBeTruthy();
  });
});
