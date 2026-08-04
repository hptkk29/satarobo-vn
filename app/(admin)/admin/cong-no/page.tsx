import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DebtFilterBar } from "./_components/debt-filter-bar";
// lib/finance/debt.ts — parallel agent owns. Combined typecheck resolves.
import { getDebtRows, overdueBucket, type DebtRow } from "@/lib/finance/debt";

export const metadata = { title: "Công nợ | Admin" };
export const dynamic = "force-dynamic";

type Bucket = "none" | "1-7" | "8-30" | ">30";
const BUCKETS: Bucket[] = ["none", "1-7", "8-30", ">30"];
const BUCKET_LABEL: Record<Bucket, string> = {
  none: "Chưa quá hạn",
  "1-7": "Quá hạn 1-7 ngày",
  "8-30": "Quá hạn 8-30 ngày",
  ">30": "Quá hạn > 30 ngày",
};
const BUCKET_BADGE: Record<Bucket, string> = {
  none: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  "1-7": "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
  "8-30": "bg-orange-100 text-orange-800 hover:bg-orange-100",
  ">30": "bg-red-100 text-red-800 hover:bg-red-100",
};

function vnd(n: number): string {
  return n.toLocaleString("vi-VN") + " đ";
}

type GroupKey = "enrollment" | "student" | "center";

