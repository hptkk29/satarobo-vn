import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Logo thương hiệu ở đỉnh thanh bên site Sale.
 *
 * Dùng CÙNG asset thật với site giáo viên (`/brand/logo-satarobo.png`, 644×380,
 * nền trong suốt) — logo là logo, không phải màu, nên chỗ này không có gì để
 * tách theo site. Đổi logo thì thay file, không sửa mã.
 *
 * Khác site GV đúng một chỗ: đích của liên kết là `/sale`, và nhãn cho trình đọc
 * màn hình nói đúng khu đang đứng.
 */
export function SaleLogo({ className }: { className?: string }) {
  return (
    <Link
      href="/sale"
      aria-label="Sata Robo — Tư vấn tuyển sinh"
      className={cn(
        "inline-flex items-center rounded-lg outline-none",
        "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40",
        className,
      )}
    >
      <Image
        src="/brand/logo-satarobo.png"
        alt="Sata Robo"
        width={644}
        height={380}
        priority
        className="h-9 w-auto"
      />
    </Link>
  );
}
