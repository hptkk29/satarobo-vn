// Ca [NTT-*] — BÁO CÁO NGƯỠNG THANH TOÁN CHẠY TRÊN PROD PHẢI KHÔNG CÓ ĐƯỜNG GHI NÀO.
//
// ─────────────────────────────────────────────────────────────────────────────
// Cùng họ với `[BCD-*]` (`lib/finance/bao-cao-chi-doc.test.ts`) — đây là báo cáo chỉ-đọc THỨ HAI
// chạy trên prod, nên nó phải có cùng bốn lớp khoá. Không gộp vào bộ `[BCD-*]` vì bộ đó neo
// cứng vào MỘT tệp script và mỗi ca đều nói về đặc tính riêng của tệp ấy (dùng lại phép bóc SĐT,
// che SĐT còn 4 số…) — những đặc tính mà báo cáo này CỐ Ý không có.
//
// ⚠️ VÌ SAO LÀ LƯỚI GHIM MÃ NGUỒN chứ không phải test hành vi: thứ cần khẳng định là "tệp này
// KHÔNG CHỨA" một loại lệnh. Không có đầu vào nào chứng minh được điều đó — chạy nó một nghìn
// lần với dữ liệu sạch vẫn không nói gì về nhánh chưa gọi tới. Chỉ văn bản mã nói được.
//
// ⚠️ LUẬT 11 (`docs/luat-doc-so-va-ket-luan.md`): lưới grep mã nguồn là loại MONG MANH NHẤT.
// Nên ở đây: bóc chú thích trước khi soi · neo chuỗi HẸP NHẤT · KHÔNG dùng cờ `/s` · khẳng định
// cả SỐ LẦN khớp. Và **đã cấy thử từng ca** — xem khối "BƯỚC CẤY" cuối tệp.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT = "scripts/bao-cao-nguong-thanh-toan.ts";
const WORKFLOW = ".github/workflows/nguong-thanh-toan-prod-chi-doc.yml";

// ⚠️ `import.meta.url` trong cấu hình vitest của repo này KHÔNG phải URL `file://` nên
// `fileURLToPath` ném — dùng `process.cwd()` (khuôn đã ghi ở CLAUDE.md mục "LƯỚI GHIM MÃ NGUỒN").
function doc(duong: string): string {
  return readFileSync(resolve(process.cwd(), duong), "utf8");
}

/**
 * Bóc chú thích — lưới phải soi MÃ, không soi lời kể về mã (luật 11).
 *
 * ⚠️ Bóc khối `/* *\/` TRƯỚC rồi mới bóc `//`, NGƯỢC thứ tự của `[BCD-01]`. Lý do: đầu tệp
 * script là một khối `/** *\/` dài liệt kê đúng những chuỗi mà lưới này đang CẤM
 * (`customerName`, `customerPhone`, `create`…) để giải thích vì sao chúng không được có. Bóc
 * `//` trước thì một dòng `//` nằm TRONG khối sẽ bị cắt mất phần đuôi, khối hở ra, và phần còn
 * lại của chú thích lọt vào chuỗi đem đi so — lưới đỏ vì chính lời giải thích của nó.
 */
function docMa(duong: string): string {
  return doc(duong)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((d) => d.replace(/\/\/[^\n]*$/, ""))
    .join("\n");
}

