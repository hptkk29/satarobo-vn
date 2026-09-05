"use client";

/**
 * Site Sale — màn "Chốt hàng loạt — lead đã đăng ký" (toàn bộ phần tương tác).
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/leads/bulk-convert/_components/bulk-convert-client.tsx` ──
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * ⚠️ CHỈ NHÂN BẢN LỚP VỎ. Việc chốt vẫn gọi ĐÚNG Server Action
 *    `bulkConvertLeadsAction` của khu quản trị — nơi có bốn cổng quyền, cách ly
 *    cơ sở, khoá chống trùng (`bulkConvertIdempotencyKey`) và toàn bộ luật tiền.
 *    Nhân bản LOGIC chốt là cách chắc chắn nhất để hai khu tạo học viên theo hai
 *    luật khác nhau.
 *
 * GIỮ NGUYÊN 100%: bảy cột đúng thứ tự đúng nhãn (tick · Phụ huynh · Học viên ·
 * Lớp · Ảnh: đồng ý · Đã đóng (đ) · ngày · Kết quả), ba ô lọc, sáu nút hàng
 * loạt, mọi câu chữ trong `HelpHint`, lô 20 lead/lượt, và cả câu cuối trang về
 * `satarobo.vn/kich-hoat`.
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. **MỘT DÒNG BẢNG = MỘT PHỤ HUYNH.** Bản admin dựng một `<tr>` cho MỖI CON và
 *    dùng `rowSpan` cho bốn ô cấp phiếu. Đó không chỉ là chuyện thẩm mỹ:
 *    `<PhanTrangBang>` cắt trang theo TỪNG `<tr>` (xem `phan-trang-bang.tsx` —
 *    nó `Children.toArray` rồi `slice`), nên một phiếu ba con nằm vắt qua ranh
 *    giới trang sẽ mất luôn ô tick, ô phụ huynh, ô tiền và ô kết quả ở trang
 *    sau — bảng lệch cột mà không có lỗi nào nổ ra. **Lỗi này đang có ở bản
 *    admin.** Gộp về một dòng/phiếu là hết cả hai vấn đề, và ba cột theo-con
 *    (Học viên · Lớp · Ảnh) xếp chồng bên trong ô với CÙNG một chiều cao tối
 *    thiểu nên vẫn thẳng hàng theo từng bé.
 * 2. Bảng gõ class từng ô → `.bang-sale` của `sale.css`. Mật độ nằm ở CSS thì
 *    bảng MỚI tự đúng; nằm trong từng ô thì phải nhớ chép.
 * 3. Hai nút `bg-gray-800` / `bg-neutral-800` gõ tay → nút viền theo token. Màu
 *    xám đặc không thuộc bảng màu nào của site này.
 * 4. Dải hành động dính đáy dời RA NGOÀI `KhungDuLieu`: khung có
 *    `overflow-hidden`, mà `overflow` khác `visible` biến tổ tiên thành vùng
 *    cuộn ⇒ `position: sticky` bên trong nó đứng im. Bản admin không gặp vì
 *    không có khung.
 *
 * ⚠️ MÀU — bản admin tô NGUYÊN DÒNG xanh khi chốt xong và đỏ khi lỗi. Ở đây
 *    không: sau một lượt chốt 20 phiếu thì gần như cả bảng xanh, và một bảng
 *    xanh khắp nơi không chỉ ra được dòng nào cần động tay (đúng bài học đã trả
 *    giá hai lần ở `khach-cua-toi/_components/lead-table.tsx`). Kết quả nằm ở
 *    ĐÚNG cột "Kết quả" bằng `<StatusPill>`; riêng dòng LỖI thêm một vạch đứng
 *    bên trái vì đó là dòng duy nhất còn đòi người dùng làm gì. Dòng đã chốt
 *    mặc định bị ẩn bởi ô "Ẩn lead đã chốt xong" nên cũng không cần màu để tìm.
 *    (Tô nền dòng bằng class Tailwind còn KHÔNG chạy được: `.sale-root
 *    .bang-sale tbody tr:hover` mạnh hơn, vệt di chuột sẽ nuốt màu.)
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoneyInput } from "@/components/ui/money-input";
import { HelpHint } from "@/components/admin/ui/help-hint";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { GiaiThichTrang } from "@/components/sale/ui/giai-thich-trang";
import { cn } from "@/lib/utils";
import { bulkConvertLeadsAction } from "@/app/(admin)/admin/leads/bulk-convert/_actions";
import type {
  ConTrongPhieu,
  MucCoSo,
  MucLop,
  PhieuChotHangLoat,
} from "@/lib/sale/chot-hang-loat";

/**
 * ⚠️ NỢ ĐÃ BIẾT — HAI MÀN LEAD CHƯA CÓ TRÊN HOST SALE.
 *
 * `/leads/{id}` và `/leads/{id}/convert` là clean URL của host quản trị. Trên
 * `sale.satarobo.vn`, luật cuối của nhánh Sale là `rewrite "/sale" + pathname`
 * (`lib/auth/route-policy.ts`) ⇒ chúng thành `/sale/leads/{id}` và
 * `/sale/leads/{id}/convert`, mà `app/(sale)/sale/leads/` mới chỉ có `page.tsx`
 * — **404**. Trỏ sang host admin cũng không cứu: Sale THUẦN bước vào host admin
 * là bị đá ngược.
 *
 * Giữ nguyên đường cũ là CỐ Ý: đổi sang địa chỉ khác chỉ là dời chỗ vỡ, còn ngày
 * ai đó dựng `app/(sale)/sale/leads/[id]/` thì hai liên kết này TỰ chạy đúng qua
 * rewrite. Đã báo lại cho chủ dự án; dựng thêm màn nằm ngoài phạm vi đợt tách.
 */
