"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  Shield,
  Pencil,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  UserPlus,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/app/(admin)/admin/users/_components/role-badge";

interface ExistingUser {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  _count: { permissionGrants: number };
}

interface Props {
  employeeId: string;
  employeeName: string;
  existingUser: ExistingUser | null;
}

function daysSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function formatDateTime(date: Date | null): string {
  if (!date) return "Chưa từng đăng nhập";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function UserAccountSection({
  employeeId,
  employeeName,
  existingUser,
}: Props) {
  const router = useRouter();

  if (!existingUser) {
    return (
      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
            <KeyRound className="h-5 w-5 text-gray-500" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-gray-900">
              Tài khoản đăng nhập
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Nhân sự này chưa có tài khoản để đăng nhập vào hệ thống.
            </p>
            <div className="mt-4">
              <Button
                type="button"
                onClick={() =>
                  router.push(`/admin/users/new?employeeId=${employeeId}`)
                }
              >
                <UserPlus className="h-4 w-4" />
                Tạo tài khoản đăng nhập
              </Button>
              <p className="mt-2 text-xs text-gray-500">
                Tên và email của <strong>{employeeName}</strong> sẽ được điền
                sẵn vào form.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const idleDays = daysSince(existingUser.lastLoginAt);
  const isIdle = idleDays === null || idleDays > 30;
  const idleLabel =
    idleDays === null
      ? "chưa từng đăng nhập"
      : `${idleDays} ngày không hoạt động`;

  return (
    <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50">
            <KeyRound className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Tài khoản đăng nhập
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Thông tin tài khoản hệ thống của <strong>{employeeName}</strong>.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Left column */}
        <div className="space-y-3">
          <div>
            <dt className="text-xs uppercase tracking-wider text-gray-500">
              Email
            </dt>
            <dd className="mt-0.5 font-mono text-sm text-gray-900 break-all">
              {existingUser.email}
            </dd>
          </div>

          <div>
            <dt className="text-xs uppercase tracking-wider text-gray-500">
              Vai trò
            </dt>
            <dd className="mt-1">
              <RoleBadge role={existingUser.role} />
            </dd>
          </div>

          <div>
            <dt className="text-xs uppercase tracking-wider text-gray-500">
              Trạng thái
            </dt>
            <dd className="mt-1">
              {existingUser.isActive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                  <CheckCircle2 className="h-3 w-3" />
                  Hoạt động
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                  <XCircle className="h-3 w-3" />
                  Đã vô hiệu hoá
                </span>
              )}
            </dd>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-3">
          <div>
            <dt className="text-xs uppercase tracking-wider text-gray-500">
              Lần đăng nhập cuối
            </dt>
            <dd
              className={`mt-0.5 text-sm tabular-nums ${
                existingUser.lastLoginAt
                  ? "text-gray-900"
                  : "italic text-gray-400"
              }`}
            >
              {formatDateTime(existingUser.lastLoginAt)}
            </dd>
          </div>

          <div>
            <dt className="text-xs uppercase tracking-wider text-gray-500">
              Ngày tạo
            </dt>
            <dd className="mt-0.5 text-sm tabular-nums text-gray-700">
              {formatDate(existingUser.createdAt)}
            </dd>
          </div>

          {existingUser._count.permissionGrants > 0 && (
            <div>
              <dt className="text-xs uppercase tracking-wider text-gray-500">
                Quyền override
              </dt>
              <dd className="mt-1">
                <Link
                  href={`/admin/users/${existingUser.id}/permissions`}
                  className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700 hover:bg-orange-200"
                >
                  <Shield className="h-3 w-3" />
                  {existingUser._count.permissionGrants} quyền override
                </Link>
              </dd>
            </div>
          )}
        </div>
      </div>

      {/* Idle warning */}
      {isIdle && existingUser.isActive && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
          <div>
            <strong>Tài khoản idle:</strong> {idleLabel} — cân nhắc vô hiệu
            hoá nếu không còn cần đăng nhập.
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={`/admin/users/${existingUser.id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <Pencil className="h-4 w-4" />
          Sửa tài khoản
        </Link>
        <Link
          href={`/admin/users/${existingUser.id}/reset-password`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-sm font-semibold text-orange-700 hover:bg-orange-50"
        >
          <KeyRound className="h-4 w-4" />
          Đổi mật khẩu
        </Link>
        <Link
          href={`/admin/users/${existingUser.id}/permissions`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-purple-300 bg-white px-3 py-1.5 text-sm font-semibold text-purple-700 hover:bg-purple-50"
        >
          <Shield className="h-4 w-4" />
          Phân quyền
        </Link>
      </div>
    </section>
  );
}
