// V-6 · G-02 — mục "Lịch sử thay đổi" trên trang chi tiết lead.
//
// Server component thuần (không state, không handler): dữ liệu đã được lọc cứng
// theo đúng lead đang mở và che PII ở SERVER trước khi tới đây — xem
// `lib/lead/audit-history.ts`. Đừng biến nó thành client component rồi truyền
// dữ liệu chưa che: RSC payload là thứ đọc được bằng View Source.
import {
  LEAD_AUDIT_ACTION_LABEL,
  LEAD_AUDIT_FIELD_LABEL,
  formatLeadAuditValue,
  type LeadAuditRow,
} from "@/lib/lead/audit-history";

type Props = {
  rows: LeadAuditRow[];
  /** Đang xem bản đã che PII → nói thẳng, đừng để người đọc tưởng dữ liệu là vậy. */
  piiMasked: boolean;
};

function nhanO(field: string): string {
  return LEAD_AUDIT_FIELD_LABEL[field] ?? field;
}

function nhanHanhDong(action: string): string {
  return LEAD_AUDIT_ACTION_LABEL[action] ?? action;
}

export function LeadAuditHistory({ rows, piiMasked }: Props) {
  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Lịch sử thay đổi</h2>
        <span className="text-xs text-muted-foreground">
          Vết sửa hồ sơ lead này{piiMasked ? " · thông tin cá nhân đã che" : ""}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa ghi nhận thay đổi nào trên hồ sơ này.
        </p>
      ) : (
        <ol className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-border bg-muted/40 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-foreground">
                  {nhanHanhDong(r.action)}
                </span>
                {r.touchesIdentity && (
                  <span className="rounded-full bg-state-warning-soft px-2 py-0.5 text-xs font-semibold text-state-warning-ink">
                    Ô định danh
                  </span>
                )}
                <span className="text-muted-foreground">· {r.actorName}</span>
                <span className="text-xs text-muted-foreground">
                  ·{" "}
                  {new Date(r.createdAt).toLocaleString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              {r.changedFields.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {r.changedFields.map((f) => (
                    <li key={f} className="text-sm text-foreground">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {nhanO(f)}
                      </span>
                      <span className="ml-2 break-words text-muted-foreground line-through">
                        {formatLeadAuditValue(r.oldValues?.[f])}
                      </span>
                      <span className="mx-1 text-muted-foreground">→</span>
                      <span className="break-words font-medium">
                        {formatLeadAuditValue(r.newValues?.[f])}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {r.reason && (
                <p className="mt-1 text-xs text-muted-foreground">Lý do: {r.reason}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
