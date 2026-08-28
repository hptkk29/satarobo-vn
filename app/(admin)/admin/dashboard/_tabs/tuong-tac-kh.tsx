// Tab "Tương tác KH" (khu vực E) — E-01 · E-02 · E-03.
//
// Nhận `filters` do page cha giải MỘT LẦN bằng `resolveScopeFilters()` — cả 4 tab dùng
// CHUNG một bộ lọc (A-02-3).
//
// 🔴 HAI CỔNG QUYỀN TÁCH NHAU, cố ý không gộp:
//   (a) vào được tab — gate ở trang dashboard;
//   (b) thấy cột SĐT — `canViewParentContact`.
// Không đạt (b) thì RSC **không select** `phone` (xem `parent-interaction.ts`), chứ không
// select rồi che ở UI: che ở UI thì số điện thoại vẫn nằm trong payload và ai mở tab
// Network cũng đọc được.

import Link from "next/link";
import type { Actor } from "@/lib/auth/actor";
import type { ScopeFilters } from "@/lib/reports/filters";
import { countSessionGaps } from "@/lib/dashboard/tuong-tac/session-gaps";
import {
  getParentInteractionRows,
  getParentInteractionStats,
} from "@/lib/dashboard/tuong-tac/parent-interaction";
import { canViewParentContact } from "@/lib/auth/permissions";
import { vnYmd } from "@/lib/time/vn";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { CHAT_PARAM } from "@/components/admin/tuong-tac/chat-panel";
import type { Session } from "next-auth";

