import "server-only";
import { db } from "@/lib/db";
import { enqueueEmail } from "@/lib/email/queue";
import { writeAudit } from "@/lib/audit/audit-log";
import { notifyStaff } from "@/lib/notifications/notify";
import { on, type DomainEventLite } from "@/lib/events/registry";
import { NGU_CANH_EMAIL_HOA_DON } from "./dinh-kem-email";
import { noiDungEmailHoaDon } from "./noi-dung-email";

// lib/finance/hoa-don/gui-email.ts — gửi hoá đơn điện tử cho khách (docs/ke-toan-hoa-don/PLAN.md §7).
//
//   chốt hoá đơn (tx) ─► HoaDonGuiEmail(CHO) + sự kiện `hoa-don.gui` {guiId}
//   dispatch-events   ─► giuLuotGuiHoaDon: MỘT transaction — giành CHO→DANG_GUI + xếp EmailQueue
//                        + lưu emailQueueId. Xếp hàng lỗi ⇒ NÉM ⇒ cả hai rollback ⇒ lượt thử lại
//                        của dispatcher vẫn gửi được, và không bao giờ có hai dòng EmailQueue.
//   email-queue       ─► dinh-kem-email.ts: đọc LẠI hoá đơn, ký URL tệp, gửi, ghi DA_GUI / LOI.
//   cron email-queue  ─► doiSoatGuiHoaDon: lượt còn CHO quá 10 phút (sự kiện chết) ⇒ giành lại.
//
// Khách KHÔNG có email (mà kế toán không bỏ tick) ⇒ sự kiện `hoa-don.khong-email` ⇒ báo SALE tải
// hoá đơn trên trang đơn để gửi Zalo. Người nhận: sale phụ trách lead → người lập đơn → mọi Quản lý
// cơ sở → không ai thì ghi nhật ký "không có người nhận" (không im lặng).

/** Handler `hoa-don.gui` — idempotent: lượt không còn CHO thì thôi. */
export async function giuLuotGuiHoaDon(guiId: string): Promise<"da-xep" | "bo-qua"> {
  return db.$transaction(async (tx) => {
    const g = await tx.hoaDonGuiEmail.findUnique({
      where: { id: guiId },
      select: {
        trangThai: true,
        toi: true,
        hoaDon: {
          select: {
            trangThai: true,
            nguoiMuaTen: true,
            nguoiMuaDonVi: true,
            phapNhanTen: true,
            kyHieu: true,
            soHoaDon: true,
            ngayPhatHanh: true,
            tongTien: true,
            tepXmlKey: true,
            order: { select: { code: true } },
          },
        },
      },
    });
    if (!g || g.trangThai !== "CHO") return "bo-qua";
    if (g.hoaDon.trangThai !== "DA_XAC_NHAN") {
      // Hoá đơn bị thay / gỡ trước khi kịp gửi ⇒ đóng lượt, KHÔNG gửi bản cũ.
      await tx.hoaDonGuiEmail.updateMany({
        where: { id: guiId, trangThai: "CHO" },
        data: { trangThai: "LOI", loi: "Hoá đơn không còn hiệu lực trước khi gửi" },
      });
      return "bo-qua";
    }

    const gianh = await tx.hoaDonGuiEmail.updateMany({ where: { id: guiId, trangThai: "CHO" }, data: { trangThai: "DANG_GUI" } });
    if (gianh.count === 0) return "bo-qua";

    const hd = g.hoaDon;
    const nd = noiDungEmailHoaDon({
      tenNguoiMua: hd.nguoiMuaDonVi || hd.nguoiMuaTen,
      phapNhanTen: hd.phapNhanTen,
      kyHieu: hd.kyHieu,
      soHoaDon: hd.soHoaDon,
      ngayPhatHanh: hd.ngayPhatHanh ? hd.ngayPhatHanh.toISOString().slice(0, 10) : null,
      tongTien: hd.tongTien,
      maDon: hd.order.code,
      coXml: Boolean(hd.tepXmlKey),
    });
    const q = await enqueueEmail({
      tx,
      to: g.toi,
      toName: hd.nguoiMuaTen,
      subject: nd.subject,
      bodyText: nd.bodyText,
      bodyHtml: nd.bodyHtml,
      context: { type: NGU_CANH_EMAIL_HOA_DON, id: guiId },
    });
    // Xếp hàng không được ⇒ NÉM để giành chỗ rollback cùng — lượt thử lại gửi được, không kẹt DANG_GUI.
    if (!q.ok || !q.id) throw new Error(`Không xếp được email hoá đơn (lượt ${guiId})`);
    await tx.hoaDonGuiEmail.update({ where: { id: guiId }, data: { emailQueueId: q.id } });
    return "da-xep";
  });
}

