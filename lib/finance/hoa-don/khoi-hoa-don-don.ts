// lib/finance/hoa-don/khoi-hoa-don-don.ts — VIEW-MODEL khối "Hoá đơn" trên trang chi tiết đơn (GĐ 7,
// docs/ke-toan-hoa-don/PLAN.md §8). THUẦN — dựng ở SERVER, rồi mới đưa xuống client.
//
// Mỗi LẦN THU một dòng — dựng bằng CHÍNH `dungDongHangCho` của màn kế toán, nên ngày, số và nhãn đợt
// khớp đúng thứ kế toán nhìn (không đẻ định nghĩa "lần thu" thứ hai).
//
// ⚠️ DTO ra client KHÔNG mang: khoá tệp (chỉ href tới route tải), email thật khi thiếu
// `orders:view-pii` (che bằng `maskEmail`), MST / địa chỉ / tên đơn vị người mua, văn bản lỗi của
// nhà cung cấp email, lý do TỰ DO của kế toán khi thiếu PII, `khoanIds`. `DongHangCho` KHÔNG được
// spread — nó mang SĐT, tên tệp, hành động của kế toán.
// ⚠️ Nút tải phải CÙNG LUẬT với route `payments/hoa-don/[hoaDonId]/tai-ve` (luật 12): quyền +
// phạm vi giải ở loader bằng chính hai cổng của route (`HoaDonVaoKhoi.taiDuoc`); chỉ vẽ trên dòng
// ĐÃ XUẤT; kho chưa cấu hình ⇒ route 503 ⇒ không vẽ nút; XML cần KHOÁ tệp XML (route hỏi
// `tepXmlKey`, không hỏi tên). Mọi câu "tải về gửi qua Zalo" cũng chỉ in khi nút ấy CÓ.

import { maskEmail } from "@/lib/utils";
import { dungDongHangCho, type DonVaoHangCho, type NganHangCho, type ToneDong } from "./dong-hang-cho";
import type { GiaoDichVao } from "./lan-thu";
import { phanLoaiKhoan } from "./du-dieu-kien";
import { soTienRong } from "./nguon-khoan";
import { laLyDoCoDinh, LY_DO_DA_XUAT_NGOAI } from "./ly-do-khong-xuat";

export type LuotGuiVao = {
  lanGui: number;
  toi: string;
  trangThai: "CHO" | "DANG_GUI" | "DA_GUI" | "LOI";
  loi: string | null;
  emailQueueId: string | null;
  updatedAt: Date;
};

export type HangDoiVao = {
  id: string;
  status: string;
  sentAt: Date | null;
  attempts: number;
  maxAttempts: number;
};

export type HoaDonVaoKhoi = DonVaoHangCho["hoaDonDienTu"][number] & {
  tongTien: number;
  tepXmlKey: string | null;
  /** Lượt gửi MỚI NHẤT trước (orderBy lanGui desc). */
  guiEmail: LuotGuiVao[];
  /**
   * Route tải về có trả tệp của bản này cho người đang xem không — loader giải bằng ĐÚNG hai cổng
   * của route: `passesScope("HoaDonDienTu", …)` + `duocTaiBanHoaDon` (lib/finance/hoa-don/quyen.ts).
   */
  taiDuoc: boolean;
};

export type DonVaoKhoi = Omit<DonVaoHangCho, "hoaDonDienTu"> & { hoaDonDienTu: HoaDonVaoKhoi[] };

export type EmailKhoi = {
  loai: "BO_TICK" | "KHONG_CO_EMAIL" | "CHUA_GUI" | "CHO_GUI" | "DANG_GUI" | "DA_GUI" | "LOI";
  nhan: string;
  tone: ToneDong;
  /** Văn bản lỗi của nhà cung cấp — CHỈ khi có quyền xem PII (có thể chứa địa chỉ email). */
  chiTiet: string | null;
};

/**
 * Trạng thái hoá đơn của lần thu, gom cho người KHÔNG làm hoá đơn — dùng để đếm tóm tắt.
 * `DA_XUAT_NGOAI` = kế toán ghi "Đã xuất ngoài hệ thống": khách ĐÃ có hoá đơn (MISA), chỉ là hệ thống
 * không giữ tệp. Gộp nó vào "không xuất" là nói với sale điều ngược lại (review GĐ 7).
 */
export type TrangThaiHoaDonLanThu = "CHO" | "DANG_XU_LY" | "DA_XUAT" | "DA_XUAT_NGOAI" | "KHONG_XUAT";

