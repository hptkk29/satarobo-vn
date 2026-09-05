"use client";

/**
 * Site Sale — NGĂN CHI TIẾT LEAD (trượt từ phải) của màn `/sale/leads`.
 *
 * ── BẢN ĐÔI CỦA `LeadDrawer` trong
 *    `app/(admin)/admin/leads/_components/leads-table.tsx` ────────────────────
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * GIỮ NGUYÊN 100% NỘI DUNG — đủ hai khối và đúng từng nhãn:
 *   · "Thông tin lead": Tên phụ huynh · Số điện thoại · Email · Tên con · Tuổi ·
 *     Cơ sở · Khóa quan tâm · Nguồn · Trạng thái
 *   · "Tracking": UTM · Event ID · Landing page · Referrer · IP address ·
 *     User agent · Consent marketing ("Có" / "Không")
 *   · Ô "Note" với đúng chỗ giữ chỗ cũ, nút "Save" / "Đang lưu...", và lối
 *     "Sửa đầy đủ →".
 * Điều kiện quyền cũng giữ nguyên: `canUpdate` (`leads:edit`) mở ô ghi chú + nút
 * lưu + lối sửa đầy đủ; `canChangeStatus` mở ô trạng thái. Hai quyền TÁCH NHAU từ
 * 27/08 — Quản lý cơ sở / Marketing vẫn sửa hồ sơ nhưng không đẩy bậc phễu.
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. Trạng thái: `<select>` gốc → `<Select>` của kho, và nhãn đi qua thang màu
 *    ngữ nghĩa thay vì mười class Tailwind rời.
 * 2. Nút "Save" từ `bg-primary-purple` gõ tay → token `--primary` của `sale.css`.
 * 3. Thêm ĐÓNG BẰNG PHÍM ESC. Bản admin chỉ đóng được bằng chuột (nút X hoặc nền
 *    mờ) — ngăn phủ toàn màn hình mà không thoát được bằng bàn phím là một cái
 *    bẫy, không phải một lựa chọn thiết kế.
 *
 * ⚠️ MỌI GIÁ TRỊ Ở ĐÂY ĐÃ QUA CHE PII Ở SERVER (`maskLeadPiiFields` trong
 *    `lib/sale/leads.ts`) trước khi rời máy chủ. Đừng thêm ô nào đọc từ nguồn khác.
 */
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { LeadStatus } from "@prisma/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KANBAN_COLUMNS, LEAD_DROP_STATUSES, LEAD_STATUS_LABEL } from "@/lib/leads/status";
import type { DongLead } from "@/lib/sale/leads";
import { rutGonNguon } from "@/lib/sale/nguon-lead";
import { cn } from "@/lib/utils";
import { updateLeadNote, updateLeadStatus } from "@/app/(admin)/admin/leads/actions";
import { LyDoRotSale } from "./ly-do-rot";
import { NhanTrangThaiLead } from "./o-trang-thai";

function Muc({ nhan, gia }: { nhan: string; gia: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {nhan}
      </dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{gia || "—"}</dd>
    </div>
  );
}

