import Link from "next/link";
import { KHOAN_DA_GHI_NHAN } from "@/lib/finance/ghi-nhan";
import { congNoDon } from "@/lib/finance/cong-no-don";
import { DON_SACH, donNhiemTheoDon } from "@/lib/orders/don-nhiem";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { laKhoanDaXacNhan, tongDaXacNhan } from "@/lib/finance/debt";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { OrderDetailClient } from "../_components/order-detail-client";
import { SendEmailModal } from "../_components/send-email-modal";
import {
  resolveOrderPaymentConfig,
  transferContentForOrder,
  transferPhonePart,
  buildVietQrImageUrl,
  VIETQR_ADDINFO_MAX,
} from "@/lib/payments/vietqr";
import { computeDueNow } from "@/lib/payments/due-now";
import { getOrderPaymentRequests } from "@/lib/payments/payment-request";
import { loadActiveQrSessions } from "../_qr-core";
import { maskPhone, maskEmail } from "@/lib/utils";
import { laThuTienLinhHoatBat } from "@/lib/finance/feature";
import { noTheoCon } from "@/lib/finance/debt";
import { docTrangThaiDungHoc } from "@/lib/finance/dung-hoc-con";
import { docBaoLuuCuaDon } from "@/lib/finance/bao-luu-tien";
import { NutThemCon } from "../_components/them-con-dialog";
import type { LopChon } from "../_components/doi-khoa-dialog";
import { CongNoTheoCon, type PhieuGopView } from "../_components/cong-no-theo-con";
import { docPhieuGopDangMo } from "@/lib/finance/phieu-gop";
import { memoPhatHanh } from "@/lib/payments/memo-phat-hanh";

export const metadata = { title: "Chi tiết đơn hàng | Admin" };
export const dynamic = "force-dynamic";

/**
 * Che phần SĐT trong nội dung CK — CHỈ cho thứ in ra màn hình.
 *
 * VÌ SAO: nội dung CK nay là `HoTenCon_84987654321_TenKhoa`, tức SĐT phụ huynh nằm
 * NGUYÊN trong đó và được in đậm ở 3 chỗ trên trang. Vai có `orders:view` mà không
 * có `orders:view-pii` đọc lại được đủ số ⇒ việc che ô "SĐT" phía trên thành vô
 * nghĩa (và số còn nằm trong RSC payload).
 *
 * Vì sao CHE mà không ẨN HẲN khối: che xong chuỗi vẫn còn tên con + tên khoá, đủ
 * để người không có quyền PII đối chiếu đơn/sao kê bằng mắt, mà không cầm được số
 * để gọi. Ẩn hẳn thì khối "Nội dung CK" trống trơn, không giúp ai thêm điều gì.
 *
 * ⚠️ TUYỆT ĐỐI không dùng cho chuỗi nhúng vào ảnh QR: che ở đó là mã hỏng, tiền
 * không về được.
 *
 * Dùng lại `maskPhone` (hàm che DUY NHẤT của repo) + `transferPhonePart` để biết
 * chính xác đoạn nào là số — không dò regex lần hai. Đoạn SĐT luôn còn nguyên vẹn
 * trong chuỗi vì `buildTransferContent` cắt bớt TÊN CON chứ không cắt phần đuôi,
 * nên phép thay thế này không trượt.
 */
