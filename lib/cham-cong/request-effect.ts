// lib/cham-cong/request-effect.ts — "Duyệt đơn này sẽ đổi cái gì" nói bằng SỐ LIỆU thật.
//
// Vì sao file này tồn tại: `/don-tu` chỉ in một câu chung chung ("đổi mã ca trên lưới phân
// ca và tính lại công") nên người duyệt phải mở lưới ở tab khác mới biết đơn này biến ca
// nào thành ca nào. Ở đây tách làm hai tầng: `effectHint` giữ NGUYÊN VĂN câu cũ (5 nhánh,
// `WorkRequestReview` vẫn nhận prop đó), còn `describeEffect` dựng cột "Thay đổi" dạng
// `S → CG` từ dữ liệu đã đọc sẵn.
//
// THUẦN — KHÔNG truy vấn DB. `effectQueryPlan` nói cho màn `/don-tu` biết phải nạp gì
// (WU-12 đọc qua `scopedDb`), `effectSummaries` nhận kết quả đã nạp rồi ánh xạ về từng đơn.
// Tách vậy để cột này test được mà không cần Postgres, và để lib không kéo Prisma vào.
import { vnParts, vnYmd } from "@/lib/time/vn";
import { WORK_REQUEST_KINDS } from "@/lib/work-request";

/** Chỗ thiếu dữ liệu in dấu hỏi chứ không in "—": người duyệt phải thấy là CHƯA BIẾT. */
const UNKNOWN = "?";

/** Ô lưới còn trống. KHÁC "chưa biết": đây là trạng thái BÌNH THƯỜNG — duyệt vẫn ghi được ca
 *  vào ô trống. In "?" cho nó là nói dối theo hướng xấu: cả cột hoá `? → ?` và người duyệt
 *  đọc ra "trang hỏng" thay vì "người này chưa có ca ngày đó". */
const NO_SHIFT = "chưa xếp";

/** Lượt quét chưa có trong ngày. Cũng là trạng thái thật, không phải lỗi đọc. */
const NO_TAP = "chưa quét";

/** Số ngày của đơn khoảng (bao gồm cả hai đầu). Thiếu mốc ⇒ 1 ngày. */
export function leaveDayCount(fromDate: Date | null, toDate: Date | null): number {
  if (!fromDate || !toDate) return 1;
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
}

// ─── Tầng 1: câu mô tả hệ quả (giữ nguyên văn bản cũ) ────────────────────────────────

export type EffectHintRow = {
  kind: string;
  targetUserId: string | null;
  toDate: Date | null;
  fromDate: Date | null;
};

/** Nguyên văn 5 nhánh của `effectHint` cũ trong `app/(admin)/admin/don-tu/page.tsx`. */
export function effectHint(r: EffectHintRow): string | null {
  switch (r.kind) {
    case "CLASS_OFF":
      return "huỷ buổi học của lớp trong ngày (sinh buổi bù theo luật lớp)";
    case "SUB_TEACH":
      return "gán giáo viên dạy thay cho buổi đó";
    case "SHIFT_SWAP":
      return `đổi mã ca trên lưới phân ca${r.targetUserId ? " cho cả hai người" : ""} và tính lại công`;
    case "LEAVE":
      return `ghi mã nghỉ lên lưới cho ${leaveDayCount(r.fromDate, r.toDate)} ngày${r.targetUserId ? ", xếp ca người làm thay" : ""}`;
    case "TIMESHEET_FIX":
      return "ghi mốc giờ chỉnh tay và tính lại công ngày đó";
    default:
      return null;
  }
}

// ─── Tầng 2: cột "Thay đổi" ──────────────────────────────────────────────────────────

/** `warning` = đơn KHUYẾT tới mức bấm Duyệt sẽ ném lỗi (`lib/cham-cong/requests.ts` chặn ở
 *  transaction). Nói trước ở cột "Thay đổi" rẻ hơn nhiều so với để người duyệt bấm rồi ăn
 *  một hộp lỗi đỏ và không hiểu vì sao. */
export type EffectTone = "default" | "muted" | "warning";

/** `code` = mã ghi lên lưới nếu duyệt — hộp xác nhận in "Ghi {code} cho …". Không phải
 *  loại đơn nào cũng ghi một mã (chỉnh công ghi mốc giờ) nên nó tuỳ chọn. */
