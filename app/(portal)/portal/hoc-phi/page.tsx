import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getParentBilling } from "@/lib/portal/billing";
import { hotlinesInline } from "@/lib/locations";

export const dynamic = "force-dynamic";
export const metadata = { title: "Học phí | Sata Robo", robots: { index: false } };

// Trạng thái ghi danh (Enrollment) — nguồn R7-04, KHÔNG còn đọc Order cũ.
const ENROLLMENT_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Chờ xác nhận", cls: "bg-amber-100 text-amber-700" },
  CONFIRMED: { label: "Đã xác nhận", cls: "bg-sky-100 text-sky-700" },
  STUDYING: { label: "Đang học", cls: "bg-emerald-100 text-emerald-700" },
  ACTIVE: { label: "Đang học", cls: "bg-emerald-100 text-emerald-700" },
  PAUSED: { label: "Tạm ngưng", cls: "bg-orange-100 text-orange-700" },
  COMPLETED: { label: "Hoàn tất", cls: "bg-neutral-100 text-neutral-600" },
  WITHDREW: { label: "Đã nghỉ", cls: "bg-neutral-100 text-neutral-500" },
  TRANSFERRED: { label: "Đã chuyển lớp", cls: "bg-neutral-100 text-neutral-500" },
  CANCELLED: { label: "Đã huỷ", cls: "bg-neutral-100 text-neutral-500" },
};

function vnd(n: number): string {
  return n.toLocaleString("vi-VN") + "đ";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN");
}

export default async function HocPhiPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") redirect("/login");

  const { enrollments, receipts, totals, flags } = await getParentBilling(session.user.id);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-neutral-900">Học phí</h1>

      {/* Tổng quan: tổng học phí / đã thanh toán / còn nợ */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Tổng học phí</p>
          <p className="mt-1 text-lg font-bold text-neutral-900">{vnd(totals.tuition)}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs text-emerald-700">Đã thanh toán</p>
          <p className="mt-1 text-lg font-bold text-emerald-800">{vnd(totals.paid)}</p>
        </div>
        <div
          className={`rounded-xl border p-4 ${
            totals.outstanding > 0
              ? "border-amber-200 bg-amber-50"
              : "border-neutral-200 bg-white"
          }`}
        >
          <p className={`text-xs ${totals.outstanding > 0 ? "text-amber-700" : "text-neutral-500"}`}>
            Còn nợ
          </p>
          <p
            className={`mt-1 text-lg font-bold ${
              totals.outstanding > 0 ? "text-amber-800" : "text-neutral-900"
            }`}
          >
            {vnd(totals.outstanding)}
          </p>
        </div>
      </div>

      {totals.outstanding > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Vui lòng liên hệ trung tâm ({hotlinesInline()}) để được hướng dẫn thanh toán
          khoản còn lại.
        </div>
      )}

      {/* D5/G.6 — chỉ dấu trạng thái (KHÔNG hiển thị số tiền khoản chưa xác nhận — giữ AC1) */}
      {(flags.pendingCount > 0 || flags.rejectedCount > 0) && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
          {flags.pendingCount > 0 && (
            <p>
              Có <b>{flags.pendingCount}</b> khoản đang chờ kế toán xác nhận. Số tiền sẽ
              được cập nhật vào mục “Đã thanh toán” sau khi được xác nhận.
            </p>
          )}
          {flags.rejectedCount > 0 && (
            <p className="mt-1">
              Có <b>{flags.rejectedCount}</b> khoản bị từ chối — vui lòng liên hệ trung tâm
              ({hotlinesInline()}) để được hỗ trợ.
            </p>
          )}
        </div>
      )}

      {/* Học phí theo ghi danh */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-700">Theo lớp / ghi danh</h2>
        {enrollments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
            Chưa có ghi danh nào.
          </p>
        ) : (
          <ul className="space-y-2">
            {enrollments.map((e) => {
              const st = ENROLLMENT_STATUS[e.status] ?? {
                label: e.status,
                cls: "bg-neutral-100 text-neutral-600",
              };
              return (
                <li
                  key={e.enrollmentId}
                  className="rounded-xl border border-neutral-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-neutral-900">
                        {e.className ?? "Lớp"}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {e.studentName ? `${e.studentName} · ` : ""}
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}
                        >
                          {st.label}
                        </span>
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-bold text-neutral-900">{vnd(e.finalPrice)}</p>
                      <p className="text-xs text-emerald-700">
                        Đã trả {vnd(e.confirmedPaid)}
                      </p>
                      {e.outstanding > 0 && (
                        <p className="text-xs font-semibold text-amber-700">
                          Còn {vnd(e.outstanding)}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Biên lai đã xác nhận */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-700">Biên lai đã xác nhận</h2>
        {receipts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-400">
            Chưa có biên lai nào được xác nhận.
          </p>
        ) : (
          <ul className="space-y-2">
            {receipts.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white p-4 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900">
                    {r.receiptCode ?? "Biên lai"}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {r.studentName ? `${r.studentName} · ` : ""}
                    {r.method} ·{" "}
                    {r.confirmedAt ? fmtDate(r.confirmedAt) : fmtDate(r.paidDate)}
                  </p>
                </div>
                <p className="font-bold text-emerald-700">{vnd(r.amount)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
