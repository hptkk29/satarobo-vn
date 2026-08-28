// app/(admin)/admin/lop-trial/layout.tsx
//
// Khung chung của màn "Lớp Trial". CỐ Ý không gác quyền ở đây: gate đặt ở từng page
// (rẻ vì `resolveActor` cache theo request) để không phụ thuộc thứ tự chạy layout/page,
// và để mỗi page tự quyết redirect đi đâu.
//
// 28/08/2026 — GỠ thanh tab. Màn từng có hai mặt phẳng ("Lớp trải nghiệm" V2 và "Lịch
// hẹn học thử" V1); mặt phẳng V1 đã bị gỡ khỏi hệ thống nên chỉ còn một, mà một tab thì
// không phải tab — nó là một cái nhãn thừa chiếm chỗ và mời người dùng đi tìm cái thứ hai.
import type { ReactNode } from "react";
import { PageHelp } from "@/components/admin/ui/page-help";

export const metadata = { title: "Lớp Trial | Admin" };

export default function LopTrialLayout({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-foreground">Lớp Trial</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Lớp trải nghiệm nhiều buổi: tạo lớp → thêm buổi → xếp học viên → điểm danh.
      </p>

      <PageHelp>
        <p>
          Tạo lớp chỉ cần <strong>cơ sở</strong> và <strong>khoá trải nghiệm</strong>; tên
          lớp hệ thống tự đặt. Ngày, giờ, phòng và giáo viên chọn khi <strong>thêm
          buổi</strong> — mỗi buổi có thể khác nhau.
        </p>
        <p className="mt-2">
          Thêm một học viên vào lớp là em đó học <strong>toàn bộ buổi</strong> của lớp, kể
          cả buổi tạo sau.
        </p>
        <p className="mt-2">
          Đổi lịch hoặc huỷ một buổi phải <strong>ghi lý do</strong> — lý do đó được gửi
          thẳng cho giáo viên phụ trách buổi.
        </p>
      </PageHelp>

      <div className="mt-4">{children}</div>
    </div>
  );
}
