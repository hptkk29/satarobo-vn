/**
 * Site Sale — màn "Sinh nhật học viên".
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA `app/(admin)/admin/sinh-nhat/page.tsx` ──────────────
 * Trước 04/09/2026 tệp này chỉ MOUNT LẠI trang admin:
 *
 *     return <AdminBirthdayPage />;
 *
 * Chủ dự án chốt 04/09/2026: các màn site Sale **tách bản riêng**, không dùng
 * chung component với khu quản trị nữa, để thiết kế lại giao diện site Sale mà
 * **không đụng một pixel nào** của khu quản trị. Rủi ro trôi lệch đã được nêu;
 * chủ dự án vẫn chọn đường này. Bản admin giữ nguyên, không sửa.
 *
 * NỘI DUNG GIỮ NGUYÊN 100% — cùng cửa sổ 30 ngày, cùng năm cột, cùng bốn nhãn
 * ZNS, cùng câu giải thích (kể cả số ngày báo trước đọc từ Cấu hình vận hành).
 * Chỉ đổi CÁCH BÀY, theo hệ thiết kế Sale: `KhungDuLieu` + `GiaiThichTrang` +
 * `.bang-sale` + `StatusPill` + token tím của `sale.css`.
 *
 * ── MỘT CHỖ ĐỔI CÁCH BÀY ĐÁNG NÓI ───────────────────────────────────────────
 * Đoạn giải thích ba câu ("hôm sinh nhật không có lớp thì xếp vào buổi gần nhất
 * trước đó…") ở bản admin nằm ngay dưới tiêu đề và **luôn mở**. Nó đúng ở lần
 * đầu và thừa ở mọi lần sau — người trực mở màn này mỗi sáng. Nay nó vào dải
 * `GiaiThichTrang` (thu lại theo mặc định, `<details>` gốc nên chạy trước cả khi
 * JS tải xong). Không mất một chữ nào, chỉ thôi chiếm chỗ của dữ liệu.
 *
 * ── CỔNG QUYỀN ──────────────────────────────────────────────────────────────
 * `chanNeuThieuQuyen("/sale/sinh-nhat", …)` chạy TRƯỚC mọi truy vấn, KHÔNG phải
 * `redirect("/dashboard")` như bản admin — `/dashboard` chỉ có nghĩa trên tên
 * miền quản trị; trên host Sale và trên mọi host "không xác định" (localhost,
 * test.satarobo.vn) nó là 404 trắng trơn. Lý do đầy đủ ở `lib/sale/cong-trang.tsx`.
 *
 * ⚠️ CỔNG NÀY KHÔNG RỘNG HƠN MÀN, đã đối chiếu từng tầng:
 *      `PAGE_GATES["/sale/sinh-nhat"]` = ["students:view-all"]
 *      bản admin gác  `PAGE_GATES["/sinh-nhat"]`  = ["students:view-all"]  ⇒ TRÙNG KHÍT
 *    và hai Server Action đánh dấu/bỏ đánh dấu cũng gác đúng `students:view-all`
 *    (`_actions.ts:gate("students:view-all")`) ⇒ ai vào được là bấm được.
 *    Riêng "Chạy quét sinh nhật" đòi `students:edit` — quyền HẸP HƠN — nên nút đó
 *    hỏi riêng, y như bản admin. Vẽ nút cho người không có quyền là dựng một cái
 *    nút chỉ để báo lỗi.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { getSetting } from "@/lib/settings/service";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { GiaiThichTrang } from "@/components/sale/ui/giai-thich-trang";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { layDanhSachSinhNhat } from "@/lib/sale/sinh-nhat";
import { BangSinhNhat } from "./_components/bang-sinh-nhat";
import { NutQuetSinhNhat } from "./_components/nut-sinh-nhat";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sinh nhật học viên | Tư vấn tuyển sinh" };

export default async function SaleBirthdayPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fsinh-nhat");

  const chan = await chanNeuThieuQuyen("/sale/sinh-nhat", "Sinh nhật học viên");
  if (chan) return chan;

  // Hỏi quyền MỘT LẦN rồi truyền xuống — hỏi rải rác ở nhiều chỗ là cách chắc
  // chắn để hai chỗ trả lời khác nhau khi cờ RBAC đổi (bài học 10/07 site admin).
  const [coQuyenQuet, soNgayBaoTruoc, actor] = await Promise.all([
    checkPermission("students:edit"),
    getSetting("student.birthdayAlertDaysBefore"),
    resolveActor(session.user.id),
  ]);

  const { dong } = await layDanhSachSinhNhat({ actor });

  return (
    <KhungDuLieu>
      <KhungDuLieu.Dau
        ten="Sinh nhật học viên"
        mo={
          dong.length > 0
            ? `${dong.length} sinh nhật trong cửa sổ 30 ngày quanh hôm nay`
            : "Không có sinh nhật nào trong 30 ngày tới"
        }
        hanhDong={coQuyenQuet ? <NutQuetSinhNhat /> : null}
      />

      <GiaiThichTrang>
        Hôm sinh nhật không có lớp thì buổi chúc mừng được xếp vào{" "}
        <strong>buổi học gần nhất trước đó</strong>. Hệ thống báo trước {soNgayBaoTruoc} ngày
        so với buổi tổ chức (đổi ở Cấu hình vận hành). Học viên chưa xếp lớp / lớp đã kết
        thúc không hiện ở đây. Bảng liệt kê cả <strong>7 ngày đã qua</strong> để soát những
        buổi bị lỡ.
      </GiaiThichTrang>

      {dong.length === 0 ? (
        <KhungDuLieu.Rong
          ten="Không có sinh nhật nào trong 30 ngày tới"
          mo={
            coQuyenQuet
              ? "Nếu vừa nhập ngày sinh cho học viên, bấm “Chạy quét sinh nhật” ở góc trên để hệ thống xếp lại buổi tổ chức."
              : "Nếu vừa nhập ngày sinh cho học viên, nhờ quản lý cơ sở bấm “Chạy quét sinh nhật” để hệ thống xếp lại buổi tổ chức."
          }
        />
      ) : (
        <BangSinhNhat dong={dong} />
      )}
    </KhungDuLieu>
  );
}
