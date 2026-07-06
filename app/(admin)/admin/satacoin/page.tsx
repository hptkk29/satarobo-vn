import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { scopedDb, getModelVisibleCenterIds } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { SataCoinAdmin } from "./_components/satacoin-admin";

export const metadata = { title: "SataCoin | Admin" };
export const dynamic = "force-dynamic";

export default async function SataCoinPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("satacoin:manage"))) redirect("/dashboard");

  // Cách ly cơ sở: Student + SataCoinTransaction ∈ SCOPED_MODELS → sdb tự inject
  // centerId IN tầm-nhìn. SataCoinRule là config (SCOPE_EXEMPT, centerId null = áp mọi
  // cơ sở) → scope thủ công: rule toàn hệ thống (null) + rule thuộc cơ sở trong tầm nhìn.
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const visibleCenters = getModelVisibleCenterIds("SataCoinTransaction", actor);
  const ruleWhere: Prisma.SataCoinRuleWhereInput =
    visibleCenters === "ALL"
      ? {}
      : { OR: [{ centerId: null }, { centerId: { in: visibleCenters } }] };

  const [rules, students, recentTxns] = await Promise.all([
    sdb.sataCoinRule.findMany({
      where: ruleWhere,
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, label: true, amount: true, isActive: true },
    }),
    sdb.student.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, studentCode: true },
    }),
    sdb.sataCoinTransaction.findMany({
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
