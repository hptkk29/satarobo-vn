// app/(admin)/admin/lop-trial/[id]/page.tsx — GĐ2. Chi tiết một lớp trải nghiệm.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { getAssignableTeachers } from "@/lib/teachers/assignable";
import { getSetting } from "@/lib/settings/service";
import { layChiTietLop, layLichBanGiaoVien, layPhongTheoCoSo } from "../_lib/queries";
import { AddSessionForm } from "../_components/add-session-form";
import { EnrollPanel } from "../_components/enroll-panel";
import { RosterList } from "../_components/roster-list";
import { AttendanceBoard } from "../_components/attendance-board";
import { CancelClassButton } from "../_components/cancel-class-button";

export const dynamic = "force-dynamic";

const NHAN_TRANG_THAI: Record<string, string> = {
  OPEN: "Đang mở",
  RUNNING: "Đang chạy",
  COMPLETED: "Đã xong",
  CANCELLED: "Đã huỷ",
};
const MAU_TRANG_THAI: Record<string, string> = {
  OPEN: "bg-emerald-100 text-emerald-700",
  RUNNING: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-gray-200 text-gray-600",
  CANCELLED: "bg-red-100 text-red-700",
};

export default async function ChiTietLopTrialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("trials:view"))) redirect("/dashboard");

  const { id } = await params;
  const actor = await resolveActor(session.user.id);
  const cls = await layChiTietLop(actor, id);
  // layChiTietLop đã lọc theo scopedDb → ngoài cơ sở là 404, không phải "cấm truy cập".
  if (!cls) notFound();

  // 28/08 — KHÔNG còn kiểm `trials:assign-teacher` ở màn này: ô "Đề xuất GV" và
  // "Phân công (Đào tạo)" theo từng học viên đã gỡ. Giáo viên nay đặt ở TỪNG BUỔI, và
  // sửa buổi là quyền quản lý (`trials:manage`). Quyền `trials:assign-teacher` vẫn còn
  // trong ma trận cho các đường khác — chỉ màn này thôi dùng.
  const [isManager, canAttendance] = await Promise.all([
    checkPermission("trials:manage", { centerId: cls.centerId }),
    checkPermission("trials:attendance", { centerId: cls.centerId }),
  ]);
  // GĐ4 — điểm danh là việc của Sale phụ trách khách (`trials:attendance`), tách khỏi
  // `trials:feedback` của giáo viên. Trước GĐ4 hai việc dùng chung một cờ nên ai điểm
  // danh được thì cũng chấm được và ngược lại — ngược hẳn quy trình đã chốt.
  //
  // 27/08 — màn này KHÔNG còn đường chấm phiếu (khối SESSION_EVAL đã gỡ), nên
  // `trials:feedback` không còn phải kiểm ở đây. Việc chấm nằm trọn ở site giáo viên;
  // màn này chỉ ĐỌC phiếu đã chấm, và quyền đọc là `trials:view` — đã gác ở đầu hàm.
  const canDiemDanh = canAttendance;

  // ⚠️ Danh sách GV phải nạp cho MỌI người xem, không chỉ người có quyền gán.
  //
  // Bản cũ trả mảng rỗng khi thiếu `trials:assign-teacher`, mà chính mảng đó là nơi
  // tra TÊN giáo viên đang phụ trách — nên sau khi GĐ3 gỡ quyền khỏi Quản lý cơ sở,
  // Sale/QLCS/GV đều thấy mọi lớp là "Chưa gán" kể cả lớp đã có giáo viên.
  // Đọc tên không phải là quyền ghi; quyền chỉ quyết định có render <select> hay không.
  //
  // MỘT danh sách dùng chung cho cả ba ô (gán lớp · thêm buổi · phân công từng ca).
  // Trước đây tách hai danh sách theo quyền, và ô "Thêm buổi học" ăn phải danh sách
  // rỗng khi GĐ3 gỡ `trials:assign-teacher` khỏi Quản lý cơ sở → QLCS không xếp được
  // giáo viên cho buổi ad-hoc. Base list giống hệt nhau (cùng cơ sở), chỉ khác
  // `includeIds`, nên gộp là hết cả lớp bug đó.
  const teachers = await getAssignableTeachers({
    centerIds: [cls.centerId],
    includeIds: [
      // 28/08 — KHÔNG còn `cls.teacherId`: giáo viên đặt ở TỪNG BUỔI. Vẫn phải giữ
      // người đang gán ở buổi và ở từng ca, nếu không họ rớt khỏi danh sách (đổi cơ sở,
      // nghỉ việc) và `<select>` hiện TRỐNG trong khi tên vẫn in ở thẻ bên cạnh.
      ...cls.sessions.map((se) => se.teacherId),
      ...cls.enrollments.flatMap((e) => [e.gvDeXuatId, e.gvPhanCongId]),
    ],
  });
  const teacherOptions = teachers.map((t) => ({ id: t.id, name: t.name ?? "(không tên)" }));

  // 28/08 — dữ liệu cho ô "Giáo viên" và "Phòng" của form THÊM BUỔI.
  // `busyByTeacher` chỉ để ĐÁNH DẤU, không lọc (chốt 28/08): ca làm nay cố định nên
  // không còn bảng đăng ký ca để tra "ai đi làm hôm đó"; thứ tra được và thật sự hữu
  // ích là "ai đang vướng buổi khác đúng khung giờ này".
  const [roomOptions, busyByTeacher] = await Promise.all([
    layPhongTheoCoSo(actor, cls.centerId),
    layLichBanGiaoVien(actor, cls.centerId),
  ]);

  const activeUsed = cls.enrollments.filter((e) => e.status === "ACTIVE").length;
  // 28/08 — `capacity === null` là KHÔNG giới hạn sĩ số, không phải sức chứa 0.
  const full = cls.capacity !== null && activeUsed >= cls.capacity;
  const daKetThuc = cls.status === "COMPLETED" || cls.status === "CANCELLED";

  // 27/08 — khối "Phiếu đánh giá buổi học" (hệ SESSION_EVAL) ĐÃ GỠ khỏi màn này.
  //
  // Nó là CỬA THỨ HAI cho cùng một việc, và là cửa sai: giáo viên thật sự chấm bằng
  // phiếu rubric ở site giáo viên (`TrialRubricEval`), còn khối kia đọc kho
  // `EvalResponse`. Hai kho khác nhau nên Sale mở khối kia ra luôn thấy trống dù giáo
  // viên đã chấm xong — đúng lỗi người dùng báo.
  //
  // Thay bằng: mỗi dòng điểm danh có nút lấy phiếu (xem `_components/attendance-board`).
  // Component `TrialSessionEvalFill` KHÔNG xoá — site giáo viên còn dùng
  // (`lib/lms/teacher-schedule.ts`).

  return (
    <div className="space-y-5">
      <Link
        href="/lop-trial"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">{cls.name}</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                MAU_TRANG_THAI[cls.status] ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {NHAN_TRANG_THAI[cls.status] ?? cls.status}
            </span>
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{cls.code}</p>
          {/* 28/08 — KHÔNG in giờ ở đây nữa: giờ là thuộc tính của TỪNG BUỔI, mỗi
              buổi có thể khác nhau. In một khung giờ cấp lớp là nói sai về lớp. */}
          <p className="mt-1 text-sm text-muted-foreground">
            Sĩ số{" "}
            <span className={full ? "font-semibold text-red-600" : "font-semibold"}>
              {activeUsed}
              {cls.capacity === null ? "" : `/${cls.capacity}`}
            </span>{" "}
            · {cls.sessions.length} buổi
          </p>
        </div>
        {isManager && !daKetThuc && <CancelClassButton trialClassId={cls.id} />}
      </div>

      {full && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Lớp đã đủ sĩ số. Xếp thêm học viên cần quyền vượt sĩ số.
        </p>
      )}

      {/* 28/08 — GỠ khối "Giáo viên phụ trách" ở CẤP LỚP.
          Giáo viên nay chọn khi THÊM BUỔI: một lớp trải nghiệm là slot tái sử dụng,
          hai buổi khác ngày hoàn toàn có thể do hai người dạy. Giữ một ô GV cấp lớp
          bên cạnh ô GV cấp buổi là hai nguồn sự thật cho cùng một câu hỏi "ai dạy". */}

      {isManager && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Thêm buổi học</h3>
          <AddSessionForm
            trialClassId={cls.id}
            teachers={teacherOptions}
            rooms={roomOptions}
            busyByTeacher={busyByTeacher}
            defaultStartTime={cls.startTime ?? "18:00"}
            defaultEndTime={cls.endTime ?? "19:30"}
          />
        </section>
      )}

      {cls.sessions.length === 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Lớp chưa có buổi nào. Phải thêm buổi trước, vì chưa có buổi thì không xếp được
          học viên và giáo viên cũng không thấy gì để điểm danh.
        </p>
      )}

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Học viên</h3>
        <EnrollPanel
          trialClassId={cls.id}
          sessions={cls.sessions}
          canManage={isManager}
          canOverride={await checkPermission("trials:override-capacity", {
            centerId: cls.centerId,
          })}
          full={full}
          // Trần số buổi học thử đọc ở cấp GLOBAL — khớp NGUYÊN chỗ server action
          // kiểm (lop-trial/_actions.ts). Ô nhập chặn khác server là đẩy người dùng
          // vào cảnh gõ hợp lệ ở client rồi bị từ chối ở server.
          maxSessions={await getSetting("crm.trialMaxSessions")}
        />
        <div className="mt-3">
          <RosterList
            trialClassId={cls.id}
            enrollments={cls.enrollments}
            canManage={isManager}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Buổi học &amp; điểm danh</h3>
        <AttendanceBoard
          sessions={cls.sessions}
          enrollments={cls.enrollments}
          canMark={canDiemDanh}
          canManage={isManager}
          teachers={teacherOptions}
          rooms={roomOptions}
        />
      </section>

    </div>
  );
}