export type DongHoaDonDon = {
  /** Duy nhất trong khối: `hd:<id>` cho dòng có hoá đơn, `<ngăn>:<khoá lần thu>` cho dòng chưa có. */
  key: string;
  trangThai: TrangThaiHoaDonLanThu;
  ngayThuLabel: string;
  soTien: number;
  nguonLabel: string;
  nhanDot: string | null;
  nhan: string;
  tone: ToneDong;
  /** "1C26TSR · số 123" trên tờ hoá đơn (chỉ khi đã xuất trên hệ thống). */
  soHoaDon: string | null;
  ngayPhatHanhLabel: string | null;
  /** href route tải — `null` ⇒ KHÔNG vẽ nút (route sẽ từ chối). */
  taiPdf: string | null;
  taiXml: string | null;
  /** Vì sao dòng ĐÃ CÓ hoá đơn lại không có nút tải (luật 12: nói lý do, đừng để trống). */
  lyDoKhongTai: string | null;
  email: EmailKhoi | null;
  lyDoKhongXuat: string | null;
};

export type KhoiHoaDonDon = {
  dong: DongHoaDonDon[];
  /** Số khoản thu nằm trên đơn chưa gán cơ sở — không lên hoá đơn được, khối phải nói ra. */
  thieuCoSo: number;
  /**
   * Số khoản tiền THẬT thu trước khi lên hệ thống (`[backfill-import]` / `[sheet:…]`). Chúng không
   * bao giờ vào hàng chờ hoá đơn (kế toán đã xuất ngoài hệ thống nếu có) — thiếu con số này thì đơn
   * chỉ có tiền cũ hiện "Chưa có khoản thu nào", trong khi sổ tiền cùng trang ghi đã thu.
   */
  lichSu: number;
};

const ddmmyyyy = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

