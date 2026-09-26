// lib/finance/hoa-don/dong-hang-cho.ts — dựng DÒNG của màn hoá đơn từ dữ liệu MỘT đơn đã nạp. THUẦN.
//
// Kế hoạch: docs/ke-toan-hoa-don/PLAN.md §4 + §10. Ghép các luật đã có — phanLoaiKhoan · soTienRong ·
// gomLanThu · hanhDongChoDong · nguoiMuaChoDon — thành DTO đưa xuống client. Loader
// (`hang-cho.ts`) chỉ còn lo TRUY VẤN; mọi quyết định "vào ngăn nào, vẽ gì, che gì" nằm ở đây và
// kiểm được không cần DB.
//
// ⚠️ Dòng của hoá đơn NHÁP / KHÔNG XUẤT dựng lại bằng CHÍNH `gomLanThu` trên khoản của hoá đơn đó
// (gộp về một nhóm nếu ra nhiều) ⇒ khoá dòng TRÙNG khoá lúc còn ở hàng chờ. Nhờ vậy `?chon=` giữ
// đúng dòng đang chọn sau khi kế toán tải tệp lên (dòng đổi ngăn, không đổi khoá).
// ⚠️ DTO không mang `note`, `content` giao dịch, CCCD, địa chỉ — chỉ những gì màn in ra. Thiếu
// `orders:view-pii` thì SĐT + email bị che TẠI ĐÂY, trước khi rời server.

import { maskEmail, maskPhone } from "@/lib/utils";
import { nguonGiaoDich, soTienRong } from "./nguon-khoan";
import { phanLoaiKhoan } from "./du-dieu-kien";
import { gomLanThu, type GiaoDichVao, type LanThu } from "./lan-thu";
import { hanhDongChoDong, type HanhDongDong } from "./trang-thai-hoa-don";
import { daKhaiHoaDon, nguoiMuaChoDon, thieuChoHoaDon, type DonChoHoaDon } from "./nguoi-mua";
import { CAU_HINH_HOA_DON_MAC_DINH, phapNhanChoDon } from "./phap-nhan";
import { nhanDotLanThu } from "./nhan-dot";

export type DonVaoHangCho = DonChoHoaDon & {
  id: string;
  code: string;
  type: string;
  status: string;
  centerId: string | null;
  deletedAt: Date | null;
  center: { code: string | null; name: string } | null;
  /** MỌI dòng còn sống của đơn (kể cả dòng đảo/hoàn) — `soTienRong` cần đủ. */
  payments: {
    id: string;
    amount: number;
    method: string;
    note: string | null;
    paymentType: string;
    accountantStatus: string;
    enrollmentId: string | null;
    recordedById: string | null;
    adjustmentOfId: string | null;
    paidDate: Date;
    deletedAt: Date | null;
  }[];
  paymentRequests: {
    id: string;
    orderItemId: string | null;
    installmentNo: number;
    amountDue: number;
    status: "PENDING" | "PARTIAL" | "PAID" | "VOID";
    allocations: { bankTransactionId: string; paymentRequestId: string; amount: number; roundingWaived: number }[];
  }[];
  /** Hoá đơn còn hiệu lực (NHAP / DA_XAC_NHAN / KHONG_XUAT), `khoan` đã lọc hieuLuc. */
  hoaDonDienTu: {
    id: string;
    trangThai: string;
    kyHieu: string | null;
    soHoaDon: string | null;
    ngayPhatHanh: Date | null;
    tepPdfKey: string | null;
    tepPdfTen: string | null;
    tepXmlTen: string | null;
    emailNhan: string | null;
    guiEmailKhach: boolean;
    xuatTheoSoDaThu: boolean;
    lyDo: string | null;
    khoan: { paymentId: string; soTien: number }[];
  }[];
};

export type NganHangCho = "cho" | "lech" | "nhap" | "da-xuat" | "khong-xuat" | "don-huy";
export type ToneDong = "success" | "warning" | "danger" | "info" | "muted";

