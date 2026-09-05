"use client";

/**
 * Site Sale — biểu mẫu "Bàn giao lead".
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/ban-giao-lead/_components/handover-form.tsx` ──
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * ⚠️ CHỈ NHÂN BẢN LỚP VỎ. Việc bàn giao vẫn gọi ĐÚNG hai Server Action của khu
 *    quản trị (`previewHandoverAction` / `runHandoverAction`) — nơi có
 *    `checkPermission("leads:assign")`, cách ly cơ sở theo
 *    `getModelVisibleCenterIds("Lead", actor)`, và ghi nhật ký kiểm toán. Nhân
 *    bản LOGIC bàn giao là cách chắc chắn nhất để hai khu chuyển lead theo hai
 *    luật khác nhau; nhân bản CÁI FORM thì tệ nhất chỉ là hai cái form trông
 *    khác nhau.
 *
 * GIỮ NGUYÊN 100%: sáu điều khiển, đúng thứ tự, đúng câu chữ — kể cả
 * "Chỉ lead chưa đóng (bỏ &quot;Đã mất&quot;)", câu gợi ý trong ô lý do, hai
 * nhãn nút, và câu "→ N lead khớp điều kiện".
 *
 * ── ĐỔI CÁCH BÀY, KHÔNG ĐỔI HÀNH VI ─────────────────────────────────────────
 * 1. `<select>` GỐC của trình duyệt → `<Select>` của kho. Lý do đã ghi ở
 *    `khach-cua-toi/_components/filters.tsx`: ô nhập bo góc theo tông kho đứng
 *    cạnh select do hệ điều hành vẽ là dấu hiệu rõ nhất của giao diện chắp vá.
 * 2. Lưới `sm:grid-cols-2` phẳng → BA nhóm có nhãn ("Chuyển từ ai sang ai" ·
 *    "Thu hẹp phạm vi" · "Ghi lại lý do"). Bản admin xếp sáu điều khiển cạnh
 *    nhau không phân nhóm, nên ô "Lý do bàn giao" — thứ đi vào nhật ký kiểm
 *    toán vĩnh viễn — trông ngang hàng với một ô lọc.
 * 3. Hai nút rời khỏi lưới, xuống một dải chân dính đáy khung. Bản admin để
 *    "Xem trước" (`bg-neutral-800`) và "Thực hiện" (`bg-primary-dark`) trên cùng
 *    một hàng với hai màu đặc — hai nút đặc cạnh nhau thì không nút nào là
 *    chính. Nay: xem trước = nút viền, thực hiện = nút đặc.
 *
 * ⚠️ VẪN LÀ "XEM TRƯỚC RỒI MỚI CHẠY ĐƯỢC" — nút thực hiện khoá cho tới khi có
 *    số lead khớp, và mọi thay đổi điều kiện đều xoá số đó đi. Đây là chốt an
 *    toàn của bản admin: nó chặn cú bấm bàn giao nhầm cả sổ khách. Giữ nguyên.
 *
 * ⚠️ MÀU: tím ở đây chỉ mang nghĩa "nút hành động" và "chip đang chọn". KHÔNG
 *    trạng thái lead nào được tô màu ngữ nghĩa trong hàng chip — chúng là điều
 *    kiện lọc, không phải tình trạng cần động tay (`lib/sale/trang-thai-khach.ts`).
 */
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import type { LeadStatus } from "@prisma/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LEAD_STATUS_LABEL } from "@/lib/leads/status";
import {
  previewHandoverAction,
  runHandoverAction,
} from "@/app/(admin)/admin/ban-giao-lead/_actions";
import type { MucSale } from "@/lib/sale/ban-giao-lead";

/**
 * Giá trị ảo cho mục "mọi chiến dịch". Chuỗi rỗng KHÔNG dùng được làm `value`
 * của `<SelectItem>` — nó là giá trị "chưa chọn gì" của chính điều khiển.
 */
const MOI_CHIEN_DICH = "__moi_chien_dich__";

/** Một bộ lớp vỏ cho mọi điều khiển — cùng chiều cao, bo góc, vòng focus. */
const LOP_DIEU_KHIEN = "h-9 rounded-lg bg-card text-sm";

function NhanNhom({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
      {children}
    </h2>
  );
}

