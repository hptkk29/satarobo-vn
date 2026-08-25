import { z } from "zod";
import type { ActionConfig, ScopedDb } from "@/lib/actions/factory";
import { ActionError } from "@/lib/actions/factory";
import { orgUnitIdForCenter } from "@/lib/org/org-service";
import { dungHaiPhaGhiThuTu } from "@/lib/elearning/course-outline";
import { coSoCuaCauHoi } from "@/lib/elearning/question-bank";
import {
  dsMucSchema,
  kiemKhung,
  type Muc,
} from "@/lib/elearning/rubric-shape";

/**
 * EL-15b — DỰNG KHUNG CHẤM.
 *
 * ⚠️ Khung có hai đời sống, và ranh giới giữa chúng là thứ phải giữ chặt nhất —
 * cùng luật với đề thi, cùng lý do:
 *
 *  · **nháp** (`status = DRAFT`) — sửa gì cũng được;
 *  · **đã kích hoạt** (`ACTIVE`) — bộ tiêu chí, thang điểm và ngưỡng ĐÓNG BĂNG.
 *
 * Sửa tiêu chí của một khung đã chấm bài làm LỆCH ĐIỂM của mọi bài đã chấm, im
 * lặng — và điểm đó nằm trong hồ sơ nhân sự. `TrnRubricScore` trỏ `criterionId`,
 * nên xoá một tiêu chí là cắt luôn đường về của những điểm đã chấm.
 *
 * ⚠️ KHÔNG có khoá quyền thứ 18. Dựng khung dùng `elearning:content:author`, kích
 * hoạt dùng `elearning:content:publish` — y hệt đề thi, vì đây cũng là soạn và phát
 * hành nội dung giảng dạy.
 */

// ── Khung ──────────────────────────────────────────────────────────────────

const khungBaseSchema = z
  .object({
    /**
     * Mã khung, DUY NHẤT toàn hệ thống. Chữ hoa, số, gạch ngang.
     *
     * Có mã để người ta gọi tên khung trong tài liệu và biên bản mà không phải chép
     * một chuỗi `cuid` — và để đổi tên hiển thị không làm mất dấu vết.
     */
    code: z
      .string()
      .trim()
      .min(3, "Mã khung quá ngắn")
      .max(40)
      .regex(/^[A-Z0-9-]+$/, "Mã khung chỉ gồm chữ IN HOA, số và gạch ngang"),
    title: z.string().trim().min(3, "Tên khung quá ngắn").max(200),
    totalPoints: z.number().int().min(1).max(10_000),
    passPoints: z.number().int().min(0).max(10_000),
  })
  .strict();

export const taoKhungSchema = khungBaseSchema;
export type TaoKhungInput = z.infer<typeof taoKhungSchema>;

