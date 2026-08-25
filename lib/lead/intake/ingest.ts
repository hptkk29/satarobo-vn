import { db } from "@/lib/db";
import { canonicalPhone } from "@/lib/phone";
import { findRecentDuplicate, logDuplicateAttempt } from "../dedup";
import { autoAssignNewLead, TERMINAL_LEAD_STATUSES } from "../auto-assign";
import { autoAssignLead } from "../assign";
import { getNonEnrollableCenterIds } from "@/lib/enrollment-flow";
import { buildNote, isSameChildName, matchCenter } from "./normalize";
import type { MappedLead } from "./types";

// =============================================================================
// LEAD INTAKE — tầng chạm DB. Nhận `MappedLead` (đã do mapper thuần dựng) rồi:
//   tra cơ sở → tra chủ sở hữu theo mã NV → chống trùng → tạo Lead + LeadChild
//   → auto-chia.
//
// Đây là ĐƯỜNG GHI DUY NHẤT cho lead từ nguồn ngoài. `lib/lead/ingest.ts`
// (3 webhook facebook/zalo/google-form) là lớp bọc mỏng gọi vào đây.
// =============================================================================

export type IntakeContext = {
  /** Giá trị đi vào `Lead.source` — cũng là bộ lọc "Nguồn" ở admin. */
  source: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
  /** Tên hiển thị trong `LeadActivity` khi hệ thống tự thao tác. */
  actorName?: string;
  /**
   * `User.id` của NGƯỜI NHẬP — đi thẳng vào `Lead.createdById` (23/08/2026).
   *
   * Khác `assignedToId` (người CHĂM): phiếu do Sale Hội sở nhập vẫn tự chia về
   * Sale cơ sở, nhưng người nhập phải theo được phiếu của mình.
   *
   * Bỏ trống ở các nguồn KHÔNG có phiên đăng nhập (webhook facebook/zalo/
   * google-form) — đúng nghĩa "không rõ ai nhập", và cột này quyết định QUYỀN
   * NHÌN nên đoán bừa là lộ phiếu người khác.
   */
  createdByUserId?: string | null;
  /** Cơ sở đã biết sẵn (lời gọi cũ truyền thẳng id) — thắng `centerHint`. */
  centerId?: string | null;
  /** `Lead.eventId` dựng sẵn bởi caller; nếu bỏ trống sẽ suy từ `externalId`. */
  eventId?: string | null;
  utmSource?: string | null;
  utmCampaign?: string | null;
  /**
   * `true` = giữ NGUYÊN hành vi của 3 webhook có sẵn (facebook/zalo/google-form).
   * Chỉ `lib/lead/ingest.ts` bật cờ này. Nó gom đúng 2 khác biệt THẬT, không
   * phải cấu hình cho vui:
   *
   *  1. Auto-chia dùng `autoAssignLead` (bản cũ) thay vì `autoAssignNewLead`
   *     (bản mới có gán cơ sở + tôn trọng chế độ chia của cơ sở).
   *  2. SĐT không chuẩn hoá được thì GIỮ NGUYÊN chuỗi thô thay vì từ chối. Trước
   *     đợt này 3 nguồn đó vẫn tạo lead với SĐT thô ("0905 123 456 (mẹ bé An)");
   *     siết lại là làm rơi lead vào `WebhookDelivery=FAILED` mà chưa ai canh
   *     (cảnh báo im lặng thuộc P4, chưa làm) — đó là đổi hành vi vận hành
   *     ngoài phạm vi đợt này.
   *
   * Gộp nốt 3 nguồn cũ sang đường mới là việc NÊN làm, nhưng phải là một đợt
   * riêng có nghiệm thu, không kèm lén vào đây.
   */
  legacyWebhook?: boolean;
  /**
   * Cho phép phiếu KHÔNG có số điện thoại (`Lead.phone` = chuỗi rỗng).
   *
   * CHỈ biểu mẫu nội bộ `/nhap-khach-hang` bật cờ này (chủ dự án chốt 22/08/2026:
   * không ô nào bắt buộc — lead quảng cáo Facebook thường chỉ có link FB). Mọi
   * nguồn NGOÀI giữ nguyên luật cũ: không có số ⇒ từ chối, vì phiếu ẩn danh
   * không số là rác/spam, còn phiếu do người nhà mình ngồi gõ thì không.
   *
   * Bật cờ này KHÔNG mở đường cho lead trùng: `phoneVariants("")` trả mảng rỗng
   * nên nhánh chống trùng theo SĐT tự bỏ qua (xem chỗ gọi `findRecentDuplicate`).
   */
  allowMissingPhone?: boolean;
};

