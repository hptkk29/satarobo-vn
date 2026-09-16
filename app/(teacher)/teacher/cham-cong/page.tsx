// app/(teacher)/teacher/cham-cong/page.tsx — mục menu "Chấm công" trên site GV.
//
// Mặc định chấm công là QUÉT MÃ QR tại quầy (mã trỏ thẳng vào ./checkin), nên trang này
// chủ yếu là hướng dẫn.
//
// ⚠️ ĐÍNH CHÍNH CHÚ THÍCH CŨ (đặt 05/09/2026). Bản trước viết: "không có nút chấm tay là
// CHỦ ĐÍCH: chấm ở đâu thì phải đứng ở đó quét." Câu đó ĐÚNG cho ca làm tại cơ sở và VẪN
// đúng — nhưng từ 15/09/2026 nó KHÔNG còn đúng cho MỌI ngày.
//
// Phần A chốt: ngày ĐI CÔNG TÁC không có quầy nào để đứng, không mã QR, và không ghim
// được toạ độ trước vì công tác nhiều nơi. Ngày đó hiện ĐÚNG HAI NÚT Check in / Check out.
//
// Điều kiện hiện nút: ca hôm nay có `placeMode === "OFFSITE"` — KHÔNG hardcode mã "NG".
// Mã là TÊN, `placeMode` là NGHĨA; mã nào sau này khai OFFSITE cũng tự có nút.
//
// Nút ẩn KHÔNG phải một cổng: `chamCongTac` tự kiểm lại điều kiện ấy ở phía server, vì
// Server Action là một endpoint riêng và gọi thẳng được.
import { QrCode, ScanLine } from "lucide-react";
import { auth } from "@/lib/auth";
import { getMyShiftOfDay, getMyTapsOfDay } from "@/lib/cham-cong/my-schedule";
import { vnDateOnly } from "@/lib/time/vn";
import { PageHeader } from "../_components/ui/page-header";
import { NutCongTac } from "./_components/nut-cong-tac";

export const metadata = { title: "Chấm công | Giáo viên", robots: { index: false } };

/** Giờ VN "HH:mm" của một mốc. */
const gioVN = (d: Date) =>
  new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(d);

export default async function TeacherChamCongPage() {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate

  const homNay = vnDateOnly(new Date());
  const ca = await getMyShiftOfDay(session.user.id, homNay);
  const laCongTac = ca?.placeMode === "OFFSITE";

  const taps = laCongTac ? await getMyTapsOfDay(session.user.id, homNay) : [];
  const vao = taps.find((t) => t.direction === "CHECK_IN");
  // Lượt RA lấy cái CUỐI: bấm nhầm rồi bấm lại thì mốc đúng là mốc sau.
  const ra = [...taps].reverse().find((t) => t.direction === "CHECK_OUT");

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="Chấm công"
        subtitle={
          laCongTac
            ? `Hôm nay bạn đi công tác (ca ${ca!.templateCode}) — bấm hai nút dưới đây.`
            : "Quét mã QR trên màn hình tại quầy cơ sở."
        }
      />

      {laCongTac && (
        <section className="mb-5 rounded-2xl border border-primary-soft bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-foreground">Chấm công đi công tác</h2>
          <NutCongTac daVao={vao ? gioVN(vao.loggedAt) : null} daRa={ra ? gioVN(ra.loggedAt) : null} />
        </section>
      )}

      {/* Hướng dẫn QR vẫn giữ nguyên cho MỌI ngày: người đi công tác buổi sáng vẫn có thể
          ghé cơ sở buổi chiều, và họ cần biết đường quét ở đó. */}
      <div className="rounded-2xl bg-card p-6 shadow-sm">
        <ol className="space-y-4 text-sm text-foreground">
          <li className="flex gap-3">
            <ScanLine className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span>
              Mở camera điện thoại, quét mã QR trên màn hình chấm công tại quầy. Đường dẫn mở ra
              chính là trang chấm công của bạn.
            </span>
          </li>
          <li className="flex gap-3">
            <QrCode className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span>
              Bấm <b>Check-in</b> khi tới, <b>Check-out</b> khi về. Bật định vị (GPS) khi được
              hỏi. Mỗi loại chỉ ghi một lần trong ngày.
            </span>
          </li>
        </ol>
        <p className="mt-5 text-xs text-muted-foreground">
          Quét nhầm mã của cơ sở khác sẽ bị từ chối. Nếu bạn dạy thay ở cơ sở khác theo phân
          công, báo Quản lý cơ sở đó xác nhận công.
        </p>
      </div>
    </div>
  );
}
