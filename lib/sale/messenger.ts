/**
 * Site Sale — DỮ LIỆU cho màn `/sale/messenger` (Inbox Messenger).
 *
 * ══ ĐÂY LÀ BẢN ĐÔI CỦA TRUY VẤN TRONG `app/(admin)/admin/crm/messenger/page.tsx` ══
 *
 * Chủ dự án chốt 04/09/2026: màn site Sale tách bản riêng, không dùng chung
 * component với khu quản trị. Bản admin truy vấn ngay trong `page.tsx` nên không
 * có gì để gọi lại; chép vào đây để phần trôi lệch nằm ở MỘT tệp có tên.
 *
 * ── DÙNG LẠI ĐƯỢC GÌ Ở `lib/` (KHÔNG chép) ─────────────────────────────────
 *   `scopedDb(actor)`          — cách ly cơ sở (chặn IDOR liên cơ sở)
 *   `maskPhone` · `redactContactsInText` · `maskPersonName` — lib/lead/pii
 *   `messengerDangMoPhong`     — lib/crm/messenger-send (đọc env + SystemSetting)
 * Phần chép thật sự chỉ còn 1 truy vấn Prisma.
 *
 * ── NỢ TRÔI LỆCH: sửa bên nào cũng phải sửa bên kia ─────────────────────────
 *   1. `take: 50` + `orderBy: updatedAt desc` + `messages take: 1 desc`.
 *   2. Quy tắc che PII (xem dưới).
 *   3. Cách hỏi chế độ mô phỏng THEO TỪNG `pageId` — không một cờ chung.
 *
 * ── CHE PII: Ở MÁY CHỦ, VÀ CHE CẢ NỘI DUNG TIN ─────────────────────────────
 * `redactContactsInText` chứ không `maskFreeText`: hộp thư PHẢI đọc được, nên
 * chỉ cắt đúng mẩu trông giống liên hệ. Lý do việc này là load-bearing (đợt E
 * 22/08): khách rất hay tự gõ số vào tin ("sdt em 0905… nhe"), nên che cột
 * `phone` mà để nguyên nội dung là che hình thức — và Quản lý cơ sở, người đọc
 * inbox nhiều nhất, vừa bị gỡ `leads:view-pii` theo Q9.
 *
 * ⚠️ MỘT CHỖ CỐ Ý KHÁC BẢN ADMIN: `parentName` cũng đi qua `maskPersonName`.
 *    Bản admin in thẳng tên. Nhưng màn chủ của chính site Sale
 *    (`app/(sale)/sale/page.tsx`) đã che tên phụ huynh từ S-1, và ghi rõ lý do:
 *    "nửa che nửa không trên cùng một trang là kiểu rò khó thấy nhất — người xem
 *    tưởng cả trang đã được che". Cùng lập luận, cùng site. Bên admin KHÔNG bị
 *    đụng tới (đợt này cấm sửa `app/(admin)/**`); chênh lệch này đã báo lại chủ
 *    dự án để họ quyết có đồng bộ ngược sang admin hay không.
 */
import "server-only";
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { maskPhone, maskPersonName, redactContactsInText } from "@/lib/lead/pii";
import { messengerDangMoPhong } from "@/lib/crm/messenger-send";
import type { PillTone } from "@/components/admin/ui/status-pill";

export type OHoiThoaiMessenger = {
  id: string;
  /** Tên hiển thị — ĐÃ che ở máy chủ nếu thiếu quyền PII. */
  tenHienThi: string;
  /** SĐT đã che nếu thiếu quyền. `null` = hội thoại chưa có số. */
  sdt: string | null;
  trangThai: string;
  nhanTrangThai: string;
  toneTrangThai: PillTone;
  /** Nội dung tin cuối, đã cắt mẩu liên hệ nếu thiếu quyền. `null` = chưa có tin. */
  tinCuoi: string | null;
  /** Trang Facebook này CHƯA nối được khoá gửi thật ⇒ tin soạn ra không tới khách. */
  moPhong: boolean;
};