export type IntakeResult = {
  ok: boolean;
  leadId?: string;
  /** Trùng SĐT trong cửa sổ dedup ⇒ KHÔNG tạo lead mới. */
  duplicate?: boolean;
  /** Trùng SĐT nhưng KHÁC con ⇒ đã gắn thêm `LeadChild` vào lead cũ (QĐ D1). */
  childAdded?: boolean;
  error?: string;
  /**
   * TOÀN BỘ cảnh báo — của mapper LẪN của tầng này (cơ sở không nhận ra, mã NV
   * không giữ vai Sale, lead chưa gắn cơ sở…).
   *
   * Vì sao phải trả ra: chúng vẫn được ghi vào `note`, nhưng người vừa gõ phiếu
   * thì không đọc `note`. Trước đây caller chỉ hiện được `mapped.lead.warnings`
   * nên mọi cảnh báo sinh ở tầng này chỉ có ai mở lead ra mới thấy — tức là
   * không ai thấy đúng lúc còn sửa được.
   */
  warnings?: string[];
};

type CenterPick = { centerId: string | null; warning: string | null };

async function resolveCenter(mapped: MappedLead): Promise<CenterPick> {
  if (!mapped.centerHint) return { centerId: null, warning: null };

  // Loại cơ sở KHÔNG nhận ghi danh (Hội sở…) trước khi khớp — dùng đúng khái
  // niệm mà `autoAssignNewLead` đã dùng để chia lead, để hai đường không lệch
  // nhau. Gia đình không bao giờ học ở Hội sở, mà `Center("hoi-so")` lại có
  // `address = "Đà Nẵng"` nên nó khớp lỏng với gần như mọi chuỗi cơ sở.
  const [all, nonEnrollable] = await Promise.all([
    db.center.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, address: true },
    }),
    getNonEnrollableCenterIds(),
  ]);
  const centers = all.filter((c) => !nonEnrollable.includes(c.id));
  const centerId = matchCenter(mapped.centerHint, centers);
  return centerId
    ? { centerId, warning: null }
    : {
        centerId: null,
        warning: `Không nhận ra cơ sở "${mapped.centerHint.value}" — lead sẽ được chia tự động, kiểm tra lại giúp.`,
      };
}

type OwnerPick = {
  assignedToId: string | null;
  /** Cơ sở của nhân viên nhập — dùng làm phương án 2 khi phiếu không rõ cơ sở. */
  fallbackCenterId: string | null;
  warning: string | null;
};

/**
 * Mã nhân viên trên phiếu → tài khoản đăng nhập để gán lead thẳng cho người đó.
 * Mọi trường hợp HỎNG đều trả `null` + 1 cảnh báo (lead vẫn được tạo, rơi về
 * auto-chia) — chặn lead vì sai mã NV là đánh đổi sai. Riêng ca "người nhập không
 * giữ vai Sale" trả `null` MÀ KHÔNG cảnh báo (24/08): đó là luồng bình thường, không
 * phải sự cố — lý do đầy đủ ở ngay nhánh đó bên dưới.
 *
 * ⚠️ CHỈ gán cho người giữ vai `SALES_CSM`. Ô mã NV trên phiếu là BẮT BUỘC nên
 * giáo viên/lễ tân/marketing thu được số ở sự kiện cũng gõ mã của chính mình;
 * gán bừa là phá bất biến "chủ lead luôn là Sale" mà mọi đường gán khác của repo
 * đều giữ (`manualAssignLead`, `getSalesLoad`, `getSaleStats` đều lọc SALES_CSM),
 * và người đó lại không có quyền xử lý lead. Vẫn giữ công người mang lead về:
 * mã NV được ghi vào `note`, và `fallbackCenterId` vẫn dùng để định cơ sở.
 */
