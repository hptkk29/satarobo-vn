/**
 * Site Sale — màn "Học bù" (`/sale/hoc-bu`).
 *
 * ══ BẢN ĐÔI CỦA `app/(admin)/admin/hoc-bu/page.tsx` ═════════════════════════
 *
 * ── Vì sao tồn tại ──────────────────────────────────────────────────────────
 * Tới 04/09/2026 tệp này chỉ là một lớp bọc `<AdminMakeupPage />`. Chủ dự án
 * chốt ngày đó rằng các màn site Sale phải TÁCH BẢN RIÊNG: họ muốn thiết kế lại
 * site Sale mà KHÔNG đụng một pixel nào của khu quản trị, nơi 9 vai đang làm
 * việc hằng ngày. Rủi ro trôi lệch đã được nêu rõ trước khi chốt; chủ dự án vẫn
 * chọn đường này. Bản admin giữ nguyên, không sửa.
 *
 * NỘI DUNG GIỮ NGUYÊN 100%: cùng hàng chờ (PENDING + SCHEDULED), cùng bốn nhãn
 * trạng thái, cùng ba thao tác, cùng từng chữ của câu hướng dẫn, câu rỗng, câu
 * cảnh báo khi huỷ và câu "chưa tìm được buổi bù". Chỉ đổi CÁCH BÀY.
 *
 * ── Dùng lại được, KHÔNG chép ───────────────────────────────────────────────
 * `scopedDb` · `checkPermission` · `formatDateVN` · `PhanTrangBang` · toàn bộ
 * bốn Server Action của khu quản trị (`getMakeupSuggestions`,
 * `scheduleMakeupAction`, `completeMakeupAction`, `cancelMakeupAction`).
 *
 * ── Buộc phải chép (nợ trôi lệch) ───────────────────────────────────────────
 * Truy vấn hàng chờ (đã dời vào `lib/sale/du-lieu-hoc-bu.ts`) + bảng nhãn trạng
 * thái (`lib/sale/trang-thai-hoc-bu.ts`). Danh sách đầy đủ những thứ hai bản
 * phải khớp nằm ở đầu hai tệp đó.
 *
 * ── CỔNG QUYỀN ──────────────────────────────────────────────────────────────
 * ⚠️ CỔNG KHÔNG RỘNG HƠN MÀN, đã đối chiếu từng tầng:
 *      `PAGE_GATES["/sale/hoc-bu"]` = ["parent-requests:manage"]
 *      bản admin gác `checkPermission("parent-requests:manage")`  ⇒ TRÙNG KHÍT
 *    Nên KHÔNG dựng tầng thứ hai ở đây: một `if` luôn đúng là mã chết, và mã
 *    chết trong cổng quyền là thứ người sau đọc rồi tưởng đã được bảo vệ hai lần.
 *    `chanNeuThieuQuyen` thay cho `redirect("/dashboard")` của bản admin —
 *    `/dashboard` là 404 trắng trơn trên host Sale (`lib/sale/cong-trang.tsx`).
 *
 * ⚠️ BỐN ĐƯỜNG GHI GÁC ĐÚNG QUYỀN CỦA CỔNG (`_actions.ts:gate()` →
 *    `parent-requests:manage`) ⇒ AI VÀO ĐƯỢC MÀN LÀ BẤM ĐƯỢC MỌI NÚT. Không có
 *    nút nào ở đây cần hỏi quyền riêng, và cũng không được thêm điều kiện quyền
 *    nào — thêm là dựng một cái khoá thứ hai lệch với khoá thật.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { GiaiThichTrang } from "@/components/sale/ui/giai-thich-trang";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { docHangChoHocBu } from "@/lib/sale/du-lieu-hoc-bu";
import { BangHocBu } from "./_components/bang-hoc-bu";

export const dynamic = "force-dynamic";
export const metadata = { title: "Học bù | Tư vấn tuyển sinh" };

export default async function ManHocBuSale() {
  const chan = await chanNeuThieuQuyen("/sale/hoc-bu", "Học bù");
  if (chan) return chan;

  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fhoc-bu");

  const actor = await resolveActor(session.user.id);
  const dong = await docHangChoHocBu(actor);

  return (
    <KhungDuLieu className="max-w-[76rem]">
      <KhungDuLieu.Dau
        ten="Học bù"
        mo={
          dong.length > 0
            ? `Xếp buổi học bù cho học viên vắng · ${dong.length} yêu cầu đang chờ`
            : "Xếp buổi học bù cho học viên vắng"
        }
      />

      {/* Câu quy trình ở bản admin luôn mở, nằm ngay dưới tiêu đề. Nó đúng ở lần
          đầu và thừa ở mọi lần sau — người trực mở màn này mỗi ngày. Nay nó vào
          `GiaiThichTrang` (thu lại theo mặc định, `<details>` gốc nên chạy trước
          cả khi JS tải xong). Không mất một chữ nào. */}
      <GiaiThichTrang>
        Buổi vắng cần bù → gợi ý buổi bù cùng khoá/bài (không vượt tiến độ) → xếp → đánh
        dấu đã bù.
      </GiaiThichTrang>

      {dong.length === 0 ? (
        <KhungDuLieu.Rong
          ten="Không có nhu cầu học bù nào đang chờ."
          mo="Yêu cầu bù được sinh ra từ màn Điểm danh khi đánh dấu học viên vắng — không nhập tay ở đây."
        />
      ) : (
        <BangHocBu dong={dong} />
      )}
    </KhungDuLieu>
  );
}
