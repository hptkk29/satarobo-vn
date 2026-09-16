// Ca [QDS-*] — AI ĐƯỢC LÀM GÌ ở màn đối soát `/admin/bien-dong-so-du` (PHIÊN B).
//
// ─────────────────────────────────────────────────────────────────────────────
// Chủ dự án chốt 17/09/2026, phương án 1:
//   · Gắn giao dịch + chia theo con + "Tạo đợt cho con…"  → `payments:record`  (SALE làm được)
//   · BỎ QUA (IGNORED) và GỠ GẮN                          → `payments:manage`  (CHỈ kế toán)
//   · Danh sách UNMATCHED: ai có `payments:record` đều thấy TOÀN BỘ
//   · Nhưng chỉ GẮN được vào đơn TRONG phạm vi `scopedDb` của mình
//
// ⚠️ VÌ SAO KHÔNG PHẢI TEST HÀNH VI. Ba khẳng định ở đây là về DÂY NỐI: "vai X có quyền Y
// không" (dữ liệu trong seed) và "action Z gác bằng quyền nào" (hình dạng mã). Một test hành
// vi thật phải dựng `auth()` giả + session + RoleDef trong DB cho từng vai — mà khi đó nó kiểm
// `checkPermission`, thứ đã có test riêng, chứ không kiểm điều đang cần: rằng ĐÚNG cổng ấy
// được cắm vào ĐÚNG action ấy. Theo luật 11: neo chuỗi hẹp nhất, ĐẾM số lần khớp, bóc chú
// thích, và đã cấy thử.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function doc(duong: string): string {
  return readFileSync(resolve(process.cwd(), duong), "utf8");
}

/**
 * Bóc chú thích để lưới không khớp nhầm vào chính câu giải thích bản vá.
 *
 * ⚠️ THỨ TỰ CÓ LÝ DO, và tôi đã trả giá để biết: bóc khối trước thì `prisma/seed-roles.ts`
 * mất nửa tệp. Ở dòng 386 có một chú thích DÒNG chứa đường dẫn `lop-trial` kèm hai dấu sao —
 * hai ký tự đó mở một khối giả, và phép bóc khối nuốt tuốt tới dấu đóng thật cách mấy trăm
 * dòng. Hệ quả: `code: "CENTER_ACCOUNTANT"` biến mất và lưới báo "không thấy vai" — một lưới
 * ĐỎ vì lý do hoàn toàn bịa.
 *
 * Bóc chú thích DÒNG trước là hết: dòng ấy biến mất cả câu, kể cả cái mở khối giả.
 */
