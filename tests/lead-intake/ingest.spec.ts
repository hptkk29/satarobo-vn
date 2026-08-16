import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ingestIntakeLead } from "../../lib/lead/intake/ingest";
import { mapSaleForm, SALE_FORM_FIELDS } from "../../lib/lead/intake/map-sale-form";
import type { MappedLead } from "../../lib/lead/intake/types";

// =============================================================================
// LEAD INTAKE · tầng DB thật (Postgres LOCAL)
//
// Phủ những thứ unit test thuần KHÔNG chạm được: tra cơ sở/chủ sở hữu trong DB,
// luật chống trùng, và QĐ-D1 "trùng SĐT nhưng KHÁC con ⇒ gắn thêm LeadChild".
//
// ⚠️ CỔNG CHẠY: chỉ chạy khi DATABASE_URL trỏ Postgres LOCAL (localhost /
// 127.0.0.1 / satarobo_test). Máy không có DB test ⇒ SKIP sạch, không đỏ CI.
//   pnpm test:lead-intake   (nhớ nạp .env.test)
// =============================================================================

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const RUN =
  /(@|\/\/)(localhost|127\.0\.0\.1)[:/]/.test(DB_URL) ||
  /satarobo_test|ci_test/.test(DB_URL);

if (!RUN) {
  console.warn(
    `[lead-intake] SKIP: DATABASE_URL không trỏ Postgres local (${
      DB_URL.replace(/:[^:@]*@/, ":***@") || "trống"
    }). Xem .claude/rules/prisma-db.md để dựng DB test.`,
  );
}

// Tiền tố riêng để dọn sạch mà không đụng dữ liệu khác trong DB test.
const P = "ITLI_";
const CODE_A = "CS91";
const CODE_B = "CS92";
const EMP_CODE = `${P}NV001`;
/** Sale thuộc CƠ SỞ B — dùng cho ca gán chéo cơ sở. */
const EMP_CODE_B = `${P}NV002`;
/** Giáo viên (KHÔNG giữ vai Sale) — mã NV hợp lệ nhưng không được nhận lead. */
const EMP_CODE_TEACHER = `${P}GV001`;

// SĐT cố định (KHÔNG sinh từ Date.now — đã burn: `% 1e8` đẻ số 9 chữ số làm
// test đỏ theo GIỜ chạy). Mỗi ca một số riêng để chạy song song không đụng nhau.
const PHONE = {
  basic: "0900000101",
  twoChildren: "0900000102",
  sameChild: "0900000103",
  altFormat: "0900000104",
  badEmployee: "0900000105",
  unknownCenter: "0900000106",
  idempotent: "0900000107",
  noCenter: "0900000108",
  crossCenter: "0900000109",
  teacherCode: "0900000110",
  dupWarnings: "0900000111",
  closedLead: "0900000112",
} as const;
const ALL_PHONES = Object.values(PHONE);
/** Cùng SĐT nhưng ghi dạng canonical — dùng cho ca "nhận ra trùng dù khác dạng". */
const ALL_CANONICAL = ALL_PHONES.map((p) => `84${p.slice(1)}`);

const db = new PrismaClient();

function lead(over: Partial<MappedLead> = {}): MappedLead {
  return {
    parentName: "Chị Test",
    phone: PHONE.basic,
    email: null,
    centerHint: { kind: "code", value: CODE_A },
    child: null,
    employeeCode: null,
    noteLines: [],
    externalId: null,
    consentMarketing: true,
    warnings: [],
    ...over,
  };
}

async function purge() {
  const leads = await db.lead.findMany({
    where: { phone: { in: [...ALL_PHONES, ...ALL_CANONICAL] } },
    select: { id: true },
  });
  const ids = leads.map((l) => l.id);
  if (ids.length > 0) {
    await db.leadDuplicate.deleteMany({ where: { primaryLeadId: { in: ids } } });
    await db.leadActivity.deleteMany({ where: { leadId: { in: ids } } });
    await db.leadAuditLog.deleteMany({ where: { leadId: { in: ids } } });
    await db.leadChild.deleteMany({ where: { leadId: { in: ids } } });
    await db.lead.deleteMany({ where: { id: { in: ids } } });
  }
}

