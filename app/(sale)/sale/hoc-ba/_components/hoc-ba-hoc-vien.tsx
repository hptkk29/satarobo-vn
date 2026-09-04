/**
 * Site Sale — thân màn "Học bạ" của một học viên.
 *
 * ── BẢN ĐÔI CỦA `components/transcript/transcript-view.tsx` ─────────────────
 * Bản gốc là component DÙNG CHUNG cho portal phụ huynh + khu quản trị. Chủ dự án
 * chốt 04/09/2026: màn site Sale tách bản riêng, không dùng chung component với
 * khu quản trị nữa. Bản gốc GIỮ NGUYÊN — portal và admin vẫn dùng nó.
 *
 * ⚠️ NỢ TRÔI LỆCH CÓ GHI SỔ: thêm/bớt một khối trong học bạ (vd một mục "Bài thi"
 *    mới) mà quên tệp này ⇒ phụ huynh và admin thấy, Sale không thấy, và không có
 *    gì báo. Danh sách khối phải khớp: bốn ô tóm tắt · Quá trình học theo lớp ·
 *    Khoá đã hoàn thành · Đánh giá năng lực.
 *
 * GIỮ NGUYÊN 100%: đúng bốn ô tóm tắt (Số lớp · Khoá hoàn thành · Chuyên cần ·
 * Điểm TB), đúng năm cột bảng lớp (Lớp · Khoá · Chuyên cần · Điểm TB · Trạng
 * thái), câu "Chưa diễn ra" khi lớp chưa có buổi nào, dòng "Chưa có lớp.", nhãn
 * hai danh sách dưới, và nút "Tải PDF".
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. Bốn thẻ rời `rounded-xl border` nổi trên nền trang → MỘT dải liền chia ô
 *    bằng đường kẻ, đúng ngôn ngữ `DaiSoLieu` của site Sale (nhưng viết tại chỗ:
 *    `DaiSoLieu` chỉ nhận `soLuong: number`, mà "Chuyên cần" là phần trăm và
 *    "Điểm TB" có thể là "—").
 * 2. Ba `<section rounded-xl border bg-white>` rời → ba tầng trong CÙNG một
 *    `KhungDuLieu` của trang (`khung-du-lieu.tsx` cấm khung lồng khung), ngăn
 *    nhau bằng băng tiêu đề nền chìm — cùng cách màn `/sale/crm` đang làm.
 * 3. Màu `neutral-*` / `purple-700` gõ tay → token của `sale.css`.
 * 4. Bảng lớp dùng `.bang-sale` + `o-so` cho ba cột số.
 *
 * ⚠️ CỘT "TRẠNG THÁI" CỐ Ý KHÔNG TÔ MÀU. Đây là sổ LỊCH SỬ học tập, không phải
 *    danh sách việc phải làm: một học viên có năm dòng thì tô năm màu, và màu hết
 *    mang tin ở đúng chỗ nó có nghĩa (cột trạng thái của `/sale/dang-ky-hoc`).
 *    Bản admin cũng để chữ xám ở đây — giữ nguyên.
 */
import type { RoboticsSkill, SkillLevel } from "@prisma/client";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { SKILL_LABEL, LEVEL_LABEL } from "@/lib/lms/skills";
import { ENROLLMENT_STATUS } from "@/lib/labels/registry";
import type { StudentTranscript } from "@/lib/transcript/service";

/** Băng tiêu đề của một khối trong khung — nền chìm để đọc ra là "vách ngăn". */
const BANG_TIEU_DE =
  "border-b border-border bg-[color:var(--surface-chim)] px-5 py-2.5 " +
  "text-sm font-semibold text-foreground";

