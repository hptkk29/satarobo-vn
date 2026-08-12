/**
 * scripts/nen-p2-kiem-tien-quyet.ts — cổng vào của P2.
 *
 *   pnpm tsx scripts/nen-p2-kiem-tien-quyet.ts
 *
 * CHỈ ĐỌC. Thoát khác 0 nếu chưa đủ điều kiện chạy backfill P2.
 *
 * VÌ SAO TÁCH RA MỘT SCRIPT RIÊNG. `nen-p2-backfill-position.ts` cũng tự kiểm và
 * tự từ chối `--apply`, nhưng nó chỉ nói được "từ chối" ở giữa một bản đối chiếu
 * dài. Chạy cái này TRƯỚC thì log nói thẳng thiếu điều kiện nào, khi chưa đụng gì.
 *
 * VÌ SAO KHẮT KHE. `Position` cố ý KHÔNG có đường xoá cứng — nó là lịch sử tổ
 * chức. Chạy backfill trước khi dời cây nghĩa là neo vị trí vào hình cây CŨ, và
 * chữa thì phải tắt từng vị trí rồi tạo lại. Thà chặn ở đây.
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";

const db = scriptDb();

type KetQua = { ten: string; dat: boolean; chiTiet: string };

async function main() {
  const kq: KetQua[] = [];

  console.log(`Kiểm điều kiện P2 trên: ${currentDbHost()}`);
  console.log("");

  // ① Migration P2 đã áp chưa — hỏi thẳng information_schema, đừng tin Prisma
  //    client (nó sinh từ schema.prisma của repo, không phải từ DB đích).
  const bang = await db.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('Position', 'PositionAssignment', 'WorkScope')
  `;
  const coBang = new Set(bang.map((b) => b.table_name));
  const thieuBang = ["Position", "PositionAssignment", "WorkScope"].filter(
    (t) => !coBang.has(t),
  );
  kq.push({
    ten: "Migration P2 đã áp",
    dat: thieuBang.length === 0,
    chiTiet:
      thieuBang.length === 0
        ? "có đủ 3 bảng Position / PositionAssignment / WorkScope"
        : `THIẾU bảng: ${thieuBang.join(", ")} — chạy \`prisma migrate deploy\` trước`,
  });

  // ② Mọi đơn vị sống phải có `path`. Đây là điều kiện mà chính script backfill
  //    dùng để từ chối `--apply` (RUNBOOK-P2 §0).
  const thieuPath = await db.orgUnit.count({
    where: { deletedAt: null, OR: [{ path: null }, { path: "" }] },
  });
  kq.push({
    ten: "Mọi đơn vị sống đã có path",
    dat: thieuPath === 0,
    chiTiet:
      thieuPath === 0
        ? "0 đơn vị thiếu path"
        : `${thieuPath} đơn vị còn thiếu path — chạy RUNBOOK-P1 §1 trước`,
  });

  // ③ Cây đã DỜI chưa. Thiếu path là điều kiện tối thiểu, nhưng cây cũ vẫn có thể
  //    có path. Dấu hiệu chắc chắn của hình cây MỚI: tồn tại đơn vị REGION.
  const soRegion = await db.orgUnit.count({
    where: { deletedAt: null, type: "REGION" },
  });
  kq.push({
    ten: "Cây đã dời sang HO → REGION → CENTER",
    dat: soRegion > 0,
    chiTiet:
      soRegion > 0
        ? `${soRegion} khối vùng`
        : "0 khối vùng — nhiều khả năng CHƯA chạy scripts/nen-p1-reshape-org-tree.ts",
  });

  // ④ Pháp nhân: vị trí kế thừa pháp nhân của đơn vị, nên đơn vị chưa neo pháp
  //    nhân thì sinh vị trí ra là thiếu thông tin ngay từ đầu.
  const chuaNeo = await db.orgUnit.count({
    where: { deletedAt: null, legalEntityId: null },
  });
  kq.push({
    ten: "Mọi đơn vị sống đã neo pháp nhân",
    dat: chuaNeo === 0,
    chiTiet:
      chuaNeo === 0
        ? "0 đơn vị thiếu pháp nhân"
        : `${chuaNeo} đơn vị chưa neo — chạy RUNBOOK-P1 §1 bước (4)`,
  });

  // ⑤ Có nhân sự để backfill không. KHÔNG phải điều kiện chặn — chỉ để người chạy
  //    khỏi ngạc nhiên khi bản đối chiếu ra rỗng.
  const soNhanSu = await db.employee.count({ where: { status: "ACTIVE" } });

  console.log("| Điều kiện | Kết quả | Chi tiết |");
  console.log("|---|---|---|");
  for (const k of kq) {
    console.log(`| ${k.ten} | ${k.dat ? "✅" : "❌"} | ${k.chiTiet} |`);
  }
  console.log("");
  console.log(`Nhân sự đang làm việc: **${soNhanSu}** (không phải điều kiện chặn).`);

  const hong = kq.filter((k) => !k.dat);
  if (hong.length > 0) {
    console.log("");
    console.log(`❌ CHƯA ĐỦ ĐIỀU KIỆN — ${hong.length} mục chưa đạt. Không chạy P2.`);
    process.exitCode = 1;
    return;
  }
  console.log("");
  console.log("✅ Đủ điều kiện chạy P2.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
