import { db } from "@/lib/db";
import { on, type DomainEventLite } from "@/lib/events/registry";
import {
  duDieuKienCap,
  maChungNhan,
  taoVerifyToken,
  tinhHanChoLuot,
} from "@/lib/elearning/certificate";
import type { YeuCauDeKhop } from "@/lib/elearning/requirement-match";

/**
 * EL-16 — CẤP CHỨNG NHẬN khi một lượt ghi danh khép lại.
 *
 * Đi qua DomainEvent chứ không nội tuyến trong `cuonKhoaSauKhiXongBai`, theo luật
 * kiến trúc: tiền/ghi danh đi transaction, còn thứ phát sinh sau thì đi sự kiện với
 * handler idempotent. Ở đây lý do cụ thể hơn nữa: `cuonKhoaSauKhiXongBai` được gọi
 * từ **bốn** đường ghi tiến độ khác nhau (đọc bài, nộp bài, chấm bài, điểm danh
 * buổi). Nhét việc cấp chứng nhận vào đó là chép cùng một khối logic vào bốn chỗ và
 * chờ chúng lệch nhau — đúng cái đã xảy ra với guard `REVOKED` ở EL-13.
 *
 * ⚠️ IDEMPOTENT bằng RÀNG BUỘC DB, không bằng "kiểm rồi mới ghi".
 * `TrnCertificate.enrollmentId` là `@unique`. `dispatch-events` chạy lại sự kiện khi
 * handler ném lỗi giữa chừng, và hai lần chạy song song có thể cùng vượt qua một
 * phép kiểm `findFirst`. Bắt P2002 rồi coi là xong mới là chống trùng thật.
 */

const str = (v: unknown): string => (v == null ? "" : String(v));