export type DongHangCho = {
  key: string;
  ngan: NganHangCho;
  nhan: string;
  tone: ToneDong;
  orderId: string;
  maDon: string;
  tenKhach: string;
  sdt: string | null;
  coSo: { ma: string | null; ten: string };
  ngayThu: string;
  ngayThuLabel: string;
  soTien: number;
  nguon: LanThu["nguon"];
  nguonLabel: string;
  nhanDot: string | null;
  thieu: number;
  traTruoc: number;
  ngoaiDot: number;
  tienTha: number;
  khoanIds: string[];
  /** Số RÒNG của từng khoản (`soTienRong`) — phiếu chờ in mỗi khoản một trang theo đúng số này. */
  khoan: { id: string; soTien: number }[];
  coTtHoaDon: boolean;
  emailNhan: string | null;
  kyHieuMau: string | null;
  hanhDong: HanhDongDong;
  hoaDonNhap: {
    id: string;
    kyHieu: string | null;
    soHoaDon: string | null;
    ngayPhatHanh: string | null;
    tepPdfTen: string | null;
    tepXmlTen: string | null;
    guiEmailKhach: boolean;
  } | null;
  /** Hoá đơn còn hiệu lực đang giữ lần thu (nháp / đã xuất / không xuất) — ngăn xử lý in số + tệp. */
  hoaDon: {
    id: string;
    trangThai: "NHAP" | "DA_XAC_NHAN" | "KHONG_XUAT";
    kyHieu: string | null;
    soHoaDon: string | null;
    ngayPhatHanh: string | null;
    coPdf: boolean;
    coXml: boolean;
  } | null;
  lyDoKhongXuat: string | null;
};

const tien = (n: number) => `${n.toLocaleString("vi-VN")}đ`;
const ddmmyyyy = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const isoNgay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function nhanVaTone(ngan: NganHangCho, lt: LanThu): { nhan: string; tone: ToneDong } {
  switch (ngan) {
    case "nhap":
      return { nhan: "Đã tải tệp", tone: "info" };
    case "da-xuat":
      return { nhan: "Đã xuất", tone: "success" };
    case "khong-xuat":
      return { nhan: "Không xuất", tone: "muted" };
    case "don-huy":
      return { nhan: lt.trangThai === "DOT_HUY" ? "Đợt đã huỷ" : "Đơn đã huỷ", tone: "danger" };
    case "lech":
      return lt.trangThai === "NGHI_TRUNG"
        ? { nhan: "Nghi trùng", tone: "danger" }
        : { nhan: `Thiếu ${tien(lt.thieu)}`, tone: "danger" };
    default:
      return { nhan: lt.trangThai === "LOI_KHAI" ? "Khai tay" : "Chờ xuất", tone: "warning" };
  }
}

function nganCua(lt: LanThu): NganHangCho {
  if (lt.trangThai === "DOT_HUY") return "don-huy";
  if (lt.trangThai === "THIEU" || lt.trangThai === "NGHI_TRUNG") return "lech";
  return "cho";
}

