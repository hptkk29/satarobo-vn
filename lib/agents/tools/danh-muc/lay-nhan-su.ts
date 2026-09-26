// lib/agents/tools/danh-muc/lay-nhan-su.ts — công cụ 3 `danh_muc.lay_nhan_su` (spec §9).
// Khuôn: `schema/nhan_su.schema.json` — id, ten, chuc_danh, co_so. Nhạy cảm TB.
//
// ── CHỈ BỐN TRƯỜNG, KHÔNG HƠN ────────────────────────────────────────────────────────
// Spec: "Chỉ id, ten, chuc_danh, co_so". Truy vấn `select` đúng các cột cần — SĐT, email,
// lương, CCCD, ngày sinh KHÔNG được nạp vào bộ nhớ, nên không có đường nào lỡ trả ra (một
// `include` trọn bảng rồi "nhớ bỏ bớt" là kiểu mã rò rỉ khi người sau thêm trường).
//
// ── ÁNH XẠ ───────────────────────────────────────────────────────────────────────────
// · `id` = `Employee.employeeCode` — mã nhân sự ổn định, duy nhất (mẫu xưởng "NV-G01"), dùng
//   làm khoá nối ở các công cụ khác. Không trả cuid nội bộ.
// · `co_so` = mã OrgUnit của `Employee.centerId`; `centerId = NULL` = nhân sự Hội sở ("HO").
//   KHÔNG đọc `Employee.orgUnitId`: bảng Employee không nằm trong cơ chế ghi kép/đối soát
//   (`lib/org/dual-write.ts`, `BACKFILL_SPECS`) nên cột đó có thể trống/lệch mà không ai báo.
// · `chuc_danh` = mã vai (chủ dự án chốt 26/09/2026) — luật chọn một vai ở `vai-nguoi.ts`.
//   Người không có tài khoản hoặc không có vai hiệu lực ⇒ "" (chưa gán, nói thật).
// · Mặc định bỏ người đã nghỉ; `bao_gom_da_nghi: true` thì trả cả (spec). "Đang làm" =
//   `status` ACTIVE/ON_LEAVE — KHÔNG đọc cột `isActive` cũ (không ràng buộc nào giữ hai cột
//   khớp nhau; `status` là cột Phase C1, mới hơn).
//
// ── PHẠM VI ──────────────────────────────────────────────────────────────────────────
// Lọc theo `ctx.phamViCoSo` ở TẦNG CÔNG CỤ (mã cơ sở của từng dòng phải nằm trong phạm vi).
// `scopedDb` của user dịch vụ neo Hội sở không hẹp đi được (xem README §5b) — rào thật là
// grant. Dòng có `centerId` không nối được với cây OrgUnit ⇒ LOẠI (không chứng minh được nó
// nằm trong phạm vi).
import { z } from "zod";
import { dinhNghiaCongCu } from "../kieu";
import { catTrang, kiemConTro, thamSoTrang } from "../trang";
import { docBanDoCoSo, maCoSoCua } from "../ban-do-co-so";
import { chonChucDanh } from "./vai-nguoi";

const nhanSu = z.object({
  id: z.string(),
  ten: z.string(),
  chuc_danh: z.string(),
  co_so: z.string(),
});

export type NhanSuAgent = z.infer<typeof nhanSu>;

export const layNhanSu = dinhNghiaCongCu({
  ten: "danh_muc.lay_nhan_su",
  moTa:
    "Danh sách nhân sự Sata Robo trong phạm vi được cấp: mã nhân sự, tên hiển thị nội bộ, chức danh " +
    "(mã vai — xem danh_muc.lay_chuc_danh) và mã cơ sở. Không có SĐT, email hay lương. Mặc định bỏ " +
    "người đã nghỉ việc; bao_gom_da_nghi = true để lấy cả.",
  cheDo: "doc",
  nhayCam: "tb",
  quyenCan: ["employees:view-public", "roles:view"],
  thamSo: z
    .object({
      co_so: z.string().min(1).max(32).optional(),
      bao_gom_da_nghi: z.boolean().optional(),
      ...thamSoTrang,
    })
    .strict(),
  coSoCuaThamSo: (i) => (i.co_so ? [i.co_so] : null),
  ketQua: z.array(nhanSu),
  dangDuLieu: "array",
  phienBanKhuon: "1.0",
  kiemThem: (i) => kiemConTro(i),
  async thucThi(ctx, i) {
    const phamVi = new Set(ctx.phamViCoSo);
    const ban = await docBanDoCoSo(ctx.sdb);

    const nguoi: {
      employeeCode: string;
      fullName: string;
      centerId: string | null;
      userAccount: { id: string } | null;
    }[] = await ctx.sdb.employee.findMany({
      where: i.bao_gom_da_nghi ? {} : { status: { in: ["ACTIVE", "ON_LEAVE"] } },
      orderBy: [{ employeeCode: "asc" }],
      select: { employeeCode: true, fullName: true, centerId: true, userAccount: { select: { id: true } } },
    });

    // Lọc phạm vi TRƯỚC khi tra vai — không tra quyền của người ngoài phạm vi.
    const trong = nguoi
      .map((n) => ({ n, ma: maCoSoCua(ban, n.centerId, "hoi_so") }))
      .filter((x): x is { n: (typeof nguoi)[number]; ma: string } => x.ma !== null && phamVi.has(x.ma));

    const userIds = trong.map((x) => x.n.userAccount?.id).filter((x): x is string => !!x);
    const vai: { userId: string; orgUnitId: string; role: { code: string } }[] =
      userIds.length === 0
        ? []
        : await ctx.sdb.userOrgRole.findMany({
            where: {
              userId: { in: userIds },
              status: "ACTIVE",
              effectiveFrom: { lte: ctx.now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: ctx.now } }],
              role: { isActive: true },
            },
            select: { userId: true, orgUnitId: true, role: { select: { code: true } } },
          });
    const vaiTheoUser = new Map<string, { code: string; orgUnitId: string }[]>();
    for (const v of vai) {
      const ds = vaiTheoUser.get(v.userId) ?? [];
      ds.push({ code: v.role.code, orgUnitId: v.orgUnitId });
      vaiTheoUser.set(v.userId, ds);
    }
    // Đơn vị làm việc = OrgUnit của cơ sở (hoặc HO) — để ưu tiên vai neo đúng chỗ.
    const orgUnitTheoMa = new Map([...ban.maTheoOrgUnit].map(([id, ma]) => [ma, id] as const));

    const ds: NhanSuAgent[] = trong.map(({ n, ma }) => ({
      id: n.employeeCode,
      ten: n.fullName,
      chuc_danh: n.userAccount
        ? chonChucDanh(vaiTheoUser.get(n.userAccount.id) ?? [], orgUnitTheoMa.get(ma) ?? null)
        : "",
      co_so: ma,
    }));
    return catTrang(ds, i, ctx.hanMuc);
  },
});
