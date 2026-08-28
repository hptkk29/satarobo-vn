/**
 * Site Sale — MOUNT LẠI màn "Messenger CRM" (`/admin/crm/messenger`).
 * Khuôn: `app/(sale)/sale/don-hang/page.tsx`.
 *
 * Bản admin thiếu quyền thì `redirect("/admin/dashboard")` — trên host Sale đó là
 * đường của khu quản trị, tư vấn viên bị đá khỏi site của mình. Cổng chặn trước.
 * Trang admin không nhận props ⇒ lớp bọc cũng không nhận.
 */
import AdminMessengerInboxPage from "@/app/(admin)/admin/crm/messenger/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messenger CRM | Tư vấn tuyển sinh" };

export default async function SaleMessengerPage() {
  const chan = await chanNeuThieuQuyen("/sale/messenger", "Messenger CRM");
  if (chan) return chan;
  return <AdminMessengerInboxPage />;
}
