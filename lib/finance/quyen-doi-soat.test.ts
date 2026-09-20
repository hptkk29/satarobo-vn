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
    //
    // **6** lời gọi. Khai báo là `ghiTienChoDon<T>(` nên không đếm.
    //   1. `taoDotChoCon`          — tạo đợt cho một bé
    //   2. `huyDotChoCon`          — huỷ đợt chưa có tiền
    //   3. `ganTienTheoCon`        — gắn một GIAO DỊCH ngân hàng, chia theo đợt
    //   4. `ganKhoanDaThuChoCon`   — đường B: gắn một KHOẢN đã thu cho một bé  [18/09/2026]
    //   5. `boGanKhoanKhoiCon`     — đường B: bỏ gắn                            [18/09/2026]
    //   6. `goGanTheoCon`          — gỡ gắn giao dịch, sinh bút toán đảo
    //
    // ⚠️ Con số này ĐẾM CÓ CHỦ ĐÍCH, đừng đổi thành `toBeGreaterThan`. Nó bắt đúng một thứ:
    // ai đó thêm một đường ghi tiền mới mà **quên bọc khoá** thì tổng không tăng, và ca này
    // đỏ. Nới thành "≥" là gỡ luôn khả năng ấy. Thêm hàm mới thì SỬA SỐ và thêm một dòng vào
    // danh sách trên — vài giây, và nó buộc người thêm phải đọc lại vì sao có khoá.
    expect(ghi.match(/ghiTienChoDon\(/g) ?? []).toHaveLength(6);
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

describe("[QDS-05] CÔNG TẮC THEO CƠ SỞ — cờ tắt thì prod y như TRƯỚC merge", () => {
  // Chủ dự án chốt 17/09: *"Màn gắn kiểu mới + quyền sale phải SAU CỜ theo cơ sở của đơn. Cờ
  // tắt → màn và quyền y như trước merge (chỉ payments:manage)."*
  //
  // ⚠️ Ba khẳng định dưới đây là về DÂY NỐI (cổng nào đọc cờ nào, nhánh nào còn sống), nên
  // chúng là lưới ghim mã nguồn. Phần HÀNH VI của phép giải cờ đã có test thuần riêng ở
  // `lib/finance/feature.test.ts` — ca này không dựng lại phép giải đó.

  it("cổng gắn đọc cờ theo `orgUnitId` của ĐƠN, không theo người bấm", () => {
    const gan = docMa("app/(admin)/admin/bien-dong-so-du/_gan-theo-con.ts");
    const khoi = than(gan, "congGanVaoDon");
    expect(khoi).not.toBe("");
    // Cờ của CƠ SỞ GIỮ ĐƠN. Đọc theo người bấm là pilot một cơ sở hoá ra bật cho mọi đơn mà
    // người của cơ sở đó chạm vào.
    expect(khoi).toMatch(/const kieuMoi = await laThuTienLinhHoatBat\(order\.orgUnitId\);/);
    // Và cờ TẮT thì phải đòi `payments:manage` — tức đúng quyền trước merge.
    expect(khoi).toMatch(/if \(!kieuMoi && !coManage\) \{/);
    // Hỏi CẢ HAI quyền, vì vế nào cần thì phụ thuộc vào cờ mà cờ thì chưa biết lúc mở cửa.
    expect(khoi).toMatch(/checkPermission\("payments:record"\)/);
    expect(khoi).toMatch(/checkPermission\("payments:manage"\)/);
  });

  it("đường gắn CŨ (rót toàn đơn) vẫn còn sống và vẫn gác `payments:manage`", () => {
    // ⚠️ PHIÊN B đã XOÁ hàm này. Xoá là merge vào `main` đổi hành vi prod NGAY trong khi công
    // tắc vẫn tắt — đúng thứ công tắc sinh ra để tránh. Nay nó là nhánh CỜ-TẮT.
    const act = docMa("app/(admin)/admin/bien-dong-so-du/_actions.ts");
    expect(act).toMatch(
      /export async function ganGiaoDichVaoDon\([\s\S]{0,300}?await gateKeToan\(\)/,
    );
    // Nó phải đi qua `allocateToOrder` — tức CÙNG đường ghi mà webhook dùng, kèm đủ
    // side-effect sau commit. Viết lại waterfall ở đây là bản thứ hai của phép rót tiền.
    expect(act).toMatch(/await allocateToOrder\(\{/);
  });

  it("màn hình VẼ NÚT theo cờ: không nơi nào bật ⇒ `canGan` rơi về đúng `canManage`", () => {
    const page = docMa("app/(admin)/admin/bien-dong-so-du/page.tsx");
    // Affordance phải nói thật (luật 12): sale không được thấy nút nếu chẳng cơ sở nào bật.
    expect(page).toMatch(
      /const canGan = canManagePayments \|\| \(canRecordPayments && coNoiBatCo\);/,
    );
    expect(page).toMatch(
      /const coNoiBatCo = await coNoiNaoBatThuLinhHoat\(actor\.visibleOrgUnitIds\);/,
    );
    // Và màn phải BIẾT đơn đang ở luồng nào để vẽ đúng khối.
    const gan = docMa("app/(admin)/admin/bien-dong-so-du/_gan-theo-con.ts");
    expect(gan).toMatch(/kieuMoi: cong\.kieuMoi,/);
    const man = docMa("app/(admin)/admin/bien-dong-so-du/_components/xu-ly-giao-dich.tsx");
    expect(man).toMatch(/if \(chiTiet && !chiTiet\.kieuMoi\) \{/);
    expect(man).toMatch(/ganGiaoDichVaoDon\(bankTransactionId, chiTiet\.orderId\)/);
  });

  it("`coNoiNaoBatThuLinhHoat` KHÔNG ngắt sớm bằng công tắc toàn hệ", () => {
    // Ca "toàn hệ BẬT + cơ sở này TẮT" có thật (chốt 16/09: *gỡ một cơ sở ra khi nó gặp sự
    // cố*). Ngắt sớm ở công tắc toàn hệ sẽ vẽ nút cho người của đúng cơ sở vừa bị gỡ.
    const src = docMa("lib/finance/feature.ts");
    const khoi = than(src, "coNoiNaoBatThuLinhHoat");
    expect(khoi).not.toBe("");
    // Chỉ đọc toàn hệ khi KHÔNG có cơ sở nào để hỏi.
    expect(khoi).toMatch(/if \(orgUnitIds\.length === 0\) return laThuTienLinhHoatBat\(null\);/);
    expect(khoi).toMatch(/for \(const id of orgUnitIds\)/);
  });

  it("đợt `orderItemId = NULL` PHẢI vào được danh sách chia — đơn cũ không bị bỏ rơi", () => {
    // ⚠️ Bản đầu lọc `dungDotDeChia(so.con)` để tìm đợt NULL, mà hàm đó chỉ đi qua `con[]` nên
    // danh sách LUÔN RỖNG: mọi đơn trước 16/09 hiện 0 đợt để chia. Một chú thích ĐÚNG Ý mà
    // SAI MÃ — nó nói "tra riêng" trong khi thực ra lọc lại đúng danh sách vừa dựng.
    const gan = docMa("app/(admin)/admin/bien-dong-so-du/_gan-theo-con.ts");
    expect(gan).toMatch(/dotChungChuaChiaCon: so\.dotChuaGanCon\.map\(/);
    expect(gan).not.toMatch(/dungDotDeChia\(so\.con\)/);

    const ghi = docMa("lib/finance/ghi-tien-don.ts");
    // Đường GHI cũng phải nhận cả hai nguồn, nếu không màn hiện đợt mà cổng từ chối nó.
    expect(ghi).toMatch(/const dotDeChia = dungDotDeChia\(so\);/);
    // Và đơn MỘT con thì nâng đợt NULL lên đúng bé đó.
    expect(ghi).toMatch(/const conDuyNhat = dongCuaDon\.length === 1 \?/);
    expect(ghi).toMatch(/conSuyRa\.set\(d\.paymentRequestId, conDuyNhat\);/);
  });

  it("gỡ gắn chụp ĐỦ cột trước khi xoá, và ghi id bút toán đảo", () => {
    const ghi = docMa("lib/finance/ghi-tien-don.ts");
    const khoi = than(ghi, "goGanTheoCon");
    expect(khoi).not.toBe("");
    // Hai cột KHÔNG suy ra được từ phần còn lại sau khi phân bổ bị xoá.
    expect(khoi).toMatch(/createdAt: true,/);
    expect(khoi).toMatch(/orderItemId: true,/);
    // Người gắn chỉ còn trong nhật ký lượt gắn — phải tra ngược để ảnh chụp tự đủ.
    expect(khoi).toMatch(/action: "TXN_CHIA_THEO_CON"/);
    expect(khoi).toMatch(/nguoiGan: vetGan/);
    expect(khoi).toMatch(/idButToanDao,/);
    expect(khoi).toMatch(/trangThaiDotSauGo:/);
    // Cùng MỘT transaction: `writeAudit` phải nhận `tx`, kẻo nhật ký sống sót một lượt
    // rollback và kể một chuyện chưa từng xảy ra.
    expect(khoi).toMatch(/await writeAudit\(\{\s*tx,/);
  });
});

describe("[QDB-*] ĐƯỜNG B — gắn khoản đã thu vào con, trên màn ĐƠN", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Chủ dự án chốt 18/09/2026: *"payments:record để gắn, payments:manage để bỏ gắn."*
  // Và: *"Sau cờ (billing.flexV1Enabled), cờ tắt thì nút không hiện."*
  //
  // ⚠️ VÌ SAO LÀ LƯỚI MÃ NGUỒN CHỨ KHÔNG PHẢI TEST HÀNH VI — cùng lý do với `[QDS-*]` ở trên:
  // cổng thật nằm trong Server Action và nó gọi `auth()` + `checkPermission()`. Dựng hành vi
  // cho nó phải giả `auth()`, dựng session, dựng `RoleDef` trong DB cho từng vai — và khi đó
  // ca test kiểm `checkPermission`, thứ đã có test riêng, chứ KHÔNG kiểm điều đang cần: rằng
  // ĐÚNG cổng ấy được cắm vào ĐÚNG action ấy.
  //
  // Phần HÀNH VI của đường B (gắn / bỏ gắn / chặn chéo đơn / chỉ đụng một cột) nằm ở
  // `tests/finance/gan-khoan-cho-con.test.ts`, chạy trên Postgres thật.
  // ─────────────────────────────────────────────────────────────────────────────
  const ACT = "app/(admin)/admin/orders/_actions.ts";

  it("gắn đòi `payments:record`, bỏ gắn đòi `payments:manage` — KHÔNG dùng lại `orders:manage`", () => {
    const src = docMa(ACT);
    const gan = than(src, "ganKhoanChoConAction");
    const bo = than(src, "boGanKhoanChoConAction");
    expect(gan, "không tách được thân action gắn").not.toBe("");
    expect(bo, "không tách được thân action bỏ gắn").not.toBe("");

    expect(gan).toMatch(/congDuongB\(input\.orderId, "payments:record"\)/);
    expect(bo).toMatch(/congDuongB\(input\.orderId, "payments:manage"\)/);

    // ⚠️ `requireOrdersManage()` gác bằng `orders:manage` VÀ `redirect()` khi thiếu quyền.
    // Đường B cố ý không dùng nó: gắn một khoản ĐÃ THU cho đúng bé là việc thường ngày của
    // sale, và đá người dùng sang /dashboard giữa lúc đang gắn tiền là mất luôn thao tác dở.
    expect(gan).not.toMatch(/requireOrdersManage/);
    expect(bo).not.toMatch(/requireOrdersManage/);
  });

  it("cổng chung kiểm ĐỦ BA VẾ: quyền · phạm vi cơ sở · công tắc CỦA ĐƠN", () => {
    const cong = than(docMa(ACT), "congDuongB");
    expect(cong, "không tách được thân cổng").not.toBe("");

    expect(cong, "vế 1 — quyền").toMatch(/await checkPermission\(quyen\)/);
    expect(cong, "vế 2 — phạm vi cơ sở").toMatch(/passesScope\("Order", order, actor\)/);
    // ⚠️ Vế 3 đọc theo `order.orgUnitId` — cơ sở GIỮ ĐƠN, KHÔNG phải cơ sở người bấm. Đọc
    // theo người bấm là pilot một cơ sở hoá ra bật cho mọi đơn mà người đó chạm vào.
    expect(cong, "vế 3 — công tắc của ĐƠN").toMatch(
      /laThuTienLinhHoatBat\(order\.orgUnitId\)/,
    );
  });

  it("cờ TẮT ⇒ action TỪ CHỐI (không chỉ ẩn nút)", () => {
    const cong = than(docMa(ACT), "congDuongB");
    // Phải có nhánh phủ định của cờ và nó trả về lỗi — ẩn nút không phải là kiểm quyền.
    expect(cong).toMatch(/if \(!\(await laThuTienLinhHoatBat\(order\.orgUnitId\)\)\)/);
    expect(cong).toMatch(/chưa bật cho cơ sở này/);
  });

  it("màn đơn truyền HAI cờ quyền riêng, không tái dùng `canManage`", () => {
    const page = docMa("app/(admin)/admin/orders/[id]/page.tsx");
    expect(page).toMatch(/const canRecordPayments = await checkPermission\("payments:record"\)/);
    expect(page).toMatch(/const canManagePayments = await checkPermission\("payments:manage"\)/);
    expect(page).toMatch(/duocGan=\{canRecordPayments\}/);
    expect(page).toMatch(/duocBoGan=\{canManagePayments\}/);
    // `duocSua` (tạo/huỷ đợt) VẪN là `canManage` — ba quyền, ba việc.
    expect(page).toMatch(/duocSua=\{canManage\}/);
  });

  it("khối khoản chờ gắn lọc từ tập RỘNG, KHÔNG từ `chuaGanCon` (trục A)", () => {
    // ⚠️ Đây là con bug đã đo: `chuaGanCon` chỉ cộng trục A, nên với 4 khoản `PENDING` của
    // `ORD-260917-000001` nó ra 0 và cả khối BIẾN MẤT — tiền có thật mà màn hình câm.
    const ui = docMa("app/(admin)/admin/orders/_components/cong-no-theo-con.tsx");
    expect(ui).toMatch(/khoan=\{so\.khoanDaVeChiTiet\.filter\(\(k\) => k\.orderItemId == null\)\}/);
    expect(ui, "không được quay lại gác bằng `so.chuaGanCon > 0`").not.toMatch(
      /so\.chuaGanCon > 0 &&/,
    );
  });

  it("giới hạn 'một khoản một bé' được NÓI RA trên màn, không giấu trong mã", () => {
    // Affordance phải nói thật (luật 12): người dùng phải biết TRƯỚC khi bấm rằng không chia
    // được một khoản cho hai bé, chứ không phát hiện sau.
    const ui = docMa("app/(admin)/admin/orders/_components/cong-no-theo-con.tsx");
    expect(ui).toMatch(/chưa hỗ trợ/);
    expect(ui).toMatch(/đúng một bé/);
  });
});
