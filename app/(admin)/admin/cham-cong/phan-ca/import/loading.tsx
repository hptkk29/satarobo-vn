// app/(admin)/admin/cham-cong/phan-ca/import/loading.tsx — hình của màn import khi dữ liệu chưa về.
//
// Vì sao file này tồn tại: page đọc danh sách nhân sự + 5 dòng nhật ký trước khi vẽ, nên vào màn là
// trắng vài trăm ms. Skeleton mang ĐÚNG hình: ba bước ở trên, thẻ chọn file ở dưới — người dùng
// nhận ra mình đang ở đâu trước khi nội dung kịp về.
import { FormSkeleton } from "@/components/admin/cham-cong/skeletons";
import { Stepper } from "./_components/stepper";

export default function Loading() {
  return (
    <div className="max-w-6xl">
      <Stepper
        items={[
          { label: "1. Đọc file", state: "current" },
          { label: "2. Ánh xạ & phạm vi", state: "todo" },
          { label: "3. Kết quả", state: "todo" },
        ]}
      />
      <FormSkeleton fields={3} />
    </div>
  );
}
