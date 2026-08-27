// app/(admin)/admin/lop-trial/layout.tsx — GĐ2.
//
// Khung chung cho hai mặt phẳng của màn "Lớp Trial". CỐ Ý không gác quyền ở đây:
// gate đặt ở từng page (rẻ vì `resolveActor` cache theo request) để không phụ thuộc
// thứ tự chạy layout/page, và để mỗi page tự quyết redirect đi đâu.
import type { ReactNode } from "react";
import { PageHelp } from "@/components/admin/ui/page-help";
import { TabBar } from "./_components/tab-bar";

export const metadata = { title: "Lớp Trial | Admin" };

export default function LopTrialLayout({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-foreground">Lớp Trial</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Gộp hai màn cũ &quot;Học thử&quot; và &quot;Lớp trải nghiệm&quot; về một chỗ.
      </p>

      <PageHelp>
        <p>
          <strong>Lớp trải nghiệm</strong> là lớp nhiều buổi có thật: tạo lớp → thêm buổi →
          xếp học viên → điểm danh từng buổi → điền Phiếu đánh giá buổi học.
        </p>
        <p className="mt-2">
          <strong>Lịch hẹn học thử</strong> là các buổi hẹn 1-1 sinh tự động khi lead chuyển
          sang &quot;Đã hẹn học thử&quot;. Đổi giờ, đổi giáo viên, đổi trạng thái ở đó.
        </p>
        <p className="mt-2">
          Nhận xét sau buổi nằm ở <strong>Phiếu đánh giá buổi học</strong> trong từng lớp
          trải nghiệm, không nằm ở lịch hẹn.
        </p>
      </PageHelp>

      <TabBar />
      <div className="mt-4">{children}</div>
    </div>
  );
}