const duongChiTietLead = (id: string) => `/leads/${id}`;
const duongChotRieng = (id: string) => `/leads/${id}/convert`;

/** Màn "Tài khoản phụ huynh" thì site Sale ĐÃ CÓ — trỏ bản Sale, không đường trần. */
const DUONG_TAI_KHOAN_PH = "/sale/tai-khoan-ph";

type KetQuaDong = { ok: boolean; message?: string; warning?: string };

/** Giá trị ảo cho "tất cả" — chuỗi rỗng là giá trị "chưa chọn" của `<Select>`. */
const MOI_CO_SO = "__moi_co_so__";
const CHUA_CHON_LOP = "__chua_chon_lop__";

/** Một bộ lớp vỏ cho mọi điều khiển của thanh lọc. */
const LOP_DIEU_KHIEN = "h-9 rounded-lg bg-card text-sm";

/** Ô nhập trong bảng — thấp hơn thanh lọc một nhịp vì nó nằm trong dòng dữ liệu. */
const LOP_O_NHAP = cn(
  "h-8 w-full rounded-lg border border-border bg-card px-2 text-sm",
  "focus-visible:border-[color:var(--primary)] focus-visible:outline-none",
  "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/25",
  "disabled:opacity-50",
);

/**
 * Chiều cao tối thiểu của MỘT bé trong ba cột theo-con. Ba cột dùng CHUNG hằng
 * này — lệch một cột là ba cột hết thẳng hàng theo bé, và bảng nói dối về việc
 * lớp nào thuộc bé nào.
 */
const CAO_O_CON = "min-h-[3.5rem]";

const LOP_NUT_PHU = cn(
  "h-8 shrink-0 rounded-lg border border-border bg-card px-2.5 text-xs font-medium",
  "text-foreground transition-colors hover:bg-[color:var(--surface-chim)]",
  "disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2",
  "focus-visible:ring-[color:var(--primary)]/35",
);

const dinhDangVnd = (n: number) => new Intl.NumberFormat("vi-VN").format(n) + "đ";

