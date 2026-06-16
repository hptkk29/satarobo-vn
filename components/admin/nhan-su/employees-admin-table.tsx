"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Edit, Eye, EyeOff, UserCheck, UserX, Trash2, Crown, Building2 } from "lucide-react";
import type { Employee, Department, EmploymentStatus, Role } from "@prisma/client";
import {
  deleteEmployeeAction,
  toggleEmployeeActiveAction,
  toggleEmployeePublicAction,
} from "@/app/(admin)/admin/nhan-su/actions";

interface EmployeeRow extends Employee {
  center: { name: string } | null;
  manager: { fullName: string } | null;
  userAccount: { role: Role; roles: Role[] } | null;
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

const STATUS_LABEL: Record<EmploymentStatus, string> = {
  ACTIVE: "Đang làm",
  ON_LEAVE: "Tạm nghỉ",
  RESIGNED: "Đã nghỉ",
  TERMINATED: "Cho nghỉ",
};

const STATUS_COLOR: Record<EmploymentStatus, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  ON_LEAVE: "bg-amber-100 text-amber-700",
  RESIGNED: "bg-gray-100 text-gray-600",
  TERMINATED: "bg-red-100 text-red-700",
};

interface Props {
  employees: EmployeeRow[];
  canDelete: boolean;
  /** Id NV có EmployeeOrgAssignment PRIMARY active tới HO → hiển thị "HO (Hội sở)". */
  hoEmployeeIds?: string[];
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

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("vi-VN");
}

export function EmployeesAdminTable({ employees, canDelete, hoEmployeeIds = [] }: Props) {
  const [isPending, startTransition] = useTransition();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const hoSet = new Set(hoEmployeeIds);

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
            <th className="px-4 py-3">Họ tên</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">SĐT</th>
            <th className="px-4 py-3">Cơ sở</th>
            <th className="px-4 py-3">Bộ phận</th>
            <th className="px-4 py-3">Vai trò</th>
            <th className="px-4 py-3">Trạng thái</th>
            <th className="px-4 py-3">Ngày vào làm</th>
            <th className="px-4 py-3 text-right">Hành động</th>
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
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {DEPARTMENT_LABELS[emp.department]}
                </td>
                <td className="px-4 py-3">
                  {roles.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {roles.map((r) => (
                        <span
                          key={r}
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_COLOR[r]}`}
                        >
                          {ROLE_LABEL[r]}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">Chưa có TK</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[emp.status]}`}
                  >
                    {STATUS_LABEL[emp.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{fmtDate(emp.joinedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(emp.id)}
                      disabled={isPending}
                      className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-50"
                      title={emp.isActive ? "Đang làm việc (legacy) — bấm để tắt" : "Bật đang làm việc"}
                    >
                      {emp.isActive ? (
                        <UserCheck className="h-4 w-4 text-green-600" />
                      ) : (
                        <UserX className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTogglePublic(emp.id)}
                      disabled={isPending}
                      className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-50"
                      title={emp.isPublic ? "Đang hiển thị public — bấm để ẩn" : "Hiển thị public"}
                    >
                      {emp.isPublic ? (
                        <Eye className="h-4 w-4 text-blue-600" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-gray-300" />
                      )}
                    </button>
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
