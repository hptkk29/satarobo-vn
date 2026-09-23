// Ca [RBAC-CD-*] — BÁO CÁO RBAC CHẠY TRÊN PROD PHẢI KHÔNG CÓ ĐƯỜNG GHI NÀO.
//
// Cùng họ với `[BCD-*]` (`lib/finance/bao-cao-chi-doc.test.ts`) và cố ý chép cách làm chứ
// không chép nội dung: hai script đọc prod khác nhau, nhưng luật "không được ghi" thì một.
//
// ⚠️ VÌ SAO LÀ LƯỚI GHIM MÃ NGUỒN chứ không phải test hành vi: thứ cần khẳng định là "tệp này
// KHÔNG CHỨA" một loại lệnh. Không đầu vào nào chứng minh được điều đó — chạy nó nghìn lần
// với dữ liệu sạch vẫn không nói gì về nhánh chưa gọi tới. Chỉ văn bản mã nói được.
//
// Lưới này là LỚP THỨ NHẤT trong năm lớp (xem đầu `rbac-prod-chi-doc.yml`). Bốn lớp kia —
// READ ONLY + rollback, user chỉ-đọc, script tự khai quyền, và cổng "đọc được đúng bảng mình
// sắp đọc" — độc lập với nó.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT = "scripts/bao-cao-rbac-prod.ts";
const WORKFLOW = ".github/workflows/rbac-prod-chi-doc.yml";

function doc(duong: string): string {
  // `import.meta.url` trong cấu hình vitest của repo này KHÔNG phải URL `file://` nên
  // `fileURLToPath` ném — dùng `process.cwd()` (mẫu ở CLAUDE.md).
  return readFileSync(resolve(process.cwd(), duong), "utf8");
}

/** Bóc chú thích `//` và `/* *\/` — lưới phải soi MÃ, không soi lời kể về mã (luật 11). */
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
 * ⚠️ BẮT BUỘC, không phải cho gọn: chính khối chú thích đầu workflow DẶN *"KHÔNG đặt
 * PROD_DATABASE_URL / PROD_DIRECT_URL vào đây"* — lưới soi văn bản thô sẽ đỏ vì đúng câu dặn ấy.
 * Đây là bẫy đã cắn thật ở `[BCD-*]`, và cắn tôi thêm một lần nữa khi viết chính script này:
 * một phép `assert` trong lượt vá tự vấp vào chú thích *"`$queryRawUnsafe` BỊ CẤM"* của chính nó.
 */
