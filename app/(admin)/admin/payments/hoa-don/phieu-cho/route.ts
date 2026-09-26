// Bản CHỜ XÁC NHẬN của phiếu thu — docs/ke-toan-hoa-don/PLAN.md §4 bước ②.
//
// Kế toán tải NGAY khi tiền về, trước khi có số RCP, để sang MISA làm hoá đơn. Một lần thu phủ nhiều
// khoản (vd hai con) ⇒ MỘT tệp, mỗi khoản một trang.
//
//   GET ?don=<orderId>&chon=<lanThuKey>
//
// ⚠️ Server KHÔNG nhận danh sách khoản từ client: tập khoản + số RÒNG dựng lại bằng CHÍNH loader
// của màn (`napHangChoHoaDon` thu hẹp theo đơn), rồi khớp khoá dòng. Nhận `?khoan=a,b` là để người
// gõ URL in phiếu cho khoản của đơn khác / số tiền đã đảo.
// ⚠️ Không phải kế toán của cơ sở giữ đơn ⇒ 404, KHÔNG 403 (không lộ sự tồn tại — cùng luật với
// route tải tệp hoá đơn).
// ⚠️ Audit TRƯỚC khi dựng PDF, kèm dấu người mua (`bamNguoiMua`): bước lưu nháp đọc lại dấu này để
// cảnh báo khi thông tin người mua bị sửa trong lúc kế toán làm hoá đơn ở MISA. Audit lỗi ⇒ 503.
import { createElement, type ReactElement } from "react";
import { NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { writeAudit } from "@/lib/audit/audit-log";
import { withFreshFonts } from "@/lib/pdf/brand";
import { PhieuThuNhieuTrangPdf, type PhieuThuPdfData } from "@/lib/pdf/phieu-thu";
import { lookupMethodNameByCode } from "@/lib/payments/method-lookup";
import { laHoaDonBat } from "@/lib/finance/hoa-don/feature";
import { QUYEN_KE_TOAN_HOA_DON } from "@/lib/finance/hoa-don/quyen";
import { napHangChoHoaDon } from "@/lib/finance/hoa-don/hang-cho";
import { CAU_HINH_HOA_DON_MAC_DINH, phapNhanChoDon } from "@/lib/finance/hoa-don/phap-nhan";
import { nguoiMuaChoDon } from "@/lib/finance/hoa-don/nguoi-mua";
import { bamNguoiMua } from "@/lib/finance/hoa-don/bam-nguoi-mua";
import { dungPhieuThuData, tenHocVienChoKhoan } from "@/lib/finance/hoa-don/phieu-thu-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KHONG_LUU = { "Cache-Control": "no-store" } as const;
const loi = (status: number, error: string) => NextResponse.json({ error }, { status, headers: KHONG_LUU });

function tenTepAnToan(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_.-]/g, "_")
    .replace(/_+/g, "_");
}