/** Handler `hoa-don.khong-email` — báo người gửi tay qua Zalo. Idempotent theo dedupeKey. */
export async function baoKhongEmail(hoaDonId: string): Promise<number> {
  const hd = await db.hoaDonDienTu.findUnique({
    where: { id: hoaDonId },
    select: {
      kyHieu: true,
      soHoaDon: true,
      orderId: true,
      centerId: true,
      order: { select: { code: true, customerName: true, createdById: true, lead: { select: { assignedToId: true } } } },
    },
  });
  if (!hd) return 0;

  let nguoiNhan: string[];
  if (hd.order.lead?.assignedToId) nguoiNhan = [hd.order.lead.assignedToId];
  else if (hd.order.createdById) nguoiNhan = [hd.order.createdById];
  else {
    const ql = await db.user.findMany({
      where: { isActive: true, deletedAt: null, roles: { has: "CENTER_MANAGER" }, centerId: hd.centerId },
      select: { id: true },
    });
    nguoiNhan = ql.map((u) => u.id);
  }

  const so = [hd.kyHieu, hd.soHoaDon].filter(Boolean).join("-");
  if (nguoiNhan.length === 0) {
    await writeAudit({
      actor: { id: null, name: "Hệ thống" },
      module: "finance",
      entityType: "HoaDonDienTu",
      entityId: hoaDonId,
      action: "KHONG_CO_NGUOI_NHAN_BAO",
      newValues: { orderId: hd.orderId, loai: "hoa-don.khong-email" },
      orgUnitId: hd.centerId,
    });
    return 0;
  }
  return notifyStaff({
    userIds: nguoiNhan,
    dedupeKey: `hoa-don.khong-email:${hoaDonId}`,
    title: `Hoá đơn ${so} chưa gửi được cho khách`,
    body: `Khách ${hd.order.customerName ?? ""} (đơn ${hd.order.code}) không có email — tải hoá đơn trên trang đơn để gửi qua Zalo.`,
    href: `/orders/${hd.orderId}`,
    entityId: hoaDonId,
  });
}

/**
 * Đối soát trong cron `email-queue`: lượt còn CHO quá `phut` phút (sự kiện chết / hết lượt thử của
 * dispatcher) ⇒ giành lại bằng chính handler. Idempotent — lượt đã xếp thì bỏ qua.
 */
export async function doiSoatGuiHoaDon(now: Date, phut = 10): Promise<number> {
  const ket = await db.hoaDonGuiEmail.findMany({
    where: { trangThai: "CHO", createdAt: { lt: new Date(now.getTime() - phut * 60_000) } },
    select: { id: true },
    take: 50,
  });
  let n = 0;
  for (const g of ket) {
    try {
      if ((await giuLuotGuiHoaDon(g.id)) === "da-xep") n++;
    } catch {
      // Lượt này lỗi lần nữa thì để lần đối soát sau — không làm chết cả vòng.
    }
  }
  return n;
}

export function registerHoaDonHandlers(): void {
  // Tên sự kiện viết LITERAL — lưới `lib/events/khop-phat-nghe.test.ts` chỉ đọc được chuỗi literal.
  on("hoa-don.gui", async (e: DomainEventLite) => {
    const guiId = (e.payload as { guiId?: unknown }).guiId;
    if (typeof guiId === "string" && guiId) await giuLuotGuiHoaDon(guiId);
  });
  on("hoa-don.khong-email", async (e: DomainEventLite) => {
    const hoaDonId = (e.payload as { hoaDonId?: unknown }).hoaDonId;
    if (typeof hoaDonId === "string" && hoaDonId) await baoKhongEmail(hoaDonId);
  });
}
