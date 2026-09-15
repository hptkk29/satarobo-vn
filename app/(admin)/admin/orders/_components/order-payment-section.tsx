"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { QrCode, BadgeCheck, CalendarClock } from "lucide-react";
import { QrZoom } from "./qr-zoom";
import type { PaymentRequestRow } from "./payment-requests-section";
import { recordOrderInstallmentsAction, markOrderInstallmentPaidAction } from "../_actions";
import { formatDateVN } from "@/lib/format/date";
import { MoneyInput } from "@/components/ui/money-input";
import { HelpHint } from "@/components/admin/ui/help-hint";
import {
  chenCoc,
  chiaDotHocPhi,
  hanChoDot,
  TRAN_SO_DOT,
  chiaDotGiuDotDaKhoa,
} from "@/lib/payments/ke-hoach-dot";
// Mặc định ô "đã thu" SUY TỪ TIỀN THẬT — thuần, dùng chung luật với cổng ở đường ghi.
import { dotsBanDauTuTien } from "@/lib/payments/khai-da-thu";

type Installment = {
  id: string;
  soDot: number;
  amount: number;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  // OD1 — số ngày nhắc trước hạn đợt 2 đã lưu (null → chưa đặt, dùng default).
  reminderDays: number | null;
};

function vnd(n: number) {
  return n.toLocaleString("vi-VN") + "đ";
}

/** Một dòng đợt trên form. `dueDate` là chuỗi `yyyy-mm-dd` vì `<input type="date">`. */
type DotForm = {
  amount: number;
  daThu: boolean;
  dueDate: string;
  reminderDays: number;
  /** Phiếu CỌC — đóng trước, và là phần ĐẦU của học phí chứ không phải khoản thu thêm. */
  laCoc: boolean;
};

/**
 * Dựng trạng thái ban đầu của form từ kế hoạch ĐÃ LƯU.
 *
 * ⚠️ ĐÃ SỬA [14/09/2026] — chưa có kế hoạch thì KHÔNG còn mặc định "đã thu cả đơn".
 *
 * Chú thích cũ ở đây nói mặc định đó "khiến bấm Lưu mà không đổi gì thì không sinh ra
 * khoản nợ ma". Nó sinh ra thứ NGƯỢC LẠI và tệ hơn: TIỀN MA. Đo trên `satarobo_local`,
 * đơn `ORD-260913-000001` (8.000.000đ, sổ có đúng 1.000.000đ): mở đơn, không đổi gì,
 * bấm "Lưu" ⇒ một `Payment` 7.000.000đ khống + đơn lật `CONFIRMED` + màn in "còn thiếu
 * 0đ". 193/496 đơn đang ở đúng hình dạng đó.
 *
 * Nay hỏi `dotsBanDauTuTien` (thuần, `lib/payments/khai-da-thu.ts` — có test + có phần
 * giải thích vì sao chọn TRỤC B). Ba ô UI thuần (`dueDate`/`reminderDays`/`laCoc`) gắn ở
 * đây chứ không ở hàm thuần: hàm đó cố ý không biết "hôm nay" là ngày nào (luật 19), và
 * bịa một cái hạn cũng là bịa, chỉ khó thấy hơn bịa tiền.
 */
function dotsBanDau(
  installments: Installment[],
  totalAmount: number,
  daThuTheoSo: number,
): DotForm[] {
  if (installments.length === 0) {
    return dotsBanDauTuTien({ totalAmount, daThuTheoSo }).map((d) => ({
      amount: d.amount,
      daThu: d.daThu,
      dueDate: "",
      reminderDays: 14,
      laCoc: false,
    }));
  }
  return [...installments]
    .sort((a, b) => a.soDot - b.soDot)
    .map((i) => ({
      amount: i.amount,
      daThu: i.status === "PAID",
      dueDate: i.dueDate?.slice(0, 10) ?? "",
      reminderDays: i.reminderDays ?? 14,
      // Kế hoạch đã lưu: đợt 1 mang số tiền nhỏ hơn phần chia đều là dấu hiệu có cọc,
      // nhưng ĐOÁN ở đây là sai. Giữ false; người dùng tích lại nếu muốn đổi.
      laCoc: false,
    }));
}

