// lib/lms/session-order.ts — "buổi thứ mấy" + thứ tự hiển thị danh sách buổi.
//
// Một chỗ duy nhất trả lời hai câu mà trước 21/08 mỗi màn tự trả lời một kiểu (hoặc
// không trả lời được):
//   1. Buổi này là BUỔI SỐ MẤY của lớp?  → buildSessionNumberMap
//   2. Danh sách buổi phải xếp thế nào?  → sortSessionsForWork
//
// (1) Số buổi = HẠNG theo NGÀY tăng dần TRONG TỪNG LỚP (1-based), tính trên TOÀN BỘ
// buổi của lớp — kể cả buổi đã huỷ, vì bỏ chúng ra sẽ làm mọi buổi sau đó tụt số và
// "Buổi 7" hôm nay khác "Buổi 7" tuần trước. ⚠️ Vì thế caller PHẢI nạp đủ buổi của lớp
// (chỉ cần id + classId + date) rồi mới dựng bảng tra; dựng từ một CỬA SỔ đã lọc
// (`take: 60`, `date <= hôm nay`, …) sẽ ra số sai. Không lấy ClassSessionPlan.seq /
// Lesson.order làm nguồn: hai cột đó rỗng ở lớp không ghim giáo trình và bị SetNull khi
// dời/huỷ buổi, nên số sẽ khuyết đúng ở những lớp cần nhìn nhất.
//
// (2) Yêu cầu 21/08: buổi ĐÃ XONG VIỆC (điểm danh + nhận xét + ảnh) lùi xuống DƯỚI các
// buổi chưa xong / sắp tới, để giáo viên mở tab ra là thấy ngay việc còn nợ. Trong mỗi
// nhóm vẫn xếp theo THỨ TỰ BUỔI tăng dần.
//
// PURE (không DB, không "use server") — dùng được ở RSC, client và test.

export type SessionRankRow = {
  id: string;
  /** Bỏ trống khi mảng chỉ có buổi của MỘT lớp. */
  classId?: string | null;
  date: Date | string | number;
};

