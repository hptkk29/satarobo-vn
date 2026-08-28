/**
 * Site Sale — MOUNT LẠI màn "Tin nhắn" của khu quản trị.
 *
 * Chữ ký khớp đúng bản admin: trang chat đọc `c` (hội thoại đang mở), `tab` và
 * `ac` (con trỏ trang thông báo) từ địa chỉ. Nuốt mất `searchParams` là bấm vào
 * hội thoại nào cũng không mở ra hội thoại đó, mà không lỗi nào nổ.
 *
 * Ghi chú đường dẫn: bản admin truyền `basePath="/tin-nhan"` cho khung chat.
 * Trên host Sale thật, `proxy.ts` viết lại `/tin-nhan` → `/sale/tin-nhan`
 * (`route-policy.ts`: mọi đường trần trên host sale được rewrite thêm tiền tố
 * `/sale`), nên các liên kết nội bộ của khung chat vẫn về đúng màn này.
 */
import AdminMessagesPage from "@/app/(admin)/admin/tin-nhan/page";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tin nhắn | Tư vấn tuyển sinh" };

export default async function SaleMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; tab?: string; ac?: string }>;
}) {
  const chan = await chanNeuThieuQuyen("/sale/tin-nhan", "Tin nhắn");
  if (chan) return chan;
  return <AdminMessagesPage searchParams={searchParams} />;
}
