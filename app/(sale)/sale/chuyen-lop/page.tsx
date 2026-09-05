/**
 * Site Sale — màn "Chuyển lớp / chuyển cơ sở" (`/sale/chuyen-lop`).
 *
 * ══ BẢN ĐÔI CỦA `app/(admin)/admin/chuyen-lop/page.tsx` ═════════════════════
 *
 * ── Vì sao tồn tại ──────────────────────────────────────────────────────────
 * Tới 04/09/2026 tệp này chỉ là một lớp bọc `<AdminTransferPage />`. Chủ dự án
 * chốt ngày đó rằng các màn site Sale phải TÁCH BẢN RIÊNG: họ muốn thiết kế lại
 * site Sale mà KHÔNG đụng một pixel nào của khu quản trị. Rủi ro trôi lệch đã
 * được nêu rõ trước khi chốt; chủ dự án vẫn chọn đường này.
 *
 * ── Dùng lại được, KHÔNG chép ───────────────────────────────────────────────
 * `getNonEnrollableCenterIds` (FL2-05) · `scopedDb` + `getModelVisibleCenterIds`
 * · `checkPermission` · `PhanTrangBang` · `StatusPill` · `KhungDuLieu` · và **cả
 * bốn Server Action** của khu quản trị (`listEligibleClassesAction` ·
 * `createTransferRequestAction` · `approveTransferAction` ·
 * `rejectTransferAction`) — đường GHI không nhân bản.
 *
 * ── Buộc phải chép (nợ trôi lệch) ───────────────────────────────────────────
 * Truy vấn (đã dồn vào `lib/sale/chuyen-lop.ts`) và ba mảnh giao diện ở
 * `_components/` — biểu mẫu bốn bước, bảng yêu cầu chờ, hai nút thao tác.
 *
 * ── Cổng quyền: KHÔNG rộng hơn màn, nhưng có MỘT quyền thứ hai ở TẦNG HÀNH ĐỘNG ─
 * `PAGE_GATES["/sale/chuyen-lop"]` = `["enrollments:create"]`, ĐÚNG BẰNG cổng bản
 * admin (`checkAnyPermission(PAGE_GATES["/chuyen-lop"])`, cùng một ô). Nên không
 * cần tầng kiểm thứ hai cho cả màn.
 *
 * `enrollments:transfer` KHÁC: nó không phải cổng vào màn mà là quyền DUYỆT
 * (P1-c — sale/quản lý TẠO yêu cầu, chỉ quản lý DUYỆT). Nó đi xuống dưới dạng
 * `canDuyet`, đúng như bản admin: thiếu quyền thì thấy "Chờ quản lý duyệt" chứ
 * KHÔNG bị đá khỏi màn — đá ra là chặn luôn việc TẠO yêu cầu, tức việc chính của
 * người dùng site này.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { GiaiThichTrang } from "@/components/sale/ui/giai-thich-trang";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { layDuLieuChuyenLop } from "@/lib/sale/chuyen-lop";
import { FormChuyenLop } from "./_components/form-chuyen-lop";
import { BangYeuCauChuyen } from "./_components/bang-yeu-cau";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chuyển lớp / cơ sở | Tư vấn tuyển sinh" };

/** Băng tiêu đề của một khối trong khung — nền chìm để đọc ra là "vách ngăn". */
const BANG_TIEU_DE =
  "border-b border-border bg-[color:var(--surface-chim)] px-5 py-2.5 " +
  "text-sm font-semibold text-foreground";

export default async function ManChuyenLop({
  searchParams,
}: {
  searchParams: Promise<{ fromCenterId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fchuyen-lop");

  const chan = await chanNeuThieuQuyen("/sale/chuyen-lop", "Chuyển lớp / cơ sở");
  if (chan) return chan;

  const canDuyet = await checkPermission("enrollments:transfer");

  const sp = await searchParams;
  const maCoSoNguon = sp.fromCenterId?.trim() || "";

  const actor = await resolveActor(session.user.id);
  const du = await layDuLieuChuyenLop({ actor, maCoSoNguon });

  return (
    <KhungDuLieu className="max-w-[72rem]">
      <KhungDuLieu.Dau
        ten="Chuyển lớp / chuyển cơ sở"
        mo="Yêu cầu chuyển lớp và chuyển cơ sở"
      />

      {/* Câu chữ chép nguyên `<PageHelp>` của bản admin — chỉ đổi vỏ: `PageHelp`
          tự vẽ một THẺ hoàn chỉnh, mà mọi thứ ở đây đã nằm trong `KhungDuLieu`
          nên đặt vào là khung lồng khung (`khung-du-lieu.tsx` cấm thẳng). */}
      <GiaiThichTrang>
        <p>
          Lớp đích cùng khoá, không vượt tiến độ học viên. Hết chỗ → tự đưa vào danh sách
          chờ (waitlist). Giữ lịch sử cơ sở cũ.
        </p>
      </GiaiThichTrang>

      <section className="border-b border-border">
        <h2 className={BANG_TIEU_DE}>Tạo yêu cầu chuyển</h2>
        <FormChuyenLop
          hocVien={du.hocVien}
          coSo={du.coSo}
          maCoSoNguon={maCoSoNguon}
        />
      </section>

      <section>
        <h2 className={BANG_TIEU_DE}>Yêu cầu đang chờ</h2>
        <BangYeuCauChuyen dong={du.yeuCau} canDuyet={canDuyet} />
      </section>
    </KhungDuLieu>
  );
}
