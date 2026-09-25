// Ca [HDG0-*] — BÁO CÁO GĐ 0 CỦA MÀN HOÁ ĐƠN CHẠY TRÊN PROD PHẢI KHÔNG CÓ ĐƯỜNG GHI NÀO.
//
// Báo cáo chỉ-đọc THỨ BA chạy trên prod (sau `[BCD-*]` và `[NTT-*]`) ⇒ cùng bốn lớp khoá, chép
// khuôn `bao-cao-nguong-thanh-toan.test.ts`. Không gộp vào bộ đó vì mỗi bộ neo cứng một tệp.
//
// Khác biệt duy nhất về RỦI RO so với hai báo cáo trước: tệp này ĐỌC `Payment.note` — cột duy
// nhất chứa marker nối khoản thu với giao dịch ngân hàng. Ghi chú do người gõ có thể chứa tên,
// SĐT phụ huynh. Nên thêm ca `[HDG0-03]` "note chỉ được đưa vào hàm phân loại".
//
// ⚠️ LƯỚI GHIM MÃ NGUỒN (luật 11): bóc chú thích trước · neo chuỗi HẸP · không cờ `/s` · khẳng
// định SỐ LẦN khớp. Đã cấy thử — xem khối "BƯỚC CẤY" cuối tệp.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT = "scripts/bao-cao-hoa-don-gd0.ts";
const WORKFLOW = ".github/workflows/hoa-don-prod-chi-doc.yml";

function doc(duong: string): string {
  return readFileSync(resolve(process.cwd(), duong), "utf8");
}

/** Bóc khối `/* *\/` TRƯỚC rồi mới `//` — lý do ở `bao-cao-nguong-thanh-toan.test.ts`. */
function docMa(duong: string): string {
  return doc(duong)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((d) => d.replace(/\/\/[^\n]*$/, ""))
    .join("\n");
}

