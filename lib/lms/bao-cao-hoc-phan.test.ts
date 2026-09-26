// Ca [BHP-*] — BÁO CÁO HỌC PHẦN chạy trên PROD phải CHỈ ĐỌC. Thuần, không DB.
//
// 🔴 Chủ dự án 26/09/2026: *"đo thông qua workflow chỉ đọc kia đi, tôi cho phép chỉ đọc"*.
//
// ⚠️ Cho phép CHỈ ĐỌC là một giới hạn, không phải một lời chúc. Thứ biến nó thành giới hạn
// thật là bốn lớp khoá dưới đây — và chúng chép nguyên lý lẽ từ `[BCD-*]`
// (`lib/finance/bao-cao-chi-doc.test.ts`), bộ ca đã canh báo cáo đối soát tiền:
//
//   1. script KHÔNG chứa một lệnh ghi nào;
//   2. mọi truy vấn nằm trong `SET TRANSACTION READ ONLY` và transaction LUÔN rollback —
//      Postgres tự từ chối, không phụ thuộc vào việc người viết có nhớ hay không;
//   3. workflow CHỈ biết tới chuỗi chỉ-đọc, chỉ `workflow_dispatch`, chỉ nhánh `main`;
//   4. báo cáo KHÔNG chở dữ liệu cá nhân ra khỏi vòng kiểm soát của DB.
//
// ⚠️ Vì sao lớp 1 KHÔNG thừa dù đã có lớp 2: `SET TRANSACTION READ ONLY` chỉ chặn được khi
// lời gọi nằm TRONG transaction. Một `db.lesson.updateMany(...)` gõ ngoài `$transaction` đi
// thẳng ra prod. Hai lớp canh hai đường khác nhau.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT = "scripts/bao-cao-hoc-phan.ts";
const WORKFLOW = ".github/workflows/hoc-phan-prod-chi-doc.yml";

const doc = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * Bỏ chú thích TRƯỚC khi soi — chính khối giải thích ở đầu script có chứa các chuỗi đang
 * cấm (`upsert`, `update`, `create`). Bài học lặp lại ba lần trong repo (luật 11).
 */
