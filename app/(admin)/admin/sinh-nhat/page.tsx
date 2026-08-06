import Link from "next/link";
import { redirect } from "next/navigation";
import { Cake } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkAnyPermission, checkPermission } from "@/lib/auth/check-permission";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { getSetting } from "@/lib/settings/service";
import { formatDayKeyDMY, shiftDayKey, vnDayKey, vnDayStartUtc } from "@/lib/students/birthday-dates";
import { CelebrateButton, RunScanButton } from "./_components/birthday-actions";

export const metadata = { title: "Sinh nhật học viên | Admin" };
export const dynamic = "force-dynamic";

/** Nhãn cột ZNS. SIMULATED phải nói rõ "chưa gửi thật" — đọc nhầm là không ai chúc bé. */
const ZNS_LABEL: Record<string, { text: string; cls: string }> = {
  SENT: { text: "Đã gửi", cls: "bg-emerald-100 text-emerald-700" },
  SIMULATED: { text: "Mô phỏng (chưa gửi thật)", cls: "bg-amber-100 text-amber-700" },
  SKIPPED: { text: "Bỏ qua (mẫu/SĐT chưa có)", cls: "bg-gray-100 text-gray-600" },
  FAILED: { text: "Lỗi gửi", cls: "bg-rose-100 text-rose-700" },
};

export default async function BirthdayPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkAnyPermission(PAGE_GATES["/sinh-nhat"]))) redirect("/dashboard");

  const canScan = await checkPermission("students:edit");
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const now = new Date();
  const todayKey = vnDayKey(now);
  const alertDays = await getSetting("student.birthdayAlertDaysBefore");

  // Cửa sổ hiển thị: 30 ngày quanh hôm nay (7 ngày đã qua để soát việc bị lỡ).
  // Cách ly cơ sở do scopedDb tự lo — StudentBirthdayGreeting ∈ SCOPED_MODELS.
  const rows = await sdb.studentBirthdayGreeting.findMany({
    where: {
      birthdayDate: {
        gte: vnDayStartUtc(shiftDayKey(todayKey, -7)),
        lt: vnDayStartUtc(shiftDayKey(todayKey, 31)),
      },
    },
    orderBy: [{ celebrationDate: "asc" }, { birthdayDate: "asc" }],
    take: 300,
    select: {
      id: true,
      birthdayDate: true,
      celebrationDate: true,
      celebrationSessionId: true,
      celebratedAt: true,
      znsStatus: true,
      student: { select: { id: true, name: true } },
    },
  });

  return (
    <div className="max-w-6xl p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Cake className="h-6 w-6 text-[#7C3AED]" /> Sinh nhật học viên
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Hôm sinh nhật không có lớp thì buổi chúc mừng được xếp vào{" "}
            <strong>buổi học gần nhất trước đó</strong>. Hệ thống báo trước {alertDays} ngày so với
            buổi tổ chức (đổi ở Cấu hình vận hành). Học viên chưa xếp lớp / lớp đã kết thúc không
            hiện ở đây.
          </p>
        </div>
        {canScan && <RunScanButton />}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          Không có sinh nhật nào trong 30 ngày tới. Nếu vừa nhập ngày sinh, bấm “Chạy quét sinh
          nhật”.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-2">Học viên</th>
                <th className="px-4 py-2">Ngày sinh nhật</th>
                <th className="px-4 py-2">Buổi tổ chức</th>
                <th className="px-4 py-2">Tin Zalo</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const birthdayKey = vnDayKey(r.birthdayDate);
                const celebrationKey = r.celebrationDate ? vnDayKey(r.celebrationDate) : null;
                const isToday = birthdayKey === todayKey;
                const missed = !r.celebratedAt && celebrationKey !== null && celebrationKey < todayKey;
                const zns = r.znsStatus ? ZNS_LABEL[r.znsStatus] : null;

                return (
                  <tr key={r.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2 font-medium text-gray-900">
                      <Link
                        href={`/students/${r.student.id}/edit`}
                        className="text-[#7C3AED] hover:underline"
                      >
                        {r.student.name}
                      </Link>
                      {isToday && (
                        <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                          HÔM NAY
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-700">{formatDayKeyDMY(birthdayKey)}</td>
                    <td className="px-4 py-2 text-gray-700">
                      {celebrationKey ? (
                        r.celebrationSessionId ? (
                          <Link
                            href={`/sessions/${r.celebrationSessionId}`}
                            className="text-[#7C3AED] hover:underline"
                          >
                            {formatDayKeyDMY(celebrationKey)}
                          </Link>
                        ) : (
                          formatDayKeyDMY(celebrationKey)
                        )
                      ) : (
                        "—"
                      )}
                      {celebrationKey !== null && celebrationKey !== birthdayKey && (
                        <span className="block text-xs text-gray-400">tổ chức trước sinh nhật</span>
                      )}
                      {missed && (
                        <span className="block text-xs font-semibold text-rose-600">
                          buổi đã qua, chưa chúc
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {zns ? (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${zns.cls}`}>
                          {zns.text}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">chưa tới ngày</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {r.celebratedAt && (
                          <span className="text-xs font-medium text-emerald-700">đã chúc</span>
                        )}
                        <CelebrateButton id={r.id} done={r.celebratedAt !== null} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
