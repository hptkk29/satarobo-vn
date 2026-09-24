// @vitest-environment node
/**
 * [ZCG-*] — ĐẶT DANH SÁCH NGƯỜI ĐƯỢC GIAO MỘT NICK, ở TẦNG DB THẬT.
 * Đối tượng đo: `datGiaoNick` (`lib/integrations/zalocrm/giao-nick.ts`).
 *
 * ── VÌ SAO PHẢI LÀ DB THẬT, KHÔNG PHẢI MOCK ──────────────────────────────────────────
 * Ba thứ ở đây chỉ lộ ra khi Postgres chạy thật, và cả ba đều là đường mất quyền:
 *
 *  ① `deleteMany({ sataUserId: { notIn: [...] } })` với mảng RỖNG. Đo 24/09 bằng phép
 *    cấy: Prisma 5.22 dịch `notIn: []` thành điều kiện LUÔN ĐÚNG, nên hôm nay cả hai
 *    cách viết đều xoá hết và `[ZCG-03]` xanh ở cả hai. Ca ấy canh một NGÀY KHÁC: bản
 *    Prisma nào đổi `notIn: []` thành "không khớp gì" thì "gỡ hết" lặng lẽ không gỡ ai.
 *    Mock không thấy được sự khác nhau — chỉ Postgres thật mới trả lời được.
 *  ② Khoá duy nhất `[nickId, sataUserId]`. Cổng chống trùng ở tầng mã phải chặn TRƯỚC,
 *    nếu không Postgres ném `P2002` giữa giao dịch và người dùng đọc một lỗi 500.
 *  ③ `$transaction` + luật "cổng đứng TRƯỚC phép ghi đầu tiên" của repo: từ chối SAU
 *    khi đã xoá là gỡ sạch quyền rồi báo "không làm được" — đúng lớp lỗi mà
 *    `lib/finance/cong-truoc-phep-ghi.test.ts` sinh ra để canh, nhưng file này không
 *    nằm trong vùng quét của lưới ấy nên phải tự đo.
 *
 * ⚠️ Bộ này TỰ SKIP khi không có Postgres local. Thấy SKIP nghĩa là CHƯA KIỂM ĐƯỢC GÌ,
 * không phải "xanh". KHÔNG `resetDb()` — dọn theo TIỀN TỐ riêng (`tests/inbox` chạy
 * tuần tự chung một DB với các file khác).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

import { RUN_DB_TESTS, LY_DO_BO_QUA } from "../_helpers/db-gate";

const RUN = RUN_DB_TESTS;
if (!RUN) console.warn(`[zalocrm-giao-nick] SKIP: ${LY_DO_BO_QUA}`);

const db = new PrismaClient();

/** Bảng chưa có ⇒ SKIP kèm câu chỉ việc, đừng đổ một đống `P2021`. */
const CO_BANG =
  RUN &&
  (await db.zaloCrmNickGiao
    .count()
    .then(() => true)
    .catch(() => {
      console.warn(
        "[zalocrm-giao-nick] SKIP: chưa có bảng ZaloCrmNickGiao. Chạy `prisma migrate " +
          "deploy` trên DB test trước (migration zalocrm_giao_nick_nhieu_nguoi).",
      );
      return false;
    }));

/** Tiền tố RIÊNG — dùng lại `ZCRM_`/`ZCNA_`/`ZCCQ_` là bốn tệp dọn dữ liệu của nhau. */
const P = "ZCGN_";
const ORG = `${P}org1`;
const MA_CS = `${P}cs1`;
const MA_CS_KHAC = `${P}cs2`;
const NICK = `${P}acc-1`;

const nguoi = {
  loc: "",
  dieu: "",
  trang: "", // quản lý cơ sở
  ngoai: "", // sale của CƠ SỞ KHÁC
};
let idCoSo = "";
let idCoSoKhac = "";

async function purge() {
  const dv = await db.orgUnit.findMany({
    where: { code: { startsWith: P } },
    select: { id: true },
  });
  if (dv.length) {
    await db.userOrgRole.deleteMany({ where: { orgUnitId: { in: dv.map((d) => d.id) } } });
  }
  // `ZaloCrmNickGiao` cascade theo cả nick lẫn user, nhưng xoá tường minh cho chắc:
  // một dòng sót lại làm ca sau đọc trạng thái của ca trước (luật 18).
  const nicks = await db.zaloCrmNick.findMany({
    where: { orgCode: { startsWith: P } },
    select: { id: true },
  });
  if (nicks.length) {
    await db.zaloCrmNickGiao.deleteMany({ where: { nickId: { in: nicks.map((n) => n.id) } } });
  }
  await db.zaloCrmNick.deleteMany({ where: { orgCode: { startsWith: P } } });
  await db.user.deleteMany({ where: { name: { startsWith: P } } });
  await db.orgUnit.deleteMany({ where: { code: { startsWith: P } } });
  await db.center.deleteMany({ where: { code: { startsWith: P } } });
}

