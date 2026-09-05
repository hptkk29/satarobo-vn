import "server-only";
/**
 * Site Sale — dữ liệu màn "Sắp hết khoá".
 *
 * ── DÙNG LẠI, KHÔNG CHÉP ────────────────────────────────────────────────────
 * Phần nặng — chiếu ngày kết thúc theo lịch thực, trừ ngày nghỉ cơ sở, tính số
 * buổi còn lại — nằm ở `getNearingEndEnrollments()` (`lib/students/renewal.ts`)
 * và được gọi lại NGUYÊN VẸN. Tệp này chỉ làm đúng một việc mà hàm chung không
 * làm được: **cách ly cơ sở theo người đang xem**.
 *
 * ── VÌ SAO PHẢI LÀM Ở ĐÂY, KHÔNG PHẢI TRONG scopedDb ────────────────────────
 * `getNearingEndEnrollments` đọc bằng `db` TRẦN (nó là hàm dùng chung cho cron,
 * dashboard, portal), nên `scopedDb(actor)` không chạm được vào nó. Cách ly làm
 * bằng cách hỏi `scopedDb` xem trong số lớp vừa trả về thì actor NHÌN THẤY lớp
 * nào — `Class` ∈ `SCOPED_MODELS` nên chính cỗ máy đó trả lời, không phải một
 * luật thứ hai viết tay.
 *
 * ⚠️ KHÁC BẢN ADMIN MỘT ĐIỂM, CÓ CHỦ ĐÍCH — ĐỌC TRƯỚC KHI "SỬA CHO GIỐNG".
 * `app/(admin)/admin/students/sap-het-khoa/page.tsx` scope bằng:
 *
 *     hasRole(user,"CENTER_MANAGER") && !hasRole(user,"SUPER_ADMIN") ? user.centerId : null
 *
 * Hai chỗ hỏng trong một dòng đó:
 *   1. **Nó so MÃ VAI CŨ.** Máy thật chạy bảng quyền động (RBAC v2 đang bật
 *      prod); một vai v2 như `CENTER_SALES_CSM` hay `HO_SALE` không khớp chuỗi
 *      `"CENTER_MANAGER"` nên rơi vào nhánh `null` = **thấy mọi cơ sở**. Tức
 *      đúng nhóm người dùng chính của site Sale là nhóm lọt.
 *   2. **Nó chỉ ôm được MỘT cơ sở** (`user.centerId`), nên quản lý kiêm hai cơ
 *      sở mất nửa danh sách.
 * Ở đây đi bằng tầm nhìn thật của actor: SUPER_ADMIN/Hội sở thấy tất cả (y như
 * cũ), người cấp cơ sở thấy đúng cơ sở mình — kể cả khi kiêm nhiều cơ sở.
 * Đây KHÔNG phải đổi nội dung màn (cột, nhãn, thứ tự, ngưỡng 5 buổi giữ nguyên);
 * đây là cổng cách ly cơ sở mà CLAUDE.md đòi cho mọi màn mới.
 *
 * ⚠️ NỢ HIỆU NĂNG CÓ GHI SỔ: hàm chung nạp TOÀN BỘ ghi danh đang học rồi ta mới
 *    lọc. Bản admin cũng vậy với mọi vai không phải quản lý cơ sở. Vá đúng là cho
 *    `getNearingEndEnrollments` nhận danh sách cơ sở — sửa tệp dùng chung, đụng
 *    cả cron lẫn dashboard admin, nên để ngoài đợt tách giao diện này.
 */
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { getNearingEndEnrollments, type NearingEndItem } from "@/lib/students/renewal";

export type DongSapHetKhoa = NearingEndItem;

export async function layDanhSachSapHetKhoa(actor: Actor): Promise<DongSapHetKhoa[]> {
  const tatCa = await getNearingEndEnrollments();
  if (tatCa.length === 0) return tatCa;

  const maLop = [...new Set(tatCa.map((i) => i.classId))];
  // `Class` ∈ SCOPED_MODELS ⇒ `scopedDb` tự chèn `centerId IN visibleCenterIds`.
  // Lớp ngoài tầm nhìn không trả về ⇒ ghi danh của nó rụng khỏi danh sách.
  const lopThayDuoc = await scopedDb(actor).class.findMany({
    where: { id: { in: maLop } },
    select: { id: true },
  });
  const thayDuoc = new Set(lopThayDuoc.map((c) => c.id));

  return tatCa.filter((i) => thayDuoc.has(i.classId));
}
