"use client";

/**
 * Site Sale — BÀN CỜ KANBAN của màn "Leads" (`/sale/leads?view=kanban`).
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/leads/_components/leads-kanban.tsx` ──────
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * GIỮ NGUYÊN 100%:
 *   · Đủ 10 cột `KANBAN_COLUMNS`, đúng thứ tự phễu, đúng nhãn, có số đếm.
 *   · Nội dung thẻ: tên PH · SĐT bấm gọi được · "Khoá: …" · "Nguồn: …" ·
 *     "Sale: … / Chưa phân công" + nút "Phân công" · ngày tạo ·
 *     "Đã học thử · dd/mm" · "Quá hạn" · "Dùng chung" · "Xem chi tiết lead".
 *   · Kéo thả đổi bậc; ô chọn dự phòng trên màn hẹp (kéo-thả HTML5 không chạy
 *     trên cảm ứng).
 *   · Thả vào cột "Đã đăng ký" khi CÓ quyền chốt deal = đi tới màn chuyển đổi,
 *     KHÔNG phải đổi trạng thái tại chỗ (cổng kiểm tiền nằm ở màn đó).
 *   · Bậc rơi vẫn hỏi lý do TRƯỚC khi cập nhật lạc quan.
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. BỎ dải màu `LEAD_STATUS_ACCENT` trên đầu mỗi cột (mười màu Tailwind rời:
 *    `border-sky-400`, `border-emerald-500`…). Mười cột mười màu là tô màu CẢ MỘT
 *    TRỤC — đúng lỗi đã phải sửa hai lần ở `khach-cua-toi/_components/lead-table.tsx`:
 *    cột nào cũng kêu thì không cột nào nổi lên. Vị trí của thẻ ĐÃ nói nó đang ở
 *    bậc nào; màu không cần lặp lại.
 * 2. Màu chỉ còn ở hai chỗ THẬT SỰ đòi hành động: "Quá hạn" (danger) và
 *    "Chưa phân công" (warning) — đúng hai chỗ bản admin cũng tô.
 * 3. Nền cột dùng `--surface-chim` (tầng "khung máy") để thẻ nổi lên trên, thay
 *    vì `bg-muted` trôi cùng mặt phẳng với thẻ.
 *
 * ⚠️ Mọi giá trị đã qua che PII Ở SERVER (`maskLeadPiiFields` trong
 *    `lib/sale/leads.ts`) trước khi rời máy chủ.
 */
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import type { LeadStatus } from "@prisma/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import {
  KANBAN_COLUMNS,
  LEAD_DROP_STATUSES,
  LEAD_STATUS_LABEL,
} from "@/lib/leads/status";
import type { TheLead } from "@/lib/sale/leads";
import { cn } from "@/lib/utils";
import { autoAssignLeadAction, updateLeadStatus } from "@/app/(admin)/admin/leads/actions";
import { ChipDungChung } from "./chip-dung-chung";
import { LyDoRotSale } from "./ly-do-rot";

/**
 * ⚠️ NỢ ĐÃ BIẾT — `/leads/{id}` là đường của KHU QUẢN TRỊ; trên host Sale nó bị
 * viết lại thành `/sale/leads/{id}` → 404. Lý do đầy đủ (và vì sao
 * `/sale/khach-cua-toi/{id}` KHÔNG thay thế được) ghi ở đầu `bang-leads.tsx`.
 * Giữ nguyên = không tạo hồi quy so với bản mount cũ, chứ không phải là đúng.
 */
const duongChiTiet = (id: string) => `/leads/${id}`;

function ngayNgan(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
  });
}