export const cauHinhTaoKhung: ActionConfig<TaoKhungInput, { rubricId: string }> = {
  name: "taoKhungCham",
  permission: "elearning:content:author",
  module: "elearning",
  entityType: "TrnRubric",
  auditAction: "CREATE",
  schema: taoKhungSchema,
  handler: async ({ db, actor, input }) => {
    const centerId = coSoCuaCauHoi(actor);
    // ⚠️ Gọi TƯỜNG MINH. Dual-write cố ý không đoán khi `centerId` là `null`, mà ở
    // bảng này `null` là giá trị THẬT (khung dùng chung toàn công ty) — trông chờ
    // nó thì khung chung có `orgUnitId` bỏ trống mà không ai để ý.
    const orgUnitId = await orgUnitIdForCenter(centerId);

    // Ngưỡng vượt thang là khung KHÔNG AI qua nổi. Chặn ngay lúc TẠO chứ không đợi
    // tới lúc kích hoạt: người soạn vừa gõ hai con số đó xong, họ sửa được ngay.
    if (input.passPoints > input.totalPoints) {
      throw new ActionError(
        "NGUONG_VUOT_THANG",
        `Ngưỡng đạt (${input.passPoints}) lớn hơn thang điểm (${input.totalPoints}) — không ai qua được`,
        "passPoints",
      );
    }

    const trung = await db.trnRubric.findFirst({
      where: { code: input.code },
      select: { id: true },
    });
    // ⚠️ Bắt TRÙNG MÃ ở đây thay vì để `P2002` bay lên: `code` là `@unique` TOÀN
    // HỆ THỐNG, nên một người ở CS1 có thể đụng mã của khung CS2 mà họ không có
    // quyền nhìn thấy. Thông báo phải nói "mã đã dùng", không nói "khung nào".
    if (trung) {
      throw new ActionError(
        "MA_DA_DUNG",
        `Mã "${input.code}" đã có khung khác dùng — chọn mã khác`,
        "code",
      );
    }

    const khung = await db.trnRubric.create({
      data: {
        code: input.code,
        title: input.title,
        totalPoints: input.totalPoints,
        passPoints: input.passPoints,
        status: "DRAFT",
        ownerUserId: actor.userId,
        centerId,
        orgUnitId,
      },
      select: { id: true },
    });

    return {
      entityId: khung.id,
      data: { rubricId: khung.id },
      newValues: {
        code: input.code,
        title: input.title,
        totalPoints: input.totalPoints,
        passPoints: input.passPoints,
      },
    };
  },
};

type TxDb = Parameters<Parameters<ScopedDb["$transaction"]>[0]>[0];

/**
 * Nạp khung QUA `scopedDb` — chính lượt đọc đó là cổng cách ly.
 *
 * `scopedDb` không che đường ghi, nên mọi đường sửa phải mượn một lượt ĐỌC. Bỏ
 * bước này thì `update` theo `id` sửa được khung của cơ sở khác.
 */
async function napKhung(db: ScopedDb, rubricId: string) {
  const khung = await db.trnRubric.findFirst({
    where: { id: rubricId, deletedAt: null },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      totalPoints: true,
      passPoints: true,
    },
  });
  if (!khung) throw new ActionError("NOT_FOUND", "Không tìm thấy khung chấm");
  return khung;
}

/**
 * Khung đã KHOÁ chưa.
 *
 * ⚠️ Khoá theo `status`, KHÔNG theo "đã chấm bài nào chưa". Đợi tới bài đầu tiên
 * mới khoá nghĩa là người soạn sửa được khung trong khoảng giữa lúc phát cho người
 * học và lúc người đầu tiên nộp — và hai người cùng nộp một bài bị chấm bằng hai
 * thước mà bảng điểm coi như một.
 */
function chanKhiDaKichHoat(
  khung: { status: string },
  viec: string,
): void {
  if (khung.status !== "DRAFT") {
    throw new ActionError(
      "KHUNG_DA_KICH_HOAT",
      `Khung đã kích hoạt — không ${viec} được nữa. Tạo khung mới nếu cần thay đổi.`,
    );
  }
}

export const suaKhungSchema = khungBaseSchema
  .extend({ rubricId: z.string().min(1) })
  .strict();
export type SuaKhungInput = z.infer<typeof suaKhungSchema>;

