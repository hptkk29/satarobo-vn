/**
 * BULK-CONVERT — chốt hàng loạt lead "đã đăng ký" (nhập liệu ban đầu CS1/CS2).
 * Postgres LOCAL (.env.test). Test service-level (mẫu import-registered-isolation):
 * gọi thẳng convertOneLeadBackfill / ensureBackfillOrderPayment, không dựng HTTP.
 *
 * Phủ: happy path có tiền backfill (Order+Payment RECORDED lùi ngày, link vào
 * enrollment), nhánh không tiền (allowNoPayment + audit BACKFILL), idempotent
 * re-run, SĐT không canonical, lớp khác cơ sở, lead đã có khoản RECORDED.
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb, seedUser } from "../_helpers/seed";
import {
  convertOneLeadBackfill,
  ensureBackfillOrderPayment,
  BACKFILL_PAYMENT_MARKER,
} from "../../../lib/crm/bulk-convert";

test.describe("[BULK] Chốt hàng loạt lead đã đăng ký", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  let seq = 0;
  const uniq = () => `${Date.now().toString(36)}-${seq++}`;

  async function seedCenter(code = "CS1") {
    return db.center.create({
      data: { code, name: `Cơ sở ${code}`, slug: `cs-${code.toLowerCase()}-${uniq()}`, address: "x" },
    });
  }

  async function seedCourseClass(centerId: string, price = 5_000_000) {
    const course = await db.course.create({
      data: { name: `Sata ${uniq()}`, slug: `sata-${uniq()}`, price },
    });
    const cls = await db.class.create({
      data: { name: `Lớp ${uniq()}`, courseId: course.id, centerId },
    });
    return { course, cls };
  }

  async function seedRegisteredLeadWithChildren(
    centerId: string,
    phone: string,
    childNames: string[],
  ) {
    const lead = await db.lead.create({
      data: { parentName: "PH Bulk", phone, status: "REGISTERED", centerId },
    });
    const children = [];
    for (const name of childNames) {
      children.push(
        await db.leadChild.create({ data: { leadId: lead.id, fullName: name } }),
      );
    }
    return { lead, children };
  }

  async function seedActor() {
    const u = await seedUser({
      email: `qlcs-${uniq()}@test.com`,
      role: "CENTER_MANAGER",
      name: "QL Bulk",
    });
    return { id: u.id, name: "QL Bulk" };
  }

  test("[BULK-01] có tiền backfill → Order+Payment RECORDED lùi ngày, 2 HV vào lớp, TK PH chờ kích hoạt, khoản link vào enrollment", async () => {
    const center = await seedCenter();
    const { cls } = await seedCourseClass(center.id, 4_000_000);
    const { lead, children } = await seedRegisteredLeadWithChildren(center.id, "0905000001", [
      "Bé Một",
      "Bé Hai",
    ]);
    const actor = await seedActor();
    const paidDate = new Date("2026-05-15T05:00:00Z"); // khách đóng từ 15/05 — trước khi có hệ thống

    const res = await convertOneLeadBackfill(actor, {
      leadId: lead.id,
      students: children.map((c) => ({
        leadChildId: c.id,
        name: c.fullName,
        classId: cls.id,
        consentMedia: true,
      })),
      paid: { amount: 8_000_000, paidDate },
    });

    expect(res.ok).toBe(true);
    expect(res.studentIds).toHaveLength(2);
    expect(res.enrollmentIds).toHaveLength(2);

    // Lead đã ENROLLED.
    const leadAfter = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(leadAfter.status).toBe("ENROLLED");

    // TK phụ huynh: khoá SĐT canonical, chờ kích hoạt.
    const parent = await db.user.findUnique({ where: { phone: "84905000001" } });
    expect(parent).not.toBeNull();
    expect(parent!.role).toBe("PARENT");
    expect(parent!.accountStatus).toBe("PENDING_ACTIVATION");

    // Order backfill: CONFIRMED, đúng tổng niêm yết, paidAt lùi ngày.
    const order = await db.order.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(order.status).toBe("CONFIRMED");
    expect(order.totalAmount).toBe(8_000_000);
    expect(order.paidAt?.toISOString()).toBe(paidDate.toISOString());

    // Payment RECORDED mang marker, paidDate lùi ngày, và ĐÃ link vào enrollment
    // (FIN-01 chia theo finalPrice — 2 ghi danh bằng giá → 2 khoản 4tr).
    const payments = await db.payment.findMany({ where: { orderId: order.id } });
    expect(payments.length).toBe(2); // khoản gốc + khoản tách
    expect(payments.every((p) => p.saleStatus === "RECORDED")).toBe(true);
    expect(payments.every((p) => p.enrollmentId !== null)).toBe(true);
    expect(payments.reduce((s, p) => s + p.amount, 0)).toBe(8_000_000);
    expect(payments.some((p) => (p.note ?? "").includes(BACKFILL_PAYMENT_MARKER))).toBe(true);
    expect(payments.every((p) => p.paidDate.toISOString() === paidDate.toISOString())).toBe(true);

    // Enrollment vào đúng lớp + đúng cơ sở; consent ảnh đã ghi.
    const enrollments = await db.enrollment.findMany({ where: { id: { in: res.enrollmentIds! } } });
    expect(enrollments.every((e) => e.classId === cls.id && e.centerId === center.id)).toBe(true);
    expect(await db.studentConsent.count({ where: { status: "GRANTED" } })).toBe(2);
  });

  test("[BULK-02] không nhập tiền → vẫn chốt được (allowNoPayment), KHÔNG bịa khoản thu, audit mang lý do BACKFILL", async () => {
    const center = await seedCenter();
    const { cls } = await seedCourseClass(center.id);
    const { lead, children } = await seedRegisteredLeadWithChildren(center.id, "0905000002", ["Bé Ba"]);
    const actor = await seedActor();

    const res = await convertOneLeadBackfill(actor, {
      leadId: lead.id,
      students: [{ leadChildId: children[0]!.id, name: "Bé Ba", classId: cls.id, consentMedia: false }],
      paid: null,
    });

    expect(res.ok).toBe(true);
    expect(await db.payment.count()).toBe(0);
    expect(await db.order.count()).toBe(0);

    const audit = await db.auditLog.findFirst({
      where: { entityType: "Lead", entityId: lead.id, action: "STATUS_CHANGE" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.reason ?? "").toContain("BACKFILL_IMPORT");
  });

  test("[BULK-03] chạy lại cùng payload → idempotent (deduped, không nhân đôi HV/khoản)", async () => {
    const center = await seedCenter();
    const { cls } = await seedCourseClass(center.id);
    const { lead, children } = await seedRegisteredLeadWithChildren(center.id, "0905000003", ["Bé Tư"]);
    const actor = await seedActor();
    const input = {
      leadId: lead.id,
      students: [
        { leadChildId: children[0]!.id, name: "Bé Tư", classId: cls.id, consentMedia: false },
      ],
      paid: { amount: 5_000_000, paidDate: new Date("2026-06-01T05:00:00Z") },
    };

    const first = await convertOneLeadBackfill(actor, input);
    expect(first.ok).toBe(true);

    const second = await convertOneLeadBackfill(actor, input);
    // Lượt 2: lead đã ENROLLED → chặn ngay từ guard trạng thái (không đụng DB ghi).
    expect(second.ok).toBe(false);
    expect(second.code).toBe("ALREADY_CONVERTED");

    expect(await db.student.count()).toBe(1);
    expect(await db.enrollment.count()).toBe(1);
    // Payment: chỉ 1 khoản backfill (marker idempotent).
    expect(
      await db.payment.count({ where: { note: { contains: BACKFILL_PAYMENT_MARKER } } }),
    ).toBe(1);
  });

  test("[BULK-04] SĐT lead không canonical hoá được (số bàn) → PHONE_INVALID, không ghi gì", async () => {
    const center = await seedCenter();
    const { cls } = await seedCourseClass(center.id);
    const { lead, children } = await seedRegisteredLeadWithChildren(center.id, "02363123456", ["Bé Năm"]);
    const actor = await seedActor();

    const res = await convertOneLeadBackfill(actor, {
      leadId: lead.id,
      students: [{ leadChildId: children[0]!.id, name: "Bé Năm", classId: cls.id, consentMedia: false }],
      paid: null,
    });

    expect(res.ok).toBe(false);
    expect(res.code).toBe("PHONE_INVALID");
    expect(await db.student.count()).toBe(0);
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("REGISTERED");
  });

  test("[BULK-05] lớp khác cơ sở với lead → CLASS_WRONG_CENTER (chặn ghi danh chéo cơ sở)", async () => {
    const cs1 = await seedCenter("CS1");
    const cs2 = await seedCenter("CS2");
    const { cls: clsCs2 } = await seedCourseClass(cs2.id);
    const { lead, children } = await seedRegisteredLeadWithChildren(cs1.id, "0905000005", ["Bé Sáu"]);
    const actor = await seedActor();

    const res = await convertOneLeadBackfill(actor, {
      leadId: lead.id,
      students: [{ leadChildId: children[0]!.id, name: "Bé Sáu", classId: clsCs2.id, consentMedia: false }],
      paid: null,
    });

    expect(res.ok).toBe(false);
    expect(res.code).toBe("CLASS_WRONG_CENTER");
    expect(await db.enrollment.count()).toBe(0);
  });

  test("[BULK-06] lead ĐÃ có khoản RECORDED + vẫn nhập tiền → cảnh báo, KHÔNG ghi khoản đôi", async () => {
    const center = await seedCenter();
    const { cls } = await seedCourseClass(center.id);
    const { lead, children } = await seedRegisteredLeadWithChildren(center.id, "0905000006", ["Bé Bảy"]);
    const actor = await seedActor();

    // Khoản RECORDED có sẵn (Sale đã ghi nhận trong hệ thống).
    const order = await db.order.create({
      data: {
        code: `ORD-${uniq()}`,
        type: "COURSE",
        customerName: "PH Bulk",
        customerPhone: "0905000006",
        leadId: lead.id,
        centerId: center.id,
      },
    });
    await db.payment.create({
      data: {
        orderId: order.id,
        amount: 2_000_000,
        method: "cash",
        paidDate: new Date(),
        saleStatus: "RECORDED",
        accountantStatus: "PENDING",
        centerId: center.id,
      },
    });

    const res = await convertOneLeadBackfill(actor, {
      leadId: lead.id,
      students: [{ leadChildId: children[0]!.id, name: "Bé Bảy", classId: cls.id, consentMedia: false }],
      paid: { amount: 5_000_000, paidDate: new Date() },
    });

    expect(res.ok).toBe(true);
    expect(res.warning).toBeTruthy();
    // Không có khoản backfill mới — chỉ khoản RECORDED cũ (đã được link vào enrollment).
    expect(await db.payment.count({ where: { note: { contains: BACKFILL_PAYMENT_MARKER } } })).toBe(0);
    expect(await db.payment.count()).toBe(1);
  });

  test("[BULK-07] ensureBackfillOrderPayment idempotent theo marker (gọi 2 lần → 1 khoản)", async () => {
    const center = await seedCenter();
    const { lead } = await seedRegisteredLeadWithChildren(center.id, "0905000007", ["Bé Tám"]);
    const actor = await seedActor();
    const leadRow = {
      id: lead.id,
      status: lead.status,
      centerId: lead.centerId,
      parentName: lead.parentName,
      phone: lead.phone,
      email: lead.email,
    };
    const params = {
      actor,
      lead: leadRow,
      items: [{ itemName: "Sata X — Bé Tám", unitPrice: 3_000_000 }],
      paid: { amount: 3_000_000, paidDate: new Date("2026-04-01T05:00:00Z") },
    };

    const first = await ensureBackfillOrderPayment(params);
    const second = await ensureBackfillOrderPayment(params);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.paymentId).toBe(first.paymentId);
    expect(await db.order.count({ where: { leadId: lead.id } })).toBe(1);
    expect(await db.payment.count()).toBe(1);
  });
});
