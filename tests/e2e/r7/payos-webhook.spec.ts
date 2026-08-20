/**
 * PAYOS-WEBHOOK — tiền về payOS → ghi sổ → phân bổ theo phiếu thu.
 *
 * Postgres LOCAL (.env.test). Test ở TẦNG SERVICE: gọi thẳng `ingestPayosWebhook`
 * (route `app/api/public/webhook/payos/route.ts` chỉ là vỏ verify chữ ký + gọi hàm
 * này), không dựng HTTP — chạy: `$env:R7_SKIP_WEBSERVER='1'; pnpm test:e2e:r7 payos-webhook`.
 *
 * Ca chốt chặn của cả thiết kế là [PAYOS-02]: QR HẾT HẠN 30 phút mà tiền vẫn về
 * thì tiền PHẢI phân bổ bình thường. `QrSession.expiresAt` chỉ để hiển thị đếm
 * ngược — biến nó thành điều kiện đối khớp là tái tạo lại đúng con bug đang sửa.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { db } from "../../../lib/db";
import { resetDb } from "../_helpers/seed";
import { ingestPayosWebhook, type PayosWebhookData } from "../../../lib/payments/payos-ingest";

test.describe("[PAYOS] webhook ghi nhận + phân bổ tiền", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  let seq = 0;
  const uniq = () => `${Date.now().toString(36)}${seq++}`;

  async function seedCenter() {
    return db.center.create({
      data: { code: `CS${seq}`, name: "CS payOS", slug: `cs-payos-${uniq()}`, address: "x" },
    });
  }

  /** Đơn chờ thanh toán + N phiếu thu theo đợt (mỗi phiếu có matchKey riêng, bền theo đời phiếu). */
  async function seedOrderWithRequests(
    amounts: number[],
    opts?: {
      email?: string | null;
      /** 20/08 — nhánh đối khớp theo SĐT tra ngược từ đây. */
      customerPhone?: string;
      /** Mã đơn ĐÚNG DẠNG `ORD-YYMMDD-NNNNNN` cho ca hồi quy nhánh (c). */
      code?: string;
      /** Tên học viên trên đơn (để test thu hẹp khi 1 SĐT có nhiều đơn). */
      studentName?: string;
      /** Tên dòng hàng = tên khoá trong nội dung CK. */
      courseName?: string;
    },
  ) {
    const center = await seedCenter();
    const total = amounts.reduce((s, a) => s + a, 0);
    const student = opts?.studentName
      ? await db.student.create({
          data: { name: opts.studentName, centerId: center.id, parentPhone: opts?.customerPhone },
        })
      : null;
    const order = await db.order.create({
      data: {
        code: opts?.code ?? `ORD-${uniq()}`,
        type: "COURSE",
        status: "PENDING_PAYMENT",
        customerName: "Phụ huynh payOS",
        customerPhone: opts?.customerPhone ?? "0905000777",
        customerEmail: opts?.email ?? null,
        studentId: student?.id ?? null,
        centerId: center.id,
        subtotal: total,
        totalAmount: total,
        ...(opts?.courseName
          ? {
              items: {
                create: {
                  type: "COURSE_ENROLLMENT" as const,
                  itemName: opts.courseName,
                  quantity: 1,
                  unitPrice: total,
                  totalPrice: total,
                },
              },
            }
          : {}),
      },
    });
    const requests = [];
    for (let i = 0; i < amounts.length; i++) {
      requests.push(
        await db.paymentRequest.create({
          data: {
            orderId: order.id,
            centerId: center.id,
            installmentNo: i + 1,
            amountDue: amounts[i]!,
            sortOrder: i + 1,
            matchKey: `SATA${uniq()}D${i + 1}`.toUpperCase(),
          },
        }),
      );
    }
    return { center, order, requests };
  }

  async function seedQrSession(
    paymentRequestId: string,
    centerId: string,
    opts: { amount: number; expiresAt: Date; status?: "ACTIVE" | "EXPIRED" | "CONSUMED" },
  ) {
    return db.qrSession.create({
      data: {
        paymentRequestId,
        centerId,
        providerOrderCode: String(Date.now() * 1000 + seq++),
        amountShown: opts.amount,
        qrContent: "SIMULATED-QR",
        checkoutUrl: "https://simulated.payos.local/checkout/x",
        expiresAt: opts.expiresAt,
        status: opts.status ?? "ACTIVE",
      },
    });
  }

  function payload(over: Partial<PayosWebhookData>): PayosWebhookData {
    return {
      orderCode: 0,
      amount: 0,
      description: "",
      accountNumber: "0123456789",
      reference: `FT${uniq()}`,
      transactionDateTime: "2026-08-03 10:00:00",
      currency: "VND",
      ...over,
    };
  }

  const statusOf = async (id: string) =>
    (await db.paymentRequest.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

  const allocatedOf = async (id: string) =>
    (
      await db.paymentAllocation.aggregate({
        where: { paymentRequestId: id },
        _sum: { amount: true },
      })
    )._sum.amount ?? 0;

  // ── 1 ────────────────────────────────────────────────────────────────────
  test("[PAYOS-01] đơn 2 đợt, tiền về đúng đợt 1 → đợt 1 PAID, đợt 2 PENDING, KHÔNG rơi UNMATCHED", async () => {
    const { order, requests } = await seedOrderWithRequests([3_000_000, 2_000_000]);
    const [dot1, dot2] = requests;

    const res = await ingestPayosWebhook(
      payload({ amount: 3_000_000, description: `CK ${dot1!.matchKey}` }),
    );

    expect(res.status).toBe("MATCHED");
    if (res.status !== "MATCHED") return;
    expect(res.orderId).toBe(order.id);
    expect(res.paymentRequestId).toBe(dot1!.id);
    expect(res.allocated).toBe(3_000_000);
    expect(res.credit).toBe(0);
    expect(res.settled).toBe(false);

    expect(await statusOf(dot1!.id)).toBe("PAID");
    expect(await statusOf(dot2!.id)).toBe("PENDING");
    expect(await allocatedOf(dot1!.id)).toBe(3_000_000);
    expect(await allocatedOf(dot2!.id)).toBe(0);

    const txn = await db.bankTransaction.findUniqueOrThrow({ where: { id: res.bankTransactionId } });
    expect(txn.status).toBe("MATCHED");
    expect(txn.unmatchedNote).toBeNull();

    // Đơn chưa đóng đủ → KHÔNG tự xác nhận.
    const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe("PENDING_PAYMENT");
  });

  // ── 2 (CA CHỐT CHẶN) ─────────────────────────────────────────────────────
  test("[PAYOS-02] QR ĐÃ HẾT HẠN 30 phút, tiền vẫn về → VẪN phân bổ đúng đợt 1", async () => {
    const { center, requests } = await seedOrderWithRequests([3_000_000, 2_000_000]);
    const [dot1, dot2] = requests;
    const expired = await seedQrSession(dot1!.id, center.id, {
      amount: 3_000_000,
      expiresAt: new Date(Date.now() - 30 * 60_000),
      status: "EXPIRED",
    });

    // Nội dung CK KHÔNG chứa matchKey → buộc đi nhánh (b): orderCode → QrSession.
    const res = await ingestPayosWebhook(
      payload({
        amount: 3_000_000,
        orderCode: Number(expired.providerOrderCode),
        description: "CHUYEN KHOAN HOC PHI",
      }),
    );

    expect(res.status).toBe("MATCHED");
    if (res.status !== "MATCHED") return;
    expect(res.paymentRequestId).toBe(dot1!.id);
    expect(await statusOf(dot1!.id)).toBe("PAID");
    expect(await statusOf(dot2!.id)).toBe("PENDING");

    // Hết hạn KHÔNG được biến thành lý do từ chối.
    const txn = await db.bankTransaction.findUniqueOrThrow({ where: { id: res.bankTransactionId } });
    expect(txn.status).toBe("MATCHED");
  });

  test("[PAYOS-02b] mã nguồn đường webhook KHÔNG được đọc `expiresAt` (chặn tái phát bug)", async () => {
    const file = path.join(process.cwd(), "lib", "payments", "payos-ingest.ts");
    const offending = fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
      })
      .filter((l) => l.includes("expiresAt"));
    expect(offending, "expiresAt xuất hiện trong code đối khớp — xem bất biến #1").toEqual([]);
  });

  // ── 3 ────────────────────────────────────────────────────────────────────
  test("[PAYOS-03] sale xuất lại QR 5 lần, PH quét cái cuối → đúng 1 lần ghi nhận, đúng phiếu", async () => {
    const { center, requests } = await seedOrderWithRequests([3_000_000, 2_000_000]);
    const [dot1, dot2] = requests;

    const sessions = [];
    for (let i = 0; i < 5; i++) {
      sessions.push(
        await seedQrSession(dot1!.id, center.id, {
          amount: 3_000_000,
          // 4 phiên đầu đã quá hạn, phiên cuối còn sống — mọi phiên vẫn trỏ 1 phiếu.
          expiresAt: new Date(Date.now() + (i === 4 ? 10 : -10) * 60_000),
          status: i === 4 ? "ACTIVE" : "EXPIRED",
        }),
      );
    }
    const last = sessions[4]!;

    const res = await ingestPayosWebhook(
      payload({
        amount: 3_000_000,
        orderCode: Number(last.providerOrderCode),
        description: "CK HOC PHI THANG 8",
      }),
    );

    expect(res.status).toBe("MATCHED");
    if (res.status !== "MATCHED") return;
    expect(res.paymentRequestId).toBe(dot1!.id);

    expect(await db.bankTransaction.count()).toBe(1);
    expect(await db.paymentAllocation.count()).toBe(1);
    expect(await allocatedOf(dot1!.id)).toBe(3_000_000);
    expect(await statusOf(dot2!.id)).toBe("PENDING");
    // Phiên vừa dùng được đánh dấu CONSUMED (chỉ để hiển thị).
    expect(
      (await db.qrSession.findUniqueOrThrow({ where: { id: last.id } })).status,
    ).toBe("CONSUMED");
  });

  // ── 4 ────────────────────────────────────────────────────────────────────
  test("[PAYOS-04] đóng gộp cả 2 đợt trong 1 lần → cả hai PAID, đơn tự xác nhận", async () => {
    const { order, requests } = await seedOrderWithRequests([3_000_000, 2_000_000]);
    const [dot1, dot2] = requests;

    const res = await ingestPayosWebhook(
      payload({ amount: 5_000_000, description: `CK ${dot1!.matchKey}` }),
    );

    expect(res.status).toBe("MATCHED");
    if (res.status !== "MATCHED") return;
    expect(res.allocated).toBe(5_000_000);
    expect(res.credit).toBe(0);
    expect(res.settled).toBe(true);

    expect(await statusOf(dot1!.id)).toBe("PAID");
    expect(await statusOf(dot2!.id)).toBe("PAID");
    expect(await allocatedOf(dot2!.id)).toBe(2_000_000);

    const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe("CONFIRMED");
    expect(o.paidAt).not.toBeNull();
  });

  // ── 5 ────────────────────────────────────────────────────────────────────
  test("[PAYOS-05] đóng dư 200k → 2 phiếu PAID + CreditBalance 200k", async () => {
    const { order, requests } = await seedOrderWithRequests([3_000_000, 2_000_000]);
    const [dot1, dot2] = requests;

    const res = await ingestPayosWebhook(
      payload({ amount: 5_200_000, description: `CK ${dot1!.matchKey}` }),
    );

    expect(res.status).toBe("MATCHED");
    if (res.status !== "MATCHED") return;
    expect(res.allocated).toBe(5_000_000);
    expect(res.credit).toBe(200_000);

    expect(await statusOf(dot1!.id)).toBe("PAID");
    expect(await statusOf(dot2!.id)).toBe("PAID");

    const credits = await db.creditBalance.findMany({ where: { orderId: order.id } });
    expect(credits).toHaveLength(1);
    expect(credits[0]!.amount).toBe(200_000);
    expect(credits[0]!.bankTransactionId).toBe(res.bankTransactionId);
    expect(credits[0]!.settledAt).toBeNull(); // kế toán xử lý TAY, hệ thống không tự hoàn
  });

  // ── 6 ────────────────────────────────────────────────────────────────────
  test("[PAYOS-06] thiếu 3k trong dung sai 5k → phiếu PAID, phần chênh được ghi lại", async () => {
    const { requests } = await seedOrderWithRequests([3_000_000, 2_000_000]);
    const [dot1, dot2] = requests;

    const res = await ingestPayosWebhook(
      payload({ amount: 2_997_000, description: `CK ${dot1!.matchKey}` }),
    );

    expect(res.status).toBe("MATCHED");
    if (res.status !== "MATCHED") return;
    expect(res.waived).toBe(3_000);
    expect(res.credit).toBe(0);

    expect(await statusOf(dot1!.id)).toBe("PAID");
    expect(await allocatedOf(dot1!.id)).toBe(2_997_000); // ghi ĐÚNG số tiền thật nhận
    expect(await statusOf(dot2!.id)).toBe("PENDING");

    // Phần tha phải nằm TRONG SỔ, không chỉ trong log: mọi lần tính lại trạng thái
    // về sau đọc cột này; thiếu nó thì phiếu bị ghi đè PAID → PARTIAL.
    const alloc = await db.paymentAllocation.findFirstOrThrow({
      where: { paymentRequestId: dot1!.id },
    });
    expect(alloc.roundingWaived).toBe(3_000);

    // Tính lại trạng thái từ sổ (mô phỏng recomputeRequestStatuses) phải RA ĐÚNG PAID.
    const agg = await db.paymentAllocation.aggregate({
      where: { paymentRequestId: dot1!.id },
      _sum: { amount: true, roundingWaived: true },
    });
    expect((agg._sum.amount ?? 0) + (agg._sum.roundingWaived ?? 0)).toBeGreaterThanOrEqual(
      dot1!.amountDue,
    );

    // Phần tha có dấu vết cho kế toán.
    const log = await db.integrationLog.findFirst({
      where: { provider: "PAYOS", action: "ROUNDING_WAIVED" },
    });
    expect(log).not.toBeNull();
    expect((log!.responsePayload as { waived?: number } | null)?.waived).toBe(3_000);
  });

  // ── 7 ────────────────────────────────────────────────────────────────────
  test("[PAYOS-07] thiếu 1 triệu → phiếu PARTIAL, KHÔNG rơi UNMATCHED", async () => {
    const { requests } = await seedOrderWithRequests([3_000_000, 2_000_000]);
    const [dot1, dot2] = requests;

    const res = await ingestPayosWebhook(
      payload({ amount: 2_000_000, description: `CK ${dot1!.matchKey}` }),
    );

    expect(res.status).toBe("MATCHED"); // lệch tiền KHÔNG BAO GIỜ là lý do từ chối
    if (res.status !== "MATCHED") return;
    expect(res.waived).toBe(0);

    expect(await statusOf(dot1!.id)).toBe("PARTIAL");
    expect(await allocatedOf(dot1!.id)).toBe(2_000_000);
    expect(await statusOf(dot2!.id)).toBe("PENDING");

    const txn = await db.bankTransaction.findUniqueOrThrow({ where: { id: res.bankTransactionId } });
    expect(txn.status).toBe("MATCHED");
  });

  // ── 8 ────────────────────────────────────────────────────────────────────
  test("[PAYOS-08] cùng giao dịch gọi 10 lần → đúng 1 BankTransaction, đúng 1 bộ phân bổ", async () => {
    const { requests } = await seedOrderWithRequests([3_000_000, 2_000_000]);
    const [dot1] = requests;
    const body = payload({ amount: 3_000_000, description: `CK ${dot1!.matchKey}` });

    const results = [];
    for (let i = 0; i < 10; i++) results.push(await ingestPayosWebhook({ ...body }));

    expect(results[0]!.status).toBe("MATCHED");
    expect(results.slice(1).every((r) => r.status === "DUPLICATE")).toBe(true);

    expect(await db.bankTransaction.count()).toBe(1);
    expect(await db.paymentAllocation.count()).toBe(1);
    expect(await allocatedOf(dot1!.id)).toBe(3_000_000);
    expect(await statusOf(dot1!.id)).toBe("PAID");
  });

  // ── 9 ────────────────────────────────────────────────────────────────────
  test("[PAYOS-09] hai giao dịch về ĐỒNG THỜI cùng đơn → tổng phân bổ = tổng tiền, không cộng đúp", async () => {
    const { order, requests } = await seedOrderWithRequests([3_000_000, 2_000_000]);
    const [dot1, dot2] = requests;

    // Cả hai cùng trỏ đợt 1 → cái vào sau phải tràn sang đợt 2, không rót đè.
    const [a, b] = await Promise.all([
      ingestPayosWebhook(payload({ amount: 3_000_000, description: `CK ${dot1!.matchKey}` })),
      ingestPayosWebhook(payload({ amount: 2_000_000, description: `CK ${dot1!.matchKey}` })),
    ]);

    expect([a.status, b.status]).toEqual(["MATCHED", "MATCHED"]);

    expect(await db.bankTransaction.count()).toBe(2);
    const total = await db.paymentAllocation.aggregate({ _sum: { amount: true } });
    expect(total._sum.amount).toBe(5_000_000);
    expect(await allocatedOf(dot1!.id)).toBe(3_000_000);
    expect(await allocatedOf(dot2!.id)).toBe(2_000_000);
    expect(await statusOf(dot1!.id)).toBe("PAID");
    expect(await statusOf(dot2!.id)).toBe("PAID");
    expect(await db.creditBalance.count()).toBe(0);

    const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe("CONFIRMED");
  });

  // ── 11 ───────────────────────────────────────────────────────────────────
  test("[PAYOS-11] không map được phiếu nào → UNMATCHED, tiền KHÔNG mất", async () => {
    await seedOrderWithRequests([3_000_000, 2_000_000]);

    const res = await ingestPayosWebhook(
      payload({ amount: 1_500_000, orderCode: 999_999_999, description: "CK KHONG RO NOI DUNG" }),
    );

    expect(res.status).toBe("UNMATCHED");
    if (res.status !== "UNMATCHED") return;

    const txn = await db.bankTransaction.findUniqueOrThrow({ where: { id: res.bankTransactionId } });
    expect(txn.status).toBe("UNMATCHED");
    expect(txn.amount).toBe(1_500_000); // tiền vẫn nằm nguyên trong sổ
    expect(txn.unmatchedNote).toBeTruthy();

    expect(await db.paymentAllocation.count()).toBe(0);
    expect(await db.creditBalance.count()).toBe(0);
  });

  // ── 12→16: NHÁNH (d) ĐỐI KHỚP THEO SĐT ───────────────────────────────────
  // 20/08 — nội dung CK đổi sang dạng người đọc `HoTenCon_SdtPH_TenKhoa`, không
  // còn mã đơn để bám. Đây là đường tiền tự về đúng đơn của định dạng mới; hỏng
  // nhánh này = mọi giao dịch rơi vào đối soát tay.
  test("[PAYOS-12] nội dung CK dạng mới (tên_SĐT_khoá) → khớp đúng đơn qua SĐT, rót vào đợt sớm nhất", async () => {
    const { order, requests } = await seedOrderWithRequests([3_000_000, 2_000_000], {
      customerPhone: "0987654321",
      studentName: "Nguyễn Văn A",
      courseName: "Sata 4",
    });
    const [dot1, dot2] = requests;

    const res = await ingestPayosWebhook(
      payload({ amount: 3_000_000, description: "NguyenVanA_84987654321_Sata4" }),
    );

    expect(res.status).toBe("MATCHED");
    if (res.status !== "MATCHED") return;
    expect(res.orderId).toBe(order.id);
    // Nội dung không phân biệt được đợt → neo vào phiếu chưa đóng đủ SỚM NHẤT.
    expect(res.paymentRequestId).toBe(dot1!.id);
    expect(await statusOf(dot1!.id)).toBe("PAID");
    expect(await statusOf(dot2!.id)).toBe("PENDING");
  });

  test("[PAYOS-12b] DB lưu SĐT dạng cũ `0…`, nội dung CK dạng `84…` → vẫn khớp", async () => {
    // Đây là ca thật của giai đoạn chuyển tiếp canonical SĐT (lib/phone.ts).
    const { order } = await seedOrderWithRequests([2_000_000], {
      customerPhone: "0912345678",
      studentName: "Trần Bảo Long",
      courseName: "Sata 2",
    });

    const res = await ingestPayosWebhook(
      payload({ amount: 2_000_000, description: "TranBaoLong_84912345678_Sata2" }),
    );

    expect(res.status).toBe("MATCHED");
    if (res.status !== "MATCHED") return;
    expect(res.orderId).toBe(order.id);
  });

  test("[PAYOS-13] một SĐT có 2 đơn đang chờ thu, nội dung không phân biệt được → UNMATCHED, KHÔNG đoán bừa", async () => {
    // Hai đơn CÙNG tên con + CÙNG khoá ⇒ thu hẹp bằng nội dung cũng bó tay.
    await seedOrderWithRequests([3_000_000], {
      customerPhone: "0987654321",
      studentName: "Nguyễn Văn A",
      courseName: "Sata 4",
    });
    await seedOrderWithRequests([4_000_000], {
      customerPhone: "0987654321",
      studentName: "Nguyễn Văn A",
      courseName: "Sata 4",
    });

    const res = await ingestPayosWebhook(
      payload({ amount: 3_000_000, description: "NguyenVanA_84987654321_Sata4" }),
    );

    expect(res.status).toBe("UNMATCHED");
    if (res.status !== "UNMATCHED") return;

    // Tiền vẫn nằm nguyên trong sổ, KHÔNG rót vào đơn nào.
    const txn = await db.bankTransaction.findUniqueOrThrow({ where: { id: res.bankTransactionId } });
    expect(txn.amount).toBe(3_000_000);
    expect(await db.paymentAllocation.count()).toBe(0);

    // Kế toán phải đọc được VÌ SAO, nếu không họ lại phải tự dò như sự cố 12/08.
    expect(txn.unmatchedNote).toContain("84987654321");
    expect(txn.unmatchedNote).toContain("2 đơn");
    expect(txn.unmatchedNote).toContain("chọn tay");
  });

  test("[PAYOS-13b] 2 đơn cùng SĐT nhưng KHÁC tên con → thu hẹp bằng nội dung, khớp đúng đơn", async () => {
    const anh = await seedOrderWithRequests([3_000_000], {
      customerPhone: "0987654321",
      studentName: "Nguyễn Văn Anh",
      courseName: "Sata 4",
    });
    const binh = await seedOrderWithRequests([4_000_000], {
      customerPhone: "0987654321",
      studentName: "Nguyễn Văn Bình",
      courseName: "Sata 4",
    });

    const res = await ingestPayosWebhook(
      payload({ amount: 4_000_000, description: "NguyenVanBinh_84987654321_Sata4" }),
    );

    expect(res.status).toBe("MATCHED");
    if (res.status !== "MATCHED") return;
    expect(res.orderId).toBe(binh.order.id);
    expect(await statusOf(binh.requests[0]!.id)).toBe("PAID");
    expect(await statusOf(anh.requests[0]!.id)).toBe("PENDING");
  });

  test("[PAYOS-13c] tên con có chữ Đ vẫn thu hẹp được (bẫy normalizeContent nuốt chữ Đ)", async () => {
    // `normalizeContent("Trần Đức Anh")` ra "TRANUCANH" — Đ không phân rã NFD nên bị
    // xoá thẳng — trong khi nội dung CK là "TranDucAnh". Không vá thì mọi tên có Đ ở
    // giữa mất khả năng thu hẹp và rơi hết vào đối soát tay.
    const duc = await seedOrderWithRequests([3_000_000], {
      customerPhone: "0987654321",
      studentName: "Trần Đức Anh",
      courseName: "Sata 4",
    });
    const hoa = await seedOrderWithRequests([4_000_000], {
      customerPhone: "0987654321",
      studentName: "Trần Thu Hoa",
      courseName: "Sata 4",
    });

    const res = await ingestPayosWebhook(
      payload({ amount: 3_000_000, description: "TranDucAnh_84987654321_Sata4" }),
    );

    expect(res.status).toBe("MATCHED");
    if (res.status !== "MATCHED") return;
    expect(res.orderId).toBe(duc.order.id);
    expect(await statusOf(hoa.requests[0]!.id)).toBe("PENDING");
  });

  test("[PAYOS-14] SĐT không có trong hệ thống → UNMATCHED kèm lý do", async () => {
    await seedOrderWithRequests([3_000_000], {
      customerPhone: "0987654321",
      studentName: "Nguyễn Văn A",
      courseName: "Sata 4",
    });

    const res = await ingestPayosWebhook(
      payload({ amount: 3_000_000, description: "LeThiB_84900111222_Sata1" }),
    );

    expect(res.status).toBe("UNMATCHED");
    if (res.status !== "UNMATCHED") return;
    expect(await db.paymentAllocation.count()).toBe(0);
    const txn = await db.bankTransaction.findUniqueOrThrow({ where: { id: res.bankTransactionId } });
    expect(txn.unmatchedNote).toContain("84900111222");
  });

  test("[PAYOS-15] HỒI QUY — nội dung CK CŨ còn mã ORD vẫn khớp qua nhánh (c), không đụng nhánh SĐT", async () => {
    // Ca quan trọng nhất của lần đổi này: đơn đã phát QR TRƯỚC 20/08 vẫn thu được
    // tiền. Mã đơn phải đúng dạng ORD-YYMMDD-NNNNNN thì extractOrderCode mới đọc ra.
    const { order, requests } = await seedOrderWithRequests([3_000_000, 2_000_000], {
      code: "ORD-260819-000123",
      customerPhone: "0987654321",
      studentName: "Nguyễn Văn A",
      courseName: "Sata 4",
    });
    const [dot1, dot2] = requests;

    const res = await ingestPayosWebhook(
      payload({ amount: 3_000_000, description: "CK ORD260819000123 NGUYEN VAN A" }),
    );

    expect(res.status).toBe("MATCHED");
    if (res.status !== "MATCHED") return;
    expect(res.orderId).toBe(order.id);
    expect(res.paymentRequestId).toBe(dot1!.id);
    expect(await statusOf(dot1!.id)).toBe("PAID");
    expect(await statusOf(dot2!.id)).toBe("PENDING");
  });

  test("[PAYOS-15b] HỒI QUY — matchKey của phiếu (QR cũ theo đợt) vẫn thắng nhánh SĐT", async () => {
    // Nội dung mang CẢ matchKey lẫn SĐT: phải rơi vào ĐÚNG ĐỢT theo matchKey,
    // không phải "đợt sớm nhất" của nhánh SĐT.
    const { requests } = await seedOrderWithRequests([3_000_000, 2_000_000], {
      customerPhone: "0987654321",
      studentName: "Nguyễn Văn A",
      courseName: "Sata 4",
    });
    const [dot1, dot2] = requests;

    const res = await ingestPayosWebhook(
      payload({ amount: 2_000_000, description: `${dot2!.matchKey} 84987654321` }),
    );

    expect(res.status).toBe("MATCHED");
    if (res.status !== "MATCHED") return;
    expect(res.paymentRequestId).toBe(dot2!.id);
    expect(await statusOf(dot1!.id)).toBe("PENDING");
    expect(await statusOf(dot2!.id)).toBe("PAID");
  });

  test("[PAYOS-16] đơn đã CANCELLED không được nhánh SĐT chọn làm đích", async () => {
    const { order } = await seedOrderWithRequests([3_000_000], {
      customerPhone: "0987654321",
      studentName: "Nguyễn Văn A",
      courseName: "Sata 4",
    });
    await db.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });

    const res = await ingestPayosWebhook(
      payload({ amount: 3_000_000, description: "NguyenVanA_84987654321_Sata4" }),
    );

    expect(res.status).toBe("UNMATCHED");
    expect(await db.paymentAllocation.count()).toBe(0);
  });
});
