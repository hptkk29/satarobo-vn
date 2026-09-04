/**
 * Site Sale — khối "Cần xử lý" của màn `/sale/dashboard`.
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/dashboard/_components/pending-tasks-section.tsx` ──
 * Tách bản riêng theo chốt 04/09/2026. Bản admin giữ nguyên, không sửa.
 *
 * ── DÙNG LẠI ĐƯỢC TOÀN BỘ PHẦN DỮ LIỆU ─────────────────────────────────────
 * `getPendingTasks` / `summarizePendingTasks` ở `lib/pending-tasks.ts` là kho
 * việc DÙNG CHUNG cho mọi site và đã lọc sẵn theo QUYỀN + CƠ SỞ. Không chép một
 * dòng truy vấn nào; phần chép chỉ là JSX.
 *
 * Hệ quả cần nhớ: nhóm việc nào hiện ra là do QUYỀN quyết định, không do site.
 * Tư vấn viên thuần thường thấy "Lead cần xử lý", "Khách đã đăng ký quá lâu",
 * "Việc chăm sóc HV", "Sinh nhật học viên"; người kiêm vai quản lý sẽ thấy thêm
 * nhóm của vai đó. Đây là hành vi ĐÚNG — khối này là hộp việc của NGƯỜI, không
 * phải của site.
 *
 * ── ĐƯỜNG DẪN: PHẢI ĐI QUA `duongSale()` ───────────────────────────────────
 * `href` do kho dùng chung sinh ra viết theo đường sạch của khu quản trị. Trên
 * host Sale, `decideRoute` viết lại mọi đường lạ thành `/sale/<đường>` ⇒
 * `/students/sap-het-khoa` hoá `/sale/students/sap-het-khoa` → 404 trắng trơn.
 * Lý do đầy đủ + danh sách đường CHƯA có bản Sale: `lib/sale/duong-dan-sale.ts`.
 *
 * ── ⚠️ NỢ ĐÃ BIẾT: nhãn từng dòng việc KHÔNG được che PII ───────────────────
 * `items[].label` do `lib/pending-tasks.ts` ghép sẵn thành câu có nhúng tên
 * người ("Nguyễn Văn A (mới)", "Bé Bo — còn 2 buổi"). Che ở đây là bất khả:
 * tên đã lẫn vào câu, `maskPersonName` bôi luôn cả phần không phải tên. Vá thật
 * = để `lib/pending-tasks.ts` trả tên ra một trường RIÊNG rồi mới ghép ở tầng
 * hiển thị — sửa kho DÙNG CHUNG, ảnh hưởng cả 4 site, nên phải hỏi chủ dự án.
 * Đây là hiện trạng có từ trước (bản mount cũ y hệt), không phải hồi quy của
 * đợt này; đã báo lại chủ dự án.
 */
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { TieuDeNhom } from "@/components/sale/ui/dai-so-lieu";
import { getPendingTasks, summarizePendingTasks, type TaskUser } from "@/lib/pending-tasks";
import { duongSale } from "@/lib/sale/duong-dan-sale";
import type { Actor } from "@/lib/auth/actor";
import { LOP_KHOI } from "./khoi";

export async function KhoiCanXuLy({ user, actor }: { user: TaskUser; actor: Actor }) {
  const nhom = await getPendingTasks(user, actor);
  if (nhom.length === 0) return null;

  const { total, overdue } = summarizePendingTasks(nhom);
  const dangCo = nhom.filter((g) => g.count > 0);

  return (
    <section className={LOP_KHOI}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <TieuDeNhom bieuTuong={<ClipboardList className="h-4 w-4 text-[color:var(--primary)]" />}>
          Cần xử lý
        </TieuDeNhom>
        {/* Số tổng để chữ thường: nó luôn > 0 khi khối hiện ra, nên tô màu là tô
            cả khối. Chỉ "quá hạn" mới đòi hành động, và chỉ khi nó > 0 — một số
            0 màu đỏ dạy người dùng bỏ qua màu đỏ. */}
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{total}</span> việc
          {overdue > 0 ? (
            <>
              {" · "}
              <span className="font-semibold tabular-nums text-[color:var(--state-danger)]">
                {overdue} quá hạn
              </span>
            </>
          ) : null}
        </p>
      </div>

      {dangCo.length === 0 ? (
        <p className="text-sm text-muted-foreground">Đã sạch — không có việc nào cần xử lý.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {dangCo.map((g) => (
            <li key={g.type}>
              <Link
                href={duongSale(g.href)}
                className="flex items-start justify-between gap-3 py-2.5 transition-colors hover:bg-[color:var(--surface-chim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--primary)]/40"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{g.label}</p>
                  {g.items.length > 0 ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {g.items
                        .map((i) => i.label)
                        .slice(0, 2)
                        .join(" · ")}
                      {g.count > 2 ? ` …+${g.count - 2}` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {g.count}
                  </span>
                  {g.overdueCount > 0 ? (
                    <span className="text-[11px] font-medium tabular-nums text-[color:var(--state-danger)]">
                      {g.overdueCount} quá hạn
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
