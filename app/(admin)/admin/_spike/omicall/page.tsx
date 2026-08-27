import { redirect } from "next/navigation";
import { checkAnyPermission } from "@/lib/auth/check-permission";
import { SpikeOmicallClient } from "./spike-client";

// =============================================================================
// 🧪 TRANG THỬ (SPIKE) — CH-4 / §5.2 của spec. KHÔNG PHẢI TÍNH NĂNG.
//
// ⚠️ PHẢI XOÁ TRANG NÀY sau khi có kết luận spike (spec §5.2 mục "Đầu ra": *"Xoá
//    trang spike sau khi kết luận — đừng để code thử nằm lại"*). Xoá gồm:
//      · thư mục `app/(admin)/admin/_spike/`
//      · dòng `/_spike/omicall` trong ALLOWLIST của `components/admin/nav-coverage.test.ts`
//      · khối "Trang thử SDK" trong `tests/goi-dien/bat-bien.test.ts`
//
// CÂU HỎI DUY NHẤT SPIKE PHẢI TRẢ LỜI:
//   SDK web OmiCall có nhúng được vào Next.js 16 App Router / React 19 mà KHÔNG
//   phải hạ cấp React, KHÔNG phải tắt Strict Mode, KHÔNG phá `pnpm build` — và gọi
//   ra nghe được hai chiều?
//
// TIMEBOX: 2 NGÀY NGƯỜI. CỨNG. Hết giờ mà chưa xanh ⇒ kết luận KHÔNG ĐẠT và chuyển
// kế hoạch B (B1 ⭐ = bỏ nút bấm-gọi trong trình duyệt, Sale gọi bằng softphone của
// nhà cung cấp, hệ thống chỉ nhận webhook CDR — giữ 100% dữ liệu, rủi ro gần bằng 0).
// Không xin gia hạn: đó chính là điểm của timebox.
//
// TIÊU CHÍ ĐẠT (phải xanh TẤT CẢ):
//   ① SDK khởi tạo không lỗi fatal trên React 19, không cần `--force` khi cài;
//   ② gọi ra đổ chuông + nghe rõ hai chiều ≥ 30 giây;
//   ③ nhận đủ chuỗi sự kiện trạng thái (khởi tạo → đổ chuông → nghe máy → kết thúc)
//      kèm mã cuộc gọi;
//   ④ `pnpm typecheck && pnpm lint && pnpm build` PASS;
//   ⑤ chạy được trên Chrome desktop VÀ Safari iOS (Sale dùng điện thoại);
//   ⑥ số host ngoài phải thêm vào CSP ≤ 2 domain.
//
// KHÔNG ĐẠT nếu bất kỳ: SDK đòi React ≤ 18 · phải tắt `reactStrictMode` · không chạy
// Safari iOS · phải nhúng `<script>` chặn render · quá timebox.
//
// PHẠM VI CỨNG: trang này KHÔNG đụng bảng nào — không `@/lib/db`, không `scopedDb`,
// không Server Action ghi. Nó chỉ nạp SDK và in sự kiện ra màn hình.
// =============================================================================

export const dynamic = "force-dynamic";

export default async function SpikeOmicallPage() {
  // Cổng quyền: `calls:make`. Một trang gọi điện để hở là một trang ai cũng quay số
  // được bằng đầu số của công ty.
  if (!(await checkAnyPermission(["calls:make"]))) redirect("/admin/dashboard");

  const sdkUrl = process.env.NEXT_PUBLIC_OMICALL_SDK_URL ?? "";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-2">
        <p className="inline-flex rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
          TRANG THỬ — XOÁ SAU KHI CÓ KẾT LUẬN
        </p>
        <h1 className="text-2xl font-bold">Bài thử SDK OmiCall trên React 19</h1>
        <p className="text-sm text-muted-foreground">
          Trang này không lưu gì vào cơ sở dữ liệu. Nó chỉ nạp SDK của nhà cung cấp và
          in ra mọi sự kiện nhận được, để trả lời câu hỏi chặn CH-4 trước khi cam kết
          bất kỳ mốc lịch nào cho trục gọi điện.
        </p>
      </header>

      <SpikeOmicallClient sdkUrl={sdkUrl} />

      <section className="rounded border p-4 text-sm">
        <h2 className="mb-2 font-semibold">Cách chạy</h2>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>
            Đặt <code>NEXT_PUBLIC_OMICALL_SDK_URL</code> = địa chỉ CDN của SDK
            (chờ văn bản nhà cung cấp — cổng CH-3 · TQ-1).
          </li>
          <li>Đăng nhập tài khoản có quyền <code>calls:make</code>, mở trang này.</li>
          <li>Bấm “Nạp SDK”, xem có lỗi fatal nào trong bảng sự kiện không.</li>
          <li>Đăng ký máy nhánh, gọi ra một số nội bộ, giữ máy ≥ 30 giây.</li>
          <li>
            Chụp lại bảng sự kiện + console, ghi kết luận đạt/không đạt vào một trang A4.
          </li>
        </ol>
      </section>
    </div>
  );
}
