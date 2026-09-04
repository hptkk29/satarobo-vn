/**
 * Site Sale — màn "Inbox Messenger".
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA `app/(admin)/admin/crm/messenger/page.tsx` ───────────
 * Trước 04/09/2026 tệp này chỉ MOUNT LẠI trang admin:
 *
 *     return <AdminMessengerInboxPage />;
 *
 * Chủ dự án chốt 04/09/2026: các màn site Sale **tách bản riêng**, không dùng
 * chung component với khu quản trị nữa, để thiết kế lại giao diện site Sale mà
 * **không đụng một pixel nào** của khu quản trị. Rủi ro trôi lệch đã được nêu;
 * chủ dự án vẫn chọn đường này. Bản admin giữ nguyên, không sửa.
 *
 * NỘI DUNG GIỮ NGUYÊN: cùng 50 hội thoại mới nhất, cùng tên/SĐT/trạng thái/tin
 * cuối, cùng ô trả lời với hai câu trả lời nhanh. Chỉ đổi CÁCH BÀY, theo hệ
 * thiết kế Sale: `KhungDuLieu` + `StatusPill` + token tím của `sale.css`.
 *
 * ── HAI CHỖ CỐ Ý KHÁC BẢN ADMIN (cả hai đều là nói THẬT hơn) ────────────────
 *   1. Trạng thái vẽ bằng `StatusPill` + nhãn tiếng Việt, không phải
 *      `<Badge>{c.status}</Badge>` in thẳng mã enum. Lý do ở `lib/sale/messenger.ts`.
 *      (Luật màu của site cũng cấm `<Badge>` làm nhãn trạng thái — mười trạng
 *      thái ra một màu là màu hết mang tin; bài kiểm `lib/sale/ky-luat-mau.test.ts`
 *      canh chuyện này.)
 *   2. Thiếu quyền `leads:edit` thì KHÔNG vẽ ô trả lời, mà nói thẳng. Bản admin
 *      vẫn vẽ ô cho mọi người xem được, nhưng `replyAction` chặn ở server ⇒ bấm
 *      xong nhận "Không có quyền". Một cái nút chỉ để báo lỗi là một lời hứa
 *      suông — cùng họ với "nút báo thành công giả" mà site này cấm.
 *
 * ⚠️ CỔNG: `chanNeuThieuQuyen("/sale/messenger", …)` chạy TRƯỚC mọi truy vấn,
 *    KHÔNG phải `redirect("/admin/dashboard")` như bản admin. `/admin/dashboard`
 *    chỉ có nghĩa trên tên miền quản trị; trên host Sale và trên mọi host "không
 *    xác định" (localhost, test.satarobo.vn) nó là 404 trắng trơn. Lý do đầy đủ
 *    ở `lib/sale/cong-trang.tsx`.
 */
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { auth } from "@/lib/auth";
import { canViewLeadPii, checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { layHopThuMessenger } from "@/lib/sale/messenger";
import { OTraLoiMessenger } from "./_components/o-tra-loi";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox Messenger | Tư vấn tuyển sinh" };

export default async function SaleMessengerPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fmessenger");

  const chan = await chanNeuThieuQuyen("/sale/messenger", "Inbox Messenger");
  if (chan) return chan;

  // Hỏi quyền MỘT LẦN rồi truyền xuống. Hỏi rải rác ở nhiều chỗ là cách chắc
  // chắn để hai chỗ trả lời khác nhau khi cờ RBAC đổi (bài học 10/07 site admin).
  const [hienPii, coQuyenTraLoi] = await Promise.all([
    canViewLeadPii(),
    checkPermission("leads:edit"),
  ]);

  const actor = await resolveActor(session.user.id);
  // Mọi thứ nhạy cảm đã che TRONG `lib/sale/messenger.ts`, không che ở JSX: che ở
  // JSX thì giá trị thật vẫn nằm trong payload RSC và ai mở tab Network cũng đọc được.
  const hoiThoai = await layHopThuMessenger({ actor, hienPii });

  const soMoPhong = hoiThoai.filter((c) => c.moPhong).length;
  const tatCaMoPhong = hoiThoai.length > 0 && soMoPhong === hoiThoai.length;

  return (
    <KhungDuLieu>
      <KhungDuLieu.Dau
        ten="Inbox Messenger"
        mo={
          hoiThoai.length > 0
            ? `${hoiThoai.length} hội thoại mới nhất trong phạm vi của bạn`
            : "Chưa có hội thoại nào trong phạm vi của bạn"
        }
      />

      {/* Băng NÓI THẬT về chế độ mô phỏng, đặt trên đầu danh sách chứ không chỉ
          nấp trong từng ô nhập: người trực tin phải biết tình trạng kênh TRƯỚC
          khi ngồi trả lời cả buổi, không phải sau khi bấm nút đầu tiên.
          Cùng khuôn `BangChuaNoiKenh` của hộp thư đa kênh
          (`components/sale/hop-thu/hop-thu-workspace.tsx`). */}
      {soMoPhong > 0 ? (
        <div
          role="status"
          className="flex gap-3 border-b border-border bg-[color:var(--state-warning-soft)] px-5 py-3 text-sm text-[color:var(--state-warning)]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">
              {tatCaMoPhong
                ? "Đang ở chế độ mô phỏng."
                : `${soMoPhong}/${hoiThoai.length} hội thoại đang ở chế độ mô phỏng.`}
            </p>
            <p>
              Tin gửi từ đây được lưu vào hệ thống nhưng <strong>KHÔNG tới khách</strong>.
              Cần điền khoá Meta và bật “Gửi tin Messenger THẬT” ở Cấu hình vận hành.
            </p>
          </div>
        </div>
      ) : null}

      {hoiThoai.length === 0 ? (
        <KhungDuLieu.Rong
          ten="Chưa có hội thoại nào trong phạm vi của bạn"
          mo="Hội thoại xuất hiện ở đây khi khách nhắn vào Trang Facebook và webhook đã nối. Chỉ hiện hội thoại thuộc cơ sở bạn được xem."
        />
      ) : (
        <ul>
          {hoiThoai.map((c) => (
            <li
              key={c.id}
              className="border-b border-border/60 px-5 py-4 last:border-b-0"
            >
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{c.tenHienThi}</p>
                  {c.sdt ? (
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{c.sdt}</p>
                  ) : null}
                </div>
                <StatusPill tone={c.toneTrangThai}>{c.nhanTrangThai}</StatusPill>
              </div>

              {/* Tin cuối là thứ người trực đọc để quyết định trả lời gì — cho nó
                  xuống dòng thoải mái (khác `.bang-sale` vốn ép nowrap), nhưng
                  chặn ở 3 dòng để một tin dài không đẩy hội thoại kế tiếp ra khỏi
                  màn hình. */}
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {c.tinCuoi ?? <span className="italic">(chưa có tin nhắn)</span>}
              </p>

              <div className="mt-3">
                {coQuyenTraLoi ? (
                  <OTraLoiMessenger conversationId={c.id} moPhong={c.moPhong} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Bạn không có quyền trả lời hội thoại (cần quyền sửa khách).
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {hoiThoai.length > 0 ? (
        <KhungDuLieu.Chan>
          Chỉ hiện 50 hội thoại có hoạt động gần nhất, và chỉ trong phạm vi cơ sở bạn được
          xem. Facebook chỉ cho trả lời trong 24 giờ kể từ tin cuối của khách — quá hạn thì
          gọi điện hoặc nhắn Zalo.
        </KhungDuLieu.Chan>
      ) : null}
    </KhungDuLieu>
  );
}
