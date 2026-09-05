"use client";

/**
 * Site Sale — bảng "Thanh toán" + ba nút kế toán trên dòng.
 *
 * ── BẢN ĐÔI CỦA khối `<Table>` + `RowActions` trong
 *    `app/(admin)/admin/payments/_components/payments-client.tsx` ────────────
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * GIỮ NGUYÊN 100%:
 *   · 14 cột + cột "Thao tác" chỉ hiện khi có `payments:confirm` — đúng thứ tự,
 *     đúng nhãn: Đơn hàng · Tên bé · Lớp · Số tiền · Hình thức · Ngày thu ·
 *     Người thu · Nguồn HV · Tên PH · CCCD PH · Địa chỉ · Sale · Kế toán ·
 *     Phiếu thu (· Thao tác).
 *   · Cả bốn dấu "?" (Nguồn HV · Sale · Kế toán · Phiếu thu) và dấu "?" của ô
 *     "Chờ convert" — nguyên văn.
 *   · Ba nút Xác nhận / Điều chỉnh / Từ chối, hai ô lý do với đúng câu gợi ý
 *     ("Lý do từ chối (≥5 ký tự)", "Lý do điều chỉnh (≥5 ký tự)", "Số tiền mới"),
 *     và mọi câu toast.
 *   · Dòng rỗng: "Chưa có khoản thanh toán nào".
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. `<Table>` shadcn → `.bang-sale` của `sale.css` (dòng 44px, đầu cột chữ nhỏ
 *    in hoa, `nowrap` trên CẢ `th` VÀ `td`). Với bảng 15 cột thì `nowrap` không
 *    phải chuyện đẹp xấu: một nhãn xuống hai dòng là cả hàng cao lên và mắt mất
 *    dấu dòng đang dò.
 * 2. `<Badge className="bg-state-…">` gõ tay → `<StatusPill tone>` theo thang
 *    ngữ nghĩa (`lib/sale/trang-thai-thanh-toan.ts`).
 * 3. Cột "Số tiền" dùng `.o-so` → canh phải + chữ số đều bề ngang. Đây là màn
 *    TIỀN: số không thẳng hàng là số không so được bằng mắt.
 * 4. Cột "Địa chỉ" là cột DUY NHẤT được xuống dòng (`.o-dai`, trần 22rem) — nó
 *    là chuỗi dài duy nhất trong bảng. Bản admin cắt cụt bằng `truncate` +
 *    `title=""`; tiêu đề trình duyệt trễ 1–2 giây và trên máy bảng thì không bao
 *    giờ hiện, nên ở đây cho nó xuống dòng thay vì giấu đi.
 *
 * ⚠️ TIỀN: tệp này KHÔNG tính gì cả. `p.amount` là số nguyên VND lấy thẳng từ
 *    `Payment.amount`, chỉ đi qua `formatVndPlain` (đúng bằng `n.toLocaleString
 *    ("vi-VN") + " đ"` mà bản admin đang dùng). Mọi bút toán do Server Action
 *    của khu quản trị sinh ra.
 *
 * ⚠️ PII: `parentNationalId` và `address` xuống tới đây ĐÃ được che trên MÁY CHỦ
 *    (`fetchPaymentRows` → `maskNationalId`/`maskAddress`). Tệp này chỉ đọc cờ
 *    `p.piiMasked` để đổi màu chữ — KHÔNG tự che, KHÔNG tự chế mặt nạ.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Printer, X } from "lucide-react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
import { HelpHint } from "@/components/admin/ui/help-hint";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { cn } from "@/lib/utils";
import { formatDateDMY } from "@/lib/format/date";
import { formatVndPlain } from "@/lib/format/money";
import {
  adjustPaymentAction,
  confirmPaymentAction,
  rejectPaymentAction,
  type PaymentRow,
} from "@/app/(admin)/admin/payments/_actions";
import {
  nhanPhuongThuc,
  nhanTrangThaiKeToan,
  nhanTrangThaiSale,
  toneTrangThaiKeToan,
  toneTrangThaiSale,
} from "@/lib/sale/trang-thai-thanh-toan";

/**
 * ⚠️ NỢ ĐÃ BIẾT — bản in phiếu thu chưa có trên host Sale.
 * `/payments/{id}/phieu-thu` là clean URL host quản trị; trên `sale.satarobo.vn`
 * luật cuối viết lại thành `/sale/payments/{id}/phieu-thu` → 404. Giữ nguyên
 * (bản mount cũ hỏng y hệt) thay vì trỏ bừa. Vá thật = dựng
 * `/sale/thanh-toan/[id]/phieu-thu`, việc THÊM MÀN, đã báo lại cho chủ dự án.
 */