function docYaml(duong: string): string {
  return doc(duong)
    .split(/\r?\n/)
    .map((d) => d.replace(/(^|\s)#.*$/, "$1"))
    .join("\n");
}

describe("[RBAC-CD-01] script báo cáo KHÔNG chứa một lệnh ghi nào", () => {
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
  });

  it("không biến thể `Unsafe` nào của raw query (cấm toàn repo)", () => {
    // Neo vào LỜI GỌI (`$…RawUnsafe<` hoặc `(`), KHÔNG vào chuỗi trần: chú thích trong script
    // có nhắc đúng tên đó để giải thích vì sao không dùng. Soi chuỗi trần là đỏ vì lời kể.
    const goi = [...src.matchAll(/\$(?:query|execute)RawUnsafe\s*[<(]/g)].map((m) => m[0]);
    expect(goi, `Lời gọi raw-unsafe: ${goi.join(", ")}`).toEqual([]);
  });

  it("KHÔNG có cờ nào bật chế độ ghi", () => {
    // Một cờ thì lật được — kể cả lật nhầm. Tệp này không được có cờ để mà lật.
    expect(src).not.toMatch(/process\.argv/);
    expect(src).not.toMatch(/process\.env\.(?:APPLY|GHI|WRITE)/);
  });

  it("mọi truy vấn nằm TRONG transaction READ ONLY, và transaction luôn ROLLBACK", () => {
    // `$transaction` của Prisma chỉ rollback khi callback NÉM (luật 7 ở CLAUDE.md). Ném một
    // lỗi canh sẵn là cách bảo đảm không lượt nào commit được.
    expect(src).toMatch(/await tx\.\$executeRaw`SET TRANSACTION READ ONLY`/);
    expect(src).toMatch(/throw new Error\(KET\)/);
    expect(src).toMatch(/e\.message !== KET/);
  });
});

describe("[RBAC-CD-02] cổng riêng: phải đọc được ĐÚNG bảng mình sắp đọc", () => {
  const src = docMa(SCRIPT);

  it("khai đủ 5 bảng script thật sự đọc", () => {
    // `_kiem-quyen.ts` dùng chung hỏi quyền trên `ClassSession` — tên bảng đóng cứng từ đợt
    // chấm công (nợ ghim ở CLAUDE.md). Script này KHÔNG đọc bảng đó, nên một mình `kiemQuyen`
    // không đủ: thiếu SELECT trên `RoleDef` thì báo cáo in "0 vai có quyền" và con số 0 ấy
    // KHÔNG phải sự thật.
    for (const bang of ["RoleDef", "RolePermission", "UserOrgRole", "User", "OrgUnit"]) {
      expect(src, `thiếu ${bang} trong BANG_CAN_DOC`).toMatch(
        new RegExp(`BANG_CAN_DOC[\\s\\S]{0,200}"${bang}"`),
      );
    }
  });

  it("thiếu quyền đọc thì DỪNG (exit 1), không in số 0 rồi đi tiếp", () => {
    expect(src).toMatch(/kiemBangDocDuoc\(\)/);

    // ⚠️ NEO VÀO CHÍNH KHỐI RẼ NHÁNH, không vào chuỗi `process.exitCode = 1` trần.
    //
    // Bản đầu của ca này soi chuỗi trần và **ĐÃ CHẾT** — đo được bằng phép cấy: gỡ hẳn
    // `process.exitCode = 1` khỏi cổng mà 15/15 ca vẫn XANH, vì chuỗi ấy còn một bản thứ hai
    // ở `main().catch()` cuối tệp. Đúng lớp lỗi của S-1 trong luật 14 (chuỗi có mặt ở dòng
    // `import` nên gỡ lời gọi vẫn xanh). Một lưới soi "có chuỗi X ở đâu đó" thì nói dối ngay
    // khi X xuất hiện hai lần vì hai lý do khác nhau.
    const khoi = src.match(/if \(!bang\.ok\) \{[\s\S]*?\n {2}\}/);
    expect(khoi, "không tìm thấy khối `if (!bang.ok)`").not.toBeNull();
    expect(khoi![0], "cổng thiếu-quyền-đọc phải đặt exitCode = 1").toMatch(/process\.exitCode = 1/);
    expect(khoi![0], "cổng phải DỪNG, không đi tiếp").toMatch(/\breturn;/);
  });
});

describe("[RBAC-CD-03] so với ĐỊNH NGHĨA TRONG MÃ, không với một danh sách chép tay", () => {
  const src = docMa(SCRIPT);

  it("đọc `ROLE_SEED` từ chính tệp seed", () => {
    // Chép tay danh sách vai/quyền vào script đo là dựng bản thứ hai của cùng một sự thật —
    // rồi hai bản lệch nhau âm thầm và báo cáo nói dối theo hướng trấn an.
    expect(src).toContain('from "../prisma/seed-roles"');
    expect(src).toContain("ROLE_SEED");
  });

  it("so CẢ scopeType, không chỉ so tên action", () => {
    // `zalocrm:use` GLOBAL và `zalocrm:use` CENTER là hai thứ khác hẳn: CENTER mà call-site
    // gọi trần thì `can()` trả FALSE ⇒ khoá trang. Bỏ vế scope là bỏ đúng lớp lỗi hay gặp.
    expect(src).toMatch(/scopeType/);
    expect(src).toMatch(/soLech/);
  });
});

describe("[RBAC-CD-04] che dữ liệu cá nhân — báo cáo rời khỏi vòng kiểm soát của DB", () => {
  const src = docMa(SCRIPT);

  it("không `select` họ tên người dùng", () => {
    // Báo cáo đi vào job summary + artifact. Đếm theo vai × đơn vị là đủ để quyết;
    // họ tên chỉ thêm rủi ro.
    const chonUser = src.match(/user\.findMany\(\{[\s\S]{0,200}?\}\)/);
    expect(chonUser, "không tìm thấy lời gọi user.findMany").not.toBeNull();
    expect(chonUser![0]).not.toMatch(/\bfullName\b|\bname:\s*true/);
  });

  it("email luôn đi qua hàm che", () => {
    expect(src).toMatch(/function cheEmail\(/);
    // Không được in `u.email` / `.email` trần vào báo cáo — mọi đường ra phải qua `cheEmail(`.
    const inTran = [...src.matchAll(/\$\{[^}]*\.email[^}]*\}/g)]
      .map((m) => m[0])
      .filter((s) => !s.includes("cheEmail("));
    expect(inTran, `email in trần: ${inTran.join(", ")}`).toEqual([]);
  });
});

describe("[RBAC-CD-05] workflow chỉ biết secret CHỈ-ĐỌC", () => {
  const yml = docYaml(WORKFLOW);

  it("KHÔNG biết tới secret đầy quyền", () => {
    // ⚠️ Soi THAM CHIẾU SECRET (`secrets.X`), KHÔNG soi cái TÊN. Bản đầu của ca này cấm chuỗi
    // `PROD_DIRECT_URL` và ĐỎ ngay — vì workflow có một câu `echo "::error::…"` dặn người vận
    // hành *"KHÔNG đặt PROD_DATABASE_URL / PROD_DIRECT_URL vào đây"*. Câu ấy nằm trong khối
    // `run:` nên bộ bóc chú thích YAML không gỡ, và cấm nhắc tên là cấm luôn lời cảnh báo về
    // chính cái tên đó.
    //
    // Bài học này đã được ghi sẵn ở ca anh em `[BCD-*]` (`lib/finance/bao-cao-chi-doc.test.ts`
    // dòng 136-138) — và tôi vẫn vấp lại khi viết ca này. Chép cách làm, đừng chép niềm tin.
    expect(yml).toContain("secrets.PROD_DATABASE_URL_RO");
    const thamChieu = [...yml.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]!);
    expect([...new Set(thamChieu)]).toEqual(["PROD_DATABASE_URL_RO"]);
  });

  it("không bước nào chạy migration / seed / deploy", () => {
    expect(yml).not.toMatch(/migrate deploy|migrate dev|db:seed|db push|seedRoles/);
  });

  it("chỉ chạy TAY — không `push` / `pull_request` / `schedule`", () => {
    // Neo vào khuôn `<xuống dòng><thụt lề>push:` — không bắt nhầm chữ "push" trong văn xuôi.
    expect(yml).not.toMatch(/\n\s*(push|pull_request|schedule):/);
  });

  it("chỉ chạy trên `main`", () => {
    // Báo cáo này để QUYẾT ĐỊNH có chạy seed hay không, nên nó phải so DB prod với `ROLE_SEED`
    // của đúng mã đang chạy trên prod. Chạy từ nhánh feature là báo "lệch" cho thứ không lệch.
    expect(yml).toMatch(/if:\s*github\.ref == 'refs\/heads\/main'/);
  });
});
