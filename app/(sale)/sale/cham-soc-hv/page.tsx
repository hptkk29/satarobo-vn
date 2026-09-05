/**
 * Site Sale — màn "Chăm sóc học viên".
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA `app/(admin)/admin/cham-soc-hv/page.tsx` ────────────
 * Trước 04/09/2026 tệp này chỉ MOUNT LẠI trang admin:
 *
 *     return <AdminCareTaskPage />;
 *
 * Chủ dự án chốt 04/09/2026: các màn site Sale **tách bản riêng**, không dùng
 * chung component với khu quản trị nữa, để thiết kế lại giao diện site Sale mà
 * **không đụng một pixel nào** của khu quản trị. Rủi ro trôi lệch đã được nêu;
 * chủ dự án vẫn chọn đường này. Bản admin giữ nguyên, không sửa.
 *
 * NỘI DUNG GIỮ NGUYÊN 100% — cùng tập việc (OPEN, được giao cho chính người
 * đang xem), cùng thứ tự (hạn gần nhất trước), cùng bốn mẩu tin mỗi dòng, cùng
 * một nút. Chỉ đổi CÁCH BÀY: `KhungDuLieu` + `.bang-sale` + phân trang.
 * Truy vấn ở `lib/sale/cham-soc-hv.ts` (kèm lý do bỏ nhánh theo mã vai).
 *
 * ── CỔNG QUYỀN ──────────────────────────────────────────────────────────────
 * `chanNeuThieuQuyen("/sale/cham-soc-hv", …)` chạy TRƯỚC mọi truy vấn, KHÔNG
 * phải `redirect("/dashboard")` như bản admin — `/dashboard` chỉ có nghĩa trên
 * tên miền quản trị; trên host Sale và trên mọi host "không xác định" (localhost,
 * test.satarobo.vn) nó là 404 trắng trơn (`lib/sale/cong-trang.tsx`).
 *
 * 🔴 CỔNG **RỘNG HƠN** ĐƯỜNG GHI CỦA MÀN — chỗ duy nhất trong đợt này, nên ghi kỹ.
 *
 *      vào trang :  PAGE_GATES["/sale/cham-soc-hv"] = ["parent-requests:manage"]
 *      bản admin :  PAGE_GATES["/cham-soc-hv"]      = ["parent-requests:manage"]   (trùng khít)
 *      bấm nút   :  completeCareTask → gate("students:view-all")
 *                   (`app/(admin)/admin/canh-bao-rui-ro/_actions.ts:16`)
 *
 *    Hai action KHÁC NHAU. Ai có `parent-requests:manage` mà thiếu `students:view-all`
 *    thì qua cổng, thấy đủ danh sách, bấm "Hoàn tất" và nhận "Không có quyền".
 *
 *    Hôm nay chưa ai rơi vào đó — đã đối chiếu CẢ HAI tầng RBAC:
 *      v1 `parent-requests:manage` = [SUPER_ADMIN, CENTER_MANAGER, SALES_CSM]
 *         ⊆ `students:view-all`    = [SUPER_ADMIN, CENTER_MANAGER, SALES_CSM, MARKETING, ACCOUNTANT, HR]
 *      v2 ba RoleDef giữ `parent-requests:manage` (CENTER_MANAGER · CENTER_CLASS_MANAGER ·
 *         CENTER_SALES_CSM) đều giữ luôn `students:view-all` scope GLOBAL.
 *    Nhưng đó là sự trùng hợp của DỮ LIỆU, không phải một bất biến của mã: chủ dự án
 *    chốt 28/08 rằng "admin sẽ cấp quyền trong giao diện", nên một grant ALLOW lẻ
 *    `parent-requests:manage` là đủ để mở ra khoảng hở này bất cứ lúc nào.
 *
 *    ⇒ Hỏi `students:view-all` NGAY TẠI ĐÂY và chỉ vẽ nút khi có. KHÔNG siết cổng
 *      trang thành phép VÀ: người có `parent-requests:manage` được XEM hàng đợi của
 *      mình là đúng — cắt họ khỏi màn là mất thông tin, không phải thêm an toàn.
 *      Và KHÔNG nới ngược lại. `checkPermission("students:view-all")` gọi trần an
 *      toàn: action đó seed GLOBAL ở mọi RoleDef giữ nó.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { GiaiThichTrang } from "@/components/sale/ui/giai-thich-trang";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { layViecChamSoc } from "@/lib/sale/cham-soc-hv";
import { BangChamSoc } from "./_components/bang-cham-soc";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chăm sóc học viên | Tư vấn tuyển sinh" };

export default async function SaleCareTaskPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fcham-soc-hv");

  const chan = await chanNeuThieuQuyen("/sale/cham-soc-hv", "Chăm sóc học viên");
  if (chan) return chan;

  const [coQuyenHoanTat, actor] = await Promise.all([
    checkPermission("students:view-all"),
    resolveActor(session.user.id),
  ]);

  const dong = await layViecChamSoc({ actor, userId: session.user.id });
  const soQuaHan = dong.filter((v) => v.quaHan).length;

  return (
    <KhungDuLieu>
      <KhungDuLieu.Dau
        ten="Việc chăm sóc học viên"
        // Con số quá hạn đứng ngay ở dòng đầu chứ không nấp trong bảng: đó là
        // câu hỏi duy nhất người trực hỏi khi mở màn này. Chỉ tô màu khi > 0 —
        // một số 0 màu đỏ dạy người dùng bỏ qua màu đỏ (`dai-so-lieu.tsx`).
        mo={
          dong.length === 0 ? (
            "Không có việc chăm sóc nào đang mở"
          ) : (
            <>
              {dong.length} việc đang mở
              {soQuaHan > 0 ? (
                <>
                  {" · "}
                  <span className="font-semibold text-[color:var(--state-danger)]">
                    {soQuaHan} quá hạn
                  </span>
                </>
              ) : null}
            </>
          )
        }
      />

      <GiaiThichTrang>
        Việc chăm sóc phát sinh từ cảnh báo rủi ro hoặc sau khi học viên đăng ký. Màn này
        chỉ hiện <strong>việc được giao cho bạn</strong> và <strong>chưa hoàn tất</strong>,
        xếp theo hạn gần nhất trước. Bấm “Hoàn tất” là đóng việc, đồng thời đóng luôn cảnh
        báo rủi ro đã sinh ra nó (nếu cảnh báo đó còn đang mở).
      </GiaiThichTrang>

      {dong.length === 0 ? (
        <KhungDuLieu.Rong
          ten="Không có việc chăm sóc nào"
          mo="Việc sẽ tự xuất hiện ở đây khi hệ thống ghi nhận một cảnh báo rủi ro cho học viên bạn phụ trách, hoặc khi có học viên vừa đăng ký cần theo sát."
        />
      ) : (
        <BangChamSoc dong={dong} coQuyenHoanTat={coQuyenHoanTat} />
      )}
    </KhungDuLieu>
  );
}
