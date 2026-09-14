import "server-only";

import { db } from "@/lib/db";

/**
 * Mã vai CÓ THẬT trong hệ thống — chỉ để GỢI Ý ở ô "Vai nhận hoa hồng".
 *
 * ⚠️ ĐÂY KHÔNG PHẢI DANH SÁCH ĐÓNG. Chủ dự án 14/09/2026 chốt "thêm bớt các role nhận hoa
 * hồng riêng chứ không khoá cứng", nên ô khai vẫn nhập tự do: chính sách mới thường được
 * ban hành TRƯỚC khi vai tương ứng được tạo trong hệ thống, và chặn lúc đó là buộc người
 * vận hành phải chờ dev — đúng thứ đang đi bỏ.
 *
 * Hỏng thì trả rỗng chứ không ném: mất gợi ý là phiền, còn màn cấu hình sập vì một câu
 * tra phụ trợ là mất luôn đường sửa chính sách.
 */
export async function layMaVaiCoThat(): Promise<string[]> {
  try {
    const vai = await db.roleDef.findMany({
      select: { code: true },
      orderBy: { code: "asc" },
    });
    return vai.map((v) => v.code);
  } catch {
    return [];
  }
}
