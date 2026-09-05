/**
 * Site Sale — màn "Chấm công nhân viên" (một ngày).
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA `app/(admin)/admin/cham-cong/page.tsx` ───────────────
 * Trước 04/09/2026 tệp này chỉ MOUNT LẠI trang admin (`<AdminChamCongPage/>`).
 * Chủ dự án chốt 04/09/2026: các màn site Sale tách bản riêng, không dùng chung
 * component với khu quản trị nữa, để thiết kế lại giao diện site Sale mà **không
 * đụng một pixel nào** của khu quản trị. Rủi ro trôi lệch đã được nêu; chủ dự án
 * vẫn chọn đường này. Bản admin giữ nguyên, không sửa.
 *
 * NỘI DUNG GIỮ NGUYÊN 100% — cùng tiêu đề, cùng câu định nghĩa ba ca, cùng bảy
 * cột, cùng ô chọn ngày, cùng dải "N người chưa check-out", cùng câu rỗng, cùng
 * nút "Mở màn hình QR". Chỉ đổi CÁCH BÀY theo hệ thiết kế Sale (`KhungDuLieu` +
 * `.bang-sale` + `StatusPill` + token tím của `sale.css`).
 *
 * ═══ CỔNG QUYỀN: Ở MÀN NÀY CỔNG **RỘNG HƠN** MÀN — GIỮ CẢ HAI TẦNG ═════════
 *   tầng 1 · `PAGE_GATES["/sale/cham-cong"]` = ["hr_attendance:checkin"]
 *   tầng 2 · chính trang đòi  `hr_attendance:view`  (có target cơ sở)
 *
 * Hai quyền KHÁC NHAU, không phải hai cách viết của một quyền: `:checkin` là
 * "được chấm công cho bản thân" (GLOBAL ở mọi vai, kể cả Sale cơ sở); `:view` là
 * "được xem công của NGƯỜI KHÁC" (seed ở scope CENTER cho CENTER_HR /
 * CENTER_MANAGER, và Sale cơ sở KHÔNG có). Bỏ tầng hai ở đây là để tư vấn viên
 * đọc giờ vào/ra của toàn bộ đồng nghiệp — nới quyền im lặng.
 *
 * ⚠️ ĐỪNG "SỬA CHO ĐÚNG NGHĨA" BẰNG CÁCH ĐỔI CỔNG TẦNG 1 SANG `:view`. Lý do
 *    đầy đủ nằm ở `lib/auth/page-gates.ts`: cổng cấp trang gọi
 *    `checkAnyPermission` KHÔNG kèm target, mà `:view` seed ở scope CENTER ⇒
 *    `scopeMatches` trả FALSE và khoá cả CENTER_HR lẫn CENTER_MANAGER ra ngoài
 *    **trên prod**, trong khi máy dev (v1 tĩnh) vẫn xanh. Phép lọc chính xác
 *    theo cơ sở là tầng hai ngay dưới đây — nó CÓ target.
 *
 * ⚠️ THIẾU TẦNG HAI THÌ KHÔNG `redirect("/dashboard")` NHƯ BẢN ADMIN.
 *    `/dashboard` chỉ có nghĩa trên tên miền quản trị; trên host Sale và trên
 *    mọi host "không xác định" (localhost, test.satarobo.vn) nó là 404 trắng
 *    trơn. Ở đây trả về một màn từ chối đàng hoàng, có lối đi tiếp.
 *
 * ── KHÔNG PHÂN NHÁNH BẰNG MÃ VAI ────────────────────────────────────────────
 * Bản admin cắt phạm vi bằng `hasRole(session.user, "CENTER_MANAGER")
 *   ? session.user.centerId : null`. Ai không khớp mã vai đó rơi vào nhánh
 * `null` = **không thêm mệnh đề cơ sở nào**. Trên site Sale không ai mang mã
 * `CENTER_MANAGER` (khung site chỉ cho Sale THUẦN vào) nên nhánh đó chết cứng,
 * và phạm vi thật đến từ đâu thì không đọc ra được từ trang. Bản này bỏ hẳn
 * `hasRole`: ba bảng dữ liệu (`EmployeeCheckin`, `ShiftRegistration`, `Center`)
 * đọc qua `scopedDb(actor)`, tức phạm vi lấy từ cây tổ chức chứ không từ một
 * chuỗi mã vai. Với Sale, kết quả TRÙNG KHÍT bản admin (nhánh cũ luôn là `null`).
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Monitor } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { checkPermission } from "@/lib/auth/check-permission";
import { SHIFT_DEFS, SHIFT_ORDER } from "@/lib/shifts";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { layChamCongNgay } from "@/lib/sale/cham-cong";
import { BangChamCong } from "./_components/bang-cham-cong";
import { OChonNgay } from "./_components/o-chon-ngay";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chấm công | Tư vấn tuyển sinh" };

interface ThamSo {
  searchParams: Promise<{ date?: string }>;
}

/**
 * Màn từ chối của TẦNG HAI. Cố ý là một thành phần cục bộ chứ không phải bản
 * dùng chung: `ManKhongCoQuyen` trong `lib/sale/cong-trang.tsx` không được xuất
 * ra, và tệp đó đang có luồng khác đụng tới — mở rộng nó ở đây là tranh chấp một
 * tệp không thuộc phần việc này. Câu chữ bám sát bản dùng chung để hai màn từ
 * chối không nói hai giọng.
 */
