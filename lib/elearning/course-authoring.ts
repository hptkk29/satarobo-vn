import { z } from "zod";
import type { ActionConfig, ScopedDb } from "@/lib/actions/factory";
import { ActionError } from "@/lib/actions/factory";
import {
  chuyenViTri,
  dungHaiPhaGhiThuTu,
  kiemDanBai,
  type ChuongTrongDanBai,
} from "@/lib/elearning/course-outline";
import {
  chuyenTrangThai,
  laThayDoiMajor,
  phienBanKeTiep,
  tenBanSao,
  THONG_BAO_PHIEN_BAN,
  type TrangThaiPhienBan,
} from "@/lib/elearning/course-version";

/**
 * EL-08 — SOẠN KHOÁ: tạo khoá → chương → bài, sắp thứ tự, xuất bản có phiên bản.
 *
 * ⚠️ MÔ HÌNH LÀM VIỆC: mỗi khoá luôn giữ ĐÚNG MỘT phiên bản `DRAFT` làm **bản
 * làm việc**. Cờ `required` (bài bắt buộc / tuỳ chọn) sống trên
 * `TrnCourseVersionLesson` của bản nháp đó, KHÔNG trên `TrnLesson`.
 *
 * Vì sao không thêm cột `required` vào `TrnLesson` cho gọn: một bài có thể bắt
 * buộc ở phiên bản này và tuỳ chọn ở phiên bản sau. Đặt cờ trên bài là ép mọi
 * phiên bản dùng chung một câu trả lời, tức xoá luôn lý do tồn tại của phiên bản.
 *
 * ⚠️ Xuất bản KHÔNG sinh bản ghi mới cho tập bài — nó chỉ đổi trạng thái của bản
 * nháp đang có. Tập bài của bản đã phát vì thế ĐỨNG YÊN kể cả khi bản nháp kế
 * tiếp đang được sửa.
 */

// ── Trợ giúp chung ─────────────────────────────────────────────────────────

async function layKhoa(db: ScopedDb, courseId: string) {
  const c = await db.trnCourse.findFirst({
    where: { id: courseId, deletedAt: null },
    select: { id: true, code: true, title: true, status: true, programId: true },
  });
  if (!c) throw new ActionError("NOT_FOUND", "Không tìm thấy khoá học");
  return c;
}

/** Bản nháp đang làm việc. Tạo nếu chưa có — khoá nào cũng phải có một bản. */
async function banNhap(db: ScopedDb, courseId: string) {
  const co = await db.trnCourseVersion.findFirst({
    where: { courseId, status: "DRAFT" },
    select: { id: true, major: true, minor: true, status: true },
  });
  if (co) return co;

  const moiNhat = await db.trnCourseVersion.findFirst({
    where: { courseId },
    orderBy: [{ major: "desc" }, { minor: "desc" }],
    select: { major: true, minor: true },
  });
  const v = phienBanKeTiep(moiNhat ?? null, "MINOR");
  return db.trnCourseVersion.create({
    data: { courseId, major: v.major, minor: v.minor, status: "DRAFT" },
    select: { id: true, major: true, minor: true, status: true },
  });
}

async function docDanBai(db: ScopedDb, courseId: string): Promise<ChuongTrongDanBai[]> {
  const nhap = await banNhap(db, courseId);
  const modules = await db.trnModule.findMany({
    where: { courseId },
    orderBy: { orderIndex: "asc" },
    select: {
      id: true,
      title: true,
      lessons: {
        where: { deletedAt: null },
        orderBy: { orderIndex: "asc" },
        select: { id: true, title: true, kind: true, contentMd: true },
      },
    },
  });
  const links = await db.trnCourseVersionLesson.findMany({
    where: { versionId: nhap.id },
    select: { lessonId: true, required: true },
  });
  const batBuoc = new Map(links.map((l) => [l.lessonId, l.required]));

  return modules.map((m) => ({
    id: m.id,
    title: m.title,
    lessons: m.lessons.map((b) => ({
      id: b.id,
      title: b.title,
      kind: b.kind,
      contentMd: b.contentMd,
      // Bài chưa có dòng phiên bản ⇒ coi là BẮT BUỘC. Mặc định phía chặt: đoán
      // "tuỳ chọn" sẽ âm thầm bỏ bài đó khỏi điều kiện hoàn thành.
      required: batBuoc.get(b.id) ?? true,
    })),
  }));
}