function maskPhoneInTransferContent(
  content: string,
  rawPhone: string | null | undefined,
): string {
  const phonePart = transferPhonePart(rawPhone);
  if (!phonePart || !content.includes(phonePart)) return content;
  return content.replace(phonePart, maskPhone(phonePart));
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Gate trước khi fetch order → chưa có centerId, không truyền target được (xem báo cáo).
  if (!(await checkPermission("orders:view"))) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;
  // Cách ly cơ sở: Order ∈ SCOPED_MODELS — findUnique qua scopedDb chống IDOR
  // (đơn cơ sở ngoài tầm nhìn → null → notFound).
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const order = await sdb.order.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          product: { select: { id: true, sku: true } },
          // Học viên CỦA TỪNG DÒNG. Một đơn nay chở được nhiều con của cùng một phụ
          // huynh (mỗi con một khoá), nên `order.student` — vốn chỉ có giá trị khi
          // đơn quy về đúng MỘT em — không còn trả lời được "khoản này là của ai".
          student: { select: { id: true, name: true } },
        },
      },
      paymentMethod: true,
      student: { select: { id: true, name: true } },
      lead: { select: { id: true, parentName: true } },
      center: { select: { id: true, name: true } },
      history: { orderBy: { createdAt: "desc" } },
      // OD1 — kế hoạch 2 đợt kèm reminderDays (số ngày nhắc trước hạn đợt 2) để pre-fill.
      installments: {
        orderBy: { soDot: "asc" },
        select: {
          id: true,
          soDot: true,
          amount: true,
          status: true,
          dueDate: true,
          paidAt: true,
          reminderDays: true,
        },
      },
      // (b) PA-A 22/07 — trạng thái sổ kế toán (Payment.accountantStatus) hiển thị
      // read-only cạnh kế hoạch đợt: installment PAID = "Sale đã thu", tiền chỉ
      // "xong" khi kế toán CONFIRMED bên /payments.
      // ⚠️ 07/09/2026 — PHẢI có `deletedAt: null`. Trước đó include này KHÔNG có
      // `where` nào cả, mà bộ lọc duy nhất ở dưới (dòng ~355) chỉ soi
      // `accountantStatus === "CONFIRMED"` ⇒ khoản đã XOÁ MỀM vẫn được cộng vào ô
      // "Đã xác nhận" của màn chi tiết đơn. Tiền đã huỷ sổ vẫn hiện là tiền đã thu.
      // (Đo 07/09: 0 dòng `deletedAt != null` ở local và dev/test ⇒ đang sai 0 đ,
      // nhưng `softDeletePayment` là đường ghi có thật.)
      payments: {
        where: { deletedAt: null },
        select: { amount: true, accountantStatus: true },
      },
    },
  });
  if (!order) notFound();

  // orders:manage chỉ HO_ACCOUNTANT (GLOBAL) — không cần target.
  const canManage = await checkPermission("orders:manage");
  // ĐƯỜNG B — quyền RIÊNG, không dùng lại `orders:manage`. Chủ dự án chốt 18/09/2026:
  // `payments:record` để gắn khoản đã thu cho một bé, `payments:manage` để bỏ gắn.
  //
  // ⚠️ Hai cờ này chỉ quyết định VẼ NÚT hay không. Cổng thật nằm trong action
  // (`congDuongB`), và nó hỏi lại cả ba vế: quyền · phạm vi cơ sở · công tắc của ĐƠN.
  // Ẩn nút không phải là kiểm quyền.
  const canRecordPayments = await checkPermission("payments:record");
  const canManagePayments = await checkPermission("payments:manage");
  // Che liên hệ khách trên PHẦN HIỂN THỊ nếu thiếu quyền. QR (nội dung CK) + gửi email
  // vẫn dùng `order` GỐC ở server (chức năng), chỉ bản `displayOrder` xuống client bị che
  // → không leak qua RSC payload.
  const canViewPii = await checkPermission("orders:view-pii");
  // OD1b — duyệt kế hoạch trả góp 2 đợt tách khỏi orders:manage (ACCOUNTANT không có quyền duyệt).
  // order đã fetch có centerId → truyền target để scope-aware (CENTER nếu có role seed sau này).
  // BGĐ 31/07 — duyệt giảm giá nhập tay (Quản lý cơ sở).

  // Commit 4 — thanh toán 2 đợt + QR.
  // BGĐ 31/07 — QR lấy tài khoản NHẬN TIỀN theo đơn. 31/08/2026: nguồn đổi từ "theo cơ
  // sở" sang "theo PHƯƠNG THỨC đã chọn trên đơn" (lùi dần về phương thức chuyển khoản
  // của cơ sở → dùng chung → kho VietQR cũ). Xem resolveOrderPaymentConfig.
  //
  // 20/08 — nội dung CK là `HoTenCon_SdtPH_TenKhoa` (không còn mã đơn). Tính MỘT LẦN
  // ở đây rồi truyền xuống cả khối QR mức đơn lẫn bảng phiếu thu theo đợt: ba chỗ in
  // ra phải là cùng một chuỗi, lệch nhau là sale đọc một đằng QR mã một nẻo.
  const payCfg = await resolveOrderPaymentConfig({
    centerId: order.centerId,
    paymentMethodId: order.paymentMethodId,
  });
  // Bản ĐẦY ĐỦ — thứ duy nhất được nhúng vào ảnh QR.
  //
  // ⚠️ Trần ký tự lấy TỪ `VIETQR_ADDINFO_MAX` (lib/payments/vietqr.ts), KHÔNG khai
  // lại số 25 ở đây. Chuỗi này và chuỗi mà `_qr-core.ts#addInfoFor` nhúng vào QR
  // theo từng phiếu thu PHẢI là một; hai chỗ giữ hai hằng riêng thì chỉ cần một
  // người sửa lệch là sale đọc một đằng, QR mã một nẻo — mà không có test nào bắt
  // được vì mỗi bên tự nhất quán với chính nó.
  const transferContent = transferContentForOrder(
    {
      studentName: order.student?.name,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      courseName: order.items[0]?.itemName,
    },
    VIETQR_ADDINFO_MAX,
  );
  // QR in SỐ PHẢI THU NGAY, không phải tổng đơn: khách chọn 2 đợt thì quét đóng
  // đợt 1. Dùng chung `computeDueNow` với webhook SePay — hai bên phải cùng một
  // con số, lệch là QR in một đằng máy đối khớp một nẻo (khách trả đúng vẫn bị
  // xếp vào "trả thiếu → xử lý tay").
  const paidSoFar = await sdb.payment.aggregate({
    where: { orderId: order.id, ...KHOAN_DA_GHI_NHAN },
    _sum: { amount: true },
  });
  const dueNow = computeDueNow({
    totalAmount: order.totalAmount,
    paidAmount: paidSoFar._sum.amount ?? 0,
    installments: order.installments,
    installmentApprovalStatus: order.installmentApprovalStatus,
  });
  // Bộ số in ra khối "Công nợ đơn hàng" — TÁI DÙNG `paidSoFar` (trục B) đã tính ở
  // trên cho mã QR, nên số trên màn và số trong QR không thể lệch nhau. Trục A lấy
  // Trục A ở đây CỐ Ý dùng bộ lọc GỘP (`laKhoanDaXacNhan`), KHÁC cổng phụ huynh —
  // xem ghi chú dài ở khối `accounting` bên dưới.
  //
  // Trước bản này `paidSoFar` chỉ dùng cho QR rồi bị bỏ: trang tính được "còn thiếu"
  // mà không in ra đâu cả.
  /**
   * ── BƯỚC A3 [16/09/2026]: ĐƠN CÓ DỮ LIỆU HỎNG THÌ NÓI RA NGAY ĐẦU TRANG ─────
   *
   * Chủ dự án: *"màn đơn hiện banner 'Đang chờ sửa dữ liệu'"*. Người mở đơn phải biết
   * TRƯỚC KHI thao tác, chứ không phải bấm "Xuất QR" rồi mới ăn một câu từ chối.
   *
   * ⚠️ `bypass: true` — đây là cổng AN TOÀN, không phải cổng hiển thị. Đơn này người dùng
   * đã qua scope ở trên rồi; nếu phép phán xét lại bị lọc theo tầm nhìn thì một đơn nhiễm
   * nằm ngoài tầm nhìn sẽ hiện ra là SẠCH.
   */
  const nhiemMap = await donNhiemTheoDon(
    scopedDb(actor, { bypass: true }),
    [order.id],
  );
  const donNhiem = nhiemMap.get(order.id) ?? DON_SACH;

  // PHIÊN A — công nợ theo từng con. Chỉ tính khi CÔNG TẮC BẬT cho cơ sở giữ đơn: tắt thì
  // trang giữ nguyên y như cũ, không thêm một truy vấn nào.
  //
  // ⚠️ `noTheoCon` cố ý đọc bằng `db` TRẦN (không `scopedDb`) — chốt của chủ dự án: *"cùng một
  // đơn, ai mở cũng ra cùng con số"*. Cách ly cơ sở đã ép ở cửa vào: tới được dòng này nghĩa là
  // `scopedDb` đã cho phép đọc chính cái đơn này.
  const batThuTheoCon = await laThuTienLinhHoatBat(order.orgUnitId);
  const soTheoCon = batThuTheoCon ? await noTheoCon(order.id) : null;
  // PHIÊN D — trạng thái dừng học của từng dòng. Cùng công tắc: tắt thì không thêm một
  // truy vấn nào.
  const trangThaiDungHoc = batThuTheoCon ? await docTrangThaiDungHoc(order.id) : undefined;
  // F2 — con nào đang bảo lưu + hạn đợt đã dời bao nhiêu ngày. Hỏi RIÊNG ở trang, cố ý
  // KHÔNG nhồi vào `noTheoCon`: hàm đó chạy trong transaction của mọi phép ghi tiền nên mỗi
  // câu tra thêm ở đó là thêm thời gian nằm dưới khoá đơn cho một thông tin chỉ để hiển thị.
  // F3 — khoá học chọn được khi thêm con. Chỉ khoá ĐANG BÁN và ĐÃ CÓ GIÁ: khoá chưa khai
  // giá thì cổng soát giá ở máy chủ từ chối, nên mời chọn nó là một lời hứa suông (luật 12).
  // F4 — lớp chọn được khi đổi khoá. Chỉ lớp CÒN NHẬN học sinh và khoá ĐÃ CÓ GIÁ: lớp đã
  // huỷ/kết thúc thì `chuyenLopTrongTx` từ chối, khoá chưa khai giá thì cổng soát giá từ
  // chối — mời chọn chúng là lời hứa suông (luật 12).
  const lopChonDuoc: LopChon[] = batThuTheoCon
    ? (
        await sdb.class.findMany({
          where: {
            deletedAt: null,
            status: { notIn: ["CANCELLED", "COMPLETED"] },
            course: { isActive: true, price: { gt: 0 } },
          },
          select: {
            id: true,
            name: true,
            course: { select: { name: true, price: true } },
          },
          orderBy: { name: "asc" },
          take: 200,
        })
      ).map((l) => ({
        id: l.id,
        name: l.name,
        courseName: l.course?.name ?? "",
        coursePrice: l.course?.price ?? null,
      }))
    : [];

  const khoaChonDuoc = batThuTheoCon
    ? await sdb.course.findMany({
        where: { isActive: true, price: { gt: 0 } },
        select: { id: true, name: true, price: true },
        orderBy: { name: "asc" },
      })
    : [];

  const baoLuuTheoCon = batThuTheoCon
    ? Object.fromEntries(await docBaoLuuCuaDon(order.id))
    : undefined;

  // ── PHIÊN C · phiếu gộp đang mở [20/09/2026] ────────────────────────────────
  //
  // Cùng công tắc với khối "Công nợ theo con": tắt thì KHÔNG thêm một truy vấn nào.
  const phieuMo = batThuTheoCon ? await docPhieuGopDangMo(order.id) : null;
  let phieuGop: PhieuGopView | null = null;
  if (phieuMo) {
    // Nội dung CK lấy từ `memoPhatHanh` — CHỖ DUY NHẤT quyết định khuôn mới hay cũ. Dựng
    // chuỗi tại đây bằng tay là đẻ ra một khuôn thứ hai, và khuôn thứ hai thì có ngày lệch.
    const memo = await memoPhatHanh({
      orgUnitId: order.orgUnitId,
      hoTen: order.student?.name ?? order.customerName,
      sdt: order.customerPhone,
      maMoi: phieuMo.ma,
      tran: VIETQR_ADDINFO_MAX,
    });
    phieuGop = {
      ...phieuMo,
      // ⚠️ QR nhận bản ĐẦY ĐỦ, phần HIỂN THỊ mới che — y hệt khối QR mức đơn ở dưới. Nhúng
      // bản che vào ảnh QR là mã hỏng, tiền không về được.
      qrUrl: canViewPii ? buildVietQrImageUrl(payCfg, phieuMo.tongTien, memo.noiDung) : null,
      noiDungCk: canViewPii
        ? memo.noiDung
        : maskPhoneInTransferContent(memo.noiDung, order.customerPhone),
    };
  }

  const congNo = congNoDon({
    totalAmount: order.totalAmount,
    daGhiNhan: paidSoFar._sum.amount ?? 0,
    daXacNhan: tongDaXacNhan(order.payments.filter(laKhoanDaXacNhan)),
  });
  // ⚠️ QR nhận bản ĐẦY ĐỦ (`transferContent`), KHÔNG phải bản che: mã phải mang đúng
  // nội dung phụ huynh sẽ chuyển, che ở đây là tiền không về được.
  //
  // ⚠️ VÌ THẾ, thiếu `orders:view-pii` thì KHÔNG dựng URL ảnh QR luôn. URL có dạng
  // `img.vietqr.io/...?addInfo=NguyenVanA_84987654321_Sata4` — nó đi thẳng vào
  // `<img src>` trong DOM và vào RSC payload, tức SĐT ĐẦY ĐỦ vẫn lọt xuống client dù
  // chuỗi in ra màn hình đã che (đo được ở vòng soi 3 — khối comment cũ ở đây khẳng
  // định ngược lại là SAI).
  //
  // Vì sao ẨN QR chứ không proxy ảnh qua route của mình: proxy là hạ tầng mới (route
  // ảnh + gác quyền + chống IDOR theo orderId) cho một vai mà HÔM NAY KHÔNG AI GIỮ —
  // mọi vai có `orders:view` trong seed-roles đều có kèm `orders:view-pii`. Ẩn là
  // hành vi trung thực và đúng bản chất: không được xem SĐT thì cũng không được cầm
  // mã QR, vì mã QR CHÍNH LÀ SĐT đó ở dạng khác.
  const qrUrl = canViewPii ? buildVietQrImageUrl(payCfg, dueNow.amount, transferContent) : null;
  // Bản HIỂN THỊ — mọi chỗ in nội dung CK ra màn hình (khối QR mức đơn, bảng phiếu
  // thu theo đợt, hộp phóng to QR) đều nhận chuỗi này. Che số nhưng GIỮ tên con +
  // tên khoá để người không có quyền PII vẫn đối chiếu đơn/sao kê bằng mắt được.
  const transferContentShown = canViewPii
    ? transferContent
    : maskPhoneInTransferContent(transferContent, order.customerPhone);

  // 03/08 — SỔ PHIẾU THU theo đợt (PaymentRequest) + phiên QR ACTIVE còn hạn của
  // từng phiếu. Đây là nguồn của bảng "Phiếu thu & QR theo đợt"; `OrderQrSection`
  // (QR mức ĐƠN, hành vi cũ) chỉ còn là lối lùi cho đơn CHƯA có phiếu thu nào —
  // đơn cũ tạo trước khi có sổ này. Xoá hẳn sẽ làm những đơn đó mất luôn QR.
  const paymentRequests = await getOrderPaymentRequests(order.id);
  const qrSessions = await loadActiveQrSessions(
    actor,
    paymentRequests.map((r) => ({ id: r.id, matchKey: r.matchKey })),
    // Đây là PHẦN NGƯỜI ĐỌC (`TenCon_84SĐT_MaKhoa`), KHÔNG phải chuỗi in ra: khoá đối
    // khớp do `noiDungCkChoPhieu` ghép thêm theo TỪNG PHIẾU ở trong core, vì mỗi đợt một
    // khoá. Truyền bản che được vì thiếu `orders:view-pii` thì core trả RỖNG (không phiên
    // nào xuống client), nên chuỗi tới đây luôn là bản đầy đủ.
    transferContentShown,
    // Cùng một câu trả lời quyền cho cả trang: thiếu `orders:view-pii` → core trả
    // RỖNG, không phiên QR nào xuống client (ảnh QR của từng đợt cũng mang SĐT đầy
    // đủ trong `imageSrc`). Truyền tường minh thay vì để core tự suy, để cờ này và
    // `qrUrl` ở trên chắc chắn đi cùng một nguồn `checkPermission`.
    { canViewPii },
  );

  const emailTemplates = canManage
    ? await sdb.emailTemplate.findMany({
        where: {
          isActive: true,
          trigger: { in: ["ORDER_CONFIRMATION", "PAYMENT_RECEIPT", "MANUAL"] },
        },
        select: { id: true, name: true, trigger: true },
        orderBy: { name: "asc" },
      })
    : [];

  // G4 (3c) — danh sách phương thức để đổi PTTT (chỉ cần khi có quyền sửa).
  // 30/08/2026 — lọc theo CƠ SỞ CỦA ĐƠN ngay tại nguồn: ở đây đã có `order.centerId`
  // nên không cần đẩy cả danh mục xuống client rồi lọc lại. Phương thức dùng chung
  // (centerId null) luôn nằm trong danh sách — bỏ chúng đi là đơn nào cũng mất tiền mặt.
  const paymentMethods = canManage
    ? await sdb.paymentMethod.findMany({
        where: {
          isActive: true,
          OR: [{ centerId: null }, { centerId: order.centerId }],
        },
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          name: true,
          centerId: true,
          canBuyCourse: true,
          canBuyPackage: true,
          canBuyExam: true,
          canBuyProduct: true,
        },
      })
    : [];

  return (
    /* Trần bề ngang 104rem (1664px) thay cho `max-w-5xl` (1024px) cũ.
       `max-w-5xl` là lý do màn 1531px bỏ trống hơn nửa bề ngang trong khi khối QR —
       công cụ thu tiền — bị đẩy xuống dưới cả ghi chú và lịch sử. Vẫn phải CÓ trần:
       ở 4k/8k một trang trải hết bề ngang thì mắt phải quét cả mét để đọc một cặp
       nhãn/giá trị. */
    <div className="mx-auto w-full max-w-[104rem]">
      <Link
        href="/orders"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Quay lại danh sách
      </Link>

      {soTheoCon && (
        <div className="mb-4">
          <CongNoTheoCon
            orderId={order.id}
            so={soTheoCon}
            duocSua={canManage}
            duocGan={canRecordPayments}
            duocBoGan={canManagePayments}
            dungHoc={trangThaiDungHoc}
            baoLuu={baoLuuTheoCon}
            themCon={khoaChonDuoc.length > 0 ? <NutThemCon orderId={order.id} khoa={khoaChonDuoc} /> : null}
            lopDoiKhoa={lopChonDuoc}
            phieu={phieuGop}
          />
        </div>
      )}

      <OrderDetailClient
        order={
          canViewPii
            ? order
            : {
                ...order,
                customerPhone: order.customerPhone ? maskPhone(order.customerPhone) : order.customerPhone,
                customerEmail: order.customerEmail ? maskEmail(order.customerEmail) : order.customerEmail,
                customerCccd: null,
                customerAddress: null,
                // Email nhận hoá đơn cũng là PII — che cùng cửa với `customerEmail`,
                // nếu không thì khối "Người mua trên hoá đơn" thành đường vòng đọc email.
                invoiceEmail: order.invoiceEmail
                  ? maskEmail(order.invoiceEmail)
                  : order.invoiceEmail,
              }
        }
        canManage={canManage}
        hanhDongPhu={
          canManage ? (
            <SendEmailModal
              orderId={order.id}
              defaultEmail={order.customerEmail}
              defaultName={order.customerName}
              templates={emailTemplates}
            />
          ) : null
        }
        qrUrl={qrUrl}
        dueNow={dueNow}
        transferContent={transferContentShown}
        paymentRequests={paymentRequests.map((r) => ({
          id: r.id,
          installmentNo: r.installmentNo,
          amountDue: r.amountDue,
          allocated: r.allocated,
          dueDate: r.dueDate ? r.dueDate.toISOString() : null,
          status: r.status,
          matchKey: r.matchKey,
        }))}
        qrSessions={qrSessions}
        paymentMethods={paymentMethods}
        congNo={congNo}
        donNhiem={donNhiem}
        accounting={{
          // TRỤC A (GỘP) — KHÔNG phải con số "phụ huynh đã đóng" của cổng PH.
          //
          // ⚠️ 17/09/2026 — đã thử đổi sang bộ lọc RÒNG (`laKhoanDaDong`, trừ bút toán
          // hoàn) rồi TRẢ LẠI: `congNoDon` tính `choXacNhan = trục B − trục A`, mà trục B
          // (`KHOAN_DA_GHI_NHAN`, phân bổ PaymentRequest) KHÔNG trừ hoàn. Để A ròng còn B
          // gộp thì sau mỗi lần hoàn, màn báo "chờ xác nhận" một khoản KHÔNG TỒN TẠI —
          // biến tín hiệu đối soát webhook thành báo động giả. Trang này hỏi "hai trục
          // lệch nhau bao nhiêu", KHÔNG hỏi "phụ huynh đã đóng bao nhiêu"; câu sau là
          // việc của `lib/portal/billing.ts`. Hai câu hỏi — xem `lib/finance/debt.ts`.
          //
          // Hệ quả còn lại, ghi ra để không ai tưởng đã xong: khối này KHÔNG hiện bút
          // toán hoàn. Muốn hiện thì thêm MỘT DÒNG RIÊNG, đừng đổi trục A.
          confirmed: tongDaXacNhan(order.payments.filter(laKhoanDaXacNhan)),
          pending: order.payments
            .filter((p) => p.accountantStatus === "PENDING")
            .reduce((s, p) => s + p.amount, 0),
        }}
        installments={order.installments.map((i) => ({
          id: i.id,
          soDot: i.soDot,
          amount: i.amount,
          status: i.status,
          dueDate: i.dueDate ? i.dueDate.toISOString() : null,
          paidAt: i.paidAt ? i.paidAt.toISOString() : null,
          reminderDays: i.reminderDays,
        }))}
      />
    </div>
  );
}
