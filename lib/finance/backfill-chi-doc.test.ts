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

  it("KHÔNG import hàm GHI của module backfill", () => {
    // `ganOrderItemChoDon` là đường ghi duy nhất. Bản xem trước chỉ được biết `quetKhoanCanGan`.
    expect(src).toContain("quetKhoanCanGan");
    expect(src).not.toContain("ganOrderItemChoDon");
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

describe("[BFD-02] bản GHI — ba cổng còn nguyên", () => {
  const src = docMa(APPLY);

  it("chỉ ghi qua `ganOrderItemChoDon`, không có lệnh Prisma ghi nào viết tại chỗ", () => {
    // Điều kiện gắn + AuditLog nằm ở MỘT chỗ (`lib/finance/backfill-orderitem.ts`). Một lệnh
    // `payment.updateMany` viết thẳng trong script là một bản thứ hai của luật, và bản thứ hai
    // là chỗ hai bên lệch nhau âm thầm.
    const thay = [...src.matchAll(GHI)].map((m) => m[0]);
    expect(thay, `Lệnh ghi viết tại chỗ trong ${APPLY}: ${thay.join(", ")}`).toEqual([]);
    expect(src).toContain("ganOrderItemChoDon");
  });

  it("đòi ĐÚNG chuỗi xác nhận `BACKFILL-146`", () => {
    expect(src).toMatch(/const MA_XAC_NHAN = "BACKFILL-146"/);
    // Không có chuỗi ⇒ `apply` false ⇒ thoát sớm trước mọi lệnh ghi.
    expect(src).toMatch(/if \(!apply\)/);
  });

  it("có cổng NGƯỠNG LỆCH và nó `process.exit(1)` trước khi ghi", () => {
    expect(src).toMatch(/NGUONG_LECH/);
    // ⚠️ Neo vào LỜI GỌI `ganOrderItemChoDon(tx` — KHÔNG phải chuỗi `ganOrderItemChoDon` trần.
    // Bản đầu dùng `indexOf("ganOrderItemChoDon")` và nó trúng dòng **import** ở đầu tệp, nên
    // "phần trước lời gọi ghi" chỉ còn mấy dòng import và ca ĐỎ oan. Luật 11: neo chuỗi HẸP
    // NHẤT — và bước cấy/chạy là thứ duy nhất chỉ ra chuyện này.
    const iGoi = src.indexOf("ganOrderItemChoDon(tx");
    expect(iGoi, "không tìm thấy lời gọi ghi — lưới đang soi nhầm chỗ").toBeGreaterThan(0);
    const truoc = src.slice(0, iGoi);
    // ⚠️ Neo vào HÌNH DẠNG CÂU LỆNH `if (lech > NGUONG_LECH) {`, không phải chuỗi
    // `lech > NGUONG_LECH` trần: bước cấy cho thấy `if (false && lech > NGUONG_LECH)` vẫn
    // chứa đúng chuỗi trần ⇒ lưới xanh trong khi cổng đã chết. Đây là lỗ thật của bản đầu,
    // không phải một ca cấy sai.
    expect(truoc, "cổng ngưỡng lệch phải là một nhánh SỐNG").toMatch(
      /\n\s*if \(lech > NGUONG_LECH\) \{/,
    );
    expect(
      truoc,
      "cổng ngưỡng lệch phải `process.exit(1)` TRƯỚC lời gọi ghi đầu tiên",
    ).toMatch(/if \(lech > NGUONG_LECH\) \{[\s\S]{0,400}process\.exit\(1\)/);
  });

  it("từ chối chạy nếu kết nối là CHỈ ĐỌC mà lại gõ chuỗi xác nhận", () => {
    // Bảo vệ ngược chiều: nếu workflow bị sửa thành dùng secret chỉ-đọc thì script phải nói
    // thẳng "sai secret", thay vì chạy 120 transaction rồi đỏ ở dòng đầu tiên.
    expect(src).toMatch(/apply && quyen\.ghiDuoc === false/);
  });

  it("có bước NGHIỆM THU quét lại sau khi ghi", () => {
    const sauKhiGhi = src.slice(src.lastIndexOf("ganOrderItemChoDon(tx"));
    expect(sauKhiGhi).toMatch(/quetKhoanCanGan\(db\)/);
    expect(sauKhiGhi).toMatch(/sau\.khoan\.length !== 0/);
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

  it("bước GHI của bản GHI bị gác bằng `inputs.xac_nhan`", () => {
    expect(ap).toMatch(/if: inputs\.xac_nhan == 'BACKFILL-146'/);
    // Và lệnh ghi thật phải mang cờ xác nhận — một bước `if:` đúng mà gọi script không cờ thì
    // nó chỉ chạy xem trước, và người bấm tưởng đã ghi.
    expect(ap).toMatch(/backfill-orderitem-apply\.ts --confirm=BACKFILL-146/);
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
