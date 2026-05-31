"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LeadStatus } from "@prisma/client";
import { toast } from "sonner";
import {
  KANBAN_COLUMNS,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_ACCENT,
} from "@/lib/leads/status";
import { updateLeadStatus, autoAssignLeadAction } from "../actions";
import { CloseDealDialog } from "./close-deal-dialog";

export type KanbanLead = {
  id: string;
  parentName: string;
  phone: string;
  childName: string | null;
  status: LeadStatus;
  source: string | null;
  courseName: string | null;
  assignedToName: string | null;
  createdAt: string; // ISO
  overdue: boolean; // T1.2 — quá hạn follow-up (tạm false cho tới khi có LeadTask)
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function LeadsKanban({
  leads,
  canUpdate,
  canCloseDeal = false,
  canAssign = false,
}: {
  leads: KanbanLead[];
  canUpdate: boolean;
  canCloseDeal?: boolean;
  canAssign?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState<KanbanLead[]>(leads);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<LeadStatus | null>(null);
  const [closeLead, setCloseLead] = useState<{ id: string; name: string } | null>(null);

  /** Chuyển sang ENROLLED = chốt deal → mở dialog thay vì set status trơn. */
  function requestMove(leadId: string, to: LeadStatus) {
    if (to === "ENROLLED" && canCloseDeal) {
      const l = items.find((x) => x.id === leadId);
      setCloseLead({ id: leadId, name: l?.parentName ?? "Lead" });
      return;
    }
    move(leadId, to);
  }

  function quickAssign(leadId: string) {
    startTransition(async () => {
      const res = await autoAssignLeadAction(leadId);
      if (res.ok) {
        toast.success("Đã phân công lead (round-robin)");
        router.refresh();
      } else {
        toast.error(res.error ?? "Không phân công được");
      }
    });
  }

  function move(leadId: string, to: LeadStatus) {
    const lead = items.find((l) => l.id === leadId);
    if (!lead || lead.status === to) return;

    // Optimistic update
    const prev = items;
    setItems((cur) =>
      cur.map((l) => (l.id === leadId ? { ...l, status: to } : l)),
    );

    startTransition(async () => {
      const res = await updateLeadStatus(leadId, to);
      if (!res.ok) {
        setItems(prev); // rollback
        toast.error(res.error ?? "Không đổi được trạng thái");
      } else {
        toast.success(`Đã chuyển sang "${LEAD_STATUS_LABEL[to]}"`);
        router.refresh();
      }
    });
  }

  const byStatus = (s: LeadStatus) => items.filter((l) => l.status === s);

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-3">
        {KANBAN_COLUMNS.map((col) => {
          const colLeads = byStatus(col);
          return (
            <div
              key={col}
              className={`flex w-72 flex-shrink-0 flex-col rounded-xl bg-gray-50 ${
                overCol === col ? "ring-2 ring-orange-400" : ""
              }`}
              onDragOver={(e) => {
                if (!canUpdate || !dragId) return;
                e.preventDefault();
                setOverCol(col);
              }}
              onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setOverCol(null);
                if (canUpdate && dragId) requestMove(dragId, col);
                setDragId(null);
              }}
            >
              <div
                className={`sticky top-0 flex items-center justify-between rounded-t-xl border-t-4 bg-white px-3 py-2 ${LEAD_STATUS_ACCENT[col]}`}
              >
                <span className="text-sm font-bold text-gray-800">
                  {LEAD_STATUS_LABEL[col]}
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                  {colLeads.length}
                </span>
              </div>

              <div className="flex-1 space-y-2 p-2">
                {colLeads.length === 0 && (
                  <p className="px-2 py-4 text-center text-xs text-gray-400">
                    Trống
                  </p>
                )}
                {colLeads.map((lead) => (
                  <div
                    key={lead.id}
                    draggable={canUpdate}
                    onDragStart={() => setDragId(lead.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverCol(null);
                    }}
                    className={`rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition ${
                      canUpdate ? "cursor-grab active:cursor-grabbing" : ""
                    } ${dragId === lead.id ? "opacity-50" : ""} ${
                      lead.overdue ? "border-l-4 border-l-red-500" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-semibold text-gray-900 hover:text-orange-600 hover:underline"
                      >
                        {lead.parentName}
                      </Link>
                      {lead.overdue && (
                        <span className="flex-shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                          Quá hạn
                        </span>
                      )}
                    </div>
                    <a
                      href={`tel:${lead.phone}`}
                      className="text-sm font-medium text-orange-600"
                    >
                      {lead.phone}
                    </a>
                    <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                      {lead.courseName && <div>Khoá: {lead.courseName}</div>}
                      {lead.source && <div>Nguồn: {lead.source}</div>}
                      <div className="flex flex-wrap items-center gap-1">
                        <span className={lead.assignedToName ? "" : "font-medium text-amber-600"}>
                          Sale: {lead.assignedToName ?? "Chưa phân công"}
                        </span>
                        {!lead.assignedToName && canAssign && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => quickAssign(lead.id)}
                            className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-200 disabled:opacity-50"
                          >
                            Phân công
                          </button>
                        )}
                        <span>· {fmtDate(lead.createdAt)}</span>
                      </div>
                    </div>

                    {canCloseDeal &&
                      lead.status !== "ENROLLED" &&
                      lead.status !== "LOST" &&
                      lead.status !== "DUPLICATE" && (
                        <button
                          type="button"
                          onClick={() =>
                            setCloseLead({ id: lead.id, name: lead.parentName })
                          }
                          className="mt-2 w-full rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Chuyển Đã đăng ký
                        </button>
                      )}

                    {/* Mobile / fallback: đổi status qua select (native DnD không
                        chạy tốt trên touch). */}
                    {canUpdate && (
                      <select
                        value={lead.status}
                        disabled={isPending}
                        onChange={(e) =>
                          requestMove(lead.id, e.target.value as LeadStatus)
                        }
                        className="mt-2 w-full rounded border border-gray-200 bg-gray-50 px-1.5 py-1 text-xs text-gray-700 sm:hidden"
                        aria-label="Đổi trạng thái"
                      >
                        {KANBAN_COLUMNS.map((s) => (
                          <option key={s} value={s}>
                            {LEAD_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <CloseDealDialog
        leadId={closeLead?.id ?? null}
        leadName={closeLead?.name ?? ""}
        onClose={() => setCloseLead(null)}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