function boChuThich(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("[BHP-01] script KHÔNG chứa một lệnh ghi nào", () => {
  const ma = boChuThich(doc(SCRIPT));

  it.each(["create", "createMany", "update", "updateMany", "delete", "deleteMany", "upsert"])(
    "không `.%s(` trên bất kỳ model nào",
    (lenh) => {
      // Neo vào `.<lệnh>(` chứ không vào chữ trần: `createdAt` chứa "create", và một ca cấm
      // chữ trần sẽ đỏ oan ngay lần đầu ai đó `select: { createdAt: true }`.
      expect(ma.match(new RegExp(`\\.${lenh}\\(`, "g")) ?? [], `script gọi .${lenh}(`).toHaveLength(
        0,
      );
    },
  );

  it("không `$executeRaw` nào ngoài đúng câu `SET TRANSACTION READ ONLY`", () => {
    const raw = [...ma.matchAll(/\$executeRaw(?:Unsafe)?`([^`]*)`/g)].map((m) => m[1]!.trim());
    expect(raw).toEqual(["SET TRANSACTION READ ONLY"]);
    // `$executeRawUnsafe` là đường vòng qua chính phép kiểm trên — cấm hẳn.
    expect(ma).not.toMatch(/\$executeRawUnsafe/);
  });

  it("không `$queryRawUnsafe` (đường vòng + lỗ SQL injection)", () => {
    expect(ma).not.toMatch(/\$queryRawUnsafe/);
  });
});

describe("[BHP-02] mọi truy vấn nằm TRONG transaction READ ONLY, và nó LUÔN rollback", () => {
  const ma = boChuThich(doc(SCRIPT));

  it("mở transaction, đặt READ ONLY, rồi NÉM để rollback", () => {
    expect(ma).toMatch(/\$transaction\(/);
    expect(ma).toMatch(/SET TRANSACTION READ ONLY/);
    // ⚠️ Phép ném là thứ DUY NHẤT làm transaction rollback — Prisma commit khi callback trả
    // về bình thường. Gỡ dòng `throw` là mọi lượt chạy commit, và lớp khoá 2 biến mất mà
    // không ai thấy.
    expect(ma).toMatch(/throw new Error\(KET\)/);
    expect(ma).toMatch(/const KET = /);
  });

  it("mọi lời gọi model đi qua `tx.`, KHÔNG có lời gọi `db.<model>.` nào", () => {
    // ⚠️ Đây là ca bắt đúng lỗ mà lớp 2 KHÔNG bịt được: một câu tra gõ `db.lesson…` nằm
    // NGOÀI transaction thì `SET TRANSACTION READ ONLY` không với tới nó.
    //
    // `db.$transaction` và `db.$disconnect` là hai ngoại lệ hợp lệ — chúng không phải model.
    // ⚠️ `$` KHÔNG phải ký tự `\w`. Bản đầu viết `/\bdb\.(\w+)/` và khớp RỖNG — khi ấy ca
    //    này ĐẠT vì lý do sai, trên MỌI mã. Chính lượt chạy đầu tiên bắt được
    //    (`expected [] to equal [...]`), và đó là lý do ca khẳng định TẬP BẰNG NHAU chứ
    //    không khẳng định "không có gì".
    const goiDb = [...ma.matchAll(/\bdb\.(\$?\w+)/g)].map((m) => m[1]!);
    expect([...new Set(goiDb)].sort()).toEqual(["$disconnect", "$transaction"]);
  });

  it("có trần thời gian tường minh — transaction ĐỌC qua WAN không bị cắt giữa đường", () => {
    // Trần mặc định của transaction tương tác là 5 giây. Bản sao thiếu đúng thứ này ở
    // `backfill-orderitem-dry.ts` đã chết `P2028` ngay lượt chạy prod đầu tiên.
    expect(ma).toMatch(/timeout:\s*\d/);
  });
});

/**
 * Bỏ chú thích YAML (dòng bắt đầu bằng `#`) TRƯỚC khi soi tham chiếu secret.
 *
 * ⚠️ Lý do ĐO ĐƯỢC, không phải phòng xa: workflow này có một dòng chú thích dặn người sau
 * *"một tham chiếu `secrets.PROD_DATABASE_URL` nghĩa là ai đó vừa mở một đường ghi"* — và
 * lượt chạy ĐẦU TIÊN của ca bên dưới đã ĐỎ vì bắt đúng câu cảnh báo ấy. Bản mẫu `[BCD-03]`
 * né bằng cách đổi CÂU CHỮ; bỏ chú thích thì bền hơn, vì lần sửa chú thích sau không phá
 * được lưới.
 */
function boChuThichYaml(src: string): string {
  return src
    .split(/\r?\n/)
    .filter((d) => !/^\s*#/.test(d))
    .join("\n");
}

describe("[BHP-03] workflow — bốn lớp khoá còn nguyên", () => {
  const wf = boChuThichYaml(doc(WORKFLOW));

  it("chỉ `workflow_dispatch`, chỉ nhánh `main`", () => {
    expect(wf).toMatch(/on:\s*\n\s*workflow_dispatch:/);
    expect(wf).not.toMatch(/\n\s*(push|pull_request|schedule):/);
    // ⚠️ Không phải thủ tục: phần D đối chiếu prod với `lib/lms/curriculum-sata.ts`. Chạy từ
    // nhánh feature là so prod với một nguồn CHƯA merge, và độ lệch in ra sẽ sai.
    expect(wf).toMatch(/if: github\.ref == 'refs\/heads\/main'/);
  });

  it("KHÔNG biết tới secret đầy quyền", () => {
    // ⚠️ Soi THAM CHIẾU secret, không soi cái TÊN — workflow có quyền dặn người vận hành
    // "đừng đặt chuỗi đầy quyền vào đây", và cấm nhắc tên là cấm luôn lời cảnh báo ấy.
    expect(wf).toContain("secrets.PROD_DATABASE_URL_RO");
    const thamChieu = [...wf.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]!);
    expect([...new Set(thamChieu)]).toEqual(["PROD_DATABASE_URL_RO"]);
  });

  it("không bước nào chạy migration / seed / deploy", () => {
    expect(wf).not.toMatch(/migrate deploy|migrate dev|db:seed|db push/);
  });

  it("chạy ĐÚNG script này, và artifact giữ đúng 3 ngày", () => {
    expect(wf).toContain(`tsx ${SCRIPT}`);
    expect(wf).toMatch(/retention-days:\s*3/);
  });
});

describe("[BHP-04] báo cáo KHÔNG chở dữ liệu cá nhân ra ngoài", () => {
  const ma = boChuThich(doc(SCRIPT));

  it("KHÔNG đọc tên/SĐT/email của người", () => {
    // Báo cáo này đi lên job summary và artifact — hai nơi rời khỏi vòng kiểm soát của DB.
    // Nó chỉ được chạm GIÁO TRÌNH (tên bài là nội dung giảng dạy) và ĐẾM `ClassSession`.
    for (const cam of [
      "customerPhone",
      "customerName",
      "parentName",
      "fullName",
      "student:",
      "studentId",
      "email",
    ]) {
      expect(ma, `báo cáo chạm dữ liệu cá nhân: ${cam}`).not.toContain(cam);
    }
  });

  it("chỉ ĐẾM buổi lớp, không đọc dòng buổi lớp ra", () => {
    // `groupBy`/`count` trả về con số; `findMany` trên `classSession` mở đường cho tên lớp,
    // tên giáo viên, ghi chú buổi đi theo.
    expect(ma).not.toMatch(/classSession\.findMany/);
  });
});
