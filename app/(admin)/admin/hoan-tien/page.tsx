import { redirect } from "next/navigation";
import Link from "next/link";
import { Undo2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { listRefundRequests } from "@/lib/finance/refund";
import type { RefundStatus } from "@prisma/client";
import { RefundTable } from "./_components/refund-table";

export const metadata = { title: "Hoàn tiền | Admin" };
export const dynamic = "force-dynamic";

const STATUSES: { key: RefundStatus | "ALL"; label: string }[] = [
  { key: "PENDING", label: "Chờ duyệt" },
  { key: "APPROVED", label: "Đã duyệt" },
  { key: "REJECTED", label: "Từ chối" },
  { key: "PAID", label: "Đã chi" },
  { key: "ALL", label: "Tất cả" },
];

export default async function HoanTienPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Xem danh sách: quyền tài chính (payments:manage). Duyệt/từ chối: payments:confirm (action gate).
  if (!(await checkPermission("payments:manage"))) {
    redirect("/dashboard?error=unauthorized");
  }
  const uid = session.user.id;
  if (!uid) redirect("/login");

  const sp = await searchParams;
  const statusParam = (sp.status ?? "PENDING").toUpperCase();
  const status = (
    ["PENDING", "APPROVED", "REJECTED", "PAID"].includes(statusParam)
      ? statusParam
      : statusParam === "ALL"
        ? "ALL"
        : "PENDING"
  ) as RefundStatus | "ALL";

  const actor = await resolveActor(uid);
  const sdb = scopedDb(actor);
  const rows = await listRefundRequests(
    sdb as unknown as Parameters<typeof listRefundRequests>[0],
    status === "ALL" ? undefined : { status },
  );

  const canApprove = await checkPermission("payments:confirm");

  return (
    <div>
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft">
          <Undo2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hoàn tiền</h1>
          <p className="mt-1 text-sm text-gray-500">
            Yêu cầu hoàn tiền theo vòng đời (rút học / chuyển lớp / hủy lớp). Đề xuất ={" "}
            Σ đã thu − số buổi đã học × đơn giá.
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => {
          const active = status === s.key;
          return (
            <Link
              key={s.key}
              href={`/hoan-tien?status=${s.key}`}
              className={
                "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors " +
                (active
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50")
              }
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      <RefundTable rows={rows} canApprove={canApprove} />
    </div>
  );
}
