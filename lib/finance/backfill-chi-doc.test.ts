// Ca [BFD-*] — CẶP WORKFLOW BACKFILL: bản xem trước KHÔNG được có đường ghi, bản ghi phải có cổng.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ VÌ SAO LÀ LƯỚI GHIM MÃ NGUỒN: thứ cần khẳng định là "tệp này KHÔNG CHỨA một loại lệnh".
// Không đầu vào nào chứng minh được điều đó — chạy nó nghìn lần với dữ liệu sạch vẫn không nói
// gì về nhánh chưa gọi tới. Chỉ văn bản mã nói được.
//
// Luật 11 áp dụng đủ: neo chuỗi HẸP NHẤT, bóc chú thích (chính chú thích của hai file NHẮC TÊN
// những thứ đang bị cấm), khẳng định cả SỐ LƯỢNG, và **chưa cấy thử thì coi như vô dụng**.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DRY = "scripts/backfill-orderitem-dry.ts";
const APPLY = "scripts/backfill-orderitem-apply.ts";
const WF_DRY = ".github/workflows/backfill-orderitem-dry.yml";
const WF_APPLY = ".github/workflows/backfill-orderitem-prod.yml";
const MODULE = "lib/finance/backfill-orderitem.ts";

const doc = (d: string) => readFileSync(resolve(process.cwd(), d), "utf8");

/** Bóc chú thích `//` — lưới phải soi MÃ, không soi lời kể về mã. */
const docMa = (d: string) =>
  doc(d)
    .split(/\r?\n/)
    .map((x) => x.replace(/\/\/[^\n]*$/, ""))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Bóc chú thích `#` của YAML.
 *
 * ⚠️ Cần vì khối chú thích đầu `backfill-orderitem-prod.yml` NHẮC TÊN
 * `PROD_DATABASE_URL_RO` để giải thích vì sao nó KHÔNG dùng chuỗi đó — lưới soi văn bản thô
 * sẽ đỏ vì đúng câu giải thích ấy.
 */
