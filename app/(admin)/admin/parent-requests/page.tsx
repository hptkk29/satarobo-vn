import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import type { Prisma, ParentRequestStatus } from "@prisma/client";
import { RequestRow } from "./_components/request-row";

export const metadata = { title: "Yêu cầu phụ huynh | Admin" };
export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string; status?: ParentRequestStatus }[] = [
  { key: "pending", label: "Chờ xử lý", status: "PENDING" },
  { key: "all", label: "Tất cả" },
  { key: "approved", label: "Đã duyệt", status: "APPROVED" },
  { key: "rejected", label: "Từ chối", status: "REJECTED" },
];

interface Props {
  searchParams: Promise<{ filter?: string }>;
}

export default async function ParentRequestsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "parent-requests:manage")) redirect("/dashboard");

  const { filter } = await searchParams;
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];

  const where: Prisma.ParentRequestWhereInput = active.status
    ? { status: active.status }
    : {};

  const rows = await db.parentRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      student: {
        select: {
          name: true,
          studentCode: true,
          enrollments: {
            where: { status: { in: ["CONFIRMED", "STUDYING", "ACTIVE"] } },
            select: { class: { select: { name: true } } },
            take: 1,
          },
        },
      },
    },
  });

  const items = rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    content: r.content,
    preferredDate: r.preferredDate?.toISOString() ?? null,
    response: r.response,
    createdAt: r.createdAt.toISOString(),
    studentName: r.student.name,
    studentCode: r.student.studentCode,
    className: r.student.enrollments[0]?.class.name ?? null,
    handledByName: r.handledByName,
  }));

  return (
    <div className="max-w-4xl p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Yêu cầu phụ huynh</h1>
        <p className="mt-1 text-sm text-gray-500">
          Báo vắng · học bù · chuyển lớp/cơ sở · bảo lưu — duyệt rồi xử lý nghiệp
          vụ ở module tương ứng.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/parent-requests?filter=${f.key}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              active.key === f.key
                ? "bg-orange-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          Không có yêu cầu nào.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <RequestRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