const pct = (r: number | null) => (r == null ? "—" : `${(r * 100).toFixed(1).replace(".", ",")}%`);
const dmy = (d: Date | null) => (d ? d.toLocaleDateString("vi-VN") : "—");

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export async function TabTuongTacKh({
  actor,
  filters,
  user,
  currentQuery,
}: {
  actor: Actor;
  filters: ScopeFilters;
  user: Session["user"];
  /**
   * Querystring HIỆN TẠI của dashboard, ĐÃ bỏ khoá `chat` (do trang cha dựng).
   *
   * Nhận chuỗi thay vì tự đọc `searchParams`: cả 4 tab dùng CHUNG một bộ lọc và trang
   * cha đã giải nó đúng một lần. Tab tự parse lần hai là hai bộ parse lệch nhau — hỏng câm.
   */
  currentQuery: string;
}) {
  // Cổng (b). CỐ Ý gọi hàm dùng chung thay vì chép danh sách vai vào đây — hai bản sao
  // danh sách vai là hai luật, và lần trước chính hai bản sao đẻ ra mâu thuẫn phải dọn.
  const canSeePhone = canViewParentContact(user);

  const [gaps, stats, rows] = await Promise.all([
    countSessionGaps(actor, filters),
    getParentInteractionStats(actor, filters),
    getParentInteractionRows(actor, filters, { canSeePhone, viewerUserId: user.id }),
  ]);

  // Link sang màn điểm danh, mang theo ĐÚNG khoảng ngày đang xem — mở ra thấy một
  // khoảng khác là người dùng đếm lại và ra số lệch.
  const attendanceHref = `/admin/attendance?dateFrom=${vnYmd(filters.dateFrom)}&dateTo=${vnYmd(
    filters.dateTo,
  )}`;

  // Mở panel = THÊM ĐÚNG MỘT khoá vào URL đang có. Dựng URL mới từ đầu là mất khoảng
  // ngày và danh sách cơ sở người dùng vừa chọn.
  const openChatHref = (conversationId: string) => {
    const qs = new URLSearchParams(currentQuery);
    qs.set(CHAT_PARAM, conversationId);
    return `/admin/dashboard?${qs.toString()}`;
  };

  return (
    <div className="space-y-4">
      {/* ── E-01 ─────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Buổi học còn thiếu việc</CardTitle>
          <CardDescription>
            Chỉ tính buổi <strong>đã diễn ra</strong> trong kỳ. Một buổi được coi là xong khi
            đủ <strong>cả ba</strong>: điểm danh đủ lớp · mọi em đi học có nhận xét · mọi em
            đi học có ảnh (ảnh riêng hoặc ảnh chung cả lớp). Em vắng thì miễn nhận xét và ảnh.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Buổi còn thiếu"
            value={gaps.pending.toLocaleString("vi-VN")}
            hint={`trên tổng ${gaps.totalPast} buổi đã diễn ra`}
          />
          <Stat label="Thiếu điểm danh" value={gaps.missingAttendance.toLocaleString("vi-VN")} />
          <Stat label="Thiếu nhận xét" value={gaps.missingFeedback.toLocaleString("vi-VN")} />
          <Stat label="Thiếu ảnh" value={gaps.missingMedia.toLocaleString("vi-VN")} />
        </CardContent>
        <CardContent className="pt-0">
          <Link href={attendanceHref} className="text-sm font-medium text-primary hover:underline">
            Mở màn điểm danh với đúng khoảng ngày này →
          </Link>
        </CardContent>
      </Card>

      {/* ── E-02 ─────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tỉ lệ phụ huynh đã tương tác</CardTitle>
          <CardDescription>
            &ldquo;Đã tương tác&rdquo; = phụ huynh <strong>đã gửi ít nhất một tin nhắn</strong>{" "}
            trong khoảng ngày đang chọn. Cố ý không tính &ldquo;đã đọc&rdquo;: hệ thống chỉ
            lưu mốc đọc gần nhất nên một lần mở app hồi tháng trước sẽ được tính là đã tương
            tác ở mọi kỳ báo cáo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Stat label="Tỉ lệ tương tác" value={pct(stats.rate)} />
          <Stat
            label="Đã tương tác"
            value={stats.interactedParents.toLocaleString("vi-VN")}
            hint="phụ huynh đã gửi tin trong kỳ"
          />
          <Stat
            label="Tổng phụ huynh"
            value={stats.totalParents.toLocaleString("vi-VN")}
            hint="có con đang học trong phạm vi đang chọn"
          />
        </CardContent>
      </Card>

      {/* ── E-03 ─────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chi tiết phụ huynh</CardTitle>
          <CardDescription>
            Xếp <strong>phụ huynh im lặng lên đầu</strong> — bảng này để tìm người cần liên
            hệ, không phải để khoe người nhắn nhiều.
            {canSeePhone ? null : (
              <>
                {" "}
                Cột số điện thoại <strong>không hiện với vai của bạn</strong> (và cũng không
                được gửi xuống trình duyệt).
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PhanTrangBang tenDonVi="phụ huynh">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Phụ huynh</th>
                  {canSeePhone ? <th className="py-2 pr-3">Điện thoại</th> : null}
                  <th className="py-2 pr-3">Học viên</th>
                  <th className="py-2 pr-3">Cơ sở</th>
                  <th className="py-2 pr-3 text-right">Số tin đã gửi</th>
                  <th className="py-2 pr-3">Tin gần nhất</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={canSeePhone ? 7 : 6}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Không có phụ huynh nào trong phạm vi đang chọn.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.parentUserId} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-medium">{r.parentName}</td>
                    {canSeePhone ? (
                      <td className="py-2 pr-3 tabular-nums">{r.phone ?? "—"}</td>
                    ) : null}
                    <td className="py-2 pr-3">{r.studentNames.join(", ") || "—"}</td>
                    <td className="py-2 pr-3">{r.centerName ?? "—"}</td>
                    <td
                      className={
                        r.messageCount === 0
                          ? "py-2 pr-3 text-right font-semibold tabular-nums text-amber-600"
                          : "py-2 pr-3 text-right tabular-nums"
                      }
                    >
                      {r.messageCount}
                    </td>
                    <td className="py-2 pr-3">{dmy(r.lastMessageAt)}</td>
                    <td className="py-2 pr-3">
                      {r.conversationId ? (
                        // Mở NGAY TRONG trang: thêm đúng một khoá `chat` vào URL hiện
                        // tại, mọi tham số lọc giữ nguyên. Cố ý KHÔNG dùng
                        // `OpenDmButton` — nó `router.push` sang trang chat, tức rời
                        // dashboard, đúng thứ E-04 sinh ra để tránh.
                        <Link
                          href={openChatHref(r.conversationId)}
                          scroll={false}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Mở hội thoại
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">Chưa có kênh</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PhanTrangBang>
        </CardContent>
      </Card>
    </div>
  );
}
