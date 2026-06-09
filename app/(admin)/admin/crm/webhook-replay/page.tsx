import { redirect } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { getFailedDeliveries } from "@/lib/crm/webhook-replay";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReplayButton } from "./_components/replay-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Webhook replay | Admin" };

export default async function WebhookReplayPage() {
  const session = await auth();
  if (!can(session?.user ?? null, "settings:edit")) redirect("/admin/dashboard");

  const failed = await getFailedDeliveries(100);

  return (
    <div>
      <h1 className="mb-6 flex items-center gap-2 text-3xl font-black text-neutral-900">
        <RefreshCw className="h-7 w-7 text-orange-500" />
        Webhook lỗi — Replay
      </h1>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nguồn</TableHead>
              <TableHead>External ID</TableHead>
              <TableHead>Nhận lúc</TableHead>
              <TableHead>Lỗi</TableHead>
              <TableHead className="text-right">Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {failed.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-neutral-500">
                  Không có webhook FAILED.
                </TableCell>
              </TableRow>
            ) : (
              failed.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono">{d.source}</TableCell>
                  <TableCell className="font-mono text-xs">{d.externalId ?? "—"}</TableCell>
                  <TableCell className="text-sm text-neutral-500">{d.receivedAt.toISOString().slice(0, 16)}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-red-600">{d.errorMessage ?? ""}</TableCell>
                  <TableCell className="text-right">
                    <ReplayButton deliveryId={d.id} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
