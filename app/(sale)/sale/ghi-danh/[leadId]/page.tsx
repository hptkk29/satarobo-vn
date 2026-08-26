// Chuyển khách thành học viên — bước cuối của phễu.
//
// KHÔNG nhân bản nghiệp vụ: dùng thẳng `<ConvertForm>` và `submitConvertV2` của
// khu quản trị. Đó là chỗ đắt nhất để có hai bản — khoá chống double-submit
// (idempotencyKey sha256), atomic-claim lead→ENROLLED chống hai người chốt cùng
// lúc, tạo tài khoản phụ huynh chờ kích hoạt, sinh mã học viên. Hai bản của
// những thứ đó là hai bản sẽ trôi khác nhau, và trôi ở đây nghĩa là sai học viên
// hoặc sai tiền.
//
// Trang chỉ làm ba việc: gác cổng, nạp dữ liệu chọn lớp, và bảo form quay về đâu.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission, canViewLeadPii } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { isConvertV2Enabled } from "@/lib/flags";
import { getMyLeadDetail } from "@/lib/lead/sale-leads";
import { getSaleLeadOrders } from "@/lib/orders/sale-orders";
import { formatVndPlain } from "@/lib/format/money";
import { ConvertForm } from "@/app/(admin)/admin/leads/[id]/convert/convert-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ghi danh | Tư vấn tuyển sinh" };

export default async function SaleGhiDanhPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fkhach-cua-toi");

  const { leadId } = await params;

  // Cờ tắt → màn này không tồn tại. Gác ở CẢ trang lẫn action (action tự kiểm
  // lại) vì trang chỉ chặn người bấm, không chặn người gọi thẳng.
  if (!isConvertV2Enabled()) redirect(`/sale/khach-cua-toi/${leadId}`);

  // Chốt = tạo học viên + ghi danh ⇒ cần CẢ HAI quyền. Không gộp vào PAGE_GATES
  // vì bảng đó dùng phép HOẶC, mà ở đây phải là VÀ — hai quyền này tách nhau có
  // chủ đích (Marketing có thể có một mà không có cái kia).
  const duocChot =
    (await checkPermission("students:create")) && (await checkPermission("enrollments:create"));
  if (!duocChot) redirect(`/sale/khach-cua-toi/${leadId}`);

  const actor = await resolveActor(session.user.id);
  const canViewPii = await canViewLeadPii();
  const lead = await getMyLeadDetail(actor, session.user.id, leadId, canViewPii);
  if (!lead) notFound();

  const sdb = scopedDb(actor);
  const [donHang, lopMo, donHocPhi] = await Promise.all([
    getSaleLeadOrders(actor, session.user.id, lead.id),
    // Lớp đang mở, ưu tiên cùng cơ sở với khách — chọn lớp cơ sở khác là tạo ra
    // đúng cái ghi danh mà chính người ghi không mở được sau đó.
    sdb.class.findMany({
      where: {
        deletedAt: null,
        status: { in: ["PLANNED", "RECRUITING", "ACTIVE"] },
        ...(lead.centerId ? { centerId: lead.centerId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        classCode: true,
        courseId: true,
        course: { select: { id: true, name: true, price: true } },
      },
    }),
    // FL2-01 — đơn học phí gắn khách, để form chia 1/2 đợt.
    sdb.order.findFirst({
      where: { leadId: lead.id, type: "COURSE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, totalAmount: true },
    }),
  ]);

  const daGhiNhan = donHang?.tongDaGhiNhan ?? 0;

  return (
    <div>
      <Link
        href={`/sale/khach-cua-toi/${lead.id}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Quay lại khách
      </Link>

      <h1 className="text-2xl font-bold text-foreground">Ghi danh</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {lead.parentName || "(chưa có tên)"}
        {lead.phone ? ` · ${lead.phone}` : ""}
      </p>

      {/* Điều kiện chốt nói TRƯỚC khi người dùng điền xong cả form rồi mới bị từ
          chối. Server vẫn là nơi quyết định (mã PAYMENT_REQUIRED) — đây chỉ để
          không ai gõ mười ô rồi mới biết thiếu tiền. */}
      {daGhiNhan <= 0 ? (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-card p-4 text-sm">
          <p className="font-semibold text-amber-600 dark:text-amber-500">
            Chưa ghi nhận khoản thu nào
          </p>
          <p className="mt-1 text-muted-foreground">
            Hệ thống chặn chốt khi khách chưa đóng tiền. Tạo đơn và ghi nhận thanh
            toán ở trang khách trước đã.
          </p>
          <Link
            href={`/sale/khach-cua-toi/${lead.id}`}
            className="mt-2 inline-block font-medium text-primary hover:underline"
          >
            Mở trang khách →
          </Link>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Đã ghi nhận <strong className="text-foreground">{formatVndPlain(daGhiNhan)}</strong>
          {donHang && donHang.conThieu > 0
            ? ` · còn thiếu ${formatVndPlain(donHang.conThieu)}`
            : ""}
        </p>
      )}

      {lopMo.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Cơ sở của khách chưa có lớp nào đang mở. Báo quản lý cơ sở mở lớp trước
          khi chốt.
        </p>
      ) : (
        <div className="mt-5">
          <ConvertForm
            leadId={lead.id}
            // S-1 — `lead` ở đây ĐÃ được `getMyLeadDetail` che theo `canViewPii`.
            // Điền bản che vào ô nhập là mời người dùng bấm Lưu và tạo ra một phụ
            // huynh tên "Nguyễn T. L." — `submitConvertV2` nhận thẳng chuỗi này và
            // schema KHÔNG validate tên. Để trống thì form chặn ngay, hỏng sớm và
            // thấy được. (Giống hệt `/admin/leads/[id]/convert`.)
            defaultParentName={canViewPii ? (lead.parentName ?? "") : ""}
            defaultParentEmail={canViewPii ? (lead.email ?? "") : ""}
            defaultParentPhone={canViewPii ? (lead.phone ?? "") : ""}
            prefillStudents={
              lead.children.length > 0
                ? lead.children.map((c) => ({
                    leadChildId: c.id,
                    name: c.fullName,
                    dob: "",
                    courseId: "",
                  }))
                : [{ leadChildId: null, name: lead.childName ?? "", dob: "", courseId: "" }]
            }
            classes={lopMo.map((c) => ({
              id: c.id,
              label: c.classCode ? `${c.classCode} · ${c.name}` : c.name,
              courseId: c.courseId,
              courseName: c.course?.name ?? "",
              listPrice: c.course?.price ?? 0,
            }))}
            order={donHocPhi}
            // Ở LẠI site Sale sau khi chốt. Mặc định của form là clean-URL admin,
            // mà đường đó trên host sale sẽ đá sang host khác.
            backHref={`/sale/khach-cua-toi/${lead.id}`}
            // Màn gộp hồ sơ trùng là của Super Admin/Quản lý — vẽ liên kết cho
            // Sale là cho họ bấm vào rồi bị đá ra.
            conflictHref={null}
          />
        </div>
      )}
    </div>
  );
}