const duongPhieuThu = (id: string) => `/payments/${id}/phieu-thu`;

/** FIX-H9 — mã lỗi khoá lạc quan (đồng bộ `lib/finance/payment.ts` STALE_WRITE). */
const STALE_WRITE = "STALE_WRITE";

function xuLyGhiDe(): void {
  toast.error("Người khác vừa sửa khoản này. Đang tải lại…");
  // Tải lại để lấy `updatedAt` mới nhất; tránh tiếp tục ghi đè trên ảnh cũ.
  setTimeout(() => window.location.reload(), 800);
}

const LOP_NUT_NHO = cn(
  "inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium",
  "transition-colors disabled:opacity-50",
  "focus-visible:outline-none focus-visible:ring-2",
);

export function BangThanhToan({
  dong,
  coQuyenXacNhan,
}: {
  dong: PaymentRow[];
  coQuyenXacNhan: boolean;
}) {
  if (dong.length === 0) {
    return <KhungDuLieu.Rong ten="Chưa có khoản thanh toán nào" />;
  }

  return (
    <PhanTrangBang tenDonVi="khoản" khoaGhiNho="sale-thanh-toan" cuonNgang>
      <table className="bang-sale">
        <thead>
          <tr>
            <th scope="col">Đơn hàng</th>
            <th scope="col">Tên bé</th>
            <th scope="col">Lớp</th>
            <th scope="col" className="o-so">
              Số tiền
            </th>
            <th scope="col">Hình thức</th>
            <th scope="col" className="o-so">
              Ngày thu
            </th>
            <th scope="col">Người thu</th>
            <th scope="col">
              {/* Nhãn cột dễ đọc nhầm thành "cơ sở của học viên". Nó là NGUỒN LEAD
                  (Facebook, giới thiệu…) — chỉ giải thích được bằng một câu, nên để
                  trong "?" thay vì bơm thêm chữ vào hàng tiêu đề đã 14 cột. */}
              Nguồn HV
              <HelpHint>
                Kênh mà phụ huynh biết tới Sata Robo, lấy từ lead lúc đăng ký
                (Facebook, giới thiệu, hội thảo…). Dùng để biết tiền về từ kênh nào.
                Dấu &ldquo;—&rdquo; là khoản không đi từ lead nào.
              </HelpHint>
            </th>
            <th scope="col">Tên PH</th>
            <th scope="col">CCCD PH</th>
            <th scope="col">Địa chỉ</th>
            <th scope="col">
              Sale
              <HelpHint>
                Trạng thái phía người thu tiền. &ldquo;Đã ghi nhận&rdquo; = nhân viên
                khai đã nhận tiền của phụ huynh, chưa ai đối chiếu lại.
              </HelpHint>
            </th>
            <th scope="col">
              Kế toán
              <HelpHint>
                &ldquo;Chờ kế toán&rdquo; = mới ghi nhận, chưa đối chiếu nên CHƯA tính
                là đã thu và chưa trừ công nợ. &ldquo;Đã xác nhận&rdquo; = kế toán đối
                chiếu xong (tiền có thật), khoản mới trừ công nợ và sinh phiếu thu.
                &ldquo;Từ chối&rdquo; = khoản không hợp lệ, phải ghi nhận lại cho đúng.
              </HelpHint>
            </th>
            <th scope="col">
              Phiếu thu
              <HelpHint>
                Chỉ có sau khi kế toán xác nhận khoản thu. Bấm vào mã phiếu để mở bản
                in PDF cho phụ huynh.
              </HelpHint>
            </th>
            {coQuyenXacNhan && (
              <th scope="col" className="o-so">
                Thao tác
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {dong.map((p) => (
            <tr key={p.id}>
              <td>
                <span className="block font-medium text-foreground">{p.orderCode ?? "—"}</span>
                <span className="block text-xs text-muted-foreground">
                  {p.customerName ?? ""}
                </span>
              </td>
              <td className="text-foreground">{p.studentName ?? "—"}</td>
              <td className="text-xs text-muted-foreground">{p.className ?? "—"}</td>
              <td className="o-so font-semibold">{formatVndPlain(p.amount)}</td>
              <td className="text-xs text-muted-foreground">{nhanPhuongThuc(p.method)}</td>
              <td className="o-so text-xs text-muted-foreground">{formatDateDMY(p.paidDate)}</td>
              <td className="text-xs text-muted-foreground">{p.collectedByName ?? "—"}</td>
              <td className="text-xs text-muted-foreground">{p.leadSource ?? "—"}</td>
              <td className="text-foreground">{p.parentName ?? "—"}</td>
              <td
                className={cn(
                  "font-mono text-xs tabular-nums",
                  p.piiMasked ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {p.parentNationalId ?? "—"}
              </td>
              <td
                className={cn(
                  "o-dai text-xs",
                  p.piiMasked ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {p.address ?? "—"}
              </td>
              <td>
                <StatusPill tone={toneTrangThaiSale(p.saleStatus)}>
                  {nhanTrangThaiSale(p.saleStatus)}
                </StatusPill>
              </td>
              <td>
                <StatusPill tone={toneTrangThaiKeToan(p.accountantStatus)}>
                  {nhanTrangThaiKeToan(p.accountantStatus)}
                </StatusPill>
              </td>
              <td className="font-mono text-xs">
                {p.hasActiveReceipt ? (
                  <a
                    href={duongPhieuThu(p.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[color:var(--primary-ink)] hover:underline"
                    title="In phiếu thu (PDF)"
                  >
                    <Printer aria-hidden="true" className="size-3.5" />
                    {p.receiptCode}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              {coQuyenXacNhan && (
                <td className="o-so">
                  {p.accountantStatus === "PENDING" ? (
                    p.enrollmentId ? (
                      <HanhDongDong paymentId={p.id} updatedAt={p.updatedAt} />
                    ) : (
                      // Đơn chưa convert → chưa gắn ghi danh → confirm sẽ lỗi.
                      // Lời giải thích trước đây nằm ở `title=""` của trình duyệt:
                      // trễ 1–2 giây mới hiện, trên máy bảng thì không bao giờ hiện.
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        Chờ convert
                        <HelpHint>
                          Khoản này chưa gắn ghi danh nào nên kế toán chưa xác nhận
                          được. Chốt lead thành học viên (màn Chuyển đổi) là nút xác
                          nhận sẽ hiện ra.
                        </HelpHint>
                      </span>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </PhanTrangBang>
  );
}

/**
 * Ba nút của kế toán trên một dòng.
 *
 * ⚠️ CHỈ NHÂN BẢN LỚP VỎ. Ba Server Action gốc giữ nguyên: `confirmPaymentAction`
 *    (kèm `idempotencyKey` để bấm hai lần không sinh hai phiếu thu),
 *    `rejectPaymentAction` và `adjustPaymentAction` (kèm `expectedUpdatedAt` —
 *    khoá lạc quan chống ghi đè trên ảnh cũ).
 *
 * ⚠️ Thêm `router.refresh()` so với bản admin: ba action gọi
 *    `revalidatePath("/payments")` — đường của KHU QUẢN TRỊ, không phủ
 *    `/sale/thanh-toan`. Bản admin không cần vì nó ĐANG ở đúng đường được
 *    revalidate; ở đây thiếu dòng này thì bấm "Xác nhận" xong trạng thái đứng im
 *    tới khi F5, và người dùng sẽ bấm lại.
 */
function HanhDongDong({ paymentId, updatedAt }: { paymentId: string; updatedAt: string }) {
  const router = useRouter();
  const [che, setChe] = useState<null | "tu-choi" | "dieu-chinh">(null);
  const [lyDo, setLyDo] = useState("");
  const [soTien, setSoTien] = useState("");
  const [pending, start] = useTransition();

  function xacNhan() {
    // FIX-H8 — khoá ổn định cho lần bấm này → bấm hai lần / thử lại không sinh
    // phiếu thu thứ hai.
    const idempotencyKey = crypto.randomUUID();
    start(async () => {
      const res = await confirmPaymentAction(paymentId, idempotencyKey);
      if (res.ok) {
        toast.success(res.receiptId ? "Đã xác nhận — đã sinh phiếu thu" : "Đã xác nhận");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  function tuChoi() {
    start(async () => {
      const res = await rejectPaymentAction(paymentId, lyDo, updatedAt);
      if (res.ok) {
        toast.success("Đã từ chối khoản");
        setChe(null);
        router.refresh();
      } else if (res.error === STALE_WRITE) {
        xuLyGhiDe();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  function dieuChinh() {
    start(async () => {
      const res = await adjustPaymentAction({
        paymentId,
        amount: Number(soTien),
        reason: lyDo,
        expectedUpdatedAt: updatedAt,
      });
      if (res.ok) {
        toast.success("Đã điều chỉnh khoản");
        setChe(null);
        router.refresh();
      } else if (res.error === STALE_WRITE) {
        xuLyGhiDe();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  if (che === "tu-choi") {
    return (
      <span className="flex flex-col items-end gap-1.5 whitespace-normal py-1">
        <Textarea
          value={lyDo}
          onChange={(e) => setLyDo(e.target.value)}
          rows={2}
          placeholder="Lý do từ chối (≥5 ký tự)"
          className="w-56"
        />
        <span className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setChe(null)}
            className={cn(
              LOP_NUT_NHO,
              "border-border text-foreground hover:bg-[color:var(--surface-chim)]",
              "focus-visible:ring-[color:var(--primary)]/30",
            )}
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={tuChoi}
            disabled={pending}
            className={cn(
              LOP_NUT_NHO,
              "border-[color:var(--state-danger)] bg-[color:var(--state-danger)] text-white",
              "focus-visible:ring-[color:var(--state-danger)]/35",
            )}
          >
            {pending && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}
            Từ chối
          </button>
        </span>
      </span>
    );
  }

  if (che === "dieu-chinh") {
    return (
      <span className="flex flex-col items-end gap-1.5 whitespace-normal py-1">
        <MoneyInput
          name="soTienDieuChinh"
          min={0}
          value={soTien}
          onValueChange={(v) => setSoTien(v === null ? "" : String(v))}
          placeholder="Số tiền mới"
          className="w-56"
        />
        <Textarea
          value={lyDo}
          onChange={(e) => setLyDo(e.target.value)}
          rows={2}
          placeholder="Lý do điều chỉnh (≥5 ký tự)"
          className="w-56"
        />
        <span className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setChe(null)}
            className={cn(
              LOP_NUT_NHO,
              "border-border text-foreground hover:bg-[color:var(--surface-chim)]",
              "focus-visible:ring-[color:var(--primary)]/30",
            )}
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={dieuChinh}
            disabled={pending}
            className={cn(
              LOP_NUT_NHO,
              "border-[color:var(--primary)] bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
              "hover:bg-[color:var(--primary-dark)]",
              "focus-visible:ring-[color:var(--primary)]/40",
            )}
          >
            {pending && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}
            Lưu
          </button>
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex justify-end gap-1.5">
      <button
        type="button"
        onClick={xacNhan}
        disabled={pending}
        title="Xác nhận"
        aria-label="Xác nhận"
        className={cn(
          LOP_NUT_NHO,
          "border-[color:var(--primary)] bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
          "hover:bg-[color:var(--primary-dark)]",
          "focus-visible:ring-[color:var(--primary)]/40",
        )}
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
        ) : (
          <Check aria-hidden="true" className="size-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={() => setChe("dieu-chinh")}
        title="Điều chỉnh"
        aria-label="Điều chỉnh"
        className={cn(
          LOP_NUT_NHO,
          "border-border text-foreground hover:bg-[color:var(--surface-chim)]",
          "focus-visible:ring-[color:var(--primary)]/30",
        )}
      >
        <Pencil aria-hidden="true" className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setChe("tu-choi")}
        title="Từ chối"
        aria-label="Từ chối"
        className={cn(
          LOP_NUT_NHO,
          "border-border text-[color:var(--state-danger)] hover:bg-[color:var(--state-danger-soft)]",
          "focus-visible:ring-[color:var(--state-danger)]/35",
        )}
      >
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </span>
  );
}