export function FormBanGiaoLead({
  sale,
  trangThai,
  chienDich,
}: {
  sale: MucSale[];
  /**
   * `LeadStatus[]` chứ KHÔNG phải `string[]`: kiểu string làm mảng trạng thái
   * mất hoàn toàn kiểm kiểu (đó là lý do đợt đổi enum GĐ5 đi lọt) và làm tra
   * `LEAD_STATUS_LABEL` phải ép kiểu.
   */
  trangThai: LeadStatus[];
  chienDich: string[];
}) {
  const [tuAi, setTuAi] = useState("");
  const [sangAi, setSangAi] = useState("");
  const [chonTrangThai, setChonTrangThai] = useState<LeadStatus[]>([]);
  const [chonChienDich, setChonChienDich] = useState(MOI_CHIEN_DICH);
  const [chuaDong, setChuaDong] = useState(true);
  const [lyDo, setLyDo] = useState("");
  const [soLead, setSoLead] = useState<number | null>(null);
  const [pending, start] = useTransition();

  /**
   * Mọi thay đổi điều kiện phải XOÁ số xem trước. Giữ lại số cũ là mời người
   * dùng bấm "Thực hiện" trên một con số đã hết đúng — chốt an toàn của bản
   * admin nằm ở đúng chỗ này.
   */
  const quenSoDaXem = () => setSoLead(null);

  function batTatTrangThai(s: LeadStatus) {
    quenSoDaXem();
    setChonTrangThai((truoc) =>
      truoc.includes(s) ? truoc.filter((x) => x !== s) : [...truoc, s],
    );
  }

  /** Bộ điều kiện gửi lên máy chủ — dựng MỘT chỗ để hai nút không lệch nhau. */
  const dieuKien = () => ({
    statuses: chonTrangThai,
    campaign: chonChienDich === MOI_CHIEN_DICH ? "" : chonChienDich,
    onlyActive: chuaDong,
  });

  function xemTruoc() {
    if (!tuAi) {
      toast.error("Chọn sale bàn giao");
      return;
    }
    start(async () => {
      const res = await previewHandoverAction({ fromUserId: tuAi, ...dieuKien() });
      if (res.ok) setSoLead(res.count ?? 0);
      else toast.error(res.error ?? "Lỗi");
    });
  }

  function thucHien() {
    if (!tuAi || !sangAi) {
      toast.error("Chọn sale bàn giao và sale nhận");
      return;
    }
    start(async () => {
      const res = await runHandoverAction({
        fromUserId: tuAi,
        toUserId: sangAi,
        ...dieuKien(),
        reason: lyDo,
      });
      if (res.ok) {
        toast.success(`Đã chuyển ${res.moved} lead, ${res.tasksMoved} task`);
        setSoLead(null);
        setLyDo("");
      } else {
        toast.error(res.error ?? "Lỗi");
      }
    });
  }

  const tenSale = (id: string) => sale.find((s) => s.id === id)?.label ?? "— Chọn —";

  return (
    <>
      <div className="space-y-6 px-5 py-5">
        {/* ── Nhóm 1: ai sang ai ─────────────────────────────────────────── */}
        <section className="space-y-2">
          <NhanNhom>Chuyển từ ai sang ai</NhanNhom>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-sm">
              <span className="mb-1 block text-muted-foreground">
                Sale bàn giao (nguồn)
              </span>
              <Select
                value={tuAi}
                onValueChange={(v) => {
                  if (v !== null) setTuAi(String(v));
                  quenSoDaXem();
                }}
              >
                <SelectTrigger
                  aria-label="Sale bàn giao (nguồn)"
                  className={cn(LOP_DIEU_KHIEN, "w-full")}
                  disabled={pending}
                >
                  <SelectValue>
                    {(v: string | null) => (v ? tenSale(String(v)) : "— Chọn —")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-80 min-w-[16rem]">
                  {sale.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            {/* Mũi tên là thứ nói "nguồn → đích" nhanh hơn hai chữ trong ngoặc.
                Ẩn trên màn hẹp: ở đó hai ô xếp dọc nên mũi tên ngang là sai
                hướng, mà xoay nó xuống thì chiếm một hàng chỉ để trang trí. */}
            <ArrowRight
              aria-hidden="true"
              className="hidden size-4 shrink-0 self-center text-muted-foreground sm:mb-2.5 sm:block sm:self-end"
            />

            <label className="min-w-0 flex-1 text-sm">
              <span className="mb-1 block text-muted-foreground">
                Sale nhận (đích)
              </span>
              <Select
                value={sangAi}
                onValueChange={(v) => {
                  if (v !== null) setSangAi(String(v));
                }}
              >
                <SelectTrigger
                  aria-label="Sale nhận (đích)"
                  className={cn(LOP_DIEU_KHIEN, "w-full")}
                  disabled={pending}
                >
                  <SelectValue>
                    {(v: string | null) => (v ? tenSale(String(v)) : "— Chọn —")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-80 min-w-[16rem]">
                  {sale.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
        </section>

        {/* ── Nhóm 2: thu hẹp phạm vi ────────────────────────────────────── */}
        <section className="space-y-2">
          <NhanNhom>Thu hẹp phạm vi</NhanNhom>

          <div className="text-sm">
            <span className="mb-1.5 block text-muted-foreground">
              Lọc trạng thái (để trống = tất cả)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {trangThai.map((s) => {
                const dangChon = chonTrangThai.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={dangChon}
                    onClick={() => batTatTrangThai(s)}
                    disabled={pending}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium",
                      "transition-colors disabled:opacity-50",
                      "focus-visible:outline-none focus-visible:ring-2",
                      "focus-visible:ring-[color:var(--primary)]/35",
                      dangChon
                        ? "border-[color:var(--primary)] bg-[color:var(--primary-soft)] text-[color:var(--primary-ink)]"
                        : "border-border text-muted-foreground hover:bg-[color:var(--surface-chim)] hover:text-foreground",
                    )}
                  >
                    {/* Nhãn tiếng Việt — bản admin từng in thẳng mã enum
                        ("DA_HEN_HOC_THU") ra cho người dùng. `s` vẫn là giá trị
                        gửi lên máy chủ, chỉ đổi phần hiển thị. */}
                    {LEAD_STATUS_LABEL[s]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-sm sm:max-w-sm">
              <span className="mb-1 block text-muted-foreground">
                Chiến dịch (utmCampaign)
              </span>
              <Select
                value={chonChienDich}
                onValueChange={(v) => {
                  if (v !== null) setChonChienDich(String(v));
                  quenSoDaXem();
                }}
              >
                <SelectTrigger
                  aria-label="Chiến dịch (utmCampaign)"
                  className={cn(LOP_DIEU_KHIEN, "w-full")}
                  disabled={pending}
                >
                  <SelectValue>
                    {(v: string | null) =>
                      v && v !== MOI_CHIEN_DICH ? String(v) : "— Mọi chiến dịch —"
                    }
                  </SelectValue>
                </SelectTrigger>
                {/* 100 chiến dịch là trần truy vấn — danh sách PHẢI tự cuộn. */}
                <SelectContent className="max-h-80 min-w-[18rem]">
                  <SelectItem value={MOI_CHIEN_DICH}>— Mọi chiến dịch —</SelectItem>
                  {chienDich.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="inline-flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={chuaDong}
                onChange={(e) => {
                  setChuaDong(e.target.checked);
                  quenSoDaXem();
                }}
                disabled={pending}
                className="size-4 shrink-0 rounded border-border accent-[color:var(--primary)]"
              />
              {/* Nhãn phải khớp LEAD_CLOSED_STATUSES ở lib/leads/status.ts — GĐ5
                  gộp LOST/DUPLICATE thành "Đã mất", và DA_DANG_KY CỐ Ý không nằm
                  trong tập đóng. */}
              <span className="text-muted-foreground">
                Chỉ lead chưa đóng (bỏ &quot;Đã mất&quot;)
              </span>
            </label>
          </div>
        </section>

        {/* ── Nhóm 3: lý do ─────────────────────────────────────────────── */}
        <section className="space-y-2">
          <NhanNhom>Ghi lại lý do</NhanNhom>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Lý do bàn giao</span>
            <textarea
              value={lyDo}
              onChange={(e) => setLyDo(e.target.value)}
              rows={2}
              disabled={pending}
              placeholder="VD: Sale Nguyễn Văn A nghỉ việc 06/2026"
              className={cn(
                "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm",
                "placeholder:text-muted-foreground",
                "focus-visible:border-[color:var(--primary)] focus-visible:outline-none",
                "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/25",
              )}
            />
          </label>
        </section>
      </div>

      {/* ── Dải chân: xem trước → số lead → thực hiện ────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border bg-[color:var(--surface-chim)] px-5 py-3">
        <button
          type="button"
          onClick={xemTruoc}
          disabled={pending}
          className={cn(
            "h-9 shrink-0 rounded-lg border border-border bg-card px-4",
            "text-sm font-medium text-foreground transition-colors",
            "hover:bg-[color:var(--surface-chim)] disabled:opacity-50",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-[color:var(--primary)]/35",
          )}
        >
          Xem trước số lead
        </button>

        {soLead !== null ? (
          <span role="status" className="text-sm text-muted-foreground">
            → <span className="font-semibold tabular-nums text-foreground">{soLead}</span>{" "}
            lead khớp điều kiện
          </span>
        ) : null}

        <button
          type="button"
          onClick={thucHien}
          disabled={pending || soLead === null || soLead === 0}
          className={cn(
            "ml-auto h-9 shrink-0 rounded-lg px-4 text-sm font-semibold transition-colors",
            "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
            "hover:bg-[color:var(--primary-dark)] disabled:opacity-50",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
          )}
        >
          Thực hiện bàn giao
        </button>
      </div>
    </>
  );
}
