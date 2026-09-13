/**
 * lib/cham-cong/sua-gio-quet.ts — DỰNG DÒNG `StaffTimeLog` cho một lượt sửa giờ quét.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NGUYÊN TẮC: GHI THÊM, KHÔNG SỬA ĐÈ
 *
 * Dòng quét gốc **BẤT BIẾN**. Sửa giờ không đụng vào nó — nó sinh một dòng MỚI mang
 * `source: "MANUAL_ADJUST"`, và engine tính công đọc bức tranh sau cùng.
 *
 * Cùng nguyên tắc với bút toán điều chỉnh thanh toán: **sổ đã ghi thì không tẩy xoá, sai
 * thì ghi thêm dòng.** Và nó giữ được câu "giờ quét THẬT là gì" trả lời được sau này —
 * thứ mà một lượt `update` sẽ xoá vĩnh viễn.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO FILE NÀY TỒN TẠI — MỘT đường, không phải hai
 *
 * Trước đó chỉ có một đường sinh dòng `MANUAL_ADJUST`: duyệt đơn `TIMESHEET_FIX`
 * (`requests.ts`). Nay quản lý sửa được giờ **ngoài luồng đơn**. Hai đường mà hai bản
 * dựng dòng là hai cơ hội để một bản lệch đi — quên `flags`, quên `reviewStatus`, đặt sai
 * `result` — rồi engine đọc ra hai loại dữ liệu khác nhau cho cùng một việc.
 *
 * Nên phần dựng dòng nằm ở đây, THUẦN (không chạm DB), và cả hai đường gọi nó.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * KHÁC BIỆT DUY NHẤT GIỮA HAI ĐƯỜNG: `adjustRequestId`
 *
 *   · qua đơn   → `adjustRequestId = <id đơn>`  ⇒ căn cứ là ĐƠN của người lao động
 *   · sửa tay   → `adjustRequestId = null`      ⇒ căn cứ là LÝ DO quản lý ghi
 *
 * Đó là cách phân biệt hai loại về sau, và là lý do **lý do bắt buộc không rỗng** ở đường
 * sửa tay: không có đơn thì phải có chữ.
 */
import type { Prisma } from "@prisma/client";

/** Căn cứ của lượt sửa. */
export type CanCuSuaGio =
  | { kieu: "DON"; requestId: string }
  | { kieu: "SUA_TAY" };

export type DungDongInput = {
  userId: string;
  /** Cơ sở CHỊU CÔNG của ngày đó — không phải cơ sở của người bấm. */
  centerId: string;
  orgUnitId: string | null;
  /** Ngày công, mốc `@db.Date` (nửa đêm UTC). */
  workDate: Date;
  /** "HH:mm" giờ VN. `null` = không đổi mốc này. */
  gioVao: string | null;
  gioRa: string | null;
  /** Người bấm — vào `reviewedById`. */
  actorId: string;
  now: Date;
  /** Lý do; vào `reviewNote`. */
  lyDo: string | null;
  canCu: CanCuSuaGio;
};

export type DungDongKetQua =
  | { ok: true; rows: Prisma.StaffTimeLogCreateManyInput[] }
  | { ok: false; error: string };

/** "HH:mm" trên một ngày công (giờ VN) → thời điểm tuyệt đối. */
export function vnTimeOn(workDate: Date, hhmm: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return new Date(
    Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), h - 7, mi),
  );
}

/**
 * Cờ đánh dấu dòng do người dựng chứ không do máy quét. Engine và màn đều đọc cờ này.
 * Đặt tên hằng thay vì rải chuỗi: hai đường cùng dùng, lệch một ký tự là lệch câm.
 */
export const CO_CHINH_TAY = "CHINH_TAY";

export function dungDongChinhTay(input: DungDongInput): DungDongKetQua {
  const rows: Prisma.StaffTimeLogCreateManyInput[] = [];

  for (const [direction, hhmm] of [
    ["CHECK_IN", input.gioVao],
    ["CHECK_OUT", input.gioRa],
  ] as const) {
    if (!hhmm) continue;
    const loggedAt = vnTimeOn(input.workDate, hhmm);
    if (!loggedAt) return { ok: false, error: `Giờ "${hhmm}" không hợp lệ` };
    rows.push({
      userId: input.userId,
      centerId: input.centerId,
      orgUnitId: input.orgUnitId,
      direction,
      loggedAt,
      workDate: input.workDate,
      source: "MANUAL_ADJUST",
      // ACCEPTED + CONFIRMED: dòng này do người có quyền dựng, nó không phải một lượt quét
      // chờ duyệt. Để PENDING là nó nằm trong hàng chờ của chính người vừa tạo ra nó.
      result: "ACCEPTED",
      reviewStatus: "CONFIRMED",
      reviewedById: input.actorId,
      reviewedAt: input.now,
      reviewNote: input.lyDo?.trim() || null,
      adjustRequestId: input.canCu.kieu === "DON" ? input.canCu.requestId : null,
      flags: [CO_CHINH_TAY],
    });
  }

  if (rows.length === 0) {
    return {
      ok: false,
      error:
        input.canCu.kieu === "DON"
          ? "Đơn không có giờ vào/ra để ghi"
          : "Nhập ít nhất một mốc giờ (vào hoặc ra)",
    };
  }

  // Vào SAU ra là dữ liệu vô nghĩa — chặn ở đây thay vì để engine tính ra số âm rồi kẹp về 0.
  // Chỉ kiểm khi lượt này dựng CẢ HAI mốc; sửa lẻ một mốc thì bức tranh đúng nằm ở DB, không
  // ở đây, và hàm này cố ý KHÔNG chạm DB.
  if (input.gioVao && input.gioRa) {
    const vao = rows.find((r) => r.direction === "CHECK_IN")!.loggedAt as Date;
    const ra = rows.find((r) => r.direction === "CHECK_OUT")!.loggedAt as Date;
    if (ra <= vao) {
      return { ok: false, error: `Giờ ra (${input.gioRa}) phải sau giờ vào (${input.gioVao})` };
    }
  }

  return { ok: true, rows };
}