const docYaml = (d: string) =>
  doc(d)
    .split(/\r?\n/)
    .map((x) => x.replace(/(^|\s)#.*$/, "$1"))
    .join("\n");

const GHI = /\.\w+\.(?:create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\s*\(/g;

describe("[BFD-01] bản XEM TRƯỚC không chứa một lệnh ghi nào", () => {
  const src = docMa(DRY);

  it("không `create` / `update` / `delete` / `upsert` trên bất kỳ model nào", () => {
    // Neo vào HÌNH DẠNG lời gọi Prisma (`.<model>.<đt>(`), không phải chữ "update" trần —
    // `writeFileSync` không được tính là ghi DB.
    const thay = [...src.matchAll(GHI)].map((m) => m[0]);
    expect(thay, `Lệnh ghi trong ${DRY}: ${thay.join(", ")}`).toEqual([]);
  });

  it("KHÔNG đọc tham số dòng lệnh — không có cờ nào để lật", () => {
    expect(src).not.toMatch(/process\.argv/);
    expect(src).not.toMatch(/process\.env\.(?:APPLY|GHI|WRITE|CONFIRM)/);
  });

  it("KHÔNG import hàm GHI nào của module backfill", () => {
    // Bản xem trước chỉ được biết `quetKhoanCanGan`.
    expect(src).toContain("quetKhoanCanGan");

    // ⚠️ KHÔNG liệt kê tên hàm ghi bằng tay ở đây. Bản đầu viết
    // `expect(src).not.toContain("ganOrderItemChoDon")` — rồi đường ghi được viết lại thành
    // `ganOrderItemMotCau`, và ca này XANH VĨNH VIỄN trong khi nó không còn canh gì: một cái
    // tên đã chết thì `not.toContain` luôn đúng. Đúng lớp lỗi của bốn ca R7 hôm 17/09 (test
    // ghim luật đã bị đảo).
    //
    // Nay ĐỌC danh sách hàm ghi TỪ CHÍNH module, rồi đòi bản xem trước không nhắc cái nào. Đổi
    // tên hàm bao nhiêu lần cũng không làm lưới mù.
    const modul = docMa(MODULE);
    const hamGhi = [...modul.matchAll(/export async function (\w+)\(\s*\n?\s*tx: Tx/g)].map(
      (m) => m[1]!,
    );
    expect(
      hamGhi.length,
      "không tìm thấy hàm ghi nào trong module — lưới đang soi nhầm chỗ",
    ).toBeGreaterThan(0);
    for (const h of hamGhi) {
      expect(src, `bản xem trước KHÔNG được nhắc hàm ghi \`${h}\``).not.toContain(h);
    }
  });

  it("mọi truy vấn trong transaction READ ONLY, và transaction luôn ROLLBACK", () => {
    // `$transaction` của Prisma chỉ rollback khi callback NÉM (CLAUDE.md mục 7).
    const raw = [...src.matchAll(/\$executeRaw(?:Unsafe)?`([^`]*)`/g)].map((m) => m[1]!.trim());
    expect(raw).toEqual(["SET TRANSACTION READ ONLY"]);
    expect(src).toMatch(/throw new Error\(KET\)/);
    expect(src).toMatch(/e\.message !== KET/);
  });

  it("DÙNG LẠI phép bóc SĐT + mảnh lọc đơn, không chép bản thứ hai", () => {
    expect(src).toContain('from "../lib/payments/sdt-trong-memo"');
    expect(src).toContain("locDonNhanTien()");
  });

  it("KHÔNG in nội dung CK, KHÔNG in tên phụ huynh / tên con", () => {
    // ⚠️ ĐẾM số lần chạm `.content`, đừng chỉ chặn ô nội suy `${…content…}`.
    //
    // Bản đầu chỉ chặn ô nội suy, nên `in_(t.content)` trần — không có `${}` nào — LỌT sạch.
    // Cách duy nhất nói được điều cần nói là khai ra ĐÚNG những chỗ được phép chạm, rồi đếm:
    //   1. `extractVnPhoneCandidates(t.content)` — bóc SĐT;
    //   2. `.test(t.content ?? "")`              — đếm dạng `84…` cho MỤC 3;
    //   3. `content: true`                       — dòng `select` của câu tra.
    // Thêm chỗ thứ tư là ca này ĐỎ, và đó đúng là lúc phải đọc lại xem chỗ ấy có in ra không.
    const chamContent = [...src.matchAll(/\.content\b|content:\s*true/g)].map((m) => m[0]);
    expect(
      chamContent.length,
      `Số lần chạm nội dung CK trong ${DRY}: ${chamContent.join(", ")} — chỉ được 3 chỗ, xem chú thích`,
    ).toBe(3);
    expect(src).toContain("extractVnPhoneCandidates(t.content)");
    expect(src).not.toMatch(/customerName|itemName/);
  });
});

describe("[BFD-02] bản GHI — bốn cổng còn nguyên", () => {
  const src = docMa(APPLY);

  it("chỉ ghi qua hàm dùng chung, không có lệnh Prisma ghi nào viết tại chỗ", () => {
    // Câu UPDATE + AuditLog nằm ở MỘT chỗ (`lib/finance/backfill-orderitem.ts`). Một lệnh
    // `payment.updateMany` viết thẳng trong script là bản thứ hai của luật, và bản thứ hai là
    // chỗ hai bên lệch nhau âm thầm.
    const thay = [...src.matchAll(GHI)].map((m) => m[0]);
    expect(thay, `Lệnh ghi viết tại chỗ trong ${APPLY}: ${thay.join(", ")}`).toEqual([]);
    expect(src).toContain("ganOrderItemMotCau");
    expect(src).toContain("ghiAuditBackfill");
    // Và KHÔNG được có `$executeRaw`/`$queryRaw` riêng — SQL chỉ sống ở module dùng chung.
    expect(src).not.toMatch(/\$(?:execute|query)Raw/);
  });

  it("đòi ĐỦ HAI thứ gõ tay: `--confirm=BACKFILL-146` và `--expect=<N>`", () => {
    expect(src).toMatch(/const MA_XAC_NHAN = "BACKFILL-146"/);
    expect(src).toMatch(/--confirm=\$\{MA_XAC_NHAN\}/);
    expect(src).toMatch(/startsWith\("--expect="\)/);
    // Thiếu `--expect` mà có `--confirm` ⇒ phải CHẾT, không được âm thầm chạy tiếp.
    expect(src).toMatch(/coMa && soDuyet === null[\s\S]{0,300}process\.exit\(1\)/);
  });

  it("cổng SỐ DÒNG phải NÉM (không `return`) và đứng TRONG transaction, TRƯỚC audit", () => {
    // ⚠️ Đây là cổng quan trọng nhất của cả lệnh, và nó chỉ có tác dụng nếu:
    //   1. nó NÉM — `return` trong callback `$transaction` KHÔNG rollback (CLAUDE.md mục 7);
    //   2. nó đứng SAU câu UPDATE (để biết số dòng) nhưng TRƯỚC `ghiAuditBackfill` và trước
    //      commit.
    // Neo vào hình dạng câu lệnh, không vào chuỗi trần: `if (false && …)` phải làm ca này đỏ.
    expect(src).toMatch(/\n\s*if \(dong\.length !== soDuyet\) \{/);
    const iGate = src.indexOf("if (dong.length !== soDuyet)");
    const iUpdate = src.indexOf("ganOrderItemMotCau(tx)");
    const iAudit = src.indexOf("ghiAuditBackfill(tx");
    expect(iUpdate, "không thấy lời gọi UPDATE").toBeGreaterThan(0);
    expect(iGate, "không thấy cổng số dòng").toBeGreaterThan(iUpdate);
    expect(iAudit, "audit phải đứng SAU cổng").toBeGreaterThan(iGate);
    // Phải NÉM, và ném trong khoảng giữa cổng và audit.
    expect(src.slice(iGate, iAudit)).toMatch(/throw new Error\(LOI_LECH\)/);
    // Và KHÔNG được là `return` — bắt cả biến thể "sửa throw thành return" cho đúng lớp lỗi.
    expect(src.slice(iGate, iAudit)).not.toMatch(/\n\s*return[ ;]/);
  });

  it("KHÔNG còn ngưỡng lệch — khớp tuyệt đối hoặc rollback", () => {
    // Bản trước cho lệch tới 25 khoản. Chủ dự án chốt 18/09 bỏ hẳn nó; ca này canh để không ai
    // "nới cho dễ chạy" rồi một lượt ghi lệch bảng-đã-duyệt lọt qua.
    expect(src).not.toMatch(/NGUONG_LECH|Math\.abs\(/);
  });

  it("từ chối chạy nếu kết nối là CHỈ ĐỌC mà lại gõ chuỗi xác nhận", () => {
    // Bảo vệ ngược chiều: nếu workflow bị sửa sang secret chỉ-đọc thì script phải nói thẳng
    // "sai secret", thay vì mở transaction rồi đỏ ở câu UPDATE.
    expect(src).toMatch(/quyen\.ghiDuoc === false[\s\S]{0,300}process\.exit\(1\)/);
  });

  it("có bước NGHIỆM THU quét lại sau khi ghi", () => {
    const sauKhiGhi = src.slice(src.lastIndexOf("ghiAuditBackfill(tx"));
    expect(sauKhiGhi).toMatch(/quetKhoanCanGan\(db\)/);
    expect(sauKhiGhi).toMatch(/sau\.khoan\.length !== 0/);
  });
});

describe("[BFD-04] CHÍNH CÂU SQL — năm điều kiện, và chỉ đổi một cột", () => {
  // ⚠️ Lưới có giá trị nhất của cả bộ: nó canh cái câu THẬT SỰ ghi vào prod.
  //
  // Không test hành vi nào thay được ở đây — muốn chứng minh "câu này không đụng cột khác" thì
  // phải đọc câu ấy. Một test hành vi trên DB local chỉ nói được rằng với DỮ LIỆU ĐÓ nó không
  // đụng gì; nó không nói gì về một cột mà fixture chưa chạm tới.
  const src = docMa(MODULE);
  const sql = (() => {
    const m = src.match(/WITH mot_dong AS \(([\s\S]*?)`;/);
    expect(m, "không tách được câu SQL — lưới đang soi nhầm chỗ").not.toBeNull();
    return m![0];
  })();

  it("SET đúng MỘT cột `orderItemId`, không cột nào khác", () => {
    const set = [...sql.matchAll(/\n\s*SET\s+([^\n]+)/g)].map((m) => m[1]!.trim());
    expect(set, "phải có đúng một câu SET").toHaveLength(1);
    expect(set[0]).toBe('"orderItemId" = c."orderItemId"');
    // Không cột tiền / trạng thái / ghi danh nào xuất hiện ở vế SET.
    for (const cam of ["amount", "status", "accountantStatus", "saleStatus", "enrollmentId", "deletedAt"]) {
      expect(set[0], `vế SET không được chạm \`${cam}\``).not.toContain(cam);
    }
  });

  it("có ĐỦ NĂM điều kiện chủ dự án liệt kê + lọc `paymentType`", () => {
    expect(sql).toMatch(/p\."orderItemId" IS NULL/);
    expect(sql).toMatch(/p\."deletedAt" IS NULL/);
    expect(sql).toMatch(/o\."deletedAt" IS NULL/);
    expect(sql).toMatch(/o\."status" NOT IN \('DRAFT', 'CANCELLED', 'REFUNDED'\)/);
    expect(sql).toMatch(/HAVING COUNT\(\*\) = 1/);
    expect(sql).toMatch(/p\."paymentType" = 'PAYMENT'/);
  });

  it("dùng `$queryRaw` có RETURNING, KHÔNG dùng biến thể `Unsafe`", () => {
    expect(src).toMatch(/tx\.\$queryRaw</);
    expect(src).not.toContain("$queryRawUnsafe");
    expect(src).not.toContain("$executeRawUnsafe");
    expect(sql).toMatch(/RETURNING/);
  });

  it("`ghiAuditBackfill` ghi MỘT dòng mỗi ĐƠN, trong transaction được truyền vào", () => {
    const h = src.slice(src.indexOf("export async function ghiAuditBackfill"));
    expect(h, "phải gom theo orderId trước khi ghi").toMatch(/theoDon\.set\(d\.orderId/);
    expect(h).toMatch(/writeAudit\(\{\s*\n?\s*tx,/);
    expect(h).toMatch(/entityType: "Order"/);
    expect(h).toMatch(/changedFields: \["orderItemId"\]/);
  });
});

describe("[BFD-03] hai workflow — hai secret, không lẫn nhau", () => {
  const dry = docYaml(WF_DRY);
  const ap = docYaml(WF_APPLY);

  it("bản xem trước CHỈ biết secret chỉ-đọc", () => {
    // Soi THAM CHIẾU secret, không soi cái TÊN: chú thích của file nhắc tên các secret đầy
    // quyền để giải thích vì sao nó không dùng chúng.
    const t = [...new Set([...dry.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]!))];
    expect(t).toEqual(["PROD_DATABASE_URL_RO"]);
  });

  it("bản GHI KHÔNG được cầm chuỗi chỉ-đọc (tên nói dối) và không cầm thêm secret nào khác", () => {
    const t = [...new Set([...ap.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]!))];
    expect(t).toEqual(["PROD_DIRECT_URL"]);
  });

  it("cả hai: chỉ `workflow_dispatch`, chỉ nhánh `main`", () => {
    for (const [ten, wf] of [
      [WF_DRY, dry],
      [WF_APPLY, ap],
    ] as const) {
      expect(wf, ten).toMatch(/on:\s*\n\s*workflow_dispatch:/);
      expect(wf, ten).not.toMatch(/\n\s*(push|pull_request|schedule):/);
      expect(wf, ten).toMatch(/if: github\.ref == 'refs\/heads\/main'/);
    }
  });

  it("bước GHI bị gác bằng `inputs.xac_nhan` VÀ truyền đủ hai cờ", () => {
    expect(ap).toMatch(/if: inputs\.xac_nhan == 'BACKFILL-146'/);
    // Một bước `if:` đúng mà gọi script thiếu cờ thì script chỉ chạy XEM TRƯỚC, và người bấm
    // tưởng đã ghi. Soi từng cờ riêng — KHÔNG neo cả chuỗi lệnh liền mạch: lệnh có ngắt dòng
    // `\` và thứ tự cờ đổi được, nên một regex một-dòng vừa mong manh vừa đỏ oan (đã xảy ra).
    const buocGhi = ap.slice(ap.indexOf("2) GẮN THẬT"));
    expect(buocGhi).toMatch(/backfill-orderitem-apply\.ts/);
    expect(buocGhi).toMatch(/--confirm=BACKFILL-146/);
    expect(buocGhi, "phải truyền số đã duyệt, kẻo cổng số dòng không có gì để so").toMatch(
      /--expect=\$\{\{ inputs\.so_da_duyet \}\}/,
    );
    // Và input ấy phải TỒN TẠI + được kiểm rỗng trước khi gọi script.
    expect(ap).toMatch(/so_da_duyet:/);
    expect(buocGhi).toMatch(/-n "\$\{\{ inputs\.so_da_duyet \}\}"/);
  });

  it("KHÔNG workflow nào ở đây chạy migration / seed / deploy", () => {
    for (const [ten, wf] of [
      [WF_DRY, dry],
      [WF_APPLY, ap],
    ] as const) {
      expect(wf, ten).not.toMatch(/migrate deploy|migrate dev|db:seed|db push/);
    }
  });

  it("bản xem trước giữ artifact đúng 3 ngày", () => {
    expect(dry).toMatch(/retention-days:\s*3/);
  });
});
