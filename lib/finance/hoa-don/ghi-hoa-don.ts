import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit/audit-log";
import { nguoiMuaChoDon } from "./nguoi-mua";
import { bamNguoiMua } from "./bam-nguoi-mua";
import type { PhapNhan } from "./phap-nhan";
import type { OSoHoaDon } from "./o-so-hoa-don";

// lib/finance/hoa-don/ghi-hoa-don.ts — phép GHI trên BẢNG HOÁ ĐƠN (docs/ke-toan-hoa-don/PLAN.md §4).
//
// Ba việc, KHÔNG việc nào chạm sổ tiền (Payment · PaymentRequest · Receipt): tạo hoá đơn NHÁP khi kế
// toán tải tệp lên (④) · đánh dấu KHÔNG XUẤT · gỡ bản nháp / gỡ "không xuất". Xác nhận (⑤ — cấp RCP,
// xác nhận khoản) là việc của GĐ 5 và đi qua lõi riêng trong `lib/finance/payment.ts`.
//
// Người gọi (action) đã: kiểm quyền kế toán ĐÚNG cơ sở · dựng lại lần thu bằng loader của màn (tập
// khoản + số ròng không đến từ client) · xác minh byte tệp trong kho. Ở đây chỉ còn phần phải
// NGUYÊN TỬ.
//
// ⚠️ Hai kế toán cùng bấm trên MỘT lần thu: không kiểm-rồi-ghi ở tầng ứng dụng. Khoá thật là hai
// chỉ mục từng phần ở DB (`HoaDonKhoan_paymentId_hieuLuc_key`, `HoaDonDienTu_soHoaDon_conSong_key`);
// P2002 được dịch thành câu người đọc được.
// ⚠️ Từ chối trong transaction = `throw` (luật rollback — `return` không rollback).

export type MaLoiGhiHoaDon = "DA_CO_NGUOI_XU_LY" | "TRUNG_SO" | "DA_DOI";

const THONG_DIEP: Record<MaLoiGhiHoaDon, string> = {
  DA_CO_NGUOI_XU_LY: "Lần thu này vừa được người khác tải hoá đơn hoặc đánh dấu — tải lại màn",
  TRUNG_SO: "Số hoá đơn này (cùng ký hiệu, cùng pháp nhân) đã gắn cho một lần thu khác",
  DA_DOI: "Hoá đơn vừa bị người khác sửa hoặc gỡ — tải lại màn",
};

export class LoiGhiHoaDon extends Error {
  constructor(readonly ma: MaLoiGhiHoaDon) {
    super(THONG_DIEP[ma]);
    this.name = "LoiGhiHoaDon";
  }
}

/** Câu cho người dùng nếu `e` là lỗi đã biết của tầng này; `null` ⇒ lỗi lạ, người gọi ném tiếp. */
export function thongDiepLoiGhiHoaDon(e: unknown): string | null {
  return e instanceof LoiGhiHoaDon ? e.message : null;
}

/** P2002 của một trong hai khoá từng phần ⇒ lỗi nghiệp vụ; lỗi khác ném nguyên. */
function dichTrung(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    // Chỉ mục viết tay nên `meta.target` có thể là TÊN chỉ mục hoặc danh sách cột — cả hai đều
    // mang chữ "soHoaDon" khi đụng khoá số.
    throw new LoiGhiHoaDon(JSON.stringify(e.meta?.target ?? "").includes("soHoaDon") ? "TRUNG_SO" : "DA_CO_NGUOI_XU_LY");
  }
  throw e;
}

export type TepMoi = { khoa: string; ten: string; co: number; sha256: string };
type NguoiGhi = { id: string; name: string };

const COT_NGUOI_MUA = {
  customerName: true,
  customerPhone: true,
  customerEmail: true,
  customerAddress: true,
  customerWard: true,
  customerCity: true,
  customerCccd: true,
  invoiceBuyerName: true,
  invoiceCompanyName: true,
  invoiceTaxCode: true,
  invoiceEmail: true,
} satisfies Prisma.OrderSelect;

