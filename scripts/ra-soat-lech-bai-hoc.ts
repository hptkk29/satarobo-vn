/**
 * RÀ SOÁT LỆCH TÊN BÀI HỌC — CHỈ ĐỌC.
 *
 * Nối tiếp `docs/dieu-tra-lech-bai-hoc.md` (Bước 1). Đo 7 phép A–G để trả lời:
 * bao nhiêu lớp lệch, lệch kiểu gì, và bao nhiêu buổi lệch ĐÃ DẠY RỒI (không được đụng).
 *
 * ⚠️ SCRIPT NÀY KHÔNG GHI GÌ. Không `create`/`update`/`delete`/`upsert`, không
 * `$executeRaw`. Chạy được bằng tài khoản chỉ có quyền đọc. Kiểm nhanh:
 *     grep -nE "create|update|delete|upsert|executeRaw" scripts/ra-soat-lech-bai-hoc.ts
 * chỉ được ra đúng dòng này và dòng chú thích.
 *
 * DÙNG LẠI HÀM THẬT, không chép logic:
 *   · số buổi  → `buildSessionNumberMap`   (lib/lms/session-order.ts)
 *   · tên in ra → `deriveSessionLabel`     (lib/lms/session-project-name.ts) — ĐÚNG hàm site GV in
 * Chép lại hai thứ này là đo một hệ thống khác với hệ thống người dùng đang nhìn.
 *
 * CHẠY:
 *   DATABASE_URL='<chuỗi kết nối>' pnpm exec tsx scripts/ra-soat-lech-bai-hoc.ts
 *   ... --lop=CS2.SATA6.26.001,CS2.SATA4.26.001   # đối chiếu từng buổi + truy vết đợt ghi
 */
import { PrismaClient } from "@prisma/client";
import { buildSessionNumberMap } from "../lib/lms/session-order";
import { deriveSessionLabel } from "../lib/lms/session-project-name";

// Ưu tiên biến RIÊNG cho lần đo prod, để không phải đụng `DATABASE_URL` của máy.
// Nhớ dùng cổng 5432 (session pooler): qua 6543 script chết ở
// `prepared statement "s8" does not exist`.
const BIEN = process.env.PROD_READONLY_URL ? "PROD_READONLY_URL" : "DATABASE_URL";
const CHUOI = process.env.PROD_READONLY_URL ?? process.env.DATABASE_URL ?? "";
const db = new PrismaClient({ datasources: { db: { url: CHUOI } } });

const argLop = process.argv.find((a) => a.startsWith("--lop="))?.slice(6) ?? "";
const LOP_MAU = argLop ? argLop.split(",").map((s) => s.trim()).filter(Boolean) : [];

/** Che mật khẩu — chuỗi kết nối không bao giờ được in nguyên. */
function nguonDb(): string {
  const raw = CHUOI || "(không có chuỗi kết nối)";
  try {
    const u = new URL(raw);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(chuỗi kết nối không đọc được)";
  }
}

type Buoi = {
  id: string;
  classId: string;
  date: Date;
  lessonId: string | null;
  planId: string | null;
  topic: string | null;
  status: string;
  completedAt: Date | null;
  createdAt: Date;
};