export function HocBaHocVien({ t, duongPdf }: { t: StudentTranscript; duongPdf: string }) {
  const oTomTat: { nhan: string; giaTri: string | number }[] = [
    { nhan: "Số lớp", giaTri: t.summary.totalClasses },
    { nhan: "Khoá hoàn thành", giaTri: t.summary.completedCourses },
    { nhan: "Chuyên cần", giaTri: `${t.summary.overallAttendanceRate}%` },
    { nhan: "Điểm TB", giaTri: t.summary.overallAverageScore ?? "—" },
  ];

  return (
    <>
      {/* Tên học viên + lối tải PDF. `h2` chứ không `h1`: `h1` của màn là dòng
          đầu khung ("Học bạ học viên") — hai `h1` trên một trang làm trình đọc
          màn hình mất mốc điều hướng. */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-tight text-foreground">
            Học bạ — {t.student.name}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t.student.studentCode ? `Mã ${t.student.studentCode}` : ""}
            {t.student.currentGrade ? ` · Lớp ${t.student.currentGrade}` : ""}
            {t.student.school ? ` · ${t.student.school}` : ""}
          </p>
        </div>
        {/* `<a>` chứ không `<Link>`: đích là một route API trả tệp PDF, không phải
            một trang của ứng dụng — cho router của Next đi trước là tải trước một
            thứ không dựng được thành trang.

            ⚠️ NỢ ĐÃ BIẾT: `/api/admin/reports/transcript` gác bằng
            `students:view-all`, RỘNG HƠN cổng của màn này
            (`curriculum:view` HOẶC `students:view-own-class`). Ai qua được cổng mà
            thiếu `students:view-all` sẽ bấm ra 403 JSON. Đây là nợ MANG THEO từ bản
            admin — chính nút đó bên admin cũng vậy — nên sửa ở đây là làm hai khu
            lệch nhau, còn sửa cho đúng là đụng route API dùng chung, ngoài phạm vi
            đợt tách giao diện này. Đã báo lại cho chủ dự án. */}
        <a
          href={duongPdf}
          target="_blank"
          rel="noopener"
          className="inline-flex h-9 shrink-0 items-center rounded-lg bg-[color:var(--primary)] px-4 text-sm font-medium text-[color:var(--primary-foreground)] transition-colors hover:bg-[color:var(--primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2"
        >
          Tải PDF
        </a>
      </div>

      {/* Dải bốn ô tóm tắt: một khối liền chia bằng đường kẻ, không phải bốn thẻ
          rời — mắt khỏi phải quyết định bốn lần "đây có phải một khối không". */}
      <div className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
        {oTomTat.map((o, i) => (
          <div
            key={o.nhan}
            className={[
              "flex flex-col px-5 py-3",
              i % 2 === 0 ? "border-r border-border" : "",
              i < 2 ? "border-b border-border sm:border-b-0" : "",
              "sm:border-r sm:last:border-r-0",
            ].join(" ")}
          >
            <span className="text-xs font-medium text-muted-foreground">{o.nhan}</span>
            <span className="mt-1 text-xl font-semibold leading-none tabular-nums text-foreground">
              {o.giaTri}
            </span>
          </div>
        ))}
      </div>

      <section className="border-b border-border">
        <h3 className={BANG_TIEU_DE}>Quá trình học theo lớp</h3>
        {t.classes.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Chưa có lớp.</p>
        ) : (
          <PhanTrangBang tenDonVi="lớp" khoaGhiNho="sale-hoc-ba-lop" cuonNgang>
            <table className="bang-sale">
              <thead>
                <tr>
                  <th scope="col">Lớp</th>
                  <th scope="col">Khoá</th>
                  <th scope="col" className="o-so">
                    Chuyên cần
                  </th>
                  <th scope="col" className="o-so">
                    Điểm TB
                  </th>
                  <th scope="col">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {t.classes.map((c) => (
                  <tr key={c.classId}>
                    <td className="font-medium text-foreground">{c.className}</td>
                    <td className="text-foreground">{c.courseName}</td>
                    <td className="o-so text-foreground">
                      {c.totalSessions === 0
                        ? "Chưa diễn ra"
                        : `${c.attendedSessions}/${c.totalSessions} (${c.attendanceRate}%)`}
                    </td>
                    <td className="o-so text-foreground">{c.averageScore ?? "—"}</td>
                    <td className="text-muted-foreground">{ENROLLMENT_STATUS.label(c.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PhanTrangBang>
        )}
      </section>

      {t.completions.length > 0 ? (
        <section className="border-b border-border">
          <h3 className={BANG_TIEU_DE}>Khoá đã hoàn thành</h3>
          <ul className="divide-y divide-border text-sm">
            {t.completions.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                <span className="font-medium text-foreground">{c.courseName}</span>
                <span className="text-muted-foreground">
                  {c.completedAt.toISOString().slice(0, 10)}
                  {c.finalGrade ? ` · ${c.finalGrade}` : ""} · {c.certificateCode}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {t.skills.length > 0 ? (
        <section>
          <h3 className={BANG_TIEU_DE}>Đánh giá năng lực</h3>
          <ul className="divide-y divide-border text-sm">
            {t.skills.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                <span className="text-foreground">
                  {SKILL_LABEL[s.skill as RoboticsSkill] ?? s.skill}
                </span>
                <span className="text-muted-foreground">
                  {LEVEL_LABEL[s.level as SkillLevel] ?? s.level} ·{" "}
                  {s.assessedAt.toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
