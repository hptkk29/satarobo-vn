// L5 — trang khung "Lớp của tôi", chờ L6:
// - Danh sách lớp theo actor.assignedClassIds (GV chính + trợ giảng).
// - Điểm danh 6 nhãn (câu 50 — mount component dùng chung của Kiệt H1, guard
//   qua attendance:mark scope CLASS/ASSIGNED).
// - Giáo án + khu góp ý ngay trên giáo án → LessonChangeRequest, duyệt bởi
//   role TRAINING (câu 49).
// - Danh sách học viên: KHÔNG hiển thị SĐT/email phụ huynh (câu 46 —
//   canViewParentContact chặn TEACHER).
export const metadata = { title: "Lớp của tôi | Giáo viên Sata Robo" };

export default function TeacherClassesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Lớp của tôi</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Các lớp bạn được phân công — điểm danh, giáo án và học viên của lớp.
        </p>
      </div>
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
        <p className="text-sm text-neutral-500">
          Đang xây (L6) — danh sách lớp được phân công sẽ hiển thị tại đây.
        </p>
      </div>
    </div>
  );
}
