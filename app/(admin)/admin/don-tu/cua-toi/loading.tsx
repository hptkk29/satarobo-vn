// Khung chờ "Đơn của tôi": tab cụm Của tôi + hàng tab trạng thái + bảng 7 cột — đúng hình thật.
import { Skeleton } from "@/components/ui/skeleton";
import { MeNav } from "@/components/admin/cham-cong/me-nav";
import { TableSkeleton } from "@/components/admin/cham-cong/skeletons";

export default function Loading() {
  return (
    <div className="max-w-6xl">
      <div className="mb-5 sm:mb-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <MeNav active="cua-toi" />
      <div aria-busy aria-label="Đang tải…" className="mb-4 flex items-center gap-2 border-b border-border pb-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="ml-auto h-9 w-28 rounded-lg" />
      </div>
      <TableSkeleton cols={7} rows={8} />
    </div>
  );
}