export async function onCapChungNhan(ev: DomainEventLite): Promise<void> {
  const enrollmentId = str((ev.payload as Record<string, unknown>).enrollmentId);
  if (!enrollmentId) return;

  const gd = await db.trnEnrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      userId: true,
      courseId: true,
      status: true,
      verifiedAt: true,
      revokedAt: true,
      centerId: true,
      orgUnitId: true,
      source: true,
      completedAt: true,
      assignment: { select: { courseVersionId: true } },
    },
  });
  if (!gd) return;

  // `TrnEnrollment` giữ `courseId` trần, KHÔNG có quan hệ `course` — đọc riêng.
  const khoa = await db.trnCourse.findUnique({
    where: { id: gd.courseId },
    select: {
      programId: true,
      program: { select: { validityMonths: true } },
      versions: {
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });
  if (!khoa) return;

  // Chưa đủ điều kiện thì THÔI, không ném lỗi: sự kiện tới trước lúc dữ liệu kịp
  // ổn định là chuyện thường, và ném lỗi ở đây chỉ làm hàng đợi quay vòng.
  if (!duDieuKienCap(gd)) return;

  // Phiên bản khoá: ưu tiên bản mà lượt giao đã GHIM. Không có (lượt sinh từ công
  // nhận tương đương / yêu cầu vị trí) thì lấy bản đang xuất bản.
  //
  // ⚠️ Không có bản nào thì DỪNG, không cấp. Chứng nhận nói "người này đạt nội dung
  // X"; không trỏ được vào một phiên bản đã chốt thì câu ấy không có nghĩa, và sửa
  // nội dung khoá sau đó sẽ đổi hồi tố thứ tấm chứng nhận đang chứng cho.
  const courseVersionId =
    gd.assignment?.courseVersionId ?? khoa.versions[0]?.id ?? null;
  if (!courseVersionId) {
    console.warn(
      "[elearning] không cấp chứng nhận: khoá chưa có phiên bản xuất bản",
      { enrollmentId, courseId: gd.courseId },
    );
    return;
  }

  const nv = await db.employee.findFirst({
    where: { userAccount: { id: gd.userId } },
    select: { employeeCode: true, fullName: true, departmentId: true },
  });
  const nguoiDung = await db.user.findUnique({
    where: { id: gd.userId },
    select: { name: true },
  });

  // ⚠️ ẢNH CHỤP, không join sống. Người đổi tên hay đổi mã nhân viên sau này KHÔNG
  // được làm sai bản PDF đã phát ra tay họ.
  const snapFullName = nv?.fullName ?? nguoiDung?.name ?? "(không rõ tên)";
  const snapEmployeeCode = nv?.employeeCode ?? "(chưa có mã NV)";

  const orgUnitPath = gd.orgUnitId
    ? (
        await db.orgUnit.findUnique({
          where: { id: gd.orgUnitId },
          select: { path: true },
        })
      )?.path ?? null
    : null;

  const yeuCauTho = await db.trnRequirement.findMany({
    where: { courseId: gd.courseId, status: "ACTIVE", deletedAt: null },
    select: {
      id: true,
      scopeKind: true,
      positionId: true,
      departmentId: true,
      levelTag: true,
      orgUnitId: true,
      validityMonths: true,
    },
  });

  // Yêu cầu giữ ID đơn vị, còn phép khớp cần PATH — vì một yêu cầu neo ở đơn vị CHA
  // phải áp cho cả nhánh dưới. Đổi id → path ở đây, một lượt, không N+1.
  const idDonVi = [
    ...new Set(yeuCauTho.map((y) => y.orgUnitId).filter((v): v is string => v != null)),
  ];
  const pathCua = new Map(
    idDonVi.length === 0
      ? []
      : (
          await db.orgUnit.findMany({
            where: { id: { in: idDonVi } },
            select: { id: true, path: true },
          })
        ).map((r) => [r.id, r.path] as const),
  );

  const yeuCau: YeuCauDeKhop[] = yeuCauTho.map((y) => ({
    id: y.id,
    scopeKind: String(y.scopeKind),
    positionId: y.positionId,
    departmentId: y.departmentId,
    levelTag: y.levelTag == null ? null : String(y.levelTag),
    orgUnitPath: y.orgUnitId ? pathCua.get(y.orgUnitId) ?? null : null,
    validityMonths: y.validityMonths,
  }));

  // Lượt đến từ CÔNG NHẬN TƯƠNG ĐƯƠNG: hạn tính từ ngày người ta thật sự đạt nội
  // dung đó, không từ ngày bấm nút công nhận (EL-09).
  const mocGoc =
    gd.source === "EQUIVALENCE"
      ? (
          await db.trnEquivalence.findFirst({
            where: { userId: gd.userId, courseId: gd.courseId },
            select: { originalEffectiveAt: true },
          })
        )?.originalEffectiveAt ?? null
      : null;

  const issuedAt = gd.completedAt ?? new Date();
  const han = tinhHanChoLuot({
    issuedAt,
    nguoi: {
      userId: gd.userId,
      departmentId: nv?.departmentId ?? null,
      orgUnitPath,
      positionId: null,
    },
    dsYeuCau: yeuCau,
    chuKyTuChuongTrinh: khoa.program?.validityMonths ?? null,
    mocGoc,
  });

  // ⚠️ Yêu cầu KHÔNG đối chiếu được thì phải để lại vết. Nếu một khoá tuân thủ có
  // chu kỳ 12 tháng nhưng phạm vi của nó là `POSITION` (bảng `Position` rỗng trên
  // prod) thì tấm chứng nhận rơi xuống bước 2/3 và có thể thành VÔ THỜI HẠN — im
  // lặng, đúng loại sai chỉ lộ ra sau chu kỳ đầu tiên.
  for (const k of han.khongDoiChieuDuoc) {
    console.warn("[elearning] yêu cầu không đối chiếu được khi cấp chứng nhận", {
      enrollmentId,
      requirementId: k.yeuCau.id,
      scopeKind: k.yeuCau.scopeKind,
      lyDo: k.lyDo,
      hauQua:
        han.nguon === "VO_THOI_HAN"
          ? "chứng nhận đang được cấp VÔ THỜI HẠN"
          : `hạn đang lấy từ ${han.nguon}`,
    });
  }

  const nam = issuedAt.getUTCFullYear();
  // Số thứ tự trong năm. Đếm rồi cộng một là có đua; ràng buộc `@unique` trên
  // `certCode` bắt được, và vòng thử lại bên dưới nhặt số kế tiếp.
  for (let lan = 0; lan < 5; lan++) {
    const soTrongNam = await db.trnCertificate.count({
      where: { certCode: { startsWith: `SR.CN.${nam}.` } },
    });
    try {
      await db.trnCertificate.create({
        data: {
          certCode: maChungNhan(nam, soTrongNam + 1 + lan),
          verifyToken: taoVerifyToken(),
          userId: gd.userId,
          courseId: gd.courseId,
          courseVersionId,
          programId: khoa.programId,
          enrollmentId: gd.id,
          issuedAt,
          validUntil: han.validUntil,
          status: "VALID",
          snapFullName,
          snapEmployeeCode,
          centerId: gd.centerId,
          orgUnitId: gd.orgUnitId,
        },
      });
      return;
    } catch (err) {
      const ma = (err as { code?: string }).code;
      if (ma !== "P2002") throw err;
      const truong = (err as { meta?: { target?: string[] } }).meta?.target ?? [];
      // Trùng `enrollmentId` ⇒ lượt này ĐÃ có chứng nhận. Đây là đường chạy lại
      // bình thường của hàng đợi sự kiện, không phải lỗi.
      if (truong.includes("enrollmentId")) return;
      // Trùng `certCode` hoặc `verifyToken` ⇒ đua số thứ tự. Thử lại.
    }
  }

  console.warn("[elearning] không sinh được mã chứng nhận sau 5 lần thử", {
    enrollmentId,
  });
}

export function registerElearningCertificateHandlers(): void {
  on("elearning.enrollment.completed", onCapChungNhan);
}
