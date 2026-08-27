"use client";

// app/(admin)/admin/lop-trial/_components/teacher-assign-select.tsx — GĐ2.
//
// Ô gán giáo viên phụ trách lớp trải nghiệm. Không có nút "Lưu": đổi lựa chọn là
// lưu ngay — nên phải tự lo phần hoàn tác khi server từ chối (xem comment ở `value`).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserCog } from "lucide-react";

import { assignLopTrialTeacherAction } from "../_actions";
import type { Option } from "../_lib/types";

export function TeacherAssignSelect({
  trialClassId,
  teacherId,
  teachers,
  canAssign,
}: {
  trialClassId: string;
  teacherId: string | null;
  teachers: Option[];
  canAssign: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  /**
   * `null` = đang tin prop từ server. Chuỗi = giá trị người dùng vừa chọn (lạc quan).
   *
   * Vì sao không `useState(teacherId ?? "")` thẳng: state khởi tạo một lần rồi
   * KHÔNG bao giờ nhận prop mới, nên sau `router.refresh()` (hoặc khi người khác
   * đổi GV) ô select sẽ đứng yên ở giá trị cũ. Kiểu "đè lên prop" này cho phép
   * hoàn tác chỉ bằng `setOverride(null)` — tức trả về đúng sự thật server đang có.
   */
  const [override, setOverride] = useState<string | null>(null);
  const value = override ?? teacherId ?? "";

  const currentName = teachers.find((t) => t.id === value)?.name ?? null;

  function onChange(next: string) {
    setOverride(next);
    startTransition(async () => {
      const res = await assignLopTrialTeacherAction(trialClassId, next || null);
      if (res.ok) {
        toast.success("Đã cập nhật giáo viên");
        // Giữ `override` cho tới khi prop mới về, nếu không select sẽ nháy về giá
        // trị cũ trong lúc chờ refresh — người dùng tưởng lưu hụt.
        router.refresh();
        return;
      }
      // Thất bại mà để nguyên lựa chọn mới là màn hình nói dối: người dùng đi tiếp
      // với niềm tin đã gán GV, trong khi DB vẫn giữ GV cũ.
      setOverride(null);
      toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <UserCog className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Giáo viên phụ trách</span>
      </div>

      {canAssign ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={pending}
          aria-label="Giáo viên phụ trách"
          className="rounded-lg border border-border bg-card px-2 py-2 text-sm text-foreground disabled:opacity-50"
        >
          <option value="">— chưa gán —</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-sm text-foreground">
          {currentName ?? <span className="text-muted-foreground">Chưa gán</span>}
        </span>
      )}

      <p className="w-full text-xs text-muted-foreground">
        Đổi giáo viên sẽ áp cho các buổi CHƯA diễn ra; buổi đã hoàn tất giữ nguyên giáo
        viên cũ.
      </p>
    </div>
  );
}
