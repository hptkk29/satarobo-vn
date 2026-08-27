// app/(sale)/sale/hop-thu/page.tsx — HỘP THƯ ĐA KÊNH của site Sale.
//
// Khuôn theo `khach-cua-toi/page.tsx`: gate bằng `PAGE_GATES` → parse searchParams
// → `resolveActor` → hỏi quyền xem liên hệ MỘT LẦN → đọc dữ liệu ĐÃ CHE ở server →
// serialize `Date` thành chuỗi trước khi qua ranh giới client.
//
// 🔴 Mọi thứ nhạy cảm được che TRONG `lib/inbox/queries.ts`, không che ở JSX: che ở
// JSX thì giá trị thật vẫn nằm trong payload RSC và ai mở tab Network cũng đọc được.
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canViewLeadPii,
  checkAnyPermission,
  checkPermission,
} from "@/lib/auth/check-permission";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { resolveActor } from "@/lib/auth/actor";
import { tinhTrangKenh } from "@/lib/integrations/registry";
import { listInboxConversations, getInboxThread, demHopThu } from "@/lib/inbox/queries";
import type { BoLocHopThu } from "@/lib/inbox/queries";
import { HopThuWorkspace } from "@/components/sale/hop-thu/hop-thu-workspace";
import type { InboxChannel } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Hộp thư | Sata Robo",
  robots: { index: false, follow: false },
};

const KENH_HOP_LE: InboxChannel[] = ["ZALO_OA", "MESSENGER", "LIVECHAT", "MANUAL"];

export default async function HopThuPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fhop-thu");
  if (!(await checkAnyPermission(PAGE_GATES["/sale/hop-thu"]))) redirect("/sale");

  const sp = await searchParams;
  const mot = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";

  // Whitelist giá trị lọc — không nhét thẳng chuỗi từ URL vào `where`.
  const kenhThô = mot("kenh");
  const loc: BoLocHopThu = {
    channel: KENH_HOP_LE.includes(kenhThô as InboxChannel)
      ? (kenhThô as InboxChannel)
      : null,
    assignee:
      mot("phutrach") === "toi"
        ? session.user.id
        : mot("phutrach") === "chua-gan"
          ? "CHUA_GAN"
          : null,
    chuaTraLoi: mot("chuatraloi") === "1",
    moCoi: mot("mocoi") === "1",
    status: mot("dadong") === "1" ? "CLOSED" : "OPEN",
  };

  const actor = await resolveActor(session.user.id);

  // Hỏi MỘT LẦN rồi truyền xuống. Hỏi rải rác ở nhiều chỗ là cách chắc chắn để hai
  // chỗ trả lời khác nhau khi cờ RBAC đổi.
  const [canViewPii, coQuyenTraLoi, coQuyenGan] = await Promise.all([
    canViewLeadPii(),
    checkPermission("inbox:reply"),
    checkPermission("inbox:assign"),
  ]);

  const [danhSach, dem] = await Promise.all([
    listInboxConversations({ actor, canViewPii, loc }),
    demHopThu(actor),
  ]);

  const dangMoId = mot("id");
  const luong = dangMoId
    ? await getInboxThread({ actor, canViewPii, conversationId: dangMoId })
    : null;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Hộp thư</h1>
        <p className="text-sm text-muted-foreground">
          Tin nhắn của khách từ Zalo OA và Messenger, gộp về một chỗ.
        </p>
        {/* Ba con số này đếm TRONG phạm vi đơn vị của người đang xem, không phải
            toàn hệ thống — cùng cổng `inboxOrgScopeWhere` với danh sách bên dưới. */}
        <p className="text-sm">
          <span className="font-medium">{dem.chuaTraLoi}</span> chưa trả lời ·{" "}
          <span className="font-medium">{dem.chuaGanNguoi}</span> chưa có người nhận ·{" "}
          <span className="font-medium">{dem.moCoi}</span> chưa nối phiếu khách
        </p>
      </header>

      <HopThuWorkspace
        rows={danhSach.rows}
        tong={danhSach.tong}
        canhBaoCat={danhSach.canhBaoCat}
        luong={luong}
        tinhTrangKenh={tinhTrangKenh()}
        coQuyenTraLoi={coQuyenTraLoi}
        coQuyenGan={coQuyenGan}
        userId={session.user.id}
      />
    </div>
  );
}
