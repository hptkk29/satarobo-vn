import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can, hasRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { SataCoinAdmin } from "./_components/satacoin-admin";

export const metadata = { title: "SataCoin | Admin" };
export const dynamic = "force-dynamic";

export default async function SataCoinPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "satacoin:manage")) redirect("/dashboard");

  const centerScope =
    hasRole(session.user, "CENTER_MANAGER") && !hasRole(session.user, "SUPER_ADMIN")
      ? session.user.centerId
      : null;

  const [rules, students, recentTxns] = await Promise.all([
    db.sataCoinRule.findMany({
      where: centerScope ? { OR: [{ centerId: null }, { centerId: centerScope }] } : {},
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, label: true, amount: true, isActive: true },
    }),
    db.student.findMany({
      where: { deletedAt: null, ...(centerScope ? { centerId: centerScope } : {}) },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, studentCode: true },
    }),
    db.sataCoinTransaction.findMany({
      where: centerScope ? { centerId: centerScope } : {},
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        amount: true,
        type: true,
        reason: true,
        reversedTxId: true,
        createdAt: true,
        studentId: true,
        student: { select: { name: true } },
      },
    }),
  ]);

  // Đánh dấu các giao dịch đã bị đảo (để ẩn nút đảo).
  const reversedIds = new Set(recentTxns.filter((t) => t.reversedTxId).map((t) => t.reversedTxId as string));

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">SataCoin — điểm thưởng nội bộ</h1>
        <p className="text-sm text-neutral-500">
          Sổ cái bất biến: không sửa/xoá giao dịch. Điều chỉnh = ghi giao dịch đảo. Số dư = tổng giao dịch.
        </p>
      </div>

      <SataCoinAdmin
        rules={rules}
        students={students}
        recentTxns={recentTxns.map((t) => ({
          id: t.id,
          amount: t.amount,
          type: t.type,
          reason: t.reason,
          createdAt: t.createdAt.toISOString().slice(0, 10),
          studentId: t.studentId,
          studentName: t.student.name,
          isReversal: t.type === "REVERSAL",
          alreadyReversed: reversedIds.has(t.id),
        }))}
      />
    </div>
  );
}