export async function GET(req: Request) {
  if (!(await laHoaDonBat())) return loi(404, "Không tìm thấy");
  const session = await auth();
  if (!session?.user) return loi(401, "Chưa đăng nhập");
  if (!(await checkPermission(QUYEN_KE_TOAN_HOA_DON))) return loi(403, "Không có quyền");

  const url = new URL(req.url);
  const orderId = url.searchParams.get("don")?.trim() ?? "";
  const chon = url.searchParams.get("chon")?.trim() ?? "";
  if (!orderId || !chon || orderId.length > 64 || chon.length > 512) return loi(400, "Thiếu đơn hoặc lần thu");

  const actor = await resolveActor(session.user.id);
  const { dong } = await napHangChoHoaDon(actor, { canViewPii: true, orderId });
  const row = dong.find((d) => d.key === chon && d.orderId === orderId);
  // `taiPhieu` = kế toán ĐÚNG cơ sở của đơn (luật ở `hanhDongChoDong`, một chỗ).
  if (!row || !row.hanhDong.taiPhieu || row.khoan.length === 0) return loi(404, "Không tìm thấy lần thu");

  const sdb = scopedDb(actor);
  const don = await sdb.order.findUnique({
    where: { id: orderId },
    select: {
      code: true,
      type: true,
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
      center: { select: { code: true } },
      student: { select: { name: true } },
      payments: {
        where: { id: { in: row.khoan.map((k) => k.id) }, deletedAt: null },
        select: {
          id: true,
          method: true,
          recordedById: true,
          enrollment: {
            select: {
              class: { select: { name: true, course: { select: { name: true } } } },
              student: { select: { name: true } },
            },
          },
          orderItem: { select: { student: { select: { name: true } } } },
        },
      },
    },
  });
  if (!don) return loi(404, "Không tìm thấy lần thu");

  // Bên bán là PHÁP NHÂN theo `Center.code` — xem chú thích route bản chính thức.
  const cauHinh = CAU_HINH_HOA_DON_MAC_DINH;
  const phapNhan = phapNhanChoDon(don.center?.code ?? null, cauHinh);
  if (!phapNhan) {
    return loi(409, "Chưa khai pháp nhân phát hành trong Cấu hình hoá đơn — không in phiếu với mã số thuế đoán bừa");
  }

  const theoId = new Map(don.payments.map((p) => [p.id, p]));
  const nguoiThuIds = [...new Set(don.payments.map((p) => p.recordedById).filter((x): x is string => Boolean(x)))];
  const phuongThuc = [...new Set(don.payments.map((p) => p.method))];
  const [nguoiThu, nhanPt] = await Promise.all([
    nguoiThuIds.length === 0
      ? Promise.resolve([])
      : sdb.user.findMany({ where: { id: { in: nguoiThuIds } }, select: { id: true, name: true } }),
    Promise.all(phuongThuc.map(async (m) => [m, (await lookupMethodNameByCode(m))?.trim() || m] as const)),
  ]);
  const tenNguoiThu = new Map(nguoiThu.map((u) => [u.id, u.name]));
  const tenPt = new Map(nhanPt);

  const khoiDon = {
    code: don.code,
    type: don.type,
    customerName: don.customerName,
    customerPhone: don.customerPhone,
    customerEmail: don.customerEmail,
    customerAddress: don.customerAddress,
    customerWard: don.customerWard,
    customerCity: don.customerCity,
    customerCccd: don.customerCccd,
    invoiceBuyerName: don.invoiceBuyerName,
    invoiceCompanyName: don.invoiceCompanyName,
    invoiceTaxCode: don.invoiceTaxCode,
    invoiceEmail: don.invoiceEmail,
  };

  const trang: PhieuThuPdfData[] = [];
  for (const k of row.khoan) {
    const p = theoId.get(k.id);
    // Khoản vừa bị xoá mềm giữa hai câu tra — tờ in ra phải khớp lần thu, không in thiếu một trang.
    if (!p) return loi(409, "Lần thu vừa thay đổi — tải lại màn rồi thử lại");
    trang.push(
      dungPhieuThuData({
        maPhieu: null,
        ngayLap: row.ngayThuLabel,
        phapNhan,
        cauHinh,
        don: khoiDon,
        soTien: k.soTien,
        hinhThucThanhToan: tenPt.get(p.method) ?? p.method,
        tenKhoa: p.enrollment?.class?.course?.name ?? null,
        tenHocVien: tenHocVienChoKhoan(p, don.student),
        tenLop: p.enrollment?.class?.name ?? null,
        nguoiThu: p.recordedById ? (tenNguoiThu.get(p.recordedById) ?? null) : null,
      }),
    );
  }

  try {
    await writeAudit({
      actor: { id: session.user.id, name: session.user.name ?? session.user.email ?? session.user.id },
      module: "finance",
      entityType: "Order",
      entityId: orderId,
      action: "TAI_PHIEU_CHO",
      newValues: {
        lanThuKey: row.key,
        khoanIds: row.khoanIds,
        soTien: row.soTien,
        nguoiMuaHash: bamNguoiMua(nguoiMuaChoDon(khoiDon)),
      },
    });
  } catch {
    return loi(503, "Không ghi được nhật ký — thử lại sau");
  }

  let pdf: Buffer;
  try {
    pdf = await withFreshFonts(() =>
      renderToBuffer(createElement(PhieuThuNhieuTrangPdf, { trang }) as unknown as ReactElement<DocumentProps>),
    );
  } catch (err) {
    return loi(500, `Lỗi tạo PDF: ${err instanceof Error ? err.message : "Unknown"}`);
  }

  const tenTep = `PhieuThu-CHO-${tenTepAnToan(don.code)}-${row.ngayThu}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${tenTep}"`,
      ...KHONG_LUU,
    },
  });
}
