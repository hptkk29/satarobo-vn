// app/(admin)/admin/cau-hinh-van-hanh/_components/config-tabs.tsx
//
// Ba tab của màn Cấu hình vận hành.
//
// ⚠️ ĐÂY LÀ LỐI VÀO DUY NHẤT của màn Phương thức thanh toán kể từ 14/09/2026. Chủ dự án
// chốt: "màn phương thức thanh toán: gộp vào trong cấu hình vận hành thành 1 tab riêng,
// và ẩn khỏi sidebar luôn." Mục sidebar cũ đã gỡ, và `/payment-methods` nay chuyển hướng
// về đây — nên xoá một dòng dưới đây là màn đó thành mồ côi.
//
// `href` phải là CHUỖI LITERAL: `components/admin/nav-coverage.test.ts` quét tĩnh chuỗi
// sau `href:`/`href=` để biết route nào còn lối vào. Ghép chuỗi động là test không thấy.
import Link from "next/link";

import { cn } from "@/lib/utils";

export type ConfigTabKey = "tham-so" | "phuong-thuc-tt" | "hoa-hong";

const TAB: { key: ConfigTabKey; nhan: string; href: string; mo: string }[] = [
  {
    key: "tham-so",
    nhan: "Tham số vận hành",
    href: "/cau-hinh-van-hanh",
    mo: "Ngưỡng, hạn mức, cờ bật/tắt của toàn hệ thống",
  },
  {
    key: "phuong-thuc-tt",
    nhan: "Phương thức thanh toán",
    href: "/cau-hinh-van-hanh?tab=phuong-thuc-tt",
    mo: "Tiền mặt, chuyển khoản, cổng online — theo từng cơ sở hoặc dùng chung",
  },
  {
    key: "hoa-hong",
    nhan: "Chính sách hoa hồng",
    href: "/cau-hinh-van-hanh?tab=hoa-hong",
    mo: "Khoản chi theo vai, sự kiện và loại đơn — thêm bớt không cần lập trình",
  },
];

export function ConfigTabs({ active }: { active: ConfigTabKey }) {
  const moTa = TAB.find((t) => t.key === active)?.mo;
  return (
    <div className="border-b border-border">
      <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Nhóm cấu hình">
        {TAB.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors duration-150",
              t.key === active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {t.nhan}
          </Link>
        ))}
      </nav>
      {moTa && <p className="pb-3 pt-2 text-xs text-muted-foreground">{moTa}</p>}
    </div>
  );
}
