/**
 * Site Sale — màn "Học bạ" (`/sale/hoc-ba`).
 *
 * ══ BẢN ĐÔI CỦA `app/(admin)/admin/hoc-ba/page.tsx` ═════════════════════════
 *
 * ⚠️ LỊCH SỬ, ĐỪNG "SỬA": Ban giám đốc chốt 10/07/2026 rằng Sale KHÔNG xem học
 *    bạ. Chủ dự án 28/08/2026 yêu cầu đưa mục này về site Sale, nên ĐƯỜNG có mặt
 *    còn CỔNG giữ nguyên hai action của quyết định cũ — `curriculum:view` +
 *    `students:view-own-class`, xem chú thích `/hoc-ba` trong
 *    `lib/auth/page-gates.ts`. Sale vào được chỉ khi quản trị viên cấp quyền
 *    trong giao diện, tức một lần đảo quyết định CÓ DẤU VẾT. **Nới cổng ở đây là
 *    lặng lẽ lật quyết định của BGĐ.**
 *
 * ── Vì sao tệp này không còn là lớp bọc ─────────────────────────────────────
 * Tới 04/09/2026 nó chỉ mount lại `<AdminTranscriptPage />`. Chủ dự án chốt ngày
 * đó rằng các màn site Sale phải TÁCH BẢN RIÊNG để thiết kế lại mà không đụng một
 * pixel nào của khu quản trị. Rủi ro trôi lệch đã được nêu; vẫn chọn đường này.
 *
 * ── Cổng quyền: KHÔNG rộng hơn màn ──────────────────────────────────────────
 * `PAGE_GATES["/sale/hoc-ba"]` và `PAGE_GATES["/hoc-ba"]` khai CÙNG một cặp
 * action, và bản admin cũng gác bằng `checkAnyPermission(PAGE_GATES["/hoc-ba"])`
 * — hai bên trùng khít, nên không cần tầng kiểm thứ hai. (Nút "Tải PDF" thì có
 * một cổng RỘNG HƠN nằm ở route API; nợ đó ghi tại chỗ trong
 * `_components/hoc-ba-hoc-vien.tsx`.)
 *
 * ── Dùng lại được, KHÔNG chép ───────────────────────────────────────────────
 * `getStudentTranscript` · `scopedDb` (chống IDOR theo cơ sở) · `PhanTrangBang` ·
 * `ENROLLMENT_STATUS` · `SKILL_LABEL`/`LEVEL_LABEL` · `KhungDuLieu`.
 *
 * ── Buộc phải chép (nợ trôi lệch) ───────────────────────────────────────────
 * Phần VẼ học bạ: `components/transcript/transcript-view.tsx` là component dùng
 * chung portal + admin, và quyết định 04/09 là site Sale không dùng chung nữa.
 * Bản Sale ở `_components/hoc-ba-hoc-vien.tsx`, đầu tệp có danh sách khối phải
 * khớp giữa hai bản.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { layDuLieuHocBa } from "@/lib/sale/hoc-ba";
import { ChonHocVien } from "./_components/chon-hoc-vien";
import { HocBaHocVien } from "./_components/hoc-ba-hoc-vien";

export const dynamic = "force-dynamic";
export const metadata = { title: "Học bạ | Tư vấn tuyển sinh" };

export default async function ManHocBa({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fhoc-ba");

  const chan = await chanNeuThieuQuyen("/sale/hoc-ba", "Học bạ");
  if (chan) return chan;

  const { studentId } = await searchParams;
  const maHocVien = studentId?.trim() || undefined;

  const actor = await resolveActor(session.user.id);
  const { danhSach, hocBa } = await layDuLieuHocBa({ actor, maHocVien });

  return (
    <KhungDuLieu className="max-w-[72rem]">
      <KhungDuLieu.Dau
        ten="Học bạ học viên"
        mo="Chọn học viên để xem quá trình học tổng hợp + xuất PDF."
      />

      <KhungDuLieu.Loc>
        <ChonHocVien danhSach={danhSach} dangChon={maHocVien ?? ""} />
      </KhungDuLieu.Loc>

      {maHocVien && !hocBa ? (
        <p className="border-b border-border bg-[color:var(--state-danger-soft)] px-5 py-3 text-sm text-[color:var(--state-danger)]">
          Không tìm thấy học viên hoặc ngoài phạm vi cơ sở.
        </p>
      ) : null}

      {hocBa ? (
        <HocBaHocVien
          t={hocBa}
          duongPdf={`/api/admin/reports/transcript?studentId=${maHocVien}`}
        />
      ) : !maHocVien ? (
        // Bản admin để trống khi chưa chọn ai. `operate.md`: màn rỗng phải DẠY
        // giao diện — nói thẳng còn thiếu bước nào, thay vì một khoảng trắng làm
        // người dùng tưởng trang hỏng.
        <KhungDuLieu.Rong
          ten="Chưa chọn học viên"
          mo="Chọn một học viên ở ô trên rồi bấm Xem để mở học bạ tổng hợp."
        />
      ) : null}
    </KhungDuLieu>
  );
}