async function resolveOwner(mapped: MappedLead): Promise<OwnerPick> {
  const code = mapped.employeeCode?.trim();
  if (!code) return { assignedToId: null, fallbackCenterId: null, warning: null };

  const employee = await db.employee.findUnique({
    where: { employeeCode: code },
    select: {
      isActive: true,
      centerId: true,
      userAccount: {
        select: { id: true, isActive: true, role: true, roles: true },
      },
    },
  });

  if (!employee) {
    return {
      assignedToId: null,
      fallbackCenterId: null,
      warning: `Mã nhân viên "${code}" không có trong hệ thống — lead được chia tự động.`,
    };
  }
  if (!employee.userAccount) {
    return {
      assignedToId: null,
      fallbackCenterId: employee.centerId,
      warning: `Nhân viên "${code}" chưa có tài khoản đăng nhập — lead được chia tự động.`,
    };
  }
  if (!employee.isActive || !employee.userAccount.isActive) {
    return {
      assignedToId: null,
      fallbackCenterId: employee.centerId,
      warning: `Tài khoản của "${code}" đang ngưng hoạt động — lead được chia tự động.`,
    };
  }

  const account = employee.userAccount;
  const isSale =
    account.role === "SALES_CSM" || account.roles.includes("SALES_CSM");
  if (!isSale) {
    // 24/08/2026 — KHÔNG cảnh báo nữa (chủ dự án chốt).
    //
    // Đây không phải sự cố, đây là đường đi BÌNH THƯỜNG của mọi phiếu do người
    // ngoài Sale nhập: Marketing Hội sở, Sale Hội sở (chính sách 23/08), giáo viên thu
    // số ở sự kiện, lễ tân… Họ vốn KHÔNG giữ `SALES_CSM`, và lead tự chia về Sale cơ
    // sở là ĐÚNG Ý ĐỒ — báo đỏ mỗi lần là gắn nhãn "có gì sai" lên hành vi đúng,
    // và làm những cảnh báo THẬT (sai mã NV, tài khoản ngưng hoạt động) chìm nghỉm.
    //
    // Công người mang lead về vẫn giữ nguyên ở hai chỗ bền hơn một câu chữ:
    // cột `Lead.createdById` (từ 23/08) và dòng "Nhân viên nhập: <mã>" trong note.
    // Các nhánh hỏng thật ở trên VẪN cảnh báo — đừng gỡ theo.
    return {
      assignedToId: null,
      fallbackCenterId: employee.centerId,
      warning: null,
    };
  }

  return {
    assignedToId: account.id,
    fallbackCenterId: employee.centerId,
    warning: null,
  };
}

/**
 * Trùng SĐT: quyết định xem đây có phải một ĐỨA CON KHÁC của phụ huynh cũ không.
 *
 * Vì sao cần (QĐ D1 — bằng chứng trong dữ liệu thật): có phụ huynh gửi 2 phiếu
 * cách nhau 2 phút cho 2 con ở 2 khối lớp. Luật cũ chỉ ghi 1 dòng ghi chú ⇒ mất
 * hẳn đứa thứ hai. `LeadChild` sinh ra đúng để đựng ca này.
 *
 * Chỉ gắn khi tên con KHÁC. Tên trùng hoặc trống ⇒ đây là bấm gửi 2 lần, giữ
 * hành vi cũ để không đẻ `LeadChild` rác.
 */
async function attachExtraChild(
  leadId: string,
  mapped: MappedLead,
  centerId: string | null,
  actorName: string,
): Promise<boolean> {
  const child = mapped.child;
  if (!child) return false;

  const [existingChildren, lead] = await Promise.all([
    db.leadChild.findMany({ where: { leadId }, select: { fullName: true } }),
    db.lead.findUnique({ where: { id: leadId }, select: { childName: true } }),
  ]);

  const known: (string | null)[] = [
    ...existingChildren.map((c) => c.fullName),
    lead?.childName ?? null,
  ];
  if (known.some((name) => isSameChildName(name, child.fullName))) return false;

  await db.$transaction(async (tx) => {
    await tx.leadChild.create({
      data: {
        leadId,
        fullName: child.fullName,
        schoolName: child.schoolName ?? null,
        gradeLevel: child.gradeLevel ?? null,
        interestedCenterId: centerId,
      },
    });
    await tx.leadActivity.create({
      data: {
        leadId,
        actorName,
        type: "NOTE",
        content:
          `[Thêm con] Phụ huynh gửi thêm phiếu cho "${child.fullName}"` +
          `${child.gradeLevel ? ` (${child.gradeLevel})` : ""}` +
          ` — đã thêm vào hồ sơ này thay vì tạo lead mới.`,
      },
    });
  });
  return true;
}