/** Giờ VN (UTC+7, không giờ mùa hè) — tính ở server, không đọc múi giờ máy. */
function lucVn(d: Date): string {
  const v = new Date(d.getTime() + 7 * 3600_000);
  const hh = String(v.getUTCHours()).padStart(2, "0");
  const mm = String(v.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} ${ddmmyyyy(v)}`;
}

/**
 * Trạng thái email của MỘT hoá đơn — chỉ bản ĐÃ XÁC NHẬN mới có. Đọc CẢ lượt gửi lẫn dòng hàng đợi:
 * có đường làm hai bảng lệch nhau (worker đặt FAILED vì thiếu nội dung mà không cập nhật lượt gửi),
 * nên "đã gửi" / "lỗi" lấy bên nào nói trước.
 *
 * @param coNutTai dòng này CÓ nút tải không. Không có thì câu dặn KHÔNG được bảo "tải về" (luật 12) —
 *   bắt buộc truyền, không mặc định: mặc định `true` là hứa một nút không tồn tại.
 */
export function trangThaiEmailHoaDon(
  hd: { trangThai: string; guiEmailKhach: boolean; emailNhan: string | null },
  luot: LuotGuiVao | null,
  hangDoi: HangDoiVao | null,
  xemPii: boolean,
  coNutTai: boolean,
): EmailKhoi | null {
  if (hd.trangThai !== "DA_XAC_NHAN") return null;
  const dan = coNutTai ? "tải về gửi qua Zalo" : "nhờ kế toán gửi bản cho khách";
  if (!luot) {
    if (!hd.guiEmailKhach) {
      return { loai: "BO_TICK", nhan: "Không gửi email — kế toán ghi khách đã nhận hoá đơn ngoài hệ thống", tone: "muted", chiTiet: null };
    }
    if (!hd.emailNhan) {
      return { loai: "KHONG_CO_EMAIL", nhan: `Khách không có email — ${dan}`, tone: "warning", chiTiet: null };
    }
    return { loai: "CHUA_GUI", nhan: `Chưa có lượt gửi email — ${dan}`, tone: "warning", chiTiet: null };
  }
  const toi = xemPii ? luot.toi : maskEmail(luot.toi);
  if (hangDoi?.status === "SENT" || luot.trangThai === "DA_GUI") {
    const luc = hangDoi?.sentAt ?? luot.updatedAt;
    return { loai: "DA_GUI", nhan: `Đã gửi tới ${toi} lúc ${lucVn(luc)}`, tone: "success", chiTiet: null };
  }
  if (hangDoi?.status === "FAILED" || luot.trangThai === "LOI") {
    return {
      loai: "LOI",
      nhan: `Gửi email tới ${toi} không được — ${dan}`,
      tone: "danger",
      chiTiet: xemPii ? luot.loi : null,
    };
  }
  if (luot.trangThai === "CHO") {
    return { loai: "CHO_GUI", nhan: `Đang chờ gửi tới ${toi}`, tone: "info", chiTiet: null };
  }
  const thuLai = hangDoi && hangDoi.attempts > 0 ? ` (đang thử lại lần ${hangDoi.attempts + 1}/${hangDoi.maxAttempts})` : "";
  return { loai: "DANG_GUI", nhan: `Đang gửi tới ${toi}${thuLai}`, tone: "info", chiTiet: null };
}

/**
 * Nhãn nói bằng ngôn ngữ của SALE (họ không làm hoá đơn — họ cần biết "khách đã có hoá đơn chưa").
 * Nhãn của màn kế toán ("Chờ xuất", "Đã tải tệp") là việc nội bộ của kế toán; ở đây dịch sang trạng
 * thái hoá đơn. Ngăn `lech` giữ phần "thiếu bao nhiêu" vì đó là lý do THẬT hoá đơn chưa ra.
 */
function nhanChoSale(r: { ngan: NganHangCho; nhan: string }, lyDoKhongXuat: string | null): {
  trangThai: TrangThaiHoaDonLanThu;
  nhan: string;
  tone: ToneDong;
} {
  switch (r.ngan) {
    case "cho":
      return { trangThai: "CHO", nhan: "Chờ kế toán xuất hoá đơn", tone: "warning" };
    case "lech":
      return { trangThai: "CHO", nhan: `Chờ kế toán xuất hoá đơn · ${r.nhan.toLowerCase()}`, tone: "warning" };
    case "nhap":
      return { trangThai: "DANG_XU_LY", nhan: "Kế toán đang xử lý hoá đơn", tone: "info" };
    case "da-xuat":
      return { trangThai: "DA_XUAT", nhan: "Đã xuất hoá đơn", tone: "success" };
    case "khong-xuat":
      // Lý do mặc định của kế toán — khách ĐÃ có hoá đơn (MISA). Nói "không xuất" là nói ngược.
      return lyDoKhongXuat === LY_DO_DA_XUAT_NGOAI
        ? { trangThai: "DA_XUAT_NGOAI", nhan: "Đã xuất hoá đơn ngoài hệ thống", tone: "success" }
        : { trangThai: "KHONG_XUAT", nhan: "Không xuất hoá đơn", tone: "muted" };
    case "don-huy":
      // `r.nhan` là "Đơn đã huỷ" hoặc "Đợt đã huỷ" — giữ đúng cái nào.
      return { trangThai: "KHONG_XUAT", nhan: `${r.nhan} — không xuất hoá đơn`, tone: "muted" };
  }
}

export function dungKhoiHoaDonDon(input: {
  don: DonVaoKhoi;
  /** Giao dịch mà khoản + phân bổ của đơn trỏ tới (loader nạp theo id của chính đơn). */
  giaoDich: readonly GiaoDichVao[];
  /** Dòng hàng đợi email của các lượt gửi mới nhất. */
  hangDoi: readonly HangDoiVao[];
  /** `orders:view-pii` — cổng che email + lý do tự do + lỗi nhà cung cấp. */
  xemPii: boolean;
  /** Kho tệp hoá đơn đã cấu hình — không có thì route trả 503. */
  khoOk: boolean;
  userId: string;
}): KhoiHoaDonDon {
  const { don, xemPii, khoOk } = input;
  const { dong, thieuCoSo } = dungDongHangCho({
    don,
    giaoDich: input.giaoDich,
    // Trang đơn KHÔNG dò giao dịch chưa khớp (câu đó quét cả hệ thống) ⇒ không có nhãn "Nghi trùng"
    // ở đây — việc đó của màn kế toán.
    giaoDichChuaKhop: [],
    userId: input.userId,
    coQuyen: false,
    khoOk,
    canViewPii: xemPii,
  });
  const hdTheoId = new Map(don.hoaDonDienTu.map((h) => [h.id, h]));
  const qTheoId = new Map(input.hangDoi.map((q) => [q.id, q]));

  // Tiền thu trước khi lên hệ thống — CÙNG luật phân loại với hàng chờ (một định nghĩa).
  const rong = soTienRong(don.payments);
  const daKhoa = new Set(don.hoaDonDienTu.flatMap((h) => h.khoan.map((k) => k.paymentId)));
  let lichSu = 0;
  for (const p of don.payments) {
    if (daKhoa.has(p.id)) continue;
    const pl = phanLoaiKhoan(p, don, rong.get(p.id) ?? 0);
    if (pl.vao === "LOAI" && pl.lyDo === "NHAP_LICH_SU") lichSu += 1;
  }

  const ra: DongHoaDonDon[] = dong
    .slice()
    .sort((a, b) => (a.ngayThu === b.ngayThu ? a.key.localeCompare(b.key) : a.ngayThu.localeCompare(b.ngayThu)))
    .map((r) => {
      const hd = r.hoaDon ? (hdTheoId.get(r.hoaDon.id) ?? null) : null;
      const daXuat = r.ngan === "da-xuat" && hd !== null;
      const luot = hd?.guiEmail[0] ?? null;
      const q = luot?.emailQueueId ? (qTheoId.get(luot.emailQueueId) ?? null) : null;
      const duocTai = daXuat && khoOk && hd.taiDuoc;
      const taiPdf = duocTai && hd.tepPdfKey ? `/payments/hoa-don/${hd.id}/tai-ve?loai=pdf` : null;
      const lyDoGoc = r.ngan === "khong-xuat" ? r.lyDoKhongXuat : null;
      const { trangThai, nhan, tone } = nhanChoSale(r, lyDoGoc);
      return {
        // Khoá LẦN THU không duy nhất: đợt đã xuất hoá đơn theo số đã thu rồi có thêm tiền về cho
        // đúng đợt ấy ⇒ hai dòng cùng `dot:<id>` (review GĐ 7). Dòng có hoá đơn khoá theo hoá đơn.
        key: hd ? `hd:${hd.id}` : `${r.ngan}:${r.key}`,
        trangThai,
        ngayThuLabel: r.ngayThuLabel,
        // Dòng đã xuất in số TRÊN TỜ HOÁ ĐƠN (chụp lúc chốt), không số ròng hiện tại.
        soTien: daXuat ? hd.tongTien : r.soTien,
        nguonLabel: r.nguonLabel,
        nhanDot: r.nhanDot,
        nhan,
        tone,
        soHoaDon: daXuat ? `${hd.kyHieu ?? "—"} · số ${hd.soHoaDon ?? "—"}` : null,
        ngayPhatHanhLabel: daXuat && hd.ngayPhatHanh ? ddmmyyyy(hd.ngayPhatHanh) : null,
        taiPdf,
        taiXml: duocTai && hd.tepXmlKey ? `/payments/hoa-don/${hd.id}/tai-ve?loai=xml` : null,
        lyDoKhongTai:
          trangThai === "DA_XUAT_NGOAI"
            ? "Hoá đơn xuất ở MISA, hệ thống không giữ tệp — cần bản thì nhờ kế toán gửi"
            : !daXuat
              ? null
              : !khoOk
                ? "Kho lưu hoá đơn chưa cấu hình — báo người vận hành"
                : !hd.taiDuoc
                  ? xemPii
                    ? "Hoá đơn thuộc cơ sở ngoài phạm vi của bạn — nhờ kế toán gửi"
                    : "Cần quyền xem thông tin khách để tải hoá đơn — nhờ kế toán gửi"
                  : !hd.tepPdfKey
                    ? "Hoá đơn chưa có tệp PDF — báo kế toán"
                    : null,
        email: hd ? trangThaiEmailHoaDon(hd, luot, q, xemPii, taiPdf !== null) : null,
        // Hai lý do CỐ ĐỊNH không mang gì của khách ⇒ ai xem đơn cũng đọc được; lý do TỰ DO ("Khác: …")
        // kế toán gõ tay nên có thể chứa MST/tên công ty ⇒ chỉ khi có quyền PII. Dòng "đã xuất ngoài
        // hệ thống" đã nói đủ ở nhãn — không lặp lại.
        lyDoKhongXuat:
          trangThai !== "KHONG_XUAT" || r.ngan !== "khong-xuat" || !lyDoGoc
            ? null
            : laLyDoCoDinh(lyDoGoc) || xemPii
              ? lyDoGoc
              : null,
      };
    });
  return { dong: ra, thieuCoSo, lichSu };
}
