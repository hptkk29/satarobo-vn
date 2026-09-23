/**
 * GIÁ GHI DANH LẤY TỪ DÒNG ĐƠN — một luật, mọi đường convert dùng chung [HTL-09 · 23/09/2026].
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * VÌ SAO TỆP NÀY TỒN TẠI
 *
 * Hệ thống đang có **hai nguồn giá cho cùng một đứa trẻ**, và không nguồn nào biết nguồn kia:
 *
 *   · **Dòng đơn** (`/orders/new`) — nơi người bán khai hình thức lớp (`coachFormat`) và số
 *     buổi, rồi hệ thống nhân hệ số Coach theo SR.QD.219 Điều 5.
 *   · **Ghi danh** (đường convert) — tính lại từ `Course.price`, tức **GIÁ LỚP NHÓM**.
 *
 * Đo 23/09/2026: `grep -c coachFormat` trên `convert-lead-v2.ts` · `convert-lead.ts` ·
 * `bulk-convert.ts` · `leads/[id]/convert/actions.ts` ra **0 · 0 · 0 · 0**. Hình thức lớp
 * chưa bao giờ đi tới trục ghi danh.
 *
 * Hậu quả đã đo với Coach 1-1 Sata3 (đơn 10.400.000đ, ghi danh 5.200.000đ):
 *   · ZNS học phí gửi `order.totalAmount` ⇒ phụ huynh nhận tin **~10,4tr**;
 *   · `/portal/hoc-phi` in **5,2tr**;
 *   · `/cong-no` ra **−5.200.000đ** ("đóng thừa");
 *   · hoàn tiền học 6/12 buổi chi **dư ~2.600.002đ**.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * CHỐT CỦA CHỦ DỰ ÁN (23/09/2026)
 *
 * *"Giá ghi danh lấy từ DÒNG ĐƠN; không có dòng thì như cũ."*
 *
 * Hiện thực: thay **đầu vào `listPrice`** của `computeEnrollmentPrice`, KHÔNG thay công thức.
 * Nhờ vậy giảm giá/học bổng khai lúc convert **vẫn được áp bình thường** lên giá đơn — nếu
 * lấy thẳng `totalPrice` làm `finalPrice` thì một suất học bổng khai ở màn convert sẽ bị
 * nuốt im lặng, và đó là một lỗ tiền MỚI thay cho lỗ đang vá.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * CẦU NỐI dòng đơn ↔ đứa trẻ: `leadChildId`
 *
 * `OrderItem.metadata.leadChildId` do `/orders/new` ghi (`veMetadataConLead`), còn
 * `Enrollment.leadChildId` do `convert-lead-v2` ghi lúc chốt. Đó là cây cầu CÓ SẴN, đúng
 * thứ `lib/orders/hoc-vien-dong-don.ts` dựng ra — đừng khớp theo tên hay theo thứ tự.
 *
 * ⚠️ **MƠ HỒ THÌ TRẢ `null`, KHÔNG ĐOÁN.** Hai dòng cùng `leadChildId` + `courseId` nghĩa là
 * đơn đang nói hai giá cho một suất học; chọn bừa một cái là ghi một con số tiền mà không ai
 * truy được vì sao. `null` ⇒ đường gọi rơi về `Course.price` như cũ — hành vi hôm nay, không
 * tệ hơn.
 *
 * THUẦN — không Prisma, không DB. Test không cần database.
 */

/** Đủ để trả lời "dòng này bán cho bé nào, khoá nào, bao nhiêu tiền". */
export type DongDonChoGhiDanh = {
  /** `OrderItem.metadata.leadChildId` — đọc bằng `docConLeadTuMetadata`. */
  leadChildId: string | null;
  /** `OrderItem.metadata.courseId`. */
  courseId: string | null;
  /** `OrderItem.totalPrice` — số tiền dòng này, đã gồm hệ số Coach nếu có. */
  totalPrice: number;
};

export type KhoaTraGia = { leadChildId: string | null | undefined; courseId: string };

/**
 * Giá của MỘT suất học theo dòng đơn, hoặc `null` khi không tra được.
 *
 * Trả `null` trong ba ca, và cả ba đều cố ý:
 *  · bé không khai `leadChildId` (đơn walk-in, đơn cũ trước 15/09) — không có cầu nối;
 *  · không dòng nào khớp — đơn chưa có suất này;
 *  · **≥2 dòng khớp** — đơn nói hai giá cho một suất, xem khối chú thích đầu tệp.
 */
export function giaTuDongDon(
  dong: readonly DongDonChoGhiDanh[],
  khoa: KhoaTraGia,
): number | null {
  const conId = khoa.leadChildId?.trim();
  if (!conId) return null;

  const khop = dong.filter((d) => d.leadChildId === conId && d.courseId === khoa.courseId);
  if (khop.length !== 1) return null;

  const gia = khop[0]!.totalPrice;
  // Giá âm/không phải số là dữ liệu hỏng — rơi về đường cũ thay vì ghi một con số lạ.
  if (!Number.isFinite(gia) || gia < 0) return null;
  return Math.round(gia);
}

/**
 * `listPrice` đem vào `computeEnrollmentPrice`: ưu tiên dòng đơn, rơi về giá khoá.
 *
 * Tách riêng thay vì để mỗi đường gọi tự `?? giaKhoa`: bốn đường convert phải cho ra CÙNG
 * một con số, và một chỗ trong số đó viết `||` thay vì `??` là giá 0 (học bổng toàn phần)
 * lặng lẽ hoá thành giá niêm yết.
 */
export function listPriceChoGhiDanh(
  dong: readonly DongDonChoGhiDanh[],
  khoa: KhoaTraGia,
  giaKhoa: number,
): number {
  return giaTuDongDon(dong, khoa) ?? giaKhoa;
}
