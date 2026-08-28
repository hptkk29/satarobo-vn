/**
 * Cổng quyền cho các màn site Sale MOUNT LẠI từ khu quản trị (28/08/2026).
 *
 * ── Vì sao phải có tầng này chứ không mount thẳng ───────────────────────────
 * 32 màn chủ dự án yêu cầu đều ĐÃ CÓ bên `app/(admin)/admin/**`. Nhưng mỗi trang
 * bên đó tự kiểm quyền rồi **đá về `/dashboard`** khi thiếu:
 *
 *     if (!(await checkPermission("orders:view"))) redirect("/dashboard?error=unauthorized");
 *
 * `/dashboard` chỉ có nghĩa TRÊN TÊN MIỀN ADMIN, nơi proxy viết lại nó thành
 * `/admin/dashboard`. Trên host Sale — và trên mọi host "không xác định" như
 * `localhost` hay `test.satarobo.vn` nơi bốn khu dùng chung một tên miền — đó là
 * **404 trắng trơn**. Đúng cái bẫy vừa vá ở khung site Sale sáng 28/08; mount
 * thẳng 24 trang là tái sinh nó ở 24 chỗ.
 *
 * Nên mọi màn mount lại đi qua `chanNeuThieuQuyen()` TRƯỚC. Thiếu quyền thì trả
 * về một màn "không có quyền" đàng hoàng — đúng trạng thái hạng nhất mà
 * `PRODUCT.md` yêu cầu — chứ không rơi vào đường từ chối của bản admin.
 *
 * ⚠️ TẦNG NÀY KHÔNG CẤP QUYỀN CHO AI. Nó chỉ ĐỌC `PAGE_GATES` và hỏi
 *    `checkAnyPermission`. Chủ dự án chốt 28/08: *"cấp quyền là đúng nhưng admin
 *    sẽ cấp chứ không phải dùng code"* — nên ma trận quyền và seed vai KHÔNG bị
 *    đợt này đụng tới. Màn nào Sale chưa có quyền thì menu tự ẩn và trang tự
 *    chặn; đúng phút admin cấp quyền trong giao diện là nó hiện ra, không cần
 *    triển khai lại.
 */
import Link from "next/link";
import { checkAnyPermission } from "@/lib/auth/check-permission";
import { PAGE_GATES } from "@/lib/auth/page-gates";

/** Màn "không có quyền" của site Sale — một chỗ, mọi màn mount lại dùng chung. */
function ManKhongCoQuyen({ ten }: { ten: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Bạn chưa có quyền vào mục {ten}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Mục này có trong hệ thống nhưng tài khoản của bạn chưa được cấp quyền. Nhờ quản
        trị viên cấp quyền trong phần Phân quyền — không cần cài đặt lại gì.
      </p>
      <Link
        href="/sale"
        className="mt-5 inline-flex h-9 items-center rounded-lg bg-[color:var(--primary)] px-4 text-sm font-medium text-[color:var(--primary-foreground)] transition-colors hover:bg-[color:var(--primary-dark)]"
      >
        Về bảng việc hôm nay
      </Link>
    </div>
  );
}

/**
 * @param duong khoá trong `PAGE_GATES`, vd `"/sale/don-hang"`.
 * @param ten   tên mục hiện trong câu từ chối — viết như người dùng gọi nó.
 * @returns `null` = qua cổng, cứ vẽ trang. Khác `null` = trả thẳng cái này ra.
 *
 * ⚠️ Đường KHÔNG khai trong `PAGE_GATES` bị coi là CHƯA CÓ CỔNG và **chặn** — chứ
 *    không phải "mở cho mọi người". Quên khai một đường mới thì hỏng theo hướng
 *    an toàn, và người vận hành thấy ngay; ngược lại là rò im lặng.
 */
export async function chanNeuThieuQuyen(
  duong: string,
  ten: string,
): Promise<React.ReactNode | null> {
  const gate = (PAGE_GATES as Record<string, readonly string[] | undefined>)[duong];
  if (!gate || gate.length === 0) return <ManKhongCoQuyen ten={ten} />;
  const co = await checkAnyPermission([...gate]);
  return co ? null : <ManKhongCoQuyen ten={ten} />;
}
