// Khung chờ của lưới phân ca. Phải mang ĐÚNG hình của màn thật (thanh phạm vi → 5 thẻ số → lưới
// người × ngày): đổi khối hay đổi tháng ở đây kéo vài trăm ô, không có khung chờ thì màn trắng
// một nhịp rồi nhảy, người dùng tưởng bấm hụt và bấm lại.
import { GridSkeleton, KpiSkeleton, ScopeBarSkeleton } from "@/components/admin/cham-cong/skeletons";

export default function Loading() {
  return (
    <div className="max-w-[1400px]">
      <ScopeBarSkeleton />
      <KpiSkeleton n={5} />
      <GridSkeleton />
    </div>
  );
}
