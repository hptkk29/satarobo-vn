// app/(sale)/sale/trial/page.tsx — Đợt C: trang trải nghiệm của site Sale.
//
// Nhân bản hình dạng trang trial của bản mẫu TeachUI (nhóm theo NGÀY → thẻ KHUNG
// GIỜ → bảng học viên), nhưng chạy dữ liệu thật và bù 2 cột mà bản site giáo
// viên cố ý bỏ: **Phụ huynh** (câu 46 cấm ở site GV, ở site Sale là chính đáng)
// và **Đã nhập học**.
//
// Phần rubric/PDF KHÔNG viết lại — dùng lại nguyên `TrialRubricEval` + bản PDF
// máy chủ đã có. Sale chỉ XEM phiếu và xuất, người chấm vẫn là giáo viên.
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { checkAnyPermission } from "@/lib/auth/check-permission";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { canViewParentContact } from "@/lib/auth/permissions";
import { getSaleTrialRoster } from "@/lib/trial/sale-roster";
import { cuaSoTrial, docPhamVi, moTaPhamVi } from "@/lib/trial/sale-window";
import { SaleTrialList } from "./_components/trial-list";
import { PhamViChips } from "./_components/pham-vi-chips";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lớp trải nghiệm | Tư vấn tuyển sinh" };

export default async function SaleTrialPage({
  searchParams,
}: {
  // `pham_vi` đổi CỬA SỔ TRUY VẤN nên phải đọc ở server; lọc trong trình duyệt
  // không giải được — buổi ngoài cửa sổ chưa bao giờ được tải về.
  searchParams: Promise<{ pham_vi?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Gác bằng bảng chung thay vì gõ action rời: thanh điều hướng đọc đúng mảng
  // này làm `perm`, nên menu và cổng không thể lệch nhau. `page-gates.test.ts`
  // khoá lại điều đó.
  if (!(await checkAnyPermission(PAGE_GATES["/sale/trial"]))) redirect("/sale");

  const actor = await resolveActor(session.user.id);

  // 03/09 — trước đây cửa sổ đóng cứng "hôm nay → +21 ngày", không có bộ lọc nào.
  // Mà giáo viên chỉ chấm phiếu SAU khi buổi diễn ra ⇒ sang hôm sau buổi rơi khỏi
  // bảng, mang theo luôn nút "Xem / Xuất PDF" — Sale không còn đường lấy phiếu.
  const phamVi = docPhamVi((await searchParams).pham_vi);
  const { tu, den } = cuaSoTrial(phamVi);

  const roster = await getSaleTrialRoster(actor, tu, den, {
    // Quyền tính ở tầng này rồi TRUYỀN xuống — hàm truy vấn không tự đoán quyền.
    canViewParentContact: canViewParentContact(session.user),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Lớp trải nghiệm</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {moTaPhamVi(phamVi)} Chỉ cơ sở của bạn.
      </p>
      <PhamViChips current={phamVi} />
      <SaleTrialList
        slots={roster.slots.map((s) => ({ ...s, date: s.date.toISOString() }))}
        unassigned={roster.unassigned}
        laPhamViMacDinh={phamVi === "sap-toi"}
      />
    </div>
  );
}
