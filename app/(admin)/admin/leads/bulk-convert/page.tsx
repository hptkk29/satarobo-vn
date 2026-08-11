import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { BulkConvertClient } from "./_components/bulk-convert-client";
import { PageHelp } from "@/components/admin/ui/page-help";

export const metadata = { title: "Chốt hàng loạt | Admin" };
export const dynamic = "force-dynamic";

// Chốt hàng loạt lead "đã đăng ký" (nhập liệu ban đầu CS1/CS2): mỗi lead → học viên
// + tài khoản phụ huynh (khoá SĐT, PENDING_ACTIVATION) + ghi danh vào lớp, tuỳ chọn
// ghi nhận khoản đã đóng từ trước (backdate). Bước sau của /leads/import/registered.
export default async function BulkConvertPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // leads:view-all chặn Sale: màn này liệt kê MỌI lead REGISTERED của cơ sở (kèm
  // PII) và có nhánh bỏ qua guard tiền — Sale convert lead của mình ở đường đơn lẻ.
  const allowed =
    (await checkPermission("leads:view-all")) &&
    (await checkPermission("leads:import")) &&
    (await checkPermission("students:create")) &&
    (await checkPermission("enrollments:create"));
  if (!allowed) redirect("/leads");

  const sdb = scopedDb(await resolveActor(session.user.id));

  const leads = await sdb.lead.findMany({
    where: { status: "REGISTERED", deletedAt: null },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: {
      id: true,
      parentName: true,
      phone: true,
      email: true,
      centerId: true,
      note: true,
      createdAt: true,
      children: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          fullName: true,
          dob: true,
          gradeLevel: true,
          interestedCourseId: true,
          note: true,
        },
      },
    },
  });

  // Lead nào đã có khoản RECORDED trong hệ thống → khoá ô "đã đóng" (tránh ghi đôi).
  const leadIds = leads.map((l) => l.id);
  const recorded = leadIds.length
    ? await sdb.payment.findMany({
        where: {
          saleStatus: "RECORDED",
          deletedAt: null,
          order: { leadId: { in: leadIds } },
        },
        select: { order: { select: { leadId: true } } },
      })
    : [];
  const hasPaymentLeadIds = [
    ...new Set(
      recorded
        .map((p) => p.order?.leadId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const classes = await sdb.class.findMany({
    where: {
      deletedAt: null,
      status: { in: ["PLANNED", "RECRUITING", "ACTIVE"] },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      name: true,
      classCode: true,
      courseId: true,
      centerId: true,
      course: { select: { id: true, name: true, price: true } },
    },
  });

  const centers = await sdb.center.findMany({
    select: { id: true, name: true, code: true },
    orderBy: { code: "asc" },
  });

  return (
    <div className="p-6">
      <Link
        href="/leads"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Quay lại danh sách lead
      </Link>

      <div className="mb-6 border-b border-border pb-4">
        <h1 className="text-2xl font-bold text-foreground">
          Chốt hàng loạt — lead đã đăng ký
        </h1>
      </div>

      <PageHelp>
        <p>
          Mỗi lead được chốt sẽ tạo: học viên + tài khoản phụ huynh (đăng nhập
          bằng SĐT, chờ kích hoạt tại{" "}
          <span className="font-mono">/kich-hoat</span>) + ghi danh vào lớp đã
          chọn. Nhập &quot;Đã đóng&quot; nếu khách đã nộp học phí từ trước — hệ
          thống ghi nhận khoản (lùi ngày) để công nợ phản ánh đúng; bỏ trống nếu
          chưa thu được thông tin tiền.
        </p>
      </PageHelp>

      <BulkConvertClient
        leads={leads.map((l) => ({
          id: l.id,
          parentName: l.parentName,
          phone: l.phone,
          email: l.email,
          centerId: l.centerId,
          note: l.note,
          createdAt: l.createdAt.toISOString().slice(0, 10),
          children: l.children.map((c) => ({
            id: c.id,
            fullName: c.fullName,
            dob: c.dob ? c.dob.toISOString().slice(0, 10) : "",
            gradeLevel: c.gradeLevel,
            interestedCourseId: c.interestedCourseId,
            note: c.note,
          })),
        }))}
        classes={classes.map((c) => ({
          id: c.id,
          label: c.classCode ? `${c.classCode} · ${c.name}` : c.name,
          courseId: c.courseId,
          courseName: c.course?.name ?? "",
          centerId: c.centerId,
          listPrice: c.course?.price ?? 0,
        }))}
        centers={centers}
        hasPaymentLeadIds={hasPaymentLeadIds}
      />
    </div>
  );
}