export type EffectSummary = {
  text: string;
  code?: string;
  tone: EffectTone;
  /**
   * Lý do bấm Duyệt sẽ NÉM LỖI (`decide()` chặn trong transaction). Chỉ đặt cho đơn chắc chắn
   * hỏng, KHÔNG đặt cho đơn chỉ đáng ngờ: nghỉ thiếu loại nghỉ vẫn áp được (ghi mã không lương),
   * nên nó mang tone `warning` mà `blocked` rỗng.
   *
   * Panel chi tiết dùng nó để thay câu "Duyệt đơn này sẽ: …" — không có nó thì màn vừa cảnh báo
   * "duyệt sẽ báo lỗi" vừa hứa việc duyệt sẽ làm, ngay cạnh một nút Duyệt đậm mời bấm.
   */
  blocked?: string;
};

/** Dữ liệu đã nạp sẵn cho MỘT đơn. Mọi trường nullable: đơn cũ/dữ liệu khuyết vẫn phải in được. */
export type EffectInput = {
  kind: string;
  fromDate: Date | null;
  toDate: Date | null;
  /** Tên người nhận (đổi ca hai chiều / dạy thay). */
  targetUserName: string | null;
  /** Mã ca ACTIVE của NGƯỜI NỘP trên lưới ngày `fromDate` (null = chưa xếp ca). */
  currentCode: string | null;
  /** Mã ca ACTIVE của NGƯỜI NHẬN cùng ngày. */
  targetCurrentCode: string | null;
  /** Mã ca mới người nộp xin — `WorkRequest.requesterNewTemplateId` → `ShiftTemplate.code`. */
  requesterNewCode: string | null;
  /** Mã ca người nhận sẽ giữ — `targetNewTemplateId`; bỏ trống = đổi thẳng lấy ca người nộp. */
  targetNewCode: string | null;
  /** Mã loại nghỉ — `leaveTypeId` → `LeaveType.code`. */
  leaveCode: string | null;
  /** Lượt quét ĐẦU/CUỐI đang có trong ngày (StaffTimeLog đã nhận). */
  currentIn: Date | null;
  currentOut: Date | null;
  /** Giờ đề nghị trên đơn — `requestedInAt`/`requestedOutAt`, vốn đã là "HH:mm". */
  requestedIn: string | null;
  requestedOut: string | null;
  className: string | null;
};

