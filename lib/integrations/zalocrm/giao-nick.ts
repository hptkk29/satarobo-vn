import "server-only";
// lib/integrations/zalocrm/giao-nick.ts — GIAO NICK CHO NGƯỜI (màn `/zalo-crm/nick`).
//
// Ghi `ZaloCrmNick.sataUserId`. Luật "ai đọc được nick đã giao" thì ở `pham-vi-nick.ts`
// và được lượt đối soát đẩy sang ZaloCRM ≤5 phút sau — file này chỉ lo phần GHI và cổng.
//
// ── 🔴 CỔNG: NGƯỜI NHẬN PHẢI THUỘC ĐÚNG CƠ SỞ CỦA NICK ────────────────────
// Thiếu cổng này thì một quản lý CS1 giao được nick của CS1 cho người CS2 — tức mở một
// đường rò chéo cơ sở bằng đúng màn sinh ra để siết quyền. `zcrmAccountId` đi từ trình
// duyệt nên KHÔNG được tin; phải tra lại nick, lấy cơ sở của nó, rồi hỏi
// `nguoiDuocDungNick` xem người nhận có trong danh sách hợp lệ của cơ sở ấy không.
//
// Và cổng đó phải hỏi CÙNG một nguồn mà lượt đối soát hỏi. Dựng danh sách "người được
// giao" bằng một câu tra riêng là tạo bản thứ hai của cùng một luật — rồi hai bản lệch
// nhau âm thầm, và triệu chứng sẽ là "giao xong mà người ta vẫn không thấy nick".
import { db } from "@/lib/db";
import { nguoiDuocDungNick } from "@/lib/integrations/zalocrm/cap-quyen-nick";
import { whereNickTheoActor, type ActorTamNhinNick } from "@/lib/integrations/zalocrm/nick-admin";

export type MaLoiGiaoNick =
  | "KHONG_THAY_NICK"
  | "NICK_NGOAI_TAM_NHIN"
  | "NICK_CHUA_CO_CO_SO"
  | "NGUOI_NGOAI_CO_SO";

export type KetQuaGiaoNick =
  | { ok: true; daGiaoCho: string | null }
  | { ok: false; ma: MaLoiGiaoNick };

/** Người có thể nhận nick, kèm tên để dựng ô chọn. */
export type NguoiNhanDuoc = { id: string; ten: string; email: string | null };

/**
 * Danh sách người có thể nhận nick của MỘT cơ sở.
 *
 * Dùng chung `nguoiDuocDungNick` với lượt đối soát — ô chọn trên màn và cổng khi ghi
 * nhìn cùng một sự thật. Trả rỗng khi cơ sở không có ai hợp lệ; đó là trạng thái bình
 * thường (cơ sở mới), không phải lỗi.
 */
export async function nguoiNhanDuocNick(centerCode: string): Promise<NguoiNhanDuoc[]> {
  const { tatCa } = await nguoiDuocDungNick(centerCode);
  if (tatCa.length === 0) return [];
  const ds = await db.user.findMany({
    where: { id: { in: tatCa } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  return ds.map((u) => ({ id: u.id, ten: u.name ?? u.email ?? u.id, email: u.email }));
}

/**
 * Giao nick cho một người, hoặc GỠ giao (`sataUserId = null`).
 *
 * KHÔNG revalidate, KHÔNG audit ở đây — đó là việc của Server Action gọi nó. Hàm này chỉ
 * lo luật + phép ghi, để test được mà không dựng Next.
 */
export async function giaoNick(input: {
  actor: ActorTamNhinNick;
  zcrmAccountId: string;
  /** `null` = gỡ giao, nick về lại "cả cơ sở đều thấy". */
  sataUserId: string | null;
}): Promise<KetQuaGiaoNick> {
  const nick = await db.zaloCrmNick.findFirst({
    where: { zcrmAccountId: input.zcrmAccountId, deletedAt: null },
    select: { id: true, centerId: true },
  });
  if (!nick) return { ok: false, ma: "KHONG_THAY_NICK" };

  // Tầm nhìn: hỏi CÙNG mảnh `where` mà màn Tích hợp dùng, không viết lại điều kiện tại
  // chỗ. Tra lần hai có `whereNickTheoActor` là cách rẻ nhất để chắc người bấm thật sự
  // nhìn thấy nick này — `zcrmAccountId` đến từ trình duyệt.
  const trongTam = await db.zaloCrmNick.findFirst({
    where: { ...whereNickTheoActor(input.actor), zcrmAccountId: input.zcrmAccountId },
    select: { id: true },
  });
  if (!trongTam) return { ok: false, ma: "NICK_NGOAI_TAM_NHIN" };

  if (input.sataUserId !== null) {
    if (!nick.centerId) return { ok: false, ma: "NICK_CHUA_CO_CO_SO" };
    const coSo = await db.center.findUnique({
      where: { id: nick.centerId },
      select: { code: true },
    });
    // `Center.code` là NULLABLE trong schema. Không có mã thì `nguoiDuocDungNick` không
    // tra được đơn vị ⇒ danh sách hợp lệ RỖNG ⇒ cổng dưới sẽ từ chối mọi người. Từ chối
    // ở đây với mã lỗi ĐÚNG NGUYÊN NHÂN, thay vì để người dùng đọc "người ngoài cơ sở"
    // cho một cơ sở chưa đặt mã.
    if (!coSo?.code) return { ok: false, ma: "NICK_CHUA_CO_CO_SO" };

    const { tatCa } = await nguoiDuocDungNick(coSo.code);
    if (!tatCa.includes(input.sataUserId)) return { ok: false, ma: "NGUOI_NGOAI_CO_SO" };
  }

  await db.zaloCrmNick.update({
    where: { id: nick.id },
    data: { sataUserId: input.sataUserId },
  });
  return { ok: true, daGiaoCho: input.sataUserId };
}