export const cauHinhSuaKhung: ActionConfig<SuaKhungInput, { id: string }> = {
  name: "suaKhungCham",
  permission: "elearning:content:author",
  module: "elearning",
  entityType: "TrnRubric",
  auditAction: "UPDATE",
  schema: suaKhungSchema,
  handler: async ({ db, input }) => {
    const khung = await napKhung(db, input.rubricId);
    chanKhiDaKichHoat(khung, "sửa thông số");

    if (input.passPoints > input.totalPoints) {
      throw new ActionError(
        "NGUONG_VUOT_THANG",
        `Ngưỡng đạt (${input.passPoints}) lớn hơn thang điểm (${input.totalPoints}) — không ai qua được`,
        "passPoints",
      );
    }

    if (input.code !== khung.code) {
      const trung = await db.trnRubric.findFirst({
        where: { code: input.code, NOT: { id: khung.id } },
        select: { id: true },
      });
      if (trung) {
        throw new ActionError(
          "MA_DA_DUNG",
          `Mã "${input.code}" đã có khung khác dùng — chọn mã khác`,
          "code",
        );
      }
    }

    await db.trnRubric.update({
      where: { id: khung.id },
      data: {
        code: input.code,
        title: input.title,
        totalPoints: input.totalPoints,
        passPoints: input.passPoints,
      },
    });

    return {
      entityId: khung.id,
      data: { id: khung.id },
      oldValues: {
        code: khung.code,
        title: khung.title,
        totalPoints: khung.totalPoints,
        passPoints: khung.passPoints,
      },
      newValues: {
        code: input.code,
        title: input.title,
        totalPoints: input.totalPoints,
        passPoints: input.passPoints,
      },
    };
  },
};

// ── Tiêu chí ───────────────────────────────────────────────────────────────

const tieuChiBaseSchema = z
  .object({
    label: z.string().trim().min(2, "Tên tiêu chí quá ngắn").max(200),
    description: z.union([z.null(), z.string().trim().max(2000)]).optional(),
    levels: dsMucSchema,
  })
  .strict();

export const themTieuChiSchema = tieuChiBaseSchema
  .extend({ rubricId: z.string().min(1) })
  .strict();
export type ThemTieuChiInput = z.infer<typeof themTieuChiSchema>;

export const cauHinhThemTieuChi: ActionConfig<
  ThemTieuChiInput,
  { criterionId: string }
> = {
  name: "themTieuChi",
  permission: "elearning:content:author",
  module: "elearning",
  entityType: "TrnRubricCriterion",
  auditAction: "CREATE",
  schema: themTieuChiSchema,
  handler: async ({ db, input }) => {
    const khung = await napKhung(db, input.rubricId);
    chanKhiDaKichHoat(khung, "thêm tiêu chí");

    const cuoi = await db.trnRubricCriterion.findFirst({
      where: { rubricId: khung.id },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });

    // `weight` = điểm mức CAO NHẤT của tiêu chí. Giữ một cột suy được để báo cáo và
    // màn soạn khỏi phải mở `levelsJson` ra tính lại — nhưng nó KHÔNG phải nguồn
    // sự thật: phép cộng thang điểm luôn đọc `levelsJson`.
    const weight = Math.max(...input.levels.map((m: Muc) => m.points));

    const tc = await db.trnRubricCriterion.create({
      data: {
        rubricId: khung.id,
        label: input.label,
        description: input.description ?? null,
        weight: Math.round(weight),
        orderIndex: (cuoi?.orderIndex ?? -1) + 1,
        levelsJson: input.levels,
      },
      select: { id: true },
    });

    return {
      entityId: tc.id,
      data: { criterionId: tc.id },
      newValues: { rubricId: khung.id, label: input.label, weight },
    };
  },
};

export const suaTieuChiSchema = tieuChiBaseSchema
  .extend({ criterionId: z.string().min(1) })
  .strict();
export type SuaTieuChiInput = z.infer<typeof suaTieuChiSchema>;

/**
 * Nạp tiêu chí QUA khung của nó — cổng cách ly nằm ở bảng CHA.
 *
 * ⚠️ `TrnRubricCriterion` KHÔNG mang cột đơn vị (đúng thiết kế), nên `scopedDb`
 * không lọc gì trên nó. Đọc thẳng bằng `criterionId` là sửa được tiêu chí của cơ
 * sở khác — cùng bẫy với các bảng con của đề thi.
 */
