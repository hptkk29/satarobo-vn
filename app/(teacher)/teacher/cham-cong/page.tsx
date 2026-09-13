// app/(teacher)/teacher/cham-cong/page.tsx — L0 chấm công (05/09/2026): mục menu
// "Chấm công" trên site GV. Chấm công là quét mã QR tại quầy (mã trỏ thẳng vào
// ./checkin), nên trang này chỉ hướng dẫn — không có nút chấm tay (không có nút chấm
// tay là CHỦ ĐÍCH: chấm ở đâu thì phải đứng ở đó quét).
import { QrCode, ScanLine } from "lucide-react";
import { PageHeader } from "../_components/ui/page-header";

export const metadata = { title: "Chấm công | Giáo viên", robots: { index: false } };

export default function TeacherChamCongPage() {
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Chấm công" subtitle="Quét mã QR trên màn hình tại quầy cơ sở." />
      <div className="rounded-2xl bg-card p-6 shadow-sm">
        <ol className="space-y-4 text-sm text-foreground">
          <li className="flex gap-3">
            <ScanLine className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span>
              Mở camera điện thoại, quét mã QR trên màn hình chấm công tại quầy. Đường dẫn mở ra
              chính là trang chấm công của bạn.
            </span>
          </li>
          <li className="flex gap-3">
            <QrCode className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span>
              Bấm <b>Check-in</b> khi tới, <b>Check-out</b> khi về. Bật định vị (GPS) khi được
              hỏi. Mỗi loại chỉ ghi một lần trong ngày.
            </span>
          </li>
        </ol>
        <p className="mt-5 text-xs text-muted-foreground">
          Quét nhầm mã của cơ sở khác sẽ bị từ chối. Nếu bạn dạy thay ở cơ sở khác theo phân
          công, báo Quản lý cơ sở đó xác nhận công.
        </p>
      </div>
    </div>
  );
}
