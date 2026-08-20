/**
 * SEPAY-ROUTE — NHẬT KÝ webhook phải nói ĐÚNG SỰ THẬT, và tiền phải về ĐÚNG ĐƠN.
 *
 * Vì sao có file này (20/08): nội dung CK đổi sang dạng người đọc
 * `HoTenCon_SdtPH_TenKhoa` ⇒ `extractOrderCode` LUÔN trả null ⇒ mọi giao dịch
 * thật rơi vào nhánh `MANUAL && !order` của route. Nhánh đó trước đây vứt kết quả
 * `ingestPayosWebhook` đi rồi LUÔN ghi `MANUAL_REVIEW / FAILED` — nghĩa là nhật ký
 * đỏ 100% kể cả khi tiền đã rót đúng phiếu thu. Hai hậu quả: tín hiệu vận hành bão
 * hoà (đúng cơ chế đã giấu sự cố 26,8tr suốt 6 ngày) và kế toán có thể ghi Payment
 * tay LẦN HAI cho giao dịch đã tự ghi sổ.
 *
 * Test ở tầng ROUTE (gọi thẳng handler POST, không dựng HTTP) vì thứ cần khoá lại
 * chính là quyết định ghi log của route — tầng ingest đã có spec riêng
 * (sepay-ledger.spec.ts) và vốn vẫn xanh suốt thời gian bug tồn tại.
 *
 * ⚠️ LUẬT CỦA FILE NÀY — ĐỪNG GÕ TAY NỘI DUNG CK.
 * Bản đầu tiên của spec gõ tay chuỗi `"TranMinhAnh 0905000777 Sata2"` và seed đơn
 * KHÔNG có `OrderItem` nào. Hệ quả: tên khoá = null, nên bằng chứng phụ vô tình đi
 * qua `customerName` — nghĩa là ĐƯỜNG THẬT (hệ thống phát QR → chuỗi bị cắt còn
 * `VIETQR_ADDINFO_MAX` = 25 ký tự → ngân hàng gửi lại → webhook) chưa hề được phủ.
 * Test tự nhất quán với chính nó, không với hệ thống: vòng soi trước đã đo là với
 * cách đối chiếu CŨ (so tên khoá ĐẦY ĐỦ) thì 8/11 khoá học thật không bao giờ khớp,
 * mà spec này vẫn xanh. Nay mọi nội dung CK đều dựng bằng CHÍNH
 * `transferContentForOrder(..., VIETQR_ADDINFO_MAX)` — cùng công thức, cùng trần
 * ký tự với chuỗi nhúng vào mã QR — nên fixture không thể "dễ hơn" đời thật.
 *
 * ⚠️ Tên khoá trong seed vẫn để NGUYÊN tên marketing đầy đủ (`prisma/seed-courses.ts`
 * dựng `Course.name` = `"<mã> — <tên hiển thị>"`, vd `"Sata1 — Robosim Master"`) —
 * KHÔNG được "dọn" thành `"Sata1"` cho gọn. Lý do: `OrderItem.itemName` trên DB thật
 * chứa đúng chuỗi dài đó, và chính nó là ĐẦU VÀO của `shortCourseToken`. Seed sẵn mã
 * ngắn là bỏ qua đúng bước đang cần kiểm.
 *
 * ⚠️ ĐỔI HÀNH VI 20/08 (vòng 4) mà các "bảo hiểm fixture" dưới đây phải phản ánh:
 * `shortCourseToken` rút tên khoá về MÃ NGẮN 5 ký tự và `TRANSFER_NAME_MIN` bảo đảm
 * hạn mức tối thiểu cho tên con ⇒ tên con KHÔNG còn biến mất khỏi chuỗi 25 ký tự
 * nữa (trước đó mất sạch ở 11/11 khoá thật). Khẳng định kiểu `not.toContain("NGUYEN")`
 * của bản cũ nay SAI VỀ CHUẨN — thứ cần khoá lại là ngược lại: chuỗi 25 ký tự PHẢI
 * mang tiền tố tên con VÀ nguyên vẹn mã khoá. Đó chính là điều làm ca "hai anh em
 * ruột" ([SEPAY-ROUTE-06]) tách được.
 */