async function napTieuChi(db: ScopedDb, criterionId: string) {
  const tc = await db.trnRubricCriterion.findFirst({
    where: { id: criterionId },
    select: {
      id: true,
      rubricId: true,
      label: true,
      orderIndex: true,
      weight: true,
    },
  });
  if (!tc) throw new ActionError("NOT_FOUND", "Không tìm thấy tiêu chí");
  // Lượt đọc NÀY mới là cổng: khung đi qua `scopedDb`.
  const khung = await napKhung(db, tc.rubricId);
  return { tc, khung };
}

export const cauHinhSuaTieuChi: ActionConfig<SuaTieuChiInput, { id: string }> = {
  name: "suaTieuChi",
  permission: "elearning:content:author",
  module: "elearning",
  entityType: "TrnRubricCriterion",
  auditAction: "UPDATE",
  schema: suaTieuChiSchema,
  handler: async ({ db, input }) => {
    const { tc, khung } = await napTieuChi(db, input.criterionId);
    chanKhiDaKichHoat(khung, "sửa tiêu chí");

    const weight = Math.round(
      Math.max(...input.levels.map((m: Muc) => m.points)),
    );

    await db.trnRubricCriterion.update({
      where: { id: tc.id },
      data: {
        label: input.label,
        description: input.description ?? null,
        weight,
        levelsJson: input.levels,
      },
    });

    return {
      entityId: tc.id,
      data: { id: tc.id },
      oldValues: { label: tc.label, weight: tc.weight },
      newValues: { label: input.label, weight },
    };
  },
};

export const xoaTieuChiSchema = z
  .object({ criterionId: z.string().min(1) })
  .strict();
export type XoaTieuChiInput = z.infer<typeof xoaTieuChiSchema>;

export const cauHinhXoaTieuChi: ActionConfig<XoaTieuChiInput, { id: string }> = {
  name: "xoaTieuChi",
  permission: "elearning:content:author",
  module: "elearning",
  entityType: "TrnRubricCriterion",
  auditAction: "DELETE",
  schema: xoaTieuChiSchema,
  handler: async ({ db, input }) => {
    const { tc, khung } = await napTieuChi(db, input.criterionId);
    chanKhiDaKichHoat(khung, "xoá tiêu chí");

    await db.trnRubricCriterion.delete({ where: { id: tc.id } });

    return {
      entityId: tc.id,
      data: { id: tc.id },
      oldValues: { rubricId: khung.id, label: tc.label },
    };
  },
};

export const sapXepTieuChiSchema = z
  .object({
    rubricId: z.string().min(1),
    thuTu: z.array(z.string().min(1)).min(1).max(100),
  })
  .strict();
export type SapXepTieuChiInput = z.infer<typeof sapXepTieuChiSchema>;

export const cauHinhSapXepTieuChi: ActionConfig<
  SapXepTieuChiInput,
  { soTieuChi: number }
> = {
  name: "sapXepTieuChi",
  permission: "elearning:content:author",
  module: "elearning",
  entityType: "TrnRubric",
  auditAction: "UPDATE",
  schema: sapXepTieuChiSchema,
  handler: async ({ db, input }) => {
    const khung = await napKhung(db, input.rubricId);
    chanKhiDaKichHoat(khung, "sắp xếp tiêu chí");

    const hienCo = await db.trnRubricCriterion.findMany({
      where: { rubricId: khung.id },
      select: { id: true },
    });
    const tapHienCo = new Set(hienCo.map((x) => x.id));

    // ⚠️ Danh sách gửi lên phải PHỦ ĐỦ và KHÔNG THỪA. Thiếu một id thì tiêu chí đó
    // giữ `orderIndex` cũ và chen vào giữa các số mới — thứ tự trên màn hình khác
    // thứ tự trong DB, và không gì báo.
    if (
      input.thuTu.length !== hienCo.length ||
      new Set(input.thuTu).size !== input.thuTu.length ||
      input.thuTu.some((id) => !tapHienCo.has(id))
    ) {
      throw new ActionError(
        "THU_TU_KHONG_KHOP",
        "Danh sách sắp xếp không khớp bộ tiêu chí hiện tại — tải lại trang rồi thử lại",
        "thuTu",
      );
    }

    // Hai pha: `@@unique([rubricId, orderIndex])` đụng nhau nếu ghi thẳng số mới
    // đè lên số cũ. Pha 1 đẩy hết sang miền âm, pha 2 hạ về số thật.
    const { pha1, pha2 } = dungHaiPhaGhiThuTu(input.thuTu);
    await db.$transaction(async (t: TxDb) => {
      for (const b of pha1) {
        await t.trnRubricCriterion.update({
          where: { id: b.id },
          data: { orderIndex: b.orderIndex },
        });
      }
      for (const b of pha2) {
        await t.trnRubricCriterion.update({
          where: { id: b.id },
          data: { orderIndex: b.orderIndex },
        });
      }
    });

    return {
      entityId: khung.id,
      data: { soTieuChi: input.thuTu.length },
      newValues: { soTieuChi: input.thuTu.length },
    };
  },
};

