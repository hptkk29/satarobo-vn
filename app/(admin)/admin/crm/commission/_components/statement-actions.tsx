"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { approveStatementAction, reopenStatementAction } from "../actions";

export function StatementActions({ period, status }: { period: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(ok);
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi");
      }
    });
  }

  return (
    <div className="flex justify-end gap-2">
      <a
        href={`/api/admin/crm/commission-export?period=${period}`}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
      >
        Export Excel
      </a>
      {status !== "APPROVED" ? (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => run(() => approveStatementAction(period, "Duyệt qua UI"), "Đã duyệt")}
        >
          Duyệt
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => reopenStatementAction(period, "Mở lại qua UI"), "Đã mở lại")}
        >
          Mở lại
        </Button>
      )}
    </div>
  );
}
