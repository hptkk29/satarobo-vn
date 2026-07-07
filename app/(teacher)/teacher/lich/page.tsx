// L5 — trang khung "Lịch dạy", chờ L6 (câu 47 phiếu GV):
// - Calendar lọc theo actor.assignedClassIds (KHÔNG theo cơ sở — GV dạy bù/dạy
//   thay liên cơ sở thấy đúng buổi đó, exception MAKEUP).
// - Buổi dạy thay hiển thị trước 1 ngày + notification.
// - Xem đủ thông tin lớp của buổi (KHÔNG gồm SĐT/email phụ huynh — câu 46).
export const metadata = { title: "Lịch dạy | Giáo viên Sata Robo" };

export default function TeacherSchedulePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Lịch dạy</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Lịch các buổi dạy của bạn — gồm cả buổi dạy thay và dạy bù liên cơ sở.
        </p>
      </div>
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
        <p className="text-sm text-neutral-500">
          Đang xây (L6) — lịch theo lớp được phân công sẽ hiển thị tại đây.
        </p>
      </div>
    </div>
  );
}
