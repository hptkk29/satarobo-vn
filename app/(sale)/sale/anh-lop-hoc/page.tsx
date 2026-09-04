/**
 * Site Sale — màn "Ảnh lớp học" (`/sale/anh-lop-hoc`).
 *
 * ══ BẢN ĐÔI CỦA `app/(admin)/admin/media/page.tsx` ══════════════════════════
 *
 * ── Vì sao tồn tại ──────────────────────────────────────────────────────────
 * Tới 04/09/2026 tệp này chỉ là một lớp bọc `<AdminMediaPage />`. Chủ dự án chốt
 * ngày đó rằng các màn site Sale phải TÁCH BẢN RIÊNG: họ muốn thiết kế lại site
 * Sale mà KHÔNG đụng một pixel nào của khu quản trị, nơi 9 vai đang làm việc
 * hằng ngày. Rủi ro trôi lệch đã được nêu rõ trước khi chốt; chủ dự án vẫn chọn
 * đường này. Bản admin giữ nguyên, không sửa.
 *
 * NỘI DUNG GIỮ NGUYÊN 100%: cùng hai khối việc (đăng ảnh / thư viện), cùng hai
 * chế độ đăng, cùng ô lọc thư viện, cùng bốn nhãn trạng thái, cùng từng chữ của
 * mọi câu hướng dẫn và mọi thông báo. Chỉ đổi CÁCH BÀY.
 *
 * ── Dùng lại được, KHÔNG chép ───────────────────────────────────────────────
 * `scopedDb` · `resolveMediaUrl` (`lib/storage/signed-url.ts`) ·
 * `checkAnyPermission` / `checkPermission` · toàn bộ Server Action của khu quản
 * trị (`uploadClassMedia`, `uploadClassMediaBatch`, `getClassUploadContext`,
 * `reviewMedia`, `deleteMedia`, `deleteDraftMediaAction`).
 *
 * ── Buộc phải chép (nợ trôi lệch) ───────────────────────────────────────────
 * Truy vấn thư viện (đã dời vào `lib/sale/du-lieu-anh-lop.ts`) + bảng nhãn
 * trạng thái (`lib/sale/trang-thai-anh-lop.ts`). Danh sách đầy đủ những thứ hai
 * bản phải khớp nằm ở đầu hai tệp đó.
 *
 * ── CỔNG QUYỀN ──────────────────────────────────────────────────────────────
 * ⚠️ CỔNG KHÔNG RỘNG HƠN MÀN, đã đối chiếu từng tầng:
 *      `PAGE_GATES["/sale/anh-lop-hoc"]` = ["media:view", "media:upload"]
 *      bản admin gác `checkAnyPermission(PAGE_GATES["/media"])`
 *      `PAGE_GATES["/media"]`            = ["media:view", "media:upload"]
 *                                                             ⇒ TRÙNG KHÍT
 *    Nên KHÔNG dựng tầng thứ hai ở đây: một `if` luôn đúng là mã chết, và mã
 *    chết trong cổng quyền là thứ người sau đọc rồi tưởng đã được bảo vệ hai lần.
 *    `chanNeuThieuQuyen` thay cho `redirect("/dashboard")` của bản admin —
 *    `/dashboard` là 404 trắng trơn trên host Sale (`lib/sale/cong-trang.tsx`).
 *
 * ⚠️ MỌI QUYỀN GHI Ở MÀN NÀY ĐỀU HẸP HƠN CỔNG XEM, và đã được hỏi ĐÚNG chỗ —
 *    không có nút nào bấm vào rồi mới báo "không có quyền":
 *      · Đăng / góp ảnh: hỏi THEO LỚP qua `getClassUploadContext(classId)`, trả
 *        `canUpload` + `canPublish`. Không phụ trách lớp ⇒ dải chặn hiện ngay
 *        khi chọn lớp và nút gửi tắt. Không thể hỏi trước ở đây vì câu trả lời
 *        phụ thuộc lớp nào được chọn.
 *      · Duyệt / Từ chối / Xoá ảnh: `media:approve` — hỏi Ở ĐÂY, truyền xuống
 *        `canApprove`. `reviewMedia`/`deleteMedia` cũng gác đúng key đó.
 *      · Xoá ảnh khỏi kho: `media:approve` HOẶC là người tự tải ảnh lên — nên
 *        `currentUserId` phải xuống tới thư viện (server chốt lại trong
 *        `deleteDraftMediaAction`).
 *
 * ⚠️ ẢNH ĐANG ĐƯỢC PHỤC VỤ BẰNG LIÊN KẾT R2 CÔNG KHAI — hiện trạng đã biết của
 *    kho tệp dùng chung, KHÔNG phải thứ màn này tự chế ra và cũng không phải thứ
 *    nó được phép tự vá. Lý do đầy đủ + đường vá thật: đầu
 *    `lib/sale/du-lieu-anh-lop.ts`.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { GiaiThichTrang } from "@/components/sale/ui/giai-thich-trang";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { docThuVienAnhLop } from "@/lib/sale/du-lieu-anh-lop";
import { KhungDangAnh } from "./_components/khung-dang-anh";
import { ThuVienAnh } from "./_components/thu-vien-anh";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ảnh lớp học | Tư vấn tuyển sinh" };

export default async function ManAnhLopHocSale() {
  const chan = await chanNeuThieuQuyen("/sale/anh-lop-hoc", "Ảnh lớp học");
  if (chan) return chan;

  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fanh-lop-hoc");

  // Hỏi quyền MỘT LẦN rồi truyền xuống — hỏi rải rác ở nhiều chỗ là cách chắc
  // chắn để hai chỗ trả lời khác nhau khi cờ RBAC đổi (bài học 10/07 site admin).
  const [duyetDuoc, actor] = await Promise.all([
    checkPermission("media:approve"),
    resolveActor(session.user.id),
  ]);

  const { lop, anh } = await docThuVienAnhLop(actor);

  return (
    /* MỘT `KhungDuLieu` cho cả màn, KHÔNG hai khung cạnh nhau: `khung-du-lieu.tsx`
       cấm khung lồng khung và cấm một màn dựng nhiều khung — hai đường bao chồng
       nhau làm mắt phải đoán đâu là ranh giới của khối việc. Bản admin dựng hai
       thẻ `rounded-xl border` trôi trên nền trang; ở đây chúng thành hai CỘT
       trong cùng một khung, chia bằng một đường kẻ dọc.

       Cột trái nền `--surface-chim` (chìm hơn một bậc) vì nó là CÔNG CỤ — cùng
       tầng với thanh lọc; cột phải giữ nền thẻ vì nó là DỮ LIỆU. Đúng luật phân
       tầng bề mặt của `operate.md` mà hệ thiết kế Sale dựng lên. */
    <KhungDuLieu className="max-w-[84rem]">
      {/* Câu phụ giữ NGUYÊN VĂN bản admin — không thêm số đếm "N ảnh đang chờ"
          như các màn Sale khác, vì đây là một câu mô tả QUY TRÌNH ("duyệt trước
          khi phụ huynh xem"), không phải một nhãn đo lượng dữ liệu. */}
      <KhungDuLieu.Dau ten="Ảnh lớp học" mo="Duyệt ảnh lớp học trước khi phụ huynh xem" />

      <GiaiThichTrang>
        Giáo viên / Sale phụ trách đăng ảnh theo buổi → quản lý duyệt → phụ huynh xem ảnh
        con được gắn thẻ. Marketing / Giáo vụ góp ảnh vào <strong>kho</strong> của lớp;
        giáo viên chọn ảnh trong kho rồi gửi phụ huynh.
      </GiaiThichTrang>

      <div className="grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="border-b border-border bg-[color:var(--surface-chim)] p-5 lg:border-b-0 lg:border-r">
          <KhungDangAnh lop={lop} />
        </div>
        <div className="min-w-0 p-5">
          <ThuVienAnh anh={anh} duyetDuoc={duyetDuoc} nguoiDangXem={session.user.id} />
        </div>
      </div>
    </KhungDuLieu>
  );
}