/** Bóc chú thích `#` của YAML — khối đầu workflow DẶN "KHÔNG đặt PROD_DATABASE_URL vào đây". */
function docYaml(duong: string): string {
  return doc(duong)
    .split(/\r?\n/)
    .map((d) => d.replace(/(^|\s)#.*$/, "$1"))
    .join("\n");
}

describe("[NTT-01] script báo cáo KHÔNG chứa một lệnh ghi nào", () => {
  const src = docMa(SCRIPT);

  it("không `create` / `update` / `delete` / `upsert` trên bất kỳ model nào", () => {
    // Neo vào HÌNH DẠNG lời gọi Prisma (`.<model>.<đt>(`), không vào chữ "create" trần —
    // `writeFileSync` và `new Map()` không được tính là ghi DB.
    const cam =
      /\.\w+\.(?:create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
    const thay = [...src.matchAll(cam)].map((m) => m[0]);
    expect(thay, `Lệnh ghi trong ${SCRIPT}: ${thay.join(", ")}`).toEqual([]);
  });

  it("không `$executeRaw` nào ngoài đúng câu `SET TRANSACTION READ ONLY`", () => {
    const raw = [...src.matchAll(/\$executeRaw(?:Unsafe)?`([^`]*)`/g)].map((m) => m[1]!.trim());
    expect(raw).toEqual(["SET TRANSACTION READ ONLY"]);
    // `$executeRawUnsafe`/`$queryRawUnsafe` bị cấm toàn repo; nhắc lại vì tệp này chạy trên PROD.
    expect(src).not.toContain("$executeRawUnsafe");
    expect(src).not.toContain("$queryRawUnsafe");
  });

  it("KHÔNG có cờ nào bật chế độ ghi", () => {
    // Một cờ thì lật được — kể cả lật nhầm. Tệp này không được có cờ để mà lật.
    expect(src).not.toMatch(/process\.argv/);
    expect(src).not.toMatch(/process\.env\.(?:APPLY|GHI|WRITE|CONFIRM)/);
  });
});

describe("[NTT-02] mọi truy vấn nằm TRONG transaction READ ONLY, và transaction luôn ROLLBACK", () => {
  const src = docMa(SCRIPT);

  it("mở transaction bằng `SET TRANSACTION READ ONLY`", () => {
    expect(src).toMatch(/await tx\.\$executeRaw`SET TRANSACTION READ ONLY`/);
  });

  it("thoát transaction bằng `throw`, không phải `return`", () => {
    // `$transaction` của Prisma CHỈ rollback khi callback NÉM (CLAUDE.md mục "Luật rollback":
    // `return` KHÔNG rollback). Ném một lỗi canh sẵn là cách bảo đảm không lượt nào commit được.
    expect(src).toMatch(/throw new Error\(KET\)/);
    expect(src).toMatch(/e\.message !== KET/);
  });

  it("KHÔNG truy vấn nào đi qua `db.` bên trong phần thân báo cáo — chỉ qua `tx.`", () => {
    // Truyền `db` vào một hàm chạy trong transaction là mở kết nối THỨ HAI nằm ngoài
    // `SET TRANSACTION READ ONLY` — phá đúng lớp khoá thứ hai mà không lỗi nào báo.
    //
    // Hai thành viên `db.` HỢP LỆ và chỉ hai: `$transaction` (chính nó) và `$disconnect`.
    // `kiemQuyen(db)` chạy TRƯỚC transaction nên không tính — nó là dòng tự khai ở đầu log.
    //
    // ⚠️ SOI TÊN THÀNH VIÊN, KHÔNG SOI HÌNH DẠNG LỜI GỌI. Bản đầu của ca này viết
    // `/\bdb\.\$?\w+\s*\(/` — đòi dấu `(` ngay sau — và **LỌT SẠCH** đúng ca quan trọng nhất.
    // Bước cấy chỉ ra hai lý do, cả hai đều đủ để vô hiệu hoá lưới:
    //   · `$queryRaw` là TAGGED TEMPLATE ⇒ sau nó là dấu backtick, không bao giờ là `(`;
    //   · giữa tên và lời gọi còn chen generic `<{ doc_duoc: boolean | null }[]>`.
    // Luật 11 đúng y nguyên: neo chuỗi HẸP NHẤT, và **chưa cấy thử thì coi như vô dụng**.
    const goiDb = [...src.matchAll(/\bdb\.(\$?\w+)/g)].map((m) => m[1]!);
    expect([...new Set(goiDb)].sort()).toEqual(["$disconnect", "$transaction"]);
  });
});

describe("[NTT-03] KHÔNG đọc một cột cá nhân nào", () => {
  const src = docMa(SCRIPT);

  // Báo cáo đi vào job summary + artifact ⇒ rời khỏi vòng kiểm soát của DB. Khác `[BCD-02]`
  // (che SĐT còn 4 số), báo cáo này KHÔNG ĐỌC cột cá nhân nào cả — nên lưới là "không có mặt",
  // chặt hơn "có che".
  const CAM = [
    "customerName",
    "customerPhone",
    "customerEmail",
    "invoiceEmail",
    "parentName",
    "fullName",
    "nationalId",
  ];

  for (const cot of CAM) {
    it(`không nhắc \`${cot}\``, () => {
      expect(src, `${SCRIPT} đang chạm cột cá nhân \`${cot}\``).not.toContain(cot);
    });
  }

  it("không `select` một trường `name` nào", () => {
    // `name: true` trong `select` là đường lôi tên người/tên con lên báo cáo.
    expect(src).not.toMatch(/\bname:\s*true/);
  });
});

describe("[NTT-04] DÙNG LẠI luật `đơn nào được tính`, không chép bản thứ hai", () => {
  const src = docMa(SCRIPT);

  it("lọc đơn bằng `locDonNhanTien()`", () => {
    expect(src).toContain('from "../lib/payments/don-nhan-tien"');
    expect(src).toContain("locDonNhanTien()");
  });

  it("KHÔNG gõ tay danh sách trạng thái đơn", () => {
    // Bản sao thứ hai của danh sách sẽ lệch đi khi ai đó thêm trạng thái mới — đúng lớp lỗi mà
    // `lib/payments/don-nhan-tien.ts` sinh ra để đóng (chú thích của nó kể 4 nhánh từng lệch).
    for (const tt of ["DRAFT", "CANCELLED", "REFUNDED"]) {
      expect(src, `${SCRIPT} đang gõ tay trạng thái \`${tt}\``).not.toContain(`"${tt}"`);
    }
  });

  it("in ra HẰNG đang chạy trong mã, không gõ lại con số", () => {
    // Báo cáo phải tự nói nó đang so với cái gì. Gõ "12" và "5" vào chuỗi là con số thứ hai,
    // và nó sẽ nói dối ngay lần đầu ai đó đổi hằng.
    expect(src).toContain('from "../lib/payments/ke-hoach-dot"');
    expect(src).toContain('from "../lib/orders/giam-gia-dong"');
    expect(src).toMatch(/\$\{TRAN_SO_DOT\}/);
    expect(src).toMatch(/\$\{TRAN_KHOAN_GIAM_MOI_DONG\}/);
  });
});

describe("[NTT-05] workflow — bốn lớp khoá còn nguyên", () => {
  const wf = docYaml(WORKFLOW);

  it("chỉ `workflow_dispatch`, chỉ nhánh `main`", () => {
    expect(wf).toMatch(/on:\s*\n\s*workflow_dispatch:/);
    expect(wf).not.toMatch(/\n\s*(push|pull_request|schedule):/);
    expect(wf).toMatch(/if: github\.ref == 'refs\/heads\/main'/);
  });

  it("KHÔNG biết tới secret đầy quyền", () => {
    // Lớp 3: file này chỉ được cầm chuỗi chỉ-đọc. Một tham chiếu `secrets.PROD_DATABASE_URL`
    // (không hậu tố `_RO`) nghĩa là ai đó vừa mở một đường ghi vào prod.
    //
    // ⚠️ Soi THAM CHIẾU SECRET, không soi cái TÊN — khối chú thích của workflow có một câu dặn
    // người vận hành *"KHÔNG đặt PROD_DATABASE_URL / PROD_DIRECT_URL vào đây"*. Cấm nhắc tên là
    // cấm luôn lời cảnh báo về chính cái tên đó (bẫy đã ăn một lần ở `[BCD-03]`).
    expect(wf).toContain("secrets.PROD_DATABASE_URL_RO");
    const thamChieu = [...wf.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]!);
    expect([...new Set(thamChieu)]).toEqual(["PROD_DATABASE_URL_RO"]);
  });

  it("không bước nào chạy migration / seed / deploy", () => {
    expect(wf).not.toMatch(/migrate deploy|migrate dev|db:seed|db push/);
  });

  it("artifact giữ đúng 3 ngày", () => {
    expect(wf).toMatch(/retention-days:\s*3/);
  });

  it("chạy đúng script của nó", () => {
    expect(wf).toContain(`tsx ${SCRIPT}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BƯỚC CẤY — luật 8: test canh lỗi chỉ được tin sau khi CẤY LẠI lỗi và thấy nó ĐỎ.
//
// Đã cấy 6 lỗi vào mã THẬT, chạy lại, rồi trả nguyên (22/09/2026). Mã sạch: 22/22 xanh.
//
//  1. `[NTT-01]` thêm `await tx.order.updateMany({ where: {}, data: {} });` vào `phan1`
//     → ĐỎ: `Lệnh ghi trong scripts/bao-cao-nguong-thanh-toan.ts: .order.updateMany(`
//  2. `[NTT-02]` đổi `throw new Error(KET)` thành `return`
//     → ĐỎ: `expected '…' to match /throw new Error\(KET\)/`
//  3. `[NTT-02]` đổi `tx.$queryRaw` của `kiemDocDuoc` thành `db.$queryRaw` (ra NGOÀI transaction)
//     → 🔴 **LỌT — lưới bản đầu KHÔNG ĐỎ.** Xem dưới.
//  4. `[NTT-03]` thêm `customerPhone: true` vào `select` của `phan3`
//     → ĐỎ: `đang chạm cột cá nhân \`customerPhone\``
//  5. `[NTT-04]` đổi `order: locDonNhanTien()` thành
//     `order: { deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED", "REFUNDED"] } }`
//     → ĐỎ: `đang gõ tay trạng thái \`DRAFT\``
//  6. `[NTT-05]` gỡ dòng `if: github.ref == 'refs/heads/main'` khỏi workflow
//     → ĐỎ: không khớp nhánh `main`
//
// ── CA 3 LÀ CA ĐÁNG GIÁ NHẤT, VÌ NÓ LỌT ──────────────────────────────────────
// Bản đầu viết `/\bdb\.\$?\w+\s*\(/` và trông rất thuyết phục: nó liệt kê đúng hai lời gọi
// `db.` hợp lệ, và nó XANH trên mã sạch. Nhưng cấy vào thì vẫn XANH — tức nó chưa bao giờ
// canh được gì. Hai lý do, mỗi lý do đủ để vô hiệu hoá nó:
//   · `$queryRaw` là TAGGED TEMPLATE ⇒ sau tên là dấu backtick, KHÔNG BAO GIỜ là `(`;
//   · giữa tên và lời gọi còn chen generic `<{ doc_duoc: boolean | null }[]>`.
// Sửa thành soi TÊN THÀNH VIÊN (`/\bdb\.(\$?\w+)/`) rồi so TẬP. Cấy lại ⇒
// `expected [ '$disconnect', '$queryRaw', …(1) ] to deeply equal [ '$disconnect', '$transaction' ]`.
//
// Bài học ghi lại vì nó sẽ tái diễn: **một lưới grep xanh trên mã sạch không nói gì cả.**
// Chỉ bước cấy phân biệt được "lỗi không còn" với "lưới không chạm tới lỗi" (luật 8 + 11).
//
// Output đỏ đầy đủ dán trong commit message.
// ═══════════════════════════════════════════════════════════════════════════