beforeAll(async () => {
  if (!CO_BANG) return;
  await purge();

  // `OrgUnit.code` khớp `Center.code` — cầu nối chuẩn của repo (`lib/org/center-bridge.ts`).
  const coSoMau = (ma: string) => ({
    code: ma,
    slug: ma.toLowerCase(),
    name: `${P} ${ma}`,
    address: "—",
  });
  const cs = await db.center.create({ data: coSoMau(MA_CS) });
  const csKhac = await db.center.create({ data: coSoMau(MA_CS_KHAC) });
  idCoSo = cs.id;
  idCoSoKhac = csKhac.id;
  const dv = await db.orgUnit.create({
    data: { code: MA_CS, name: `${P} ĐV 1`, type: "CENTER", path: `/${P}cs1/` },
  });
  const dvKhac = await db.orgUnit.create({
    data: { code: MA_CS_KHAC, name: `${P} ĐV 2`, type: "CENTER", path: `/${P}cs2/` },
  });

  // Vai phải là vai THẬT trong `RoleDef`: `nguoiDuocDungNick` lọc theo `role.code`, nên
  // một dòng vai bịa ra sẽ bị loại và mọi ca dưới xanh vì lý do sai.
  const vaiSale = await db.roleDef.findFirst({ where: { code: "CENTER_SALES_CSM" } });
  const vaiQL = await db.roleDef.findFirst({ where: { code: "CENTER_MANAGER" } });
  if (!vaiSale || !vaiQL) throw new Error("Chưa seed RoleDef — chạy `tsx prisma/seed-roles.ts`");

  // `UserOrgRole.grantedById` là NOT NULL — mọi lượt cấp vai phải chỉ ra AI cấp. Dựng
  // một tài khoản "người cấp" thay vì nhặt bừa một `User` có sẵn: bộ này chỉ được sở hữu
  // dữ liệu mang tiền tố của mình (`tests/inbox` chạy chung một DB).
  const nguoiCap = await db.user.create({
    data: { name: `${P}capvai`, email: `${P}capvai@vd.test`.toLowerCase(), role: "SUPER_ADMIN" },
  });

  async function taoNguoi(nhan: string, roleId: string, orgUnitId: string) {
    const u = await db.user.create({
      data: {
        name: `${P}${nhan}`,
        email: `${P}${nhan}@vd.test`.toLowerCase(),
        role: "SALES_CSM",
        isActive: true,
      },
    });
    await db.userOrgRole.create({
      data: {
        userId: u.id,
        orgUnitId,
        roleId,
        status: "ACTIVE",
        effectiveFrom: new Date(0),
        grantedById: nguoiCap.id,
      },
    });
    return u.id;
  }

  nguoi.loc = await taoNguoi("loc", vaiSale.id, dv.id);
  nguoi.dieu = await taoNguoi("dieu", vaiSale.id, dv.id);
  nguoi.trang = await taoNguoi("trang", vaiQL.id, dv.id);
  nguoi.ngoai = await taoNguoi("ngoai", vaiSale.id, dvKhac.id);
});

beforeEach(async () => {
  if (!CO_BANG) return;
  const cu = await db.zaloCrmNick.findUnique({ where: { zcrmAccountId: NICK } });
  if (cu) {
    await db.zaloCrmNickGiao.deleteMany({ where: { nickId: cu.id } });
    await db.zaloCrmNick.delete({ where: { id: cu.id } });
  }
  await db.zaloCrmNick.create({
    data: { zcrmAccountId: NICK, orgCode: ORG, centerId: idCoSo, displayName: `${P} Nick` },
  });
});

afterAll(async () => {
  if (CO_BANG) await purge();
  await db.$disconnect();
});

const QLCS = { isSuperAdmin: false, isHoLevel: false, visibleCenterIds: [] as string[] };
function actorThay(...ids: string[]) {
  return { ...QLCS, visibleCenterIds: ids };
}

