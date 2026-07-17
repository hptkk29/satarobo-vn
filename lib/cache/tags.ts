// Tag registry cho next/cache (unstable_cache + revalidateTag) — 1 NGUỒN tên tag.
// Dùng hằng số thay magic string để không drift giữa nơi cache và nơi invalidate.
// Mở rộng dần khi thêm dữ liệu read-mostly được cache cross-request (dashboard, report,
// settings...). REQ-13 foundation.

export const CACHE_TAGS = {
  /** Cây OrgUnit (global, read-mostly). Invalidate khi tạo/sửa/xoá OrgUnit. REQ-02. */
  orgTree: "org-tree",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];
