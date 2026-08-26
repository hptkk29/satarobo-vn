// /trials — MÀN CŨ "Học thử", đã GỘP vào "Lớp trải nghiệm" (26/08/2026).
//
// Hệ có hai khái niệm trial song song từ R7-02: `TrialClass` (V1 — một dòng = một cuộc
// hẹn của LEAD) và `TrialClassV2` + buổi + ghi danh (V2 — theo TỪNG CON). Chúng không
// bao giờ gặp nhau: bảng Trial của site giáo viên chỉ đọc V2, nên mọi lịch đặt qua màn
// này là giáo viên KHÔNG thấy. Chủ dự án 26/08 chốt gộp về một.
//
// Dữ liệu V1 đã chuyển sang V2 bằng `scripts/gop-trial-v1-sang-v2.ts`.
//
// Vì sao CHUYỂN HƯỚNG chứ không xoá thư mục: đường dẫn `/trials` còn nằm trong
// bookmark, trong thông báo đã gửi, và trong link của các phiếu cũ. Ném 404 vào mặt
// người đang làm việc là cách tệ nhất để thông báo một quyết định gộp.
//
// ⚠️ `actions.ts` và `_components/trials-list.tsx` CỐ Ý còn nằm lại: chúng là nơi
// `lib/lead/status-trail.test.ts` và `lib/notifications/catalog.test.ts` soi để chốt
// "không còn đường đổi trạng thái nào ghi kiểu riêng". Xoá file là hai bộ test đó mất
// mốc. Dọn ở đợt sau, cùng lúc drop bảng `TrialClass` — đúng nếp 2-phase của repo
// (additive trước, drop sau khi prod ổn định).
import { redirect } from "next/navigation";

export const metadata = { title: "Học thử | Admin" };

export default function TrialsPage() {
  redirect("/trial-classes");
}