export async function taoHoaDonChoLanThu(input: {
  nguoiGhi: NguoiGhi;
  orderId: string;
  centerId: string;
  lanThuKey: string;
  khoan: readonly { id: string; soTien: number }[];
  loai:
    | { trangThai: "NHAP"; phapNhan: PhapNhan; so: OSoHoaDon; guiEmailKhach: boolean; pdf: TepMoi; xml: TepMoi | null }
    | { trangThai: "KHONG_XUAT"; lyDo: string };
}): Promise<{ id: string }> {
  if (input.khoan.length === 0) throw new LoiGhiHoaDon("DA_DOI");
  const tongTien = input.khoan.reduce((s, k) => s + k.soTien, 0);
  try {
    return await db.$transaction(async (tx) => {
      const don = await tx.order.findUnique({ where: { id: input.orderId }, select: COT_NGUOI_MUA });
      if (!don) throw new LoiGhiHoaDon("DA_DOI");

      let rieng: Prisma.HoaDonDienTuUncheckedCreateInput | Record<string, never> = {};
      const l = input.loai;
      if (l.trangThai === "NHAP") {
        const nm = nguoiMuaChoDon(don);
        // Dấu người mua LÚC TẢI PHIẾU CHỜ (route phiếu chờ ghi vào audit) — đó là thông tin kế toán
        // đã mang sang MISA. Chưa tải phiếu chờ (hoá đơn làm từ trước khi có màn này) ⇒ dấu hiện tại.
        const lanIn = await tx.auditLog.findFirst({
          where: {
            entityType: "Order",
            entityId: input.orderId,
            action: "TAI_PHIEU_CHO",
            newValues: { path: ["lanThuKey"], equals: input.lanThuKey },
          },
          orderBy: { createdAt: "desc" },
          select: { newValues: true },
        });
        const dauLucIn = (lanIn?.newValues as { nguoiMuaHash?: unknown } | null)?.nguoiMuaHash;
        rieng = {
          kyHieu: l.so.kyHieu,
          soHoaDon: l.so.soHoaDon,
          ngayPhatHanh: l.so.ngayPhatHanh,
          phapNhanMa: l.phapNhan.ma,
          phapNhanTen: l.phapNhan.ten,
          phapNhanMst: l.phapNhan.maSoThue,
          nguoiMuaTen: nm.hoTen || null,
          nguoiMuaDonVi: nm.tenDonVi,
          nguoiMuaMst: nm.maSoThue,
          nguoiMuaDiaChi: nm.diaChi,
          emailNhan: nm.email,
          nguoiMuaHashLucIn: typeof dauLucIn === "string" ? dauLucIn : bamNguoiMua(nm),
          guiEmailKhach: l.guiEmailKhach,
          tepPdfKey: l.pdf.khoa,
          tepPdfTen: l.pdf.ten,
          tepPdfCo: l.pdf.co,
          tepPdfSha256: l.pdf.sha256,
          tepXmlKey: l.xml?.khoa ?? null,
          tepXmlTen: l.xml?.ten ?? null,
          tepXmlCo: l.xml?.co ?? null,
        } as Prisma.HoaDonDienTuUncheckedCreateInput;
      }

      const hd = await tx.hoaDonDienTu.create({
        data: {
          ...rieng,
          orderId: input.orderId,
          centerId: input.centerId,
          trangThai: l.trangThai,
          tongTien,
          lyDo: l.trangThai === "KHONG_XUAT" ? l.lyDo : null,
          taoBoiId: input.nguoiGhi.id,
          khoan: { create: input.khoan.map((k) => ({ paymentId: k.id, soTien: k.soTien })) },
        },
        select: { id: true },
      });

      await writeAudit({
        tx,
        actor: input.nguoiGhi,
        module: "finance",
        entityType: "HoaDonDienTu",
        entityId: hd.id,
        action: l.trangThai === "NHAP" ? "TAO_HOA_DON_NHAP" : "DANH_DAU_KHONG_XUAT",
        newValues: {
          orderId: input.orderId,
          lanThuKey: input.lanThuKey,
          khoanIds: input.khoan.map((k) => k.id),
          tongTien,
          ...(l.trangThai === "NHAP"
            ? { kyHieu: l.so.kyHieu, soHoaDon: l.so.soHoaDon, tepPdfTen: l.pdf.ten, coXml: Boolean(l.xml) }
            : {}),
        },
        reason: l.trangThai === "KHONG_XUAT" ? l.lyDo : undefined,
        orgUnitId: input.centerId,
      });
      return hd;
    });
  } catch (e) {
    if (e instanceof LoiGhiHoaDon) throw e;
    return dichTrung(e);
  }
}

