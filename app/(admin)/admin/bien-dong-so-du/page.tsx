import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { extractOrderCode } from "@/lib/payments/sepay";
import { SepayLogClient } from "./_components/sepay-log-client";

export const metadata = { title: "Biến động số dư | Admin" };
export const dynamic = "force-dynamic";

// Trang ĐỐI SOÁT tiền về (chốt luồng 03/08): khách quét QR → SePay đẩy biến động
// số dư về webhook → hệ thống TỰ xác nhận đơn. Trang này để NHÌN xem máy đã nhận
// đúng chưa — không phải nơi xác nhận thủ công thay máy.
//
// Mỗi dòng = 1 lần webhook chạy (IntegrationLog provider "SEPAY"):
//   SUCCESS  — đã tự xác nhận đơn xong.
//   SKIPPED  — cố ý bỏ (trùng giao dịch, đơn đã xử lý).
//   FAILED   — cần người xử lý: không khớp mã đơn, trả thiếu, giảm giá chưa duyệt.
// Dòng FAILED có mã đơn đọc được thì cho đi thẳng sang đơn để xử lý tay.

type SepayPayload = {
  id?: string | number;
  gateway?: string;
  transferAmount?: number | string;
  transferType?: string;
  content?: string;
  description?: string;
  referenceCode?: string;
  accountNumber?: string;
  transactionDate?: string;
};

function readPayload(raw: unknown): SepayPayload {
  return raw && typeof raw === "object" ? (raw as SepayPayload) : {};
}

export default async function SepayLogPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Cùng quyền với sổ thu chi — người đối soát tiền mới cần trang này.
  if (!(await checkPermission("payments:manage"))) redirect("/dashboard");

  const { status } = await searchParams;
  const filter = status === "failed" || status === "success" ? status : "all";

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const rows = await sdb.integrationLog.findMany({
    where: {
      provider: "SEPAY",
      ...(filter === "failed" ? { status: "FAILED" as const } : {}),
      ...(filter === "success" ? { status: "SUCCESS" as const } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Mã đơn nằm trong nội dung CK — rút ra để tra đơn (hiển thị + link).
  const codes = [
    ...new Set(
      rows
        .map((r) => {
          const p = readPayload(r.requestPayload);
          return extractOrderCode(p.content ?? p.description);
        })
        .filter((c): c is string => Boolean(c)),
    ),
  ];
  const orders = codes.length
    ? await sdb.order.findMany({
        where: { code: { in: codes } },
        select: { id: true, code: true, status: true, totalAmount: true, customerName: true },
      })
    : [];
  const orderByCode = new Map(orders.map((o) => [o.code, o]));

  const items = rows.map((r) => {
    const p = readPayload(r.requestPayload);
    const code = extractOrderCode(p.content ?? p.description);
    const order = code ? (orderByCode.get(code) ?? null) : null;
    return {
      id: r.id,
      at: r.createdAt.toISOString(),
      action: r.action,
      status: r.status,
      error: r.errorMessage,
      amount: Number(p.transferAmount ?? 0),
      gateway: p.gateway ?? null,
      referenceCode: p.referenceCode ?? null,
      content: p.content ?? p.description ?? null,
      orderCode: code,
      order: order
        ? { id: order.id, status: order.status, totalAmount: order.totalAmount, customerName: order.customerName }
        : null,
    };
  });

  const failedCount = items.filter((i) => i.status === "FAILED").length;

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Biến động số dư (SePay)</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Tiền về tài khoản → SePay báo về → hệ thống <b>tự xác nhận đơn</b> và cấp tài
            khoản phụ huynh. Trang này để kiểm tra máy đã nhận đúng chưa; dòng{" "}
            <b>Cần xử lý</b> là giao dịch máy không tự khớp được (sai nội dung CK, trả
            thiếu, giảm giá chưa duyệt) — mở đơn và xác nhận tay.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <FilterTab href="/bien-dong-so-du" label="Tất cả" active={filter === "all"} />
          <FilterTab
            href="/bien-dong-so-du?status=failed"
            label={`Cần xử lý${failedCount ? ` (${failedCount})` : ""}`}
            active={filter === "failed"}
          />
          <FilterTab
            href="/bien-dong-so-du?status=success"
            label="Đã tự xác nhận"
            active={filter === "success"}
          />
        </div>
      </div>

      <SepayLogClient items={items} />

      <p className="mt-3 text-xs text-gray-500">
        Chỉ hiện 200 giao dịch gần nhất. Webhook chưa bật (thiếu{" "}
        <span className="font-mono">SEPAY_WEBHOOK_API_KEY</span>) thì bảng này trống —
        không phải lỗi.
      </p>
    </div>
  );
}

function FilterTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-1.5 font-medium ${
        active ? "bg-orange-600 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"
      }`}
    >
      {label}
    </Link>
  );
}