async function main() {
  console.log(`# RÀ SOÁT LỆCH BÀI HỌC — chỉ đọc`);
  console.log(`DB: ${nguonDb()}   [biến: ${BIEN}]`);
  console.log(`Lúc: ${new Date().toISOString()}`);
  console.log("");

  // ── nạp dữ liệu (toàn bộ SELECT) ─────────────────────────────────────────
  const classes = await db.class.findMany({
    where: { deletedAt: null },
    select: {
      id: true, name: true, classCode: true, status: true,
      courseId: true, curriculumId: true, curriculumVersion: true,
      course: { select: { name: true } },
    },
  });

  const sessions = (await db.classSession.findMany({
    select: {
      id: true, classId: true, date: true, lessonId: true, planId: true,
      topic: true, status: true, completedAt: true, createdAt: true,
    },
  })) as Buoi[];

  const lessons = await db.lesson.findMany({
    select: { id: true, curriculumId: true, order: true, title: true, moduleCode: true },
  });
  const lessonById = new Map(lessons.map((l) => [l.id, l]));

  // Q4 — tra một CHUỖI CHÉP xem nó có trùng tên bài nào không, và của giáo trình nào.
  // So sau khi trim + hạ chữ thường. ⚠️ KHÔNG gỡ tiền tố "HPn - " (xem `stripModulePrefix`
  // trong session-project-name.ts): chuỗi mang tiền tố sẽ rơi vào nhóm "không trùng" —
  // đó là hạn chế đã biết của phép đo này, không phải kết luận.
  const chuanHoa = (t: string) => t.trim().toLowerCase();
  const giaoTrinhCoTen = new Map<string, Set<string>>();
  for (const l of lessons) {
    const k = chuanHoa(l.title);
    const set = giaoTrinhCoTen.get(k) ?? new Set<string>();
    set.add(l.curriculumId);
    giaoTrinhCoTen.set(k, set);
  }
  /** 0 = không trùng bài nào · 1 = trùng bài CỦA LỚP · 2 = trùng bài giáo trình KHÁC. */
  const phanLoaiChuoi = (t: string | null | undefined, curId: string | null): 0 | 1 | 2 => {
    const k = chuanHoa(t ?? "");
    if (!k) return 0;
    const set = giaoTrinhCoTen.get(k);
    if (!set) return 0;
    return curId && set.has(curId) ? 1 : 2;
  };

  const curricula = await db.curriculum.findMany({
    select: { id: true, courseId: true, version: true, isActive: true },
  });

  const plans = await db.classSessionPlan.findMany({
    select: { id: true, classId: true, seq: true, order: true, lessonId: true, customTitle: true },
  });
  const planById = new Map(plans.map((p) => [p.id, p]));

  // Mốc "ĐÃ DẠY" — đo TỪNG dấu vết riêng, không gộp sẵn (xem §F trong báo cáo).
  const [diemDanh, nhanXet, anh] = await Promise.all([
    db.attendance.groupBy({ by: ["sessionId"], _count: { _all: true } }),
    db.studentSessionFeedback.groupBy({ by: ["classSessionId"], _count: { _all: true } }),
    db.classSessionMedia.groupBy({ by: ["classSessionId"], _count: { _all: true } }),
  ]);
  const coDiemDanh = new Set(diemDanh.map((r) => r.sessionId));
  const coNhanXet = new Set(nhanXet.map((r) => r.classSessionId));
  const coAnh = new Set(anh.map((r) => r.classSessionId).filter((x): x is string => !!x));

  // Q5 — HỌC BẠ ở cấp LỚP. `ReportCard` gắn 1-1 `Enrollment`, KHÔNG trỏ ClassSession,
  // nên mốc "đã dạy" theo buổi không bao giờ thấy nó. Phải chặn re-map ở cấp lớp.
  // `enrollmentId` là REF PHẲNG (không có quan hệ Prisma — xem chú thích trong schema),
  // nên phải tra vòng qua `Enrollment` chứ không `include` được.
  const hocBa = await db.reportCard.findMany({
    select: { publishedAt: true, enrollmentId: true },
  });
  const ghiDanh = await db.enrollment.findMany({
    where: { id: { in: hocBa.map((r) => r.enrollmentId) } },
    select: { id: true, classId: true },
  });
  const lopCuaGhiDanh = new Map(ghiDanh.map((e) => [e.id, e.classId]));
  const lopCoHocBa = new Set<string>();
  const lopHocBaDaPhatHanh = new Set<string>();
  for (const r of hocBa) {
    const cid = lopCuaGhiDanh.get(r.enrollmentId);
    if (!cid) continue;
    lopCoHocBa.add(cid);
    if (r.publishedAt !== null) lopHocBaDaPhatHanh.add(cid);
  }

  // Giáo trình HIỆU LỰC của lớp: ghim trước, không ghim thì bản isActive version cao nhất
  // của khoá — khớp nhánh fallback của `lib/classes/generate.ts:170-176`.
  // ⚠️ SỬA 08/09 — KHÔNG tự chọn version cao nhất khi khoá có ≥2 bản `isActive`.
  // `generate.ts` dùng `findFirst({where:{courseId,isActive}, orderBy:{version:desc}})`,
  // nhưng buổi có thể đã được gán từ lâu theo bản khác. Đoán bừa ở đây là biến phép đo A
  // thành số bịa. Khoá nhập nhằng ⇒ ĐÁNH DẤU "không kết luận được", liệt kê riêng.
  const activeTheoCourse = new Map<string, string>();
  const soActiveTheoCourse = new Map<string, number>();
  for (const c of curricula) {
    if (!c.isActive) continue;
    soActiveTheoCourse.set(c.courseId, (soActiveTheoCourse.get(c.courseId) ?? 0) + 1);
  }
  for (const c of [...curricula].sort((a, b) => b.version - a.version)) {
    if (c.isActive && (soActiveTheoCourse.get(c.courseId) ?? 0) === 1) {
      activeTheoCourse.set(c.courseId, c.id);
    }
  }
  const khoaNhapNhang = [...soActiveTheoCourse.entries()].filter(([, n]) => n >= 2);
  const lessonsTheoCur = new Map<string, { id: string; order: number; title: string; moduleCode: string | null }[]>();
  for (const l of lessons) {
    const arr = lessonsTheoCur.get(l.curriculumId) ?? [];
    arr.push(l);
    lessonsTheoCur.set(l.curriculumId, arr);
  }
  for (const arr of lessonsTheoCur.values()) arr.sort((a, b) => a.order - b.order);

  const buoiTheoLop = new Map<string, Buoi[]>();
  for (const s of sessions) {
    const arr = buoiTheoLop.get(s.classId) ?? [];
    arr.push(s);
    buoiTheoLop.set(s.classId, arr);
  }

  type DongLop = {
    ma: string; khoa: string; trangThai: string;
    tongBuoi: number; tongBai: number;
    A_khacGiaoTrinh: number; A_lessonNull: number;
    B_lechThuTu: number; B_kieu: string; B_lechMax: number;
    C_chenh: number;
    D_baiMoCoi: number; D_baiTrung: number;
    E_planTitleChe: number; E_topicChe: number;
    F_lechDaDay: number; F_lechChuaDienRa: number;
    coLech: boolean;
  };
  const bang: DongLop[] = [];
  /** Phân rã mốc "đã dạy": mỗi dấu vết đếm ĐỘC LẬP (một buổi có thể vào nhiều ô). */
  const dauVet = { status: 0, completedAt: 0, diemDanh: 0, nhanXet: 0, anh: 0, hop: 0 };
  /** Q4 — phân loại chuỗi chép đang che FK. */
  const q4 = {
    planTrungBaiCuaLop: 0, planTrungBaiKhac: 0, planKhongTrung: 0,
    topicTrungBaiCuaLop: 0, topicTrungBaiKhac: 0, topicKhongTrung: 0,
  };
  /** Q2 — buổi KHÔNG có dấu vết nào nhưng nằm DƯỚI mốc nước cao của lớp. */
  let cuuNhoMocNuoc = 0;
  for (const s of sessions) {
    let co = false;
    if (s.status === "COMPLETED") { dauVet.status += 1; co = true; }
    if (s.completedAt !== null) { dauVet.completedAt += 1; co = true; }
    if (coDiemDanh.has(s.id)) { dauVet.diemDanh += 1; co = true; }
    if (coNhanXet.has(s.id)) { dauVet.nhanXet += 1; co = true; }
    if (coAnh.has(s.id)) { dauVet.anh += 1; co = true; }
    if (co) dauVet.hop += 1;
  }

  const tong = {
    lop: 0, lopCoBuoi: 0, lopLech: 0, buoi: 0,
    A: 0, Anull: 0, B: 0, C: 0, D: 0, Dtrung: 0, Eplan: 0, Etopic: 0,
    FdaDay: 0, FchuaDienRa: 0,
    khongSuyDuocGiaoTrinh: 0, lopKhongKetLuanDuoc: 0,
  };

  for (const cls of classes) {
    tong.lop += 1;
    const buoi = buoiTheoLop.get(cls.id) ?? [];
    if (buoi.length === 0) continue;
    tong.lopCoBuoi += 1;
    tong.buoi += buoi.length;

    const nhapNhang = !cls.curriculumId && (soActiveTheoCourse.get(cls.courseId) ?? 0) >= 2;
    const curId = cls.curriculumId ?? activeTheoCourse.get(cls.courseId) ?? null;
    if (!curId) tong.khongSuyDuocGiaoTrinh += 1;
    if (nhapNhang) tong.lopKhongKetLuanDuoc += 1;
    const baiCuaLop = curId ? (lessonsTheoCur.get(curId) ?? []) : [];
    const orderTrongGiaoTrinh = new Map(baiCuaLop.map((l) => [l.id, l.order]));

    // (1) SỐ BUỔI — dùng ĐÚNG hàm UI dùng.
    const soBuoi = buildSessionNumberMap(
      buoi.map((s) => ({ id: s.id, classId: s.classId, date: s.date })),
    );

    // ── Q2: MỐC NƯỚC CAO (chủ dự án chốt 08/09) ────────────────────────────
    // Lớp chạy tuần tự. Buổi nằm GIỮA hai buổi có dấu vết mà bị chấm "chưa diễn ra"
    // chính là ca nguy hiểm: nó được phép re-map trong khi thực tế đã dạy rồi.
    // Nên: buổi có dấu vết MUỘN NHẤT là mốc nước; MỌI buổi trước nó coi là ĐÃ DẠY.
    //
    // ⚠️ Sắp theo `date` chứ không phải `(date, startTime)`: `ClassSession` KHÔNG có cột
    // `startTime` — giờ nằm TRONG `date` (`@db.Timestamptz(6)`, xem §1 sơ đồ). Sắp theo
    // `date` ở đây đã bao gồm giờ.
    const coDauVet = (x: Buoi) =>
      x.status === "COMPLETED" || x.completedAt !== null ||
      coDiemDanh.has(x.id) || coNhanXet.has(x.id) || coAnh.has(x.id);
    let mocNuoc: number | null = null;
    for (const x of buoi) {
      if (!coDauVet(x)) continue;
      const t = x.date.getTime();
      if (mocNuoc === null || t > mocNuoc) mocNuoc = t;
    }
    /** ĐÃ DẠY = có dấu vết, HOẶC nằm dưới mốc nước cao của lớp. */
    const daDayCuaBuoi = (x: Buoi): boolean =>
      coDauVet(x) || (mocNuoc !== null && x.date.getTime() <= mocNuoc);
    for (const x of buoi) {
      if (!coDauVet(x) && mocNuoc !== null && x.date.getTime() <= mocNuoc) cuuNhoMocNuoc += 1;
    }

    let A = 0, Anull = 0, B = 0, lechMax = 0, Eplan = 0, Etopic = 0;
    let FdaDay = 0, Fchua = 0;
    const deltas: number[] = [];
    const baiDuocTro = new Map<string, number>();

    for (const s of buoi) {
      const les = s.lessonId ? lessonById.get(s.lessonId) ?? null : null;
      const plan = s.planId ? planById.get(s.planId) ?? null : null;

      // (A) bài không thuộc giáo trình đang gắn
      if (!s.lessonId) Anull += 1;
      else if (!les || les.curriculumId !== curId) A += 1;

      if (s.lessonId) baiDuocTro.set(s.lessonId, (baiDuocTro.get(s.lessonId) ?? 0) + 1);

      // (E) tên IN RA khác tên bài của FK — dùng ĐÚNG hàm site GV in ra.
      const inRa = deriveSessionLabel({
        sessionNumber: soBuoi.get(s.id) ?? null,
        planTitle: plan?.customTitle ?? null,
        lessonTitle: les?.title ?? null,
        lessonOrder: les?.order ?? null,
        topic: s.topic,
        moduleCode: les?.moduleCode ?? null,
      });
      // `inRa` nay là NHÃN đầy đủ ("Buổi 7 - HP1 - <tên>") nên KHÔNG so `===` với title.
      // Đo đúng câu hỏi của E: nguồn nào đang THẮNG trong chuỗi ưu tiên của
      // `deriveSessionTitle` (customTitle → lesson.title → topic).
      const coPlanTitle = !!plan?.customTitle?.trim();
      const coLessonTitle = !!les?.title?.trim();
      const coTopic = !!s.topic?.trim();
      if (coPlanTitle && coLessonTitle) {
        Eplan += 1; // customTitle che lesson.title
        const k = phanLoaiChuoi(plan?.customTitle, curId);
        if (k === 1) q4.planTrungBaiCuaLop += 1;
        else if (k === 2) q4.planTrungBaiKhac += 1;
        else q4.planKhongTrung += 1;
      } else if (!coPlanTitle && !coLessonTitle && coTopic) {
        Etopic += 1; // chỉ còn topic đỡ
        const k = phanLoaiChuoi(s.topic, curId);
        if (k === 1) q4.topicTrungBaiCuaLop += 1;
        else if (k === 2) q4.topicTrungBaiKhac += 1;
        else q4.topicKhongTrung += 1;
      }

      // (B) lệch thứ tự — chỉ xét buổi trỏ bài THUỘC giáo trình đang gắn.
      const rank = soBuoi.get(s.id) ?? null;
      const ord = s.lessonId ? orderTrongGiaoTrinh.get(s.lessonId) ?? null : null;
      if (rank !== null && ord !== null && rank !== ord) {
        B += 1;
        const d = ord - rank;
        deltas.push(d);
        if (Math.abs(d) > Math.abs(lechMax)) lechMax = d;

        // (F) buổi lệch này đã dạy chưa — theo mốc nước cao (Q2).
        if (daDayCuaBuoi(s)) FdaDay += 1;
        else Fchua += 1;
      }
    }

    // (D) bài mồ côi + bài bị nhiều buổi cùng trỏ
    const moCoi = baiCuaLop.filter((l) => !baiDuocTro.has(l.id)).length;
    const trung = [...baiDuocTro.values()].filter((n) => n >= 2).length;

    const kieu =
      deltas.length === 0 ? "—"
        : new Set(deltas).size === 1 ? `đều (+${deltas[0]})`
          : "xáo trộn";

    const coLech = A > 0 || Anull > 0 || B > 0 || moCoi > 0 || trung > 0 ||
      buoi.length !== baiCuaLop.length || Eplan > 0 || Etopic > 0;
    if (coLech) tong.lopLech += 1;

    tong.A += A; tong.Anull += Anull; tong.B += B;
    tong.D += moCoi; tong.Dtrung += trung;
    tong.Eplan += Eplan; tong.Etopic += Etopic;
    tong.FdaDay += FdaDay; tong.FchuaDienRa += Fchua;
    if (buoi.length !== baiCuaLop.length) tong.C += 1;

    bang.push({
      ma: cls.classCode ?? cls.name, khoa: cls.course?.name ?? "—", trangThai: cls.status,
      tongBuoi: buoi.length, tongBai: baiCuaLop.length,
      A_khacGiaoTrinh: A, A_lessonNull: Anull,
      B_lechThuTu: B, B_kieu: kieu, B_lechMax: lechMax,
      C_chenh: buoi.length - baiCuaLop.length,
      D_baiMoCoi: moCoi, D_baiTrung: trung,
      E_planTitleChe: Eplan, E_topicChe: Etopic,
      F_lechDaDay: FdaDay, F_lechChuaDienRa: Fchua,
      coLech,
    });
  }

  // ── BẢNG TỔNG ────────────────────────────────────────────────────────────
  console.log("## Tổng");
  console.log(`Lớp (chưa xoá):                 ${tong.lop}`);
  console.log(`  ... có ít nhất 1 buổi:        ${tong.lopCoBuoi}`);
  console.log(`  ... LỆCH (bất kỳ A–E):        ${tong.lopLech}`);
  console.log(`  ... không suy được giáo trình:${tong.khongSuyDuocGiaoTrinh}`);
  console.log(`Buổi học:                       ${tong.buoi}`);
  console.log("");
  console.log(`A. buổi trỏ bài KHÁC giáo trình của lớp:  ${tong.A}`);
  console.log(`A. buổi lessonId IS NULL (đã SetNull):    ${tong.Anull}`);
  console.log(`B. buổi lệch thứ tự (hạng ngày ≠ order):  ${tong.B}`);
  console.log(`C. lớp có số buổi ≠ số bài giáo trình:    ${tong.C}`);
  console.log(`D. bài mồ côi (không buổi nào trỏ):       ${tong.D}`);
  console.log(`D. bài bị ≥2 buổi cùng trỏ:               ${tong.Dtrung}`);
  console.log(`E. tên in ra bị plan.customTitle che:     ${tong.Eplan}`);
  console.log(`E. tên in ra bị topic che:                ${tong.Etopic}`);
  console.log(`F. buổi LỆCH đã dạy (KHÔNG ĐƯỢC ĐỤNG):   ${tong.FdaDay}`);
  console.log(`F. buổi LỆCH chưa diễn ra (re-map được):  ${tong.FchuaDienRa}`);
  console.log("");
  console.log("## Phân rã mốc \"đã dạy\" (mỗi dấu vết đếm ĐỘC LẬP)");
  console.log(`  status = COMPLETED:        ${dauVet.status}`);
  console.log(`  completedAt ≠ null:        ${dauVet.completedAt}`);
  console.log(`  có điểm danh:              ${dauVet.diemDanh}`);
  console.log(`  có nhận xét:               ${dauVet.nhanXet}`);
  console.log(`  có ảnh:                    ${dauVet.anh}`);
  console.log(`  HỢP (buổi tính là đã dạy): ${dauVet.hop} / ${tong.buoi}`);
  console.log("");
  console.log("## Q2 — mốc nước cao (buổi trước buổi-có-dấu-vết-muộn-nhất coi là ĐÃ DẠY)");
  console.log(`  buổi được CỨU nhờ riêng luật này: ${cuuNhoMocNuoc}`);
  console.log("   (= không có dấu vết nào, nhưng nằm dưới mốc nước cao của lớp)");
  console.log("");
  console.log("## Q4 — chuỗi chép đang che FK, phân loại theo nội dung");
  console.log(`  customTitle · trùng tên bài CỦA LỚP:      ${q4.planTrungBaiCuaLop}`);
  console.log(`  customTitle · trùng tên bài giáo trình KHÁC: ${q4.planTrungBaiKhac}`);
  console.log(`  customTitle · KHÔNG trùng bài nào:        ${q4.planKhongTrung}`);
  console.log(`  topic · trùng tên bài CỦA LỚP:            ${q4.topicTrungBaiCuaLop}`);
  console.log(`  topic · trùng tên bài giáo trình KHÁC:    ${q4.topicTrungBaiKhac}`);
  console.log(`  topic · KHÔNG trùng bài nào:              ${q4.topicKhongTrung}`);
  console.log("");
  console.log("## Khoá có ≥2 bản giáo trình isActive (A KHÔNG KẾT LUẬN ĐƯỢC)");
  if (khoaNhapNhang.length === 0) console.log("  (không có)");
  for (const [courseId, n] of khoaNhapNhang) console.log(`  courseId=${courseId}  ${n} bản isActive`);
  console.log(`  → lớp bị ảnh hưởng (không ghim curriculumId): ${tong.lopKhongKetLuanDuoc}`);
  console.log("");
  console.log("## Q5 — HỌC BẠ ở cấp LỚP (mốc theo buổi KHÔNG thấy)");
  console.log(`  lớp có ≥1 ReportCard:        ${lopCoHocBa.size}`);
  console.log(`  lớp ĐÃ PHÁT HÀNH học bạ:     ${lopHocBaDaPhatHanh.size}`);
  {
    let buoiChuaDienRaTrongLopDaPhatHanh = 0;
    for (const cid of lopHocBaDaPhatHanh) {
      for (const s of buoiTheoLop.get(cid) ?? []) {
        const daDay = s.status === "COMPLETED" || s.completedAt !== null ||
          coDiemDanh.has(s.id) || coNhanXet.has(s.id) || coAnh.has(s.id);
        if (!daDay) buoiChuaDienRaTrongLopDaPhatHanh += 1;
      }
    }
    console.log(`  buổi bị chấm "chưa diễn ra" TRONG lớp đã phát hành: ${buoiChuaDienRaTrongLopDaPhatHanh}`);
  }
  console.log("");

  // ── BẢNG THEO LỚP ────────────────────────────────────────────────────────
  const lech = bang.filter((r) => r.coLech).sort((a, b) => b.B_lechThuTu - a.B_lechThuTu);
  console.log(`## Lớp lệch (${lech.length} lớp)`);
  console.log(
    ["mã lớp", "khoá", "buổi", "bài", "A", "null", "B", "kiểu", "Δmax", "C", "mồcôi", "trùng", "Eplan", "Etopic", "lệch-đãdạy", "lệch-chưa"].join("\t"),
  );
  for (const r of lech) {
    console.log([
      r.ma, r.khoa.slice(0, 18), r.tongBuoi, r.tongBai, r.A_khacGiaoTrinh, r.A_lessonNull,
      r.B_lechThuTu, r.B_kieu, r.B_lechMax, r.C_chenh, r.D_baiMoCoi, r.D_baiTrung,
      r.E_planTitleChe, r.E_topicChe, r.F_lechDaDay, r.F_lechChuaDienRa,
    ].join("\t"));
  }
  console.log("");

  // ── ĐỐI CHIẾU TỪNG BUỔI + TRUY VẾT ĐỢT GHI (G) ───────────────────────────
  for (const ma of LOP_MAU) {
    const cls = classes.find((c) => c.classCode === ma || c.name === ma);
    if (!cls) { console.log(`## ${ma}: KHÔNG TÌM THẤY trên DB này`); continue; }
    const buoi = (buoiTheoLop.get(cls.id) ?? []).slice()
      .sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));
    const curId = cls.curriculumId ?? activeTheoCourse.get(cls.courseId) ?? null;
    const baiCuaLop = curId ? (lessonsTheoCur.get(curId) ?? []) : [];
    const soBuoi = buildSessionNumberMap(buoi.map((s) => ({ id: s.id, classId: s.classId, date: s.date })));
    let mocNuocMau: number | null = null;
    for (const x of buoi) {
      const v = x.status === "COMPLETED" || x.completedAt !== null ||
        coDiemDanh.has(x.id) || coNhanXet.has(x.id) || coAnh.has(x.id);
      if (v && (mocNuocMau === null || x.date.getTime() > mocNuocMau)) mocNuocMau = x.date.getTime();
    }

    console.log(`## ${ma} — ${cls.course?.name ?? "—"} · ${buoi.length} buổi / ${baiCuaLop.length} bài`);
    console.log(`giáo trình gắn: ${curId ?? "(không suy được)"} · ghim=${cls.curriculumId ? "có" : "không"} v${cls.curriculumVersion ?? "—"}`);
    console.log(["Buổi", "ngày", "thứ", "UI đang in", "order-FK", "đáng lẽ là", "đãdạy", "createdAt"].join("\t"));
    const THU = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    for (const s of buoi) {
      const les = s.lessonId ? lessonById.get(s.lessonId) ?? null : null;
      const plan = s.planId ? planById.get(s.planId) ?? null : null;
      const n = soBuoi.get(s.id) ?? 0;
      const inRa = deriveSessionLabel({
        sessionNumber: n,
        planTitle: plan?.customTitle ?? null,
        lessonTitle: les?.title ?? null,
        lessonOrder: les?.order ?? null,
        topic: s.topic,
        moduleCode: les?.moduleCode ?? null,
      });
      const baiDung = baiCuaLop[n - 1];
      const dangLe = baiDung
        ? deriveSessionLabel({
            sessionNumber: n, lessonTitle: baiDung.title,
            lessonOrder: baiDung.order, moduleCode: baiDung.moduleCode,
          })
        : "(ngoài giáo trình)";
      const coVet = s.status === "COMPLETED" || s.completedAt !== null ||
        coDiemDanh.has(s.id) || coNhanXet.has(s.id) || coAnh.has(s.id);
      const daDay = coVet || (mocNuocMau !== null && s.date.getTime() <= mocNuocMau);
      console.log([
        n,
        s.date.toISOString().slice(0, 10),
        THU[new Date(s.date.getTime() + 7 * 3600_000).getUTCDay()],
        (inRa || "—").slice(0, 34),
        les && les.curriculumId === curId ? les.order : (les ? `khác-GT(${les.order})` : "null"),
        dangLe.slice(0, 34),
        daDay ? "x" : "",
        s.createdAt.toISOString().slice(0, 19),
      ].join("\t"));
    }

    // (G) gom theo cụm ghi
    const cum = new Map<string, { n: number; thu: Set<string> }>();
    for (const s of buoi) {
      const k = s.createdAt.toISOString().slice(0, 16);
      const c = cum.get(k) ?? { n: 0, thu: new Set<string>() };
      c.n += 1;
      c.thu.add(THU[new Date(s.date.getTime() + 7 * 3600_000).getUTCDay()]!);
      cum.set(k, c);
    }
    console.log(`-- G: cụm ghi theo createdAt (làm tròn phút)`);
    for (const [k, v] of [...cum.entries()].sort()) {
      console.log(`   ${k}  ${v.n} buổi  thứ={${[...v.thu].join(",")}}`);
    }
    console.log("");
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