export function KanbanLeads({
  the: theBanDau,
  tong,
  doiTrangThaiDuoc,
  chotDuoc,
  phanCongDuoc,
  nguoiDangXemId,
}: {
  the: TheLead[];
  /** Tổng THẬT khớp với chế độ bảng — có thể lớn hơn số thẻ đang hiện. */
  tong: number;
  /** `leads:change-status` — kéo thẻ được hay không. */
  doiTrangThaiDuoc: boolean;
  /** `students:create` + `enrollments:create` — thả vào "Đã đăng ký" = đi chốt deal. */
  chotDuoc: boolean;
  /** `leads:assign` — nút "Phân công" nhanh trên thẻ chưa có người. */
  phanCongDuoc: boolean;
  nguoiDangXemId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [the, setThe] = useState<TheLead[]>(theBanDau);
  const [dangKeo, setDangKeo] = useState<string | null>(null);
  const [cotDangTro, setCotDangTro] = useState<LeadStatus | null>(null);
  /** Bậc rơi đang chờ người dùng ghi lý do. `null` = không có gì đang chờ. */
  const [choLyDo, setChoLyDo] = useState<{ leadId: string; den: LeadStatus } | null>(null);

  // Đồng bộ lại khi server trả dữ liệu mới (`router.refresh`) — `useState` chỉ
  // khởi tạo một lần nên phải kéo prop vào state, không thì phải F5 tay.
  useEffect(() => {
    setThe(theBanDau);
  }, [theBanDau]);

  /**
   * Thả vào cột "Đã đăng ký" khi CÓ quyền chốt deal = đi tới màn chuyển đổi (đa
   * con + học phí), KHÔNG đổi trạng thái tại chỗ: cổng kiểm tiền nằm ở màn đó.
   * Người KHÔNG có quyền chốt vẫn kéo đổi trạng thái như thường.
   */
  function xinChuyen(leadId: string, den: LeadStatus) {
    if (den === "DA_DANG_KY" && chotDuoc) {
      router.push(duongChiTiet(leadId));
      return;
    }
    chuyen(leadId, den);
  }

  function chuyen(leadId: string, den: LeadStatus) {
    const l = the.find((x) => x.id === leadId);
    if (!l || l.status === den) return;
    // Bậc rơi phải có lý do. Hỏi TRƯỚC khi cập nhật lạc quan — đổi chỗ thẻ rồi mới
    // hỏi thì người bấm Huỷ thấy thẻ đã nằm ở cột mới trong khi DB không đổi gì.
    if (LEAD_DROP_STATUSES.includes(den)) {
      setChoLyDo({ leadId, den });
      return;
    }
    ghi(leadId, den);
  }

  /** Phần ghi thật — dùng chung cho đường thường và đường qua hộp thoại lý do. */
  function ghi(leadId: string, den: LeadStatus, lyDo?: string) {
    const truoc = the;
    setThe((cur) => cur.map((l) => (l.id === leadId ? { ...l, status: den } : l)));
    start(async () => {
      const res = await updateLeadStatus(leadId, den, lyDo);
      if (!res.ok) {
        setThe(truoc); // trả về đúng thực tế
        toast.error(res.error ?? "Không đổi được trạng thái");
        return;
      }
      setChoLyDo(null);
      toast.success(`Đã chuyển sang "${LEAD_STATUS_LABEL[den]}"`);
      router.refresh();
    });
  }

  function phanCongNhanh(leadId: string) {
    start(async () => {
      const res = await autoAssignLeadAction(leadId);
      if (res.ok) {
        toast.success("Đã phân công lead (round-robin)");
        router.refresh();
      } else {
        toast.error(res.error ?? "Không phân công được");
      }
    });
  }

  return (
    <>
      <LyDoRotSale
        status={choLyDo?.den ?? null}
        tenLead={the.find((l) => l.id === choLyDo?.leadId)?.parentName ?? null}
        dangGui={pending}
        onHuy={() => setChoLyDo(null)}
        onXacNhan={(lyDo) => choLyDo && ghi(choLyDo.leadId, choLyDo.den, lyDo)}
      />

      <div className="overflow-x-auto px-5 py-4">
        <div className="flex min-w-max gap-3">
          {KANBAN_COLUMNS.map((cot) => {
            const trongCot = the.filter((l) => l.status === cot);
            const dangTro = cotDangTro === cot;
            return (
              <section
                key={cot}
                aria-label={LEAD_STATUS_LABEL[cot]}
                onDragOver={(e) => {
                  if (!doiTrangThaiDuoc || !dangKeo) return;
                  e.preventDefault();
                  setCotDangTro(cot);
                }}
                onDragLeave={() => setCotDangTro((c) => (c === cot ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  setCotDangTro(null);
                  if (doiTrangThaiDuoc && dangKeo) xinChuyen(dangKeo, cot);
                  setDangKeo(null);
                }}
                className={cn(
                  "flex w-72 shrink-0 flex-col rounded-xl border bg-[color:var(--surface-chim)]",
                  dangTro
                    ? "border-[color:var(--primary)] ring-2 ring-[color:var(--primary)]/25"
                    : "border-border",
                )}
              >
                <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {LEAD_STATUS_LABEL[cot]}
                  </h3>
                  <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                    {trongCot.length}
                  </span>
                </header>

                <div className="flex-1 space-y-2 p-2">
                  {trongCot.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs text-muted-foreground">Trống</p>
                  ) : null}

                  {trongCot.map((l) => (
                    <article
                      key={l.id}
                      draggable={doiTrangThaiDuoc}
                      onDragStart={() => setDangKeo(l.id)}
                      onDragEnd={() => {
                        setDangKeo(null);
                        setCotDangTro(null);
                      }}
                      className={cn(
                        "rounded-lg border border-border bg-card p-3 shadow-[var(--bong-the)] transition",
                        doiTrangThaiDuoc && "cursor-grab active:cursor-grabbing",
                        dangKeo === l.id && "opacity-50",
                        // Quá hạn: một vệt bên trái, không nhuộm cả thẻ.
                        l.overdue && "border-l-2 border-l-[color:var(--state-danger)]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={duongChiTiet(l.id)}
                          className="min-w-0 truncate font-medium text-foreground underline-offset-2 hover:text-[color:var(--primary-ink)] hover:underline"
                        >
                          {l.parentName}
                        </Link>
                        <div className="flex shrink-0 items-center gap-1">
                          <ChipDungChung
                            dangChiaSe={l.isSharedWithTeam}
                            cuaToi={l.assignedToId === nguoiDangXemId}
                          />
                          {l.overdue ? (
                            <span className="rounded-full bg-[color:var(--state-danger-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--state-danger)]">
                              Quá hạn
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <a
                        href={`tel:${l.phone}`}
                        className="mt-0.5 block text-sm tabular-nums text-[color:var(--primary-ink)] underline-offset-2 hover:underline"
                      >
                        {l.phone}
                      </a>

                      <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                        {l.courseName ? <div className="truncate">Khoá: {l.courseName}</div> : null}
                        {l.source ? <div className="truncate">Nguồn: {l.source}</div> : null}
                        <div className="flex flex-wrap items-center gap-1">
                          <span
                            className={
                              l.assignedToName
                                ? ""
                                : "font-medium text-[color:var(--state-warning-ink)]"
                            }
                          >
                            Sale: {l.assignedToName ?? "Chưa phân công"}
                          </span>
                          {!l.assignedToName && phanCongDuoc ? (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => phanCongNhanh(l.id)}
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                                "bg-[color:var(--state-warning-soft)] text-[color:var(--state-warning-ink)]",
                                "transition-colors hover:bg-[color:var(--state-warning-soft-hover)]",
                                "disabled:opacity-50",
                              )}
                            >
                              Phân công
                            </button>
                          ) : null}
                          <span>· {ngayNgan(l.createdAt)}</span>
                        </div>
                        {l.lastTrialDate ? (
                          <div className="font-medium text-[color:var(--primary-ink)]">
                            Đã học thử · {ngayNgan(l.lastTrialDate)}
                          </div>
                        ) : null}
                      </div>

                      {/* Hiện cho MỌI trạng thái (kể cả đã ghi danh) và mọi vai đọc được lead. */}
                      <Link
                        href={duongChiTiet(l.id)}
                        className={cn(
                          "mt-2 block rounded-lg px-2 py-1 text-center text-xs font-medium",
                          "bg-[color:var(--primary-soft)] text-[color:var(--primary-ink)]",
                          "transition-colors hover:bg-[color:var(--primary-soft-hover)]",
                        )}
                      >
                        Xem chi tiết lead
                      </Link>

                      {/* Màn hẹp / cảm ứng: kéo-thả HTML5 không chạy, nên phải có
                          đường đổi bậc bằng ô chọn. */}
                      {doiTrangThaiDuoc ? (
                        <Select
                          value={l.status}
                          onValueChange={(v) =>
                            v !== null && xinChuyen(l.id, String(v) as LeadStatus)
                          }
                        >
                          <SelectTrigger
                            size="sm"
                            disabled={pending}
                            aria-label={`Đổi trạng thái của ${l.parentName}`}
                            className="mt-2 h-8 w-full rounded-lg bg-card text-xs sm:hidden"
                          >
                            <SelectValue>
                              {(v: string | null) =>
                                LEAD_STATUS_LABEL[(v as LeadStatus | null) ?? l.status]
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="max-h-80">
                            {KANBAN_COLUMNS.map((s) => (
                              <SelectItem key={s} value={s}>
                                {LEAD_STATUS_LABEL[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <KhungDuLieu.Chan>
        {/* Cắt câm là nói dối về số lượng — cùng bài học với `canhBaoCat` của màn
            "Khách của tôi". Điều kiện là "hiện ÍT HƠN tổng", KHÔNG phải "đã chạm
            trần": nạp đúng 500 trên tổng 500 là hiện đủ, kêu bị cắt lúc đó là doạ
            người dùng có dữ liệu bị giấu trong khi không có. */}
        {the.length < tong
          ? `Hiển thị ${the.length} lead mới nhất trên tổng ${tong.toLocaleString("vi-VN")} — thu hẹp bộ lọc để xem hết.`
          : `${tong.toLocaleString("vi-VN")} lead`}
      </KhungDuLieu.Chan>
    </>
  );
}