export function BangChotHangLoat({
  phieu,
  lop,
  coSo,
}: {
  phieu: PhieuChotHangLoat[];
  lop: MucLop[];
  coSo: MucCoSo[];
}) {
  const tenCoSo = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of coSo) m.set(c.id, c.code || c.name);
    return m;
  }, [coSo]);
  const lopTheoMa = useMemo(() => new Map(lop.map((c) => [c.id, c])), [lop]);

  // Trạng thái theo phiếu + theo con.
  const [daTick, setDaTick] = useState<Set<string>>(() => new Set());
  const [lopCuaCon, setLopCuaCon] = useState<Record<string, string>>({});
  const [dongYAnh, setDongYAnh] = useState<Record<string, boolean>>({});
  const [tienDaDong, setTienDaDong] = useState<Record<string, string>>({});
  const [ngayDong, setNgayDong] = useState<Record<string, string>>({});
  const [ketQua, setKetQua] = useState<Record<string, KetQuaDong>>({});
  const [dangChay, setDangChay] = useState(false);
  const [tienDo, setTienDo] = useState<{ xong: number; tong: number } | null>(null);

  // Bộ lọc hiển thị.
  const [locCoSo, setLocCoSo] = useState(MOI_CO_SO);
  const [tim, setTim] = useState("");
  const [anDaXong, setAnDaXong] = useState(true);

  // Gán lớp hàng loạt.
  const [lopGanNhanh, setLopGanNhanh] = useState(CHUA_CHON_LOP);

  // Ngày "hôm nay" theo GIỜ VIỆT NAM (dịch UTC+7 rồi mới cắt chuỗi): `toISOString`
  // trần là ngày UTC — khung 00:00–06:59 giờ VN nó lùi 1 ngày, mặc định ngày đóng
  // sai và `max` chặn không cho chọn đúng hôm nay (review 02/08).
  const homNay = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

  const phieuHien = useMemo(() => {
    const q = tim.trim().toLowerCase();
    return phieu.filter((l) => {
      if (ketQua[l.id]?.ok && anDaXong) return false;
      if (locCoSo !== MOI_CO_SO && l.maCoSo !== locCoSo) return false;
      if (!q) return true;
      return (
        l.tenPhuHuynh.toLowerCase().includes(q) ||
        l.sdt.includes(q) ||
        l.con.some((c) => c.hoTen.toLowerCase().includes(q))
      );
    });
  }, [phieu, locCoSo, tim, ketQua, anDaXong]);

  const lopChoCon = (p: PhieuChotHangLoat, con: ConTrongPhieu) =>
    lop.filter(
      (c) =>
        c.centerId === p.maCoSo &&
        (!con.maKhoaQuanTam || c.courseId === con.maKhoaQuanTam),
    );

  const tongNiemYet = (p: PhieuChotHangLoat) =>
    p.con.reduce((s, c) => {
      const cls = lopCuaCon[c.id] ? lopTheoMa.get(lopCuaCon[c.id]!) : null;
      return s + (cls?.listPrice ?? 0);
    }, 0);

  const batTatPhieu = (id: string, bat: boolean) =>
    setDaTick((truoc) => {
      const sau = new Set(truoc);
      if (bat) sau.add(id);
      else sau.delete(id);
      return sau;
    });

  const tickTatCaDangHien = (bat: boolean) =>
    setDaTick(() => {
      if (!bat) return new Set();
      return new Set(
        phieuHien.filter((l) => l.con.length > 0 && !ketQua[l.id]?.ok).map((l) => l.id),
      );
    });

  const apDungLopHangLoat = () => {
    const cls = lopGanNhanh !== CHUA_CHON_LOP ? lopTheoMa.get(lopGanNhanh) : null;
    if (!cls) return;
    // Tính map mới NGOÀI `setState` (updater chạy lúc render → toast báo sai số /
    // StrictMode đếm đôi — review 02/08).
    const sau = { ...lopCuaCon };
    let daGan = 0;
    for (const p of phieuHien) {
      if (p.maCoSo !== cls.centerId) continue;
      for (const c of p.con) {
        if (sau[c.id]) continue; // không ghi đè lựa chọn đã có
        if (c.maKhoaQuanTam && c.maKhoaQuanTam !== cls.courseId) continue;
        sau[c.id] = cls.id;
        daGan++;
      }
    }
    setLopCuaCon(sau);
    toast.success(`Đã gán lớp cho ${daGan} học viên (chưa gán, cùng khoá & cơ sở)`);
  };

  const dongYAnhTatCa = (bat: boolean) =>
    setDongYAnh((truoc) => {
      const sau = { ...truoc };
      for (const p of phieuHien) for (const c of p.con) sau[c.id] = bat;
      return sau;
    });

  /**
   * Điền ô "đã đóng" theo SỐ TIỀN TRONG FILE EXCEL đã import (04/08), thay vì
   * lấy giá niêm yết. Số đó do importer ghi vào ghi chú của con dưới nhãn
   * `ĐãĐóng=` và đã được cộng sẵn ở máy chủ (`lib/sale/chot-hang-loat.ts`).
   * Luật chủ dự án chốt: dòng KHÔNG có ghi chú 50% thì số trong file CHÍNH LÀ đã
   * đóng đủ ⇒ công nợ 0. Phiếu nào file không ghi số thì bỏ qua, không đoán.
   */
  const dienTheoFile = () => {
    setTienDaDong((truoc) => {
      const sau = { ...truoc };
      for (const p of phieuHien) {
        if (!daTick.has(p.id) || p.daCoKhoanThu) continue;
        if (p.daDongTheoFile > 0) sau[p.id] = String(p.daDongTheoFile);
      }
      return sau;
    });
  };

  const dienTheoNiemYet = () => {
    setTienDaDong((truoc) => {
      const sau = { ...truoc };
      for (const p of phieuHien) {
        if (!daTick.has(p.id) || p.daCoKhoanThu) continue;
        const tong = tongNiemYet(p);
        if (tong > 0) sau[p.id] = String(tong);
      }
      return sau;
    });
  };

  const phieuDuDieuKien = useMemo(
    () =>
      phieuHien.filter(
        (l) =>
          daTick.has(l.id) &&
          !ketQua[l.id]?.ok &&
          l.con.length > 0 &&
          l.con.every((c) => Boolean(lopCuaCon[c.id])),
      ),
    [phieuHien, daTick, ketQua, lopCuaCon],
  );

  const chot = async () => {
    if (phieuDuDieuKien.length === 0) {
      toast.error(
        "Chưa có lead nào đủ điều kiện (cần chọn lớp cho mọi học viên của lead đã tick)",
      );
      return;
    }
    setDangChay(true);
    setTienDo({ xong: 0, tong: phieuDuDieuKien.length });
    // Đếm bằng biến cục bộ + dựng map kết quả NGOÀI `setState` updater (updater
    // chạy lúc render nên đếm trong đó ra số sai / StrictMode đếm đôi).
    let soOk = 0;
    let soLoi = 0;
    let dutGiuaChung = false;
    try {
      const LO = 20;
      for (let i = 0; i < phieuDuDieuKien.length; i += LO) {
        const lo = phieuDuDieuKien.slice(i, i + LO);
        const payload = {
          items: lo.map((p) => ({
            leadId: p.id,
            students: p.con.map((c) => ({
              leadChildId: c.id,
              name: c.hoTen,
              dob: c.ngaySinh || "",
              classId: lopCuaCon[c.id]!,
              consentMedia: dongYAnh[c.id] === true,
              discount: c.giamGia,
            })),
            discountReason: p.lyDoGiam,
            dueDate2: p.hanDot2,
            paid:
              !p.daCoKhoanThu && Number(tienDaDong[p.id] ?? "") > 0
                ? {
                    amount: Math.round(Number(tienDaDong[p.id])),
                    paidDate: ngayDong[p.id] || homNay,
                    note: "",
                  }
                : null,
          })),
        };
        const ketQuaLo: Record<string, KetQuaDong> = {};
        try {
          const res = await bulkConvertLeadsAction(payload);
          if (!res.ok) {
            for (const p of lo) {
              ketQuaLo[p.id] = { ok: false, message: res.error };
              soLoi++;
            }
          } else {
            for (const r of res.results) {
              ketQuaLo[r.leadId] = { ok: r.ok, message: r.message, warning: r.warning };
              if (r.ok) soOk++;
              else soLoi++;
            }
          }
        } catch {
          // Mất kết nối / action ném — đánh dấu lô này lỗi rồi DỪNG (không âm thầm
          // bỏ dở giữa chừng; các lô trước đã chốt vẫn giữ nguyên kết quả).
          for (const p of lo) {
            ketQuaLo[p.id] = {
              ok: false,
              message:
                "Mất kết nối hoặc lỗi hệ thống — bấm chốt lại (an toàn, không tạo trùng)",
            };
            soLoi++;
          }
          dutGiuaChung = true;
        }
        setKetQua((truoc) => ({ ...truoc, ...ketQuaLo }));
        setTienDo({
          xong: Math.min(i + LO, phieuDuDieuKien.length),
          tong: phieuDuDieuKien.length,
        });
        if (dutGiuaChung) break;
      }
      if (dutGiuaChung)
        toast.error(
          `Bị gián đoạn: ${soOk} đã chốt · ${soLoi} chưa xong — kiểm tra mạng rồi bấm chốt lại`,
        );
      else if (soLoi === 0) toast.success(`Đã chốt ${soOk} lead`);
      else toast.warning(`Xong: ${soOk} thành công · ${soLoi} lỗi — xem cột kết quả`);
    } finally {
      setDangChay(false);
    }
  };

  const soDaChot = Object.values(ketQua).filter((r) => r.ok).length;

  const nhanLopGanNhanh = (id: string) => {
    const c = lopTheoMa.get(id);
    if (!c) return "— Chọn lớp —";
    return `[${(c.centerId && tenCoSo.get(c.centerId)) || "?"}] ${c.label} · ${c.courseName}`;
  };

  return (
    <div className="space-y-4">
      <KhungDuLieu>
        <KhungDuLieu.Dau
          ten="Chốt hàng loạt — lead đã đăng ký"
          mo={
            phieu.length > 0
              ? `${phieu.length} lead “Đã đăng ký” chưa chốt`
              : "Chưa có lead nào chờ chốt"
          }
          hanhDong={
            // Bản admin để "← Quay lại danh sách lead" trôi phía trên tiêu đề.
            // Ở đây nó là hành động của khung, đứng cùng dòng với tên màn.
            <Link
              href="/sale/leads"
              className={cn(
                "inline-flex h-9 items-center rounded-lg border border-border px-3",
                "text-sm font-medium text-foreground transition-colors",
                "hover:bg-[color:var(--surface-chim)] focus-visible:outline-none",
                "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/35",
              )}
            >
              Quay lại danh sách lead
            </Link>
          }
        />

        <GiaiThichTrang>
          <p>
            Mỗi lead được chốt sẽ tạo: học viên + tài khoản phụ huynh (đăng nhập
            bằng SĐT, chờ kích hoạt tại{" "}
            <span className="font-mono">/kich-hoat</span>) + ghi danh vào lớp đã
            chọn. Nhập &quot;Đã đóng&quot; nếu khách đã nộp học phí từ trước — hệ
            thống ghi nhận khoản (lùi ngày) để công nợ phản ánh đúng; bỏ trống nếu
            chưa thu được thông tin tiền.
          </p>
        </GiaiThichTrang>

        <KhungDuLieu.Loc>
          <div className="space-y-3">
            {/* ── Hàng 1: thu hẹp thứ đang nhìn ─────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[15rem] flex-1">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  value={tim}
                  onChange={(e) => setTim(e.target.value)}
                  aria-label="Tìm (tên PH / SĐT / tên HV)"
                  placeholder="Tìm tên PH / SĐT / tên HV…"
                  className={cn(
                    LOP_DIEU_KHIEN,
                    "w-full border border-border pl-9 pr-3",
                    "placeholder:text-muted-foreground",
                    "focus-visible:border-[color:var(--primary)] focus-visible:outline-none",
                    "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/25",
                  )}
                />
              </div>

              <Select
                value={locCoSo}
                onValueChange={(v) => {
                  if (v !== null) setLocCoSo(String(v));
                }}
              >
                <SelectTrigger
                  aria-label="Cơ sở"
                  className={cn(LOP_DIEU_KHIEN, "w-auto min-w-[9rem]")}
                  disabled={dangChay}
                >
                  <SelectValue>
                    {(v: string | null) =>
                      v && v !== MOI_CO_SO
                        ? (tenCoSo.get(String(v)) ?? "Tất cả cơ sở")
                        : "Tất cả cơ sở"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value={MOI_CO_SO}>Tất cả cơ sở</SelectItem>
                  {coSo.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code || c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <label className="ml-auto inline-flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={anDaXong}
                  onChange={(e) => setAnDaXong(e.target.checked)}
                  className="size-4 rounded border-border accent-[color:var(--primary)]"
                />
                Ẩn lead đã chốt xong
              </label>
            </div>

            {/* ── Hàng 2: việc làm hàng loạt trên thứ đang hiển thị ───────── */}
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <div className="flex min-w-[18rem] flex-1 items-center gap-2">
                <Select
                  value={lopGanNhanh}
                  onValueChange={(v) => {
                    if (v !== null) setLopGanNhanh(String(v));
                  }}
                >
                  <SelectTrigger
                    aria-label="Gán lớp nhanh (HV chưa gán, cùng khoá & cơ sở)"
                    className={cn(LOP_DIEU_KHIEN, "min-w-0 flex-1")}
                    disabled={dangChay}
                  >
                    <SelectValue>
                      {(v: string | null) =>
                        v && v !== CHUA_CHON_LOP
                          ? nhanLopGanNhanh(String(v))
                          : "— Chọn lớp —"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  {/* 300 lớp là trần truy vấn — danh sách PHẢI tự cuộn. `min-w`
                      rộng hơn nút vì bề rộng popup mặc định bám bề rộng nút, mà
                      "[CS1] MÃ · Tên lớp · Khoá" dài hơn nút rất nhiều. */}
                  <SelectContent className="max-h-80 min-w-[26rem]">
                    <SelectItem value={CHUA_CHON_LOP}>— Chọn lớp —</SelectItem>
                    {lop.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        [{(c.centerId && tenCoSo.get(c.centerId)) || "?"}] {c.label} ·{" "}
                        {c.courseName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={apDungLopHangLoat}
                  disabled={lopGanNhanh === CHUA_CHON_LOP || dangChay}
                  className={cn(LOP_NUT_PHU, "h-9")}
                >
                  Gán lớp nhanh
                </button>
                <HelpHint>
                  Gán lớp đang chọn cho mọi học viên ĐANG HIỂN THỊ mà chưa có lớp,
                  đúng cơ sở và đúng khoá bé quan tâm. Lớp đã chọn tay trước đó
                  không bị ghi đè.
                </HelpHint>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => tickTatCaDangHien(true)}
                  disabled={dangChay}
                  className={LOP_NUT_PHU}
                >
                  Tick tất cả đang hiển thị
                </button>
                <button
                  type="button"
                  onClick={() => tickTatCaDangHien(false)}
                  disabled={dangChay}
                  className={LOP_NUT_PHU}
                >
                  Bỏ tick
                </button>
                <button
                  type="button"
                  onClick={() => dongYAnhTatCa(true)}
                  disabled={dangChay}
                  className={LOP_NUT_PHU}
                >
                  Đồng ý ảnh: tick tất cả
                </button>

                {/* Hai nút điền hàng loạt: hệ quả (ghi đè / bỏ qua lead nào)
                    không nhìn ra được từ chữ trên nút ⇒ để trong "?" ngay cạnh,
                    khỏi phải bấm thử mới biết. */}
                <span className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={dienTheoFile}
                    disabled={dangChay}
                    className={LOP_NUT_PHU}
                  >
                    Điền &quot;đã đóng&quot; theo file Excel (lead đã tick)
                  </button>
                  <HelpHint>
                    Lấy số tiền mà file Excel import đã ghi cho từng bé, cộng lại
                    theo từng phụ huynh. Chỉ điền cho lead đang tick và chưa có
                    khoản ghi nhận; bé nào file không có số thì bỏ qua, không đoán.
                  </HelpHint>
                </span>
                <span className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={dienTheoNiemYet}
                    disabled={dangChay}
                    className={LOP_NUT_PHU}
                  >
                    Điền &quot;đã đóng&quot; = học phí niêm yết (lead đã tick)
                  </button>
                  <HelpHint>
                    Dùng khi phụ huynh đóng đủ: điền bằng tổng học phí niêm yết của
                    các lớp đã chọn. Áp cho mọi lead đang tick và GHI ĐÈ số đang có
                    trong ô.
                  </HelpHint>
                </span>
              </div>
            </div>
          </div>
        </KhungDuLieu.Loc>

        {phieuHien.length === 0 ? (
          <KhungDuLieu.Rong
            ten={
              phieu.length === 0
                ? 'Chưa có lead "Đã đăng ký" nào — import file Excel ở màn Import khách đã đăng ký trước.'
                : "Không có lead khớp bộ lọc."
            }
          />
        ) : (
          <PhanTrangBang cuonNgang tenDonVi="lead" khoaGhiNho="sale-chot-hang-loat">
            <table className="bang-sale min-w-[1080px]">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Chọn</span>
                  </th>
                  <th scope="col">Phụ huynh</th>
                  <th scope="col">Học viên</th>
                  <th scope="col" className="w-64">
                    Lớp
                    <HelpHint>
                      Chỉ hiện lớp đang mở cùng cơ sở với lead và đúng khoá bé quan
                      tâm. Bé nào chưa chọn lớp thì cả lead đó không chốt được.
                    </HelpHint>
                  </th>
                  <th scope="col" className="w-24">
                    Ảnh: đồng ý
                    <HelpHint>
                      Tick khi phụ huynh đã đồng ý cho trung tâm dùng hình ảnh/video
                      của bé (NĐ 13/2023). Người tick và thời điểm được ghi nhật ký,
                      nên chỉ tick khi phụ huynh đã đồng ý thật.
                    </HelpHint>
                  </th>
                  <th scope="col" className="w-56">
                    Đã đóng (đ) · ngày
                    <HelpHint>
                      Số tiền phụ huynh ĐÃ đóng và ngày tiền thực về — chốt xong hệ
                      thống tạo luôn khoản thu theo đúng hai ô này. Bỏ TRỐNG số tiền
                      nghĩa là chưa rõ và sẽ không tạo khoản thu nào (khác với gõ số
                      0). Lead đã có khoản ghi nhận trước đó thì ô này khoá lại.
                    </HelpHint>
                  </th>
                  <th scope="col" className="w-64">
                    Kết quả
                  </th>
                </tr>
              </thead>
              <tbody>
                {phieuHien.map((p) => {
                  const kq = ketQua[p.id];
                  const khongCon = p.con.length === 0;
                  const khoa = dangChay || Boolean(kq?.ok) || khongCon;
                  // Vạch đứng bên trái CHỈ cho dòng lỗi — dòng duy nhất còn đòi
                  // người dùng làm gì. Xem chú thích màu ở đầu tệp.
                  const vachTrai = cn(
                    kq && !kq.ok && "border-l-2 border-l-[color:var(--state-danger)]",
                    khongCon && "border-l-2 border-l-[color:var(--state-warning)]",
                  );

                  if (khongCon) {
                    return (
                      <tr key={p.id} className={vachTrai}>
                        <td />
                        <td>
                          <OPhuHuynh
                            phieu={p}
                            nhanCoSo={(p.maCoSo && tenCoSo.get(p.maCoSo)) || "—"}
                          />
                        </td>
                        <td colSpan={5} className="text-xs">
                          <StatusPill tone="warning">Thiếu học viên</StatusPill>{" "}
                          <span className="text-muted-foreground">
                            Lead không có học viên đính kèm — chốt riêng tại{" "}
                            <Link
                              href={duongChotRieng(p.id)}
                              className="text-[color:var(--primary-ink)] underline underline-offset-2"
                            >
                              màn chuyển đổi
                            </Link>
                            .
                          </span>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={p.id} className={vachTrai}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Chọn lead ${p.tenPhuHuynh}`}
                          checked={daTick.has(p.id)}
                          onChange={(e) => batTatPhieu(p.id, e.target.checked)}
                          disabled={khoa}
                          className="size-4 rounded border-border accent-[color:var(--primary)]"
                        />
                      </td>

                      <td>
                        <OPhuHuynh
                          phieu={p}
                          nhanCoSo={(p.maCoSo && tenCoSo.get(p.maCoSo)) || "—"}
                        />
                      </td>

                      {/* ── Ba cột theo-con, cùng `CAO_O_CON` nên thẳng hàng ── */}
                      <td>
                        <div>
                          {p.con.map((c) => (
                            <div
                              key={c.id}
                              className={cn(CAO_O_CON, "flex flex-col justify-center")}
                            >
                              <span className="font-medium leading-5 text-foreground">
                                {c.hoTen}
                              </span>
                              <span className="text-xs leading-4 text-muted-foreground">
                                {[c.khoiLop, c.ngaySinh].filter(Boolean).join(" · ") ||
                                  "—"}
                              </span>
                              {c.ghiChu ? (
                                <span
                                  title={c.ghiChu}
                                  className="max-w-[14rem] truncate text-xs leading-4 text-muted-foreground"
                                >
                                  {c.ghiChu}
                                </span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </td>

                      <td>
                        <div>
                          {p.con.map((c) => {
                            const muc = lopChoCon(p, c);
                            return (
                              <div
                                key={c.id}
                                className={cn(CAO_O_CON, "flex flex-col justify-center")}
                              >
                                {/* `<select>` GỐC ở ĐÂY là có chủ đích, ngược với
                                    thanh lọc phía trên (đã đổi sang `<Select>`
                                    của kho). Trong một dòng bảng nó đứng cạnh ô
                                    tiền và ô ngày — cả hai đều là điều khiển
                                    gốc — nên chính nó mới là thứ khớp bối cảnh;
                                    còn một popup của kho cho MỖI bé trên mỗi
                                    dòng là hàng chục điều khiển nặng cho một
                                    thao tác gõ-chọn nhanh. Vỏ dùng chung
                                    `LOP_O_NHAP` nên ba ô vẫn cùng một hình. */}
                                <select
                                  aria-label={`Lớp cho ${c.hoTen}`}
                                  value={lopCuaCon[c.id] ?? ""}
                                  onChange={(e) =>
                                    setLopCuaCon((truoc) => ({
                                      ...truoc,
                                      [c.id]: e.target.value,
                                    }))
                                  }
                                  disabled={khoa}
                                  className={LOP_O_NHAP}
                                >
                                  <option value="">— Chọn lớp —</option>
                                  {muc.map((cl) => (
                                    <option key={cl.id} value={cl.id}>
                                      {cl.label} · {cl.courseName} ·{" "}
                                      {dinhDangVnd(cl.listPrice)}
                                    </option>
                                  ))}
                                </select>
                                {muc.length === 0 ? (
                                  <span className="mt-0.5 text-xs leading-4 text-[color:var(--state-danger)]">
                                    Chưa có lớp mở cùng khoá tại cơ sở này — tạo lớp
                                    trước.
                                  </span>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </td>

                      <td>
                        <div>
                          {p.con.map((c) => (
                            <div
                              key={c.id}
                              className={cn(CAO_O_CON, "flex items-center justify-center")}
                            >
                              <input
                                type="checkbox"
                                aria-label={`Phụ huynh đồng ý dùng hình ảnh của ${c.hoTen}`}
                                checked={dongYAnh[c.id] === true}
                                onChange={(e) =>
                                  setDongYAnh((truoc) => ({
                                    ...truoc,
                                    [c.id]: e.target.checked,
                                  }))
                                }
                                disabled={khoa}
                                className="size-4 rounded border-border accent-[color:var(--primary)]"
                              />
                            </div>
                          ))}
                        </div>
                      </td>

                      <td>
                        {p.daCoKhoanThu ? (
                          <StatusPill tone="info">Đã có khoản ghi nhận</StatusPill>
                        ) : (
                          <div className="space-y-1">
                            {/* Ô tiền: gõ 10000000 → hiện 10.000.000. Giữ state
                                dạng chuỗi vì hai nút "Điền đã đóng…" cũng ghi
                                chuỗi vào đây, và ô TRỐNG (≠ 0) nghĩa là "chưa rõ"
                                — không tạo khoản thu.
                                `suffix={null}`: cột đã ghi "Đã đóng (đ)", mà ô hẹp
                                nên hậu tố sẽ đè lên chữ số. */}
                            <MoneyInput
                              name={`tienDaDong-${p.id}`}
                              min={0}
                              value={tienDaDong[p.id] ?? ""}
                              onValueChange={(v) =>
                                setTienDaDong((truoc) => ({
                                  ...truoc,
                                  [p.id]: v === null ? "" : String(v),
                                }))
                              }
                              disabled={khoa}
                              placeholder="Bỏ trống nếu chưa rõ"
                              suffix={null}
                              className={LOP_O_NHAP}
                            />
                            <input
                              type="date"
                              aria-label={`Ngày đóng của ${p.tenPhuHuynh}`}
                              value={ngayDong[p.id] ?? homNay}
                              max={homNay}
                              onChange={(e) =>
                                setNgayDong((truoc) => ({
                                  ...truoc,
                                  [p.id]: e.target.value,
                                }))
                              }
                              disabled={khoa}
                              className={LOP_O_NHAP}
                            />
                            {Number(tienDaDong[p.id] ?? "") > 0 && tongNiemYet(p) > 0 ? (
                              <span className="block text-xs text-muted-foreground">
                                Niêm yết: {dinhDangVnd(tongNiemYet(p))}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>

                      <td className="text-xs">
                        {kq?.ok ? (
                          <span className="flex flex-col items-start gap-1">
                            <StatusPill tone="success">Đã chốt</StatusPill>
                            {kq.warning ? (
                              <span className="max-w-[15rem] truncate text-muted-foreground" title={kq.warning}>
                                {kq.warning}
                              </span>
                            ) : null}
                          </span>
                        ) : kq ? (
                          <span className="flex flex-col items-start gap-1">
                            <StatusPill tone="danger">Lỗi</StatusPill>
                            <span
                              className="max-w-[15rem] truncate text-[color:var(--state-danger)]"
                              title={kq.message}
                            >
                              {kq.message}
                            </span>
                          </span>
                        ) : p.ghiChu ? (
                          <span
                            className="block max-w-[15rem] truncate text-muted-foreground"
                            title={p.ghiChu}
                          >
                            {p.ghiChu}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </PhanTrangBang>
        )}
      </KhungDuLieu>

      {/* ── Dải hành động dính đáy ────────────────────────────────────────
          NGOÀI `KhungDuLieu` là bắt buộc: khung có `overflow-hidden`, và
          `overflow` khác `visible` biến tổ tiên thành vùng cuộn ⇒ `sticky` bên
          trong nó không bám được vào khung nhìn nữa. */}
      <div
        className={cn(
          "sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-xl",
          "border border-border bg-card px-4 py-3 shadow-[var(--bong-the)]",
        )}
      >
        <div className="text-sm text-muted-foreground">
          Đã tick: <span className="font-semibold tabular-nums text-foreground">{daTick.size}</span>{" "}
          · Đủ điều kiện:{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {phieuDuDieuKien.length}
          </span>
          {soDaChot > 0 ? (
            <>
              {" "}
              · Đã chốt:{" "}
              <span className="font-semibold tabular-nums text-foreground">{soDaChot}</span>
            </>
          ) : null}
        </div>

        {tienDo && dangChay ? (
          <div role="status" className="text-sm tabular-nums text-muted-foreground">
            Đang chốt… {tienDo.xong}/{tienDo.tong}
          </div>
        ) : null}

        <button
          type="button"
          onClick={chot}
          disabled={dangChay || phieuDuDieuKien.length === 0}
          className={cn(
            "ml-auto h-9 shrink-0 rounded-lg px-4 text-sm font-semibold transition-colors",
            "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
            "hover:bg-[color:var(--primary-dark)] disabled:opacity-50",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
          )}
        >
          {dangChay ? "Đang chốt…" : `Chốt ${phieuDuDieuKien.length} lead`}
        </button>
        <HelpHint className="[&_svg]:size-4" label="Chốt hàng loạt nghĩa là gì" side="top">
          Chỉ chốt những lead đã tick VÀ đã chọn lớp cho mọi bé của lead đó. Mỗi lead
          được tạo học viên, ghi danh, đơn học phí và tài khoản phụ huynh chờ kích
          hoạt. Chạy theo lô 20 lead; nếu đứt giữa chừng, bấm chốt lại là an toàn —
          lead đã chốt không bị tạo trùng.
        </HelpHint>
      </div>

      <p className="text-xs text-muted-foreground">
        Sau khi chốt: tài khoản phụ huynh ở trạng thái <b>chờ kích hoạt</b> — phụ
        huynh vào <span className="font-mono">satarobo.vn/kich-hoat</span>, nhập SĐT
        để nhận mã OTP qua Zalo và tự đặt mật khẩu. Quản lý danh sách chờ kích hoạt
        tại màn{" "}
        <Link
          href={DUONG_TAI_KHOAN_PH}
          className="text-[color:var(--primary-ink)] underline underline-offset-2"
        >
          Tài khoản phụ huynh
        </Link>
        .
      </p>
    </div>
  );
}

/** Ô "Phụ huynh" — tên (liên kết), SĐT · cơ sở, ngày đăng ký. */
function OPhuHuynh({
  phieu,
  nhanCoSo,
}: {
  phieu: PhieuChotHangLoat;
  nhanCoSo: string;
}) {
  return (
    <div>
      <Link
        href={duongChiTietLead(phieu.id)}
        className="font-medium text-[color:var(--primary-ink)] underline-offset-2 hover:underline"
      >
        {phieu.tenPhuHuynh}
      </Link>
      <span className="block text-xs tabular-nums text-muted-foreground">
        {phieu.sdt} · {nhanCoSo}
      </span>
      <span className="block text-xs text-muted-foreground">
        Đăng ký: {phieu.ngayTao}
      </span>
    </div>
  );
}