import { test, expect } from "@playwright/test";
import { NextRequest } from "next/server";
import { db } from "../../../lib/db";
import { resetDb } from "../_helpers/seed";
import { POST } from "../../../app/api/public/webhook/sepay/route";
import {
  transferContentPartsForOrder,
  shortCourseToken,
  MAX_TRANSFER_CONTENT,
  VIETQR_ADDINFO_MAX,
  TRANSFER_NAME_MIN,
} from "../../../lib/payments/vietqr";
import { normalizeContent } from "../../../lib/payments/sepay";

const API_KEY = "sepay-test-key";

test.describe("[SEPAY-ROUTE] nhật ký webhook SePay", () => {
  test.beforeEach(async () => {
    await resetDb();
    // checkSepayAuth đọc env lúc GỌI (không cache ở module) → set ở đây là đủ.
    process.env.SEPAY_WEBHOOK_API_KEY = API_KEY;
  });

  let seq = 0;
  const uniq = () => `${Date.now().toString(36)}-${seq++}`;

  function call(payload: Record<string, unknown>) {
    return POST(
      new NextRequest("https://satarobo.vn/api/public/webhook/sepay", {
        method: "POST",
        headers: { authorization: `Apikey ${API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
  }

  type SeedInput = {
    /** Tên con — nguồn của phần đầu nội dung CK. */
    studentName: string;
    /** Người mua = phụ huynh (tên + SĐT in trên đơn). */
    parentName: string;
    parentPhone: string;
    /** `OrderItem.itemName` — tên khoá THẬT (tên marketing đầy đủ, xem ghi chú đầu file). */
    courseName: string;
    /** Số phải thu của phiếu. Mặc định 5tr; đặt riêng khi cần dựng ca so tiền. */
    amountDue?: number;
  };

  /**
   * Đơn kiểu 20/08: nội dung CK KHÔNG có mã đơn, đối khớp bằng SĐT + bằng chứng
   * phụ. Phiếu thu để 5tr còn giao dịch 3tr → PARTIAL, đơn CHƯA chốt: giữ test khỏi
   * chạm khâu gửi biên nhận/ZNS (mạng ngoài) mà vẫn đi đúng nhánh MATCHED.
   *
   * Đơn CÓ `OrderItem` — bắt buộc, vì mã khoá là một trong hai mảnh bằng chứng phụ
   * mà nhánh (d) đối chiếu.
   */
  async function seedOrder(input: SeedInput) {
    const center = await db.center.create({
      data: { code: `CS${uniq()}`, name: "CS test", slug: `cs-${uniq()}`, address: "x" },
    });
    const student = await db.student.create({
      data: {
        name: input.studentName,
        parentName: input.parentName,
        parentPhone: input.parentPhone,
        centerId: center.id,
      },
      select: { id: true },
    });
    const amountDue = input.amountDue ?? 5_000_000;
    const order = await db.order.create({
      data: {
        code: `ORD-260820-${String(seq++).padStart(6, "0")}`,
        type: "COURSE",
        status: "PENDING_PAYMENT",
        customerName: input.parentName,
        customerPhone: input.parentPhone,
        studentId: student.id,
        centerId: center.id,
        subtotal: amountDue,
        totalAmount: amountDue,
        items: {
          create: {
            type: "COURSE_ENROLLMENT",
            itemName: input.courseName,
            quantity: 1,
            unitPrice: amountDue,
            totalPrice: amountDue,
          },
        },
      },
      select: { id: true, code: true },
    });
    const request = await db.paymentRequest.create({
      data: {
        orderId: order.id,
        centerId: center.id,
        installmentNo: 1,
        amountDue,
        matchKey: `HP${uniq().replace(/-/g, "")}`.toUpperCase().slice(0, 20),
        sortOrder: 1,
      },
      select: { id: true },
    });

    const source = {
      studentName: input.studentName,
      customerName: input.parentName,
      customerPhone: input.parentPhone,
      courseName: input.courseName,
    };
    /**
     * Chuỗi hệ thống THỰC SỰ nhúng vào mã QR cho đơn này (trần 25 ký tự), kèm từng
     * mảnh SAU KHI CẮT. Lấy `parts` chứ không chỉ `content` để các "bảo hiểm fixture"
     * nói được "tên con còn sống bao nhiêu / mã khoá có nguyên không" mà KHÔNG phải
     * gõ tay chuỗi mong đợi — gõ tay là tự nhốt test vào một danh mục khoá cụ thể.
     */
    const qrParts = transferContentPartsForOrder(source, VIETQR_ADDINFO_MAX);
    /** Bản 80 ký tự sale đọc qua điện thoại cho phụ huynh gõ tay. */
    const spokenParts = transferContentPartsForOrder(source, MAX_TRANSFER_CONTENT);
    return {
      order,
      request,
      qrParts,
      spokenParts,
      qrContent: qrParts.content,
      spokenContent: spokenParts.content,
    };
  }

  /** Đơn nào thực sự nhận được tiền — đọc từ SỔ phân bổ, không đoán qua log. */
  async function allocatedRequestIds(): Promise<string[]> {
    const rows = await db.paymentAllocation.findMany({ select: { paymentRequestId: true } });
    return rows.map((r) => r.paymentRequestId);
  }

  /** Nhật ký kết luận của route cho giao dịch vừa xử lý. */
  async function lastMatchLog() {
    return db.integrationLog.findFirstOrThrow({
      where: { provider: "SEPAY", action: { in: ["MATCH_TXN", "MANUAL_REVIEW"] } },
      orderBy: { createdAt: "desc" },
    });
  }

  test("[SEPAY-ROUTE-01] nội dung CK do CHÍNH hệ thống phát ra (đã cắt về 25 ký tự) → tiền về đúng đơn, log SUCCESS", async () => {
    // Khoá tên dài của danh mục thật: 25 ký tự không mang nổi tên marketing đầy đủ.
    const COURSE = "Sata6 — Chinh Phục Đấu Trường";
    const a = await seedOrder({
      studentName: "Trần Minh Anh",
      parentName: "Trần Văn Hùng",
      parentPhone: "0905000777",
      courseName: COURSE,
    });

    // Chốt lại rằng fixture ĐÚNG LÀ ca khó, chứ không phải một chuỗi dễ tình cờ:
    // chuỗi QR không mang nổi tên khoá đầy đủ, nó chỉ mang MÃ NGẮN. (Đây là bảo hiểm
    // cho fixture, thứ được kiểm tra ở dưới vẫn là HÀNH VI: tiền về đúng đơn.)
    expect(a.qrContent.length).toBeLessThanOrEqual(VIETQR_ADDINFO_MAX);
    expect(normalizeContent(a.qrContent)).not.toContain(normalizeContent(COURSE));
    expect(a.qrParts.course).toBe(shortCourseToken(COURSE));

    const res = await call({
      id: 90001,
      gateway: "MB",
      transferType: "in",
      transferAmount: 3_000_000,
      referenceCode: `REF${uniq()}`,
      accountNumber: "0123456789",
      content: a.qrContent,
    });

    // SePay coi non-2xx là lỗi và retry mãi → mọi ca đều phải 200.
    expect(res.status).toBe(200);
    const body = (await res.json()) as { handled?: boolean; success?: boolean };
    expect(body.success).toBe(true);
    expect(body.handled).toBe(true);

    // Tiền vào đúng phiếu thu của đơn đó.
    expect(await allocatedRequestIds()).toEqual([a.request.id]);
    const txn = await db.bankTransaction.findFirstOrThrow({ where: { provider: "SEPAY" } });
    expect(txn.status).toBe("MATCHED");

    const log = await lastMatchLog();
    expect(log.status).toBe("SUCCESS");
    expect(log.action).toBe("MATCH_TXN");

    // Không còn dòng nào bảo kế toán "cần xử lý tay" cho giao dịch đã tự rót —
    // đó chính là đường dẫn tới ghi Payment tay lần hai.
    expect(
      await db.integrationLog.count({ where: { provider: "SEPAY", action: "MANUAL_REVIEW" } }),
    ).toBe(0);
  });

  test("[SEPAY-ROUTE-02] thật sự không tra ra đơn → vẫn FAILED, nhưng LÝ DO là của sổ mới chứ không phải 'không khớp mã đơn'", async () => {
    const res = await call({
      id: 90002,
      gateway: "MB",
      transferType: "in",
      transferAmount: 1_000_000,
      referenceCode: `REF${uniq()}`,
      accountNumber: "0123456789",
      content: "CK khong ro nguoi gui",
    });

    expect(res.status).toBe(200);

    const log = await db.integrationLog.findFirstOrThrow({
      where: { provider: "SEPAY", action: "MANUAL_REVIEW" },
      orderBy: { createdAt: "desc" },
    });
    expect(log.status).toBe("FAILED");
    // Lý do phải chỉ được việc tiếp theo cho kế toán (tra theo gì, vướng ở đâu).
    expect(log.errorMessage ?? "").toContain("Không tra ra phiếu thu");
    expect(log.errorMessage ?? "").not.toContain("Không khớp mã đơn");

    // Tiền vẫn nằm nguyên trong sổ, đúng hàng chờ mà /admin/bien-dong-so-du đếm.
    const txn = await db.bankTransaction.findFirstOrThrow({ where: { provider: "SEPAY" } });
    expect(txn.status).toBe("UNMATCHED");
    expect(txn.unmatchedNote ?? "").toBe(log.errorMessage);
  });

  test("[SEPAY-ROUTE-03] tên con DÀI bị cắt còn TIỀN TỐ trong chuỗi QR → tên con vẫn có mặt, mã khoá vẫn nguyên, tiền về đúng đơn", async () => {
    const COURSE = "Sata1 — Robosim Master";
    const a = await seedOrder({
      studentName: "Nguyễn Thị Minh Khuê",
      parentName: "Nguyễn Văn Bình",
      parentPhone: "0905111222",
      courseName: COURSE,
    });

    // ── Bảo hiểm fixture ──────────────────────────────────────────────────────
    // (1) Đây ĐÚNG là ca cắt: tên con ở bản 25 ngắn hơn hẳn bản 80 và là TIỀN TỐ
    //     của nó — chứ không phải một fixture vừa vặn tình cờ.
    expect(a.qrParts.name.length).toBeLessThan(a.spokenParts.name.length);
    expect(a.spokenParts.name.startsWith(a.qrParts.name)).toBe(true);
    // (2) Thứ vòng vá 20/08 khoá lại: dù bị cắt, tên con KHÔNG biến mất — nó giữ
    //     được ít nhất `TRANSFER_NAME_MIN` ký tự và nằm ngay đầu chuỗi CK. Bản
    //     trước của spec khẳng định ngược lại (`not.toContain("NGUYEN")`) vì hồi đó
    //     tên khoá dài nuốt hết ngân sách; giữ khẳng định cũ là khoá cứng đúng cái
    //     bug đã sửa — kế toán nhìn sao kê không biết tiền của con nào.
    expect(a.qrParts.name.length).toBeGreaterThanOrEqual(TRANSFER_NAME_MIN);
    expect(a.qrContent.startsWith(a.qrParts.name)).toBe(true);
    // (3) Và mã khoá không bị cắt cụt theo — nguyên vẹn 5 ký tự của danh mục thật.
    expect(a.qrParts.course).toBe(shortCourseToken(COURSE));
    expect(a.qrContent.length).toBeLessThanOrEqual(VIETQR_ADDINFO_MAX);

    const res = await call({
      id: 90003,
      gateway: "MB",
      transferType: "in",
      transferAmount: 3_000_000,
      referenceCode: `REF${uniq()}`,
      accountNumber: "0123456789",
      content: a.qrContent,
    });

    expect(res.status).toBe(200);
    expect(((await res.json()) as { handled?: boolean }).handled).toBe(true);
    expect(await allocatedRequestIds()).toEqual([a.request.id]);
    expect((await lastMatchLog()).status).toBe("SUCCESS");
  });

  test("[SEPAY-ROUTE-04] ngân hàng chèn thêm chữ + SĐT NGƯỜI GỬI ở đầu chuỗi → vẫn đúng đơn, KHÔNG rót nhầm sang đơn của người gửi", async () => {
    // Ca thật "bà ngoại chuyển hộ": ngân hàng ghi "CT tu <SĐT người gửi> …" rồi mới
    // tới nội dung phụ huynh quét. Nếu người gửi TÌNH CỜ cũng đang có đơn chờ thu
    // thì chọn theo số ĐẦU TIÊN là rót tiền nhà này vào nợ nhà khác.
    const a = await seedOrder({
      studentName: "Trần Minh Anh",
      parentName: "Trần Văn Hùng",
      parentPhone: "0905000777",
      courseName: "Sata2 — Đấu trường Robot",
    });
    const b = await seedOrder({
      studentName: "Lê Hoàng Nam",
      parentName: "Lê Văn Tú",
      parentPhone: "0912345678",
      courseName: "Sata3 — Ươm Mầm Tài Năng",
    });

    const res = await call({
      id: 90004,
      gateway: "MB",
      transferType: "in",
      transferAmount: 3_000_000,
      referenceCode: `REF${uniq()}`,
      accountNumber: "0123456789",
      content: `CT tu 0912345678 ${a.qrContent}`,
    });

    expect(res.status).toBe(200);
    expect(((await res.json()) as { handled?: boolean }).handled).toBe(true);

    // Toàn bộ tiền vào phiếu của đơn A; đơn của người gửi KHÔNG được đụng tới.
    expect(await allocatedRequestIds()).toEqual([a.request.id]);
    expect(await db.paymentAllocation.count({ where: { paymentRequestId: b.request.id } })).toBe(0);
    const reqB = await db.paymentRequest.findUniqueOrThrow({ where: { id: b.request.id } });
    expect(reqB.status).toBe("PENDING");
  });

  test("[SEPAY-ROUTE-05] phụ huynh gõ tay bản 80 ký tự sale đọc qua điện thoại → cùng đơn đó nhận tiền", async () => {
    // Hai bản chuỗi (80 cho người đọc, 25 cho mã QR) phải cùng dẫn về một đơn —
    // nếu không, phụ huynh gõ tay là rơi vào đối soát tay.
    const a = await seedOrder({
      studentName: "Trần Minh Anh",
      parentName: "Trần Văn Hùng",
      parentPhone: "0905000777",
      courseName: "Sata1 — Robosim Master",
    });
    expect(a.spokenContent).not.toBe(a.qrContent);

    const res = await call({
      id: 90005,
      gateway: "MB",
      transferType: "in",
      transferAmount: 3_000_000,
      referenceCode: `REF${uniq()}`,
      accountNumber: "0123456789",
      content: a.spokenContent,
    });

    expect(res.status).toBe(200);
    expect(((await res.json()) as { handled?: boolean }).handled).toBe(true);
    expect(await allocatedRequestIds()).toEqual([a.request.id]);
    expect((await lastMatchLog()).status).toBe("SUCCESS");
  });

  test("[SEPAY-ROUTE-06] HAI ANH EM RUỘT cùng SĐT phụ huynh, cùng khoá → tiền về đúng đơn của bé có tên trong nội dung CK", async () => {
    // Đây là ca mà ĐỊNH DẠNG CŨ không thể tách: hồi tên khoá còn là tên marketing
    // dài, ngân sách 25 ký tự hết sạch cho SĐT + tên khoá nên TÊN CON biến mất ⇒ hai
    // bé sinh ra CHUỖI GIỐNG HỆT NHAU ⇒ nhánh (d) hoà ở tầng 1 và (khi hai đơn cùng
    // số tiền) phải trả null cho kế toán gán tay. Sau khi `shortCourseToken` rút tên
    // khoá về mã ngắn, tên con quay lại chuỗi 25 và chính nó tách được hai đơn.
    const COURSE = "Sata4 — Bứt Phá Giới Hạn";
    const PHONE = "0905222333";
    const anh = await seedOrder({
      studentName: "Nguyễn Minh Khôi",
      parentName: "Nguyễn Thị Lan",
      parentPhone: PHONE,
      courseName: COURSE,
    });
    const em = await seedOrder({
      studentName: "Nguyễn Bảo Long",
      parentName: "Nguyễn Thị Lan",
      parentPhone: PHONE,
      courseName: COURSE,
    });

    // ── Bảo hiểm fixture ──────────────────────────────────────────────────────
    // Hai chuỗi CHỈ khác nhau ở mảnh TÊN CON: SĐT và mã khoá y hệt. Nếu tên con lại
    // biến mất khỏi chuỗi 25 (hồi quy của vòng vá 20/08) thì hai chuỗi bằng nhau và
    // khẳng định này đỏ NGAY, trước cả khi chạm tới route — đó là chủ ý.
    expect(anh.qrParts.phone).toBe(em.qrParts.phone);
    expect(anh.qrParts.course).toBe(em.qrParts.course);
    expect(anh.qrParts.name).not.toBe(em.qrParts.name);
    expect(anh.qrContent).not.toBe(em.qrContent);
    // Hai đơn có số phải thu Y HỆT nhau ⇒ tiêu chí phụ theo SỐ TIỀN không tách được
    // đơn nào. Thứ duy nhất tách được là tên con — đúng thứ ca này muốn chứng minh.

    // ── Bé ANH chuyển trước (quét QR của đơn bé anh) ──────────────────────────
    const res1 = await call({
      id: 90006,
      gateway: "MB",
      transferType: "in",
      transferAmount: 3_000_000,
      referenceCode: `REF${uniq()}`,
      accountNumber: "0123456789",
      content: anh.qrContent,
    });
    expect(res1.status).toBe(200);
    expect(((await res1.json()) as { handled?: boolean }).handled).toBe(true);
    expect(await allocatedRequestIds()).toEqual([anh.request.id]);
    expect((await lastMatchLog()).status).toBe("SUCCESS");

    // ── Rồi tới bé EM, lần này phụ huynh GÕ TAY bản 80 ký tự sale đọc ─────────
    // Đổi luôn sang bản 80 để chứng minh việc tách đơn không phụ thuộc trần ký tự:
    // cả hai bản chuỗi đều phải dẫn về ĐÚNG bé của nó.
    const res2 = await call({
      id: 90007,
      gateway: "MB",
      transferType: "in",
      transferAmount: 3_000_000,
      referenceCode: `REF${uniq()}`,
      accountNumber: "0123456789",
      content: em.spokenContent,
    });
    expect(res2.status).toBe(200);
    expect(((await res2.json()) as { handled?: boolean }).handled).toBe(true);
    expect((await lastMatchLog()).status).toBe("SUCCESS");

    // Mỗi bé đúng MỘT dòng phân bổ vào phiếu của mình — không ai bị rót chồng.
    expect(await db.paymentAllocation.count({ where: { paymentRequestId: anh.request.id } })).toBe(
      1,
    );
    expect(await db.paymentAllocation.count({ where: { paymentRequestId: em.request.id } })).toBe(1);
    // Và không giao dịch nào rơi vào hàng chờ xử lý tay.
    expect(
      await db.integrationLog.count({ where: { provider: "SEPAY", action: "MANUAL_REVIEW" } }),
    ).toBe(0);
  });
});