function ManThieuQuyenXemCong() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Bạn chưa có quyền xem công của nhân viên
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Bảng này liệt kê giờ vào/ra của mọi nhân viên trong cơ sở, nên cần quyền xem chấm
        công. Tài khoản của bạn vẫn tự chấm công và xem lịch ca của mình được bình thường.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/sale/cham-cong/lich-ca"
          className="inline-flex h-9 items-center rounded-lg bg-[color:var(--primary)] px-4 text-sm font-medium text-[color:var(--primary-foreground)] transition-colors hover:bg-[color:var(--primary-dark)]"
        >
          Lịch ca của tôi
        </Link>
        <Link
          href="/sale"
          className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Về bảng việc hôm nay
        </Link>
      </div>
    </div>
  );
}

export default async function ManChamCongSale({ searchParams }: ThamSo) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fcham-cong");

  const chan = await chanNeuThieuQuyen("/sale/cham-cong", "Chấm công");
  if (chan) return chan;

  // TẦNG HAI — quyền xem công NGƯỜI KHÁC, có target cơ sở (xem khối đầu tệp).
  if (!(await checkPermission("hr_attendance:view", { centerId: session.user.centerId ?? null }))) {
    return <ManThieuQuyenXemCong />;
  }

  const { date } = await searchParams;
  const actor = await resolveActor(session.user.id);
  const { ngay, dong, thieuCheckOut } = await layChamCongNgay({ actor, ngay: date });

  return (
    <KhungDuLieu>
      <KhungDuLieu.Dau
        ten="Chấm công nhân viên"
        mo={`Tính công theo ca đăng ký (GMT+7): ${SHIFT_ORDER.map(
          (s) => `${SHIFT_DEFS[s].label} ${SHIFT_DEFS[s].start}–${SHIFT_DEFS[s].end}`,
        ).join(" · ")}.`}
        hanhDong={
          // ⚠️ NỢ ĐÃ BIẾT — `/cham-cong/man-hinh` là đường SẠCH của host quản trị và
          // site Sale CHƯA có màn tương ứng, nên trên `sale.satarobo.vn` liên kết này
          // là 404. Giữ nguyên là CỐ Ý: bản mount trước đây hỏng y hệt, đổi sang địa
          // chỉ khác chỉ là dời chỗ vỡ. KHÔNG chạy qua `duongSale()` — hàm đó không
          // ánh xạ đường này (nó nằm đúng trong danh sách "NỢ ĐÃ BIẾT" ở cuối
          // `lib/sale/duong-dan-sale.ts`), nên gọi nó chỉ là một lời hứa suông.
          // Lối ra đúng là dựng `/sale/cham-cong/man-hinh` — việc THÊM MÀN, phải hỏi
          // chủ dự án. Nút KHÔNG cần hỏi quyền riêng: màn QR gác đúng
          // `hr_attendance:view`, tức đúng quyền vừa kiểm ở tầng hai bên trên.
          <Link
            href="/cham-cong/man-hinh"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[color:var(--primary)] px-4 text-sm font-medium text-[color:var(--primary-foreground)] transition-colors hover:bg-[color:var(--primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40"
          >
            <Monitor aria-hidden="true" className="size-4" /> Mở màn hình QR
          </Link>
        }
      />

      <KhungDuLieu.Loc>
        <div className="flex flex-wrap items-center gap-3">
          <OChonNgay giaTri={ngay} />
          {thieuCheckOut > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--state-warning-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--state-warning)]">
              <AlertTriangle aria-hidden="true" className="size-3.5" /> {thieuCheckOut} người chưa
              check-out
            </span>
          )}
        </div>
      </KhungDuLieu.Loc>

      {dong.length === 0 ? (
        <KhungDuLieu.Rong
          ten={`Chưa có chấm công ngày ${ngay}.`}
          mo="Chọn ngày khác ở thanh trên, hoặc mở màn hình QR tại quầy để nhân viên quét vào ca."
        />
      ) : (
        <>
          <BangChamCong dong={dong} />
          <KhungDuLieu.Chan>
            {dong.length} nhân viên có ca hoặc có chấm công ngày {ngay}
          </KhungDuLieu.Chan>
        </>
      )}
    </KhungDuLieu>
  );
}
