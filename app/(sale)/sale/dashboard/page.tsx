/**
 * Site Sale — màn "Dashboard".
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA `app/(admin)/admin/dashboard/page.tsx` ──────────────
 * Trước 04/09/2026 tệp này chỉ MOUNT LẠI trang admin và chuyển tiếp `searchParams`.
 * Chủ dự án chốt 04/09/2026: các màn site Sale **tách bản riêng**, không dùng
 * chung component với khu quản trị nữa, để thiết kế lại giao diện site Sale mà
 * **không đụng một pixel nào** của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  KHỐI NÀO GIỮ, KHỐI NÀO BỎ — VÀ VÌ SAO
 * ═══════════════════════════════════════════════════════════════════════════
 * Bản admin là một dashboard GỘP (union): nó xếp chồng panel của TẤT CẢ vai trò
 * người đăng nhập đang giữ — Quản lý cơ sở (`BangDieuKhienQlcs`), Giáo viên, Tư
 * vấn, Kế toán, Marketing, Nhân sự — rồi lọc lại theo "vai đang chọn" từ cookie.
 *
 * Bản Sale GIỮ:
 *   · Khối "Cần xử lý" (`getPendingTasks`) — KHÔNG phân nhánh theo vai, nó lọc
 *     theo QUYỀN + CƠ SỞ ở tầng dữ liệu. Đây là hộp việc của NGƯỜI, nên nó đúng
 *     trên mọi site.
 *   · Toàn bộ panel Tư vấn (`SalesDashboard`): 4 ô "Việc của tôi", câu giải thích
 *     bốn ô, băng "học viên sắp hết khoá", phễu theo giai đoạn, phễu 8 tuần,
 *     "Việc cần làm", "Trải nghiệm sắp tới". Không bỏ khối nào.
 *
 * Bản Sale BỎ:
 *   · `BangDieuKhienQlcs` (panel Quản lý cơ sở) — cùng với nó là `searchParams`
 *     lọc phạm vi (cơ sở / khoảng ngày) mà lớp bọc cũ phải chuyển tiếp. Khối đó
 *     trả lời "CƠ SỞ đang chạy thế nào" (doanh thu/mục tiêu/công nợ), khác hẳn
 *     câu hỏi của màn này là "HÔM NAY TÔI gọi ai". Nó cũng là khối kéo theo biểu
 *     đồ, thứ site Sale bị ESLint chặn.
 *   · Panel Giáo viên · Kế toán · Marketing · Nhân sự, và `ManagerDashboard` ở
 *     nhánh dự phòng.
 *   · Dải nhãn vai ("QUẢN LÝ CƠ SỞ" / "TƯ VẤN / SALE"…) — chỉ có nghĩa khi màn
 *     xếp chồng nhiều panel.
 *
 * Vì sao bỏ chứ không "giữ cho đủ": đây là site TƯ VẤN TUYỂN SINH. Bê nguyên sáu
 * panel sang rồi để chúng rỗng là làm màn dài gấp bốn mà không thêm một tin nào —
 * và với người kiêm vai thì tệ hơn: họ sẽ đọc số liệu kế toán/nhân sự trên site
 * Sale, tức site này lặng lẽ thành cổng thứ hai vào dữ liệu của khu quản trị.
 *
 * ⚠️ HỆ QUẢ PHẢI BIẾT: người kiêm vai (vd Quản lý cơ sở kiêm tư vấn) vào
 *    `/sale/dashboard` sẽ KHÔNG thấy panel quản lý của mình ở đây. Đó là chủ
 *    đích — panel đó vẫn nguyên vẹn tại `admin.satarobo.vn/dashboard`.
 *
 * ── VÌ SAO KHÔNG PHÂN NHÁNH THEO VAI Ở ĐÂY ─────────────────────────────────
 * Bản admin hỏi `hasRole(session.user, "SALES_CSM")` — mã vai LEGACY. Dưới RBAC
 * v2 còn `HO_SALE` và `CENTER_SALES_CSM`, hai vai này qua được cổng
 * `PAGE_GATES["/sale/dashboard"] = ["leads:view-own"]` nhưng KHÔNG khớp
 * `hasRole("SALES_CSM")` ⇒ nếu chép nguyên nhánh đó sang, họ vào được màn và
 * thấy một trang trắng, không lỗi nào nổ ra. Nên ở đây **cổng quyền là thứ duy
 * nhất phân nhánh**: qua được `leads:view-own` thì thấy đủ màn. Dữ liệu vốn đã
 * lọc theo `assignedToId = tôi`, nên không có gì để rò.
 *
 * ── CÒN GIỮ NGUYÊN 100%: nội dung và bảng màu tím ──────────────────────────
 * Cùng con số, cùng nhãn, cùng câu chữ. Chỉ đổi CÁCH BÀY, theo hệ thiết kế Sale:
 * `DaiSoLieu` (dải số liền, không phải 4 thẻ "số to nhãn nhỏ") + khuôn `section`
 * của màn chủ + token tím của `sale.css`.
 *
 * Hai chỗ câu chữ buộc phải khác, và cả hai đều vì bản admin nói SAI trên host này:
 *   1. Tiêu đề màn là "Dashboard", đúng tên ở mục menu và ở câu từ chối quyền —
 *      chốt 04/09 là một tên duy nhất cho cả ba chỗ. Lời chào của bản admin
 *      (`Xin chào, X 👋`) không mất, nó xuống dòng mô tả.
 *   2. BỎ câu "Đang xem theo vai trò: … — đổi ở góc trên bên phải" và câu "Bạn
 *      đang giữ N vai trò — dashboard gộp đầy đủ công việc của bạn". Site Sale
 *      KHÔNG có màn đổi vai (`app/(sale)/sale/layout.tsx:127`) nên câu một chỉ
 *      vào một nút không tồn tại; và màn này không gộp panel nên câu hai sai
 *      luôn về mặt sự thật.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { auth } from "@/lib/auth";
import { canViewLeadPii } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { DaiSoLieu } from "@/components/sale/ui/dai-so-lieu";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { layDuLieuDashboardSale } from "@/lib/sale/dashboard";
import { KhoiCanXuLy } from "./_components/can-xu-ly";
import { KhoiPheuHienTai, KhoiPheuTheoTuan } from "./_components/khoi-lead";
import { KhoiTrialSapToi, KhoiViecCanLam } from "./_components/khoi-viec";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard | Tư vấn tuyển sinh" };

export default async function SaleDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fdashboard");

  const chan = await chanNeuThieuQuyen("/sale/dashboard", "Dashboard");
  if (chan) return chan;

  const hienPii = await canViewLeadPii();
  const [actor, du] = await Promise.all([
    resolveActor(session.user.id),
    // Tên người trong "Trải nghiệm sắp tới" được che NGAY TRONG hàm này, ở máy
    // chủ — không che ở JSX: che ở JSX thì giá trị thật vẫn nằm trong payload RSC
    // và ai mở tab Network cũng đọc được.
    layDuLieuDashboardSale({ userId: session.user.id, hienPii }),
  ]);

  const ten = session.user.name ?? "";
  const tenGoi = ten.split(" ").slice(-1)[0] || "bạn";
  const homNay = new Date().toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  // Tính MỘT LẦN ở server rồi truyền xuống — xem chú thích `bayGio` ở khối việc.
  const bayGio = Date.now();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Xin chào, {tenGoi} 👋 — {homNay}.
        </p>
      </header>

      {/* Bốn ô của bản admin, bày lại thành MỘT dải liền.
          Màu chỉ bật ở ô đòi hành động, và chỉ khi số > 0 (`DaiSoLieu` tự lo):
          một số 0 màu đỏ dạy người dùng bỏ qua màu đỏ. Ba ô kia KHÔNG tô — bản
          admin cho "Tôi chốt trong tháng" màu xanh thường trực, đó là màu khen
          thưởng chứ không phải màu chỉ việc.

          Ô "Việc của tôi quá hạn" cố ý KHÔNG có đường đi riêng: danh sách của nó
          nằm ngay bên dưới, trong tầm mắt — cùng lựa chọn với màn chủ `/sale`.
          Ô "Tỷ lệ chốt" cũng không: một tỉ lệ không có danh sách tương ứng để mở. */}
      <DaiSoLieu
        o={[
          {
            nhan: "Khách tôi đang giữ",
            soLuong: du.tongKhachCuaToi,
            // Bản admin trỏ `/leads` (mọi lead trong tầm nhìn). Bản Sale trỏ
            // "Khách của tôi" vì con số này lọc `assignedToId = tôi` — đó mới là
            // danh sách ĐÚNG BẰNG con số, không phải một tập lớn hơn.
            href: "/sale/khach-cua-toi",
          },
          {
            nhan: "Tôi chốt trong tháng",
            soLuong: du.chotTrongThang,
            // ⚠️ Đích là TẬP CHA: bộ lọc của "Khách của tôi" có `status` nhưng
            // không có "trong tháng", nên bấm vào sẽ thấy cả khách chốt tháng
            // trước. Đã nói rõ ở dòng phụ để không ai tưởng máy đếm sai.
            href: "/sale/khach-cua-toi?status=DA_DANG_KY",
            phu: "danh sách gồm cả tháng trước",
          },
          {
            nhan: "Tỷ lệ chốt của tôi (%)",
            soLuong: du.tyLeChot,
            phu: "đã đăng ký / tổng khách",
          },
          {
            nhan: "Việc của tôi quá hạn",
            soLuong: du.quaHan.length,
            mucChuY: "danger",
          },
        ]}
      />

      {/* Câu này là LOAD-BEARING, không phải chú thích trang trí: bốn ô trên lọc
          theo `assignedToId = tôi` và PHẢI giữ nguyên như vậy (chốt 27/08). Người
          sau nhìn "Khách tôi đang giữ" trên một bảng điều khiển rất dễ tưởng là
          thiếu sót và "sửa" nó thành số của cả cơ sở — lúc đó màn hành động biến
          thành bảng xếp hạng, và tư vấn viên mất đúng cái duy nhất họ cần khi vừa
          đăng nhập. `sales-dashboard.test.ts` bên admin canh cả cách lọc lẫn nhãn. */}
      <p className="text-xs text-muted-foreground">
        Bốn ô trên chỉ tính phiếu <b>được giao cho bạn</b> — đây là bảng để biết hôm nay gọi
        ai, không phải bảng thành tích. Xem theo cơ sở hoặc theo bộ lọc khác thì vào{" "}
        <Link href="/sale/khach-cua-toi" className="underline hover:text-[color:var(--primary-ink)]">
          Khách của tôi
        </Link>
        .
      </p>

      {/* ⚠️ KHỐI NÀY NẰM NGOÀI "của tôi" — CÓ CHỦ ĐÍCH, và nợ này chép nguyên từ
          bản admin. `getNearingEndEnrollments()` gọi KHÔNG tham số ⇒ nó đếm học
          viên sắp hết khoá của MỌI cơ sở: không lọc theo người được giao, cũng
          không lọc theo cơ sở của người đang xem (`lib/students/renewal.ts` dùng
          `db` trần). Nó khác bản chất bốn ô trên nên KHÔNG được đội nhãn "của
          tôi". Cách lọc chưa sửa — ngoài phạm vi đợt tách này, đã báo lại. */}
      {du.sapHetKhoa > 0 ? (
        <Link
          href="/sale/sap-het-khoa"
          className="flex items-center gap-2 rounded-xl border border-[color:var(--state-warning)]/35 bg-[color:var(--state-warning-soft)] p-3 text-sm text-[color:var(--state-warning)] transition-colors hover:border-[color:var(--state-warning)]"
        >
          <GraduationCap className="h-5 w-5 shrink-0" aria-hidden />
          <span>
            <b>{du.sapHetKhoa}</b> học viên sắp hết khoá (≤ 5 buổi) — nhắc phụ huynh tái tục.
          </span>
        </Link>
      ) : null}

      <KhoiCanXuLy user={session.user} actor={actor} />

      <div className="grid gap-4 lg:grid-cols-2">
        <KhoiViecCanLam quaHan={du.quaHan} homNay={du.homNay} bayGio={bayGio} />
        <KhoiTrialSapToi trial={du.trial} />
      </div>

      {/* Hai khối phễu xuống CUỐI: chúng trả lời "tháng vừa rồi tôi chạy thế nào",
          không phải "bây giờ tôi làm gì". Bản admin để phễu nằm TRÊN hai khối việc,
          nên thứ bấm được bị đẩy xuống dưới màn hình thứ hai trên điện thoại — mà
          tư vấn viên làm việc trên điện thoại là chính. */}
      <KhoiPheuHienTai giaiDoan={du.giaiDoan} />
      <KhoiPheuTheoTuan tuan={du.tuan} />
    </div>
  );
}
