// loading.tsx — hình của màn Đối soát khi dữ liệu kỳ chưa về (§5).
// Giữ đúng bố cục 1/3 – 2/3 để lúc dữ liệu tới không nhảy khung.
import { Skeleton } from "@/components/ui/skeleton";
import { ScopeBarSkeleton, TableSkeleton } from "@/components/admin/cham-cong/skeletons";

export default function Loading() {
  return (
    <div className="max-w-6xl">
      <ScopeBarSkeleton />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <Skeleton aria-busy aria-label="Đang tải…" className="h-48 w-full rounded-xl" />
        </div>
        <div className="space-y-5 lg:col-span-2">
          <Skeleton aria-busy aria-label="Đang tải…" className="h-24 w-full rounded-xl" />
          <TableSkeleton cols={7} />
        </div>
      </div>
    </div>
  );
}
