import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, ClipboardList, Pencil } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission, checkPermissionDetail } from "@/lib/auth/check-permission";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { EnrollmentStatus, type Prisma } from "@prisma/client";
import { DeleteEnrollmentButton } from "./_components/delete-enrollment-button";
import { formatDateVN } from "@/lib/format/date";
import { canViewLeadPii } from "@/lib/auth/check-permission";
import { maskPhone } from "@/lib/utils";
import { phoneSearchTerm } from "@/lib/phone";
import { ENROLLMENT_ACTIVE_STATUSES } from "@/lib/enrollment-status";
import { OpenDmButton } from "@/components/chat/open-dm-button";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đăng ký học | Admin" };

const STATUS_INFO: Record<EnrollmentStatus, { label: string; color: string }> = {
  PENDING: { label: "Chờ xếp", color: "bg-muted text-foreground" },
  CONFIRMED: { label: "Đã xếp", color: "bg-state-warning-soft text-state-warning-ink" },
  STUDYING: { label: "Đang học", color: "bg-state-success-soft text-state-success-ink" },
  PAUSED: { label: "Bảo lưu", color: "bg-state-warning-soft text-state-warning-ink" },
  COMPLETED: { label: "Hoàn thành", color: "bg-state-info-soft text-state-info-ink" },
  WITHDREW: { label: "Đã rút", color: "bg-state-danger-soft text-state-danger-ink" },
  TRANSFERRED: { label: "Đã chuyển", color: "bg-primary-soft text-primary" },
  // Legacy values
  ACTIVE: { label: "Đang học (legacy)", color: "bg-state-success-soft text-state-success-ink" },
  CANCELLED: { label: "Đã huỷ", color: "bg-state-danger-soft text-state-danger-ink" },
};

const DEFAULT_ACTIVE_STATUSES: EnrollmentStatus[] = [
  "PENDING",
  "CONFIRMED",
  "STUDYING",
  "ACTIVE",
];

const VALID_STATUSES = Object.values(EnrollmentStatus);

function formatDate(d: Date | null) {
  if (!d) return "—";
  return formatDateVN(d);
}

interface SearchParams {
  searchParams: Promise<{
    q?: string;
    status?: string;
    classId?: string;
    centerId?: string;
  }>;
}