function docYaml(duong: string): string {
  return doc(duong)
    .split(/\r?\n/)
    .map((d) => d.replace(/(^|\s)#.*$/, "$1"))
    .join("\n");
}

describe("[HDG0-01] script KHÔNG chứa một lệnh ghi nào", () => {
  const src = docMa(SCRIPT);

  it("không `create` / `update` / `delete` / `upsert` trên bất kỳ model nào", () => {
    const cam =
      /\.\w+\.(?:create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
    const thay = [...src.matchAll(cam)].map((m) => m[0]);
    expect(thay, `Lệnh ghi trong ${SCRIPT}: ${thay.join(", ")}`).toEqual([]);
  });

  it("không `$executeRaw` nào ngoài đúng câu `SET TRANSACTION READ ONLY`", () => {
    const raw = [...src.matchAll(/\$executeRaw(?:Unsafe)?`([^`]*)`/g)].map((m) => m[1]!.trim());
    expect(raw).toEqual(["SET TRANSACTION READ ONLY"]);
    expect(src).not.toContain("$executeRawUnsafe");
    expect(src).not.toContain("$queryRawUnsafe");
  });

  it("KHÔNG có cờ nào bật chế độ ghi", () => {
    expect(src).not.toMatch(/process\.argv/);
    expect(src).not.toMatch(/process\.env\.(?:APPLY|GHI|WRITE|CONFIRM)/);
  });
});

describe("[HDG0-02] mọi truy vấn nằm TRONG transaction READ ONLY, và transaction luôn ROLLBACK", () => {
  const src = docMa(SCRIPT);

  it("mở transaction bằng `SET TRANSACTION READ ONLY`", () => {
    expect(src).toMatch(/await tx\.\$executeRaw`SET TRANSACTION READ ONLY`/);
  });

  it("thoát transaction bằng `throw`, không phải `return`", () => {
    expect(src).toMatch(/throw new Error\(KET\)/);
    expect(src).toMatch(/e\.message !== KET/);
  });

  it("chỉ hai thành viên `db.` hợp lệ: `$transaction` và `$disconnect`", () => {
    // Soi TÊN THÀNH VIÊN, không soi hình dạng lời gọi — `$queryRaw` là tagged template nên sau
    // tên là backtick chứ không phải `(` (bẫy đã lọt ở bản đầu của `[NTT-02]`).
    const goiDb = [...src.matchAll(/\bdb\.(\$?\w+)/g)].map((m) => m[1]!);
    expect([...new Set(goiDb)].sort()).toEqual(["$disconnect", "$transaction"]);
  });
});

describe("[HDG0-03] KHÔNG in dữ liệu cá nhân", () => {
  const src = docMa(SCRIPT);

  const CAM = [
    "customerName",
    "customerPhone",
    "customerEmail",
    "invoiceEmail",
    "invoiceBuyerName",
    "invoiceTaxCode",
    "customerAddress",
    "parentName",
    "fullName",
    "nationalId",
    "content", // BankTransaction.content = nội dung CK, có tên + SĐT
    "rawPayload",
  ];
  for (const cot of CAM) {
    it(`không nhắc \`${cot}\``, () => {
      expect(src, `${SCRIPT} đang chạm cột cá nhân \`${cot}\``).not.toMatch(new RegExp(`\\b${cot}\\b`));
    });
  }

  it("không `select` một trường `name` / `email` / `phone` nào", () => {
    expect(src).not.toMatch(/\b(?:name|email|phone):\s*true/);
  });

  it("`note` chỉ được đưa vào `nguonGiaoDich(...)`, không đi đâu khác", () => {
    // Ghi chú người gõ có thể chứa tên, SĐT. Chỗ dùng HỢP LỆ duy nhất: phân loại marker.
    // Đếm mọi lần nhắc `.note` rồi so với số lần nằm trong đúng lời gọi đó.
    const moiLan = [...src.matchAll(/\.note\b/g)].length;
    const hopLe = [...src.matchAll(/nguonGiaoDich\(\w+\.note\)/g)].length;
    expect(moiLan, "có chỗ dùng `.note` ngoài lời gọi phân loại").toBe(hopLe);
    expect(hopLe).toBe(1);
    // `select` có `note: true` đúng MỘT lần (docKhoan).
    expect([...src.matchAll(/\bnote:\s*true/g)].length).toBe(1);
  });

  it("`userId` chỉ dùng để đếm — chặn HAI đường in hay gặp (không phải chứng minh luồng dữ liệu)", () => {
    // ⚠️ Nói thật giới hạn của lưới này: grep mã không theo dõi được luồng dữ liệu. Bản đầu chỉ
    // soi TÊN biến (`userId`/`uid`…) và phép cấy 25/09 lọt: `${[...giuXacNhan.keys()].join(",")}`
    // in thẳng mọi userId mà không ca nào đỏ, vì Map khoá bằng userId lại mang tên khác.
    // Bản này chặn thêm `.keys()` (script không có lý do nào để liệt kê KHOÁ của một Map ra
    // báo cáo). Vẫn còn đường lọt (`[...m].map(([u]) => u)`) — userId là id nội bộ, không phải
    // PII của khách, nên chấp nhận mức canh này thay vì dựng lưới hành vi cần DB.
    const noiSuy = [...src.matchAll(/\$\{[^}]*(?:userId|recordedById|uid)[^}]*\}/g)].map((m) => m[0]);
    expect(noiSuy).toEqual([]);
    expect(src).not.toMatch(/\.keys\(\)/);
  });
});

describe("[HDG0-04] DÙNG LẠI định nghĩa có chủ, không chép bản thứ hai", () => {
  const src = docMa(SCRIPT);

  it("nguồn giao dịch + số ròng đi qua `lib/finance/hoa-don/nguon-khoan`", () => {
    expect(src).toContain('from "../lib/finance/hoa-don/nguon-khoan"');
    expect(src).toMatch(/soTienRong\(/);
    expect(src).toMatch(/nguonGiaoDich\(/);
  });

  it("'đã xác nhận' đi qua hàm của lib/finance/debt, KHÔNG gõ tay trạng thái đó", () => {
    expect(src).toContain('from "../lib/finance/debt"');
    expect(src).toMatch(/laKhoanDaXacNhan\(/);
    // Toàn văn tệp (kể cả chú thích) — đúng hình dạng lưới `truc-a` soi.
    expect(doc(SCRIPT)).not.toMatch(/"CONFIRMED"/);
  });

  it("KHÔNG tự dò marker bằng `includes(\"[auto:` / regex riêng", () => {
    // Dò marker ở đây là bản thứ hai của `nguonGiaoDich`; nó sẽ lệch khi đường ghi đổi marker.
    expect(src).not.toMatch(/\[auto:/);
    expect(src).not.toMatch(/\[gan-tay:/);
    expect(src).not.toMatch(/\[backfill-import\]/);
  });
});

describe("[HDG0-05] workflow — bốn lớp khoá còn nguyên", () => {
  const wf = docYaml(WORKFLOW);

  it("chỉ `workflow_dispatch` — không tự chạy theo push/PR/lịch", () => {
    expect(wf).toMatch(/on:\s*\n\s*workflow_dispatch:/);
    expect(wf).not.toMatch(/\n\s*(push|pull_request|schedule):/);
  });

  it("chỉ chạy được từ `main` hoặc `test`, KHÔNG nhánh nào khác", () => {
    const dieuKien = wf.match(/if:\s*(.+)/)?.[1] ?? "";
    expect(dieuKien, "workflow mất điều kiện `if` — mọi nhánh chạy được").not.toBe("");
    const nhanh = [...dieuKien.matchAll(/refs\/heads\/([\w-]+)/g)].map((m) => m[1]!);
    expect([...new Set(nhanh)].sort()).toEqual(["main", "test"]);
    expect(dieuKien).toContain("||");
    expect(dieuKien).not.toContain("&&");
  });

  it("báo cáo tự in nhánh nó chạy", () => {
    expect(docMa(SCRIPT)).toMatch(/GITHUB_REF_NAME/);
  });

  it("KHÔNG biết tới secret đầy quyền", () => {
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

describe("[HDG0-06] đường chạy THẬT hôm nay — mượn nút 'Ngưỡng thanh toán · PROD · ĐỌC'", () => {
  // GitHub chỉ nhận lệnh chạy tay cho workflow đã từng có mặt trên `main`; tệp riêng của báo
  // cáo này chưa lên `main` (HTTP 404, 25/09/2026) ⇒ chủ dự án chọn mượn nút đã đăng ký.
  // Bộ `[HDG0-05]` canh tệp riêng (dùng về sau); bộ này canh đường đang dùng thật.
  const MUON = ".github/workflows/nguong-thanh-toan-prod-chi-doc.yml";
  const wf = docYaml(MUON);

  it("có lựa chọn `hoa-don-gd0`, và MẶC ĐỊNH vẫn là báo cáo ngưỡng cũ", () => {
    expect(wf).toMatch(/type:\s*choice/);
    expect(wf).toMatch(/default:\s*nguong-thanh-toan\s*\n/);
    const luaChon = [...wf.matchAll(/^\s*-\s*(nguong-thanh-toan|hoa-don-gd0)\s*$/gm)].map((m) => m[1]);
    expect(luaChon).toEqual(["nguong-thanh-toan", "hoa-don-gd0"]);
  });

  it("`hoa-don-gd0` chạy ĐÚNG script này, qua biến env — không nội suy input vào `run`", () => {
    expect(wf).toContain(`hoa-don-gd0) pnpm exec tsx ${SCRIPT} ;;`);
    expect(wf).toMatch(/BAO_CAO:\s*\$\{\{\s*inputs\.bao_cao\s*\}\}/);
    // Không một dòng `run` nào nội suy thẳng `${{ inputs.… }}`.
    const runNoiSuy = wf.split(/\r?\n/).filter((d) => /\brun:.*\$\{\{\s*inputs\./.test(d));
    expect(runNoiSuy).toEqual([]);
  });

  it("lựa chọn lạ thì ĐỎ, không rơi về báo cáo mặc định", () => {
    expect(wf).toMatch(/\*\)\s*echo "::error::[^"]*";\s*exit 1\s*;;/);
  });

  it("vẫn chỉ biết secret CHỈ-ĐỌC — mượn nút không mở thêm đường ghi", () => {
    const thamChieu = [...wf.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]!);
    expect([...new Set(thamChieu)]).toEqual(["PROD_DATABASE_URL_RO"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BƯỚC CẤY — luật 14: lưới chỉ được tin sau khi CẤY LẠI lỗi và thấy nó ĐỎ.
// Kết quả cấy ghi ở commit message của tệp này (xem `git log -- lib/finance/bao-cao-hoa-don-gd0.test.ts`).
// ═══════════════════════════════════════════════════════════════════════════