function timeOf(d: Date | string | number): number {
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Bảng tra `sessionId → số buổi` (1-based), xếp theo ngày tăng dần trong từng lớp.
 * Tie-break theo `id` để hai buổi trùng ngày luôn ra cùng một số ở mọi lần render.
 */
export function buildSessionNumberMap(rows: SessionRankRow[]): Map<string, number> {
  const byClass = new Map<string, SessionRankRow[]>();
  for (const r of rows) {
    const key = r.classId ?? "";
    const list = byClass.get(key) ?? [];
    list.push(r);
    byClass.set(key, list);
  }
  const out = new Map<string, number>();
  for (const list of byClass.values()) {
    const sorted = [...list].sort(
      (a, b) => timeOf(a.date) - timeOf(b.date) || a.id.localeCompare(b.id),
    );
    sorted.forEach((s, i) => out.set(s.id, i + 1));
  }
  return out;
}

/** Nhãn ngắn cho cột "Buổi": `Buổi 7`, hoặc `—` khi không tra được số. */
export function sessionNumberLabel(n: number | null | undefined): string {
  return typeof n === "number" && n > 0 ? `Buổi ${n}` : "—";
}

// ─── Thứ tự hiển thị: việc còn nợ lên trước ──────────────────────────────────

/** Ba việc sau buổi mà giáo viên phải làm. */
export type SessionWorkState = {
  /**
   * Điểm danh ĐỦ CẢ LỚP (số bản ghi Attendance ≥ sĩ số), KHÔNG phải "có ≥1 bản ghi".
   * ⚠️ Chấm 1/12 em rồi bỏ dở vẫn là việc còn nợ — dùng "≥1 bản ghi" ở đây sẽ đẩy buổi
   * làm dở xuống cuối bảng và giáo viên không bao giờ thấy nó nữa.
   *
   * ĐÁNH ĐỔI đã cân nhắc: sĩ số là sĩ số HÔM NAY, không phải sĩ số lúc buổi đó diễn ra.
   * Học viên ghi danh muộn ⇒ buổi cũ (đã điểm danh đủ người có mặt khi đó) tụt xuống
   * "còn nợ việc" và nổi lên đầu bảng. Chấp nhận: sai theo hướng BÀY RA việc, còn hướng
   * ngược lại là giấu mất buổi làm dở. Muốn chính xác tuyệt đối thì phải biết ai đang
   * ghi danh tại NGÀY của buổi — dữ liệu đó không tra rẻ được trong một bảng nhiều dòng.
   */
  attendanceDone: boolean;
  /**
   * Mọi học viên đi học đều đã có phiếu nhận xét. Phải TỰ NÓ đã bao hàm "buổi đã điểm
   * danh" (xem summarizeSessionFeedback: chưa điểm danh ⇒ attended = 0 ⇒ không complete),
   * nếu không buổi chưa ai đụng sẽ được bật đèn xanh vì phép so 0 ≥ 0.
   */
  feedbackDone: boolean;
  /**
   * Mọi học viên ĐI HỌC đều đã có ảnh/video — dùng `mediaCoversAttendees`, đừng truyền
   * "buổi có ảnh nào không": học viên vắng không cần ảnh, còn em đi học thì BẮT BUỘC có.
   */
  photoDone: boolean;
};

/** Buổi "đã hoàn thành" = đủ CẢ BA: điểm danh + nhận xét + ảnh. */
export function isSessionWorkComplete(w: SessionWorkState): boolean {
  return w.attendanceDone && w.feedbackDone && w.photoDone;
}

/**
 * `attendanceDone`: điểm danh đã phủ hết sĩ số chưa — so theo DANH SÁCH studentId,
 * KHÔNG so số lượng.
 *
 * ⚠️ ĐỪNG thay bằng `marked >= rosterCount`. Đã thử và sai hai chiều cùng lúc:
 *   • Học viên HỌC BÙ từ lớp khác cũng sinh bản ghi Attendance ⇒ `marked` phồng lên,
 *     buổi chấm thiếu vẫn đủ số và bị đẩy xuống đáy bảng (giấu mất việc còn nợ).
 *   • Sĩ số đếm bằng `_count` ở vài màn KHÔNG lọc `deletedAt` ⇒ enrollment đã gỡ mềm
 *     vẫn cộng vào mẫu số và buổi không bao giờ "xong", R2 chết hẳn ở lớp đó.
 * Sĩ số rỗng ⇒ false: lớp chưa có ai thì không có gì để gọi là điểm danh xong.
 */
export function attendanceCoversRoster(
  markedStudentIds: Iterable<string>,
  rosterStudentIds: Iterable<string>,
): boolean {
  const marked = markedStudentIds instanceof Set ? markedStudentIds : new Set(markedStudentIds);
  const roster = [...rosterStudentIds];
  return roster.length > 0 && roster.every((id) => marked.has(id));
}

/** Ảnh/video của một buổi, rút gọn đúng phần cần cho `mediaCoversAttendees`. */
export type SessionMediaRow = {
  classSessionId: string | null;
  isClassWide: boolean;
  tags: { studentId: string }[];
};

export type SessionMediaCoverage = { classWide: boolean; tagged: Set<string> };

/**
 * Gom ảnh/video theo buổi → ai đã có ảnh. Dùng chung cho mọi màn tính "buổi xong chưa".
 * ⚠️ Truy vấn nguồn PHẢI select `isClassWide` + `tags.studentId` và KHÔNG được dùng
 * `distinct: ["classSessionId"]` — cắt còn một dòng/buổi là mất hết thẻ học viên, và
 * `mediaCoversAttendees` sẽ báo thiếu ảnh cho cả lớp.
 */
export function buildSessionMediaCoverage(
  rows: SessionMediaRow[],
): Map<string, SessionMediaCoverage> {
  const out = new Map<string, SessionMediaCoverage>();
  for (const m of rows) {
    if (!m.classSessionId) continue; // ảnh không gắn buổi — không quy được về buổi nào
    const cur = out.get(m.classSessionId) ?? { classWide: false, tagged: new Set<string>() };
    if (m.isClassWide) cur.classWide = true;
    for (const t of m.tags) cur.tagged.add(t.studentId);
    out.set(m.classSessionId, cur);
  }
  return out;
}

/** Select dùng chung cho truy vấn ảnh phục vụ `buildSessionMediaCoverage`. */
export const SESSION_MEDIA_SELECT = {
  classSessionId: true,
  isClassWide: true,
  tags: { select: { studentId: true } },
} as const;

/**
 * `photoDone`: ảnh/video đã phủ hết học viên ĐI HỌC chưa.
 *
 * Luật nghiệp vụ (chủ dự án chốt 21/08): học viên VẮNG thì không cần nhận xét, không cần
 * ảnh; học viên KHÔNG VẮNG thì BẮT BUỘC cả hai. Vì thế điều kiện là "mỗi em đi học có ít
 * nhất một ảnh/video", KHÔNG phải "buổi có ít nhất một ảnh" — một tấm ảnh chụp một em
 * không nói được gì về chín em còn lại.
 *
 * Ảnh CHUNG CẢ LỚP (`ClassSessionMedia.isClassWide`) tính cho MỌI em: theo giao kèo ở
 * lib/lms/media-consent, đó là ảnh mọi phụ huynh của lớp đều xem được.
 * Không có em nào đi học ⇒ false: buổi chưa điểm danh hoặc cả lớp vắng thì chưa có gì để
 * gọi là xong (khớp `attendanceCoversRoster` và `summarizeSessionFeedback`).
 */
export function mediaCoversAttendees(input: {
  attendedStudentIds: Iterable<string>;
  /** studentId được gắn thẻ trong ảnh/video của BUỔI này. */
  taggedStudentIds: Iterable<string>;
  /** Buổi có ít nhất một ảnh/video đánh dấu "chung cả lớp". */
  hasClassWide: boolean;
}): boolean {
  const attended = [...input.attendedStudentIds];
  if (attended.length === 0) return false;
  if (input.hasClassWide) return true;
  const tagged =
    input.taggedStudentIds instanceof Set
      ? input.taggedStudentIds
      : new Set(input.taggedStudentIds);
  return attended.every((id) => tagged.has(id));
}

/**
 * Buổi KHÔNG còn việc gì phải làm → xếp xuống nhóm dưới. Rộng hơn `isSessionWorkComplete`
 * vì có hai ca "không có việc" chứ không phải "đã làm xong việc":
 *   • buổi ĐÃ HUỶ — không huỷ thì nó ghim vĩnh viễn ở đầu bảng, trên cả buổi vừa dạy;
 *   • lớp KHÔNG CÒN AI đang học (khoá đã kết thúc, mọi enrollment sang COMPLETED, hoặc
 *     lớp mới chưa xếp học viên) — sĩ số rỗng thì `attendanceCoversRoster` trả false cho
 *     MỌI buổi, và ở bảng gộp nhiều lớp cả lớp đã xong khoá sẽ nổi lên trên lớp đang chạy.
 */
export function isSessionSettled(input: {
  cancelled?: boolean;
  rosterEmpty?: boolean;
  work: SessionWorkState;
}): boolean {
  return Boolean(input.cancelled) || Boolean(input.rosterEmpty) || isSessionWorkComplete(input.work);
}

export type SessionOrderRow = {
  /** Số buổi (buildSessionNumberMap). Không tra được → xếp cuối nhóm. */
  number: number | null | undefined;
  /** Đã xong cả ba việc (isSessionWorkComplete). */
  complete: boolean;
};

/**
 * So sánh 2 buổi cho danh sách "điểm danh"/"nhận xét":
 *   • buổi CHƯA hoàn thành (gồm cả buổi sắp tới, chưa tới) lên TRƯỚC;
 *   • trong mỗi nhóm: SỐ BUỔI tăng dần.
 */
export function compareSessionWorkOrder(a: SessionOrderRow, b: SessionOrderRow): number {
  if (a.complete !== b.complete) return a.complete ? 1 : -1;
  const an = a.number ?? Number.MAX_SAFE_INTEGER;
  const bn = b.number ?? Number.MAX_SAFE_INTEGER;
  return an - bn;
}

/** `compareSessionWorkOrder` áp lên một mảng bất kỳ (KHÔNG sửa mảng gốc). */
export function sortSessionsForWork<T>(
  rows: T[],
  pick: (row: T) => SessionOrderRow,
): T[] {
  return [...rows].sort((a, b) => compareSessionWorkOrder(pick(a), pick(b)));
}