export function dungDongHangCho(input: {
  don: DonVaoHangCho;
  /** Giao dịch mà khoản + phân bổ của đơn trỏ tới. */
  giaoDich: readonly GiaoDichVao[];
  /** Giao dịch CHƯA KHỚP mang SĐT của đơn (người gọi bóc sẵn) — để phát hiện nghi trùng. */
  giaoDichChuaKhop: readonly { amount: number }[];
  /** Người đang xem — so AC5 (người ghi nhận không tự xác nhận khoản của mình). */
  userId: string;
  /** `coQuyenKeToanTaiCoSo(actor, don.centerId)` — người gọi giải sẵn. */
  coQuyen: boolean;
  khoOk: boolean;
  canViewPii: boolean;
}): { dong: DongHangCho[]; thieuCoSo: number } {
  const { don } = input;
  const rong = soTienRong(don.payments);
  const khoanTheoId = new Map(don.payments.map((p) => [p.id, p]));
  const daKhoa = new Set(don.hoaDonDienTu.flatMap((h) => h.khoan.map((k) => k.paymentId)));

  const hangCho: typeof don.payments = [];
  const donHuy: typeof don.payments = [];
  let thieuCoSo = 0;
  for (const p of don.payments) {
    if (daKhoa.has(p.id)) continue;
    const pl = phanLoaiKhoan(p, don, rong.get(p.id) ?? 0);
    if (pl.vao === "HANG_CHO") hangCho.push(p);
    else if (pl.vao === "DON_DA_HUY") donHuy.push(p);
    else if (pl.vao === "THIEU_CO_SO") thieuCoSo += 1;
  }
  // Đơn không cơ sở: `phanLoaiKhoan` đã xếp MỌI khoản vào THIEU_CO_SO — không dòng nào, chỉ đếm
  // (số KHOẢN, không phải số đơn) để màn nói ra thay vì để chúng rơi im lặng.
  if (!don.centerId) return { dong: [], thieuCoSo };

  const phanBo = don.paymentRequests.flatMap((r) => r.allocations);
  const dot = don.paymentRequests.map(({ id, installmentNo, amountDue, status }) => ({ id, installmentNo, amountDue, status }));
  const gdTheoId = new Map(input.giaoDich.map((g) => [g.id, g]));
  const vaoLanThu = (ps: readonly typeof don.payments[number][]) =>
    ps.map((p) => ({ id: p.id, rong: rong.get(p.id) ?? 0, nguon: nguonGiaoDich(p.note), paidDate: p.paidDate }));
  const gom = (ps: readonly typeof don.payments[number][], gop: readonly (readonly string[])[] = []) =>
    gomLanThu({
      khoan: vaoLanThu(ps),
      giaoDich: input.giaoDich,
      phanBo,
      dot,
      gop,
      giaoDichChuaKhop: input.giaoDichChuaKhop,
    });

  const nm = nguoiMuaChoDon(don);
  const thieuNguoiMua = thieuChoHoaDon(nm).chan;
  const coTtHoaDon = daKhaiHoaDon(don);
  const kyHieuMau = phapNhanChoDon(don.center?.code, CAU_HINH_HOA_DON_MAC_DINH)?.kyHieu ?? null;
  const sdt = nm.dienThoai ? (input.canViewPii ? nm.dienThoai : maskPhone(nm.dienThoai)) : null;
  const che = (email: string | null) => (email ? (input.canViewPii ? email : maskEmail(email)) : null);

  const dung = (lt: LanThu, ngan: NganHangCho, hd: DonVaoHangCho["hoaDonDienTu"][number] | null): DongHangCho => {
    const chuaXacNhanDuoc: string[] = [];
    for (const id of lt.khoanIds) {
      const p = khoanTheoId.get(id);
      if (!p || p.accountantStatus !== "PENDING") continue;
      const so = tien(rong.get(id) ?? p.amount);
      if (!p.enrollmentId) chuaXacNhanDuoc.push(`Khoản ${so} chưa gắn ghi danh — vẫn chờ kế toán xác nhận`);
      else if (p.recordedById && p.recordedById === input.userId) {
        chuaXacNhanDuoc.push(`Khoản ${so} do chính bạn ghi nhận — cần người khác xác nhận khoản`);
      }
    }
    const emailNhanThat = hd?.emailNhan ?? nm.email;
    const nhapCho = hd && hd.trangThai === "NHAP" ? hd : null;
    const hanhDong = hanhDongChoDong({
      lanThu: { trangThai: lt.trangThai, thieu: lt.thieu, nhanDot: nhanDotLanThu(lt.dotDich, don.paymentRequests), canhBao: lt.canhBao },
      hoaDonNhap: nhapCho
        ? { coTepPdf: Boolean(nhapCho.tepPdfKey), kyHieu: nhapCho.kyHieu, soHoaDon: nhapCho.soHoaDon, ngayPhatHanh: nhapCho.ngayPhatHanh }
        : null,
      coQuyen: input.coQuyen,
      khoOk: input.khoOk,
      emailNhan: emailNhanThat,
      guiEmailKhach: hd?.guiEmailKhach ?? true,
      thieuNguoiMua,
      khoanChuaXacNhanDuoc: chuaXacNhanDuoc,
      boQuaNghiTrung: false,
      xuatTheoSoDaThu: hd?.xuatTheoSoDaThu ?? false,
    });
    const gd = lt.giaoDichIds.map((id) => gdTheoId.get(id)).filter((g): g is GiaoDichVao => g != null);
    const nguonLabel =
      lt.nguon === "CK"
        ? gd.length === 1
          ? `Chuyển khoản · ${gd[0]!.providerTxnId}`
          : `Chuyển khoản · ${gd.length} giao dịch`
        : lt.nguon === "LOI_KHAI"
          ? "Khai tay theo đơn / đợt"
          : "Tiền mặt / ghi tay";
    const { nhan, tone } = nhanVaTone(ngan, lt);
    return {
      key: lt.key,
      ngan,
      nhan,
      tone,
      orderId: don.id,
      maDon: don.code,
      tenKhach: nm.hoTen,
      sdt,
      coSo: { ma: don.center?.code ?? null, ten: don.center?.name ?? "" },
      ngayThu: lt.ngayThu,
      ngayThuLabel: ddmmyyyy(lt.ngayThu),
      soTien: lt.soTien,
      nguon: lt.nguon,
      nguonLabel,
      nhanDot: nhanDotLanThu(lt.dotDich, don.paymentRequests),
      thieu: lt.thieu,
      traTruoc: lt.traTruoc,
      ngoaiDot: lt.ngoaiDot,
      tienTha: lt.tienTha,
      khoanIds: lt.khoanIds,
      khoan: lt.khoanIds.map((id) => ({ id, soTien: rong.get(id) ?? 0 })),
      coTtHoaDon,
      emailNhan: che(emailNhanThat),
      kyHieuMau,
      hanhDong,
      hoaDonNhap: nhapCho
        ? {
            id: nhapCho.id,
            kyHieu: nhapCho.kyHieu,
            soHoaDon: nhapCho.soHoaDon,
            ngayPhatHanh: isoNgay(nhapCho.ngayPhatHanh),
            tepPdfTen: nhapCho.tepPdfTen,
            tepXmlTen: nhapCho.tepXmlTen,
            guiEmailKhach: nhapCho.guiEmailKhach,
          }
        : null,
      hoaDon:
        hd && (hd.trangThai === "NHAP" || hd.trangThai === "DA_XAC_NHAN" || hd.trangThai === "KHONG_XUAT")
          ? {
              id: hd.id,
              trangThai: hd.trangThai,
              kyHieu: hd.kyHieu,
              soHoaDon: hd.soHoaDon,
              ngayPhatHanh: isoNgay(hd.ngayPhatHanh),
              coPdf: Boolean(hd.tepPdfKey),
              coXml: Boolean(hd.tepXmlTen),
            }
          : null,
      lyDoKhongXuat: hd?.trangThai === "KHONG_XUAT" ? hd.lyDo : null,
    };
  };

  const dong: DongHangCho[] = [];
  for (const lt of gom(hangCho)) dong.push(dung(lt, nganCua(lt), null));
  for (const lt of gom(donHuy)) dong.push(dung(lt, "don-huy", null));

  // Dòng của hoá đơn còn hiệu lực — dựng lại bằng CHÍNH gomLanThu trên khoản của hoá đơn.
  for (const hd of don.hoaDonDienTu) {
    const ps = hd.khoan.map((k) => khoanTheoId.get(k.paymentId)).filter((p): p is typeof don.payments[number] => p != null);
    if (ps.length === 0) continue;
    let nhom = gom(ps);
    if (nhom.length > 1) nhom = gom(ps, [nhom.map((n) => n.key)]);
    const ngan: NganHangCho =
      hd.trangThai === "NHAP" ? "nhap" : hd.trangThai === "KHONG_XUAT" ? "khong-xuat" : "da-xuat";
    dong.push(dung(nhom[0]!, ngan, hd));
  }

  return { dong, thieuCoSo };
}
