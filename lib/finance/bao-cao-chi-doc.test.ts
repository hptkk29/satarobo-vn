// Ca [BCD-*] — BÁO CÁO ĐỐI SOÁT CHẠY TRÊN PROD PHẢI KHÔNG CÓ ĐƯỜNG GHI NÀO.
//
// ─────────────────────────────────────────────────────────────────────────────
// Chủ dự án chốt 17/09/2026: *"script không có đường ghi nào khi chạy trong workflow (cờ
// --dry-run cứng, không tham số tắt)."*
//
// ⚠️ VÌ SAO LÀ LƯỚI GHIM MÃ NGUỒN chứ không phải test hành vi: thứ cần khẳng định là "tệp này
// KHÔNG CHỨA" một loại lệnh. Không có đầu vào nào chứng minh được điều đó — chạy nó một nghìn
// lần với dữ liệu sạch vẫn không nói gì về nhánh mà ta chưa gọi tới. Chỉ có văn bản mã nói được.
//
// Lưới này là LỚP THỨ NHẤT trong bốn lớp (xem đầu `doi-soat-tien-prod-chi-doc.yml`). Ba lớp kia
// — `SET TRANSACTION READ ONLY`, user chỉ-đọc, script tự khai quyền — độc lập với nó.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT = "scripts/bao-cao-doi-soat-tien.ts";
const WORKFLOW = ".github/workflows/doi-soat-tien-prod-chi-doc.yml";

function doc(duong: string): string {
  return readFileSync(resolve(process.cwd(), duong), "utf8");
}

