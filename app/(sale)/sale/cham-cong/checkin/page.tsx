/**
 * Site Sale — màn "Điểm danh vào ca" (quét QR tại quầy rồi bấm Check-in/out).
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/cham-cong/checkin/page.tsx` ─────────────
 * Tách bản riêng theo chốt 04/09/2026. Bản admin GIỮ NGUYÊN, không sửa.
 *
 * NỘI DUNG GIỮ NGUYÊN 100% — cùng tiêu đề, cùng hai tham số `c` (mã cơ sở) và
 * `t` (token trên mã QR), cùng câu báo mã hỏng, cùng hai nút.
 *
 * ⚠️ HAI THAM SỐ `c` VÀ `t` LÀ THỨ DUY NHẤT LÀM MÀN NÀY CHẠY ĐƯỢC. Nuốt mất thì
 *    người quét QR nào cũng chỉ thấy câu "Mã QR không hợp lệ", và không lỗi nào
 *    nổ để biết vì sao.
 *
 * 🔴 ĐƯỜNG QUAY LẠI SAU ĐĂNG NHẬP PHẢI LÀ ĐƯỜNG CỦA HOST SALE. Bản admin dựng
 *    `callbackUrl=/cham-cong/checkin?c=…&t=…` — đường SẠCH của host quản trị.
 *    Bản mount cũ dùng thẳng nó, nên nhân viên Sale quét QR lúc chưa đăng nhập
 *    sẽ đăng nhập xong rồi rơi vào một đường không tồn tại trên host Sale, mang
 *    theo cả `c` lẫn `t` — tức phải ra quầy quét lại. Ở đây đường viết tường minh
 *    `/sale/cham-cong/checkin`.
 *
 * ── CỔNG QUYỀN: CỔNG VÀ MÀN HỎI CÙNG MỘT QUYỀN ─────────────────────────────
 *   tầng 1 · `PAGE_GATES["/sale/cham-cong/checkin"]` = ["hr_attendance:checkin"]
 *   tầng 2 · `checkPermission("hr_attendance:checkin", { centerId: c })`
 *
 * Cùng action, chỉ khác chỗ tầng 2 có TARGET. Theo `scopeMatches`
 * (`lib/auth/can.ts`), thêm target chỉ có thể biến `false → true` (GLOBAL luôn
 * đúng; CENTER không target thì luôn sai) ⇒ **qua được cổng thì chắc chắn qua
 * được tầng hai**. Nếu đây là một màn chỉ để ĐỌC thì tầng hai là mã chết và phải
 * bỏ. Giữ lại vì hai lý do khác:
 *   1. `c` đến từ ĐƯỜNG DẪN, tức người dùng đổi được. Đây là chỗ duy nhất trong
 *      nhóm chấm công có target do bên ngoài đưa vào.
 *   2. Nó là ĐÚNG vị từ mà `recordCheckin` đòi. Trang hỏi trước rồi mới vẽ nút:
 *      một cái nút bấm vào để nhận câu "Không có quyền chấm công" là lời hứa
 *      suông, không phải một tính năng.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { KhungDiemDanh } from "./_components/khung-diem-danh";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Điểm danh vào ca | Tư vấn tuyển sinh",
  robots: { index: false },
};

interface ThamSo {
  searchParams: Promise<{ c?: string; t?: string }>;
}

export default async function ManDiemDanhSale({ searchParams }: ThamSo) {
  const session = await auth();
  const { c, t } = await searchParams;
  if (!session?.user) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(
        `/sale/cham-cong/checkin?c=${c ?? ""}&t=${t ?? ""}`,
      )}`,
    );
  }

  const chan = await chanNeuThieuQuyen("/sale/cham-cong/checkin", "Điểm danh vào ca");
  if (chan) return chan;

  const chamCongDuoc = await checkPermission("hr_attendance:checkin", { centerId: c ?? null });

  return (
    // `max-w-sm` giữ nguyên bề ngang bản admin: màn này dùng trên ĐIỆN THOẠI ngay
    // sau khi quét QR, hai nút phải nằm trong tầm ngón cái.
    <div className="mx-auto max-w-sm">
      <KhungDuLieu>
        <KhungDuLieu.Dau ten="Chấm công nhân viên" />
        {!c || !t ? (
          <KhungDuLieu.Rong
            ten="Mã QR không hợp lệ."
            mo="Vui lòng quét lại mã trên màn hình chấm công."
          />
        ) : !chamCongDuoc ? (
          <KhungDuLieu.Rong
            ten="Bạn không có quyền chấm công tại cơ sở này"
            mo="Mã QR vừa quét thuộc một cơ sở khác. Quét mã tại chính cơ sở bạn làm việc, hoặc nhờ quản trị viên cấp quyền."
          />
        ) : (
          <KhungDiemDanh maCoSo={c} token={t} />
        )}
      </KhungDuLieu>
    </div>
  );
}