/** Dòng giao đang lưu của nick, đã sắp theo `sataUserId` để so ổn định. */
async function dangLuu() {
  const n = await db.zaloCrmNick.findUniqueOrThrow({ where: { zcrmAccountId: NICK } });
  const ds = await db.zaloCrmNickGiao.findMany({
    where: { nickId: n.id },
    select: { sataUserId: true, mucQuyen: true },
  });
  return ds.sort((a, b) => a.sataUserId.localeCompare(b.sataUserId));
}

describe.skipIf(!CO_BANG)("datGiaoNick — đặt CẢ TẬP", () => {
  it("[ZCG-01] giao nhiều người, mỗi người một mức", async () => {
    const { datGiaoNick } = await import("@/lib/integrations/zalocrm/giao-nick");
    const kq = await datGiaoNick({
      actor: actorThay(idCoSo),
      zcrmAccountId: NICK,
      giao: [
        { sataUserId: nguoi.loc, mucQuyen: "chat" },
        { sataUserId: nguoi.dieu, mucQuyen: "read" },
      ],
    });
    expect(kq).toEqual({ ok: true, soDong: 2 });

    const luu = await dangLuu();
    expect(luu).toHaveLength(2);
    expect(luu.find((d) => d.sataUserId === nguoi.loc)?.mucQuyen).toBe("chat");
    expect(luu.find((d) => d.sataUserId === nguoi.dieu)?.mucQuyen).toBe("read");
  });

  it("[ZCG-02] lượt sau THAY cả tập — người bị bỏ ra sẽ bị GỠ", async () => {
    // Vế GỠ là vế không ai nhớ bấm và hỏng thì KHÔNG có triệu chứng: người không còn
    // phận sự vẫn đọc chat của khách. Đây là ca chính của cả tính năng.
    const { datGiaoNick } = await import("@/lib/integrations/zalocrm/giao-nick");
    await datGiaoNick({
      actor: actorThay(idCoSo),
      zcrmAccountId: NICK,
      giao: [
        { sataUserId: nguoi.loc, mucQuyen: "chat" },
        { sataUserId: nguoi.dieu, mucQuyen: "chat" },
      ],
    });
    await datGiaoNick({
      actor: actorThay(idCoSo),
      zcrmAccountId: NICK,
      giao: [{ sataUserId: nguoi.loc, mucQuyen: "admin" }],
    });

    const luu = await dangLuu();
    expect(luu.map((d) => d.sataUserId)).toEqual([nguoi.loc]);
    // ĐỐI CHỨNG ÂM — và mức của người còn lại phải ĐỔI THEO, không giữ giá trị cũ.
    expect(luu[0]?.mucQuyen).toBe("admin");
  });

  it("[ZCG-03] mảng RỖNG ⇒ gỡ hết, nick về 'cả cơ sở dùng chung'", async () => {
    // ⚠️ Ca này KHÔNG chứng minh nhánh `if (idGui.length)` trong `datGiaoNick` đang
    // gánh việc: đo 24/09 bằng phép cấy, bỏ nhánh ấy đi thì ca này VẪN XANH, vì Prisma
    // 5.22 coi `notIn: []` là điều kiện luôn đúng. Nó canh HÀNH VI ("gỡ hết là gỡ
    // thật"), và hành vi ấy hôm nay có hai đường cùng cho kết quả đúng.
    // Ngày nào một trong hai đường đổi, ca này đỏ — và điều ĐÓ thì đã đo: cấy
    // `{ sataUserId: { in: [] } }` (khớp 0 dòng) cho nhánh rỗng ⇒ đúng ca này đỏ.
    const { datGiaoNick } = await import("@/lib/integrations/zalocrm/giao-nick");
    await datGiaoNick({
      actor: actorThay(idCoSo),
      zcrmAccountId: NICK,
      giao: [{ sataUserId: nguoi.loc, mucQuyen: "chat" }],
    });
    expect(await dangLuu()).toHaveLength(1);

    const kq = await datGiaoNick({ actor: actorThay(idCoSo), zcrmAccountId: NICK, giao: [] });
    expect(kq).toEqual({ ok: true, soDong: 0 });
    expect(await dangLuu(), "gỡ hết mà dòng vẫn còn").toEqual([]);
  });

  it("[ZCG-04] dòng không đổi GIỮ NGUYÊN `createdAt` — không xoá-rồi-tạo", async () => {
    // Xoá sạch rồi tạo lại để một khoảng TRONG giao dịch mà nick không có ai, và làm
    // mất mốc "giao từ bao giờ" — thứ duy nhất trả lời được "ai giữ nick này từ khi nào".
    const { datGiaoNick } = await import("@/lib/integrations/zalocrm/giao-nick");
    await datGiaoNick({
      actor: actorThay(idCoSo),
      zcrmAccountId: NICK,
      giao: [{ sataUserId: nguoi.loc, mucQuyen: "chat" }],
    });
    const n = await db.zaloCrmNick.findUniqueOrThrow({ where: { zcrmAccountId: NICK } });
    const truoc = await db.zaloCrmNickGiao.findFirstOrThrow({
      where: { nickId: n.id, sataUserId: nguoi.loc },
    });

    await datGiaoNick({
      actor: actorThay(idCoSo),
      zcrmAccountId: NICK,
      giao: [
        { sataUserId: nguoi.loc, mucQuyen: "admin" },
        { sataUserId: nguoi.dieu, mucQuyen: "chat" },
      ],
    });
    const sau = await db.zaloCrmNickGiao.findFirstOrThrow({
      where: { nickId: n.id, sataUserId: nguoi.loc },
    });
    expect(sau.id, "dòng bị tạo lại ⇒ mất mốc giao").toBe(truoc.id);
    expect(sau.createdAt.getTime()).toBe(truoc.createdAt.getTime());
    expect(sau.mucQuyen).toBe("admin");
  });
});

