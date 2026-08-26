// lib/lead/rotation.ts — Đợt D: chia lead LUÂN PHIÊN ĐỀU LƯỢT.
//
// Chủ dự án chốt Q7 (21/08/2026): công bằng đo bằng SỐ LƯỢT, bộ đếm không bao
// giờ reset, và KHÔNG nhìn khối lượng công việc. Nguyên văn + lý do đánh đổi:
// xem đầu `rotation.test.ts`.
//
// ⚠️ Đây là ĐẢO hành vi đang chạy prod. `pickRoundRobin` (assign-strategy.ts) chọn
// người có ÍT LEAD MỞ NHẤT — nghe như "cân tải" nhưng thực chất thưởng người đóng
// lead nhanh, kể cả đóng bằng cách bỏ. Hàm cũ được GIỮ NGUYÊN, không xoá: chế độ
// CLOSE_RATE vẫn dùng nó, và giữ lại thì so sánh hai cách chia được khi cần.
//
// ── Vì sao là bảng riêng chứ không đếm từ bảng Lead ───────────────────────────
// Đếm lead theo người thì không tách được lead "tới lượt" khỏi lead gán tay /
// sale tự nhập / nhập Excel. Chẩn đoán 21/08 trên prod cho thấy 69% lead KHÔNG đi
// qua vòng chia — lấy tổng lead làm bộ đếm là để 69% nhiễu quyết định 31% còn lại.
//
// Bảng dùng `orgUnitId` chứ không `centerId` (luật cứng Nền Hệ thống #3: bảng mới
// có dữ liệu theo đơn vị thì dùng orgUnitId).
import { db } from "@/lib/db";

/** Một ứng viên trong vòng luân phiên. KHÔNG có trường nào về tải — cố ý. */
export type RotationCandidate = {
  id: string;
  /** Tổng số lượt ĐÃ NHẬN từ trước tới nay. Không reset theo ngày/tháng/kỳ. */
  turns: number;
  /** Lần gần nhất tới lượt. `null` = chưa bao giờ. */
  lastTurnAt: Date | null;
};

/**
 * Ai tới lượt tiếp theo. THUẦN — không đọc DB, không đọc đồng hồ.
 *
 * Thứ tự: ít lượt nhất → tới lượt lâu nhất (chưa bao giờ đứng đầu) → id.
 * Nhánh cuối theo `id` để kết quả TÁI LẬP ĐƯỢC: chia lead mà không giải thích
 * được thì mọi tranh cãi thiên vị đều thành lời-tôi-chống-lời-anh.
 */
export function pickFairTurn(candidates: RotationCandidate[]): string | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    if (a.turns !== b.turns) return a.turns - b.turns;
    const at = a.lastTurnAt?.getTime() ?? -Infinity;
    const bt = b.lastTurnAt?.getTime() ?? -Infinity;
    if (at !== bt) return at - bt;
    return a.id.localeCompare(b.id);
  })[0].id;
}

/**
 * Người mới vào vòng bắt đầu ở VỊ TRÍ nào.
 *
 * NGANG người ít lượt nhất, không phải 0. Để 0 thì người mới nhận liên tiếp cho
 * tới khi đuổi kịp — với vòng đã chạy vài trăm lượt là hàng trăm lead dồn vào
 * người chưa quen việc, và người cũ đứng chơi. "Luân phiên" là nhập vòng, không
 * phải được trả nợ quá khứ.
 *
 * ⚠️ Đây là VỊ TRÍ XUẤT PHÁT (`LeadRotationTurn.seedTurns`), KHÔNG phải số lượt
 * đã nhận. Trước 26/08/2026 hai thứ này bị gộp làm một ⇒ sổ khai người mới đã
 * nhận cả trăm lượt trong ngày đầu đi làm. Xem ghi chú ở `takeRotationTurns`.
 */
export function seedTurnsForNewcomer(existing: RotationCandidate[]): number {
  if (existing.length === 0) return 0;
  return Math.min(...existing.map((e) => e.turns));
}

