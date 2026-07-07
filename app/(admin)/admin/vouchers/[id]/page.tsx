import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  VOUCHER_TYPE_LABEL,
  VOUCHER_DISCOUNT_KIND_LABEL,
} from "@/lib/validators/voucher";

export const metadata = { title: "Chi tiết voucher | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const VALIDITY_BADGE_CLASS = {
  expired: "bg-red-100 text-red-800 hover:bg-red-100",
  upcoming: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
  active: "bg-green-100 text-green-800 hover:bg-green-100",
} as const;

function getValidity(
  validFrom: Date,
  validUntil: Date,
): { label: string; key: keyof typeof VALIDITY_BADGE_CLASS } {
  const now = new Date();
  if (validUntil < now) return { label: "Hết hạn", key: "expired" };
  if (validFrom > now) return { label: "Chưa bắt đầu", key: "upcoming" };
  return { label: "Trong hạn", key: "active" };
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function VoucherDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Gate trước khi fetch — vouchers:view/manage không có centerId để scope theo (GLOBAL).
  if (!(await checkPermission("vouchers:view"))) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;
  // Voucher/VoucherRedemption là catalog + sổ đổi mã toàn cục (không scoped) —
  // pass-through. Include order là quan hệ to-one (không auto-scope được — AC7);
  // vouchers:view là quyền GLOBAL nên giữ nguyên hành vi.
  const sdb = scopedDb(await resolveActor(session.user.id));
  const voucher = await sdb.voucher.findUnique({
    where: { id },
    include: {
      redemptions: {
        include: {
          order: {
            select: {
              id: true,
              code: true,
              customerName: true,
              totalAmount: true,
              status: true,
              createdAt: true,
            },
          },
        },
        orderBy: { redeemedAt: "desc" },
        take: 100,
      },
    },
  });
  if (!voucher) notFound();

  // vouchers:manage chỉ HO_ACCOUNTANT (GLOBAL) — không cần target.
  const canManage = await checkPermission("vouchers:manage");

  const totalDiscount = voucher.redemptions.reduce(
    (s, r) => s + r.discountApplied,
    0,
  );
  const remaining =
    voucher.quantity != null ? voucher.quantity - voucher.usedCount : null;
  const validity = getValidity(voucher.validFrom, voucher.validUntil);

  return (
    <div className="max-w-5xl">
      <Link
        href="/vouchers"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Quay lại danh sách
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-bold text-gray-900">
              {voucher.code}
            </h1>
            <Badge variant="outline">{VOUCHER_TYPE_LABEL[voucher.type]}</Badge>
            <Badge className={VALIDITY_BADGE_CLASS[validity.key]}>
              {validity.label}
            </Badge>
            {voucher.isActive ? (
              <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                Hoạt động
              </Badge>
            ) : (
              <Badge className="bg-gray-200 text-gray-700 hover:bg-gray-200">
                Tắt
              </Badge>
            )}
          </div>
          <p className="mt-2 text-lg text-gray-900">{voucher.name}</p>
          {voucher.description && (
            <p className="mt-1 text-sm text-gray-600">{voucher.description}</p>
          )}
        </div>
        {canManage && (
          <Link href={`/vouchers/${voucher.id}/edit`}>
            <Button variant="outline">
              <Pencil className="h-4 w-4" />
              Sửa
            </Button>
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-blue-50 p-4">
          <div className="text-xs uppercase tracking-wider text-gray-600">
            Đã dùng
          </div>
          <div className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">
            {voucher.usedCount}
          </div>
          <div className="text-xs text-gray-500">
            {voucher.quantity != null
              ? `/ ${voucher.quantity}`
              : "/ không giới hạn"}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-green-50 p-4">
          <div className="text-xs uppercase tracking-wider text-gray-600">
            Còn lại
          </div>
          <div className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">
            {remaining != null ? remaining : "∞"}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-orange-50 p-4">
          <div className="text-xs uppercase tracking-wider text-gray-600">
            Tổng tiền giảm
          </div>
          <div className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">
            {totalDiscount.toLocaleString("vi-VN")}
          </div>
          <div className="text-xs text-gray-500">VND</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-purple-50 p-4">
          <div className="text-xs uppercase tracking-wider text-gray-600">
            Loại giảm
          </div>
          <div className="mt-1 text-base font-bold text-gray-900">
            {VOUCHER_DISCOUNT_KIND_LABEL[voucher.discountKind]}
          </div>
          <div className="text-xs text-gray-500">
            {voucher.discountKind === "PERCENT"
              ? `${voucher.discountPercent}%${voucher.maxDiscount ? `, max ${voucher.maxDiscount.toLocaleString("vi-VN")}đ` : ""}`
              : `${voucher.discountAmount?.toLocaleString("vi-VN") ?? "—"}đ`}
          </div>
        </div>
      </div>

      {/* Config */}
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
          Cấu hình
        </h2>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-gray-500">Đơn tối thiểu: </span>
            <span className="text-gray-900">
              {voucher.minOrderValue.toLocaleString("vi-VN")} đ
            </span>
          </div>
          <div>
            <span className="text-gray-500">Mỗi SĐT tối đa: </span>
            <span className="text-gray-900">
              {voucher.usageLimitPerUser} lần
            </span>
          </div>
          <div>
            <span className="text-gray-500">Hiệu lực từ: </span>
            <span className="tabular-nums text-gray-900">
              {formatDateTime(voucher.validFrom)}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Hết hạn: </span>
            <span className="tabular-nums text-gray-900">
              {formatDateTime(voucher.validUntil)}
            </span>
          </div>
        </div>
      </section>

      {/* Redemption history */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
          Lịch sử sử dụng ({voucher.redemptions.length})
        </h2>
        {voucher.redemptions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center">
            <p className="text-sm text-gray-500">
              Chưa có ai sử dụng voucher này
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Đơn hàng</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>SĐT</TableHead>
                  <TableHead className="text-right">Tổng đơn</TableHead>
                  <TableHead className="text-right">Tiền giảm</TableHead>
                  <TableHead>Sử dụng lúc</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {voucher.redemptions.map((r) => (
                  <TableRow key={r.id} className="hover:bg-gray-50/60">
                    <TableCell>
                      <Link
                        href={`/orders/${r.order.id}`}
                        className="font-mono text-sm text-blue-600 hover:underline"
                      >
                        {r.order.code}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-gray-900">
                      {r.order.customerName}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-gray-700">
                      {r.customerPhone}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {r.order.totalAmount.toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="text-right font-medium text-red-600 tabular-nums">
                      -{r.discountApplied.toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-gray-600">
                      {formatDateTime(r.redeemedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
