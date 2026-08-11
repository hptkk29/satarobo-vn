/**
 * scripts/nen-p2-backfill-position.ts — Nền Hệ thống P2 · US-11.
 *
 * Hồ sơ nhân sự ĐANG CÓ → `Position` (theo đơn vị × chức danh) + `PositionAssignment`
 * PRIMARY cho từng người.
 *
 * CHẠY:
 *   pnpm tsx scripts/nen-p2-backfill-position.ts                    # DRY-RUN (mặc định)
 *   pnpm tsx scripts/nen-p2-backfill-position.ts --out doi-chieu.md # kèm xuất file duyệt
 *   pnpm tsx scripts/nen-p2-backfill-position.ts --apply            # ghi thật
 *   pnpm tsx scripts/nen-p2-backfill-position.ts --apply --gan-vai  # ghi + gắn bộ vai
 *
 * THỨ TỰ BẮT BUỘC — chạy sau khi CHUỖI P1 đã xong trên chính DB đó
 * (`docs/nen-he-thong/RUNBOOK-P1.md`): migrate → dời cây → backfill orgUnitId → seed
 * pháp nhân → đối soát 0 lệch. Chạy trước khi dời cây thì vị trí sẽ neo vào hình cây cũ,
 * và phải xoá đi làm lại — mà `Position` thì cố ý KHÔNG có đường xoá cứng.
 *
 * AN TOÀN:
 *  · Mặc định KHÔNG ghi. Phải có `--apply`.
 *  · KHÔNG ĐOÁN (AC3): thiếu đơn vị / thiếu chức danh → vào danh sách chờ xử lý tay.
 *  · KHÔNG gắn vai trừ khi có `--gan-vai`; và khi gắn thì chỉ lấy vai người đó ĐANG giữ
 *    TẠI CHÍNH đơn vị đó ⇒ không ai được thêm một quyền nào so với trước khi chạy.
 *  · Idempotent: vị trí khớp (đơn vị, chức danh) thì dùng lại; người đã có phân công
 *    PRIMARY còn hiệu lực thì bỏ qua. Chạy lại lần hai là 0 thay đổi.
 *  · Ghi trong MỘT transaction — nửa chừng lỗi thì không để lại vị trí mồ côi.
 */
import { writeFileSync } from "node:fs";
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import {
  inBanDoiChieu,
  khoaViTri,
  lapKeHoach,
  type HoSoNhanSu,
  type VaiDangGiu,
} from "../lib/org/position-backfill";
import { assertSinglePrimary } from "../lib/org/positions";

const APPLY = process.argv.includes("--apply");
const GAN_VAI = process.argv.includes("--gan-vai");
const OUT = (() => {
  const i = process.argv.indexOf("--out");
  return i >= 0 ? process.argv[i + 1] : undefined;
})();