export function NganChiTietLead({
  lead,
  suaDuoc,
  doiTrangThaiDuoc,
  onDong,
}: {
  /** `null` = ngăn đóng. */
  lead: DongLead | null;
  /** `leads:edit`. */
  suaDuoc: boolean;
  /** `leads:change-status`. */
  doiTrangThaiDuoc: boolean;
  onDong: () => void;
}) {
  const router = useRouter();
  const [ghiChu, setGhiChu] = useState(lead?.note ?? "");
  const [trangThai, setTrangThai] = useState<LeadStatus>(
    (lead?.status as LeadStatus | undefined) ?? "MOI",
  );
  const [pending, start] = useTransition();
  /** Bậc rơi đang chờ lý do trước khi Lưu. `null` = không có gì đang chờ. */
  const [choLyDo, setChoLyDo] = useState<LeadStatus | null>(null);

  // Phím Esc đóng ngăn. Gắn khi ngăn MỞ, gỡ khi đóng — không để lại người nghe.
  useEffect(() => {
    if (!lead) return;
    function nghe(e: KeyboardEvent) {
      // Đang mở hộp thoại lý do thì Esc là của hộp thoại đó, không phải của ngăn.
      if (e.key === "Escape" && !choLyDo) onDong();
    }
    window.addEventListener("keydown", nghe);
    return () => window.removeEventListener("keydown", nghe);
  }, [lead, choLyDo, onDong]);

  if (!lead) return null;

  function luu(lyDo?: string) {
    if (!lead) return;
    start(async () => {
      if (trangThai !== lead.status) {
        const res = await updateLeadStatus(lead.id, trangThai, lyDo);
        if (!res.ok) {
          // Trước đây kết quả bị NUỐT: server từ chối thì ngăn vẫn đóng như thành
          // công, ô trạng thái vẫn hiện giá trị mới, DB không đổi gì.
          toast.error(res.error ?? "Không đổi được trạng thái");
          return;
        }
      }
      await updateLeadNote(lead.id, ghiChu);
      setChoLyDo(null);
      toast.success("Đã lưu");
      // Action revalidate đường `/leads` của khu quản trị; màn này ở `/sale/leads`.
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50">
      <LyDoRotSale
        status={choLyDo}
        tenLead={lead.parentName}
        dangGui={pending}
        onHuy={() => setChoLyDo(null)}
        onXacNhan={(lyDo) => luu(lyDo)}
      />

      <button
        type="button"
        aria-label="Đóng chi tiết lead"
        className="absolute inset-0 bg-foreground/25"
        onClick={onDong}
      />

      <aside
        aria-label={`Chi tiết lead ${lead.parentName}`}
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-card shadow-[var(--bong-the)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
              {lead.parentName}
            </h2>
            <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">{lead.phone}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <NhanTrangThaiLead trangThai={lead.status as LeadStatus} />
            <button
              type="button"
              onClick={onDong}
              aria-label="Đóng"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-[color:var(--surface-chim)] hover:text-foreground"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Thông tin lead</h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Muc nhan="Tên phụ huynh" gia={lead.parentName} />
              <Muc nhan="Số điện thoại" gia={lead.phone} />
              <Muc nhan="Email" gia={lead.email} />
              <Muc nhan="Tên con" gia={lead.childName} />
              <Muc nhan="Tuổi" gia={lead.childAge} />
              <Muc nhan="Cơ sở" gia={lead.center?.name} />
              <Muc nhan="Khóa quan tâm" gia={lead.courseName ?? "—"} />
              <Muc nhan="Nguồn" gia={rutGonNguon(lead.source)} />
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Trạng thái
                </dt>
                <dd className="mt-1">
                  <Select
                    value={trangThai}
                    onValueChange={(v) => v !== null && setTrangThai(String(v) as LeadStatus)}
                  >
                    <SelectTrigger
                      aria-label="Trạng thái lead"
                      disabled={!doiTrangThaiDuoc || pending}
                      className="h-9 w-full rounded-lg bg-card text-sm"
                    >
                      <SelectValue>
                        {(v: string | null) =>
                          LEAD_STATUS_LABEL[(v as LeadStatus | null) ?? trangThai]
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
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Tracking</h3>
            <dl className="grid grid-cols-1 gap-4">
              <Muc
                nhan="UTM"
                gia={[lead.utmSource, lead.utmMedium, lead.utmCampaign]
                  .filter(Boolean)
                  .join(" / ")}
              />
              <Muc nhan="Event ID" gia={lead.eventId} />
              <Muc nhan="Landing page" gia={lead.landingPage} />
              <Muc nhan="Referrer" gia={lead.referrer} />
              <Muc nhan="IP address" gia={lead.ipAddress} />
              <Muc nhan="User agent" gia={lead.userAgent} />
              <Muc nhan="Consent marketing" gia={lead.consentMarketing ? "Có" : "Không"} />
            </dl>
          </section>

          <section>
            <label htmlFor="ghi-chu-lead" className="mb-2 block text-sm font-semibold text-foreground">
              Note
            </label>
            <textarea
              id="ghi-chu-lead"
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              disabled={!suaDuoc || pending}
              rows={5}
              placeholder="Thêm ghi chú chăm sóc lead..."
              className={cn(
                "w-full rounded-lg border border-border bg-card p-3 text-sm",
                "placeholder:text-muted-foreground disabled:bg-[color:var(--surface-chim)]",
                "focus-visible:border-[color:var(--primary)] focus-visible:outline-none",
                "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/25",
              )}
            />
            {suaDuoc ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    // Bậc rơi phải kèm lý do — hỏi trước khi ghi (server kiểm lại).
                    if (trangThai !== lead.status && LEAD_DROP_STATUSES.includes(trangThai)) {
                      setChoLyDo(trangThai);
                      return;
                    }
                    luu();
                  }}
                  className={cn(
                    "h-9 rounded-lg px-4 text-sm font-medium transition-colors",
                    "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
                    "hover:bg-[color:var(--primary-dark)] disabled:opacity-60",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
                  )}
                >
                  {pending ? "Đang lưu..." : "Save"}
                </button>
                {/* ⚠️ NỢ ĐÃ BIẾT — `/leads/{id}/edit` là đường của KHU QUẢN TRỊ.
                    Trên `sale.satarobo.vn`, luật cuối của nhánh Sale trong
                    `lib/auth/route-policy.ts` viết lại mọi đường lạ thành
                    `/sale/<đường>` ⇒ đây thành `/sale/leads/{id}/edit` → 404.
                    Bản mount cũ cũng đã hỏng đúng như vậy: giữ nguyên là KHÔNG
                    tạo hồi quy, chứ không phải là đúng. Vá thật = dựng màn sửa
                    lead trong `app/(sale)/sale/leads/**`, tức THÊM MÀN — việc
                    phải hỏi chủ dự án, ngoài phạm vi đợt tách này. */}
                <Link
                  href={`/leads/${lead.id}/edit`}
                  className="text-sm font-medium text-[color:var(--primary-ink)] underline-offset-2 hover:underline"
                >
                  Sửa đầy đủ →
                </Link>
              </div>
            ) : null}
          </section>
        </div>
      </aside>
    </div>
  );
}
