import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Logo thương hiệu SATA ROBO (asset thật `/brand/logo-satarobo.png`, 644×380,
 * nền trong suốt → hợp cả Sáng lẫn Tối). Đây là LOGO nên vẫn giữ cả tông tím —
 * quy tắc "site GV cam-only" áp cho accent UI, không áp cho logo thương hiệu.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/teacher"
      aria-label="Sata Robo — Giáo viên"
      className={cn("inline-flex items-center", className)}
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
