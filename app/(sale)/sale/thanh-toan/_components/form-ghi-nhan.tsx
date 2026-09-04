"use client";

/**
 * Site Sale — form "Ghi nhận khoản thu".
 *
 * ── BẢN ĐÔI CỦA `RecordForm` trong
 *    `app/(admin)/admin/payments/_components/payments-client.tsx` ────────────
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * ⚠️ CHỈ NHÂN BẢN LỚP VỎ. Bút toán vẫn do ĐÚNG một Server Action
 *    `recordPaymentAction` của khu quản trị sinh ra — nơi có `requireRecord()`,
 *    `recordSchema`, chống IDOR liên cơ sở (`passesScope("Order", …)`), suy
 *    `centerId` từ đơn, và đẩy lead sang REGISTERED trong cùng transaction.
 *    KHÔNG có một phép tính tiền nào ở tệp này: `Number(amount)` là đúng thứ bản
 *    admin gửi đi, không hơn.
 *
 * GIỮ NGUYÊN 100%: bảy ô theo đúng thứ tự (Đơn hàng · Số tiền · Phương thức ·
 * Ngày thu · Enrollment ID · Link chứng từ · Ghi chú), từng câu trong các dấu
 * "?", nhãn nút, và hai câu toast ("Chọn đơn hàng", "Đã ghi nhận khoản thu").
 *
 * ── KHÁC BẢN ADMIN MỘT CHỖ, CÓ CHỦ ĐÍCH ────────────────────────────────────
 * Thêm `router.refresh()` sau khi ghi nhận xong. `recordPaymentAction` gọi
 * `revalidatePath("/payments")` — đường của KHU QUẢN TRỊ, không phủ
 * `/sale/thanh-toan`. Thiếu dòng này thì khoản vừa ghi không xuất hiện cho tới
 * khi người dùng bấm F5, và họ sẽ ghi lại lần nữa.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HelpHint } from "@/components/admin/ui/help-hint";
import { cn } from "@/lib/utils";
import { recordPaymentAction } from "@/app/(admin)/admin/payments/_actions";
import { formatVndPlain } from "@/lib/format/money";
import { MUC_PHUONG_THUC } from "@/lib/sale/trang-thai-thanh-toan";

export type MucDonHang = {
  id: string;
  code: string;
  customerName: string;
  totalAmount: number;
};

const LOP_DIEU_KHIEN = "h-9 rounded-lg bg-card text-sm";

export function FormGhiNhanKhoan({
  donHang,
  khiXong,
}: {
  donHang: MucDonHang[];
  khiXong: () => void;
}) {
  const router = useRouter();
  const [orderId, setOrderId] = useState("");
  const [enrollmentId, setEnrollmentId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  function gui() {
    if (!orderId) {
      toast.error("Chọn đơn hàng");
      return;
    }
    start(async () => {
      const res = await recordPaymentAction({
        orderId,
        enrollmentId: enrollmentId || null,
        amount: Number(amount),
        method,
        paidDate,
        evidenceUrl: evidenceUrl || null,
        note: note || null,
      });
      if (res.ok) {
        toast.success("Đã ghi nhận khoản thu");
        khiXong();
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi");
      }
    });
  }

  const nhanDon = (id: string) => {
    const d = donHang.find((o) => o.id === id);
    return d ? `${d.code} — ${d.customerName} (${formatVndPlain(d.totalAmount)})` : "Chọn đơn hàng";
  };

  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Ghi nhận khoản thu</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>
            Đơn hàng *
            <HelpHint>
              Khoản thu này trừ vào công nợ của đơn được chọn, nên chọn sai đơn là sai
              công nợ của phụ huynh khác. Không thấy đơn cần tìm thì kiểm tra lại đơn đã
              được tạo chưa.
            </HelpHint>
          </Label>
          <Select value={orderId} onValueChange={(v) => setOrderId(v === null ? "" : String(v))}>
            <SelectTrigger className={cn(LOP_DIEU_KHIEN, "w-full")}>
              <SelectValue>
                {(v: string | null) => (v ? nhanDon(String(v)) : "Chọn đơn hàng")}
              </SelectValue>
            </SelectTrigger>
            {/* 100 đơn là trần truy vấn (`loadOrderOptions`) — danh sách PHẢI tự
                cuộn, không đẩy dài trang. */}
            <SelectContent className="max-h-80">
              {donHang.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.code} — {o.customerName} ({formatVndPlain(o.totalAmount)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>
            Số tiền *
            <HelpHint>
              Số tiền THẬT nhận được trong lần thu này, không phải tổng đơn. Phụ huynh
              đóng làm nhiều lần thì ghi nhận nhiều khoản, mỗi lần một khoản.
            </HelpHint>
          </Label>
          {/* Ô tiền: gõ 10000000 → hiện 10.000.000. Giữ state dạng CHUỖI (ô trống
              = "") để `Number(amount)` lúc gửi ra đúng con số như bản admin. */}
          <MoneyInput
            name="amount"
            min={0}
            value={amount}
            onValueChange={(v) => setAmount(v === null ? "" : String(v))}
            placeholder="0"
          />
        </div>

        <div className="space-y-1.5">
          <Label>
            Phương thức *
            <HelpHint>
              Tiền đi bằng đường nào: tiền mặt tại quầy, chuyển khoản, hay qua cổng
              thanh toán. Kế toán đối chiếu khoản này với đúng sổ đó (két hoặc sao kê
              ngân hàng), nên chọn sai là khoản treo không tìm ra tiền.
            </HelpHint>
          </Label>
          <Select
            value={method}
            onValueChange={(v) => setMethod(v === null ? "CASH" : String(v))}
          >
            <SelectTrigger className={cn(LOP_DIEU_KHIEN, "w-full")}>
              <SelectValue>
                {(v: string | null) =>
                  MUC_PHUONG_THUC.find((m) => m.value === v)?.label ?? MUC_PHUONG_THUC[0].label
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {MUC_PHUONG_THUC.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>
            Ngày thu *
            <HelpHint>
              Ngày tiền thực sự về theo biên lai / sao kê ngân hàng, không phải ngày bạn
              ngồi nhập vào phần mềm.
            </HelpHint>
          </Label>
          <Input
            type="date"
            value={paidDate}
            onChange={(e) => setPaidDate(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>
            Enrollment ID (tuỳ chọn)
            <HelpHint>
              Mã ghi danh để gắn khoản thu vào đúng học viên trong lớp. Bỏ trống được,
              nhưng khoản chưa gắn ghi danh sẽ nằm ở &ldquo;Chờ convert&rdquo; và kế toán
              chưa xác nhận được.
            </HelpHint>
          </Label>
          <Input
            value={enrollmentId}
            onChange={(e) => setEnrollmentId(e.target.value)}
            placeholder="—"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>
            Link chứng từ (tuỳ chọn)
            <HelpHint>
              Đường dẫn tới ảnh biên lai / màn hình chuyển khoản đã lưu ở nơi khác. Có
              chứng từ thì kế toán đối chiếu và xác nhận nhanh hơn nhiều.
            </HelpHint>
          </Label>
          <Input
            value={evidenceUrl}
            onChange={(e) => setEvidenceUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>Ghi chú</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </div>

        <div className="sm:col-span-2">
          <button
            type="button"
            onClick={gui}
            disabled={pending}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors",
              "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
              "hover:bg-[color:var(--primary-dark)] disabled:opacity-50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
            )}
          >
            {pending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            Ghi nhận
          </button>
        </div>
      </div>
    </div>
  );
}