function docMa(duong: string): string {
  return doc(duong)
    .split(/\r?\n/)
    .map((d) => d.replace(/\/\/[^\n]*$/, ""))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Thân của một hàm, cắt từ chỗ khai báo tới `export` kế tiếp.
 *
 * KHÔNG cắt tới dấu `}` đầu tiên ở đầu dòng: dấu đó thường là của một khối `if` bên trong,
 * nên thân bị cụt và mọi khẳng định sau đó xanh/đỏ hú hoạ.
 */
function than(src: string, ten: string): string {
  const dau = src.indexOf(`function ${ten}(`);
  if (dau === -1) return "";
  const sau = src.indexOf("\nexport ", dau + 1);
  return src.slice(dau, sau === -1 ? undefined : sau);
}

/** Các `action` mà một vai được cấp trong `prisma/seed-roles.ts`. */
function quyenCuaVai(ma: string): string[] {
  const src = docMa("prisma/seed-roles.ts");
  const dau = src.indexOf(`code: "${ma}"`);
  expect(dau, `không thấy vai ${ma} trong seed-roles.ts`).toBeGreaterThan(-1);
  const sau = src.indexOf('code: "', dau + 10);
  const khoi = src.slice(dau, sau === -1 ? undefined : sau);
  return [...khoi.matchAll(/\{\s*action:\s*"([^"]+)"/g)].map((m) => m[1]!);
}

describe("[QDS-01] seed quyền — sale ghi nhận được, nhưng KHÔNG quyết định kế toán", () => {
  it("CENTER_SALES_CSM CÓ `payments:record` và KHÔNG có `payments:manage`", () => {
    const q = quyenCuaVai("CENTER_SALES_CSM");
    // Vế 1 là thứ làm cho phương án 1 chạy được: sale gắn tiền bằng quyền đã có sẵn.
    expect(q).toContain("payments:record");
    // Vế 2 là thứ làm cho ca "sale bấm IGNORED → từ chối" thành đúng: sale không có quyền
    // này, nên cổng ở server chặn, và nút cũng không được vẽ ra.
    expect(q).not.toContain("payments:manage");
  });

  it("`payments:manage` CHỈ thuộc hai vai kế toán — không vai nào khác", () => {
    const vai = [
      "SUPER_ADMIN",
      "HO_ACCOUNTANT",
      "CENTER_ACCOUNTANT",
      "CENTER_MANAGER",
      "CENTER_SALES_CSM",
    ];
    const co = vai.filter((v) => quyenCuaVai(v).includes("payments:manage"));
    // SUPER_ADMIN không cần khai — `can()` v2 trả true cho nó ở tầng mã (lib/auth/can.ts).
    expect(co).toEqual(["HO_ACCOUNTANT", "CENTER_ACCOUNTANT"]);
  });
});

describe("[QDS-02] cổng gắn vào cổng — đúng quyền cắm vào đúng action", () => {
  it("BỎ QUA và GỠ GẮN gác bằng `payments:manage`", () => {
    const act = docMa("app/(admin)/admin/bien-dong-so-du/_actions.ts");
    // `gateKeToan` là hàm ĐẦY ĐỦ (không uỷ quyền tiếp) — xem chú thích trong tệp: luật lint
    // TS-03 chỉ nhận ra `checkPermission` ở wrapper cục bộ ĐÚNG MỘT CẤP.
    expect(act).toMatch(/async function gateKeToan\(\)[\s\S]{0,200}?checkPermission\("payments:manage"\)/);
    expect(act).toMatch(/export async function boQuaGiaoDich\([\s\S]{0,400}?await gateKeToan\(\)/);

    const gan = docMa("app/(admin)/admin/bien-dong-so-du/_gan-theo-con.ts");
    expect(gan).toMatch(
      /export async function goGanGiaoDichAction\([\s\S]{0,500}?checkPermission\("payments:manage"\)/,
    );
  });

  it("GẮN · TẠO ĐỢT TẠI CHỖ · NẠP CHI TIẾT đều đi qua `congGanVaoDon`", () => {
    const gan = docMa("app/(admin)/admin/bien-dong-so-du/_gan-theo-con.ts");
    // Ba action + đúng một định nghĩa = 4 lần xuất hiện. Thêm một action thứ tư quên gọi cổng
    // thì số này lệch và ca đỏ.
    expect(gan.match(/congGanVaoDon\(/g) ?? []).toHaveLength(4);
    for (const ten of [
      "taiChiTietDonDeGan",
      "ganGiaoDichTheoConAction",
      "taoDotChoConTaiChoAction",
    ]) {
      expect(gan, ten).toMatch(
        new RegExp(`export async function ${ten}\\([\\s\\S]{0,400}?await congGanVaoDon\\(`),
      );
    }
    expect(gan).toMatch(/async function congGanVaoDon\([\s\S]{0,300}?checkPermission\("payments:record"\)/);
  });

  it("`congGanVaoDon` ép CÁCH LY CƠ SỞ bằng CẢ HAI lớp", () => {
    const gan = docMa("app/(admin)/admin/bien-dong-so-du/_gan-theo-con.ts");
    const khoi = than(gan, "congGanVaoDon");
    expect(khoi).not.toBe("");
    // Lớp 1: câu tra đi qua `scopedDb` (đọc đã bị lọc theo cơ sở).
    expect(khoi).toMatch(/scopedDb\(actor\)\.order\.findUnique/);
    // Lớp 2: `passesScope` đọc thẳng `centerId` của bản ghi. `scopedDb` KHÔNG che write, nên
    // bỏ lớp này là một thay đổi ở `SCOPED_MODELS` biến thành lỗ IDOR im lặng.
    expect(khoi).toMatch(/passesScope\("Order", order, actor\)/);
    // Và sale CS1 gửi id đơn CS2 phải nhận đúng câu như khi đơn không tồn tại — biết đơn có
    // thật ở cơ sở khác đã là một mẩu thông tin không nên rò.
    expect(khoi).toContain("Không tìm thấy đơn hàng");
  });

  it("GỠ GẮN không nhận `orderId` từ client", () => {
    const gan = docMa("app/(admin)/admin/bien-dong-so-du/_gan-theo-con.ts");
    const khoi = than(gan, "goGanGiaoDichAction");
    expect(khoi).not.toBe("");
    // Tham số chỉ có hai trường; `orderId` suy ra từ chính phân bổ của giao dịch. Nhận từ
    // client là mở đường cho "gỡ giao dịch A nhưng khai đơn B" — khoá giữ đơn B trong khi tay
    // đụng đơn A, tức chạy NGOÀI khoá mà trông như có khoá.
    expect(khoi).toMatch(/input:\s*\{\s*bankTransactionId: string;\s*lyDo: string;\s*\}/);
    expect(khoi).toMatch(/paymentAllocation\.findFirst/);
  });
});

describe("[QDS-04] webhook đơn MỘT con — gắn `orderItemId`, đơn nhiều con thì KHÔNG đoán", () => {
  it("dùng `take: 2` và chỉ nhận khi ĐÚNG một dòng", () => {
    // ⚠️ Thêm sau một lượt cấy LỌT: đổi `take: 2` thành `take: 1` là biến MỌI đơn thành "đơn
    // một con" ⇒ tiền của đơn nhiều con bị gắn bừa vào dòng đầu bảng. Không ca nào đỏ, và
    // trên màn hình nó trông ĐÚNG HƠN trước (bé nào cũng có tên).
    const ing = docMa("lib/payments/payos-ingest.ts");
    expect(ing).toMatch(
      /const dongCuaDon = await tx\.orderItem\.findMany\(\{\s*where: \{ orderId: order\.id \},\s*select: \{ id: true \},\s*take: 2,/,
    );
    expect(ing).toMatch(
      /const dongDuyNhat = dongCuaDon\.length === 1 \? \(dongCuaDon\[0\]\?\.id \?\? null\) : null;/,
    );
    expect(ing).toMatch(/orderItemId: dongDuyNhat,/);
  });
});

describe("[QDS-03] khoá theo đơn — MỘT công thức, dùng chung với đường webhook", () => {
  it("chỉ `khoaDonTrongTx` đánh vần chuỗi khoá cho đơn hàng", () => {
    const ghi = docMa("lib/finance/ghi-tien-don.ts");
    expect(ghi).toMatch(
      /await tx\.\$executeRaw`SELECT pg_advisory_xact_lock\(hashtext\(\$\{orderId\}\)::bigint\)`/,
    );
    // `$executeRaw`, KHÔNG `$queryRaw`: `pg_advisory_xact_lock()` trả `void` và Prisma ném
    // "Failed to deserialize column of type 'void'" (bug PR #76).
    expect(ghi).not.toMatch(/\$queryRaw`SELECT pg_advisory_xact_lock/);
    // Và mọi phép ghi tiền của tệp này đi qua `ghiTienChoDon`, tức luôn nằm dưới khoá.
    // 4 lời gọi (tạo đợt · huỷ đợt · gắn · gỡ). Khai báo là `ghiTienChoDon<T>(` nên không đếm.
    expect(ghi.match(/ghiTienChoDon\(/g) ?? []).toHaveLength(4);
  });

  it("đường webhook dùng ĐÚNG công thức khoá ấy — hai đường phải giẫm lên nhau được", () => {
    // ⚠️ Nếu hai nơi khoá hai chuỗi khác nhau thì webhook và màn gắn tay chạy song song vẫn
    // giẫm lên nhau, trong khi đọc mã chỗ nào cũng thấy "có khoá". Không có gì báo động.
    const ing = docMa("lib/payments/payos-ingest.ts");
    expect(ing).toMatch(
      /pg_advisory_xact_lock\(hashtext\(\$\{order\.id\}\)::bigint\)/,
    );
  });

  it("`noTheoCon` (đọc hiển thị) và `docSoTheoCon` (đọc trong khoá) là HAI cửa khác nhau", () => {
    const debt = docMa("lib/finance/debt.ts");
    // Bản đọc-hiển-thị chỉ uỷ quyền, và uỷ quyền với `db` TRẦN — "ai mở đơn cũng ra cùng số".
    expect(debt).toMatch(/export async function noTheoCon\(orderId: string\): Promise<NoTheoConKetQua> \{\s*return docSoTheoCon\(db, orderId\);/);
    // Bản thân hàm thật KHÔNG có mặc định `= db` (luật 7): mặc định ở đó nghĩa là "đọc ngoài
    // khoá", đúng cái sai mà PHIÊN B sinh ra để sửa.
    expect(debt).toMatch(/export async function docSoTheoCon\(\s*doc: DocSoTheoCon,/);
    expect(debt).not.toMatch(/doc: DocSoTheoCon = db/);
    // Và đường ghi đọc bằng `tx`, không bằng `db`.
    const ghi = docMa("lib/finance/ghi-tien-don.ts");
    expect(ghi).toMatch(/const so = await docSoTheoCon\(tx, orderId\);/);
    expect(ghi).not.toMatch(/noTheoCon\(/);
  });
});