/**
 * Lên kế hoạch cho MỘT LÔ: ai nhận lead thứ 1, thứ 2, … THUẦN.
 *
 * Dùng khi chia lại cả rổ lead một lần (sale nghỉ việc). Không gọi
 * `pickFairTurn` n lần từ tầng DB: n lần khoá + n lần ghi cho một việc vốn là
 * một quyết định, và nếu hỏng giữa chừng thì sổ lượt lệch dở dang.
 *
 * Mốc `lastTurnAt` trong lô lấy theo THỨ TỰ trong lô (không cần đồng hồ thật) —
 * đủ để phá hoà đúng chiều: ai vừa nhận trong lô này thì lùi về cuối hàng.
 */
export function planFairTurns(candidates: RotationCandidate[], count: number): string[] {
  if (candidates.length === 0 || count <= 0) return [];
  const work = candidates.map((c) => ({ ...c }));
  const ke: string[] = [];
  // Mốc giả tăng dần, bắt đầu SAU mọi mốc thật, để lượt vừa phát trong lô này
  // luôn xếp sau lượt cũ khi so bằng nhau.
  let nhip = Math.max(0, ...work.map((w) => w.lastTurnAt?.getTime() ?? 0)) + 1;
  for (let i = 0; i < count; i++) {
    const picked = pickFairTurn(work);
    if (!picked) break;
    ke.push(picked);
    const w = work.find((x) => x.id === picked)!;
    w.turns += 1;
    w.lastTurnAt = new Date(nhip++);
  }
  return ke;
}

/** Khoá theo đơn vị: hai lead cùng lúc TRONG một cơ sở mới phải xếp hàng. */
function lockKey(orgUnitId: string): string {
  return `lead_rotation:${orgUnitId}`;
}

/**
 * Lấy MỘT lượt: chọn người tới lượt rồi ghi nhận lượt đó, trong CÙNG một
 * transaction dưới khoá advisory.
 *
 * Vì sao phải khoá: `getSaleStats` của luồng cũ đọc NGOÀI transaction, nên hai
 * lead vào cùng lúc đọc chung một trạng thái và chọn trúng một người (kịch bản
 * SS-LR-06 của kế hoạch kiểm thử). Với luật "tuyệt đối không được sai" thì một
 * lượt trôi mất là một lỗi thật, không phải chuyện hiếm bỏ qua được.
 *
 * ⚠️ PHẢI `$executeRaw`, KHÔNG `$queryRaw`: `pg_advisory_xact_lock()` trả kiểu
 * `void`, `$queryRaw` cố giải mã cột đó và ném "Failed to deserialize column of
 * type 'void'". Đã giết mọi lần refresh token Zalo trên prod 31/07 — cùng bài
 * học, cùng cách viết (xem `lib/zalo/token.ts:139`).
 *
 * @returns id người tới lượt, hoặc `null` khi không có ứng viên nào.
 */
export async function takeRotationTurn(
  orgUnitId: string,
  candidateIds: string[],
  now: Date = new Date(),
): Promise<string | null> {
  const [picked] = await takeRotationTurns(orgUnitId, candidateIds, 1, now);
  return picked ?? null;
}

/**
 * Lấy NHIỀU lượt một lần — cùng khoá, cùng transaction (chia lại cả rổ lead khi
 * sale nghỉ việc). Trả về danh sách người nhận theo đúng thứ tự lead truyền vào.
 */
