/**
 * Site Sale — màn "Yêu cầu chỉnh công".
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/cham-cong/yeu-cau-cong/page.tsx` ────────
 * Tách bản riêng theo chốt 04/09/2026. Bản admin GIỮ NGUYÊN, không sửa.
 *
 * NỘI DUNG GIỮ NGUYÊN 100% — cùng tiêu đề, cùng câu mô tả, cùng câu hướng dẫn
 * ("Bạn không tự sửa công — …"), cùng câu khuyến nghị cuối tuần (và cùng điều
 * kiện hiện nó), cùng biểu mẫu ba ô, cùng danh sách yêu cầu đã gửi với đủ bốn
 * mảnh: ngày · nhãn trạng thái · "Đề nghị: …" · lý do · "Phản hồi: …".
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. `<PageHelp>` của khu quản trị → `<GiaiThichTrang>`. `PageHelp` tự vẽ một
 *    THẺ hoàn chỉnh (`rounded-xl border bg-card`), đặt trong `KhungDuLieu` là
 *    khung lồng khung — thứ `components/sale/ui/khung-du-lieu.tsx` cấm thẳng.
 * 2. Biểu mẫu nằm trong dải `KhungDuLieu.Loc`. Dải đó mang nền `--surface-chim`
 *    để mắt đọc nó là "CÔNG CỤ" chứ không phải "dữ liệu" — và trên màn này công
 *    cụ đúng là cái biểu mẫu, không phải một thanh lọc. Danh sách bên dưới mới
 *    là dữ liệu. Bản admin để hai thứ đó là hai thẻ trắng giống hệt nhau, nên
 *    mắt phải đọc chữ mới biết đâu là chỗ nhập, đâu là chỗ xem.
 * 3. Nhãn trạng thái: `<span>` gõ tay chuỗi màu → `<StatusPill tone={…}>`, tone
 *    quyết ở `lib/sale/cham-cong.ts` (`lib/sale/ky-luat-mau.test.ts` canh).
 *
 * ── CỔNG QUYỀN: KHÔNG CÓ TẦNG HAI, VÀ ĐÓ LÀ KẾT LUẬN CÓ KIỂM ────────────────
 *   tầng 1 · `PAGE_GATES["/sale/cham-cong/yeu-cau-cong"]` = ["hr_attendance:checkin"]
 *   bản admin gác  `checkPermission("hr_attendance:checkin", { centerId: … })`
 * Cùng action; bản admin chỉ thêm target, mà thêm target chỉ có thể nới ra chứ
 * không siết vào (`scopeMatches`, `lib/auth/can.ts`). Qua cổng ⇒ qua phép kiểm
 * đó ⇒ chép xuống đây là mã chết. Lý lẽ đầy đủ ghi ở đầu
 * `app/(sale)/sale/cham-cong/lich-ca/page.tsx`.
 *
 * Đường GHI vẫn tự gác: `createAdjustmentRequest` hỏi lại đúng quyền đó ngay đầu
 * action, kèm `centerId` của người gửi.
 *
 * ⚠️ MÀN NÀY CHỈ LIỆT KÊ YÊU CẦU CỦA CHÍNH NGƯỜI ĐĂNG NHẬP (`userId` cố định
 *    trong truy vấn). Nó KHÔNG phải màn duyệt — màn duyệt là
 *    `/cham-cong/chinh-cong`, đòi `hr_attendance:adjust`, và site Sale CHƯA có
 *    (`⚠️ NỢ ĐÃ BIẾT`, đã ghi trong `lib/sale/duong-dan-sale.ts`). Không có liên
 *    kết nào trỏ sang đó từ đây, nên không có link 404 nào phát sinh.
 */
import { redirect } from "next/navigation";
import { ClipboardEdit } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { isWeekendEditWindow } from "@/lib/shifts";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { GiaiThichTrang } from "@/components/sale/ui/giai-thich-trang";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { layYeuCauChinhCong } from "@/lib/sale/cham-cong";
import { FormYeuCauCong } from "./_components/form-yeu-cau-cong";

export const dynamic = "force-dynamic";
export const metadata = { title: "Yêu cầu chỉnh công | Tư vấn tuyển sinh" };

export default async function ManYeuCauCongSale() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fcham-cong%2Fyeu-cau-cong");

  const chan = await chanNeuThieuQuyen("/sale/cham-cong/yeu-cau-cong", "Yêu cầu chỉnh công");
  if (chan) return chan;

  const actor = await resolveActor(session.user.id);
  const dong = await layYeuCauChinhCong({ actor, userId: session.user.id });
  const ngoaiCuoiTuan = !isWeekendEditWindow(new Date());

  return (
    <div className="mx-auto max-w-2xl">
      <KhungDuLieu>
        <KhungDuLieu.Dau
          ten="Yêu cầu chỉnh công"
          mo={
            <span className="inline-flex items-center gap-1.5">
              <ClipboardEdit
                aria-hidden="true"
                className="size-4 text-[color:var(--primary-ink)]"
              />
              Gửi yêu cầu chỉnh công của bạn
            </span>
          }
        />

        <GiaiThichTrang>
          Bạn không tự sửa công — gửi yêu cầu kèm lý do, quản lý cơ sở duyệt (admin cấp cao
          duyệt mọi lúc).
        </GiaiThichTrang>

        <KhungDuLieu.Loc>
          {/* Câu khuyến nghị cuối tuần giữ nguyên chỗ và giữ nguyên ĐIỀU KIỆN hiện
              của bản admin: chỉ hiện vào ngày thường. Nó nói về việc sắp làm ngay
              bên dưới nên phải NHÌN THẤY, không thu vào dải giải thích. */}
          {ngoaiCuoiTuan && (
            <p className="mb-3 rounded-lg bg-[color:var(--state-warning-soft)] px-3 py-2 text-xs text-[color:var(--state-warning)]">
              Khuyến nghị gửi yêu cầu chỉnh sửa vào Thứ 7 / Chủ nhật. Ngày thường vẫn gửi
              được, quản lý sẽ xử lý theo lịch.
            </p>
          )}
          <FormYeuCauCong />
        </KhungDuLieu.Loc>

        {dong.length === 0 ? (
          <KhungDuLieu.Rong
            ten="Chưa có yêu cầu nào."
            mo="Yêu cầu bạn gửi ở ô trên sẽ hiện tại đây kèm trạng thái duyệt và phản hồi của quản lý."
          />
        ) : (
          <>
            <div className="px-5 pt-4">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Yêu cầu đã gửi
              </h2>
            </div>
            <ul className="space-y-2 px-5 py-3">
              {dong.map((r) => (
                <li key={r.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">{r.ngay}</span>
                    <StatusPill tone={r.trangThai.tone}>{r.trangThai.nhan}</StatusPill>
                  </div>
                  {r.deNghi && <p className="mt-1 text-sm text-foreground">Đề nghị: {r.deNghi}</p>}
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {r.lyDo}
                  </p>
                  {r.phanHoi && (
                    <p className="mt-2 rounded-lg bg-[color:var(--surface-chim)] p-2 text-sm text-muted-foreground">
                      Phản hồi: {r.phanHoi}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <KhungDuLieu.Chan>
              {dong.length} yêu cầu gần nhất (tối đa 100) — chỉ yêu cầu của chính bạn
            </KhungDuLieu.Chan>
          </>
        )}
      </KhungDuLieu>
    </div>
  );
}
