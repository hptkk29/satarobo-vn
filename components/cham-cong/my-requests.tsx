"use client";

// components/cham-cong/my-requests.tsx — "Đơn của tôi" cho site admin (tư vấn/giáo vụ/HO). Site GV
// giữ danh sách riêng (`don-tu-client.tsx`) vì đã có bộ lọc/EmptyState của site GV; FORM thì dùng chung.
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { WR_KIND_LABEL, WR_STATUS_LABEL, type WorkRequestKindV, type WorkRequestStatusV } from "@/lib/work-request";
import type { RequestFormOptions } from "@/lib/cham-cong/request-form-data";
import { RequestForm } from "./request-form";

export type MyRequestRow = {
  id: string;
  kind: WorkRequestKindV;
  status: WorkRequestStatusV;
  centerLabel: string;
  fromLabel: string | null;
  toLabel: string | null;
  time: string | null;
  detail: string | null;
  reason: string;
  submittedLate: boolean;
  applyError: string | null;
  reviewNote: string | null;
  reviewedByName: string | null;
  createdAtLabel: string;
};

const STATUS_CLS: Record<WorkRequestStatusV, string> = {
  PENDING: "bg-state-warning-soft text-state-warning-ink",
  APPROVED: "bg-state-success-soft text-state-success-ink",
  REJECTED: "bg-state-danger-soft text-state-danger-ink",
};

export function MyRequests({ rows, options, presetKind }: { rows: MyRequestRow[]; options: RequestFormOptions; presetKind: WorkRequestKindV | null }) {
  const [open, setOpen] = useState(Boolean(presetKind));
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!open && <Button onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" aria-hidden /> Tạo đơn</Button>}
      </div>
      {open && <RequestForm options={options} preset={presetKind} onClose={() => setOpen(false)} />}
      <PhanTrangBang cuonNgang>
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Loại</th>
              <th className="px-3 py-2">Ngày</th>
              <th className="px-3 py-2">Cơ sở nhận</th>
              <th className="px-3 py-2">Lý do</th>
              <th className="px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2">Gửi lúc</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Bạn chưa có đơn nào.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-border align-top hover:bg-muted/40">
                  <td className="px-3 py-2 font-medium">
                    {WR_KIND_LABEL[r.kind]}
                    {r.detail && <div className="text-xs font-normal text-muted-foreground">{r.detail}</div>}
                    {r.submittedLate && <span className="mt-1 inline-block rounded-full bg-state-warning-soft px-2 py-0.5 text-[11px] font-semibold text-state-warning-ink">Nộp muộn</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.fromLabel ?? "—"}{r.toLabel && r.toLabel !== r.fromLabel ? ` → ${r.toLabel}` : ""}{r.time ? <div className="text-xs text-muted-foreground">{r.time}</div> : null}</td>
                  <td className="px-3 py-2">{r.centerLabel}</td>
                  <td className="max-w-md px-3 py-2 whitespace-pre-wrap">{r.reason}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[r.status]}`}>{WR_STATUS_LABEL[r.status]}</span>
                    {r.reviewNote && <div className="mt-1 text-xs text-muted-foreground">{r.reviewedByName ? `${r.reviewedByName}: ` : ""}{r.reviewNote}</div>}
                    {r.status === "PENDING" && r.applyError && <div className="mt-1 text-xs text-state-danger-ink">Lần duyệt gần nhất không áp được: {r.applyError}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{r.createdAtLabel}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </PhanTrangBang>
    </div>
  );
}
