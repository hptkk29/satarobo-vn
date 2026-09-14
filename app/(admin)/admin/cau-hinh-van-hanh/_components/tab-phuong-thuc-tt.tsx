import Link from "next/link";
import { Plus } from "lucide-react";

import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { Button } from "@/components/ui/button";
import { PaymentMethodsTable } from "../../payment-methods/_components/payment-methods-table";

/**
 * TAB "Phương thức thanh toán" trong Cấu hình vận hành.
 *
 * Nội dung dời từ `/payment-methods` (chủ dự án 14/09/2026: "gộp vào trong cấu hình vận
 * hành thành 1 tab riêng, và ẩn khỏi sidebar luôn"). Trang cũ nay chuyển hướng về đây nên
 * link cũ, dấu trang cũ và nút "Quản lý phương thức thanh toán →" ở màn Cơ sở đều không vỡ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * "LINH HOẠT KHI THÊM CƠ SỞ" — ĐÃ CÓ SẴN, VÀ ĐÂY LÀ CHỖ NÓ NẰM
 *
 * Chủ dự án dặn "sau này nếu có thêm cơ sở thì không phải làm nhiều bước… quản lý toàn bộ
 * các cơ sở". Câu tra dưới đây KHÔNG có `where` theo cơ sở, và đó là cố ý:
 * `PaymentMethod` nằm trong CẢ `SCOPED_MODELS` lẫn `NULL_IS_GLOBAL_MODELS`, nên `scopedDb`
 * tự chèn `OR: [{ centerId: null }, { centerId: { in: visibleCenterIds } }]`. Nghĩa là:
 *
 *   · `centerId = NULL` là phương thức DÙNG CHUNG mọi cơ sở — mở cơ sở mới, nó tự có;
 *   · phương thức riêng của cơ sở chỉ hiện với người thuộc cơ sở đó;
 *   · Hội sở / Quản trị tối cao thấy toàn bộ, không cần bộ lọc nào.
 *
 * Nên mở CS3 là thêm một `Center` — không thêm bước nào ở màn này và không sửa mã.
 *
 * ⚠️ Mã phương thức (`code`) vẫn `@unique` TOÀN CỤC, nên phương thức riêng của cơ sở phải
 * đặt hậu tố: `BANK_CS1`, `BANK_CS2`. Đó là chốt 30/08/2026, không phải sơ suất — hạ
 * xuống khoá ghép `[code, centerId]` thì Postgres coi NULL là khác nhau và khoá không
 * chặn được đúng ca cần chặn.
 */
export async function TabPhuongThucThanhToan({
  centerIdFilter,
}: {
  /** Đến từ `?centerId=` — đường vào từ trang Cơ sở. `null` = xem tất cả. */
  centerIdFilter: string | null;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const sdb = scopedDb(await resolveActor(session.user.id));

  // "Chỉ cơ sở X" nghĩa là phương thức RIÊNG của X *cộng* phương thức dùng chung — đó mới
  // đúng bộ mà người tạo đơn cho cơ sở X thật sự chọn được. Lọc `centerId: X` trần sẽ
  // giấu mất tiền mặt/cổng online và làm màn nói dối về thứ đang có.
  const where = centerIdFilter
    ? { OR: [{ centerId: null }, { centerId: centerIdFilter }] }
    : {};

  const [methods, centers] = await Promise.all([
    sdb.paymentMethod.findMany({
      where,
      orderBy: [{ centerId: "asc" }, { displayOrder: "asc" }, { name: "asc" }],
    }),
    sdb.center.findMany({ select: { id: true, name: true } }),
  ]);
  const centerNames = Object.fromEntries(centers.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
          Phương thức <b className="font-semibold text-foreground">gắn cơ sở</b> chỉ hiện ở
          đơn của cơ sở đó; phương thức{" "}
          <b className="font-semibold text-foreground">dùng chung</b> (cột Cơ sở để trống)
          hiện ở mọi cơ sở, kể cả cơ sở mở sau này. Tài khoản ngân hàng dựng mã QR khai ngay
          trong từng phương thức.
        </p>
        <Link href="/payment-methods/new">
          <Button className="min-h-11">
            <Plus className="h-4 w-4" aria-hidden />
            Thêm phương thức
          </Button>
        </Link>
      </div>

      {centerIdFilter && (
        // Bộ lọc đến từ URL nên không có ô nào trên màn cho thấy nó đang bật — thiếu dòng
        // này thì người dùng đọc bảng thiếu dòng và tưởng dữ liệu bị mất.
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Đang lọc theo cơ sở:</span>
          <span className="font-semibold text-foreground">
            {centerNames[centerIdFilter] ?? centerIdFilter}
          </span>
          <span className="text-xs text-muted-foreground">(gồm cả phương thức dùng chung)</span>
          <Link
            href="/cau-hinh-van-hanh?tab=phuong-thuc-tt"
            className="ml-auto font-semibold text-primary underline-offset-2 hover:underline"
          >
            Bỏ lọc
          </Link>
        </div>
      )}

      {methods.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-5 py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            Chưa có phương thức thanh toán nào
          </p>
          <p className="mx-auto mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
            Không có phương thức nào thì{" "}
            <b className="font-semibold">màn tạo đơn hiện danh sách rỗng</b> và không ai chốt
            được đơn. Tạo ít nhất một phương thức dùng chung (tiền mặt) để bắt đầu.
          </p>
          <Link href="/payment-methods/new" className="mt-3 inline-block">
            <Button className="min-h-11">
              <Plus className="h-4 w-4" aria-hidden />
              Thêm phương thức
            </Button>
          </Link>
        </div>
      ) : (
        <PaymentMethodsTable methods={methods} centerNames={centerNames} />
      )}
    </div>
  );
}