describe.skipIf(!CO_BANG)("cổng — và chúng phải đứng TRƯỚC phép ghi", () => {
  it("[ZCG-05] người của CƠ SỞ KHÁC ⇒ từ chối, và KHÔNG ghi gì", async () => {
    const { datGiaoNick } = await import("@/lib/integrations/zalocrm/giao-nick");
    await datGiaoNick({
      actor: actorThay(idCoSo),
      zcrmAccountId: NICK,
      giao: [{ sataUserId: nguoi.loc, mucQuyen: "chat" }],
    });

    // Danh sách có MỘT người hợp lệ + MỘT người ngoài cơ sở. Lọc bớt người sai rồi ghi
    // phần còn lại là im lặng làm một việc KHÁC việc người dùng bấm.
    const kq = await datGiaoNick({
      actor: actorThay(idCoSo),
      zcrmAccountId: NICK,
      giao: [
        { sataUserId: nguoi.dieu, mucQuyen: "chat" },
        { sataUserId: nguoi.ngoai, mucQuyen: "admin" },
      ],
    });
    expect(kq).toEqual({ ok: false, ma: "NGUOI_NGOAI_CO_SO" });

    // 🔴 VẾ QUAN TRỌNG: trạng thái CŨ còn nguyên. Từ chối sau khi đã `deleteMany` là gỡ
    // sạch quyền rồi báo "không làm được" — luật rollback của repo.
    expect(await dangLuu()).toEqual([{ sataUserId: nguoi.loc, mucQuyen: "chat" }]);
  });

  it("[ZCG-06] nick NGOÀI TẦM NHÌN ⇒ từ chối, và KHÔNG ghi gì", async () => {
    const { datGiaoNick } = await import("@/lib/integrations/zalocrm/giao-nick");
    await datGiaoNick({
      actor: actorThay(idCoSo),
      zcrmAccountId: NICK,
      giao: [{ sataUserId: nguoi.loc, mucQuyen: "chat" }],
    });

    const kq = await datGiaoNick({
      // Quản lý CƠ SỞ KHÁC — `zcrmAccountId` đến từ trình duyệt nên không được tin.
      actor: actorThay(idCoSoKhac),
      zcrmAccountId: NICK,
      giao: [{ sataUserId: nguoi.dieu, mucQuyen: "admin" }],
    });
    expect(kq).toEqual({ ok: false, ma: "NICK_NGOAI_TAM_NHIN" });
    expect(await dangLuu()).toEqual([{ sataUserId: nguoi.loc, mucQuyen: "chat" }]);
  });

  it("[ZCG-07] TRÙNG người trong một lượt ⇒ từ chối ở tầng mã, không để P2002 nổ", async () => {
    const { datGiaoNick } = await import("@/lib/integrations/zalocrm/giao-nick");
    const kq = await datGiaoNick({
      actor: actorThay(idCoSo),
      zcrmAccountId: NICK,
      giao: [
        { sataUserId: nguoi.loc, mucQuyen: "read" },
        { sataUserId: nguoi.loc, mucQuyen: "admin" },
      ],
    });
    expect(kq).toEqual({ ok: false, ma: "TRUNG_NGUOI" });
    expect(await dangLuu()).toEqual([]);
  });

  it("[ZCG-08] nick CHƯA GẮN CƠ SỞ ⇒ mã lỗi đúng nguyên nhân", async () => {
    const { datGiaoNick } = await import("@/lib/integrations/zalocrm/giao-nick");
    const moCoi = `${P}acc-mo-coi`;
    await db.zaloCrmNick.create({
      data: { zcrmAccountId: moCoi, orgCode: ORG, centerId: null, displayName: `${P} mồ côi` },
    });
    const kq = await datGiaoNick({
      // Nick `centerId = null` nằm trong tầm nhìn của mọi actor (nhóm "chưa ánh xạ").
      actor: actorThay(idCoSo),
      zcrmAccountId: moCoi,
      giao: [{ sataUserId: nguoi.loc, mucQuyen: "chat" }],
    });
    expect(kq).toEqual({ ok: false, ma: "NICK_CHUA_CO_CO_SO" });
  });

  it("[ZCG-09] nick không tồn tại ⇒ từ chối, không tạo hộ", async () => {
    const { datGiaoNick } = await import("@/lib/integrations/zalocrm/giao-nick");
    const kq = await datGiaoNick({
      actor: actorThay(idCoSo),
      zcrmAccountId: `${P}khong-co`,
      giao: [],
    });
    expect(kq).toEqual({ ok: false, ma: "KHONG_THAY_NICK" });
  });
});