function hhmm(d: Date | null): string {
  if (!d) return NO_TAP;
  const p = vnParts(d);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

function trimmed(v: string | null): string | null {
  const s = v?.trim();
  return s ? s : null;
}

/**
 * Cột "Thay đổi". Trả `null` khi `kind` không thuộc 10 loại đơn đang có (dữ liệu lạ —
 * để chỗ gọi tự quyết in gì), còn loại hợp lệ mà không đổi lịch thì nói thẳng
 * "Chỉ đổi trạng thái" với tông xám.
 */
export function describeEffect(input: EffectInput): EffectSummary | null {
  switch (input.kind) {
    case "SHIFT_SWAP": {
      const from = trimmed(input.currentCode) ?? NO_SHIFT;
      const newCode = trimmed(input.requesterNewCode);
      // Không có mã ca mới thì `templateCode()` trả null và `decide()` ném "Mã ca mới không
      // còn trong danh mục" — đơn này KHÔNG duyệt được, nói thẳng thay vì vẽ "? → ?".
      if (!newCode) {
        return {
          text: "Thiếu mã ca mới — duyệt sẽ báo lỗi",
          tone: "warning",
          blocked: "đơn không ghi mã ca mới, nên không có gì để ghi lên lưới",
        };
      }
      let text = `${from} → ${newCode}`;
      const who = trimmed(input.targetUserName);
      if (who) {
        const tFrom = trimmed(input.targetCurrentCode) ?? NO_SHIFT;
        // Không khai ca riêng cho người nhận = đổi thẳng: họ nhận đúng ca người nộp đang giữ.
        const tTo = trimmed(input.targetNewCode) ?? trimmed(input.currentCode) ?? NO_SHIFT;
        text += ` · ${who}: ${tFrom} → ${tTo}`;
      }
      return { text, code: newCode, tone: "default" };
    }
    case "LEAVE": {
      const from = trimmed(input.currentCode) ?? NO_SHIFT;
      const leave = trimmed(input.leaveCode);
      const days = leaveDayCount(input.fromDate, input.toDate);
      // Nghỉ KHÔNG chọn loại vẫn duyệt được — `decide()` ghi mã "X" (không lương). Nó không
      // ném lỗi, nhưng rơi vào nhánh bất lợi cho người nộp mà không ai bấm chọn ⇒ cảnh báo.
      // CỐ Ý không đoán "P"/"X" ở đây: luật trả lương nằm ở `requests.ts`, chép sang lớp
      // hiển thị là hai nơi cùng giữ một luật rồi trôi ra khỏi nhau.
      if (!leave) return { text: `Thiếu loại nghỉ · ${days} ngày`, tone: "warning" };
      return { text: `${from} → ${leave} · ${days} ngày`, code: leave, tone: "default" };
    }
    case "TIMESHEET_FIX": {
      const reqIn = trimmed(input.requestedIn);
      const reqOut = trimmed(input.requestedOut);
      // Không có giờ nào để ghi ⇒ `decide()` ném "Đơn không có giờ vào/ra để ghi".
      if (!reqIn && !reqOut) {
        return {
          text: "Thiếu giờ vào/ra — duyệt sẽ báo lỗi",
          tone: "warning",
          blocked: "đơn không ghi giờ vào lẫn giờ ra, nên không có mốc giờ nào để ghi",
        };
      }
      const cur = `${hhmm(input.currentIn)}→${hhmm(input.currentOut)}`;
      return { text: `${cur} ⇒ ${reqIn ?? UNKNOWN}→${reqOut ?? UNKNOWN}`, tone: "default" };
    }
    case "CLASS_OFF": {
      const cls = trimmed(input.className);
      return { text: cls ? `Huỷ buổi · ${cls}` : "Huỷ buổi dạy", tone: "default" };
    }
    case "SUB_TEACH": {
      const who = trimmed(input.targetUserName);
      const cls = trimmed(input.className);
      const parts = [who ? `Dạy thay: ${who}` : "Dạy thay"];
      if (cls) parts.push(cls);
      return { text: parts.join(" · "), tone: "default" };
    }
    default:
      return (WORK_REQUEST_KINDS as readonly string[]).includes(input.kind)
        ? { text: "Chỉ đổi trạng thái", tone: "muted" }
        : null;
  }
}

// ─── Nạp dữ liệu: kế hoạch đọc + ánh xạ kết quả ──────────────────────────────────────

/** Khoá tra cứu (người × ngày). Dùng chung cho lưới ca và lượt quét để hai bản đồ không lệch. */
export function effectKey(userId: string, workDate: Date): string {
  return `${userId}|${vnYmd(workDate)}`;
}

/** Trường tối thiểu của một dòng `WorkRequest` để lập kế hoạch đọc. */
export type EffectQueryRow = {
  id: string;
  kind: string;
  requesterId: string;
  targetUserId: string | null;
  fromDate: Date | null;
  requesterNewTemplateId: string | null;
  targetNewTemplateId: string | null;
  leaveTypeId: string | null;
};

export type EffectQueryPlan = {
  /** `user.findMany({ id: { in } })` — tên người nhận. */
  userIds: string[];
  /** `shiftTemplate.findMany({ id: { in } })` — mã ca mới. */
  templateIds: string[];
  /** `leaveType.findMany({ id: { in } })` — mã loại nghỉ. */
  leaveTypeIds: string[];
  /** `shiftAssignment` status ACTIVE — mã ca ĐANG có của cặp (người, ngày). */
  shiftKeys: { userId: string; workDate: Date }[];
  /** `staffTimeLog` đã nhận — lượt đầu/cuối của cặp (người, ngày). Chỉ đơn chỉnh công. */
  timeLogKeys: { userId: string; workDate: Date }[];
};

/** Cần biết ca đang xếp: đổi ca (cả hai người) và nghỉ phép (người nộp). */
const NEEDS_SHIFT = new Set(["SHIFT_SWAP", "LEAVE"]);

export function effectQueryPlan(rows: readonly EffectQueryRow[]): EffectQueryPlan {
  const userIds = new Set<string>();
  const templateIds = new Set<string>();
  const leaveTypeIds = new Set<string>();
  const shift = new Map<string, { userId: string; workDate: Date }>();
  const taps = new Map<string, { userId: string; workDate: Date }>();

  for (const r of rows) {
    if (r.targetUserId) userIds.add(r.targetUserId);
    if (r.requesterNewTemplateId) templateIds.add(r.requesterNewTemplateId);
    if (r.targetNewTemplateId) templateIds.add(r.targetNewTemplateId);
    if (r.leaveTypeId) leaveTypeIds.add(r.leaveTypeId);
    if (!r.fromDate) continue;
    if (NEEDS_SHIFT.has(r.kind)) {
      shift.set(effectKey(r.requesterId, r.fromDate), { userId: r.requesterId, workDate: r.fromDate });
      if (r.kind === "SHIFT_SWAP" && r.targetUserId) {
        shift.set(effectKey(r.targetUserId, r.fromDate), { userId: r.targetUserId, workDate: r.fromDate });
      }
    }
    if (r.kind === "TIMESHEET_FIX") {
      taps.set(effectKey(r.requesterId, r.fromDate), { userId: r.requesterId, workDate: r.fromDate });
    }
  }

  return {
    userIds: [...userIds],
    templateIds: [...templateIds],
    leaveTypeIds: [...leaveTypeIds],
    shiftKeys: [...shift.values()],
    timeLogKeys: [...taps.values()],
  };
}

/** Kết quả đã nạp. Khoá của 2 bản đồ theo ngày phải dựng bằng `effectKey`. */
export type EffectLookups = {
  userNameById: ReadonlyMap<string, string>;
  templateCodeById: ReadonlyMap<string, string>;
  leaveCodeById: ReadonlyMap<string, string>;
  shiftCodeByUserDay: ReadonlyMap<string, string>;
  tapsByUserDay: ReadonlyMap<string, { first: Date | null; last: Date | null }>;
};

/** Dòng đơn đủ để dựng `EffectInput` (kế hoạch đọc + phần chỉ đọc trên chính bản ghi). */
export type EffectSummaryRow = EffectQueryRow & {
  toDate: Date | null;
  className: string | null;
  requestedInAt: string | null;
  requestedOutAt: string | null;
};

/** `Map<WorkRequest.id, EffectSummary>` — loại đơn lạ bị bỏ khỏi map (chỗ gọi in "—"). */
export function effectSummaries(
  rows: readonly EffectSummaryRow[],
  lookups: EffectLookups,
): Map<string, EffectSummary> {
  const out = new Map<string, EffectSummary>();
  for (const r of rows) {
    const dayKey = r.fromDate ? effectKey(r.requesterId, r.fromDate) : null;
    const targetKey = r.fromDate && r.targetUserId ? effectKey(r.targetUserId, r.fromDate) : null;
    const taps = dayKey ? lookups.tapsByUserDay.get(dayKey) : undefined;
    const summary = describeEffect({
      kind: r.kind,
      fromDate: r.fromDate,
      toDate: r.toDate,
      targetUserName: (r.targetUserId ? lookups.userNameById.get(r.targetUserId) : null) ?? null,
      currentCode: (dayKey ? lookups.shiftCodeByUserDay.get(dayKey) : null) ?? null,
      targetCurrentCode: (targetKey ? lookups.shiftCodeByUserDay.get(targetKey) : null) ?? null,
      requesterNewCode:
        (r.requesterNewTemplateId ? lookups.templateCodeById.get(r.requesterNewTemplateId) : null) ?? null,
      targetNewCode:
        (r.targetNewTemplateId ? lookups.templateCodeById.get(r.targetNewTemplateId) : null) ?? null,
      leaveCode: (r.leaveTypeId ? lookups.leaveCodeById.get(r.leaveTypeId) : null) ?? null,
      currentIn: taps?.first ?? null,
      currentOut: taps?.last ?? null,
      requestedIn: r.requestedInAt,
      requestedOut: r.requestedOutAt,
      className: r.className,
    });
    if (summary) out.set(r.id, summary);
  }
  return out;
}