/**
 * Ghi nội dung phiếu + cảnh báo vào lead ĐANG CÓ dưới dạng 1 `LeadActivity`.
 * Dùng cho nhánh trùng SĐT — chỗ duy nhất không tạo Lead nên không có `note`.
 */
async function recordIntakeNotes(
  leadId: string,
  noteLines: readonly string[],
  warnings: readonly string[],
  actorName: string,
): Promise<void> {
  const body = buildNote(noteLines, warnings);
  if (!body) return;
  await db.leadActivity.create({
    data: {
      leadId,
      actorName,
      type: "NOTE",
      content: `[Phiếu mới cùng SĐT]\n${body}`,
    },
  });
}

export async function ingestIntakeLead(
  mapped: MappedLead,
  ctx: IntakeContext,
): Promise<IntakeResult> {
  // Đường mới: SĐT phải chuẩn hoá được, không thì từ chối (lead không gọi được
  // thì vô dụng). Đường cũ: giữ chuỗi thô để không làm rơi lead đang chảy.
  const rawPhone = mapped.phone?.trim() ?? "";
  const phone =
    canonicalPhone(rawPhone) ??
    // `|| null`, KHÔNG `?? `: webhook cũ gửi SĐT rỗng vẫn phải bị từ chối như
    // trước (chuỗi rỗng không nullish nên `??` sẽ nuốt luôn nhánh dưới).
    (ctx.legacyWebhook ? rawPhone || null : null) ??
    // Biểu mẫu nội bộ: ô SĐT bỏ trống là hợp lệ. Gõ SAI thì mapper đã bỏ đi kèm
    // cảnh báo, nên tới đây chuỗi rỗng luôn nghĩa là "chưa có số".
    (ctx.allowMissingPhone && rawPhone === "" ? "" : null);
  if (phone === null) return { ok: false, error: "Số điện thoại không hợp lệ" };

  const parentName = mapped.parentName.trim();
  if (!parentName) return { ok: false, error: "Thiếu tên phụ huynh" };

  const actorName = ctx.actorName ?? "Hệ thống (nhập tự động)";
  const eventId =
    ctx.eventId ?? (mapped.externalId ? `${ctx.source}:${mapped.externalId}` : null);

  // Idempotency: nguồn gửi lại cùng externalId ⇒ đã xử lý rồi.
  if (eventId) {
    const seen = await db.lead.findUnique({
      where: { eventId },
      select: { id: true },
    });
    if (seen) return { ok: true, leadId: seen.id, duplicate: true };
  }

  const warnings = [...mapped.warnings];

  const center = await resolveCenter(mapped);
  const owner = await resolveOwner(mapped);
  if (center.warning) warnings.push(center.warning);
  if (owner.warning) warnings.push(owner.warning);

  // Cơ sở của NGƯỜI NHẬP chỉ là phương án 2, và phải qua đúng bộ lọc mà ô cơ sở
  // trên phiếu đã qua: LEAD KHÔNG BAO GIỜ VỀ HỘI SỞ (chủ dự án chốt 04/08).
  //
  // Bỏ bước này là gài đúng cái bẫy cho người dùng chính của biểu mẫu nhập
  // khách: marketing ngồi ở Hội sở, để trống ô cơ sở với ý "để hệ thống tự
  // chia" — lead lại bị ghim `centerId = hoi-so`, `autoAssignNewLead` thoát sớm
  // vì đã có cơ sở, và Sale ở CS1/CS2 KHÔNG thấy lead đó (Lead ∈ SCOPED_MODELS).
  let fallbackCenterId = owner.fallbackCenterId;
  if (fallbackCenterId) {
    const nonEnrollable = await getNonEnrollableCenterIds();
    if (nonEnrollable.includes(fallbackCenterId)) {
      fallbackCenterId = null;
      warnings.push(
        "Người nhập thuộc đơn vị không nhận lead (Hội sở) — lead để hệ thống chia về cơ sở dạy học.",
      );
    }
  }

  const centerId = ctx.centerId ?? center.centerId ?? fallbackCenterId ?? null;

  // ⚠️ CƠ SỞ CỦA LEAD vs CƠ SỞ CỦA NGƯỜI NHẬP — phải khớp mới được gán thẳng.
  //
  // Cơ sở lấy từ ô trên phiếu (gia đình sẽ học ở đâu), người nhận lấy từ mã NV
  // (ai gõ phiếu). Hai thứ đó khác nhau là chuyện thường: Sale CS1 nhập cho gia
  // đình sẽ học CS2. Gán thẳng trong ca đó sinh ra lead mà CHÍNH NGƯỜI ĐƯỢC GÁN
  // không mở được — `Lead ∈ SCOPED_MODELS` nên `scopedDb` chèn `centerId IN
  // (cơ sở của họ)`, còn `autoAssignNewLead` thì thoát sớm vì đã có người phụ
  // trách ⇒ không ai được chia lại. Lead nằm chết.
  //
  // Xử lý: cơ sở của gia đình THẮNG (đó mới là nơi phục vụ), người nhập KHÔNG
  // được gán, để auto-chia chọn Sale đúng cơ sở. Công của người nhập không mất:
  // mã NV đã nằm trong `note` (mapper ghi) + 1 dòng cảnh báo nói rõ vì sao.
  let assignedToId = owner.assignedToId;
  if (
    assignedToId &&
    centerId &&
    fallbackCenterId &&
    fallbackCenterId !== centerId
  ) {
    assignedToId = null;
    warnings.push(
      `Người nhập (${mapped.employeeCode}) thuộc cơ sở khác với cơ sở trên phiếu — lead đã chia cho Sale đúng cơ sở, không giao cho người nhập.`,
    );
  }

  // `autoAssignNewLead` thoát sớm khi lead đã có người phụ trách — kể cả phần
  // GÁN CƠ SỞ nằm sau đó. Gán tay mà không rõ cơ sở thì lead sẽ nằm ngoài mọi
  // báo cáo theo cơ sở, nên phải nói ra chứ đừng để im.
  if (assignedToId && !centerId) {
    warnings.push("Lead chưa gắn được cơ sở — cần chọn cơ sở khi xử lý.");
  }

  // Không có số thì không có gì để so — bỏ hẳn nhánh chống trùng (so chuỗi rỗng
  // với chuỗi rỗng sẽ gộp MỌI lead chưa có số vào làm một).
  const dup = phone ? await findRecentDuplicate(phone) : null;
  if (dup) {
    const dupLead = await db.lead.findUnique({
      where: { id: dup.id },
      select: { status: true },
    });

    // Hồ sơ cũ ĐÃ ĐÓNG (ENROLLED / LOST / DUPLICATE) thì gắn con thứ hai vào đó
    // là chôn việc: lead đóng không nằm trong hàng đợi của Sale nào, không đổi
    // trạng thái, không sinh nhắc việc. Mà đây là ca RẤT THƯỜNG — nhà cho con
    // thứ nhất nhập học rồi hỏi tiếp cho con thứ hai trong cùng cửa sổ 90 ngày.
    // ⇒ coi là nhu cầu MỚI: rơi xuống tạo lead mới, vẫn ghi `LeadDuplicate` để
    // truy vết liên hệ giữa hai hồ sơ.
    const closed =
      dupLead != null && TERMINAL_LEAD_STATUSES.includes(dupLead.status);

    if (!closed) {
      const childAdded = await attachExtraChild(dup.id, mapped, centerId, actorName);
      await logDuplicateAttempt(dup.id, phone, ctx.source);

      // ⚠️ Nhánh này KHÔNG tạo Lead ⇒ mọi thứ chỉ sống ở CỘT của bản ghi mới sẽ
      // bốc hơi. Link Facebook là ca đó: điền vào lead cũ nếu nó còn trống, còn
      // khác nhau thì nói ra chứ không đè (hai link khác nhau có thể là hai
      // người nhà — người xử lý lead phải tự quyết).
      const dupNoteLines = [...mapped.noteLines];
      if (mapped.facebookUrl) {
        const cur = await db.lead.findUnique({
          where: { id: dup.id },
          select: { facebookUrl: true },
        });
        if (!cur?.facebookUrl) {
          await db.lead.update({
            where: { id: dup.id },
            data: { facebookUrl: mapped.facebookUrl },
          });
          dupNoteLines.push(`Link Facebook (điền từ phiếu mới): ${mapped.facebookUrl}`);
        } else if (cur.facebookUrl !== mapped.facebookUrl) {
          dupNoteLines.push(`Link Facebook khác trên phiếu mới: ${mapped.facebookUrl}`);
        }
      }
      if (mapped.leadSource) dupNoteLines.push(`Nguồn trên phiếu mới: ${mapped.leadSource}`);

      // Không ghi lại thì mọi cảnh báo (mã NV sai, cơ sở lạ, thiếu tên PH) cũng
      // bốc hơi — đúng kiểu nuốt lỗi im lặng mà luật cứng #6 cấm.
      await recordIntakeNotes(dup.id, dupNoteLines, warnings, actorName);
      return { ok: true, leadId: dup.id, duplicate: true, childAdded, warnings };
    }

    warnings.push(
      `SĐT này đã có hồ sơ cũ ở trạng thái ${dupLead?.status} (đã đóng) — tạo hồ sơ mới cho lần liên hệ này.`,
    );
    await logDuplicateAttempt(dup.id, phone, ctx.source);
  }

  const note = buildNote(mapped.noteLines, warnings);

  try {
    const lead = await db.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          parentName,
          phone,
          email: mapped.email ?? undefined,
          childName: mapped.child?.fullName ?? mapped.childName ?? undefined,
          centerId: centerId ?? undefined,
          assignedToId: assignedToId ?? undefined,
          ...(assignedToId ? { status: "ASSIGNED" as const, assignedAt: new Date() } : {}),
          // Nguồn marketing do người nhập khai thắng kênh kỹ thuật (xem
          // `MappedLead.leadSource`); bỏ trống thì giữ nguyên hành vi cũ.
          source: mapped.leadSource ?? ctx.source,
          facebookUrl: mapped.facebookUrl ?? undefined,
          createdById: ctx.createdByUserId ?? undefined,
          eventId: eventId ?? undefined,
          consentMarketing: mapped.consentMarketing,
          note: note ?? undefined,
          ipAddress: ctx.ipAddress ?? undefined,
          userAgent: ctx.userAgent ?? undefined,
          landingPage: ctx.landingPage ?? undefined,
          referrer: ctx.referrer ?? undefined,
          utmSource: ctx.utmSource ?? undefined,
          utmCampaign: ctx.utmCampaign ?? undefined,
        },
        select: { id: true },
      });

      if (mapped.child) {
        await tx.leadChild.create({
          data: {
            leadId: created.id,
            fullName: mapped.child.fullName,
            schoolName: mapped.child.schoolName ?? null,
            gradeLevel: mapped.child.gradeLevel ?? null,
            interestedCenterId: centerId,
          },
        });
      }

      if (assignedToId) {
        await tx.leadActivity.create({
          data: {
            leadId: created.id,
            actorName,
            type: "NOTE",
            content: `Gán theo mã nhân viên trên phiếu (${mapped.employeeCode}).`,
          },
        });
      }

      return created;
    });

    // Đã có người phụ trách thì hàm này tự thoát — gọi vô hại, giữ 1 đường duy nhất.
    // Await chứ không fire-and-forget: serverless có thể kill tiến trình ngay sau
    // khi response đi, lead sẽ nằm không ai nhận (đã burn ở `/api/leads`).
    const assign = ctx.legacyWebhook
      ? autoAssignLead(lead.id, { actorId: null, actorName })
      : autoAssignNewLead(lead.id, { actorId: null, actorName });
    await assign.catch((err) =>
      console.error(`[intake:${ctx.source}] auto-assign error:`, err),
    );

    return { ok: true, leadId: lead.id, duplicate: false, warnings };
  } catch (err) {
    // Đua eventId giữa 2 request song song → coi như đã xử lý.
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { ok: true, duplicate: true };
    }
    console.error(`[intake:${ctx.source}] create error:`, err);
    return { ok: false, error: "Lỗi tạo lead" };
  }
}