// ── Kích hoạt ──────────────────────────────────────────────────────────────

export const kichHoatKhungSchema = z
  .object({ rubricId: z.string().min(1) })
  .strict();
export type KichHoatKhungInput = z.infer<typeof kichHoatKhungSchema>;

export const cauHinhKichHoatKhung: ActionConfig<
  KichHoatKhungInput,
  { soTieuChi: number; totalPoints: number }
> = {
  name: "kichHoatKhungCham",
  // Kích hoạt là đưa khung ra dùng thật ⇒ quyền XUẤT BẢN, không phải quyền soạn.
  permission: "elearning:content:publish",
  module: "elearning",
  entityType: "TrnRubric",
  auditAction: "UPDATE",
  schema: kichHoatKhungSchema,
  handler: async ({ db, input }) => {
    const khung = await napKhung(db, input.rubricId);
    if (khung.status !== "DRAFT") {
      throw new ActionError("KHUNG_DA_KICH_HOAT", "Khung này đã kích hoạt rồi");
    }

    const tieuChi = await db.trnRubricCriterion.findMany({
      where: { rubricId: khung.id },
      select: { levelsJson: true },
      orderBy: { orderIndex: "asc" },
    });

    // ⚠️ Đọc `levelsJson` QUA Zod, không tin cột. Một tiêu chí có `levelsJson` hỏng
    // khuôn sẽ làm màn chấm không dựng nổi ô nhập cho nó — và bài nộp treo lại y
    // như câu thi hỏng nội dung ở EL-14e. Bắt tại cổng là lần cuối còn sửa được.
    const doc = tieuChi.map((tc, i) => ({
      so: i + 1,
      r: dsMucSchema.safeParse(tc.levelsJson),
    }));
    const hong = doc.filter((d) => !d.r.success).map((d) => d.so);
    if (hong.length > 0) {
      throw new ActionError(
        "TIEU_CHI_HONG",
        `Không đọc được các mức của tiêu chí ${hong.join(", ")} — mở ra lưu lại rồi kích hoạt lại`,
      );
    }

    const loi = kiemKhung({
      totalPoints: khung.totalPoints,
      passPoints: khung.passPoints,
      tieuChi: doc.map((d) => ({ levels: d.r.success ? d.r.data : [] })),
    });
    if (loi.length > 0) {
      // Trả HẾT lỗi trong một lượt: bấm kích hoạt ba lần để lộ ra ba lỗi là cách
      // chắc chắn khiến người soạn bỏ dở.
      throw new ActionError(loi[0]!.ma, loi.map((l) => l.noi).join(" · "));
    }

    await db.trnRubric.update({
      where: { id: khung.id },
      data: { status: "ACTIVE" },
    });

    return {
      entityId: khung.id,
      data: { soTieuChi: tieuChi.length, totalPoints: khung.totalPoints },
      oldValues: { status: "DRAFT" },
      newValues: { status: "ACTIVE", soTieuChi: tieuChi.length },
    };
  },
};