// ── Tạo chương ─────────────────────────────────────────────────────────────

export const taoChuongSchema = z
  .object({ courseId: z.string().min(1), title: z.string().trim().min(1) })
  .strict();

export const cauHinhTaoChuong: ActionConfig<
  z.infer<typeof taoChuongSchema>,
  { moduleId: string }
> = {
  name: "taoChuong",
  permission: "elearning:content:author",
  module: "elearning",
  entityType: "TrnModule",
  auditAction: "CREATE",
  schema: taoChuongSchema,
  handler: async ({ db, input }) => {
    await layKhoa(db, input.courseId);
    const cuoi = await db.trnModule.findFirst({
      where: { courseId: input.courseId },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    const m = await db.trnModule.create({
      data: {
        courseId: input.courseId,
        title: input.title,
        orderIndex: (cuoi?.orderIndex ?? -1) + 1,
      },
      select: { id: true },
    });
    return {
      entityId: m.id,
      data: { moduleId: m.id },
      newValues: { title: input.title },
    };
  },
};

// ── Tạo bài ────────────────────────────────────────────────────────────────

export const taoBaiSchema = z
  .object({
    moduleId: z.string().min(1),
    title: z.string().trim().min(1),
    kind: z.enum(["READ", "VIDEO", "SCORM", "QUIZ", "TASK", "LIVE_SESSION"]),
    required: z.boolean().default(true),
  })
  .strict();

export const cauHinhTaoBai: ActionConfig<
  z.infer<typeof taoBaiSchema>,
  { lessonId: string }
> = {
  name: "taoBai",
  permission: "elearning:content:author",
  module: "elearning",
  entityType: "TrnLesson",
  auditAction: "CREATE",
  schema: taoBaiSchema,
  handler: async ({ db, input }) => {
    const m = await db.trnModule.findFirst({
      where: { id: input.moduleId },
      select: { id: true, courseId: true },
    });
    if (!m) throw new ActionError("NOT_FOUND", "Không tìm thấy chương");

    const cuoi = await db.trnLesson.findFirst({
      where: { moduleId: m.id },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    const nhap = await banNhap(db, m.courseId);

    const b = await db.trnLesson.create({
      data: {
        moduleId: m.id,
        title: input.title,
        kind: input.kind,
        orderIndex: (cuoi?.orderIndex ?? -1) + 1,
      },
      select: { id: true },
    });

    // Gắn ngay vào bản nháp: bài không có dòng phiên bản là bài vô hình với mọi
    // phép đếm điều kiện hoàn thành.
    await db.trnCourseVersionLesson.create({
      data: {
        versionId: nhap.id,
        lessonId: b.id,
        orderIndex: (cuoi?.orderIndex ?? -1) + 1,
        required: input.required,
        contentHash: "",
      },
    });

    return {
      entityId: b.id,
      data: { lessonId: b.id },
      newValues: { title: input.title, kind: input.kind, required: input.required },
    };
  },
};

// ── Sắp thứ tự (kéo thả) ───────────────────────────────────────────────────

export const sapThuTuSchema = z
  .object({
    loai: z.enum(["CHUONG", "BAI"]),
    /** `courseId` khi sắp chương, `moduleId` khi sắp bài. */
    parentId: z.string().min(1),
    id: z.string().min(1),
    viTriMoi: z.number().int().min(0),
  })
  .strict();

export const cauHinhSapThuTu: ActionConfig<
  z.infer<typeof sapThuTuSchema>,
  { thuTu: string[] }
> = {
  name: "sapThuTu",
  permission: "elearning:content:author",
  module: "elearning",
  entityType: "TrnCourse",
  auditAction: "UPDATE",
  schema: sapThuTuSchema,
  handler: async ({ db, input }) => {
    const hienTai =
      input.loai === "CHUONG"
        ? await db.trnModule.findMany({
            where: { courseId: input.parentId },
            orderBy: { orderIndex: "asc" },
            select: { id: true },
          })
        : await db.trnLesson.findMany({
            where: { moduleId: input.parentId, deletedAt: null },
            orderBy: { orderIndex: "asc" },
            select: { id: true },
          });

    const moi = chuyenViTri(
      hienTai.map((x: { id: string }) => x.id),
      input.id,
      input.viTriMoi,
    );
    const { pha1, pha2 } = dungHaiPhaGhiThuTu(moi);

    // ⚠️ HAI PHA trong CÙNG một transaction. Ghi thẳng số mới sẽ va
    // `@@unique([courseId, orderIndex])` / `@@unique([moduleId, orderIndex])` ngay
    // ở bước đầu, vì lúc đó vẫn còn phần tử mang số đích.
    await db.$transaction(async (tx) => {
      for (const b of [...pha1, ...pha2]) {
        if (input.loai === "CHUONG") {
          await tx.trnModule.update({
            where: { id: b.id },
            data: { orderIndex: b.orderIndex },
          });
        } else {
          await tx.trnLesson.update({
            where: { id: b.id },
            data: { orderIndex: b.orderIndex },
          });
        }
      }
    });

    return {
      entityId: input.parentId,
      data: { thuTu: moi },
      newValues: { loai: input.loai, soPhanTu: moi.length },
    };
  },
};

// ── Bắt buộc / tuỳ chọn + học tuần tự ──────────────────────────────────────

export const datBatBuocSchema = z
  .object({
    courseId: z.string().min(1),
    lessonId: z.string().min(1),
    required: z.boolean(),
  })
  .strict();

export const cauHinhDatBatBuoc: ActionConfig<
  z.infer<typeof datBatBuocSchema>,
  { required: boolean }
> = {
  name: "datBaiBatBuoc",
  permission: "elearning:content:author",
  module: "elearning",
  entityType: "TrnCourseVersionLesson",
  auditAction: "UPDATE",
  schema: datBatBuocSchema,
  handler: async ({ db, input }) => {
    await layKhoa(db, input.courseId);
    const nhap = await banNhap(db, input.courseId);

    // ⚠️ CHỈ sửa được trên BẢN NHÁP. Sửa cờ trên bản đã xuất bản là đổi điều kiện
    // hoàn thành dưới chân người đang học — đúng thứ mà phiên bản sinh ra để chống.
    await db.trnCourseVersionLesson.upsert({
      where: { versionId_lessonId: { versionId: nhap.id, lessonId: input.lessonId } },
      update: { required: input.required },
      create: {
        versionId: nhap.id,
        lessonId: input.lessonId,
        orderIndex: 0,
        required: input.required,
        contentHash: "",
      },
    });

    return {
      entityId: input.lessonId,
      data: { required: input.required },
      newValues: { required: input.required, phienBan: `v${nhap.major}.${nhap.minor}` },
    };
  },
};

export const datTuanTuSchema = z
  .object({ courseId: z.string().min(1), sequential: z.boolean() })
  .strict();

export const cauHinhDatTuanTu: ActionConfig<
  z.infer<typeof datTuanTuSchema>,
  { sequential: boolean }
> = {
  name: "datHocTuanTu",
  permission: "elearning:content:author",
  module: "elearning",
  entityType: "TrnCourse",
  auditAction: "UPDATE",
  schema: datTuanTuSchema,
  handler: async ({ db, input }) => {
    const c = await layKhoa(db, input.courseId);
    await db.trnCourse.update({
      where: { id: c.id },
      data: { sequential: input.sequential },
    });
    return {
      entityId: c.id,
      data: { sequential: input.sequential },
      newValues: { sequential: input.sequential },
    };
  },
};

// ── Vòng đời xuất bản ──────────────────────────────────────────────────────

export const vongDoiSchema = z
  .object({
    courseId: z.string().min(1),
    hanhDong: z.enum(["GUI_DUYET", "TRA_LAI", "DUYET", "XUAT_BAN", "LUU_TRU"]),
  })
  .strict();

export const cauHinhVongDoiKhoa: ActionConfig<
  z.infer<typeof vongDoiSchema>,
  { trangThai: string; phienBan: string; loi: { code: string; chiTiet: string }[] }
> = {
  name: "vongDoiKhoa",
  // Xuất bản là quyền RIÊNG, khác quyền soạn: người soạn nội dung không tự quyết
  // được lúc nào nội dung của mình đi ra với cả công ty.
  permission: "elearning:content:publish",
  module: "elearning",
  entityType: "TrnCourseVersion",
  auditAction: "UPDATE",
  requireReason: true,
  schema: vongDoiSchema,
  handler: async ({ db, actor, input, reason }) => {
    const c = await layKhoa(db, input.courseId);

    const ban =
      input.hanhDong === "LUU_TRU"
        ? await db.trnCourseVersion.findFirst({
            where: { courseId: c.id, status: "PUBLISHED" },
            orderBy: [{ major: "desc" }, { minor: "desc" }],
            select: { id: true, major: true, minor: true, status: true },
          })
        : await db.trnCourseVersion.findFirst({
            where: {
              courseId: c.id,
              status: { in: ["DRAFT", "PENDING_REVIEW", "APPROVED"] },
            },
            orderBy: [{ major: "desc" }, { minor: "desc" }],
            select: { id: true, major: true, minor: true, status: true },
          });
    if (!ban) {
      throw new ActionError("NOT_FOUND", "Không tìm thấy phiên bản phù hợp cho thao tác này");
    }

    const danBai = await docDanBai(db, c.id);
    const kiem = kiemDanBai(danBai);

    const ket = chuyenTrangThai({
      tu: ban.status as TrangThaiPhienBan,
      hanhDong: input.hanhDong,
      danBaiHopLe: kiem.ok,
    });
    if (!ket.ok) {
      throw new ActionError(ket.code, THONG_BAO_PHIEN_BAN[ket.code]);
    }

    await db.$transaction(async (tx) => {
      await tx.trnCourseVersion.update({
        where: { id: ban.id },
        data: {
          status: ket.toi,
          changeNote: reason,
          ...(ket.toi === "APPROVED" ? { approvedByUserId: actor.userId } : {}),
          ...(ket.toi === "PUBLISHED"
            ? { publishedByUserId: actor.userId, publishedAt: new Date() }
            : {}),
        },
      });

      // Trạng thái KHOÁ đi theo trạng thái bản mới nhất — nhưng chỉ ở hai mốc có
      // nghĩa với người học: đã phát ra, và đã ngừng phát.
      if (ket.toi === "PUBLISHED") {
        await tx.trnCourse.update({
          where: { id: c.id },
          data: { status: "PUBLISHED", publishedAt: new Date() },
        });
      } else if (ket.toi === "ARCHIVED") {
        await tx.trnCourse.update({ where: { id: c.id }, data: { status: "ARCHIVED" } });
      }
    });

    return {
      entityId: ban.id,
      data: {
        trangThai: ket.toi,
        phienBan: `v${ban.major}.${ban.minor}`,
        loi: kiem.loi,
      },
      oldValues: { status: ban.status },
      newValues: { status: ket.toi, phienBan: `v${ban.major}.${ban.minor}` },
    };
  },
};

// ── Nhân bản khoá ──────────────────────────────────────────────────────────

export const nhanBanSchema = z.object({ courseId: z.string().min(1) }).strict();

export const cauHinhNhanBanKhoa: ActionConfig<
  z.infer<typeof nhanBanSchema>,
  { courseId: string; code: string }
> = {
  name: "nhanBanKhoa",
  permission: "elearning:content:author",
  module: "elearning",
  entityType: "TrnCourse",
  auditAction: "CREATE",
  schema: nhanBanSchema,
  handler: async ({ db, actor, input }) => {
    const goc = await db.trnCourse.findFirst({
      where: { id: input.courseId, deletedAt: null },
      select: {
        id: true,
        code: true,
        title: true,
        slug: true,
        summary: true,
        programId: true,
        sequential: true,
        securityLevel: true,
        visibility: true,
        estimatedMinutes: true,
        centerId: true,
        orgUnitId: true,
      },
    });
    if (!goc) throw new ActionError("NOT_FOUND", "Không tìm thấy khoá để nhân bản");

    // Tìm hậu tố còn trống. Nhân bản lần thứ hai của cùng một khoá là chuyện
    // thường — Đào tạo dựng nhiều biến thể từ một khoá gốc.
    let ten: ReturnType<typeof tenBanSao> | null = null;
    for (let lan = 1; lan <= 20; lan += 1) {
      const thu = tenBanSao({ code: goc.code, title: goc.title, lan });
      const trung = await db.trnCourse.findFirst({
        where: { OR: [{ code: thu.code }, { slug: thu.slug }] },
        select: { id: true },
      });
      if (!trung) {
        ten = thu;
        break;
      }
    }
    if (!ten) throw new ActionError("CONFLICT", "Quá nhiều bản sao của khoá này");

    const moi = await db.$transaction(async (tx) => {
      const c = await tx.trnCourse.create({
        data: {
          code: ten.code,
          slug: ten.slug,
          title: ten.title,
          summary: goc.summary,
          programId: goc.programId,
          sequential: goc.sequential,
          securityLevel: goc.securityLevel,
          // ⚠️ Bản sao LUÔN về nháp và LUÔN `ASSIGNED_ONLY`, bất kể bản gốc thế
          // nào: nhân bản một khoá đang phát ra mà giữ nguyên trạng thái là phát
          // ngay một bản chưa ai xem lại.
          status: "DRAFT",
          visibility: "ASSIGNED_ONLY",
          selfEnrollEnabled: false,
          estimatedMinutes: goc.estimatedMinutes,
          centerId: goc.centerId,
          orgUnitId: goc.orgUnitId,
          clonedFromCourseId: goc.id,
          ownerUserId: actor.userId,
          createdById: actor.userId,
        },
        select: { id: true, code: true },
      });

      const modules = await tx.trnModule.findMany({
        where: { courseId: goc.id },
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          title: true,
          orderIndex: true,
          lessons: {
            where: { deletedAt: null },
            orderBy: { orderIndex: "asc" },
            select: {
              title: true,
              kind: true,
              orderIndex: true,
              contentMd: true,
              minReadSeconds: true,
            },
          },
        },
      });

      for (const m of modules) {
        const mm = await tx.trnModule.create({
          data: { courseId: c.id, title: m.title, orderIndex: m.orderIndex },
          select: { id: true },
        });
        for (const b of m.lessons) {
          await tx.trnLesson.create({
            data: {
              moduleId: mm.id,
              title: b.title,
              kind: b.kind,
              orderIndex: b.orderIndex,
              contentMd: b.contentMd,
              minReadSeconds: b.minReadSeconds,
            },
          });
        }
      }

      return c;
    });

    return {
      entityId: moi.id,
      data: { courseId: moi.id, code: moi.code },
      newValues: { code: moi.code, nhanBanTu: goc.code },
    };
  },
};

/** Dùng cho màn soạn: trả dàn bài + danh sách lỗi để hiện ngay, không đợi bấm. */
export async function docDanBaiChoMan(db: ScopedDb, courseId: string) {
  const chuong = await docDanBai(db, courseId);
  return { chuong, kiem: kiemDanBai(chuong) };
}

export { laThayDoiMajor };