describe.skipIf(!CO_BANG)("cột cũ `ZaloCrmNick.sataUserId` — pha A của 2 pha", () => {
  it("[ZCG-10] một người ⇒ giữ id đó; nhiều hơn một ⇒ NULL", async () => {
    // Cột này KHÔNG còn đường nào đọc. Nó chỉ có nghĩa nếu ai đó lùi mã về bản trước
    // 24/09 — và lúc ấy "nhiều người" không diễn tả được, nên `null` ("cả cơ sở") là
    // cách nới rộng KHÔNG bỏ sót ai, còn giữ một cái tên cũ thì cắt mất những người kia.
    const { datGiaoNick } = await import("@/lib/integrations/zalocrm/giao-nick");
    const doc = async () =>
      (await db.zaloCrmNick.findUniqueOrThrow({ where: { zcrmAccountId: NICK } })).sataUserId;

    await datGiaoNick({
      actor: actorThay(idCoSo),
      zcrmAccountId: NICK,
      giao: [{ sataUserId: nguoi.loc, mucQuyen: "chat" }],
    });
    expect(await doc()).toBe(nguoi.loc);

    await datGiaoNick({
      actor: actorThay(idCoSo),
      zcrmAccountId: NICK,
      giao: [
        { sataUserId: nguoi.loc, mucQuyen: "chat" },
        { sataUserId: nguoi.dieu, mucQuyen: "chat" },
      ],
    });
    expect(await doc()).toBeNull();

    await datGiaoNick({ actor: actorThay(idCoSo), zcrmAccountId: NICK, giao: [] });
    expect(await doc()).toBeNull();
  });
});

describe.skipIf(!CO_BANG)("nguoiNhanDuocNick — ô chọn nhìn CÙNG sự thật với lượt đối soát", () => {
  it("[ZCG-11] trả đúng người của cơ sở, và đánh dấu QUẢN LÝ", async () => {
    // `laQuanLy` là thứ màn dùng để KHÔNG hứa một nút không tồn tại: quản lý cơ sở có
    // `admin` tự động nên không gỡ ở đó được (luật 12 — affordance).
    const { nguoiNhanDuocNick } = await import("@/lib/integrations/zalocrm/giao-nick");
    const ds = await nguoiNhanDuocNick(MA_CS);
    const theoId = new Map(ds.map((n) => [n.id, n]));

    expect([...theoId.keys()].sort()).toEqual([nguoi.loc, nguoi.dieu, nguoi.trang].sort());
    expect(theoId.get(nguoi.trang)?.laQuanLy, "Trang giữ CENTER_MANAGER").toBe(true);
    // ĐỐI CHỨNG ÂM — sale KHÔNG được đánh dấu quản lý, nếu không màn khoá nhầm mọi dòng.
    expect(theoId.get(nguoi.loc)?.laQuanLy).toBe(false);
    expect(theoId.has(nguoi.ngoai), "người cơ sở khác lọt vào ô chọn").toBe(false);
  });
});