describe.skipIf(!RUN)("Lead intake · tầng DB thật", () => {
  let centerAId = "";
  let centerBId = "";

  beforeAll(async () => {
    await purge();

    const centerA = await db.center.upsert({
      where: { slug: `${P}co-so-a` },
      update: { code: CODE_A, isActive: true },
      create: {
        code: CODE_A,
        name: `${P}Cơ sở A`,
        slug: `${P}co-so-a`,
        address: "911 Đường Kiểm Thử",
        isActive: true,
      },
      select: { id: true },
    });
    centerAId = centerA.id;

    const centerB = await db.center.upsert({
      where: { slug: `${P}co-so-b` },
      update: { code: CODE_B, isActive: true },
      create: {
        code: CODE_B,
        name: `${P}Cơ sở B`,
        slug: `${P}co-so-b`,
        address: "922 Đường Kiểm Thử",
        isActive: true,
      },
      select: { id: true },
    });
    centerBId = centerB.id;

    // Sale thuộc CƠ SỞ B — để dựng ca "phiếu ghi cơ sở A, người nhập ở cơ sở B".
    const employeeB = await db.employee.upsert({
      where: { employeeCode: EMP_CODE_B },
      update: { isActive: true, centerId: centerB.id },
      create: {
        employeeCode: EMP_CODE_B,
        fullName: `${P}Sale cơ sở B`,
        jobTitle: "Tư vấn tuyển sinh",
        department: "TUYEN_SINH",
        centerId: centerB.id,
        isActive: true,
      },
      select: { id: true },
    });
    await db.user.upsert({
      where: { email: `${P}sale-b@example.test` },
      update: { isActive: true, employeeId: employeeB.id },
      create: {
        name: `${P}Sale cơ sở B`,
        email: `${P}sale-b@example.test`,
        role: "SALES_CSM",
        roles: ["SALES_CSM"],
        centerId: centerB.id,
        employeeId: employeeB.id,
        isActive: true,
      },
    });

    // Giáo viên: mã NV hợp lệ, tài khoản hoạt động, nhưng KHÔNG giữ vai Sale.
    const teacher = await db.employee.upsert({
      where: { employeeCode: EMP_CODE_TEACHER },
      update: { isActive: true, centerId: centerA.id },
      create: {
        employeeCode: EMP_CODE_TEACHER,
        fullName: `${P}Giáo viên`,
        jobTitle: "Giáo viên",
        department: "GIANG_DAY",
        centerId: centerA.id,
        isActive: true,
      },
      select: { id: true },
    });
    await db.user.upsert({
      where: { email: `${P}gv@example.test` },
      update: { isActive: true, employeeId: teacher.id },
      create: {
        name: `${P}Giáo viên`,
        email: `${P}gv@example.test`,
        role: "TEACHER",
        roles: ["TEACHER"],
        centerId: centerA.id,
        employeeId: teacher.id,
        isActive: true,
      },
    });

    const employee = await db.employee.upsert({
      where: { employeeCode: EMP_CODE },
      update: { isActive: true, centerId: centerA.id },
      create: {
        employeeCode: EMP_CODE,
        fullName: `${P}Nhân viên Sale`,
        jobTitle: "Tư vấn tuyển sinh",
        department: "TUYEN_SINH",
        centerId: centerA.id,
        isActive: true,
      },
      select: { id: true },
    });

    await db.user.upsert({
      where: { email: `${P}sale@example.test` },
      update: { isActive: true, employeeId: employee.id },
      create: {
        name: `${P}Nhân viên Sale`,
        email: `${P}sale@example.test`,
        role: "SALES_CSM",
        roles: ["SALES_CSM"],
        centerId: centerA.id,
        employeeId: employee.id,
        isActive: true,
      },
    });
  }, 120_000);

  afterAll(async () => {
    await purge();
    await db.$disconnect();
  }, 120_000);

  it("tạo Lead + LeadChild, gán đúng cơ sở theo mã", async () => {
    const r = await ingestIntakeLead(
      lead({
        phone: PHONE.basic,
        child: { fullName: "Bé An", schoolName: "TH Phù Đổng", gradeLevel: "Lớp 3" },
      }),
      { source: "sale-form" },
    );

    expect(r.ok).toBe(true);
    expect(r.duplicate).toBe(false);

    const row = await db.lead.findUnique({
      where: { id: r.leadId! },
      select: { centerId: true, childName: true, phone: true, source: true },
    });
    expect(row?.centerId).toBe(centerAId);
    expect(row?.childName).toBe("Bé An");
    expect(row?.source).toBe("sale-form");
    // SĐT luôn lưu canonical 84… — dedup của repo dựa vào đó.
    expect(row?.phone).toBe("84900000101");

    const children = await db.leadChild.findMany({
      where: { leadId: r.leadId! },
      select: { fullName: true, schoolName: true, gradeLevel: true, interestedCenterId: true },
    });
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({
      fullName: "Bé An",
      schoolName: "TH Phù Đổng",
      gradeLevel: "Lớp 3",
      interestedCenterId: centerAId,
    });
  }, 60_000);

  // ── QĐ-D1: ca có thật trong dữ liệu quatang (1 PH, 2 con, cách nhau 2 phút) ──
  it("trùng SĐT nhưng KHÁC con ⇒ gắn thêm LeadChild vào lead cũ, KHÔNG đẻ lead mới", async () => {
    const first = await ingestIntakeLead(
      lead({ phone: PHONE.twoChildren, child: { fullName: "Bé Một", gradeLevel: "Lớp 3" } }),
      { source: "quatang" },
    );
    expect(first.ok).toBe(true);

    const second = await ingestIntakeLead(
      lead({ phone: PHONE.twoChildren, child: { fullName: "Bé Hai", gradeLevel: "Lớp 8" } }),
      { source: "quatang" },
    );

    expect(second.ok).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(second.childAdded).toBe(true);
    expect(second.leadId).toBe(first.leadId);

    const children = await db.leadChild.findMany({
      where: { leadId: first.leadId! },
      select: { fullName: true },
      orderBy: { createdAt: "asc" },
    });
    expect(children.map((c) => c.fullName)).toEqual(["Bé Một", "Bé Hai"]);

    // Chỉ đúng 1 lead cho SĐT này.
    const count = await db.lead.count({ where: { phone: "84900000102" } });
    expect(count).toBe(1);

    // Người xử lý phải thấy được chuyện gì vừa xảy ra.
    const notes = await db.leadActivity.findMany({
      where: { leadId: first.leadId! },
      select: { content: true },
    });
    expect(notes.some((n) => n.content.includes("[Thêm con]"))).toBe(true);
  }, 60_000);

  it("trùng SĐT + CÙNG tên con ⇒ không thêm LeadChild (chống bấm gửi 2 lần)", async () => {
    const first = await ingestIntakeLead(
      lead({ phone: PHONE.sameChild, child: { fullName: "Bé Trùng" } }),
      { source: "sale-form" },
    );
    // Khác dấu/hoa-thường vẫn phải coi là cùng một đứa.
    const second = await ingestIntakeLead(
      lead({ phone: PHONE.sameChild, child: { fullName: "bé trùng" } }),
      { source: "sale-form" },
    );

    expect(second.duplicate).toBe(true);
    expect(second.childAdded).toBe(false);
    expect(
      await db.leadChild.count({ where: { leadId: first.leadId! } }),
    ).toBe(1);
  }, 60_000);

  it("SĐT ghi khác dạng (0… và 84…) vẫn nhận ra là trùng", async () => {
    const first = await ingestIntakeLead(lead({ phone: PHONE.altFormat }), {
      source: "sale-form",
    });
    const second = await ingestIntakeLead(
      lead({ phone: `84${PHONE.altFormat.slice(1)}` }),
      { source: "sale-form" },
    );

    expect(second.duplicate).toBe(true);
    expect(second.leadId).toBe(first.leadId);
  }, 60_000);

  it("mã NV có thật ⇒ gán thẳng cho người đó + status ASSIGNED", async () => {
    const r = await ingestIntakeLead(
      lead({ phone: PHONE.noCenter, employeeCode: EMP_CODE, centerHint: null }),
      { source: "sale-form" },
    );

    const row = await db.lead.findUnique({
      where: { id: r.leadId! },
      select: {
        status: true,
        assignedAt: true,
        centerId: true,
        assignedTo: { select: { email: true } },
      },
    });
    expect(row?.assignedTo?.email).toBe(`${P}sale@example.test`);
    expect(row?.status).toBe("ASSIGNED");
    expect(row?.assignedAt).not.toBeNull();
    // Không chọn cơ sở trên phiếu ⇒ lấy cơ sở của chính nhân viên nhập.
    expect(row?.centerId).toBe(centerAId);
  }, 60_000);

  it("mã NV không tồn tại ⇒ VẪN tạo lead, ghi cảnh báo vào note (không nuốt im lặng)", async () => {
    const r = await ingestIntakeLead(
      lead({ phone: PHONE.badEmployee, employeeCode: `${P}KHONG_CO` }),
      { source: "sale-form" },
    );

    expect(r.ok).toBe(true);
    const row = await db.lead.findUnique({
      where: { id: r.leadId! },
      select: { note: true },
    });
    expect(row?.note).toContain(`${P}KHONG_CO`);
    expect(row?.note).toContain("không có trong hệ thống");
  }, 60_000);

  it("cơ sở không nhận ra ⇒ tạo lead + cảnh báo, không đoán bừa cơ sở", async () => {
    const r = await ingestIntakeLead(
      lead({
        phone: PHONE.unknownCenter,
        centerHint: { kind: "text", value: "Cơ sở Sao Hoả" },
      }),
      { source: "quatang" },
    );

    const row = await db.lead.findUnique({
      where: { id: r.leadId! },
      select: { note: true },
    });
    expect(row?.note).toContain("Sao Hoả");
  }, 60_000);

  it("cùng externalId gửi 2 lần ⇒ chỉ 1 lead (idempotent)", async () => {
    const input = lead({ phone: PHONE.idempotent, externalId: "row-42" });
    const first = await ingestIntakeLead(input, { source: "quatang" });
    const second = await ingestIntakeLead(input, { source: "quatang" });

    expect(second.duplicate).toBe(true);
    expect(second.leadId).toBe(first.leadId);
    expect(await db.lead.count({ where: { eventId: "quatang:row-42" } })).toBe(1);
  }, 60_000);

  // ── Các ca vá sau vòng review đối kháng 16/08 ────────────────────────────

  it("mã NV KHÔNG giữ vai Sale (giáo viên) ⇒ không gán cho họ, vẫn ghi công vào note", async () => {
    const r = await ingestIntakeLead(
      lead({ phone: PHONE.teacherCode, employeeCode: EMP_CODE_TEACHER }),
      { source: "sale-form" },
    );

    const row = await db.lead.findUnique({
      where: { id: r.leadId! },
      select: {
        note: true,
        assignedTo: { select: { email: true, role: true } },
      },
    });
    // Bất biến của repo: chủ lead luôn là Sale. Giáo viên KHÔNG được nhận.
    expect(row?.assignedTo?.email).not.toBe(`${P}gv@example.test`);
    if (row?.assignedTo) expect(row.assignedTo.role).toBe("SALES_CSM");
    expect(row?.note).toContain("không giữ vai Sale");
  }, 60_000);

  it("người nhập ở cơ sở KHÁC cơ sở trên phiếu ⇒ không gán chéo (lead không thành vô hình)", async () => {
    const r = await ingestIntakeLead(
      lead({
        phone: PHONE.crossCenter,
        centerHint: { kind: "code", value: CODE_A }, // gia đình học ở cơ sở A
        employeeCode: EMP_CODE_B, // người nhập thuộc cơ sở B
      }),
      { source: "sale-form" },
    );

    const row = await db.lead.findUnique({
      where: { id: r.leadId! },
      select: {
        centerId: true,
        note: true,
        assignedTo: { select: { email: true, centerId: true } },
      },
    });

    // Cơ sở của GIA ĐÌNH thắng — đó mới là nơi phục vụ.
    expect(row?.centerId).toBe(centerAId);
    // Và tuyệt đối không được gán cho người ở cơ sở B: `scopedDb` sẽ giấu lead
    // này khỏi chính họ, trong khi auto-chia đã thoát sớm ⇒ lead nằm chết.
    expect(row?.assignedTo?.email).not.toBe(`${P}sale-b@example.test`);
    if (row?.assignedTo?.centerId) {
      expect(row.assignedTo.centerId).toBe(centerAId);
    }
    expect(row?.note).toContain("thuộc cơ sở khác");
  }, 60_000);

  it("trùng SĐT ⇒ cảnh báo KHÔNG bị nuốt, phải xuất hiện trên lead cũ", async () => {
    const first = await ingestIntakeLead(
      lead({ phone: PHONE.dupWarnings, child: { fullName: "Bé Đầu" } }),
      { source: "sale-form" },
    );

    await ingestIntakeLead(
      lead({
        phone: PHONE.dupWarnings,
        child: { fullName: "Bé Sau" },
        employeeCode: `${P}MA_SAI`,
        noteLines: ["Tỉnh/TP: Đà Nẵng"],
      }),
      { source: "sale-form" },
    );

    const acts = await db.leadActivity.findMany({
      where: { leadId: first.leadId! },
      select: { content: true },
    });
    const all = acts.map((a) => a.content).join("\n");
    expect(all).toContain("[Phiếu mới cùng SĐT]");
    expect(all).toContain(`${P}MA_SAI`);
    expect(all).toContain("Tỉnh/TP: Đà Nẵng");
  }, 60_000);

  it("hồ sơ cũ ĐÃ ĐÓNG (ENROLLED) ⇒ tạo lead MỚI, không chôn con thứ hai vào hồ sơ đóng", async () => {
    const first = await ingestIntakeLead(
      lead({ phone: PHONE.closedLead, child: { fullName: "Bé Anh Cả" } }),
      { source: "sale-form" },
    );
    await db.lead.update({
      where: { id: first.leadId! },
      data: { status: "ENROLLED" },
    });

    const second = await ingestIntakeLead(
      lead({ phone: PHONE.closedLead, child: { fullName: "Bé Em Út" } }),
      { source: "sale-form" },
    );

    expect(second.leadId).not.toBe(first.leadId);
    expect(second.duplicate).toBeFalsy();

    const fresh = await db.lead.findUnique({
      where: { id: second.leadId! },
      select: { status: true, note: true, children: { select: { fullName: true } } },
    });
    expect(fresh?.children.map((c) => c.fullName)).toEqual(["Bé Em Út"]);
    expect(fresh?.note).toContain("đã đóng");
    // Hồ sơ cũ vẫn nguyên trạng, không bị gắn thêm con.
    expect(await db.leadChild.count({ where: { leadId: first.leadId! } })).toBe(1);
    // Vẫn truy vết được mối liên hệ giữa hai hồ sơ.
    expect(
      await db.leadDuplicate.count({ where: { primaryLeadId: first.leadId! } }),
    ).toBeGreaterThan(0);
  }, 60_000);

  it("đi trọn đường form Sale: payload thô → Lead trong DB", async () => {
    await db.lead.deleteMany({ where: { phone: "84900000101" } });

    const mapped = mapSaleForm({
      [SALE_FORM_FIELDS.childName]: "Bé Toàn Trình",
      [SALE_FORM_FIELDS.parentName]: "",
      [SALE_FORM_FIELDS.phone]: "900000101", // ô số nuốt mất số 0 đầu
      [SALE_FORM_FIELDS.centerIndex]: "91", // → CS91
      [SALE_FORM_FIELDS.gradeLevel]: "Lớp 5",
      [SALE_FORM_FIELDS.provinceId]: "7480",
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;

    const r = await ingestIntakeLead(mapped.lead, { source: "sale-form" });
    const row = await db.lead.findUnique({
      where: { id: r.leadId! },
      select: { parentName: true, phone: true, centerId: true, note: true },
    });

    expect(row?.phone).toBe("84900000101");
    expect(row?.centerId).toBe(centerAId);
    // Phiếu thiếu tên PH ⇒ dựng từ tên con + cảnh báo, không rơi lead.
    expect(row?.parentName).toBe("PH của Bé Toàn Trình");
    expect(row?.note).toContain("Tỉnh/TP: Đà Nẵng");
    expect(row?.note).toContain("không có tên phụ huynh");
  }, 60_000);
});