async function main() {
  const db = scriptDb();
  const ngayChay = new Date();

  console.log(`\n=== BACKFILL NHÂN SỰ → VỊ TRÍ — ${APPLY ? "GHI THẬT (--apply)" : "DRY-RUN (chỉ in)"} ===`);
  console.log(`DB: ${currentDbHost()}`);
  console.log(`Bộ vai: ${GAN_VAI ? "CÓ gắn (--gan-vai)" : "KHÔNG gắn (mặc định)"}\n`);

  const [nhanSuRaw, orgUnits, uorRaw] = await Promise.all([
    db.employee.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        employeeCode: true,
        fullName: true,
        jobTitle: true,
        orgUnitId: true,
        centerId: true,
        joinedAt: true,
        userAccount: { select: { id: true, orgUnitId: true, centerId: true } },
      },
    }),
    db.orgUnit.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, centerId: true },
    }),
    db.userOrgRole.findMany({
      where: {
        status: "ACTIVE",
        effectiveFrom: { lte: ngayChay },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: ngayChay } }],
      },
      select: { userId: true, orgUnitId: true, roleId: true, role: { select: { code: true } } },
    }),
  ]);

  const nhanSu: HoSoNhanSu[] = nhanSuRaw.map((e) => ({
    id: e.id,
    employeeCode: e.employeeCode,
    fullName: e.fullName,
    jobTitle: e.jobTitle,
    orgUnitId: e.orgUnitId,
    centerId: e.centerId,
    joinedAt: e.joinedAt,
    userId: e.userAccount?.id ?? null,
    taiKhoanOrgUnitId: null, // điền ở dưới, sau khi có cầu Center → OrgUnit
  }));
  const vaiDangGiu: VaiDangGiu[] = uorRaw.map((r) => ({
    userId: r.userId,
    orgUnitId: r.orgUnitId,
    roleId: r.roleId,
    roleCode: r.role.code,
  }));

  // Cầu Center → OrgUnit: khớp theo `OrgUnit.centerId` (cột trỏ Center cũ). KHÔNG đoán
  // theo tên/địa chỉ — xem lib/org/center-bridge.ts.
  const centerToOrg = new Map<string, string>();
  for (const o of orgUnits) if (o.centerId) centerToOrg.set(o.centerId, o.id);

  // Đơn vị ghi trên TÀI KHOẢN — chỉ để BÁO CÁO chỗ lệch, không dùng để suy vị trí.
  for (const [i, e] of nhanSuRaw.entries()) {
    const u = e.userAccount;
    nhanSu[i].taiKhoanOrgUnitId =
      u?.orgUnitId ?? (u?.centerId ? (centerToOrg.get(u.centerId) ?? null) : null);
  }

  const keHoach = lapKeHoach({
    nhanSu,
    orgUnitIds: new Set(orgUnits.map((o) => o.id)),
    centerToOrg,
    vaiDangGiu,
    ganVai: GAN_VAI,
    ngayChay,
  });

  const tenVai = new Map(uorRaw.map((r) => [r.roleId, r.role.code]));
  const banDoiChieu = inBanDoiChieu(keHoach, {
    tenDonVi: new Map(orgUnits.map((o) => [o.id, `${o.code} · ${o.name}`])),
    tenVai,
    ganVai: GAN_VAI,
  });
  console.log(banDoiChieu);
  if (OUT) {
    writeFileSync(OUT, banDoiChieu, "utf8");
    console.log(`→ Đã ghi bản đối chiếu: ${OUT}\n`);
  }

  // TIỀN KIỂM: chuỗi P1 đã chạy trên chính DB này chưa? `path` là sản phẩm của US-05;
  // còn dòng nào null nghĩa là cây chưa ở hình P1, và vị trí sinh ra sẽ neo vào hình cũ.
  // Chặn ở đây rẻ hơn nhiều so với đi gỡ vị trí đã tạo — `Position` cố ý không có đường
  // xoá cứng.
  const thieuPath = await db.orgUnit.count({ where: { deletedAt: null, path: null } });
  if (thieuPath > 0) {
    console.log(
      `⛔ ${thieuPath} đơn vị chưa có \`path\` ⇒ chuỗi P1 chưa chạy xong trên DB này.\n` +
        "   Chạy docs/nen-he-thong/RUNBOOK-P1.md trước, rồi quay lại.\n",
    );
    if (APPLY) {
      await db.$disconnect();
      process.exit(1);
    }
  }

  if (!APPLY) {
    console.log(
      "⚠️  DRY-RUN — chưa ghi gì. Duyệt TỪNG DÒNG ở mục 1 và 2, xử lý tay mục 3, rồi chạy lại với --apply.\n",
    );
    await db.$disconnect();
    return;
  }

  let viTriMoi = 0;
  let viTriDungLai = 0;
  let phanCongMoi = 0;
  let phanCongBoQua = 0;

  await db.$transaction(async (tx) => {
    const idTheoKhoa = new Map<string, string>();

    for (const v of keHoach.viTri) {
      // Idempotent theo (đơn vị, chức danh). `findFirst` + so khoá chuẩn hoá thay vì
      // `upsert`: bảng không có unique trên cặp này, và thêm unique là migration ghi trên
      // dữ liệu prod (luật cứng #4) — không thuộc story này.
      const daCo = (
        await tx.position.findMany({
          where: { orgUnitId: v.orgUnitId, deletedAt: null },
          select: { id: true, title: true },
        })
      ).find((p) => khoaViTri(v.orgUnitId, p.title) === v.khoa);

      if (daCo) {
        idTheoKhoa.set(v.khoa, daCo.id);
        viTriDungLai++;
      } else {
        const tao = await tx.position.create({
          data: { orgUnitId: v.orgUnitId, title: v.title },
          select: { id: true },
        });
        idTheoKhoa.set(v.khoa, tao.id);
        viTriMoi++;
      }

      if (v.roleIds.length > 0) {
        await tx.positionRole.createMany({
          data: v.roleIds.map((roleId) => ({
            positionId: idTheoKhoa.get(v.khoa) as string,
            roleId,
          })),
          skipDuplicates: true,
        });
      }
    }

    for (const p of keHoach.phanCong) {
      const positionId = idTheoKhoa.get(p.viTriKhoa);
      if (!positionId) continue;

      // Đã có PRIMARY còn hiệu lực (chạy lần hai, hoặc người đã được gán tay) → bỏ qua.
      // Dùng CHÍNH hàm chặn của US-09 để không có hai luật song song.
      try {
        await assertSinglePrimary({
          userId: p.userId,
          kind: "PRIMARY",
          effectiveFrom: p.effectiveFrom,
          effectiveTo: null,
          client: tx as never,
        });
      } catch {
        phanCongBoQua++;
        continue;
      }

      await tx.positionAssignment.create({
        data: {
          positionId,
          userId: p.userId,
          kind: "PRIMARY",
          effectiveFrom: p.effectiveFrom,
          note: `US-11 backfill từ hồ sơ ${p.employeeCode}`,
        },
      });
      phanCongMoi++;
    }
  });

  console.log(
    `✅ GHI XONG — vị trí: ${viTriMoi} mới / ${viTriDungLai} dùng lại · phân công: ${phanCongMoi} mới / ${phanCongBoQua} bỏ qua (đã có PRIMARY còn hiệu lực)`,
  );
  console.log(
    `   Còn ${keHoach.choXuLyTay.length} hồ sơ chờ xử lý tay — script KHÔNG đoán giúp (AC3).\n`,
  );
  await db.$disconnect();
}

main().catch((e) => {
  console.error("LỖI:", e instanceof Error ? e.message : e);
  process.exit(1);
});
