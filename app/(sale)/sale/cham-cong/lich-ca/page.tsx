/**
 * Site Sale — màn "Lịch ca của tôi".
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/cham-cong/lich-ca/page.tsx` ─────────────
 * Tách bản riêng theo chốt 04/09/2026. Bản admin GIỮ NGUYÊN, không sửa.
 *
 * NỘI DUNG GIỮ NGUYÊN 100% — cùng tiêu đề, cùng hai nút lùi/tiến tháng, cùng ba
 * câu nhắc cửa sổ đề xuất (đang mở / cuối tuần / ngoài cửa sổ), cùng dòng đếm
 * lượt khẩn cấp kèm câu "— đã hết lượt, liên hệ quản lý.", cùng lưới lịch.
 *
 * ⚠️ Tham số `month` (`YYYY-MM`) là thứ duy nhất làm hai nút lùi/tiến tháng có
 *    tác dụng. Nuốt mất là bấm không nhúc nhích, luôn hiện tháng hiện tại. Hai
 *    liên kết dưới đây viết TƯỜNG MINH `/sale/cham-cong/lich-ca` — bản admin trỏ
 *    `/cham-cong/lich-ca`, đường SẠCH của host quản trị, và trên host Sale (hoặc
 *    trên localhost / test.satarobo.vn nơi bốn khu dùng chung một tên miền) đó là
 *    404 trắng trơn.
 *
 * ── CỔNG QUYỀN: KHÔNG CÓ TẦNG HAI, VÀ ĐÓ LÀ KẾT LUẬN CÓ KIỂM ────────────────
 *   tầng 1 · `PAGE_GATES["/sale/cham-cong/lich-ca"]` = ["hr_attendance:checkin"]
 *   bản admin gác  `checkPermission("hr_attendance:checkin", { centerId: … })`
 *
 * CÙNG MỘT ACTION. Khác duy nhất là bản admin kèm target. Theo `scopeMatches`
 * (`lib/auth/can.ts`), thêm target chỉ có thể biến `false → true`: `GLOBAL` luôn
 * đúng dù có target hay không, còn `CENTER` **không** có target thì luôn sai.
 * Nghĩa là qua được cổng ⇒ chắc chắn qua được phép kiểm của bản admin ⇒ chép nó
 * xuống đây là **mã chết**, và mã chết ở đường quyền là thứ khiến lần sau không
 * ai dám bỏ. Cổng RỘNG HƠN màn thì phải giữ hai tầng (xem `/sale/cham-cong`);
 * trùng khít thì một tầng là đủ.
 *
 * Đường GHI vẫn tự gác: `saveMyShifts` hỏi lại `hr_attendance:checkin` kèm
 * `centerId` của chính người lưu, ngay đầu action.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { GiaiThichTrang } from "@/components/sale/ui/giai-thich-trang";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { layLichCaCuaToi } from "@/lib/sale/cham-cong";
import { LichCaCuaToi } from "./_components/lich-ca-cua-toi";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lịch ca của tôi | Tư vấn tuyển sinh" };

interface ThamSo {
  searchParams: Promise<{ month?: string }>;
}

const NUT_THANG =
  "inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card " +
  "text-foreground transition-colors hover:bg-muted focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30";

export default async function ManLichCaSale({ searchParams }: ThamSo) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fcham-cong%2Flich-ca");

  const chan = await chanNeuThieuQuyen("/sale/cham-cong/lich-ca", "Lịch ca của tôi");
  if (chan) return chan;

  const { month } = await searchParams;
  const actor = await resolveActor(session.user.id);
  const d = await layLichCaCuaToi({ actor, userId: session.user.id, thang: month });

  const hetLuot = d.daDungKhanCap >= d.tranKhanCap;

  return (
    <KhungDuLieu>
      {/* Bản admin không có câu mô tả nào dưới tiêu đề — không bịa thêm một câu.
          Nhãn tháng nằm ở bộ chuyển tháng bên phải, đúng chỗ bản admin đặt nó. */}
      <KhungDuLieu.Dau
        ten="Lịch ca của tôi"
        hanhDong={
          <div className="flex items-center gap-2">
            <CalendarDays
              aria-hidden="true"
              className="mr-1 size-5 text-[color:var(--primary-ink)]"
            />
            <Link
              href={`/sale/cham-cong/lich-ca?month=${d.thangTruoc}`}
              aria-label="Tháng trước"
              className={NUT_THANG}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </Link>
            <span className="text-sm font-semibold text-foreground">{d.nhanThang}</span>
            <Link
              href={`/sale/cham-cong/lich-ca?month=${d.thangSau}`}
              aria-label="Tháng sau"
              className={NUT_THANG}
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        }
      />

      {/* Bản admin để câu nhắc CỬA SỔ ĐỀ XUẤT luôn mở ngay dưới tiêu đề. Nó đúng ở
          lần đầu và thừa ở mọi lần sau — người trực mở màn này mỗi tháng vài lần,
          và luật thì không đổi. Nay nó vào dải thu lại (`<details>` gốc, chạy
          trước cả khi JS tải xong). Không mất một chữ nào, chỉ thôi chiếm chỗ. */}
      <GiaiThichTrang nhan="Cửa sổ đề xuất ca">{d.goYCuaSo}</GiaiThichTrang>

      {/* ⚠️ DÒNG ĐẾM LƯỢT KHẨN CẤP THÌ **KHÔNG** ĐƯỢC THU LẠI. Nó không phải luật
          chung mà là một HẠN MỨC ĐANG TIÊU của chính người này, và cái giá của
          việc giấu nó rất cụ thể: người đã dùng hết 3 lượt sẽ chọn ca, bấm Lưu,
          rồi mới biết qua một thông báo lỗi đỏ. Bản admin để nó luôn hiện — giữ
          nguyên quyết định đó, chỉ đổi hình dáng. */}
      <div className="border-b border-border px-5 py-2.5">
        <p
          className={
            hetLuot
              ? "rounded-lg bg-[color:var(--state-danger-soft)] px-3 py-2 text-xs font-medium text-[color:var(--state-danger)]"
              : "text-xs text-muted-foreground"
          }
        >
          Khẩn cấp (đổi/nghỉ gấp) tháng này:{" "}
          <b>
            {d.daDungKhanCap}/{d.tranKhanCap}
          </b>
          {hetLuot && " — đã hết lượt, liên hệ quản lý."}
        </p>
      </div>

      {/* Lưới lịch KHÔNG phải bảng dữ liệu nên không nằm trong `KhungDuLieu.Than`
          (vùng cuộn ngang): 7 cột luôn vừa bề ngang, ép cuộn chỉ tạo thanh cuộn ma. */}
      <div className="space-y-1 px-5 py-4">
        <LichCaCuaToi
          o={d.o}
          theoNgay={d.theoNgay}
          dayTheoNgay={d.dayTheoNgay}
          homNay={d.homNay}
        />
      </div>

      {/* Dải chân nói CÁCH DÙNG lưới, không nhắc lại chính sách: câu về "ĐỀ XUẤT /
          quản lý duyệt" chỉ đúng trong một số cửa sổ thời gian và đã nằm nguyên
          văn ở dải giải thích bên trên. Chép lại ở đây là dựng một câu luôn hiện
          cho một luật chỉ đôi khi đúng. */}
      <KhungDuLieu.Chan>Bấm vào một ngày để đăng ký hoặc sửa ca của ngày đó.</KhungDuLieu.Chan>
    </KhungDuLieu>
  );
}
