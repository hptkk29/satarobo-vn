"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  REQUEST_TYPE_LABEL,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_BADGE,
} from "@/lib/portal/request-labels";
import type { ParentRequestType, ParentRequestStatus } from "@prisma/client";
import { handleParentRequest } from "../actions";

export type RequestItem = {
  id: string;
  type: ParentRequestType;
  status: ParentRequestStatus;
  content: string;
  preferredDate: string | null;
  response: string | null;
  createdAt: string;
  studentName: string;
  studentCode: string | null;
  className: string | null;
  handledByName: string | null;
};

export function RequestRow({ item }: { item: RequestItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [response, setResponse] = useState("");
  const [open, setOpen] = useState(false);

  function decide(decision: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      const res = await handleParentRequest({ id: item.id, decision, response });
      if (res.ok) {
        toast.success(decision === "APPROVED" ? "Đã duyệt" : "Đã từ chối");
        setOpen(false);
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold text-gray-900">
            {REQUEST_TYPE_LABEL[item.type]}
          </span>
          <span className="ml-2 text-sm text-gray-500">
            {item.studentName}
            {item.studentCode ? ` (${item.studentCode})` : ""}
            {item.className ? ` · ${item.className}` : ""}
          </span>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${REQUEST_STATUS_BADGE[item.status]}`}
        >
          {REQUEST_STATUS_LABEL[item.status]}
        </span>
      </div>

      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{item.content}</p>
      {item.preferredDate && (
        <p className="mt-1 text-xs text-gray-400">
          Ngày: {new Date(item.preferredDate).toLocaleDateString("vi-VN")}
        </p>
      )}
      {item.response && (
        <p className="mt-2 rounded-lg bg-gray-50 p-2 text-sm text-gray-600">
          Phản hồi: {item.response}
          {item.handledByName ? ` — ${item.handledByName}` : ""}
        </p>
      )}

      <p className="mt-1 text-xs text-gray-400">
        {new Date(item.createdAt).toLocaleString("vi-VN")}
      </p>

      {item.status === "PENDING" && (
        <div className="mt-3">
          {open ? (
            <div className="space-y-2">
              <textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                rows={2}
                placeholder="Phản hồi cho phụ huynh (tuỳ chọn)…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => decide("APPROVED")}
                  disabled={pending}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  Duyệt
                </button>
                <button
                  type="button"
                  onClick={() => decide("REJECTED")}
                  disabled={pending}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  Từ chối
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600"
                >
                  Đóng
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Xử lý
            </button>
          )}
        </div>
      )}
    </li>
  );
}