/**
 * Nhãn tiếng Việt cho `MessengerConversation.status` (cột `String`, ba giá trị
 * OPEN/QUALIFIED/CLOSED — xem `prisma/schema.prisma`).
 *
 * ⚠️ Bản admin in THẲNG mã enum ra màn hình (`<Badge>{c.status}</Badge>`). Đó là
 *    thứ chính kho này gọi tên là lỗi: "enum thô lọt ra màn hình là bắt người
 *    dùng học từ vựng của lập trình viên" (`app/(sale)/sale/khach-cua-toi/[id]/page.tsx`).
 *    Cùng một dữ liệu, chỉ khác cách gọi tên — không thêm, không bớt thông tin.
 *
 * "QUALIFIED" nghĩa nghiệp vụ là **đã nối sang phiếu khách**: `lib/crm/lead-qualify.ts`
 * đặt trạng thái này đúng lúc nó tạo/gắn `Lead` cho hội thoại. Nhãn phải nói
 * điều đó, không phải dịch chữ.
 */
const NHAN_TRANG_THAI: Record<string, string> = {
  OPEN: "Đang mở",
  QUALIFIED: "Đã tạo phiếu khách",
  CLOSED: "Đã đóng",
};

/**
 * Tone theo thang ngữ nghĩa (`components/admin/ui/status-pill.tsx`).
 *
 * ⚠️ KHÔNG trạng thái nào được nhận tone `brand` — màu thương hiệu là màu của
 *    NÚT và MỤC ĐANG CHỌN. Cùng luật đã ghi ở `lib/sale/trang-thai-khach.ts`.
 * "Đang mở" cố ý là `muted`: đó là trạng thái của gần như mọi dòng, và tô màu
 * cho thứ phổ biến nhất là làm cả cột đổi màu — màu hết mang tin.
 */
const TONE_TRANG_THAI: Record<string, PillTone> = {
  OPEN: "muted",
  QUALIFIED: "success",
  CLOSED: "muted",
};

export async function layHopThuMessenger({
  actor,
  hienPii,
}: {
  actor: Actor;
  hienPii: boolean;
}): Promise<OHoiThoaiMessenger[]> {
  const hoiThoai = await scopedDb(actor).messengerConversation.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: { messages: { orderBy: { sentAt: "desc" }, take: 1 } },
  });

  // Hỏi Ở SERVER, và hỏi THEO TỪNG `pageId`: khoá Meta hiện chỉ có cho một Page,
  // nên mỗi Page có thể ở trạng thái khác nhau. Client không biết và cũng không
  // được biết (env + SystemSetting).
  const maTrang = [...new Set(hoiThoai.map((c) => c.pageId))];
  const moPhongTheoTrang = new Map(
    await Promise.all(maTrang.map(async (p) => [p, await messengerDangMoPhong(p)] as const)),
  );

  return hoiThoai.map((c) => {
    const tenGoc = c.parentName ?? `PSID ${c.psid.slice(0, 8)}`;
    const tin = c.messages[0]?.text ?? null;
    return {
      id: c.id,
      // Chỉ che khi CÓ tên thật — `PSID abc12345` không phải tên người, che nó
      // thành `P•••` là bôi đen một mã kỹ thuật và làm dòng không nhận ra được.
      tenHienThi: hienPii || !c.parentName ? tenGoc : maskPersonName(c.parentName),
      sdt: c.phone ? (hienPii ? c.phone : maskPhone(c.phone)) : null,
      trangThai: c.status,
      nhanTrangThai: NHAN_TRANG_THAI[c.status] ?? c.status,
      toneTrangThai: TONE_TRANG_THAI[c.status] ?? "muted",
      tinCuoi: tin === null ? null : hienPii ? tin : redactContactsInText(tin),
      moPhong: moPhongTheoTrang.get(c.pageId) ?? true,
    };
  });
}
