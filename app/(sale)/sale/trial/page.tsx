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
import { SaleTrialList } from "./_components/trial-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lớp trải nghiệm | Tư vấn tuyển sinh" };

/** Cửa sổ mặc định: từ đầu hôm nay tới 21 ngày tới — đủ nhìn lịch sắp diễn ra. */
const NGAY_TOI = 21;

export default async function SaleTrialPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Gác bằng bảng chung thay vì gõ action rời: thanh điều hướng đọc đúng mảng
  // này làm `perm`, nên menu và cổng không thể lệch nhau. `page-gates.test.ts`
  // khoá lại điều đó.
  if (!(await checkAnyPermission(PAGE_GATES["/sale/trial"]))) redirect("/sale");

  const actor = await resolveActor(session.user.id);

  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + NGAY_TOI);

  const roster = await getSaleTrialRoster(actor, from, to, {
    // Quyền tính ở tầng này rồi TRUYỀN xuống — hàm truy vấn không tự đoán quyền.
    canViewParentContact: canViewParentContact(session.user),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Lớp trải nghiệm</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Học viên trải nghiệm trong {NGAY_TOI} ngày tới, theo cơ sở của bạn.
      </p>
      <SaleTrialList
        slots={roster.slots.map((s) => ({ ...s, date: s.date.toISOString() }))}
        unassigned={roster.unassigned}
      />
    </div>
  );
}