// G4 — Kế hoạch thanh toán 2 đợt. ĐẶT NGAY SAU section "Phương thức thanh toán"
// (tách khỏi khối QR để bố cục theo yêu cầu). Gồm: hiển thị các đợt + nút đánh dấu
// đã đóng đợt 2, và form thiết lập tối đa 2 đợt (gate orders:manage qua action).
export function OrderInstallmentPlan({
  orderId,
  totalAmount,
  canManage,
  installments,
  accounting,
  daThuTheoSo,
  paymentRequests,
}: {
  orderId: string;
  totalAmount: number;
  canManage: boolean;
  installments: Installment[];
  // (b) PA-A 22/07 — tổng theo sổ kế toán (Payment): tiền chỉ "xong" khi kế toán
  // CONFIRMED ở /payments. Đợt PAID nghĩa là SALE đã thu, không phải kế toán đã ✓.
  accounting: { confirmed: number; pending: number };
  /**
   * TRỤC B — Σ `Payment` còn sống `saleStatus = RECORDED` của đơn (`congNo.daThu` ở
   * trang cha). Nguồn của mặc định ô "đã thu".
   *
   * ⚠️ BẮT BUỘC, KHÔNG CÓ MẶC ĐỊNH (luật 7: tham số có mặc định nguy hiểm thì bỏ mặc
   * định — để `tsc` liệt kê call site thay vì để một chỗ gọi quên rồi im lặng bịa tiền).
   *
   * ⚠️ ĐỪNG suy nó từ `accounting.confirmed + accounting.pending`. Hai bộ lọc KHÁC NHAU
   * (`accountantStatus` ∈ {CONFIRMED, PENDING} vs `saleStatus = RECORDED`) và chênh lệch
   * KHÔNG lý thuyết: đo 14/09 trên `satarobo_local` có 379/380 khoản mang
   * `saleStatus = COLLECT_CONFIRMED` ⇒ trục B ≈ 0 trong khi tổng `accounting` là toàn bộ
   * số tiền. Dựng mặc định bằng một trục rồi để đường ghi (`recordInstallmentPlan` đo
   * `KHOAN_DA_GHI_NHAN`) gác bằng trục kia là hai con số không bao giờ gặp nhau — đúng
   * con bug đang vá, chỉ nhỏ hơn.
   */
  daThuTheoSo: number;
  /**
   * Phiếu thu theo đợt kèm TIỀN THẬT đã rót (`allocated`) — nguồn để KHOÁ đợt đã thu.
   *
   * ⚠️ KHÔNG suy từ `OrderInstallment.status`: cột đó là KẾ HOẠCH (sale tự đánh dấu),
   * còn `PaymentAllocation` là SỔ TIỀN. Tiền về qua QR làm phiếu thành PAID mà cột kế
   * hoạch vẫn PENDING — khoá theo cột kế hoạch là để sale sửa được một đợt đã có tiền,
   * đúng thứ cổng A6 vừa chặn ở server (`doiTienDotDaThu`).
   */
  paymentRequests: PaymentRequestRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // ── TRẠNG THÁI: MỘT MẢNG ĐỢT, không phải dot1/dot2 ────────────────────────────
  // Trần "2 đợt" cũ nằm ở đây chứ không ở DB: hai biến `dot1`/`dot2`, đợt 2 tự tính,
  // một ô ngày. Nay là mảng — thêm đợt là thêm phần tử.
  const [dots, setDots] = useState<DotForm[]>(() =>
    dotsBanDau(installments, totalAmount, daThuTheoSo),
  );
  /** Có thu cọc trước không + số tiền cọc. Cọc là phần ĐẦU của học phí, không cộng thêm. */
  const [coCoc, setCoCoc] = useState(false);
  const [tienCoc, setTienCoc] = useState(0);

  // Số ĐỢT HỌC PHÍ — KHÔNG đếm phiếu cọc. Chip "2 học phần" phải sáng khi khách chia
  // 2 đợt, dù bảng đang có 3 dòng vì có thêm phiếu cọc đứng đầu.
  const soDotHocPhi = dots.filter((d) => !d.laCoc).length;
  const tongCacDot = dots.reduce((s, d) => s + d.amount, 0);
  const lech = tongCacDot - totalAmount;
  const thieuHan = dots.findIndex((d) => !d.daThu && !d.dueDate);

  /** Chọn số đợt → chia đều + sinh hạn cách 30 ngày. Người dùng sửa lại từng dòng được. */
  /**
   * Đợt nào đã có TIỀN THẬT rót vào ⇒ số tiền của nó BẤT BIẾN (A6).
   *
   * `installmentNo > 0` loại phiếu thu toàn đơn (số 0) — nó không phải một đợt.
   */
  const daRotTheoDot = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of paymentRequests) {
      if (r.installmentNo > 0 && r.allocated > 0) m.set(r.installmentNo, r.allocated);
    }
    return m;
  }, [paymentRequests]);

  /** Số thứ tự đợt của hàng thứ `i` trên form (hàng cọc không phải một đợt học phí). */
  const soDotCuaHang = (i: number) => i + (dots[0]?.laCoc ? 0 : 1);
  const tienDaRot = (i: number) => daRotTheoDot.get(soDotCuaHang(i)) ?? 0;
  const hangBiKhoa = (i: number) => tienDaRot(i) > 0;
  /** Số hàng ĐẦU liên tiếp đang bị khoá — phần `chonSoDot` không được chia lại. */
  const soHangKhoa = dots.findIndex((_, i) => !hangBiKhoa(i));
  const demHangKhoa = soHangKhoa < 0 ? dots.length : soHangKhoa;

  /**
   * THU GỌN khối sửa kế hoạch khi kế hoạch ĐÃ CÓ (15/09/2026).
   *
   * Chủ dự án: *"thu gọn lại và có nút sửa nếu có nhu cầu sửa"*. Từ đợt này kế hoạch
   * được lập NGAY ở trang tạo đơn, nên trên trang đơn nó gần như luôn chỉ để ĐỌC —
   * bày cả form nhập ra mặc định là mời người ta sửa một thứ đang đúng.
   *
   * Chưa có kế hoạch ⇒ MỞ SẴN: lúc đó lập kế hoạch đúng là việc cần làm.
   */
  const [moSua, setMoSua] = useState(installments.length === 0);

  function chonSoDot(n: number, cocMoi?: number) {
    const coc = cocMoi ?? (coCoc ? tienCoc : 0);
    // Chia học phí thành n đợt TRƯỚC, rồi chèn cọc và trừ dần từ đợt 1 —
    // `chenCoc` giữ bất biến Σ = tổng đơn (xem lib/payments/ke-hoach-dot.ts).
    // ĐÃ CÓ ĐỢT THU TIỀN ⇒ giữ nguyên chúng, chỉ chia PHẦN CÒN THIẾU cho các đợt sau
    // (chủ dự án 15/09). Chia đều trên toàn bộ tổng rồi mới sửa mấy ô đầu về là một
    // khoảnh khắc Σ ≠ tổng đơn — vô hình trên màn, nhưng `kiemKeHoachDot` sẽ từ chối và
    // không ai hiểu vì sao. Luật ở `chiaDotGiuDotDaKhoa`.
    const tien =
      demHangKhoa > 0
        ? chiaDotGiuDotDaKhoa(
            totalAmount,
            dots.slice(0, demHangKhoa).map((d) => d.amount),
            Math.max(1, n - demHangKhoa),
          )
        : chenCoc(chiaDotHocPhi(totalAmount, n), coc).map((d) => d.amount);
    const coCocThat = coc > 0;
    // Mốc hạn = HÔM NAY. `hanChoDot` cố ý không tự đọc đồng hồ (luật 19) nên mốc truyền
    // từ đây — chỗ duy nhất thật sự có quyền biết "hôm nay".
    // +1 mốc hạn khi có cọc: phiếu cọc đứng đầu và đến hạn NGAY (khách quét trả trước).
    const han = hanChoDot(new Date(), tien.length);
    setDots(
      tien.map((amount, i) => ({
        amount,
        laCoc: coCocThat && i === 0,
        // Giữ nguyên "đã thu" của các đợt cũ còn trong tầm — đổi số đợt không được âm
        // thầm biến tiền đã thu thành chưa thu.
        //
        // ⚠️ Phiếu CỌC mặc định CHƯA THU: cả điểm của nó là sinh QR để khách trả trước.
        daThu: coCocThat && i === 0 ? false : (dots[i]?.daThu ?? i === 0),
        dueDate: han[i]!.toISOString().slice(0, 10),
        reminderDays: dots[i]?.reminderDays ?? 14,
      })),
    );
  }

  function suaDot(i: number, thayDoi: Partial<DotForm>) {
    setDots((cu) => cu.map((d, k) => (k === i ? { ...d, ...thayDoi } : d)));
  }

  function save() {
    if (lech !== 0) {
      toast.error(
        `Tổng các phiếu phải bằng ${vnd(totalAmount)} — đang lệch ${vnd(Math.abs(lech))}`,
      );
      return;
    }
    if (thieuHan >= 0) {
      toast.error(`Đợt ${thieuHan + 1} chưa thu — chọn ngày hẹn đóng`);
      return;
    }
    start(async () => {
      // ⚠️ HẠN CHẾ ĐÃ BIẾT: cờ `laCoc` KHÔNG được lưu xuống DB — `OrderInstallment` không
      // có cột cho nó, và thêm cột chỉ để hiện một cái nhãn là không đáng một migration
      // trên bảng có dữ liệu prod. Hệ quả: sau khi lưu, bảng phía trên hiện "Đợt 1" thay
      // vì "Cọc". Tiền và QR thì ĐÚNG — cọc là một phiếu thu riêng, có QR riêng, và đã
      // được trừ khỏi đợt sau.
      const res = await recordOrderInstallmentsAction({
        orderId,
        dots: dots.map((d) => ({
          amount: d.amount,
          daThu: d.daThu,
          // Đợt đã thu không cần hạn — gửi null để cron nhắc nợ không ôm nhầm.
          dueDate: d.daThu ? null : d.dueDate || null,
          reminderDays: d.daThu ? null : d.reminderDays,
        })),
      });
      if (res.ok) {
        toast.success(`Đã lưu kế hoạch ${dots[0]?.laCoc ? "cọc + " : ""}${soDotHocPhi} đợt`);
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  function markPaid(id: string) {
    start(async () => {
      const res = await markOrderInstallmentPaidAction(id, orderId);
      if (res.ok) {
        toast.success("Đã ghi nhận đóng đợt");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
        <CalendarClock className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        Kế hoạch thanh toán
        <HelpHint>
          Đóng một lần hoặc chia theo học phần (48 buổi = 4 học phần × 12 buổi). Công văn
          SR.QD.223 nêu mốc các đợt cách 30 ngày; SR.QD.219 Điều 2 cho phép chia đều tối đa
          12 kỳ theo tháng.
        </HelpHint>
      </h2>

      <div className="mb-3 space-y-2">
        {installments.map((i) => (
          <div
            key={i.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm"
          >
            <span className="min-w-0">
              <b className="font-semibold">Đợt {i.soDot}</b> · {vnd(i.amount)}
              {i.dueDate ? ` · hẹn ${formatDateVN(i.dueDate)}` : ""}
              {/* TIỀN THẬT đã về phiếu của đợt này (15/09/2026).

                  Nhãn bên phải đọc `OrderInstallment.status` — cột KẾ HOẠCH, do sale
                  tự đánh dấu. Tiền về qua QR thì phiếu thành PAID mà cột đó vẫn
                  PENDING, nên hàng hiện "Chờ đóng" trong lúc khối QR ngay trên hiện
                  "Đã đủ" — hai con số cho cùng một đợt. Dòng này in SỔ TIỀN
                  (`PaymentAllocation`), thứ duy nhất nói được khách đã trả bao nhiêu. */}
              {(daRotTheoDot.get(i.soDot) ?? 0) > 0 && (
                <span className="ml-1 whitespace-nowrap text-xs font-semibold text-state-success-ink">
                  · đã nhận {vnd(daRotTheoDot.get(i.soDot) ?? 0)}
                </span>
              )}
            </span>
            {i.status === "PAID" ? (
              // PA-A: PAID = Sale đã thu; chỉ ghi "KT đã xác nhận" khi đơn không còn khoản
              // PENDING và kế toán đã ✓ (mapping đợt↔khoản là mức ĐƠN, không per-đợt).
              accounting.pending === 0 && accounting.confirmed > 0 ? (
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-state-success-ink">
                  <BadgeCheck className="h-4 w-4" aria-hidden /> Sale đã thu · KT đã xác nhận
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-state-warning-ink">
                  <BadgeCheck className="h-4 w-4" aria-hidden /> Sale đã thu — chờ kế toán
                </span>
              )
            ) : canManage ? (
              <button
                onClick={() => markPaid(i.id)}
                disabled={pending}
                className="rounded bg-state-success-ink px-2 py-0.5 text-xs font-semibold text-white transition-opacity duration-150 disabled:opacity-50"
              >
                Đánh dấu đã đóng
              </button>
            ) : (
              <span className="whitespace-nowrap text-xs text-state-warning-ink">Chờ đóng</span>
            )}
          </div>
        ))}
        {installments.length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa thiết lập kế hoạch.</p>
        )}

        {/* PA-A — trạng thái sổ kế toán (read-only): nguồn sự thật tiền là /payments. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-dashed border-border px-3 py-2 text-xs">
          <span className="font-semibold uppercase tracking-wider text-muted-foreground">
            Sổ kế toán
          </span>
          {accounting.confirmed === 0 && accounting.pending === 0 ? (
            <span className="text-muted-foreground">Chưa có khoản thu nào được ghi nhận.</span>
          ) : (
            <>
              <span className="whitespace-nowrap font-semibold text-state-success-ink">
                Đã xác nhận: {vnd(accounting.confirmed)}
              </span>
              <span
                className={`whitespace-nowrap ${
                  accounting.pending > 0
                    ? "font-semibold text-state-warning-ink"
                    : "text-muted-foreground"
                }`}
              >
                Chờ xác nhận: {vnd(accounting.pending)}
              </span>
            </>
          )}
          <a href="/payments" className="ml-auto font-semibold text-primary underline">
            Mở sổ Khoản thu →
          </a>
        </div>
      </div>

      {/* ── THU GỌN KHỐI SỬA [15/09/2026] ───────────────────────────────────────
          Chủ dự án: *"thu gọn lại và có nút sửa nếu có nhu cầu sửa"*. Từ đợt này kế
          hoạch được lập NGAY ở trang tạo đơn, nên trên trang đơn nó gần như luôn chỉ
          để ĐỌC — bày cả form nhập ra mặc định là mời người ta sửa một thứ đang đúng.

          Nút nói rõ trạng thái hai chiều, KHÔNG dùng một mũi tên trơ: người bán phải
          biết bấm vào sẽ được gì (luật 12). */}
      {canManage && !moSua && (
        <button
          type="button"
          onClick={() => setMoSua(true)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted"
        >
          <CalendarClock className="h-4 w-4" aria-hidden />
          {installments.length === 0 ? "Thiết lập kế hoạch" : "Sửa kế hoạch thanh toán"}
        </button>
      )}

      {canManage && moSua && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          {installments.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sửa kế hoạch
              </span>
              <button
                type="button"
                onClick={() => setMoSua(false)}
                className="text-xs font-medium text-muted-foreground underline hover:text-foreground"
              >
                Thu gọn
              </button>
            </div>
          )}

          {/* Đã có đợt thu tiền ⇒ nói NGAY, trước khi người bán gõ vào ô nào. */}
          {demHangKhoa > 0 && (
            <p className="rounded-md bg-state-info-soft px-2.5 py-1.5 text-xs text-state-info-ink">
              {demHangKhoa === 1 ? "Đợt đầu" : `${demHangKhoa} đợt đầu`} đã nhận tiền nên
              số tiền của các đợt đó KHOÁ lại. Chia lại số đợt chỉ phân bổ phần CÒN THIẾU
              cho các đợt sau.
            </p>
          )}
          {/* ── TIỀN CỌC ──────────────────────────────────────────────────────
              Cọc là phần ĐẦU của học phí, đóng sớm — KHÔNG phải khoản thu thêm.
              Nó thành một phiếu riêng đứng đầu (có QR để khách quét trả trước), và
              số tiền đó được TRỪ DẦN từ đợt 1. Tổng vẫn đúng bằng học phí. */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background p-2.5">
            <label className="flex items-center gap-2 whitespace-nowrap text-sm">
              <input
                type="checkbox"
                checked={coCoc}
                onChange={(e) => {
                  const bat = e.target.checked;
                  setCoCoc(bat);
                  if (!bat) {
                    setTienCoc(0);
                    chonSoDot(soDotHocPhi, 0);
                  }
                }}
                className="h-4 w-4"
              />
              <span className="font-medium">Thu cọc trước</span>
            </label>

            {coCoc && (
              <>
                <label className="flex items-center gap-1.5 text-sm">
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    Số tiền cọc (đ)
                  </span>
                  <MoneyInput
                    name="tien-coc"
                    min={0}
                    max={totalAmount}
                    value={tienCoc}
                    onValueChange={(v) => {
                      const c = Math.min(totalAmount, Math.max(0, v ?? 0));
                      setTienCoc(c);
                      chonSoDot(soDotHocPhi, c);
                    }}
                    suffix={null}
                    className="w-40 rounded-md px-2 py-1.5"
                  />
                </label>
                <HelpHint>
                  Cọc sinh một phiếu thu riêng kèm QR để khách quét trả trước. Số đã cọc
                  được trừ vào đợt 1; cọc lớn hơn đợt 1 thì trừ tiếp sang đợt sau. Tổng
                  các phiếu vẫn đúng bằng học phí — cọc KHÔNG cộng thêm.
                </HelpHint>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Chia thành</span>
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => chonSoDot(n)}
                aria-pressed={soDotHocPhi === n}
                className={`min-h-9 whitespace-nowrap rounded-md border px-3 text-sm font-semibold transition-colors duration-150 ${
                  soDotHocPhi === n
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-background text-foreground hover:bg-muted"
                }`}
              >
                {n === 1 ? "1 lần" : `${n} học phần`}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              hoặc
              <input
                type="number"
                min={1}
                max={TRAN_SO_DOT}
                value={soDotHocPhi}
                onChange={(e) => {
                  const n = Math.min(TRAN_SO_DOT, Math.max(1, Number(e.target.value) || 1));
                  chonSoDot(n);
                }}
                aria-label="Số đợt tuỳ chọn"
                className="w-16 rounded-md border border-border px-2 py-1.5 text-sm tabular-nums"
              />
              đợt
            </label>
          </div>

          <div className="space-y-2">
            {dots.map((d, i) => (
              <div
                key={i}
                className="grid grid-cols-2 items-end gap-2 rounded-lg border border-border bg-background p-2 sm:grid-cols-[auto_1fr_1fr_auto]"
              >
                <span
                  className={`self-center whitespace-nowrap text-xs font-semibold ${
                    d.laCoc ? "text-accent-ink" : "text-muted-foreground"
                  }`}
                >
                  {d.laCoc ? "Cọc" : `Đợt ${i + (dots[0]?.laCoc ? 0 : 1)}`}
                </span>
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground">
                    {hangBiKhoa(i) ? "Số tiền — đã thu, không sửa" : "Số tiền (đ)"}
                  </span>
                  {/* ── KHOÁ ĐỢT ĐÃ THU (A6) ────────────────────────────────────
                      Server đã TỪ CHỐI lượt lưu đổi số của đợt đã có tiền
                      (`doiTienDotDaThu`). Khoá ở đây để người bán KHÔNG gõ vào một ô
                      rồi mới bị từ chối — một ô gõ được mà lưu không được là một ô
                      nói dối (luật 12). */}
                  <MoneyInput
                    name={`dot-${i}-amount`}
                    min={0}
                    value={d.amount}
                    disabled={hangBiKhoa(i)}
                    onValueChange={(v) => suaDot(i, { amount: Math.max(0, v ?? 0) })}
                    suffix={null}
                    className="mt-0.5 rounded-md px-2 py-1.5"
                  />
                  {hangBiKhoa(i) && (
                    <span className="mt-0.5 block text-xs text-state-success-ink">
                      Đã nhận {vnd(tienDaRot(i))}
                    </span>
                  )}
                </label>
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground">
                    {d.daThu ? "Đã thu — không cần hạn" : "Hẹn đóng"}
                  </span>
                  <input
                    type="date"
                    value={d.dueDate}
                    onChange={(e) => suaDot(i, { dueDate: e.target.value })}
                    disabled={d.daThu}
                    className="mt-0.5 w-full rounded-md border border-border px-2 py-1.5 text-sm disabled:bg-muted"
                  />
                </label>
                <label className="flex items-center gap-1.5 self-center whitespace-nowrap text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={d.daThu}
                    onChange={(e) => suaDot(i, { daThu: e.target.checked })}
                    className="h-4 w-4"
                  />
                  đã thu
                </label>
              </div>
            ))}
          </div>

          {/* Tổng phải khớp — nói ra NGAY khi gõ, không đợi bấm Lưu rồi nhận toast. */}
          <div
            className={`flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-xs ${
              lech === 0
                ? "bg-muted text-muted-foreground"
                : "bg-state-danger-soft text-state-danger-ink"
            }`}
          >
            <span className="whitespace-nowrap font-semibold tabular-nums">
              Tổng {dots[0]?.laCoc ? "cọc + " : ""}{soDotHocPhi} đợt: {vnd(tongCacDot)} / {vnd(totalAmount)}
            </span>
            {lech !== 0 && (
              <span className="whitespace-nowrap font-semibold tabular-nums">
                {lech > 0 ? "Thừa" : "Thiếu"} {vnd(Math.abs(lech))}
              </span>
            )}
          </div>

          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">
              Nhắc công nợ trước (ngày){" "}
              <HelpHint>
                Áp cho MỌI đợt chưa thu. Cron nhắc nợ nay quét mọi đợt chưa thu — trước đây
                nó lọc cứng đợt 2, nên kế hoạch 3-4 đợt thì đợt 3 và 4 không bao giờ được
                nhắc.
              </HelpHint>
            </span>
            <input
              type="number"
              min={0}
              value={dots.find((d) => !d.daThu)?.reminderDays ?? 14}
              onChange={(e) => {
                const v = Math.max(0, Number(e.target.value) || 0);
                setDots((cu) => cu.map((d) => (d.daThu ? d : { ...d, reminderDays: v })));
              }}
              className="mt-0.5 w-full rounded-md border border-border px-2 py-1.5 text-sm tabular-nums"
            />
          </label>

          {/* Nút Lưu bị khoá thì PHẢI nói vì sao (luật 12 — affordance phải nói thật).
              Từ 14/09 mặc định của form không còn tự nhận "đã thu cả đơn", nên đơn chưa
              thu đồng nào mở lên là nút khoá NGAY từ đầu; trước đây `thieuHan` hầu như
              không bao giờ xảy ra lúc vừa mở nên không ai thấy khoảng lặng này. Toast
              trong `save()` không cứu được: nút disabled thì `onClick` không chạy. */}
          {thieuHan >= 0 && (
            <p className="rounded-md bg-state-warning-soft px-3 py-2 text-xs font-semibold text-state-warning-ink">
              Đợt {thieuHan + 1} chưa thu — chọn ngày hẹn đóng để lưu được kế hoạch. Nếu
              khách đã đóng rồi thì tích ô &quot;đã thu&quot; của đợt đó.
            </p>
          )}

          <button
            onClick={save}
            disabled={pending || lech !== 0 || thieuHan >= 0}
            className="min-h-11 w-full rounded-md bg-primary-dark px-3 py-2 text-sm font-semibold text-white transition-opacity duration-150 disabled:opacity-50"
          >
            {pending
              ? "Đang lưu…"
              : `Lưu kế hoạch ${dots[0]?.laCoc ? "cọc + " : ""}${soDotHocPhi} đợt`}
          </button>
        </div>
      )}
    </section>
  );
}


// "Thanh toán & QR" — QR chuyển khoản VietQR (đặt gần cuối trang, ngay trước nút đổi trạng thái).
export function OrderQrSection({
  qrUrl,
  transferContent,
  dueNow,
}: {
  /**
   * URL ảnh QR, hoặc null khi KHÔNG có mã để đưa. Từ 20/08 có HAI lý do null:
   *  1. cơ sở chưa cấu hình tài khoản nhận tiền (lý do cũ);
   *  2. người xem thiếu `orders:view-pii` — nội dung CK trên mã chứa SĐT phụ huynh
   *     nên server cố tình không dựng URL ([id]/page.tsx).
   * Ô trống bên dưới vì thế nói CẢ HAI lý do: prop không mang theo lý do cụ thể, mà
   * thêm prop thì phải sửa `order-detail-client.tsx` (ngoài phạm vi đợt vá này).
   */
  qrUrl: string | null;
  transferContent: string;
  /** Số tiền QR đang in + nhãn ("Đợt 1" / "Toàn bộ đơn" / "Còn thiếu"). */
  dueNow: { amount: number; label: string };
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
        <QrCode className="h-4 w-4 text-primary" /> Thanh toán & QR
      </h2>
      {/* `max-w-sm` cũ ép ảnh QR + toàn bộ chữ vào một cột 24rem, nên trong cột trái
          rộng ~44rem của bản dựng lại thì hơn nửa khối là khoảng trắng. Từ `sm` trở lên
          xếp NGANG: ảnh trái, số tiền + nội dung CK phải — và chữ căn trái, dễ đọc hơn
          căn giữa. Dưới `sm` giữ nguyên một cột căn giữa. */}
      <div>
        {qrUrl ? (
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-5">
            {/* Ảnh QR public từ img.vietqr.io — không cần API key. Bấm để phóng to. */}
            <QrZoom
              src={qrUrl}
              alt="VietQR thanh toán"
              title={`${dueNow.label}: ${dueNow.amount.toLocaleString("vi-VN")}đ`}
              transferContent={transferContent}
              className="h-56 w-56"
            />
            {/* Nói rõ QR đang thu bao nhiêu — khách đóng 2 đợt dễ tưởng phải
                chuyển cả tổng đơn. Nội dung CK bên dưới là dạng người đọc
                (`HoTenCon_SdtPH_TenKhoa`, chốt 20/08), sale đọc thẳng cho khách. */}
            <div className="min-w-0 space-y-2 text-center sm:text-left">
              <p className="text-sm font-semibold text-foreground">
                {dueNow.label}:{" "}
                <span className="tabular-nums">
                  {dueNow.amount.toLocaleString("vi-VN")}đ
                </span>
              </p>
              <div className="text-xs text-muted-foreground">
                Nội dung CK:{" "}
                <span className="break-all font-mono font-semibold text-foreground">
                  {transferContent}
                </span>
              </div>
              <p className="max-w-prose text-xs text-muted-foreground">
                Chuyển đúng số tiền + giữ nguyên nội dung → hệ thống tự xác nhận đơn.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted p-4 text-center">
            <QrCode className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Chưa có mã QR để hiển thị.</p>
            <p className="text-xs text-muted-foreground">
              Cơ sở chưa cấu hình tài khoản nhận tiền — hoặc tài khoản của bạn không có
              quyền xem thông tin liên hệ, mà nội dung chuyển khoản trên mã QR có SĐT
              phụ huynh nên mã bị ẩn.
            </p>
            <a href="/tich-hop" className="text-xs font-semibold text-primary underline">
              Cấu hình VietQR trong Tích hợp →
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
