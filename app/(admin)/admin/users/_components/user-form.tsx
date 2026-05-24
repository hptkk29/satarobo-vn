"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Role } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ROLE_OPTIONS } from "./role-badge";
import { createUserAction, updateUserAction } from "../_actions";

type CenterOption = { id: string; name: string };
type EmployeeOption = { id: string; fullName: string; employeeCode: string | null };

type UserFormInitialData = {
  // id only present in edit mode
  id?: string;
  name?: string | null;
  email?: string;
  role?: Role;
  centerId?: string | null;
  employeeId?: string | null;
};

interface UserFormProps {
  mode: "create" | "edit";
  initialData?: UserFormInitialData;
  centers: CenterOption[];
  employees: EmployeeOption[]; // unlinked employees + current employee (if edit) + prefill employee (if create-from-employee)
}

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50";

export function UserForm({
  mode,
  initialData,
  centers,
  employees,
}: UserFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      const res =
        mode === "create"
          ? await createUserAction(fd)
          : await updateUserAction(initialData!.id!, fd);

      if (!res.ok) {
        setError(res.error ?? "Lỗi thao tác");
        toast.error(res.error ?? "Lỗi thao tác");
        return;
      }

      toast.success(
        mode === "create" ? "Tạo tài khoản thành công" : "Đã lưu thay đổi",
      );
      if (mode === "create") {
        router.push("/users");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Tên hiển thị *</Label>
          <Input
            id="name"
            name="name"
            required
            maxLength={100}
            defaultValue={initialData?.name ?? ""}
            placeholder="Nguyễn Văn A"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            defaultValue={initialData?.email ?? ""}
            placeholder="ten@satarobo.vn"
          />
        </div>
      </div>

      {mode === "create" && (
        <div className="space-y-1.5">
          <Label htmlFor="password">Mật khẩu *</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={72}
            placeholder="Tối thiểu 8 ký tự"
          />
          <p className="text-xs text-gray-500">
            User sẽ đổi mật khẩu sau khi đăng nhập lần đầu.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="role">Role *</Label>
          <select
            id="role"
            name="role"
            required
            defaultValue={initialData?.role ?? "SALES"}
            className={selectClass}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="centerId">Cơ sở</Label>
          <select
            id="centerId"
            name="centerId"
            defaultValue={initialData?.centerId ?? ""}
            className={selectClass}
          >
            <option value="">— Không gán —</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="employeeId">Nhân sự liên kết</Label>
          <select
            id="employeeId"
            name="employeeId"
            defaultValue={initialData?.employeeId ?? ""}
            className={selectClass}
          >
            <option value="">— Không gán —</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName}
                {e.employeeCode ? ` · ${e.employeeCode}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Đang lưu..."
            : mode === "create"
              ? "Tạo tài khoản"
              : "Lưu thay đổi"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/users")}
          disabled={pending}
        >
          Huỷ
        </Button>
      </div>
    </form>
  );
}
