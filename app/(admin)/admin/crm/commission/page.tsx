import { redirect } from "next/navigation";
import { Coins } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatementActions } from "./_components/statement-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hoa hồng | Admin" };

export default async function CommissionPage() {
  await auth();
  if (!(await checkPermission("payments:manage"))) redirect("/admin/dashboard");

  const statements = await db.commissionStatement.findMany({
    orderBy: { period: "desc" },
    include: { lines: { select: { amount: true } } },
  });

  return (
    <div>
      <h1 className="mb-6 flex items-center gap-2 text-3xl font-black text-neutral-900">
        <Coins className="h-7 w-7 text-orange-500" />
        Bảng hoa hồng theo kỳ
      </h1>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kỳ</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Số dòng</TableHead>
              <TableHead className="text-right">Tổng (VND)</TableHead>
              <TableHead className="text-right">Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-neutral-500">
                  Chưa có bảng hoa hồng nào.
                </TableCell>
              </TableRow>
            ) : (
              statements.map((s) => {
                const total = s.lines.reduce((sum, l) => sum + l.amount, 0);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono font-semibold">{s.period}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "APPROVED" ? "default" : "secondary"}>{s.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{s.lines.length}</TableCell>
                    <TableCell className="text-right">{total.toLocaleString("vi-VN")}</TableCell>
                    <TableCell>
                      <StatementActions period={s.period} status={s.status} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
