// #15 (câu 26) — bản IN phiếu thu (PDF). Kế toán/quản lý bấm mã phiếu ở màn thanh
// toán → mở PDF. Gate: auth + payments:manage; cách ly cơ sở qua scopedDb (findUnique
// trả null nếu khoản thuộc cơ sở khác → 404, chống IDOR). Chỉ in khi đã có phiếu ACTIVE.
import { createElement, type ReactElement } from "react";
import { NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { withFreshFonts } from "@/lib/pdf/brand";
import { ReceiptPdf, type ReceiptPdfData } from "@/lib/pdf/receipt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeFilename(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_.-]/g, "_")
    .replace(/_+/g, "_");
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(d));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!(await checkPermission("payments:manage"))) {
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  }

  const { id } = await params;
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  // Payment ∈ SCOPED_MODELS → findUnique áp passesScope (khoản cơ sở khác → null).
  const payment = await sdb.payment.findUnique({
    where: { id },
    include: {
      order: {
        select: {
          code: true,
          student: { select: { name: true, parentName: true } },
        },
      },
      enrollment: {
        select: {
          class: { select: { name: true, course: { select: { name: true } } } },
        },
      },
      receipts: {
        where: { status: "ACTIVE" },
        select: { code: true, issuedAt: true },
        orderBy: { issuedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!payment) {
    return NextResponse.json({ error: "Không tìm thấy khoản thu" }, { status: 404 });
  }

  const receipt = payment.receipts[0];
  if (!receipt) {
    return NextResponse.json(
      { error: "Khoản chưa được xác nhận — chưa có phiếu thu để in" },
      { status: 404 },
    );
  }

  // Người thu (recordedById là String thuần, không có quan hệ Prisma) + thông tin cơ sở.
  const [collector, center] = await Promise.all([
    payment.recordedById
      ? sdb.user.findUnique({
          where: { id: payment.recordedById },
          select: { name: true },
        })
      : Promise.resolve(null),
    payment.centerId
      ? sdb.center.findUnique({
          where: { id: payment.centerId },
          select: { name: true, address: true },
        })
      : Promise.resolve(null),
  ]);

  const data: ReceiptPdfData = {
    receiptCode: receipt.code,
    centerName: center?.name ?? "Sata Robo",
    centerAddress: center?.address ?? null,
    issuedAt: fmtDate(receipt.issuedAt),
    studentName: payment.order?.student?.name ?? null,
    parentName: payment.order?.student?.parentName ?? null,
    className: payment.enrollment?.class?.name ?? null,
    courseName: payment.enrollment?.class?.course?.name ?? null,
    amount: payment.amount,
    method: payment.method,
    paidDate: fmtDate(payment.paidDate),
    collectedByName: collector?.name ?? null,
    orderCode: payment.order?.code ?? null,
  };

  let pdf: Buffer;
  try {
    pdf = await withFreshFonts(() =>
      renderToBuffer(
        createElement(ReceiptPdf, { data }) as unknown as ReactElement<DocumentProps>,
      ),
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Lỗi tạo PDF: ${err instanceof Error ? err.message : "Unknown"}` },
      { status: 500 },
    );
  }

  const filename = `PhieuThu-${safeFilename(receipt.code)}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