export async function capNhatHoaDonNhap(input: {
  nguoiGhi: NguoiGhi;
  orderId: string;
  hoaDonId: string;
  so: OSoHoaDon;
  guiEmailKhach: boolean;
  /** `undefined` = giữ tệp cũ. */
  pdf?: TepMoi;
  /** `undefined` = giữ · `null` = gỡ XML. */
  xml?: TepMoi | null;
}): Promise<{ tepCanXoa: string[] }> {
  try {
    return await db.$transaction(async (tx) => {
      const cu = await tx.hoaDonDienTu.findFirst({
        where: { id: input.hoaDonId, orderId: input.orderId, trangThai: "NHAP" },
        select: { updatedAt: true, centerId: true, tepPdfKey: true, tepXmlKey: true, kyHieu: true, soHoaDon: true },
      });
      if (!cu) throw new LoiGhiHoaDon("DA_DOI");

      const data: Prisma.HoaDonDienTuUpdateManyMutationInput = {
        kyHieu: input.so.kyHieu,
        soHoaDon: input.so.soHoaDon,
        ngayPhatHanh: input.so.ngayPhatHanh,
        guiEmailKhach: input.guiEmailKhach,
      };
      const tepCanXoa: string[] = [];
      if (input.pdf) {
        Object.assign(data, { tepPdfKey: input.pdf.khoa, tepPdfTen: input.pdf.ten, tepPdfCo: input.pdf.co, tepPdfSha256: input.pdf.sha256 });
        if (cu.tepPdfKey && cu.tepPdfKey !== input.pdf.khoa) tepCanXoa.push(cu.tepPdfKey);
      }
      if (input.xml !== undefined) {
        Object.assign(data, { tepXmlKey: input.xml?.khoa ?? null, tepXmlTen: input.xml?.ten ?? null, tepXmlCo: input.xml?.co ?? null });
        if (cu.tepXmlKey && cu.tepXmlKey !== input.xml?.khoa) tepCanXoa.push(cu.tepXmlKey);
      }

      // Chống bấm đôi / sửa chồng: ghi có điều kiện theo `updatedAt` đã đọc (khuôn FIX-H9).
      const upd = await tx.hoaDonDienTu.updateMany({
        where: { id: input.hoaDonId, trangThai: "NHAP", updatedAt: cu.updatedAt },
        data,
      });
      if (upd.count !== 1) throw new LoiGhiHoaDon("DA_DOI");

      await writeAudit({
        tx,
        actor: input.nguoiGhi,
        module: "finance",
        entityType: "HoaDonDienTu",
        entityId: input.hoaDonId,
        action: "SUA_HOA_DON_NHAP",
        oldValues: { kyHieu: cu.kyHieu, soHoaDon: cu.soHoaDon },
        newValues: { kyHieu: input.so.kyHieu, soHoaDon: input.so.soHoaDon, doiPdf: Boolean(input.pdf), doiXml: input.xml !== undefined },
        orgUnitId: cu.centerId,
      });
      return { tepCanXoa };
    });
  } catch (e) {
    if (e instanceof LoiGhiHoaDon) throw e;
    return dichTrung(e);
  }
}

/** Gỡ bản NHÁP (tải nhầm) hoặc gỡ dấu KHÔNG XUẤT — nhả khoản về hàng chờ. Bản đã xác nhận không gỡ được. */
export async function goHoaDonChuaChot(input: {
  nguoiGhi: NguoiGhi;
  orderId: string;
  hoaDonId: string;
}): Promise<{ tepCanXoa: string[] }> {
  return db.$transaction(async (tx) => {
    const cu = await tx.hoaDonDienTu.findFirst({
      where: { id: input.hoaDonId, orderId: input.orderId, trangThai: { in: ["NHAP", "KHONG_XUAT"] } },
      select: {
        trangThai: true,
        centerId: true,
        updatedAt: true,
        tepPdfKey: true,
        tepXmlKey: true,
        kyHieu: true,
        soHoaDon: true,
        lyDo: true,
        khoan: { select: { paymentId: true } },
      },
    });
    if (!cu) throw new LoiGhiHoaDon("DA_DOI");

    // Nhật ký trước: sau khi xoá, `writeAudit` không còn suy được đơn vị từ thực thể.
    await writeAudit({
      tx,
      actor: input.nguoiGhi,
      module: "finance",
      entityType: "HoaDonDienTu",
      entityId: input.hoaDonId,
      action: cu.trangThai === "NHAP" ? "GO_HOA_DON_NHAP" : "GO_KHONG_XUAT",
      oldValues: {
        orderId: input.orderId,
        trangThai: cu.trangThai,
        kyHieu: cu.kyHieu,
        soHoaDon: cu.soHoaDon,
        lyDo: cu.lyDo,
        khoanIds: cu.khoan.map((k) => k.paymentId),
      },
      orgUnitId: cu.centerId,
    });
    // `HoaDonKhoan` xoá theo (Cascade) ⇒ khoản về lại hàng chờ. Có điều kiện `updatedAt`: ai vừa
    // sửa / xác nhận giữa chừng thì 0 dòng ⇒ ném ⇒ rollback cả nhật ký.
    const del = await tx.hoaDonDienTu.deleteMany({
      where: { id: input.hoaDonId, trangThai: cu.trangThai, updatedAt: cu.updatedAt },
    });
    if (del.count !== 1) throw new LoiGhiHoaDon("DA_DOI");
    return { tepCanXoa: [cu.tepPdfKey, cu.tepXmlKey].filter((k): k is string => Boolean(k)) };
  });
}