export default async function CongNoPage({
  searchParams,
}: {
  searchParams: Promise<{ groupBy?: string; search?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // 03/08 — Quản lý cơ sở được ĐỐI SOÁT nhưng chỉ XEM: `payments:view` mở màn này,
  // mọi thao tác tiền vẫn đòi `payments:manage`/`payments:confirm`.
  const [canManagePayments, canViewPayments] = await Promise.all([
    checkPermission("payments:manage"),
    checkPermission("payments:view"),
  ]);
  if (!canManagePayments && !canViewPayments) {
    redirect("/dashboard?error=unauthorized");
  }
  const uid = session.user.id;
  if (!uid) redirect("/login");

  const sp = await searchParams;
  const groupBy = (
    ["enrollment", "student", "center"].includes(sp.groupBy ?? "")
      ? sp.groupBy
      : "enrollment"
  ) as GroupKey;
  const search = (sp.search ?? "").trim();

  const actor = await resolveActor(uid);
  const sdb = scopedDb(actor);

  // ── Debt rows (CHỈ Payment CONFIRMED) — lib getDebtRows. Cast tránh so kiểu
  // sâu giữa Prisma client mở rộng và DebtScopedDb hẹp của lib. ──
  let rows = await getDebtRows(
    sdb as unknown as Parameters<typeof getDebtRows>[0],
  );
  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.studentName ?? "").toLowerCase().includes(s) ||
        r.enrollmentId.toLowerCase().includes(s),
    );
  }
  // Chỉ hiện đăng ký còn nợ (> 0).
  rows = rows.filter((r) => r.debt > 0);

  // ── Aging buckets từ installment PENDING của các đơn trong scope ──
  const now = new Date();
  const orders = await sdb.order.findMany({
    where: { installments: { some: { status: "PENDING" } } },
    select: {
      installments: {
        where: { status: "PENDING" },
        select: { amount: true, dueDate: true },
      },
    },
  });
  const bucketTotals: Record<Bucket, number> = {
    none: 0,
    "1-7": 0,
    "8-30": 0,
    ">30": 0,
  };
  for (const o of orders) {
    for (const inst of o.installments) {
      const b = overdueBucket(inst.dueDate, now) as Bucket;
      bucketTotals[b] += inst.amount;
    }
  }

  // ── Center name map (Center không scoped — chỉ để gắn nhãn) ──
  const centerNames = new Map<string, string>();
  if (groupBy === "center") {
    const centerIds = [
      ...new Set(rows.map((r) => r.centerId).filter((c): c is string => !!c)),
    ];
    if (centerIds.length) {
      const centers = await sdb.center.findMany({
        where: { id: { in: centerIds } },
        select: { id: true, name: true },
      });
      for (const c of centers) centerNames.set(c.id, c.name);
    }
  }

  // ── Gom nhóm theo dimension ──
  const totalDebt = rows.reduce((s, r) => s + r.debt, 0);
  const groups = new Map<string, { label: string; debt: number; count: number }>();
  for (const r of rows) {
    const label = groupLabel(r, groupBy, centerNames);
    const g = groups.get(label) ?? { label, debt: 0, count: 0 };
    g.debt += r.debt;
    g.count += 1;
    groups.set(label, g);
  }
  const groupList = [...groups.values()].sort((a, b) => b.debt - a.debt);

  return (
    <div>
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50">
          <Wallet className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Công nợ</h1>
          <p className="mt-1 text-sm text-gray-500">
            Nợ học phí (đã xác nhận thu) &amp; phân nhóm tuổi nợ quá hạn
          </p>
        </div>
      </div>

      {/* Aging summary từ installment quá hạn */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Tổng nợ (đăng ký)</div>
          <div className="mt-1 text-lg font-bold text-gray-900">
            {vnd(totalDebt)}
          </div>
        </div>
        {BUCKETS.map((b) => (
          <div
            key={b}
            className="rounded-lg border border-neutral-200 bg-white p-3"
          >
            <div className="text-xs text-neutral-500">{BUCKET_LABEL[b]}</div>
            <div className="mt-1 text-lg font-bold text-gray-900">
              {vnd(bucketTotals[b])}
            </div>
          </div>
        ))}
      </div>
      {/* Hai cách đo KHÁC phạm vi — không phải lỗi khi tổng lệch nhau: */}
      <p className="mb-6 -mt-3 text-xs text-neutral-400">
        “Tổng nợ (đăng ký)” tính theo <b>ghi danh</b> = học phí − khoản kế toán ĐÃ xác
        nhận. Các ô tuổi nợ tính theo <b>đợt thanh toán đơn hàng có hạn</b> (chỉ đơn có
        lịch trả góp) — hai phạm vi khác nhau nên có thể không bằng nhau.
      </p>

      <DebtFilterBar groupBy={groupBy} search={search} />

      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nhóm</TableHead>
              <TableHead className="text-right">Số đăng ký</TableHead>
              <TableHead className="text-right">Tổng nợ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupList.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="py-8 text-center text-sm text-neutral-500"
                >
                  Không có công nợ phù hợp bộ lọc
                </TableCell>
              </TableRow>
            )}
            {groupList.map((g) => (
              <TableRow key={g.label}>
                <TableCell className="font-medium">{g.label}</TableCell>
                <TableCell className="text-right">{g.count}</TableCell>
                <TableCell className="text-right font-semibold">
                  {vnd(g.debt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="mt-3 text-xs text-neutral-400">
        Ô tuổi nợ tổng hợp từ các đợt thanh toán còn hạn/quá hạn (
        <Badge className={BUCKET_BADGE[">30"]}>{BUCKET_LABEL[">30"]}</Badge> ưu
        tiên xử lý trước).
      </p>
    </div>
  );
}

function groupLabel(
  row: DebtRow,
  key: GroupKey,
  centerNames: Map<string, string>,
): string {
  switch (key) {
    case "student":
      return row.studentName || row.studentId || "(Không rõ học viên)";
    case "center":
      return row.centerId
        ? (centerNames.get(row.centerId) ?? row.centerId)
        : "(Không rõ cơ sở)";
    case "enrollment":
    default:
      // Tên HV + khoá (thay vì cuid thô "luancon · cmqz5if8").
      return row.studentName
        ? `${row.studentName}${row.courseName ? ` · ${row.courseName}` : ""}`
        : (row.courseName ?? "(Không rõ ghi danh)");
  }
}
