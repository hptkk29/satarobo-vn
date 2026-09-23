// C-07 — mục "Mốc trạng thái" trên trang chi tiết lead: ai đổi · lúc nào · TỪ
// trạng thái nào → trạng thái nào.
//
// Tách khỏi mục "Lịch sử thay đổi" (V-6 · G-02) có chủ đích: mục kia trộn mọi
// lượt sửa hồ sơ, nên khi lead bị sửa nhiều thì đúng thứ QLCS cần soi — đường đi
// của phễu — chìm mất. Dữ liệu lấy từ truy vấn RIÊNG (`getLeadStatusHistory`),
// không phải lọc lại 50 dòng của mục kia.
//
// Server component thuần: dữ liệu đã lọc cứng theo lead đang mở và che PII ở
// SERVER trước khi tới đây (tên con trong vết là PII). Đừng biến thành client
// component rồi truyền dữ liệu chưa che — RSC payload đọc được bằng View Source.
import { ArrowRight } from "lucide-react";
import { selectLeadStatusTrail, type LeadStatusTrailRow } from "@/lib/lead/status-trail";
import type { LeadAuditRow } from "@/lib/lead/audit-history";

type Props = {
  rows: LeadAuditRow[];
  /** Đang xem bản đã che PII → nói thẳng, đừng để người đọc tưởng dữ liệu là vậy. */
  piiMasked: boolean;
};

function gio(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Moc({ r }: { r: LeadStatusTrailRow }) {
  return (
    <li className="rounded-lg border border-border bg-muted/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{r.fromLabel ?? "Chưa có"}</span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="font-semibold text-foreground">{r.toLabel}</span>
        {r.isChild && (
          <span className="rounded-full bg-state-info-soft px-2 py-0.5 text-xs font-semibold text-state-info-ink">
            Học sinh{r.childName ? `: ${r.childName}` : ""}
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{r.actorName}</span>
        <span>· {gio(r.createdAt)}</span>
        {r.sourceLabel && <span>· {r.sourceLabel}</span>}
      </div>
      {r.reason && <p className="mt-1 text-xs text-muted-foreground">Lý do: {r.reason}</p>}
    </li>
  );
}

export function LeadStatusTrail({ rows, piiMasked }: Props) {
  const moc = selectLeadStatusTrail(rows);

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Mốc trạng thái</h2>
        <span className="text-xs text-muted-foreground">
          Ai đổi · lúc nào · từ trạng thái nào{piiMasked ? " · thông tin cá nhân đã che" : ""}
        </span>
      </div>

      {moc.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa ghi nhận lượt đổi trạng thái nào trên hồ sơ này.
        </p>
      ) : (
        <ol className="space-y-2">
          {moc.map((r) => (
            <Moc key={r.id} r={r} />
          ))}
        </ol>
      )}
    </section>
  );
}
