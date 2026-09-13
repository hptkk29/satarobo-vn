/**
 * Thẻ số liệu site GV — nhãn DÀI không được cắt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO CÓ CA NÀY
 *
 * Mục 1 (13/09/2026) sửa hai thẻ có nhãn NÓI SAI thứ chúng đếm, rồi thay bằng nhãn nói
 * đúng — nhưng nhãn đúng thì DÀI: "Công tháng này / công chuẩn", "Ngày đã đi làm / ngày
 * có ca". `StatCard` cắt nhãn bằng `truncate`, và ở 375px mỗi thẻ chỉ còn ~88px cho chữ.
 *
 * ⇒ Nhãn hoá thành "Công tháng nà…": vẫn đúng lỗi mà mục 1 sinh ra để sửa, chỉ khác là do
 * CSS chứ không do phép đếm. Người dùng không thấy `…` là một lỗi — họ thấy một nhãn cụt.
 *
 * Ca này canh HÀNH VI của tham số (`xuongDong` có thật sự bỏ `truncate` không), không canh
 * văn bản mã nguồn — luật 11.
 *
 * ⚠️ GIỚI HẠN TỰ KHAI: ca này KHÔNG chứng minh trang `bang-cong` có truyền `xuongDong`.
 * Nó chỉ chứng minh tham số hoạt động. Vế "trang truyền đúng" hiện chỉ có `tsc` + mắt
 * người — muốn canh thật thì phải dựng trình duyệt ở 375px, chưa làm.
 */
import { render, screen } from "@testing-library/react";
import { Clock } from "lucide-react";
import { describe, expect, it } from "vitest";
import { StatCard } from "./stat-card";

const NHAN_DAI = "Công tháng này / công chuẩn";

describe("StatCard", () => {
  it("mặc định: nhãn vẫn CẮT — thẻ nhãn một từ không đổi chiều cao", () => {
    render(<StatCard icon={Clock} value="18 / 24" label={NHAN_DAI} />);
    expect(screen.getByText(NHAN_DAI).className).toContain("truncate");
  });

  it("xuongDong: nhãn KHÔNG còn bị cắt", () => {
    render(<StatCard icon={Clock} value="18 / 24" label={NHAN_DAI} xuongDong />);
    const el = screen.getByText(NHAN_DAI);
    expect(el.className).not.toContain("truncate");
    expect(el.className).toContain("leading-snug");
  });

  it("xuongDong: ghi chú phụ cũng không bị cắt — nó mang VẾ THỨ HAI của thẻ", () => {
    // Thẻ "Đi muộn" để "Về sớm: 1 lần · 10′" ở `hint`. Cắt dòng đó là mất hẳn một con số,
    // không phải mất một chữ.
    render(
      <StatCard icon={Clock} value="2 lần · 93′" label="Đi muộn" hint="Về sớm: 1 lần · 10′" xuongDong />,
    );
    expect(screen.getByText("Về sớm: 1 lần · 10′").className).not.toContain("truncate");
  });

  it("xuongDong: icon canh lên ĐẦU, không lơ lửng giữa thẻ cao", () => {
    const { container } = render(
      <StatCard icon={Clock} value="1" label={NHAN_DAI} xuongDong />,
    );
    expect(container.firstElementChild?.className).toContain("items-start");
  });
});
