"use client";

/**
 * `<img>` kèm ảnh dự phòng — bản đôi của `MediaImg` trong
 * `app/(admin)/admin/media/_components/media-client.tsx` (chốt tách bản 04/09/2026).
 *
 * ⚠️ TÁCH RA TỆP RIÊNG vì hai khối việc của màn (khung đăng ảnh · thư viện) nay
 *    là hai component rời, và cả hai đều cần nó. Chép hai lần là hai chỗ để quên
 *    khi sửa.
 *
 * ⚠️ FALLBACK PHẢI LÀ HAI LỚP, đừng rút còn một:
 *      · `onError` — bắt lỗi tải xảy ra SAU khi React gắn handler.
 *      · ref callback — bắt ảnh ĐÃ hỏng từ lúc SSR. Sự kiện `error` bắn TRƯỚC
 *        khi React kịp gắn `onError`, nên một mình `onError` là không đủ; 12 ảnh
 *        `seed-placeholder://` vẫn vỡ (QA 20/07). Đây là lỗi đã xảy ra, không
 *        phải phòng xa.
 *
 * ⚠️ `<img>` thuần chứ KHÔNG `next/image`: `fileUrl` trỏ sang R2 (`cdn.satarobo.vn`
 *    / `pub-*.r2.dev`), và khi bật cờ `MEDIA_SIGNED_URL` thì nó còn mang chữ ký
 *    hết hạn sau 600s. Cho bộ tối ưu ảnh của Next đi qua đó là (a) phải khai
 *    remotePattern cho một host kho tệp, (b) cache một URL sắp hết hạn ở tầng
 *    khác. Bản admin cũng dùng `<img>` thuần vì đúng lý do này.
 */

// Ảnh seed (`seed-placeholder://`) hoặc URL hỏng không resolve được → hiện khung
// xám có chữ thay vì icon ảnh vỡ của trình duyệt.
const ANH_DU_PHONG =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#f3f4f6"/><text x="50%" y="50%" font-family="sans-serif" font-size="14" fill="#9ca3af" text-anchor="middle" dominant-baseline="middle">Ảnh không tải được</text></svg>',
  );

function doiSangDuPhong(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.src !== ANH_DU_PHONG) img.src = ANH_DU_PHONG;
}

export function AnhCoDuPhong({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) {
  const soiAnhHong = (img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth === 0 && img.src !== ANH_DU_PHONG) {
      img.src = ANH_DU_PHONG;
    }
  };
  return (
    <img
      src={src}
      alt={alt}
      ref={soiAnhHong}
      onError={doiSangDuPhong}
      className={className}
    />
  );
}