export async function takeRotationTurns(
  orgUnitId: string,
  candidateIds: string[],
  count: number,
  now: Date = new Date(),
): Promise<string[]> {
  if (candidateIds.length === 0 || count <= 0) return [];

  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey(orgUnitId)}))`;

      // ĐỌC LẠI SAU KHI GIÀNH KHOÁ — đọc trước khoá thì khoá vô nghĩa.
      const rows = await tx.leadRotationTurn.findMany({
        where: { orgUnitId },
        select: { userId: true, turns: true, seedTurns: true, lastTurnAt: true },
      });
      const byUser = new Map(rows.map((r) => [r.userId, r]));

      // VỊ TRÍ trong vòng = điểm xuất phát + lượt đã nhận. Hai thứ này tách nhau
      // (xem `seedTurns` trong schema): sổ hiển thị là `turns`, thứ tự chia là tổng.
      const viTri = (r: { turns: number; seedTurns: number }): number =>
        r.seedTurns + r.turns;

      // Người rời vòng vẫn còn dòng trong bảng — đó là chủ đích: họ quay lại thì
      // vào đúng chỗ cũ, không được làm lại từ đầu để nhận dồn.
      const known = candidateIds
        .map((id) => byUser.get(id))
        .filter((r): r is NonNullable<typeof r> => r != null)
        .map((r) => ({ id: r.userId, turns: viTri(r), lastTurnAt: r.lastTurnAt }));
      const seed = seedTurnsForNewcomer(known);

      // ⚠️ MỞ DÒNG NGAY cho người trong vòng mà chưa có dòng — đừng đợi tới lúc
      // họ thắng.
      //
      // Bản trước tạo dòng LƯỜI (chỉ khi thắng), nên người có mặt từ đầu mà chưa
      // thắng lần nào bị nhầm là "người mới gia nhập" và ăn nguyên `seed` vào sổ:
      // vòng 3 người xuất phát từ rỗng cho ra sổ 1/2/2 sau đúng 3 lượt. Mở dòng
      // ngay ở đây thì `seed` được chốt MỘT LẦN, đúng lúc họ thật sự vào vòng —
      // với vòng còn trống thì đó là 0 cho cả ba.
      //
      // `skipDuplicates` là lưới an toàn cho dòng do đường khác tạo; khoá advisory
      // ở trên đã loại phần đua tranh của chính hàm này.
      const chuaCoDong = candidateIds.filter((id) => !byUser.has(id));
      if (chuaCoDong.length > 0) {
        await tx.leadRotationTurn.createMany({
          data: chuaCoDong.map((userId) => ({
            orgUnitId,
            userId,
            turns: 0,
            seedTurns: seed,
            lastTurnAt: null,
          })),
          skipDuplicates: true,
        });
      }

      const candidates: RotationCandidate[] = candidateIds.map((id) => {
        const r = byUser.get(id);
        return r
          ? { id, turns: viTri(r), lastTurnAt: r.lastTurnAt }
          : { id, turns: seed, lastTurnAt: null };
      });

      const ke = planFairTurns(candidates, count);
      if (ke.length === 0) return [];

      // Gộp theo người rồi ghi MỘT lần mỗi người — lô 200 lead không nên thành
      // 200 lượt ghi trong một transaction.
      //
      // CHỈ tăng `turns` (lượt thật). `seedTurns` đã chốt lúc mở dòng và không bao
      // giờ đổi nữa — đổi nó là dời điểm xuất phát của một người đang trong vòng.
      const them = new Map<string, number>();
      for (const id of ke) them.set(id, (them.get(id) ?? 0) + 1);
      for (const [userId, n] of them) {
        await tx.leadRotationTurn.update({
          where: { orgUnitId_userId: { orgUnitId, userId } },
          data: { turns: { increment: n }, lastTurnAt: now },
        });
      }
      return ke;
    },
    { maxWait: 5_000, timeout: 15_000 },
  );
}

/**
 * Bảng theo dõi công khai: ai đã nhận bao nhiêu lượt trong một đơn vị.
 *
 * `turns` là lượt THẬT đã nhận — đúng thứ trang sổ in ra. `seedTurns` đi kèm để
 * giải thích được vì sao một người mới vào đang ở 0 lượt mà vẫn chưa tới lượt
 * liên tục: vị trí trong vòng của họ là `seedTurns + turns`.
 */
export async function getRotationBoard(
  orgUnitId: string,
): Promise<
  { userId: string; turns: number; seedTurns: number; lastTurnAt: Date | null }[]
> {
  return db.leadRotationTurn.findMany({
    where: { orgUnitId },
    select: { userId: true, turns: true, seedTurns: true, lastTurnAt: true },
    orderBy: [{ turns: "desc" }, { userId: "asc" }],
  });
}
