import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

/**
 * Vai + cơ sở HIỆN TẠI của một user, đọc thẳng từ DB.
 *
 * Vì sao cần: `session.user.role / roles / centerId` là ảnh chụp lúc ĐĂNG NHẬP (JWT).
 * Cách thu quyền chính thức của repo là gỡ vai / đổi cơ sở trong DB, nhưng người đang mở
 * phiên vẫn giữ nguyên quyền cũ cho tới khi họ tự đăng xuất — với phiên dài thì "đã thu
 * quyền" chỉ đúng trên giấy. Mọi cổng quyền còn đọc vai từ JWT nên đi qua hàm này.
 *
 * React.cache ⇒ tối đa MỘT truy vấn mỗi request dù cổng được gọi ở nhiều chỗ.
 * Trả `null` khi không còn bản ghi (user vừa bị xoá) — chỗ gọi tự quyết fail-closed.
 */
export const getFreshGateUser = cache(
  async (
    userId: string,
  ): Promise<{ role: string; roles: string[]; centerId: string | null } | null> => {
    const row = await db.user.findUnique({
      where: { id: userId },
      select: { role: true, roles: true, centerId: true },
    });
    return row ? { role: row.role, roles: row.roles, centerId: row.centerId } : null;
  },
);
