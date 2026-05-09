import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Đăng nhập",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="text-3xl font-bold">
            <span className="text-[#F97316]">Sata</span>
            <span className="text-[#7C3AED]">Robo</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">Đăng nhập vào hệ thống quản trị</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-gray-100" />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