export default async function EnrollmentsAdminPage({ searchParams }: SearchParams) {
  // P1-a: trang Đăng ký học KHÔNG dành cho GV — chỉ quản lý/sale/kế toán (view-all).
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("enrollments:view-all"))) redirect("/dashboard");
  const canDelete = await checkPermission("enrollments:delete");
  const canViewPii = await canViewLeadPii(); // che SĐT PH nếu thiếu quyền
  // US-03 (TS-02): DENY cấp trường từ grant nhóm — che parentPhone kể cả khi
  // đường cũ vẫn cho xem PII (đồng nhất với trang /students).
  const { fieldMask } = await checkPermissionDetail("students:view-all");
  const phoneMasked = fieldMask.includes("parentPhone");

  // Cách ly cơ sở (FL3-02): Enrollment giờ ∈ SCOPED_MODELS → scopedDb tự inject
  // `Enrollment.centerId IN visibleCenters`. KHÔNG còn scope tay qua class.centerId.
  // Bộ lọc cơ sở của UI (centerFilter) áp thẳng lên Enrollment.centerId; nếu chọn cơ sở
  // ngoài tầm nhìn → auto-scope AND nó về rỗng (không lộ data cơ sở khác).
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  // SĐT lưu 2 dạng (0… cũ / 84… mới) — tìm theo phần lõi để không sót.
  const qPhone = q ? (phoneSearchTerm(q) ?? q) : q;
  const statusParam = sp.status;
  const classFilter = sp.classId?.trim() || undefined;
  const centerFilter = sp.centerId?.trim() || undefined;

  const statusFilter: EnrollmentStatus | "active" | "all" =
    statusParam === "all"
      ? "all"
      : statusParam && VALID_STATUSES.includes(statusParam as EnrollmentStatus)
        ? (statusParam as EnrollmentStatus)
        : "active";

  const where: Prisma.EnrollmentWhereInput = {};
  if (statusFilter === "active") {
    where.status = { in: DEFAULT_ACTIVE_STATUSES };
  } else if (statusFilter !== "all") {
    where.status = statusFilter;
  }
  if (classFilter) where.classId = classFilter;

  // Bộ lọc cơ sở của UI áp thẳng lên Enrollment.centerId. Cách ly (visibleCenters) do
  // scopedDb auto-inject; chọn cơ sở ngoài tầm nhìn → AND về rỗng, không lộ data.
  if (centerFilter) where.centerId = centerFilter;

  if (q) {
    // NỢ #11 (search-oracle): chỉ cho tìm theo SĐT khi actor thấy được SĐT thật —
    // cùng điều kiện với hiển thị (canViewPii VÀ không bị DENY cấp trường TS-02).
    where.OR = [
      { student: { name: { contains: q, mode: "insensitive" } } },
      ...(canViewPii && !phoneMasked
        ? [
            { student: { parentPhone: { contains: qPhone } } },
            { student: { phone: { contains: qPhone } } },
          ]
        : []),
      { class: { name: { contains: q, mode: "insensitive" } } },
      { class: { classCode: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [enrollments, classes, centers] = await Promise.all([
    sdb.enrollment.findMany({
      where,
      orderBy: [{ status: "asc" }, { enrolledAt: "desc" }],
      take: 100,
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        startedAt: true,
        // F5 — hai field này là ĐỦ để dựng nút "Nhắn riêng" của sale, và cả hai nằm trên
        // hàng đã fetch sẵn nên KHÔNG tốn thêm truy vấn nào.
        saleId: true,
        student: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            parentPhone: true,
            phone: true,
            parentUserId: true,
          },
        },
        class: {
          select: {
            id: true,
            name: true,
            classCode: true,
            center: { select: { name: true } },
          },
        },
      },
    }),
    sdb.class.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, classCode: true },
      take: 200,
    }),
    sdb.center.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <ClipboardList className="h-6 w-6 text-primary" />
            Đăng ký học
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {enrollments.length > 0
              ? `${enrollments.length} đăng ký${statusFilter === "active" ? " (đang hoạt động)" : ""}`
              : "Chưa có đăng ký nào"}
          </p>
        </div>
        <Link
          href="/enrollments/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Đăng ký mới
        </Link>
      </div>

      <form
        method="GET"
        className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Tìm HS / SĐT PH / tên lớp / mã lớp..."
          className="lg:col-span-2 rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <select
          name="status"
          defaultValue={statusParam ?? "active"}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="active">Đang hoạt động (mặc định)</option>
          <option value="all">Tất cả trạng thái</option>
          <option value="PENDING">Chờ xếp</option>
          <option value="CONFIRMED">Đã xếp</option>
          <option value="STUDYING">Đang học</option>
          <option value="PAUSED">Bảo lưu</option>
          <option value="COMPLETED">Hoàn thành</option>
          <option value="WITHDREW">Đã rút</option>
          <option value="TRANSFERRED">Đã chuyển</option>
        </select>
        <select
          name="classId"
          defaultValue={classFilter ?? ""}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">Tất cả lớp</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.classCode ? `${c.classCode} · ` : ""}
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="centerId"
          defaultValue={centerFilter ?? ""}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">Tất cả cơ sở</option>
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 sm:col-span-2 lg:col-span-5"
        >
          Áp dụng bộ lọc
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <PhanTrangBang cuonNgang>
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Học viên
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Lớp / Cơ sở
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Trạng thái
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Ngày đăng ký
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Hành động
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {enrollments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Chưa có đăng ký nào khớp bộ lọc.{" "}
                    <Link href="/enrollments/new" className="text-primary hover:underline">
                      Tạo đăng ký mới →
                    </Link>
                  </td>
                </tr>
              ) : (
                enrollments.map((e) => {
                  const statusInfo =
                    STATUS_INFO[e.status] ?? {
                      label: e.status,
                      color: "bg-muted text-muted-foreground",
                    };
                  const rawPhone = e.student.parentPhone ?? e.student.phone;
                  // Hiện đầy đủ = có quyền PII VÀ không bị DENY cấp trường (TS-02).
                  const parentPhone =
                    rawPhone && (!canViewPii || phoneMasked)
                      ? maskPhone(rawPhone)
                      : rawPhone;
                  return (
                    <tr key={e.id} className="hover:bg-muted/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {e.student.avatarUrl ? (
                            <img
                              src={e.student.avatarUrl}
                              alt={e.student.name}
                              className="h-9 w-9 rounded-full border border-border object-cover"
                            />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                              {e.student.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-foreground">{e.student.name}</div>
                            {parentPhone && (
                              <div className="text-xs text-muted-foreground tabular-nums">{parentPhone}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        <div className="font-medium text-foreground">{e.class.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {e.class.classCode ? `${e.class.classCode} · ` : ""}
                          {e.class.center?.name ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
                        {formatDate(e.enrolledAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          {/* F5 — nút CHỈ hiện đúng khi server sẽ cho qua: người xem là
                              sale được gán CỦA CHÍNH ghi danh này, phụ huynh đã có tài
                              khoản, và ghi danh còn hiệu lực. Điều kiện phải TRÙNG KHÍT
                              `findSaleAssignedEnrollmentIds` (lib/chat/dm.ts) — hiện nút
                              rộng hơn server là đẩy người dùng vào PERMISSION_DENIED. */}
                          {e.saleId === session.user.id &&
                            e.student.parentUserId &&
                            (ENROLLMENT_ACTIVE_STATUSES as readonly string[]).includes(e.status) && (
                              <OpenDmButton
                                peerUserId={e.student.parentUserId}
                                kind="SALE_PARENT"
                                // ⚠️ `/admin/tin-nhan` chứ KHÔNG phải `/tin-nhan` (đường
                                // sidebar dùng). Đo trên test 10/08: bấm từ
                                // `/admin/enrollments`, Server Action trả ok kèm
                                // conversationId nhưng `router.push("/tin-nhan?c=…")`
                                // KHÔNG điều hướng — URL đứng nguyên, người dùng thấy nút
                                // như chết. Trang này nằm dưới `/admin/**` nên đi thẳng
                                // đường đã có tiền tố, không nhờ tới lớp rewrite clean-URL
                                // của proxy.
                                hrefTemplate="/admin/tin-nhan?c=:id"
                                label="Nhắn riêng"
                              />
                            )}
                          <Link
                            href={`/enrollments/${e.id}/edit`}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Sửa
                          </Link>
                          {canDelete && <DeleteEnrollmentButton id={e.id} />}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </PhanTrangBang>
      </div>
    </div>
  );
}
