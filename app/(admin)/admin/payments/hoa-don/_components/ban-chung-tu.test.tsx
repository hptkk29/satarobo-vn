/**
 * Ca [BCT-*] — "Bàn chứng từ" của màn Hoá đơn điện tử (docs/ke-toan-hoa-don/PLAN.md §10, cổng GĐ 4).
 *
 * Ca đáng giá nhất là [BCT-01]: SANG DÒNG KHÁC THÌ Ô SỐ VÀ Ô TỆP PHẢI RỖNG. Không có nó, tệp PDF của
 * khách A (mang MST, CCCD) nằm lại trong ô chọn tệp khi kế toán bấm sang khách B — bấm Lưu là gắn
 * hoá đơn của A vào lần thu của B, rồi GĐ 6 gửi email tờ đó cho B. Đây là bẫy "router.refresh không
 * reset form" (defaultValue/state chỉ đọc lúc mount); chặn bằng `key={dong.key}` trên thân ngăn.
 * Canh bằng HÀNH VI (gõ + chọn tệp + đổi dòng), không grep chuỗi `key=` (luật 11).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { DongHangCho } from "@/lib/finance/hoa-don/dong-hang-cho";

const h = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/payments/hoa-don",
  useRouter: () => ({ replace: h.replace, refresh: h.refresh, push: vi.fn() }),
}));
vi.mock("../_actions", () => ({
  kyTaiLenHoaDonAction: vi.fn(),
  xacMinhTepHoaDonAction: vi.fn(),
  luuHoaDonNhapAction: vi.fn(),
  khongXuatHoaDonAction: vi.fn(),
  goHoaDonAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BanChungTu } from "./ban-chung-tu";

const dong = (key: string, tenKhach: string, o: Partial<DongHangCho> = {}): DongHangCho => ({
  key,
  ngan: "cho",
  nhan: "Chờ xuất",
  tone: "warning",
  orderId: `don-${key}`,
  maDon: `ORD-${key}`,
  tenKhach,
  sdt: "090****456",
  coSo: { ma: "CS1", ten: "Cơ sở 1" },
  ngayThu: "2026-09-10",
  ngayThuLabel: "10/09/2026",
  soTien: 3_000_000,
  nguon: "CK",
  nguonLabel: "Chuyển khoản · FT1",
  nhanDot: "Đợt 1",
  thieu: 0,
  traTruoc: 0,
  ngoaiDot: 0,
  tienTha: 0,
  khoanIds: [`p-${key}`],
  khoan: [{ id: `p-${key}`, soTien: 3_000_000 }],
  coTtHoaDon: false,
  emailNhan: "ph***@gmail.com",
  kyHieuMau: "1C26TSR",
  hanhDong: {
    taiPhieu: true,
    taiLen: { bat: true },
    xacNhan: { bat: false, lyDo: "Chưa tải tệp PDF hoá đơn lên" },
    khongXuat: true,
    ganThem: false,
    canhBao: [],
  },
  hoaDonNhap: null,
  hoaDon: null,
  lyDoKhongXuat: null,
  ...o,
});

const A = dong("dot:a", "Nguyễn Văn An");
const B = dong("dot:b", "Trần Thị Bình");
const DEM = { cho: 2, lech: 0, nhap: 0, "da-xuat": 0, "khong-xuat": 0, "don-huy": 0 } as const;

function dung(dangChon: DongHangCho | null, ghiDe: Partial<Parameters<typeof BanChungTu>[0]> = {}) {
  return (
    <BanChungTu
      ngan="cho"
      dem={{ ...DEM }}
      dongTrongNgan={[A, B]}
      dangChon={dangChon}
      chonKhongThay={false}
      thieuCoSo={0}
      khoOk
      {...ghiDe}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom không có matchMedia — giả DESKTOP (≥ xl): ngăn đứng cạnh, không Sheet.
  window.matchMedia = ((q: string) => ({
    matches: true,
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

const oSo = () => screen.getByLabelText("Số hoá đơn") as HTMLInputElement;
const oPdf = () => screen.getByLabelText("Tệp PDF hoá đơn") as HTMLInputElement;

describe("[BCT-01] sang dòng khác ⇒ ô số + ô tệp RỖNG (không mang PDF của khách A sang khách B)", () => {
  it("gõ số + chọn tệp ở dòng A, đổi sang dòng B ⇒ số rỗng, không còn tệp", () => {
    const { rerender } = render(dung(A));
    fireEvent.change(oSo(), { target: { value: "127" } });
    const tep = new File(["%PDF-1.7"], "hoa-don-khach-A.pdf", { type: "application/pdf" });
    fireEvent.change(oPdf(), { target: { files: [tep] } });
    expect(oSo().value).toBe("127");
    expect(screen.getByText(/hoa-don-khach-A\.pdf/)).toBeTruthy();

    rerender(dung(B));

    expect(oSo().value).toBe("");
    expect(screen.queryByText(/hoa-don-khach-A\.pdf/)).toBeNull();
    expect(screen.getByText("Chọn hoặc kéo tệp PDF vào đây")).toBeTruthy();
  });

  it("đối chứng dương: CÙNG dòng được vẽ lại (refresh) thì ô vẫn giữ — reset là do đổi dòng, không phải do vẽ lại", () => {
    const { rerender } = render(dung(A));
    fireEvent.change(oSo(), { target: { value: "127" } });
    rerender(dung({ ...A }));
    expect(oSo().value).toBe("127");
  });
});

describe("[BCT-02] chọn dòng ⇒ khoá lần thu lên URL, giữ ngăn", () => {
  it("bấm tên khách ở bảng ⇒ router.replace(?ngan=cho&chon=<khoá>)", () => {
    render(dung(null));
    const nut = screen.getAllByRole("button", { name: /Trần Thị Bình/ });
    fireEvent.click(nut[nut.length - 1]!);
    expect(h.replace).toHaveBeenCalledWith("/payments/hoa-don?ngan=cho&chon=dot%3Ab", { scroll: false });
  });

  it("desktop chưa chọn gì ⇒ ngăn hiện sẵn dòng ĐẦU, không đổi URL", () => {
    render(dung(null));
    expect(screen.getByRole("complementary", { name: "Chứng từ của lần thu" }).textContent).toContain("Nguyễn Văn An");
    expect(h.replace).not.toHaveBeenCalled();
  });
});

describe("[BCT-03] ngăn xử lý nói thật", () => {
  it("tải phiếu thu trỏ đúng đơn + khoá lần thu (mã hoá URL)", () => {
    render(dung(A));
    const link = screen.getByRole("link", { name: /Tải phiếu thu/ }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/payments/hoa-don/phieu-cho?don=don-dot%3Aa&chon=dot%3Aa");
  });

  it("không phải kế toán của cơ sở ⇒ không có link tải, không có nút lưu; nói lý do", () => {
    const lyDo = "Cần quyền payments:confirm tại cơ sở của đơn — hỏi Quản trị hệ thống";
    const khongQuyen = dong("dot:c", "Lê C", {
      hanhDong: {
        taiPhieu: false,
        taiLen: { bat: false, lyDo },
        xacNhan: { bat: false, lyDo },
        khongXuat: false,
        ganThem: false,
        canhBao: [],
      },
    });
    render(dung(khongQuyen, { dongTrongNgan: [khongQuyen] }));
    expect(screen.queryByRole("link", { name: /Tải phiếu thu/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lưu hoá đơn" })).toBeNull();
    expect(screen.getAllByText(lyDo).length).toBeGreaterThan(0);
  });

  it("nút Lưu tắt khi chưa chọn tệp PDF", () => {
    render(dung(A));
    expect((screen.getByRole("button", { name: "Lưu hoá đơn" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("ngăn rỗng ⇒ nói vì sao rỗng + đường về Chờ xuất", () => {
    render(dung(null, { ngan: "lech", dongTrongNgan: [] }));
    expect(screen.getByText("Không có lần thu nào lệch số tiền hay nghi trùng.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Về ngăn Chờ xuất" })).toBeTruthy();
  });
});