/** Bóc chú thích `//` — lưới phải soi MÃ, không soi lời kể về mã (luật 11). */
function docMa(duong: string): string {
  return doc(duong)
    .split(/\r?\n/)
    .map((d) => d.replace(/\/\/[^\n]*$/, ""))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Bóc chú thích `#` của YAML.
 *
 * ⚠️ Cần vì chính khối chú thích đầu workflow DẶN *"KHÔNG đặt PROD_DATABASE_URL /
 * PROD_DIRECT_URL vào đây"* — lưới soi văn bản thô sẽ đỏ vì đúng câu dặn ấy.
 */
function docYaml(duong: string): string {
  return doc(duong)
    .split(/\r?\n/)
    .map((d) => d.replace(/(^|\s)#.*$/, "$1"))
    .join("\n");
}

describe("[BCD-01] script báo cáo KHÔNG chứa một lệnh ghi nào", () => {
  const src = docMa(SCRIPT);

  it("không `create` / `update` / `delete` / `upsert` trên bất kỳ model nào", () => {
    // Neo vào HÌNH DẠNG lời gọi Prisma (`.<model>.<đt>(`), không phải vào chữ "create" trần —
    // `writeFileSync` và `new Map()` không được tính là ghi DB.
    const cam =
      /\.\w+\.(?:create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
    const thay = [...src.matchAll(cam)].map((m) => m[0]);
    expect(thay, `Lệnh ghi trong ${SCRIPT}: ${thay.join(", ")}`).toEqual([]);
  });

  it("không `$executeRaw` nào ngoài đúng câu `SET TRANSACTION READ ONLY`", () => {
    const raw = [...src.matchAll(/\$executeRaw(?:Unsafe)?`([^`]*)`/g)].map((m) => m[1]!.trim());
    expect(raw).toEqual(["SET TRANSACTION READ ONLY"]);
    // `$executeRawUnsafe` bị cấm toàn repo; nhắc lại ở đây vì tệp này chạy trên PROD.
    expect(src).not.toContain("$executeRawUnsafe");
    expect(src).not.toContain("$queryRawUnsafe");
  });

  it("KHÔNG có cờ nào bật chế độ ghi", () => {
    // Một cờ thì lật được — kể cả lật nhầm. Tệp này không được có cờ để mà lật.
    //
    // ⚠️ Soi PHÉP ĐỌC THAM SỐ, không soi chuỗi `--apply`. Bản đầu của ca này soi chuỗi và ĐỎ
    // ngay, vì báo cáo có in một câu dặn *"đừng chạy `--apply` của script gắn con"* — bắt trúng
    // văn xuôi chứ không bắt mã. Lại đúng cái bẫy của luật 11.
    expect(src).not.toMatch(/process\.argv/);
    expect(src).not.toMatch(/process\.env\.(?:APPLY|GHI|WRITE)/);
  });

  it("mọi truy vấn nằm TRONG transaction READ ONLY, và transaction luôn ROLLBACK", () => {
    // `$transaction` của Prisma chỉ rollback khi callback NÉM (luật ở CLAUDE.md mục 7). Ném một
    // lỗi canh sẵn là cách bảo đảm không lượt nào commit được.
    expect(src).toMatch(/await tx\.\$executeRaw`SET TRANSACTION READ ONLY`/);
    expect(src).toMatch(/throw new Error\(KET\)/);
    expect(src).toMatch(/e\.message !== KET/);
  });

  it("DÙNG LẠI phép bóc SĐT của tầng đối khớp, không chép bản thứ hai", () => {
    // Bản thứ hai của luật đối khớp tiền là thứ repo đã trả giá nhiều lần: hai nơi quyết định
    // cùng một chuyện rồi lệch nhau âm thầm.
    expect(src).toContain('from "../lib/payments/sdt-trong-memo"');
    expect(src).toContain("extractVnPhoneCandidates(");
    // Và luật "đơn nào được nhận tiền" cũng dùng chung mảnh lọc.
    expect(src).toContain("locDonNhanTien()");
  });
});

describe("[BCD-02] che dữ liệu cá nhân — báo cáo rời khỏi vòng kiểm soát của DB", () => {
  const src = docMa(SCRIPT);

  it("KHÔNG in nội dung CK, KHÔNG in tên phụ huynh / tên con", () => {
    // `content` chỉ được ĐỌC để bóc SĐT; nó không được đi vào một dòng in nào.
    expect(src).toContain("extractVnPhoneCandidates(t.content)");
    expect(src).not.toMatch(/\$\{[^}]*\.content[^}]*\}/);
    expect(src).not.toMatch(/customerName|student:\s*\{\s*select:\s*\{\s*name/);
  });

  it("MỌI lần chạm `customerPhone` đều đi qua `cheSdt`", () => {
    // ⚠️ Bản đầu dùng một regex lookahead — nó khớp cả `${cheSdt(k.order.customerPhone)}` rồi đỏ
    // oan. ĐẾM hai vế mới là phép kiểm nói đúng điều cần nói: bao nhiêu lần chạm, bấy nhiêu lần
    // che (+1 cho dòng `customerPhone: true` trong `select`).
    expect(src).toMatch(/function cheSdt/);
    expect(src).toMatch(/sdt\.map\(cheSdt\)/);
    // Thứ cần canh là chỗ IN RA, không phải mọi chỗ chạm: `customerPhone: true` trong `select`
    // và `customerPhone: { in: bien }` trong `where` đều hợp lệ và không in gì. Nên soi đúng
    // các ô nội suy `${…}` — mỗi ô có `customerPhone` phải có `cheSdt` kèm theo.
    const oInRa = [...src.matchAll(/\$\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g)]
      .map((m) => m[1]!)
      .filter((x) => x.includes("customerPhone"));
    expect(oInRa.length, "không thấy ô nào in SĐT — lưới đang soi nhầm chỗ").toBeGreaterThan(0);
    for (const o of oInRa) {
      expect(o, `in SĐT trần: \${${o}}`).toContain("cheSdt(");
    }
  });
});

describe("[BCD-03] workflow — bốn lớp khoá còn nguyên", () => {
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
    // ⚠️ Soi THAM CHIẾU SECRET, không soi cái TÊN. Bản đầu cấm chuỗi `PROD_DIRECT_URL` và đỏ
    // ngay — vì workflow có một câu báo lỗi dặn người vận hành *"KHÔNG đặt PROD_DATABASE_URL /
    // PROD_DIRECT_URL vào đây"*. Cấm nhắc tên là cấm luôn lời cảnh báo về chính cái tên đó.
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
});
