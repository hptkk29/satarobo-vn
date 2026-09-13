import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { catalogEntries } from "@/lib/notifications/catalog";
import { getGlobalSetting } from "@/lib/settings/read-global";
import { kiemVapid, MO_TA_LOI_VAPID } from "@/lib/push/cau-hinh-vapid";
import { PageHelp } from "@/components/admin/ui/page-help";
import {
  ChonLoaiThongBao,
  type CanhBaoKenh,
} from "./_components/chon-loai-thong-bao";

// Trang đọc biến môi trường (khoá VAPID) + tham số vận hành ⇒ không được tĩnh hoá.
export const dynamic = "force-dynamic";

export const metadata = { title: "Cấu hình thông báo đẩy | Admin Sata Robo" };

/**
 * `/admin/cau-hinh-thong-bao-day` — chọn LOẠI thông báo nào rung điện thoại nhân viên.
 *
 * ── VÌ SAO KHÔNG DÙNG Ô JSON Ở /admin/cau-hinh-van-hanh ─────────────────────────────────
 * Khoá `push.tienToDuocDay` vẫn hiện ở màn đó (mọi key trong registry đều hiện), và về mặt kỹ
 * thuật sửa được. Nhưng ô ấy là một `<textarea>` JSON: người vận hành không có cách nào biết
 * 51 tiền tố hợp lệ là những chuỗi nào, không phân biệt được `lead.moi:` với `lead_moi:`, và
 * gõ sai một ký tự thì danh sách trông như đã bật mà thực tế không khớp gì — không lỗi, không
 * cảnh báo. Đó đúng là "affordance nói dối" mà luật 12 của repo nói tới.
 *
 * Màn này bày ra đúng những loại CÓ THẬT (dựng từ `catalogEntries()`, không chép tay), kèm
 * nhãn tiếng Việt, nhóm, mức và ai nhận — tức là đủ thông tin để quyết định.
 *
 * ── GÁC QUYỀN ───────────────────────────────────────────────────────────────────────────
 * `settings:view` để xem, `settings:edit` (= SUPER_ADMIN) để sửa — trùng `/cau-hinh-van-hanh`,
 * cố ý: đây là cùng một loại thao tác (đổi tham số vận hành toàn hệ) nên không được có hai
 * mức quyền khác nhau. Cổng ghi THẬT nằm trong `setGlobalSetting`; cổng ở đây chỉ là cửa vào.
 */
export default async function CauHinhThongBaoDayPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("settings:view"))) redirect("/admin/dashboard");

  const choSua = await checkPermission("settings:edit");
  const danhMuc = catalogEntries();

  // Đọc cả hai cổng phía trên để nói thật về tình trạng kênh.
  //
  // ⚠️ `getGlobalSetting` NÉM nếu khoá không có trong registry. Bắt lại ở đây chứ không để nó
  // làm vỡ cả trang: mất trang cấu hình đúng lúc cấu hình có vấn đề là mất luôn công cụ đi sửa.
  const [batTong, dangBatThoRaw] = await Promise.all([
    getGlobalSetting("push.webPushEnabled").catch(() => false),
    getGlobalSetting("push.tienToDuocDay").catch(() => [] as unknown),
  ]);
  const dangBat = Array.isArray(dangBatThoRaw)
    ? dangBatThoRaw.filter((x): x is string => typeof x === "string")
    : [];

  const { loi: loiVapid } = kiemVapid();

  const canhBao: CanhBaoKenh[] = [];
  if (batTong !== true) {
    canhBao.push({
      cau: "Công tắc tổng Web Push đang TẮT",
      choSua: "Bật ở Cấu hình vận hành, khoá push.webPushEnabled.",
    });
  }
  if (loiVapid) {
    canhBao.push({
      cau: `Khoá VAPID chưa dùng được: ${MO_TA_LOI_VAPID[loiVapid]}`,
      choSua: "Sửa biến môi trường trên Vercel rồi deploy lại.",
    });
  }
  // Khoá lạ trong DB — không thể chọn/bỏ chọn trên bảng vì bảng chỉ bày loại có thật, nên nếu
  // im lặng thì nó nằm đó mãi và người dùng đếm "3 loại bật" trong khi DB có 4. Nói ra.
  const hopLe = new Set(danhMuc.map((e) => e.prefix));
  const khoaLa = dangBat.filter((t) => !hopLe.has(t));
  if (khoaLa.length > 0) {
    canhBao.push({
      cau: `Cấu hình có ${khoaLa.length} khoá không còn trong danh mục (${khoaLa.join(", ")})`,
      choSua: "Bấm Lưu một lần ở bảng dưới để dọn — khoá lạ không khớp thông báo nào.",
    });
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cấu hình thông báo đẩy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chọn loại thông báo nào được đẩy ra điện thoại nhân viên
        </p>
      </div>

      <PageHelp>
        <p>
          Đây là <strong>danh sách trắng</strong>: chỉ loại được bật mới đẩy Web Push, mọi loại
          còn lại chỉ hiện ở chuông trong ứng dụng. Để trống nghĩa là không đẩy gì — không phải
          đẩy tất.
        </p>
        <p className="mt-2">
          Bật một loại là quyết định vận hành, không phải dọn kỹ thuật. Trước khi bật, trả lời
          được hai câu: loại này một ngày sinh bao nhiêu thông báo cho <em>một</em> người, và
          người đó có cần biết trong vòng một phút không? Đẩy quá nhiều thì nhân viên tắt quyền
          thông báo ở cấp trình duyệt — và hệ thống <strong>không có cách nào xin lại</strong>,
          nút &ldquo;Bật thông báo&rdquo; từ đó chỉ báo đã bị chặn.
        </p>
        <p className="mt-2">
          Mỗi lần lưu đều ghi nhật ký kiểm toán kèm lý do. Thay đổi có hiệu lực trong vòng 5
          phút.
        </p>
      </PageHelp>

      {!choSua && (
        <div className="rounded-lg border border-state-warning-soft bg-state-warning-soft px-4 py-3 text-sm text-state-warning-ink">
          Bạn chỉ có quyền <strong>xem</strong>. Chỉ SUPER_ADMIN được đổi cấu hình này.
        </div>
      )}

      <ChonLoaiThongBao
        danhMuc={danhMuc}
        dangBat={dangBat}
        choSua={choSua}
        canhBao={canhBao}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-muted/50 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Công tắc tổng, khoá VAPID và các tham số vận hành khác nằm ở trang Cấu hình vận hành.
        </p>
        <Link
          href="/admin/cau-hinh-van-hanh"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
        >
          Mở Cấu hình vận hành{" "}
          <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
