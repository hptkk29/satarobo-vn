// app/(sale)/sale/page.tsx — Bảng việc hôm nay.
//
// Trước 24/08 trang này là một cái VỎ: một tiêu đề và một hộp "Sắp có". Nay nó
// trả lời đúng câu hỏi mà tư vấn viên mở máy ra là hỏi — "hôm nay tôi phải làm
// gì, chạm ai".
//
// Máy tính SLA (`lib/crm/sla.ts`) có từ lâu nhưng CHƯA BAO GIỜ nối vào giao diện:
// nó chỉ chạy trong cron để đẻ thông báo, mà chuông thì trộn mọi loại việc.
//
// KHÔNG dùng biểu đồ: ESLint chặn `@/components/charts/*` trong `app/(sale)/**`,
// và một bảng việc thì cần danh sách bấm được chứ không cần cột.
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CalendarClock, PhoneOff } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { canViewLeadPii } from "@/lib/auth/check-permission";
import { getSaleBoard, type ViecItem } from "@/lib/crm/sale-board";
import { maskLeadPiiFields, maskPersonName } from "@/lib/lead/pii";
import { formatDateVN } from "@/lib/format/date";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bảng việc hôm nay | Tư vấn tuyển sinh" };

function DongViec({ v }: { v: ViecItem }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 py-2 last:border-0">
      <div>
        <Link
          href={`/sale/khach-cua-toi/${v.leadId}`}
          className="font-medium text-primary hover:underline"
        >
          {v.tenKhach || "(chưa có tên)"}
        </Link>
        <span className="text-foreground"> — {v.title}</span>
      </div>
      <span className="text-xs text-muted-foreground">{formatDateVN(v.dueAt)}</span>
    </li>
  );
}

export default async function SaleHomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale");

  const actor = await resolveActor(session.user.id);
  const canViewPii = await canViewLeadPii();
  const board = await getSaleBoard(actor, session.user.id);

  const canCham = board.canCham.map((k) => {
    const m = maskLeadPiiFields({ phone: k.phone }, canViewPii);
    return {
      ...k,
      tenKhach: canViewPii ? k.tenKhach : maskPersonName(k.tenKhach),
      phone: m.phone ?? null,
    };
  });

  const tongViec = board.viec.quaHan.length + board.viec.homNay.length;

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">Bảng việc hôm nay</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {tongViec === 0 && canCham.length === 0
          ? "Không có việc nào đến hạn và không khách nào đang chờ."
          : `${tongViec} việc đến hạn · ${canCham.length} khách đang chờ được chạm.`}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3">
          <dt className="text-xs text-muted-foreground">Quá hạn</dt>
          <dd className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-500">
            {board.viec.quaHan.length}
          </dd>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <dt className="text-xs text-muted-foreground">Đến hạn hôm nay</dt>
          <dd className="text-2xl font-bold tabular-nums text-foreground">
            {board.viec.homNay.length}
          </dd>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <dt className="text-xs text-muted-foreground">Khách đang tư vấn</dt>
          <dd className="text-2xl font-bold tabular-nums text-foreground">
            {board.soKhachDangMo}
          </dd>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <dt className="text-xs text-muted-foreground">Chưa liên hệ lần nào</dt>
          <dd className="text-2xl font-bold tabular-nums text-foreground">
            {board.soChuaLienHe}
          </dd>
        </div>
      </dl>

      <div className="mt-5 space-y-4">
        {board.viec.quaHan.length > 0 ? (
          <section className="rounded-xl border border-amber-500/40 bg-card p-4">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-500">
              <AlertTriangle className="h-4 w-4" /> Quá hạn ({board.viec.quaHan.length})
            </h2>
            <ul>
              {board.viec.quaHan.map((v) => (
                <DongViec key={v.id} v={v} />
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="h-4 w-4 text-primary" /> Đến hạn hôm nay (
            {board.viec.homNay.length})
          </h2>
          {board.viec.homNay.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có việc nào đến hạn hôm nay.</p>
          ) : (
            <ul>
              {board.viec.homNay.map((v) => (
                <DongViec key={v.id} v={v} />
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <PhoneOff className="h-4 w-4 text-primary" /> Khách cần chạm ({canCham.length})
          </h2>
          {/* Nói rõ vì sao khách có mặt ở đây — một danh sách không giải thích
              được thì người dùng sẽ nghi nó sai rồi bỏ qua. */}
          <p className="mb-2 text-xs text-muted-foreground">
            Khách đã nhận mà chưa liên hệ, hoặc đã im lặng quá lâu. Người im lâu
            nhất xếp trên. Ngưỡng lấy từ cấu hình vận hành, không phải số cứng.
          </p>
          {canCham.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Không khách nào đang chờ — mọi người đều đã được chạm trong ngưỡng.
            </p>
          ) : (
            <ul>
              {canCham.map((k) => (
                <li
                  key={k.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 py-2 last:border-0"
                >
                  <div>
                    <Link
                      href={`/sale/khach-cua-toi/${k.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {k.tenKhach || "(chưa có tên)"}
                    </Link>
                    {k.phone ? (
                      <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                        {k.phone}
                      </span>
                    ) : null}
                    <div className="text-xs text-amber-600 dark:text-amber-500">
                      {k.vi.join(" · ")}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {k.lastActivityAt
                      ? `chạm ${formatDateVN(k.lastActivityAt)}`
                      : "chưa chạm lần nào"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {board.viec.sapToi.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Còn {board.viec.sapToi.length} việc có hạn sau hôm nay —{" "}
            <Link href="/sale/khach-cua-toi" className="text-primary hover:underline">
              xem ở Khách của tôi
            </Link>
            .
          </p>
        ) : null}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Sắp có</h2>
        {/* Danh sách này phải trừ dần khi màn được dựng. Để nguyên tên một màn
            ĐÃ CÓ là nói dối người dùng về trạng thái sản phẩm — "Lớp trải
            nghiệm" từng nằm ở đây suốt trong khi nó đã chạy được. */}
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Hoa hồng của tôi</li>
        </ul>
      </div>
    </div>
  );
}
