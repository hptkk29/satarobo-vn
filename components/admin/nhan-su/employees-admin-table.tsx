"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Edit, Eye, EyeOff, UserCheck, UserX, Trash2, Crown } from "lucide-react";
import type { Employee, Department, Role } from "@prisma/client";
import {
  deleteEmployeeAction,
  toggleEmployeeActiveAction,
  toggleEmployeePublicAction,
} from "@/app/(admin)/admin/nhan-su/actions";

interface EmployeeRow extends Employee {
  center: { name: string } | null;
  manager: { fullName: string } | null;
  // Đợt 3B — role chính + toàn bộ vai trò (union quyền).
  userAccount: { role: Role; roles: Role[] } | null;
  _count: { honors: number };
}

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  CENTER_MANAGER: "Quản lý",
  HR: "Nhân sự",
  SALES_CSM: "Tư vấn",
  TEACHER: "Giáo viên",
  MARKETING: "Marketing",
  ACCOUNTANT: "Kế toán",
  PARENT: "Phụ huynh",
};

const ROLE_COLOR: Record<Role, string> = {
  SUPER_ADMIN: "bg-red-100 text-red-700",
  CENTER_MANAGER: "bg-purple-100 text-purple-700",
  HR: "bg-pink-100 text-pink-700",
  SALES_CSM: "bg-blue-100 text-blue-700",
  TEACHER: "bg-green-100 text-green-700",
  MARKETING: "bg-orange-100 text-orange-700",
  ACCOUNTANT: "bg-gray-100 text-gray-600",
  PARENT: "bg-teal-100 text-teal-700",
};

interface Props {
  employees: EmployeeRow[];
  canDelete: boolean;
}

const DEPARTMENT_LABELS: Record<Department, string> = {
  BAN_GIAM_DOC: "Ban Giám đốc",
  DAO_TAO: "Đào tạo",
  MARKETING: "Marketing",
  KINH_DOANH: "Kinh doanh",
  IT: "IT",
  HANH_CHANH_NHAN_SU: "Hành chính - Nhân sự",
  KE_TOAN: "Kế toán",
  TUYEN_SINH: "Tuyển sinh",
  GIAO_VU: "Giáo vụ",
  GIANG_DAY: "Giảng dạy",
};

export function EmployeesAdminTable({ employees, canDelete }: Props) {
  const [isPending, startTransition] = useTransition();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleToggleActive = (id: string) => {
    startTransition(async () => {
      const res = await toggleEmployeeActiveAction(id);
      if (res.ok) toast.success("Đã cập nhật trạng thái");
      else toast.error(res.error);
    });
  };

  const handleTogglePublic = (id: string) => {
    startTransition(async () => {
      const res = await toggleEmployeePublicAction(id);
      if (res.ok) toast.success("Đã cập nhật hiển thị public");
      else toast.error(res.error);
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const res = await deleteEmployeeAction(id);
      if (res.ok) {
        toast.success("Đã xoá nhân sự");
        setDeleteId(null);
      } else {
        toast.error(res.error);
        setDeleteId(null);
      }
    });
  };

  if (employees.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center text-gray-500">
        <p>Chưa có nhân sự nào khớp bộ lọc.</p>
        <Link
          href="/nhan-su/new"
          className="mt-2 inline-block text-orange-600 hover:underline"
        >
          Thêm nhân sự đầu tiên →
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <th className="px-4 py-3">Mã NV</th>
            <th className="px-4 py-3">Họ tên / Chức danh</th>
            <th className="px-4 py-3">Phòng ban</th>
            <th className="px-4 py-3">Cơ sở / Quản lý</th>
            <th className="px-4 py-3">Vai trò</th>
            <th className="px-4 py-3">Honors</th>
            <th className="px-4 py-3 text-center">Active</th>
            <th className="px-4 py-3 text-center">Public</th>
            <th className="px-4 py-3 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {employees.map((emp) => (
            <tr key={emp.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-mono text-xs text-gray-700">
                {emp.employeeCode}
                {emp.isCEO && (
                  <span title="CEO" className="ml-1 inline-block align-middle">
                    <Crown className="inline h-3.5 w-3.5 text-amber-500" />
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <p className="font-semibold text-gray-900">{emp.fullName}</p>
                <p className="text-xs text-gray-500">{emp.jobTitle}</p>
              </td>
              <td className="px-4 py-3 text-gray-700">
                {DEPARTMENT_LABELS[emp.department]}
              </td>
              <td className="px-4 py-3 text-xs text-gray-600">
                {emp.center?.name || "—"}
                {emp.manager && (
                  <p className="text-gray-400">↑ {emp.manager.fullName}</p>
                )}
              </td>
              <td className="px-4 py-3">
                {emp.userAccount ? (
                  (() => {
                    const acc = emp.userAccount;
                    const effective =
                      acc.roles.length > 0 ? acc.roles : [acc.role];
                    // Vai trò chính lên đầu, có viền nổi bật.
                    const ordered = [
                      ...effective.filter((r) => r === acc.role),
                      ...effective.filter((r) => r !== acc.role),
                    ];
                    return (
                      <div className="flex flex-wrap items-center gap-1">
                        {ordered.map((r) => (
                          <span
                            key={r}
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_COLOR[r]} ${
                              r === acc.role
                                ? "ring-2 ring-amber-400 ring-offset-1"
                                : ""
                            }`}
                            title={
                              r === acc.role
                                ? "Vai trò chính · Đổi: Sửa → Đổi vai trò"
                                : "Đổi vai trò: bấm Sửa → nút Đổi vai trò"
                            }
                          >
                            {ROLE_LABEL[r]}
                          </span>
                        ))}
                      </div>
                    );
                  })()
                ) : (
                  <span className="text-xs text-gray-400">Chưa có TK</span>
                )}
              </td>
              <td className="px-4 py-3 text-center">
                {emp._count.honors > 0 ? (
                  <span className="inline-flex items-center justify-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                    🏆 {emp._count.honors}
                  </span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-center">
                <button
                  type="button"
                  onClick={() => handleToggleActive(emp.id)}
                  disabled={isPending}
                  className="rounded p-1 hover:bg-gray-100 disabled:opacity-50"
                >
                  {emp.isActive ? (
                    <UserCheck className="h-5 w-5 text-green-600" />
                  ) : (
                    <UserX className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </td>
              <td className="px-4 py-3 text-center">
                <button
                  type="button"
                  onClick={() => handleTogglePublic(emp.id)}
                  disabled={isPending}
                  className="rounded p-1 hover:bg-gray-100 disabled:opacity-50"
                >
                  {emp.isPublic ? (
                    <Eye className="h-5 w-5 text-blue-600" />
                  ) : (
                    <EyeOff className="h-5 w-5 text-gray-300" />
                  )}
                </button>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="inline-flex items-center gap-1">
                  <Link
                    href={`/nhan-su/${emp.id}/edit`}
                    className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
                    title="Sửa"
                  >
                    <Edit className="h-4 w-4" />
                  </Link>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        if (deleteId === emp.id) handleDelete(emp.id);
                        else setDeleteId(emp.id);
                      }}
                      disabled={isPending}
                      className={`rounded p-1.5 ${
                        deleteId === emp.id
                          ? "bg-red-100 text-red-700"
                          : "text-red-500 hover:bg-red-50"
                      }`}
                      title={deleteId === emp.id ? "Xác nhận xoá" : "Xoá"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
